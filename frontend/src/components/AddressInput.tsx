import { useState } from 'react';
import { api, type GeocodeResult } from '../services/api';

/**
 * Free-text address / city / postcode input that verifies the entry against
 * OSM (Nominatim) and lets the user pick a confirmed match. Calls back with
 * real coordinates + a clean label.
 */
export default function AddressInput({
  initialValue = '',
  onResolved,
}: {
  initialValue?: string;
  onResolved: (r: GeocodeResult) => void;
}) {
  const [q, setQ] = useState(initialValue);
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const { results } = await api.geocode(q.trim());
      if (!results.length) setError('Adresse introuvable. Précise la ville ou le pays.');
      setResults(results);
    } catch {
      setError('Vérification impossible (le backend est-il démarré ?).');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={verify} className="flex gap-2">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ville, code postal ou adresse"
          className="flex-1 rounded-xl bg-surface-2 border border-white/5 px-4 py-3 outline-none focus:border-primary/60"
        />
        <button type="submit" className="btn-primary px-4" disabled={busy}>
          {busy ? '…' : 'Vérifier'}
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-accent">{error}</p>}

      {results && results.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {results.map((r, i) => (
            <li key={`${r.lat}-${r.lng}-${i}`}>
              <button
                type="button"
                onClick={() => onResolved(r)}
                className="card w-full p-3 text-left text-sm hover:border-primary/40 flex items-start gap-2"
              >
                <span className="mt-0.5">📍</span>
                <span className="flex-1">
                  <span className="block">{r.label}</span>
                  <span className="metric block text-xs text-muted mt-0.5">
                    {r.lat.toFixed(4)}, {r.lng.toFixed(4)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
