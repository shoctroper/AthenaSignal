#!/usr/bin/env bash
set -e

TASK_ID=$1

if [ -z "$TASK_ID" ]; then
  echo "Error: Faltan argumentos. Uso: $0 <TASK_ID>" >&2
  exit 1
fi

PROMPT=$(cat -)
echo "[Pipeline] Tarea capturada: $TASK_ID. Derivando al Orquestador (DeepSeek)..." >&2

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Llamar al enrutador en Python pasando el prompt y ID
"$DIR/orchestrator_router.py" "$TASK_ID" "$PROMPT"
