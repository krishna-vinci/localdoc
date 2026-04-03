import { AlertTriangle, CheckCircle2, Info, TriangleAlert } from "lucide-react"

import { cn } from "@/lib/utils"

const variants = {
  error: {
    icon: AlertTriangle,
    className: "border-destructive/25 bg-destructive/8 text-destructive",
  },
  warning: {
    icon: TriangleAlert,
    className: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-200",
  },
  info: {
    icon: Info,
    className: "border-border bg-muted/60 text-foreground",
  },
  success: {
    icon: CheckCircle2,
    className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  },
} as const

export function AppAlert({
  title,
  children,
  variant = "info",
  className,
}: {
  title?: string
  children: React.ReactNode
  variant?: keyof typeof variants
  className?: string
}) {
  const Icon = variants[variant].icon

  return (
    <div
      className={cn("rounded-2xl border px-4 py-3", variants[variant].className, className)}
      role={variant === "error" ? "alert" : "status"}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 space-y-1">
          {title ? <p className="text-sm font-medium">{title}</p> : null}
          <div className="text-sm text-current/90">{children}</div>
        </div>
      </div>
    </div>
  )
}
