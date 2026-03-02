import { useState, useMemo } from "react";
import { NestResult, SheetLayout } from "@/lib/nestingEngine";
import { CheckCircle2, AlertTriangle, Layers, RotateCcw, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  result: NestResult;
  sheetWidth: number;
  sheetLength: number;
  groupLabel: string;
  onCommit: () => void;
  onRerun: () => void;
  onClose: () => void;
  committing?: boolean;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(210 60% 55%)",
  "hsl(150 50% 45%)",
  "hsl(30 70% 55%)",
  "hsl(280 50% 55%)",
  "hsl(0 60% 55%)",
  "hsl(180 50% 45%)",
];

function SheetThumbnail({ sheet, sheetW, sheetH }: { sheet: SheetLayout; sheetW: number; sheetH: number }) {
  const scale = 280 / Math.max(sheetW, sheetH);
  const svgW = sheetW * scale;
  const svgH = sheetH * scale;

  // Assign colors by unique part_id
  const partIds = [...new Set(sheet.placements.map((p) => p.part_id))];
  const colorMap = new Map(partIds.map((id, i) => [id, COLORS[i % COLORS.length]]));

  return (
    <div className="rounded-md border border-border bg-card/50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-bold text-foreground">Sheet {sheet.sheet_number}</span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {sheet.utilisation_percent.toFixed(1)}% utilised
        </span>
      </div>
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${sheetW} ${sheetH}`}
        className="w-full border border-border/30 rounded bg-muted/10"
        style={{ maxHeight: 200 }}
      >
        {/* Sheet outline */}
        <rect x={0} y={0} width={sheetW} height={sheetH} fill="none" stroke="hsl(var(--border))" strokeWidth={2} />

        {/* Placed parts */}
        {sheet.placements.map((p, i) => (
          <g key={i}>
            <rect
              x={p.x_mm}
              y={p.y_mm}
              width={p.width_mm}
              height={p.height_mm}
              fill={colorMap.get(p.part_id) || COLORS[0]}
              fillOpacity={0.3}
              stroke={colorMap.get(p.part_id) || COLORS[0]}
              strokeWidth={1}
            />
            {p.width_mm * scale > 20 && p.height_mm * scale > 12 && (
              <text
                x={p.x_mm + p.width_mm / 2}
                y={p.y_mm + p.height_mm / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={Math.min(p.width_mm, p.height_mm) * 0.2}
                fill="hsl(var(--foreground))"
                className="font-mono"
              >
                {p.part_id}
              </text>
            )}
            {p.rotation_deg === 90 && (
              <circle
                cx={p.x_mm + 8}
                cy={p.y_mm + 8}
                r={4}
                fill="hsl(var(--primary))"
                fillOpacity={0.6}
              />
            )}
          </g>
        ))}
      </svg>
      <div className="text-[10px] font-mono text-muted-foreground">
        {sheet.placements.length} parts · Waste: {(sheet.waste_area_mm2 / 1000000).toFixed(3)} m²
      </div>
    </div>
  );
}

export default function NestingPreview({
  result,
  sheetWidth,
  sheetLength,
  groupLabel,
  onCommit,
  onRerun,
  onClose,
  committing,
}: Props) {
  return (
    <div className="glass-panel border-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
          <Layers size={16} className="text-primary" />
          Nesting Preview — {groupLabel}
        </h3>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
          Close
        </button>
      </div>

      {/* Validation Banner */}
      {result.success ? (
        <div className="flex items-center gap-2 p-3 rounded-md bg-primary/10 border border-primary/20">
          <CheckCircle2 size={16} className="text-primary" />
          <span className="text-sm text-primary font-medium">All parts placed successfully</span>
        </div>
      ) : (
        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 space-y-1">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-destructive" />
            <span className="text-sm text-destructive font-medium">
              {result.unplaced.length} part(s) could not be placed
            </span>
          </div>
          {result.unplaced.map((u, i) => (
            <p key={i} className="text-xs text-destructive/80 ml-6">
              {u.part_id}: {u.reason}
            </p>
          ))}
        </div>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="p-3 rounded-md bg-accent/10 border border-accent/20">
          {result.warnings.map((w, i) => (
            <p key={i} className="text-xs text-accent-foreground">{w}</p>
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="text-center p-2 rounded border border-border/30">
          <p className="text-xl font-mono font-bold text-foreground">{result.total_sheets}</p>
          <p className="text-[10px] font-mono text-muted-foreground">SHEETS</p>
        </div>
        <div className="text-center p-2 rounded border border-border/30">
          <p className="text-xl font-mono font-bold text-foreground">{result.total_utilisation_percent.toFixed(1)}%</p>
          <p className="text-[10px] font-mono text-muted-foreground">UTILISATION</p>
        </div>
        <div className="text-center p-2 rounded border border-border/30">
          <p className="text-xl font-mono font-bold text-foreground">{result.algorithm}</p>
          <p className="text-[10px] font-mono text-muted-foreground">ALGORITHM</p>
        </div>
        <div className="text-center p-2 rounded border border-border/30">
          <p className="text-xl font-mono font-bold text-foreground">
            {result.sheets.reduce((s, sh) => s + sh.placements.length, 0)}
          </p>
          <p className="text-[10px] font-mono text-muted-foreground">PLACEMENTS</p>
        </div>
      </div>

      {/* Sheet Thumbnails */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {result.sheets.map((sheet) => (
          <SheetThumbnail key={sheet.sheet_number} sheet={sheet} sheetW={sheetWidth} sheetH={sheetLength} />
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-border/30">
        <Button size="sm" variant="outline" onClick={onRerun}>
          <RotateCcw size={14} className="mr-1" /> Re-run
        </Button>
        <Button
          size="sm"
          onClick={onCommit}
          disabled={!result.success || committing}
          className="bg-primary text-primary-foreground"
        >
          <Lock size={14} className="mr-1" />
          {committing ? "Committing..." : "Commit Layout"}
        </Button>
      </div>
    </div>
  );
}
