# Goal legado `athena-10-scripts` — retirado 2026-09-15

Este documento conserva las ideas del primer Goal de Athena bajo MarioGovernance. El archivo original (`.governance/goals/athena-10-scripts.json`, nunca versionado) se eliminó porque usaba el formato plano previo al Converged Goal Control Plane y `gov goal run` ya no lo ejecuta.

## Qué pedía

| Campo | Valor |
|---|---|
| Objetivo | AthenaSignal + AthenaOS producen **≥ 10 guiones** que pasen el evaluador editorial estricto y discriminativo, bajo MarioGovernance |
| Predicado | `scripts_pass >= 10` |
| Presupuesto | 12 intentos, una tarea de producer por tema |
| Envelope | `src/`, `tests/`, `tools/`, `evidence/`; objetivo técnico `tools/editorial_eval` |
| Sub-goals declarados | `governed-producer`, `athena-generation` |
| Producer por tema | `python3 tools/editorial_eval/producer_athena.py` · proveedor `opencode` · modelo `opencode-go/deepseek-v4-flash` · timeout 600 s · 1 reintento · evaluación `tools/editorial_eval/evaluate_stdout.py` (120 s) |
| Creado / última actualización | 2026-09-14 02:17 UTC / 02:48 UTC |

## Qué pasó

- Estado final: `GOAL_INCOMPLETE_CONTINUE` tras 2 ventanas: 6 intentos, 5 guiones generados, **4 aprobados** por el evaluador estricto.
- En paralelo, las corridas gobernadas con `gov producer run` (commit `4d87740`, `evidence/athenaos-scripts/governed/`) llegaron a **10/12 temas aprobados**.

## Por qué se retiró (defectos del formato, confirmados en la auditoría de MarioGovernance)

1. El loop iteraba una lista fija de tareas (`budget.tasks`): no había planificación según el estado.
2. La métrica contaba un histórico (`scripts_pass`), de modo que repetir una tarea podía contar doble.
3. Sin evaluador fijado ni verificación en vivo del estado real; sin integridad del archivo.
4. Las tareas vivían en un directorio temporal del sistema y fijaban `cwd` al repositorio real, lo que impedía ejecutarlas desde un clon aislado.

## Cómo quedó reemplazado

- `tools/gov_athena/` (producer por tema persistido en `drafts/`, evaluador fijado por tema que falla cerrado sin hechos) y el contrato con gates `npm test && pytest`.
- Goal gobernado `athena-3-topics-v2` (aceptación de CGCP, 2026-09-14/15): `GOAL_COMPLETE` con planner real, 2 SIGKILL, cierre verificado sin regresiones. Expediente en MarioGovernance `docs/milestones/GOV-ATHENA/`.

## Idea reutilizable: catálogo de 12 temas

`tools/gov_athena/topics-catalog.json` conserva los 12 temas del Goal legado (slug, título editorial y ruta del banco de conocimiento relativa a `ATHENA_HOME`). `tools/gov_athena/topics.json` sigue siendo el conjunto de 3 temas fijado por el evaluador del Goal de aceptación; un Goal nuevo de 10–12 temas debe crear su propio archivo de temas fijado a partir del catálogo.

| Slug | Tema |
|---|---|
| adn-franklin | La estructura del ADN y el dato que Rosalind Franklin aportó |
| alejandria | La Biblioteca de Alejandría: qué destruyó realmente su legado |
| apollo-13 | Apollo 13: ingeniería y decisión bajo crisis |
| chernobil | Chernóbil: la cadena de decisiones que llevó al desastre |
| contenedor-carga | El contenedor de carga y la globalización del comercio |
| curie-radio | Marie Curie, el radio y el precio del descubrimiento |
| enigma-bletchley | Enigma y Bletchley Park: cómo se quebró la máquina |
| hambruna-irlandesa | La Gran Hambruna irlandesa y la política del hambre |
| imprenta-rich | La Revolución de la imprenta de Gutenberg y la difusión del conocimiento |
| juicio-nuremberg | El Juicio de Núremberg y la invención del derecho penal internacional |
| muro-berlin | La caída del Muro de Berlín y el fin de la RDA |
| peste-rich | La Peste Negra y la transformación de Europa |
