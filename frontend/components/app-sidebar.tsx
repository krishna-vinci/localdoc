"use client"

import { Activity, FileText, FolderOpen, Home, Layers3, Search, Smartphone } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const navItems = [
  { href: "/", icon: Home, label: "Dashboard" },
  { href: "/projects", icon: Layers3, label: "Projects" },
  { href: "/folders", icon: FolderOpen, label: "Folders" },
  { href: "/documents", icon: FileText, label: "Documents" },
  { href: "/search", icon: Search, label: "Search" },
  { href: "/devices", icon: Smartphone, label: "Devices" },
  { href: "/operations", icon: Activity, label: "Operations" },
]

interface AppSidebarProps {
  collapsed?: boolean
  mobile?: boolean
  onNavigate?: () => void
}

export function AppSidebar({
  collapsed = false,
  mobile = false,
  onNavigate,
}: AppSidebarProps) {
  const pathname = usePathname()
  const compact = collapsed && !mobile

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200",
        compact ? "w-[4.5rem]" : "w-64",
        mobile && "h-dvh w-full"
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center border-b border-sidebar-border",
          compact ? "justify-center px-2" : "gap-2.5 px-4"
        )}
      >
        <FileText className="size-5 shrink-0 text-sidebar-primary" />
        {!compact && <span className="font-semibold text-sidebar-foreground">LocalDocs Hub</span>}
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-2 pt-3">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              title={compact ? label : undefined}
              onClick={onNavigate}
              className={cn(
                "flex items-center rounded-lg text-sm font-medium transition-colors",
                compact ? "justify-center px-2 py-2.5" : "gap-2.5 px-3 py-2",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!compact && <span>{label}</span>}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
