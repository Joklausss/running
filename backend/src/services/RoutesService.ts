// ============================================================
// RoutesService — discovers running-relevant routes near a point
// using the Overpass API (OpenStreetMap), and enriches them with
// elevation data. Pure-ish: network I/O only, no DB.
// ============================================================

export type TerrainType = 'asphalt' | 'path' | 'mixed' | 'trail';

export interface RouteCandidate {
  name: string;
  distanceKm: number;
  elevationGain: number;
  terrainType: TerrainType;
  isLoop: boolean;
  centerLat: number;
  centerLng: number;
  geojson: GeoJSONLineString;
  source: 'openstreetmap';
}

export interface GeoJSONLineString {
  type: 'LineString';
  coordinates: [number, number][]; // [lng, lat]
}

interface OverpassWay {
  type: 'way';
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const OPEN_METEO_ELEVATION = 'https://api.open-meteo.com/v1/elevation';
const USER_AGENT = 'PacerRunningApp/0.1 (training-route discovery)';

// ---------- geo helpers ----------

function haversineKm(a: [number, number], b: [number, number]): number {
  // a, b = [lng, lat]
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function polylineLengthKm(coords: [number, number][]): number {
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += haversineKm(coords[i - 1], coords[i]);
  return d;
}

/** Pick up to `n` roughly-evenly-spaced points along a polyline. */
function sample(coords: [number, number][], n: number): [number, number][] {
  if (coords.length <= n) return coords;
  const out: [number, number][] = [];
  const step = (coords.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(coords[Math.round(i * step)]);
  return out;
}

function terrainFromTags(tags: Record<string, string>): TerrainType {
  const s = tags.surface ?? '';
  if (/asphalt|paved|concrete|paving/i.test(s)) return 'asphalt';
  if (/ground|dirt|unpaved|gravel|grass|sand|earth|mud|compacted|fine_gravel/i.test(s))
    return 'trail';
  const h = tags.highway;
  if (tags.leisure === 'track') return 'asphalt';
  if (h === 'track' || h === 'path') return 'trail';
  if (h === 'footway' || h === 'pedestrian' || h === 'cycleway') return 'asphalt';
  return 'mixed';
}

function nameFor(tags: Record<string, string>): string {
  if (tags.name) return tags.name;
  if (tags.leisure === 'track') return 'Piste d’athlétisme';
  switch (tags.highway) {
    case 'track':
      return 'Chemin';
    case 'path':
      return 'Sentier';
    case 'cycleway':
      return 'Voie cyclable';
    case 'pedestrian':
      return 'Zone piétonne';
    default:
      return 'Itinéraire';
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ---------- Overpass ----------

async function fetchOverpassWays(
  lat: number,
  lng: number,
  radiusM: number,
): Promise<OverpassWay[]> {
  const query = `[out:json][timeout:25];
(
  way["highway"~"^(footway|path|track|pedestrian|cycleway|living_street)$"](around:${radiusM},${lat},${lng});
  way["leisure"="track"](around:${radiusM},${lat},${lng});
);
out geom;`;

  const res = await fetchWithTimeout(
    OVERPASS_ENDPOINT,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: 'data=' + encodeURIComponent(query),
    },
    28_000,
  );
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const json = (await res.json()) as { elements: OverpassWay[] };
  return json.elements.filter((e) => e.type === 'way' && e.geometry?.length);
}

function waysToRoutes(ways: OverpassWay[]): RouteCandidate[] {
  const routes: RouteCandidate[] = [];
  for (const w of ways) {
    const tags = w.tags ?? {};
    const coords: [number, number][] = (w.geometry ?? []).map((g) => [g.lon, g.lat]);
    if (coords.length < 2) continue;

    const distanceKm = polylineLengthKm(coords);
    if (distanceKm < 0.2 || distanceKm > 35) continue;

    const first = coords[0];
    const last = coords[coords.length - 1];
    const isLoop = haversineKm(first, last) < 0.05; // < 50 m

    const lats = coords.map((c) => c[1]);
    const lngs = coords.map((c) => c[0]);
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;

    routes.push({
      name: nameFor(tags),
      distanceKm: Math.round(distanceKm * 100) / 100,
      elevationGain: 0,
      terrainType: terrainFromTags(tags),
      isLoop,
      centerLat,
      centerLng,
      geojson: { type: 'LineString', coordinates: coords },
      source: 'openstreetmap',
    });
  }

  // Prefer named, longer routes; cap the count to keep payloads & elevation cheap.
  routes.sort((a, b) => {
    const an = a.name === 'Itinéraire' ? 0 : 1;
    const bn = b.name === 'Itinéraire' ? 0 : 1;
    if (an !== bn) return bn - an;
    return b.distanceKm - a.distanceKm;
  });
  return routes.slice(0, 40);
}

// ---------- elevation (open-meteo, free, no key) ----------

async function lookupElevations(points: [number, number][]): Promise<number[]> {
  // open-meteo accepts up to 100 coordinates per request
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 100) {
    const chunk = points.slice(i, i + 100);
    const lat = chunk.map((p) => p[1]).join(',');
    const lng = chunk.map((p) => p[0]).join(',');
    const res = await fetchWithTimeout(
      `${OPEN_METEO_ELEVATION}?latitude=${lat}&longitude=${lng}`,
      { headers: { 'User-Agent': USER_AGENT } },
      8_000,
    );
    if (!res.ok) throw new Error(`Elevation HTTP ${res.status}`);
    const json = (await res.json()) as { elevation: number[] };
    out.push(...json.elevation);
  }
  return out;
}

function gainFromSeries(eles: number[]): number {
  let gain = 0;
  for (let i = 1; i < eles.length; i++) {
    const d = eles[i] - eles[i - 1];
    if (d > 0) gain += d;
  }
  return Math.round(gain);
}

/** Best-effort: enrich routes in place with elevation gain. Never throws. */
export async function enrichElevation(routes: RouteCandidate[]): Promise<void> {
  try {
    const subset = routes.slice(0, 30);
    const perRoute = subset.map((r) => sample(r.geojson.coordinates, 6));
    const flat = perRoute.flat();
    if (!flat.length) return;
    const eles = await lookupElevations(flat);
    let cursor = 0;
    subset.forEach((r, i) => {
      const n = perRoute[i].length;
      r.elevationGain = gainFromSeries(eles.slice(cursor, cursor + n));
      cursor += n;
    });
  } catch (err) {
    console.warn('[routes] elevation enrichment skipped:', (err as Error).message);
  }
}

export interface ElevationPoint {
  distKm: number;
  ele: number;
}

/** Dense elevation profile for a single route (for the fiche chart). */
export async function elevationProfile(
  coords: [number, number][],
): Promise<{ profile: ElevationPoint[]; gain: number }> {
  const pts = sample(coords, 40);
  const eles = await lookupElevations(pts);
  const profile: ElevationPoint[] = [];
  let dist = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) dist += haversineKm(pts[i - 1], pts[i]);
    profile.push({ distKm: Math.round(dist * 100) / 100, ele: Math.round(eles[i] ?? 0) });
  }
  return { profile, gain: gainFromSeries(eles) };
}

// ---------- discovery (Overpass + elevation) ----------

export async function discoverRoutes(
  lat: number,
  lng: number,
  radiusM: number,
): Promise<RouteCandidate[]> {
  const ways = await fetchOverpassWays(lat, lng, radiusM);
  const routes = waysToRoutes(ways);
  await enrichElevation(routes);
  return routes;
}
