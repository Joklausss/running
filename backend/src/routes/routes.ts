import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import {
  discoverRoutes,
  elevationProfile,
  type RouteCandidate,
} from '../services/RoutesService.js';
import { generateRoute } from '../services/RouteBuilderService.js';

export const routesRouter = Router();
routesRouter.use(requireAuth);

// ---- in-memory discovery cache (Overpass rate-limit friendliness, 24h TTL) ----
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const discoveryCache = new Map<string, { ids: string[]; ts: number }>();

function cacheKey(lat: number, lng: number, radiusKm: number): string {
  // ~1km grid so nearby requests reuse the same cached set
  return `${lat.toFixed(2)},${lng.toFixed(2)},${radiusKm}`;
}

async function persistRoutes(routes: RouteCandidate[]): Promise<string[]> {
  const ids: string[] = [];
  for (const r of routes) {
    const { rows } = await query<{ id: string }>(
      `INSERT INTO routes (name, distance_km, elevation_gain, terrain_type, is_loop,
                           geojson, source, center_lat, center_lng)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        r.name,
        r.distanceKm,
        r.elevationGain,
        r.terrainType,
        r.isLoop,
        JSON.stringify(r.geojson),
        r.source,
        r.centerLat,
        r.centerLng,
      ],
    );
    ids.push(rows[0].id);
  }
  return ids;
}

const ROUTE_COLS = `id, name, distance_km::float8 AS distance_km, elevation_gain,
  terrain_type, is_loop, center_lat, center_lng, geojson, source`;

// GET /api/routes?lat=&lng=&radius=  — discover routes near a point
routesRouter.get('/', async (req: AuthedRequest, res) => {
  const q = z
    .object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
      radius: z.coerce.number().min(1).max(30).default(5),
    })
    .safeParse(req.query);
  if (!q.success) {
    res.status(400).json({ error: 'lat & lng required' });
    return;
  }
  const { lat, lng, radius } = q.data;
  const key = cacheKey(lat, lng, radius);
  const cached = discoveryCache.get(key);

  let ids: string[];
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    ids = cached.ids;
  } else {
    let candidates: RouteCandidate[];
    try {
      candidates = await discoverRoutes(lat, lng, radius * 1000);
    } catch (err) {
      res
        .status(502)
        .json({ error: 'Overpass indisponible', detail: (err as Error).message });
      return;
    }
    ids = await persistRoutes(candidates);
    discoveryCache.set(key, { ids, ts: Date.now() });
  }

  if (!ids.length) {
    res.json({ routes: [] });
    return;
  }
  const { rows } = await query(
    `SELECT ${ROUTE_COLS} FROM routes WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  res.json({ routes: rows });
});

// POST /api/routes/generate — build ONE route ≈ targetKm from the local path
// network, persist it, and (optionally) associate it to a session.
routesRouter.post('/generate', async (req: AuthedRequest, res) => {
  const body = z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      targetKm: z.number().min(0.3).max(200),
      slopeTarget: z.number().int().min(1).max(10).nullable().optional(),
      returnToStart: z.boolean().optional(),
      variant: z.number().int().min(0).max(50).optional(),
      discipline: z.enum(['running', 'mtb', 'road']).optional(),
      sessionId: z.string().uuid().nullable().optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'lat, lng, targetKm required' });
    return;
  }
  const { lat, lng, targetKm, slopeTarget, returnToStart, variant, discipline, sessionId } =
    body.data;

  let generated;
  try {
    generated = await generateRoute(
      lat,
      lng,
      targetKm,
      slopeTarget,
      returnToStart ?? true,
      variant ?? 0,
      discipline ?? 'running',
    );
  } catch (err) {
    res.status(502).json({ error: 'Génération impossible', detail: (err as Error).message });
    return;
  }
  if (generated.coordinates.length < 2) {
    res.status(422).json({ error: 'Réseau de chemins insuffisant à cet endroit.' });
    return;
  }

  const elevationGain = generated.elevationGain;

  const lats = generated.coordinates.map((c) => c[1]);
  const lngs = generated.coordinates.map((c) => c[0]);
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;

  const terrain =
    discipline === 'road' ? 'asphalt' : discipline === 'mtb' ? 'trail' : 'mixed';
  const label =
    discipline === 'road' ? 'Vélo route' : discipline === 'mtb' ? 'VTT' : 'Parcours';

  const { rows } = await query<{ id: string }>(
    `INSERT INTO routes (name, distance_km, elevation_gain, terrain_type, is_loop,
                         geojson, source, center_lat, center_lng)
     VALUES ($1,$2,$3,$4,$5,$6,'generated',$7,$8) RETURNING id`,
    [
      `${label} ${generated.distanceKm.toFixed(1)} km`,
      generated.distanceKm,
      elevationGain,
      terrain,
      generated.isLoop,
      JSON.stringify({ type: 'LineString', coordinates: generated.coordinates }),
      centerLat,
      centerLng,
    ],
  );
  const routeId = rows[0].id;

  if (sessionId) {
    const owns = await query(
      `SELECT 1 FROM planned_sessions ps JOIN training_plans tp ON tp.id = ps.plan_id
        WHERE ps.id = $1 AND tp.user_id = $2`,
      [sessionId, req.userId],
    );
    if (owns.rowCount) {
      await query('UPDATE planned_sessions SET route_id = $1 WHERE id = $2', [routeId, sessionId]);
    }
  }

  const out = await query(`SELECT ${ROUTE_COLS} FROM routes WHERE id = $1`, [routeId]);
  res.status(201).json({ route: out.rows[0], targetKm });
});

