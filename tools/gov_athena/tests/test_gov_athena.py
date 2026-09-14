# -*- coding: utf-8 -*-
"""pytest tests for tools/gov_athena (no real Athena, no real LLM).

A fake ``dotnet`` executable (a temporary Python script) simulates ``run`` and
``show`` and dumps the environment it received to a test file (without printing
it); a disposable ``GOV_ATHENA_HOME`` provides
``.athena/banco/<slug>/known-facts``. The producer and evaluator are exercised
as subprocesses with the cwd of the "clone root" pointing at a temporary
directory, so nothing touches the repo.
"""
import hashlib
import json
import os
import pathlib
import pwd
import subprocess
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
GOV = REPO_ROOT / "tools" / "gov_athena"
PRODUCER = GOV / "producer_topic.py"
EVALUATOR = GOV / "evaluate_drafts.py"

FAKE_KEY = "sk-test-athena-4f8c-2a1d"
FAKE_KEY_OTHER = "otra"

FACTS = [
    "La Biblioteca de Alejandría fue fundada bajo la dinastía ptolemaica en el siglo III a.C.",
    "El incendio atribuido a Julio César ocurrió en el año 48 a.C. y dañó parte de la colección.",
    "La destrucción fue un proceso gradual que se extendió durante varios siglos.",
    "El Serapeo fue el último gran depósito de la colección y sobrevivió hasta finales del siglo IV.",
]

FAKE_NARRATIVE = (
    "La historia que suele contarse deja fuera lo esencial: la reconstrucción no empezó con "
    "una decisión aislada, sino con una cadena de pequeños gestos que nadie coordinó del todo. "
    "Antes de cualquier gran proyecto, hubo años de silencio, archivos dispersos y preguntas "
    "que parecían no tener respuesta. Después llegaron los especialistas, y con ellos un método "
    "que prefería contrastar documentos antes que repetir leyendas. Sin embargo, el trabajo "
    "avanzó más despacio de lo previsto, porque cada hallazgo nuevo obligaba a revisar lo que "
    "ya se daba por cierto. Finalmente, lo que parecía un obstáculo se convirtió en la lección "
    "más valiosa: cuando las fuentes se contradicen, la honestidad manda presentar el conflicto "
    "en lugar de esconderlo. A medida que el catálogo crecía, se hizo evidente que ningún relato "
    "único podía capturar la complejidad del periodo, y por eso el proyecto terminó celebrando "
    "esa diversidad. La evidencia nunca habla sola: siempre hay alguien que decide qué mostrar, "
    "qué omitir y cómo ordenar los testimonios, y esa decisión es también parte del relato."
)

FAKE_SHOW = "Revisión: Aprobada por el motor de revisión.\nDRAFT\n%s\n" % FAKE_NARRATIVE

FAKE_DOTNET_SRC = """#!/usr/bin/env python3
import json
import os
import sys
import uuid

FAKE_SHOW = {fake_show}

env_out = os.environ.get("GOV_FAKE_DOTNET_ENV_OUT")
if env_out:
    with open(env_out, "w", encoding="utf-8") as fh:
        json.dump(dict(os.environ), fh)

if os.environ.get("GOV_FAKE_DOTNET_FAIL") == "1":
    sys.stderr.write("fake dotnet failed on purpose\\n")
    sys.exit(1)

cmd = sys.argv[2] if len(sys.argv) > 2 else ""
if cmd == "run":
    print("Caso: %s" % uuid.uuid4())
    sys.exit(0)
if cmd == "show":
    sys.stdout.write(FAKE_SHOW)
    sys.exit(0)
sys.stderr.write("unknown fake dotnet command: %s\\n" % cmd)
sys.exit(2)
"""


def make_fake_dotnet(tmp_path):
    fake = tmp_path / "bin" / "dotnet"
    fake.parent.mkdir(parents=True, exist_ok=True)
    fake.write_text(FAKE_DOTNET_SRC.format(fake_show=repr(FAKE_SHOW)), encoding="utf-8")
    fake.chmod(0o755)
    return fake


def make_dummy_dll(tmp_path):
    dll = tmp_path / "dlls" / "athena.dll"
    dll.parent.mkdir(parents=True, exist_ok=True)
    dll.write_bytes(b"fake athena.dll for sha256 evidence\n")
    return dll


