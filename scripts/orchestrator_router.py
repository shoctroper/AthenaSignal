#!/usr/bin/env python3
import sys
import os
import json
import subprocess
import socket
import urllib.request
import urllib.error
import re
import time

def log_telemetry(event_type, task_id, details):
    project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    telemetry_path = os.path.join(project_dir, 'ciclo', 'telemetry.jsonl')
    entry = {
        "timestamp": time.time(),
        "event": event_type,
        "task_id": task_id,
        "details": details
    }
    with open(telemetry_path, 'a') as f:
        f.write(json.dumps(entry) + '\n')

def is_quota_blocked(project_dir):
    block_path = os.path.join(project_dir, 'ciclo', '.api_quota_block')
    if os.path.exists(block_path):
        with open(block_path, 'r') as f:
            try:
                unlock_time = float(f.read().strip())
                if time.time() < unlock_time:
                    remaining = int(unlock_time - time.time())
                    print(f"[Orquestador] Cuota API agotada. Faltan {remaining}s para desbloqueo.")
                    return True
                else:
                    print(f"[Orquestador] Tiempo de cuota expirado. Restaurando APIs.")
                    os.remove(block_path)
                    return False
            except:
                pass
    return False

def set_quota_block(project_dir, error_msg):
    seconds = 3600
    unlock_time = time.time() + seconds
    block_path = os.path.join(project_dir, 'ciclo', '.api_quota_block')
    with open(block_path, 'w') as f:
        f.write(str(unlock_time))

# Timeouts configurables por variable de entorno. Sin timeout, una llamada
# colgada (visto en vivo: orchestrator_router.py quedó bloqueado en
# urlopen sin límite) es indistinguible de "está pensando" -- el proceso
# nunca falla, nunca libera la tarea, y el simulador/n8n cree que sigue
# trabajando cuando en realidad no va a terminar nunca.
SSH_TIMEOUT_SECONDS = int(os.environ.get('ATHENA_SSH_TIMEOUT_SECONDS', '180'))
AGY_TIMEOUT_SECONDS = int(os.environ.get('ATHENA_AGY_TIMEOUT_SECONDS', '600'))

def main():
    if len(sys.argv) < 3:
        sys.exit(1)

    task_id = sys.argv[1]
    task_text = sys.argv[2]
    project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    model_match = re.search(r'\[Model:\s*(.*?)\]', task_text, re.IGNORECASE)
    engine = "antigravity"
    model_target = "default"
    
    if model_match:
        model_target = model_match.group(1).lower()
        if 'qwen' in model_target or 'ssh' in model_target:
            engine = "ssh"
            
    if engine == "antigravity" and is_quota_blocked(project_dir):
        print(f"[Orquestador] Forzando Fallback a SSH local por restricción de Cuota.")
        engine = "ssh"
        log_telemetry("CIRCUIT_BREAKER_ACTIVE", task_id, {"action": "fallback_to_ssh"})

    print(f"[Orquestador] Tarea {task_id} requiere modelo: {model_target}. Routing a: {engine}")
    
    if engine == "ssh":
        print(f"[Ejecución] Lanzando API Local SSH (localhost:11435 qwen2.5:7b-instruct)...")
        prompt = f"Eres el Implementador de AthenaSignal. Tu única tarea es escribir el código fuente pedido. Instrucciones: {task_text}. Escribe SÓLO el código resultante sin explicaciones."
        url = "http://localhost:11435/api/generate"
        data = {
            "model": "qwen2.5:7b-instruct",
            "prompt": prompt,
            "stream": False
        }
        req = urllib.request.Request(url, headers={'Content-Type': 'application/json'}, data=json.dumps(data).encode('utf-8'))
        try:
            with urllib.request.urlopen(req, timeout=SSH_TIMEOUT_SECONDS) as response:
                result = json.loads(response.read().decode())
                output = result.get('response', '')

            entrega_path = os.path.join(project_dir, 'ciclo', 'entregas', f'{task_id}-implementador.md')
            with open(entrega_path, 'w') as f:
                f.write(output)
        except (socket.timeout, TimeoutError) as e:
            # socket.timeout: la excepción real que lanza urlopen al agotar
            # el timeout en Python 3.9 (este proyecto corre 3.9 -- ahí
            # socket.timeout todavía NO es alias de TimeoutError, son clases
            # separadas; probado en vivo con un listener que acepta la
            # conexión y nunca responde, sin este except caía en el genérico
            # de abajo y se registraba como SSH_ERROR en vez de SSH_TIMEOUT).
            log_telemetry("SSH_TIMEOUT", task_id, {"timeout_seconds": SSH_TIMEOUT_SECONDS})
            print(f"Error ejecutando SSH (API): timeout tras {SSH_TIMEOUT_SECONDS}s")
            sys.exit(1)
        except urllib.error.URLError as e:
            log_telemetry("SSH_ERROR", task_id, {"error": str(e)})
            print(f"Error ejecutando SSH (API): {e}")
            sys.exit(1)
        except Exception as e:
            log_telemetry("SSH_ERROR", task_id, {"error": str(e)})
            print(f"Error ejecutando SSH (API): {e}")
            sys.exit(1)
            
    elif engine == "antigravity":
        print(f"[Ejecución] Lanzando Antigravity (agy)...")
        clean_prompt = task_text.replace('"', '\\"')
        cmd = ["agy", "--dangerously-skip-permissions", "--add-dir", project_dir, "-p", f"Eres el Implementador de AthenaSignal. La tarea es {task_id}. {clean_prompt}"]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=AGY_TIMEOUT_SECONDS)
            if result.returncode != 0:
                print(f"Error ejecutando agy: {result.stderr}")
                if "quota reached" in result.stderr.lower() or "too many requests" in result.stderr.lower():
                    set_quota_block(project_dir, result.stderr)
                    log_telemetry("CIRCUIT_BREAKER_TRIGGERED", task_id, {"error": result.stderr[:500]})
                else:
                    log_telemetry("AGY_ERROR", task_id, {"error": result.stderr[:500]})
                sys.exit(1)
        except subprocess.TimeoutExpired:
            # agy sigue vivo en el sistema tras esto -- subprocess.run con
            # timeout mata el proceso que lanzó, pero no garantiza matar
            # nietos que agy haya lanzado a su vez. Ver hallazgo real de esta
            # sesión: procesos agy huérfanos corriendo horas sin un padre
            # orchestrator_router.py vivo.
            log_telemetry("AGY_TIMEOUT", task_id, {"timeout_seconds": AGY_TIMEOUT_SECONDS})
            print(f"Error ejecutando agy: timeout tras {AGY_TIMEOUT_SECONDS}s")
            sys.exit(1)
        except Exception as e:
            log_telemetry("AGY_ERROR", task_id, {"error": str(e)})
            sys.exit(1)

    print(f"[Pipeline] Avanzando tarea {task_id} a EN_VERIFICACION...")
    adv_script = os.path.join(project_dir, "scripts", "advance-queue.sh")
    subprocess.run([adv_script, task_id, "EN_VERIFICACION"], check=True)

if __name__ == "__main__":
    main()
