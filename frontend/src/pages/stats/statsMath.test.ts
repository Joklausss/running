// Standalone: `npx tsx src/pages/stats/statsMath.test.ts`
import {
  weeklyVolume,
  paceTrend,
  typeDistribution,
  currentStreak,
  totals,
  trainingLoad,
  weekVsLast,
  heatmapData,
  type StatActivity,
} from './statsMath.js';

let fail = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) fail++;
}

const DAY = 86_400_000;
const FIXED = new Date('2026-06-12T12:00:00'); // a Friday

function mk(daysAgo: number, km: number, extra: Partial<StatActivity> = {}): StatActivity {
  return {
    started_at: new Date(FIXED.getTime() - daysAgo * DAY).toISOString(),
    distance_km: km,
    duration_sec: Math.round((km / 10) * 3600), // 10 km/h
    avg_pace_sec_per_km: 360,
    avg_hr: 150,
    elevation_gain: 20,
    rpe: 6,
    session_type: 'endurance_fondamentale',
    ...extra,
  };
}

// streak: today, yesterday, 2 days ago → 3; gap breaks it
check(
  'streak counts 3 consecutive days incl today',
  currentStreak([mk(0, 5), mk(1, 5), mk(2, 5), mk(4, 5)], FIXED) === 3,
);
check('streak 0 when last run 2+ days ago', currentStreak([mk(3, 5)], FIXED) === 0);
check('streak counts from yesterday if no run today', currentStreak([mk(1, 5), mk(2, 5)], FIXED) === 2);
check('streak 0 for empty', currentStreak([], FIXED) === 0);

// totals
const tt = totals([mk(0, 5), mk(1, 8)]);
check('totals distance 13km', Math.abs(tt.distanceKm - 13) < 0.001);
check('totals count 2 / elevation 40', tt.count === 2 && tt.elevationGain === 40);

// weekly volume: this week (Fri + Mon same week) sums
const wv = weeklyVolume([mk(0, 5), mk(4, 8)], 12);
check('weeklyVolume has 12 weeks', wv.length === 12);
check('current week volume = 13km', Math.abs(wv[wv.length - 1].km - 13) < 0.01);

// week vs last
const wl = weekVsLast([mk(0, 5), mk(8, 10)], FIXED); // 8 days ago = last week
check('weekVsLast this=5 last=10', wl.thisKm === 5 && wl.lastKm === 10);

// distribution
const dist = typeDistribution([
  mk(0, 5, { session_type: 'tempo' }),
  mk(1, 5, { session_type: 'tempo' }),
  mk(2, 5, { session_type: null }),
]);
check('distribution: tempo=2, libre=1', dist[0].type === 'tempo' && dist[0].count === 2 && dist.some((d) => d.type === 'libre'));

// pace trend filters <1km and sorts ascending
const pt = paceTrend([mk(0, 5), mk(2, 0.5), mk(5, 8)]);
check('paceTrend drops <1km run (2 left)', pt.length === 2);
check('paceTrend pace in min/km (6.0)', Math.abs(pt[0].pace - 6) < 0.01);

// training load: more recent load → positive freshness dynamics, numbers finite
const tl = trainingLoad([mk(0, 8), mk(2, 6), mk(5, 10)], FIXED);
check('trainingLoad produces finite CTL/ATL', Number.isFinite(tl.ctl) && Number.isFinite(tl.atl));
check('trainingLoad TSB = CTL - ATL', tl.tsb === tl.ctl - tl.atl);
check('ATL (acute) > CTL (chronic) after recent block', tl.atl >= tl.ctl);

// heatmap shape
const hm = heatmapData([mk(0, 5)], 16, FIXED);
check('heatmap = 16*7 days', hm.length === 16 * 7);
check('heatmap marks a day with km', hm.some((d) => d.km > 0));

console.log(fail === 0 ? '\nALL PASSED' : `\n${fail} FAILED`);
if (fail) process.exitCode = 1;
