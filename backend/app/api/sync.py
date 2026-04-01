import asyncio
import json
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

router = APIRouter()

# In-memory sync state (replace with Redis/DB in production)
_sync_clients: list[asyncio.Queue[dict[str, Any]]] = []


async def event_generator() -> AsyncGenerator[dict[str, str], None]:
    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    _sync_clients.append(queue)
    try:
        while True:
            data = await queue.get()
            yield {"event": "sync", "data": json.dumps(data)}
    finally:
        if queue in _sync_clients:
            _sync_clients.remove(queue)


@router.get("/events")
async def sync_events() -> EventSourceResponse:
    return EventSourceResponse(event_generator())


@router.post("/push")
async def sync_push(event: dict[str, Any]) -> dict[str, str | int]:
    for queue in _sync_clients:
        await queue.put(event)
    return {"status": "broadcast", "clients": len(_sync_clients)}
