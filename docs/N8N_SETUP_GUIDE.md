# Guía de Configuración e Integración de n8n con Gemini API

- **Propósito:** Ejecución autónoma 24/7 del pipeline de AthenaSignal (`./ciclo/COLA.md`) utilizando **Google Gemini 2.5 Flash / Pro** mediante n8n.

---

## 📋 Configuración Rápida

### 1. Variables de Entorno (`.env`)
El archivo `.env` en la raíz del proyecto contiene la configuración del servidor n8n y la API key de Gemini:

```env
GEMINI_API_KEY=<TU_GEMINI_API_KEY>
N8N_PORT=5678
WORKSPACE_DIR=/Volumes/Medios/Repos/AthenaSignal
```

### 2. Iniciar n8n en Segundo Plano
Ejecuta el script incluido:

```bash
./scripts/start-n8n.sh
```

Esto levantará la instancia de n8n en `http://localhost:5678` cargando automáticamente `GEMINI_API_KEY`.

### 💡 El "Navigator Agent" (Zero-API Workflow)
Para evitar los costos asociados al uso intensivo de APIs (Gemini/DeepSeek), hemos migrado el flujo de n8n a un modelo **Zero-API** utilizando automatización de navegadores (Playwright).

El flujo importado usa un nodo `Execute Command` para ejecutar un script local (`scripts/process_task_navigator.sh`). Este script:
1. Toma la tarea pendiente de `COLA.md`.
2. Se conecta a una sesión local de Google Chrome abierta (vía protocolo CDP) utilizando Playwright.
3. Escribe el prompt directamente en la interfaz web de DeepSeek/Gemini.
4. Extrae la respuesta y la guarda en `ciclo/entregas/`.
5. Actualiza automáticamente `COLA.md` al estado `[EN_VERIFICACION]`.

### Requisitos Previos para el Navigator Agent:
Antes de correr n8n, asegúrate de instalar las dependencias en el servidor o Mac Mini:
```bash
pip install playwright
playwright install chromium
```

Para mayor estabilidad y evitar captchas, inicia Google Chrome en tu máquina con el puerto de depuración abierto antes de activar n8n:
```bash
# Mac
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

### 3. Importar el Workflow de Athena en n8n
1. Ingresa a `http://localhost:5678`.
2. Menú `...` (arriba a la derecha) → **Import from File**.
3. Selecciona `docs/n8n-athena-pipeline.json`.
4. Activa el workflow (**Active: ON**).

---

## ⚙️ Nodos Principales del Workflow

1. **Schedule Trigger (30s):** Escanea la cola de tareas automáticamente cada 30 segundos.
2. **Read COLA.md:** Carga el estado actual de `./ciclo/COLA.md`.
3. **Parse Task Queue:** Identifica la siguiente tarea prioritaria (`[EN_DISCUSION]`, `[PENDIENTE]`, `[EN_VERIFICACION]`).
4. **Gemini 2.5 Worker Node:** Invoca `gemini-2.5-flash` con el token de API inyectado desde `$env.GEMINI_API_KEY`.

---

## 🚀 Probar Endpoint de Gemini Directamente
Para verificar la conexión con Gemini desde terminal o mediante n8n:

```bash
curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Verificación de AthenaSignal Pipeline"}]}]}'
```

---

## 🧠 Topología Híbrida: Nube + Hardware Local

Gracias a la disponibilidad de tus cuentas Cloud (Gemini, DeepSeek) y tu hardware local (Mac Mini M4 16GB + Servidor 4GB VRAM), hemos diseñado una distribución de carga eficiente:

1. **Tareas de Arquitectura e Implementación Compleja (Cloud):**
   - **Gemini 2.5 Pro / Flash:** Orquestación, análisis de contexto profundo y escritura de código base.
   - **DeepSeek V3 / R1 (API):** Generación de código lógico pesado, revisión de bugs y refactorización intensiva. (Configurado vía `DEEPSEEK_API_KEY`).
2. **Tareas de Verificación Rápidas y Triage (Local):**
   - Modelos pequeños (ej. `Qwen-2.5-7B`, `Llama-3-8B`, `Phi-4`) ejecutándose en la **Mac Mini M4** o en el Servidor (vía `Ollama` o `LM Studio` en `http://localhost:11434`).
   - Ideales para el **Cuestionador** o nodos de **QA** que solo deben aprobar (PASS/FAIL) o verificar formato, ahorrando costos de API y reduciendo latencia.

### ¿Cómo finalizar el ciclo en n8n?
El pipeline actual hace la petición a Gemini, pero para **cerrar el ciclo**, debes agregar un nodo **Execute Command** al final de tu flujo en n8n que llame al script generador:

**Comando a ejecutar en el nodo final de n8n:**
```bash
echo '{{ $json.geminiResponseText }}' | ./scripts/advance-queue.sh '{{ $json.taskId }}' 'EN_VERIFICACION'
```
Esto guardará la respuesta del LLM en `ciclo/entregas/` y actualizará automáticamente la `COLA.md` al siguiente estado.
