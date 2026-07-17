// Runtime secret store. Lets the operator paste credentials INTO the app
// (Settings → Smart features) instead of editing files over SSH — essential
// here because the repo is PUBLIC (no secret may ever be committed) and there
// is no shell access.
//
// Secrets live in a chmod-600 file in the data directory (gitignored, outside
// the repo, survives deploys) and are mirrored into process.env at runtime.
// The AI proxy and Google modules read process.env live, so setting a value
// switches features on immediately — no restart. Values are NEVER sent back to
// any client; only a masked hint + boolean.
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DATA_DIR = dirname(process.env.DB_PATH || './data/tempo.sqlite');
const SECRETS_FILE = process.env.SECRETS_PATH || join(DATA_DIR, 'secrets.env');

// Keys the UI is allowed to manage. Nothing else can be written through here.
export const MANAGED = ['ANTHROPIC_API_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];

// Load persisted secrets into process.env at startup. A real environment
// variable (set by the operator another way) always wins over the stored file.
export function loadSecrets() {
  let text = '';
  try { text = readFileSync(SECRETS_FILE, 'utf8'); } catch { return; }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && MANAGED.includes(m[1]) && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2];
    }
  }
}

// Persist the currently-set managed secrets back to the file (mode 600).
function persist() {
  const lines = MANAGED
    .filter((k) => process.env[k])
    .map((k) => `${k}=${process.env[k]}`);
  writeFileSync(SECRETS_FILE, lines.join('\n') + (lines.length ? '\n' : ''), { mode: 0o600 });
  try { chmodSync(SECRETS_FILE, 0o600); } catch { /* best effort */ }
}

export function setSecret(key, value) {
  if (!MANAGED.includes(key)) throw new Error('Unknown secret');
  const v = String(value).trim();
  if (!v) throw new Error('Empty value');
  process.env[key] = v;
  persist();
}

export function removeSecret(key) {
  if (!MANAGED.includes(key)) throw new Error('Unknown secret');
  delete process.env[key];
  persist();
}

// A short, safe hint — enough to recognise a key, never enough to use it.
function mask(v) {
  if (!v) return null;
  if (v.length <= 8) return '••••';
  return v.slice(0, 3) + '…' + v.slice(-4);
}

// Non-secret status for the UI. Never returns raw values.
export function status() {
  return {
    anthropic: { set: !!process.env.ANTHROPIC_API_KEY, hint: mask(process.env.ANTHROPIC_API_KEY) },
    google: {
      client_id_set: !!process.env.GOOGLE_CLIENT_ID,
      client_secret_set: !!process.env.GOOGLE_CLIENT_SECRET,
      client_id_hint: mask(process.env.GOOGLE_CLIENT_ID),
    },
  };
}
