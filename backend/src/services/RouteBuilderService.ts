// ============================================================
// RouteBuilderService — generates a single connected running route of a
// TARGET distance by stitching together the local OSM path network.
//
// 1. Fetch ways (with shared node ids) near the start via Overpass.
// 2. Build an undirected graph; node ids are shared between ways → connectivity.
// 3. Generate a loop ≈ target: shortest path out to a ~half-target turnaround,
//    a penalised (different) path back; pick the candidate closest to target.
//    Falls back to an out-and-back when the network is sparse.
// ============================================================

export interface GeoJSONLineString {
  type: 'LineString';
  coordinates: [number, number][]; // [lng, lat]
}

export interface GeneratedRoute {
  coordinates: [number, number][]; // [lng, lat]
  distanceKm: number;
  isLoop: boolean;
  elevationGain: number;
}

interface GraphNode {
  lat: number;
  lng: number;
  adj: { to: number; d: number }[]; // d in km
}
type Graph = Map<number, GraphNode>;

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const USER_AGENT = 'PacerRunningApp/0.1 (route generation)';

/** POST a query to Overpass with retries + a fallback mirror (it's often flaky). */
async function overpassPost(query: string): Promise<OverpassEl[]> {
  let lastErr: unknown = new Error('Overpass unavailable');
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 65_000);
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
        return ((await res.json()) as { elements: OverpassEl[] }).elements;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
      } finally {
        clearTimeout(timer);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Overpass unavailable');
}

// ---------- geo ----------

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const l1 = (aLat * Math.PI) / 180;
  const l2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(l1) * Math.cos(l2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------- Overpass graph fetch ----------

interface OverpassEl {
  type: 'way' | 'node';
  id: number;
  nodes?: number[];
  lat?: number;
  lon?: number;
}

// In-memory graph cache (24h) so retries / repeated generations skip Overpass.
const graphCache = new Map<string, { graph: Graph; ts: number }>();
const GRAPH_TTL_MS = 24 * 60 * 60 * 1000;

async function fetchGraph(lat: number, lng: number, radiusM: number): Promise<Graph> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)},${Math.round(radiusM / 500) * 500}`;
  const cached = graphCache.get(key);
  if (cached && Date.now() - cached.ts < GRAPH_TTL_MS) return cached.graph;

  // Rich runnable network (paths + quiet streets) for good connectivity. The
  // radius is capped by the caller so this stays fast; longer targets are met
  // by combining multiple legs rather than a huge fetch.
  const highways =
    'footway|path|track|pedestrian|cycleway|living_street|residential|service|unclassified|tertiary|steps';
  const query = `[out:json][timeout:60];
