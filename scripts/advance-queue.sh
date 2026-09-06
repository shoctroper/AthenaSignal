#!/usr/bin/env bash
set -e

# Uso: ./advance-queue.sh <TASK_ID> <NEW_STATUS>
# El contenido de la entrega (código generado) se espera por STDIN.

TASK_ID=$1
NEW_STATUS=$2
DELIVERY_FILE="ciclo/entregas/${TASK_ID}-implementador.md"

if [ -z "$TASK_ID" ] || [ -z "$NEW_STATUS" ]; then
  echo "Error: Faltan argumentos. Uso: $0 <TASK_ID> <NEW_STATUS>"
  exit 1
fi

# Guardar la respuesta del LLM (stdin) en la carpeta de entregas
mkdir -p ciclo/entregas
cat /dev/stdin > "$DELIVERY_FILE"
echo "Entrega guardada en $DELIVERY_FILE"

# Actualizar estado en COLA.md (Soporte para Mac OSX 'sed -i' y Linux)
if sed --version 2>/dev/null | grep -q GNU; then
  sed -i "s/| $TASK_ID | \(.*\) | \[PENDIENTE\]/| $TASK_ID | \1 | \[$NEW_STATUS\]/g" ciclo/COLA.md
else
  sed -i '' "s/| $TASK_ID | \(.*\) | \[PENDIENTE\]/| $TASK_ID | \1 | \[$NEW_STATUS\]/g" ciclo/COLA.md
fi

echo "COLA.md actualizada: $TASK_ID -> [$NEW_STATUS]"
