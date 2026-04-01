import { cn } from "@/lib/utils"

function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "secondary" | "destructive" | "outline"
}) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
        {
          "bg-primary text-primary-foreground": variant === "default",
          "bg-secondary text-secondary-foreground": variant === "secondary",
          "bg-destructive/10 text-destructive": variant === "destructive",
          "border border-border bg-transparent text-foreground": variant === "outline",
        },
        className
      )}
      {...props}
    />
  )
}

export { Badge }
