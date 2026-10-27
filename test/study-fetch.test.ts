import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fetchCached } from '../study/fetch-cached.js';

/**
 * The τ²-bench study used to write whatever the server answered into its cache, so a wrong
 * file name cached the text "404: Not Found" and every later run failed to parse it until
 * someone deleted the file by hand.
 */

const fakeFetch = (status: number, body: string) =>
  (async () => new Response(body, { status })) as unknown as typeof fetch;

describe('fetchCached', () => {
  it('downloads once and serves the cached copy after that', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'tt-')), 'a', 'data.json');
    expect(await fetchCached('https://x/data.json', path, fakeFetch(200, '[1]'))).toBe('[1]');
    expect(readFileSync(path, 'utf8')).toBe('[1]');
    expect(await fetchCached('https://x/data.json', path, fakeFetch(500, 'should not be fetched'))).toBe('[1]');
  });

  it('fails on an error response and caches nothing', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'tt-')), 'data.json');
    await expect(fetchCached('https://x/missing.json', path, fakeFetch(404, '404: Not Found'))).rejects.toThrow(/404/);
    expect(existsSync(path)).toBe(false);
  });
});
