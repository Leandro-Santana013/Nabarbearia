import type { ComponentProps } from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function Sheet(props: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root {...props} />
}

function SheetTrigger(props: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetContent({ className, children, side = "right", ...props }: Omit<SheetPrimitive.Popup.Props, "className"> & { className?: string; side?: "right" }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/30 transition-opacity duration-200 ease-(--ease-drawer) data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none" />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn("fixed inset-y-0 right-0 z-50 flex h-dvh w-full flex-col gap-6 overflow-y-auto overscroll-contain bg-white p-6 text-foreground shadow-xl outline-none transition-transform duration-240 ease-(--ease-drawer) data-starting-style:translate-x-full data-ending-style:translate-x-full motion-reduce:transition-none motion-reduce:data-starting-style:translate-x-0 motion-reduce:data-ending-style:translate-x-0 sm:max-w-md sm:rounded-l-2xl", className)}
        {...props}
      >
        {children}
        <SheetPrimitive.Close render={<Button type="button" variant="ghost" size="icon" />} aria-label="Fechar notificações" className="absolute top-4 right-4 size-11 rounded-full transition-colors">
          <X aria-hidden="true" className="size-5" />
        </SheetPrimitive.Close>
      </SheetPrimitive.Popup>
    </SheetPrimitive.Portal>
  )
}

function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="sheet-header" className={cn("space-y-3 pr-10", className)} {...props} />
}

function SheetTitle({ className, ...props }: Omit<SheetPrimitive.Title.Props, "className"> & { className?: string }) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={cn("text-xl font-bold text-[#111111]", className)} {...props} />
}

function SheetDescription({ className, ...props }: Omit<SheetPrimitive.Description.Props, "className"> & { className?: string }) {
  return <SheetPrimitive.Description data-slot="sheet-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
}

export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription }
