import { ArrowUpRight, FileText, Lock, Pin } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { formatDate, formatRelativeTime } from "@/lib/format"
import { getDocumentLocation, getDocumentTags, getSourceLabel, isSearchResult, type SearchableDocument } from "@/lib/document-utils"
import { sanitizeHighlightedSnippet } from "@/lib/search-snippet"
import { cn } from "@/lib/utils"

export function DocumentListItem({ item, className }: { item: SearchableDocument; className?: string }) {
  const tags = getDocumentTags(item)
  const snippet = sanitizeHighlightedSnippet(isSearchResult(item) ? item.snippet : null)

  return (
    <Link
      href={`/documents/${item.id}`}
      className={cn(
        "group block rounded-[1.5rem] border border-border/70 bg-background/80 p-4 transition-all hover:-translate-y-px hover:border-primary/20 hover:bg-card hover:shadow-[0_16px_40px_-28px_rgba(15,23,42,0.35)]",
        className
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <FileText className="size-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-semibold tracking-tight">{item.title}</h3>
                {item.is_read_only ? (
                  <Badge variant="outline" className="gap-1">
                    <Lock className="size-3" />
                    Read-only
                  </Badge>
                ) : null}
                <Badge variant="secondary">{getSourceLabel(item.source_type)}</Badge>
                {item.status ? <Badge variant="outline">{item.status}</Badge> : null}
              </div>
              <p className="truncate text-sm text-muted-foreground">{getDocumentLocation(item)}</p>
              {snippet ? (
                <p
                  className="line-clamp-2 text-sm text-muted-foreground [&_mark]:rounded-sm [&_mark]:bg-primary/15 [&_mark]:px-0.5 [&_mark]:text-foreground"
                  dangerouslySetInnerHTML={{ __html: snippet }}
                />
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
            {item.source_path ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-1">
                <Pin className="size-3" />
                <span className="max-w-[32rem] truncate">{item.source_path}</span>
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4 pl-[3.25rem] text-xs text-muted-foreground lg:pl-0">
          <div className="text-right">
            <p>{formatRelativeTime(item.updated_at)}</p>
            <p>{formatDate(item.updated_at)}</p>
          </div>
          <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  )
}
