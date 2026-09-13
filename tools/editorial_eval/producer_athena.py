#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Real Athena producer step: run AthenaOS generation for one topic and emit the
draft on stdout. Invoked by `gov producer run` (never authored by the caller).

Inputs come from the producer contract as environment variables:
  GOV_INPUT_TOPIC, GOV_INPUT_KNOWLEDGE
Provider/model come from ATHENA_LLM_* (OpenCode Go / deepseek-v4-flash).
"""
import os
import re
import subprocess
import sys

DOTNET = os.environ.get("GOV_DOTNET", "/usr/local/share/dotnet/dotnet")
DLL = os.environ.get(
    "GOV_ATHENA_DLL",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "AthenaFramework", "src", "Athena.Cli", "bin", "Release", "net9.0", "athena.dll"))


def draft_of(text: str) -> str:
    i = text.find("DRAFT")
    body = text[i:] if i >= 0 else text
    if "\n" in body:
        body = body.split("\n", 1)[1]
    for marker in ("Claims referenciados:", "REVISIÓN", "REVISION"):
        j = body.find(marker)
        if j >= 0:
            body = body[:j]
    return body.strip()


def main() -> int:
    topic = os.environ.get("GOV_INPUT_TOPIC")
    knowledge = os.environ.get("GOV_INPUT_KNOWLEDGE")
    if not topic or not knowledge:
        print("missing GOV_INPUT_TOPIC / GOV_INPUT_KNOWLEDGE", file=sys.stderr)
        return 2
    env = dict(os.environ)
    run = subprocess.run([DOTNET, DLL, "run", "--topic", topic,
                          "--knowledge", knowledge],
                         capture_output=True, text=True, env=env)
    m = re.search(r"Caso:\s+([0-9a-f-]{36})", run.stdout)
    if not m:
        sys.stderr.write(run.stdout[-2000:] + "\n" + run.stderr[-1000:])
        return 2
    case = m.group(1)
    show = subprocess.run([DOTNET, DLL, "show", case],
                          capture_output=True, text=True, env=env)
    if show.returncode != 0:
        sys.stderr.write(show.stderr[-1000:])
        return 3
    print("CASE: %s" % case)
    print(draft_of(show.stdout))
    return 0


if __name__ == "__main__":
    sys.exit(main())
