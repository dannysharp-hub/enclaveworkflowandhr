import { mockFiles } from "@/data/mockData";
import { Upload, Search, FileText, Shield, AlertTriangle, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

const categoryIcons: Record<string, React.ReactNode> = {
  Safety: <Shield size={16} />,
  SOP: <BookOpen size={16} />,
  Machine: <FileText size={16} />,
  HR: <FileText size={16} />,
  Other: <FileText size={16} />,
};

export default function DocumentsPage() {
  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-mono font-bold text-foreground">Documents</h2>
          <p className="text-sm text-muted-foreground">SOPs, safety docs, and compliance tracking</p>
        </div>
        <button className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Upload size={16} />
          Upload
        </button>
      </div>

      {/* Compliance overview */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-panel rounded-lg p-4 text-center">
          <p className="text-2xl font-mono font-bold text-success">83%</p>
          <p className="text-xs text-muted-foreground mt-1">Overall Compliance</p>
        </div>
        <div className="glass-panel rounded-lg p-4 text-center">
          <p className="text-2xl font-mono font-bold text-warning">2</p>
          <p className="text-xs text-muted-foreground mt-1">Pending Acknowledgements</p>
        </div>
        <div className="glass-panel rounded-lg p-4 text-center">
          <p className="text-2xl font-mono font-bold text-foreground">{mockFiles.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Active Documents</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search documents..."
          className="w-full h-10 rounded-md border border-input bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Documents list */}
      <div className="glass-panel rounded-lg overflow-hidden">
        <div className="divide-y divide-border">
          {mockFiles.map(file => (
            <div key={file.file_id} className="p-4 hover:bg-secondary/30 transition-colors cursor-pointer">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-md bg-secondary flex items-center justify-center shrink-0 text-secondary-foreground">
                  {categoryIcons[file.category] || <FileText size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{file.title}</p>
                    {file.requires_acknowledgement && file.acknowledged_pct < 100 && (
                      <AlertTriangle size={12} className="text-warning shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase">{file.category}</span>
                    <span className="text-[10px] text-muted-foreground">v{file.version}</span>
                    <span className="text-[10px] text-muted-foreground">{file.uploaded_at}</span>
                  </div>
                  {file.requires_acknowledgement && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden max-w-[200px]">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            file.acknowledged_pct >= 80 ? "bg-success" : file.acknowledged_pct >= 50 ? "bg-warning" : "bg-destructive"
                          )}
                          style={{ width: `${file.acknowledged_pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">{file.acknowledged_pct}% acknowledged</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
