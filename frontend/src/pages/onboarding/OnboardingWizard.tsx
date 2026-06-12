import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UserProfile } from '../../types';
import { loadProfileLocal, persistProfile } from '../../services/api';
import {
  Step1Objective,
  Step2Level,
  Step3Constraints,
  Step4Location,
} from './steps';

const DEFAULT_PROFILE: UserProfile = {
  objective: 'wellbeing',
  level: 'beginner',
  vma: null,
  vo2max: null,
  sessionsPerWeek: 3,
  availableDays: [],
  injuries: [],
  maxSessionDuration: 60,
  locationLat: null,
  locationLng: null,
  locationLabel: null,
  searchRadius: 5,
};

const STEP_LABELS = ['Objectif', 'Niveau', 'Disponibilité', 'Localisation'];

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [geoStatus, setGeoStatus] =
    useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

  // start from any partially-completed profile in localStorage
  const [profile, setProfile] = useState<UserProfile>(
    () => loadProfileLocal() ?? DEFAULT_PROFILE,
  );

  const patch = (p: Partial<UserProfile>) =>
    setProfile((prev) => ({ ...prev, ...p }));

  function useGeolocation() {
    if (!('geolocation' in navigator)) {
      setGeoStatus('error');
      return;
    }
    setGeoStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        patch({
          locationLat: pos.coords.latitude,
          locationLng: pos.coords.longitude,
        });
        setGeoStatus('ok');
      },
      () => setGeoStatus('error'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 3000 },
    );
  }

  // Per-step "can advance" validation
  const canAdvance = useMemo(() => {
    switch (step) {
      case 0:
        return !!profile.objective;
      case 1:
        return !!profile.level;
      case 2:
        return profile.availableDays.length >= profile.sessionsPerWeek;
      case 3:
        return (
          profile.locationLat != null ||
          (profile.locationLabel?.trim().length ?? 0) > 1
        );
      default:
        return true;
    }
  }, [step, profile]);

  async function finish() {
    setSaving(true);
    await persistProfile(profile);
    setSaving(false);
    navigate('/dashboard');
  }

  const isLast = step === STEP_LABELS.length - 1;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Progress bar */}
      <div className="sticky top-0 z-10 bg-bg/80 backdrop-blur px-5 pt-5 pb-3">
        <div className="mx-auto max-w-xl">
          <div className="flex justify-between text-xs text-muted mb-2">
            {STEP_LABELS.map((label, i) => (
              <span
                key={label}
                className={i <= step ? 'text-primary font-semibold' : ''}
              >
                {label}
              </span>
            ))}
          </div>
          <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${((step + 1) / STEP_LABELS.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Step body */}
      <main className="flex-1 px-5 py-6">
        <div className="mx-auto max-w-xl" key={step}>
          {step === 0 && <Step1Objective profile={profile} patch={patch} />}
          {step === 1 && <Step2Level profile={profile} patch={patch} />}
          {step === 2 && <Step3Constraints profile={profile} patch={patch} />}
          {step === 3 && (
            <Step4Location
              profile={profile}
              patch={patch}
              geoStatus={geoStatus}
              onUseGeolocation={useGeolocation}
            />
          )}

          {step === 2 &&
            profile.availableDays.length < profile.sessionsPerWeek && (
              <p className="mt-4 text-sm text-accent animate-fadeUp">
                Sélectionne au moins {profile.sessionsPerWeek} jour
                {profile.sessionsPerWeek > 1 ? 's' : ''} pour {profile.sessionsPerWeek}{' '}
                séances/semaine.
              </p>
            )}
        </div>
      </main>

      {/* Footer nav */}
      <footer className="sticky bottom-0 bg-bg/80 backdrop-blur border-t border-white/5 px-5 py-4">
        <div className="mx-auto max-w-xl flex gap-3">
          {step > 0 && (
            <button
              type="button"
              className="btn-ghost flex-1"
              onClick={() => setStep((s) => s - 1)}
            >
              Retour
            </button>
          )}
          {!isLast ? (
            <button
              type="button"
              className="btn-primary flex-1"
              disabled={!canAdvance}
              onClick={() => setStep((s) => s + 1)}
            >
              Continuer
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary flex-1"
              disabled={!canAdvance || saving}
              onClick={finish}
            >
              {saving ? 'Enregistrement…' : 'Créer mon profil'}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