(
  way["highway"~"^(${highways})$"](around:${radiusM},${lat},${lng});
);
(._;>;);
out;`;

  const elements = await overpassPost(query);

  const graph: Graph = new Map();
  // 1) nodes
  for (const el of elements) {
    if (el.type === 'node' && el.lat != null && el.lon != null) {
      graph.set(el.id, { lat: el.lat, lng: el.lon, adj: [] });
    }
  }
  // 2) edges from consecutive way nodes
  for (const el of elements) {
    if (el.type !== 'way' || !el.nodes) continue;
    for (let i = 1; i < el.nodes.length; i++) {
      const a = graph.get(el.nodes[i - 1]);
      const b = graph.get(el.nodes[i]);
      if (!a || !b) continue;
      const d = haversineKm(a.lat, a.lng, b.lat, b.lng);
      if (d === 0) continue;
      a.adj.push({ to: el.nodes[i], d });
      b.adj.push({ to: el.nodes[i - 1], d });
    }
  }
  graphCache.set(key, { graph, ts: Date.now() });
  return graph;
}

// ---------- Dijkstra (binary heap) ----------

class MinHeap {
  private a: [number, number][] = []; // [priority, node]
  get size() {
    return this.a.length;
  }
  push(item: [number, number]) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, number] | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let s = i;
        if (l < a.length && a[l][0] < a[s][0]) s = l;
        if (r < a.length && a[r][0] < a[s][0]) s = r;
        if (s === i) break;
        [a[s], a[i]] = [a[i], a[s]];
        i = s;
      }
    }
    return top;
  }
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** Dijkstra from src. `penalty` multiplies the cost of listed edges (for variety). */
function dijkstra(
  graph: Graph,
  src: number,
  penalty?: Set<string>,
): { dist: Map<number, number>; prev: Map<number, number> } {
  const dist = new Map<number, number>();
  const prev = new Map<number, number>();
  const heap = new MinHeap();
  dist.set(src, 0);
  heap.push([0, src]);

  while (heap.size) {
    const [d, u] = heap.pop()!;
    if (d > (dist.get(u) ?? Infinity)) continue;
    const node = graph.get(u);
    if (!node) continue;
    for (const e of node.adj) {
      let w = e.d;
      if (penalty && penalty.has(edgeKey(u, e.to))) w *= 6;
      const nd = d + w;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, u);
        heap.push([nd, e.to]);
      }
    }
  }
  return { dist, prev };
}

function pathNodes(prev: Map<number, number>, target: number): number[] {
  const path: number[] = [];
  let cur: number | undefined = target;
  while (cur != null) {
    path.push(cur);
    cur = prev.get(cur);
  }
  return path.reverse();
}

function pathCoords(graph: Graph, nodes: number[]): [number, number][] {
  return nodes.map((n) => {
    const g = graph.get(n)!;
    return [g.lng, g.lat] as [number, number];
  });
}

function realLengthKm(graph: Graph, nodes: number[]): number {
  let d = 0;
  for (let i = 1; i < nodes.length; i++) {
    const a = graph.get(nodes[i - 1])!;
    const b = graph.get(nodes[i])!;
    d += haversineKm(a.lat, a.lng, b.lat, b.lng);
  }
  return d;
}

/** Label every node with a component id (BFS); return labels + component sizes. */
function componentLabels(graph: Graph): {
  comp: Map<number, number>;
  size: Map<number, number>;
} {
  const comp = new Map<number, number>();
  const size = new Map<number, number>();
  let cid = 0;
  for (const startId of graph.keys()) {
    if (comp.has(startId)) continue;
    const queue = [startId];
    comp.set(startId, cid);
    let count = 0;
    while (queue.length) {
      const u = queue.pop()!;
      count++;
      const node = graph.get(u);
      if (!node) continue;
      for (const e of node.adj) {
        if (!comp.has(e.to)) {
          comp.set(e.to, cid);
          queue.push(e.to);
        }
      }
    }
    size.set(cid, count);
    cid++;
  }
  return { comp, size };
}

/**
 * Pick a start node: among nodes near the user, choose the one in the LARGEST
 * connected component, so we never start on an isolated path stub (which would
 * cap the whole route at a couple hundred metres).
 */
function chooseStart(graph: Graph, lat: number, lng: number): number | null {
  const { comp, size } = componentLabels(graph);
  for (const radiusKm of [0.6, 1.2, 2.5, 100]) {
    let best: number | null = null;
    let bestScore = -Infinity;
    for (const [id, n] of graph) {
      if (!n.adj.length) continue;
      const d = haversineKm(lat, lng, n.lat, n.lng);
      if (d > radiusKm) continue;
      const csize = size.get(comp.get(id)!) ?? 0;
      const score = csize * 1000 - d; // component size first, then proximity
      if (score > bestScore) {
        bestScore = score;
        best = id;
      }
    }
    if (best != null) return best;
  }
  return null;
}

// ---------- route generation ----------

function bearingDeg(graph: Graph, a: number, b: number): number {
  const A = graph.get(a)!;
  const B = graph.get(b)!;
  const y = B.lat - A.lat;
  const x = (B.lng - A.lng) * Math.cos((A.lat * Math.PI) / 180);
  return (Math.atan2(x, y) * 180) / Math.PI; // 0 = north
}
function crowKm(graph: Graph, a: number, b: number): number {
  const A = graph.get(a)!;
  const B = graph.get(b)!;
  return haversineKm(A.lat, A.lng, B.lat, B.lng);
}
function angDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

interface TurnOpts {
  seedBearing?: number | null;
  straight?: boolean;
  avoid?: Set<number>;
}

/** Choose a turnaround node ~half km away, optionally biased by bearing/straightness. */
function pickTurn(
  graph: Graph,
  start: number,
  dist: Map<number, number>,
  half: number,
  opts: TurnOpts = {},
): number | null {
  let best: number | null = null;
  let bestScore = -Infinity;
  for (const [id, d] of dist) {
    if (id === start || d <= 0 || opts.avoid?.has(id)) continue;
    let score = -Math.abs(d - half) * 4; // proximity to half-target (km)
    if (opts.straight) score += (crowKm(graph, start, id) / d) * 2; // straighter ⇒ higher
    if (opts.seedBearing != null)
      score += (1 - angDiff(bearingDeg(graph, start, id), opts.seedBearing) / 180) * 1.5;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

function makeLoop(
  graph: Graph,
  start: number,
  prev: Map<number, number>,
  turn: number,
): { nodes: number[]; len: number } | null {
  const out = pathNodes(prev, turn);
  if (out.length < 2) return null;
  const penalty = new Set<string>();
  for (let i = 1; i < out.length; i++) penalty.add(edgeKey(out[i - 1], out[i]));
  const back = dijkstra(graph, turn, penalty);
  if (back.dist.get(start) == null) return null;
  const ret = pathNodes(back.prev, start);
  if (ret.length < 2) return null;
  const nodes = out.concat(ret.slice(1));
  return { nodes, len: realLengthKm(graph, nodes) };
}

function makeOutBack(
  graph: Graph,
  prev: Map<number, number>,
  turn: number,
): { nodes: number[]; len: number } | null {
  const out = pathNodes(prev, turn);
  if (out.length < 2) return null;
  const nodes = out.concat(out.slice(0, -1).reverse());
  return { nodes, len: realLengthKm(graph, nodes) };
}

type Shape = 'loop' | 'line' | 'auto';

/**
 * Build ONE route ≈ targetKm. Tries a loop (roundest) or a straight out-and-back
 * (most rectilinear) for the main chunk, then combines extra legs to reach the
 * target. Always yields a valid route for a connected start — never errors out,
 * even for tiny distances or when no loop exists.
 */
function buildRoute(
  graph: Graph,
  start: number,
  dist: Map<number, number>,
  prev: Map<number, number>,
  targetKm: number,
  shape: Shape,
  seedBearing: number | null,
): { nodes: number[]; len: number; isLoop: boolean } | null {
  const reach = [...dist.values()].reduce((m, d) => Math.max(m, d), 0);
  if (reach < 0.03) return null;
  const mainKm = Math.min(targetKm, reach * 1.9);

  let nodes: number[] = [];
  let total = 0;
  let isLoop = false;

  if (shape !== 'line') {
    const turn = pickTurn(graph, start, dist, mainKm / 2, { seedBearing });
    const loop = turn != null ? makeLoop(graph, start, prev, turn) : null;
    if (loop && loop.len <= targetKm * 1.25) {
      nodes = loop.nodes;
      total = loop.len;
      isLoop = true;
    }
  }
  if (!nodes.length) {
    // straightest (most rectilinear) out-and-back
    const turn = pickTurn(graph, start, dist, mainKm / 2, { seedBearing, straight: true });
    const ob = turn != null ? makeOutBack(graph, prev, turn) : null;
    if (ob) {
      nodes = ob.nodes;
      total = ob.len;
    }
  }

  // combine extra legs to approach the target distance
  const used = new Set<number>();
  let guard = 0;
  while (total < targetKm * 0.92 && guard < 80) {
    guard++;
    const legHalf = Math.min(targetKm - total, reach * 1.9) / 2;
    let turn = pickTurn(graph, start, dist, legHalf, { seedBearing, avoid: used });
    if (turn == null) turn = pickTurn(graph, start, dist, legHalf);
    if (turn == null) break;
    const ob = makeOutBack(graph, prev, turn);
    if (!ob || ob.len < 0.05) break;
    used.add(turn);
    nodes = nodes.length ? nodes.concat(ob.nodes.slice(1)) : ob.nodes;
    total += ob.len;
    isLoop = false;
  }

  if (nodes.length < 2) return null;
  return { nodes, len: total, isLoop };
}

/** Pick the next hop node ~hopLen from `current`, drifting away from start. */
function pickHop(
  graph: Graph,
  current: number,
  start: number,
  distFromCur: Map<number, number>,
  distFromStart: Map<number, number>,
  hopLen: number,
  seedBearing: number | null,
  visited: Set<number>,
): number | null {
  let best: number | null = null;
  let bestScore = -Infinity;
  for (const [id, d] of distFromCur) {
    if (id === current || id === start || d <= 0 || visited.has(id)) continue;
    let score = -Math.abs(d - hopLen) * 4;
    score += (distFromStart.get(id) ?? 0) * 0.6; // drift outward, away from start
    if (seedBearing != null)
      score += (1 - angDiff(bearingDeg(graph, current, id), seedBearing) / 180) * 1.2;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

/**
 * Build a POINT-TO-POINT route ≈ targetKm that ends at a DIFFERENT place than
 * the start. If a node ~target away exists, route straight to it; otherwise
 * chain hops outward (drifting away from start) until the distance is reached.
 */
function buildOpenRoute(
  graph: Graph,
  start: number,
  dist0: Map<number, number>,
  prev0: Map<number, number>,
  targetKm: number,
  seedBearing: number | null,
): { nodes: number[]; len: number; isLoop: boolean } | null {
  const reach = [...dist0.values()].reduce((m, d) => Math.max(m, d), 0);
  if (reach < 0.03) return null;

  // simple case: an endpoint ~target away exists
  if (reach >= targetKm * 0.85) {
    let best: number | null = null;
    let bestScore = -Infinity;
    for (const [id, d] of dist0) {
      if (id === start || d <= 0) continue;
      let score = -Math.abs(d - targetKm) * 4;
      if (seedBearing != null)
        score += (1 - angDiff(bearingDeg(graph, start, id), seedBearing) / 180) * 1.5;
      if (score > bestScore) {
        bestScore = score;
        best = id;
      }
    }
    if (best != null) {
      const nodes = pathNodes(prev0, best);
      if (nodes.length >= 2) return { nodes, len: realLengthKm(graph, nodes), isLoop: false };
    }
  }

  // chain hops outward until we reach the target distance
  let current = start;
  let nodes: number[] = [start];
  let total = 0;
  const visited = new Set<number>([start]);
  let dCur = dist0;
  let pCur = prev0;
  let guard = 0;
  while (total < targetKm * 0.9 && guard < 40) {
    guard++;
    const hopLen = Math.min(targetKm - total, reach * 0.95);
    const next = pickHop(graph, current, start, dCur, dist0, hopLen, seedBearing, visited);
    if (next == null) break;
    const seg = pathNodes(pCur, next);
    if (seg.length < 2) break;
    nodes = nodes.concat(seg.slice(1));
    total += realLengthKm(graph, seg);
    for (const n of seg) visited.add(n);
    current = next;
    const dj = dijkstra(graph, current);
    dCur = dj.dist;
    pCur = dj.prev;
  }
  if (nodes.length < 2) return null;
  return { nodes, len: total, isLoop: false };
}

// ---------- elevation (open-meteo) for slope-target scoring ----------

const OPEN_METEO_ELEVATION = 'https://api.open-meteo.com/v1/elevation';

function sampleNodes(nodes: number[], n: number): number[] {
  if (nodes.length <= n) return nodes;
  const out: number[] = [];
  const step = (nodes.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(nodes[Math.round(i * step)]);
  return out;
}

async function lookupElevations(coords: [number, number][]): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < coords.length; i += 100) {
    const chunk = coords.slice(i, i + 100);
    const lat = chunk.map((c) => c[1]).join(',');
    const lng = chunk.map((c) => c[0]).join(',');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(`${OPEN_METEO_ELEVATION}?latitude=${lat}&longitude=${lng}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error(`elev ${r.status}`);
      out.push(...((await r.json()) as { elevation: number[] }).elevation);
    } finally {
      clearTimeout(timer);
    }
  }
  return out;
}

