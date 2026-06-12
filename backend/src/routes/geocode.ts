import { Router } from 'express';
import { z } from 'zod';

// Public geocoding proxy over Nominatim (OSM). Verifies a free-text address /
// city / postcode and returns candidate coordinates. No auth: onboarding uses
// it before the user has an account.
export const geocodeRouter = Router();

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'PacerRunningApp/0.1 (address geocoding)';

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  addresstype?: string;
}

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

// Simple in-memory cache + 1 req/sec throttle to respect Nominatim's usage policy.
const cache = new Map<string, { results: GeocodeResult[]; ts: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let lastCall = 0;

async function throttle() {
  const wait = 1000 - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

geocodeRouter.get('/', async (req, res) => {
  const parsed = z
    .object({ q: z.string().trim().min(2).max(120) })
    .safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'q (2-120 chars) required' });
    return;
  }
  const q = parsed.data.q;
  const key = q.toLowerCase();

  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    res.json({ results: cached.results });
    return;
  }

  try {
    await throttle();
    const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=jsonv2&limit=5&accept-language=fr`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    let raw: NominatimResult[];
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error(`Nominatim HTTP ${r.status}`);
      raw = (await r.json()) as NominatimResult[];
    } finally {
      clearTimeout(t);
    }

    const results: GeocodeResult[] = raw.map((x) => ({
      label: x.display_name,
      lat: Number(x.lat),
      lng: Number(x.lon),
    }));
    cache.set(key, { results, ts: Date.now() });
    res.json({ results });
  } catch (err) {
    res
      .status(502)
      .json({ error: 'Géocodage indisponible', detail: (err as Error).message });
  }
});
