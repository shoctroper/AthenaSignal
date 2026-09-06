# RFC-005 — Orquestador n8n Multi-Proveedor (Claude, DeepSeek, OpenAI/Codex, Gemini)

- **Fecha:** 2026-09-05
- **Emite:** Arquitecto
- **Estado:** RATIFICABLE / LISTO PARA IMPLEMENTAR

---

## 1. Visión y Beneficio Principal

Utilizar **n8n** como orquestador externo permite que la metodología por Cola de Tareas (`./ciclo/COLA.md`) funcione **24/7 de forma autónoma e independiente de cualquier cliente o IDE** (Antigravity, Cursor, VS Code, etc.).

Además, otorga flexibilidad total para **asignar distintos proveedores de LLM por rol**:
- **Arquitecto / Cuestionador:** Claude 3.5 Sonnet / Opus, DeepSeek R1, GPT-4o.
- **Implementador (Edward / Alphonse):** DeepSeek Coder V3, Claude 3.5 Sonnet, OpenAI Codex.
- **Verificador (Hornet / QA):** Claude Haiku, GPT-4o-mini, DeepSeek V3 (económicos y rápidos para validación).

---

## 2. Flujo de Trabajo en n8n (Nodos del Workflow)

```text
[ Cron / Polling Node (Cada 30s) ] 
               │
               ▼
[ Read File Node (ciclo/COLA.md) ]
               │
               ▼
[ Code Node: Parse Markdown Queue ] ──> Extrae primera tarea no completada
               │
               ▼
[ Switch Node: Evalúa Estado ]
   │
   ├── [EN_DISCUSION] ────> [ HTTP Node: Cuestionador (DeepSeek R1 / Claude) ]
   │                              │
   │                              ├─ (Aprueba)  ──> Update COLA.md a [PENDIENTE]
   │                              └─ (Rechaza)  ──> Update COLA.md a [REVISAR_ESPEC]
   │
   ├── [PENDIENTE] ───────> [ HTTP Node: Implementador (Claude / DeepSeek Coder) ]
   │                              │
   │                              └─ Esconde código + crea ./ciclo/entregas/*.md
   │                                 Update COLA.md a [EN_VERIFICACION]
   │
   ├── [EN_VERIFICACION] ─> [ Execute Command Node: scripts/verify-report.sh + npm test ]
   │                              │
   │                              ▼
   │                        [ HTTP Node: QA Hornet ]
   │                              │
   │                              ├─ (Pass) ──> Update COLA.md a [COMPLETADO]
   │                              └─ (Fail) ──> Update COLA.md a [PENDIENTE] / [REVISAR_ESPEC]
   │
   └── [REVISAR_ESPEC] ───> [ HTTP Node: Arquitecto (Claude / GPT-4o) ]
                                  │
                                  └─ Refina especificación → Update COLA.md a [EN_DISCUSION]
```

---

## 3. Lo que se entrega listo para usar

1. **Documento de Guía y Configuración:** `docs/N8N_SETUP_GUIDE.md` con las variables de entorno (`DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`).
2. **Workflow Exportable para n8n:** `docs/n8n-athena-pipeline.json` listo para importar directamente en n8n mediante `Import from File`.
