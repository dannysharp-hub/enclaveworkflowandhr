import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const PIPELINE_STAGES = [
  { label: "Enquiry", keys: ["lead_captured"] },
  { label: "Ballpark", keys: ["ballpark_sent"] },
  { label: "Survey", keys: ["appointment_booked"] },
  { label: "Final Quote", keys: ["quote_sent", "quote_viewed"] },
  { label: "Deposit", keys: ["awaiting_deposit"] },
  { label: "Production", keys: ["project_confirmed", "in_production"] },
  { label: "Install", keys: ["install_booked", "install_completed"] },
  { label: "Complete", keys: ["job.practical_completed", "closed"] },
] as const;

function resolveStepIndex(stageKey: string | null | undefined): number {
  if (!stageKey) return 0;
  const idx = PIPELINE_STAGES.findIndex(s => (s.keys as readonly string[]).includes(stageKey));
  return idx === -1 ? 0 : idx;
}

interface StagePipelineProps {
  currentStageKey: string | null | undefined;
}

export default function StagePipeline({ currentStageKey }: StagePipelineProps) {
  const currentIdx = resolveStepIndex(currentStageKey);
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold">
          {currentIdx + 1}
        </div>
        <span className="text-sm font-semibold text-foreground">{PIPELINE_STAGES[currentIdx].label}</span>
        <span className="text-xs text-muted-foreground ml-1">Step {currentIdx + 1} of {PIPELINE_STAGES.length}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0 rounded-lg border border-border bg-card px-4 py-3 overflow-x-auto">
      {PIPELINE_STAGES.map((stage, i) => {
        const isCompleted = i < currentIdx;
        const isCurrent = i === currentIdx;
        const isUpcoming = i > currentIdx;

        return (
          <div key={stage.label} className="flex items-center">
            {i > 0 && (
              <div className={cn(
                "w-6 h-px mx-1 flex-shrink-0",
                isCompleted || isCurrent ? "bg-primary" : "bg-border"
              )} />
            )}
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0",
                isCompleted && "bg-foreground text-background",
                isCurrent && "bg-primary text-primary-foreground scale-105",
                isUpcoming && "bg-muted text-muted-foreground"
              )}
            >
              {isCompleted && <Check size={12} strokeWidth={3} />}
              {stage.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
