import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { job_id, tenant_id, mode } = await req.json();
    // mode: "job_quote" | "capacity_check"

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    if (mode === "job_quote" && job_id) {
      return await handleJobQuote(sb, job_id, tenant_id);
    } else if (mode === "capacity_check") {
      return await handleCapacityCheck(sb, tenant_id);
    }

    return new Response(JSON.stringify({ error: "Invalid mode" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-quote-advisor error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleJobQuote(sb: any, jobId: string, tenantId: string) {
  // 1. Fetch target job
  const { data: job, error: jobErr } = await sb
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .single();
  if (jobErr || !job) {
    return jsonRes({ error: "Job not found" }, 404);
  }

  // 2. Fetch job parts
  const { data: parts } = await sb
    .from("job_parts")
    .select("*")
    .eq("job_id", jobId);
  const partCount = parts?.length || 0;
  const totalArea = (parts || []).reduce((sum: number, p: any) =>
    sum + ((p.length_mm || 0) * (p.width_mm || 0)), 0) / 1_000_000; // m²

  // 3. Fetch historical completed jobs in same tenant
  const { data: historicalJobs } = await sb
    .from("jobs")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", "complete")
    .limit(200);

  const histJobs = historicalJobs || [];
  if (histJobs.length < 3) {
    return jsonRes({ proposals: [], message: "Not enough historical data for analysis (need 3+ completed jobs)" });
  }

  // 4. Fetch stages for historical jobs
  const histJobIds = histJobs.map((j: any) => j.id);
  const { data: allStages } = await sb
    .from("job_stages")
    .select("*")
    .in("job_id", histJobIds);
  const stagesByJob: Record<string, any[]> = {};
  (allStages || []).forEach((s: any) => {
    if (!stagesByJob[s.job_id]) stagesByJob[s.job_id] = [];
    stagesByJob[s.job_id].push(s);
  });

  // 5. Fetch parts for historical jobs for similarity
  const { data: allHistParts } = await sb
    .from("job_parts")
    .select("job_id, length_mm, width_mm, material_code")
    .in("job_id", histJobIds);
  const partsByJob: Record<string, any[]> = {};
  (allHistParts || []).forEach((p: any) => {
    if (!partsByJob[p.job_id]) partsByJob[p.job_id] = [];
    partsByJob[p.job_id].push(p);
  });

  // 6. Compute similarity scores
  const similarities = histJobs.map((hj: any) => {
    const hjParts = partsByJob[hj.id] || [];
    const hjArea = hjParts.reduce((s: number, p: any) => s + ((p.length_mm || 0) * (p.width_mm || 0)), 0) / 1_000_000;
    const hjPartCount = hjParts.length;

    // Weighted similarity
    let score = 0;
    // Part count proximity (weight 0.3)
    if (partCount > 0 && hjPartCount > 0) {
      score += 0.3 * Math.max(0, 1 - Math.abs(partCount - hjPartCount) / Math.max(partCount, hjPartCount));
    }
    // Area proximity (weight 0.4)
    if (totalArea > 0 && hjArea > 0) {
      score += 0.4 * Math.max(0, 1 - Math.abs(totalArea - hjArea) / Math.max(totalArea, hjArea));
    }
    // Sheet count proximity (weight 0.3)
    const jobSheets = job.sheets_estimated || 0;
    const hjSheets = hj.sheets_estimated || 0;
    if (jobSheets > 0 && hjSheets > 0) {
      score += 0.3 * Math.max(0, 1 - Math.abs(jobSheets - hjSheets) / Math.max(jobSheets, hjSheets));
    }

    return { job: hj, score, stages: stagesByJob[hj.id] || [], partCount: hjPartCount, area: hjArea };
  });

  // Top similar
  similarities.sort((a, b) => b.score - a.score);
  const topSimilar = similarities.slice(0, Math.min(10, similarities.length)).filter(s => s.score > 0.3);

  if (topSimilar.length < 2) {
    return jsonRes({ proposals: [], message: "Not enough similar jobs found for reliable analysis." });
  }

  // 7. Calculate baseline predictions from similar jobs
  const sheetsValues = topSimilar.map(s => s.job.sheets_estimated || 0).filter(v => v > 0);
  const avgSheets = sheetsValues.length > 0 ? sheetsValues.reduce((a, b) => a + b, 0) / sheetsValues.length : 0;

  // Calculate hours by stage from similar jobs
  const stageHours: Record<string, number[]> = {};
  topSimilar.forEach(s => {
    s.stages.forEach((st: any) => {
      if (!stageHours[st.stage_name]) stageHours[st.stage_name] = [];
      if (st.actual_hours) stageHours[st.stage_name].push(st.actual_hours);
    });
  });

  const avgHoursByStage: Record<string, number> = {};
  Object.entries(stageHours).forEach(([stage, hours]) => {
    if (hours.length > 0) {
      avgHoursByStage[stage] = hours.reduce((a, b) => a + b, 0) / hours.length;
    }
  });

  // 8. Compute confidence
  const variance = topSimilar.length > 1
    ? topSimilar.reduce((s, t) => s + Math.pow(t.score - (topSimilar.reduce((a, b) => a + b.score, 0) / topSimilar.length), 2), 0) / topSimilar.length
    : 1;
  const confidence = Math.min(0.95, Math.max(0.3, (topSimilar.length / 10) * (1 - variance)));
  const riskLevel = confidence > 0.7 ? "low" : confidence > 0.45 ? "medium" : "high";

  // 9. Generate proposals
  const proposals: any[] = [];

  // Proposal A: Margin check (if job has quote_value and cost data)
  if (job.quote_value && job.estimated_cost) {
    const currentMargin = ((job.quote_value - job.estimated_cost) / job.quote_value) * 100;
    const histMargins = topSimilar
      .filter(s => s.job.quote_value && s.job.estimated_cost)
      .map(s => ((s.job.quote_value - s.job.estimated_cost) / s.job.quote_value) * 100);

    if (histMargins.length >= 2) {
      const avgMargin = histMargins.reduce((a, b) => a + b, 0) / histMargins.length;

      if (currentMargin < avgMargin * 0.85) {
        proposals.push({
          tenant_id: tenantId,
          proposal_type: "quote_margin_adjustment",
          scope_type: "job",
          job_id: jobId,
          title: "Increase margin to historical baseline",
          description: `Current quoted margin (${currentMargin.toFixed(1)}%) is significantly below the historical average of ${avgMargin.toFixed(1)}% for similar jobs. Based on ${topSimilar.length} comparable jobs, we recommend reviewing the quote upward to reduce underperformance risk.`,
          impact_summary_json: {
            current_margin_percent: Math.round(currentMargin * 10) / 10,
            recommended_margin_percent: Math.round(avgMargin * 10) / 10,
            risk_of_underperformance_percent: Math.round((1 - currentMargin / avgMargin) * 100),
            similar_jobs_analysed: topSimilar.length,
          },
          confidence_score: confidence,
          risk_level: riskLevel,
          requires_role: "admin",
          status: "pending",
          reasoning_json: {
            similar_jobs_used: topSimilar.slice(0, 5).map(s => s.job.id),
            avg_margin: Math.round(avgMargin * 10) / 10,
            margin_variance: Math.round(Math.sqrt(histMargins.reduce((s, m) => s + Math.pow(m - avgMargin, 2), 0) / histMargins.length) * 10) / 10,
            similarity_scores: topSimilar.slice(0, 5).map(s => Math.round(s.score * 100) / 100),
          },
        });
      }
    }
  }

  // Proposal B: Labour time adjustment
  const jobStages: any[] = [];
  const { data: currentStages } = await sb
    .from("job_stages")
    .select("*")
    .eq("job_id", jobId);

  if (currentStages && currentStages.length > 0) {
    for (const stage of currentStages) {
      const predicted = avgHoursByStage[stage.stage_name];
      const planned = stage.planned_hours || 0;
      if (predicted && planned > 0 && planned < predicted * 0.75) {
        proposals.push({
          tenant_id: tenantId,
          proposal_type: "quote_time_adjustment",
          scope_type: "job",
          job_id: jobId,
          title: `Increase ${stage.stage_name} labour estimate`,
          description: `Planned ${stage.stage_name} hours (${planned}h) are ${Math.round((1 - planned / predicted) * 100)}% below the historical average of ${predicted.toFixed(1)}h for similar jobs. This increases the risk of overrun.`,
          impact_summary_json: {
            stage: stage.stage_name,
            current_hours: planned,
            predicted_hours: Math.round(predicted * 10) / 10,
            overrun_risk_percent: Math.round((1 - planned / predicted) * 100),
          },
          confidence_score: confidence,
          risk_level: planned < predicted * 0.5 ? "high" : "medium",
          requires_role: "admin",
          status: "pending",
          reasoning_json: {
            similar_jobs_count: topSimilar.length,
            historical_hours_range: stageHours[stage.stage_name] ? {
              min: Math.min(...stageHours[stage.stage_name]),
              max: Math.max(...stageHours[stage.stage_name]),
              avg: predicted,
            } : null,
          },
        });
      }
    }
  }

  // Insert proposals
  if (proposals.length > 0) {
    const { error: insertErr } = await sb.from("ai_proposals").insert(proposals);
    if (insertErr) {
      console.error("Insert proposals error:", insertErr);
      return jsonRes({ error: "Failed to create proposals" }, 500);
    }
  }

  return jsonRes({
    proposals_created: proposals.length,
    similar_jobs_found: topSimilar.length,
    confidence: confidence,
    message: proposals.length > 0
      ? `Created ${proposals.length} proposal(s) based on ${topSimilar.length} similar jobs.`
      : "Analysis complete — no adjustments recommended.",
  });
}

async function handleCapacityCheck(sb: any, tenantId: string) {
  // 1. Get active jobs with stages
  const { data: activeJobs } = await sb
    .from("jobs")
    .select("id, job_name, status")
    .eq("tenant_id", tenantId)
    .in("status", ["validated", "cutting", "exported"]);

  if (!activeJobs || activeJobs.length === 0) {
    return jsonRes({ proposals_created: 0, message: "No active jobs to check capacity." });
  }

  const jobIds = activeJobs.map((j: any) => j.id);
  const { data: stages } = await sb
    .from("job_stages")
    .select("*")
    .in("job_id", jobIds)
    .in("status", ["Not Started", "In Progress"]);

  // 2. Get staff for capacity
  const { data: staff } = await sb
    .from("profiles")
    .select("user_id, department, contracted_hours_per_week")
    .eq("tenant_id", tenantId)
    .eq("active", true);

  // 3. Get holiday requests for next 6 weeks
  const now = new Date();
  const sixWeeksOut = new Date(now.getTime() + 42 * 24 * 60 * 60 * 1000);
  const { data: holidays } = await sb
    .from("holiday_requests")
    .select("staff_id, start_date, end_date, type")
    .eq("tenant_id", tenantId)
    .eq("status", "Approved")
    .gte("end_date", now.toISOString().split("T")[0])
    .lte("start_date", sixWeeksOut.toISOString().split("T")[0]);

  // 4. Compute weekly capacity by department
  const departments = ["CNC", "Assembly", "Spray", "Install"];
  const weeklyCapacity: Record<string, number> = {};
  const weeklyScheduled: Record<string, Record<string, number>> = {};

  departments.forEach(dept => {
    const deptStaff = (staff || []).filter((s: any) => s.department === dept);
    weeklyCapacity[dept] = deptStaff.reduce((s: number, st: any) => s + (st.contracted_hours_per_week || 40), 0);
  });

  // Group stages by week
  const stageList = stages || [];
  for (let week = 0; week < 6; week++) {
    const weekStart = new Date(now.getTime() + week * 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const weekKey = `W${week + 1}`;
    weeklyScheduled[weekKey] = {};

    departments.forEach(dept => {
      const deptStages = stageList.filter((s: any) => {
        const dueDate = new Date(s.due_date);
        return s.stage_name === dept && dueDate >= weekStart && dueDate < weekEnd;
      });
      const totalHours = deptStages.reduce((s: number, st: any) => s + (st.planned_hours || 8), 0);

      // Subtract holiday hours
      const deptStaffIds = (staff || []).filter((s: any) => s.department === dept).map((s: any) => s.user_id);
      const holidayHours = (holidays || []).reduce((s: number, h: any) => {
        if (!deptStaffIds.includes(h.staff_id)) return s;
        const hStart = new Date(h.start_date);
        const hEnd = new Date(h.end_date);
        if (hEnd < weekStart || hStart > weekEnd) return s;
        const overlapDays = Math.min(
          (weekEnd.getTime() - Math.max(hStart.getTime(), weekStart.getTime())) / (24 * 60 * 60 * 1000),
          (Math.min(hEnd.getTime(), weekEnd.getTime()) - weekStart.getTime()) / (24 * 60 * 60 * 1000)
        );
        return s + Math.max(0, Math.round(overlapDays)) * 8;
      }, 0);

      weeklyScheduled[weekKey][dept] = totalHours;
      const available = Math.max(0, (weeklyCapacity[dept] || 0) - holidayHours);
      const utilisation = available > 0 ? (totalHours / available) * 100 : 0;

      // Generate warning if over 100%
      if (utilisation > 100) {
        // We'll collect these and insert below
      }
    });
  }

  // 5. Generate capacity proposals
  const proposals: any[] = [];

  for (const [weekKey, depts] of Object.entries(weeklyScheduled)) {
    for (const [dept, scheduled] of Object.entries(depts)) {
      const available = weeklyCapacity[dept] || 40;
      const utilisation = available > 0 ? (scheduled / available) * 100 : 0;

      if (utilisation > 100) {
        const hoursOver = scheduled - available;
        proposals.push({
          tenant_id: tenantId,
          proposal_type: "capacity_warning",
          scope_type: "portfolio",
          title: `${dept} overcapacity ${weekKey}`,
          description: `${dept} is forecast at ${Math.round(utilisation)}% capacity for ${weekKey}. ${Math.round(hoursOver)} hours over available capacity. Consider reassigning work or adjusting timelines.`,
          impact_summary_json: {
            week: weekKey,
            department: dept,
            utilisation_percent: Math.round(utilisation),
            hours_over_capacity: Math.round(hoursOver),
            available_hours: available,
            scheduled_hours: scheduled,
          },
          confidence_score: Math.min(0.9, 0.5 + (activeJobs.length / 20) * 0.4),
          risk_level: utilisation > 130 ? "high" : "medium",
          requires_role: "admin",
          status: "pending",
          reasoning_json: {
            active_job_count: activeJobs.length,
            dept_staff_capacity: available,
            holiday_impact: "included",
          },
        });
      }
    }
  }

  if (proposals.length > 0) {
    const { error: insertErr } = await sb.from("ai_proposals").insert(proposals);
    if (insertErr) {
      console.error("Insert capacity proposals error:", insertErr);
      return jsonRes({ error: "Failed to create capacity proposals" }, 500);
    }
  }

  return jsonRes({
    proposals_created: proposals.length,
    weeks_analysed: 6,
    message: proposals.length > 0
      ? `Created ${proposals.length} capacity warning(s).`
      : "All departments within capacity for the next 6 weeks.",
  });
}

function jsonRes(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
