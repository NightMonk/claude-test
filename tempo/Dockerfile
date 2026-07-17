# Tempo — single Node server + SQLite. Small, private, self-hostable.
FROM node:20-slim

WORKDIR /app

# Install deps first for better layer caching. better-sqlite3 ships prebuilt
# binaries for common platforms, so no build toolchain is needed here.
COPY package*.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public

# Persist the database outside the image.
ENV DB_PATH=/data/tempo.sqlite
VOLUME /data

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server/index.js"]
