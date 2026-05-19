# syntax=docker/dockerfile:1.7
# Multi-stage build for the banking Next.js app.
# Targets linux/arm64 (Pi) and linux/amd64. better-sqlite3 builds against
# glibc here (trixie-slim), so prebuilt binaries are picked up cleanly.

ARG NODE_VERSION=24

# Tag tracks the latest patch of Node 24 on trixie-slim. For a fully
# reproducible build, replace with a digest pin, e.g.
#   FROM node:24-trixie-slim@sha256:<digest> AS base
# and re-run `docker pull node:24-trixie-slim && docker image inspect ...
# --format='{{index .RepoDigests 0}}'` to refresh the digest periodically.

# ---------- base ----------
FROM node:${NODE_VERSION}-trixie-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

# ---------- deps ----------
FROM base AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------- builder ----------
FROM base AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Build identity: CI passes the commit SHA via --build-arg so the
# generated lib/build-info.ts can attribute the image to a commit.
# .dockerignore excludes .git, so the in-container `git rev-parse`
# fallback in scripts/build-info.mjs won't work here — BUILD_SHA is
# how the SHA reaches the build.
ARG BUILD_SHA=""
ENV BUILD_SHA=${BUILD_SHA}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ---------- runner ----------
FROM node:${NODE_VERSION}-trixie-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd  --system --uid 1001 --gid nodejs nextjs \
  && mkdir -p /app/data /app/keys \
  && chown -R nextjs:nodejs /app

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
