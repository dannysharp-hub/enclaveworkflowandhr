import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Check, X, GripVertical, ChevronDown, ChevronUp, Save } from "lucide-react";
import { cn } from "@/lib/utils";

interface Template {
  id: string;
  name: string;
  department: string;
  description: string | null;
  is_default: boolean;
  active: boolean;
  version: number;
}

interface ChecklistItem {
  id: string;
  template_id: string;
  label: string;
  description: string | null;
  check_type: string;
  mandatory: boolean;
  sort_order: number;
  active: boolean;
}

const inputClass = "w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";
const labelClass = "block text-[10px] font-mono font-medium text-muted-foreground mb-1 uppercase tracking-wider";

export default function JobCardTemplateManager() {
  const { tenantId } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);

  // New template form
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", department: "CNC", description: "", is_default: false });
  const [saving, setSaving] = useState(false);

  // Expanded template (to manage checklist items)
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // New item form
  const [addingItem, setAddingItem] = useState(false);
  const [itemForm, setItemForm] = useState({ label: "", description: "", check_type: "boolean", mandatory: false });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [tRes, iRes] = await Promise.all([
      supabase.from("job_card_templates").select("*").order("name"),
      supabase.from("job_checklist_items").select("*").order("sort_order"),
    ]);
    setTemplates((tRes.data as any[]) ?? []);
    setItems((iRes.data as any[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const createTemplate = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("job_card_templates").insert({
        name: form.name,
        department: form.department,
        description: form.description || null,
        is_default: form.is_default,
        tenant_id: tenantId,
      });
      if (error) throw error;
      toast({ title: "Template created" });
      setAdding(false);
      setForm({ name: "", department: "CNC", description: "", is_default: false });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleTemplateActive = async (t: Template) => {
    await supabase.from("job_card_templates").update({ active: !t.active }).eq("id", t.id);
    fetchAll();
  };

  const addChecklistItem = async () => {
    if (!expandedId || !itemForm.label.trim()) return;
    const maxSort = Math.max(0, ...items.filter(i => i.template_id === expandedId).map(i => i.sort_order));
    try {
      const { error } = await supabase.from("job_checklist_items").insert({
        template_id: expandedId,
        tenant_id: tenantId,
        label: itemForm.label,
        description: itemForm.description || null,
        check_type: itemForm.check_type,
        mandatory: itemForm.mandatory,
        sort_order: maxSort + 1,
      });
      if (error) throw error;
      toast({ title: "Item added" });
      setAddingItem(false);
      setItemForm({ label: "", description: "", check_type: "boolean", mandatory: false });
      fetchAll();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const toggleItemActive = async (item: ChecklistItem) => {
    await supabase.from("job_checklist_items").update({ active: !item.active }).eq("id", item.id);
    fetchAll();
  };

  const departments = ["CNC", "Assembly", "Spray", "Install", "Office", "General"];

  if (loading) {
    return <div className="h-20 flex items-center justify-center"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm font-bold text-foreground">Job Card Templates</h3>
        {!adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90">
            <Plus size={14} /> Add Template
          </button>
        )}
      </div>

      {/* New template form */}
      {adding && (
        <div className="glass-panel rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Name</label>
              <input className={inputClass} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="CNC Job Card" />
            </div>
            <div>
              <label className={labelClass}>Department</label>
              <select className={inputClass} value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Description</label>
              <input className={inputClass} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} className="rounded border-border" />
            Set as default template
          </label>
          <div className="flex gap-2">
            <button onClick={createTemplate} disabled={saving || !form.name.trim()} className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Check size={14} /> Save</button>
            <button onClick={() => setAdding(false)} className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground"><X size={14} /> Cancel</button>
          </div>
        </div>
      )}

      {/* Templates list */}
      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No templates yet. Create one to get started.</p>
      ) : (
        <div className="space-y-2">
          {templates.map(t => {
            const templateItems = items.filter(i => i.template_id === t.id);
            const isExpanded = expandedId === t.id;
            return (
              <div key={t.id} className={cn("glass-panel rounded-lg border", isExpanded ? "border-primary" : "border-border")}>
                <div className="flex items-center justify-between px-4 py-3">
                  <button onClick={() => setExpandedId(isExpanded ? null : t.id)} className="flex items-center gap-2 text-left flex-1">
                    {isExpanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                    <span className="font-mono text-sm font-medium text-foreground">{t.name}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t.department}</span>
                    {t.is_default && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary">DEFAULT</span>}
                    <span className="text-xs text-muted-foreground">{templateItems.filter(i => i.active).length} items</span>
                  </button>
                  <button
                    onClick={() => toggleTemplateActive(t)}
                    className={cn("text-[10px] font-mono px-2 py-1 rounded", t.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}
                  >
                    {t.active ? "ACTIVE" : "INACTIVE"}
                  </button>
                </div>

                {isExpanded && (
                  <div className="border-t border-border px-4 py-3 space-y-3">
                    {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}

                    {/* Checklist items */}
                    {templateItems.length > 0 ? (
                      <div className="space-y-1">
                        {templateItems.map((item, idx) => (
                          <div key={item.id} className={cn("flex items-center gap-2 px-2 py-1.5 rounded text-sm", !item.active && "opacity-50")}>
                            <GripVertical size={12} className="text-muted-foreground" />
                            <span className="text-muted-foreground text-[10px] font-mono w-5">{idx + 1}.</span>
                            <span className="flex-1 text-foreground">{item.label}</span>
                            {item.mandatory && <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-destructive/10 text-destructive">REQ</span>}
                            <span className="text-[10px] font-mono text-muted-foreground">{item.check_type}</span>
                            <button onClick={() => toggleItemActive(item)} className="text-muted-foreground hover:text-foreground">
                              {item.active ? <Check size={12} /> : <X size={12} />}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No checklist items yet</p>
                    )}

                    {/* Add item form */}
                    {addingItem ? (
                      <div className="rounded-md border border-border p-3 space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className={labelClass}>Label</label>
                            <input className={inputClass} value={itemForm.label} onChange={e => setItemForm(f => ({ ...f, label: e.target.value }))} placeholder="Check edge quality" />
                          </div>
                          <div>
                            <label className={labelClass}>Type</label>
                            <select className={inputClass} value={itemForm.check_type} onChange={e => setItemForm(f => ({ ...f, check_type: e.target.value }))}>
                              <option value="boolean">Checkbox</option>
                              <option value="text">Text Input</option>
                              <option value="number">Number</option>
                            </select>
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-foreground">
                          <input type="checkbox" checked={itemForm.mandatory} onChange={e => setItemForm(f => ({ ...f, mandatory: e.target.checked }))} className="rounded border-border" />
                          Mandatory
                        </label>
                        <div className="flex gap-2">
                          <button onClick={addChecklistItem} disabled={!itemForm.label.trim()} className="flex items-center gap-1 px-2 py-1 rounded bg-primary text-[10px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Check size={12} /> Add</button>
                          <button onClick={() => setAddingItem(false)} className="flex items-center gap-1 px-2 py-1 rounded border border-border text-[10px] text-muted-foreground"><X size={12} /> Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setAddingItem(true)} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                        <Plus size={12} /> Add Checklist Item
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
