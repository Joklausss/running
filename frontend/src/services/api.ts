import type {
  ElevationPoint,
  PlannedSession,
  Route,
  TrainingPlan,
  UserProfile,
} from '../types';

const BASE = import.meta.env.VITE_API_URL ?? '/api';
const TOKEN_KEY = 'pacer_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ? JSON.stringify(body.error) : `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  async register(email: string, password: string) {
    const out = await request<{ token: string; userId: string }>(
      '/auth/register',
      { method: 'POST', body: JSON.stringify({ email, password }) },
    );
    setToken(out.token);
    return out;
  },
  async login(email: string, password: string) {
    const out = await request<{ token: string; userId: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(out.token);
    return out;
  },
  getProfile() {
    return request<{ profile: UserProfile | null }>('/profile');
  },
  saveProfile(profile: UserProfile) {
    return request<{ ok: boolean }>('/profile', {
      method: 'PUT',
      body: JSON.stringify(profile),
    });
  },
  generatePlan() {
    return request<{ planId: string }>('/plans/generate', { method: 'POST' });
  },
  getCurrentPlan() {
    return request<{ plan: TrainingPlan | null; sessions?: PlannedSession[] }>(
      '/plans/current',
    );
  },
  discoverRoutes(lat: number, lng: number, radius: number) {
    return request<{ routes: Route[] }>(
      `/routes?lat=${lat}&lng=${lng}&radius=${radius}`,
    );
  },
  generateRoute(
    lat: number,
    lng: number,
    targetKm: number,
    slopeTarget?: number | null,
    returnToStart = true,
    variant = 0,
    discipline: 'running' | 'mtb' | 'road' = 'running',
    sessionId?: string | null,
  ) {
    return request<{ route: Route; targetKm: number }>('/routes/generate', {
      method: 'POST',
      body: JSON.stringify({
        lat,
        lng,
        targetKm,
        slopeTarget: slopeTarget ?? null,
        returnToStart,
        variant,
        discipline,
        sessionId: sessionId ?? null,
      }),
    });
  },
  getRoute(id: string) {
    return request<{ route: Route; elevation: ElevationPoint[] }>(`/routes/${id}`);
  },
  associateRoute(sessionId: string, routeId: string) {
    return request<{ ok: boolean }>(`/routes/session/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify({ routeId }),
    });
  },
  unassociateRoute(sessionId: string) {
    return request<{ ok: boolean }>(`/routes/session/${sessionId}`, {
      method: 'DELETE',
    });
  },
  getSuggestions(sessionId: string) {
    return request<{ routes: Route[]; reason?: string }>(
      `/routes/session/${sessionId}/suggestions`,
    );
  },
  geocode(q: string) {
    return request<{ results: GeocodeResult[] }>(
      `/geocode?q=${encodeURIComponent(q)}`,
    );
  },
  saveActivity(payload: SaveActivityPayload) {
    return request<{ id: string }>('/activities', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getActivities() {
    return request<{ activities: ActivitySummary[] }>('/activities');
  },
  getActivity(id: string) {
    return request<{ activity: ActivityDetail }>(`/activities/${id}`);
  },
};

export interface SaveActivityPayload {
  plannedSessionId?: string | null;
  startedAt: string;
  endedAt: string;
  distanceKm: number;
  durationSec: number;
  avgPaceSecPerKm?: number | null;
  avgHr?: number | null;
  maxHr?: number | null;
  gpsTrack: { lat: number; lng: number; t: number; hr?: number }[];
  elevationGain?: number;
  rpe?: number | null;
  mood?: string | null;
  notes?: string | null;
}

export interface ActivitySummary {
  id: string;
  started_at: string;
  ended_at: string | null;
  distance_km: number;
  duration_sec: number;
  avg_pace_sec_per_km: number | null;
  avg_hr: number | null;
  elevation_gain: number;
  rpe: number | null;
  mood: string | null;
  session_type: string | null;
}

export interface ActivityDetail extends ActivitySummary {
  gps_track: { lat: number; lng: number; t: number; hr?: number }[];
  max_hr: number | null;
  notes: string | null;
  target_pace_min: string | null;
  target_pace_max: string | null;
}

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

export function isAuthed(): boolean {
  return !!getToken();
}

// ---- Offline-friendly local fallback ----
// The onboarding wizard works standalone (no backend) by persisting to
// localStorage; when a backend + auth token is present it also syncs there.
const PROFILE_KEY = 'pacer_profile';

export function saveProfileLocal(profile: UserProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}
export function loadProfileLocal(): UserProfile | null {
  const raw = localStorage.getItem(PROFILE_KEY);
  return raw ? (JSON.parse(raw) as UserProfile) : null;
}

/** Save locally always; sync to backend if we have a token. Never throws on sync failure. */
export async function persistProfile(profile: UserProfile): Promise<{ synced: boolean }> {
  saveProfileLocal(profile);
  if (!getToken()) return { synced: false };
  try {
    await api.saveProfile(profile);
    return { synced: true };
  } catch (err) {
    console.warn('[api] profile sync failed, kept locally', err);
    return { synced: false };
  }
}
