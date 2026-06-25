import './env.js'; // must be first: loads .env before db/auth read process.env
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import db from './db.js';
import { issueToken, checkPasscode, requireAuth } from './auth.js';
import peopleRouter from './routes/people.js';
import encountersRouter from './routes/encounters.js';
import factsRouter from './routes/facts.js';
import dashboardRouter from './routes/dashboard.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: '1mb' }));

// --- Auth ---
app.post('/api/login', (req, res) => {
  if (!checkPasscode(req.body?.passcode)) {
    return res.status(401).json({ error: 'Incorrect passcode' });
  }
  res.json({ token: issueToken() });
});

// Everything under /api (except /api/login) requires a valid token.
const api = express.Router();
api.use(requireAuth);
api.use('/people', peopleRouter);
api.use('/', encountersRouter); // /people/:id/encounters + /encounters/:id
api.use('/', factsRouter); // /people/:id/facts + /facts/:id
api.use('/dashboard', dashboardRouter);

// Full JSON backup of everything.
api.get('/export', (req, res) => {
  res.json({
    exported_at: new Date().toISOString(),
    people: db.prepare('SELECT * FROM people').all(),
    encounters: db.prepare('SELECT * FROM encounters').all(),
    facts: db.prepare('SELECT * FROM facts').all(),
  });
});

app.use('/api', api);

// --- Static phone-first front end ---
app.use(express.static(join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`People databank running on http://localhost:${PORT}`);
});
