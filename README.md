# LocalDocs Hub

> Local-first markdown document management — files stay on disk, synced across devices.

## Quick Start

### Docker Compose (recommended for dev)
```bash
docker compose -f docker-compose.dev.yml up
```
- Frontend: http://localhost:4321
- Backend API: http://localhost:4320
- API docs: http://localhost:4320/docs

### Manual Setup

**Backend**
```bash
cd backend
pip install uv && uv sync --system
uvicorn app.main:app --reload
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

## Project Structure

```
backend/           FastAPI + SQLAlchemy 2.0 async + PostgreSQL
frontend/          Next.js 15 + Tailwind v4 + shadcn/ui
docker-compose.dev.yml  Hot-reload dev environment
```

## Tech Stack

| Layer       | Technology                                     |
|-------------|-----------------------------------------------|
| Frontend    | Next.js 15, React 19, TypeScript, Tailwind v4 |
| Backend     | FastAPI, SQLAlchemy 2.0 (async), Pydantic v2  |
| Database    | PostgreSQL 16                                  |
| Migrations  | Alembic                                        |
| Container   | Docker, Docker Compose                          |
| CI/CD       | GitHub Actions                                 |

## Documentation

See [`docs/`](docs/) for architecture, product spec, and implementation roadmap.
