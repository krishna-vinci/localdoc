.PHONY: help backend frontend db up down build clean test lint

help:
	@echo "LocalDocs Hub - Makefile Commands"
	@echo "==================================="
	@echo "  make up          Start all services (Docker Compose dev)"
	@echo "                   Frontend: http://localhost:4321"
	@echo "                   Backend:  http://localhost:4320"
	@echo "                   PostgreSQL: localhost:5433"
	@echo "  make down        Stop all services"
	@echo "  make build       Rebuild Docker images"
	@echo "  make backend     Install backend deps (uv)"
	@echo "  make frontend    Install frontend deps (npm)"
	@echo "  make test        Run all tests"
	@echo "  make lint        Run linters"
	@echo "  make clean       Remove containers, volumes, build artifacts"

up:
	docker compose -f docker-compose.dev.yml up

down:
	docker compose -f docker-compose.dev.yml down

build:
	docker compose -f docker-compose.dev.yml build --no-cache

backend:
	cd backend && uv sync --system

frontend:
	cd frontend && npm install

test:
	cd backend && pytest
	cd frontend && npm run type-check

lint:
	cd backend && ruff check .
	cd frontend && npm run lint

clean:
	docker compose -f docker-compose.dev.yml down -v
	cd backend && rm -rf .pytest_cache .mypy_cache
	cd frontend && rm -rf .next
