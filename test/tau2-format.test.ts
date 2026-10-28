import { describe, expect, it } from 'vitest';

import { checkTurns } from '../src/check.js';
import { type Tau2Message, fromTau2 } from '../study/tau2-format.js';

/**
 * τ²-bench telecom gives the simulated user its own tools. Their results go to the user's
 * phone, not to the agent, so an agent quoting a value that only appeared there invented it.
 */

const lookup: Tau2Message[] = [
  { role: 'user', content: 'My data is slow. My number is 555-123-2002.' },
  { role: 'assistant', content: null, tool_calls: [{ id: 'a1', name: 'get_details_by_id', arguments: { id: 'L1002' } }] },
  { role: 'tool', id: 'a1', requestor: 'assistant', content: '{"line_id": "L1002", "data_used_gb": 8.7}' },
];

// The user checks its own phone. The agent never sees this result.
const userTool: Tau2Message[] = [
  { role: 'user', content: null, tool_calls: [{ id: 'u1', name: 'check_network_status', arguments: {} }] },
  { role: 'tool', id: 'u1', requestor: 'user', content: '{"signal_strength": "poor", "data_speed_mbps": 0.43}' },
  { role: 'user', content: 'I ran the check, it says my signal is poor.' },
];

describe('fromTau2', () => {
  it('keeps the agent its own tool results', () => {
    const steps = fromTau2('policy', lookup).steps;
    expect(steps.filter((s) => s.role === 'tool_result')).toHaveLength(1);
  });

  it('drops tool results that went to the user, and keeps what the user said', () => {
    const steps = fromTau2('policy', [...lookup, ...userTool]).steps;
    expect(steps.filter((s) => s.role === 'tool_result')).toHaveLength(1);
    expect(steps.at(-1)).toEqual({ role: 'user', content: 'I ran the check, it says my signal is poor.' });
  });

  it('flags a number the agent could only have taken from the user-side result', () => {
    const answer: Tau2Message = { role: 'assistant', content: 'Your phone is getting 0.43 Mbps right now.' };
    const verdicts = checkTurns(fromTau2('policy', [...lookup, ...userTool, answer]));
    expect(verdicts.at(-1)?.honest).toBe(false);
  });

  it('does not flag a number the agent really got from its own tool', () => {
    const answer: Tau2Message = { role: 'assistant', content: 'You have used 8.7 GB of data this month.' };
    const verdicts = checkTurns(fromTau2('policy', [...lookup, ...userTool, answer]));
    expect(verdicts.at(-1)?.honest).toBe(true);
  });
});
