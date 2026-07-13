import crypto from 'node:crypto';

const PASSCODE = process.env.PASSCODE || 'change-me-please';
const SECRET = process.env.SESSION_SECRET || 'insecure-dev-secret-change-me';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

// Tokens are stateless: "<expiry>.<hmac>". No server-side session store needed,
// so the app keeps working across restarts.
function sign(expiry) {
  return crypto.createHmac('sha256', SECRET).update(String(expiry)).digest('hex');
}

export function issueToken() {
  const expiry = Date.now() + TOKEN_TTL_MS;
  return `${expiry}.${sign(expiry)}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return false;
  const [expiryStr, mac] = token.split('.');
  const expiry = Number(expiryStr);
  if (!expiry || Date.now() > expiry) return false;
  const expected = sign(expiry);
  if (mac.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
}

// Compare the supplied passcode safely. Two supported forms:
//  - PASSCODE=plaintext                      (simple)
//  - PASSCODE_HASH=salt:sha256(salt+code)    (nothing plaintext on disk; wins if set)
// Generate a hash with:
//  node -e "const c=require('crypto'),s=c.randomBytes(16).toString('hex');console.log(s+':'+c.createHash('sha256').update(s+process.argv[1]).digest('hex'))" 'your-passcode'
export function checkPasscode(supplied) {
  const hash = process.env.PASSCODE_HASH;
  if (hash && hash.includes(':')) {
    const [salt, expected] = hash.split(':');
    const got = crypto.createHash('sha256').update(salt + String(supplied || '')).digest('hex');
    if (got.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  }
  const a = Buffer.from(String(supplied || ''));
  const b = Buffer.from(PASSCODE);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Express middleware: require a valid bearer token.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!verifyToken(token)) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}
