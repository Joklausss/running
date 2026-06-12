import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PlannedSession } from '../../types';
import { api } from '../../services/api';
import { DAY_LABELS, DAY_LABELS_LONG, SESSION_META, formatPace } from './sessionMeta';

export default function SessionModal({
  session,
  onClose,
  onChanged,
}: {
  session: PlannedSession;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const navigate = useNavigate();
  const meta = SESSION_META[session.session_type];
  const paceMin = formatPace(session.target_pace_min);
  const paceMax = formatPace(session.target_pace_max);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sessionLabel = `${DAY_LABELS[session.day_of_week]} · S${session.week_number} · ${meta.label}`;

  function goAssociate() {
    const p = new URLSearchParams({
      associateTo: session.id,
      for: sessionLabel,
      tkm: Number(session.estimated_km).toFixed(1),
    });
    navigate(`/routes?${p.toString()}`);
  }

  function goTrack() {
    const p = new URLSearchParams({ session: session.id, label: sessionLabel });
    if (session.target_pace_min) p.set('tpmin', session.target_pace_min);
    p.set('tkm', Number(session.estimated_km).toFixed(1));
    navigate(`/track?${p.toString()}`);
  }

  async function removeRoute() {
    await api.unassociateRoute(session.id);
    onChanged?.();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card w-full sm:max-w-md max-h-[88vh] overflow-y-auto rounded-b-none sm:rounded-2xl p-5 animate-fadeUp"
        style={{ borderTop: `4px solid ${meta.color}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted">
              {DAY_LABELS_LONG[session.day_of_week]} · Semaine{' '}
              {session.week_number}
            </p>
            <h3 className="text-xl mt-0.5">
              {meta.icon} {meta.label}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-text text-xl leading-none"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <Metric label="Durée" value={`${session.duration_min} min`} />
          <Metric label="Distance" value={`${Number(session.estimated_km).toFixed(1)} km`} />
          <Metric
            label="Allure cible"
            value={paceMin ? paceMin.replace(' /km', '') : 'effort'}
          />
        </div>

        {paceMin && paceMax && (
          <p className="metric text-xs text-muted mt-2 text-center">
            Fourchette : {paceMax} (lent) → {paceMin} (rapide)
          </p>
        )}

        {/* Full prescription */}
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-muted mb-1">
            Déroulé de la séance
          </p>
          <p className="leading-relaxed text-sm">{session.description}</p>
        </div>

        {session.target_hr_zone && (
          <p className="text-sm text-muted mt-3">
            🫀 {session.target_hr_zone}
          </p>
        )}

        {/* Associated route */}
        {session.route_id && session.route_name ? (
          <div className="mt-4 card p-3 flex items-center gap-3 border-primary/30">
            <span className="text-lg">🗺️</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted">Itinéraire associé</p>
              <p className="font-semibold truncate">{session.route_name}</p>
              {session.route_distance_km != null && (
                <p className="metric text-sm text-muted">
                  {Number(session.route_distance_km).toFixed(1)} km
                </p>
              )}
            </div>
            <button
              onClick={removeRoute}
              className="text-muted hover:text-accent text-sm shrink-0"
            >
              Retirer
            </button>
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button className="btn-ghost" onClick={goAssociate}>
            🗺️ {session.route_id ? 'Changer d’itinéraire' : 'Générer un itinéraire'}
          </button>
          <button className="btn-primary" onClick={goTrack}>
            ▶︎ Démarrer
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 rounded-xl p-2.5 text-center">
      <p className="metric font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted mt-0.5">
        {label}
      </p>
    </div>
  );
}
