# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Two-service monorepo for the "ratefood" app:

- `backend/` — FastAPI service (Python 3.12, `uv`-managed). Owns auth (JWT + BCrypt), the `users` table, and all foodapp domain (restaurants, dishes, drafts, favourites, cities). Persists to PostgreSQL via async SQLAlchemy, stores images in MinIO, uses Redis for the JWT blacklist. Listens on `:8081`.
- `frontend/` — Next.js 15 (App Router, Turbopack) + React 18 + Tailwind 4 + Radix UI. Talks directly to the backend on `:8081`.

`docker-compose.yaml` wires `backend`, `frontend`, `redis`, and `minio` together on the external `docker_network` bridge. Postgres is expected externally (the local dev DB is a separate `timescaledb` container on `:5434` — see `justfile`).

> **History note:** This repo previously had a separate Spring Boot `backend/` (Java) plus a Spring Cloud Gateway `api-gateway/`. Both were removed when migrating to FastAPI. The gateway's auth/proxy responsibilities now live inside `backend/`.

## Common commands

Use the root `justfile`:

- `just install` — install Python deps (`uv sync` in `backend/`) and JS deps (`pnpm install` in `frontend/`).
- `just dev` — start backend (:8081) + frontend (:3000) in background; logs in `./logs/{service}.log`; both hot-reload.
- `just dev-stop` — kill the whole process tree (uvicorn, next-server, child workers).
- `just logs [service]` — tail one or all logs.
- `just prod` — `docker compose up --build -d` for `backend`, `frontend`, `redis`, `minio`.
- `just prod-stop` / `just prod-logs` — counterparts.
- `just build` — install + build production assets.

### Backend (`backend/`)
- `uv sync` — install deps from `pyproject.toml` / `uv.lock`.
- `uv run uvicorn app.main:app --reload` — dev server.
- `uv run pytest` — run tests.

### Frontend (`frontend/`)
- `pnpm install` — install deps (pnpm, not npm; lockfile is `pnpm-lock.yaml`).
- `pnpm run dev` — Next.js dev server with Turbopack.
- `pnpm run build` / `pnpm start` — production build / serve.
- `pnpm run lint` — Next/ESLint.

## Architecture notes that span files

### Auth flow (backend-owned)
- Backend issues + validates JWTs; signing key from env `JWT_SIGNING_KEY` (Base64). Tokens are HS256, 24h TTL by default (`JWT_TTL_HOURS`).
- Revoked tokens are tracked in Redis with TTL = remaining token lifetime (no cleanup job).
- Frontend stores the JWT and decodes it client-side with `jwt-decode`; session state lives in `frontend/src/app/contexts/SessionContext.tsx`.

### Backend module layout (`backend/app/`)
- `main.py` — FastAPI app + middleware wiring.
- `config.py` — env-driven `Settings` (Pydantic).
- `db.py` — async SQLAlchemy `engine`, `SessionLocal`, `Base`, `get_session` dependency.
- Resource modules will be added per feature (auth, restaurants, dishes, drafts, favourites, cities, images) as Phase 2-5 lands.

### Frontend structure
App Router (`frontend/src/app/`). Pages: `page.tsx` (home), `favourites/`, `submitted/`, `authentication/`. Cross-page state in `contexts/AppContext.tsx` and `contexts/SessionContext.tsx`. UI primitives in `components/ui/` (shadcn/Radix); feature components (`RestaurantCard`, `DishCard`, `AddRestaurantDialog`, `FilterPanel`, …) sit directly under `components/`.

## Conventions / gotchas

- `find` is aliased to `fd` in this user's shell — invoking `find` from `Bash` runs `fd` with `fd` syntax. Use absolute binary paths (`/usr/bin/find`) or use `Glob`/`Grep` tools instead.
- Local dev DB is a `timescaledb` Docker container the user runs on `:5434` (creds `candle_user`/`candle_password`, db `food_db`). The `justfile`'s `dev-db` recipe only checks reachability — it doesn't manage that container.
- Schema is currently managed manually / via SQLAlchemy `create_all` in dev; for prod, Alembic migrations should be added before any schema change.
- The frontend's `pnpm run mock` (json-server) used to collide with the old gateway on `:8082`. The gateway is gone — that script is now harmless but also no longer matches the live API.
