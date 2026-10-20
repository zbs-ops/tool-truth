import type { Step, Transcript } from './types.js';

/**
 * Map real agent logs onto tool-truth's transcript shape, so you can point the checker at
 * what your agent actually produced. Two formats are supported: OpenAI chat messages
 * (tool_calls / role "tool") and Anthropic messages (tool_use / tool_result blocks).
 */

type Json = Record<string, unknown>;

/** Tool outputs usually arrive as strings; JSON is parsed so its fields can be checked. */
function parsePayload(content: unknown): unknown {
  if (typeof content !== 'string') return content;
  const s = content.trim();
  if (!(s.startsWith('{') || s.startsWith('['))) return content;
  try {
    return JSON.parse(s);
  } catch {
    return content;
  }
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const v = JSON.parse(raw);
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Some models write their tool calls into the message text as well, e.g. Claude's XML
 * `<function_calls><invoke name="...">...</invoke></function_calls>`. That's an action, not a
 * statement to the user, and the structured call is already captured from `tool_calls`, so
 * the markup is removed before the text is checked. Found when the held-out τ-bench run
 * flagged tool names like "get_user_details" as invented claims.
 */
export function stripToolMarkup(text: string): string {
  // Tags may carry a namespace prefix (`<ns:invoke ...>`), so it's matched optionally.
  const tag = (name: string) => new RegExp(`<(?:[\\w-]+:)?${name}\\b[\\s\\S]*?(</(?:[\\w-]+:)?${name}>|$)`, 'g');
  return text.replace(tag('function_calls'), ' ').replace(tag('invoke'), ' ').replace(tag('tool_call'), ' ');
}

/** OpenAI chat-completions messages. */
export function fromOpenAI(messages: Json[]): Transcript {
  const steps: Step[] = [];
  const toolNames = new Map<string, string>();
  for (const m of messages) {
    const role = m.role;
    if ((role === 'system' || role === 'developer') && typeof m.content === 'string') {
      steps.push({ role: 'system', content: m.content });
    } else if (role === 'user' && typeof m.content === 'string') {
      steps.push({ role: 'user', content: m.content });
    } else if (role === 'assistant') {
      const calls = Array.isArray(m.tool_calls) ? (m.tool_calls as Json[]) : [];
      for (const c of calls) {
        const fn = (c.function ?? {}) as Json;
        const id = String(c.id ?? '');
        const tool = String(fn.name ?? 'unknown');
        toolNames.set(id, tool);
        steps.push({ role: 'tool_call', id, tool, args: parseArgs(fn.arguments) });
      }
      const said = typeof m.content === 'string' ? stripToolMarkup(m.content) : '';
      if (said.trim() !== '') {
        steps.push({ role: 'assistant', content: said });
      }
    } else if (role === 'tool') {
      const id = String(m.tool_call_id ?? '');
      steps.push({ role: 'tool_result', id, tool: toolNames.get(id) ?? 'unknown', payload: parsePayload(m.content) });
    }
  }
  return { steps };
}

/** Anthropic messages API, with content as a string or as blocks. */
export function fromAnthropic(messages: Json[]): Transcript {
  const steps: Step[] = [];
  const toolNames = new Map<string, string>();
  for (const m of messages) {
    const blocks: Json[] =
      typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : Array.isArray(m.content) ? (m.content as Json[]) : [];
    if (m.role === 'user') {
      for (const b of blocks) {
        if (b.type === 'text' && typeof b.text === 'string') steps.push({ role: 'user', content: b.text });
        if (b.type === 'tool_result') {
          const id = String(b.tool_use_id ?? '');
          const content = Array.isArray(b.content)
            ? (b.content as Json[]).map((x) => (typeof x.text === 'string' ? x.text : '')).join('')
            : b.content;
          steps.push({
            role: 'tool_result',
            id,
            tool: toolNames.get(id) ?? 'unknown',
            status: b.is_error === true ? 'error' : 'ok',
            payload: parsePayload(content),
          });
        }
      }
    } else if (m.role === 'assistant') {
      for (const b of blocks) {
        if (b.type === 'tool_use') {
          const id = String(b.id ?? '');
          const tool = String(b.name ?? 'unknown');
          toolNames.set(id, tool);
          steps.push({ role: 'tool_call', id, tool, args: parseArgs(b.input) });
        } else if (b.type === 'text' && typeof b.text === 'string' && b.text.trim() !== '') {
          steps.push({ role: 'assistant', content: b.text });
        }
      }
    }
  }
  return { steps };
}

/**
 * Accept any of the three shapes: tool-truth's own `{ steps }`, an OpenAI message array, or
 * an Anthropic message array. Detection looks for each format's tell-tale fields.
 */
export function toTranscript(input: unknown): Transcript {
  if (input && typeof input === 'object' && !Array.isArray(input) && Array.isArray((input as Json).steps)) {
    return input as Transcript;
  }
  const messages = Array.isArray(input)
    ? (input as Json[])
    : input && typeof input === 'object' && Array.isArray((input as Json).messages)
      ? ((input as Json).messages as Json[])
      : [];
  const looksAnthropic = messages.some(
    (m) => Array.isArray(m.content) && (m.content as Json[]).some((b) => b.type === 'tool_use' || b.type === 'tool_result'),
  );
  return looksAnthropic ? fromAnthropic(messages) : fromOpenAI(messages);
}
