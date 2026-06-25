# Container image for the People databank.
# Works on Railway, Render, Fly.io, or any Docker host.
FROM node:20-bookworm-slim

# Build tools are a fallback in case better-sqlite3 needs to compile from source.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (better layer caching).
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the application.
COPY . .

# Defaults — your host should override PORT and set DB_PATH to a persistent volume.
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/people.sqlite

EXPOSE 3000

CMD ["node", "server/index.js"]
