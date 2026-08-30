"use client";

import { Toaster as Sonner, toast } from "sonner";

function Toaster() {
  return (
    <Sonner
      position="top-center"
      toastOptions={{
        classNames: {
          toast: "rounded-xl border bg-popover text-popover-foreground shadow-lg text-sm",
          description: "text-muted-foreground",
        },
      }}
    />
  );
}

export { Toaster, toast };
