FROM node:20-slim

WORKDIR /app

# Install deps first for layer caching. No package-lock is committed, so fall back
# to `npm install` when `npm ci` can't run.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

# session/ (WhatsApp login + warm-up state) and logs/ are mounted as volumes in
# docker-compose so they survive redeploys; create them for local/dev runs too.
RUN mkdir -p /app/session /app/logs

ENV NODE_ENV=production
EXPOSE 3100

CMD ["node", "index.js"]
