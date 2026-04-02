"use client"

import { Activity, AlertTriangle, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { getSystemHealth } from "@/lib/api"
import type { SystemHealth } from "@/types"

export function SystemStatusBadge() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const nextHealth = await getSystemHealth()
        if (!cancelled) {
          setHealth(nextHealth)
        }
      } catch {
        if (!cancelled) {
          setHealth(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    const interval = window.setInterval(() => void load(), 30000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  if (loading) {
    return (
      <Badge variant="outline" className="gap-1.5">
        <Loader2 className="size-3 animate-spin" />
        Checking
      </Badge>
    )
  }

  if (!health) {
    return (
      <Badge variant="destructive" className="gap-1.5">
        <AlertTriangle className="size-3" />
        Unavailable
      </Badge>
    )
  }

  return (
    <Badge variant={health.status === "healthy" ? "secondary" : "destructive"} className="gap-1.5">
      <Activity className="size-3" />
      {health.status === "healthy" ? "Healthy" : "Degraded"}
    </Badge>
  )
}
