import { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import type { TrackPoint } from './trackingMath';
import { userLocationIcon } from '../routes/leafletSetup';

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

function Recenter({ pos, follow }: { pos: [number, number] | null; follow: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (pos && follow) map.setView(pos, map.getZoom(), { animate: true });
  }, [pos, follow, map]);
  return null;
}

function FitAll({ latlngs }: { latlngs: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (latlngs.length > 1) map.fitBounds(latlngs, { padding: [25, 25] });
  }, [latlngs.length, map]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function TrackMap({
  points,
  follow = true,
  fitAll = false,
  className,
}: {
  points: TrackPoint[];
  follow?: boolean;
  fitAll?: boolean;
  className?: string;
}) {
  const latlngs = points.map((p) => [p.lat, p.lng] as [number, number]);
  const current = latlngs[latlngs.length - 1] ?? null;
  const center = current ?? [48.857, 2.352];

  return (
    <MapContainer center={center} zoom={16} className={className} preferCanvas zoomControl={false}>
      <TileLayer url={TILES} attribution="&copy; OpenStreetMap" />
      {latlngs.length > 1 && (
        <Polyline positions={latlngs} pathOptions={{ color: '#00C853', weight: 5 }} />
      )}
      {current && <Marker position={current} icon={userLocationIcon} />}
      {fitAll ? <FitAll latlngs={latlngs} /> : <Recenter pos={current} follow={follow} />}
    </MapContainer>
  );
}
