import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, isAuthed } from '../../services/api';
import { useTracker, clearRunBuffer } from './useTracker';
import { useHeartRate } from './useHeartRate';
import TrackMap from './TrackMap';
import SplitsChart from './SplitsChart';
import {
  avgPaceSecPerKm,
  formatDuration,
  formatPace,
  perKmSplits,
} from './trackingMath';

const MOODS = ['😣', '😕', '😐', '🙂', '😄'];

export default function TrackingPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const sessionId = params.get('session');
  const label = params.get('label');
  const tpmin = params.get('tpmin'); // target pace decimal (faster bound) min/km
  const tkm = params.get('tkm');

  const { hr, hrRef, supported, connected, connect } = useHeartRate();
  const { snap, start, pause, resume, finish } = useTracker({
    plannedSessionId: sessionId,
    hrRef,
  });

  if (!isAuthed()) {
    navigate('/auth?next=/track', { replace: true });
  }

  if (snap.status === 'ready') {
    return (
      <ReadyScreen
        label={label}
        tkm={tkm}
        hrSupported={supported}
        hrConnected={connected}
        onConnectHr={connect}
        onStart={start}
        onCancel={() => navigate(-1)}
      />
    );
  }

  if (snap.status === 'finished') {
    return (
      <SummaryScreen
        snap={snap}
        sessionId={sessionId}
        label={label}
        targetPaceMin={tpmin ? Number(tpmin) : null}
        maxHr={hr}
        onDone={() => navigate('/dashboard')}
      />
    );
  }

  // running / paused
  return (
    <LiveScreen
      snap={snap}
      hr={hr}
      paused={snap.status === 'paused'}
      onPause={pause}
      onResume={resume}
      onFinish={finish}
    />
  );
}

/* ---------------- Ready ---------------- */
function ReadyScreen({
  label,
  tkm,
  hrSupported,
  hrConnected,
  onConnectHr,
  onStart,
  onCancel,
}: {
  label: string | null;
  tkm: string | null;
  hrSupported: boolean;
  hrConnected: boolean;
  onConnectHr: () => void;
  onStart: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="animate-fadeUp max-w-sm w-full">
        <div className="text-6xl mb-4">🏃</div>
        <h1 className="text-3xl">Prêt à courir ?</h1>
        {label && <p className="text-primary mt-2 font-semibold">{label}</p>}
        {tkm && <p className="metric text-muted mt-1">Objectif ~{tkm} km</p>}

        <p className="text-sm text-muted mt-6 leading-relaxed">
          🔒 Tes positions GPS restent sur ton appareil pendant la course et ne
          sont envoyées qu'au moment où tu enregistres la séance.
        </p>

        {hrSupported && (
          <button
            onClick={onConnectHr}
            className="btn-ghost w-full mt-5"
            disabled={hrConnected}
          >
            {hrConnected ? '🫀 Ceinture connectée' : '🫀 Connecter une ceinture cardio'}
          </button>
        )}

        <button onClick={onStart} className="btn-primary w-full mt-3 text-lg py-4">
          ▶︎ Démarrer le suivi GPS
        </button>
        <button onClick={onCancel} className="btn-ghost w-full mt-2">
          Annuler
        </button>
      </div>
    </div>
  );
}

