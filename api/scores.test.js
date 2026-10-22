import { test } from 'node:test';
import assert from 'node:assert/strict';

// Fake Upstash: a tiny in-memory sorted set and counter, enough for the commands the API uses.
process.env.KV_REST_API_URL = 'https://fake.upstash';
process.env.KV_REST_API_TOKEN = 'token';
const board = new Map();
const counters = new Map();
globalThis.fetch = async (_url, init) => {
  const results = JSON.parse(init.body).map(([cmd, ...a]) => {
    if (cmd === 'INCR') return { result: counters.set(a[0], (counters.get(a[0]) ?? 0) + 1).get(a[0]) };
    if (cmd === 'EXPIRE') return { result: 1 };
    if (cmd === 'ZADD') { const [, , s, m] = a; /* key, GT, score, member */ if (!(board.get(m) >= +s)) board.set(m, +s); return { result: 1 }; }
    const sorted = [...board].sort((x, y) => y[1] - x[1]);
    if (cmd === 'ZREVRANK') return { result: sorted.findIndex(([m]) => m === a[1]) };
    if (cmd === 'ZRANGE') return { result: sorted.slice(0, 10).flatMap(([m, s]) => [m, String(s)]) };
    return { error: `unknown ${cmd}` };
  });
  return new Response(JSON.stringify(results));
};

const { GET, POST, cleanName, cleanScore } = await import('./scores.js');
const post = (body, ip = '1.1.1.1') =>
  POST(new Request('https://x/api/scores', { method: 'POST', body: JSON.stringify(body), headers: { 'x-forwarded-for': ip } }));

test('validation', () => {
  assert.equal(cleanName('  Syafiq<script>  '), 'Syafiqscript');
  assert.equal(cleanName('a-very-long-name-here'), 'a-very-long-');
  assert.equal(cleanName('<>'), null);
  assert.equal(cleanScore(12), 12);
  for (const bad of [0, -1, 1.5, '12', 10000]) assert.equal(cleanScore(bad), null);
});

test('keeps each name\'s best and ranks', async () => {
  assert.deepEqual(await (await post({ name: 'ali', score: 5 })).json(), { rank: 1 });
  assert.deepEqual(await (await post({ name: 'syafiq', score: 9 })).json(), { rank: 1 });
  assert.deepEqual(await (await post({ name: 'syafiq', score: 3 })).json(), { rank: 1 }); // lower score ignored
  assert.deepEqual(await (await GET()).json(), { top: [{ name: 'syafiq', score: 9 }, { name: 'ali', score: 5 }] });
});

test('rejects junk and floods', async () => {
  assert.equal((await post({ name: 'x', score: 99999 })).status, 400);
  for (let i = 0; i < 10; i++) await post({ name: 'spam', score: 1 }, '9.9.9.9');
  assert.equal((await post({ name: 'spam', score: 1 }, '9.9.9.9')).status, 429);
});
