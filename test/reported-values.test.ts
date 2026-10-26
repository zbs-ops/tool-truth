import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { toTranscript } from '../src/adapters.js';
import { checkTranscript } from '../src/check.js';
import type { Transcript } from '../src/types.js';
import { reportedValues } from '../src/values.js';

/**
 * A date is matched as three tokens (2026-10-24, 10-24 and 2026) so "October 24" in an answer
 * can meet an ISO date in a payload. Flags used to report all three, so one invented date
 * showed up as three invented values. A flag now reports the date once.
 */

const ask = (payload: unknown, answer: string): Transcript => ({
  steps: [
    { role: 'user', content: 'When does order ORD-48213 arrive?' },
    { role: 'tool_call', id: 'c1', tool: 'orders.lookup', args: { order_id: 'ORD-48213' } },
    { role: 'tool_result', id: 'c1', tool: 'orders.lookup', status: 'ok', payload },
    { role: 'assistant', content: answer },
  ],
});

describe('reportedValues', () => {
  it('drops the year and month-day that are only parts of a full date in the list', () => {
    expect(reportedValues(['10-24', '2026-10-24', '2026'])).toEqual(['2026-10-24']);
  });

  it('keeps a part that belongs to no full date in the list', () => {
    expect(reportedValues(['10-24', '2025', '2026-10-24'])).toEqual(['2025', '2026-10-24']);
    expect(reportedValues(['05-19'])).toEqual(['05-19']);
  });

  it('keeps everything else, in order', () => {
    expect(reportedValues(['ORD-1', '2310.4', '9:00'])).toEqual(['ORD-1', '2310.4', '9:00']);
  });
});

describe('flags report a date once', () => {
  it('after a failure', () => {
    const v = checkTranscript(ask({ eta: null }, 'It arrives on 2026-10-24.'));
    expect(v.flags[0]?.values).toEqual(['2026-10-24']);
  });

  it('for a value no tool returned, written out in words', () => {
    const v = checkTranscript(ask({ eta: '2026-10-22' }, 'It arrives October 24, 2026.'));
    expect(v.flags[0]?.kind).toBe('unsupported-value');
    expect(v.flags[0]?.values).toEqual(['2026-10-24']);
  });

  it('still reports the part that really is unsupported', () => {
    // The year came back from the tool; the day didn't.
    const v = checkTranscript(ask({ eta: '2026-10-22', year: 2026 }, 'It arrives October 24, 2026.'));
    expect(v.flags[0]?.values).toEqual(['2026-10-24']);
  });

  it('does not change which transcripts are flagged', () => {
    expect(checkTranscript(ask({ eta: '2026-10-24' }, 'It arrives October 24, 2026.')).honest).toBe(true);
  });
});

describe('the README shows what the CLI really prints', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const check = (file: string) =>
    checkTranscript(toTranscript(JSON.parse(readFileSync(new URL(`../examples/${file}`, import.meta.url), 'utf8'))));

  it('for the headline example', () => {
    const block = readme.match(/\$ npx tsx src\/cli\.ts check examples\/ok-but-empty\.json\n([\s\S]*?)\n```/);
    expect(block).not.toBeNull();
    expect(JSON.parse(block![1]!)).toEqual(check('ok-but-empty.json'));
  });

  it.each(['openai-log.json', 'anthropic-log.json'])('for %s', (file) => {
    const line = readme.match(new RegExp(`check examples/${file.replace('.', '\\.')}\\s+# ([\\w-]+): (.+)`));
    expect(line).not.toBeNull();
    const flag = check(file).flags[0];
    expect(flag?.kind).toBe(line![1]);
    expect(flag?.values?.join(', ')).toBe(line![2]!.trim());
  });
});
