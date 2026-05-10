# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

pnpm-based. Node 24 (matches CI).

```bash
pnpm dev               # auto-picks a port; --fresh wipes .next
pnpm build             # next build
pnpm typecheck         # tsc --noEmit
pnpm lint              # lint:js + lint:css (both --max-warnings 0)
pnpm test              # vitest run
pnpm compiler:check    # report files React Compiler had to skip
```

Single test: `pnpm vitest run <path>` or `-t '<name>'`.

CI: `.github/workflows/pr.yml` runs lint, typecheck, test, plus a non-blocking compiler check on changed files.

`pnpm dev` runs `scripts/dev-port.mjs` — main checkout gets 3000, worktrees get a stable hashed port, and fresh worktrees seed `data/banking.db` from main.

## Environment

`.env.example` lists what's needed. `BANKING_SECRET` derives the AES-256-GCM key for stored provider credentials — rotating it makes them all unreadable.

## Architecture

Next.js 15 App Router. Single-tenant household wealth aggregator pulling from Enable Banking (PSD2 cash/cards) and Avanza (investments).

Layering — every request flows route → service → repository → drizzle. Repos are pure drizzle queries (one file per table). Services compose repos. Routes parse + delegate.

```
app/                 routes (UI + api/)
components/ui/       cross-page primitives
lib/
  providers/         per-source integrations; registry.ts dispatches by id; types.ts defines the Provider interface
  sync/              orchestrator.ts + snapshot rebuild + rate limit + credential crypto
  repositories/      drizzle queries, one file per table
  services/          server-side business logic
  api/               zod schemas + route helpers (requireUser, errorMessage)
  db/                drizzle client + schema + migrations
  balance.ts         pickBalance — canonical balance-type preference
  queries.ts         React Query hooks
```

Key entry points worth knowing exist (grep when you need them):
- Sync flow: `lib/sync/orchestrator.ts` → provider `sync()` → `persistSyncResult` → `rebuildSnapshotsForUser`.
- Dashboard / bucketing: `lib/services/dashboard.ts`. Bucketing combines explicit `connection_holders` rows with IBAN-based auto-joint detection.
- DB: schema in `lib/db/schema.ts`, migrations in `lib/db/migrations/`. The `db` export in `lib/db/client.ts` is a Proxy that defers SQLite open — `next build` evaluates every route module and would otherwise race to open the file.

## Conventions

- **ESLint** flat config in `eslint.config.mjs`; local rules in `eslint-plugins/index.mjs` (notably `no-inline-styles`, `prefer-design-token-class`). `import/no-default-export` is on except for Next file-convention files.
- **Design tokens**: declared in `app/globals.css` under `@theme`. Both ESLint and Stylelint read from it; prefer token utilities over arbitrary values.
- **React Compiler** is enabled — do **not** add `useMemo` / `useCallback` / `React.memo`.
- **React Query** hooks live in `lib/queries.ts`; components don't `fetch` directly.
- **API routes** use helpers from `lib/api/route-helpers.ts` (`requireUser` is the only auth gate — mutating routes must verify the resource belongs to that user) and zod schemas from `lib/api/schemas.ts`.
- **Tailwind**: use `cn()` from `lib/utils.ts`; put size classes before color classes (`twMerge` collapses `text-*`).
- **Path alias**: `@/*` → repo root.
