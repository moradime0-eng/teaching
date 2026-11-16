# ── Stage 1: Build ──────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Copy dependency manifests first (better layer caching)
COPY package.json package-lock.json ./

RUN npm ci --legacy-peer-deps

# Copy source and build for production
COPY . .

RUN npm run build

# ── Stage 2: Serve ──────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Copy SSR server output (server + browser static files)
COPY --from=build /app/dist/frontend ./dist/frontend

# Copy only the production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["node", "dist/frontend/server/server.mjs"]
