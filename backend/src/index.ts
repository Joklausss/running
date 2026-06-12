import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { profileRouter } from './routes/profile.js';
import { plansRouter } from './routes/plans.js';
import { routesRouter } from './routes/routes.js';
import { geocodeRouter } from './routes/geocode.js';
import { activitiesRouter } from './routes/activities.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', env: config.nodeEnv });
});

app.use('/api/auth', authRouter);
app.use('/api/profile', profileRouter);
app.use('/api/plans', plansRouter);
app.use('/api/routes', routesRouter);
app.use('/api/geocode', geocodeRouter);
app.use('/api/activities', activitiesRouter);

// Centralised error handler so route throws return JSON, not HTML.
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error('[error]', err);
    res.status(500).json({ error: 'Internal server error' });
  },
);

app.listen(config.port, () => {
  console.log(`[backend] listening on http://localhost:${config.port}`);
});
