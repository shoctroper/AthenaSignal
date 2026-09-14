#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Per-topic persisted producer for a governed Athena goal.

Invoked by the GOV ProducerExecutor with cwd = root of the clone. Reads one
topic slug from ``GOV_INPUT_SLUG`` (must exist in ``topics.json``), runs the
real Athena CLI in an isolated disposable home (``ATHENA_HOME`` / ``HOME``) and
persists the resulting draft atomically as ``drafts/<slug>.md`` plus
``drafts/<slug>.meta.json`` in the cwd.

Exit codes:
  0  both files were written
  2  invalid/unknown slug, missing knowledge dir, missing GOV_ATHENA_DLL,
     or the engine produced no case / draft
  3  invalid home: ATHENA_HOME or HOME missing, inside the clone, equal to the
     real user home, or pointing at the real ``~/.athena``

Credentials arrive via ``ATHENA_LLM_*`` environment variables; this script
never writes, prints or logs them.
"""
import hashlib
import json
import os
import pwd
import re
import subprocess
import sys
from datetime import datetime, timezone

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EDITORIAL_EVAL = os.path.join(REPO_ROOT, "tools", "editorial_eval")
if EDITORIAL_EVAL not in sys.path:
    sys.path.insert(0, EDITORIAL_EVAL)

from producer_athena import draft_of  # noqa: E402

TOPICS_PATH = os.path.join(REPO_ROOT, "tools", "gov_athena", "topics.json")


def load_topics():
    with open(TOPICS_PATH, encoding="utf-8") as f:
        return json.load(f)


def real_user_home() -> str:
    return os.path.realpath(pwd.getpwuid(os.getuid()).pw_dir)


def _inside_clone(path: str) -> bool:
    real = os.path.realpath(path)
    root = os.path.realpath(REPO_ROOT)
    return real == root or real.startswith(root + os.sep)


def check_home() -> int:
    """Validate HOME / ATHENA_HOME isolation. Returns 0 on success."""
    home_var = os.environ.get("HOME")
    athena_home = os.environ.get("ATHENA_HOME")
    if not home_var or not athena_home:
        print("missing HOME / ATHENA_HOME", file=sys.stderr)
        return 3
    real_home = real_user_home()
    for name, val in (("HOME", home_var), ("ATHENA_HOME", athena_home)):
        if os.path.realpath(val) == real_home:
            print("refusing real user home for %s" % name, file=sys.stderr)
            return 3
        if _inside_clone(val):
            print("%s is inside the clone" % name, file=sys.stderr)
            return 3
    real_athena = os.path.realpath(athena_home)
    refused = os.path.join(real_home, ".athena")
    if real_athena == refused or real_athena.startswith(refused + os.sep):
        print("refusing real athena home", file=sys.stderr)
        return 3
    if not os.path.isabs(athena_home):
        print("ATHENA_HOME must be absolute", file=sys.stderr)
        return 3
    if not os.path.isdir(athena_home):
        print("ATHENA_HOME does not exist", file=sys.stderr)
        return 3
    return 0


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

    rc = check_home()
    if rc != 0:
        return rc

    athena_home = os.environ["ATHENA_HOME"]
    knowledge = os.path.join(athena_home, "banco", slug, "known-facts")
    if not os.path.isdir(knowledge):
        print("missing knowledge dir: %s" % knowledge, file=sys.stderr)
        return 2

    dotnet = os.environ.get("GOV_DOTNET", "/usr/local/share/dotnet/dotnet")
    dll = os.environ.get("GOV_ATHENA_DLL")
    if not dll:
        print("missing GOV_ATHENA_DLL", file=sys.stderr)
        return 2

    env = dict(os.environ)
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
    engine_review = "Approved" if "Revisión:" in show.stdout else None
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
        "engine_review": engine_review,
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