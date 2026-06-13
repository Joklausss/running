import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { Route } from '../../types';
import {
  api,
  isAuthed,
  loadProfileLocal,
  persistProfile,
  type GeocodeResult,
} from '../../services/api';
import AddressInput from '../../components/AddressInput';
import RouteMap from './RouteMap';
import RouteFiche from './RouteFiche';
import RouteWatchExportModal from './RouteWatchExportModal';
import { slopeLabel, routeShape } from './leafletSetup';

export default function RoutesPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const associateTo = params.get('associateTo');
  const associateLabel = params.get('for') ?? 'cette séance';
  const tkm = params.get('tkm');

  const profile = loadProfileLocal();
  const [pos, setPos] = useState<[number, number] | null>(
    profile?.locationLat != null && profile?.locationLng != null
      ? [profile.locationLat, profile.locationLng]
      : null,
  );
  const [geoTried, setGeoTried] = useState(false);

  const [target, setTarget] = useState<number>(tkm ? Math.round(Number(tkm) * 10) / 10 : 5);
  const [slope, setSlope] = useState<number>(0); // 0 = auto (no preference), 1..10
  const [returnToStart, setReturnToStart] = useState(true); // on = loop, off = point-to-point
  const [generated, setGenerated] = useState<Route | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFiche, setShowFiche] = useState(false);
  const [showWatch, setShowWatch] = useState(false);
  const variantRef = useRef(0); // bumped on "regenerate" to get a different route
  const autoGen = useRef(false);

  useEffect(() => {
    if (!isAuthed()) navigate('/auth?next=/routes', { replace: true });
  }, [navigate]);

  // resolve location (profile → geolocation → manual address)
  useEffect(() => {
    if (pos || !('geolocation' in navigator)) {
      setGeoTried(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos([p.coords.latitude, p.coords.longitude]);
        setGeoTried(true);
      },
      () => setGeoTried(true),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, [pos]);

  async function resolveLocation(r: GeocodeResult) {
    setPos([r.lat, r.lng]);
    const p = loadProfileLocal();
    if (p) {
      await persistProfile({
        ...p,
        locationLat: r.lat,
        locationLng: r.lng,
        locationLabel: r.label.split(',').slice(0, 2).join(',').trim(),
      });
    }
  }

  async function generate(regen = false) {
    if (!pos) return;
    // a regenerate explores a new variant so the route is actually different
    const v = regen ? variantRef.current + 1 : 0;
    variantRef.current = v;
    setGenerating(true);
    setError(null);
    try {
      const { route } = await api.generateRoute(
        pos[0],
        pos[1],
        target,
        slope > 0 ? slope : null,
        returnToStart,
        v,
      );
      setGenerated(route);
      setShowFiche(true);
    } catch {
      setError(
        'Génération impossible ici — réseau de chemins insuffisant ou distance trop grande.',
      );
    } finally {
      setGenerating(false);
    }
  }

  // auto-generate once when we arrive from a session (target known + location ready)
  useEffect(() => {
    if (pos && tkm && !autoGen.current) {
      autoGen.current = true;
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-5 pt-4 pb-2">
        <div className="mx-auto max-w-xl">
          <Link to={associateTo ? '/plan' : '/dashboard'} className="text-muted text-sm hover:text-text">
            ← {associateTo ? 'Programme' : 'Dashboard'}
          </Link>
          <h1 className="text-2xl mt-1">Générer un parcours</h1>
          {associateTo ? (
            <div className="mt-2 rounded-xl bg-primary/10 border border-primary/30 px-4 py-2 text-sm">
              🎯 Parcours de ~{target.toFixed(1)} km pour <strong>{associateLabel}</strong>.
            </div>
          ) : (
            <p className="text-sm text-muted mt-1">
              On relie les chemins autour de toi en une boucle de la distance voulue.
            </p>
          )}
        </div>
      </header>

      {!pos ? (
        <div className="mx-auto max-w-xl w-full px-5 py-2">
          {!geoTried ? (
            <div className="card p-5 text-center text-muted text-sm">Localisation en cours…</div>
          ) : (
            <div className="card p-5 animate-fadeUp">
              <h2 className="font-semibold">Indique ton point de départ</h2>
              <p className="text-sm text-muted mt-1 mb-3">
                Saisis une ville, un code postal ou une adresse — on la vérifie sur la carte.
              </p>
              <AddressInput
                initialValue={loadProfileLocal()?.locationLabel ?? ''}
                onResolved={resolveLocation}
              />
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="mx-auto max-w-xl w-full px-5">
            <div className="rounded-2xl overflow-hidden border border-white/5">
              <RouteMap
                userPos={pos}
                routes={generated ? [generated] : []}
                selectedId={generated?.id}
                onSelect={() => setShowFiche(true)}
                onMoveStart={(lat, lng) => {
                  setPos([lat, lng]);
                  setGenerated(null); // previous route is for the old start
                  setShowFiche(false);
                  variantRef.current = 0;
                }}
                className="h-64 w-full"
              />
            </div>
            <p className="text-xs text-muted mt-1.5 text-center">
              📍 Glisse le marqueur vert ou clique sur la carte pour déplacer ton point de départ.
            </p>
          </div>

          <main className="mx-auto max-w-xl w-full px-5 py-4 space-y-4">
            <div className="card p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Distance cible</span>
                <span className="metric text-primary text-lg font-bold">{target.toFixed(1)} km</span>
              </div>
              <input
                type="range" min={0.5} max={30} step={0.5} value={target}
                onChange={(e) => { setTarget(Number(e.target.value)); variantRef.current = 0; }}
                className="w-full accent-primary mt-2"
              />

              <div className="flex justify-between text-sm mt-4">
                <span className="text-muted">Pente cible</span>
                <span className="metric text-primary font-semibold">
                  {slope === 0 ? 'Auto' : `${slope}/10 · ${slopeLabel(slope)}`}
                </span>
              </div>
              <input
                type="range" min={0} max={10} step={1} value={slope}
                onChange={(e) => { setSlope(Number(e.target.value)); variantRef.current = 0; }}
                className="w-full accent-accent mt-2"
              />
              <div className="flex justify-between text-[10px] text-muted metric">
                <span>auto</span><span>plat</span><span>très pentu</span>
              </div>

              {/* Return-to-start toggle */}
              <div className="flex items-center justify-between mt-4">
                <div>
                  <span className="text-sm">Revenir au point de départ</span>
                  <p className="text-xs text-muted">
                    {returnToStart ? 'Boucle — départ = arrivée' : 'Point à point — arrivée ailleurs'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={returnToStart}
                  onClick={() => { setReturnToStart((v) => !v); variantRef.current = 0; }}
                  className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${
                    returnToStart ? 'bg-primary' : 'bg-surface-2'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${
                      returnToStart ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <button
                onClick={() => generate(!!generated)}
                className="btn-primary w-full mt-3"
                disabled={generating}
              >
                {generating
                  ? 'Génération du parcours…'
                  : generated
                    ? '↻ Régénérer (autre tracé)'
                    : '✨ Générer un parcours'}
              </button>
              {error && <p className="text-accent text-sm mt-2">{error}</p>}
            </div>

            {generated && (
              <button
                onClick={() => setShowFiche(true)}
                className="card w-full p-4 text-left hover:border-primary/40"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{generated.name}</span>
                  <span className="metric text-primary font-bold">
                    {generated.distance_km.toFixed(1)} km
                  </span>
                </div>
                <p className="metric text-sm text-muted mt-1">
                  écart {Math.abs(((generated.distance_km - target) / target) * 100).toFixed(0)}% ·{' '}
                  {routeShape(generated.geojson, generated.is_loop).label.toLowerCase()} · D+{generated.elevation_gain} m
                </p>
                <p className="text-xs text-primary mt-1">Détails, profil & GPX →</p>
              </button>
            )}

            {generated && (
              <button className="btn-ghost w-full" onClick={() => setShowWatch(true)}>
                ⌚ Exporter iOS Watch
              </button>
            )}
          </main>
        </>
      )}

      {showWatch && generated && (
        <RouteWatchExportModal route={generated} onClose={() => setShowWatch(false)} />
      )}

      {showFiche && generated && (
        <RouteFiche
          route={generated}
          targetKm={target}
          associateToSession={associateTo ? { id: associateTo, label: associateLabel } : null}
          onClose={() => setShowFiche(false)}
          onAssociated={() => navigate('/plan')}
          onRegenerate={() => {
            setShowFiche(false);
            generate(true);
          }}
        />
      )}
    </div>
  );
}
