import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ElevationPoint, Route } from '../../types';
import { api, loadProfileLocal } from '../../services/api';
import RouteMap from './RouteMap';
import ElevationProfile from './ElevationProfile';
import { downloadGpx } from './gpx';
import {
  TERRAIN_META,
  ELEVATION_LABEL,
  elevationBucket,
  estimatedDurationMin,
  slopeScore,
  slopeLabel,
  routeShape,
} from './leafletSetup';

interface Props {
  route: Route;
  /** when set, the primary action associates this route to the given session */
  associateToSession?: { id: string; label: string } | null;
  /** target distance (km) this route was generated for — shows accuracy */
  targetKm?: number | null;
  discipline?: 'running' | 'mtb' | 'road';
  onClose: () => void;
  onAssociated?: () => void;
  onRegenerate?: () => void;
}

export default function RouteFiche({
  route,
  associateToSession,
  targetKm,
  discipline = 'running',
  onClose,
  onAssociated,
  onRegenerate,
}: Props) {
  const [elevation, setElevation] = useState<ElevationPoint[]>([]);
  const [gain, setGain] = useState(route.elevation_gain);
  const [loadingEle, setLoadingEle] = useState(true);
  const [associating, setAssociating] = useState(false);
  const navigate = useNavigate();

  const profile = loadProfileLocal();
  const terrain = TERRAIN_META[route.terrain_type];

  useEffect(() => {
    setLoadingEle(true);
    api
      .getRoute(route.id)
      .then((res) => {
        setElevation(res.elevation);
        setGain(res.route.elevation_gain);
      })
      .catch(() => {})
      .finally(() => setLoadingEle(false));
  }, [route.id]);

  async function associate() {
    if (!associateToSession) return;
    setAssociating(true);
    try {
      await api.associateRoute(associateToSession.id, route.id);
      onAssociated?.();
    } catch {
      setAssociating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-2xl p-5 animate-fadeUp"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl">{route.name}</h3>
            <div className="flex gap-2 mt-1 text-xs">
              <span
                className="rounded-full px-2 py-0.5"
                style={{ background: `${terrain.color}22`, color: terrain.color }}
              >
                {terrain.label}
              </span>
              <span className="rounded-full px-2 py-0.5 bg-surface-2 text-muted">
                {(() => {
                  const s = routeShape(route.geojson, route.is_loop);
                  return `${s.icon} ${s.label}`;
                })()}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-text text-xl leading-none"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {/* Mini-map */}
        <div className="mt-4 rounded-xl overflow-hidden border border-white/5">
          <RouteMap
            routes={[route]}
            selectedId={route.id}
            className="h-44 w-full"
          />
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <Metric label="Distance" value={`${route.distance_km.toFixed(1)} km`} />
          <Metric label="Dénivelé +" value={`${gain} m`} />
          <Metric
            label="Durée est."
            value={`${estimatedDurationMin(route.distance_km, profile?.vma ?? null, discipline)} min`}
          />
        </div>
        <p className="text-xs text-muted text-center mt-1">
          {ELEVATION_LABEL[elevationBucket(gain)]} · pente{' '}
          {slopeScore(gain, route.distance_km)}/10 ({slopeLabel(slopeScore(gain, route.distance_km))})
        </p>

        {targetKm != null && (
          <p className="text-sm text-center mt-2">
            🎯 Objectif {targetKm.toFixed(1)} km —{' '}
            <span className="text-primary font-semibold">
              écart {Math.abs(((route.distance_km - targetKm) / targetKm) * 100).toFixed(0)}%
            </span>
          </p>
        )}

        {/* Elevation profile */}
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-muted mb-1">
            Profil altimétrique
          </p>
          {loadingEle ? (
            <div className="text-sm text-muted py-4 text-center">Calcul du profil…</div>
          ) : (
            <ElevationProfile data={elevation} />
          )}
        </div>

        {/* Actions */}
        <div className="mt-5 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              className="btn-ghost"
              onClick={() => downloadGpx(route.name, route.geojson)}
            >
              ⤓ Télécharger GPX
            </button>
            {onRegenerate ? (
              <button className="btn-ghost" onClick={onRegenerate}>
                ↻ Régénérer
              </button>
            ) : (
              <button
                className="btn-ghost"
                onClick={() =>
                  navigate(`/track?label=${encodeURIComponent(route.name)}&tkm=${route.distance_km.toFixed(1)}`)
                }
              >
                ▶︎ Démarrer
              </button>
            )}
          </div>

          {associateToSession ? (
            <button
              className="btn-primary w-full"
              onClick={associate}
              disabled={associating}
            >
              {associating
                ? 'Association…'
                : `🗺️ Associer à : ${associateToSession.label}`}
            </button>
          ) : (
            <button className="btn-ghost w-full" onClick={onClose}>
              Fermer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 rounded-xl p-2.5 text-center">
      <p className="metric font-bold">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted mt-0.5">{label}</p>
    </div>
  );
}
