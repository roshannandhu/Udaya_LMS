FROM node:20-slim

# git + CA certs: Baileys pulls a transitive dependency (libsignal) straight from
# GitHub, which the slim image can't clone without git → "npm error enoent / unknown
# git error". python3/make/g++ cover any dep that needs a native (node-gyp) build.
RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the lockfile too (when present) so installs are reproducible.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

# session/ (WhatsApp login + warm-up state) and logs/ are mounted as volumes in
# docker-compose so they survive redeploys; create them for local/dev runs too.
RUN mkdir -p /app/session /app/logs

ENV NODE_ENV=production
EXPOSE 3100

CMD ["node", "index.js"]
