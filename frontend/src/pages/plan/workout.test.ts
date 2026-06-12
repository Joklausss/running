// Standalone: `npx tsx src/pages/plan/workout.test.ts`
import { buildWorkout } from './workout.js';
import { buildWorkoutTcx } from './tcx.js';
import type { PlannedSession } from '../../types.js';

let fail = 0;
const check = (l: string, c: boolean) => { console.log(`${c ? '✅' : '❌'} ${l}`); if (!c) fail++; };

function sess(p: Partial<PlannedSession>): PlannedSession {
  return {
    id: 'x', plan_id: 'p', week_number: 6, day_of_week: 2,
    session_type: 'endurance_fondamentale', duration_min: 60,
    description: '', target_pace_min: '5.33', target_pace_max: '6.15',
    target_hr_zone: 'Z2 · 65–75% FCmax', estimated_km: '8.0', route_id: null, order_index: 0,
    ...p,
  } as PlannedSession;
}

// --- fractionné court: warmup + repeat + cooldown ---
const frac = buildWorkout(
  sess({ session_type: 'fractionne_court', duration_min: 50, target_pace_min: '4.21', target_pace_max: '4.44', target_hr_zone: 'Z5 · 95–100% FCmax' }),
  'intermediate',
);
check('3 top-level steps (warmup, repeat, cooldown)', frac.steps.length === 3);
check('middle step is a repeat', frac.steps[1].type === 'repeat');
const rep = frac.steps[1];
check('repeat has work+recovery children', rep.type === 'repeat' && rep.children.length === 2);
check('reps = 12 (intermediate, week6: 8+1+3)', rep.type === 'repeat' && rep.repetitions === 12);
check('work child is 400m distance', rep.type === 'repeat' && rep.children[0].duration.kind === 'distance' && (rep.children[0].duration as any).meters === 400);

// --- TCX (pace mode) ---
const tcxPace = buildWorkoutTcx(frac, 'pace');
check('TCX has Workout Running', /<Workout Sport="Running">/.test(tcxPace));
check('TCX has a Repeat_t step', /xsi:type="Repeat_t"/.test(tcxPace));
check('TCX has Repetitions 12', /<Repetitions>12<\/Repetitions>/.test(tcxPace));
check('TCX has CustomSpeedZone (pace mode)', /CustomSpeedZone_t/.test(tcxPace));
check('TCX distance step 400 m', /<Meters>400<\/Meters>/.test(tcxPace));
// pace 4.21 min/km → 1000/(4.21*60)=3.958 m/s as High bound
check('TCX speed High ≈ 3.96 m/s', /<HighInMetersPerSecond>3\.9\d\d<\/HighInMetersPerSecond>/.test(tcxPace));
check('recovery step is Resting', /<Intensity>Resting<\/Intensity>/.test(tcxPace));

// --- TCX (HR mode) ---
const tcxHr = buildWorkoutTcx(frac, 'hr');
check('HR mode uses PredefinedHeartRateZone', /PredefinedHeartRateZone_t/.test(tcxHr));
check('HR zone number 5 (from Z5)', /<Number>5<\/Number>/.test(tcxHr));
check('HR mode has no speed zone', !/CustomSpeedZone_t/.test(tcxHr));

// --- EF: warmup/work/cooldown, time-based ---
const ef = buildWorkout(sess({ session_type: 'endurance_fondamentale', duration_min: 60 }), 'beginner');
check('EF has 3 steps', ef.steps.length === 3);
check('EF work is time-based', ef.steps[1].type === 'step' && ef.steps[1].duration.kind === 'time');

console.log(fail === 0 ? '\nALL PASSED' : `\n${fail} FAILED`);
if (fail) process.exitCode = 1;
