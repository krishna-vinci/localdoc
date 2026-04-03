import type { DocumentListItem, Folder, SearchResult } from "@/types"

export type SearchableDocument = DocumentListItem | SearchResult

export function isSearchResult(item: SearchableDocument): item is SearchResult {
  return "snippet" in item
}

export function getDocumentTags(item: Pick<SearchableDocument, "tags">): string[] {
  return item.tags
    ? item.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : []
}

export function getSourceLabel(sourceType: string) {
  return sourceType === "remote_mirror" ? "Remote mirror" : "Local"
}

export function getDocumentLocation(item: Pick<SearchableDocument, "project_name" | "folder_name" | "file_name">) {
  return [item.project_name ?? "No project", item.folder_name ?? item.file_name].join(" · ")
}

export function getFolderStateLabel(folder: Pick<Folder, "watch_enabled" | "is_active">) {
  if (!folder.is_active) return "Inactive"
  return folder.watch_enabled ? "Watching" : "Manual"
}
