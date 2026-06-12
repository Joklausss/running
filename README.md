# Pacer — Personalized Running App

AI training plans, geolocated routes, real-time GPS tracking & stats.
Monorepo: **React + TS** frontend, **Node/Express + TS** backend, **PostgreSQL**.

## Stack
- Frontend: React 18, TypeScript, Vite, Tailwind CSS, React Router (Leaflet & Recharts added in later slices)
- Backend: Express, TypeScript, PostgreSQL (`pg`), JWT auth, Zod validation, Anthropic SDK
- DB: PostgreSQL, plain-SQL forward-only migrations

## Layout
```
running-app/
├── frontend/   # React app (onboarding wizard ✅)
├── backend/    # Express API (auth + profile ✅)
└── database/   # SQL migrations
```

## Getting started
```bash
npm install                 # installs both workspaces

# Frontend (works standalone — profile persists to localStorage)
npm run dev:frontend        # http://localhost:5173

# Backend (needs PostgreSQL running)
cp .env.example .env        # then edit DATABASE_URL / secrets
npm run migrate             # apply database/migrations
npm run dev:backend         # http://localhost:4000
```

The frontend proxies `/api` to the backend and falls back to localStorage when
the backend isn't running, so onboarding is demoable without a database.

## Roadmap (vertical slices)
- [x] Monorepo scaffold, DB schema, auth + profile API
- [x] Onboarding wizard (4 steps)
- [x] Training plan generation (deterministic `TrainingPlanService`) & week calendar
- [x] Route **generation** (Leaflet): builds a graph from the OSM path network and stitches a route ≈ the session's target distance (largest-component start, Dijkstra loops + straight/round fallback + multi-leg combining, never errors on small distances), optional **slope target 1–10** (elevation-scored candidates), elevation profile, GPX export, session association
- [x] Real-time GPS tracking (Haversine, aberrant-point filter, 30s pace smoothing, km haptics, crash-safe buffer, run summary + RPE/mood/notes)
- [x] History & statistics (Recharts): history list+filters+replay, stats charts, CTL/ATL/TSB, streak, heatmap, dashboard next-session/week-vs-week
- [ ] PWA / offline Service Worker polish
```
