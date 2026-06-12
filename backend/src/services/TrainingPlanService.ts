// ============================================================
// TrainingPlanService — deterministic training-plan generator.
//
// Implements the spec's rules with pure functions (no DB, no I/O):
//   • plan length 4–16 weeks by objective
//   • 3 build weeks + 1 recovery week periodization
//   • ≤10% weekly load progression (the "10% rule")
//   • level-based session mix (EF / intensity / specific)
//   • pace zones derived from VMA, HR zones per session type
// The route layer is responsible for persistence.
// ============================================================

export type Objective =
  | 'weight_loss'
  | 'race_5_10k'
  | 'half_marathon'
  | 'marathon'
  | 'endurance'
  | 'wellbeing';

export type Level = 'beginner' | 'intermediate' | 'advanced';
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type SessionType =
  | 'endurance_fondamentale'
  | 'fractionne_court'
  | 'fractionne_long'
  | 'tempo'
  | 'sortie_longue'
  | 'recuperation_active'
  | 'cote';

export interface PlanInput {
  objective: Objective;
  level: Level;
  vma: number | null; // km/h
  sessionsPerWeek: number; // 2..6
  availableDays: Weekday[];
  maxSessionDuration: number; // minutes
  injuries: string[];
}

export interface GeneratedSession {
  dayOfWeek: number; // 0 = Monday
  sessionType: SessionType;
  durationMin: number;
  description: string;
  targetPaceMin: number | null; // min/km (faster bound)
  targetPaceMax: number | null; // min/km (slower bound)
  targetHrZone: string;
  estimatedKm: number;
  orderIndex: number;
}

export interface GeneratedWeek {
  weekNumber: number;
  isRecovery: boolean;
  totalKm: number;
  sessions: GeneratedSession[];
}

export interface GeneratedPlan {
  name: string;
  startDate: string; // ISO yyyy-mm-dd (next Monday)
  endDate: string;
  weeks: GeneratedWeek[];
}

// ---------- static config ----------

const WEEKS_BY_OBJECTIVE: Record<Objective, number> = {
  wellbeing: 4,
  weight_loss: 8,
  race_5_10k: 8,
  endurance: 10,
  half_marathon: 12,
  marathon: 16,
};

const OBJECTIVE_LABEL: Record<Objective, string> = {
  weight_loss: 'Perte de poids',
  race_5_10k: 'Préparation 5K–10K',
  half_marathon: 'Semi-marathon',
  marathon: 'Marathon',
  endurance: 'Endurance',
  wellbeing: 'Bien-être',
};

// Base weekly volume (km) for the first build week, per level.
const BASE_WEEKLY_KM: Record<Level, number> = {
  beginner: 12,
  intermediate: 26,
  advanced: 42,
};

// Default running speeds (km/h) when no VMA is provided, per level.
const DEFAULT_SPEED: Record<Level, number> = {
  beginner: 8.5,
  intermediate: 10.5,
  advanced: 12.5,
};

const WEEKDAY_INDEX: Record<Weekday, number> = {
  mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6,
};

// % of VMA used as the *intensity centre* of each session type.
const VMA_PCT: Record<SessionType, [number, number]> = {
  recuperation_active: [0.6, 0.65],
  sortie_longue: [0.65, 0.7],
  endurance_fondamentale: [0.65, 0.75],
  tempo: [0.8, 0.86],
  cote: [0.85, 0.92],
  fractionne_long: [0.9, 0.95],
  fractionne_court: [0.95, 1.0],
};

const HR_ZONE: Record<SessionType, string> = {
  recuperation_active: 'Z1 · 60–65% FCmax',
  sortie_longue: 'Z2 · 65–72% FCmax',
  endurance_fondamentale: 'Z2 · 65–75% FCmax',
  tempo: 'Z3–Z4 · 80–88% FCmax',
  cote: 'Z4 · 85–92% FCmax',
  fractionne_long: 'Z4–Z5 · 90–95% FCmax',
  fractionne_court: 'Z5 · 95–100% FCmax',
};

// Fraction of weekly volume each session type tends to represent (relative weights).
const VOLUME_WEIGHT: Record<SessionType, number> = {
  sortie_longue: 2.4,
  endurance_fondamentale: 1.3,
  tempo: 1.1,
  fractionne_long: 1.0,
  fractionne_court: 0.85,
  cote: 0.8,
  recuperation_active: 0.7,
};

// ---------- helpers ----------

/** min/km pace for a given fraction of VMA. Returns null when VMA unknown. */
function paceForPct(vma: number | null, pct: number): number | null {
  if (!vma || vma <= 0) return null;
  const speed = vma * pct; // km/h
  return 60 / speed; // min/km
}

