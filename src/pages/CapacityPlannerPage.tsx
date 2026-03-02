import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isToday, isSameDay } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import {
  Factory, ChevronLeft, ChevronRight, Plus, AlertTriangle, CheckCircle2,
  Zap, Clock, CalendarDays, TrendingUp, Settings2, Play
} from "lucide-react";
import { cn } from "@/lib/utils";

const STAGES = ["CNC", "Assembly", "Spray", "Install"];
const STAGE_COLORS: Record<string, string> = {
  CNC: "hsl(var(--primary))",
  Assembly: "hsl(var(--chart-2))",
  Spray: "hsl(var(--chart-3))",
  Install: "hsl(var(--chart-4))",
};

export default function CapacityPlannerPage() {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [simDialogOpen, setSimDialogOpen] = useState(false);

  const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 4) }); // Mon-Fri

  // Fetch stage capacity config
  const { data: capacityConfig = [] } = useQuery({
    queryKey: ["stage-capacity-config", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_capacity_config")
        .select("*")
        .eq("active", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Fetch production schedule for this week
  const { data: schedule = [] } = useQuery({
    queryKey: ["production-schedule", tenantId, format(weekStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_schedule")
        .select("*, jobs(title, status, job_type)")
        .gte("scheduled_date", format(weekStart, "yyyy-MM-dd"))
        .lte("scheduled_date", format(weekEnd, "yyyy-MM-dd"))
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Fetch active jobs for scheduling
  const { data: activeJobs = [] } = useQuery({
    queryKey: ["active-jobs-for-scheduling", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, title, job_type, status")
        .in("status", ["in_progress", "quoted", "approved"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Compute daily utilisation per stage
  const dailyUtilisation = useMemo(() => {
    const result: Record<string, Record<string, { used: number; capacity: number }>> = {};
    for (const day of weekDays) {
      const dateKey = format(day, "yyyy-MM-dd");
      result[dateKey] = {};
      for (const stage of STAGES) {
        const config = capacityConfig.find((c: any) => c.stage_name === stage);
        const capacity = config?.daily_available_hours || 8;
        const daySchedule = schedule.filter(
          (s: any) => s.scheduled_date === dateKey && s.stage_name === stage
        );
        const used = daySchedule.reduce((sum: number, s: any) => sum + Number(s.planned_hours || 0), 0);
        result[dateKey][stage] = { used, capacity };
      }
    }
    return result;
  }, [weekDays, schedule, capacityConfig]);

  // Weekly stage summary
  const stageSummary = useMemo(() => {
    return STAGES.map((stage) => {
      const config = capacityConfig.find((c: any) => c.stage_name === stage);
      const dailyCap = config?.daily_available_hours || 8;
      const weeklyCap = dailyCap * 5;
      const weeklyUsed = Object.values(dailyUtilisation).reduce(
        (sum, day) => sum + (day[stage]?.used || 0), 0
      );
      const pct = weeklyCap > 0 ? (weeklyUsed / weeklyCap) * 100 : 0;
      return { stage, used: weeklyUsed, capacity: weeklyCap, pct };
    });
  }, [dailyUtilisation, capacityConfig]);

  // Chart data
  const chartData = weekDays.map((day) => {
    const dateKey = format(day, "yyyy-MM-dd");
    const row: any = { day: format(day, "EEE") };
    for (const stage of STAGES) {
      row[stage] = dailyUtilisation[dateKey]?.[stage]?.used || 0;
    }
    return row;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground flex items-center gap-2">
            <Factory size={24} /> Capacity Planner
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Stage utilisation, scheduling & job acceptance simulation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setConfigDialogOpen(true)}>
            <Settings2 size={14} className="mr-1" /> Stage Config
          </Button>
          <Button size="sm" onClick={() => setSimDialogOpen(true)}>
            <Play size={14} className="mr-1" /> Simulate Job
          </Button>
        </div>
      </div>

      {/* Stage utilisation cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stageSummary.map((s) => (
          <Card key={s.stage}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-bold text-muted-foreground">{s.stage}</span>
                <Badge variant={s.pct > 90 ? "destructive" : s.pct > 70 ? "secondary" : "outline"}>
                  {s.pct.toFixed(0)}%
                </Badge>
              </div>
              <Progress value={Math.min(s.pct, 100)} className="h-2 mb-1" />
              <p className="text-xs text-muted-foreground">
                {s.used.toFixed(1)}h / {s.capacity.toFixed(0)}h this week
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="gantt" className="space-y-4">
        <TabsList>
          <TabsTrigger value="gantt">
            <CalendarDays size={14} className="mr-1" /> Schedule
          </TabsTrigger>
          <TabsTrigger value="chart">
            <TrendingUp size={14} className="mr-1" /> Utilisation
          </TabsTrigger>
        </TabsList>

        {/* Gantt / Schedule Tab */}
        <TabsContent value="gantt">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-mono">
                  Week of {format(weekStart, "dd MMM yyyy")}
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWeekOffset(w => w - 1)}>
                    <ChevronLeft size={14} />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setWeekOffset(0)}>
                    Today
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWeekOffset(w => w + 1)}>
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24 text-xs">Stage</TableHead>
                    {weekDays.map((day) => (
                      <TableHead key={day.toISOString()} className={cn("text-xs text-center min-w-[120px]", isToday(day) && "bg-primary/5")}>
                        <div>{format(day, "EEE")}</div>
                        <div className="text-[10px] text-muted-foreground">{format(day, "dd MMM")}</div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {STAGES.map((stage) => (
                    <TableRow key={stage}>
                      <TableCell className="font-mono text-xs font-bold">{stage}</TableCell>
                      {weekDays.map((day) => {
                        const dateKey = format(day, "yyyy-MM-dd");
                        const dayItems = schedule.filter(
                          (s: any) => s.scheduled_date === dateKey && s.stage_name === stage
                        );
                        const util = dailyUtilisation[dateKey]?.[stage];
                        const pct = util ? (util.used / util.capacity) * 100 : 0;
                        return (
                          <TableCell key={dateKey} className={cn("p-1 align-top", isToday(day) && "bg-primary/5")}>
                            <div className="space-y-1">
                              {dayItems.map((item: any) => (
                                <div
                                  key={item.id}
                                  className="text-[10px] rounded px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20 truncate"
                                  title={`${(item as any).jobs?.title || "Job"} — ${item.planned_hours}h`}
                                >
                                  {(item as any).jobs?.title?.substring(0, 15) || "Job"} ({item.planned_hours}h)
                                </div>
                              ))}
                              {dayItems.length === 0 && (
                                <div className="text-[10px] text-muted-foreground/40 text-center py-1">—</div>
                              )}
                            </div>
                            {pct > 0 && (
                              <div className="mt-1">
                                <div className="h-1 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className={cn("h-full rounded-full", pct > 90 ? "bg-destructive" : pct > 70 ? "bg-yellow-500" : "bg-primary")}
                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Utilisation Chart Tab */}
        <TabsContent value="chart">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-mono">Daily Hours by Stage</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  {STAGES.map((stage) => (
                    <Bar key={stage} dataKey={stage} stackId="a" fill={STAGE_COLORS[stage]} radius={stage === "Install" ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Schedule a Job */}
      <ScheduleJobCard
        activeJobs={activeJobs}
        weekDays={weekDays}
        tenantId={tenantId}
        onScheduled={() => queryClient.invalidateQueries({ queryKey: ["production-schedule"] })}
      />

      {/* Stage Config Dialog */}
      <StageConfigDialog open={configDialogOpen} onOpenChange={setConfigDialogOpen} tenantId={tenantId} existing={capacityConfig} />

      {/* Simulator Dialog */}
      <SimulatorDialog
        open={simDialogOpen}
        onOpenChange={setSimDialogOpen}
        tenantId={tenantId}
        capacityConfig={capacityConfig}
        stageSummary={stageSummary}
      />
    </div>
  );
}

// ========== Schedule Job Card ==========
function ScheduleJobCard({ activeJobs, weekDays, tenantId, onScheduled }: any) {
  const { toast } = useToast();
  const [jobId, setJobId] = useState("");
  const [stage, setStage] = useState("CNC");
  const [date, setDate] = useState("");
  const [hours, setHours] = useState("4");

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("production_schedule").insert({
        tenant_id: tenantId,
        job_id: jobId,
        stage_name: stage,
        scheduled_date: date,
        planned_hours: parseFloat(hours),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Scheduled", description: "Job added to production schedule." });
      onScheduled();
      setJobId("");
      setHours("4");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-mono flex items-center gap-2">
          <Plus size={14} /> Schedule a Job
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
          <div>
            <Label className="text-xs">Job</Label>
            <Select value={jobId} onValueChange={setJobId}>
              <SelectTrigger className="text-xs"><SelectValue placeholder="Select job" /></SelectTrigger>
              <SelectContent>
                {activeJobs.map((j: any) => (
                  <SelectItem key={j.id} value={j.id} className="text-xs">{j.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Stage</Label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="text-xs" />
          </div>
          <div>
            <Label className="text-xs">Hours</Label>
            <Input type="number" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} className="text-xs" />
          </div>
          <Button
            size="sm"
            disabled={!jobId || !date || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Adding..." : "Add to Schedule"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ========== Stage Config Dialog ==========
function StageConfigDialog({ open, onOpenChange, tenantId, existing }: any) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [configs, setConfigs] = useState<Record<string, { hours: string; concurrent: string }>>(
    STAGES.reduce((acc, s) => {
      const ex = existing?.find((c: any) => c.stage_name === s);
      acc[s] = { hours: String(ex?.daily_available_hours ?? 8), concurrent: String(ex?.max_concurrent_jobs ?? 3) };
      return acc;
    }, {} as any)
  );

  const save = useMutation({
    mutationFn: async () => {
      for (const stage of STAGES) {
        const ex = existing?.find((c: any) => c.stage_name === stage);
        const payload = {
          tenant_id: tenantId,
          stage_name: stage,
          daily_available_hours: parseFloat(configs[stage].hours),
          max_concurrent_jobs: parseInt(configs[stage].concurrent),
        };
        if (ex) {
          await supabase.from("stage_capacity_config").update(payload).eq("id", ex.id);
        } else {
          await supabase.from("stage_capacity_config").insert(payload);
        }
      }
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Stage capacity updated." });
      queryClient.invalidateQueries({ queryKey: ["stage-capacity-config"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-mono">Stage Capacity Configuration</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {STAGES.map((stage) => (
            <div key={stage} className="grid grid-cols-3 gap-3 items-end">
              <div>
                <Label className="text-xs font-mono">{stage}</Label>
              </div>
              <div>
                <Label className="text-xs">Daily Hours</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={configs[stage]?.hours ?? "8"}
                  onChange={(e) => setConfigs(c => ({ ...c, [stage]: { ...c[stage], hours: e.target.value } }))}
                  className="text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">Max Concurrent</Label>
                <Input
                  type="number"
                  value={configs[stage]?.concurrent ?? "3"}
                  onChange={(e) => setConfigs(c => ({ ...c, [stage]: { ...c[stage], concurrent: e.target.value } }))}
                  className="text-xs"
                />
              </div>
            </div>
          ))}
          <Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving..." : "Save Configuration"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ========== Simulator Dialog ==========
function SimulatorDialog({ open, onOpenChange, tenantId, capacityConfig, stageSummary }: any) {
  const [form, setForm] = useState({
    name: "",
    jobType: "Kitchen",
    sheets: "10",
    cncHours: "8",
    assemblyHours: "12",
    sprayHours: "6",
    installHours: "8",
    quoteValue: "15000",
  });
  const [result, setResult] = useState<any>(null);

  const runSimulation = () => {
    const totalPlanned = parseFloat(form.cncHours) + parseFloat(form.assemblyHours) +
      parseFloat(form.sprayHours) + parseFloat(form.installHours);
    const materialCost = parseFloat(form.quoteValue) * 0.3;
    const labourCost = totalPlanned * 25;
    const overhead = parseFloat(form.quoteValue) * 0.1;
    const totalCost = materialCost + labourCost + overhead;
    const margin = ((parseFloat(form.quoteValue) - totalCost) / parseFloat(form.quoteValue)) * 100;

    // Check capacity impact per stage
    const impacts = STAGES.map((stage) => {
      const key = stage.toLowerCase().replace(" ", "") as string;
      const planned = parseFloat(
        stage === "CNC" ? form.cncHours :
        stage === "Assembly" ? form.assemblyHours :
        stage === "Spray" ? form.sprayHours : form.installHours
      );
      const summary = stageSummary.find((s: any) => s.stage === stage);
      const newUsed = (summary?.used || 0) + planned;
      const cap = summary?.capacity || 40;
      const newPct = (newUsed / cap) * 100;
      const overCapacity = newPct > 100;
      return { stage, planned, currentUsed: summary?.used || 0, capacity: cap, newPct, overCapacity };
    });

    const hasOverflow = impacts.some((i) => i.overCapacity);
    const daysNeeded = Math.ceil(totalPlanned / 8);
    const deliveryDate = addDays(new Date(), daysNeeded + 5);

    setResult({
      totalPlanned,
      margin: margin.toFixed(1),
      impacts,
      hasOverflow,
      deliveryDate: format(deliveryDate, "dd MMM yyyy"),
      risk: hasOverflow ? "high" : margin < 15 ? "medium" : "low",
      cashflowImpact: parseFloat(form.quoteValue) - totalCost,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono flex items-center gap-2">
            <Zap size={18} /> Job Acceptance Simulator
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Job Description</Label>
            <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Smith Kitchen" className="text-xs" />
          </div>
          <div>
            <Label className="text-xs">Job Type</Label>
            <Select value={form.jobType} onValueChange={(v) => setForm(f => ({ ...f, jobType: v }))}>
              <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Kitchen", "Bedroom", "Bathroom", "Commercial", "Bespoke"].map(t => (
                  <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Sheet Count</Label>
            <Input type="number" value={form.sheets} onChange={(e) => setForm(f => ({ ...f, sheets: e.target.value }))} className="text-xs" />
          </div>
          <div>
            <Label className="text-xs">Quote Value (£)</Label>
            <Input type="number" value={form.quoteValue} onChange={(e) => setForm(f => ({ ...f, quoteValue: e.target.value }))} className="text-xs" />
          </div>
          <div>
            <Label className="text-xs">CNC Hours</Label>
            <Input type="number" step="0.5" value={form.cncHours} onChange={(e) => setForm(f => ({ ...f, cncHours: e.target.value }))} className="text-xs" />
          </div>
          <div>
            <Label className="text-xs">Assembly Hours</Label>
            <Input type="number" step="0.5" value={form.assemblyHours} onChange={(e) => setForm(f => ({ ...f, assemblyHours: e.target.value }))} className="text-xs" />
          </div>
          <div>
            <Label className="text-xs">Spray Hours</Label>
            <Input type="number" step="0.5" value={form.sprayHours} onChange={(e) => setForm(f => ({ ...f, sprayHours: e.target.value }))} className="text-xs" />
          </div>
          <div>
            <Label className="text-xs">Install Hours</Label>
            <Input type="number" step="0.5" value={form.installHours} onChange={(e) => setForm(f => ({ ...f, installHours: e.target.value }))} className="text-xs" />
          </div>
        </div>
        <Button onClick={runSimulation} className="w-full mt-2">
          <Play size={14} className="mr-1" /> Run Simulation
        </Button>

        {result && (
          <div className="space-y-4 mt-4 border-t border-border pt-4">
            {/* Risk header */}
            <div className={cn(
              "flex items-center gap-2 p-3 rounded-lg border",
              result.risk === "high" ? "bg-destructive/10 border-destructive/30" :
              result.risk === "medium" ? "bg-yellow-500/10 border-yellow-500/30" :
              "bg-green-500/10 border-green-500/30"
            )}>
              {result.risk === "high" ? <AlertTriangle className="text-destructive" size={18} /> :
               result.risk === "medium" ? <AlertTriangle className="text-yellow-500" size={18} /> :
               <CheckCircle2 className="text-green-500" size={18} />}
              <div>
                <p className="text-sm font-bold text-foreground">
                  Risk: {result.risk.charAt(0).toUpperCase() + result.risk.slice(1)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {result.hasOverflow ? "⚠ Accepting this job will exceed stage capacity this week." : "Capacity available for this job."}
                </p>
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center">
                <p className="text-lg font-mono font-bold text-foreground">{result.margin}%</p>
                <p className="text-[10px] text-muted-foreground">Projected Margin</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-mono font-bold text-foreground">{result.totalPlanned}h</p>
                <p className="text-[10px] text-muted-foreground">Total Hours</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-mono font-bold text-foreground">£{result.cashflowImpact.toFixed(0)}</p>
                <p className="text-[10px] text-muted-foreground">Cashflow Impact</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-mono font-bold text-foreground">{result.deliveryDate}</p>
                <p className="text-[10px] text-muted-foreground">Est. Delivery</p>
              </div>
            </div>

            {/* Stage impacts */}
            <div className="space-y-2">
              <p className="text-xs font-mono font-bold text-muted-foreground">CAPACITY IMPACT</p>
              {result.impacts.map((imp: any) => (
                <div key={imp.stage} className="flex items-center gap-3">
                  <span className="text-xs font-mono w-16">{imp.stage}</span>
                  <div className="flex-1">
                    <Progress value={Math.min(imp.newPct, 100)} className="h-2" />
                  </div>
                  <span className={cn("text-xs font-mono w-14 text-right", imp.overCapacity && "text-destructive font-bold")}>
                    {imp.newPct.toFixed(0)}%
                  </span>
                  {imp.overCapacity && <AlertTriangle size={12} className="text-destructive" />}
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
