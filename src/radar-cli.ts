#!/usr/bin/env node
/**
 * Radar CLI M4 (ORDEN-008 §10.12): representación consultable del estado vivo.
 *
 * Lee `evidence/m4/radar-state.json` y permite consultarlo sin reconstruir
 * contexto manualmente. Es de sólo lectura y determinista.
 *
 * Uso:
 *   node --experimental-strip-types src/radar-cli.ts
 *   node --experimental-strip-types src/radar-cli.ts --events
 *   node --experimental-strip-types src/radar-cli.ts --priority HIGH
 *   node --experimental-strip-types src/radar-cli.ts --cluster cl-...
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { deserializeState } from './radar/store.ts';
import type { RadarState } from './radar/types.ts';

export const DEFAULT_STATE_PATH = 'evidence/m4/radar-state.json';

export function loadRadarState(path: string = DEFAULT_STATE_PATH): RadarState {
  return deserializeState(readFileSync(resolve(process.cwd(), path), 'utf8'));
}

export function renderRadar(
  state: RadarState,
  options: { events?: boolean; priority?: string; cluster?: string } = {}
): string {
  const lines: string[] = [];
  const clusters = Object.values(state.clusters).sort((a, b) => (a.clusterId < b.clusterId ? -1 : 1));
  const candidates = Object.values(state.candidates).sort((a, b) => (a.candidateId < b.candidateId ? -1 : 1));

  lines.push(`RADAR M4 — ciclos=${state.cyclesProcessed.length} señales=${Object.keys(state.signals).length} clusters=${clusters.length}`);
  lines.push(
    `EVENTOS ${JSON.stringify(state.eventCounts)}`
  );

  if (options.priority) {
    for (const candidate of candidates.filter((entry) => entry.priority === options.priority)) {
      lines.push(`${candidate.candidateId} [${candidate.priority}/${candidate.status}] ${candidate.title}`);
    }
    return lines.join('\n');
  }

  if (options.cluster) {
    const cluster = state.clusters[options.cluster];
    if (!cluster) {
      lines.push(`cluster no encontrado: ${options.cluster}`);
      return lines.join('\n');
    }
    lines.push(`CLUSTER ${cluster.clusterId} (${cluster.label})`);
    lines.push(`  prioridad=${cluster.priority} score=${cluster.priorityScore} assessment=${cluster.assessment}`);
    lines.push(`  fuentes=${cluster.sourceIds.join(', ')}`);
    lines.push(`  señales=${cluster.signalIds.join(', ')}`);
    lines.push(`  contradicción=${cluster.contradiction}`);
    for (const detail of cluster.contradictionDetails) lines.push(`  - ${detail}`);
    return lines.join('\n');
  }

  if (options.events) {
    for (const event of state.events) {
      lines.push(`${event.cycleId} ${event.kind} ${event.subjectId} — ${event.message}`);
    }
    return lines.join('\n');
  }

  for (const cluster of clusters) {
    lines.push(
      `${cluster.clusterId} [${cluster.priority}/${cluster.status}] assessment=${cluster.assessment} ` +
        `fuentes=${cluster.sourceIds.length} evidencia=${cluster.evidenceUrls.length}` +
        (cluster.contradiction ? ' CONTRADICCIÓN' : '')
    );
  }
  return lines.join('\n');
}

function main(): void {
  const args = process.argv.slice(2);
  const state = loadRadarState(process.env.M4_STATE_PATH || DEFAULT_STATE_PATH);
  const events = args.includes('--events');
  const priorityIndex = args.indexOf('--priority');
  const clusterIndex = args.indexOf('--cluster');
  const priority = priorityIndex >= 0 ? args[priorityIndex + 1] : undefined;
  const cluster = clusterIndex >= 0 ? args[clusterIndex + 1] : undefined;
  process.stdout.write(`${renderRadar(state, { events, priority, cluster })}\n`);
}

if (process.argv[1] && process.argv[1].endsWith('radar-cli.ts')) {
  main();
}
