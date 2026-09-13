# -*- coding: utf-8 -*-
"""Discriminative editorial evaluator for AthenaOS-generated scripts.

The engine's deterministic ``EditorialFidelityScore`` verifies *source/claim
fidelity* only. It approves fact-order concatenations, which is a false positive
for "usable script". This evaluator adds the criteria the mission requires —
structural validity, anti-fact-dump, narrative coherence/ordering, sentence
variety, low repetition and editorial adherence — so that a fact dump fails.

It is deterministic and dependency-free. Thresholds are explicit so the
evaluator can be falsified with adversarial examples in the tests.
"""
import re
import statistics
from typing import Dict, List, Optional

# --- thresholds (explicit, falsifiable) -----------------------------------
MIN_WORDS = 120
MIN_PARAGRAPHS = 3
FACT_DUMP_MAX_RATIO = 0.50        # <50% of sentences may be near-verbatim facts
FACT_MATCH_JACCARD = 0.80         # sentence ~ fact threshold
MIN_CONNECTIVES = 2
MIN_LENGTH_STDEV = 3.5
MAX_DUPLICATE_RATIO = 0.20

CONNECTIVES = (
    "sin embargo", "no obstante", "por eso", "por lo tanto", "así que",
    "mientras", "después", "antes", "finalmente", "en cambio", "además",
    "primero", "luego", "entonces", "porque", "para que", "aunque", "a medida",
    "en consecuencia", "de hecho", "por otro lado", "a diferencia",
)

_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")


def sentences(text: str) -> List[str]:
    return [s.strip() for s in _SENT_SPLIT.split(text.strip()) if s.strip()]


def _tokens(text: str) -> List[str]:
    return re.findall(r"\w+", text.lower())


def _jaccard(a: str, b: str) -> float:
    sa, sb = set(_tokens(a)), set(_tokens(b))
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def fact_dump_ratio(text: str, facts: List[str]) -> float:
    """Fraction of script sentences that are near-verbatim knowledge facts."""
    sents = sentences(text)
    if not sents or not facts:
        return 0.0
    hits = 0
    for s in sents:
        if any(_jaccard(s, f) >= FACT_MATCH_JACCARD for f in facts):
            hits += 1
    return hits / len(sents)


def _paragraphs(text: str) -> List[str]:
    return [p for p in re.split(r"\n\s*\n", text.strip()) if p.strip()]


def _duplicate_ratio(sents: List[str]) -> float:
    if not sents:
        return 0.0
    normalized = [re.sub(r"\s+", " ", s.lower()).strip() for s in sents]
    return 1.0 - (len(set(normalized)) / len(normalized))


def evaluate(text: str, facts: Optional[List[str]] = None,
             engine_review: Optional[str] = None) -> Dict:
    """Evaluate one script. ``facts`` are the knowledge statements used."""
    facts = list(facts or [])
    body = text or ""
    sents = sentences(body)
    words = _tokens(body)
    lengths = [len(_tokens(s)) for s in sents] or [0]
    connectives = sum(body.lower().count(c) for c in CONNECTIVES)
    fdr = fact_dump_ratio(body, facts)
    dup = _duplicate_ratio(sents)
    stdev = statistics.pstdev(lengths) if len(lengths) > 1 else 0.0
    # Structural validity: either explicit paragraphs, or coherent single-block
    # prose (enough sentences, discourse connectives and sentence variety). This
    # avoids penalizing a valid narrative that happens to be one paragraph.
    structural = (len(_paragraphs(body)) >= MIN_PARAGRAPHS) or (
        len(sents) >= 6 and connectives >= 3 and stdev >= MIN_LENGTH_STDEV)

    criteria = {
        "non_empty": bool(body.strip()),
        "min_length": len(words) >= MIN_WORDS,
        "no_claim_id_leak": "claim:" not in body and "::fact-" not in body,
        "structural_validity": structural,
        "anti_fact_dump": fdr < FACT_DUMP_MAX_RATIO,
        "narrative_connectives": connectives >= MIN_CONNECTIVES,
        "sentence_variety": stdev >= MIN_LENGTH_STDEV,
        "low_repetition": dup < MAX_DUPLICATE_RATIO,
        "engine_review_approved": (engine_review is None
                                   or str(engine_review).lower() == "approved"),
    }
    return {
        "pass": all(criteria.values()),
        "criteria": criteria,
        "failed": [k for k, v in criteria.items() if not v],
        "metrics": {
            "words": len(words),
            "sentences": len(sents),
            "paragraphs": len(_paragraphs(body)),
            "fact_dump_ratio": round(fdr, 3),
            "connectives": connectives,
            "length_stdev": round(stdev, 2),
            "duplicate_ratio": round(dup, 3),
        },
    }
