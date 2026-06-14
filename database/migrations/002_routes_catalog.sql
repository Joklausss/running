-- ============================================================
-- 002_routes_catalog.sql — curated (OSM) + personal routes
-- ============================================================

-- Personal routes belong to a user; curated/generated routes are shared (NULL).
ALTER TABLE routes ADD COLUMN IF NOT EXISTS user_id UUID
  REFERENCES users(id) ON DELETE CASCADE;

-- Which sport a route is for (running | trail | road | mtb | gravel), nullable.
ALTER TABLE routes ADD COLUMN IF NOT EXISTS discipline TEXT;

CREATE INDEX IF NOT EXISTS idx_routes_user ON routes(user_id);
CREATE INDEX IF NOT EXISTS idx_routes_source ON routes(source);
