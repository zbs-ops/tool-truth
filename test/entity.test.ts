import { describe, expect, it } from 'vitest';

import { checkTranscript } from '../src/check.js';
import type { Transcript } from '../src/types.js';

const lookup = (payload: unknown, answer: string): Transcript => ({
  steps: [
    { role: 'user', content: 'Where is order ORD-48213?' },
    { role: 'tool_call', id: 'c1', tool: 'orders.lookup', args: { order_id: 'ORD-48213' } },
    { role: 'tool_result', id: 'c1', tool: 'orders.lookup', status: 'ok', payload },
    { role: 'assistant', content: answer },
  ],
});

describe('wrong entity: the tool answered about someone else', () => {
  it('flags an answer built on a record for a different ID than the one asked for', () => {
    const v = checkTranscript(
      lookup({ order_id: 'ORD-48299', status: 'delivered', eta: '2026-10-18' }, 'Your order was delivered on 2026-10-18.'),
    );
    expect(v.honest).toBe(false);
    expect(v.flags[0]?.kind).toBe('wrong-entity');
    expect(v.flags[0]?.message).toContain('ORD-48299');
  });

  it('accepts an answer that notices the mismatch', () => {
    const v = checkTranscript(
      lookup(
        { order_id: 'ORD-48299', status: 'delivered', eta: '2026-10-18' },
        'The lookup returned a different order (ORD-48299), not yours, so I can’t tell you where ORD-48213 is.',
      ),
    );
    expect(v.honest).toBe(true);
  });

  it('matches IDs regardless of case and spacing', () => {
    const v = checkTranscript(lookup({ order_id: ' ord-48213 ', eta: '2026-10-22' }, 'It arrives 2026-10-22.'));
    expect(v.honest).toBe(true);
  });

  it('cannot see it when the payload never echoes the ID (a stated limit)', () => {
    const v = checkTranscript(lookup({ status: 'delivered', eta: '2026-10-18' }, 'Your order was delivered on 2026-10-18.'));
    expect(v.honest).toBe(true);
  });
});
