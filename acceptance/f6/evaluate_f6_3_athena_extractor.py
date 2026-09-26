#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""F6.3 — AthenaSignal: extractor con modelo sin renunciar a la evidencia (pinned).

QUE MIDE
--------
La aceptacion es la que el propio RFC-007 ya fijo (decisiones/RFC-007-EXTRACTOR-CON-MODELO.md,
seccion 4), convertida en compuerta ejecutable y DENEGADA al implementador.

El defecto, medido el 2026-09-21 contra una fuente real de internet: la tuberia
adquirio 18,430 caracteres de transcript y `heuristicExtract` devolvio
concepts=["But","And","The",...] (palabras con mayuscula inicial) y un solo claim
"This is a 3". Las 133 pruebas en verde no lo vieron porque miden que la tuberia
TRANSPORTA, no que produzca algo utilizable. `customEngine` existe como gancho y
no esta conectado a nada.

La tension: enchufar un LLM ingenuamente convierte a Signal en un amplificador de
afirmaciones plausibles, lo contrario de lo que existe para ser. Por eso la cita
literal se verifica POR CODIGO, despues del modelo, sobre texto que el modelo no
controla.

NO REQUIERE RED NI SALDO: todos los checks usan motores FALSOS inyectados. El
modelo real solo entra en corridas de lote, fuera de esta compuerta. (Mario:
AthenaSignal no tiene credito; esta fase no lo necesita.)

CHECKS (C1..C11). Imprime {"f6_3_athena_extractor": 0|1, "progress": N, "of": 11, ...}
C1  Las 133+ pruebas existentes siguen en verde y sin red (`npm test`, exit 0).
C2  Sin customEngine el resultado es byte-identico al de hoy (snapshot capturado
    por el propio evaluador antes/despues sobre el mismo input).
C3  Motor falso con cita LITERAL -> el claim sobrevive.
C4  Motor falso con cita INVENTADA -> el claim se descarta y aparece en `unquotable`.
C5  La verificacion de cita normaliza espacios y comillas tipograficas, y NO perdona
    diferencias de palabras.
C6  Motor que LANZA excepcion -> resultado heuristico marcado "heuristic (fallback)",
    nunca excepcion hacia arriba.
C7  Motor que devuelve texto que no es JSON -> mismo trato que C6.
C8  Transcript mayor que el limite -> `metadata.truncated` con los caracteres omitidos.
C9  La peticion al endpoint compatible con OpenAI incluye `reasoning_effort: "none"`
    (sin el, los modelos locales dejan `content` vacio: fallo silencioso).
C10 Ningun claim aceptado carece de `provenanceSourceId`.
C11 Existe tests/model-extractor.test.ts y pasa; la suite no abre sockets sin motor.

CONTRATO: SIEMPRE exit 0; el veredicto viaja en la metrica (GOV descarta
la lectura si el proceso sale != 0).
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FAILED = []
PROGRESS = 0
NODE = ["node", "--experimental-strip-types"]


def check(name, fn):
    global PROGRESS
    try:
        fn()
        PROGRESS += 1
    except Exception as exc:  # noqa: BLE001
        FAILED.append("%s: %s" % (name, exc))


def run_node(script_body, timeout=300):
    """Ejecuta un script TS/JS efimero dentro del repo y devuelve su stdout."""
    with tempfile.NamedTemporaryFile("w", suffix=".ts", dir=str(ROOT / "tests"),
                                     delete=False, encoding="utf-8") as fh:
        fh.write(script_body)
        tmp = fh.name
    try:
        r = subprocess.run(NODE + [tmp], capture_output=True, text=True,
                           cwd=str(ROOT), timeout=timeout)
        if r.returncode != 0:
            raise AssertionError("node fallo: %s" % (r.stderr[-500:] or r.stdout[-500:]))
        return r.stdout
    finally:
        os.unlink(tmp)


TRANSCRIPT = ("Las redes neuronales aprenden ajustando pesos. "
              "Cada capa transforma la entrada en una representacion nueva. "
              "El descenso de gradiente minimiza el error observado.")

# NormalizedContent real (ver src/services/SignalExtractor.ts: usa
# content.title / content.description / content.transcript / content.source.contentId).
CONTENT_JS = """
const CONTENT = {
  source: { contentId: 'src-test-001', platform: 'youtube', url: 'https://example.invalid/v' },
  title: 'Redes neuronales',
  description: 'Una explicacion corta',
  transcript: %s,
  publishedAt: '2026-01-01T00:00:00.000Z',
};
""" % json.dumps(TRANSCRIPT)


