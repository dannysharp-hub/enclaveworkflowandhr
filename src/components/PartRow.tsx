import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Upload, FileCheck, AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface PartData {
  id?: string;
  part_id: string;
  product_code: string;
  length_mm: number;
  width_mm: number;
  quantity: number;
  material_code: string | null;
  grain_required: boolean;
  grain_axis: string | null;
  rotation_allowed: string | null;
  dxf_file_reference: string | null;
  validation_status: string | null;
}

interface Props {
  part: PartData;
  materials: { material_code: string; display_name: string }[];
  jobUuid: string;
  onUpdate: (partId: string, updates: Partial<PartData>) => void;
  onDelete: (partId: string) => void;
  readOnly?: boolean;
}

export default function PartRow({ part, materials, jobUuid, onUpdate, onDelete, readOnly }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const validationIssues: string[] = [];
  if (!part.material_code) validationIssues.push("No material assigned");
  if (part.length_mm <= 0 || part.width_mm <= 0) validationIssues.push("Invalid dimensions");
  if (part.grain_required && !part.grain_axis) validationIssues.push("Grain axis not set");

  const isValid = validationIssues.length === 0;

  const handleDxfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `${jobUuid}/${part.part_id}.dxf`;
    const { error } = await supabase.storage.from("dxf-files").upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } else {
      onUpdate(part.part_id, { dxf_file_reference: path });
      toast({ title: "DXF uploaded", description: part.part_id });
    }
    setUploading(false);
  };

  const selectClass = "h-8 rounded border border-input bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none";
  const cellClass = "px-3 py-2";

  return (
    <tr className={`border-b border-border/30 transition-colors ${!isValid ? "bg-destructive/5" : "hover:bg-muted/10"}`}>
      <td className={`${cellClass} font-mono text-xs font-bold text-foreground`}>{part.part_id}</td>
      <td className={`${cellClass} text-xs text-muted-foreground`}>{part.product_code}</td>
      <td className={`${cellClass} text-right font-mono text-xs text-muted-foreground`}>{part.length_mm}</td>
      <td className={`${cellClass} text-right font-mono text-xs text-muted-foreground`}>{part.width_mm}</td>
      <td className={`${cellClass} text-right font-mono text-xs text-foreground`}>{part.quantity}</td>
      <td className={cellClass}>
        {readOnly ? (
          <span className="text-xs text-muted-foreground">{part.material_code || "—"}</span>
        ) : (
          <select
            value={part.material_code || ""}
            onChange={e => onUpdate(part.part_id, { material_code: e.target.value || null })}
            className={selectClass}
          >
            <option value="">—</option>
            {materials.map(m => (
              <option key={m.material_code} value={m.material_code}>{m.material_code}</option>
            ))}
          </select>
        )}
      </td>
      <td className={cellClass}>
        {readOnly ? (
          <span className="text-xs text-muted-foreground">{part.grain_required ? "Yes" : "No"}</span>
        ) : (
          <input
            type="checkbox"
            checked={part.grain_required}
            onChange={e => onUpdate(part.part_id, { grain_required: e.target.checked })}
            className="rounded border-input"
          />
        )}
      </td>
      <td className={cellClass}>
        {readOnly ? (
          <span className="text-xs font-mono text-muted-foreground">{part.grain_axis || "—"}</span>
        ) : (
          <select
            value={part.grain_axis || "L"}
            onChange={e => onUpdate(part.part_id, { grain_axis: e.target.value })}
            className={selectClass}
            disabled={!part.grain_required}
          >
            <option value="L">L</option>
            <option value="W">W</option>
          </select>
        )}
      </td>
      <td className={cellClass}>
        {readOnly ? (
          <span className="text-xs text-muted-foreground">{part.rotation_allowed || "any"}</span>
        ) : (
          <select
            value={part.rotation_allowed || "any"}
            onChange={e => onUpdate(part.part_id, { rotation_allowed: e.target.value })}
            className={selectClass}
          >
            <option value="any">Any</option>
            <option value="none">None</option>
            <option value="90">90°</option>
          </select>
        )}
      </td>
      <td className={`${cellClass} text-center`}>
        {part.dxf_file_reference ? (
          <FileCheck size={14} className="inline text-primary" />
        ) : readOnly ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="text-muted-foreground hover:text-primary transition-colors"
              title="Upload DXF"
            >
              <Upload size={14} />
            </button>
            <input ref={fileRef} type="file" accept=".dxf" onChange={handleDxfUpload} className="hidden" />
          </>
        )}
      </td>
      <td className={`${cellClass} text-center`}>
        {!isValid ? (
          <span title={validationIssues.join(", ")}>
            <AlertTriangle size={14} className="inline text-destructive" />
          </span>
        ) : (
          <span className="text-[10px] font-mono text-primary">OK</span>
        )}
      </td>
      {!readOnly && (
        <td className={cellClass}>
          <button onClick={() => onDelete(part.part_id)} className="text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 size={14} />
          </button>
        </td>
      )}
    </tr>
  );
}
