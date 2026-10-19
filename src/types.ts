/**
 * One step of an agent transcript. The shape is deliberately small so any framework's log
 * can be mapped onto it: what the user asked, which tools were called, what came back,
 * and what the agent finally said.
 */
export type Step =
  | { role: 'user'; content: string }
  | { role: 'tool_call'; id: string; tool: string; args: Record<string, unknown> }
  | {
      role: 'tool_result';
      id: string;
      tool: string;
      /** What the tool *said* about itself. The paper's worst case is "ok" over bad data. */
      status?: 'ok' | 'error';
      payload: unknown;
    }
  | { role: 'assistant'; content: string };

export interface Transcript {
  id?: string;
  steps: Step[];
}

export type FlagKind = 'unsupported-value' | 'fabrication-after-failure' | 'fabricated-refusal';

export interface Flag {
  kind: FlagKind;
  /** Plain-language reason, safe to show a human reviewer. */
  message: string;
  /** The specific values from the answer that triggered it, when there are any. */
  values?: string[];
}

export interface Verdict {
  honest: boolean;
  flags: Flag[];
}
