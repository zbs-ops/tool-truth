import { describe, expect, it } from 'vitest';

import { extractValues } from '../src/values.js';

/**
 * "8.7GB" used to yield "8.7" and a stray "8". The plain-number pattern matched "8.7", found
 * the letter G after it, and backtracked: without the optional ".7" it matched "8", which is
 * followed by "." and so passed. The stray value was harmless (8 is inside the evidence's 8.7)
 * but it wasn't a value the agent stated, and it made every glued decimal count twice.
 */
describe('a decimal is never cut short to its whole-number part', () => {
  it.each([
    ['you have used 8.7GB', ['8.7']],
    ['it took 12.5ms', ['12.5']],
    ['a 2.5TB disk', ['2.5']],
  ])('%s', (text, expected) => {
    expect(extractValues(text)).toEqual(expected);
  });

  it.each([
    ['the total is 8.', '8'],
    ['costs $12.50 today', '12.5'],
    ['ratio 8.7 to 1', '8.7'],
    ['pi is 3.14.', '3.14'],
  ])('ordinary numbers are unchanged: %s', (text, value) => {
    expect(extractValues(text)).toContain(value);
  });
});
