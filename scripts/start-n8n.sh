#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -f "$REPO_DIR/.env" ]; then
  echo "Cargando variables de entorno desde .env..."
  export $(grep -v '^#' "$REPO_DIR/.env" | xargs)
fi

echo "Iniciando orquestador n8n en puerto ${N8N_PORT:-5678}..."
echo "Gemini API Key configurada."

exec npx -y n8n
