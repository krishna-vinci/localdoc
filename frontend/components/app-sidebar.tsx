"use client"

import { FileText, FolderOpen, Home, Search } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const navItems = [
  { href: "/", icon: Home, label: "Dashboard" },
  { href: "/folders", icon: FolderOpen, label: "Folders" },
  { href: "/documents", icon: FileText, label: "Documents" },
  { href: "/search", icon: Search, label: "Search" },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-56 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
        <FileText className="size-5 text-sidebar-primary" />
        <span className="font-semibold text-sidebar-foreground">LocalDocs Hub</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 p-2 pt-3">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
