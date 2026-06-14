import { useEffect, useRef, useState } from 'react';
import type { Route } from '../../types';
import { api } from '../../services/api';
import RouteMap from './RouteMap';
import RouteFiche from './RouteFiche';
import { TERRAIN_META } from './leafletSetup';

export default function MyRoutesView({
  pos,
  discipline,
}: {
  pos: [number, number] | null;
  discipline: 'running' | 'mtb' | 'road';
}) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Route | null>(null);
  const [fiche, setFiche] = useState<Route | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const { routes } = await api.getMyRoutes();
      setRoutes(routes);
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const text = await file.text();
      await api.importGpx(text, discipline, file.name.replace(/\.gpx$/i, ''));
      await load();
    } catch {
      setError('Import impossible — fichier GPX invalide ou sans points.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function del(id: string) {
    await api.deleteMyRoute(id);
    if (fiche?.id === id) setFiche(null);
    await load();
  }

  return (
    <>
      <div className="rounded-2xl overflow-hidden border border-white/5">
        <RouteMap
          userPos={pos}
          routes={routes}
          selectedId={selected?.id}
          onSelect={(r) => {
            setSelected(r);
            setFiche(r);
          }}
          className="h-56 w-full"
        />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".gpx,application/gpx+xml,application/xml,text/xml"
        onChange={onFile}
        className="hidden"
      />
      <button
        onClick={() => fileRef.current?.click()}
        className="btn-primary w-full mt-3"
        disabled={busy}
      >
        {busy ? 'Import…' : '⤒ Importer un fichier GPX'}
      </button>
      {error && <p className="text-accent text-sm mt-2">{error}</p>}
      <p className="text-xs text-muted mt-2">
        Ajoute tes propres traces (export GPX depuis ta montre, Strava, etc.).
      </p>

      <div className="space-y-2 mt-3">
        {routes.map((r) => {
          const t = TERRAIN_META[r.terrain_type as keyof typeof TERRAIN_META] ?? TERRAIN_META.mixed;
          return (
            <div
              key={r.id}
              className="card p-3 flex items-center gap-3"
              style={{ borderLeft: `4px solid ${t.color}` }}
            >
              <button
                onClick={() => {
                  setSelected(r);
                  setFiche(r);
                }}
                className="flex-1 min-w-0 text-left"
              >
                <p className="font-semibold truncate">{r.name}</p>
                <p className="metric text-sm text-muted">
                  {r.distance_km.toFixed(1)} km · {r.is_loop ? 'boucle' : 'tracé'}
                </p>
              </button>
              <button
                onClick={() => del(r.id)}
                className="text-muted hover:text-accent text-sm shrink-0"
              >
                Supprimer
              </button>
            </div>
          );
        })}
        {!routes.length && (
          <p className="text-muted text-sm">
            Aucun itinéraire personnel — importe un GPX pour commencer.
          </p>
        )}
      </div>

      {fiche && (
        <RouteFiche route={fiche} discipline={discipline} onClose={() => setFiche(null)} />
      )}
    </>
  );
}
