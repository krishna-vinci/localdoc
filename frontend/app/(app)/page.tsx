import { FileText, FolderOpen, GitBranch, Layers3, Tag } from "lucide-react"
import Link from "next/link"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getDocuments, getDuplicateDocuments, getOrphanDocuments, getStats } from "@/lib/api"
import type { Stats } from "@/types"

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: React.ElementType
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value.toLocaleString()}</div>
      </CardContent>
    </Card>
  )
}

export default async function DashboardPage() {
  let stats: Stats = {
    document_count: 0,
    folder_count: 0,
    project_count: 0,
    tag_count: 0,
    orphan_document_count: 0,
    duplicate_candidate_count: 0,
    watched_folder_count: 0,
  }
  let recentDocs: Awaited<ReturnType<typeof getDocuments>> = []
  let orphanDocs: Awaited<ReturnType<typeof getOrphanDocuments>> = []
  let duplicateDocs: Awaited<ReturnType<typeof getDuplicateDocuments>> = []
  let loadError: string | null = null

  try {
    ;[stats, recentDocs, orphanDocs, duplicateDocs] = await Promise.all([
      getStats(),
      getDocuments(),
      getOrphanDocuments(6),
      getDuplicateDocuments(6),
    ])
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Failed to load dashboard data"
  }

  const recent = recentDocs.slice(0, 8)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Overview of your local markdown library
        </p>
      </div>

      {loadError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Documents" value={stats.document_count} icon={FileText} />
        <StatCard label="Folders" value={stats.folder_count} icon={FolderOpen} />
        <StatCard label="Projects" value={stats.project_count} icon={Layers3} />
        <StatCard label="Tags" value={stats.tag_count} icon={Tag} />
        <StatCard label="Orphans" value={stats.orphan_document_count} icon={GitBranch} />
        <StatCard label="Watching" value={stats.watched_folder_count} icon={FolderOpen} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="space-y-4 xl:col-span-1">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Documents</h2>
            <Link href="/documents" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              View all →
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-10 text-center text-muted-foreground">
              <FileText className="mx-auto mb-3 size-8 opacity-40" />
              <p className="text-sm">No documents yet.</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {recent.map((doc) => (
                <Link key={doc.id} href={`/documents/${doc.id}`}>
                  <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                    <CardContent className="flex items-center justify-between py-3 px-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{doc.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {doc.project_name ?? "No project"} · {doc.folder_name ?? doc.file_name}
                        </p>
                      </div>
                      <time className="text-xs text-muted-foreground shrink-0 ml-4">
                        {new Date(doc.updated_at).toLocaleDateString()}
                      </time>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4 xl:col-span-1">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Orphan Documents</h2>
            <Link href="/documents?orphaned=true" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Review →
            </Link>
          </div>
          {orphanDocs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-10 text-center text-muted-foreground text-sm">
              All indexed documents belong to a project.
            </div>
          ) : (
            <div className="grid gap-2">
              {orphanDocs.map((doc) => (
                <Link key={doc.id} href={`/documents/${doc.id}`}>
                  <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                    <CardContent className="py-3 px-4">
                      <p className="text-sm font-medium truncate">{doc.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{doc.folder_name ?? doc.file_name}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4 xl:col-span-1">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Duplicate Candidates</h2>
            <Link href="/documents" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Inspect →
            </Link>
          </div>
          {duplicateDocs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-10 text-center text-muted-foreground text-sm">
              No duplicate candidates detected.
            </div>
          ) : (
            <div className="grid gap-2">
              {duplicateDocs.map((doc) => (
                <Link key={doc.id} href={`/documents/${doc.id}`}>
                  <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                    <CardContent className="py-3 px-4">
                      <p className="text-sm font-medium truncate">{doc.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {doc.project_name ?? "No project"} · {doc.folder_name ?? doc.file_name}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
