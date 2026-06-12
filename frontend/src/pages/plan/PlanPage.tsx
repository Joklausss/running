import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PlannedSession, TrainingPlan } from '../../types';
import { api, isAuthed } from '../../services/api';
import { DAY_LABELS, SESSION_META, formatPace } from './sessionMeta';
import SessionModal from './SessionModal';

export default function PlanPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [sessions, setSessions] = useState<PlannedSession[]>([]);
  const [week, setWeek] = useState(1);
  const [open, setOpen] = useState<PlannedSession | null>(null);

  function refetch() {
    return api
      .getCurrentPlan()
      .then((res) => {
        setPlan(res.plan);
        setSessions(res.sessions ?? []);
      })
      .catch(() => setPlan(null))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!isAuthed()) {
      navigate('/auth?next=/plan', { replace: true });
      return;
    }
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const weekNumbers = useMemo(
    () => [...new Set(sessions.map((s) => s.week_number))].sort((a, b) => a - b),
    [sessions],
  );

  const weekSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.week_number === week)
        .sort((a, b) => a.day_of_week - b.day_of_week),
    [sessions, week],
  );

  const weekKm = useMemo(
    () => weekSessions.reduce((sum, s) => sum + Number(s.estimated_km), 0),
    [weekSessions],
  );

  // recovery weeks have only EF / récup sessions
  const isRecoveryWeek = useMemo(
    () =>
      weekSessions.length > 0 &&
      weekSessions.every(
        (s) =>
          s.session_type === 'endurance_fondamentale' ||
          s.session_type === 'recuperation_active',
      ),
    [weekSessions],
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted">
        Chargement du programme…
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted">Aucun programme actif pour le moment.</p>
        <Link to="/dashboard" className="btn-primary">
          Générer mon programme
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-10">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-bg/85 backdrop-blur border-b border-white/5 px-5 py-4">
        <div className="mx-auto max-w-xl">
          <div className="flex items-center justify-between">
            <Link to="/dashboard" className="text-muted text-sm hover:text-text">
              ← Dashboard
            </Link>
            <span className="metric text-xs text-muted">
              {plan.start_date} → {plan.end_date}
            </span>
          </div>
          <h1 className="text-xl mt-1">{plan.name}</h1>

          {/* Week pills */}
          <div className="mt-3 -mx-1 flex gap-1.5 overflow-x-auto pb-1">
            {weekNumbers.map((n) => {
              const recovery =
                sessions
                  .filter((s) => s.week_number === n)
                  .every(
                    (s) =>
                      s.session_type === 'endurance_fondamentale' ||
                      s.session_type === 'recuperation_active',
                  );
              return (
                <button
                  key={n}
                  onClick={() => setWeek(n)}
                  className={`metric shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all ${
                    n === week
                      ? 'bg-primary text-black'
                      : recovery
                        ? 'bg-surface-2 text-sky-400'
                        : 'bg-surface-2 text-muted hover:text-text'
                  }`}
                  title={recovery ? 'Semaine de récupération' : undefined}
                >
                  S{n}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-5 pt-5">
        {/* Week summary */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg">
              Semaine {week}
              {isRecoveryWeek && (
                <span className="ml-2 align-middle rounded-full bg-sky-500/15 text-sky-400 text-xs px-2 py-0.5">
                  Récupération
                </span>
              )}
            </h2>
            <p className="text-sm text-muted">
              {weekSessions.length} séance{weekSessions.length > 1 ? 's' : ''}
            </p>
          </div>
          <div className="text-right">
            <p className="metric text-2xl font-bold text-primary">
              {weekKm.toFixed(1)}
            </p>
            <p className="text-xs text-muted">km cette semaine</p>
          </div>
        </div>

        {/* Sessions */}
        <div className="space-y-3">
          {weekSessions.map((s) => {
            const meta = SESSION_META[s.session_type];
            const pace = formatPace(s.target_pace_min);
            const km = Number(s.estimated_km).toFixed(1);
            return (
              <button
                key={s.id}
                onClick={() => setOpen(s)}
                className="card w-full p-4 text-left flex items-center gap-4 hover:border-white/15 transition-all"
                style={{ borderLeft: `4px solid ${meta.color}` }}
              >
                <div className="w-9 text-center">
                  <span className="metric block text-xs text-muted">
                    {DAY_LABELS[s.day_of_week]}
                  </span>
                  <span className="text-lg">{meta.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{meta.label}</p>
                  <p className="metric text-sm text-muted mt-0.5">
                    {s.duration_min} min
                    {km ? ` · ${km} km` : ''}
                    {pace ? ` · ${pace}` : ''}
                  </p>
                  {s.route_id && s.route_name && (
                    <p className="text-xs text-primary mt-0.5 truncate">
                      🗺️ {s.route_name}
                    </p>
                  )}
                </div>
                <span className="text-muted">›</span>
              </button>
            );
          })}
        </div>
      </main>

      {open && (
        <SessionModal
          session={open}
          onClose={() => setOpen(null)}
          onChanged={refetch}
        />
      )}
    </div>
  );
}
