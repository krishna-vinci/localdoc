import { cn } from "@/lib/utils"

const toneClasses = {
  neutral: "bg-zinc-400 dark:bg-zinc-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-sky-500",
} as const

export function StatusDot({
  tone = "neutral",
  label,
  className,
}: {
  tone?: keyof typeof toneClasses
  label?: string
  className?: string
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs text-muted-foreground", className)}>
      <span className={cn("size-2 rounded-full", toneClasses[tone])} aria-hidden="true" />
      {label ? <span>{label}</span> : null}
    </span>
  )
}
