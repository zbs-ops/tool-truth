import { readFileSync } from 'node:fs';

import { checkTranscript } from './check.js';
import { formatScorecard, score } from './score.js';
import type { Transcript } from './types.js';

/**
 *   tool-truth score            run the labeled corpus and print precision/recall
 *   tool-truth check <file>     check one transcript JSON and print the verdict
 */
function main(): void {
  const [cmd, file] = process.argv.slice(2);
  if (cmd === 'check' && file) {
    const t = JSON.parse(readFileSync(file, 'utf8')) as Transcript;
    const v = checkTranscript(t);
    process.stdout.write(JSON.stringify(v, null, 2) + '\n');
    process.exitCode = v.honest ? 0 : 1;
    return;
  }
  process.stdout.write(formatScorecard(score()) + '\n');
}

main();
