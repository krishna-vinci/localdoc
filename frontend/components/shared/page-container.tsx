import { cn } from "@/lib/utils"

export function PageContainer({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-auto flex w-full max-w-7xl flex-col gap-8", className)} {...props} />
}
