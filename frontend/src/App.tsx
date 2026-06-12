import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import OnboardingWizard from './pages/onboarding/OnboardingWizard';
import Dashboard from './pages/Dashboard';
import Auth from './pages/Auth';
import { loadProfileLocal } from './services/api';
import { registerActivitySync } from './services/offlineQueue';

// Heavy routes (Leaflet / Recharts) are split into their own chunks so they
// don't bloat the initial load.
const PlanPage = lazy(() => import('./pages/plan/PlanPage'));
const RoutesPage = lazy(() => import('./pages/routes/RoutesPage'));
const TrackingPage = lazy(() => import('./pages/track/TrackingPage'));
const StatsPage = lazy(() => import('./pages/stats/StatsPage'));
const HistoryPage = lazy(() => import('./pages/history/HistoryPage'));

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center text-muted">
      Chargement…
    </div>
  );
}

export default function App() {
  const hasProfile = !!loadProfileLocal();

  // flush any runs saved while offline once connectivity returns
  useEffect(() => registerActivitySync(), []);

  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route
            path="/"
            element={<Navigate to={hasProfile ? '/dashboard' : '/onboarding'} replace />}
          />
          <Route path="/onboarding" element={<OnboardingWizard />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/routes" element={<RoutesPage />} />
          <Route path="/track" element={<TrackingPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
