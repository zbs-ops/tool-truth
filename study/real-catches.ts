/**
 * Regression guard for the study: the five real problems confirmed by hand on GPT-4o must
 * still be flagged after any rule change.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fromOpenAI } from '../src/adapters.js';
import { checkTurns } from '../src/check.js';

const CACHE = join(process.env.HOME ?? '.', '.cache', 'tool-truth-tau');
const CASES: { file: string; task: number; trial: number; value: string; what: string }[] = [
  { file: 'gpt-4o-retail.json', task: 8, trial: 1, value: 'Desk Lamps', what: 'invented store website' },
  { file: 'gpt-4o-retail.json', task: 50, trial: 1, value: 'Place Order', what: 'invented checkout flow' },
  { file: 'gpt-4o-airline.json', task: 32, trial: 0, value: '05-27', what: 'invented round trip' },
  { file: 'gpt-4o-airline.json', task: 10, trial: 0, value: '05-26', what: 'wrong return date' },
  { file: 'gpt-4o-retail.json', task: 28, trial: 0, value: '5565470', what: 'misquoted order ID' },
];

const cache = new Map<string, { task_id: number; trial: number; traj: Record<string, unknown>[] }[]>();
let missing = 0;
for (const c of CASES) {
  if (!cache.has(c.file)) cache.set(c.file, JSON.parse(readFileSync(join(CACHE, c.file), 'utf8')));
  const t = cache.get(c.file)?.find((x) => x.task_id === c.task && x.trial === c.trial);
  const flagged = t ? checkTurns(fromOpenAI(t.traj)).some((v) => v.flags.some((f) => (f.values ?? []).includes(c.value))) : false;
  console.log(`${flagged ? 'still caught' : 'MISSED'}: ${c.what} (${c.value})`);
  if (!flagged) missing += 1;
}
process.exitCode = missing ? 1 : 0;
