import { cn } from "@/lib/utils";
import { ShieldCheck, ShieldAlert, AlertTriangle, XCircle } from "lucide-react";

interface ReadinessBadgeProps {
  score: number;
  status: "not_ready" | "at_risk" | "ready" | "production_safe";
  compact?: boolean;
  showScore?: boolean;
}

const CONFIG = {
  production_safe: { label: "Safe", icon: ShieldCheck, cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  ready: { label: "Ready", icon: ShieldCheck, cls: "bg-primary/15 text-primary border-primary/30" },
  at_risk: { label: "At Risk", icon: AlertTriangle, cls: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  not_ready: { label: "Not Ready", icon: XCircle, cls: "bg-destructive/15 text-destructive border-destructive/30" },
};

export default function ReadinessBadge({ score, status, compact, showScore = true }: ReadinessBadgeProps) {
  const c = CONFIG[status];
  const Icon = c.icon;

  if (compact) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-full border", c.cls)}>
        <Icon size={10} />
        {showScore ? `${score}` : c.label}
      </span>
    );
  }

  return (
    <div className={cn("inline-flex items-center gap-1.5 text-xs font-mono font-medium px-2.5 py-1 rounded-md border", c.cls)}>
      <Icon size={14} />
      <span>{c.label}</span>
      {showScore && <span className="opacity-70">({score}%)</span>}
    </div>
  );
}
