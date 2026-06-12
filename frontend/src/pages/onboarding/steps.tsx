import type { UserProfile, Weekday, Injury } from '../../types';
import AddressInput from '../../components/AddressInput';
import {
  OBJECTIVES,
  LEVELS,
  WEEKDAYS,
  INJURIES,
  DURATIONS,
  RADII,
} from './options';

type Patch = (p: Partial<UserProfile>) => void;

interface StepProps {
  profile: UserProfile;
  patch: Patch;
}

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="mb-6 animate-fadeUp">
      <h2 className="text-2xl">{title}</h2>
      <p className="text-muted mt-1">{subtitle}</p>
    </header>
  );
}

/* ---------------- Step 1 — Objective ---------------- */
export function Step1Objective({ profile, patch }: StepProps) {
  return (
    <div>
      <StepHeader
        title="Quel est ton objectif ?"
        subtitle="On construit ton programme autour de ce but."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {OBJECTIVES.map((o) => (
          <button
            key={o.id}
            type="button"
            className="option-card flex items-start gap-3"
            data-selected={profile.objective === o.id}
            onClick={() => patch({ objective: o.id })}
          >
            <span className="text-2xl leading-none">{o.icon}</span>
            <span>
              <span className="block font-semibold">{o.title}</span>
              <span className="block text-sm text-muted">{o.desc}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Step 2 — Level ---------------- */
export function Step2Level({ profile, patch }: StepProps) {
  return (
    <div>
      <StepHeader
        title="Ton niveau actuel"
        subtitle="Sois honnête : on calibre l’intensité en conséquence."
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {LEVELS.map((l) => (
          <button
            key={l.id}
            type="button"
            className="option-card"
            data-selected={profile.level === l.id}
            onClick={() => patch({ level: l.id })}
          >
            <span className="block font-semibold">{l.title}</span>
            <span className="block text-sm text-muted mt-1">{l.desc}</span>
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm text-muted">VMA estimée (km/h)</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            min={5}
            max={30}
            placeholder="ex. 14"
            value={profile.vma ?? ''}
            onChange={(e) =>
              patch({ vma: e.target.value ? Number(e.target.value) : null })
            }
            className="metric mt-1 w-full rounded-xl bg-surface-2 border border-white/5 px-4 py-3 outline-none focus:border-primary/60"
          />
        </label>
        <label className="block">
          <span className="text-sm text-muted">VO₂max estimé</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            min={20}
            max={90}
            placeholder="ex. 48"
            value={profile.vo2max ?? ''}
            onChange={(e) =>
              patch({ vo2max: e.target.value ? Number(e.target.value) : null })
            }
            className="metric mt-1 w-full rounded-xl bg-surface-2 border border-white/5 px-4 py-3 outline-none focus:border-primary/60"
          />
        </label>
      </div>

      <details className="mt-4 text-sm text-muted">
        <summary className="cursor-pointer text-primary/90 hover:text-primary">
          Comment estimer ma VMA ?
        </summary>
        <p className="mt-2 leading-relaxed">
          La VMA (Vitesse Maximale Aérobie) est l’allure que tu peux tenir
          environ 6 minutes à fond. Test simple : après échauffement, cours le
          plus loin possible en 6 minutes sur piste. Distance (m) ÷ 100 ≈ ta VMA
          en km/h. Ces champs sont facultatifs — laisse vide si tu ne sais pas.
        </p>
      </details>
    </div>
  );
}

/* ---------------- Step 3 — Constraints ---------------- */
export function Step3Constraints({ profile, patch }: StepProps) {
  function toggleDay(day: Weekday) {
    const set = new Set(profile.availableDays);
    set.has(day) ? set.delete(day) : set.add(day);
    patch({ availableDays: WEEKDAYS.filter((w) => set.has(w.id)).map((w) => w.id) });
  }
  function toggleInjury(inj: Injury) {
    const set = new Set(profile.injuries);
    set.has(inj) ? set.delete(inj) : set.add(inj);
    patch({ injuries: INJURIES.filter((i) => set.has(i.id)).map((i) => i.id) });
  }

  return (
    <div>
      <StepHeader
        title="Contraintes & disponibilité"
        subtitle="Pour planifier des séances réalistes dans ta semaine."
      />

      <div className="card p-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold">Séances par semaine</span>
          <span className="metric text-primary text-xl font-bold">
            {profile.sessionsPerWeek}
          </span>
        </div>
        <input
          type="range"
          min={2}
          max={6}
          step={1}
          value={profile.sessionsPerWeek}
          onChange={(e) => patch({ sessionsPerWeek: Number(e.target.value) })}
          className="mt-3 w-full accent-primary"
        />
        <div className="flex justify-between text-xs text-muted mt-1 metric">
          <span>2</span><span>3</span><span>4</span><span>5</span><span>6</span>
        </div>
      </div>

      <div className="mt-5">
        <span className="text-sm text-muted">Jours disponibles</span>
        <div className="mt-2 grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((d) => {
            const on = profile.availableDays.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => toggleDay(d.id)}
                aria-pressed={on}
                className={`rounded-xl py-2 text-sm font-medium transition-all ${
                  on
                    ? 'bg-primary text-black'
                    : 'bg-surface-2 text-muted hover:text-text'
                }`}
              >
                {d.short}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        <span className="text-sm text-muted">Blessures ou limitations</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {INJURIES.map((i) => {
            const on = profile.injuries.includes(i.id);
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => toggleInjury(i.id)}
                aria-pressed={on}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  on
                    ? 'bg-accent text-black'
                    : 'bg-surface-2 text-muted hover:text-text'
                }`}
              >
                {i.icon} {i.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => patch({ injuries: [] })}
            aria-pressed={profile.injuries.length === 0}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
              profile.injuries.length === 0
                ? 'bg-primary text-black'
                : 'bg-surface-2 text-muted hover:text-text'
            }`}
          >
            ✅ Aucune
          </button>
        </div>
      </div>

      <div className="mt-5">
        <span className="text-sm text-muted">Durée max par séance</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {DURATIONS.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => patch({ maxSessionDuration: d.id })}
              className={`metric rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                profile.maxSessionDuration === d.id
                  ? 'bg-primary text-black'
                  : 'bg-surface-2 text-muted hover:text-text'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Step 4 — Location ---------------- */
export function Step4Location({
  profile,
  patch,
  geoStatus,
  onUseGeolocation,
}: StepProps & {
  geoStatus: 'idle' | 'loading' | 'ok' | 'error';
  onUseGeolocation: () => void;
}) {
  return (
    <div>
      <StepHeader
        title="Où cours-tu ?"
        subtitle="Pour te proposer des itinéraires proches de chez toi."
      />

      <button
        type="button"
        onClick={onUseGeolocation}
        className="btn-primary w-full"
        disabled={geoStatus === 'loading'}
      >
        📍{' '}
        {geoStatus === 'loading'
          ? 'Localisation en cours…'
          : 'Utiliser ma position'}
      </button>

      {geoStatus === 'ok' && profile.locationLat != null && (
        <p className="mt-2 text-sm text-primary metric">
          Position détectée : {profile.locationLat.toFixed(4)},{' '}
          {profile.locationLng?.toFixed(4)}
        </p>
      )}
      {geoStatus === 'error' && (
        <p className="mt-2 text-sm text-accent">
          Localisation refusée — saisis ta ville ci-dessous.
        </p>
      )}

      <div className="my-5 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-white/10" /> OU{' '}
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <div>
        <span className="text-sm text-muted">Ville, code postal ou adresse</span>
        <div className="mt-1">
          <AddressInput
            initialValue={profile.locationLabel ?? ''}
            onResolved={(r) =>
              patch({
                locationLat: r.lat,
                locationLng: r.lng,
                locationLabel: r.label.split(',').slice(0, 2).join(',').trim(),
              })
            }
          />
        </div>
        {geoStatus !== 'ok' && profile.locationLat != null && profile.locationLabel && (
          <p className="mt-2 text-sm text-primary">
            ✓ {profile.locationLabel}{' '}
            <span className="metric text-muted">
              ({profile.locationLat.toFixed(3)}, {profile.locationLng?.toFixed(3)})
            </span>
          </p>
        )}
      </div>

      <div className="mt-6">
        <span className="text-sm text-muted">Rayon de recherche d’itinéraires</span>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {RADII.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => patch({ searchRadius: r.id })}
              className={`metric rounded-xl py-3 text-sm font-medium transition-all ${
                profile.searchRadius === r.id
                  ? 'bg-primary text-black'
                  : 'bg-surface-2 text-muted hover:text-text'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
