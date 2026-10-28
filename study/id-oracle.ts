/**
 * An independent check on the ID view, for τ²-bench retail and telecom. Retail order IDs are
 * `#W` + 7 digits and item IDs are 10 digits; telecom's customer, line, plan, device and bill
 * IDs are one letter + 4 digits (C1001, L1002, P1002, D1001, B1234). So a plain scan can find
 * every one an agent states that never appeared earlier in what the agent saw (user, its own
 * tool results, its own tool calls; not the telecom user's private tool results).
 * It doesn't know about examples or confirmations, so its hits are candidates, not verdicts.
 *   npx tsx study/id-oracle.ts <tau2 retail file in the τ²-bench cache (see fetch-cached.ts)>
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TAU2_CACHE } from './fetch-cached.js';

interface Msg { role: string; content: string | null; tool_calls?: unknown; requestor?: string }
const file = process.argv[2] as string;
const telecom = file.includes('_telecom');
const ID = telecom ? /\b[CLPDB]\d{4}\b/g : /#?W\d{7}\b|(?<!\d)\d{10}(?!\d)/g;
const data = JSON.parse(readFileSync(join(TAU2_CACHE, file), 'utf8')) as {
  simulations: { task_id: string; trial: number; messages: Msg[] }[];
};

let turns = 0;
for (const sim of data.simulations) {
  sim.messages.forEach((m, i) => {
    if (m.role !== 'assistant' || typeof m.content !== 'string') return;
    const before = sim.messages.slice(0, i).filter((x) => !(x.role === 'tool' && x.requestor === 'user')).map((x) => (x.content ?? '') + JSON.stringify(x.tool_calls ?? '')).join('\n');
    const ids = [...new Set([...m.content.matchAll(ID)].map((x) => x[0].replace('#', '')))];
    const unseen = ids.filter((id) => !before.includes(id.replace(/^W/, '')));
    if (unseen.length === 0) return;
    turns += 1;
    const at = m.content.indexOf(unseen[0] as string);
    console.log(`task ${sim.task_id} trial ${sim.trial} msg ${i}: ${unseen.join(', ')}  …${m.content.slice(Math.max(0, at - 90), at + 30).replace(/\s+/g, ' ')}…`);
  });
}
console.log(`${turns} agent turns state ${telecom ? "a telecom" : "a retail"}-format ID that never appeared earlier`);