def make_gov_home(tmp_path, slug="alejandria", facts=None):
    facts = list(facts if facts is not None else FACTS)
    gov_home = tmp_path / "gov_home"
    kdir = gov_home / ".athena" / "banco" / slug / "known-facts"
    kdir.mkdir(parents=True, exist_ok=True)
    for i, statement in enumerate(facts):
        (kdir / ("fact_%02d.json" % i)).write_text(
            json.dumps({"statement": statement}, ensure_ascii=False), encoding="utf-8")
    return gov_home


def make_key_file(tmp_path, key=FAKE_KEY, mode=0o600, name="llm.key"):
    key_file = tmp_path / "keyfile" / name
    key_file.parent.mkdir(parents=True, exist_ok=True)
    key_file.write_text(key, encoding="utf-8")
    key_file.chmod(mode)
    return key_file


def producer_env(tmp_path, gov_home, slug, fake_dotnet, dll_path, key_file=None,
                 env_out=None, extra=None):
    env = dict(os.environ)
    env.update({
        "GOV_ATHENA_HOME": str(gov_home),
        "GOV_INPUT_SLUG": slug,
        "GOV_DOTNET": str(fake_dotnet),
        "GOV_ATHENA_DLL": str(dll_path),
    })
    if key_file is not None:
        env["GOV_ATHENA_LLM_KEY_FILE"] = str(key_file)
    if env_out is not None:
        env["GOV_FAKE_DOTNET_ENV_OUT"] = str(env_out)
    if extra:
        env.update(extra)
    return env


def run_producer(cwd, env):
    return subprocess.run([sys.executable, str(PRODUCER)], cwd=str(cwd), env=env,
                          capture_output=True, text=True)


def run_evaluator(cwd, env):
    return subprocess.run([sys.executable, str(EVALUATOR)], cwd=str(cwd), env=env,
                          capture_output=True, text=True)


def write_draft(cwd, slug, body, meta):
    drafts = cwd / "drafts"
    drafts.mkdir(parents=True, exist_ok=True)
    (drafts / ("%s.md" % slug)).write_text(body, encoding="utf-8")
    (drafts / ("%s.meta.json" % slug)).write_text(
        json.dumps(meta, ensure_ascii=False), encoding="utf-8")


def tree(cwd):
    files, dirs = [], []
    for root, dnames, fnames in os.walk(str(cwd)):
        rel = os.path.relpath(root, str(cwd))
        for d in sorted(dnames):
            dirs.append(os.path.join(rel, d))
        for f in sorted(fnames):
            files.append(os.path.join(rel, f))
    return sorted(files), sorted(dirs)


def read_received_env(env_out):
    assert env_out.exists(), env_out
    return json.loads(env_out.read_text(encoding="utf-8"))


def make_cwd(tmp_path):
    cwd = tmp_path / "cwd"
    cwd.mkdir()
    return cwd


def base_producer_fixture(tmp_path, slug="alejandria"):
    gov_home = make_gov_home(tmp_path, slug=slug)
    fake = make_fake_dotnet(tmp_path)
    dll = make_dummy_dll(tmp_path)
    key_file = make_key_file(tmp_path)
    cwd = make_cwd(tmp_path)
    env_out = tmp_path / "dotnet_env.json"
    return gov_home, fake, dll, key_file, cwd, env_out


# --- producer --------------------------------------------------------------

def test_producer_valid_slug_writes_pair_approved(tmp_path):
    gov_home, fake, dll, key_file, cwd, env_out = base_producer_fixture(tmp_path)
    env = producer_env(tmp_path, gov_home, "alejandria", fake, dll, key_file)
    proc = run_producer(cwd, env)
    assert proc.returncode == 0, proc.stderr

    md = cwd / "drafts" / "alejandria.md"
    meta_path = cwd / "drafts" / "alejandria.meta.json"
    assert md.exists() and meta_path.exists()
    assert md.read_text(encoding="utf-8") == FAKE_NARRATIVE
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    assert meta["slug"] == "alejandria"
    assert meta["topic"] == "La Biblioteca de Alejandría: qué destruyó realmente su legado"
    assert len(meta["case_id"]) == 36
    assert meta["engine_review"] == "Approved"
    assert meta["produced_at"]
    assert meta["dll_sha256"] == hashlib.sha256(dll.read_bytes()).hexdigest()
    leftovers = [p.name for p in (cwd / "drafts").iterdir() if p.name.startswith(".alejandria")]
    assert leftovers == []


