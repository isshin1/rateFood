# ratefood — task runner
#
# `just dev`  — local Postgres (:5434) + FastAPI backend (:8081) + frontend (:3001).
#               Backend + frontend run in background; logs in ./logs/{service}.log;
#               PIDs in ./logs/{service}.pid. Both hot-reload (uvicorn --reload + Turbopack HMR).
# `just prod` — `docker compose up --build -d`. Creates the external `docker_network`
#               bridge if missing.

set shell := ["bash", "-cu"]

# local dev database (postgres on docker — reuses existing `timescaledb` container)
DB_HOST     := "localhost"
DB_PORT     := "5434"
DB_USER     := "candle_user"
DB_PASSWORD := "candle_password"
DB_DATABASE := "food_db"

default:
    @just --list

dev: _logs-dir dev-db dev-redis
    @echo "starting backend, frontend; logs in ./logs/"
    @nohup bash -c 'cd backend && uv run uvicorn app.main:app --host 0.0.0.0 --port 8081 --reload' >logs/backend.log 2>&1 & echo $! > logs/backend.pid
    @nohup bash -c 'cd frontend && pnpm run dev' >logs/frontend.log 2>&1 & echo $! > logs/frontend.pid
    @echo "tail logs with: just logs [backend|frontend]"
    @echo "stop with:      just dev-stop"
    @echo "first time? run 'just install' to fetch deps"

# verify the local postgres (reuses existing `timescaledb` container on :5434)
dev-db:
    @nc -z {{DB_HOST}} {{DB_PORT}} 2>/dev/null || { echo "no postgres listening on {{DB_HOST}}:{{DB_PORT}} — start your timescaledb container"; exit 1; }
    @echo "db reachable on {{DB_HOST}}:{{DB_PORT}}"

# verify redis (jwt blacklist) is reachable on :6379
dev-redis:
    @nc -z localhost 6379 2>/dev/null || { echo "no redis on localhost:6379 — start one (e.g. docker run -d -p 6379:6379 redis:7-alpine)"; exit 1; }
    @echo "redis reachable on localhost:6379"

install:
    cd backend && uv sync
    cd frontend && pnpm install

dev-stop:
    -@for f in logs/*.pid; do [ -f "$f" ] || continue; pid=$(cat "$f"); pkill -P "$pid" 2>/dev/null || true; kill "$pid" 2>/dev/null || true; rm "$f"; done
    -@pkill -f '/ratefood/backend.*uvicorn' 2>/dev/null || true
    -@pkill -f '/ratefood/frontend.*(next dev|next-server)' 2>/dev/null || true
    @echo "stopped"

logs service="":
    @if [ -z "{{service}}" ]; then tail -f logs/*.log; else tail -f logs/{{service}}.log; fi

prod: _docker-network
    docker compose up --build -d

prod-stop:
    docker compose down

prod-logs:
    docker compose logs -f

build:
    cd backend && uv sync
    cd frontend && pnpm install && pnpm run build

clean:
    rm -rf logs frontend/.next backend/.venv

_logs-dir:
    @mkdir -p logs

_docker-network:
    @docker network inspect docker_network >/dev/null 2>&1 || docker network create docker_network --subnet 172.20.0.0/16
