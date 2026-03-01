import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Search, FileText, Shield, AlertTriangle, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface DbFile {
  id: string;
  title: string;
  category: string;
  version: number;
  uploaded_by: string | null;
  requires_acknowledgement: boolean;
  status: string;
  created_at: string;
}

const categoryIcons: Record<string, React.ReactNode> = {
  Safety: <Shield size={16} />,
  SOP: <BookOpen size={16} />,
  Machine: <FileText size={16} />,
  HR: <FileText size={16} />,
  Other: <FileText size={16} />,
};

export default function DocumentsPage() {
  const [files, setFiles] = useState<DbFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("file_assets")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false });
      setFiles(data ?? []);
      setLoading(false);
    };
    fetch();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return files;
    const q = search.toLowerCase();
    return files.filter(
      f =>
        f.title.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q)
    );
  }, [files, search]);

  const reqAck = files.filter(f => f.requires_acknowledgement);

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

      <div className="grid grid-cols-3 gap-4">
        <div className="glass-panel rounded-lg p-4 text-center">
          <p className="text-2xl font-mono font-bold text-foreground">{files.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Active Documents</p>
        </div>
        <div className="glass-panel rounded-lg p-4 text-center">
          <p className="text-2xl font-mono font-bold text-warning">{reqAck.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Require Acknowledgement</p>
        </div>
        <div className="glass-panel rounded-lg p-4 text-center">
          <p className="text-2xl font-mono font-bold text-accent">
            {new Set(files.map(f => f.category)).size}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Categories</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search documents..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full h-10 rounded-md border border-input bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="glass-panel rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading documents...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            {search ? "No documents matching your search" : "No documents yet. Click Upload to add one."}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(file => (
              <div key={file.id} className="p-4 hover:bg-secondary/30 transition-colors cursor-pointer">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-md bg-secondary flex items-center justify-center shrink-0 text-secondary-foreground">
                    {categoryIcons[file.category] || <FileText size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{file.title}</p>
                      {file.requires_acknowledgement && (
                        <AlertTriangle size={12} className="text-warning shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] font-mono text-muted-foreground uppercase">{file.category}</span>
                      <span className="text-[10px] text-muted-foreground">v{file.version}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(file.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
