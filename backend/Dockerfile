# Build context is the repo ROOT (see docker-compose.yml).
# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci
COPY backend ./backend
COPY database ./database
RUN npm run build --workspace backend

# ---- runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# install production dependencies only
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --omit=dev && npm cache clean --force
# compiled app + SQL migrations
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/database ./database
WORKDIR /app/backend
EXPOSE 4000
# compose runs migrations then starts; this is the default if run standalone
CMD ["node", "dist/index.js"]
