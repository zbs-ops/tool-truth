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
import type { FlagKind } from '../src/types.js';
import { type Tau2File, fromTau2 } from './tau2-format.js';

const BASE = `https://raw.githubusercontent.com/sierra-research/tau2-bench/${TAU2_BENCH_COMMIT}/data/tau2/results/final/`;
// --model picks another agent model from the same published results (default: o4-mini, the
// round-2 test set). Round 3's held-out sets: claude-3-7-sonnet-20250219 and gpt-4.1-2025-04-14.
// Round 4's: gpt-4.1-mini-2025-04-14 with --setting base (that's how its files are named).
const MODEL = process.argv.includes('--model') ? (process.argv[process.argv.indexOf('--model') + 1] as string) : 'o4-mini-2025-04-16';
const SETTING = process.argv.includes('--setting') ? (process.argv[process.argv.indexOf('--setting') + 1] as string) : 'default';
// --domain telecom runs τ²-bench's third domain, where the user has tools too. It was never
// looked at while writing any rule (round 5).
const DOMAINS = process.argv.includes('--domain') ? [process.argv[process.argv.indexOf('--domain') + 1] as string] : ['airline', 'retail'];
const FILES = DOMAINS.map((d) => `${MODEL}_${d}_${SETTING}_gpt-4.1-2025-04-14_4trials.json`);
const SUFFIX = [MODEL === 'o4-mini-2025-04-16' ? '' : MODEL.split('-2025')[0], DOMAINS.length === 1 ? DOMAINS[0] : ''].filter(Boolean).join('-');
const OUT = SUFFIX ? `flagged-tau2-${SUFFIX}.json` : 'flagged-tau2.json';

async function load(file: string): Promise<Tau2File> {
  return JSON.parse(await fetchCached(BASE + file, join(TAU2_CACHE, file))) as Tau2File;
}

async function main(): Promise<void> {
  const dump = process.argv.includes('--dump');
  const flagged: unknown[] = [];
  const lines = [`tool-truth on τ²-bench (${MODEL}, ${DOMAINS.join(' + ')}, rules frozen)`, ''];
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
