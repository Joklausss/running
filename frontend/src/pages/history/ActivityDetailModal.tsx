import { useEffect, useState } from 'react';
import { api, type ActivityDetail } from '../../services/api';
import TrackMap from '../track/TrackMap';
import SplitsChart from '../track/SplitsChart';
import { formatDuration, formatPace, perKmSplits } from '../track/trackingMath';
import { SESSION_META } from '../plan/sessionMeta';
import type { SessionType } from '../../types';

export default function ActivityDetailModal({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const [act, setAct] = useState<ActivityDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getActivity(id).then((r) => setAct(r.activity)).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const meta = act?.session_type ? SESSION_META[act.session_type as SessionType] : null;
  const splits = act ? perKmSplits(act.gps_track) : [];
  const targetSec = act?.target_pace_min ? Number(act.target_pace_min) * 60 : null;
  const delta = act?.avg_pace_sec_per_km != null && targetSec != null ? act.avg_pace_sec_per_km - targetSec : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-2xl p-5 animate-fadeUp" onClick={(e) => e.stopPropagation()}>
        {loading || !act ? (
          <p className="text-muted text-center py-8">{loading ? 'Chargement…' : 'Introuvable.'}</p>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted">
                  {new Date(act.started_at).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}
                </p>
                <h3 className="text-xl mt-0.5">
                  {meta ? `${meta.icon} ${meta.label}` : '🏃 Course libre'}
                </h3>
              </div>
              <button onClick={onClose} className="text-muted hover:text-text text-xl leading-none" aria-label="Fermer">✕</button>
            </div>

            {act.gps_track.length > 1 && (
              <div className="mt-4 rounded-xl overflow-hidden border border-white/5">
                <TrackMap points={act.gps_track} fitAll className="h-48 w-full" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mt-4">
              <Stat label="Distance" value={`${act.distance_km.toFixed(2)} km`} />
              <Stat label="Durée" value={formatDuration(act.duration_sec)} />
              <Stat label="Allure moy." value={`${formatPace(act.avg_pace_sec_per_km)} /km`} />
              {act.elevation_gain > 0 && <Stat label="Dénivelé +" value={`${act.elevation_gain} m`} />}
              {act.avg_hr != null && <Stat label="FC moy." value={`${act.avg_hr} bpm`} />}
              {act.max_hr != null && <Stat label="FC max" value={`${act.max_hr} bpm`} />}
              {act.rpe != null && <Stat label="RPE" value={`${act.rpe}/10`} />}
              {act.mood && <Stat label="Humeur" value={act.mood} />}
            </div>

            {delta != null && (
              <p className={`text-sm mt-3 ${delta <= 0 ? 'text-primary' : 'text-accent'}`}>
                {delta <= 0
                  ? `✓ ${formatPace(Math.abs(delta))} /km plus rapide que l'objectif`
                  : `${formatPace(delta)} /km plus lent que l'objectif`}
              </p>
            )}

            {splits.length > 0 && (
              <div className="mt-4">
                <p className="text-sm text-muted mb-2">Allure par kilomètre</p>
                <SplitsChart splits={splits} />
              </div>
            )}

            {act.notes && (
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wide text-muted mb-1">Notes</p>
                <p className="text-sm">{act.notes}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted uppercase tracking-wide">{label}</p>
      <p className="metric mt-0.5 font-semibold">{value}</p>
    </div>
  );
}
