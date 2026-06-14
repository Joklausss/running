import { useState } from 'react';
import type { Route } from '../../types';
import { api } from '../../services/api';
import RouteMap from './RouteMap';
import RouteFiche from './RouteFiche';
import { TERRAIN_META } from './leafletSetup';

export default function CuratedRoutesView({
  pos,
  discipline,
}: {
  pos: [number, number];
  discipline: 'running' | 'mtb' | 'road';
}) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Route | null>(null);
  const [fiche, setFiche] = useState<Route | null>(null);

  async function search() {
    setLoading(true);
    setError(null);
    try {
      const { routes } = await api.getCuratedRoutes(pos[0], pos[1], 15, discipline);
      setRoutes(routes);
      setLoaded(true);
    } catch {
      setError('Recherche impossible (Overpass indisponible ?).');
    } finally {
      setLoading(false);
    }
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

      <button onClick={search} className="btn-primary w-full mt-3" disabled={loading}>
        {loading ? 'Recherche…' : '🔎 Itinéraires balisés près de moi'}
      </button>
      {error && <p className="text-accent text-sm mt-2">{error}</p>}

      <p className="text-xs text-muted mt-3">
        Itinéraires officiels et balisés issus d'OpenStreetMap (rando, véloroutes,
        circuits VTT selon la discipline).
      </p>

      <div className="space-y-2 mt-3">
        {routes.map((r) => {
          const t = TERRAIN_META[r.terrain_type as keyof typeof TERRAIN_META] ?? TERRAIN_META.mixed;
          return (
            <button
              key={r.id}
              onClick={() => {
                setSelected(r);
                setFiche(r);
              }}
              className="card w-full p-3 text-left flex items-center gap-3 hover:border-white/15"
              style={{ borderLeft: `4px solid ${t.color}` }}
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{r.name}</p>
                <p className="metric text-sm text-muted">
                  {r.distance_km.toFixed(1)} km · {r.is_loop ? 'boucle' : 'tracé'}
                </p>
              </div>
              <span className="text-muted">›</span>
            </button>
          );
        })}
        {loaded && !routes.length && !error && (
          <p className="text-muted text-sm">Aucun itinéraire balisé trouvé dans cette zone.</p>
        )}
      </div>

      {fiche && (
        <RouteFiche route={fiche} discipline={discipline} onClose={() => setFiche(null)} />
      )}
    </>
  );
}
