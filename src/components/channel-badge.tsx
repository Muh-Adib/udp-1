"use client";

import { Badge } from "@/components/ui/badge";
import { ChannelBadgeClassMap, ChannelIcon, CHANNEL_LABEL } from "@/lib/channel-meta";
import { cn } from "@/lib/utils";

export function ChannelBadge({ channel, className }: { channel: string; className?: string }) {
  const known = channel in ChannelBadgeClassMap;
  const label = known ? CHANNEL_LABEL[channel as keyof typeof CHANNEL_LABEL] : "Manual";
  const cls = known ? ChannelBadgeClassMap[channel as keyof typeof ChannelBadgeClassMap] : "bg-slate-100 text-slate-700 border-slate-200";
  const Icon = known ? ChannelIcon[channel as keyof typeof ChannelIcon] : null;
  return (
    <Badge variant="outline" className={cn("gap-1", cls, className)}>
      {Icon ? <Icon className="size-3" /> : null}
      {label}
    </Badge>
  );
}
