import { describe, expect, it } from 'vitest';

import { checkTurns } from '../src/check.js';
import type { Transcript } from '../src/types.js';
import { extractValues } from '../src/values.js';

/**
 * Two checker bugs found by reading round 5 and 6 telecom flags (study/RESULTS.md section 9).
 * Fixed on those files (the dev set), then tested once on a model's telecom run nobody had
 * looked at (section 10).
 */

describe('a number glued to a unit is a number, not a code', () => {
  // "15GB" used to be taken whole as a code like HAT266, so it never met the tool's
  // data_limit_gb: 15.0 and was flagged as invented. "8.7GB" yielded nothing at all.
  it.each([
    ['a 15GB monthly limit', '15'],
    ['you have used 8.7GB', '8.7'],
    ['a 512MB cache', '512'],
    ['a 250ms timeout', '250'],
    ['a 750ml bottle', '750'],
  ])('%s', (text, number) => {
    const values = extractValues(text);
    expect(values).toContain(number);
    expect(values.some((v) => /\d[A-Za-z]/.test(v))).toBe(false);
  });

  it('still takes real letter-digit codes whole', () => {
    expect(extractValues('order HAT266 and item M20IZO')).toEqual(expect.arrayContaining(['HAT266', 'M20IZO']));
    expect(extractValues('your 5G signal')).not.toContain('5');
  });

  it('grounds the restated plan limit against the tool result', () => {
    const t: Transcript = {
      steps: [
        { role: 'tool_call', id: 'c1', tool: 'get_details_by_id', args: { id: 'P1002' } },
        { role: 'tool_result', id: 'c1', tool: 'get_details_by_id', status: 'ok', payload: { plan_id: 'P1002', data_limit_gb: 15.0 } },
        { role: 'assistant', content: 'You are on the Premium Plan with a 15GB monthly data limit.' },
      ],
    };
    expect(checkTurns(t).at(-1)?.honest).toBe(true);
  });

  it('still flags a unit number nobody gave', () => {
    const t: Transcript = {
      steps: [
        { role: 'tool_call', id: 'c1', tool: 'get_details_by_id', args: { id: 'P1002' } },
        { role: 'tool_result', id: 'c1', tool: 'get_details_by_id', status: 'ok', payload: { plan_id: 'P1002', data_limit_gb: 15.0 } },
        { role: 'assistant', content: 'You are on the Premium Plan with a 40GB monthly data limit.' },
      ],
    };
    expect(checkTurns(t).at(-1)?.honest).toBe(false);
  });
});

describe('quotes are paired at word boundaries', () => {
  // A closing quote glued to a word ("SIM locked") followed later by an opening quote used to
  // pair across the gap, so the text between two quotes was flagged as a quoted value.
  it('does not read the text between two quotes as a value', () => {
    const text = 'Check for a message (such as "SIM missing" or "SIM locked"), or if it simply shows "No Signal."';
    const values = extractValues(text);
    expect(values).toEqual(expect.arrayContaining(['SIM locked', 'No Signal'])); // "SIM missing" follows "such as": an example, dropped by design
    expect(values.some((v) => v.includes('or if it simply shows'))).toBe(false);
  });

  it('still reads an ordinary quoted value', () => {
    expect(extractValues('the status is "return requested."')).toContain('return requested');
  });
});
