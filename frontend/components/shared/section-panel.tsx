import { cn } from "@/lib/utils"

export function SectionPanel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn(
        "rounded-[1.75rem] border border-border/70 bg-card/85 shadow-[0_1px_0_rgba(15,23,42,0.02)] backdrop-blur",
        className
      )}
      {...props}
    />
  )
}

export function SectionPanelHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-2 px-5 py-5 sm:px-6", className)} {...props} />
}

export function SectionPanelTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-base font-semibold tracking-tight", className)} {...props} />
}

export function SectionPanelDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />
}

export function SectionPanelContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5 sm:px-6 sm:pb-6", className)} {...props} />
}
