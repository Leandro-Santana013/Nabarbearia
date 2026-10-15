import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "@/lib/utils"

function Switch({ className, ...props }: Omit<SwitchPrimitive.Root.Props, "className"> & { className?: string }) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn("relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent bg-input outline-none after:absolute after:-inset-y-2.5 after:inset-x-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 data-checked:bg-primary data-disabled:cursor-not-allowed data-disabled:opacity-50", className)}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-5 rounded-full bg-white shadow-sm translate-x-0 data-checked:translate-x-5" />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
