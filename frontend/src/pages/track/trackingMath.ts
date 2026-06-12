// ============================================================
// Pure tracking math — no DOM/browser APIs, fully unit-testable.
// Implements the spec's GPS algorithms: Haversine distance,
// aberrant-point filtering, 30s sliding-average pace, per-km splits.
// ============================================================

export interface TrackPoint {
  lat: number;
  lng: number;
  t: number; // epoch milliseconds
  hr?: number; // optional heart rate (bpm)
}

const R_EARTH_KM = 6371;

export function haversineKm(a: TrackPoint, b: TrackPoint): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.sqrt(h));
}

/**
 * Reject GPS jumps: a move > 50 m in under 3 s is physically implausible
 * (teleport / signal glitch) and should be ignored. Also rejects
 * non-advancing timestamps.
 */
export function isAberrant(prev: TrackPoint, next: TrackPoint): boolean {
  const dtSec = (next.t - prev.t) / 1000;
  if (dtSec <= 0) return true;
  const meters = haversineKm(prev, next) * 1000;
  if (meters > 50 && dtSec < 3) return true;
  return false;
}

export function totalDistanceKm(points: TrackPoint[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversineKm(points[i - 1], points[i]);
  return d;
}

/** Average pace (seconds per km) over a whole run. null if no distance. */
export function avgPaceSecPerKm(distanceKm: number, durationSec: number): number | null {
  if (distanceKm <= 0) return null;
  return durationSec / distanceKm;
}

/**
 * Smoothed current pace: average over the points recorded in the last
 * `windowSec` seconds (default 30s). null until enough data accrues.
 */
export function movingPaceSecPerKm(
  points: TrackPoint[],
  windowSec = 30,
): number | null {
  if (points.length < 2) return null;
  const now = points[points.length - 1].t;
  const cutoff = now - windowSec * 1000;
  const window = points.filter((p) => p.t >= cutoff);
  if (window.length < 2) return null;
  const dist = totalDistanceKm(window);
  const secs = (window[window.length - 1].t - window[0].t) / 1000;
  if (dist < 0.005) return null; // < 5m → effectively stopped
  return secs / dist;
}

/** Per-kilometre splits: time taken for each completed km. */
export function perKmSplits(points: TrackPoint[]): {
  km: number;
  paceSecPerKm: number;
}[] {
  const splits: { km: number; paceSecPerKm: number }[] = [];
  if (points.length < 2) return splits;

  let cumDist = 0;
  let kmIndex = 1;
  let kmStartTime = points[0].t;

  for (let i = 1; i < points.length; i++) {
    const segKm = haversineKm(points[i - 1], points[i]);
    cumDist += segKm;
    while (cumDist >= kmIndex) {
      // interpolate the time at which this exact km boundary was crossed
      const over = cumDist - kmIndex;
      const frac = segKm > 0 ? 1 - over / segKm : 1;
      const crossT = points[i - 1].t + frac * (points[i].t - points[i - 1].t);
      splits.push({
        km: kmIndex,
        paceSecPerKm: (crossT - kmStartTime) / 1000,
      });
      kmStartTime = crossT;
      kmIndex++;
    }
  }
  return splits;
}

// ---------- formatters ----------

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** seconds-per-km → "m:ss" */
export function formatPace(secPerKm: number | null): string {
  if (secPerKm == null || !Number.isFinite(secPerKm)) return '--:--';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  const ss = s === 60 ? '00' : String(s).padStart(2, '0');
  return `${s === 60 ? m + 1 : m}:${ss}`;
}
