from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import documents, folders, projects, search, stats, sync
from app.core.config import settings
from app.services.watcher import folder_watcher


@asynccontextmanager
async def lifespan(_: FastAPI):
    await folder_watcher.start()
    try:
        yield
    finally:
        await folder_watcher.stop()


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        debug=settings.DEBUG,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    app.include_router(projects.router, prefix="/api/v1/projects", tags=["projects"])
    app.include_router(folders.router, prefix="/api/v1/folders", tags=["folders"])
    app.include_router(documents.router, prefix="/api/v1/documents", tags=["documents"])
    app.include_router(search.router, prefix="/api/v1/search", tags=["search"])
    app.include_router(sync.router, prefix="/api/v1/sync", tags=["sync"])
    app.include_router(stats.router, prefix="/api/v1/stats", tags=["stats"])

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "healthy", "version": settings.APP_VERSION}

    return app


app = create_app()
