import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { cn } from "@/lib/utils"

function DropdownMenu(props: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root {...props} />
}

function DropdownMenuTrigger(props: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({
  className, align = "start", sideOffset = 8, ...props
}: Omit<MenuPrimitive.Popup.Props, "className"> & {
  className?: string
  align?: MenuPrimitive.Positioner.Props["align"]
  sideOffset?: number
}) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner align={align} sideOffset={sideOffset} className="z-50 outline-none">
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn("max-h-[var(--available-height)] w-72 max-w-[calc(100vw_-_2rem)] overflow-y-auto rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-lg outline-none", className)}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function DropdownMenuItem({
  className, variant = "default", ...props
}: Omit<MenuPrimitive.Item.Props, "className"> & {
  className?: string
  variant?: "default" | "destructive"
}) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
        variant === "destructive"
          ? "text-destructive data-highlighted:bg-destructive/10"
          : "text-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({ className, ...props }: Omit<MenuPrimitive.Separator.Props, "className"> & { className?: string }) {
  return <MenuPrimitive.Separator data-slot="dropdown-menu-separator" className={cn("my-2 h-px bg-border", className)} {...props} />
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator }
