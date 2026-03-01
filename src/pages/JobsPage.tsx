import JobStatusBadge from "@/components/JobStatusBadge";
import { mockJobs } from "@/data/mockData";
import { Plus, Search, Filter } from "lucide-react";

export default function JobsPage() {
  return (
    <div className="space-y-6 animate-slide-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-mono font-bold text-foreground">CNC Jobs</h2>
          <p className="text-sm text-muted-foreground">Manage job preparation, nesting and export packs</p>
        </div>
        <button className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus size={16} />
          New Job
        </button>
      </div>

      {/* Search bar */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search jobs..."
            className="w-full h-10 rounded-md border border-input bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <button className="flex items-center gap-2 rounded-md border border-input bg-card px-3 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <Filter size={14} />
          Filter
        </button>
      </div>

      {/* Jobs table */}
      <div className="glass-panel rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-4 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Job ID</th>
                <th className="text-left p-4 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                <th className="text-left p-4 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Date</th>
                <th className="text-left p-4 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-right p-4 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">Parts</th>
                <th className="text-right p-4 text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Sheets</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {mockJobs.map(job => (
                <tr key={job.job_id} className="hover:bg-secondary/30 transition-colors cursor-pointer">
                  <td className="p-4 font-mono text-sm text-primary">{job.job_id}</td>
                  <td className="p-4 text-sm font-medium text-foreground">{job.job_name}</td>
                  <td className="p-4 text-sm text-muted-foreground hidden sm:table-cell">{job.created_date}</td>
                  <td className="p-4"><JobStatusBadge status={job.status} /></td>
                  <td className="p-4 text-right font-mono text-sm text-foreground">{job.parts_count}</td>
                  <td className="p-4 text-right font-mono text-sm text-muted-foreground hidden md:table-cell">{job.sheets_estimated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
