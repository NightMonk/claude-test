// AI helpers — a thin server-side proxy to the Anthropic Messages API so the
// API key never touches the browser. All routes degrade gracefully when no key
// is set (GET /status reports configured:false and the UI hides the buttons).
//
// Set ANTHROPIC_API_KEY in .env to enable. Optional AI_MODEL overrides the model.
import { Router } from 'express';

const router = Router();

const MODEL = process.env.AI_MODEL || 'claude-haiku-4-5-20251001';
// Base URL is overridable for self-hosting behind a gateway (and for testing).
const BASE = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
const isConfigured = () => !!process.env.ANTHROPIC_API_KEY;

// Call Anthropic and return the assistant's text. Throws on any failure so the
// route can turn it into a clean 4xx/5xx — the UI shows a gentle message.
async function ask(system, user, maxTokens = 512) {
  const res = await fetch(`${BASE}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

// Pull the first JSON value out of a model reply (tolerates ```json fences and
// surrounding prose).
function extractJSON(text) {
  let t = text.replace(/```(?:json)?/gi, '').trim();
  const first = t.search(/[[{]/);
  if (first === -1) throw new Error('No JSON in response');
  // Walk to the matching bracket so trailing prose is ignored.
  const open = t[first]; const close = open === '[' ? ']' : '}';
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let i = first; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) { end = i; break; } }
  }
  return JSON.parse(t.slice(first, end === -1 ? undefined : end + 1));
}

const guard = (req, res, next) => {
  if (!isConfigured()) return res.status(503).json({ error: 'AI is not set up on this server' });
  next();
};

router.get('/status', (req, res) => res.json({ configured: isConfigured(), model: isConfigured() ? MODEL : null }));

// Break a task into a few concrete, ordered steps.
router.post('/breakdown', guard, async (req, res) => {
  const title = String(req.body?.title || '').trim();
  if (!title) return res.status(400).json({ error: 'A task title is required' });
  const notes = String(req.body?.notes || '').trim();
  try {
    const out = await ask(
      'You break a task into 3–6 small, concrete, ordered steps for someone with ADHD who struggles to start. '
      + 'Each step is a short action (max ~8 words), starts with a verb, and is genuinely a substep — not a restatement. '
      + 'Reply ONLY with a JSON array of strings, no prose.',
      `Task: ${title}${notes ? `\nContext: ${notes}` : ''}`,
      400
    );
    const arr = extractJSON(out);
    const subtasks = (Array.isArray(arr) ? arr : []).map((s) => String(s).trim()).filter(Boolean).slice(0, 8);
    res.json({ subtasks });
  } catch (e) { res.status(502).json({ error: 'Could not suggest steps just now', detail: e.message }); }
});

// Rewrite a task title so it's clearer and action-oriented. Never lengthens much.
router.post('/rewrite', guard, async (req, res) => {
  const title = String(req.body?.title || '').trim();
  if (!title) return res.status(400).json({ error: 'A task title is required' });
  try {
    const out = await ask(
      'You rewrite a to-do into one clear, specific, action-first line (start with a verb, keep it short). '
      + 'Preserve any dates/names. Reply ONLY with a JSON object {"title": "..."} — no prose.',
      `Rewrite: ${title}`,
      120
    );
    const obj = extractJSON(out);
    const rewritten = String(obj?.title || '').trim();
    if (!rewritten) throw new Error('empty rewrite');
    res.json({ title: rewritten });
  } catch (e) { res.status(502).json({ error: 'Could not improve the wording just now', detail: e.message }); }
});

// Turn a free-text note/brain-dump into a list of tasks.
router.post('/notes', guard, async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Some text is required' });
  try {
    const out = await ask(
      'You extract actionable to-dos from a messy note or brain-dump. Return each distinct task as a short '
      + 'action line (start with a verb). Ignore non-actionable chatter. Keep the user\'s wording where sensible. '
      + 'Reply ONLY with a JSON array of objects like {"title":"...","notes":"optional extra detail"} — no prose.',
      text.slice(0, 4000),
      800
    );
    const arr = extractJSON(out);
    const tasks = (Array.isArray(arr) ? arr : [])
      .map((t) => (typeof t === 'string' ? { title: t } : t))
      .map((t) => ({ title: String(t.title || '').trim(), notes: t.notes ? String(t.notes).trim() : null }))
      .filter((t) => t.title)
      .slice(0, 25);
    res.json({ tasks });
  } catch (e) { res.status(502).json({ error: 'Could not read that into tasks just now', detail: e.message }); }
});

export default router;
