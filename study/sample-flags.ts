/**
 * A reproducible random sample of flagged turns from any study file, for reading by hand.
 * Same seeded shuffle as review-tau2.ts, drawn from ALL flags (not a pre-filtered bucket:
 * on o4-mini telecom, a "quoted label" bucket would have hidden the one real invention).
 *
 *   npx tsx study/sample-flags.ts study/flagged-tau2-gpt-4.1-telecom.json [n] [seed]
 */
import { readFileSync } from 'node:fs';

interface Flagged { task_id: string; trial: number; turn: number; content: string; flags: { kind: string; values?: string[] }[] }

const file = process.argv[2] as string;
const n = Number(process.argv[3] ?? 30);
let seed = Number(process.argv[4] ?? 99);
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const all = JSON.parse(readFileSync(file, 'utf8')) as Flagged[];
const idx = [...all.keys()];
for (let i = idx.length - 1; i > 0; i -= 1) {
  const j = Math.floor(rand() * (i + 1));
  [idx[i], idx[j]] = [idx[j] as number, idx[i] as number];
}
for (const [s, k] of idx.slice(0, n).entries()) {
  const f = all[k] as Flagged;
  const values = f.flags.flatMap((x) => x.values ?? []);
  const text = f.content.replace(/\s+/g, ' ');
  const at = Math.max(0, text.indexOf(values[0] ?? ''));
  console.log(`#${s + 1} task ${f.task_id} trial ${f.trial} turn ${f.turn} [${values.join(' | ')}]`);
  console.log(`   …${text.slice(Math.max(0, at - 140), at + 100)}…`);
}
