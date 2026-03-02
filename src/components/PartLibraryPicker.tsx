import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Library, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface LibraryPart {
  id: string;
  part_code: string;
  description: string | null;
  product_code: string | null;
  material_code: string | null;
  length_mm: number;
  width_mm: number;
  thickness_mm: number | null;
  grain_required: boolean;
  grain_axis: string | null;
  rotation_allowed: string | null;
  dxf_file_reference: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (parts: LibraryPart[]) => void;
}

export default function PartLibraryPicker({ open, onOpenChange, onSelect }: Props) {
  const [parts, setParts] = useState<LibraryPart[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchParts = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("part_library").select("*").eq("active", true).order("part_code");
    setParts((data as LibraryPart[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      fetchParts();
      setSelected(new Set());
    }
  }, [open, fetchParts]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = () => {
    const chosen = parts.filter(p => selected.has(p.id));
    onSelect(chosen);
    onOpenChange(false);
  };

  const filtered = parts.filter(p =>
    !search || p.part_code.toLowerCase().includes(search.toLowerCase()) ||
    p.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Library size={18} className="text-primary" /> Add from Part Library</DialogTitle>
          <DialogDescription>Select parts to add to this job.</DialogDescription>
        </DialogHeader>

        <div className="relative mb-3">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search library..." className="h-8 w-full rounded border border-input bg-card pl-8 px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>

        <div className="flex-1 overflow-auto border border-border rounded-md">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No parts found</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 sticky top-0">
                  <th className="w-8 px-2 py-2"></th>
                  <th className="text-left px-2 py-2 font-mono text-[10px] text-muted-foreground">CODE</th>
                  <th className="text-left px-2 py-2 font-mono text-[10px] text-muted-foreground">DESC</th>
                  <th className="text-left px-2 py-2 font-mono text-[10px] text-muted-foreground">MATERIAL</th>
                  <th className="text-right px-2 py-2 font-mono text-[10px] text-muted-foreground">L×W</th>
                  <th className="text-center px-2 py-2 font-mono text-[10px] text-muted-foreground">GRAIN</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} onClick={() => toggle(p.id)}
                    className={`border-b border-border/30 cursor-pointer transition-colors ${selected.has(p.id) ? "bg-primary/10" : "hover:bg-muted/10"}`}>
                    <td className="px-2 py-1.5 text-center">
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="rounded border-input" />
                    </td>
                    <td className="px-2 py-1.5 font-mono text-xs font-bold text-foreground">{p.part_code}</td>
                    <td className="px-2 py-1.5 text-xs text-muted-foreground">{p.description || "—"}</td>
                    <td className="px-2 py-1.5 text-xs text-muted-foreground">{p.material_code || "—"}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-xs text-muted-foreground">{p.length_mm}×{p.width_mm}</td>
                    <td className="px-2 py-1.5 text-center text-xs text-muted-foreground">{p.grain_required ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between pt-3">
          <span className="text-xs text-muted-foreground">{selected.size} selected</span>
          <Button size="sm" onClick={handleAdd} disabled={selected.size === 0}>
            <Plus size={14} /> Add {selected.size} Part{selected.size !== 1 ? "s" : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
