"use client"

import { useQuery } from "@tanstack/react-query"

import { StatusDot } from "@/components/shared/status-dot"
import { getSystemHealth } from "@/lib/api"

export function SystemStatusBadge() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["system-health-badge"],
    queryFn: getSystemHealth,
    refetchInterval: 30_000,
  })

  if (isLoading) {
    return <StatusDot tone="neutral" label="Checking" />
  }

  if (isError || !data) {
    return <StatusDot tone="danger" label="Backend unavailable" />
  }

  return (
    <StatusDot
      tone={data.status === "healthy" ? "success" : "warning"}
      label={data.status === "healthy" ? "System healthy" : "Needs attention"}
    />
  )
}
