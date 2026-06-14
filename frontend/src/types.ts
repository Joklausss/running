export type Objective =
  | 'weight_loss'
  | 'race_5_10k'
  | 'half_marathon'
  | 'marathon'
  | 'endurance'
  | 'wellbeing';

export type Level = 'beginner' | 'intermediate' | 'advanced';

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type Injury = 'knee' | 'ankle' | 'back';

export type MaxDuration = 30 | 45 | 60 | 90 | 120;

export type SearchRadius = 1 | 3 | 5 | 10;

export interface UserProfile {
  objective: Objective;
  level: Level;
  vma: number | null;
  vo2max: number | null;
  sessionsPerWeek: number;
  availableDays: Weekday[];
  injuries: Injury[];
  maxSessionDuration: MaxDuration;
  locationLat: number | null;
  locationLng: number | null;
  locationLabel: string | null;
  searchRadius: SearchRadius;
}

export type SessionType =
  | 'endurance_fondamentale'
  | 'fractionne_court'
  | 'fractionne_long'
  | 'tempo'
  | 'sortie_longue'
  | 'recuperation_active'
  | 'cote';

// ---- Training plan shapes (as returned by the API) ----

export interface TrainingPlan {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'active' | 'completed' | 'archived';
  created_at: string;
}

export interface PlannedSession {
  id: string;
  plan_id: string;
  week_number: number;
  day_of_week: number; // 0 = Monday
  session_type: SessionType;
  duration_min: number;
  description: string;
  target_pace_min: string | null; // NUMERIC → string from pg
  target_pace_max: string | null;
  target_hr_zone: string | null;
  estimated_km: string; // NUMERIC → string from pg
  route_id: string | null;
  order_index: number;
  // joined from routes when associated
  route_name?: string | null;
  route_distance_km?: number | null;
  route_terrain?: TerrainType | null;
  route_geojson?: GeoJSONLineString | null;
}

export type TerrainType = 'asphalt' | 'path' | 'mixed' | 'trail';

export interface GeoJSONLineString {
  type: 'LineString';
  coordinates: [number, number][]; // [lng, lat]
}

export interface Route {
  id: string;
  name: string;
  distance_km: number;
  elevation_gain: number;
  terrain_type: TerrainType;
  is_loop: boolean;
  center_lat: number;
  center_lng: number;
  geojson: GeoJSONLineString;
  source: string;
  discipline?: string | null;
}

export interface ElevationPoint {
  distKm: number;
  ele: number;
}