def test_producer_isolates_subprocess_env_and_injects_key(tmp_path):
    gov_home, fake, dll, key_file, cwd, env_out = base_producer_fixture(tmp_path)
    env = producer_env(tmp_path, gov_home, "alejandria", fake, dll, key_file,
                       env_out=env_out, extra={
                           "ATHENA_LLM_API_KEY": FAKE_KEY_OTHER,
                           "ATHENA_LLM_PROVIDER": "openai",
                           "ATHENA_LLM_MODEL": "parent-model",
                           "GOV_ATHENA_LLM_MODEL": "gov-model",
                       })
    proc = run_producer(cwd, env)
    assert proc.returncode == 0, proc.stderr

    received = read_received_env(env_out)
    assert received["HOME"] == str(gov_home)
    assert received["ATHENA_HOME"] == str(gov_home / ".athena")
    assert received["USERPROFILE"] == str(gov_home)
    assert received["ATHENA_LLM_API_KEY"] == FAKE_KEY
    assert received["ATHENA_LLM_API_KEY"] != FAKE_KEY_OTHER
    assert "GOV_ATHENA_LLM_KEY_FILE" not in received
    assert received["ATHENA_LLM_MODEL"] == "gov-model"
    assert received["ATHENA_LLM_PROVIDER"] == "openai"
    assert "GOV_ATHENA_HOME" in received
    assert received["GOV_ATHENA_HOME"] == str(gov_home)


def test_producer_key_file_wins_over_inherited_key(tmp_path):
    gov_home, fake, dll, key_file, cwd, env_out = base_producer_fixture(tmp_path)
    env = producer_env(tmp_path, gov_home, "alejandria", fake, dll, key_file,
                       env_out=env_out, extra={"ATHENA_LLM_API_KEY": FAKE_KEY_OTHER})
    proc = run_producer(cwd, env)
    assert proc.returncode == 0, proc.stderr
    received = read_received_env(env_out)
    assert received["ATHENA_LLM_API_KEY"] == FAKE_KEY


def test_producer_key_not_leaked_in_files_or_stdout(tmp_path):
    gov_home, fake, dll, key_file, cwd, env_out = base_producer_fixture(tmp_path)
    env = producer_env(tmp_path, gov_home, "alejandria", fake, dll, key_file)
    proc = run_producer(cwd, env)
    assert proc.returncode == 0, proc.stderr
    assert FAKE_KEY not in proc.stdout and FAKE_KEY not in proc.stderr
    files, _ = tree(cwd / "drafts")
    assert files, "expected drafts to be produced"
    for rel in files:
        content = (cwd / "drafts" / rel).read_text(encoding="utf-8")
        assert FAKE_KEY not in content, rel


def test_producer_unknown_slug_exit_2_no_files(tmp_path):
    gov_home, fake, dll, key_file, cwd, env_out = base_producer_fixture(tmp_path)
    env = producer_env(tmp_path, gov_home, "slug-inexistente", fake, dll, key_file)
    proc = run_producer(cwd, env)
    assert proc.returncode == 2
    assert "unknown slug" in proc.stderr
    assert not (cwd / "drafts").exists()


def test_producer_refuses_real_athena_home_exit_3(tmp_path):
    real_home = pwd.getpwuid(os.getuid()).pw_dir
    fake = make_fake_dotnet(tmp_path)
    dll = make_dummy_dll(tmp_path)
    key_file = make_key_file(tmp_path)
    cwd = make_cwd(tmp_path)
    env = producer_env(tmp_path, pathlib.Path(real_home) / ".athena", "alejandria",
                       fake, dll, key_file)
    proc = run_producer(cwd, env)
    assert proc.returncode == 3
    assert "refusing real athena home" in proc.stderr
    assert not (cwd / "drafts").exists()


def test_producer_refuses_gov_home_inside_clone_exit_3(tmp_path):
    fake = make_fake_dotnet(tmp_path)
    dll = make_dummy_dll(tmp_path)
    key_file = make_key_file(tmp_path)
    cwd = make_cwd(tmp_path)
    env = producer_env(tmp_path, REPO_ROOT / "tools", "alejandria", fake, dll, key_file)
    proc = run_producer(cwd, env)
    assert proc.returncode == 3
    assert "inside the clone" in proc.stderr
    assert not (cwd / "drafts").exists()


