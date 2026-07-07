import './env.js'; // must be first: loads .env before db/auth read process.env
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import db from './db.js';
import { issueToken, checkPasscode, requireAuth } from './auth.js';
import tasksRouter from './routes/tasks.js';
import goalsRouter from './routes/goals.js';
import listsRouter from './routes/lists.js';

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
api.use('/tasks', tasksRouter);
api.use('/goals', goalsRouter);
api.use('/lists', listsRouter);

// Full JSON backup of everything.
api.get('/export', (req, res) => {
  res.json({
    exported_at: new Date().toISOString(),
    lists: db.prepare('SELECT * FROM lists').all(),
    goals: db.prepare('SELECT * FROM goals').all(),
    tasks: db.prepare('SELECT * FROM tasks').all(),
  });
});

app.use('/api', api);

// --- Static phone-first front end ---
app.use(express.static(join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Tempo running on http://localhost:${PORT}`);
});
