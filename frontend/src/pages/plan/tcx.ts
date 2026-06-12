// Serializes a structured Workout to Garmin TCX (TrainingCenterDatabase v2),
// an open format imported by third-party iOS/watchOS apps (e.g. WorkOutDoors).
import type { SimpleStep, Target, Workout, WorkoutStep } from './workout';

export type TargetMode = 'pace' | 'hr';

function paceToMps(minPerKm: number): number {
  return 1000 / (minPerKm * 60);
}

function esc(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!,
  );
}

/** ASCII-fold names (Échauffement → Echauffement) for picky watch parsers. */
function safeName(s: string): string {
  const folded = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '');
  return esc(folded).slice(0, 15);
}

const INTENSITY_TCX: Record<SimpleStep['intensity'], 'Active' | 'Resting'> = {
  warmup: 'Active',
  work: 'Active',
  cooldown: 'Active',
  active: 'Active',
  recovery: 'Resting',
};

function durationXml(d: SimpleStep['duration']): string {
  return d.kind === 'time'
    ? `<Duration xsi:type="Time_t"><Seconds>${Math.round(d.seconds)}</Seconds></Duration>`
    : `<Duration xsi:type="Distance_t"><Meters>${Math.round(d.meters)}</Meters></Duration>`;
}

function targetXml(t: Target, mode: TargetMode): string {
  if (mode === 'hr' && t.hrZone) {
    return `<Target xsi:type="HeartRate_t"><HeartRateZone xsi:type="PredefinedHeartRateZone_t"><Number>${t.hrZone}</Number></HeartRateZone></Target>`;
  }
  if (mode === 'pace' && t.paceMinPerKm) {
    const high = paceToMps(t.paceMinPerKm.fast).toFixed(3); // faster pace ⇒ higher speed
    const low = paceToMps(t.paceMinPerKm.slow).toFixed(3);
    return `<Target xsi:type="Speed_t"><SpeedZone xsi:type="CustomSpeedZone_t"><LowInMetersPerSecond>${low}</LowInMetersPerSecond><HighInMetersPerSecond>${high}</HighInMetersPerSecond></SpeedZone></Target>`;
  }
  return '<Target xsi:type="None_t" />';
}

function stepXml(step: SimpleStep, id: number, mode: TargetMode): string {
  // Step_t element order: StepId, Name, Duration, Intensity, Target
  return `<Step xsi:type="Step_t">
  <StepId>${id}</StepId>
  <Name>${safeName(step.name)}</Name>
  ${durationXml(step.duration)}
  <Intensity>${INTENSITY_TCX[step.intensity]}</Intensity>
  ${targetXml(step.target, mode)}
</Step>`;
}

export function buildWorkoutTcx(workout: Workout, mode: TargetMode): string {
  let id = 0;
  const body = workout.steps
    .map((s: WorkoutStep) => {
      if (s.type === 'step') return stepXml(s, ++id, mode);
      const myId = ++id;
      const children = s.children.map((c) => stepXml(c, ++id, mode)).join('\n');
      return `<Step xsi:type="Repeat_t">
  <StepId>${myId}</StepId>
  <Repetitions>${s.repetitions}</Repetitions>
${children}
</Step>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Workouts>
    <Workout Sport="${workout.sport}">
      <Name>${safeName(workout.name)}</Name>
${body}
    </Workout>
  </Workouts>
</TrainingCenterDatabase>`;
}

export function downloadTcx(workout: Workout, mode: TargetMode): void {
  const blob = new Blob([buildWorkoutTcx(workout, mode)], {
    type: 'application/vnd.garmin.tcx+xml',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${workout.name.replace(/[^\w.-]+/g, '_')}.tcx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
