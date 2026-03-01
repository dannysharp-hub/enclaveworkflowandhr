import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  variant?: "default" | "primary" | "accent" | "warning";
}

const variantStyles = {
  default: "border-border",
  primary: "border-primary/30 glow-primary",
  accent: "border-accent/30 glow-accent",
  warning: "border-warning/30",
};

const iconStyles = {
  default: "bg-secondary text-secondary-foreground",
  primary: "bg-primary/15 text-primary",
  accent: "bg-accent/15 text-accent",
  warning: "bg-warning/15 text-warning",
};

export default function StatCard({ title, value, subtitle, icon, variant = "default" }: StatCardProps) {
  return (
    <div className={cn("glass-panel rounded-lg p-4 transition-all hover:border-primary/20", variantStyles[variant])}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="mt-1 text-2xl font-mono font-bold text-foreground">{value}</p>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className={cn("h-10 w-10 rounded-md flex items-center justify-center shrink-0", iconStyles[variant])}>
          {icon}
        </div>
      </div>
    </div>
  );
}
