import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Calculator,
  Check,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  X,
} from "lucide-react";

interface PurchasingLine {
  description: string;
  unit_price: number | null;
  qty: number | null;
  line_total: number | null;
  supplier: string | null;
  product_url: string | null;
  due_date: string | null;
}

interface Extraction {
  id: string;
  job_id: string | null;
  folder_name: string;
  folder_url: string | null;
  source_file_id: string | null;
  source_filename: string | null;
  source_modified_at: string | null;
  source_tab: string | null;
  extracted: Record<string, any> | null;
  purchasing_lines: PurchasingLine[] | null;
  ambiguous_files: { id: string; name: string; url?: string; modified?: string }[] | null;
  status: string;
  error: string | null;
  created_at: string;
}

interface JobValues {
  id: string;
  job_ref: string | null;
  quoted_total: number | null;
  cost_total: number | null;
  profit_total: number | null;
  materials_subtotal: number | null;
  labour_total: number | null;
  hardware_total: number | null;
  fixings_total: number | null;
  costing_source_filename: string | null;
}

const FIELDS: { key: keyof JobValues; label: string }[] = [
  { key: "quoted_total", label: "Quoted total" },
  { key: "cost_total", label: "Cost total" },
  { key: "profit_total", label: "Profit" },
  { key: "materials_subtotal", label: "Materials (Units)" },
  { key: "labour_total", label: "Labour (Time)" },
  { key: "hardware_total", label: "Hardware" },
  { key: "fixings_total", label: "Fixings" },
];

