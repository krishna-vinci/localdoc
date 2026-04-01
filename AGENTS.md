# Agent Guide — LocalDocs Hub

## Project Overview
LocalDocs Hub is a local-first markdown document management system. Files stay on disk, indexed in PostgreSQL. Frontend: Next.js 15 + shadcn/ui + Tailwind v4. Backend: FastAPI + SQLAlchemy 2.0 async + Alembic migrations.

## Directory Structure
```
/home/krishna/localdoc/
├── backend/          # FastAPI application (Python 3.11+)
│   ├── app/
│   │   ├── api/      # Route handlers (folders, documents, search, sync)
│   │   ├── core/     # Config, database engine, session maker
│   │   ├── models/   # SQLAlchemy ORM models
│   │   ├── schemas/  # Pydantic request/response schemas
│   │   └── services/ # Business logic
│   ├── alembic/      # Database migrations
│   ├── pyproject.toml
│   └── Dockerfile
├── frontend/         # Next.js 15 application
│   ├── app/          # App router pages
│   ├── components/   # UI components (shadcn/ui)
│   ├── lib/          # Utilities (cn helper)
│   ├── types/        # Shared TypeScript types
│   └── package.json
├── docker-compose.dev.yml  # Dev environment with hot reload
├── .github/workflows/      # CI/CD pipelines
└── docs/             # Architecture & planning docs
```

## Tech Stack
- **Backend**: Python 3.11+, FastAPI 0.115+, SQLAlchemy 2.0 (async), Alembic, Pydantic v2
- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, shadcn/ui
- **Database**: PostgreSQL 16 (primary), SQLite (local agent — future)
- **Container**: Docker + Docker Compose

## Ports
| Service   | Host Port | Container Port |
|-----------|-----------|----------------|
| Frontend  | 4321      | 4321           |
| Backend   | 4320      | 4320           |
| PostgreSQL| 5433      | 5432           | |

## Commands

### Backend (from /home/krishna/localdoc/backend)
```bash
# Install dependencies
uv sync --system

# Run server with hot reload
uvicorn app.main:app --reload --port 4320

# Run migrations
alembic upgrade head

# Create migration
alembic revision --autogenerate -m "migration name"

# Lint
ruff check .

# Type-check
mypy app/

# Test
pytest
```

### Frontend (from /home/krishna/localdoc/frontend)
```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Type-check
npm run type-check

# Lint
npm run lint
```

### Docker Compose (from /home/krishna/localdoc)
```bash
# Start all services with hot reload
docker compose -f docker-compose.dev.yml up

# Stop all services
docker compose -f docker-compose.dev.yml down

# Rebuild images
docker compose -f docker-compose.dev.yml build --no-cache
```

## Coding Conventions

### Backend
- **Python style**: Black-compatible (line length 100), Ruff for linting
- **Type hints**: Strict mypy mode — no implicit Any
- **Async**: Always use `async def` with SQLAlchemy 2.0 async sessions; never mix sync/async
- **Pydantic**: Use `pydantic-settings` for config; `BaseModel` for schemas; `from_attributes = True` for ORM responses
- **DB sessions**: Use `async_session_maker` with context manager pattern; always close sessions
- **Imports**: Absolute imports from app root (e.g., `from app.core.config import settings`)
- **Migrations**: Never modify existing migration files; create new ones with `alembic revision --autogenerate`

### Frontend
- **React 19** with Server Components by default; add `"use client"` only when needed
- **shadcn/ui**: Components live in `components/ui/`; customize via `className` and inline styles
- **Tailwind v4**: Use CSS `@theme` variables for design tokens; avoid hardcoded colors
- **Icons**: Lucide React
- **No any**: Avoid TypeScript `any`; use `unknown` and type guards when needed

### API Design
- Prefix all routes with `/api/v1/`
- Use standard HTTP verbs and status codes (GET 200, POST 201, DELETE 204, 404, 422, 500)
- Return consistent JSON error shapes: `{"detail": "message"}`

## Environment Variables
See `backend/.env.example` and `frontend/.env.local` for required variables.

## Workflow
1. Create a branch from `development` for features
2. Make changes; run linters and type-checkers locally
3. Open a PR targeting `development`
4. CI runs tests, lint, type-check, and Docker build
5. Merge after approval
6. `main` branch is auto-deployed via Docker Hub/GHCR on merge
