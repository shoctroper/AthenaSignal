# tools/gov_athena — Athena gobernable por un Goal (clon aislado)

Infraestructura para que un Goal de GOV ejecute y evalúe el producer editorial de
Athena **por tema**, persistiendo estado real dentro del clon y midiendo ese estado
con un evaluador fijado. Ningún script usa un LLM directamente; el LLM lo invoca el
propio Athena CLI (`athena.dll`) en el paso de producción.

## Scripts

| Script | Rol | Argumentos | Salida |
|---|---|---|---|
| `topics.json` | Lista cerrada de temas (el producer no puede inventar temas) | — | — |
| `producer_topic.py` | Producer por tema: corre el Athena CLI aislado y persiste el borrador | `GOV_INPUT_SLUG` (entorno) | `drafts/<slug>.md` + `drafts/<slug>.meta.json` en el cwd |
| `evaluate_drafts.py` | Evaluador fijado del Goal: mide el estado persistido por tema | ninguno | JSON por stdout |

### `producer_topic.py`

- `cwd` = raíz del clon (lo invoca el ProducerExecutor de GOV).
- Lee el tema de `GOV_INPUT_SLUG` (debe existir en `topics.json`; si no → exit 2).
- Exige un home aislado: `HOME` y `ATHENA_HOME` definidos, **fuera** del clon y
  **distintos** del `~` real del usuario.
  - `ATHENA_HOME` debe existir, ser absoluto y no estar dentro del clon; si apunta al
    `~/.athena` real del usuario → **exit 3** (`refusing real athena home`).
- Conocimiento: `$ATHENA_HOME/banco/<slug>/known-facts` (si no existe → exit 2).
- Ejecuta `GOV_DOTNET` (default `/usr/local/share/dotnet/dotnet`) con
  `GOV_ATHENA_DLL` (obligatorio, sin default) `run --topic <topic> --knowledge <dir>`
  y después `show <caso>`, con `stdin=DEVNULL` y el entorno tal cual.
- Extrae el borrador con `producer_athena.draft_of` (importada, no copiada) y escribe
  **atómicamente** `drafts/<slug>.md` y `drafts/<slug>.meta.json`
  (`slug`, `topic`, `case_id`, `engine_review` (`Approved` si el `show` contiene
  `Revisión:`), `produced_at`, `dll_sha256`).
- Exit 0 sólo si ambos archivos quedaron escritos; ante cualquier fallo no deja
  archivos a medias.

### `evaluate_drafts.py`

- Sin argumentos; `cwd` = raíz del clon; **no escribe nada**.
- Por cada tema de `topics.json`, si existen `drafts/<slug>.md` y `.meta.json` aplica
  `tools/editorial_eval/evaluator.evaluate(body, facts, engine_review)` con los facts
  de `$ATHENA_HOME/banco/<slug>/known-facts/*.json` (campo `statement`).
- Sin `ATHENA_HOME` → facts vacíos y `facts_available: false`.
- Salida JSON: `{"topics_passing", "progress", "total", "per_topic": {<slug>: {"present", "pass", "failed", "metrics", "facts_available"}}}`.
- Exit 0 siempre que pueda producir el JSON; el predicado del Goal decide el `pass`.

## Variables de entorno

| Variable | Obligatoria | Uso |
|---|---|---|
| `GOV_INPUT_SLUG` | sí (producer) | slug del tema a producir |
| `HOME` | sí (producer) | home desechable, fuera del clon y distinto del real |
| `ATHENA_HOME` | sí (producer) | home de Athena aislado con `banco/<slug>/known-facts` |
| `GOV_DOTNET` | no (default `/usr/local/share/dotnet/dotnet`) | binario `dotnet` |
| `GOV_ATHENA_DLL` | sí (producer) | ruta absoluta a `athena.dll` |
| `ATHENA_LLM_*` | sí (en ejecución real) | credenciales del LLM, pasan por entorno al Athena CLI |

## Prohibiciones

- **Nunca** leer ni escribir el repositorio real de AthenaSignal, `~/.athena`,
  `~/.local/share/opencode` ni `.env`.
- **Nunca** apuntar `ATHENA_HOME` al `~/.athena` real (el producer lo rechaza con
  exit 3) ni `HOME` al `~` real.
- **Nunca** ejecutar `dotnet`/`athena.dll` reales desde estos tests.
- **Nunca** escribir, imprimir ni registrar credenciales `ATHENA_LLM_*`; sólo pasan
  por entorno al subproceso del Athena CLI.

## Tests

```sh
python3 -m pytest -q tools/gov_athena/tests tools/editorial_eval/test_evaluator.py
```

Los tests usan un `dotnet` falso (script temporal) y un `ATHENA_HOME` temporal; no
requieren Athena real ni LLM.