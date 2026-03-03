import { supabase } from "@/integrations/supabase/client";

export interface QueuePressureResult {
  queuedHours: number;
  dailyCapacityHours: number;
  partialStartMultiplier: number;
  partialStartAllowed: boolean;
  pressureLevel: "low" | "medium" | "high";
  sheetCount: number;
}

/**
 * Calculate CNC queue pressure based on calibrated estimated minutes
 * from job_sheets where the CNC stage is "Ready" / "Not Started" and not completed.
 */
export async function calculateCncQueuePressure(tenantId: string): Promise<QueuePressureResult> {
  // 1. Get all sheets for jobs where CNC stage is queued (Ready / Not Started) and sheet not completed
  const { data: sheets } = await supabase
    .from("job_sheets")
    .select("id, vc_estimated_minutes_calibrated, vc_estimated_minutes_raw, cnc_completed_at, job_id")
    .is("cnc_completed_at", null)
    .not("vc_estimated_minutes_calibrated", "is", null);

  // 2. Cross-reference with job_stages to only include CNC stages that are queued
  const jobIds = [...new Set((sheets ?? []).map(s => (s as any).job_id))];
  
  let queuedSheets = sheets ?? [];
  if (jobIds.length > 0) {
    const { data: stages } = await supabase
      .from("job_stages")
      .select("job_id, status")
      .eq("stage_name", "CNC")
      .in("status", ["Not Started", "In Progress"])
      .in("job_id", jobIds);

    const queuedJobIds = new Set((stages ?? []).map((s: any) => s.job_id));
    queuedSheets = queuedSheets.filter(s => queuedJobIds.has((s as any).job_id));
  }

  const totalMinutes = queuedSheets.reduce((sum, s) => {
    return sum + Number((s as any).vc_estimated_minutes_calibrated || (s as any).vc_estimated_minutes_raw || 0);
  }, 0);
  const queuedHours = totalMinutes / 60;

  // 3. Get tenant settings
  const { data: settings } = await supabase
    .from("payroll_settings")
    .select("daily_cnc_capacity_hours, partial_start_threshold_multiplier")
    .single();

  const dailyCapacityHours = Number((settings as any)?.daily_cnc_capacity_hours ?? 8);
  const partialStartMultiplier = Number((settings as any)?.partial_start_threshold_multiplier ?? 1.5);
  const threshold = dailyCapacityHours * partialStartMultiplier;
  const partialStartAllowed = queuedHours < threshold;

  const pressureLevel: "low" | "medium" | "high" =
    queuedHours < dailyCapacityHours ? "low" :
    queuedHours < threshold ? "medium" : "high";

  return {
    queuedHours: Math.round(queuedHours * 10) / 10,
    dailyCapacityHours,
    partialStartMultiplier,
    partialStartAllowed,
    pressureLevel,
    sheetCount: queuedSheets.length,
  };
}

/**
 * Look up calibration scale factor for a given context.
 */
export async function getCalibrationFactor(
  tenantId: string,
  machineId: string = "Fabertec M1",
  postProcessor?: string | null,
  materialKey?: string | null,
): Promise<number> {
  let query = supabase
    .from("cnc_time_calibration")
    .select("scale_factor")
    .eq("machine_id", machineId);

  if (postProcessor) {
    query = query.eq("post_processor_name", postProcessor);
  }
  if (materialKey) {
    query = query.eq("material_key", materialKey);
  }

  const { data } = await query.limit(1).maybeSingle();
  return Number((data as any)?.scale_factor ?? 1.0);
}

/**
 * Update calibration factor using exponential moving average when actual times come in.
 */
export async function updateCalibrationFromActual(
  tenantId: string,
  machineId: string,
  rawMinutes: number,
  actualMinutes: number,
  postProcessor?: string | null,
  materialKey?: string | null,
): Promise<void> {
  if (rawMinutes <= 0 || actualMinutes <= 0) return;

  const ratio = actualMinutes / rawMinutes;

  // Fetch existing calibration
  let query = supabase
    .from("cnc_time_calibration")
    .select("*")
    .eq("machine_id", machineId);

  if (postProcessor) query = query.eq("post_processor_name", postProcessor);
  if (materialKey) query = query.eq("material_key", materialKey);

  const { data: existing } = await query.limit(1).maybeSingle();

  if (existing) {
    const ex = existing as any;
    const oldFactor = Number(ex.scale_factor);
    const samples = Number(ex.sample_count);
    // Weighted moving average: weight new sample proportionally but cap influence
    const weight = Math.min(0.3, 1 / (samples + 1));
    const newFactor = oldFactor * (1 - weight) + ratio * weight;

    await supabase
      .from("cnc_time_calibration")
      .update({
        scale_factor: Math.round(newFactor * 1000) / 1000,
        sample_count: samples + 1,
        last_updated_at: new Date().toISOString(),
      })
      .eq("id", ex.id);
  } else {
    await supabase
      .from("cnc_time_calibration")
      .insert({
        tenant_id: tenantId,
        machine_id: machineId,
        post_processor_name: postProcessor || null,
        material_key: materialKey || null,
        scale_factor: ratio,
        sample_count: 1,
      });
  }
}

/**
 * Save sheet time estimates (from VCarve gadget import or admin edit).
 */
export async function saveSheetTimeEstimates(
  tenantId: string,
  jobId: string,
  estimates: { sheetId: string; rawMinutes: number; source?: string }[],
  staffId?: string,
  machineId: string = "Fabertec M1",
): Promise<void> {
  const scaleFactor = await getCalibrationFactor(tenantId, machineId);

  for (const est of estimates) {
    const calibrated = Math.round(est.rawMinutes * scaleFactor * 10) / 10;

    // Update the sheet
    await supabase
      .from("job_sheets")
      .update({
        vc_estimated_minutes_raw: est.rawMinutes,
        vc_estimated_minutes_calibrated: calibrated,
        vc_estimate_source: est.source || "manual_in_gadget",
      })
      .eq("id", est.sheetId);

    // Write audit row
    await supabase
      .from("job_time_estimates_audit")
      .insert({
        tenant_id: tenantId,
        job_id: jobId,
        sheet_id: est.sheetId,
        raw_minutes: est.rawMinutes,
        calibrated_minutes: calibrated,
        entered_by_staff_id: staffId || null,
        source: est.source || "admin_edit",
      });
  }
}
