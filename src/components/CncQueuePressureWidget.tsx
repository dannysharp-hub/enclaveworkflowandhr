import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { calculateCncQueuePressure, type QueuePressureResult } from "@/lib/cncQueuePressure";
import { Gauge, Clock, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface Props {
  compact?: boolean;
}

export default function CncQueuePressureWidget({ compact = false }: Props) {
  const { tenantId } = useAuth();
  const [pressure, setPressure] = useState<QueuePressureResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    calculateCncQueuePressure(tenantId).then(r => {
      setPressure(r);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [tenantId]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 animate-pulse h-24" />
    );
  }

  if (!pressure) return null;

  const pct = pressure.dailyCapacityHours > 0
    ? Math.min(100, (pressure.queuedHours / (pressure.dailyCapacityHours * 3)) * 100)
    : 0;

  const colorClass = pressure.pressureLevel === "high"
    ? "text-destructive"
    : pressure.pressureLevel === "medium"
    ? "text-warning"
    : "text-primary";

  const bgClass = pressure.pressureLevel === "high"
    ? "[&>div]:bg-destructive"
    : pressure.pressureLevel === "medium"
    ? "[&>div]:bg-yellow-500"
    : "";

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs font-mono">
        <Gauge size={14} className={colorClass} />
        <span className={cn("font-bold", colorClass)}>{pressure.queuedHours}h</span>
        <span className="text-muted-foreground">CNC queue</span>
        {pressure.partialStartAllowed ? (
          <CheckCircle2 size={12} className="text-primary" />
        ) : (
          <XCircle size={12} className="text-destructive" />
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono font-bold text-foreground flex items-center gap-2">
          <Gauge size={14} className="text-muted-foreground" />
          CNC QUEUE PRESSURE
        </h3>
        <span className={cn("text-lg font-mono font-bold", colorClass)}>
          {pressure.queuedHours}h
        </span>
      </div>

      <Progress value={pct} className={cn("h-2", bgClass)} />

      <div className="grid grid-cols-3 gap-2 text-[10px] font-mono text-muted-foreground">
        <div className="text-center">
          <div className="text-foreground font-bold">{pressure.sheetCount}</div>
          <div>Sheets queued</div>
        </div>
        <div className="text-center">
          <div className="text-foreground font-bold">{pressure.dailyCapacityHours}h</div>
          <div>Daily capacity</div>
        </div>
        <div className="text-center">
          <div className={cn("font-bold", pressure.partialStartAllowed ? "text-primary" : "text-destructive")}>
            {pressure.partialStartAllowed ? "ALLOWED" : "BLOCKED"}
          </div>
          <div>Partial start</div>
        </div>
      </div>

      {pressure.pressureLevel === "high" && (
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-destructive bg-destructive/10 rounded px-2 py-1">
          <AlertTriangle size={10} />
          Queue exceeds {(pressure.dailyCapacityHours * pressure.partialStartMultiplier).toFixed(0)}h threshold — partial starts disabled
        </div>
      )}
    </div>
  );
}