const money = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : `£${Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CostingReview() {
  const { userRole } = useAuth();
  const isAdmin = ["admin", "super_admin"].includes(userRole || "");

  const [rows, setRows] = useState<Extraction[]>([]);
  const [jobs, setJobs] = useState<Record<string, JobValues>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("cab_costing_extractions")
      .select("*")
      .in("status", ["pending", "error", "not_found"])
      .order("created_at", { ascending: false });

    const list = (data || []) as unknown as Extraction[];
    setRows(list);

    const jobIds = Array.from(new Set(list.map(r => r.job_id).filter(Boolean))) as string[];
    if (jobIds.length) {
      const { data: jobRows } = await supabase
        .from("cab_jobs")
        .select("id, job_ref, quoted_total, cost_total, profit_total, materials_subtotal, labour_total, hardware_total, fixings_total, costing_source_filename")
        .in("id", jobIds);
      const map: Record<string, JobValues> = {};
      ((jobRows || []) as unknown as JobValues[]).forEach(j => { map[j.id] = j; });
      setJobs(map);
    } else {
      setJobs({});
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (row: Extraction) => {
    setBusyId(row.id);
    try {
      const { data, error } = await supabase.functions.invoke("extract-drive-costing", {
        body: { action: "commit", extraction_id: row.id },
      });
      if (error) throw new Error(error.message);
      if (data?.ok === false) throw new Error(data.error || "Could not save these figures");
      toast({
        title: "Costing saved",
        description: `${row.folder_name} · ${data?.purchasing_lines ?? 0} purchasing line(s)`,
      });
      load();
    } catch (err: any) {
      toast({ title: "Could not save", description: err.message, variant: "destructive" });
    } finally { setBusyId(null); }
  };

  const reject = async (row: Extraction) => {
    setBusyId(row.id);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("cab_costing_extractions")
      .update({
        status: "rejected",
        reviewed_by: userData?.user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    setBusyId(null);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Skipped", description: row.folder_name }); load(); }
  };

  const pending = rows.filter(r => r.status === "pending");
  const problems = rows.filter(r => r.status !== "pending");

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" /> Loading costing review…
      </div>
    );
  }

  if (!rows.length) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Calculator size={16} className="text-primary" />
        <h2 className="text-sm font-bold text-foreground">Costing review ({pending.length})</h2>
      </div>

      {pending.map(row => {
        const job = row.job_id ? jobs[row.job_id] : null;
        const ex = row.extracted || {};
        const lines = row.purchasing_lines || [];
        const overwrites = FIELDS.filter(
          f => job && job[f.key] !== null && job[f.key] !== undefined && Number(job[f.key]) !== Number(ex[f.key as string]),
        );
        const isRevision = !!job?.costing_source_filename;

        return (
          <div key={row.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-sm font-bold text-foreground truncate">{row.folder_name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <FileSpreadsheet size={12} />
                  {row.source_filename}
                  {row.source_tab && <span className="opacity-70">· {row.source_tab}</span>}
                </p>
                {!job && (
                  <p className="text-xs text-warning mt-1 flex items-center gap-1">
                    <AlertTriangle size={12} /> Not linked to a job yet — link the folder first.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {row.folder_url && (
                  <a href={row.folder_url} target="_blank" rel="noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1">
                    <ExternalLink size={12} /> Folder
                  </a>
                )}
                {row.source_file_id && (
                  <a href={`https://docs.google.com/spreadsheets/d/${row.source_file_id}`} target="_blank" rel="noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1">
                    <ExternalLink size={12} /> Sheet
                  </a>
                )}
              </div>
            </div>

            {isRevision && (
              <p className="text-xs text-warning flex items-center gap-1">
                <AlertTriangle size={12} /> This job already has committed figures — below is the change.
              </p>
            )}

            {!!row.ambiguous_files?.length && (
              <div className="rounded-md bg-warning/10 border border-warning/30 p-2.5 space-y-1">
                <p className="text-xs font-medium text-warning flex items-center gap-1">
                  <AlertTriangle size={12} /> More than one costing sheet found — newest used
                </p>
                {row.ambiguous_files.map(f => (
                  <a key={f.id} href={f.url || `https://docs.google.com/spreadsheets/d/${f.id}`}
                    target="_blank" rel="noreferrer"
                    className="block text-[11px] text-muted-foreground hover:text-foreground truncate">
                    {f.name}{f.modified ? ` · modified ${new Date(f.modified).toLocaleDateString("en-GB")}` : ""}
                  </a>
                ))}
              </div>
            )}

            {row.error && (
              <p className="text-xs text-muted-foreground">{row.error}</p>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {FIELDS.map(f => {
                const next = ex[f.key as string] ?? null;
                const current = job ? job[f.key] : null;
                const changed = current !== null && current !== undefined && Number(current) !== Number(next);
                return (
                  <div key={f.key} className="rounded-md bg-muted/30 p-2">
                    <p className="text-[10px] font-mono uppercase text-muted-foreground">{f.label}</p>
                    <p className={cn("text-sm font-mono font-bold", changed ? "text-warning" : "text-foreground")}>
                      {money(next as number | null)}
                    </p>
                    {changed && (
                      <p className="text-[10px] font-mono text-muted-foreground line-through">{money(current as number)}</p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                className="text-xs text-primary hover:underline"
              >
                {expanded === row.id ? "Hide" : "Show"} {lines.length} purchasing line{lines.length !== 1 ? "s" : ""}
              </button>
              {overwrites.length > 0 && (
                <span className="text-[11px] text-warning">
                  {overwrites.length} existing value{overwrites.length !== 1 ? "s" : ""} would change
                </span>
              )}
            </div>

            {expanded === row.id && lines.length > 0 && (
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left px-2 py-1 font-medium">Description</th>
                      <th className="text-right px-2 py-1 font-medium">Price</th>
                      <th className="text-right px-2 py-1 font-medium">Qty</th>
                      <th className="text-right px-2 py-1 font-medium">Total</th>
                      <th className="text-left px-2 py-1 font-medium">Supplier</th>
                      <th className="text-left px-2 py-1 font-medium">Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-2 py-1">{l.description}</td>
                        <td className="px-2 py-1 text-right font-mono">{money(l.unit_price)}</td>
                        <td className="px-2 py-1 text-right font-mono">{l.qty ?? "—"}</td>
                        <td className="px-2 py-1 text-right font-mono">{money(l.line_total)}</td>
                        <td className="px-2 py-1">{l.supplier || "—"}</td>
                        <td className="px-2 py-1">{l.due_date || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {isAdmin && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => approve(row)} disabled={busyId === row.id || !job}>
                  {busyId === row.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => reject(row)} disabled={busyId === row.id}>
                  <X size={14} /> Skip
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {problems.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            No costing sheet found / could not be read ({problems.length})
          </p>
          <div className="space-y-1">
            {problems.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="font-mono text-foreground truncate">{p.folder_name}</span>
                <span className="text-muted-foreground truncate">
                  {p.status === "not_found" ? "No costing sheet found" : p.error || "Could not be read"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
