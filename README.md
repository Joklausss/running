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
npm run dev:frontend        # http://localhost:5180

# Backend (needs PostgreSQL running)
cp .env.example .env        # then edit DATABASE_URL / secrets
npm run migrate             # apply database/migrations
npm run dev:backend         # http://localhost:4000
```

The frontend proxies `/api` to the backend and falls back to localStorage when
the backend isn't running, so onboarding is demoable without a database.

## Access from a smartphone

The Vite dev server binds to all network interfaces (`host: true`), so any
device on the same Wi-Fi can open the app.

```bash
# Prints your LAN URL + a QR-code link, then starts the dev server
npm run dev:lan
```

Open the printed URL in your phone's browser → tap **"Add to Home Screen"**
to install it as a PWA.

> **GPS tracking requires HTTPS.**  Mobile browsers block the Geolocation API
> on plain HTTP (except `localhost`).  To test GPS over LAN, expose the dev
> server through a TLS tunnel:
>
> ```bash
> # In a second terminal, after npm run dev:lan
> npx ngrok http 5180
> ```
>
> Ngrok gives you an `https://…ngrok.io` URL you can scan directly from the phone.

For the full stack (including the backend) over LAN, Docker is the simplest path:

```bash
docker compose up --build
# → reachable at http://<your-ip>:8080 from any device on the network
```

## Run with Docker (full stack)

Needs only Docker. Brings up PostgreSQL, the API (migrations run automatically),
and the frontend behind nginx (which proxies `/api` to the backend):

```bash
docker compose up --build
# → app on http://localhost:8080
```

Override secrets/ports via env (or a `.env` file next to `docker-compose.yml`):

```bash
POSTGRES_PASSWORD=… JWT_SECRET=… WEB_PORT=8080 docker compose up --build -d
```

Data persists in the `pgdata` volume. Tear down with `docker compose down`
(add `-v` to also drop the database).

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push/PR: `lint` +
`build` + `test`, plus a Postgres job that applies the migrations.
Locally: `npm run lint`, `npm test`.

## Roadmap (vertical slices)
- [x] Monorepo scaffold, DB schema, auth + profile API
- [x] Onboarding wizard (4 steps)
- [x] Training plan generation (deterministic `TrainingPlanService`) & week calendar
- [x] Route **generation** (Leaflet): builds a graph from the OSM path network and stitches a route ≈ the session's target distance (largest-component start, Dijkstra loops + straight/round fallback + multi-leg combining, never errors on small distances), optional **slope target 1–10** (elevation-scored candidates), elevation profile, GPX export, session association
- [x] Real-time GPS tracking (Haversine, aberrant-point filter, 30s pace smoothing, km haptics, crash-safe buffer, run summary + RPE/mood/notes)
- [x] History & statistics (Recharts): history list+filters+replay, stats charts, CTL/ATL/TSB, streak, heatmap, dashboard next-session/week-vs-week
- [x] Apple Watch export: structured workout (warmup/work/recovery/cooldown + repeats) → open **TCX** file (pace or HR-zone targets) + route GPX, for import via a third-party watch app (all watchOS, incl. older)
- [x] PWA / offline: installable (manifest + icons + service worker), offline app shell, cached OSM tiles & fonts, NetworkFirst API cache, and an offline activity queue that syncs finished runs on reconnect
```
