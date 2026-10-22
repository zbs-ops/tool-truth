/**
 * Show each ID-shaped flagged value in its sentence, plus where (if anywhere) it appears
 * before that turn in the τ²-bench conversation.
 *   npx tsx study/id-context.ts study/flagged-tau2.json [cache-dir]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isIdShaped } from '../src/values.js';

interface Flagged { file: string; task_id: string; trial: number; content: string; flags: { kind: string; values?: string[] }[] }
interface Msg { role: string; content: string | null; tool_calls?: unknown }

const all = JSON.parse(readFileSync(process.argv[2] as string, 'utf8')) as Flagged[];
const cache = process.argv[3] ?? join(process.env.HOME ?? '.', '.cache', 'tool-truth-tau2');
const files = new Map<string, { simulations: { task_id: string; trial: number; messages: Msg[] }[] }>();

let n = 0;
for (const t of all) {
  const ids = [...new Set(t.flags.flatMap((f) => (f.values ?? []).filter(isIdShaped)))];
  if (ids.length === 0) continue;
  n += 1;
  if (!files.has(t.file)) files.set(t.file, JSON.parse(readFileSync(join(cache, t.file), 'utf8')));
  const sim = files.get(t.file)?.simulations.find((s) => String(s.task_id) === String(t.task_id) && s.trial === t.trial);
  const msgs = sim?.messages ?? [];
  const cut = msgs.findIndex((m) => typeof m.content === 'string' && m.content.includes(t.content.trim().slice(0, 60)));
  const before = (cut >= 0 ? msgs.slice(0, cut) : msgs).map((m) => (m.content ?? '') + JSON.stringify(m.tool_calls ?? ''));
  const after = cut >= 0 ? msgs.slice(cut + 1, cut + 4) : [];
  console.log(`\n#${n} ${t.file.includes('airline') ? 'airline' : 'retail'} task ${t.task_id} trial ${t.trial}`);
  const text = t.content.replace(/\s+/g, ' ');
  for (const id of ids) {
    const at = text.indexOf(id);
    console.log(`  ${id}: "…${at >= 0 ? text.slice(Math.max(0, at - 140), at + 60) : '(normalized; not verbatim)'}…"`);
    const seen = before.some((b) => b.includes(id));
    console.log(`    seen earlier: ${seen}`);
  }
  const next = after.find((m) => m.role === 'user');
  if (next) console.log(`  NEXT USER: ${(next.content ?? '').replace(/\s+/g, ' ').slice(0, 160)}`);
  const nextCall = after.map((m) => JSON.stringify(m.tool_calls ?? '')).find((c) => ids.some((id) => c.includes(id)));
  if (nextCall) console.log(`  AGENT THEN CALLED A TOOL WITH IT: ${nextCall.slice(0, 160)}`);
}
