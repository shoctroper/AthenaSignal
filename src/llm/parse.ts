/**
 * Utilidades de parseo de respuestas LLM.
 *
 * Los modelos reales a veces envuelven el JSON en fences de markdown o añaden
 * texto. El parseo debe ser tolerante pero nunca inventar contenido: si no se
 * puede extraer JSON válido se devuelve `undefined` para que la etapa aplique
 * su fallback seguro.
 */

export function extractJsonText(text: string): string | undefined {
  if (!text) return undefined;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const trimmed = candidate.trim();

  const objectStart = trimmed.indexOf('{');
  const arrayStart = trimmed.indexOf('[');
  let start = -1;
  let open = '';
  let close = '';
  if (objectStart >= 0 && (arrayStart < 0 || objectStart < arrayStart)) {
    start = objectStart;
    open = '{';
    close = '}';
  } else if (arrayStart >= 0) {
    start = arrayStart;
    open = '[';
    close = ']';
  }
  if (start < 0) return undefined;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < trimmed.length; i += 1) {
    const char = trimmed[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(start, i + 1);
      }
    }
  }
  return undefined;
}

export function parseJson<T>(text: string): T | undefined {
  const jsonText = extractJsonText(text);
  if (!jsonText) return undefined;
  try {
    return JSON.parse(jsonText) as T;
  } catch {
    return undefined;
  }
}
