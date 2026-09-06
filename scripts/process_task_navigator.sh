#!/usr/bin/env bash
set -e

TASK_ID=$1

if [ -z "$TASK_ID" ]; then
  echo "Error: Faltan argumentos. Uso: $0 <TASK_ID>" >&2
  exit 1
fi

PROMPT=$(cat -)
echo "[Pipeline] Procesando tarea $TASK_ID vía Navigator Agent..." >&2

# Construimos un contexto para el LLM
FULL_PROMPT="Eres el Agente Implementador de AthenaSignal.
Analiza la siguiente tarea de nuestra COLA y genera SÓLO el código o artefacto solicitado.
No incluyas saludos ni explicaciones innecesarias, solo la respuesta técnica.

--- TAREA ---
$PROMPT"

# 1. Enviar al LLM usando Playwright (sin API keys)
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESPUESTA=$(echo "$FULL_PROMPT" | "$DIR/navegador_llm.py")

# 2. Guardar en disco y avanzar la cola
echo "$RESPUESTA" | "$DIR/advance-queue.sh" "$TASK_ID" "EN_VERIFICACION"

echo "[Pipeline] Tarea $TASK_ID procesada exitosamente." >&2
