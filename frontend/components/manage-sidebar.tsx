"use client"

import {
  Activity,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  Layers3,
  Smartphone,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { StatusDot } from "@/components/shared/status-dot"
import { Button } from "@/components/ui/button"
import { confirmUnsafeNavigation } from "@/lib/navigation-guard"
import { cn } from "@/lib/utils"

const manageItems = [
  { href: "/manage/folders", icon: FolderOpen, label: "Folders", description: "Sources and watch rules" },
  { href: "/manage/projects", icon: Layers3, label: "Projects", description: "Templates and metadata defaults" },
  { href: "/manage/devices", icon: Smartphone, label: "Devices", description: "Agents and mirrored shares" },
  { href: "/manage/operations", icon: Activity, label: "Operations", description: "Health, jobs, and backups" },
] as const

export function ManageSidebar({
  collapsed = false,
  mobile = false,
  onNavigate,
  onToggle,
}: {
  collapsed?: boolean
  mobile?: boolean
  onNavigate?: () => void
  onToggle?: () => void
}) {
  const pathname = usePathname()
  const compact = collapsed && !mobile

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 shrink-0 flex-col border-r border-sidebar-border/80 bg-sidebar/95 backdrop-blur transition-[width] duration-200",
        compact ? "w-[5.5rem]" : "w-[18.5rem]",
        mobile && "h-dvh w-full"
      )}
    >
      <div className={cn("flex h-16 items-center border-b border-sidebar-border/70", compact ? "justify-center px-3" : "px-4")}>
        {compact ? (
          <div className="flex flex-col items-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
              <FileText className="size-4" />
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Expand sidebar">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        ) : (
          <div className="flex w-full items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">Manage library</p>
              <p className="text-xs text-sidebar-foreground/65">Sources, syncing, and maintenance</p>
            </div>
            {!mobile ? (
              <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Collapse sidebar">
                <ChevronLeft className="size-4" />
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <div className={cn("border-b border-sidebar-border/70 px-3 py-4", compact && "px-2")}>
        {!compact ? <StatusDot tone="warning" label="Management surface" /> : <div className="flex justify-center"><span className="size-2 rounded-full bg-amber-500" /></div>}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="flex flex-col gap-1">
        {manageItems.map(({ href, icon: Icon, label, description }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)

          return (
            <Link
              key={href}
              href={href}
              onClick={(event) => {
                if (!confirmUnsafeNavigation()) {
                  event.preventDefault()
                  return
                }
                onNavigate?.()
              }}
              title={compact ? label : undefined}
              className={cn(
                "group flex items-center rounded-2xl transition-all",
                compact ? "justify-center px-2 py-3" : "gap-3 px-3 py-3",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[0_1px_0_rgba(15,23,42,0.03)]"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/75 hover:text-sidebar-accent-foreground"
              )}
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-xl border transition-colors",
                  active
                    ? "border-sidebar-border/80 bg-background/70 text-sidebar-primary"
                    : "border-transparent bg-transparent text-sidebar-foreground/75 group-hover:border-sidebar-border/60 group-hover:bg-background/50"
                )}
              >
                <Icon className="size-4" />
              </span>
              {!compact ? (
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{label}</span>
                  <span className="block truncate text-xs text-sidebar-foreground/55">{description}</span>
                </span>
              ) : null}
            </Link>
          )
        })}
        </div>
      </nav>

      <div className={cn("border-t border-sidebar-border/70 p-3", compact && "p-2")}>
        <Link
          href="/"
          onClick={(event) => {
            if (!confirmUnsafeNavigation()) {
              event.preventDefault()
              return
            }
            onNavigate?.()
          }}
          className={cn(
            "group flex items-center rounded-2xl border border-sidebar-border/70 bg-background/45 text-sidebar-foreground/80 transition-colors hover:bg-background/70",
            compact ? "justify-center px-2 py-3" : "gap-3 px-3 py-3"
          )}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted/80 text-muted-foreground">
            <FileText className="size-4" />
          </span>
          {!compact ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">Back to reader</span>
              <span className="block truncate text-xs text-sidebar-foreground/55">Return to your markdown library</span>
            </span>
          ) : null}
        </Link>
      </div>
    </aside>
  )
}
