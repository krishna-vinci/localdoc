import { Search } from "lucide-react"

import { cn } from "@/lib/utils"

export function SearchInput({
  className,
  inputClassName,
  shortcut,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  inputClassName?: string
  shortcut?: string
}) {
  return (
    <label className={cn("relative flex items-center", className)}>
      <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
      <input
        className={cn(
          "h-11 w-full rounded-2xl border border-input bg-background/80 pl-10 pr-24 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          inputClassName
        )}
        {...props}
      />
      {shortcut ? (
        <span className="pointer-events-none absolute right-3 hidden rounded-md border border-border/70 bg-muted/70 px-2 py-1 text-[11px] font-medium text-muted-foreground sm:inline-flex">
          {shortcut}
        </span>
      ) : null}
    </label>
  )
}
