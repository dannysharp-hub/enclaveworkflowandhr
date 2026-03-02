import { AlertTriangle, CheckCircle2, Info, RefreshCw } from "lucide-react";
import { DxfExtractionResult } from "@/lib/dxfExtractor";

interface Props {
  extraction: DxfExtractionResult | null;
  manualWidth?: number;
  manualHeight?: number;
  useExtracted: boolean;
  onToggleUseExtracted: (use: boolean) => void;
  onReprocess?: () => void;
  reprocessing?: boolean;
  mismatchThreshold?: number; // percent, default 2
}

export default function DxfExtractionBadge({
  extraction,
  manualWidth,
  manualHeight,
  useExtracted,
  onToggleUseExtracted,
  onReprocess,
  reprocessing,
  mismatchThreshold = 2,
}: Props) {
  if (!extraction?.bbox) return null;

  const { bbox, bbox_confidence, notes } = extraction;

  // Check mismatch between manual and extracted
  let hasMismatch = false;
  let mismatchDetails = "";
  if (manualWidth && manualHeight && manualWidth > 0 && manualHeight > 0) {
    const widthDiff = Math.abs(bbox.width_mm - manualWidth) / manualWidth * 100;
    const heightDiff = Math.abs(bbox.height_mm - manualHeight) / manualHeight * 100;
    if (widthDiff > mismatchThreshold || heightDiff > mismatchThreshold) {
      hasMismatch = true;
      mismatchDetails = `Manual: ${manualWidth}×${manualHeight} vs Extracted: ${bbox.width_mm}×${bbox.height_mm}`;
    }
  }

  const confidenceColor = bbox_confidence === "high"
    ? "text-primary"
    : bbox_confidence === "medium"
    ? "text-amber-500"
    : "text-destructive";

  const confidenceIcon = bbox_confidence === "high"
    ? <CheckCircle2 size={12} className={confidenceColor} />
    : bbox_confidence === "medium"
    ? <Info size={12} className={confidenceColor} />
    : <AlertTriangle size={12} className={confidenceColor} />;

  return (
    <div className="space-y-1.5">
      {/* Extracted dimensions */}
      <div className="flex items-center gap-2 text-[10px] font-mono">
        {confidenceIcon}
        <span className={`${confidenceColor} font-medium`}>
          DXF: {bbox.width_mm}×{bbox.height_mm}mm
        </span>
        <span className="text-muted-foreground capitalize">
          ({bbox_confidence})
        </span>
      </div>

      {/* Mismatch warning */}
      {hasMismatch && (
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-amber-500 bg-amber-500/5 px-2 py-1 rounded">
          <AlertTriangle size={10} />
          <span>Dimension mismatch: {mismatchDetails}</span>
        </div>
      )}

      {/* Low confidence warning */}
      {bbox_confidence === "low" && notes.length > 0 && (
        <div className="text-[10px] font-mono text-destructive/80 bg-destructive/5 px-2 py-1 rounded">
          {notes.map((n, i) => <div key={i}>⚠ {n}</div>)}
        </div>
      )}

      {/* Toggle + Reprocess */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={useExtracted}
            onChange={(e) => onToggleUseExtracted(e.target.checked)}
            className="rounded border-input"
          />
          Use extracted dims
        </label>
        {onReprocess && (
          <button
            onClick={onReprocess}
            disabled={reprocessing}
            className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
          >
            <RefreshCw size={10} className={reprocessing ? "animate-spin" : ""} />
            Reprocess
          </button>
        )}
      </div>
    </div>
  );
}
