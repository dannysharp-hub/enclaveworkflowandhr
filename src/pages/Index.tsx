import { Wrench, CalendarDays, Recycle, FileText, Users, AlertTriangle } from "lucide-react";
import StatCard from "@/components/StatCard";
import JobStatusBadge from "@/components/JobStatusBadge";
import { mockJobs, mockStages, mockHolidayRequests, mockRemnants, mockFiles } from "@/data/mockData";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const activeJobs = mockJobs.filter(j => j.status !== "complete").length;
  const inProgressStages = mockStages.filter(s => s.status === "In Progress").length;
  const pendingHolidays = mockHolidayRequests.filter(h => h.status === "Pending").length;
  const availableRemnants = mockRemnants.filter(r => r.status === "available").length;
  const pendingDocs = mockFiles.filter(f => f.requires_acknowledgement && f.acknowledged_pct < 100).length;

  return (
    <div className="space-y-6 animate-slide-in">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Active Jobs" value={activeJobs} subtitle="In pipeline" icon={<Wrench size={18} />} variant="primary" />
        <StatCard title="In Progress" value={inProgressStages} subtitle="Stages running" icon={<AlertTriangle size={18} />} variant="warning" />
        <StatCard title="Remnants" value={availableRemnants} subtitle="Available offcuts" icon={<Recycle size={18} />} variant="accent" />
        <StatCard title="Pending" value={pendingHolidays} subtitle="Holiday requests" icon={<CalendarDays size={18} />} />
      </div>

      {/* Two column layout */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Jobs overview */}
        <div className="lg:col-span-2 glass-panel rounded-lg">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="font-mono text-sm font-bold text-foreground">ACTIVE JOBS</h2>
            <Link to="/jobs" className="text-xs text-primary hover:underline font-medium">View all →</Link>
          </div>
          <div className="divide-y divide-border">
            {mockJobs.filter(j => j.status !== "complete").map(job => (
              <div key={job.job_id} className="flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{job.job_id}</span>
                    <JobStatusBadge status={job.status} />
                  </div>
                  <p className="mt-0.5 text-sm font-medium text-foreground">{job.job_name}</p>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="font-mono text-sm text-foreground">{job.parts_count} parts</p>
                  <p className="text-xs text-muted-foreground">{job.sheets_estimated} sheets est.</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Holiday requests */}
          <div className="glass-panel rounded-lg">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-mono text-sm font-bold text-foreground">HOLIDAY REQUESTS</h2>
              <span className="text-xs text-warning font-mono">{pendingHolidays} pending</span>
            </div>
            <div className="divide-y divide-border">
              {mockHolidayRequests.map(hr => (
                <div key={hr.request_id} className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">{hr.staff_name}</p>
                    <span className={cn_holiday(hr.status)}>{hr.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {hr.start_date} → {hr.end_date}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Document compliance */}
          <div className="glass-panel rounded-lg">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-mono text-sm font-bold text-foreground">COMPLIANCE</h2>
              <Link to="/documents" className="text-xs text-primary hover:underline font-medium">View →</Link>
            </div>
            <div className="divide-y divide-border">
              {mockFiles.filter(f => f.requires_acknowledgement).slice(0, 3).map(file => (
                <div key={file.file_id} className="p-4">
                  <p className="text-sm font-medium text-foreground truncate">{file.title}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${file.acknowledged_pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">{file.acknowledged_pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function cn_holiday(status: string) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono font-medium";
  switch (status) {
    case "Approved": return `${base} bg-success/15 text-success`;
    case "Pending": return `${base} bg-warning/15 text-warning`;
    case "Rejected": return `${base} bg-destructive/15 text-destructive`;
    default: return `${base} bg-muted text-muted-foreground`;
  }
}