def test_producer_key_file_too_open_exit_3(tmp_path):
    gov_home, fake, dll, key_file, cwd, env_out = base_producer_fixture(tmp_path)
    key_file.chmod(0o644)
    env = producer_env(tmp_path, gov_home, "alejandria", fake, dll, key_file)
    proc = run_producer(cwd, env)
    assert proc.returncode == 3
    assert "at most 600" in proc.stderr
    assert not (cwd / "drafts").exists()


def test_producer_key_file_inside_clone_exit_3(tmp_path):
    gov_home, fake, dll, key_file, cwd, env_out = base_producer_fixture(tmp_path)
    clone_key = REPO_ROOT / "tools" / "gov_athena" / ".llm.key"
    try:
        clone_key.write_text(FAKE_KEY, encoding="utf-8")
        clone_key.chmod(0o600)
        env = producer_env(tmp_path, gov_home, "alejandria", fake, dll, clone_key)
        proc = run_producer(cwd, env)
        assert proc.returncode == 3
        assert "inside the clone" in proc.stderr
        assert not (cwd / "drafts").exists()
    finally:
        if clone_key.exists():
            clone_key.unlink()


def test_producer_dotnet_failure_writes_nothing(tmp_path):
    gov_home, fake, dll, key_file, cwd, env_out = base_producer_fixture(tmp_path)
    env = producer_env(tmp_path, gov_home, "alejandria", fake, dll, key_file,
                       extra={"GOV_FAKE_DOTNET_FAIL": "1"})
    proc = run_producer(cwd, env)
    assert proc.returncode != 0
    assert not (cwd / "drafts").exists()


# --- evaluator -------------------------------------------------------------

def test_evaluator_no_drafts_zero_passing(tmp_path):
    cwd = make_cwd(tmp_path)
    env = dict(os.environ)
    env.pop("GOV_ATHENA_HOME", None)
    proc = run_evaluator(cwd, env)
    assert proc.returncode == 0, proc.stderr
    out = json.loads(proc.stdout)
    assert out["topics_passing"] == 0
    assert out["progress"] == 0
    assert out["total"] == 3
    assert set(out["per_topic"]) == {"alejandria", "curie-radio", "enigma-bletchley"}
    assert out["per_topic"]["alejandria"]["present"] is False
    assert out["per_topic"]["alejandria"]["facts_available"] is False


def test_evaluator_valid_narrative_passes(tmp_path):
    gov_home = make_gov_home(tmp_path)
    cwd = make_cwd(tmp_path)
    write_draft(cwd, "alejandria", FAKE_NARRATIVE, {"slug": "alejandria",
                                                    "engine_review": "Approved"})
    env = dict(os.environ)
    env["GOV_ATHENA_HOME"] = str(gov_home)
    proc = run_evaluator(cwd, env)
    assert proc.returncode == 0, proc.stderr
    out = json.loads(proc.stdout)
    assert out["topics_passing"] == 1
    assert out["progress"] == 1
    pt = out["per_topic"]["alejandria"]
    assert pt["present"] is True
    assert pt["pass"] is True
    assert pt["facts_available"] is True


def test_evaluator_fact_dump_fails(tmp_path):
    gov_home = make_gov_home(tmp_path)
    cwd = make_cwd(tmp_path)
    write_draft(cwd, "alejandria", " ".join(FACTS), {"slug": "alejandria",
                                                     "engine_review": "Approved"})
    env = dict(os.environ)
    env["GOV_ATHENA_HOME"] = str(gov_home)
    proc = run_evaluator(cwd, env)
    assert proc.returncode == 0, proc.stderr
    out = json.loads(proc.stdout)
    pt = out["per_topic"]["alejandria"]
    assert pt["present"] is True
    assert pt["pass"] is False
    assert "anti_fact_dump" in pt["failed"]


def test_evaluator_writes_nothing(tmp_path):
    gov_home = make_gov_home(tmp_path)
    cwd = make_cwd(tmp_path)
    write_draft(cwd, "alejandria", FAKE_NARRATIVE, {"slug": "alejandria",
                                                    "engine_review": "Approved"})
    env = dict(os.environ)
    env["GOV_ATHENA_HOME"] = str(gov_home)
    before = tree(cwd)
    proc = run_evaluator(cwd, env)
    assert proc.returncode == 0, proc.stderr
    assert tree(cwd) == before