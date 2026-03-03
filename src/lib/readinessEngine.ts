import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────
export interface ReadinessResult {
  job_id: string;
  materials_ready: boolean;
  cnc_ready: boolean;
  edge_ready: boolean;
  assembly_ready: boolean;
  spray_ready: boolean;
  install_ready: boolean;
  issues_open_count: number;
  overdue_dependency_count: number;
  readiness_score: number;
  readiness_status: "not_ready" | "at_risk" | "ready" | "production_safe";
  blockers: string[];
}

// ─── Calculate readiness for a single job ─────────────────
export async function calculateReadiness(jobId: string): Promise<ReadinessResult> {
  // Fetch all needed data in parallel
  const [partsRes, stagesRes, issuesRes, mappingsRes, posRes] = await Promise.all([
    supabase.from("parts").select("id, material_code, product_code").eq("job_id", jobId),
    supabase.from("job_stages").select("id, stage_name, status, due_date").eq("job_id", jobId),
    supabase.from("job_issues").select("id, severity, status").eq("job_id", jobId).eq("status", "open"),
    supabase.from("product_mappings").select("product_code, material_code"),
    (supabase.from("purchase_orders") as any).select("id, status").eq("job_id", jobId),
  ]);

  const parts = partsRes.data ?? [];
  const stages = stagesRes.data ?? [];
  const openIssues = issuesRes.data ?? [];
  const mappings = mappingsRes.data ?? [];
  const purchaseOrders = posRes.data ?? [];
  const blockers: string[] = [];
  const today = new Date().toISOString().split("T")[0];

  // ── PO status check ──
  const activePOs = purchaseOrders.filter((po: any) => !["cancelled"].includes(po.status));
  const allPOsReceivedCorrect = activePOs.length > 0 && activePOs.every((po: any) => po.status === "received_correct");
  const hasPendingPOs = activePOs.some((po: any) => !["received_correct", "received", "booked_in"].includes(po.status));

  if (hasPendingPOs) blockers.push(`${activePOs.filter((po: any) => !["received_correct", "received", "booked_in"].includes(po.status)).length} PO(s) not yet received`);

  // ── Materials Ready ──
  const missingMaterials = parts.filter(p => !p.material_code);
  const missingMappings = parts.filter(p => p.product_code && !mappings.some(m => m.product_code === p.product_code));
  const materialsDefinedOk = parts.length > 0 && missingMaterials.length === 0 && missingMappings.length === 0;
  // Materials are truly ready only when all POs are received & correct (or no POs exist)
  const materials_ready = materialsDefinedOk && (activePOs.length === 0 || allPOsReceivedCorrect);
  if (parts.length === 0) blockers.push("No parts defined");
  if (missingMaterials.length > 0) blockers.push(`${missingMaterials.length} parts missing material`);
  if (missingMappings.length > 0) blockers.push(`${missingMappings.length} unmapped products`);

  // ── Stage helpers ──
  const stageStatus = (name: string) => stages.find(s => s.stage_name === name)?.status;
  const stageDone = (name: string) => stageStatus(name) === "Done";
  const stageExists = (name: string) => stages.some(s => s.stage_name === name);

  // ── CNC Ready ──
  const highIssues = openIssues.filter(i => i.severity === "high" || i.severity === "critical");
  const cnc_ready = materials_ready && highIssues.length === 0;
  if (!materials_ready && stageExists("CNC")) blockers.push("CNC blocked: materials incomplete");
  if (highIssues.length > 0) blockers.push(`${highIssues.length} high/critical issues blocking CNC`);

  // ── Edge Ready ──
  const edge_ready = cnc_ready && (stageDone("CNC") || !stageExists("CNC"));
  if (stageExists("Edgebanding") && !edge_ready) blockers.push("Edgebanding waiting on CNC");

  // ── Assembly Ready ──
  const missingInfoIssues = openIssues.filter(i => (i as any).category === "missing_info");
  const assembly_ready = (stageDone("CNC") || !stageExists("CNC")) && (stageDone("Edgebanding") || !stageExists("Edgebanding")) && missingInfoIssues.length === 0;
  if (stageExists("Assembly") && !assembly_ready) blockers.push("Assembly waiting on prior stages");

  // ── Spray Ready ──
  const spray_ready = assembly_ready;

  // ── Install Ready ──
  const installStage = stages.find(s => s.stage_name === "Install");
  const assemblyDone = stageDone("Assembly") || !stageExists("Assembly");
  const installScheduled = !!installStage?.due_date;
  const criticalIssues = openIssues.filter(i => i.severity === "critical");
  const install_ready = assemblyDone && installScheduled && criticalIssues.length === 0;
  if (stageExists("Install") && !assemblyDone) blockers.push("Install waiting on assembly");
  if (stageExists("Install") && !installScheduled) blockers.push("Install date not scheduled");
  if (criticalIssues.length > 0) blockers.push(`${criticalIssues.length} critical issues`);

  // ── Overdue stages ──
  const overdueStages = stages.filter(s => s.due_date && s.due_date < today && s.status !== "Done");
  const overdue_dependency_count = overdueStages.length;
  if (overdueStages.length > 0) blockers.push(`${overdueStages.length} overdue stage(s)`);

  // ── Score ──
  let score = 100;
  score -= highIssues.length * 10;
  score -= openIssues.filter(i => i.severity === "medium").length * 5;
  if (!materialsDefinedOk) score -= 10;
  if (hasPendingPOs) score -= 15;
  if (!cnc_ready && stageExists("CNC")) score -= 10;
  if (!installScheduled && stageExists("Install")) score -= 10;
  score -= overdueStages.length * 5;
  score = Math.max(0, Math.min(100, score));

  const readiness_status: ReadinessResult["readiness_status"] =
    score >= 80 ? "production_safe" : score >= 60 ? "ready" : score >= 40 ? "at_risk" : "not_ready";

  return {
    job_id: jobId,
    materials_ready, cnc_ready, edge_ready, assembly_ready, spray_ready, install_ready,
    issues_open_count: openIssues.length,
    overdue_dependency_count,
    readiness_score: score,
    readiness_status,
    blockers,
  };
}

// ─── Persist readiness to DB ──────────────────────────────
export async function persistReadiness(result: ReadinessResult) {
  const payload = { ...result, last_calculated_at: new Date().toISOString() };

  const { data: existing } = await (supabase.from("production_readiness_status") as any)
    .select("id").eq("job_id", result.job_id).maybeSingle();

  if (existing) {
    await (supabase.from("production_readiness_status") as any).update(payload).eq("id", existing.id);
  } else {
    await (supabase.from("production_readiness_status") as any).insert([payload]);
  }
}

// ─── Calculate + persist for a job ────────────────────────
export async function updateJobReadiness(jobId: string): Promise<ReadinessResult> {
  const result = await calculateReadiness(jobId);
  await persistReadiness(result);
  return result;
}

// ─── Batch update all active jobs ─────────────────────────
export async function updateAllJobReadiness(): Promise<ReadinessResult[]> {
  const { data: jobs } = await supabase.from("jobs").select("id").neq("status", "complete");
  const results: ReadinessResult[] = [];
  for (const job of (jobs ?? [])) {
    const r = await calculateReadiness(job.id);
    await persistReadiness(r);
    results.push(r);
  }
  return results;
}
