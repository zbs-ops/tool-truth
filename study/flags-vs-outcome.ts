/**
 * Do flagged conversations fail their task more often? Every τ²-bench conversation records
 * whether the agent completed the task (reward 1 or 0). This joins that to tool-truth's flags,
 * rules frozen, across every published run the earlier rounds used.
 *
 * For each run: the failure rate of conversations with at least one flag vs those with none,
 * Fisher's exact test (two-sided) on that 2x2 table, and the same split for the high-confidence
 * invented-ID view. Longer conversations have more turns to be flagged in and more steps to go
 * wrong, so the pooled numbers are also shown within shorter and longer halves of each run.
 *
 *   npx tsx study/flags-vs-outcome.ts [--write]
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { TAU2_BENCH_COMMIT, TAU2_CACHE, fetchCached } from './fetch-cached.js';
import { checkTurns } from '../src/check.js';
import { idFlags } from '../src/ids.js';
import { type Tau2File, fromTau2 } from './tau2-format.js';

const BASE = `https://raw.githubusercontent.com/sierra-research/tau2-bench/${TAU2_BENCH_COMMIT}/data/tau2/results/final/`;

// Every run the earlier rounds published, except telecom with no customer (round 8), where the
// agent's only text is ###STOP### and there is nothing to check.
const RUNS: [model: string, domain: string, setting: string][] = [
  ['o4-mini-2025-04-16', 'airline', 'default'],
  ['o4-mini-2025-04-16', 'retail', 'default'],
  ['gpt-4.1-2025-04-14', 'airline', 'default'],
  ['gpt-4.1-2025-04-14', 'retail', 'default'],
  ['gpt-4.1-mini-2025-04-14', 'airline', 'base'],
  ['gpt-4.1-mini-2025-04-14', 'retail', 'base'],
  ['claude-3-7-sonnet-20250219', 'airline', 'default'],
  ['claude-3-7-sonnet-20250219', 'retail', 'default'],
  ['o4-mini-2025-04-16', 'telecom', 'default'],
  ['gpt-4.1-2025-04-14', 'telecom', 'default'],
  ['gpt-4.1-mini-2025-04-14', 'telecom', 'base'],
  ['claude-3-7-sonnet-20250219', 'telecom', 'default'],
  ['o4-mini-2025-04-16', 'telecom-workflow', 'default'],
  ['gpt-4.1-2025-04-14', 'telecom-workflow', 'default'],
];

export interface Conv {
  failed: boolean;
  flagged: boolean;
  idFlagged: boolean;
  turns: number;
}

/** [failed, total] for the conversations matching `pick`. */
function tally(convs: Conv[], pick: (c: Conv) => boolean): [number, number] {
  const sel = convs.filter(pick);
  return [sel.filter((c) => c.failed).length, sel.length];
}

const logFact: number[] = [0];
function lf(n: number): number {
  for (let i = logFact.length; i <= n; i++) logFact[i] = (logFact[i - 1] as number) + Math.log(i);
  return logFact[n] as number;
}

/** Two-sided Fisher's exact test for [[a, b], [c, d]]. */
export function fisher(a: number, b: number, c: number, d: number): number {
  const r1 = a + b;
  const r2 = c + d;
  const c1 = a + c;
  const n = r1 + r2;
  const p = (x: number) => Math.exp(lf(r1) + lf(r2) + lf(c1) + lf(n - c1) - lf(n) - lf(x) - lf(r1 - x) - lf(c1 - x) - lf(r2 - c1 + x));
  const observed = p(a);
  let total = 0;
  for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) {
    const px = p(x);
    if (px <= observed * (1 + 1e-9)) total += px;
  }
  return Math.min(1, total);
}

/** Complementary error function (Abramowitz and Stegun 7.1.26, error below 1.5e-7). */
function erfc(x: number): number {
  const t = 1 / (1 + 0.3275911 * x);
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return poly * Math.exp(-x * x);
}

/**
 * Mantel-Haenszel across strata: the common odds ratio of failing when flagged, and the
 * Cochran-Mantel-Haenszel test (continuity-corrected, 1 df). Each stratum is compared only with
 * itself, so a run that is both flag-heavy and hard can't make flags look predictive on its own.
 */
export function mantelHaenszel(strata: Conv[][]): { or: number; p: number } {
  let num = 0;
  let den = 0;
  let sumA = 0;
  let sumE = 0;
  let sumV = 0;
  for (const s of strata) {
    const a = s.filter((c) => c.flagged && c.failed).length;
    const b = s.filter((c) => c.flagged && !c.failed).length;
    const c = s.filter((x) => !x.flagged && x.failed).length;
    const d = s.filter((x) => !x.flagged && !x.failed).length;
    const n = a + b + c + d;
    if (n < 2) continue;
    num += (a * d) / n;
    den += (b * c) / n;
    sumA += a;
    sumE += ((a + b) * (a + c)) / n;
    sumV += ((a + b) * (c + d) * (a + c) * (b + d)) / (n * n * (n - 1));
  }
  const chi = sumV === 0 ? 0 : (Math.abs(sumA - sumE) - 0.5) ** 2 / sumV;
  return { or: num / den, p: erfc(Math.sqrt(Math.max(chi, 0) / 2)) };
}

