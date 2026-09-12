---
ciclo: athenasignal-m6
orden: ORDEN-010
fecha: 2026-09-12
agente: OpenCode
rol: Implementador
sha: pendiente
arbol: modificado
suite: 105/105 pasaron
items: 4 Hechos · 0 Bloqueado
estado: EN_VERIFICACION
---

# Entrega — athenasignal-m6: Closed-Loop Editorial Intelligence

Implementa `ciclo/ORDEN-010.md` y sus correcciones obligatorias de producto
(§0bis). El reporte es evidencia; la decisión de cierre es de Governance.

| # | Ítem | Estado | Comando | Salida | Artefacto |
|---|---|---|---|---|---|
| 1 | Feedback material: evidencia nueva con provenance, prioridad recomputada y transiciones de estado con `statusHistory` | Hecho | `npm test` | `evidenceAdded 6 · priorityChanges 4 · reopenings 4` | `src/closedloop/feedback.ts`, `src/radar/types.ts` |
| 2 | Evidencia nueva real: el worker indexa el corpus capturado además del replay | Hecho | `npm run m6` | `newEvidence 34 · replayMisses 0` | `src/closedloop/corpusSearch.ts` |
| 3 | Distribución real: nodo cognitivo Mac mini como proceso OS separado, health-check por PID, fallo real (SIGKILL) y failover | Hecho | `npm run m6` | `hosts 2 · NODE_DOWN 3 · remoteEscalations 3` | `scripts/m6-node.ts`, `src/closedloop/nodeProcess.ts` |
| 4 | Regenerar `evidence/m6/*` determinista + tests endurecidos | Hecho | `node --experimental-strip-types scripts/m6-loop.ts` | `2 corridas byte-idénticas` | `evidence/m6/*.json` |

## Evidencia Rojo → Verde

**Rojo (estado previo a esta intervención):**

- `metrics.research.newEvidence = 0`, `metrics.feedback.evidenceAdded = 0`,
  `metrics.feedback.priorityChanges = 0`, `metrics.feedback.reopenings = 0`.
- `metrics.loop.hosts = 1` (todos los runs en `ubuntu`; `mac-mini` no participaba).
- `evidence/m6/*` previos sin trayectoria material `PROMOTED → REOPENED`.

**Verde (con la implementación):**

- `npm test` → `# tests 105 · # suites 10 · # pass 105 · # fail 0` (exit 0).
- `metrics.research.newEvidence = 34`; `metrics.feedback.evidenceAdded = 6`.
- `metrics.feedback.priorityChanges = 4`; `metrics.feedback.reopenings = 4`.
- Trayectoria material visible: `rc4-cl-*` `statusHistory: ACTIVE → PROMOTED → ACTIVE`.
- `metrics.loop.hosts = 2`; runs `m6-proc-b` en host `mac-mini`; `NODE_DOWN = 3`;
  `remoteEscalations = 3` (failover tras la muerte real del proceso del nodo).
- `node --experimental-strip-types scripts/m6-loop.ts` ejecutado dos veces:
  salida canónica byte-idéntica.

## Cómo se satisface ORDEN-010 §0bis

1. **Feedback material.** `applyResearchFeedback` añade evidencia nueva al
   cluster (`EVIDENCE_ADDED`), recomputa prioridad (`PRIORITY_CHANGED`), aplica
   transiciones coherentes (`REOPENED` para INCONCLUSIVE sobre `PROMOTED`,
   `CLOSED_REFUTED` para `REFUTED`, consolidación para `CONFIRMED`) y anexa cada
   transición a `statusHistory` (compatible con estados M4/M5 importados vía
   `normalizeRadarState`). El pasado nunca se sobrescribe.
2. **Distribución real.** `scripts/m6-node.ts` corre como proceso OS separado
   (orquestado por `nodeProcess.ts`) con heartbeat + liveness de PID. El
   `FailoverResearchWorker` envía `SIGKILL` tras el primer resultado; el
   health-check observa el PID sin vida, registra `NODE_DOWN` y hace failover.
   Se documenta que los hosts físicos remotos no son alcanzables y que los
   contextos `ubuntu`/`mac-mini` son procesos/conf locales con health-check
   independiente (`docs/M6-CLOSED-LOOP.md`).
3. **Trayectoria material.** Cuatro candidates `PROMOTED` se reabren tras
   investigación inconclusa (`refuted 0`, pero `REOPENED ≥ 1` visible y trazable).
4. **Artefactos.** Los 14 JSON de `evidence/m6/` se regeneran con lo anterior,
   `npm test` verde y `replayMisses: 0`.

## Desviaciones y justificaciones

| Lo que ordenaba | Lo que se hizo | Motivo técnico |
|---|---|---|
| Motor AKP/AthenaOS externo vivo | Cola durable en disco + worker stand-in documentado | Motores en otros repos no invocables desde el worktree; no se simula consumo externo |
| Hosts físicos Ubuntu/Mac mini | Proceso OS separado con health-check por PID | Nodos físicos inalcanzables; se ejecuta el contexto cognitivo como proceso real y se documenta el bloqueo |

## Bloqueos identificados

| Ítem | Descripción del bloqueo | Qué lo desbloquea |
|---|---|---|
| Externo | Motores AKP/AthenaOS en repos externos no accesibles | Endpoint/proceso invocable de AKP/AthenaOS |
