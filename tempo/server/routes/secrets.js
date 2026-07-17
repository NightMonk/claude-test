// Authenticated endpoints for pasting credentials into the app. Mounted behind
// requireAuth. Values are stored server-side only and never echoed back.
import { Router } from 'express';
import { setSecret, removeSecret, status } from '../secrets.js';

const router = Router();

// Quick liveness check of an Anthropic key: a 1-token message. 401 => bad key.
// Any other outcome (including network trouble) is treated as "couldn't verify"
// and we still save, so a transient blip never blocks the operator.
async function validateAnthropic(key) {
  try {
    const res = await fetch(`${(process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.AI_MODEL || 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'The key was rejected by Anthropic (401/403).' };
    return { ok: true, verified: res.ok };
  } catch {
    return { ok: true, verified: false }; // couldn't reach Anthropic; don't block save
  }
}

router.get('/status', (req, res) => res.json(status()));

router.patch('/', async (req, res) => {
  const b = req.body || {};
  const notes = [];
  try {
    if (typeof b.anthropic_api_key === 'string' && b.anthropic_api_key.trim()) {
      const check = await validateAnthropic(b.anthropic_api_key.trim());
      if (!check.ok) return res.status(400).json({ error: check.reason });
      setSecret('ANTHROPIC_API_KEY', b.anthropic_api_key);
      notes.push(check.verified ? 'AI key saved and verified ✓' : 'AI key saved (couldn’t reach Anthropic to verify, but it’s stored).');
    }
    if (typeof b.google_client_id === 'string' && b.google_client_id.trim()) {
      setSecret('GOOGLE_CLIENT_ID', b.google_client_id);
      notes.push('Google Client ID saved');
    }
    if (typeof b.google_client_secret === 'string' && b.google_client_secret.trim()) {
      setSecret('GOOGLE_CLIENT_SECRET', b.google_client_secret);
      notes.push('Google Client Secret saved');
    }
    res.json({ ok: true, notes, status: status() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/:name', (req, res) => {
  const map = { anthropic: ['ANTHROPIC_API_KEY'], google: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] };
  const keys = map[req.params.name];
  if (!keys) return res.status(400).json({ error: 'Unknown secret' });
  for (const k of keys) removeSecret(k);
  res.json({ ok: true, status: status() });
});

export default router;
