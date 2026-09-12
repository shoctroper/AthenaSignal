# M6 — Closed-Loop Editorial Intelligence (operación y límites)

Referencia operativa del milestone M6 (`ciclo/ORDEN-010.md`). Describe cómo el
loop está implementado de verdad en este worktree y qué dependencias externas
permanecen bloqueadas.

## Loop cerrado

```
EXTERNAL WORLD → ATHENASIGNAL → SIGNAL → RESEARCH CANDIDATE
   → AKP (inbox durable) → ATHENAOS (investigación profunda)
   → RESULT/CLAIMS/EVIDENCE → AKP (returns) → ATHENASIGNAL
   → RADAR MUTADO (evidencia + prioridad + estado) → siguiente decisión editorial
```

Fases por ciclo: `DISCOVER → TRIAGE → CANDIDATE → HANDOFF → RESEARCH → RETURN
→ FEEDBACK → RADAR_UPDATE` (`src/closedloop/engine.ts`).

## Feedback material (ORDEN-010 §0bis §1)

`src/closedloop/feedback.ts` aplica el resultado de investigación al radar:

- **Evidencia nueva con provenance**: `EVIDENCE_ADDED`; el worker descubre
  evidencia adicional indexando el corpus real capturado (`LocalCorpusSearchTool`)
  además de las búsquedas grabadas. Nunca se fabrican URLs.
- **Prioridad recomputada**: `PRIORITY_CHANGED`, con `priorityHistory` íntegro.
- **Transiciones de estado coherentes**: un `AMBIGUOUS/INCONCLUSIVE` sobre un
  `PROMOTED` lo reabre (`REOPENED`, prioridad acotada); un `REFUTED` lo cierra
  como `CLOSED_REFUTED`; un `CONFIRMED` avanza/consolida.
- **`statusHistory` completo**: cada transición se anexa; el pasado no se
  sobrescribe (compatible con estados M4/M5 importados sin historial mediante
  `normalizeRadarState`).

## Distribución real (ORDEN-010 §0bis §2)

El nodo cognitivo **Mac mini** corre como **proceso OS separado**
(`scripts/m6-node.ts`, orquestado por `src/closedloop/nodeProcess.ts`), con
health-check independiente (heartbeat + liveness real del PID). Para demostrar
failover se le envía `SIGKILL` tras su primer resultado: el health-check observa
el PID sin vida, se registra `NODE_DOWN` y el loop hace failover a la ruta
remota/local restante. `metrics.loop.hosts >= 2`.

**Bloqueo externo documentado**: los motores AKP y AthenaOS reales viven en
otros repos y no son invocables desde el worktree. El transporte AKP es una cola
durable en disco (`data/akp-live/`) y la investigación profunda usa el worker
stand-in `athenaos-research-stand-in-v1` (cognición real grabada de Ollama, sin
simular que un motor externo consumió nada). Los hosts `ubuntu` y `mac-mini` se
representan como contextos de proceso/conf cada uno con su health-check; el host
físico remoto no es alcanzable.

## Artefactos deterministas

`evidence/m6/` (corpus, benchmark, timeline, radar, akp-live, resultados,
feedback, métricas, routing cognitivo, observabilidad, recovery, idempotencia,
distribución, human-review). Reproducibles con:

```bash
node --experimental-strip-types scripts/m6-loop.ts
```
