import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export function StatChip({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string
  value: string | number
  icon?: LucideIcon
  className?: string
}) {
  return (
    <div className={cn("rounded-2xl border border-border/70 bg-muted/35 px-4 py-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
        {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}
