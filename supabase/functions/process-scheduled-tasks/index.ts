import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all pending tasks whose scheduled_for has passed
    const { data: tasks, error: fetchErr } = await supabase
      .from("scheduled_tasks")
      .select("*, cab_jobs!inner(company_id, job_ref, customer_id)")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .limit(100);

    if (fetchErr) throw fetchErr;
    if (!tasks || tasks.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    const errors: string[] = [];

    for (const task of tasks) {
      try {
        if (task.task_type === "google_review_request") {
          const job = task.cab_jobs;

          // Fire a cab_events record with event_type "review.requested"
          const { error: evtErr } = await supabase.from("cab_events").insert({
            company_id: job.company_id,
            event_type: "review.requested",
            job_id: task.job_id,
            customer_id: job.customer_id,
            payload_json: {
              task_id: task.id,
              job_ref: job.job_ref,
              source: "scheduled_task",
            },
            status: "pending",
          });

          if (evtErr) throw evtErr;
        }

        // Mark task as executed
        await supabase
          .from("scheduled_tasks")
          .update({ status: "executed", executed_at: new Date().toISOString() })
          .eq("id", task.id);

        processed++;
      } catch (taskErr: unknown) {
        const msg = taskErr instanceof Error ? taskErr.message : String(taskErr);
        errors.push(`Task ${task.id}: ${msg}`);
        // Mark as failed so it doesn't retry forever
        await supabase
          .from("scheduled_tasks")
          .update({ status: "failed", payload_json: { ...task.payload_json, error: msg } })
          .eq("id", task.id);
      }
    }

    return new Response(
      JSON.stringify({ processed, errors: errors.length ? errors : undefined }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("process-scheduled-tasks error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
