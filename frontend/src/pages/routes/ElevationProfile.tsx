import type { ElevationPoint } from '../../types';

/** Lightweight inline-SVG area chart for a route's elevation profile. */
export default function ElevationProfile({
  data,
  height = 90,
}: {
  data: ElevationPoint[];
  height?: number;
}) {
  if (data.length < 2) {
    return (
      <div className="text-sm text-muted py-4 text-center">
        Profil altimétrique indisponible.
      </div>
    );
  }
  const W = 320;
  const H = height;
  const pad = 4;

  const xs = data.map((d) => d.distKm);
  const ys = data.map((d) => d.ele);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const px = (x: number) => pad + ((x - minX) / spanX) * (W - 2 * pad);
  const py = (y: number) => pad + (1 - (y - minY) / spanY) * (H - 2 * pad);

  const line = data.map((d) => `${px(d.distKm).toFixed(1)},${py(d.ele).toFixed(1)}`).join(' ');
  const area = `${px(minX)},${H - pad} ${line} ${px(maxX)},${H - pad}`;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00C853" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#00C853" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#elevGrad)" />
        <polyline points={line} fill="none" stroke="#00C853" strokeWidth="2" />
      </svg>
      <div className="metric flex justify-between text-[10px] text-muted mt-1">
        <span>{minY} m</span>
        <span>{maxX.toFixed(1)} km</span>
        <span>{maxY} m</span>
      </div>
    </div>
  );
}
