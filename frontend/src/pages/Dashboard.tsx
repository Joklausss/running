import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  api,
  isAuthed,
  loadProfileLocal,
  type ActivitySummary,
} from '../services/api';
import type { PlannedSession, TrainingPlan } from '../types';
import { OBJECTIVES, LEVELS } from './onboarding/options';
import { SESSION_META, DAY_LABELS } from './plan/sessionMeta';
import {
  currentStreak,
  heatmapData,
  totals,
  weekVsLast,
} from './stats/statsMath';
import Heatmap from './stats/Heatmap';
import { pendingCount } from '../services/offlineQueue';

const DAY_MS = 86_400_000;

export default function Dashboard() {
  const navigate = useNavigate();
  const profile = loadProfileLocal();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [sessions, setSessions] = useState<PlannedSession[]>([]);
  const [acts, setActs] = useState<ActivitySummary[]>([]);

  useEffect(() => {
    if (!isAuthed()) return;
    api.getCurrentPlan().then((r) => {
      setPlan(r.plan);
      setSessions(r.sessions ?? []);
    }).catch(() => {});
    api.getActivities().then((r) => setActs(r.activities)).catch(() => {});
  }, []);

  const next = useMemo(() => {
    if (!plan) return null;
    const start = new Date(plan.start_date + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let best: { session: PlannedSession; date: Date } | null = null;
    for (const s of sessions) {
      const d = new Date(start);
      d.setDate(d.getDate() + (s.week_number - 1) * 7 + s.day_of_week);
      if (d.getTime() >= today.getTime() && (!best || d < best.date)) best = { session: s, date: d };
    }
    return best;
  }, [plan, sessions]);

  const week = useMemo(() => weekVsLast(acts), [acts]);
  const streak = useMemo(() => currentStreak(acts), [acts]);
  const tot = useMemo(() => totals(acts), [acts]);
  const heat = useMemo(() => heatmapData(acts), [acts]);

  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted">Tu n’as pas encore configuré ton profil.</p>
        <Link to="/onboarding" className="btn-primary">Commencer l’onboarding</Link>
      </div>
    );
  }

  const objective = OBJECTIVES.find((o) => o.id === profile.objective);
  const level = LEVELS.find((l) => l.id === profile.level);
  const hasPlan = !!plan;

  async function generate() {
    if (!isAuthed()) {
      navigate('/auth?next=/dashboard');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.saveProfile(profile!);
      await api.generatePlan();
      navigate('/plan');
    } catch {
      setError('Génération impossible. Le backend + PostgreSQL sont-ils démarrés ?');
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen px-5 py-8">
      <div className="mx-auto max-w-xl space-y-5">
        <header className="animate-fadeUp">
          <p className="text-muted text-sm">{objective?.title} · {level?.title}</p>
          <h1 className="text-3xl mt-1">{objective?.icon} Tableau de bord</h1>
        </header>

        {pendingCount() > 0 && (
          <div className="rounded-xl bg-accent/10 border border-accent/30 px-4 py-2 text-sm">
            📴 {pendingCount()} course{pendingCount() > 1 ? 's' : ''} en attente de
            synchronisation — elle{pendingCount() > 1 ? 's' : ''} se{pendingCount() > 1 ? 'ront' : 'ra'}{' '}
            envoyée{pendingCount() > 1 ? 's' : ''} dès le retour en ligne.
          </div>
        )}

        {/* Next recommended session */}
        {next && (
          <Link to="/plan" className="card block p-5 hover:border-primary/40">
            <p className="text-xs text-muted">Prochaine séance recommandée</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-2xl">{SESSION_META[next.session.session_type].icon}</span>
              <div className="flex-1">
                <p className="font-semibold">{SESSION_META[next.session.session_type].label}</p>
                <p className="metric text-sm text-muted">
                  {DAY_LABELS[next.session.day_of_week]} · {next.session.duration_min} min · {Number(next.session.estimated_km).toFixed(1)} km
                </p>
              </div>
              <Countdown date={next.date} />
            </div>
          </Link>
        )}

        {/* This week vs last */}
        {acts.length > 0 && (
          <div className="card p-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-muted uppercase tracking-wide">Cette semaine</p>
                <p className="metric text-3xl font-bold text-primary mt-0.5">{week.thisKm} <span className="text-base text-muted">km</span></p>
              </div>
              <Delta thisKm={week.thisKm} lastKm={week.lastKm} />
              <div className="text-right">
                <p className="metric text-xl font-bold">🔥 {streak}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted">streak</p>
              </div>
            </div>
            <div className="mt-4">
              <Heatmap data={heat} />
            </div>
            <p className="metric text-xs text-muted mt-3">
              Total : {tot.distanceKm.toFixed(0)} km · {tot.count} sorties · D+{tot.elevationGain} m
            </p>
          </div>
        )}

        {/* Profile summary */}
        <div className="card p-5 grid grid-cols-2 gap-4">
          <Stat label="Séances / sem." value={String(profile.sessionsPerWeek)} mono />
          <Stat label="Durée max" value={`${profile.maxSessionDuration} min`} mono />
          <Stat label="Jours dispo" value={profile.availableDays.length ? profile.availableDays.join(', ') : '—'} />
          {profile.vma != null && <Stat label="VMA" value={`${profile.vma} km/h`} mono />}
          {profile.locationLabel && <Stat label="Lieu" value={profile.locationLabel} />}
        </div>

        {/* Plan */}
        <div className="card p-5 space-y-3">
          <h2 className="text-lg">🏗️ Programme d’entraînement</h2>
          {error && <p className="text-sm text-accent">{error}</p>}
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={generate} className="btn-primary flex-1" disabled={busy}>
              {busy ? 'Génération…' : hasPlan ? 'Régénérer le programme' : 'Générer mon programme'}
            </button>
            {hasPlan && <Link to="/plan" className="btn-ghost flex-1 text-center">Voir mon programme</Link>}
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <Link to="/track" className="btn-primary">▶︎ Course libre</Link>
          <Link to="/routes" className="btn-ghost">🗺️ Itinéraires</Link>
          <Link to="/stats" className="btn-ghost">📊 Statistiques</Link>
          <Link to="/history" className="btn-ghost">📜 Historique</Link>
        </div>

        <Link to="/onboarding" className="btn-ghost w-full">Modifier mon profil</Link>
      </div>
    </div>
  );
}

function Countdown({ date }: { date: Date }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / DAY_MS);
  const label = days <= 0 ? "Aujourd'hui" : days === 1 ? 'Demain' : `Dans ${days} j`;
  return (
    <span className={`metric text-sm font-semibold ${days <= 0 ? 'text-primary' : 'text-muted'}`}>
      {label}
    </span>
  );
}

function Delta({ thisKm, lastKm }: { thisKm: number; lastKm: number }) {
  if (lastKm === 0) return <span className="text-xs text-muted">—</span>;
  const pct = Math.round(((thisKm - lastKm) / lastKm) * 100);
  const up = pct >= 0;
  return (
    <div className="text-center">
      <p className={`metric font-bold ${up ? 'text-primary' : 'text-accent'}`}>{up ? '▲' : '▼'} {Math.abs(pct)}%</p>
      <p className="text-[10px] uppercase tracking-wide text-muted">vs sem. dern.</p>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted uppercase tracking-wide">{label}</p>
      <p className={`mt-0.5 font-semibold ${mono ? 'metric' : ''}`}>{value}</p>
    </div>
  );
}
