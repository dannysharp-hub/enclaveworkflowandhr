import { useState } from "react";
import { NestResult, SheetLayout, NestCandidate } from "@/lib/nesting";
import { CheckCircle2, AlertTriangle, Layers, RotateCcw, Lock, ChevronDown, ChevronUp, Trophy } from "lucide-react";
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
  candidates?: NestCandidate[];
  onSelectCandidate?: (candidate: NestCandidate) => void;
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
  const effectiveW = sheet.is_remnant && sheet.remnant_width_mm ? sheet.remnant_width_mm : sheetW;
  const effectiveH = sheet.is_remnant && sheet.remnant_height_mm ? sheet.remnant_height_mm : sheetH;
  const scale = 280 / Math.max(effectiveW, effectiveH);
  const svgW = effectiveW * scale;
  const svgH = effectiveH * scale;

  const partIds = [...new Set(sheet.placements.map((p) => p.part_id))];
  const colorMap = new Map(partIds.map((id, i) => [id, COLORS[i % COLORS.length]]));

  return (
    <div className="rounded-md border border-border bg-card/50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-bold text-foreground">
          {sheet.is_remnant ? "♻️ Remnant" : "Sheet"} {sheet.sheet_number}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {sheet.utilisation_percent.toFixed(1)}% utilised
        </span>
      </div>
      {sheet.is_remnant && (
        <div className="text-[9px] font-mono text-primary/80 bg-primary/5 px-1.5 py-0.5 rounded">
          Remnant: {effectiveW}×{effectiveH}mm
        </div>
      )}
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${effectiveW} ${effectiveH}`}
        className="w-full border border-border/30 rounded bg-muted/10"
        style={{ maxHeight: 200 }}
      >
        <rect x={0} y={0} width={effectiveW} height={effectiveH} fill="none" stroke="hsl(var(--border))" strokeWidth={2} />
        {sheet.placements.map((p, i) => (
          <g key={i}>
            <rect
              x={p.x_mm} y={p.y_mm} width={p.width_mm} height={p.height_mm}
              fill={colorMap.get(p.part_id) || COLORS[0]} fillOpacity={0.3}
              stroke={colorMap.get(p.part_id) || COLORS[0]} strokeWidth={1}
            />
            {p.width_mm * scale > 20 && p.height_mm * scale > 12 && (
              <text
                x={p.x_mm + p.width_mm / 2} y={p.y_mm + p.height_mm / 2}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={Math.min(p.width_mm, p.height_mm) * 0.2}
                fill="hsl(var(--foreground))" className="font-mono"
              >
                {p.part_id}
              </text>
            )}
            {p.rotation_deg === 90 && (
              <circle cx={p.x_mm + 8} cy={p.y_mm + 8} r={4} fill="hsl(var(--primary))" fillOpacity={0.6} />
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
  result, sheetWidth, sheetLength, groupLabel,
  onCommit, onRerun, onClose, committing,
  candidates, onSelectCandidate,
}: Props) {
  const [showCandidates, setShowCandidates] = useState(false);
  const topCandidates = (candidates ?? []).slice(0, 5);
  const hasMultipleCandidates = topCandidates.length > 1;
  const remnantSheets = result.sheets.filter(s => s.is_remnant);
  const fullSheets = result.sheets.filter(s => !s.is_remnant);

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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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
        {remnantSheets.length > 0 && (
          <div className="text-center p-2 rounded border border-primary/30 bg-primary/5">
            <p className="text-xl font-mono font-bold text-primary">{remnantSheets.length}</p>
            <p className="text-[10px] font-mono text-primary/70">REMNANTS</p>
          </div>
        )}
      </div>

      {/* Remnant savings */}
      {remnantSheets.length > 0 && (
        <div className="p-3 rounded-md bg-primary/5 border border-primary/20">
          <p className="text-xs font-mono text-primary font-medium">
            ♻️ {remnantSheets.length} remnant(s) used · {fullSheets.length} full sheet(s) needed
          </p>
          <p className="text-[10px] font-mono text-primary/70 mt-1">
            Remnant area used: {((result.remnant_area_used_mm2 ?? 0) / 1000000).toFixed(3)} m²
          </p>
        </div>
      )}

      {/* Best-of-N Candidates */}
      {hasMultipleCandidates && (
        <div className="border border-border/30 rounded-md">
          <button
            onClick={() => setShowCandidates(!showCandidates)}
            className="w-full flex items-center justify-between p-3 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="flex items-center gap-1">
              <Trophy size={12} className="text-primary" />
              Best of {candidates?.length ?? 0} runs
            </span>
            {showCandidates ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {showCandidates && (
            <div className="border-t border-border/30 p-3 space-y-1.5">
              {topCandidates.map((c, idx) => {
                const isSelected = c.result.result_hash === result.result_hash;
                return (
                  <button
                    key={idx}
                    onClick={() => onSelectCandidate?.(c)}
                    className={`w-full flex items-center justify-between p-2 rounded text-[10px] font-mono transition-colors ${
                      isSelected
                        ? "bg-primary/10 border border-primary/30 text-primary"
                        : "bg-muted/20 border border-border/20 text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {idx === 0 && <Trophy size={10} className="text-primary" />}
                      <span>#{c.run_index} {c.algorithm}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span>{c.result.total_sheets} sheets</span>
                      <span>{c.result.total_utilisation_percent.toFixed(1)}%</span>
                      {(c.result.remnant_area_used_mm2 ?? 0) > 0 && (
                        <span className="text-primary">♻️</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Sheet Thumbnails */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {result.sheets.map((sheet) => (
          <SheetThumbnail
            key={sheet.sheet_number}
            sheet={sheet}
            sheetW={sheetWidth}
            sheetH={sheetLength}
          />
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
