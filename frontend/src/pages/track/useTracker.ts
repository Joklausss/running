import { useCallback, useEffect, useRef, useState } from 'react';
import {
  avgPaceSecPerKm,
  haversineKm,
  isAberrant,
  movingPaceSecPerKm,
  type TrackPoint,
} from './trackingMath';

export type TrackStatus = 'ready' | 'running' | 'paused' | 'finished';

export interface TrackerSnapshot {
  status: TrackStatus;
  points: TrackPoint[];
  distanceKm: number;
  elapsedSec: number;
  currentPaceSecPerKm: number | null;
  avgPaceSecPerKm: number | null;
  startedAt: number | null;
  accuracy: number | null;
  error: string | null;
}

const BUFFER_KEY = 'pacer_active_run';

interface Buffer {
  startedAt: number;
  points: TrackPoint[];
  plannedSessionId: string | null;
}

export function loadRunBuffer(): Buffer | null {
  try {
    const raw = localStorage.getItem(BUFFER_KEY);
    return raw ? (JSON.parse(raw) as Buffer) : null;
  } catch {
    return null;
  }
}
export function clearRunBuffer(): void {
  localStorage.removeItem(BUFFER_KEY);
}

/**
 * GPS tracker. Uses the browser Geolocation API; all derived metrics come from
 * the unit-tested pure math. GPS data stays on-device (localStorage buffer) and
 * is only uploaded when the caller saves the finished run.
 */
export function useTracker(opts: {
  plannedSessionId?: string | null;
  /** ref holding the latest heart-rate reading, if a strap is connected */
  hrRef?: React.MutableRefObject<number | null>;
}) {
  const [snap, setSnap] = useState<TrackerSnapshot>({
    status: 'ready',
    points: [],
    distanceKm: 0,
    elapsedSec: 0,
    currentPaceSecPerKm: null,
    avgPaceSecPerKm: null,
    startedAt: null,
    accuracy: null,
    error: null,
  });

  // mutable run state (avoids stale closures inside the geolocation callback)
  const ref = useRef({
    status: 'ready' as TrackStatus,
    points: [] as TrackPoint[],
    distanceKm: 0,
    activeSec: 0,
    startedAt: null as number | null,
    lastKmMilestone: 0,
    watchId: null as number | null,
    accuracy: null as number | null,
  });

  const publish = useCallback(() => {
    const r = ref.current;
    setSnap({
      status: r.status,
      points: r.points,
      distanceKm: r.distanceKm,
      elapsedSec: r.activeSec,
      currentPaceSecPerKm: movingPaceSecPerKm(r.points, 30),
      avgPaceSecPerKm: avgPaceSecPerKm(r.distanceKm, r.activeSec),
      startedAt: r.startedAt,
      accuracy: r.accuracy,
      error: null,
    });
  }, []);

  const persist = useCallback(
    (sessionId: string | null) => {
      const r = ref.current;
      if (r.startedAt == null) return;
      const buf: Buffer = {
        startedAt: r.startedAt,
        points: r.points,
        plannedSessionId: sessionId,
      };
      try {
        localStorage.setItem(BUFFER_KEY, JSON.stringify(buf));
      } catch {
        /* quota — ignore, in-memory still holds the run */
      }
    },
    [],
  );

  const onPosition = useCallback(
    (pos: GeolocationPosition) => {
      const r = ref.current;
      if (r.status !== 'running') return;
      r.accuracy = pos.coords.accuracy ?? null;

      const point: TrackPoint = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        t: pos.timestamp || Date.now(),
        hr: opts.hrRef?.current ?? undefined,
      };

      const prev = r.points[r.points.length - 1];
      if (prev) {
        if (isAberrant(prev, point)) return; // drop GPS glitch
        r.distanceKm += haversineKm(prev, point);
      }
      r.points.push(point);

      // km milestone → haptic feedback
      const km = Math.floor(r.distanceKm);
      if (km > r.lastKmMilestone) {
        r.lastKmMilestone = km;
        navigator.vibrate?.([120, 60, 120]);
      }

      persist(opts.plannedSessionId ?? null);
      publish();
    },
    [opts.hrRef, opts.plannedSessionId, persist, publish],
  );

  const onError = useCallback((err: GeolocationPositionError) => {
    setSnap((s) => ({
      ...s,
      error:
        err.code === err.PERMISSION_DENIED
          ? 'Accès à la localisation refusé.'
          : 'Signal GPS indisponible.',
    }));
  }, []);

  const startWatch = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setSnap((s) => ({ ...s, error: 'Géolocalisation non supportée.' }));
      return;
    }
    ref.current.watchId = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: 3000,
      timeout: 5000,
    });
  }, [onPosition, onError]);

  // 1s timer accrues *active* time (paused time excluded)
  useEffect(() => {
    const id = setInterval(() => {
      if (ref.current.status === 'running') {
        ref.current.activeSec += 1;
        publish();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [publish]);

  // stop watching on unmount
  useEffect(() => {
    return () => {
      if (ref.current.watchId != null)
        navigator.geolocation.clearWatch(ref.current.watchId);
    };
  }, []);

  const start = useCallback(() => {
    ref.current.status = 'running';
    ref.current.startedAt = Date.now();
    startWatch();
    publish();
  }, [startWatch, publish]);

  const pause = useCallback(() => {
    ref.current.status = 'paused';
    publish();
  }, [publish]);

  const resume = useCallback(() => {
    ref.current.status = 'running';
    publish();
  }, [publish]);

  const finish = useCallback(() => {
    ref.current.status = 'finished';
    if (ref.current.watchId != null) {
      navigator.geolocation.clearWatch(ref.current.watchId);
      ref.current.watchId = null;
    }
    publish();
  }, [publish]);

  return { snap, start, pause, resume, finish };
}
