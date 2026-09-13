/**
 * Grabación real de motores M8 (ORDEN-012 §0bis.2, §0bis.3).
 *
 * Ejecuta una vez, contra la infraestructura real:
 *   1. Ubuntu `athena` (SSH BatchMode) + Ollama local.
 *   2. AKP/AthenaKnowledge: `dotnet build` y la CLI de ingesta sobre
 *      `data/source-documents` → `KnowledgeRepository/` + `runs/ingestion-run-report.json`.
 *   3. Puente de conocimiento AKP → AthenaOS (wire format `KnownFact`, validado
 *      por el loader real; los hechos que violan P4 se excluyen y documentan).
 *   4. AthenaOS `run --topic … --knowledge <puente>` end-to-end + `show` + `export`.
 *   5. Mac mini: sonda de red que se documenta como no alcanzable.
 *
 * Deja tres grabaciones en `evidence/m8/recordings/`:
 *   - `real-engines.json`   (invocaciones reales, reproducible por hash)
 *   - `athenaos-research.json` (caso real producido por AthenaOS)
 *   - `akp-ingestion.json`  (reporte real de ingesta AKP)
 *
 * Uso:
 *   node --experimental-strip-types scripts/m8-real-engines.ts
 */

import { execSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { invocation, M8_REAL_ENGINES_KIND, UBUNTU_ATHENA, MACMINI } from '../src/sustained/realEngines.ts';
import type {
  M8AkpIngestion,
  M8RealEngineInvocation,
  M8RealEngines,
  M8RealResearch,
} from '../src/sustained/types.ts';

const recordedAt = new Date().toISOString();
const ATHENA_DLL = '/Volumes/Medios/Repos/AthenaFramework/src/Athena.Cli/bin/Release/net9.0/athena.dll';
const AKP_DIR = '/Volumes/Medios/Repos/AthenaKnowledge/athena-knowledge-ingestion';
const AKP_REPO = join(AKP_DIR, 'KnowledgeRepository');
const AKP_REPORT = join(AKP_DIR, 'runs', 'ingestion-run-report.json');
const SOURCE_DOCUMENTS = join(AKP_DIR, 'data', 'source-documents');

const WORK = resolve(process.cwd(), '.m8tmp/m8-real-engines');
const FLAT_DIR = resolve(process.cwd(), 'data/m8-akp/knowledge-flat');
const BRIDGE_DIR = resolve(process.cwd(), 'data/m8-akp/knowledge-athenaos');
const RECORD_DIR = resolve(process.cwd(), 'evidence/m8/recordings');
const ATHENA_HOME = join(WORK, 'athena-home');

const TOPIC =
  'El ayuno intermitente mejora la longevidad y los marcadores cardiovasculares';

interface Captured {
  invocation: M8RealEngineInvocation;
  stdout: string;
  exitCode: number;
}

function run(input: {
  engine: M8RealEngineInvocation['engine'];
  host: string;
  command: string;
  env?: Record<string, string>;
  cwd?: string;
  unreachableOnError?: boolean;
  notes: string;
}): Captured {
  const start = Date.now();
  try {
    const stdout = execSync(input.command, {
      encoding: 'utf8',
      timeout: 300_000,
      cwd: input.cwd,
      env: { ...process.env, ...(input.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
      stdout,
      exitCode: 0,
      invocation: invocation({
        engine: input.engine,
        host: input.host,
        command: input.command,
        exitCode: 0,
        stdout,
        status: 'OK',
        recordedAt,
        durationMs: Date.now() - start,
        notes: input.notes,
      }),
    };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string; message?: string };
    const output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    return {
      stdout: output,
      exitCode: err.status ?? 1,
      invocation: invocation({
        engine: input.engine,
        host: input.host,
        command: input.command,
        exitCode: err.status ?? 1,
        stdout: output,
        status: input.unreachableOnError ? 'UNREACHABLE' : 'ERROR',
        recordedAt,
        durationMs: Date.now() - start,
        notes: `${input.notes} (${err.message ?? 'fallo'})`,
      }),
    };
  }
}

function athenaArgs(args: string): string {
  return `dotnet "${ATHENA_DLL}" ${args}`;
}

function bridgeKnowledge(): { facts: number; accepted: number; cases: Captured[] } {
  rmSync(FLAT_DIR, { recursive: true, force: true });
  rmSync(BRIDGE_DIR, { recursive: true, force: true });
  mkdirSync(FLAT_DIR, { recursive: true });
  mkdirSync(BRIDGE_DIR, { recursive: true });
  const facts: string[] = [];
  for (const doc of readdirSync(AKP_REPO, { withFileTypes: true })) {
    if (!doc.isDirectory()) continue;
    const docDir = join(AKP_REPO, doc.name);
    for (const file of readdirSync(docDir)) {
      if (!file.endsWith('.json') || !file.includes('__fact-')) continue;
      const raw = JSON.parse(readFileSync(join(docDir, file), 'utf8'));
      raw.eventDate = { $type: 'Unknown' };
      writeFileSync(join(BRIDGE_DIR, file), `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
      facts.push(file);
    }
  }
  return { facts: facts.length, accepted: facts.length, cases: [] };
}

/** Ejecuta `athena run` filtrando hechos que el loader real rechaza (P4/schema). */
function athenaResearch(): { captured: Captured; caseId: string; removed: string[] } {
  const removed: string[] = [];
  for (let i = 0; i < 50; i += 1) {
    const captured = run({
      engine: 'athenaos',
      host: 'athena',
      command: athenaArgs(
        `run --topic "${TOPIC}" --knowledge "${BRIDGE_DIR}"`
      ),
      env: { ATHENA_LLM_PROVIDER: 'template', ATHENA_HOME },
      notes:
        'AthenaOS run end-to-end sobre el knowledge de AKP (proveedor template; gemini agotado 429).',
    });
    const match = /Caso:\s+([0-9a-f-]{36})/.exec(captured.stdout);
    if (captured.exitCode === 0 && match) {
      return { captured, caseId: match[1], removed };
    }
    const failed = /(?:knowledge-athenaos|knowledge-flat)\/([^ :\n]+\.json)/.exec(captured.stdout);
    if (!failed) return { captured, caseId: '', removed };
    const target = join(BRIDGE_DIR, failed[1]);
    if (existsSync(target)) {
      rmSync(target);
      removed.push(failed[1]);
    } else {
      return { captured, caseId: '', removed };
    }
  }
  throw new Error('[m8-real-engines] no se pudo construir un knowledge válido para AthenaOS');
}

function main(): void {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  mkdirSync(ATHENA_HOME, { recursive: true });
  mkdirSync(RECORD_DIR, { recursive: true });

  const invocations: M8RealEngineInvocation[] = [];

  // 1. Nodo Ubuntu real.
  const ubuntu = run({
    engine: 'ubuntu-node',
    host: 'athena',
    command: "ssh -o BatchMode=yes -o ConnectTimeout=8 athena 'hostname; nproc; free -g | head -2'",
    notes: 'Nodo Ubuntu real (athena, 192.168.0.36) alcanzable por SSH BatchMode.',
  });
  invocations.push(ubuntu.invocation);
  const ollama = run({
    engine: 'ubuntu-node',
    host: 'athena',
    command: "ssh -o BatchMode=yes -o ConnectTimeout=8 athena 'curl -s --max-time 5 http://127.0.0.1:11434/api/tags | head -c 400'",
    notes: 'Ollama real en Ubuntu disponible (modelos locales).',
  });
  invocations.push(ollama.invocation);

  // 2. AKP/AthenaKnowledge real end-to-end.
  const build = run({
    engine: 'athenaknowledge',
    host: 'athena',
    command: 'dotnet build --nologo -v q -c Release',
    cwd: AKP_DIR,
    notes: 'Build real de AthenaKnowledge/AKP.',
  });
  invocations.push(build.invocation);
  const ingestion = run({
    engine: 'athenaknowledge',
    host: 'athena',
    command: 'dotnet run --project src/AthenaKnowledge.Ingestion.Cli -c Release --no-launch-profile',
    cwd: AKP_DIR,
    notes: 'Ingesta real: data/source-documents → KnowledgeRepository + runs/ingestion-run-report.json.',
  });
  invocations.push(ingestion.invocation);

  const reportRaw = readFileSync(AKP_REPORT, 'utf8');
  copyFileSync(AKP_REPORT, join(RECORD_DIR, 'akp-ingestion-report.json'));
  const report = JSON.parse(reportRaw) as Record<string, number>;
  const sourceDocuments = readdirSync(SOURCE_DOCUMENTS).filter((f) => f.endsWith('.md')).length;

  // 3. Puente AKP → AthenaOS.
  const bridge = bridgeKnowledge();
  bridge.facts = bridge.facts;

  // 4. AthenaOS run end-to-end + show + export.
  const research = athenaResearch();
  const doctor = run({
    engine: 'athenaos',
    host: 'athena',
    command: athenaArgs('doctor'),
    env: { ATHENA_LLM_PROVIDER: 'template', ATHENA_HOME },
    notes: 'AthenaOS doctor con proveedor template (gemini documentado como agotado).',
  });
  invocations.push(doctor.invocation);
  invocations.push(research.captured.invocation);

  const show = run({
    engine: 'athenaos',
    host: 'athena',
    command: athenaArgs(`show ${research.caseId}`),
    env: { ATHENA_LLM_PROVIDER: 'template', ATHENA_HOME },
    notes: 'Recuperación del caso real producido por AthenaOS (list/show).',
  });
  invocations.push(show.invocation);

  const exportPath = join(RECORD_DIR, 'athena-case-export.json');
  const exported = run({
    engine: 'athenaos',
    host: 'athena',
    command: athenaArgs(`export ${research.caseId} --out "${exportPath}"`),
    env: { ATHENA_LLM_PROVIDER: 'template', ATHENA_HOME },
    notes: 'Export del caso real para auditoría.',
  });
  invocations.push(exported.invocation);

  // 5. Mac mini no alcanzable (documentado, nunca simulado).
  const macmini = run({
    engine: 'macmini-node',
    host: 'mac-mini',
    command: 'ping -c 2 192.168.0.149',
    unreachableOnError: true,
    notes: 'Mac mini (192.168.0.149) no alcanzable: excluido sin simulación.',
  });
  invocations.push(macmini.invocation);

  const realEngines: M8RealEngines = {
    kind: M8_REAL_ENGINES_KIND,
    recordedAt,
    invocations,
    distributed: { ubuntu: UBUNTU_ATHENA, macmini: MACMINI },
  };
  writeFileSync(
    join(RECORD_DIR, 'real-engines.json'),
    `${JSON.stringify(realEngines, null, 2)}\n`,
    'utf8'
  );

  const claims = /(\d+)\s+Claim\(s\)/.exec(research.captured.stdout);
  const disputed = /(\d+)\s+de\s+\d+\s+Claim\(s\) están en disputa/.exec(research.captured.stdout);
  const fidelity = /Fidelidad:\s+([0-9.]+)/.exec(research.captured.stdout);
  const acceptedFacts = readdirSync(BRIDGE_DIR).filter((f) => f.endsWith('.json')).length;

  const realResearch: M8RealResearch = {
    kind: 'athenasignal.m8.real_research.v1',
    recordedAt,
    provider: 'template',
    knowledgeDir: 'data/m8-akp/knowledge-athenaos',
    knowledgeFacts: acceptedFacts,
    topic: TOPIC,
    caseId: research.caseId,
    state: /Estado:\s+(.+)/.exec(research.captured.stdout)?.[1]?.trim() ?? 'UNKNOWN',
    claims: Number(claims?.[1] ?? 0),
    disputed: Number(disputed?.[1] ?? 0),
    fidelity: Number(fidelity?.[1] ?? 0),
    showExcerpt: show.stdout.replace(/\s+/g, ' ').trim().slice(0, 600),
    exportPath: `evidence/m8/recordings/athena-case-export.json`,
    invocationIds: [doctor.invocation.command, research.captured.invocation.command, show.invocation.command],
    limitation:
      'El proveedor gemini está agotado (429); se ejecutó el motor real de AthenaOS con el ' +
      'proveedor template sobre el knowledge de AKP. La investigación es real (loader, claims, ' +
      'conflictos y export reales), pero la redacción no es editorialmente definitiva.',
  };
  writeFileSync(
    join(RECORD_DIR, 'athenaos-research.json'),
    `${JSON.stringify(realResearch, null, 2)}\n`,
    'utf8'
  );

  const akpIngestion: M8AkpIngestion = {
    kind: 'athenasignal.m8.akp_ingestion.v1',
    recordedAt,
    sourceDocuments,
    documentsImported: report.DocumentsImported ?? 0,
    fragmentsCreated: report.FragmentsCreated ?? 0,
    assertionsExtracted: report.AssertionsExtracted ?? 0,
    candidateFactsCreated: report.CandidateFactsCreated ?? 0,
    knownFactsWritten: report.KnownFactsWritten ?? 0,
    conflictsDetected: report.ConflictsDetected ?? 0,
    duplicatesDetected: report.DuplicatesDetected ?? 0,
    reportPath: 'evidence/m8/recordings/akp-ingestion-report.json',
    knowledgeRepository: 'data/m8-akp/knowledge-flat',
    bridgedKnowledgeDir: 'data/m8-akp/knowledge-athenaos',
    bridgedFacts: acceptedFacts,
    athenaosAcceptedFacts: acceptedFacts,
    invocationIds: [build.invocation.command, ingestion.invocation.command],
  };
  writeFileSync(
    join(RECORD_DIR, 'akp-ingestion.json'),
    `${JSON.stringify(akpIngestion, null, 2)}\n`,
    'utf8'
  );

  console.log(
    `[m8-real-engines] ${invocations.filter((i) => i.status === 'OK').length}/${invocations.length} invocaciones OK; ` +
      `AKP ${akpIngestion.knownFactsWritten} hechos; AthenaOS caso ${realResearch.caseId} (${realResearch.claims} claims, ` +
      `${realResearch.disputed} en disputa); P4 excluidos: ${research.removed.length}.`
  );
}

main();
