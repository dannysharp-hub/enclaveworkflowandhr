import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Admin = ReturnType<typeof createClient>;

interface DriveFile {
  id: string;
  name: string;
  webViewLink?: string;
  modifiedTime?: string;
  mimeType?: string;
}

const DEFAULT_IGNORE = [
  "^_",
  "^Inventor Admin$",
  "test",
  "sample",
  "template",
  "^008_WorkshopLayout$",
  "^021_Website$",
];

/* ─────────────────────────── Google helpers ─────────────────────────── */

async function getAccessToken(admin: Admin, tenantId: string): Promise<string> {
  const { data: tokenRow } = await admin
    .from("google_oauth_tokens")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!tokenRow) throw new Error("No Google tokens found. Please reconnect Google Drive in settings.");

  const expiresAt = new Date(tokenRow.expires_at as string);
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return atob(tokenRow.access_token_encrypted as string);
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: atob(tokenRow.refresh_token_encrypted as string),
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Google token refresh failed [${res.status}]: ${data.error_description || data.error || JSON.stringify(data)}`,
    );
  }

  await admin.from("google_oauth_tokens").update({
    access_token_encrypted: btoa(data.access_token),
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }).eq("tenant_id", tenantId);

  return data.access_token as string;
}

async function driveList(accessToken: string, query: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | null = null;

  do {
    let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}` +
      `&fields=nextPageToken,files(id,name,webViewLink,modifiedTime,mimeType)&pageSize=1000` +
      `&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const raw = await res.text();
    let data: any = {};
    try { data = JSON.parse(raw); } catch { /* non-JSON body */ }
    if (!res.ok) {
      const message = data?.error?.message || raw || res.statusText;
      throw new Error(`Google Drive API error [${res.status}]: ${message}`);
    }
    files.push(...((data.files || []) as DriveFile[]));
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return files;
}

/** Export a Google Sheet as CSV (first tab). Drive scope only — no Sheets API. */
async function exportCsv(accessToken: string, fileId: string): Promise<string> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text%2Fcsv&supportsAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try { message = JSON.parse(text)?.error?.message || text; } catch { /* plain body */ }
    throw new Error(`Google Drive export error [${res.status}]: ${message}`);
  }
  return text;
}

/** Export every tab, via xlsx, when the first tab does not hold the costing tables. */
async function exportAllTabs(accessToken: string, fileId: string): Promise<{ tab: string; rows: string[][] }[]> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}/export` +
    `?mimeType=${encodeURIComponent("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}` +
    `&supportsAllDrives=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try { message = JSON.parse(text)?.error?.message || text; } catch { /* plain body */ }
    throw new Error(`Google Drive export error [${res.status}]: ${message}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  const wb = XLSX.read(buf, { type: "array" });
  return wb.SheetNames.map((name) => ({
    tab: name,
    rows: (XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: true, raw: false }) as unknown[][])
      .map((r) => (r || []).map((c) => (c == null ? "" : String(c)))),
  }));
}

/* ─────────────────────────── CSV / number parsing ─────────────────────────── */

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ",") { row.push(cell); cell = ""; continue; }
    if (ch === "\r") continue;
    if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const norm = (s: unknown) => String(s ?? "").replace(/\u00a0/g, " ").trim();
const lc = (s: unknown) => norm(s).toLowerCase();

/**
 * Accounting-formatted currency to number:
 * "£ 1,790.00" → 1790, "£ -" → 0, "(£120)" → -120, "" → null.
 */
function parseNum(raw: unknown): number | null {
  let s = norm(raw);
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || s.includes("-") && /^[^0-9]*-\s*[0-9]/.test(s);
  s = s.replace(/[()]/g, "");
  const stripped = s.replace(/[£$€\s,]/g, "");
  if (stripped === "" || stripped === "-" || stripped === "–" || stripped === "—") return 0;
  const m = stripped.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  let n = parseFloat(m[0]);
  if (negative && n > 0) n = -n;
  return Number.isFinite(n) ? n : null;
}

function parsePercent(raw: unknown): number | null {
  const s = norm(raw);
  if (!s) return null;
  const n = parseNum(s.replace("%", ""));
  return n;
}

