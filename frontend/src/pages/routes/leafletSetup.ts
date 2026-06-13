import L from 'leaflet';
import type { GeoJSONLineString, TerrainType } from '../../types';

/** GeoJSON [lng,lat][] → Leaflet [lat,lng][] */
export function toLatLngs(geojson: GeoJSONLineString): [number, number][] {
  return geojson.coordinates.map(([lng, lat]) => [lat, lng]);
}

/** Animated pulsing marker for the user's current position. */
export const userLocationIcon = L.divIcon({
  className: '',
  html: `<div style="position:relative;width:18px;height:18px">
    <span class="animate-pulseRing" style="position:absolute;inset:0;border-radius:9999px;background:#00C853"></span>
    <span style="position:absolute;inset:3px;border-radius:9999px;background:#00C853;border:2px solid #0F1117"></span>
  </div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export function routeDotIcon(color: string, active: boolean): L.DivIcon {
  const size = active ? 16 : 11;
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:2px solid #0F1117;box-shadow:${
      active ? '0 0 0 3px rgba(0,200,83,0.5)' : '0 1px 3px rgba(0,0,0,0.5)'
    }"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export const TERRAIN_META: Record<TerrainType, { label: string; color: string }> = {
  asphalt: { label: 'Asphalte', color: '#9CA3AF' },
  path: { label: 'Chemin', color: '#D97706' },
  mixed: { label: 'Mixte', color: '#38BDF8' },
  trail: { label: 'Trail', color: '#A855F7' },
};

/** True when a route's first and last points are essentially the same spot. */
export function endpointsClose(geojson: GeoJSONLineString): boolean {
  const c = geojson.coordinates;
  if (c.length < 2) return true;
  const [lng1, lat1] = c[0];
  const [lng2, lat2] = c[c.length - 1];
  const dLat = (lat2 - lat1) * 111;
  const dLng = (lng2 - lng1) * 111 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(dLat, dLng) < 0.06; // < 60 m
}

/** Human label for a route's shape (loop / out-and-back / point-to-point). */
export function routeShape(geojson: GeoJSONLineString, isLoop: boolean): { icon: string; label: string } {
  if (!endpointsClose(geojson)) return { icon: '➟', label: 'Point à point' };
  return isLoop ? { icon: '🔁', label: 'Boucle' } : { icon: '↔︎', label: 'Aller-retour' };
}

export function elevationBucket(gain: number): 'flat' | 'rolling' | 'hilly' {
  if (gain < 50) return 'flat';
  if (gain <= 200) return 'rolling';
  return 'hilly';
}

export const ELEVATION_LABEL: Record<'flat' | 'rolling' | 'hilly', string> = {
  flat: 'Plat (<50m)',
  rolling: 'Vallonné (50–200m)',
  hilly: 'Montagneux (>200m)',
};

/** Steepness 1 (flat) … 10 (extremely steep) from metres of climb per km. */
export function slopeScore(gainM: number, distKm: number): number {
  const gpk = distKm > 0 ? gainM / distKm : 0;
  return Math.max(1, Math.min(10, Math.round(1 + gpk / 15)));
}

export function slopeLabel(score: number): string {
  if (score <= 1) return 'plat';
  if (score <= 3) return 'légèrement vallonné';
  if (score <= 5) return 'vallonné';
  if (score <= 7) return 'pentu';
  return 'très pentu';
}

/** Estimated duration (minutes) for a distance, by discipline. */
export function estimatedDurationMin(
  distanceKm: number,
  vma: number | null,
  discipline: 'running' | 'mtb' | 'road' = 'running',
): number {
  const speed =
    discipline === 'road'
      ? 24 // km/h road bike
      : discipline === 'mtb'
        ? 14 // km/h mountain bike
        : vma && vma > 0
          ? vma * 0.7 // running easy pace
          : 9.5;
  return Math.round((distanceKm / speed) * 60);
}
