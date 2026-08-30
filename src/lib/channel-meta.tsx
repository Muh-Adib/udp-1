import { InstagramIcon, GlobeIcon, MailIcon, MessageCircleIcon } from "lucide-react";
import type { ChannelType } from "@/lib/crm-types";
import { CHANNEL_LABEL } from "@/lib/crm-types";

export { CHANNEL_LABEL };

export const ChannelIcon = {
  whatsapp: MessageCircleIcon,
  email: MailIcon,
  instagram: InstagramIcon,
  web: GlobeIcon,
} as const;

export const ChannelBadgeClassMap: Record<ChannelType, string> = {
  whatsapp: "bg-emerald-100 text-emerald-800 border-emerald-200",
  email: "bg-amber-100 text-amber-800 border-amber-200",
  instagram: "bg-rose-100 text-rose-800 border-rose-200",
  web: "bg-stone-200 text-stone-800 border-stone-300",
};