/* ---------------- Live ---------------- */
function LiveScreen({
  snap,
  hr,
  paused,
  onPause,
  onResume,
  onFinish,
}: {
  snap: ReturnType<typeof useTracker>['snap'];
  hr: number | null;
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
}) {
  return (
    <div className="fixed inset-0 flex flex-col">
      {/* Full-screen map */}
      <div className="absolute inset-0">
        <TrackMap points={snap.points} className="h-full w-full" />
      </div>

      {/* GPS / error status */}
      <div className="relative z-[500] p-3">
        {snap.error ? (
          <div className="bg-accent/90 text-black text-sm rounded-lg px-3 py-2 text-center">
            {snap.error}
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 bg-bg/80 backdrop-blur rounded-full px-3 py-1 text-xs text-muted">
            <span className={`w-2 h-2 rounded-full ${snap.points.length ? 'bg-primary' : 'bg-accent'} animate-pulse`} />
            GPS {snap.accuracy ? `±${Math.round(snap.accuracy)}m` : '…'}
            {paused && <span className="text-accent font-semibold">· EN PAUSE</span>}
          </div>
        )}
      </div>

      {/* Metric overlay */}
      <div className="relative z-[500] mt-auto bg-gradient-to-t from-bg via-bg/95 to-transparent pt-12 pb-6 px-5">
        <div className="mx-auto max-w-xl">
          <div className="text-center">
            <p className="metric text-6xl font-bold leading-none">
              {snap.distanceKm.toFixed(2)}
            </p>
            <p className="text-muted text-sm mt-1">kilomètres</p>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-6">
            <Big label="Temps" value={formatDuration(snap.elapsedSec)} />
            <Big label="Allure" value={formatPace(snap.currentPaceSecPerKm)} accent />
            <Big label="Moy." value={formatPace(snap.avgPaceSecPerKm)} />
          </div>
          {hr != null && (
            <p className="metric text-center text-accent mt-3">🫀 {hr} bpm</p>
          )}

          <div className="grid grid-cols-2 gap-3 mt-6">
            {paused ? (
              <button onClick={onResume} className="btn-primary">
                ▶︎ Reprendre
              </button>
            ) : (
              <button onClick={onPause} className="btn-ghost">
                ❚❚ Pause
              </button>
            )}
            <button
              onClick={() => {
                if (confirm('Terminer la course ?')) onFinish();
              }}
              className="btn bg-accent text-black hover:opacity-90"
            >
              ■ Terminer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Big({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-center">
      <p className={`metric text-2xl font-bold ${accent ? 'text-primary' : ''}`}>{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-muted mt-0.5">{label}</p>
    </div>
  );
}

/* ---------------- Summary ---------------- */
function SummaryScreen({
  snap,
  sessionId,
  label,
  targetPaceMin,
  maxHr,
  onDone,
}: {
  snap: ReturnType<typeof useTracker>['snap'];
  sessionId: string | null;
  label: string | null;
  targetPaceMin: number | null;
  maxHr: number | null;
  onDone: () => void;
}) {
  const [rpe, setRpe] = useState(5);
  const [mood, setMood] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const splits = useMemo(() => perKmSplits(snap.points), [snap.points]);
  const avg = avgPaceSecPerKm(snap.distanceKm, snap.elapsedSec);
  const hrs = snap.points.map((p) => p.hr).filter((x): x is number => x != null);
  const avgHr = hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null;
  const maxHrVal = hrs.length ? Math.max(...hrs) : maxHr;

  // comparison vs planned target pace (decimal min/km → sec/km)
  const targetSec = targetPaceMin != null ? targetPaceMin * 60 : null;
  const deltaSec = avg != null && targetSec != null ? avg - targetSec : null;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.saveActivity({
        plannedSessionId: sessionId,
        startedAt: new Date(snap.startedAt ?? Date.now()).toISOString(),
        endedAt: new Date().toISOString(),
        distanceKm: Number(snap.distanceKm.toFixed(3)),
        durationSec: snap.elapsedSec,
        avgPaceSecPerKm: avg != null ? Math.round(avg) : null,
        avgHr,
        maxHr: maxHrVal,
        gpsTrack: snap.points,
        rpe,
        mood: mood != null ? MOODS[mood] : null,
        notes: notes.trim() || null,
      });
      clearRunBuffer();
      onDone();
    } catch {
      setError('Enregistrement impossible (backend démarré ?).');
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen px-5 py-6">
      <div className="mx-auto max-w-xl space-y-4">
        <header className="animate-fadeUp text-center">
          <p className="text-muted text-sm">Course terminée 🎉</p>
          {label && <h1 className="text-xl mt-1">{label}</h1>}
        </header>

        {snap.points.length > 1 && (
          <div className="rounded-2xl overflow-hidden border border-white/5">
            <TrackMap points={snap.points} fitAll className="h-52 w-full" />
          </div>
        )}

        <div className="card p-5 grid grid-cols-2 gap-4">
          <Stat label="Distance" value={`${snap.distanceKm.toFixed(2)} km`} />
          <Stat label="Durée" value={formatDuration(snap.elapsedSec)} />
          <Stat label="Allure moy." value={`${formatPace(avg)} /km`} />
          {avgHr != null && <Stat label="FC moy." value={`${avgHr} bpm`} />}
        </div>

        {deltaSec != null && (
          <div className="card p-4 text-sm">
            <p className="text-muted">Vs objectif de séance</p>
            <p className={`font-semibold mt-1 ${deltaSec <= 0 ? 'text-primary' : 'text-accent'}`}>
              {deltaSec <= 0
                ? `✓ ${formatPace(Math.abs(deltaSec))} /km plus rapide que la cible`
                : `${formatPace(deltaSec)} /km plus lent que la cible (${formatPace(targetSec)} /km)`}
            </p>
          </div>
        )}

        <div className="card p-4">
          <p className="text-sm text-muted mb-2">Allure par kilomètre</p>
          <SplitsChart splits={splits} />
        </div>

        {/* Evaluation */}
        <div className="card p-5 space-y-4">
          <div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Ressenti (RPE)</span>
              <span className="metric text-primary font-bold">{rpe}/10</span>
            </div>
            <input
              type="range" min={1} max={10} value={rpe}
              onChange={(e) => setRpe(Number(e.target.value))}
              className="w-full accent-primary mt-2"
            />
          </div>
          <div>
            <span className="text-sm text-muted">Humeur</span>
            <div className="flex gap-2 mt-2">
              {MOODS.map((m, i) => (
                <button
                  key={m}
                  onClick={() => setMood(i)}
                  className={`text-2xl rounded-xl p-2 flex-1 transition-all ${
                    mood === i ? 'bg-primary/20 ring-1 ring-primary' : 'bg-surface-2'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes libres sur ta séance…"
            rows={2}
            className="w-full rounded-xl bg-surface-2 border border-white/5 px-4 py-3 outline-none focus:border-primary/60 text-sm"
          />
        </div>

        {error && <p className="text-accent text-sm text-center">{error}</p>}

        <button onClick={save} className="btn-primary w-full" disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer la séance'}
        </button>
        <button onClick={onDone} className="btn-ghost w-full">
          Ignorer
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted uppercase tracking-wide">{label}</p>
      <p className="metric mt-0.5 font-bold text-lg">{value}</p>
    </div>
  );
}
