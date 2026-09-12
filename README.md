# AthenaSignal

AthenaSignal es un motor de descubrimiento y triage editorial: convierte una
fuente real e imperfecta en un **Research Candidate** justificable y
transferible a AKP/AthenaKnowledge, sin asumir que la fuente tiene razón y sin
amplificar afirmaciones.

## Estado

- **M1 — Deep Search Vertical Slice**: cerrado. Ver `docs/M1-DEEP-SEARCH.md`.
- **M2 — Signal-to-Research-Candidate Vertical Slice**: `docs/M2-RESEARCH-CANDIDATE.md`.
- **M3–M6 — búsqueda profunda, radar continuo, plataforma autónoma y closed loop editorial**: cerrados; ver `docs/M3..M6-PRODUCT-REVIEW.md`.
- **M7 — Epistemically Resolutive Closed Loop**: vigente. `ciclo/ORDEN-011.md`.
  Formaliza estados epistémicos (`RESEARCHABLE · CONFIRMED · REFUTED · INCONCLUSIVE ·
  CLOSED_CONFIRMED · CLOSED_REFUTED · REOPENED · DEMOTED · PROMOTED · DISCARDED`),
  resuelve candidates por evidencia con provenance y conserva el historial completo.

## Comandos

```bash
npm test            # suite completa (M1..M7), offline y determinista
npm run e2e         # pipeline offline M1
npm run e2e:m2      # pipeline offline M2 + evidencia de aceptación
npm run m6          # closed loop editorial M6 (determinista)
npm run m7          # closed loop epistémicamente resolutivo M7 + evidence/m7/
npm run verify:m1   # aceptación oficial M1
npm run verify:m2   # aceptación oficial M2
npm run verify:m6   # aceptación oficial M6
npm run verify:m7   # aceptación oficial M7
```

## Cómo empezar a trabajar en este proyecto

Este proyecto utiliza el pipeline unificado de agentes. **No necesitas ejecutar ningún script de bootstrap local ni instalar n8n en este repositorio.**

Para enviar tareas al pipeline, debes utilizar la **Cola Global**. Toda la documentación sobre cómo funciona la cola, la diferencia entre WORKSPACE y Proyecto, y cómo elegir el motor adecuado, se encuentra aquí:

[👉 Ver Documentación de la Cola Global (cola-global/COLA-GLOBAL.md)](file:///Volumes/Medios/Repos/agentes/COLA-GLOBAL.md)

### Pasos rápidos para encolar:
1. Escribe tus tareas en un archivo TSV de 6 columnas (ej. `bloque.tsv`).
2. Encola usando el script de la cola global, indicando este repositorio:

```bash
PIPELINE_WORKSPACE=/Volumes/Medios/Repos/cola-global \
  /Volumes/Medios/Repos/cola-global/scripts/enqueue-bloque.sh \
  /Volumes/Medios/Repos/AthenaSignal \
  /Volumes/Medios/Repos/AthenaSignal/bloque.tsv
```
