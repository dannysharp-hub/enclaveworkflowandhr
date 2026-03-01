import { mockRemnants } from "@/data/mockData";
import { Search, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  available: "bg-success/15 text-success",
  reserved: "bg-warning/15 text-warning",
  used: "bg-muted text-muted-foreground",
  discarded: "bg-destructive/15 text-destructive",
};

export default function RemnantsPage() {
  const totalArea = mockRemnants
    .filter(r => r.status === "available")
    .reduce((sum, r) => sum + (r.length_mm * r.width_mm) / 1_000_000, 0);

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-mono font-bold text-foreground">Remnants</h2>
          <p className="text-sm text-muted-foreground">Offcut tracking and reuse</p>
        </div>
        <button className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus size={16} />
          Add Remnant
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-panel rounded-lg p-4 text-center">
          <p className="text-2xl font-mono font-bold text-success">{mockRemnants.filter(r => r.status === "available").length}</p>
          <p className="text-xs text-muted-foreground mt-1">Available</p>
        </div>
        <div className="glass-panel rounded-lg p-4 text-center">
          <p className="text-2xl font-mono font-bold text-warning">{mockRemnants.filter(r => r.status === "reserved").length}</p>
          <p className="text-xs text-muted-foreground mt-1">Reserved</p>
        </div>
        <div className="glass-panel rounded-lg p-4 text-center">
          <p className="text-2xl font-mono font-bold text-foreground">{totalArea.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground mt-1">Available m²</p>
        </div>
        <div className="glass-panel rounded-lg p-4 text-center">
          <p className="text-2xl font-mono font-bold text-accent">4</p>
          <p className="text-xs text-muted-foreground mt-1">Materials</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search remnants..."
          className="w-full h-10 rounded-md border border-input bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Remnants grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockRemnants.map(rem => (
          <div key={rem.remnant_id} className="glass-panel rounded-lg p-4 hover:border-primary/20 transition-all cursor-pointer">
            {/* Sheet visualization */}
            <div className="relative w-full h-24 bg-secondary/50 rounded-md mb-3 flex items-center justify-center overflow-hidden">
              <div
                className="bg-primary/20 border border-primary/40 rounded-sm"
                style={{
                  width: `${Math.min(90, (rem.length_mm / 2440) * 100)}%`,
                  height: `${Math.min(90, (rem.width_mm / 1220) * 100)}%`,
                }}
              />
              <span className="absolute text-[10px] font-mono text-muted-foreground bottom-1 right-2">
                {rem.length_mm}×{rem.width_mm}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{rem.colour_name}</p>
                <p className="text-xs text-muted-foreground font-mono">{rem.material_code} · {rem.thickness_mm}mm</p>
              </div>
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-medium", statusStyles[rem.status])}>
                {rem.status}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>📍 {rem.location}</span>
              <span>From {rem.source_job_id}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
