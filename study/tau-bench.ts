/**
 * Run tool-truth over real agent conversations from τ-bench (Yao et al., 2024; MIT
 * licensed): customer-service agents in airline and retail domains, using tools against a
 * simulated user. The published trajectories are fetched on demand and not committed.
 *
 *   npx tsx study/tau-bench.ts            # summary
 *   npx tsx study/tau-bench.ts --dump     # also write every flagged turn to study/flagged.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { fromOpenAI } from '../src/adapters.js';
import { checkTurns } from '../src/check.js';
import type { FlagKind } from '../src/types.js';

const BASE = 'https://raw.githubusercontent.com/sierra-research/tau-bench/main/historical_trajectories/';
const FILES = ['gpt-4o-airline.json', 'gpt-4o-retail.json'];
const CACHE = join(process.env.HOME ?? '.', '.cache', 'tool-truth-tau');

interface Trajectory {
  task_id: number;
  trial?: number;
  reward: number;
  traj: Record<string, unknown>[];
}

async function load(file: string): Promise<Trajectory[]> {
  mkdirSync(CACHE, { recursive: true });
  const path = join(CACHE, file);
  if (!existsSync(path)) {
    const res = await fetch(BASE + file);
    if (!res.ok) throw new Error(`fetch ${file}: ${res.status}`);
    writeFileSync(path, await res.text());
  }
  return JSON.parse(readFileSync(path, 'utf8')) as Trajectory[];
}

async function main(): Promise<void> {
  const dump = process.argv.includes('--dump');
  const flagged: unknown[] = [];
  const lines: string[] = ['tool-truth on τ-bench (GPT-4o historical trajectories)', ''];

  for (const file of FILES) {
    const data = await load(file);
    let turns = 0;
    let flaggedTurns = 0;
    let convsWithFlag = 0;
    const byKind = new Map<FlagKind, number>();
    for (const t of data) {
      const verdicts = checkTurns(fromOpenAI(t.traj));
      turns += verdicts.length;
      const bad = verdicts.filter((v) => !v.honest);
      flaggedTurns += bad.length;
      if (bad.length > 0) convsWithFlag += 1;
      for (const v of bad) {
        for (const f of v.flags) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
        if (dump) flagged.push({ file, task_id: t.task_id, trial: t.trial, reward: t.reward, turn: v.index, content: v.content, flags: v.flags });
      }
    }
    lines.push(
      `${file}`,
      `  conversations ${data.length}, agent turns ${turns}`,
      `  flagged turns ${flaggedTurns} (${((100 * flaggedTurns) / Math.max(turns, 1)).toFixed(1)}%), conversations with a flag ${convsWithFlag}`,
      `  by kind: ${[...byKind].map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}`,
      '',
    );
  }

  process.stdout.write(lines.join('\n') + '\n');
  if (dump) {
    writeFileSync(join('study', 'flagged.json'), JSON.stringify(flagged, null, 2));
    process.stdout.write(`wrote ${flagged.length} flagged turns to study/flagged.json\n`);
  }
}

void main();
