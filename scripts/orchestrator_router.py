#!/usr/bin/env python3
import sys
import os
import json
import subprocess
import urllib.request
import urllib.error

def call_gemini(prompt, api_key):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={api_key}"
    headers = {'Content-Type': 'application/json'}
    data = {
        "contents": [{"parts": [{"text": prompt}]}]
    }
    req = urllib.request.Request(url, headers=headers, data=json.dumps(data).encode('utf-8'))
    try:
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode())
            text = result['candidates'][0]['content']['parts'][0]['text']
            return text
    except urllib.error.URLError as e:
        print(f"Error calling Gemini: {e}")
        return None

def main():
    if len(sys.argv) < 3:
        print("Uso: orchestrator_router.py <TASK_ID> <TASK_TEXT>")
        sys.exit(1)

    task_id = sys.argv[1]
    task_text = sys.argv[2]
    
    print(f"[Orquestador] Evaluando ruta para tarea {task_id} usando Gemini...")
    
    # Directorio del proyecto base
    project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # Cargar API key de .env
    env_path = os.path.join(project_dir, '.env')
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key and os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if line.startswith('GEMINI_API_KEY='):
                    api_key = line.strip().split('=', 1)[1]
                    break

    if not api_key:
        print("Error: GEMINI_API_KEY no encontrada.")
        sys.exit(1)
    
    prompt = f"""Eres el Orquestador de AthenaSignal. Debes decidir qué motor ejecutará esta tarea.
La tarea de la cola es:
ID: {task_id}
Descripción: {task_text}

Los motores disponibles son:
1. antigravity: Agente de IA local avanzado. Capaz de leer/escribir archivos, ejecutar comandos y analizar el repositorio. Ideal para cualquier tarea de programación.
2. ssh: Para ejecutar remotamente. (No usar por ahora).

Responde ÚNICAMENTE con un bloque JSON válido (sin formato Markdown, sólo el JSON raw) con el siguiente esquema:
{{
  "engine": "antigravity",
  "reasoning": "Breve justificación",
  "prompt_for_engine": "Instrucciones detalladas que recibirá el agente para completar la tarea. Menciona el ID de la tarea y los archivos involucrados."
}}
"""
    
    response_text = call_gemini(prompt, api_key)
    if not response_text:
        response_text = '{"engine": "antigravity", "reasoning": "Fallback", "prompt_for_engine": "' + task_text + '"}'

    try:
        import re
        match = re.search(r'\{.*\}', response_text, re.DOTALL)
        json_str = match.group(0) if match else response_text
        decision = json.loads(json_str)
    except Exception as e:
        print(f"Error parseando la decisión JSON: {response_text}")
        decision = {
            "engine": "antigravity",
            "reasoning": "Fallback por fallo de parseo JSON",
            "prompt_for_engine": f"Resuelve la tarea {task_id}: {task_text}"
        }

    engine = decision.get("engine", "antigravity")
    engine_prompt = decision.get("prompt_for_engine", task_text)
    print(f"[Orquestador] Decidió usar: {engine}. Razón: {decision.get('reasoning')}")

    # Ejecución
    if engine == "antigravity":
        print(f"[Ejecución] Lanzando Antigravity (agy)...")
        clean_prompt = engine_prompt.replace('"', '\\"')
        cmd = ["agy", "--dangerously-skip-permissions", "--add-dir", project_dir, "-p", f"Eres el Implementador de AthenaSignal. La tarea es {task_id}. {clean_prompt}"]
        try:
            subprocess.run(cmd, check=True)
        except Exception as e:
            print(f"Error ejecutando agy: {e}")
            sys.exit(1)

    print(f"[Pipeline] Avanzando tarea {task_id} a EN_VERIFICACION...")
    adv_script = os.path.join(os.path.dirname(__file__), "advance-queue.sh")
    subprocess.run([adv_script, task_id, "EN_VERIFICACION"], check=True)

if __name__ == "__main__":
    main()
