/**
 * How many flags are about an ID-shaped value, and which ones?
 *   npx tsx study/id-flags.ts study/flagged-tau2.json
 */
import { readFileSync } from 'node:fs';

import { isIdShaped } from '../src/values.js';

interface Flagged { file: string; task_id: string | number; trial: number; content: string; flags: { kind: string; values?: string[] }[] }

const all = JSON.parse(readFileSync(process.argv[2] as string, 'utf8')) as Flagged[];
const withId = all.filter((t) => t.flags.some((f) => (f.values ?? []).some(isIdShaped)));
console.log(`${process.argv[2]}: ${withId.length} of ${all.length} flagged turns name an ID-shaped value`);
for (const t of withId) {
  const ids = t.flags.flatMap((f) => (f.values ?? []).filter(isIdShaped));
  console.log(`- ${t.file.includes('airline') ? 'airline' : 'retail'} task ${t.task_id} trial ${t.trial}: ${ids.join(', ')}`);
}
