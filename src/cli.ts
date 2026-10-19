#!/usr/bin/env node
import { readFileSync } from 'node:fs';

import { toTranscript } from './adapters.js';
import { checkTranscript } from './check.js';
import { formatScorecard, score } from './score.js';

/**
 *   tool-truth score            run the labeled corpus and print precision/recall
 *   tool-truth check <file>     check one transcript and print the verdict. The file can be
 *                               tool-truth's own { steps } shape, or an OpenAI or Anthropic
 *                               message log; the format is detected automatically.
 */
function main(): void {
  const [cmd, file] = process.argv.slice(2);
  if (cmd === 'check' && file) {
    const v = checkTranscript(toTranscript(JSON.parse(readFileSync(file, 'utf8'))));
    process.stdout.write(JSON.stringify(v, null, 2) + '\n');
    process.exitCode = v.honest ? 0 : 1;
    return;
  }
  process.stdout.write(formatScorecard(score()) + '\n');
}

main();
