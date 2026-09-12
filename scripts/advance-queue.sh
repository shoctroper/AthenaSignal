#!/usr/bin/env bash
set -e

# Uso: ./advance-queue.sh <TASK_ID> <NEW_STATUS>
#
# Ya NO lee la entrega por STDIN: cada motor (orchestrator_router.py, rama
# SSH o Antigravity) es responsable de escribir su propia entrega en
# ciclo/entregas/<TASK_ID>-implementador.md ANTES de llamar a este script.
# Antes, este script pisaba esa entrega con lo que hubiera (o no) en stdin al
# momento de invocarse sin pipe -- eso truncaba la entrega a 0 bytes en cada
# corrida real (ver ciclo/entregas/T-011 y T-012, ambos 0 B). No tocar
# ciclo/entregas/ desde acá evita que este script sea la segunda fuente de
# escritura sobre el mismo archivo.

TASK_ID=$1
NEW_STATUS=$2

if [ -z "$TASK_ID" ] || [ -z "$NEW_STATUS" ]; then
  echo "Error: Faltan argumentos. Uso: $0 <TASK_ID> <NEW_STATUS>"
  exit 1
fi

TELEMETRY_FILE="ciclo/telemetry.jsonl"
TS=$(python3 -c "import time; print(time.time())")
printf '{"timestamp": %s, "event": "QUEUE_ADVANCE", "task_id": "%s", "details": {"new_status": "%s"}}\n' \
  "$TS" "$TASK_ID" "$NEW_STATUS" >> "$TELEMETRY_FILE"

# Actualizar estado en COLA.md (Soporte para Mac OSX 'sed -i' y Linux)
if sed --version 2>/dev/null | grep -q GNU; then
  sed -i "s/| $TASK_ID | \(.*\) | \`\[PENDIENTE\]\`/| $TASK_ID | \1 | \`\[$NEW_STATUS\]\`/g" ciclo/COLA.md
else
  sed -i '' "s/| $TASK_ID | \(.*\) | \`\[PENDIENTE\]\`/| $TASK_ID | \1 | \`\[$NEW_STATUS\]\`/g" ciclo/COLA.md
fi

echo "COLA.md actualizada: $TASK_ID -> [$NEW_STATUS]"
