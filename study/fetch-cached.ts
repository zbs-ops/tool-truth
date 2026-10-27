/**
 * Download a study's source data once and keep it in a local cache. An error response is an
 * error: it is thrown and never written to the cache, so a bad URL can't poison later runs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export async function fetchCached(url: string, path: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (existsSync(path)) return readFileSync(path, 'utf8');
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status} ${res.statusText}`.trim());
  const text = await res.text();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return text;
}

// The published studies read these exact commits of the τ-bench repos, so their numbers can be
// reproduced after the upstream data changes. Each commit gets its own cache folder.
export const TAU_BENCH_COMMIT = '59a200c6d575d595120f1cb70fea53cef0632f6b';
export const TAU2_BENCH_COMMIT = '0c69df456a96aa76a1162591574dad9c427a34d7';
const home = process.env.HOME ?? '.';
export const TAU_CACHE = join(home, '.cache', 'tool-truth-tau', TAU_BENCH_COMMIT);
export const TAU2_CACHE = join(home, '.cache', 'tool-truth-tau2', TAU2_BENCH_COMMIT);
