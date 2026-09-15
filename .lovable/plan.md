# Costing extraction from Drive

Pull the costing spreadsheet numbers out of each job folder in Drive, hold them in a staging area, show you a per-job diff, and only write to the job after you approve.

## Core rule

Files are found by searching (folder + filename pattern) every time extraction runs. No per-file index, no reliance on stored Drive file IDs. A file ID may be kept as a convenience link only; if it fails, the file is re-found by name.

## Finding the costing sheet

- A Google Sheet whose title contains "costing" (any case) AND whose leading 3-digit number matches the job folder's leading 3-digit number.
- Search the job folder first; if nothing matches, search the whole `_Jobs` tree by the same rule (covers sheets moved out of their folder, e.g. 061, 095).
- Several matches: take the most recently modified and record the rest as "ambiguous" on the result so they show in review. Never a silent pick.
- Job numbers repeat (067, 044, 011, 015, 065). No unique constraint on job number anywhere; the full folder name is the key. If a number matches two jobs, also require a fuzzy match on the name part; still ambiguous means flagged for review, never guessed.

## What gets read

Table 1 (purchasing): Description, Price, Qty, Total, Supplier, Link, Due Date — one row each.

Table 2 (costing): category rows (Time, Material (Units), Hardware, Fixings, Doors, Drawer Boxes, Mirror / Glass, Misc / Add Ons, Packaging) with Item, Cost, Qty, Total Cost, Markup, Total — plus total cost, total sell, Profit.

Stored on the job: quoted total, cost total, profit, materials subtotal (Time section total), labour total, extracted-at timestamp, source filename. Values only — never references.

## Ignore list

Editable in settings (not hardcoded), seeded with: folders starting with `_`, "Inventor Admin", names matching test/sample/template, `008_WorkshopLayout`, `021_Website`. Applied to both the sync and the review queue.

## Review then commit

Extraction writes to staging. Review screen shows per job: file used, values found, what will be written, any ambiguity, and a warning wherever a value would overwrite an existing non-null one. Approve per job to commit. Re-running never duplicates purchasing rows.

## Technical notes

- Migration:
  - `cab_jobs`: add nullable `quoted_total`, `cost_total`, `profit_total`, `materials_subtotal`, `labour_total`, `costing_extracted_at`, `costing_source_filename`.
  - New `cab_job_purchasing_lines` (job_id, description, unit_price, qty, line_total, supplier, product_url, due_date) with UNIQUE (job_id, description, supplier) for upsert.
  - New `cab_costing_extractions` staging table: company_id, job_id (nullable), folder_name, folder_id, source_file_id, source_filename, source_modified_at, extracted values as jsonb, purchasing lines as jsonb, ambiguous_files jsonb, status (pending / approved / rejected / error), error text, reviewed_by/at. UNIQUE (company_id, folder_name).
  - `google_drive_integration_settings`: add `sync_ignore_patterns` text[] seeded with the list above.
  - GRANTs + RLS mirroring existing cab tables (member select, admin write, service_role all).
- New edge function `extract-drive-costing`: search-based file discovery via Drive `files.list` with pagination, read values through the Sheets API `values:batchGet`, parse both tables by header detection rather than fixed cell addresses, write staging rows. Real Google status + error body returned in the JSON response, never an uncaught throw. Same admin/super_admin/supervisor check as `drive-folder-sync`.
- New edge action `commit-costing-extraction` (same function, `action: "commit"`): writes approved staging rows to `cab_jobs` and upserts purchasing lines on the unique key.
- UI: new "Costing Review" section on the Approvals page (staging diff cards, per-job Approve / Reject, ambiguity and overwrite warnings); "Extract costings" button next to "Sync now" on the Jobs page; ignore-list editor in Google Drive settings.
- Out of scope, untouched: `drive_file_index`, `drive_sync_queue`, `google-drive-webhook`.
- Nightly pg_cron extraction into staging only (no auto-commit) once the manual path is verified.