// GET /api/routes/:id — full route + on-demand elevation profile
routesRouter.get('/:id', async (req: AuthedRequest, res) => {
  const { rows } = await query<any>(
    `SELECT ${ROUTE_COLS} FROM routes WHERE id = $1`,
    [req.params.id],
  );
  if (!rows.length) {
    res.status(404).json({ error: 'Route introuvable' });
    return;
  }
  const route = rows[0];
  let elevation: { profile: unknown[]; gain: number } = { profile: [], gain: route.elevation_gain };
  try {
    elevation = await elevationProfile(route.geojson.coordinates);
    // backfill the stored gain if we now have a better value
    if (elevation.gain && elevation.gain !== route.elevation_gain) {
      await query('UPDATE routes SET elevation_gain = $1 WHERE id = $2', [
        elevation.gain,
        route.id,
      ]);
      route.elevation_gain = elevation.gain;
    }
  } catch {
    /* elevation best-effort */
  }
  res.json({ route, elevation: elevation.profile });
});

// ---- session ↔ route association ----

async function userOwnsSession(userId: string, sessionId: string): Promise<boolean> {
  const { rowCount } = await query(
    `SELECT 1 FROM planned_sessions ps
       JOIN training_plans tp ON tp.id = ps.plan_id
      WHERE ps.id = $1 AND tp.user_id = $2`,
    [sessionId, userId],
  );
  return !!rowCount;
}

// PUT /api/routes/session/:sessionId  { routeId }  — associate
routesRouter.put('/session/:sessionId', async (req: AuthedRequest, res) => {
  const body = z.object({ routeId: z.string().uuid() }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: 'routeId (uuid) required' });
    return;
  }
  if (!(await userOwnsSession(req.userId!, req.params.sessionId))) {
    res.status(404).json({ error: 'Séance introuvable' });
    return;
  }
  await query('UPDATE planned_sessions SET route_id = $1 WHERE id = $2', [
    body.data.routeId,
    req.params.sessionId,
  ]);
  res.json({ ok: true });
});

// DELETE /api/routes/session/:sessionId — remove association
routesRouter.delete('/session/:sessionId', async (req: AuthedRequest, res) => {
  if (!(await userOwnsSession(req.userId!, req.params.sessionId))) {
    res.status(404).json({ error: 'Séance introuvable' });
    return;
  }
  await query('UPDATE planned_sessions SET route_id = NULL WHERE id = $1', [
    req.params.sessionId,
  ]);
  res.json({ ok: true });
});

// GET /api/routes/session/:sessionId/suggestions — 2-3 routes matched to a session
routesRouter.get('/session/:sessionId/suggestions', async (req: AuthedRequest, res) => {
  const sessRes = await query<any>(
    `SELECT ps.session_type, ps.estimated_km::float8 AS estimated_km,
            up.location_lat, up.location_lng, up.search_radius
       FROM planned_sessions ps
       JOIN training_plans tp ON tp.id = ps.plan_id
       JOIN user_profiles up ON up.user_id = tp.user_id
      WHERE ps.id = $1 AND tp.user_id = $2`,
    [req.params.sessionId, req.userId],
  );
  if (!sessRes.rows.length) {
    res.status(404).json({ error: 'Séance introuvable' });
    return;
  }
  const s = sessRes.rows[0];
  if (s.location_lat == null || s.location_lng == null) {
    res.json({ routes: [], reason: 'no_location' });
    return;
  }

  // ensure we have routes near the user (reuse the discovery cache)
  const key = cacheKey(s.location_lat, s.location_lng, s.search_radius);
  let ids = discoveryCache.get(key)?.ids;
  if (!ids) {
    try {
      const candidates = await discoverRoutes(
        s.location_lat,
        s.location_lng,
        s.search_radius * 1000,
      );
      ids = await persistRoutes(candidates);
      discoveryCache.set(key, { ids, ts: Date.now() });
    } catch {
      res.json({ routes: [], reason: 'overpass_unavailable' });
      return;
    }
  }
  if (!ids.length) {
    res.json({ routes: [] });
    return;
  }

  const { rows } = await query<any>(
    `SELECT ${ROUTE_COLS} FROM routes WHERE id = ANY($1::uuid[])`,
    [ids],
  );

  // rank by suitability to the session
  const target = Number(s.estimated_km) || 5;
  const scored = rows
    .map((r) => {
      let score = -Math.abs(r.distance_km - target); // closeness to target distance
      if (s.session_type === 'cote') score += r.elevation_gain / 10; // hills want climb
      if (s.session_type === 'fractionne_court')
        score += r.terrain_type === 'asphalt' ? 3 : 0; // intervals want flat/firm
      if (s.session_type === 'sortie_longue') score += r.is_loop ? 1.5 : 0;
      return { r, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.r);

  res.json({ routes: scored });
});
