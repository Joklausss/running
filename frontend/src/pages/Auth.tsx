import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, loadProfileLocal } from '../services/api';

export default function Auth() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/dashboard';

  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') {
        await api.register(email, password);
      } else {
        await api.login(email, password);
      }
      // Push the locally-saved onboarding profile to the backend so plan
      // generation (which reads it from Postgres) has something to work with.
      const profile = loadProfileLocal();
      if (profile) await api.saveProfile(profile).catch(() => {});
      navigate(next, { replace: true });
    } catch {
      setError(
        mode === 'register'
          ? 'Inscription impossible (email déjà utilisé ?).'
          : 'Identifiants invalides.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <div className="w-full max-w-sm animate-fadeUp">
        <h1 className="text-2xl text-center">
          {mode === 'register' ? 'Crée ton compte' : 'Connexion'}
        </h1>
        <p className="text-muted text-center mt-1 mb-6 text-sm">
          Pour générer et sauvegarder ton programme.
        </p>

        <form onSubmit={submit} className="card p-5 space-y-3">
          <label className="block">
            <span className="text-sm text-muted">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl bg-surface-2 border border-white/5 px-4 py-3 outline-none focus:border-primary/60"
            />
          </label>
          <label className="block">
            <span className="text-sm text-muted">Mot de passe</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl bg-surface-2 border border-white/5 px-4 py-3 outline-none focus:border-primary/60"
            />
          </label>

          {error && <p className="text-sm text-accent">{error}</p>}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy
              ? '…'
              : mode === 'register'
                ? 'Créer mon compte'
                : 'Se connecter'}
          </button>
        </form>

        <button
          type="button"
          className="mt-4 w-full text-sm text-muted hover:text-text"
          onClick={() => {
            setMode((m) => (m === 'register' ? 'login' : 'register'));
            setError(null);
          }}
        >
          {mode === 'register'
            ? 'Déjà un compte ? Se connecter'
            : 'Pas de compte ? S’inscrire'}
        </button>
      </div>
    </div>
  );
}
