import { cn } from "@/lib/utils";
import { JobStatus } from "@/types";

const statusConfig: Record<JobStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  validated: { label: "Validated", className: "bg-info/15 text-info" },
  exported: { label: "Exported", className: "bg-accent/15 text-accent" },
  cutting: { label: "Cutting", className: "bg-primary/15 text-primary" },
  complete: { label: "Complete", className: "bg-success/15 text-success" },
};

export default function JobStatusBadge({ status }: { status: JobStatus }) {
  const config = statusConfig[status] ?? { label: status ?? "Unknown", className: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-mono font-medium", config.className)}>
      {config.label}
    </span>
  );
}
