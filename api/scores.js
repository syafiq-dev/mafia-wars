// Online leaderboard (Vercel function).
//   GET  /api/scores               -> { top: [{ name, score }, ...] }  (best 10)
//   POST /api/scores {name, score} -> { rank }                          (keeps each name's best)
// Storage: Upstash Redis, added free from the Vercel Marketplace, which sets these env vars.
const DB_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const DB_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const BOARD = 'mafia-wars:leaderboard'; // prefixed so it can share Sushi Terbang's Upstash database
const MAX_SCORE = 9999;
const SUBMITS_PER_MINUTE = 10;

export function cleanName(value) {
  if (typeof value !== 'string') return null;
  return value.replace(/[^A-Za-z0-9 _-]/g, '').trim().slice(0, 12) || null;
}

// shortcut: anyone who reads this code can still post a fake score; add a signed run token if cheating shows up.
export function cleanScore(value) {
  return Number.isInteger(value) && value > 0 && value <= MAX_SCORE ? value : null;
}

async function redis(...commands) {
  const res = await fetch(`${DB_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${DB_TOKEN}` },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
  return (await res.json()).map((r) => {
    if (r.error) throw new Error(r.error);
    return r.result;
  });
}

const reply = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const notSetUp = () => reply({ error: 'Leaderboard database is not connected yet' }, 503);

export async function GET() {
  if (!DB_URL || !DB_TOKEN) return notSetUp();
  const [flat] = await redis(['ZRANGE', BOARD, '0', '9', 'REV', 'WITHSCORES']);
  const top = [];
  for (let i = 0; i < flat.length; i += 2) top.push({ name: flat[i], score: Number(flat[i + 1]) });
  return reply({ top });
}

export async function POST(request) {
  if (!DB_URL || !DB_TOKEN) return notSetUp();

  let body;
  try { body = await request.json(); } catch { return reply({ error: 'Send JSON: {"name": "...", "score": 12}' }, 400); }
  const name = cleanName(body?.name);
  const score = cleanScore(body?.score);
  if (!name || !score) return reply({ error: 'Name must be 1-12 letters or numbers, score 1-9999' }, 400);

  // Vercel sets x-forwarded-for itself, so the first entry is the real client IP.
  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  const [hits] = await redis(['INCR', `rate:${ip}`], ['EXPIRE', `rate:${ip}`, '60', 'NX']);
  if (hits > SUBMITS_PER_MINUTE) return reply({ error: 'Too many scores sent. Try again in a minute.' }, 429);

  // GT: only replaces the stored score when the new one is higher.
  const [, rank] = await redis(['ZADD', BOARD, 'GT', String(score), name], ['ZREVRANK', BOARD, name]);
  return reply({ rank: rank + 1 });
}
