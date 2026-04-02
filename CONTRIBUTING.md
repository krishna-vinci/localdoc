# Contributing to LocalDocs Hub

Thank you for your interest in contributing.

## Principles

- keep changes focused and easy to review
- preserve the local-first design
- prefer explicit, operationally safe behavior
- avoid unrelated refactors in feature or fix branches

## Before you start

For significant changes, open an issue or discussion first so the direction is clear before implementation.

Useful project references:

- `docs/README.md`
- `docs/05-layer-4-5-execution-checklist.md`
- `docs/06-thin-agent-central-sync-architecture.md`
- `docs/07-agent-installation.md`

## Development workflow

### Backend

```bash
cd backend
uv sync
uv run alembic upgrade head
uv run ruff check .
uv run pytest
```

### Frontend

```bash
cd frontend
npm install
npm run type-check
npm run lint
```

### CLI

```bash
cd agent
gofmt -w main.go
go build ./...
```

## Pull requests

- describe the problem being solved
- explain the approach briefly
- mention validation performed
- include screenshots when UI changes are relevant
- keep the diff cohesive

## Documentation

If behavior changes, update the relevant documentation in the same change.

## Code style expectations

- backend: typed, explicit, async-safe Python
- frontend: typed React/TypeScript with no `any`
- CLI: simple, explicit Go behavior with predictable command output

## Reporting issues

When reporting a bug, include:

- what you expected
- what happened instead
- reproduction steps
- relevant logs or screenshots
- environment details when they matter
