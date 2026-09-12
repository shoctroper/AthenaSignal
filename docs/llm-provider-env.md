# Entorno real de LLM y búsqueda (M3)

- **Estado:** Referencia operativa para ORDEN-007. Verificada el 2026-09-11.
- **Objetivo:** que el worker pueda usar proveedores reales sin depender de lectura de archivos fuera del worktree.

## 1. LLM local garantizado (sin API key)

**Ollama**, endpoint OpenAI-compatible:

```
POST http://localhost:11434/v1/chat/completions
{ "model": "qwen2.5:7b-instruct", "messages": [{"role":"user","content":"..."}], "temperature": 0 }
```

- Modelos disponibles: `qwen2.5:7b-instruct` (rápido), `gpt-oss:20b`, `qwen3.6:35b-a3b` (MoE, mayor calidad).
- El repo `.env` ya declara `LOCAL_OLLAMA_HOST=http://localhost:11434`.
- Verificado: responde correctamente.

## 2. LLM remoto opcional (DeepSeek)

```
POST https://api.deepseek.com/chat/completions
Authorization: Bearer $DEEPSEEK_API_KEY
{ "model": "deepseek-v4-flash", "messages": [{"role":"user","content":"..."}] }
```

- `DEEPSEEK_API_KEY` puede estar presente o no en el entorno del worker. Implementar **vía variable de entorno** y degradar a Ollama si falta o falla.
- No commitear ni imprimir la key.

## 3. Búsqueda real (descubrimiento/evidencia)

**SearXNG** local:

```
GET http://localhost:8888/search?q=<query>&format=json
```

- Devuelve `results[]` con `title`, `url`, `content`, `publishedDate`.
- Verificado: responde con resultados reales.
- Fallback: HTML `http://localhost:8888/search?q=<query>`.

## 4. Fetch de documentos

- `curl` y `webfetch` están permitidos, pero **solo si escribes dentro del worktree**.
- **PROHIBIDO `cd` fuera del worktree o escribir fuera de él** (p. ej. `/tmp`, `~`, otros repos): la *external-directory permission* lo rechaza y **termina el turno del worker**. Descarga siempre a rutas relativas del repo (`evidence/m3/raw/`, `.m3tmp/`).
- **La lectura de archivos fuera del worktree puede ser rechazada por permisos.** No depender de `~/.env` ni de repos externos; si un comando externo falla, continuar con lo disponible.

## 5. Cadena de resiliencia exigida

```
PRIMARY (Ollama o DeepSeek, según env)
   ↓
FALLBACK (otro proveedor disponible)
   ↓
DETERMINISTIC FALLBACK (seguro: nunca promueve assertions a FACT)
```

## 6. Record/replay

La aceptación es offline. El worker debe:

1. Ejecutar el pipeline contra proveedores reales una vez.
2. Registrar LLM y búsquedas en `evidence/m3/recordings/` (request/response normalizados, sin secretos).
3. Hacer que `tests/autonomous-intelligence-e2e.test.ts` y `scripts/m3-replay.ts` reproduzcan el corpus sin red usando esos registros.