function parseDate(raw: unknown): string | null {
  const s = norm(raw);
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  m = s.match(/^\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

/* ─────────────────────────── Table parsing ─────────────────────────── */

const CATEGORIES = [
  "time",
  "material (units)",
  "hardware",
  "fixings",
  "doors",
  "drawer boxes",
  "mirror / glass",
  "misc / add ons",
  "packaging",
];

interface PurchasingLine {
  description: string;
  unit_price: number | null;
  qty: number | null;
  line_total: number | null;
  supplier: string | null;
  product_url: string | null;
  due_date: string | null;
}

interface Extracted {
  quoted_total: number | null;
  cost_total: number | null;
  profit_total: number | null;
  materials_subtotal: number | null;
  labour_total: number | null;
  hardware_total: number | null;
  fixings_total: number | null;
  section_totals: Record<string, number>;
  purchasing_lines: PurchasingLine[];
  found_purchasing_table: boolean;
  found_costing_table: boolean;
}

function findHeaderRow(rows: string[][], needles: string[]): number {
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map(lc);
    if (needles.every((n) => cells.some((c) => c === n || c.includes(n)))) return i;
  }
  return -1;
}

function colIndex(headerRow: string[], names: string[]): number {
  const cells = headerRow.map(lc);
  for (const n of names) {
    const exact = cells.indexOf(n);
    if (exact !== -1) return exact;
  }
  for (const n of names) {
    const partial = cells.findIndex((c) => c && c.includes(n));
    if (partial !== -1) return partial;
  }
  return -1;
}

function parsePurchasing(rows: string[][]): { lines: PurchasingLine[]; found: boolean } {
  const h = findHeaderRow(rows, ["description", "price", "qty"]);
  if (h === -1) return { lines: [], found: false };

  const header = rows[h];
  const cDesc = colIndex(header, ["description"]);
  const cPrice = colIndex(header, ["price"]);
  const cQty = colIndex(header, ["qty", "quantity"]);
  const cTotal = colIndex(header, ["total"]);
  const cSupplier = colIndex(header, ["supplier"]);
  const cLink = colIndex(header, ["link", "url"]);
  const cDue = colIndex(header, ["due date", "due"]);

  const lines: PurchasingLine[] = [];
  let blankStreak = 0;

  for (let i = h + 1; i < rows.length; i++) {
    const row = rows[i];
    const desc = cDesc >= 0 ? norm(row[cDesc]) : "";
    const joined = row.map(norm).join("").trim();

    if (!joined) {
      blankStreak++;
      if (blankStreak >= 3) break;
      continue;
    }
    blankStreak = 0;

    // Subtotal / next-table markers end this table
    if (/subtotal|sub total|total cost|total sell|profit/.test(lc(desc))) break;
    if (row.map(lc).some((c) => CATEGORIES.includes(c))) break;

    const qty = cQty >= 0 ? parseNum(row[cQty]) : null;
    // Blank description or zero/blank qty = unused priced option, not a purchase
    if (!desc) continue;
    if (qty === null || qty === 0) continue;

    lines.push({
      description: desc,
      unit_price: cPrice >= 0 ? parseNum(row[cPrice]) : null,
      qty,
      line_total: cTotal >= 0 ? parseNum(row[cTotal]) : null,
      supplier: cSupplier >= 0 ? (norm(row[cSupplier]) || null) : null,
      product_url: cLink >= 0 ? (norm(row[cLink]) || null) : null,
      due_date: cDue >= 0 ? parseDate(row[cDue]) : null,
    });
  }

  return { lines, found: true };
}

function lastNumberOnRow(row: string[], from = 0): number | null {
  for (let i = row.length - 1; i >= from; i--) {
    const n = parseNum(row[i]);
    if (n !== null && norm(row[i]) !== "") return n;
  }
  return null;
}

function parseCosting(rows: string[][]): Partial<Extracted> {
  const h = findHeaderRow(rows, ["item", "markup"]);
  const out: Partial<Extracted> = { section_totals: {} };
  if (h === -1) return { ...out, found_costing_table: false };

  const header = rows[h];
  const cItem = colIndex(header, ["item"]);
  const cTotalCost = colIndex(header, ["total cost"]);
  const cTotal = header.map(lc).lastIndexOf("total");
  const cCategory = Math.max(0, cItem - 1);

  const sectionTotals: Record<string, number> = {};
  let currentSection: string | null = null;
  let quoted: number | null = null;
  let costTotal: number | null = null;
  let profit: number | null = null;

  for (let i = h + 1; i < rows.length; i++) {
    const row = rows[i];
    const cells = row.map(lc);
    const joined = cells.join("").trim();
    if (!joined) continue;

    const catCell = lc(row[cCategory]);
    const catMatch = CATEGORIES.find((c) => catCell === c || (catCell && c.startsWith(catCell) && catCell.length > 3));
    if (catMatch) currentSection = catMatch;

    // Grand totals
    if (cells.some((c) => c.includes("total sell") || c.includes("total quote"))) {
      quoted = quoted ?? lastNumberOnRow(row, cItem + 1);
      continue;
    }
    if (cells.some((c) => /^total cost$/.test(c.trim()) || c.includes("total cost of"))) {
      const n = lastNumberOnRow(row, cItem + 1);
      if (n !== null && !cells.includes("total cost")) costTotal = costTotal ?? n;
      else if (n !== null && i > h + 1) costTotal = costTotal ?? n;
      continue;
    }
    if (cells.some((c) => c.includes("profit"))) {
      profit = profit ?? lastNumberOnRow(row, cItem + 1);
      continue;
    }

    if (!currentSection) continue;
    const item = cItem >= 0 ? norm(row[cItem]) : "";
    if (/total/.test(lc(item))) continue;

    const cost = cTotalCost >= 0 ? parseNum(row[cTotalCost]) : null;
    if (cost !== null) {
      sectionTotals[currentSection] = (sectionTotals[currentSection] ?? 0) + cost;
    }
  }

  // Fall back to summing the marked-up Total column for the quote when absent
  if (quoted === null && cTotal >= 0) {
    let sum = 0;
    let any = false;
    for (let i = h + 1; i < rows.length; i++) {
      const cells = rows[i].map(lc);
      if (cells.some((c) => c.includes("profit") || c.includes("total sell"))) continue;
      const n = parseNum(rows[i][cTotal]);
      const item = cItem >= 0 ? lc(rows[i][cItem]) : "";
      if (n !== null && item && !/total/.test(item)) { sum += n; any = true; }
    }
    if (any) quoted = sum;
  }

  if (costTotal === null) {
    const vals = Object.values(sectionTotals);
    if (vals.length) costTotal = vals.reduce((a, b) => a + b, 0);
  }
  if (profit === null && quoted !== null && costTotal !== null) profit = quoted - costTotal;

  return {
    section_totals: sectionTotals,
    quoted_total: quoted,
    cost_total: costTotal,
    profit_total: profit,
    labour_total: sectionTotals["time"] ?? null,
    materials_subtotal: sectionTotals["material (units)"] ?? null,
    hardware_total: sectionTotals["hardware"] ?? null,
    fixings_total: sectionTotals["fixings"] ?? null,
    found_costing_table: true,
  };
}

function extractFromRows(rows: string[][]): Extracted {
  const purchasing = parsePurchasing(rows);
  const costing = parseCosting(rows);
  return {
    quoted_total: costing.quoted_total ?? null,
    cost_total: costing.cost_total ?? null,
    profit_total: costing.profit_total ?? null,
    materials_subtotal: costing.materials_subtotal ?? null,
    labour_total: costing.labour_total ?? null,
    hardware_total: costing.hardware_total ?? null,
    fixings_total: costing.fixings_total ?? null,
    section_totals: costing.section_totals ?? {},
    purchasing_lines: purchasing.lines,
    found_purchasing_table: purchasing.found,
    found_costing_table: !!costing.found_costing_table,
  };
}

/* ─────────────────────────── Matching helpers ─────────────────────────── */

const leadingNumber = (name: string) => {
  const m = norm(name).match(/^(\d{3})/);
  return m ? m[1] : null;
};

const nameTokens = (name: string) =>
  lc(name)
    .replace(/^\d{3}/, "")
    .replace(/costing|job/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);

function fuzzyScore(a: string, b: string): number {
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  if (!ta.size || !tb.size) return 0;
  let hits = 0;
  for (const t of ta) if (tb.has(t)) hits++;
  return hits / Math.max(ta.size, tb.size);
}

function isIgnored(name: string, patterns: string[]): boolean {
  const n = norm(name);
  return patterns.some((p) => {
    try { return new RegExp(p, "i").test(n); } catch { return n.toLowerCase().includes(p.toLowerCase()); }
  });
}

/* ─────────────────────────── Extraction run ─────────────────────────── */

interface RunResult {
  tenant_id: string;
  company_id: string | null;
  folders_scanned: number;
  staged: number;
  not_found: number;
  ambiguous: number;
  unmatched_jobs: number;
  errors: string[];
}

async function extractTenant(admin: Admin, tenantId: string): Promise<RunResult> {
  const result: RunResult = {
    tenant_id: tenantId,
    company_id: null,
    folders_scanned: 0,
    staged: 0,
    not_found: 0,
    ambiguous: 0,
    unmatched_jobs: 0,
    errors: [],
  };

  const { data: settings } = await admin
    .from("google_drive_integration_settings")
    .select("is_connected, jobs_folder_id, sync_ignore_patterns")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!settings?.is_connected) {
    result.errors.push("Google Drive is not connected.");
    return result;
  }
  if (!settings.jobs_folder_id) {
    result.errors.push("No Jobs folder configured. Set the Jobs folder in Google Drive settings.");
    return result;
  }
  const ignorePatterns = ((settings.sync_ignore_patterns as string[] | null) || DEFAULT_IGNORE);

  const { data: map } = await admin
    .from("cab_company_tenant_map").select("company_id").eq("tenant_id", tenantId).maybeSingle();
  if (!map?.company_id) {
    result.errors.push("No cabinetry company is mapped to this workspace.");
    return result;
  }
  const companyId = map.company_id as string;
  result.company_id = companyId;

  let accessToken: string;
  let folders: DriveFile[];
  let treeSheets: DriveFile[] = [];
  try {
    accessToken = await getAccessToken(admin, tenantId);
    folders = await driveList(
      accessToken,
      `'${settings.jobs_folder_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    );
    // Costing sheets anywhere the account can see — some have been moved out of their folder
    treeSheets = await driveList(
      accessToken,
      `mimeType='application/vnd.google-apps.spreadsheet' and name contains 'osting' and trashed=false`,
    );
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
    return result;
  }

  folders = folders.filter((f) => !isIgnored(f.name || "", ignorePatterns));
  result.folders_scanned = folders.length;

  const { data: dbJobs, error: jobsErr } = await admin
    .from("cab_jobs").select("id, job_ref").eq("company_id", companyId);
  if (jobsErr) {
    result.errors.push(`Could not load jobs: ${jobsErr.message}`);
    return result;
  }
  const jobs = (dbJobs || []) as { id: string; job_ref: string | null }[];

  for (const folder of folders) {
    const folderName = norm(folder.name);
    if (!folderName) continue;
    const folderUrl = folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`;
    const prefix = leadingNumber(folderName);

    // ── locate the job for this folder (full folder name is the key) ──
    let jobId: string | null = null;
    let matchNote: string | null = null;
    const exact = jobs.filter((j) => lc(j.job_ref) === lc(folderName));
    if (exact.length === 1) {
      jobId = exact[0].id;
    } else {
      const byPrefix = prefix ? jobs.filter((j) => leadingNumber(j.job_ref || "") === prefix) : [];
      if (byPrefix.length === 1) {
        jobId = byPrefix[0].id;
      } else if (byPrefix.length > 1) {
        const scored = byPrefix
          .map((j) => ({ j, s: fuzzyScore(folderName, j.job_ref || "") }))
          .sort((a, b) => b.s - a.s);
        if (scored[0].s >= 0.5 && (scored[1]?.s ?? 0) < scored[0].s) jobId = scored[0].j.id;
        else matchNote = `Job number ${prefix} matches ${byPrefix.length} jobs — needs review.`;
      } else {
        matchNote = "No job in Cabinetry Command matches this folder.";
      }
    }

    // ── locate the costing sheet: folder first, then anywhere ──
    let candidates: DriveFile[] = [];
    try {
      const inFolder = await driveList(
        accessToken,
        `'${folder.id}' in parents and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
      );
      candidates = inFolder.filter((f) =>
        lc(f.name).includes("costing") && (!prefix || leadingNumber(f.name) === prefix)
      );
      if (!candidates.length && prefix) {
        candidates = treeSheets.filter((f) =>
          lc(f.name).includes("costing") && leadingNumber(f.name) === prefix
        );
      }
    } catch (err) {
      result.errors.push(`${folderName}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    if (!candidates.length) {
      result.not_found++;
      await admin.from("cab_costing_extractions").upsert({
        company_id: companyId,
        job_id: jobId,
        folder_name: folderName,
        folder_id: folder.id,
        folder_url: folderUrl,
        status: "not_found",
        error: matchNote,
        source_modified_at: null,
      }, { onConflict: "company_id,folder_name,source_modified_at", ignoreDuplicates: true });
      continue;
    }

    candidates.sort((a, b) => (b.modifiedTime || "").localeCompare(a.modifiedTime || ""));
    const chosen = candidates[0];
    const others = candidates.slice(1).map((f) => ({
      id: f.id,
      name: f.name,
      modified: f.modifiedTime,
      url: f.webViewLink,
    }));
    if (others.length) result.ambiguous++;

    // ── read and parse ──
    let extracted: Extracted | null = null;
    let usedTab = "Sheet 1";
    let parseError: string | null = null;
    try {
      const csv = await exportCsv(accessToken, chosen.id);
      const rows = parseCsv(csv);
      const first = extractFromRows(rows);
      if (first.found_costing_table) {
        extracted = first;
      } else {
        const tabs = await exportAllTabs(accessToken, chosen.id);
        for (const t of tabs) {
          const e = extractFromRows(t.rows);
          if (e.found_costing_table) { extracted = e; usedTab = t.tab; break; }
        }
        if (!extracted) parseError = "No costing table found in any tab of this sheet.";
      }
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }

    const notes = [matchNote, parseError].filter(Boolean).join(" ");
    const { error: upErr } = await admin.from("cab_costing_extractions").upsert({
      company_id: companyId,
      job_id: jobId,
      folder_name: folderName,
      folder_id: folder.id,
      folder_url: folderUrl,
      source_file_id: chosen.id,
      source_filename: chosen.name,
      source_modified_at: chosen.modifiedTime || null,
      source_tab: usedTab,
      extracted: extracted
        ? {
            quoted_total: extracted.quoted_total,
            cost_total: extracted.cost_total,
            profit_total: extracted.profit_total,
            materials_subtotal: extracted.materials_subtotal,
            labour_total: extracted.labour_total,
            hardware_total: extracted.hardware_total,
            fixings_total: extracted.fixings_total,
            section_totals: extracted.section_totals,
          }
        : {},
      purchasing_lines: extracted?.purchasing_lines ?? [],
      ambiguous_files: others,
      status: extracted ? "pending" : "error",
      error: notes || null,
    }, { onConflict: "company_id,folder_name,source_modified_at", ignoreDuplicates: false });

    if (upErr) result.errors.push(`${folderName}: ${upErr.message}`);
    else result.staged++;
  }

  return result;
}

/* ─────────────────────────── Commit ─────────────────────────── */

async function commitExtraction(admin: Admin, companyId: string, extractionId: string, userId: string) {
  const { data: row, error } = await admin
    .from("cab_costing_extractions")
    .select("*")
    .eq("id", extractionId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) throw new Error("Extraction not found.");
  if (!row.job_id) throw new Error("This folder is not linked to a job yet.");

  const e = (row.extracted || {}) as Record<string, number | null>;
  const nowIso = new Date().toISOString();

  const { error: jobErr } = await admin.from("cab_jobs").update({
    quoted_total: e.quoted_total ?? null,
    cost_total: e.cost_total ?? null,
    profit_total: e.profit_total ?? null,
    materials_subtotal: e.materials_subtotal ?? null,
    labour_total: e.labour_total ?? null,
    hardware_total: e.hardware_total ?? null,
    fixings_total: e.fixings_total ?? null,
    costing_extracted_at: nowIso,
    costing_source_filename: row.source_filename,
  }).eq("id", row.job_id);
  if (jobErr) throw new Error(`Could not update job: ${jobErr.message}`);

  const lines = (row.purchasing_lines || []) as PurchasingLine[];
  let written = 0;
  if (lines.length) {
    const payload = lines.map((l) => ({
      job_id: row.job_id,
      company_id: companyId,
      description: l.description,
      unit_price: l.unit_price,
      qty: l.qty,
      line_total: l.line_total,
      supplier: l.supplier,
      product_url: l.product_url,
      due_date: l.due_date,
      source_filename: row.source_filename,
      updated_at: nowIso,
    }));
    const { error: lineErr } = await admin
      .from("cab_job_purchasing_lines")
      .upsert(payload, { onConflict: "job_id,line_hash" });
    if (lineErr) throw new Error(`Could not write purchasing lines: ${lineErr.message}`);
    written = payload.length;
  }

  await admin.from("cab_costing_extractions").update({
    status: "approved",
    reviewed_by: userId,
    reviewed_at: nowIso,
    updated_at: nowIso,
  }).eq("id", extractionId);

  return { job_id: row.job_id, purchasing_lines: written };
}

/* ─────────────────────────── Entry point ─────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const authHeader = req.headers.get("Authorization");
    const hasUserToken = !!authHeader?.startsWith("Bearer ") &&
      authHeader.replace("Bearer ", "") !== Deno.env.get("SUPABASE_ANON_KEY");

    // Scheduled run: stage only, never commit
    if (body.scheduled === true || !hasUserToken) {
      const { data: tenants } = await admin
        .from("google_drive_integration_settings").select("tenant_id").eq("is_connected", true);
      const results: RunResult[] = [];
      for (const t of (tenants || []) as { tenant_id: string }[]) {
        results.push(await extractTenant(admin, t.tenant_id));
      }
      return json({
        ok: true,
        mode: "scheduled",
        tenants: results.length,
        staged: results.reduce((n, r) => n + r.staged, 0),
        not_found: results.reduce((n, r) => n + r.not_found, 0),
        ambiguous: results.reduce((n, r) => n + r.ambiguous, 0),
        errors: results.flatMap((r) => r.errors),
        results,
      });
    }

    const token = authHeader!.replace("Bearer ", "");
    const authed = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader! } } },
    );
    const { data: claimsData, error: authError } = await authed.auth.getClaims(token);
    if (authError || !claimsData?.claims) return json({ ok: false, error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    const { data: profile } = await admin
      .from("profiles").select("tenant_id").eq("user_id", userId).maybeSingle();
    if (!profile?.tenant_id) return json({ ok: false, error: "No workspace found for this account." }, 400);

    const { data: roleRows } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const roles = ((roleRows || []) as { role: string }[]).map((r) => r.role);
    if (!roles.some((r) => ["admin", "super_admin", "supervisor"].includes(r))) {
      return json({ ok: false, error: "Admin or supervisor required." }, 403);
    }

    if (body.action === "commit") {
      const { data: map } = await admin
        .from("cab_company_tenant_map").select("company_id").eq("tenant_id", profile.tenant_id).maybeSingle();
      if (!map?.company_id) return json({ ok: false, error: "No cabinetry company mapped to this workspace." }, 400);
      if (!body.extraction_id) return json({ ok: false, error: "extraction_id is required." }, 400);
      const out = await commitExtraction(admin, map.company_id as string, String(body.extraction_id), userId);
      return json({ ok: true, ...out });
    }

    const result = await extractTenant(admin, profile.tenant_id as string);
    return json({
      ok: result.errors.length === 0,
      mode: "manual",
      folders_scanned: result.folders_scanned,
      staged: result.staged,
      not_found: result.not_found,
      ambiguous: result.ambiguous,
      errors: result.errors,
      error: result.errors[0] || null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[extract-drive-costing] failure:", message);
    return json({ ok: false, error: message, errors: [message] });
  }
});