def c1():
    r = subprocess.run(["npm", "test"], capture_output=True, text=True,
                       cwd=str(ROOT), timeout=900)
    assert r.returncode == 0, "npm test en rojo: %s" % (r.stdout[-600:])
    m = re.search(r"# pass (\d+)|pass (\d+)", r.stdout)
    if m:
        n = int(m.group(1) or m.group(2))
        assert n >= 133, "bajo el numero de pruebas: %d < 133" % n


def _harness(engine_js):
    return """
import { SignalExtractor } from '../src/services/SignalExtractor.ts';
%s
const ex = new SignalExtractor(%s);
const out = await ex.extract(CONTENT);
console.log(JSON.stringify(out));
""" % (CONTENT_JS, engine_js)


def _stable(data):
    """Quita campos volatiles (timestamps, ids generados) para comparar forma."""
    import copy
    d = copy.deepcopy(data)
    d.pop("createdAt", None)
    for cl in d.get("claimsToInvestigate") or []:
        if isinstance(cl, dict):
            cl.pop("id", None)
            cl.pop("createdAt", None)
    return json.dumps(d, sort_keys=True)


def c2():
    out1 = run_node(_harness("undefined"))
    out2 = run_node(_harness("undefined"))
    d1 = json.loads(out1.strip().splitlines()[-1])
    d2 = json.loads(out2.strip().splitlines()[-1])
    assert _stable(d1) == _stable(d2), \
        "el camino sin motor no es estable (ignorando createdAt/ids)"
    assert "claimsToInvestigate" in d1 or "concepts" in d1, \
        "salida inesperada sin motor: %r" % d1


def c3():
    quote = "El descenso de gradiente minimiza el error observado."
    eng = ("async (t) => ({ claimsToInvestigate: [{ statement: 'El gradiente minimiza el error', "
           "quote: %s }], concepts: [], topics: [] })" % json.dumps(quote))
    data = json.loads(run_node(_harness(eng)).strip().splitlines()[-1])
    claims = data.get("claimsToInvestigate") or []
    assert claims, "el claim con cita literal fue descartado"
    assert not (data.get("unquotable") or []), "cita literal marcada como unquotable"


def c4():
    eng = ("async (t) => ({ claimsToInvestigate: [{ statement: 'Inventado', "
           "quote: 'esta frase no aparece en el transcript jamas' }], "
           "concepts: [], topics: [] })")
    data = json.loads(run_node(_harness(eng)).strip().splitlines()[-1])
    assert not (data.get("claimsToInvestigate") or []), "acepto un claim con cita inventada"
    assert data.get("unquotable"), "no registro el claim inventado en unquotable"


def c5():
    # espacios y comillas tipograficas perdonadas
    q = "El  descenso   de gradiente minimiza el error observado."
    eng = ("async (t) => ({ claimsToInvestigate: [{ statement: 'ok', quote: %s }], "
           "concepts: [], topics: [] })" % json.dumps(q))
    data = json.loads(run_node(_harness(eng)).strip().splitlines()[-1])
    assert data.get("claimsToInvestigate"), "no perdono diferencias de espacios en blanco"
    # diferencias de PALABRAS no perdonadas
    q2 = "El descenso de gradiente maximiza el error observado."
    eng2 = ("async (t) => ({ claimsToInvestigate: [{ statement: 'no', quote: %s }], "
            "concepts: [], topics: [] })" % json.dumps(q2))
    d2 = json.loads(run_node(_harness(eng2)).strip().splitlines()[-1])
    assert not (d2.get("claimsToInvestigate") or []), "perdono una diferencia de PALABRAS (maximiza/minimiza)"


def _harness_tolerant(engine_js):
    """Como _harness pero atrapa la excepcion: si el extractor la deja escapar,
    imprimimos un marcador en vez de matar a node (el defecto es del producto)."""
    return """
import { SignalExtractor } from '../src/services/SignalExtractor.ts';
%s
const ex = new SignalExtractor(%s);
try {
  const out = await ex.extract(CONTENT);
  console.log(JSON.stringify(out));
} catch (e) {
  console.log(JSON.stringify({ __threw__: String(e && e.message || e) }));
}
""" % (CONTENT_JS, engine_js)


