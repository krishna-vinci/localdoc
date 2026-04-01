"use client"

import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { useState, useSyncExternalStore } from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"

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

export function AppShell({ children }: { children: React.ReactNode }) {
  const desktopCollapsed = useSyncExternalStore(subscribe, getSnapshot, () => false)
  const [mobileOpen, setMobileOpen] = useState(false)

  function toggleDesktopSidebar() {
    const nextValue = !desktopCollapsed
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(nextValue))
    window.dispatchEvent(new Event("localdocs-sidebar-change"))
  }

  return (
    <div className="flex min-h-screen bg-background">
      <div className="hidden md:flex">
        <AppSidebar collapsed={desktopCollapsed} />
      </div>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="left-0 top-0 h-dvh w-[18rem] max-w-[85vw] translate-x-0 translate-y-0 rounded-none border-b-0 border-l-0 border-r border-t-0 p-0">
          <AppSidebar mobile onNavigate={() => setMobileOpen(false)} />
        </DialogContent>
      </Dialog>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:inline-flex"
              onClick={toggleDesktopSidebar}
              aria-label={desktopCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {desktopCollapsed ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </Button>
            <span className="text-sm font-medium md:hidden">LocalDocs Hub</span>
          </div>
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
