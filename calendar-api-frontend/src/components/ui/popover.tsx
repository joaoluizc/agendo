import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverAnchor = PopoverPrimitive.Anchor

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    /**
     * Portal target. Defaults to `document.body`, which is wrong inside a modal dialog —
     * pass that dialog's content element (see `useDialogContentElement`) so the popover
     * lands inside its scroll allowlist and focus scope.
     */
    container?: HTMLElement | null;
  }
>(({ className, align = "center", sideOffset = 4, container, ...props }, ref) => (
  <PopoverPrimitive.Portal container={container ?? undefined}>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        // `pointer-events-auto` is load-bearing inside a modal Dialog. Radix sets
        // `pointer-events: none` on document.body while a modal dialog is open and
        // re-enables it on DialogContent alone; this content is portalled to body as a
        // *sibling* of DialogContent, so without this it renders and positions correctly
        // but is completely inert — no typing, no scrolling, no clicks. Outside a dialog
        // it is simply the default, so this is a no-op there. Preferred over marking the
        // popover itself modal, which has two nested layers fighting over the same body
        // style and can leave the dialog inert once the popover closes.
        "pointer-events-auto z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
