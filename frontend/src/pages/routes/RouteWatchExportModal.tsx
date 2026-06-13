import { useEffect } from 'react';
import type { Route } from '../../types';
import { downloadGpx } from './gpx';
import { routeShape } from './leafletSetup';

/** Export a generated route to a watch app (GPX route + how-to). */
export default function RouteWatchExportModal({
  route,
  onClose,
}: {
  route: Route;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shape = routeShape(route.geojson, route.is_loop);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-2xl p-5 animate-fadeUp"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted">Exporter vers Apple Watch</p>
            <h3 className="text-xl mt-0.5">⌚ {route.name}</h3>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text text-xl leading-none" aria-label="Fermer">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-4">
          <Metric label="Distance" value={`${route.distance_km.toFixed(1)} km`} />
          <Metric label="Dénivelé +" value={`${route.elevation_gain} m`} />
          <Metric label="Forme" value={shape.label} />
        </div>

        <button className="btn-primary w-full mt-4" onClick={() => downloadGpx(route.name, route.geojson)}>
          ⤓ Télécharger l'itinéraire (.gpx)
        </button>

        <div className="mt-4 text-xs text-muted leading-relaxed">
          <p className="font-semibold text-text">Sur ton iPhone</p>
          <p className="mt-1">
            Ouvre le <strong>.gpx</strong> dans une app running qui pilote l'Apple
            Watch — ex. <strong>WorkOutDoors</strong>. L'itinéraire devient
            navigable sur la montre (carte + tracé à suivre),
            <strong> y compris sur d'anciennes watchOS</strong>. Transfère le
            fichier via AirDrop, iCloud Drive ou e-mail.
          </p>
          <p className="mt-2">
            Pour une séance structurée (échauffement / travail / récup), utilise
            le bouton « Exporter vers Apple Watch » depuis la séance du programme.
          </p>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 rounded-xl p-2.5 text-center">
      <p className="metric font-bold text-sm">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted mt-0.5">{label}</p>
    </div>
  );
}
