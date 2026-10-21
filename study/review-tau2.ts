/**
 * Reproducible random sample of τ²-bench flags, with evidence: for each flagged value, where
 * (if anywhere) its digits appear earlier in the conversation or the policy.
 *   npx tsx study/review-tau2.ts [n] [seed]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Flagged { file: string; task_id: string; trial: number; content: string; flags: { kind: string; values?: string[] }[] }
interface Msg { role: string; content: string | null; tool_calls?: { name: string; arguments: unknown }[] | null }

const n = Number(process.argv[2] ?? 30);
let seed = Number(process.argv[3] ?? 99);
const rand = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const CACHE = join(process.env.HOME ?? '.', '.cache', 'tool-truth-tau2');
const files = new Map<string, { info: { environment_info: { policy: string } }; simulations: { task_id: string; trial: number; messages: Msg[] }[] }>();
const all = JSON.parse(readFileSync('study/flagged-tau2.json', 'utf8')) as Flagged[];
const idx = [...all.keys()];
for (let i = idx.length - 1; i > 0; i -= 1) {
  const j = Math.floor(rand() * (i + 1));
  [idx[i], idx[j]] = [idx[j] as number, idx[i] as number];
}
idx.slice(0, n).forEach((k, s) => {
  const f = all[k] as Flagged;
  if (!files.has(f.file)) files.set(f.file, JSON.parse(readFileSync(join(CACHE, f.file), 'utf8')));
  const data = files.get(f.file);
  const sim = data?.simulations.find((x) => x.task_id === f.task_id && x.trial === f.trial);
  const msgs = sim?.messages ?? [];
  const cut = msgs.findIndex((m) => typeof m.content === 'string' && m.content.includes(f.content.trim().slice(0, 60)));
  const before = [`policy: ${data?.info.environment_info.policy ?? ''}`, ...(cut >= 0 ? msgs.slice(0, cut) : msgs).map((m) => `${m.role}: ${m.content ?? JSON.stringify(m.tool_calls)}`)];
  console.log(`\n#${s + 1} ${f.file.includes('airline') ? 'airline' : 'retail'} task ${f.task_id} trial ${f.trial}`);
  console.log('  ANSWER: ' + f.content.replace(/\s+/g, ' ').slice(0, 320));
  for (const fl of f.flags) for (const v of fl.values ?? []) {
    const hit = before.find((b) => b.includes(v));
    console.log(`  ${fl.kind} "${v}" -> ${hit ? 'seen in: ' + hit.replace(/\s+/g, ' ').slice(0, 150) : 'NOT seen earlier'}`);
  }
});
