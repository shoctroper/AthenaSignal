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
- Home desechable: `GOV_ATHENA_HOME` (absoluto, existente, **fuera** del clon,
  **distinto** del `~` real del usuario y del `~/.athena` real). Si algo falla →
  **exit 3**. **No** lee ni comprueba el `HOME`/`ATHENA_HOME` del proceso `gov`.
- El aislamiento se aplica **sólo al subproceso** del Athena CLI: su entorno es una
  copia de `os.environ` con `HOME=GOV_ATHENA_HOME`, `USERPROFILE=HOME` y
  `ATHENA_HOME=$GOV_ATHENA_HOME/.athena`. El proceso `gov` conserva su `HOME`
  intacto (y con él `~/.config/opencode` y sus credenciales).
- Conocimiento: `$GOV_ATHENA_HOME/.athena/banco/<slug>/known-facts` (si no existe →
  exit 2).
- Clave LLM: `GOV_ATHENA_LLM_KEY_FILE` (ruta absoluta fuera del clon, archivo
  existente con permisos **no más abiertos que 600**; si no → exit 3). Su contenido
  se inyecta **sólo** en el entorno del subproceso como `ATHENA_LLM_API_KEY`;
  `GOV_ATHENA_LLM_KEY_FILE` se elimina del entorno del subproceso y cualquier
  `ATHENA_LLM_API_KEY` heredada se ignora (siempre manda el archivo). La clave
  **nunca** se imprime ni se escribe.
- Provider/base URL/model: `GOV_ATHENA_LLM_PROVIDER/BASE_URL/MODEL` tienen prioridad
  sobre las `ATHENA_LLM_PROVIDER/BASE_URL/MODEL` heredadas.
- Ejecuta `GOV_DOTNET` (default `/usr/local/share/dotnet/dotnet`) con
  `GOV_ATHENA_DLL` (obligatorio, sin default) `run --topic <topic> --knowledge <dir>`
  y después `show <caso>`, con `stdin=DEVNULL` y el entorno aislado descrito arriba.
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
  de `$GOV_ATHENA_HOME/.athena/banco/<slug>/known-facts/*.json` (campo `statement`).
- Sin `GOV_ATHENA_HOME` → facts vacíos y `facts_available: false`.
- Salida JSON: `{"topics_passing", "progress", "total", "per_topic": {<slug>: {"present", "pass", "failed", "metrics", "facts_available"}}}`.
- Exit 0 siempre que pueda producir el JSON; el predicado del Goal decide el `pass`.

## Variables de entorno

| Variable | Obligatoria | Uso |
|---|---|---|
| `GOV_INPUT_SLUG` | sí (producer) | slug del tema a producir |
| `GOV_ATHENA_HOME` | sí (producer) | home desechable, fuera del clon y distinto del real; se proyecta como `HOME`/`USERPROFILE` en el subproceso y `ATHENA_HOME=$GOV_ATHENA_HOME/.athena` |
| `GOV_ATHENA_LLM_KEY_FILE` | sí (producer) | ruta absoluta (fuera del clon) a un archivo ≤600 con la clave; se inyecta como `ATHENA_LLM_API_KEY` sólo en el subproceso |
| `GOV_ATHENA_LLM_PROVIDER/BASE_URL/MODEL` | no | sobreescriben `ATHENA_LLM_PROVIDER/BASE_URL/MODEL` heredadas en el subproceso |
| `GOV_DOTNET` | no (default `/usr/local/share/dotnet/dotnet`) | binario `dotnet` |
| `GOV_ATHENA_DLL` | sí (producer) | ruta absoluta a `athena.dll` |
| `ATHENA_LLM_*` | sí (en ejecución real) | credenciales/configuración del LLM; pasan por entorno al Athena CLI |

## Prohibiciones

- **Nunca** leer ni escribir el repositorio real de AthenaSignal, `~/.athena`,
  `~/.local/share/opencode` ni `.env`.
- **Nunca** apuntar `GOV_ATHENA_HOME` al `~/.athena` real ni al `~` real (el producer
  lo rechaza con exit 3).
- **Nunca** ejecutar `dotnet`/`athena.dll` reales desde estos tests.
- **Nunca** escribir, imprimir ni registrar la clave LLM; sólo se inyecta en el
  entorno del subproceso del Athena CLI vía `ATHENA_LLM_API_KEY`.

## Tests

```sh
python3 -m pytest -q tools/gov_athena/tests tools/editorial_eval/test_evaluator.py
```

Los tests usan un `dotnet` falso (script temporal) que **escribe en un archivo del
test el entorno que recibió** (sin imprimirlo) y un `GOV_ATHENA_HOME` temporal; no
requieren Athena real ni LLM.