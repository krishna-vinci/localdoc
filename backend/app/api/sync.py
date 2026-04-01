from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse
import asyncio
import json

router = APIRouter()

# In-memory sync state (replace with Redis/DB in production)
_sync_clients: list[asyncio.Queue] = []


async def event_generator():
    queue = asyncio.Queue()
    _sync_clients.append(queue)
    try:
        while True:
            data = await queue.get()
            yield {"event": "sync", "data": json.dumps(data)}
    finally:
        _sync_clients.remove(queue)


@router.get("/events")
async def sync_events():
    return EventSourceResponse(event_generator())


@router.post("/push")
async def sync_push(event: dict):
    for queue in _sync_clients:
        await queue.put(event)
    return {"status": "broadcast", "clients": len(_sync_clients)}
