// ============================================================
// Pure stats aggregation over the activity list. No DOM, testable.
// ============================================================

export interface StatActivity {
  started_at: string;
  distance_km: number;
  duration_sec: number;
  avg_pace_sec_per_km: number | null;
  avg_hr: number | null;
  elevation_gain: number;
  rpe: number | null;
  session_type: string | null;
}

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Monday 00:00 of the week containing d (local time). */
export function weekStartMonday(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - dow);
  return x;
}

function shortDate(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

// ---------- weekly volume (last N weeks) ----------

export function weeklyVolume(
  acts: StatActivity[],
  weeks = 12,
): { week: string; km: number }[] {
  const byWeek = new Map<number, number>();
  for (const a of acts) {
    const ws = weekStartMonday(new Date(a.started_at)).getTime();
    byWeek.set(ws, (byWeek.get(ws) ?? 0) + a.distance_km);
  }
  const out: { week: string; km: number }[] = [];
  const thisWeek = weekStartMonday(new Date()).getTime();
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = thisWeek - i * 7 * DAY_MS;
    out.push({
      week: shortDate(new Date(ws)),
      km: Math.round((byWeek.get(ws) ?? 0) * 10) / 10,
    });
  }
  return out;
}

// ---------- pace trend (runs ≥ 1 km, chronological) ----------

export function paceTrend(
  acts: StatActivity[],
): { date: string; pace: number; km: number }[] {
  return acts
    .filter((a) => a.avg_pace_sec_per_km && a.distance_km >= 1)
    .slice()
    .sort((a, b) => +new Date(a.started_at) - +new Date(b.started_at))
    .map((a) => ({
      date: shortDate(new Date(a.started_at)),
      pace: Math.round((a.avg_pace_sec_per_km! / 60) * 100) / 100, // min/km
      km: Math.round(a.distance_km * 10) / 10,
    }));
}

// ---------- session-type distribution ----------

export function typeDistribution(
  acts: StatActivity[],
): { type: string; count: number; km: number }[] {
  const m = new Map<string, { count: number; km: number }>();
  for (const a of acts) {
    const key = a.session_type ?? 'libre';
    const cur = m.get(key) ?? { count: 0, km: 0 };
    cur.count += 1;
    cur.km += a.distance_km;
    m.set(key, cur);
  }
  return [...m.entries()]
    .map(([type, v]) => ({ type, count: v.count, km: Math.round(v.km * 10) / 10 }))
    .sort((a, b) => b.count - a.count);
}

// ---------- HR trend ----------

export function hrTrend(acts: StatActivity[]): { date: string; hr: number }[] {
  return acts
    .filter((a) => a.avg_hr != null)
    .slice()
    .sort((a, b) => +new Date(a.started_at) - +new Date(b.started_at))
    .map((a) => ({ date: shortDate(new Date(a.started_at)), hr: a.avg_hr! }));
}

// ---------- current streak (consecutive days with activity) ----------

export function currentStreak(acts: StatActivity[], today = new Date()): number {
  const days = new Set(acts.map((a) => dayKey(new Date(a.started_at))));
  if (!days.size) return 0;

  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  // streak counts only if there's activity today or yesterday
  let anchor = t;
  if (!days.has(dayKey(t))) {
    const y = new Date(t.getTime() - DAY_MS);
    if (!days.has(dayKey(y))) return 0;
    anchor = y;
  }
  let streak = 0;
  const cur = new Date(anchor);
  while (days.has(dayKey(cur))) {
    streak++;
    cur.setTime(cur.getTime() - DAY_MS);
  }
  return streak;
}

// ---------- totals ----------

export function totals(acts: StatActivity[]): {
  distanceKm: number;
  durationSec: number;
  elevationGain: number;
  count: number;
} {
  return acts.reduce(
    (acc, a) => ({
      distanceKm: acc.distanceKm + a.distance_km,
      durationSec: acc.durationSec + a.duration_sec,
      elevationGain: acc.elevationGain + (a.elevation_gain ?? 0),
      count: acc.count + 1,
    }),
    { distanceKm: 0, durationSec: 0, elevationGain: 0, count: 0 },
  );
}

// ---------- training load: simplified CTL / ATL / TSB ----------
// Session load = sRPE (Foster): RPE(1-10) × duration_min. CTL = 42-day EWMA
// (chronic/fitness), ATL = 7-day EWMA (acute/fatigue), TSB = CTL − ATL (form).

export function trainingLoad(
  acts: StatActivity[],
  today = new Date(),
): { ctl: number; atl: number; tsb: number } {
  if (!acts.length) return { ctl: 0, atl: 0, tsb: 0 };

  const loadByDay = new Map<string, number>();
  for (const a of acts) {
    const rpe = a.rpe ?? 5;
    const load = rpe * (a.duration_sec / 60);
    const key = dayKey(new Date(a.started_at));
    loadByDay.set(key, (loadByDay.get(key) ?? 0) + load);
  }

  const start = [...acts]
    .map((a) => new Date(a.started_at).getTime())
    .reduce((m, t) => Math.min(m, t), Infinity);
  const t0 = new Date(start);
  t0.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setHours(0, 0, 0, 0);

  let ctl = 0;
  let atl = 0;
  for (let t = t0.getTime(); t <= end.getTime(); t += DAY_MS) {
    const load = loadByDay.get(dayKey(new Date(t))) ?? 0;
    ctl += (load - ctl) / 42;
    atl += (load - atl) / 7;
  }
  const ctlR = Math.round(ctl);
  const atlR = Math.round(atl);
  return { ctl: ctlR, atl: atlR, tsb: ctlR - atlR };
}

// ---------- this week vs last week ----------

export function weekVsLast(
  acts: StatActivity[],
  today = new Date(),
): { thisKm: number; lastKm: number } {
  const thisStart = weekStartMonday(today).getTime();
  const lastStart = thisStart - 7 * DAY_MS;
  let thisKm = 0;
  let lastKm = 0;
  for (const a of acts) {
    const ws = weekStartMonday(new Date(a.started_at)).getTime();
    if (ws === thisStart) thisKm += a.distance_km;
    else if (ws === lastStart) lastKm += a.distance_km;
  }
  return {
    thisKm: Math.round(thisKm * 10) / 10,
    lastKm: Math.round(lastKm * 10) / 10,
  };
}

// ---------- activity heatmap (GitHub-style, last N weeks) ----------

export function heatmapData(
  acts: StatActivity[],
  weeks = 16,
  today = new Date(),
): { date: string; km: number }[] {
  const kmByDay = new Map<string, number>();
  for (const a of acts) {
    const k = dayKey(new Date(a.started_at));
    kmByDay.set(k, (kmByDay.get(k) ?? 0) + a.distance_km);
  }
  const end = weekStartMonday(today);
  end.setDate(end.getDate() + 7); // include current week fully
  const totalDays = weeks * 7;
  const startMs = end.getTime() - totalDays * DAY_MS;
  const out: { date: string; km: number }[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startMs + i * DAY_MS);
    out.push({ date: dayKey(d), km: Math.round((kmByDay.get(dayKey(d)) ?? 0) * 10) / 10 });
  }
  return out;
}
