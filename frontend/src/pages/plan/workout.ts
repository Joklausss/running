// Builds a STRUCTURED workout (warmup / work / recovery / cooldown, with
// repeats and pace/HR targets) from a planned session. Mirrors the deterministic
// structure of the backend TrainingPlanService session descriptions.
import type { Level, PlannedSession, SessionType } from '../../types';

export type StepIntensity = 'warmup' | 'work' | 'recovery' | 'cooldown' | 'active';

export type StepDuration =
  | { kind: 'time'; seconds: number }
  | { kind: 'distance'; meters: number };

export interface Target {
  /** min/km bounds (faster→slower) when the step has a pace target */
  paceMinPerKm?: { fast: number; slow: number } | null;
  /** heart-rate zone number 1..5 */
  hrZone?: number | null;
}

export interface SimpleStep {
  type: 'step';
  intensity: StepIntensity;
  name: string;
  duration: StepDuration;
  target: Target;
}

export interface RepeatStep {
  type: 'repeat';
  repetitions: number;
  children: SimpleStep[];
}

export type WorkoutStep = SimpleStep | RepeatStep;

export interface Workout {
  name: string;
  sport: 'Running';
  steps: WorkoutStep[];
}

// ---- helpers ----

function paceTarget(s: PlannedSession): { fast: number; slow: number } | null {
  if (s.target_pace_min == null || s.target_pace_max == null) return null;
  return { fast: Number(s.target_pace_min), slow: Number(s.target_pace_max) };
}

function hrZoneNumber(s: PlannedSession): number | null {
  const m = s.target_hr_zone?.match(/Z(\d)/);
  return m ? Number(m[1]) : null;
}

// same progression formula as the backend generator
function reps(weekNumber: number, level: Level, base: number, perWeek: number, max: number): number {
  const lvl = level === 'advanced' ? 2 : level === 'intermediate' ? 1 : 0;
  return Math.min(max, base + lvl + Math.floor(weekNumber / 2) * perWeek);
}

const warmup = (min: number): SimpleStep => ({
  type: 'step', intensity: 'warmup', name: 'Échauffement',
  duration: { kind: 'time', seconds: min * 60 }, target: {},
});
const cooldown = (min: number): SimpleStep => ({
  type: 'step', intensity: 'cooldown', name: 'Retour au calme',
  duration: { kind: 'time', seconds: min * 60 }, target: {},
});

export function buildWorkout(session: PlannedSession, level: Level): Workout {
  const dur = session.duration_min;
  const km = Number(session.estimated_km) || 0;
  const pace = paceTarget(session);
  const hr = hrZoneNumber(session);
  const t: SessionType = session.session_type;
  const steps: WorkoutStep[] = [];

  const work = (name: string, d: StepDuration): SimpleStep => ({
    type: 'step', intensity: 'work', name,
    duration: d, target: { paceMinPerKm: pace, hrZone: hr },
  });
  const recover = (seconds: number): SimpleStep => ({
    type: 'step', intensity: 'recovery', name: 'Récupération',
    duration: { kind: 'time', seconds }, target: {},
  });

  switch (t) {
    case 'endurance_fondamentale':
      steps.push(warmup(10));
      steps.push(work('Endurance', { kind: 'time', seconds: Math.max(15, dur - 20) * 60 }));
      steps.push(cooldown(10));
      break;
    case 'recuperation_active':
      steps.push(work('Footing lent', { kind: 'time', seconds: dur * 60 }));
      break;
    case 'tempo':
      steps.push(warmup(15));
      steps.push(work('Tempo (seuil)', { kind: 'time', seconds: Math.max(15, dur - 25) * 60 }));
      steps.push(cooldown(10));
      break;
    case 'fractionne_court':
      steps.push(warmup(15));
      steps.push({
        type: 'repeat', repetitions: reps(session.week_number, level, 8, 1, 14),
        children: [work('400 m vite', { kind: 'distance', meters: 400 }), recover(60)],
      });
      steps.push(cooldown(10));
      break;
    case 'fractionne_long':
      steps.push(warmup(15));
      steps.push({
        type: 'repeat', repetitions: reps(session.week_number, level, 3, 0, 6),
        children: [work('1000 m allure 10K', { kind: 'distance', meters: 1000 }), recover(120)],
      });
      steps.push(cooldown(10));
      break;
    case 'cote':
      steps.push(warmup(15));
      steps.push({
        type: 'repeat', repetitions: reps(session.week_number, level, 6, 1, 12),
        children: [work('Côte 45 s', { kind: 'time', seconds: 45 }), recover(60)],
      });
      steps.push(cooldown(10));
      break;
    case 'sortie_longue':
      steps.push(work('Sortie longue', { kind: 'distance', meters: Math.round(km * 1000) }));
      break;
  }

  return { name: `${SESSION_SHORT[t]} S${session.week_number}`, sport: 'Running', steps };
}

const SESSION_SHORT: Record<SessionType, string> = {
  endurance_fondamentale: 'EF',
  recuperation_active: 'Récup',
  tempo: 'Tempo',
  fractionne_court: 'VMA',
  fractionne_long: 'Frac long',
  sortie_longue: 'Longue',
  cote: 'Côtes',
};
