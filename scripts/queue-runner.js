#!/usr/bin/env node
/**
 * queue-runner.js — Runner Universal de Cola de Tareas para la Metodología de Agentes
 * 
 * Uso:
 *   node scripts/queue-runner.js --project-dir /Volumes/Medios/Repos/AthenaSignal
 *   node scripts/queue-runner.js --project-dir /Volumes/Medios/Repos/OtroProyecto
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Parse args
const args = process.argv.slice(2);
let projectDir = process.cwd();

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--project-dir' && args[i + 1]) {
    projectDir = path.resolve(args[i + 1]);
    i++;
  }
}

const colaPath = path.join(projectDir, 'ciclo', 'COLA.md');
const estadoPath = path.join(projectDir, 'ciclo', 'ESTADO.md');
const bitacoraPath = path.join(projectDir, 'ciclo', 'BITACORA.md');

console.log(`[Queue Runner] Inspeccionando proyecto: ${projectDir}`);

if (!fs.existsSync(colaPath)) {
  console.error(`[Error] No se encontró el archivo de cola en: ${colaPath}`);
  process.exit(1);
}

const colaContent = fs.readFileSync(colaPath, 'utf8');
const lines = colaContent.split('\n');

const tasks = [];
for (const line of lines) {
  if (line.trim().startsWith('| T-')) {
    const parts = line.split('|').map(p => p.trim());
    if (parts.length >= 7) {
      const id = parts[1];
      const name = parts[2];
      const assigned = parts[3];
      const status = parts[4];
      const precond = parts[5];
      const artifact = parts[6];
      if (id !== 'ID' && !id.includes('---')) {
        tasks.push({ id, name, assigned, status, precond, artifact, rawLine: line });
      }
    }
  }
}

console.log(`[Queue Runner] Total de tareas encontradas: ${tasks.length}`);
tasks.forEach(t => console.log(`  - ${t.id}: ${t.name} [${t.status}] (Asignado: ${t.assigned})`));

const pendingTask = tasks.find(t => t.status === '[PENDIENTE]');
const verifyingTask = tasks.find(t => t.status === '[EN_VERIFICACION]');
const discussionTask = tasks.find(t => t.status === '[EN_DISCUSION]');
const specReviewTask = tasks.find(t => t.status === '[REVISAR_ESPEC]');

if (verifyingTask) {
  console.log(`\n[Acción] Tarea lista para Verificación QA (Hornet): ${verifyingTask.id} (${verifyingTask.name})`);
  const verifyReportScript = path.join(projectDir, 'scripts', 'verify-report.sh');
  if (fs.existsSync(verifyReportScript)) {
    console.log(`[QA] Ejecutando verify-report.sh ...`);
  }
} else if (pendingTask) {
  console.log(`\n[Acción] Tarea lista para Implementación (${pendingTask.assigned}): ${pendingTask.id} (${pendingTask.name})`);
} else if (discussionTask) {
  console.log(`\n[Acción] Tarea lista para Red Teaming (Cuestionador): ${discussionTask.id}`);
} else if (specReviewTask) {
  console.log(`\n[Acción] Tarea requiere ajuste de Especificación por el Arquitecto: ${specReviewTask.id}`);
} else {
  console.log(`\n[Queue Runner] ¡Todas las tareas de la cola están [COMPLETADO]!`);
}

process.exit(0);
