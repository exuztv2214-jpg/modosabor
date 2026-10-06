FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV MODO_SABOR_BROWSER=/usr/bin/chromium
ENV HOST=0.0.0.0

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3867

CMD ["npm", "run", "panel"]
