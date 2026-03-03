import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, Package, Search, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import MaterialProductDialog from "@/components/MaterialProductDialog";

interface MaterialType {
  id: string;
  name: string;
}

interface MaterialProduct {
  id: string;
  material_code: string;
  material_type_id: string | null;
  brand: string | null;
  colour_name: string | null;
  thickness_mm: number;
  sheet_length_mm: number;
  sheet_width_mm: number;
  grain_default: string | null;
  rotation_allowed_90_default: boolean;
  cost_per_sheet: number;
  currency: string;
  waste_factor_percent: number;
  active: boolean;
  notes: string | null;
  material_types?: { name: string } | null;
}

export default function MaterialsPage() {
  const { userRole } = useAuth();
  const canManage = ["admin", "engineer"].includes(userRole || "");
  const [products, setProducts] = useState<MaterialProduct[]>([]);
  const [types, setTypes] = useState<MaterialType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialProduct | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterThickness, setFilterThickness] = useState<string>("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [prodRes, typeRes] = await Promise.all([
      supabase.from("material_products").select("*, material_types(name)").order("material_code"),
      supabase.from("material_types").select("id, name").eq("active", true).order("name"),
    ]);
    setProducts((prodRes.data as MaterialProduct[]) ?? []);
    setTypes((typeRes.data as MaterialType[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (m: MaterialProduct) => { if (canManage) { setEditing(m); setDialogOpen(true); } };

  // Derive unique thicknesses
  const thicknesses = [...new Set(products.map(p => p.thickness_mm))].sort((a, b) => a - b);

  // Filter & search
  const filtered = products.filter(p => {
    if (filterType !== "all" && p.material_type_id !== filterType) return false;
    if (filterThickness !== "all" && p.thickness_mm !== parseFloat(filterThickness)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        p.material_code.toLowerCase().includes(q) ||
        (p.colour_name || "").toLowerCase().includes(q) ||
        (p.brand || "").toLowerCase().includes(q) ||
        (p.material_types?.name || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-mono text-xl font-bold text-foreground">Materials Catalog</h2>
          <p className="text-sm text-muted-foreground mt-1">{products.length} products · {types.length} types</p>
        </div>
        {canManage && (
          <button onClick={openNew} className="flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus size={16} /> Add Product
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search code, colour, brand..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm bg-card"
          />
        </div>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none min-w-[160px]"
        >
          <option value="all">All Types</option>
          {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select
          value={filterThickness}
          onChange={e => setFilterThickness(e.target.value)}
          className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring appearance-none min-w-[120px]"
        >
          <option value="all">All Thick.</option>
          {thicknesses.map(t => <option key={t} value={t}>{t}mm</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground font-mono">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="glass-panel border-border rounded-lg p-12 text-center">
          <Package size={40} className="mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground text-sm">{search || filterType !== "all" ? "No matches" : "No materials yet"}</p>
        </div>
      ) : (
        <div className="glass-panel border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-mono text-xs text-muted-foreground">CODE</th>
                <th className="text-left px-4 py-3 font-mono text-xs text-muted-foreground">TYPE</th>
                <th className="text-left px-4 py-3 font-mono text-xs text-muted-foreground">COLOUR</th>
                
                <th className="text-right px-4 py-3 font-mono text-xs text-muted-foreground">THK</th>
                <th className="text-right px-4 py-3 font-mono text-xs text-muted-foreground">SHEET</th>
                <th className="text-center px-4 py-3 font-mono text-xs text-muted-foreground">GRAIN</th>
                <th className="text-center px-4 py-3 font-mono text-xs text-muted-foreground">ROT</th>
                <th className="text-right px-4 py-3 font-mono text-xs text-muted-foreground">COST</th>
                <th className="text-right px-4 py-3 font-mono text-xs text-muted-foreground">WASTE</th>
                <th className="text-center px-4 py-3 font-mono text-xs text-muted-foreground">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr
                  key={m.id}
                  onClick={() => openEdit(m)}
                  className={`border-b border-border/50 transition-colors ${canManage ? "cursor-pointer hover:bg-muted/20" : ""}`}
                >
                  <td className="px-4 py-3 font-mono font-bold text-foreground text-xs">{m.material_code}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{m.material_types?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-foreground">{m.colour_name || "—"}</td>
                  
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">{m.thickness_mm}mm</td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">{m.sheet_length_mm}×{m.sheet_width_mm}</td>
                  <td className="px-4 py-3 text-center">
                    {m.grain_default ? (
                      <Badge variant="outline" className="text-[10px]">{m.grain_default.toUpperCase()}</Badge>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={m.rotation_allowed_90_default ? "default" : "secondary"} className="text-[10px]">
                      {m.rotation_allowed_90_default ? "90°" : "0/180"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-foreground">£{Number(m.cost_per_sheet).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">{m.waste_factor_percent}%</td>
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

      <MaterialProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={fetchData}
        product={editing}
        types={types}
      />
    </div>
  );
}
