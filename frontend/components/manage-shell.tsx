"use client"

import { Menu, Search } from "lucide-react"
import { useState, useSyncExternalStore } from "react"

import { ManageSidebar } from "@/components/manage-sidebar"
import { CommandPalette } from "@/components/search/command-palette"
import { PageContainer } from "@/components/shared/page-container"
import { SearchInput } from "@/components/shared/search-input"
import { SystemStatusBadge } from "@/components/system-status-badge"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"

const SIDEBAR_STORAGE_KEY = "localdocs.manage-sidebar.collapsed"

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {}
  }

  const handleChange = () => onStoreChange()
  window.addEventListener("storage", handleChange)
  window.addEventListener("localdocs-manage-sidebar-change", handleChange)

  return () => {
    window.removeEventListener("storage", handleChange)
    window.removeEventListener("localdocs-manage-sidebar-change", handleChange)
  }
}

function getSnapshot() {
  if (typeof window === "undefined") return false
  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true"
}

export function ManageShell({ children }: { children: React.ReactNode }) {
  const desktopCollapsed = useSyncExternalStore(subscribe, getSnapshot, () => false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)

  function toggleDesktopSidebar() {
    const nextValue = !desktopCollapsed
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(nextValue))
    window.dispatchEvent(new Event("localdocs-manage-sidebar-change"))
  }

  return (
    <div className="flex min-h-screen bg-transparent">
      <div className="hidden md:flex">
        <ManageSidebar
          collapsed={desktopCollapsed}
          onToggle={toggleDesktopSidebar}
          onOpenSearch={() => setCommandOpen(true)}
        />
      </div>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="left-0 top-0 h-dvh w-[20rem] max-w-[88vw] translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0 p-0">
          <ManageSidebar
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
        <header className="sticky top-0 z-30 border-b border-border/70 bg-background/88 backdrop-blur-xl">
          <PageContainer className="gap-0 px-4 sm:px-6">
            <div className="flex h-16 items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open management navigation">
                  <Menu className="size-4" />
                </Button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">Manage</p>
                  <p className="hidden text-xs text-muted-foreground sm:block">Configuration, sources, devices, and maintenance.</p>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <button type="button" onClick={() => setCommandOpen(true)} className="hidden w-[20rem] max-w-[32vw] text-left lg:block" aria-label="Open search">
                  <SearchInput readOnly value="" placeholder="Search your library" shortcut="⌘K" inputClassName="cursor-pointer bg-card" />
                </button>
                <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setCommandOpen(true)} aria-label="Open search">
                  <Search className="size-4" />
                </Button>
                <SystemStatusBadge />
                <ThemeToggle />
              </div>
            </div>
          </PageContainer>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <PageContainer>{children}</PageContainer>
        </main>
      </div>
    </div>
  )
}
