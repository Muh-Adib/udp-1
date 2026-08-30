"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent shadow-sm transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-muted-foreground/40 cursor-pointer",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn("pointer-events-none block size-4 rounded-full bg-white shadow-lg transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0")}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
