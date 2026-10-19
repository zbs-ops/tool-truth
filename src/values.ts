/**
 * Pull the concrete, checkable values out of a piece of text: numbers (with commas,
 * currency, decimals, percents), ISO dates, times, ID-like tokens, and quoted strings.
 * These are the things an agent can be caught inventing. Vague words aren't checkable
 * by exact match, which is the honest limit of a deterministic checker.
 */
export function extractValues(text: string): string[] {
  const found = new Set<string>();

  for (const m of text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) found.add(m[0]);
  for (const m of text.matchAll(/\b\d{1,2}:\d{2}\b/g)) found.add(m[0]);
  // IDs: letters and digits mixed, with a digit somewhere (ORD-48213, AB1234, txn_9f3k2).
  for (const m of text.matchAll(/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+\b/g)) {
    found.add(m[0]);
  }
  for (const m of text.matchAll(/\b[A-Z]{2,}\d{2,}\b/g)) found.add(m[0]);
  for (const m of text.matchAll(/"([^"\n]{2,80})"/g)) if (m[1]) found.add(m[1]);

  // Numbers last, skipping ones that are only part of a date, time, or ID already found.
  const covered = [...found].join(' ');
  for (const m of text.matchAll(/[$€£]?\s?-?\d[\d,]*(?:\.\d+)?%?/g)) {
    const n = normalizeNumber(m[0]);
    if (n === null) continue;
    if (isTrivial(n)) continue;
    if (covered.includes(m[0].trim())) continue;
    found.add(n);
  }
  return [...found];
}

/** "$1,024.50" → "1024.5"; "45.3%" → "45.3". Null if it isn't really a number. */
export function normalizeNumber(raw: string): string | null {
  const cleaned = raw.replace(/[$€£%,\s]/g, '');
  if (cleaned === '' || cleaned === '-' || Number.isNaN(Number(cleaned))) return null;
  return String(Number(cleaned));
}

/**
 * Small counting words in prose ("step 1", "2 options") aren't worth flagging. Anything
 * bigger than this, or with a decimal, is a value someone could have made up.
 */
function isTrivial(n: string): boolean {
  const v = Number(n);
  return Number.isInteger(v) && Math.abs(v) <= 3;
}

/**
 * Every scalar anywhere inside a tool payload, normalized the same way as extracted values,
 * so "1,024" in the answer matches 1024 in the JSON.
 */
export function payloadValues(payload: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (v === null || v === undefined) return;
    if (typeof v === 'number') {
      if (Number.isFinite(v)) out.add(String(v));
      return;
    }
    if (typeof v === 'string') {
      out.add(v);
      out.add(v.toLowerCase());
      const n = normalizeNumber(v);
      if (n !== null) out.add(n);
      for (const inner of extractValues(v)) out.add(inner);
      return;
    }
    if (typeof v === 'boolean') {
      out.add(String(v));
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (typeof v === 'object') {
      for (const [k, inner] of Object.entries(v as Record<string, unknown>)) {
        out.add(k);
        walk(inner);
      }
    }
  };
  walk(payload);
  return out;
}