function gainFromSeries(eles: number[]): number {
  let g = 0;
  for (let i = 1; i < eles.length; i++) {
    const d = eles[i] - eles[i - 1];
    if (d > 0) g += d;
  }
  return Math.round(g);
}

function nodesToCoords(graph: Graph, nodes: number[]): [number, number][] {
  return nodes.map((n) => {
    const g = graph.get(n)!;
    return [g.lng, g.lat] as [number, number];
  });
}

/** Steepness 1 (flat) … 10 (extremely steep) from metres of climb per km. */
export function slopeScore(gainM: number, distKm: number): number {
  const gpk = distKm > 0 ? gainM / distKm : 0;
  return Math.max(1, Math.min(10, Math.round(1 + gpk / 15)));
}

// ---------- public entry ----------

export async function generateRoute(
  lat: number,
  lng: number,
  targetKm: number,
  slopeTarget?: number | null,
  returnToStart = true,
  variant = 0,
): Promise<GeneratedRoute> {
  // A loop only needs to span ~half the target (turnaround); a point-to-point
  // route needs to span ~the whole target (the endpoint is that far away).
  const radiusKm = returnToStart
    ? Math.min(4.5, Math.max(1.5, targetKm * 0.5))
    : Math.min(8, Math.max(1.5, targetKm * 0.95));
  const graph = await fetchGraph(lat, lng, Math.round(radiusKm * 1000));
  const start = chooseStart(graph, lat, lng);
  if (start == null) throw new Error('Aucun chemin trouvé à proximité');
  const { dist, prev } = dijkstra(graph, start);

  // `variant` rotates the search directions so successive "regenerate" calls
  // explore different parts of the network → a genuinely different route.
  const off = (variant * 47) % 360;

  type Built = { nodes: number[]; len: number; isLoop: boolean };
  let built: Built[];
  if (returnToStart) {
    const specs: { shape: Shape; bearing: number | null }[] = [
      { shape: 'auto', bearing: off },
      { shape: 'auto', bearing: (off + 72) % 360 },
      { shape: 'auto', bearing: (off + 144) % 360 },
      { shape: 'auto', bearing: (off + 216) % 360 },
      { shape: 'auto', bearing: (off + 288) % 360 },
      { shape: 'loop', bearing: null },
      { shape: 'line', bearing: off },
    ];
    built = specs
      .map((s) => buildRoute(graph, start, dist, prev, targetKm, s.shape, s.bearing))
      .filter((r): r is Built => !!r);
  } else {
    const bearings: (number | null)[] = [
      off,
      (off + 72) % 360,
      (off + 144) % 360,
      (off + 216) % 360,
      (off + 288) % 360,
    ];
    built = bearings
      .map((b) => buildOpenRoute(graph, start, dist, prev, targetKm, b))
      .filter((r): r is Built => !!r);
  }

  if (!built.length) {
    const s = graph.get(start)!;
    return { coordinates: [[s.lng, s.lat]], distanceKm: 0, isLoop: false, elevationGain: 0 };
  }

  // de-dupe by shape + length + midpoint, so different-direction routes of the
  // same length are kept (otherwise variety collapses).
  const sig = (b: Built): string => {
    const mid = graph.get(b.nodes[Math.floor(b.nodes.length / 2)])!;
    return `${b.isLoop}|${b.len.toFixed(1)}|${mid.lat.toFixed(3)},${mid.lng.toFixed(3)}`;
  };
  const seen = new Set<string>();
  const uniq = built.filter((b) => {
    const s = sig(b);
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  });

  let chosen: Built;
  let chosenGain = 0;
  const wantSlope = slopeTarget != null && slopeTarget >= 1;

  if (wantSlope) {
    // score every candidate's elevation in one batched lookup, rank by slope match
    const samples = uniq.map((u) => nodesToCoords(graph, sampleNodes(u.nodes, 12)));
    let gains: number[];
    try {
      const eles = await lookupElevations(samples.flat());
      gains = [];
      let cur = 0;
      for (const s of samples) {
        gains.push(gainFromSeries(eles.slice(cur, cur + s.length)));
        cur += s.length;
      }
    } catch {
      gains = uniq.map(() => 0);
    }
    const scored = uniq
      .map((u, i) => ({
        u,
        gain: gains[i],
        distErr: Math.abs(u.len - targetKm) / targetKm,
        slopeErr: Math.abs(slopeScore(gains[i], u.len) - slopeTarget!),
      }))
      .sort((a, b) => a.slopeErr - b.slopeErr || a.distErr - b.distErr);
    const winner = scored[variant % scored.length]; // rotate through alternatives
    chosen = winner.u;
    chosenGain = winner.gain;
  } else {
    // rank by closeness to target distance, prefer a loop on ties
    uniq.sort((a, b) => {
      const da = Math.abs(a.len - targetKm);
      const db = Math.abs(b.len - targetKm);
      if (Math.abs(da - db) > 0.2) return da - db;
      return (b.isLoop ? 1 : 0) - (a.isLoop ? 1 : 0);
    });
    chosen = uniq[variant % uniq.length]; // rotate through alternatives
    try {
      chosenGain = gainFromSeries(await lookupElevations(nodesToCoords(graph, sampleNodes(chosen.nodes, 30))));
    } catch {
      chosenGain = 0;
    }
  }

  return {
    coordinates: pathCoords(graph, chosen.nodes),
    distanceKm: Math.round(chosen.len * 100) / 100,
    isLoop: chosen.isLoop,
    elevationGain: chosenGain,
  };
}