const pct = ([f, n]: [number, number]) => (n === 0 ? '   -  ' : `${((100 * f) / n).toFixed(1).padStart(5)}%`);
const frac = ([f, n]: [number, number]) => `${f}/${n}`.padStart(9);
const pval = (p: number) => (p < 0.001 ? '<0.001' : p.toFixed(3));

function row(label: string, convs: Conv[]): string {
  const flagged = tally(convs, (c) => c.flagged);
  const clean = tally(convs, (c) => !c.flagged);
  const ids = tally(convs, (c) => c.idFlagged);
  const p = fisher(flagged[0], flagged[1] - flagged[0], clean[0], clean[1] - clean[0]);
  return [
    label.padEnd(34),
    `${pct(flagged)} ${frac(flagged)}`,
    `${pct(clean)} ${frac(clean)}`,
    pval(p).padStart(7),
    `${pct(ids)} ${frac(ids)}`,
  ].join('  ');
}

async function main(): Promise<void> {
  const header = [
    'run'.padEnd(34),
    'failed | flagged'.padEnd(16),
    'failed | no flag'.padEnd(16),
    'Fisher p',
    'failed | ID flag',
  ].join('  ');
  const lines = [
    'tool-truth flags vs task outcome on τ²-bench (rules frozen)',
    '',
    'Each cell: share of conversations that failed the task (reward 0), and failed/total.',
    '',
    header,
  ];
  const all: Conv[] = [];
  const short: Conv[] = [];
  const long: Conv[] = [];
  const byRun: Conv[][] = [];
  const byRunAndLength: Conv[][] = [];
  let higher = 0;
  let lower = 0;
  for (const [model, domain, setting] of RUNS) {
    const file = `${model}_${domain}_${setting}_gpt-4.1-2025-04-14_4trials.json`;
    const data = JSON.parse(await fetchCached(BASE + file, join(TAU2_CACHE, file))) as Tau2File;
    const convs: Conv[] = data.simulations.map((sim) => {
      const verdicts = checkTurns(fromTau2(data.info.environment_info.policy, sim.messages));
      return {
        failed: (sim as { reward_info?: { reward?: number } }).reward_info?.reward !== 1,
        flagged: verdicts.some((v) => !v.honest),
        idFlagged: verdicts.some((v) => idFlags(v).length > 0),
        turns: verdicts.length,
      };
    });
    lines.push(row(`${model.split('-2025')[0]} ${domain}`, convs));
    all.push(...convs);
    // Split each run at its own median length, so the halves compare like with like.
    const sorted = [...convs].sort((x, y) => x.turns - y.turns);
    const median = sorted[Math.floor(sorted.length / 2)]?.turns ?? 0;
    for (const c of convs) (c.turns < median ? short : long).push(c);
    byRun.push(convs);
    byRunAndLength.push(convs.filter((c) => c.turns < median), convs.filter((c) => c.turns >= median));
    const [ff, fn] = tally(convs, (c) => c.flagged);
    const [cf, cn] = tally(convs, (c) => !c.flagged);
    if (fn && cn) {
      if (ff / fn > cf / cn) higher += 1;
      else if (ff / fn < cf / cn) lower += 1;
    }
  }
  const mhRun = mantelHaenszel(byRun);
  const mhBoth = mantelHaenszel(byRunAndLength);
  const idAll = tally(all, (c) => c.idFlagged);
  const notId = tally(all, (c) => !c.idFlagged);
  const idP = fisher(idAll[0], idAll[1] - idAll[0], notId[0], notId[1] - notId[0]);
  lines.push(
    '',
    row('all runs pooled', all),
    row('  shorter half of each run', short),
    row('  longer half of each run', long),
    '',
    `Runs where flagged conversations failed more often: ${higher}; less often: ${lower}.`,
    `Compared within each run (Mantel-Haenszel): odds ratio ${mhRun.or.toFixed(2)}, p ${pval(mhRun.p)}.`,
    `Within each run and length half: odds ratio ${mhBoth.or.toFixed(2)}, p ${pval(mhBoth.p)}.`,
    `Invented-ID flags: ${idAll[0]}/${idAll[1]} of those conversations failed, vs ${notId[0]}/${notId[1]} of the rest (Fisher p ${pval(idP)}).`,
  );
  const out = lines.join('\n') + '\n';
  process.stdout.write(out);
  if (process.argv.includes('--write')) writeFileSync(join('study', 'flags-vs-outcome.txt'), out);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void main();