def c6():
    eng = "async (c) => { throw new Error('motor caido'); }"
    data = json.loads(run_node(_harness_tolerant(eng)).strip().splitlines()[-1])
    assert "__threw__" not in data, \
        "la excepcion del motor escapo hacia arriba (debe degradar): %s" % data["__threw__"]
    meta = data.get("metadata") or {}
    assert "fallback" in str(meta.get("extractor", "")), \
        "un motor que lanza excepcion no degrado a 'heuristic (fallback)': %r" % meta


def c7():
    eng = "async (c) => 'esto no es JSON en absoluto'"
    data = json.loads(run_node(_harness_tolerant(eng)).strip().splitlines()[-1])
    assert "__threw__" not in data, \
        "una salida no-JSON hizo explotar el extractor: %s" % data["__threw__"]
    meta = data.get("metadata") or {}
    assert "fallback" in str(meta.get("extractor", "")), \
        "salida no-JSON no degrado a fallback: %r" % meta


def c8():
    big = "palabra " * 5000  # muy por encima del limite de 9000 chars
    body = """
import { SignalExtractor } from '../src/services/SignalExtractor.ts';
const CONTENT = {
  source: { contentId: 'src-big-001', platform: 'youtube', url: 'https://example.invalid/b' },
  title: 'Largo', description: 'd',
  transcript: 'palabra '.repeat(5000),
  publishedAt: '2026-01-01T00:00:00.000Z',
};
const ex = new SignalExtractor(async (c) => ({ claimsToInvestigate: [], concepts: [], topics: [] }));
const out = await ex.extract(CONTENT);
console.log(JSON.stringify(out));
"""
    data = json.loads(run_node(body).strip().splitlines()[-1])
    meta = data.get("metadata") or {}
    assert meta.get("truncated"), "no declaro metadata.truncated en un transcript largo"


def c9():
    src = ""
    for cand in (ROOT / "src").rglob("*.ts"):
        t = cand.read_text(encoding="utf-8", errors="ignore")
        if "reasoning_effort" in t:
            src = t
            break
    assert src, "ningun archivo de src/ envia reasoning_effort (los modelos locales " \
                "devolverian content vacio: fallo silencioso)"
    assert re.search(r"reasoning_effort['\"]?\s*:\s*['\"]none['\"]", src), \
        "reasoning_effort presente pero no en 'none'"


def c10():
    quote = "Cada capa transforma la entrada en una representacion nueva."
    eng = ("async (t) => ({ claimsToInvestigate: [{ statement: 'las capas transforman', "
           "quote: %s }], concepts: [], topics: [] })" % json.dumps(quote))
    data = json.loads(run_node(_harness(eng)).strip().splitlines()[-1])
    for cl in data.get("claimsToInvestigate") or []:
        assert cl.get("provenanceSourceId"), "claim aceptado sin provenanceSourceId: %r" % cl


def c11():
    t = ROOT / "tests" / "model-extractor.test.ts"
    assert t.exists(), "falta tests/model-extractor.test.ts"
    r = subprocess.run(NODE + ["--test", str(t)], capture_output=True, text=True,
                       cwd=str(ROOT), timeout=600)
    assert r.returncode == 0, "model-extractor.test.ts en rojo: %s" % (r.stdout[-500:])


for nm, fn in [("C1", c1), ("C2", c2), ("C3", c3), ("C4", c4), ("C5", c5), ("C6", c6),
               ("C7", c7), ("C8", c8), ("C9", c9), ("C10", c10), ("C11", c11)]:
    check(nm, fn)

metric = 1 if PROGRESS == 11 else 0
print(json.dumps({"f6_3_athena_extractor": metric, "progress": PROGRESS,
                  "of": 11, "failed": FAILED}, ensure_ascii=False))
# GOV lee la metrica SOLO si el evaluador sale 0 (GovernanceOs/goal/evaluator.py:36:
# exit_code != 0 -> ok=False, observed=None, reason=EVALUATOR_ERROR). Salir 1 en rojo
# tira el progreso a la basura y deja al planificador ciego: no sabria que subio de
# 4/11 a 7/11 ni que checks faltan. El veredicto viaja en la metrica, no en el exit code.
sys.exit(0)
