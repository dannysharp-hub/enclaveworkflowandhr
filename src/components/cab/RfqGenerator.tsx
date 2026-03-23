import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { insertCabEvent } from "@/lib/cabHelpers";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Send, FileText, RefreshCw, Package, Paintbrush, Wrench } from "lucide-react";
import Papa from "papaparse";

interface BomRow {
  part_number: string;
  filename: string;
  material: string;
  grain: string;
  width: number;
  length: number;
  thickness: number;
  qty: number;
  structure: string; // "Normal" or "Purchased"
}

interface RfqCategory {
  key: "panels" | "spray" | "hardware";
  label: string;
  icon: React.ReactNode;
  items: BomRow[];
  columns: string[];
}

interface Supplier {
  id: string;
  name: string;
  email: string;
  supplier_type: string | null;
}

interface Props {
  companyId: string;
  job: any;
  onRefresh: () => void;
}

export default function RfqGenerator({ companyId, job, onRefresh }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bomRows, setBomRows] = useState<BomRow[]>([]);
  const [categories, setCategories] = useState<RfqCategory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<Record<string, Set<string>>>({
    panels: new Set(),
    spray: new Set(),
    hardware: new Set(),
  });
  const [sending, setSending] = useState<string | null>(null);
  const [sentCategories, setSentCategories] = useState<Set<string>>(new Set());

  const handleGenerateRfq = async () => {
    setLoading(true);
    setOpen(true);
    setBomRows([]);
    setCategories([]);
    setSentCategories(new Set());

    try {
      // 1. List files in the job's Drive folder
      const { data: filesData, error: filesErr } = await supabase.functions.invoke("google-drive-auth", {
        body: { action: "list_job_folder_files", job_id: job.id },
      });
      if (filesErr) throw new Error(filesErr.message);
      if (filesData?.error) throw new Error(filesData.error);

      const files = filesData?.files || [];
      
      // 2. Find CSV file with "BOM" in the name
      const bomFile = files.find((f: any) =>
        f.name.toUpperCase().includes("BOM") &&
        (f.name.toLowerCase().endsWith(".csv") || f.mimeType === "application/vnd.google-apps.spreadsheet" || f.mimeType === "text/csv")
      );

      if (!bomFile) {
        toast({ title: "No BOM file found", description: "Upload a CSV file containing 'BOM' in the filename to the job's Drive folder.", variant: "destructive" });
        setLoading(false);
        setOpen(false);
        return;
      }

      // 3. Download the CSV
      const { data: dlData, error: dlErr } = await supabase.functions.invoke("google-drive-auth", {
        body: { action: "download_file_content", file_id: bomFile.id },
      });
      if (dlErr) throw new Error(dlErr.message);
      if (dlData?.error) throw new Error(dlData.error);

      const csvContent = dlData.content;

      // 4. Parse CSV with PapaParse
      const parsed = Papa.parse(csvContent.trim(), { header: true, skipEmptyLines: true });
      
      // Map to BomRow
      const rows: BomRow[] = parsed.data.map((row: any) => {
        // Flexible header matching
        const get = (keys: string[]) => {
          for (const k of keys) {
            const val = row[k] || row[k.toLowerCase()] || row[k.toUpperCase()];
            if (val !== undefined && val !== "") return val;
          }
          // Case-insensitive fallback
          for (const k of keys) {
            const found = Object.keys(row).find(rk => rk.toLowerCase() === k.toLowerCase());
            if (found && row[found] !== undefined && row[found] !== "") return row[found];
          }
          return "";
        };

        return {
          part_number: get(["Part Number", "PartNumber", "Part_Number", "part_number", "Part No"]),
          filename: get(["Filename", "File Name", "FileName", "filename", "Description", "Name", "Component"]),
          material: get(["Material", "material", "Material_Text", "Mat"]),
          grain: get(["Grain", "grain", "Grain Direction"]),
          width: parseFloat(get(["Width", "width", "W"])) || 0,
          length: parseFloat(get(["Length", "length", "L"])) || 0,
          thickness: parseFloat(get(["Thickness", "thickness", "Thk"])) || 0,
          qty: parseInt(get(["QTY", "Qty", "qty", "Quantity", "quantity"])) || 1,
          structure: get(["BOM Structure", "Structure", "BOM_Structure", "bom_structure", "Type"]),
        };
      }).filter((r: BomRow) => r.filename || r.part_number);

      setBomRows(rows);

      // 5. Categorize
      const panelItems = rows.filter(r => r.structure === "Normal");
      const sprayItems = rows.filter(r => r.structure === "Normal" && r.material.toLowerCase().includes("finsa"));
      const hardwareItems = rows.filter(r => r.structure === "Purchased");

      const cats: RfqCategory[] = [];
      if (panelItems.length > 0) {
        cats.push({
          key: "panels",
          label: "Panels",
          icon: <Package size={14} />,
          items: panelItems,
          columns: ["Material", "Grain", "Width", "Length", "Thickness", "QTY"],
        });
      }
      if (sprayItems.length > 0) {
        cats.push({
          key: "spray",
          label: "Spray Finish",
          icon: <Paintbrush size={14} />,
          items: sprayItems,
          columns: ["Material", "Grain", "Width", "Length", "Thickness", "QTY"],
        });
      }
      if (hardwareItems.length > 0) {
        cats.push({
          key: "hardware",
          label: "Hardware",
          icon: <Wrench size={14} />,
          items: hardwareItems,
          columns: ["Part Number", "Filename", "QTY"],
        });
      }
      setCategories(cats);

      // 6. Load suppliers with supplier_type
      const { data: suppData } = await (supabase.from("cab_suppliers") as any)
        .select("id, name, email, contact_email, supplier_type")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");

      const mappedSuppliers: Supplier[] = (suppData || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        email: s.email || s.contact_email || "",
        supplier_type: s.supplier_type,
      }));
      setSuppliers(mappedSuppliers);

      toast({ title: "BOM parsed", description: `${rows.length} parts found. ${cats.length} RFQ categories ready.` });
    } catch (err: any) {
      toast({ title: "RFQ generation failed", description: err.message, variant: "destructive" });
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const getSuppliersForCategory = (catKey: string): Supplier[] => {
    const typeMap: Record<string, string> = {
      panels: "panel_supplier",
      spray: "spray_painter",
      hardware: "hardware",
    };
    const targetType = typeMap[catKey];
    // Show suppliers of matching type first, then untyped ones
    return suppliers.filter(s => s.supplier_type === targetType || !s.supplier_type);
  };

  const toggleSupplier = (catKey: string, supplierId: string) => {
    setSelectedSuppliers(prev => {
      const newSet = new Set(prev[catKey]);
      if (newSet.has(supplierId)) {
        newSet.delete(supplierId);
      } else {
        newSet.add(supplierId);
      }
      return { ...prev, [catKey]: newSet };
    });
  };

  const handleSendRfq = async (catKey: string) => {
    const selected = selectedSuppliers[catKey];
    if (!selected || selected.size === 0) {
      toast({ title: "Select at least one supplier", variant: "destructive" });
      return;
    }

    const category = categories.find(c => c.key === catKey);
    if (!category) return;

    setSending(catKey);
    try {
      const selectedSuppList = suppliers.filter(s => selected.has(s.id));
      const today = new Date().toLocaleDateString("en-GB");

      for (const supplier of selectedSuppList) {
        if (!supplier.email) {
          toast({ title: `No email for ${supplier.name}`, description: "Skipping this supplier.", variant: "destructive" });
          continue;
        }

        // Build parts table HTML
        const isHardware = catKey === "hardware";
        const headerRow = isHardware
          ? `<tr style="background:#f3f4f6;"><th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #d1d5db;">Part Number</th><th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #d1d5db;">Filename</th><th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #d1d5db;">QTY</th></tr>`
          : `<tr style="background:#f3f4f6;"><th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #d1d5db;">Material</th><th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #d1d5db;">Grain</th><th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #d1d5db;">Width</th><th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #d1d5db;">Length</th><th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #d1d5db;">Thickness</th><th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #d1d5db;">QTY</th></tr>`;

        const bodyRows = category.items.map(item => {
          if (isHardware) {
            return `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${item.part_number}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${item.filename}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;font-weight:600;">${item.qty}</td></tr>`;
          }
          return `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${item.material}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${item.grain || "—"}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;">${item.width || "—"}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;">${item.length || "—"}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;">${item.thickness || "—"}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;font-weight:600;">${item.qty}</td></tr>`;
        }).join("");

        const categoryLabel = catKey === "spray" ? "Spray Finish" : catKey === "hardware" ? "Hardware" : "Panels";
        const brandColor = catKey === "spray" ? "#7c3aed" : "#2E5FA3";

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;"><tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="background:${brandColor};padding:24px;text-align:center;">
<img src="https://enclaveworkflowandhr.lovable.app/ec-logo.png" alt="Enclave Cabinetry" height="40" style="height:40px;" />
</td></tr>
<tr><td style="padding:32px;">
<h2 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#1a1a2e;">RFQ – ${job.job_ref} – ${categoryLabel}</h2>
<p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Date: ${today}</p>
<p style="font-size:14px;margin:0 0 16px;color:#333;">Dear ${supplier.name},</p>
<p style="font-size:14px;margin:0 0 16px;color:#333;">We would like to request a quotation for the following ${categoryLabel.toLowerCase()} items:</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0;">
<thead>${headerRow}</thead>
<tbody>${bodyRows}</tbody>
</table>
<div style="margin:24px 0;padding:16px;background:#f0fdf4;border-radius:6px;border:1px solid #bbf7d0;">
<p style="font-size:13px;margin:0;font-weight:600;">Please reply with:</p>
<ul style="font-size:13px;margin:8px 0 0;padding-left:20px;">
<li>Price (ex VAT)</li>
<li>Lead time (working days)</li>
<li>Delivery options</li>
</ul>
</div>
<p style="font-size:13px;color:#6b7280;margin:16px 0 0;">Please provide pricing for the above items by return. Job ref: ${job.job_ref}</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:16px;text-align:center;">
<p style="color:#999;font-size:12px;margin:0;">Enclave Cabinetry | alistair@enclavecabinetry.com | 07944 608098</p>
</td></tr>
</table></td></tr></table></body></html>`;

        const subject = `RFQ - ${job.job_ref} - ${today}`;

        // Send email via send-email edge function
        await supabase.functions.invoke("send-email", {
          body: {
            to: supplier.email,
            subject,
            html,
            replyTo: "alistair@enclavecabinetry.com",
          },
        });

        // Log to cab_events
        await insertCabEvent({
          companyId,
          eventType: "rfq.sent",
          jobId: job.id,
          payload: {
            supplier_name: supplier.name,
            supplier_id: supplier.id,
            category: catKey,
            item_count: category.items.length,
          },
        });
      }

      setSentCategories(prev => new Set([...prev, catKey]));
      toast({ title: `RFQs sent to ${selectedSuppList.filter(s => s.email).length} suppliers`, description: `${categoryLabel} RFQ sent successfully.` });
      onRefresh();
    } catch (err: any) {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    } finally {
      setSending(null);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={handleGenerateRfq}
        disabled={loading}
        className="text-xs"
      >
        {loading ? <RefreshCw size={12} className="animate-spin" /> : <FileText size={12} />}
        {loading ? "Scanning BOM…" : "Generate RFQ"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText size={16} /> RFQ Preview — {job.job_ref}
            </DialogTitle>
          </DialogHeader>

          {loading && (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && categories.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No categorizable items found in BOM.</p>
          )}

          {!loading && categories.map(cat => {
            const catSuppliers = getSuppliersForCategory(cat.key);
            const selected = selectedSuppliers[cat.key] || new Set();
            const isSent = sentCategories.has(cat.key);

            return (
              <div key={cat.key} className="border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
                    {cat.icon} {cat.label}
                    <Badge variant="secondary" className="text-[10px]">{cat.items.length} items</Badge>
                  </h3>
                  {isSent && <Badge className="bg-emerald-600 text-white text-[10px]">✔ Sent</Badge>}
                </div>

                {/* Parts table */}
                <div className="rounded-md border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        {cat.columns.map(col => (
                          <TableHead key={col} className="text-xs h-8 px-2">{col}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cat.items.slice(0, 20).map((item, idx) => (
                        <TableRow key={idx}>
                          {cat.key === "hardware" ? (
                            <>
                              <TableCell className="text-xs px-2 py-1">{item.part_number}</TableCell>
                              <TableCell className="text-xs px-2 py-1">{item.filename}</TableCell>
                              <TableCell className="text-xs px-2 py-1 text-right font-mono">{item.qty}</TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell className="text-xs px-2 py-1">{item.material}</TableCell>
                              <TableCell className="text-xs px-2 py-1">{item.grain || "—"}</TableCell>
                              <TableCell className="text-xs px-2 py-1 text-right font-mono">{item.width || "—"}</TableCell>
                              <TableCell className="text-xs px-2 py-1 text-right font-mono">{item.length || "—"}</TableCell>
                              <TableCell className="text-xs px-2 py-1 text-right font-mono">{item.thickness || "—"}</TableCell>
                              <TableCell className="text-xs px-2 py-1 text-right font-mono">{item.qty}</TableCell>
                            </>
                          )}
                        </TableRow>
                      ))}
                      {cat.items.length > 20 && (
                        <TableRow>
                          <TableCell colSpan={cat.columns.length} className="text-xs text-muted-foreground text-center py-1">
                            + {cat.items.length - 20} more items
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Supplier selection */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-foreground">Select suppliers:</p>
                  {catSuppliers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No suppliers found. Add suppliers with the correct type on the Suppliers page.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      {catSuppliers.map(s => (
                        <label key={s.id} className="flex items-center gap-2 p-1.5 rounded border border-border hover:bg-muted/30 cursor-pointer text-xs">
                          <Checkbox
                            checked={selected.has(s.id)}
                            onCheckedChange={() => toggleSupplier(cat.key, s.id)}
                          />
                          <span className="font-medium">{s.name}</span>
                          {s.supplier_type && (
                            <Badge variant="outline" className="text-[9px]">{s.supplier_type.replace(/_/g, " ")}</Badge>
                          )}
                          {!s.email && <span className="text-destructive text-[10px]">no email</span>}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Send button */}
                <Button
                  size="sm"
                  onClick={() => handleSendRfq(cat.key)}
                  disabled={sending !== null || selected.size === 0 || isSent}
                  className="text-xs"
                >
                  {sending === cat.key ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                  {sending === cat.key ? "Sending…" : isSent ? "Sent" : `Send RFQ to ${selected.size} supplier(s)`}
                </Button>
              </div>
            );
          })}
        </DialogContent>
      </Dialog>
    </>
  );
}
