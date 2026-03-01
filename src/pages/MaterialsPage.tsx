import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import MaterialDialog from "@/components/MaterialDialog";

interface MaterialRow {
  id: string;
  material_code: string;
  display_name: string;
  thickness_mm: number;
  sheet_length_mm: number;
  sheet_width_mm: number;
  grain_direction: string;
  colour_name: string;
  cost_per_sheet: number | null;
  active: boolean;
}

export default function MaterialsPage() {
  const { userRole } = useAuth();
  const canManage = ["admin", "engineer"].includes(userRole || "");
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialRow | null>(null);

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("materials").select("*").order("material_code");
    setMaterials((data as MaterialRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (m: MaterialRow) => { if (canManage) { setEditing(m); setDialogOpen(true); } };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-mono text-xl font-bold text-foreground">Materials</h2>
          <p className="text-sm text-muted-foreground mt-1">{materials.length} materials</p>
        </div>
        {canManage && (
          <button onClick={openNew} className="flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus size={16} /> Add Material
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground font-mono">Loading...</div>
      ) : materials.length === 0 ? (
        <div className="glass-panel border-border rounded-lg p-12 text-center">
          <Package size={40} className="mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground text-sm">No materials yet</p>
        </div>
      ) : (
        <div className="glass-panel border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-mono text-xs text-muted-foreground">CODE</th>
                <th className="text-left px-4 py-3 font-mono text-xs text-muted-foreground">NAME</th>
                <th className="text-left px-4 py-3 font-mono text-xs text-muted-foreground">COLOUR</th>
                <th className="text-right px-4 py-3 font-mono text-xs text-muted-foreground">THICKNESS</th>
                <th className="text-right px-4 py-3 font-mono text-xs text-muted-foreground">SHEET SIZE</th>
                <th className="text-left px-4 py-3 font-mono text-xs text-muted-foreground">GRAIN</th>
                <th className="text-right px-4 py-3 font-mono text-xs text-muted-foreground">COST</th>
                <th className="text-center px-4 py-3 font-mono text-xs text-muted-foreground">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {materials.map(m => (
                <tr
                  key={m.id}
                  onClick={() => openEdit(m)}
                  className={`border-b border-border/50 transition-colors ${canManage ? "cursor-pointer hover:bg-muted/20" : ""}`}
                >
                  <td className="px-4 py-3 font-mono font-bold text-foreground">{m.material_code}</td>
                  <td className="px-4 py-3 text-foreground">{m.display_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{m.colour_name}</td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">{m.thickness_mm}mm</td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">{m.sheet_length_mm}×{m.sheet_width_mm}</td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{m.grain_direction}</td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">{m.cost_per_sheet != null ? `£${m.cost_per_sheet}` : "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={m.active ? "default" : "secondary"} className="text-[10px]">
                      {m.active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MaterialDialog open={dialogOpen} onOpenChange={setDialogOpen} onSuccess={fetchMaterials} material={editing} />
    </div>
  );
}
