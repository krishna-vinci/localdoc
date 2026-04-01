"use client"

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

function TooltipProvider(props: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider {...props} />
}

function Tooltip(props: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root {...props} />
}

function TooltipTrigger(props: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger {...props} />
}

function TooltipContent({ className, ...props }: TooltipPrimitive.Positioner.Props & { className?: string }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner sideOffset={6} {...props}>
        <TooltipPrimitive.Popup
          className={cn(
            "z-50 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground shadow",
            "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
            "transition-opacity duration-150",
            className
          )}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent }
