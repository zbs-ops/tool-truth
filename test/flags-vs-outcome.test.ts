import { describe, expect, it } from 'vitest';

import { type Conv, fisher, mantelHaenszel } from '../study/flags-vs-outcome.js';

/** a flagged+failed, b flagged+passed, c clean+failed, d clean+passed. */
function stratum(a: number, b: number, c: number, d: number): Conv[] {
  const make = (n: number, flagged: boolean, failed: boolean) =>
    Array.from({ length: n }, () => ({ flagged, failed, idFlagged: false, turns: 1 }));
  return [...make(a, true, true), ...make(b, true, false), ...make(c, false, true), ...make(d, false, false)];
}

describe("the outcome study's statistics", () => {
  it("Fisher's exact test matches textbook values", () => {
    // Wikipedia's worked example: p = 0.002759 (two-sided).
    expect(fisher(1, 9, 11, 3)).toBeCloseTo(0.002759, 5);
    // A symmetric 2x2: p = 0.4857.
    expect(fisher(3, 1, 1, 3)).toBeCloseTo(0.4857, 4);
    expect(fisher(5, 5, 5, 5)).toBeCloseTo(1, 9);
  });

  it('Mantel-Haenszel with one stratum gives that stratum\'s odds ratio', () => {
    expect(mantelHaenszel([stratum(20, 10, 10, 20)]).or).toBeCloseTo(4, 9);
  });

  it('separates a mixing effect from a real one', () => {
    // Each stratum alone: flags make no difference (odds ratio 1). Pooled, they would look
    // predictive, because the flag-heavy stratum is also the one that fails more.
    const easy = stratum(1, 9, 10, 90);
    const hard = stratum(80, 20, 8, 2);
    const mh = mantelHaenszel([easy, hard]);
    expect(mh.or).toBeCloseTo(1, 9);
    expect(mh.p).toBeGreaterThan(0.5);
    const pooled = [...easy, ...hard];
    const failRate = (pick: (c: Conv) => boolean) => pooled.filter((c) => pick(c) && c.failed).length / pooled.filter(pick).length;
    expect(failRate((c) => c.flagged)).toBeGreaterThan(failRate((c) => !c.flagged) + 0.5);
  });

  it('compares one kind of flag with unflagged conversations only', () => {
    // 20 conversations flagged for kind A (15 failed), 20 flagged only for kind B (all failed),
    // 40 unflagged (10 failed). Kind A against the unflagged: odds ratio (15*30)/(5*10) = 9.
    // Leaving the kind-B conversations in the comparison group would change it.
    const withKind = (n: number, failed: boolean, kinds: string[]): Conv[] =>
      Array.from({ length: n }, () => ({ flagged: kinds.length > 0, failed, idFlagged: false, turns: 1, kinds }));
    const s = [
      ...withKind(15, true, ['a']),
      ...withKind(5, false, ['a']),
      ...withKind(20, true, ['b']),
      ...withKind(10, true, []),
      ...withKind(30, false, []),
    ];
    const hasA = (c: Conv) => (c.kinds ?? []).includes('a');
    expect(mantelHaenszel([s], hasA, (c) => hasA(c) || !c.flagged).or).toBeCloseTo(9, 9);
    expect(mantelHaenszel([s], hasA).or).not.toBeCloseTo(9, 1);
  });

  it('keeps the default comparison unchanged: any flag vs none', () => {
    const s = stratum(20, 10, 10, 20);
    expect(mantelHaenszel([s], (c) => c.flagged, () => true)).toEqual(mantelHaenszel([s]));
  });
});
