import { Fragment, useEffect, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import type { Route } from '../../types';
import {
  TERRAIN_META,
  routeDotIcon,
  toLatLngs,
  userLocationIcon,
} from './leafletSetup';

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIB = '&copy; OpenStreetMap';

/** Imperatively fit the map to a set of bounds whenever they change. */
function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
  }, [bounds, map]);
  return null;
}

interface Props {
  userPos?: [number, number] | null;
  routes: Route[];
  selectedId?: string | null;
  onSelect?: (r: Route) => void;
  className?: string;
}

export default function RouteMap({
  userPos,
  routes,
  selectedId,
  onSelect,
  className,
}: Props) {
  // fit to the selected route, else to all routes, else to the user.
  // memoised so we only re-fit when the selection or route set changes
  // (otherwise the map would fight the user's panning on every render).
  const fitKey = `${selectedId ?? ''}|${routes.map((r) => r.id).join(',')}`;
  const bounds = useMemo<L.LatLngBoundsExpression | null>(() => {
    const sel = routes.find((r) => r.id === selectedId);
    if (sel) return toLatLngs(sel.geojson);
    if (routes.length) return routes.flatMap((r) => toLatLngs(r.geojson));
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  const center: [number, number] =
    userPos ??
    (routes[0] ? [routes[0].center_lat, routes[0].center_lng] : [48.857, 2.352]);

  return (
    <MapContainer
      center={center}
      zoom={14}
      className={className}
      scrollWheelZoom
      preferCanvas
    >
      <TileLayer url={TILES} attribution={ATTRIB} />
      {userPos && <Marker position={userPos} icon={userLocationIcon} />}

      {routes.map((r) => {
        const active = r.id === selectedId;
        const color = TERRAIN_META[r.terrain_type]?.color ?? '#9CA3AF';
        const pts = toLatLngs(r.geojson);
        const mid = pts[Math.floor(pts.length / 2)];
        return (
          <Fragment key={r.id}>
            <Polyline
              positions={pts}
              pathOptions={{
                color: active ? '#00C853' : color,
                weight: active ? 6 : 3,
                opacity: active ? 1 : 0.7,
              }}
              eventHandlers={{ click: () => onSelect?.(r) }}
            />
            <Marker
              position={mid}
              icon={routeDotIcon(active ? '#00C853' : color, active)}
              eventHandlers={{ click: () => onSelect?.(r) }}
            />
          </Fragment>
        );
      })}

      <FitBounds bounds={bounds} />
    </MapContainer>
  );
}
