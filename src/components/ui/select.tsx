import { Select as Primitive } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
export const Select = Primitive.Root;
export const SelectValue = Primitive.Value;
export function SelectTrigger({
  className,
  children,
  ...props
}: Omit<Primitive.Trigger.Props, "className"> & { className?: string }) {
  return (
    <Primitive.Trigger
      className={cn(
        "flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-border bg-white px-3 py-2 text-sm! font-normal! outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      <Primitive.Icon>
        <ChevronDown className="size-4 text-muted-foreground" />
      </Primitive.Icon>
    </Primitive.Trigger>
  );
}
export function SelectContent({ children }: { children: React.ReactNode }) {
  return (
    <Primitive.Portal>
      <Primitive.Positioner sideOffset={4} className="z-[60]">
        <Primitive.Popup className="max-h-72 min-w-[var(--anchor-width)] overflow-y-auto rounded-xl border border-border bg-white p-1 text-foreground shadow-lg">
          <Primitive.List>{children}</Primitive.List>
        </Primitive.Popup>
      </Primitive.Positioner>
    </Primitive.Portal>
  );
}
export function SelectItem({ children, ...props }: Primitive.Item.Props) {
  return (
    <Primitive.Item
      className="flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm outline-none data-highlighted:bg-blue-50 data-disabled:opacity-50"
      {...props}
    >
      <Primitive.ItemText>{children}</Primitive.ItemText>
      <Primitive.ItemIndicator>
        <Check className="size-4 text-primary" />
      </Primitive.ItemIndicator>
    </Primitive.Item>
  );
}
