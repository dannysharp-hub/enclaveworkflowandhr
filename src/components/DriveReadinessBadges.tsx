import { cn } from "@/lib/utils";
import { FileCode, Paintbrush, Package } from "lucide-react";

interface Props {
  hasDxf?: boolean;
  hasJobpack?: boolean;
  hasBomImported?: boolean;
  className?: string;
}

export default function DriveReadinessBadges({ hasDxf, hasJobpack, hasBomImported, className }: Props) {
  const badges = [
    hasDxf && { label: "DXF Ready", icon: FileCode, color: "bg-primary/10 text-primary" },
    hasJobpack && { label: "Job Pack", icon: Package, color: "bg-chart-2/10 text-chart-2" },
    hasBomImported && { label: "BOM", icon: Paintbrush, color: "bg-chart-4/10 text-chart-4" },
  ].filter(Boolean) as { label: string; icon: any; color: string }[];

  if (badges.length === 0) return null;

  return (
    <div className={cn("flex items-center gap-1 flex-wrap", className)}>
      {badges.map(b => (
        <span
          key={b.label}
          className={cn("inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-full", b.color)}
        >
          <b.icon size={10} />
          {b.label}
        </span>
      ))}
    </div>
  );
}
