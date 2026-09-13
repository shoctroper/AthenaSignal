# M8 — Product Quality Review (Human Gate) — AthenaSignal

- **Fecha:** 2026-09-12
- **Evalúa:** Arquitecto, a pedido del Líder Humano, como **juicio de producto**.
- **Veredicto:** **APPROVE** tras una ronda de **RETURN** para profundizar.
- **Runtime:** `rt-3f4235ea37a5` (build + refuerzo). Strict verify **PASS (5/5)**; `npm test` **132/132**.

## 1. Capacidad demostrada

Operación editorial autónoma y **sostenida** sobre infraestructura real, con el circuito `AthenaSignal → AKP → AthenaOS → AKP → AthenaSignal` en ejecución continua, recuperable, usando motores reales.

## 2. Demostración

- **Ventana de reloj real:** `2026-09-12T21:31:46.867Z → 21:53:47.450Z` (≈22 min), 24 ticks, 23 completados, 1 restart, 2 resume points.
- **Motores reales (8 invocaciones):** Ubuntu `athena` (SSH + Ollama), **AthenaOS `athena.dll run --topic` + `show` + `export`** (exit 0), **AKP `dotnet build` + `dotnet run Ingestion.Cli`** (exit 0), Mac mini ping (exit 2, documentado DOWN).
- **Escala:** 1500 fuentes únicas (M7: 500), 176 ciclos, 7 clusters, 7 candidates.
- **Resoluciones:** `CLOSED_CONFIRMED` (ayuno) y `CLOSED_REFUTED` (ketobig), reforzadas por segunda ola AthenaOS (`aos-w2`); DEMOTED (airllm), PROMOTED (cofepris), INCONCLUSIVE 3.
- **Mutaciones del radar:** evidence-added, priority/promotion/demotion/closure/reopening; 13/14 transiciones evidence-driven; `statusHistory` completo.
- **Recovery/idempotencia:** 17 eventos; 51 no-ops/57; `replayMisses: 0`.
- **Provenance:** `missingChains: 0`.

## 3. Refuerzo aplicado (ronda RETURN)

- Ventana **proyectada → reloj real** (22 min verificables con timestamps reales).
- AthenaOS **no ejecutaba research** → **ejecuta `run`/`show`/`export`** reales.
- AKP **no se construía** → **build + ingesta reales**.
- Resoluciones reforzadas con segunda ola de evidencia (sin candidates nuevos: corpus de 7).

## 4. Deuda residual (no bloquea)

- **D-M8-R1:** AthenaOS ejecuta el research job con el proveedor disponible (gemini agotado); no hay proveedor LLM real configurado en AthenaOS.
- **D-M8-R2:** Mac mini M4 (192.168.0.149) no alcanzable; participación documentada como imposible.
- **D-M8-R3:** no se añadieron candidates nuevos CONFIRMED/REFUTED; ampliar corpus para más casos.
- **D-M8-R4:** la aceptación es determinista/offline — las invocaciones reales se graban y reproducen; la ventana de reloj fue acotada al presupuesto del worker.
- **D-M8-R5 (operacional):** el worker lanzado en background es terminado (SIGKILL) por un governor externo; se ejecutó en foreground.

## 5. Evidencia

- `evidence/m8/*.json` (19) · `tests/sustained-operation-e2e.test.ts` · `scripts/m8-operation.ts`.
- Regresión M1..M7 intacta (11 archivos congelados); 132/132.
