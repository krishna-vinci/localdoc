import DOMPurify from "isomorphic-dompurify"

export function sanitizeHighlightedSnippet(snippet: string | null) {
  if (!snippet) return null

  return DOMPurify.sanitize(snippet, {
    ALLOWED_TAGS: ["mark"],
    ALLOWED_ATTR: [],
  })
}
