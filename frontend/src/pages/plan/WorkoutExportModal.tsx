import { useEffect, useState } from 'react';
import type { GeoJSONLineString, Level, PlannedSession } from '../../types';
import { loadProfileLocal } from '../../services/api';
import { buildWorkout, type SimpleStep, type WorkoutStep } from './workout';
import { downloadTcx, type TargetMode } from './tcx';
import { downloadGpx } from '../routes/gpx';
import { SESSION_META } from './sessionMeta';

function fmtDuration(d: SimpleStep['duration']): string {
  if (d.kind === 'distance') {
    return d.meters >= 1000 ? `${(d.meters / 1000).toFixed(1)} km` : `${d.meters} m`;
  }
  return d.seconds >= 60 ? `${Math.round(d.seconds / 60)} min` : `${d.seconds} s`;
}

const INTENSITY_COLOR: Record<SimpleStep['intensity'], string> = {
  warmup: '#38BDF8',
  work: '#FF6B35',
  recovery: '#6B7280',
  cooldown: '#38BDF8',
  active: '#00C853',
};

function StepRow({ step, mode }: { step: SimpleStep; mode: TargetMode }) {
  const target =
    mode === 'hr' && step.target.hrZone
      ? `Z${step.target.hrZone}`
      : mode === 'pace' && step.target.paceMinPerKm
        ? `${step.target.paceMinPerKm.fast.toFixed(1)}–${step.target.paceMinPerKm.slow.toFixed(1)} min/km`
        : '—';
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-1.5 h-6 rounded-full shrink-0" style={{ background: INTENSITY_COLOR[step.intensity] }} />
      <span className="flex-1 text-sm">{step.name}</span>
      <span className="metric text-sm">{fmtDuration(step.duration)}</span>
      <span className="metric text-xs text-muted w-28 text-right">{target}</span>
    </div>
  );
}

export default function WorkoutExportModal({
  session,
  routeGeojson,
  routeName,
  onClose,
}: {
  session: PlannedSession;
  routeGeojson?: GeoJSONLineString | null;
  routeName?: string | null;
  onClose: () => void;
}) {
  const level: Level = loadProfileLocal()?.level ?? 'beginner';
  const workout = buildWorkout(session, level);
  const [mode, setMode] = useState<TargetMode>('pace');
  const meta = SESSION_META[session.session_type];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-2xl p-5 animate-fadeUp" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted">Exporter vers Apple Watch</p>
            <h3 className="text-xl mt-0.5">⌚ {meta.icon} {meta.label}</h3>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text text-xl leading-none" aria-label="Fermer">✕</button>
        </div>

        {/* Target mode */}
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-muted mb-1">Cibles d'intensité</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode('pace')}
              className={`rounded-xl py-2 text-sm font-medium ${mode === 'pace' ? 'bg-primary text-black' : 'bg-surface-2 text-muted'}`}
            >
              Allure (min/km)
            </button>
            <button
              onClick={() => setMode('hr')}
              className={`rounded-xl py-2 text-sm font-medium ${mode === 'hr' ? 'bg-primary text-black' : 'bg-surface-2 text-muted'}`}
            >
              Fréquence cardiaque
            </button>
          </div>
        </div>

        {/* Structured steps preview */}
        <div className="mt-4 card p-3 divide-y divide-white/5">
          {workout.steps.map((s: WorkoutStep, i) =>
            s.type === 'step' ? (
              <StepRow key={i} step={s} mode={mode} />
            ) : (
              <div key={i} className="py-1.5">
                <p className="text-sm font-semibold text-primary">{s.repetitions} ×</p>
                <div className="pl-3 border-l border-white/10 ml-0.5">
                  {s.children.map((c, j) => <StepRow key={j} step={c} mode={mode} />)}
                </div>
              </div>
            ),
          )}
        </div>

        {/* Downloads */}
        <div className="mt-4 space-y-2">
          <button className="btn-primary w-full" onClick={() => downloadTcx(workout, mode)}>
            ⤓ Entraînement structuré (.tcx)
          </button>
          {routeGeojson && (
            <button
              className="btn-ghost w-full"
              onClick={() => downloadGpx(routeName ?? workout.name, routeGeojson)}
            >
              ⤓ Itinéraire (.gpx)
            </button>
          )}
        </div>

        {/* How-to */}
        <div className="mt-4 text-xs text-muted leading-relaxed">
          <p className="font-semibold text-text">Sur ton iPhone</p>
          <p className="mt-1">
            Ouvre le <strong>.tcx</strong> (et le <strong>.gpx</strong>) dans une app
            running tierce qui pilote l'Apple Watch — ex. <strong>WorkOutDoors</strong>.
            L'entraînement structuré et l'itinéraire seront jouables sur la montre,
            <strong> y compris sur d'anciennes watchOS</strong> (ces apps n'exigent pas
            l'app Exercice native). Transfère les fichiers via AirDrop, iCloud Drive ou e-mail.
          </p>
        </div>
      </div>
    </div>
  );
}
