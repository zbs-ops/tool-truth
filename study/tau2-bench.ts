/**
 * Third test set, never looked at while writing any rule: τ²-bench (Sierra Research, MIT
 * licensed) published trajectories for o4-mini in the airline and retail domains. The
 * rules were frozen before this file was first run.
 *
 *   npx tsx study/tau2-bench.ts [--dump]
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { TAU2_BENCH_COMMIT, TAU2_CACHE, fetchCached } from './fetch-cached.js';
import { checkTurns } from '../src/check.js';
import type { FlagKind, Step, Transcript } from '../src/types.js';
import { stripToolMarkup } from '../src/adapters.js';

const BASE = `https://raw.githubusercontent.com/sierra-research/tau2-bench/${TAU2_BENCH_COMMIT}/data/tau2/results/final/`;
// --model picks another agent model from the same published results (default: o4-mini, the
// round-2 test set). Round 3's held-out sets: claude-3-7-sonnet-20250219 and gpt-4.1-2025-04-14.
// Round 4's: gpt-4.1-mini-2025-04-14 with --setting base (that's how its files are named).
const MODEL = process.argv.includes('--model') ? (process.argv[process.argv.indexOf('--model') + 1] as string) : 'o4-mini-2025-04-16';
const SETTING = process.argv.includes('--setting') ? (process.argv[process.argv.indexOf('--setting') + 1] as string) : 'default';
const FILES = ['airline', 'retail'].map((d) => `${MODEL}_${d}_${SETTING}_gpt-4.1-2025-04-14_4trials.json`);
const OUT = MODEL === 'o4-mini-2025-04-16' ? 'flagged-tau2.json' : `flagged-tau2-${MODEL.split('-2025')[0]}.json`;

interface Tau2Message {
  role: 'assistant' | 'user' | 'tool';
  content: string | null;
  id?: string;
  error?: boolean;
  tool_calls?: { id: string; name: string; arguments: Record<string, unknown> | string }[] | null;
}
interface Tau2File {
  info: { environment_info: { policy: string } };
  simulations: { task_id: string; trial: number; messages: Tau2Message[] }[];
}

function parse(content: string | null): unknown {
  if (content === null) return null;
  const s = content.trim();
  if (s.startsWith('{') || s.startsWith('[')) {
    try {
      return JSON.parse(s);
    } catch {
      return content;
    }
  }
  return content;
}

/** τ²-bench's message format onto tool-truth steps. The domain policy is the agent's system context. */
export function fromTau2(policy: string, messages: Tau2Message[]): Transcript {
  const steps: Step[] = [{ role: 'system', content: policy }];
  const names = new Map<string, string>();
  for (const m of messages) {
    if (m.role === 'user' && m.content) steps.push({ role: 'user', content: m.content });
    else if (m.role === 'assistant') {
      for (const c of m.tool_calls ?? []) {
        names.set(c.id, c.name);
        const args = typeof c.arguments === 'string' ? (parse(c.arguments) as Record<string, unknown>) ?? {} : c.arguments;
        steps.push({ role: 'tool_call', id: c.id, tool: c.name, args });
      }
      const said = m.content ? stripToolMarkup(m.content) : '';
      if (said.trim()) steps.push({ role: 'assistant', content: said });
    } else if (m.role === 'tool') {
      const id = m.id ?? '';
      steps.push({ role: 'tool_result', id, tool: names.get(id) ?? 'unknown', status: m.error ? 'error' : 'ok', payload: parse(m.content) });
    }
  }
  return { steps };
}

async function load(file: string): Promise<Tau2File> {
  return JSON.parse(await fetchCached(BASE + file, join(TAU2_CACHE, file))) as Tau2File;
}

async function main(): Promise<void> {
  const dump = process.argv.includes('--dump');
  const flagged: unknown[] = [];
  const lines = ['tool-truth on τ²-bench (o4-mini, third test set, rules frozen)', ''];
  for (const file of FILES) {
    const data = await load(file);
    let turns = 0;
    let bad = 0;
    let convs = 0;
    const byKind = new Map<FlagKind, number>();
    for (const sim of data.simulations) {
      const verdicts = checkTurns(fromTau2(data.info.environment_info.policy, sim.messages));
      turns += verdicts.length;
      const b = verdicts.filter((v) => !v.honest);
      bad += b.length;
      if (b.length) convs += 1;
      for (const v of b) {
        for (const f of v.flags) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
        if (dump) flagged.push({ file, task_id: sim.task_id, trial: sim.trial, turn: v.index, content: v.content, flags: v.flags });
      }
    }
    lines.push(
      file.split('_').slice(0, 2).join(' '),
      `  conversations ${data.simulations.length}, agent turns ${turns}`,
      `  flagged turns ${bad} (${((100 * bad) / Math.max(turns, 1)).toFixed(1)}%), conversations with a flag ${convs}`,
      `  by kind: ${[...byKind].map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}`,
      '',
    );
  }
  process.stdout.write(lines.join('\n') + '\n');
  if (dump) {
    writeFileSync(join('study', OUT), JSON.stringify(flagged, null, 2));
    process.stdout.write(`wrote ${flagged.length} flagged turns to study/${OUT}\n`);
  }
}

void main();
