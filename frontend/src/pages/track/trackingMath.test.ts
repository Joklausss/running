// Standalone sanity check: `npx tsx src/pages/track/trackingMath.test.ts`
import {
  haversineKm,
  isAberrant,
  totalDistanceKm,
  avgPaceSecPerKm,
  movingPaceSecPerKm,
  perKmSplits,
  formatDuration,
  formatPace,
  type TrackPoint,
} from './trackingMath.js';

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
}
function approx(a: number, b: number, tol = 0.02) {
  return Math.abs(a - b) <= tol;
}

// Haversine: ~111.2 m per 0.001° latitude near the equator-ish
const d = haversineKm({ lat: 45, lng: 4, t: 0 }, { lat: 45.001, lng: 4, t: 0 });
check('haversine 0.001° lat ≈ 0.111 km', approx(d, 0.111, 0.005));

// Aberrant filtering: >50m in <3s rejected; normal step accepted
const base: TrackPoint = { lat: 45, lng: 4, t: 0 };
const teleport: TrackPoint = { lat: 45.002, lng: 4, t: 2000 }; // ~222m in 2s
check('teleport (222m/2s) is aberrant', isAberrant(base, teleport));
const normal: TrackPoint = { lat: 45.0003, lng: 4, t: 4000 }; // ~33m in 4s
check('normal step (33m/4s) is NOT aberrant', !isAberrant(base, normal));
check('non-advancing time is aberrant', isAberrant(base, { lat: 45.01, lng: 4, t: 0 }));

// Build a synthetic steady run: 5 m/s (3:20 /km) heading north, 1 pt/sec for 600s
const run: TrackPoint[] = [];
let lat = 45;
for (let i = 0; i <= 600; i++) {
  run.push({ lat, lng: 4, t: i * 1000 });
  lat += 0.000045; // ~5.0 m per second northward
}
const dist = totalDistanceKm(run);
check('600s @ ~5m/s ≈ 3.0 km total', approx(dist, 3.0, 0.05));

const avg = avgPaceSecPerKm(dist, 600)!;
check('avg pace ≈ 200 s/km (3:20)', approx(avg, 200, 5));

const moving = movingPaceSecPerKm(run, 30)!;
check('30s moving pace ≈ 200 s/km', approx(moving, 200, 8));

check('moving pace null with <2 pts', movingPaceSecPerKm([run[0]]) === null);

const splits = perKmSplits(run);
check('3 km splits produced', splits.length === 3);
check('each split ≈ 200s', splits.every((s) => approx(s.paceSecPerKm, 200, 8)));

// Stopped runner → moving pace null (no movement in window)
const stopped: TrackPoint[] = [
  { lat: 45, lng: 4, t: 0 },
  { lat: 45, lng: 4, t: 15000 },
  { lat: 45, lng: 4, t: 30000 },
];
check('stationary → moving pace null', movingPaceSecPerKm(stopped) === null);

// Formatters
check('formatDuration 3725 → 1:02:05', formatDuration(3725) === '1:02:05');
check('formatDuration 125 → 2:05', formatDuration(125) === '2:05');
check('formatPace 200 → 3:20', formatPace(200) === '3:20');
check('formatPace null → --:--', formatPace(null) === '--:--');

console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
if (failures) process.exitCode = 1;
