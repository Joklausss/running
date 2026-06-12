import type {
  Injury,
  Level,
  MaxDuration,
  Objective,
  SearchRadius,
  Weekday,
} from '../../types';

export const OBJECTIVES: {
  id: Objective;
  icon: string;
  title: string;
  desc: string;
}[] = [
  { id: 'weight_loss', icon: '🔥', title: 'Perte de poids', desc: 'Brûler des calories, retrouver la forme.' },
  { id: 'race_5_10k', icon: '🏃', title: 'Préparation 5K–10K', desc: 'Viser une première course ou un chrono.' },
  { id: 'half_marathon', icon: '🥈', title: 'Semi-marathon', desc: '21,1 km : franchir le cap de la distance.' },
  { id: 'marathon', icon: '🏅', title: 'Marathon', desc: '42,195 km : le grand objectif.' },
  { id: 'endurance', icon: '📈', title: 'Améliorer l’endurance', desc: 'Courir plus longtemps, plus facilement.' },
  { id: 'wellbeing', icon: '🌿', title: 'Bien-être général', desc: 'Bouger régulièrement, sans pression.' },
];

export const LEVELS: { id: Level; title: string; desc: string }[] = [
  { id: 'beginner', title: 'Débutant', desc: 'Je commence ou je reprends la course.' },
  { id: 'intermediate', title: 'Intermédiaire', desc: 'Je cours régulièrement depuis quelques mois.' },
  { id: 'advanced', title: 'Avancé', desc: 'Je m’entraîne avec des séances structurées.' },
];

export const WEEKDAYS: { id: Weekday; short: string; long: string }[] = [
  { id: 'mon', short: 'Lun', long: 'Lundi' },
  { id: 'tue', short: 'Mar', long: 'Mardi' },
  { id: 'wed', short: 'Mer', long: 'Mercredi' },
  { id: 'thu', short: 'Jeu', long: 'Jeudi' },
  { id: 'fri', short: 'Ven', long: 'Vendredi' },
  { id: 'sat', short: 'Sam', long: 'Samedi' },
  { id: 'sun', short: 'Dim', long: 'Dimanche' },
];

export const INJURIES: { id: Injury; icon: string; label: string }[] = [
  { id: 'knee', icon: '🦵', label: 'Genou' },
  { id: 'ankle', icon: '🦶', label: 'Cheville' },
  { id: 'back', icon: '🔙', label: 'Dos' },
];

export const DURATIONS: { id: MaxDuration; label: string }[] = [
  { id: 30, label: '30 min' },
  { id: 45, label: '45 min' },
  { id: 60, label: '1 h' },
  { id: 90, label: '1 h 30' },
  { id: 120, label: '2 h +' },
];

export const RADII: { id: SearchRadius; label: string }[] = [
  { id: 1, label: '1 km' },
  { id: 3, label: '3 km' },
  { id: 5, label: '5 km' },
  { id: 10, label: '10 km' },
];
