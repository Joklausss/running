import { Router } from 'express';
import { pool, query } from '../db/pool.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import {
  generatePlan,
  type PlanInput,
  type Level,
  type Objective,
  type Weekday,
} from '../services/TrainingPlanService.js';

export const plansRouter = Router();
plansRouter.use(requireAuth);

interface ProfileRow {
  objective: string;
  level: string;
  vma: string | null;
  sessions_per_week: number;
  available_days: string[];
  injuries: string[];
  max_session_duration: number;
}

// POST /api/plans/generate — build a plan from the user's profile and persist it.
plansRouter.post('/generate', async (req: AuthedRequest, res) => {
  const { rows } = await query<ProfileRow>(
    'SELECT * FROM user_profiles WHERE user_id = $1',
    [req.userId],
  );
  if (!rows.length) {
    res.status(400).json({ error: 'No profile found — complete onboarding first.' });
    return;
  }
  const r = rows[0];
  const input: PlanInput = {
    objective: r.objective as Objective,
    level: r.level as Level,
    vma: r.vma != null ? Number(r.vma) : null,
    sessionsPerWeek: r.sessions_per_week,
    availableDays: r.available_days as Weekday[],
    injuries: r.injuries,
    maxSessionDuration: r.max_session_duration,
  };

  const plan = generatePlan(input);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Archive any previous active plan so "current" stays unambiguous.
    await client.query(
      `UPDATE training_plans SET status = 'archived' WHERE user_id = $1 AND status = 'active'`,
      [req.userId],
    );
    const planRes = await client.query<{ id: string }>(
      `INSERT INTO training_plans (user_id, name, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, 'active') RETURNING id`,
      [req.userId, plan.name, plan.startDate, plan.endDate],
    );
    const planId = planRes.rows[0].id;

    for (const week of plan.weeks) {
      for (const s of week.sessions) {
        await client.query(
          `INSERT INTO planned_sessions (
             plan_id, week_number, day_of_week, session_type, duration_min,
             description, target_pace_min, target_pace_max, target_hr_zone,
             estimated_km, order_index
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            planId,
            week.weekNumber,
            s.dayOfWeek,
            s.sessionType,
            s.durationMin,
            s.description,
            s.targetPaceMin,
            s.targetPaceMax,
            s.targetHrZone,
            s.estimatedKm,
            s.orderIndex,
          ],
        );
      }
    }
    await client.query('COMMIT');
    res.status(201).json({ planId });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/plans/current — active plan with its sessions grouped by week.
plansRouter.get('/current', async (req: AuthedRequest, res) => {
  const planRes = await query(
    `SELECT * FROM training_plans
     WHERE user_id = $1 AND status = 'active'
     ORDER BY created_at DESC LIMIT 1`,
    [req.userId],
  );
  if (!planRes.rows.length) {
    res.json({ plan: null });
    return;
  }
  const plan = planRes.rows[0];
  const sessionsRes = await query(
    `SELECT ps.*,
            r.name           AS route_name,
            r.distance_km::float8 AS route_distance_km,
            r.terrain_type   AS route_terrain,
            r.geojson        AS route_geojson
       FROM planned_sessions ps
       LEFT JOIN routes r ON r.id = ps.route_id
      WHERE ps.plan_id = $1
      ORDER BY ps.week_number, ps.order_index`,
    [plan.id],
  );
  res.json({ plan, sessions: sessionsRes.rows });
});
