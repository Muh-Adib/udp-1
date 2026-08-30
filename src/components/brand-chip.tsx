import { Badge } from "@/components/ui/badge";
import { BRAND_LABEL } from "@/lib/crm-types";
import { cn } from "@/lib/utils";

/** Warna identitas tiap brand — selaras dengan warna utama kop surat (DEFAULT_BRAND_PROFILES). */
const BRAND_COLORS: Record<string, string> = {
  unimasi: "#059669",
  segia: "#0D9488",
  erfo: "#D97706",
  unicam: "#7C3AED",
};

/**
 * Chip brand dengan titik warna identitas — dipakai di kartu lead (inbox & pipeline)
 * agar brand asal lead selalu terlihat jelas (tidak kosong/anonim).
 */
export function BrandChip({ brand, className }: { brand: string; className?: string }) {
  const color = BRAND_COLORS[brand] ?? "#64748B";
  return (
    <Badge variant="outline" className={cn("gap-1.5 border-slate-200 bg-slate-50 text-slate-600", className)}>
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {BRAND_LABEL[brand] ?? brand}
    </Badge>
  );
}
