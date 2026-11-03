# syntax=docker/dockerfile:1
# Build stage: compile the server and the web UI, then keep only production dependencies.
FROM node:22-slim AS build
WORKDIR /app
# better-sqlite3 falls back to a source build when no prebuilt binary matches.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# Runtime stage.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    DAILY_DIFF_HOME=/data \
    # Only honored when /.dockerenv exists: a container can't port-map a loopback-bound server.
    # Publish it on the host's loopback only: docker run -p 127.0.0.1:4242:4242 ...
    DAILY_DIFF_HOST=0.0.0.0
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 4242
USER node
CMD ["node", "dist/cli.js"]