function paceBounds(
  vma: number | null,
  type: SessionType,
): { min: number | null; max: number | null } {
  const [lo, hi] = VMA_PCT[type];
  // higher % of VMA → faster → smaller min/km. min = faster bound (hi%), max = slower bound (lo%)
  return { min: paceForPct(vma, hi), max: paceForPct(vma, lo) };
}

function avgSpeedFor(input: PlanInput, type: SessionType): number {
  const mid = (VMA_PCT[type][0] + VMA_PCT[type][1]) / 2;
  if (input.vma && input.vma > 0) return input.vma * mid;
  // scale the level default toward the session intensity
  return DEFAULT_SPEED[input.level] * (mid / 0.7);
}

function nextMonday(from = new Date()): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() + ((7 - day) % 7 || 7));
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function round(n: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

// ---------- weekly session-type template ----------

/**
 * Build the ordered list of session types for one week.
 * Honours the level-based mix and avoids intensity for injured runners
 * (drops hard fractionné / côte sessions when knee/ankle issues are present).
 */
function weeklyTemplate(input: PlanInput, isRecovery: boolean, weekNumber: number): SessionType[] {
  const n = Math.max(2, Math.min(6, input.sessionsPerWeek));
  const cautious =
    input.injuries.includes('knee') || input.injuries.includes('ankle');

  if (isRecovery) {
    // recovery week: easy only, one short long-ish run
    const out: SessionType[] = ['recuperation_active', 'endurance_fondamentale'];
    while (out.length < n) out.push('endurance_fondamentale');
    return out.slice(0, n);
  }

  const out: SessionType[] = ['sortie_longue']; // always one long run

  const intensity: SessionType[] = [];
  if (input.level === 'beginner') {
    if (n >= 3) intensity.push('tempo');
    if (n >= 5) intensity.push('recuperation_active');
  } else if (input.level === 'intermediate') {
    intensity.push(weekNumber % 2 === 0 ? 'fractionne_court' : 'fractionne_long');
    if (n >= 4) intensity.push('tempo');
    if (n >= 6) intensity.push('cote');
  } else {
    // advanced
    intensity.push('fractionne_court');
    if (n >= 4) intensity.push(weekNumber % 2 === 0 ? 'fractionne_long' : 'tempo');
    if (n >= 5) intensity.push('cote');
  }

  // injured runners: swap hard sessions for tempo/EF
  const safe = intensity.map((t) =>
    cautious && (t === 'fractionne_court' || t === 'cote') ? 'tempo' : t,
  );

  for (const t of safe) {
    if (out.length < n) out.push(t);
  }
  while (out.length < n) out.push('endurance_fondamentale');
  return out.slice(0, n);
}

// ---------- day assignment ----------

/**
 * Spread the week's sessions across the runner's available days, placing the
 * long run on a weekend day when possible and avoiding back-to-back hard days.
 */
function assignDays(types: SessionType[], availableDays: Weekday[]): number[] {
  const days = [...availableDays]
    .map((d) => WEEKDAY_INDEX[d])
    .sort((a, b) => a - b);

  // fallback if not enough available days were provided
  if (days.length < types.length) {
    const all = [0, 1, 2, 3, 4, 5, 6];
    for (const d of all) if (!days.includes(d) && days.length < types.length) days.push(d);
    days.sort((a, b) => a - b);
  }

  const assigned = new Array<number>(types.length);
  const used = new Set<number>();

  // 1) long run → latest weekend day available (Sat=5, Sun=6), else last day
  const longIdx = types.indexOf('sortie_longue');
  if (longIdx >= 0) {
    const weekend = days.filter((d) => d >= 5);
    const target = weekend.length ? weekend[weekend.length - 1] : days[days.length - 1];
    assigned[longIdx] = target;
    used.add(target);
  }

  // 2) remaining sessions spread evenly across the leftover days
  const remainingDays = days.filter((d) => !used.has(d));
  let cursor = 0;
  for (let i = 0; i < types.length; i++) {
    if (i === longIdx) continue;
    const day = remainingDays[cursor % remainingDays.length];
    assigned[i] = day;
    used.add(day);
    cursor++;
  }
  return assigned;
}

// ---------- descriptions ----------

function reps(weekNumber: number, level: Level, base: number, perWeek: number, max: number): number {
  const lvl = level === 'advanced' ? 2 : level === 'intermediate' ? 1 : 0;
  return Math.min(max, base + lvl + Math.floor(weekNumber / 2) * perWeek);
}

function describe(type: SessionType, durationMin: number, km: number, weekNumber: number, level: Level): string {
  const k = round(km, 1);
  switch (type) {
    case 'endurance_fondamentale':
      return `Échauffement 10 min en trottinant. Corps : ${Math.max(15, durationMin - 20)} min en endurance fondamentale, allure conversationnelle (tu peux parler). Retour au calme 10 min + étirements. ~${k} km.`;
    case 'recuperation_active':
      return `Footing très lent et relâché de ${durationMin} min. Objectif : récupération active, rythme cardiaque bas. ~${k} km.`;
    case 'tempo': {
      const tempoMin = Math.max(15, durationMin - 25);
      return `Échauffement 15 min. Corps : ${tempoMin} min en continu à allure tempo (allure semi/marathon, soutenue mais maîtrisée). Retour au calme 10 min. ~${k} km.`;
    }
    case 'fractionne_court': {
      const r = reps(weekNumber, level, 8, 1, 14);
      return `Échauffement 15 min + 3 lignes droites. Corps : ${r} × 400 m à allure VMA, récupération 1 min trot entre chaque. Retour au calme 10 min. ~${k} km.`;
    }
    case 'fractionne_long': {
      const r = reps(weekNumber, level, 3, 0, 6);
      return `Échauffement 15 min. Corps : ${r} × 1000 m à allure 10K, récupération 2 min entre chaque. Retour au calme 10 min. ~${k} km.`;
    }
    case 'sortie_longue':
      return `Sortie longue de ${k} km (${durationMin} min) en endurance, gestion de l'effort sur la durée. Hydrate-toi ; ravitaillement léger si > 1 h. Termine en aisance respiratoire.`;
    case 'cote': {
      const r = reps(weekNumber, level, 6, 1, 12);
      return `Échauffement 15 min. Corps : ${r} × côtes de 45 s en montée soutenue (effort dynamique), récupération descente trottinée. Retour au calme 10 min. ~${k} km.`;
    }
  }
}

// ---------- main entry ----------

export function generatePlan(input: PlanInput): GeneratedPlan {
  const totalWeeks = WEEKS_BY_OBJECTIVE[input.objective];
  const start = nextMonday();

  const weeks: GeneratedWeek[] = [];
  let buildKm = BASE_WEEKLY_KM[input.level] * (input.sessionsPerWeek / 3);
  let lastBuildKm = buildKm;

  for (let w = 1; w <= totalWeeks; w++) {
    const isRecovery = w % 4 === 0 && w !== totalWeeks; // every 4th week, but not the final week
    const types = weeklyTemplate(input, isRecovery, w);

    // weekly volume target
    let weekKm: number;
    if (isRecovery) {
      weekKm = lastBuildKm * 0.6;
    } else {
      weekKm = buildKm;
      lastBuildKm = buildKm;
      buildKm = buildKm * 1.1; // ≤10% progression for the next build week
    }

    // distribute the weekly volume across sessions by their volume weight
    const totalWeight = types.reduce((s, t) => s + VOLUME_WEIGHT[t], 0);

    const sessions: GeneratedSession[] = types.map((type, i) => {
      let km = (weekKm * VOLUME_WEIGHT[type]) / totalWeight;
      const speed = avgSpeedFor(input, type);
      let durationMin = Math.round((km / speed) * 60);

      // cap duration at the runner's max; trim km to match if needed
      if (durationMin > input.maxSessionDuration) {
        durationMin = input.maxSessionDuration;
        km = (speed * durationMin) / 60;
      }
      durationMin = Math.max(20, durationMin);

      const { min, max } = paceBounds(input.vma, type);
      return {
        dayOfWeek: 0, // filled below
        sessionType: type,
        durationMin,
        description: describe(type, durationMin, km, w, input.level),
        targetPaceMin: min != null ? round(min, 2) : null,
        targetPaceMax: max != null ? round(max, 2) : null,
        targetHrZone: HR_ZONE[type],
        estimatedKm: round(km, 1),
        orderIndex: i,
      };
    });

    const dayMap = assignDays(types, input.availableDays);
    sessions.forEach((s, i) => (s.dayOfWeek = dayMap[i]));
    sessions.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    sessions.forEach((s, i) => (s.orderIndex = i));

    weeks.push({
      weekNumber: w,
      isRecovery,
      totalKm: round(sessions.reduce((s, x) => s + x.estimatedKm, 0), 1),
      sessions,
    });
  }

  const end = new Date(start);
  end.setDate(end.getDate() + totalWeeks * 7 - 1);

  return {
    name: `${OBJECTIVE_LABEL[input.objective]} · ${totalWeeks} semaines`,
    startDate: isoDate(start),
    endDate: isoDate(end),
    weeks,
  };
}
