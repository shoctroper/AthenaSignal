# RFC-007 — El extractor de señal con modelo, sin renunciar a la evidencia

Estado: **BORRADOR v1** — pendiente del Cuestionador
Autor: Arquitecto
Fecha: 2026-09-21
Relacionado: RFC-003 (arquitectura y adapters), DU-001 (modelo conceptual)

---

## 1. El problema, medido

El 2026-09-21 la tubería de AthenaSignal corrió por primera vez contra una
fuente real de internet: un video de YouTube traído con `yt-dlp`, transcripción
completa, 18,430 caracteres. **La adquisición funcionó. La extracción no.**

Esto es literal, sin recortar, lo que `SignalExtractor.heuristicExtract`
devolvió de ese texto:

```json
"topics":   ["But what is a neural network? | Deep learning chapter 1"],
"concepts": ["But","Deep","This","And","The","Unless","What","There",
             "Right","For","Each","Now","Well", "...","Patreon","Yeah"],
"claims":   [{"statement": "This is a 3"}]
```

Los «conceptos» son palabras que empiezan con mayúscula, es decir las primeras
de cada frase. El «tema» es el título copiado. La puntuación editorial salió
toda en 1, el mínimo, sin discriminar nada.

**Por qué las 133 pruebas en verde no lo detectaron:** todas corren offline
contra fixtures pequeños y escritos a mano, donde una heurística de mayúsculas
parece razonable. Las pruebas miden que la tubería *transporta*; no medían que
produjera algo utilizable. No están mal escritas — están midiendo otra cosa de
la que creíamos.

`SignalExtractor` ya prevé la solución: acepta un `customEngine` opcional. Ese
gancho **no está conectado a nada** en todo el repositorio.

## 2. La tensión que este RFC tiene que resolver

Enchufar un modelo es fácil y es justamente por eso que es peligroso. La tesis
de AthenaSignal (DU-001, RFC-003) es **no asumir que la fuente tiene razón y no
amplificar afirmaciones**. Un modelo generativo es, por construcción, una
máquina de producir texto plausible. Conectado ingenuamente, convierte a Signal
en lo contrario de lo que existe para ser: un amplificador de afirmaciones con
apariencia de rigor.

Todo lo que sigue existe para resolver esa tensión.

## 3. Decisiones

### D-EX-1 · Ninguna afirmación sin cita literal, verificada por código
Cada `claim` que el motor devuelva trae una `quote`. Antes de aceptarlo, Signal
**busca esa cita en el transcript**, normalizando espacios y comillas
tipográficas. Si no aparece literalmente, **el claim se descarta**, y se
registra como `unquotable` para que el hueco sea visible.

No es una sugerencia en el prompt: es un filtro determinista, ejecutado después
del modelo, sobre texto que el modelo no controla. Un modelo que alucina una
cita falla la comprobación.

Medido el 2026-09-21: `gemma4:26b` sobre el transcript real devolvió cuatro
claims y **las cuatro citas resultaron literales**, verificadas carácter a
carácter. Eso no prueba que siempre lo haga — prueba que el filtro es
alcanzable, y por eso el filtro se queda.

### D-EX-2 · El motor es inyectable y opcional; el modo por defecto sigue siendo offline
`customEngine` se pasa por constructor, como hoy. Sin motor, la heurística
sigue ahí. Las 133 pruebas deterministas **no cambian y no tocan la red**: el
modelo solo entra en corridas reales. Una suite que depende de un LLM deja de
ser una suite.

### D-EX-3 · Local por defecto, porque el cuello de botella es el volumen
El motor por defecto apunta a Ollama local (endpoint compatible con OpenAI en
`http://localhost:11434/v1`). Razón: hacer scalping de una plataforma significa
cientos de items, y los modelos gratuitos con cuota ya dejaron tirado al sistema
el 2026-09-20 (46 de 56 propuestas perdidas por un 429). Un modelo local no
tiene cuota ni saldo que se agote.

