# Build context is the repo ROOT (see docker-compose.yml).
# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci
COPY frontend ./frontend
# VITE_API_URL defaults to /api (same-origin) → proxied to the backend by nginx
RUN npm run build --workspace frontend

# ---- runtime stage: static files via nginx ----
FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
