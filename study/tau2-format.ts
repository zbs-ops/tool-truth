/**
 * τ²-bench's published message format, mapped onto tool-truth transcripts.
 *
 * In the telecom domain the simulated USER has tools too (it toggles airplane mode, reads its
 * own phone's status). Those results go to the user, never to the agent, so they are not
 * evidence the agent could have quoted. They are dropped; what the user then SAYS about them
 * is kept, because the agent did see that.
 */
import type { Step, Transcript } from '../src/types.js';
import { stripToolMarkup } from '../src/adapters.js';

export interface Tau2Message {
  role: 'assistant' | 'user' | 'tool';
  content: string | null;
  id?: string;
  error?: boolean;
  requestor?: 'assistant' | 'user';
  tool_calls?: { id: string; name: string; arguments: Record<string, unknown> | string }[] | null;
}
export interface Tau2File {
  info: { environment_info: { policy: string } };
  simulations: { task_id: string; trial: number; messages: Tau2Message[] }[];
}

function parse(content: string | null): unknown {
  if (content === null) return null;
  const s = content.trim();
  if (s.startsWith('{') || s.startsWith('[')) {
    try {
      return JSON.parse(s);
    } catch {
      return content;
    }
  }
  return content;
}

/** τ²-bench's message format onto tool-truth steps. The domain policy is the agent's system context. */
export function fromTau2(policy: string, messages: Tau2Message[]): Transcript {
  const steps: Step[] = [{ role: 'system', content: policy }];
  const names = new Map<string, string>();
  for (const m of messages) {
    if (m.role === 'user' && m.content) steps.push({ role: 'user', content: m.content });
    else if (m.role === 'assistant') {
      for (const c of m.tool_calls ?? []) {
        names.set(c.id, c.name);
        const args = typeof c.arguments === 'string' ? (parse(c.arguments) as Record<string, unknown>) ?? {} : c.arguments;
        steps.push({ role: 'tool_call', id: c.id, tool: c.name, args });
      }
      const said = m.content ? stripToolMarkup(m.content) : '';
      if (said.trim()) steps.push({ role: 'assistant', content: said });
    } else if (m.role === 'tool' && m.requestor !== 'user') {
      const id = m.id ?? '';
      steps.push({ role: 'tool_result', id, tool: names.get(id) ?? 'unknown', status: m.error ? 'error' : 'ok', payload: parse(m.content) });
    }
  }
  return { steps };
}