Coste medido: **78 segundos por cada 9,000 caracteres** con `gemma4:26b`. Es
aceptable para proceso por lotes y no lo es para una interacción en vivo; este
RFC solo cubre lotes.

### D-EX-4 · `reasoning_effort: "none"`, o el contenido llega vacío
Los modelos locales capaces (`gemma4:26b`, `qwen3.8:27b`, `gpt-oss:20b`,
`laguna-xs-2.1`) devuelven su salida en el campo `reasoning` y dejan `content`
**vacío** salvo que la petición lleve `reasoning_effort: "none"`. Medido:
sin él, `content=''` y `reasoning=371` caracteres.

Sin esta línea, Signal recibiría cadenas vacías y parecería que «no extrajo
nada» — un fallo silencioso, que es la peor clase.

### D-EX-5 · El motor se elige por configuración, en dos escalones
`SIGNAL_EXTRACTOR_MODEL` y `SIGNAL_EXTRACTOR_BASE_URL`. Por defecto el local;
apuntables a OpenCode Zen o a DeepSeek cuando un item concreto justifique más
calidad. Es la misma política de escalones que gobierna a MarioGovernance, y se
mantiene igual a propósito: una sola idea que aprender, no dos.

### D-EX-6 · Un fallo del motor degrada, nunca detiene
Si el modelo no responde, responde tarde o devuelve algo que no es JSON, el
extractor **cae a la heurística** y lo marca en `metadata.extractor` como
`"heuristic (fallback)"`. Un item procesado con la heurística debe ser
distinguible de uno procesado con modelo: sin esa marca, la calidad del corpus
se vuelve imposible de auditar.

### D-EX-7 · El transcript se acota, y el recorte se declara
Entra al modelo un máximo configurable (por defecto 9,000 caracteres, lo
medido). Si el transcript es mayor, se procesa por bloques y
`metadata.truncated` dice cuánto quedó fuera. Un resumen de la mitad de un video
presentado como resumen del video es una afirmación falsa sobre la fuente.

### D-EX-8 · La procedencia viaja con cada unidad extraída
Todo `claim`, `concept` y `topic` conserva `provenanceSourceId` y, cuando
existe, el desplazamiento de la cita en el transcript. Sin eso no se puede
reconstruir de dónde salió una idea, y el estado epistémico de M7
(`CONFIRMED`/`REFUTED`/…) pierde su base.

## 4. Aceptación (fijada, denegada al implementador)

1. Sin `customEngine`, el comportamiento es byte-idéntico al de hoy y ninguna
   de las 133 pruebas cambia.
2. Con un motor falso que devuelve un claim con cita **literal**, el claim
   sobrevive.
3. Con un motor falso que devuelve un claim con cita **inventada**, el claim se
   descarta y aparece en `unquotable`.
4. La verificación de cita ignora diferencias de espacios y de comillas
   tipográficas, y **no** ignora diferencias de palabras.
5. Un motor que lanza excepción produce resultado heurístico marcado
   `"heuristic (fallback)"`, nunca una excepción hacia arriba.
6. Un motor que devuelve texto que no es JSON se trata igual que el caso 5.
7. Un transcript mayor que el límite marca `metadata.truncated` con el número
   de caracteres omitidos.
8. La petición al endpoint compatible con OpenAI incluye
   `reasoning_effort: "none"`; hay una prueba que falla si se quita.
9. Ningún claim aceptado carece de `provenanceSourceId`.
10. La suite completa sigue corriendo **sin red**: una prueba verifica que no se
    abre ningún socket cuando no hay motor inyectado.

## 5. Fuera de alcance

Resumir, opinar sobre la fuente o puntuar su credibilidad con el modelo. El
`EditorialScorer` sigue siendo determinista: mezclar juicio editorial generado
con extracción haría imposible saber cuál de los dos falló. También queda fuera
la transcripción por audio (STT): aquí solo se consumen subtítulos existentes.
