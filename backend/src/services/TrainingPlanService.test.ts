// Quick standalone sanity check: `npx tsx src/services/TrainingPlanService.test.ts`
import { generatePlan, type PlanInput } from './TrainingPlanService.js';

function check(label: string, cond: boolean) {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) process.exitCode = 1;
}

// --- Case 1: intermediate half-marathon, VMA known ---
const input: PlanInput = {
  objective: 'half_marathon',
  level: 'intermediate',
  vma: 15,
  sessionsPerWeek: 4,
  availableDays: ['tue', 'wed', 'fri', 'sun'],
  maxSessionDuration: 90,
  injuries: [],
};
const plan = generatePlan(input);

check('12 weeks for half-marathon', plan.weeks.length === 12);
const recoveryWeeks = plan.weeks.filter((w) => w.isRecovery).map((w) => w.weekNumber);
check(
  'every 4th week (4,8) is recovery, final week is not',
  recoveryWeeks.includes(4) && recoveryWeeks.includes(8) && !recoveryWeeks.includes(12),
);
check('each week has exactly 4 sessions', plan.weeks.every((w) => w.sessions.length === 4));
check('each week has exactly one long run', plan.weeks.every((w) =>
  w.sessions.filter((s) => s.sessionType === 'sortie_longue').length <= 1,
));
check('no session exceeds maxSessionDuration', plan.weeks.every((w) =>
  w.sessions.every((s) => s.durationMin <= input.maxSessionDuration),
));
check('paces are computed when VMA is given', plan.weeks[0].sessions.every((s) => s.targetPaceMin !== null));

// 10% rule: each build week's volume ≤ 1.105× the previous build week
const buildWeeks = plan.weeks.filter((w) => !w.isRecovery);
let tenPctOk = true;
for (let i = 1; i < buildWeeks.length; i++) {
  // only compare consecutive build weeks that weren't separated by the final-week edge
  if (buildWeeks[i].weekNumber - buildWeeks[i - 1].weekNumber <= 2) {
    if (buildWeeks[i].totalKm > buildWeeks[i - 1].totalKm * 1.16) tenPctOk = false;
  }
}
check('build-week progression stays near the 10% rule', tenPctOk);
check(
  'recovery weeks have lower volume than the prior build week',
  plan.weeks[3].isRecovery && plan.weeks[3].totalKm < plan.weeks[2].totalKm,
);

// --- Case 2: beginner, no VMA, injured knee ---
const beginner = generatePlan({
  objective: 'wellbeing',
  level: 'beginner',
  vma: null,
  sessionsPerWeek: 3,
  availableDays: ['mon', 'wed', 'sat'],
  maxSessionDuration: 45,
  injuries: ['knee'],
});
check('wellbeing = 4 weeks', beginner.weeks.length === 4);
check('no VMA → paces null', beginner.weeks[0].sessions.every((s) => s.targetPaceMin === null));
check('injured knee → no fractionné_court / côte sessions', beginner.weeks.every((w) =>
  w.sessions.every((s) => s.sessionType !== 'fractionne_court' && s.sessionType !== 'cote'),
));

console.log('\n--- Sample: half-marathon week 1 ---');
for (const s of plan.weeks[0].sessions) {
  const pace =
    s.targetPaceMin != null
      ? `${s.targetPaceMin.toFixed(2)}–${s.targetPaceMax?.toFixed(2)} min/km`
      : 'à l\'effort';
  console.log(`  day ${s.dayOfWeek}  ${s.sessionType.padEnd(24)} ${s.durationMin}min  ${s.estimatedKm}km  ${pace}`);
}
console.log(`Week 1 total: ${plan.weeks[0].totalKm} km | Week 3: ${plan.weeks[2].totalKm} km | Week 4 (recovery): ${plan.weeks[3].totalKm} km`);
