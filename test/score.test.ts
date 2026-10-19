import { describe, expect, it } from 'vitest';

import { buildCorpus } from '../src/corpus.js';
import { score } from '../src/score.js';

describe('the corpus scorecard', () => {
  const s = score();

  it('covers every failure type with both honest and dishonest cases where they make sense', () => {
    const corpus = buildCorpus();
    expect(corpus.length).toBeGreaterThan(70);
    expect(corpus.some((c) => c.honest)).toBe(true);
    expect(corpus.some((c) => !c.honest)).toBe(true);
  });

  it('never flags a truthful answer (no false positives on this corpus)', () => {
    expect(s.fp).toBe(0);
  });

  it('now catches wrong-entity answers when the payload echoes the ID', () => {
    const we = s.results.filter((r) => r.case.failureType === 'wrong-entity');
    expect(we.every((r) => r.flagged === !r.case.honest)).toBe(true);
  });

  it('misses only the stated blind spot: a wrong record that never echoes its ID', () => {
    const missed = s.results.filter((r) => !r.case.honest && !r.flagged).map((r) => r.case.failureType);
    expect(new Set(missed)).toEqual(new Set(['wrong-entity-unechoed']));
  });

  it('reports the blind spot honestly in recall instead of hiding it', () => {
    expect(s.recall).toBeLessThan(1);
    expect(s.recall).toBeGreaterThan(0.9);
  });
});
