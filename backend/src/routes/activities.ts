import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

export const activitiesRouter = Router();
activitiesRouter.use(requireAuth);

const trackPoint = z.object({
  lat: z.number(),
  lng: z.number(),
  t: z.number(),
  hr: z.number().optional(),
});

const activitySchema = z.object({
  plannedSessionId: z.string().uuid().nullable().optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  distanceKm: z.number().min(0),
  durationSec: z.number().int().min(0),
  avgPaceSecPerKm: z.number().int().nullable().optional(),
  avgHr: z.number().int().nullable().optional(),
  maxHr: z.number().int().nullable().optional(),
  gpsTrack: z.array(trackPoint).max(100_000),
  elevationGain: z.number().int().min(0).default(0),
  rpe: z.number().int().min(1).max(10).nullable().optional(),
  mood: z.string().max(40).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

// POST /api/activities — save a completed run
activitiesRouter.post('/', async (req: AuthedRequest, res) => {
  const parsed = activitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const a = parsed.data;

  // if linked to a planned session, make sure it belongs to this user
  if (a.plannedSessionId) {
    const { rowCount } = await query(
      `SELECT 1 FROM planned_sessions ps
         JOIN training_plans tp ON tp.id = ps.plan_id
        WHERE ps.id = $1 AND tp.user_id = $2`,
      [a.plannedSessionId, req.userId],
    );
    if (!rowCount) {
      res.status(400).json({ error: 'Séance liée introuvable' });
      return;
    }
  }

  const { rows } = await query<{ id: string }>(
    `INSERT INTO activities (
        user_id, planned_session_id, started_at, ended_at, distance_km,
        duration_sec, avg_pace_sec_per_km, avg_hr, max_hr, gps_track,
        elevation_gain, rpe, mood, notes
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id`,
    [
      req.userId,
      a.plannedSessionId ?? null,
      a.startedAt,
      a.endedAt,
      a.distanceKm,
      a.durationSec,
      a.avgPaceSecPerKm ?? null,
      a.avgHr ?? null,
      a.maxHr ?? null,
      JSON.stringify(a.gpsTrack),
      a.elevationGain,
      a.rpe ?? null,
      a.mood ?? null,
      a.notes ?? null,
    ],
  );
  res.status(201).json({ id: rows[0].id });
});

// GET /api/activities — history list (no heavy gps_track payload)
activitiesRouter.get('/', async (req: AuthedRequest, res) => {
  const { rows } = await query(
    `SELECT a.id, a.started_at, a.ended_at,
            a.distance_km::float8 AS distance_km, a.duration_sec,
            a.avg_pace_sec_per_km, a.avg_hr, a.elevation_gain,
            a.rpe, a.mood, ps.session_type
       FROM activities a
       LEFT JOIN planned_sessions ps ON ps.id = a.planned_session_id
      WHERE a.user_id = $1
      ORDER BY a.started_at DESC`,
    [req.userId],
  );
  res.json({ activities: rows });
});

// GET /api/activities/:id — full activity including gps_track
activitiesRouter.get('/:id', async (req: AuthedRequest, res) => {
  const { rows } = await query(
    `SELECT a.*, a.distance_km::float8 AS distance_km, ps.session_type,
            ps.target_pace_min, ps.target_pace_max
       FROM activities a
       LEFT JOIN planned_sessions ps ON ps.id = a.planned_session_id
      WHERE a.id = $1 AND a.user_id = $2`,
    [req.params.id, req.userId],
  );
  if (!rows.length) {
    res.status(404).json({ error: 'Activité introuvable' });
    return;
  }
  res.json({ activity: rows[0] });
});
