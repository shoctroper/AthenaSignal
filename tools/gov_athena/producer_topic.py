#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Per-topic persisted producer for a governed Athena goal.

Invoked by the GOV ProducerExecutor with cwd = root of the clone. Reads one
topic slug from ``GOV_INPUT_SLUG`` (must exist in ``topics.json``), runs the
real Athena CLI in an isolated disposable home (``GOV_ATHENA_HOME``) and
persists the resulting draft atomically as ``drafts/<slug>.md`` plus
``drafts/<slug>.meta.json`` in the cwd.

The isolation applies **only to the Athena subprocess**: its environment is a
copy of the process environment with ``HOME`` / ``USERPROFILE`` set to
``GOV_ATHENA_HOME`` and ``ATHENA_HOME`` to ``GOV_ATHENA_HOME/.athena``. The
``gov`` process that launches this script keeps its own ``HOME`` untouched, so
the planner/implementer do not lose ``~/.config/opencode`` and its
credentials.

Exit codes:
  0  both files were written
  2  invalid/unknown slug, missing knowledge dir, missing GOV_ATHENA_DLL,
     or the engine produced no case / draft
  3  invalid GOV_ATHENA_HOME or GOV_ATHENA_LLM_KEY_FILE, or the key file
     could not be read
  4  the engine did not approve the draft (Estado ``Aborted``/missing or
     Decisión not exactly ``Approved``); no files are written

