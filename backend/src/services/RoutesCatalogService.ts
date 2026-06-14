// ============================================================
// RoutesCatalogService — real, signposted routes from OpenStreetMap
// "route" relations (ODbL, legal, no scraping), per discipline.
// Plus a GPX parser for the user's own imported routes.
// ============================================================

export type Discipline = 'running' | 'trail' | 'road' | 'mtb' | 'gravel';

export interface CatalogRoute {
  name: string;
  distanceKm: number;
  isLoop: boolean;
  terrainType: string;
  centerLat: number;
  centerLng: number;
  coordinates: [number, number][]; // [lng, lat]
  externalRef: string | null; // e.g. OSM relation id
}

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const USER_AGENT = 'PacerRunningApp/0.1 (curated route catalog)';

// route relation tag values that fit each discipline
const ROUTE_TAGS: Record<Discipline, string> = {
  running: 'hiking|foot|running',
  trail: 'hiking|foot|running',
  road: 'bicycle',
  mtb: 'mtb',
  gravel: 'mtb|bicycle',
};

const TERRAIN: Record<Discipline, string> = {
  running: 'mixed',
  trail: 'trail',
  road: 'asphalt',
  mtb: 'trail',
  gravel: 'mixed',
};

// ---------- geo helpers ----------

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const l1 = (a[1] * Math.PI) / 180;
  const l2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(l1) * Math.cos(l2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function lengthKm(coords: [number, number][]): number {
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += haversineKm(coords[i - 1], coords[i]);
  return d;
}

function sample(coords: [number, number][], n: number): [number, number][] {
  if (coords.length <= n) return coords;
  const out: [number, number][] = [];
  const step = (coords.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(coords[Math.round(i * step)]);
  return out;
}

// ---------- Overpass (retry + mirror) ----------

interface OverpassMember {
  type: string;
  geometry?: { lat: number; lon: number }[];
}
interface OverpassRelation {
  type: 'relation';
  id: number;
  tags?: Record<string, string>;
  members?: OverpassMember[];
}

async function overpassPost(query: string): Promise<OverpassRelation[]> {
  let lastErr: unknown = new Error('Overpass unavailable');
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 50_000);
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': USER_AGENT,
          },
          body: 'data=' + encodeURIComponent(query),
          signal: ctrl.signal,
        });
        if ([429, 502, 503, 504].includes(res.status)) throw new Error(`Overpass ${res.status}`);
        if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
        const json = (await res.json()) as { elements: OverpassRelation[] };
        return json.elements.filter((e) => e.type === 'relation');
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      } finally {
        clearTimeout(timer);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Overpass unavailable');
}

// ---------- curated discovery ----------

export async function discoverCuratedRoutes(
  lat: number,
  lng: number,
  radiusM: number,
  discipline: Discipline,
): Promise<CatalogRoute[]> {
  const query = `[out:json][timeout:50];
relation["route"~"^(${ROUTE_TAGS[discipline]})$"](around:${radiusM},${lat},${lng});
out geom;`;

  const relations = await overpassPost(query);
  const routes: CatalogRoute[] = [];

  for (const rel of relations) {
    const tags = rel.tags ?? {};
    // stitch member ways into one polyline
    const coords: [number, number][] = [];
    for (const m of rel.members ?? []) {
      if (m.type !== 'way' || !m.geometry) continue;
      for (const g of m.geometry) coords.push([g.lon, g.lat]);
    }
    if (coords.length < 2) continue;

    const distanceKm = lengthKm(coords);
    if (distanceKm < 0.5) continue;

    const lats = coords.map((c) => c[1]);
    const lngs = coords.map((c) => c[0]);
    const first = coords[0];
    const last = coords[coords.length - 1];

    routes.push({
      name: tags.name || tags.ref || 'Itinéraire balisé',
      distanceKm: Math.round(distanceKm * 100) / 100,
      isLoop: haversineKm(first, last) < 0.1,
      terrainType: TERRAIN[discipline],
      centerLat: (Math.min(...lats) + Math.max(...lats)) / 2,
      centerLng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
      coordinates: sample(coords, 600), // bound payload for very long routes
      externalRef: `osm:rel:${rel.id}`,
    });
  }

  // prefer named, then shorter (more local) routes; cap the list
  routes.sort((a, b) => {
    const an = a.name === 'Itinéraire balisé' ? 0 : 1;
    const bn = b.name === 'Itinéraire balisé' ? 0 : 1;
    if (an !== bn) return bn - an;
    return a.distanceKm - b.distanceKm;
  });
  return routes.slice(0, 40);
}

// ---------- GPX parsing (personal imports) ----------

export interface ParsedGpx {
  name: string | null;
  coordinates: [number, number][]; // [lng, lat]
  distanceKm: number;
}

export function parseGpx(xml: string): ParsedGpx {
  const coordinates: [number, number][] = [];
  // <trkpt lat=".." lon=".."> or <rtept ...>
  const re = /<(?:trkpt|rtept)\b[^>]*?\blat="([-\d.]+)"[^>]*?\blon="([-\d.]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) coordinates.push([lng, lat]);
  }
  const nameMatch = xml.match(/<name>\s*([^<]+?)\s*<\/name>/i);
  return {
    name: nameMatch ? nameMatch[1].trim() : null,
    coordinates,
    distanceKm: Math.round(lengthKm(coordinates) * 100) / 100,
  };
}
