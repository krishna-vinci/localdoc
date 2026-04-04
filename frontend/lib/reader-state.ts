"use client"

import { useSyncExternalStore } from "react"

const STORAGE_KEY = "localdocs.reader-state"
const STORAGE_EVENT = "localdocs-reader-state-change"
const MAX_RECENT_ITEMS = 12
const MAX_PINNED_ITEMS = 20

export interface ReaderDocumentSnapshot {
  id: string
  title: string
  file_name: string
  folder_name: string | null
  project_name: string | null
  updated_at: string
}

interface ReaderState {
  lastReadId: string | null
  recent: ReaderDocumentSnapshot[]
  pinned: ReaderDocumentSnapshot[]
}

const emptyState: ReaderState = {
  lastReadId: null,
  recent: [],
  pinned: [],
}

let cachedRawState: string | null = null
let cachedState: ReaderState = emptyState

function normalizeState(rawValue: string | null): ReaderState {
  if (!rawValue) {
    return emptyState
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<ReaderState>
    return {
      lastReadId: typeof parsed.lastReadId === "string" ? parsed.lastReadId : null,
      recent: Array.isArray(parsed.recent) ? parsed.recent : [],
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned : [],
    }
  } catch {
    return emptyState
  }
}

function readState(): ReaderState {
  if (typeof window === "undefined") {
    return emptyState
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEY)
  if (rawValue === cachedRawState) {
    return cachedState
  }

  cachedRawState = rawValue
  cachedState = normalizeState(rawValue)
  return cachedState
}

function writeState(nextState: ReaderState) {
  if (typeof window === "undefined") {
    return
  }

  const serializedState = JSON.stringify(nextState)
  if (serializedState === cachedRawState) {
    return
  }

  cachedRawState = serializedState
  cachedState = normalizeState(serializedState)
  window.localStorage.setItem(STORAGE_KEY, serializedState)
  window.dispatchEvent(new Event(STORAGE_EVENT))
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {}
  }

  const handleChange = () => onStoreChange()
  window.addEventListener(STORAGE_EVENT, handleChange)
  window.addEventListener("storage", handleChange)

  return () => {
    window.removeEventListener(STORAGE_EVENT, handleChange)
    window.removeEventListener("storage", handleChange)
  }
}

function snapshotFromDocument(document: {
  id: string
  title: string
  file_name: string
  folder_name: string | null
  project_name: string | null
  updated_at: string
}): ReaderDocumentSnapshot {
  return {
    id: document.id,
    title: document.title,
    file_name: document.file_name,
    folder_name: document.folder_name,
    project_name: document.project_name,
    updated_at: document.updated_at,
  }
}

function replaceOrPrepend(
  items: ReaderDocumentSnapshot[],
  snapshot: ReaderDocumentSnapshot,
  maxItems?: number
) {
  const nextItems = [snapshot, ...items.filter((item) => item.id !== snapshot.id)]
  return typeof maxItems === "number" ? nextItems.slice(0, maxItems) : nextItems
}

export function useReaderState() {
  return useSyncExternalStore(subscribe, readState, () => emptyState)
}

export function recordLastRead(document: {
  id: string
  title: string
  file_name: string
  folder_name: string | null
  project_name: string | null
  updated_at: string
}) {
  const state = readState()
  const snapshot = snapshotFromDocument(document)

  writeState({
    lastReadId: snapshot.id,
    recent: replaceOrPrepend(state.recent, snapshot, MAX_RECENT_ITEMS),
    pinned: state.pinned.map((item) => (item.id === snapshot.id ? snapshot : item)),
  })
}

export function togglePinnedDocument(document: {
  id: string
  title: string
  file_name: string
  folder_name: string | null
  project_name: string | null
  updated_at: string
}) {
  const state = readState()
  const snapshot = snapshotFromDocument(document)
  const exists = state.pinned.some((item) => item.id === snapshot.id)

  writeState({
    ...state,
    pinned: exists
      ? state.pinned.filter((item) => item.id !== snapshot.id)
      : replaceOrPrepend(state.pinned, snapshot, MAX_PINNED_ITEMS),
  })
}

export function isPinnedDocument(id: string) {
  return readState().pinned.some((item) => item.id === id)
}

export function clearLastReadIfMatches(id: string) {
  const state = readState()
  if (state.lastReadId !== id) {
    return
  }

  writeState({
    lastReadId: null,
    recent: state.recent.filter((item) => item.id !== id),
    pinned: state.pinned,
  })
}
