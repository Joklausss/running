import type { SessionType } from '../../types';

export interface SessionMeta {
  label: string;
  short: string;
  icon: string;
  /** accent colour (hex) used for the card's left border / dot */
  color: string;
}

export const SESSION_META: Record<SessionType, SessionMeta> = {
  endurance_fondamentale: {
    label: 'Endurance fondamentale',
    short: 'EF',
    icon: '🟢',
    color: '#00C853',
  },
  recuperation_active: {
    label: 'Récupération active',
    short: 'Récup',
    icon: '💧',
    color: '#38BDF8',
  },
  tempo: { label: 'Tempo / seuil', short: 'Tempo', icon: '🔶', color: '#FF6B35' },
  fractionne_court: {
    label: 'Fractionné court',
    short: 'VMA',
    icon: '⚡',
    color: '#EF4444',
  },
  fractionne_long: {
    label: 'Fractionné long',
    short: 'Frac. long',
    icon: '🔁',
    color: '#F59E0B',
  },
  sortie_longue: {
    label: 'Sortie longue',
    short: 'Longue',
    icon: '🏔️',
    color: '#A855F7',
  },
  cote: { label: 'Côtes', short: 'Côtes', icon: '⛰️', color: '#D97706' },
};

export const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const DAY_LABELS_LONG = [
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
  'Dimanche',
];

/** "5.33" (min/km decimal) → "5:20 /km" */
export function formatPace(decimalMinPerKm: string | null): string | null {
  if (decimalMinPerKm == null) return null;
  const v = Number(decimalMinPerKm);
  if (!Number.isFinite(v)) return null;
  const min = Math.floor(v);
  const sec = Math.round((v - min) * 60);
  const s = sec === 60 ? '00' : String(sec).padStart(2, '0');
  return `${sec === 60 ? min + 1 : min}:${s} /km`;
}
