/**
 * Serverless funkcija (Vercel): poziva Claude sa ključem iz okruženja.
 * API ključ NIKAD ne ide u browser.
 */
import { buildPrompt, parseAnalysis, validateInput } from '../src/analysis';

const hits = new Map<string, number[]>();
const LIMIT = 5, WINDOW_MS = 60 * 60 * 1000; // 5 analiza po IP-u na sat

function rateLimited(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > LIMIT;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: 'Server nije podešen (ANTHROPIC_API_KEY)' }, { status: 500 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (rateLimited(ip)) return Response.json({ error: 'Previše zahteva — probaj ponovo za sat vremena.' }, { status: 429 });

  let body: { cv?: string; job?: string };
  try { body = await req.json(); } catch { return Response.json({ error: 'Neispravan zahtev' }, { status: 400 }); }
  const cv = String(body.cv || ''), job = String(body.job || '');
  const invalid = validateInput(cv, job);
  if (invalid) return Response.json({ error: invalid }, { status: 400 });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: buildPrompt(cv, job) }]
    })
  });
  if (!res.ok) return Response.json({ error: 'AI servis trenutno ne odgovara' }, { status: 502 });
  const data = await res.json();
  const text = (data.content || []).map((c: { text?: string }) => c.text || '').join('');
  try {
    return Response.json(parseAnalysis(text));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
