import { useState } from "react";
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
import * as XLSX from "xlsx";

const SHEET_W = 1220; // mm
const SHEET_L = 2440; // mm
const SHEET_AREA = SHEET_W * SHEET_L;
const WASTE_FACTOR = 1.10;

interface BomRow {
  part_number: string;
  filename: string;
  material: string;
  grain: string;
  width: number;
  length: number;
  thickness: number;
  qty: number;
  structure: string;
}

interface SheetLine {
  material: string;
  thickness: number;
  sheetsRequired: number;
  totalParts: number;
}

interface SprayLine {
  material: string;
  thickness: number;
  qty: number;
}

interface HardwareLine {
  part_number: string;
  filename: string;
  qty: number;
}

interface RfqCategory {
  key: "panels" | "spray" | "hardware";
  label: string;
  icon: React.ReactNode;
  sheetLines?: SheetLine[];
  sprayLines?: SprayLine[];
  hardwareLines?: HardwareLine[];
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

function normalizeMaterialName(material: string): string {
  return material.trim().replace(/\s+/g, " ");
}

function getPreferredThickness(rows: BomRow[]): number {
  const nonZeroRows = rows.filter((row) => row.thickness > 0);
  if (nonZeroRows.length === 0) return 0;

  const counts = new Map<number, number>();
  for (const row of nonZeroRows) {
    counts.set(row.thickness, (counts.get(row.thickness) || 0) + row.qty);
  }

  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

function calculateSheets(rows: BomRow[]): SheetLine[] {
  const groups: Record<string, { parts: BomRow[]; material: string }> = {};

  for (const r of rows) {
    const material = normalizeMaterialName(r.material);
    if (!material) continue;

    const key = material.toLowerCase();
    if (!groups[key]) groups[key] = { parts: [], material };
    groups[key].parts.push(r);
  }

  return Object.values(groups).map(({ parts, material }) => {
    const thickness = getPreferredThickness(parts);
    const totalParts = parts.reduce((s, p) => s + p.qty, 0);
    const grain = (parts.find((part) => {
      const value = part.grain?.toUpperCase().trim() || "";
      return value === "V" || value === "H";
    })?.grain || "").toUpperCase().trim();
    const isGrained = grain === "V" || grain === "H";

    if (isGrained) {
      // Grain-locked: each part must fit on sheet without rotation
      // Use greedy strip packing per sheet
      let sheetsNeeded = 0;
      // Expand parts by qty
      const expanded: { w: number; l: number }[] = [];
      for (const p of parts) {
        for (let i = 0; i < p.qty; i++) {
          if (grain === "V") {
            // Width ≤ 1220, Length ≤ 2440
            expanded.push({ w: p.width, l: p.length });
          } else {
            // Grain H: Width ≤ 2440, Length ≤ 1220
            expanded.push({ w: p.width, l: p.length });
          }
        }
      }
      // Simple area-based calculation with grain penalty
      const totalArea = expanded.reduce((s, p) => s + p.w * p.l, 0);
      // Grain-locked parts waste more — use 75% efficiency instead of area ratio
      const efficiency = 0.75;
      sheetsNeeded = Math.ceil((totalArea / (SHEET_AREA * efficiency)) * WASTE_FACTOR);
      if (sheetsNeeded < 1) sheetsNeeded = 1;

      return { material, thickness, sheetsRequired: sheetsNeeded, totalParts };
    } else {
      // Simple area calculation
      const totalArea = parts.reduce((s, p) => s + p.width * p.length * p.qty, 0);
      let sheets = Math.ceil((totalArea / SHEET_AREA) * WASTE_FACTOR);
      if (sheets < 1 && totalParts > 0) sheets = 1;
      return { material, thickness, sheetsRequired: sheets, totalParts };
    }
  }).filter(l => l.material);
}

function calculateSprayLines(rows: BomRow[]): SprayLine[] {
  const groups: Record<string, { material: string; thickness: number; qty: number }> = {};
  for (const r of rows) {
    const key = `${r.material}||${r.thickness}`;
    if (!groups[key]) groups[key] = { material: r.material, thickness: r.thickness, qty: 0 };
    groups[key].qty += r.qty;
  }
  return Object.values(groups).filter(l => l.material);
}

export default function RfqGenerator({ companyId, job, onRefresh }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<RfqCategory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<Record<string, Set<string>>>({
    panels: new Set(), spray: new Set(), hardware: new Set(),
  });
  const [sending, setSending] = useState<string | null>(null);
  const [sentCategories, setSentCategories] = useState<Set<string>>(new Set());

  const handleGenerateRfq = async () => {
    setLoading(true);
    setOpen(true);
    setCategories([]);
    setSentCategories(new Set());

    try {
      const { data: filesData, error: filesErr } = await supabase.functions.invoke("google-drive-auth", {
        body: { action: "list_job_folder_files", job_id: job.id },
      });
      if (filesErr) {
        let errBody: any = null;
        try { errBody = await (filesErr as any).context?.json?.(); } catch (_) {}
        if (!errBody) try { errBody = (filesErr as any).context; } catch (_) {}
        console.log("[RfqGenerator] list_job_folder_files FULL ERROR:", { message: filesErr.message, errBody, filesData, filesErr });
        throw new Error(filesErr.message + (errBody ? ` | ${JSON.stringify(errBody)}` : ""));
      }
      if (filesData?.error) {
        console.log("[RfqGenerator] list_job_folder_files error in data:", filesData);
        throw new Error(filesData.error);
      }

      const files = filesData?.files || [];
      const bomFiles = files.filter((f: any) => {
        const name = (f.name || "").toUpperCase();
        const hasBom = name.includes("BOM");
        const isValidType = name.endsWith(".CSV") || name.endsWith(".XLSX") ||
          f.mimeType === "application/vnd.google-apps.spreadsheet" ||
          f.mimeType === "text/csv" ||
          f.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        return hasBom && isValidType;
      });

      if (bomFiles.length === 0) {
        toast({ title: "No BOM file found", description: "Upload a CSV or XLSX file containing 'BOM' in the filename to the job's Drive folder.", variant: "destructive" });
        setLoading(false);
        setOpen(false);
        return;
      }

      // Download and parse ALL BOM files, then merge
      const allRows: BomRow[] = [];
      for (const bomFile of bomFiles) {
        const { data: dlData, error: dlErr } = await supabase.functions.invoke("google-drive-auth", {
          body: { action: "download_file_content", file_id: bomFile.id },
        });
        if (dlErr) { console.warn(`[RfqGenerator] Failed to download ${bomFile.name}:`, dlErr.message); continue; }
        if (dlData?.error) { console.warn(`[RfqGenerator] Error in ${bomFile.name}:`, dlData.error); continue; }

        let parsedData: Record<string, string>[];
        if (dlData.format === "xlsx_base64") {
          const binaryStr = atob(dlData.content);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
          const workbook = XLSX.read(bytes, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          parsedData = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
        } else {
          const parsed = Papa.parse(dlData.content.trim(), { header: true, skipEmptyLines: true });
          parsedData = parsed.data as Record<string, string>[];
        }

        // Log raw headers for debugging thickness/column issues
        if (parsedData.length > 0) {
          const rawHeaders = Object.keys(parsedData[0]);
          console.log(`[RfqGenerator] Raw headers for ${bomFile.name}:`, rawHeaders);
          console.log(`[RfqGenerator] First row sample:`, JSON.stringify(parsedData[0]));
        }

        const fileRows: BomRow[] = parsedData.map((row: any) => {
          // Normalize keys: trim whitespace from XLSX headers
          const normRow: Record<string, any> = {};
          for (const [k, v] of Object.entries(row)) {
            normRow[k.trim()] = v;
          }
          const get = (keys: string[]) => {
            for (const k of keys) {
              if (normRow[k] !== undefined && normRow[k] !== "") return normRow[k];
            }
            const nKeys = Object.keys(normRow);
            for (const k of keys) {
              const found = nKeys.find(rk => rk.toLowerCase() === k.toLowerCase());
              if (found && normRow[found] !== undefined && normRow[found] !== "") return normRow[found];
            }
            return "";
          };
          return {
            part_number: String(get(["Part Number", "PartNumber", "Part_Number", "part_number", "Part No"]) ?? ""),
            filename: String(get(["Filename", "File Name", "FileName", "filename", "Description", "Name", "Component"]) ?? ""),
            material: String(get(["Material", "material", "Material_Text", "Mat"]) ?? ""),
            grain: String(get(["Grain", "grain", "Grain Direction"]) ?? ""),
            width: parseFloat(String(get(["Width", "width", "W"]))) || 0,
            length: parseFloat(String(get(["Length", "length", "L"]))) || 0,
            thickness: parseFloat(String(get(["Thickness", "thickness", "Thk", "Thick"]))) || 0,
            qty: parseInt(String(get(["QTY", "Qty", "qty", "Quantity", "quantity"]))) || 1,
            structure: String(get(["BOM Structure", "Structure", "BOM_Structure", "bom_structure", "Type"]) ?? ""),
          };
        }).filter((r: BomRow) => r.filename || r.part_number);
        allRows.push(...fileRows);
        console.log(`[RfqGenerator] Parsed ${fileRows.length} rows from ${bomFile.name}`,
          `Sample thickness:`, fileRows.slice(0, 3).map(r => r.thickness));
      }

      // Aggregate: merge duplicate parts (same part_number + material + thickness) by summing qty
      const mergeKey = (r: BomRow) => `${r.part_number}||${r.material}||${r.thickness}||${r.structure}`;
      const merged = new Map<string, BomRow>();
      for (const r of allRows) {
        const key = mergeKey(r);
        const existing = merged.get(key);
        if (existing) {
          existing.qty += r.qty;
        } else {
          merged.set(key, { ...r });
        }
      }
      const rows: BomRow[] = Array.from(merged.values());

      const panelItems = rows.filter(r => r.structure === "Normal");
      const sprayItems = rows.filter(r => r.structure === "Normal" && r.material.toLowerCase().includes("finsa"));
      const hardwareItems = rows.filter(r => r.structure === "Purchased");

      const cats: RfqCategory[] = [];
      if (panelItems.length > 0) {
        cats.push({
          key: "panels", label: "Panels", icon: <Package size={14} />,
          sheetLines: calculateSheets(panelItems),
        });
      }
      if (sprayItems.length > 0) {
        cats.push({
          key: "spray", label: "Spray Finish", icon: <Paintbrush size={14} />,
          sprayLines: calculateSprayLines(sprayItems),
        });
      }
      if (hardwareItems.length > 0) {
        const hwLines: HardwareLine[] = hardwareItems.map(r => ({
          part_number: r.part_number, filename: r.filename, qty: r.qty,
        }));
        cats.push({ key: "hardware", label: "Hardware", icon: <Wrench size={14} />, hardwareLines: hwLines });
      }
      setCategories(cats);

      const { data: suppData } = await (supabase.from("cab_suppliers") as any)
        .select("id, name, email, contact_email, supplier_type")
        .eq("company_id", companyId).eq("is_active", true).order("name");

      setSuppliers((suppData || []).map((s: any) => ({
        id: s.id, name: s.name, email: s.email || s.contact_email || "", supplier_type: s.supplier_type,
      })));

      toast({ title: "BOM parsed", description: `${bomFiles.length} BOM file(s) merged → ${rows.length} unique parts. ${cats.length} RFQ categories ready.` });
    } catch (err: any) {
      toast({ title: "RFQ generation failed", description: err.message, variant: "destructive" });
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const getSuppliersForCategory = (catKey: string): Supplier[] => {
    const typeMap: Record<string, string> = { panels: "panel_supplier", spray: "spray_painter", hardware: "hardware" };
    const targetType = typeMap[catKey];
    return suppliers.filter(s => s.supplier_type === targetType || !s.supplier_type);
  };

  const toggleSupplier = (catKey: string, supplierId: string) => {
    setSelectedSuppliers(prev => {
      const newSet = new Set(prev[catKey]);
      if (newSet.has(supplierId)) newSet.delete(supplierId); else newSet.add(supplierId);
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
      const brandColor = catKey === "spray" ? "#7c3aed" : "#2E5FA3";

      for (const supplier of selectedSuppList) {
        if (!supplier.email) continue;

        let tableHtml = "";
        let itemCount = 0;

        if (catKey === "panels" && category.sheetLines) {
          itemCount = category.sheetLines.length;
          const hdr = `<tr style="background:#f3f4f6;"><th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #d1d5db;">Material</th><th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #d1d5db;">Thickness (mm)</th><th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #d1d5db;">Sheets Required</th></tr>`;
          const rows = category.sheetLines.map(l =>
            `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${l.material}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;">${l.thickness}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;font-weight:600;">${l.sheetsRequired}</td></tr>`
          ).join("");
          tableHtml = `<thead>${hdr}</thead><tbody>${rows}</tbody>`;
        } else if (catKey === "spray" && category.sprayLines) {
          itemCount = category.sprayLines.length;
          const hdr = `<tr style="background:#f3f4f6;"><th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #d1d5db;">Material</th><th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #d1d5db;">Thickness (mm)</th><th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #d1d5db;">QTY of Parts</th></tr>`;
          const rows = category.sprayLines.map(l =>
            `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${l.material}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;">${l.thickness}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;font-weight:600;">${l.qty}</td></tr>`
          ).join("");
          tableHtml = `<thead>${hdr}</thead><tbody>${rows}</tbody>`;
        } else if (catKey === "hardware" && category.hardwareLines) {
          itemCount = category.hardwareLines.length;
          const hdr = `<tr style="background:#f3f4f6;"><th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #d1d5db;">Part Number</th><th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #d1d5db;">Filename</th><th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;color:#6b7280;border-bottom:2px solid #d1d5db;">QTY</th></tr>`;
          const rows = category.hardwareLines.map(l =>
            `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${l.part_number}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${l.filename}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;font-weight:600;">${l.qty}</td></tr>`
          ).join("");
          tableHtml = `<thead>${hdr}</thead><tbody>${rows}</tbody>`;
        }

        const categoryLabel = category.label;
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
<table style="width:100%;border-collapse:collapse;margin:16px 0;">${tableHtml}</table>
<p style="font-size:13px;margin:8px 0;color:#6b7280;">Sheet size: 2440 × 1220mm. Quantities include 10% wastage allowance.</p>
<div style="margin:24px 0;padding:16px;background:#f0fdf4;border-radius:6px;border:1px solid #bbf7d0;">
<p style="font-size:13px;margin:0;font-weight:600;">Please reply with:</p>
<ul style="font-size:13px;margin:8px 0 0;padding-left:20px;"><li>Price (ex VAT)</li><li>Lead time (working days)</li><li>Delivery options</li></ul>
</div>
<p style="font-size:13px;color:#6b7280;margin:16px 0 0;">Please provide pricing for the above items by return. Job ref: ${job.job_ref}</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:16px;text-align:center;">
<p style="color:#999;font-size:12px;margin:0;">Enclave Cabinetry | alistair@enclavecabinetry.com | 07944 608098</p>
</td></tr></table></td></tr></table></body></html>`;

        await supabase.functions.invoke("send-email", {
          body: { to: supplier.email, subject: `RFQ - ${job.job_ref} - ${today}`, html, replyTo: "alistair@enclavecabinetry.com" },
        });

        await insertCabEvent({
          companyId, eventType: "rfq.sent", jobId: job.id,
          payload: { supplier_name: supplier.name, supplier_id: supplier.id, category: catKey, item_count: itemCount },
        });
      }

      setSentCategories(prev => new Set([...prev, catKey]));
      toast({ title: `RFQs sent to ${selectedSuppList.filter(s => s.email).length} suppliers`, description: `${category.label} RFQ sent successfully.` });
      onRefresh();
    } catch (err: any) {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    } finally {
      setSending(null);
    }
  };

  const renderCategoryTable = (cat: RfqCategory) => {
    if (cat.key === "panels" && cat.sheetLines) {
      return (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs h-8 px-2">Material</TableHead>
              <TableHead className="text-xs h-8 px-2 text-right">Thickness</TableHead>
              <TableHead className="text-xs h-8 px-2 text-right">Sheets Required</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cat.sheetLines.map((l, i) => (
              <TableRow key={i}>
                <TableCell className="text-xs px-2 py-1">{l.material}</TableCell>
                <TableCell className="text-xs px-2 py-1 text-right font-mono">{l.thickness}mm</TableCell>
                <TableCell className="text-xs px-2 py-1 text-right font-mono font-bold">{l.sheetsRequired}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    }
    if (cat.key === "spray" && cat.sprayLines) {
      return (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs h-8 px-2">Material</TableHead>
              <TableHead className="text-xs h-8 px-2 text-right">Thickness</TableHead>
              <TableHead className="text-xs h-8 px-2 text-right">QTY of Parts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cat.sprayLines.map((l, i) => (
              <TableRow key={i}>
                <TableCell className="text-xs px-2 py-1">{l.material}</TableCell>
                <TableCell className="text-xs px-2 py-1 text-right font-mono">{l.thickness}mm</TableCell>
                <TableCell className="text-xs px-2 py-1 text-right font-mono font-bold">{l.qty}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    }
    if (cat.key === "hardware" && cat.hardwareLines) {
      return (
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs h-8 px-2">Part Number</TableHead>
              <TableHead className="text-xs h-8 px-2">Filename</TableHead>
              <TableHead className="text-xs h-8 px-2 text-right">QTY</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cat.hardwareLines.map((l, i) => (
              <TableRow key={i}>
                <TableCell className="text-xs px-2 py-1">{l.part_number}</TableCell>
                <TableCell className="text-xs px-2 py-1">{l.filename}</TableCell>
                <TableCell className="text-xs px-2 py-1 text-right font-mono font-bold">{l.qty}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    }
    return null;
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={handleGenerateRfq} disabled={loading} className="text-xs">
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
                  </h3>
                  {isSent && <Badge className="bg-emerald-600 text-white text-[10px]">✔ Sent</Badge>}
                </div>

                <div className="rounded-md border border-border overflow-hidden">
                  {renderCategoryTable(cat)}
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-foreground">Select suppliers:</p>
                  {catSuppliers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No suppliers found. Add suppliers with the correct type on the Suppliers page.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      {catSuppliers.map(s => (
                        <label key={s.id} className="flex items-center gap-2 p-1.5 rounded border border-border hover:bg-muted/30 cursor-pointer text-xs">
                          <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggleSupplier(cat.key, s.id)} />
                          <span className="font-medium">{s.name}</span>
                          {s.supplier_type && <Badge variant="outline" className="text-[9px]">{s.supplier_type.replace(/_/g, " ")}</Badge>}
                          {!s.email && <span className="text-destructive text-[10px]">no email</span>}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <Button size="sm" onClick={() => handleSendRfq(cat.key)} disabled={sending !== null || selected.size === 0 || isSent} className="text-xs">
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
