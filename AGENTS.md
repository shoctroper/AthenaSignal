# AthenaSignal — Instrucciones para Agentes

## Milestone activo (AUTORITATIVO)

El trabajo autorizado vigente es **M8 — Sustained Autonomous Editorial Operation**.

Antes de tocar cualquier archivo, lee y obedece:

- `./ciclo/ORDEN-012.md` — misión, operación sostenida, motores reales e infraestructura, acceptance.
- `./ciclo/ORDEN-011.md` (M7) — loop epistémicamente resolutivo (histórico).
- `./docs/llm-provider-env.md` — proveedores LLM/búsqueda reales (Ollama, SearXNG, DeepSeek opcional).
- `./docs/athenaos-handoff-contract.md` — contrato de handoff a AKP.
- `./docs/M5-PRODUCT-REVIEW.md`, `./docs/M4-PRODUCT-REVIEW.md`, `./docs/M3-PRODUCT-REVIEW.md` — deuda previa (corregir solo si bloquea M6).
- `./ciclo/ORDEN-009.md` (M5) — plataforma/radar que M6 debe cerrar en loop (histórico).
- `./ciclo/ORDEN-008.md`, `./ciclo/ORDEN-007.md`, `./ciclo/ORDEN-006.md`, `./ciclo/ORDEN-005.md` — cerrados; sus tests siguen protegidos.
- `./decisiones/DU-001-MODELO-CONCEPTUAL-ATHENASIGNAL.md` y `./decisiones/RFC-006-MOTOR-DE-BUSQUEDA-Y-VERIFICACION-DE-CLAIMS.md` — decisiones ratificadas.

## Reglas duras

- No modifiques `decisiones/` (decisiones ratificadas).
- Trabaja únicamente dentro del scope autorizado del spec de Governance.
- Mantén verdes los tests existentes; añade pruebas nuevas, no debilites las actuales.
- La verificación y la evidencia requerida están definidas en `./ciclo/ORDEN-006.md`.
- No declares éxito sin evidencia ejecutable.
