#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Strict evaluator hook for a governed producer run.

Reads the producer stdout from $GOV_PRODUCER_EVIDENCE/stdout.log, extracts the
draft, loads the knowledge facts from $GOV_INPUT_KNOWLEDGE and applies the
discriminative editorial evaluator. Exit 0 == PASS.
"""
import json
import os
import pathlib
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from evaluator import evaluate  # noqa: E402


def main() -> int:
    edir = os.environ.get("GOV_PRODUCER_EVIDENCE")
    if not edir:
        print("missing GOV_PRODUCER_EVIDENCE", file=sys.stderr)
        return 2
    text = pathlib.Path(edir, "stdout.log").read_text(encoding="utf-8", errors="ignore")
    i = text.find("CASE:")
    body = text[i:] if i >= 0 else text
    body = "\n".join(body.split("\n")[1:]) if "\n" in body else body

    facts = []
    kf = os.environ.get("GOV_INPUT_KNOWLEDGE")
    if kf and pathlib.Path(kf).is_dir():
        for f in sorted(pathlib.Path(kf).glob("*.json")):
            try:
                facts.append(json.loads(f.read_text(encoding="utf-8")).get("statement", ""))
            except (OSError, ValueError):
                continue
    engine_review = "Approved" if "Revisión:" in text else None
    result = evaluate(body, facts=facts, engine_review=engine_review)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
