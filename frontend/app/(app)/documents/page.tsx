import { DocumentBrowser } from "@/components/documents/document-browser"
import { getDocuments, getFolders, getProjects, searchDocuments } from "@/lib/api"
import type { DocumentFilters } from "@/types"

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function getString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

export default async function DocumentsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams
  const query = getString(resolvedSearchParams.q)
  const filters: DocumentFilters = {
    project_id: getString(resolvedSearchParams.project_id) || undefined,
    folder_id: getString(resolvedSearchParams.folder_id) || undefined,
    tag: getString(resolvedSearchParams.tag) || undefined,
    status: getString(resolvedSearchParams.status) || undefined,
    orphaned: getString(resolvedSearchParams.orphaned) === "true" ? true : undefined,
  }

  const [projects, folders, documents, searchResults] = await Promise.all([
    getProjects(),
    getFolders(),
    getDocuments(filters),
    query ? searchDocuments(query, filters, 24) : Promise.resolve([]),
  ])

  return (
    <DocumentBrowser
      initialDocuments={documents}
      initialSearchResults={searchResults}
      initialProjects={projects}
      initialFolders={folders}
      initialFilters={filters}
      initialQuery={query}
      mode="documents"
    />
  )
}
