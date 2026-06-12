-- ============================================================
-- 001_init.sql — Initial schema for the running app
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- ---------- Users & profiles ----------

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Objective / level kept as TEXT (validated in app) for flexibility.
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  objective            TEXT NOT NULL,            -- weight_loss | race_5_10k | half_marathon | marathon | endurance | wellbeing
  level                TEXT NOT NULL,            -- beginner | intermediate | advanced
  vma                  NUMERIC(4,1),             -- km/h, optional
  vo2max               NUMERIC(4,1),             -- optional
  sessions_per_week    SMALLINT NOT NULL DEFAULT 3 CHECK (sessions_per_week BETWEEN 2 AND 6),
  available_days       TEXT[] NOT NULL DEFAULT '{}', -- ['mon','tue',...]
  injuries             TEXT[] NOT NULL DEFAULT '{}', -- ['knee','ankle','back'] or empty
  max_session_duration SMALLINT NOT NULL DEFAULT 60, -- minutes: 30|45|60|90|120
  location_lat         DOUBLE PRECISION,
  location_lng         DOUBLE PRECISION,
  location_label       TEXT,                     -- city / postcode as typed
  search_radius        SMALLINT NOT NULL DEFAULT 5, -- km: 1|3|5|10
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Training plans & planned sessions ----------

CREATE TABLE IF NOT EXISTS training_plans (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active', -- active | completed | archived
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_training_plans_user ON training_plans(user_id);

CREATE TABLE IF NOT EXISTS planned_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         UUID NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
  week_number     SMALLINT NOT NULL,
  day_of_week     SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Mon
  session_type    TEXT NOT NULL,   -- endurance_fondamentale | fractionne_court | ...
  duration_min    SMALLINT NOT NULL,
  description      TEXT NOT NULL,
  target_pace_min NUMERIC(4,2),    -- min/km lower bound (faster)
  target_pace_max NUMERIC(4,2),    -- min/km upper bound (slower)
  target_hr_zone  TEXT,            -- e.g. 'Z2 (65-75%)'
  estimated_km    NUMERIC(6,2) NOT NULL DEFAULT 0,
  route_id        UUID,            -- nullable FK to routes, set later
  order_index     SMALLINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_planned_sessions_plan ON planned_sessions(plan_id);

-- ---------- Routes ----------

CREATE TABLE IF NOT EXISTS routes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  distance_km    NUMERIC(6,2) NOT NULL,
  elevation_gain INTEGER NOT NULL DEFAULT 0,
  terrain_type   TEXT,             -- asphalt | path | mixed | trail
  is_loop        BOOLEAN NOT NULL DEFAULT false,
  geojson        JSONB NOT NULL,
  thumbnail_url  TEXT,
  source         TEXT NOT NULL DEFAULT 'openstreetmap', -- openstreetmap | user
  center_lat     DOUBLE PRECISION,
  center_lng     DOUBLE PRECISION,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_routes_center ON routes(center_lat, center_lng);

ALTER TABLE planned_sessions
  DROP CONSTRAINT IF EXISTS fk_planned_sessions_route;
ALTER TABLE planned_sessions
  ADD CONSTRAINT fk_planned_sessions_route
  FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL;

-- ---------- Activities (real runs) ----------

CREATE TABLE IF NOT EXISTS activities (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  planned_session_id  UUID REFERENCES planned_sessions(id) ON DELETE SET NULL,
  started_at          TIMESTAMPTZ NOT NULL,
  ended_at            TIMESTAMPTZ,
  distance_km         NUMERIC(6,2) NOT NULL DEFAULT 0,
  duration_sec        INTEGER NOT NULL DEFAULT 0,
  avg_pace_sec_per_km INTEGER,
  avg_hr              SMALLINT,
  max_hr              SMALLINT,
  gps_track           JSONB NOT NULL DEFAULT '[]', -- [{lat,lng,t,hr?}]
  elevation_gain      INTEGER NOT NULL DEFAULT 0,
  rpe                 SMALLINT CHECK (rpe BETWEEN 1 AND 10),
  mood                TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activities_user_date ON activities(user_id, started_at DESC);
