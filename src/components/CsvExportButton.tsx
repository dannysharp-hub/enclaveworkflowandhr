import { useState } from "react";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

const inputClass = "h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring";

interface Props {
  onExport: (from: string | null, to: string | null) => void;
  label?: string;
}

export default function CsvExportButton({ onExport, label = "Export CSV" }: Props) {
  const [showRange, setShowRange] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const handleExport = () => {
    onExport(from || null, to || null);
    setShowRange(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowRange(!showRange)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      >
        <Download size={14} /> {label}
      </button>

      {showRange && (
        <div className="absolute right-0 top-full mt-1 z-50 glass-panel rounded-lg p-3 shadow-lg space-y-2 min-w-[240px]">
          <p className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-wider">Date Range (optional)</p>
          <div className="flex gap-2">
            <input type="date" className={cn(inputClass, "flex-1")} value={from} onChange={e => setFrom(e.target.value)} placeholder="From" />
            <input type="date" className={cn(inputClass, "flex-1")} value={to} onChange={e => setTo(e.target.value)} placeholder="To" />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Download size={12} /> Download
            </button>
            <button
              onClick={() => { setFrom(""); setTo(""); setShowRange(false); }}
              className="px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
