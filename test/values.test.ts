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

  it('does not read date parts as stray numbers, but keeps an ID’s long numeric part', () => {
    // People say "Gift Card 7091239" for gift_card_7091239, so a separated ID's long
    // numeric part is extracted too. A date's day never shows up as a bare number.
    const v = extractValues('Order ORD-48213 on 2026-10-22');
    expect(v).toContain('48213');
    expect(v).not.toContain('22');
  });

  it('normalizes times across formats', () => {
    expect(extractValues('Departs 09:00 AM, lands 01:00 PM')).toEqual(['9:00', '13:00']);
    expect(extractValues('09:00:00 to 13:00:00')).toEqual(['9:00', '13:00']);
    expect(extractValues('between 8am and 9pm')).toEqual(['8:00', '21:00']);
  });

  it('normalizes written-out dates to the same tokens as ISO dates', () => {
    const iso = extractValues('2024-05-19');
    expect(extractValues('May 19, 2024')).toEqual(expect.arrayContaining(iso));
    expect(extractValues('on May 19th')).toEqual(['05-19']);
    expect(extractValues('created 2024-05-07T21:53:00')).toContain('2024-05-07');
  });

  it('does not mistake a day ending a sentence for a list number', () => {
    expect(extractValues('a nonstop flight on May 21. 3. Modify the booking')).toEqual(['05-21']);
  });

  it('ignores markdown list numbers and reads counts like 500-piece as numbers', () => {
    expect(extractValues('1. **Kettle** 4. **Fan**')).toEqual([]);
    expect(extractValues('a 500-piece puzzle')).toEqual(['500']);
  });

  it('drops punctuation inside quotes and two-letter quotes', () => {
    expect(extractValues('status is "return requested."')).toEqual(['return requested']);
    expect(extractValues('say "no" to stop')).toEqual([]);
  });

  it('takes letter-digit codes whole instead of pulling numbers out of them', () => {
    expect(extractValues('reservation M20IZO on flight HAT266')).toEqual(['M20IZO', 'HAT266']);
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
