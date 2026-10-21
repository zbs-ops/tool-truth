/**
 * Pull the concrete, checkable values out of a piece of text: numbers (with commas,
 * currency, decimals, percents), ISO dates, times, ID-like tokens, and quoted strings.
 * These are the things an agent can be caught inventing. Vague words aren't checkable
 * by exact match, which is the honest limit of a deterministic checker.
 */
export function extractValues(text: string): string[] {
  const found = new Set<string>();

  // Markdown list markers ("4. **Kettle**") are numbering, not facts. Measured on real
  // agent logs, they were one of the biggest sources of false alarms.
  // A day at the end of a sentence ("on May 21. 3. Modify") is not a list marker.
  let prose = text.replace(/(^|\n|\s)(\d{1,3})[.)]\s/g, (m, lead: string, _n: string, offset: number) =>
    new RegExp(`\\b(${MONTHS})\\.?\\s*$`, 'i').test(text.slice(Math.max(0, offset - 12), offset + lead.length)) ? m : lead,
  );

  // Dates, including inside timestamps (2024-05-07T21:53:00). Blanked out afterwards so
  // their parts aren't read again as numbers.
  prose = prose.replace(/(?<!\d)(\d{4}-\d{2}-\d{2})(?!\d)/g, (_m, d: string) => {
    addDate(found, d.slice(0, 4), d.slice(5, 7), d.slice(8, 10));
    return ' ';
  });
  // Dates written out: "May 19, 2024", "May 19th", "19 May 2024", and ranges like
  // "May 28-29, 2024". Agents almost always write dates this way while tools return ISO, so
  // they're normalized to the same tokens. (Ranges came from the round-2 dev set: without
  // this, "May 28-29" read the second day as the number -29.)
  prose = prose.replace(
    new RegExp(
      `\\b(${MONTHS})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*[-–]\\s*(\\d{1,2})(?:st|nd|rd|th)?)?(?:,?\\s+(\\d{4}))?\\b`,
      'gi',
    ),
    (_m, mon: string, day: string, day2: string | undefined, year: string | undefined) => {
      addDate(found, year, monthNumber(mon), day);
      if (day2) addDate(found, year, monthNumber(mon), day2);
      return ' ';
    },
  );
  prose = prose.replace(
    new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS})\\.?(?:,?\\s+(\\d{4}))?\\b`, 'gi'),
    (_m, day: string, mon: string, year: string | undefined) => {
      addDate(found, year, monthNumber(mon), day);
      return ' ';
    },
  );
  // Times, normalized to 24-hour H:MM so "9:00 AM", "09:00:00" and "9am" all meet.
  prose = prose.replace(
    /(?<![\d:])(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s?(am|pm|AM|PM|a\.m\.|p\.m\.)?(?![\d])/g,
    (m, h: string, min: string | undefined, ap: string | undefined) => {
      if (min === undefined && ap === undefined) return m; // a plain number, not a time
      let hour = Number(h);
      if (hour > 23 || (min !== undefined && Number(min) > 59)) return m;
      const pm = ap !== undefined && ap.toLowerCase().startsWith('p');
      const am = ap !== undefined && ap.toLowerCase().startsWith('a');
      if (pm && hour < 12) hour += 12;
      if (am && hour === 12) hour = 0;
      found.add(`${hour}:${min ?? '00'}`);
      return ' ';
    },
  );

  // Illustrations are not claims: "a code like 'ABC123'", "e.g. W0000000", "in the format
  // firstname_lastname_numbers". The example after the cue is dropped. (Round-2 dev set.)
  prose = prose.replace(
    /\b(like|e\.g\.|eg\.|such as|for example|for instance|format(?: of)?|looks like|example:?)\s*[:,]?\s*['"‘“#]?[A-Za-z0-9_#-]+['"’”]?/gi,
    '$1 ',
  );
  // Hedged numbers are approximations, not exact claims: "about $46 to $54", "above $270",
  // "around 13 days". Exact-match checking can't judge them, so they're left out. A stated
  // limit, not a fix: an invented approximate number passes. (Round-2 dev set.)
  prose = prose.replace(
    /\b(about|around|approximately|approx\.?|roughly|nearly|almost|over|above|under|below|up to|at least|at most|more than|less than|~)\s*\$?\d[\d,]*(?:\.\d+)?(?:\s*(?:to|-|–|and)\s*\$?\d[\d,]*(?:\.\d+)?)?/gi,
    '$1 ',
  );

  // IDs with separators: ORD-48213, txn_9f3k2, gift_card_7091239. Also their numeric
  // parts, because people say "Gift Card 7091239" for gift_card_7091239, and their
  // alphabetic parts, because a user ID like omar_rossi_1241 grounds the name "Omar Rossi".
  // Counts like "500-piece" or "15-inch" aren't IDs; their number is picked up below.
  for (const m of prose.matchAll(/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+\b/g)) {
    if (/^\d+(?:-[A-Za-z]+)+$/.test(m[0])) continue;
    found.add(m[0]);
    for (const part of m[0].split(/[-_]/)) {
      if (/^\d{4,}$/.test(part)) found.add(String(Number(part)));
      else if (/^[A-Za-z]{3,}$/.test(part) && m[0].includes('_')) found.add(part.toLowerCase());
    }
  }
  // Codes that mix letters and digits with no separator: HAT266, M20IZO, W5272531. Taken
  // whole, so their digits are never read as a separate number.
  for (const m of prose.matchAll(/\b(?=[A-Za-z0-9]*\d)(?=[A-Za-z0-9]*[A-Za-z])[A-Za-z0-9]{4,}\b/g)) found.add(m[0]);
  // Quoted strings, without the punctuation American style puts inside the quotes
  // ("return requested." vs a returned value of return requested).
  for (const m of prose.matchAll(/"([^"\n]{2,80})"/g)) {
    const q = m[1]?.replace(/[\s.,;:!?]+$/, '');
    // Two-letter quotes ("no", "ok") are instructions to the user, not claims.
    if (q && q.length >= 3) found.add(q);
  }

  // Standalone numbers only: never digits glued to letters, which belong to a code.
  for (const m of prose.matchAll(/(?<![A-Za-z0-9_.-])[$€£]?\s?-?\d[\d,]*(?:\.\d+)?%?(?![A-Za-z0-9_])/g)) {
    const n = normalizeNumber(m[0]);
    if (n === null) continue;
    if (isTrivial(n)) continue;
    found.add(n);
  }
  return [...found];
}

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTHS =
  'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec';

function monthNumber(name: string): string {
  return String(MONTH_NAMES.indexOf(name.slice(0, 3).toLowerCase()) + 1).padStart(2, '0');
}

/**
 * Record a date as its full ISO form when the year is known, plus a month-day token and the
 * year on its own, so "May 19" and "May 19, 2024" both meet a tool's 2024-05-19.
 */
function addDate(found: Set<string>, year: string | undefined, month: string, day: string): void {
  const md = `${month}-${day.padStart(2, '0')}`;
  found.add(md);
  if (year) {
    found.add(`${year}-${md}`);
    found.add(year);
  }
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