The LLM key arrives via ``GOV_ATHENA_LLM_KEY_FILE`` (a 600 file outside the
clone) and is injected **only** into the subprocess environment as
``ATHENA_LLM_API_KEY``. This script never writes, prints or logs the key.
"""
import hashlib
import json
import os
import pwd
import re
import stat
import subprocess
import sys
from datetime import datetime, timezone

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EDITORIAL_EVAL = os.path.join(REPO_ROOT, "tools", "editorial_eval")
if EDITORIAL_EVAL not in sys.path:
    sys.path.insert(0, EDITORIAL_EVAL)

from producer_athena import draft_of  # noqa: E402

TOPICS_PATH = os.path.join(REPO_ROOT, "tools", "gov_athena", "topics.json")

# GOV_* variable wins over the plain ATHENA_LLM_* inherited from the parent.
LLM_OVERRIDES = (
    ("GOV_ATHENA_LLM_PROVIDER", "ATHENA_LLM_PROVIDER"),
    ("GOV_ATHENA_LLM_BASE_URL", "ATHENA_LLM_BASE_URL"),
    ("GOV_ATHENA_LLM_MODEL", "ATHENA_LLM_MODEL"),
    ("GOV_ATHENA_LLM_TIMEOUT", "ATHENA_LLM_TIMEOUT"),
)

# When neither the GOV_ nor the plain ATHENA_LLM_TIMEOUT is defined, the
# subprocess gets a safe default (the engine can take ~245 s to generate).
DEFAULT_LLM_TIMEOUT = "600"


def load_topics():
    with open(TOPICS_PATH, encoding="utf-8") as f:
        return json.load(f)


def real_user_home() -> str:
    return os.path.realpath(pwd.getpwuid(os.getuid()).pw_dir)


def _inside_clone(path: str) -> bool:
    real = os.path.realpath(path)
    root = os.path.realpath(REPO_ROOT)
    return real == root or real.startswith(root + os.sep)


def check_gov_home():
    """Validate GOV_ATHENA_HOME isolation. Returns the path or None (exit 3)."""
    gov_home = os.environ.get("GOV_ATHENA_HOME")
    if not gov_home:
        print("missing GOV_ATHENA_HOME", file=sys.stderr)
        return None
    if not os.path.isabs(gov_home):
        print("GOV_ATHENA_HOME must be absolute", file=sys.stderr)
        return None
    if not os.path.isdir(gov_home):
        print("GOV_ATHENA_HOME does not exist", file=sys.stderr)
        return None
    real = os.path.realpath(gov_home)
    real_home = real_user_home()
    if real == real_home:
        print("refusing real user home", file=sys.stderr)
        return None
    if _inside_clone(gov_home):
        print("GOV_ATHENA_HOME is inside the clone", file=sys.stderr)
        return None
    real_athena = os.path.join(real_home, ".athena")
    if real == real_athena or real.startswith(real_athena + os.sep):
        print("refusing real athena home", file=sys.stderr)
        return None
    return gov_home


def check_key_file():
    """Validate GOV_ATHENA_LLM_KEY_FILE. Returns the path or None (exit 3)."""
    key_file = os.environ.get("GOV_ATHENA_LLM_KEY_FILE")
    if not key_file:
        print("missing GOV_ATHENA_LLM_KEY_FILE", file=sys.stderr)
        return None
    if not os.path.isabs(key_file):
        print("GOV_ATHENA_LLM_KEY_FILE must be absolute", file=sys.stderr)
        return None
    if _inside_clone(key_file):
        print("GOV_ATHENA_LLM_KEY_FILE is inside the clone", file=sys.stderr)
        return None
    if not os.path.isfile(key_file):
        print("GOV_ATHENA_LLM_KEY_FILE does not exist", file=sys.stderr)
        return None
    mode = stat.S_IMODE(os.stat(key_file).st_mode)
    if mode & 0o077:
        print("GOV_ATHENA_LLM_KEY_FILE must be at most 600", file=sys.stderr)
        return None
    return key_file


def build_dotnet_env(gov_home: str, key_file: str):
    """Build the isolated environment for the Athena subprocess.

    Starts from the inherited environment, redirects HOME / ATHENA_HOME /
    USERPROFILE to the disposable home, lets GOV_ATHENA_LLM_* override the
    plain ATHENA_LLM_* provider/base_url/model/timeout (defaulting
    ATHENA_LLM_TIMEOUT to 600 when neither is set), and injects the key read
    from ``key_file`` as ``ATHENA_LLM_API_KEY``. Returns None on read failure
    (exit 3). The key is never printed or written anywhere.
    """
    env = dict(os.environ)
    env["HOME"] = gov_home
    env["ATHENA_HOME"] = os.path.join(gov_home, ".athena")
    env["USERPROFILE"] = gov_home
    for gov_var, target in LLM_OVERRIDES:
        val = os.environ.get(gov_var)
        if val:
            env[target] = val
    if os.environ.get("GOV_ATHENA_LLM_TIMEOUT") is None and \
            os.environ.get("ATHENA_LLM_TIMEOUT") is None:
        env["ATHENA_LLM_TIMEOUT"] = DEFAULT_LLM_TIMEOUT
    try:
        with open(key_file, "r", encoding="utf-8") as f:
            key = f.read().rstrip("\n")
    except OSError as e:
        print("cannot read key file: %s" % e, file=sys.stderr)
        return None
    # The file always wins over any ATHENA_LLM_API_KEY inherited from the
    # parent; the GOV_ATHENA_LLM_KEY_FILE path itself is stripped so the
    # subprocess never sees where the key lives.
    env["ATHENA_LLM_API_KEY"] = key
    env.pop("GOV_ATHENA_LLM_KEY_FILE", None)
    return env


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def write_pair(slug: str, draft: str, meta: dict) -> None:
    """Atomically persist ``drafts/<slug>.md`` and ``drafts/<slug>.meta.json``.

    Both files are fully written to temp names first and then moved into place,
    so a crash or failure never leaves a half-written file behind.
    """
    drafts_dir = os.path.join(os.getcwd(), "drafts")
    os.makedirs(drafts_dir, exist_ok=True)
    md_tmp = os.path.join(drafts_dir, ".%s.md.tmp" % slug)
    meta_tmp = os.path.join(drafts_dir, ".%s.meta.json.tmp" % slug)
    md_final = os.path.join(drafts_dir, "%s.md" % slug)
    meta_final = os.path.join(drafts_dir, "%s.meta.json" % slug)
    try:
        with open(md_tmp, "w", encoding="utf-8") as f:
            f.write(draft)
        with open(meta_tmp, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(md_tmp, md_final)
        os.replace(meta_tmp, meta_final)
    except OSError:
        for p in (md_tmp, meta_tmp, md_final, meta_final):
            try:
                if os.path.exists(p):
                    os.remove(p)
            except OSError:
                pass
        raise


def parse_show(stdout: str):
    """Parse the real ``athena.dll show`` output.

    Returns ``(estado, decision, generation_seconds)``. ``estado`` is the first
    token after ``Estado:``; ``decision`` is the first token after ``Decisión:``
    inside the section that follows a line starting with ``══ REVISIÓN`` (None
    if that section is absent); ``generation_seconds`` is the float of the
    ``Generation <n>s`` field of the ``Tiempos:`` line (None if absent).
    """
    estado = None
    decision = None
    generation_seconds = None
    in_revision = False
    for raw in stdout.splitlines():
        line = raw.strip()
        if line.startswith("Estado:"):
            tokens = line[len("Estado:"):].strip().split()
            estado = tokens[0] if tokens else None
        elif line.startswith("══ REVISIÓN"):
            in_revision = True
        elif in_revision and line.startswith("Decisión:"):
            tokens = line[len("Decisión:"):].strip().split()
            decision = tokens[0] if tokens else None
        elif line.startswith("Tiempos:"):
            m = re.search(r"Generation\s+([0-9]+(?:\.[0-9]+)?)s", line)
            if m:
                generation_seconds = float(m.group(1))
    return estado, decision, generation_seconds


def main() -> int:
    slug = os.environ.get("GOV_INPUT_SLUG")
    if not slug:
        print("missing GOV_INPUT_SLUG", file=sys.stderr)
        return 2
    try:
        topics = load_topics()
    except (OSError, ValueError) as e:
        print("cannot read topics.json: %s" % e, file=sys.stderr)
        return 2
    by_slug = {t["slug"]: t for t in topics}
    topic = by_slug.get(slug)
    if topic is None:
        print("unknown slug: %s" % slug, file=sys.stderr)
        return 2

    gov_home = check_gov_home()
    if gov_home is None:
        return 3

    key_file = check_key_file()
    if key_file is None:
        return 3

    knowledge = os.path.join(gov_home, ".athena", "banco", slug, "known-facts")
    if not os.path.isdir(knowledge):
        print("missing knowledge dir: %s" % knowledge, file=sys.stderr)
        return 2

    dotnet = os.environ.get("GOV_DOTNET", "/usr/local/share/dotnet/dotnet")
    dll = os.environ.get("GOV_ATHENA_DLL")
    if not dll:
        print("missing GOV_ATHENA_DLL", file=sys.stderr)
        return 2

    env = build_dotnet_env(gov_home, key_file)
    if env is None:
        return 3

    try:
        run = subprocess.run(
            [dotnet, dll, "run", "--topic", topic["topic"], "--knowledge", knowledge],
            capture_output=True, text=True, env=env, stdin=subprocess.DEVNULL)
    except OSError as e:
        print("cannot run dotnet: %s" % e, file=sys.stderr)
        return 3
    m = re.search(r"Caso:\s+([0-9a-f-]{36})", run.stdout)
    if not m:
        sys.stderr.write(run.stdout[-2000:] + "\n" + run.stderr[-1000:])
        return 2
    case = m.group(1)
    try:
        show = subprocess.run(
            [dotnet, dll, "show", case],
            capture_output=True, text=True, env=env, stdin=subprocess.DEVNULL)
    except OSError as e:
        print("cannot run dotnet: %s" % e, file=sys.stderr)
        return 3
    if show.returncode != 0:
        sys.stderr.write(show.stderr[-1000:])
        return 3
    estado, decision, generation_seconds = parse_show(show.stdout)
    if estado is None or estado == "Aborted" or decision != "Approved":
        print("engine did not approve: estado=%s decision=%s" % (estado, decision),
              file=sys.stderr)
        return 4
    draft = draft_of(show.stdout)

    try:
        dll_sha256 = sha256_file(dll)
    except OSError as e:
        print("cannot hash dll: %s" % e, file=sys.stderr)
        return 3
    meta = {
        "slug": slug,
        "topic": topic["topic"],
        "case_id": case,
        "engine_review": "Approved",
        "engine_state": estado,
        "generation_seconds": generation_seconds,
        "produced_at": datetime.now(timezone.utc).isoformat(),
        "dll_sha256": dll_sha256,
    }
    try:
        write_pair(slug, draft, meta)
    except OSError as e:
        print("cannot persist draft: %s" % e, file=sys.stderr)
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())