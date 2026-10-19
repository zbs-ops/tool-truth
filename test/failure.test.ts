import { describe, expect, it } from 'vitest';

import { acknowledgesFailure, classifyResult } from '../src/failure.js';

describe('classifyResult never trusts "ok" on its own', () => {
  it.each([
    ['explicit error status', 'error' as const, { message: 'down' }, 'error'],
    ['ok with an error field', 'ok' as const, { error: 'rate limit' }, 'error'],
    ['ok with empty object', 'ok' as const, {}, 'empty'],
    ['ok with null', 'ok' as const, null, 'empty'],
    ['ok with all-null fields', 'ok' as const, { a: null, b: null }, 'degraded'],
    ['ok with placeholders', 'ok' as const, { a: 'N/A', b: 'unknown' }, 'degraded'],
    ['ok with timeout text', 'ok' as const, 'timed out after 30s', 'error'],
    ['ok with real data', 'ok' as const, { eta: '2026-10-22', carrier: 'UPS' }, 'usable'],
    ['ok with some real data', 'ok' as const, { eta: null, carrier: 'UPS' }, 'usable'],
  ])('%s', (_label, status, payload, expected) => expect(classifyResult(status, payload)).toBe(expected));
});

describe('acknowledgesFailure', () => {
  it('recognizes an admission', () => {
    expect(acknowledgesFailure("I couldn't get the status — the lookup failed.")).toBe(true);
  });
  it('does not mistake a confident answer for one', () => {
    expect(acknowledgesFailure('It arrives on 2026-10-24.')).toBe(false);
  });
});
