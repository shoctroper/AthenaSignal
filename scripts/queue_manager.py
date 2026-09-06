#!/usr/bin/env python3
import sys
import os
import json
import re

def main():
    project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cola_path = os.path.join(project_dir, 'ciclo', 'COLA.md')
    
    if not os.path.exists(cola_path):
        print(json.dumps({"action": "SLEEP", "reason": "No COLA.md"}))
        return

    with open(cola_path, 'r') as f:
        lines = f.readlines()
        
    tasks = []
    for line in lines:
        if line.strip().startswith('| T-'):
            parts = [p.strip() for p in line.split('|')]
            if len(parts) >= 6:
                t_id = parts[1]
                t_status_match = re.search(r'\[([A-Z_]+)\]', line)
                if t_status_match:
                    t_status = t_status_match.group(1)
                    tasks.append({"id": t_id, "status": t_status, "raw": line})

    if not tasks:
        print(json.dumps({"action": "SLEEP", "reason": "Empty queue"}))
        return

    # Check for items in QA
    for t in tasks:
        if t['status'] == 'EN_VERIFICACION':
            print(json.dumps({"action": "QA", "taskId": t['id'], "raw": t['raw']}))
            return
            
    # Check for items pending execution
    for t in tasks:
        if t['status'] == 'PENDIENTE':
            print(json.dumps({"action": "IMPLEMENT", "taskId": t['id'], "raw": t['raw']}))
            return
            
    # Check if ALL are completed
    all_completed = all(t['status'] in ('COMPLETADO', 'CANCELADO') for t in tasks)
    if all_completed:
        # We need a flag to know if audit was already done.
        # Check ESTADO.md or assume if we are here, we should audit.
        # Let's say we check if a flag file exists.
        audit_flag = os.path.join(project_dir, 'ciclo', '.audit_done')
        if not os.path.exists(audit_flag):
            print(json.dumps({"action": "AUDIT_BATCH"}))
            return
            
    print(json.dumps({"action": "SLEEP", "reason": "No actionable tasks"}))

if __name__ == "__main__":
    main()
