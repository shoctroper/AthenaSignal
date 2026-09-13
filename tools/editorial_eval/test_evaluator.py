# -*- coding: utf-8 -*-
"""Adversarial tests for the discriminative editorial evaluator.

They prove the evaluator is discriminative: a fact dump FAILS, a structured
narrative PASSES, and specific defect modes are detected.
"""
import unittest

from evaluator import evaluate

FACTS = [
    "El 26 de abril de 1986 ocurrió la primera explosión en el reactor 4 de Chernóbil.",
    "El reactor RBMK-1000 tenía un coeficiente de reactividad por vacíos positivo.",
    "Los operadores retiraron las varillas de control salvo entre seis y ocho.",
    "El reactor operaba a unos 30 MW térmicos en el momento de la explosión.",
    "La población de Pripyat fue evacuada 36 horas después del accidente.",
    "El informe INSAG-7 concluyó que hubo deficiencias de diseño y fallos humanos.",
]

FACT_DUMP = (" ".join(FACTS))

GOOD = """Aquella noche, la sala de control del reactor 4 operaba muy por debajo de su \
potencia de diseño, y sin embargo nadie detuvo la prueba. Primero se retiraron las \
varillas de control más allá de lo permitido; después, cuando el operador pulsó el \
botón de parada de emergencia, el propio diseño del reactor empujó la potencia hacia \
arriba en lugar de frenarla. A medida que el grafito desplazaba el agua, la reacción \
se volvió imparable. La explosión que siguió no fue solo un accidente técnico: fue el \
resultado de una cadena de decisiones tomadas bajo presión, con información incompleta \
y con un modelo de seguridad que confiaba demasiado en sus operadores. Por eso el \
informe posterior habló tanto de fallos humanos como de deficiencias de diseño. \
La lección no envejece: una tecnología puede ser segura en el papel y seguir siendo \
frágil cuando su diseño y su cultura operativa fallan al mismo tiempo, y esa tensión \
es la que conviene contar antes que el inventario de hechos."""


class TestDiscriminative(unittest.TestCase):
    def test_fact_dump_fails(self):
        result = evaluate(FACT_DUMP, facts=FACTS, engine_review="Approved")
        self.assertFalse(result["pass"], result)
        self.assertIn("anti_fact_dump", result["failed"])

    def test_structured_narrative_passes(self):
        result = evaluate(GOOD, facts=FACTS, engine_review="Approved")
        self.assertTrue(result["pass"], result)

    def test_claim_id_leak_detected(self):
        text = GOOD + " claim:chernobil::fact-01-abcdef"
        result = evaluate(text, facts=FACTS, engine_review="Approved")
        self.assertIn("no_claim_id_leak", result["failed"])

    def test_empty_fails(self):
        result = evaluate("", facts=FACTS)
        self.assertFalse(result["pass"])
        self.assertIn("non_empty", result["failed"])

    def test_repetition_detected(self):
        text = ("Esta frase es idéntica y larga para superar el umbral mínimo de longitud "
                "requerido por el evaluador editorial. " * 12)
        result = evaluate(text, facts=FACTS)
        self.assertIn("low_repetition", result["failed"])

    def test_missing_connectives_detected(self):
        # Long but no discourse connectives -> not coherent prose.
        text = (" ".join(["El operador revisó el panel del reactor durante la prueba "
                          "nocturna sin novedad aparente y continuó"] * 8))
        result = evaluate(text, facts=FACTS)
        self.assertIn("narrative_connectives", result["failed"])

    def test_engine_review_must_be_approved(self):
        result = evaluate(GOOD, facts=FACTS, engine_review="Rejected")
        self.assertIn("engine_review_approved", result["failed"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
