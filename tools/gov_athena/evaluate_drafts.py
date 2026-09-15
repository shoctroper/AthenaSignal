#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pinned per-topic evaluator for a governed Athena goal.

No arguments; cwd = root of the clone. Reads the persisted producer state from
``drafts/<slug>.md`` / ``drafts/<slug>.meta.json`` (relative to the cwd), loads
the knowledge facts from
``$GOV_ATHENA_HOME/.athena/banco/<slug>/known-facts/*.json`` and applies the
pinned editorial evaluator. It never writes anything.

Output: a JSON document on stdout. Exit 0 as long as the JSON was produced;
whether a topic "passes" is decided by the GOV predicate, not by this exit code.
"""
import json
import os
import sys
from typing import Dict, List, Optional

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EDITORIAL_EVAL = os.path.join(REPO_ROOT, "tools", "editorial_eval")
if EDITORIAL_EVAL not in sys.path:
    sys.path.insert(0, EDITORIAL_EVAL)

from evaluator import evaluate  # noqa: E402

TOPICS_PATH = os.path.join(REPO_ROOT, "tools", "gov_athena", "topics.json")
TOTAL_TOPICS = 3


def load_topics():
    with open(TOPICS_PATH, encoding="utf-8") as f:
        return json.load(f)


def load_facts(slug: str) -> "tuple[List[str], bool]":
    """Return (facts, facts_available). Without GOV_ATHENA_HOME, facts are empty."""
    gov_home = os.environ.get("GOV_ATHENA_HOME")
    if not gov_home:
        return [], False
    facts: List[str] = []
    kdir = os.path.join(gov_home, ".athena", "banco", slug, "known-facts")
    if os.path.isdir(kdir):
        for f in sorted(os.listdir(kdir)):
            if not f.endswith(".json"):
                continue
            try:
                with open(os.path.join(kdir, f), encoding="utf-8") as fh:
                    statement = json.load(fh).get("statement", "")
                if statement:
                    facts.append(statement)
            except (OSError, ValueError):
                continue
    return facts, True


def load_meta(slug: str) -> Optional[dict]:
    path = os.path.join(os.getcwd(), "drafts", "%s.meta.json" % slug)
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def evaluate_slug(slug: str) -> dict:
    drafts_dir = os.path.join(os.getcwd(), "drafts")
    md = os.path.join(drafts_dir, "%s.md" % slug)
    meta = load_meta(slug)
    facts_available = os.environ.get("GOV_ATHENA_HOME") is not None
    if not os.path.isfile(md) or meta is None:
        return {"present": False, "pass": False, "failed": [],
                "metrics": {}, "facts_available": facts_available}
    try:
        with open(md, encoding="utf-8") as f:
            body = f.read()
    except OSError:
        return {"present": False, "pass": False, "failed": [],
                "metrics": {}, "facts_available": facts_available}
    facts, facts_available = load_facts(slug)
    # A meta without an engine verdict (or with a null one) must never count as
    # approved: map it to "missing" instead of passing None through (the pinned
    # evaluator would treat None as approved).
    result = evaluate(body, facts=facts,
                      engine_review=meta.get("engine_review") or "missing")
    return {
        "present": True,
        "pass": result["pass"],
        "failed": result["failed"],
        "metrics": result["metrics"],
        "facts_available": facts_available,
        "engine_review": meta.get("engine_review"),
    }


def main() -> int:
    try:
        topics = load_topics()
    except (OSError, ValueError) as e:
        print("cannot read topics.json: %s" % e, file=sys.stderr)
        return 2
    per_topic: Dict[str, dict] = {}
    for t in topics:
        per_topic[t["slug"]] = evaluate_slug(t["slug"])
    passing = sum(1 for v in per_topic.values() if v["pass"])
    present = sum(1 for v in per_topic.values() if v["present"])
    payload = {
        "topics_passing": passing,
        "progress": present,
        "total": TOTAL_TOPICS,
        "per_topic": per_topic,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())