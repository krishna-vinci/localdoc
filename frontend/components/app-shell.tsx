"use client"

import { Menu, PanelLeftClose, Search } from "lucide-react"
import { usePathname } from "next/navigation"
import { useState, useSyncExternalStore } from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { CommandPalette } from "@/components/search/command-palette"
import { PageContainer } from "@/components/shared/page-container"
import { SearchInput } from "@/components/shared/search-input"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const SIDEBAR_STORAGE_KEY = "localdocs.sidebar.collapsed"

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {}
  }

  const handleChange = () => onStoreChange()
  window.addEventListener("storage", handleChange)
  window.addEventListener("localdocs-sidebar-change", handleChange)

  return () => {
    window.removeEventListener("storage", handleChange)
    window.removeEventListener("localdocs-sidebar-change", handleChange)
  }
}

function getSnapshot() {
  if (typeof window === "undefined") return false
  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true"
}

function getWorkspaceLabel(pathname: string) {
  if (pathname.startsWith("/documents/")) return "Reader"
  if (pathname === "/documents") return "Library"
  if (pathname === "/search") return "Search"
  return "Markdown library"
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const desktopCollapsed = useSyncExternalStore(subscribe, getSnapshot, () => false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)

  const isDocumentRoute = /^\/documents\/[^/]+$/.test(pathname)

  function toggleDesktopSidebar() {
    const nextValue = !desktopCollapsed
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(nextValue))
    window.dispatchEvent(new Event("localdocs-sidebar-change"))
  }

  return (
    <div className="flex min-h-screen bg-transparent">
      <div className="hidden md:flex">
        <AppSidebar
          collapsed={desktopCollapsed}
          onToggle={toggleDesktopSidebar}
          onOpenSearch={() => setCommandOpen(true)}
        />
      </div>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="left-0 top-0 h-dvh w-[20rem] max-w-[88vw] translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0 p-0">
          <AppSidebar
            mobile
            onNavigate={() => setMobileOpen(false)}
            onToggle={() => setMobileOpen(false)}
            onOpenSearch={() => {
              setMobileOpen(false)
              setCommandOpen(true)
            }}
          />
        </DialogContent>
      </Dialog>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border/70 bg-background/82 backdrop-blur-xl">
          <div className={cn("mx-auto flex h-14 w-full items-center justify-between gap-4 px-4 sm:h-16 sm:px-6", isDocumentRoute ? "max-w-none" : "max-w-7xl")}>
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
                <Menu className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="hidden md:inline-flex"
                onClick={toggleDesktopSidebar}
                aria-label={desktopCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <PanelLeftClose className="size-4" />
              </Button>

              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{getWorkspaceLabel(pathname)}</p>
                {!isDocumentRoute ? <p className="hidden text-xs text-muted-foreground sm:block">Open a note and stay focused on the text.</p> : null}
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <button type="button" onClick={() => setCommandOpen(true)} className="hidden w-[20rem] max-w-[32vw] text-left lg:block" aria-label="Open search">
                <SearchInput readOnly value="" placeholder="Search your library" shortcut="⌘K" inputClassName="cursor-pointer bg-card" />
              </button>
              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setCommandOpen(true)} aria-label="Open search">
                <Search className="size-4" />
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className={cn("flex-1", isDocumentRoute ? "overflow-hidden" : "px-4 py-6 sm:px-6 sm:py-8")}>
          {isDocumentRoute ? children : <PageContainer>{children}</PageContainer>}
        </main>
      </div>
    </div>
  )
}
