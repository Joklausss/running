import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, isAuthed, type ActivitySummary } from '../../services/api';
import { formatDuration, formatPace } from '../track/trackingMath';
import { SESSION_META } from '../plan/sessionMeta';
import ActivityDetailModal from './ActivityDetailModal';
import type { SessionType } from '../../types';

type Period = 'all' | '7' | '30' | '90';

export default function HistoryPage() {
  const navigate = useNavigate();
  const [acts, setActs] = useState<ActivitySummary[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const [period, setPeriod] = useState<Period>('all');
  const [type, setType] = useState<string>('all');
  const [minKm, setMinKm] = useState(0);

  useEffect(() => {
    if (!isAuthed()) {
      navigate('/auth?next=/history', { replace: true });
      return;
    }
    api.getActivities().then((r) => setActs(r.activities)).catch(() => setActs([]));
  }, [navigate]);

  const types = useMemo(
    () => [...new Set((acts ?? []).map((a) => a.session_type ?? 'libre'))],
    [acts],
  );

  const filtered = useMemo(() => {
    if (!acts) return [];
    const now = Date.now();
    const cutoff = period === 'all' ? 0 : now - Number(period) * 86_400_000;
    return acts.filter((a) => {
      if (+new Date(a.started_at) < cutoff) return false;
      if (type !== 'all' && (a.session_type ?? 'libre') !== type) return false;
      if (a.distance_km < minKm) return false;
      return true;
    });
  }, [acts, period, type, minKm]);

  if (!acts) {
    return <div className="min-h-screen flex items-center justify-center text-muted">Chargement…</div>;
  }

  return (
    <div className="min-h-screen px-5 py-6">
      <div className="mx-auto max-w-xl space-y-4">
        <header>
          <Link to="/dashboard" className="text-muted text-sm hover:text-text">← Dashboard</Link>
          <h1 className="text-2xl mt-1">Historique</h1>
        </header>

        {!acts.length ? (
          <div className="card p-6 text-center text-muted">
            Aucune course enregistrée pour l'instant.
            <div className="mt-3">
              <Link to="/track" className="btn-primary">▶︎ Démarrer une course</Link>
            </div>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="card p-4 grid grid-cols-3 gap-2">
              <Select label="Période" value={period} onChange={(v) => setPeriod(v as Period)}
                options={[['all', 'Tout'], ['7', '7 jours'], ['30', '30 jours'], ['90', '90 jours']]} />
              <Select label="Type" value={type} onChange={setType}
                options={[['all', 'Tous'], ...types.map((t) => [t, t === 'libre' ? 'Libre' : SESSION_META[t as SessionType]?.short ?? t] as [string, string])]} />
              <label className="block">
                <span className="text-[10px] uppercase tracking-wide text-muted">Min {minKm} km</span>
                <input type="range" min={0} max={30} value={minKm} onChange={(e) => setMinKm(Number(e.target.value))} className="w-full accent-primary mt-2" />
              </label>
            </div>

            <p className="text-sm text-muted">{filtered.length} course{filtered.length > 1 ? 's' : ''}</p>

            <div className="space-y-2">
              {filtered.map((a) => {
                const meta = a.session_type ? SESSION_META[a.session_type as SessionType] : null;
                return (
                  <button key={a.id} onClick={() => setOpenId(a.id)}
                    className="card w-full p-3 text-left flex items-center gap-3 hover:border-white/15"
                    style={{ borderLeft: `4px solid ${meta?.color ?? '#6B7280'}` }}>
                    <span className="text-xl">{meta?.icon ?? '🏃'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{meta?.label ?? 'Course libre'}</p>
                      <p className="text-xs text-muted">
                        {new Date(a.started_at).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="metric font-bold">{a.distance_km.toFixed(1)} km</p>
                      <p className="metric text-xs text-muted">
                        {formatPace(a.avg_pace_sec_per_km)} /km · {formatDuration(a.duration_sec)}
                      </p>
                    </div>
                  </button>
                );
              })}
              {!filtered.length && <p className="text-muted text-sm">Aucune course pour ces filtres.</p>}
            </div>
          </>
        )}
      </div>

      {openId && <ActivityDetailModal id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg bg-surface-2 border border-white/5 px-2 py-2 text-sm outline-none focus:border-primary/60">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
