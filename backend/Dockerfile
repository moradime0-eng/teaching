# syntax=docker/dockerfile:1.7

# ---------- Build stage ----------
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci --no-audit --no-fund --legacy-peer-deps

COPY src ./src
RUN npm run build

RUN npm prune --omit=dev --legacy-peer-deps


# ---------- Runtime stage ----------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=5000 \
    NPM_CONFIG_LOGLEVEL=warn \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe \
    TEMP_DIR=/home/app/scratch

# ✅ FIX: نصب صریح ffmpeg + ffprobe
# در Alpine، ffprobe در پکیج ffmpeg هست ولی صریحاً چک می‌کنیم
RUN apk add --no-cache ffmpeg && \
    ffmpeg -version && \
    ffprobe -version

# Create non-root user
RUN addgroup -S app && adduser -S app -G app

# ✅ FIX: ایجاد پوشه‌های scratch و uploads با مالکیت صحیح
RUN mkdir -p /home/app/scratch /app/uploads && \
    chown -R app:app /home/app/scratch /app/uploads

# Copy compiled output and production node_modules from builder
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/package.json ./package.json

USER app

EXPOSE 5000

CMD ["node", "dist/server.js"]