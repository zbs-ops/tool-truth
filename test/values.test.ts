import { describe, expect, it } from 'vitest';

import { extractValues, normalizeNumber, payloadValues } from '../src/values.js';

describe('extractValues', () => {
  it('finds dates, IDs, money, and decimals', () => {
    const v = extractValues('Order ORD-48213 arrives 2026-10-22; balance is $1,842.55 and it is 31.4°C.');
    expect(v).toEqual(expect.arrayContaining(['ORD-48213', '2026-10-22', '1842.55', '31.4']));
  });

  it('ignores small counting numbers in prose', () => {
    expect(extractValues('There are 2 options and step 1 is easy.')).toEqual([]);
  });

  it('does not double-count digits that belong to a date or ID', () => {
    const v = extractValues('Order ORD-48213 on 2026-10-22');
    expect(v).not.toContain('48213');
    expect(v).not.toContain('2026');
  });
});

describe('normalizeNumber', () => {
  it.each([
    ['$1,842.55', '1842.55'],
    ['45.3%', '45.3'],
    ['1,024', '1024'],
  ])('%s → %s', (raw, n) => expect(normalizeNumber(raw)).toBe(n));
});

describe('payloadValues', () => {
  it('collects every scalar, normalized, so prose formatting still matches', () => {
    const s = payloadValues({ balance: 1842.55, nested: { eta: '2026-10-22' }, list: ['UPS'] });
    expect(s.has('1842.55')).toBe(true);
    expect(s.has('2026-10-22')).toBe(true);
    expect(s.has('UPS')).toBe(true);
  });
});
