/**
 * Print a reproducible random sample of flagged turns with evidence for manual review: for
 * each flagged value, where (if anywhere) its digits appear earlier in the raw conversation.
 *   npx tsx study/review.ts [n] [seed] [flagged-file]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Flagged {
  file: string;
  task_id: number;
  trial?: number;
  turn: number;
  content: string;
  flags: { kind: string; values?: string[] }[];
}

const n = Number(process.argv[2] ?? 30);
let seed = Number(process.argv[3] ?? 7);
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const CACHE = join(process.env.HOME ?? '.', '.cache', 'tool-truth-tau');
const raw = new Map<string, { task_id: number; trial?: number; traj: { role: string; content?: unknown }[] }[]>();
const trajOf = (file: string, task: number, trial?: number) => {
  if (!raw.has(file)) raw.set(file, JSON.parse(readFileSync(join(CACHE, file), 'utf8')));
  return raw.get(file)?.find((t) => t.task_id === task && (trial === undefined || t.trial === trial))?.traj ?? [];
};

const all = JSON.parse(readFileSync(process.argv[4] ?? 'study/flagged.json', 'utf8')) as Flagged[];
const idx = [...all.keys()];
for (let i = idx.length - 1; i > 0; i -= 1) {
  const j = Math.floor(rand() * (i + 1));
  [idx[i], idx[j]] = [idx[j] as number, idx[i] as number];
}

idx.slice(0, n).forEach((k, s) => {
  const f = all[k] as Flagged;
  const traj = trajOf(f.file, f.task_id, f.trial);
  // Messages before this turn, as text. The adapter's step index isn't the message index,
  // so search everything before the first message whose content matches this turn.
  const cut = traj.findIndex((m) => typeof m.content === 'string' && m.content === f.content);
  const before = (cut >= 0 ? traj.slice(0, cut) : traj).map((m) => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m)}`);
  console.log(`\n#${s + 1} ${f.file.replace('gpt-4o-', '').replace('sonnet-35-new-', 'sonnet-').replace('.json', '')} task ${f.task_id} trial ${f.trial}`);
  console.log('  ANSWER: ' + f.content.replace(/\s+/g, ' ').slice(0, 300));
  for (const fl of f.flags) {
    for (const v of fl.values ?? []) {
      const digits = v.replace(/\.0+$/, '');
      const hit = before.find((b) => b.includes(digits));
      console.log(`  ${fl.kind} "${v}" -> ${hit ? 'seen earlier in: ' + hit.replace(/\s+/g, ' ').slice(0, 160) : 'NOT seen earlier'}`);
    }
  }
});
