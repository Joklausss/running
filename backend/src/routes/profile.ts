import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

export const profileRouter = Router();

const profileSchema = z.object({
  objective: z.enum([
    'weight_loss',
    'race_5_10k',
    'half_marathon',
    'marathon',
    'endurance',
    'wellbeing',
  ]),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  vma: z.number().min(5).max(30).nullable().optional(),
  vo2max: z.number().min(20).max(90).nullable().optional(),
  sessionsPerWeek: z.number().int().min(2).max(6),
  availableDays: z.array(
    z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
  ),
  injuries: z.array(z.enum(['knee', 'ankle', 'back'])),
  maxSessionDuration: z.union([
    z.literal(30),
    z.literal(45),
    z.literal(60),
    z.literal(90),
    z.literal(120),
  ]),
  locationLat: z.number().nullable().optional(),
  locationLng: z.number().nullable().optional(),
  locationLabel: z.string().max(120).nullable().optional(),
  searchRadius: z.union([
    z.literal(1),
    z.literal(3),
    z.literal(5),
    z.literal(10),
  ]),
});

profileRouter.use(requireAuth);

profileRouter.get('/', async (req: AuthedRequest, res) => {
  const { rows } = await query(
    'SELECT * FROM user_profiles WHERE user_id = $1',
    [req.userId],
  );
  res.json({ profile: rows[0] ?? null });
});

profileRouter.put('/', async (req: AuthedRequest, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const p = parsed.data;
  await query(
    `INSERT INTO user_profiles (
        user_id, objective, level, vma, vo2max,
        sessions_per_week, available_days, injuries, max_session_duration,
        location_lat, location_lng, location_label, search_radius, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now())
     ON CONFLICT (user_id) DO UPDATE SET
        objective = EXCLUDED.objective,
        level = EXCLUDED.level,
        vma = EXCLUDED.vma,
        vo2max = EXCLUDED.vo2max,
        sessions_per_week = EXCLUDED.sessions_per_week,
        available_days = EXCLUDED.available_days,
        injuries = EXCLUDED.injuries,
        max_session_duration = EXCLUDED.max_session_duration,
        location_lat = EXCLUDED.location_lat,
        location_lng = EXCLUDED.location_lng,
        location_label = EXCLUDED.location_label,
        search_radius = EXCLUDED.search_radius,
        updated_at = now()`,
    [
      req.userId,
      p.objective,
      p.level,
      p.vma ?? null,
      p.vo2max ?? null,
      p.sessionsPerWeek,
      p.availableDays,
      p.injuries,
      p.maxSessionDuration,
      p.locationLat ?? null,
      p.locationLng ?? null,
      p.locationLabel ?? null,
      p.searchRadius,
    ],
  );
  res.json({ ok: true });
});
