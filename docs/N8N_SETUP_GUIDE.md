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
