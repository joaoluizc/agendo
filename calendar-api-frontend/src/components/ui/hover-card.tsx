import * as React from "react"
import * as HoverCardPrimitive from "@radix-ui/react-hover-card"

import { cn } from "@/lib/utils"

const HoverCard = HoverCardPrimitive.Root

const HoverCardTrigger = HoverCardPrimitive.Trigger

const HoverCardContent = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content> & {
    /**
     * Portal target. Defaults to `document.body`. Portalled at all because a card drawn in
     * place inherits its trigger's stacking and clipping — inside the schedule's sticky
     * agent column (z-3, in an `overflow-clip` card) it would be cut off. Inside a modal
     * dialog pass that dialog's content element (see `useDialogContentElement`), as with
     * `PopoverContent`.
     */
    container?: HTMLElement | null;
  }
>(({ className, align = "center", sideOffset = 4, container, ...props }, ref) => (
  <HoverCardPrimitive.Portal container={container ?? undefined}>
    <HoverCardPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        // `pointer-events-auto` for the same reason as PopoverContent: a modal dialog sets
        // `pointer-events: none` on body, and a portalled card would otherwise be inert.
        "pointer-events-auto z-50 w-64 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </HoverCardPrimitive.Portal>
))
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName

export { HoverCard, HoverCardTrigger, HoverCardContent }
