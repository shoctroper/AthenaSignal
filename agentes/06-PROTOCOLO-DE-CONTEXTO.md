# Agente 06 — Protocolo de Contexto y Eficiencia de Tokens

> **Versión Generalizada 2.1** · Marco de trabajo multiproyecto.
> **Vinculante para todos los roles de agentes.**

---

## 1. REGLA DURA: Contador Incremental y Corte Duro al Turno 15

- **Secuencia Incremental:** El contador avanza con cada respuesta del agente (`turno 1/15`, `turno 2/15`, `turno 3/15`...). Está prohibido congelar el número de turno.
- **Techo Inviolable de 15 Turnos:** Al llegar al `turno 15/15`, el agente finaliza inmediatamente el turno, consolida `./ciclo/ESTADO.md` y requiere abrir un nuevo chat/sesión.

---

## 2. Las cuatro reglas de contexto

### R1 — Se lee el estado vivo, no la historia completa
**`./ciclo/ESTADO.md` es la fuente primaria de estado.**

| Archivo | Función | Límite |
|---|---|---|
| **`./ciclo/ESTADO.md`** | **Estado vivo único:** Tareas activas, asignaciones, bloqueos y elementos pendientes de revisión humana | **≤ 40 líneas** |
| `./ciclo/ORDEN.md` | Puntero a la orden o especificación vigente | Archivo acotado |
| `./ciclo/BITACORA.md` | Bus de eventos histórico (append-only). Se consulta solo para trazar antecedentes | Se rota periódicamente |

### R2 — La unidad de reparto es el bloque acotado
Cada agente lee exclusivamente **su bloque de trabajo** asignado y sus precondiciones inmediatas.

### R3 — Rotación de bitácora
Al cierre de la jornada o ciclo, lo completado se mueve a `./ciclo/bitacora/AAAA-MM-DD.md`.

### R4 — Punteros y evidencias, no duplicación de texto
Se incluyen fragmentos clave y rutas exactas en lugar de copiar bloques masivos.
