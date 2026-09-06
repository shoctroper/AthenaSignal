# RFC-004 — Orquestación Autónomamente Iterativa (Native Subagents vs External Runner / n8n)

- **Fecha:** 2026-09-05
- **Emite:** Arquitecto
- **Estado:** PROPUESTA RATIFICABLE

---

## 1. Diagnóstico del Requerimiento
El Líder Humano requiere que la cadena de trabajo (Arquitecto → Cuestionador → Cola → Implementador → QA Hornet → Re-enrutamiento/Aprobación) se ejecute de forma **totalmente autónoma en bucle iterativo**, solicitando la intervención humana **únicamente** cuando falte información de producto o para vistos buenos estratégicos.

---

## 2. Las Dos Vías de Implementación

### Vía A: Orquestación Novedosa Nativa en Antigravity (Disponible Inmediatamente)
Antigravity posee la infraestructura nativa para esto:
1. **Subagentes (`invoke_subagent` & `send_message`):** El Arquitecto lanza al `Cuestionador`, `Edward`, `Alphonse` y `Hornet` en segundo plano.
2. **Despertar Reactivo:** La plataforma reanuda al Arquitecto automáticamente cuando un subagente envía un mensaje o termina su verificación.
3. **Comando `/goal` / `/owl`:** Modalidad nativa para tareas de larga duración en la que el asistente no se detiene ni pide confirmaciones intermedias sobre lo ya autorizado hasta lograr el objetivo.

### Vía B: Runner de Cola Desconectado (Script CLI / n8n / GitHub Actions)
Para ejecución autónoma fuera del chat (24/7 en segundo plano):
1. **Watcher de Cola (`scripts/queue-runner.js` / n8n):** Un demonio/script monitorea `./ciclo/COLA.md`.
2. **Disparo por Estado:**
   - Detecta `[EN_DISCUSION]` → Llama al modelo con prompt de Cuestionador.
   - Detecta `[PENDIENTE]` → Llama a Implementador (`Edward`/`Alphonse`).
   - Detecta `[EN_VERIFICACION]` → Llama a QA (`Hornet`).
   - Detecta `[REVISAR_ESPEC]` → Notifica al Arquitecto.
3. **Persistencia en Repositorio:** El estado se mantiene 100% en los archivos markdown del repositorio (`COLA.md`, `ESTADO.md`, `BITACORA.md`).

---

## 3. Plan de Acción Recomendado

1. **En esta sesión (Nativo):** Utilizar `invoke_subagent` en Antigravity para encadenar autónomamente la tarea `T-003` (Dominio Base) entre el Implementador `Edward` y el Verificador `Hornet`.
2. **Para automatización total 24/7:** Construir un runner ligero de cola en `./scripts/queue-runner.js` o un webhook en n8n que procese las tareas de `./ciclo/COLA.md` de forma desatendida.
