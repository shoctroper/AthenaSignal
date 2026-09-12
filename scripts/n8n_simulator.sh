#!/usr/bin/env bash
set -e

echo "[Simulator] Iniciando bucle de orquestación tipo n8n..."

while true; do
    echo "--- Ciclo de Evaluación ---"
    RESULT=$(python3 scripts/queue_manager.py)
    echo "Queue Manager devuelve: $RESULT"
    
    ACTION=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('action', 'SLEEP'))")
    TASK_ID=$(echo "$RESULT" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('taskId', ''))")
    RAW=$(echo "$RESULT" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('raw', ''))")
    
    if [ "$ACTION" == "SLEEP" ]; then
        echo "[Simulator] No hay tareas pendientes. Terminando simulación."
        break
    elif [ "$ACTION" == "QA" ]; then
        echo "[Simulator] Lanzando QA para $TASK_ID..."
        python3 scripts/qa_reviewer.py "$TASK_ID"
    elif [ "$ACTION" == "IMPLEMENT" ]; then
        echo "[Simulator] Lanzando Implementación para $TASK_ID..."
        # Escapamos comillas en RAW para bash
        RAW_ESCAPED=$(echo "$RAW" | sed 's/"/\\"/g')
        python3 scripts/orchestrator_router.py "$TASK_ID" "$RAW_ESCAPED"
    elif [ "$ACTION" == "AUDIT_BATCH" ]; then
        echo "[Simulator] Lanzando Auditoría de Lote..."
        python3 scripts/architect_auditor.py
        break
    fi
    
    echo "[Simulator] Esperando 5 segundos para el próximo ciclo..."
    sleep 5
done

echo "[Simulator] Proceso finalizado."
