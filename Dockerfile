FROM node:22-bookworm-slim AS builder

# Railway deploy config lives in railway.json; keep this file watched.

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY server/package*.json ./server/
COPY client/package*.json ./client/

RUN npm ci --prefix server
RUN npm ci --prefix client

COPY server ./server
COPY client ./client

RUN npm --prefix client run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY server/package*.json ./server/
RUN npm ci --omit=dev --prefix server

COPY server ./server
RUN pip3 install --break-system-packages --no-cache-dir -r server/requirements-whisper.txt \
  && mkdir -p /app/server/whisper-models \
  && WHISPER_CACHE_DIR=/app/server/whisper-models python3 -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8', download_root='/app/server/whisper-models')"
COPY --from=builder /app/client/dist ./client/dist

EXPOSE 3001

CMD ["npm", "--prefix", "server", "start"]
