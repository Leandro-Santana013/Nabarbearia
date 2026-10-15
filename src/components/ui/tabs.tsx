import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cn } from "@/lib/utils"

function Tabs({ className, ...props }: Omit<TabsPrimitive.Root.Props, "className"> & { className?: string }) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("space-y-6", className)} {...props} />
}
function TabsList({ className, ...props }: Omit<TabsPrimitive.List.Props, "className"> & { className?: string }) {
  return <TabsPrimitive.List data-slot="tabs-list" className={cn("grid grid-cols-2 gap-1 rounded-full bg-muted p-1", className)} {...props} />
}
function TabsTrigger({ className, ...props }: Omit<TabsPrimitive.Tab.Props, "className"> & { className?: string }) {
  return <TabsPrimitive.Tab data-slot="tabs-trigger" className={cn("flex min-h-11 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-full px-3 py-2 text-sm! font-medium! text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary data-active:bg-white data-active:text-primary data-active:shadow-sm data-disabled:pointer-events-none data-disabled:opacity-50", className)} {...props} />
}
function TabsContent({ className, ...props }: Omit<TabsPrimitive.Panel.Props, "className"> & { className?: string }) {
  return <TabsPrimitive.Panel data-slot="tabs-content" className={cn("space-y-4 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary", className)} {...props} />
}
export { Tabs, TabsList, TabsTrigger, TabsContent }
