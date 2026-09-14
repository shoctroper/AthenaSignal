# -*- coding: utf-8 -*-
"""pytest tests for tools/gov_athena (no real Athena, no real LLM).

A fake ``dotnet`` executable (a temporary Python script) simulates ``run`` and
``show``; a disposable ``ATHENA_HOME`` provides ``banco/<slug>/known-facts``.
The producer and evaluator are exercised as subprocesses with the cwd of the
"clone root" pointing at a temporary directory, so nothing touches the repo.
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
import os
import sys
import uuid

FAKE_SHOW = {fake_show}

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


def make_athena_home(tmp_path, slug="alejandria", facts=None):
    facts = list(facts if facts is not None else FACTS)
    kdir = tmp_path / "athena_home" / "banco" / slug / "known-facts"
    kdir.mkdir(parents=True, exist_ok=True)
    for i, statement in enumerate(facts):
        (kdir / ("fact_%02d.json" % i)).write_text(
            json.dumps({"statement": statement}, ensure_ascii=False), encoding="utf-8")
    return tmp_path / "athena_home"


def producer_env(tmp_path, athena_home, slug, fake_dotnet, dll_path):
    home = tmp_path / "home"
    home.mkdir(exist_ok=True)
    env = dict(os.environ)
    env.update({
        "HOME": str(home),
        "ATHENA_HOME": str(athena_home),
        "GOV_INPUT_SLUG": slug,
        "GOV_DOTNET": str(fake_dotnet),
        "GOV_ATHENA_DLL": str(dll_path),
    })
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


# --- producer --------------------------------------------------------------

def test_producer_valid_slug_writes_pair_approved(tmp_path):
    athena_home = make_athena_home(tmp_path)
    fake = make_fake_dotnet(tmp_path)
    dll = make_dummy_dll(tmp_path)
    cwd = tmp_path / "cwd"
    cwd.mkdir()
    env = producer_env(tmp_path, athena_home, "alejandria", fake, dll)
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


def test_producer_unknown_slug_exit_2_no_files(tmp_path):
    athena_home = make_athena_home(tmp_path)
    fake = make_fake_dotnet(tmp_path)
    dll = make_dummy_dll(tmp_path)
    cwd = tmp_path / "cwd"
    cwd.mkdir()
    env = producer_env(tmp_path, athena_home, "slug-inexistente", fake, dll)
    proc = run_producer(cwd, env)
    assert proc.returncode == 2
    assert "unknown slug" in proc.stderr
    assert not (cwd / "drafts").exists()


def test_producer_refuses_real_athena_home_exit_3(tmp_path):
    real_home = pwd.getpwuid(os.getuid()).pw_dir
    fake = make_fake_dotnet(tmp_path)
    dll = make_dummy_dll(tmp_path)
    cwd = tmp_path / "cwd"
    cwd.mkdir()
    env = producer_env(tmp_path, pathlib.Path(real_home) / ".athena", "alejandria", fake, dll)
    proc = run_producer(cwd, env)
    assert proc.returncode == 3
    assert "refusing real athena home" in proc.stderr
    assert not (cwd / "drafts").exists()


def test_producer_refuses_athena_home_inside_clone_exit_3(tmp_path):
    fake = make_fake_dotnet(tmp_path)
    dll = make_dummy_dll(tmp_path)
    cwd = tmp_path / "cwd"
    cwd.mkdir()
    env = producer_env(tmp_path, REPO_ROOT / "tools", "alejandria", fake, dll)
    proc = run_producer(cwd, env)
    assert proc.returncode == 3
    assert "inside the clone" in proc.stderr
    assert not (cwd / "drafts").exists()


def test_producer_dotnet_failure_writes_nothing(tmp_path):
    athena_home = make_athena_home(tmp_path)
    fake = make_fake_dotnet(tmp_path)
    dll = make_dummy_dll(tmp_path)
    cwd = tmp_path / "cwd"
    cwd.mkdir()
    env = producer_env(tmp_path, athena_home, "alejandria", fake, dll)
    env["GOV_FAKE_DOTNET_FAIL"] = "1"
    proc = run_producer(cwd, env)
    assert proc.returncode != 0
    assert not (cwd / "drafts").exists()


# --- evaluator -------------------------------------------------------------

def test_evaluator_no_drafts_zero_passing(tmp_path):
    cwd = tmp_path / "cwd"
    cwd.mkdir()
    env = dict(os.environ)
    env.pop("ATHENA_HOME", None)
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
    athena_home = make_athena_home(tmp_path)
    cwd = tmp_path / "cwd"
    cwd.mkdir()
    write_draft(cwd, "alejandria", FAKE_NARRATIVE, {"slug": "alejandria",
                                                    "engine_review": "Approved"})
    env = dict(os.environ)
    env["ATHENA_HOME"] = str(athena_home)
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
    athena_home = make_athena_home(tmp_path)
    cwd = tmp_path / "cwd"
    cwd.mkdir()
    write_draft(cwd, "alejandria", " ".join(FACTS), {"slug": "alejandria",
                                                     "engine_review": "Approved"})
    env = dict(os.environ)
    env["ATHENA_HOME"] = str(athena_home)
    proc = run_evaluator(cwd, env)
    assert proc.returncode == 0, proc.stderr
    out = json.loads(proc.stdout)
    pt = out["per_topic"]["alejandria"]
    assert pt["present"] is True
    assert pt["pass"] is False
    assert "anti_fact_dump" in pt["failed"]


def test_evaluator_writes_nothing(tmp_path):
    athena_home = make_athena_home(tmp_path)
    cwd = tmp_path / "cwd"
    cwd.mkdir()
    write_draft(cwd, "alejandria", FAKE_NARRATIVE, {"slug": "alejandria",
                                                    "engine_review": "Approved"})
    env = dict(os.environ)
    env["ATHENA_HOME"] = str(athena_home)
    before = tree(cwd)
    proc = run_evaluator(cwd, env)
    assert proc.returncode == 0, proc.stderr
    assert tree(cwd) == before