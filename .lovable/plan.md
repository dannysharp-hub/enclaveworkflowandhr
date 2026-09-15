# Costing extraction from Drive

Pull the costing spreadsheet numbers out of each job folder in Drive, hold them in a staging area, show you a per-job diff, and only write to the job after you approve.

## Core rule

Files are found by searching (folder + filename pattern) every time extraction runs. No per-file index, no reliance on stored Drive file IDs. A file ID may be kept as a convenience link only; if it fails, the file is re-found by name.

## Finding the costing sheet

- A Google Sheet whose title contains "costing" (any case) AND whose leading 3-digit number matches the job folder's leading 3-digit number.
- Search the job folder first; if nothing matches, search the whole `_Jobs` tree by the same rule (covers sheets moved out of their folder, e.g. 061, 095).
- Some sheets sit outside the `_Jobs` tree entirely (095_Hibbet - Job Costing is at the Drive root). When nothing is found, the job gets a "no costing sheet found" status — not an error.
- Several matches: take the most recently modified and record the rest as "ambiguous" on the result so they show in review. Never a silent pick.
- Job numbers repeat (067, 044, 011, 015, 065). No unique constraint on job number anywhere; the full folder name is the key. If a number matches two jobs, also require a fuzzy match on the name part; still ambiguous means flagged for review, never guessed.

## Reading the sheet

The saved Google permission covers Drive only, not Sheets. So each sheet is exported as CSV through Drive's export (`text/csv`) and the CSV is parsed. Multi-tab sheets: export each tab and detect which one holds the costing tables.

Currency cells are accounting-formatted — `£ 1,790.00`, `£ -`, non-breaking spaces, comma thousands separators. All parsed to numbers; `£ -` is zero, not blank.

## What gets read

Table 1 (purchasing): Description, Price, Qty, Total, Supplier, Link, Due Date — one row each. Rows with a blank description, or a blank/zero quantity, are skipped: those are unused priced options, not purchases.

Table 2 (costing): category rows (Time, Material (Units), Hardware, Fixings, Doors, Drawer Boxes, Mirror / Glass, Misc / Add Ons, Packaging) with Item, Cost, Qty, Total Cost, Markup, Total — plus total cost, total sell, Profit.

Stored on the job: quoted total, cost total, profit, materials subtotal (from the **Material (Units)** section), labour total (from the **Time** section: Pre Sale + Design, CNC Time, Dry Fit, Delivery, Install Time), hardware total, fixings total, extracted-at timestamp, source filename. Values only — never references.

## Ignore list

Editable in settings (not hardcoded), seeded with: folders starting with `_`, "Inventor Admin", names matching test/sample/template, `008_WorkshopLayout`, `021_Website`. Applied to both the sync and the review queue.

## Review then commit

Extraction writes to staging. Review screen shows per job: file used, values found, what will be written, any ambiguity, and a warning wherever a value would overwrite an existing non-null one. Approve per job to commit. Re-running never duplicates purchasing rows.

Re-extraction after approval: if a job's staging row is already approved and the source sheet has changed since it was read, a new pending revision row is created — the approved one is never overwritten and nothing errors. The review screen shows it as a change against the committed values.

## Technical notes

- Migration:
  - `cab_jobs`: add nullable `quoted_total`, `cost_total`, `profit_total`, `materials_subtotal`, `labour_total`, `hardware_total`, `fixings_total`, `costing_extracted_at`, `costing_source_filename`.
  - New `cab_job_purchasing_lines` (job_id, description, unit_price, qty, line_total, supplier, product_url, due_date, `line_hash` generated from normalised description + supplier + unit_price) with UNIQUE (job_id, line_hash) for upsert — avoids the NULL-distinct problem.
  - New `cab_costing_extractions` staging table: company_id, job_id (nullable), folder_name, folder_id, source_file_id, source_filename, source_modified_at, extracted values as jsonb, purchasing lines as jsonb, ambiguous_files jsonb, status (pending / approved / rejected / not_found / error), error text, reviewed_by/at. UNIQUE (company_id, folder_name, source_modified_at) so revisions coexist.
  - `google_drive_integration_settings`: add `sync_ignore_patterns` text[] seeded with the list above.
  - GRANTs + RLS mirroring existing cab tables (member select, admin write, service_role all).
- New edge function `extract-drive-costing`: search-based file discovery via Drive `files.list` with pagination, sheet content via Drive `files/{id}/export?mimeType=text/csv` (no Sheets API, no re-consent), table parsing by header/section detection rather than fixed cell addresses, staging writes. Real Google status + error body returned in the JSON response, never an uncaught throw. Same admin/super_admin/supervisor check as `drive-folder-sync`.
- Commit action on the same function (`action: "commit"`): writes an approved staging row to `cab_jobs` and upserts purchasing lines on (job_id, line_hash).
- UI: new "Costing Review" section on the Approvals page (staging diff cards, per-job Approve / Reject, ambiguity, overwrite and revision warnings); "Extract costings" button next to "Sync now" on the Jobs page; ignore-list editor in Google Drive settings.
- Out of scope, untouched: `drive_file_index`, `drive_sync_queue`, `google-drive-webhook`.
- Nightly pg_cron extraction into staging only (no auto-commit) once the manual path is verified.
