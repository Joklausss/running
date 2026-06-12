import { formatPace } from './trackingMath';

/** Horizontal per-km pace bars: longer bar = slower km, faster kms in green. */
export default function SplitsChart({
  splits,
}: {
  splits: { km: number; paceSecPerKm: number }[];
}) {
  if (!splits.length) {
    return (
      <p className="text-sm text-muted text-center py-3">
        Pas encore de kilomètre complet.
      </p>
    );
  }
  const paces = splits.map((s) => s.paceSecPerKm);
  const max = Math.max(...paces);
  const min = Math.min(...paces);
  const span = max - min || 1;

  return (
    <div className="space-y-1.5">
      {splits.map((s) => {
        // width 45–100%; fastest km gets the accent green
        const width = 45 + ((s.paceSecPerKm - min) / span) * 55;
        const isFastest = s.paceSecPerKm === min;
        return (
          <div key={s.km} className="flex items-center gap-2 text-sm">
            <span className="metric w-8 text-muted text-right">{s.km}</span>
            <div className="flex-1 bg-surface-2 rounded">
              <div
                className="h-5 rounded flex items-center justify-end pr-2"
                style={{
                  width: `${width}%`,
                  background: isFastest ? '#00C853' : '#3a4150',
                }}
              >
                <span
                  className={`metric text-xs ${isFastest ? 'text-black' : 'text-text'}`}
                >
                  {formatPace(s.paceSecPerKm)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
