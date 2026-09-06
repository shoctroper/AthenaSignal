#!/usr/bin/env bash
# verify-report.sh — Validador de entregas markdown en ./ciclo/entregas/

set -e

REPORT_FILE="$1"

if [ -z "$REPORT_FILE" ]; then
  echo "Error: Debe especificar un archivo de entrega."
  echo "Uso: ./scripts/verify-report.sh <ruta_al_reporte.md>"
  exit 1
fi

if [ ! -f "$REPORT_FILE" ]; then
  echo "Error: El archivo '$REPORT_FILE' no existe."
  exit 1
fi

echo "Verificando entrega: $REPORT_FILE ..."

# 1. Comprobar cabecera YAML
if ! grep -q "^---" "$REPORT_FILE"; then
  echo "FAIL: El reporte debe contener una cabecera YAML delimitada por '---'."
  exit 1
fi

# 2. Comprobar campos obligatorios
for field in "agente:" "rol:" "orden:" "ciclo:" "fecha:" "estado:"; do
  if ! grep -q "$field" "$REPORT_FILE"; then
    echo "FAIL: Falta el campo obligatorio '$field' en la cabecera."
    exit 1
  fi
done

# 3. Comprobar tabla de ítems
if ! grep -q "| # |" "$REPORT_FILE"; then
  echo "FAIL: El reporte debe incluir la tabla de ítems con columna '| # |'."
  exit 1
fi

echo "VERIFICACIÓN EXITOSA: El reporte cumple con el esquema de entrega."
exit 0
