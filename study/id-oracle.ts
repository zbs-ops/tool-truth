/**
 * An independent check on the ID view, for τ²-bench retail only. Retail order IDs are `#W` +
 * 7 digits and item IDs are 10 digits, so a plain scan can find every one an agent states that
 * never appeared earlier in the conversation (user, tool, or the agent's own tool calls).
 * It doesn't know about examples or confirmations, so its hits are candidates, not verdicts.
 *   npx tsx study/id-oracle.ts <tau2 retail file in the τ²-bench cache (see fetch-cached.ts)>
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TAU2_CACHE } from './fetch-cached.js';

interface Msg { role: string; content: string | null; tool_calls?: unknown }
const file = process.argv[2] as string;
const data = JSON.parse(readFileSync(join(TAU2_CACHE, file), 'utf8')) as {
  simulations: { task_id: string; trial: number; messages: Msg[] }[];
};

let turns = 0;
for (const sim of data.simulations) {
  sim.messages.forEach((m, i) => {
    if (m.role !== 'assistant' || typeof m.content !== 'string') return;
    const before = sim.messages.slice(0, i).map((x) => (x.content ?? '') + JSON.stringify(x.tool_calls ?? '')).join('\n');
    const ids = [...new Set([...m.content.matchAll(/#?W\d{7}\b|(?<!\d)\d{10}(?!\d)/g)].map((x) => x[0].replace('#', '')))];
    const unseen = ids.filter((id) => !before.includes(id.replace(/^W/, '')));
    if (unseen.length === 0) return;
    turns += 1;
    const at = m.content.indexOf(unseen[0] as string);
    console.log(`task ${sim.task_id} trial ${sim.trial} msg ${i}: ${unseen.join(', ')}  …${m.content.slice(Math.max(0, at - 90), at + 30).replace(/\s+/g, ' ')}…`);
  });
}
console.log(`${turns} agent turns state a retail-format ID that never appeared earlier`);
