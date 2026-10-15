import { Dialog as Primitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";
export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
export function DialogContent({
  className,
  children,
  ...props
}: Omit<Primitive.Popup.Props, "className"> & { className?: string }) {
  return (
    <Primitive.Portal>
      <Primitive.Backdrop className="fixed inset-0 z-50 bg-black/35" />
      <Primitive.Popup
        className={cn(
          "fixed top-1/2 left-1/2 z-50 max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 space-y-4 overflow-y-auto rounded-2xl bg-white p-5 text-foreground shadow-xl outline-none",
          className,
        )}
        {...props}
      >
        {children}
        <Primitive.Close
          render={<Button type="button" variant="ghost" size="icon" />}
          aria-label="Fechar diálogo"
          className="absolute top-3 right-3 size-9 rounded-xl"
        >
          <X className="size-4" />
        </Primitive.Close>
      </Primitive.Popup>
    </Primitive.Portal>
  );
}
