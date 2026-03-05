import { useEffect, useState, useMemo, useCallback } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import DocumentDialog from "@/components/DocumentDialog";
import { Upload, Search, FileText, Shield, AlertTriangle, BookOpen, Receipt, ShoppingCart, DollarSign, Eye, Trash2, FolderOpen, ChevronDown, Monitor, Car, Zap, Building2, Briefcase, HardHat, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface DbFile {
  id: string;
  title: string;
  category: string;
  version: number;
  uploaded_by: string | null;
  requires_acknowledgement: boolean;
  status: string;
  created_at: string;
  file_reference: string | null;
}

const filingCategories = [
  { group: "Operations", items: [
    { value: "Safety", label: "Safety", icon: <Shield size={14} /> },
    { value: "SOP", label: "SOP", icon: <BookOpen size={14} /> },
    { value: "Machine", label: "Machine", icon: <Wrench size={14} /> },
    { value: "HR", label: "HR", icon: <Briefcase size={14} /> },
  ]},
  { group: "Finance", items: [
    { value: "Finance", label: "General Finance", icon: <DollarSign size={14} /> },
    { value: "Software", label: "Software", icon: <Monitor size={14} /> },
    { value: "Insurance", label: "Insurance", icon: <Shield size={14} /> },
    { value: "Utilities", label: "Utilities", icon: <Zap size={14} /> },
    { value: "Vehicle", label: "Vehicle", icon: <Car size={14} /> },
    { value: "Rent", label: "Rent / Premises", icon: <Building2 size={14} /> },
    { value: "Subscriptions", label: "Subscriptions", icon: <Receipt size={14} /> },
    { value: "Equipment", label: "Equipment", icon: <HardHat size={14} /> },
  ]},
  { group: "Commercial", items: [
    { value: "Purchasing", label: "Purchasing", icon: <ShoppingCart size={14} /> },
    { value: "Sales", label: "Sales", icon: <Receipt size={14} /> },
  ]},
  { group: "Other", items: [
    { value: "Other", label: "Other", icon: <FileText size={14} /> },
  ]},
];

const allCategoryItems = filingCategories.flatMap(g => g.items);

const categoryIcons: Record<string, React.ReactNode> = Object.fromEntries(
  allCategoryItems.map(c => [c.value, c.icon])
);

export default function DocumentsPage() {
  const { userRole, session } = useAuth();
  const [files, setFiles] = useState<DbFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const canManage = userRole === "admin" || userRole === "office";

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("file_assets").update({ status: "archived" }).eq("id", deleteId);
    if (error) {
      toast({ title: "Error", description: "Failed to delete document", variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: "Document removed successfully" });
      fetchFiles();
    }
    setDeleteId(null);
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    const { error } = await supabase.from("file_assets").update({ status: "archived" }).in("id", ids);
    if (error) {
      toast({ title: "Error", description: "Failed to delete documents", variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: `${ids.length} document(s) removed successfully` });
      setSelected(new Set());
      fetchFiles();
    }
    setBulkDeleteOpen(false);
  };

  const handleRefile = async (fileId: string, newCategory: string) => {
    const { error } = await supabase.from("file_assets").update({ category: newCategory }).eq("id", fileId);
    if (error) {
      toast({ title: "Error", description: "Failed to update category", variant: "destructive" });
    } else {
      toast({ title: "Filed", description: `Document moved to ${newCategory}` });
      fetchFiles();
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(f => f.id)));
    }
  };

  const fetchFiles = useCallback(async () => {
    const { data } = await supabase.from("file_assets").select("*").eq("status", "active").order("created_at", { ascending: false });
    setFiles(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const filtered = useMemo(() => {
    if (!search.trim()) return files;
    const q = search.toLowerCase();
    return files.filter(f => f.title.toLowerCase().includes(q) || f.category.toLowerCase().includes(q));
  }, [files, search]);

  const reqAck = files.filter(f => f.requires_acknowledgement);

  const handleViewDocument = async (file: DbFile) => {
    if (!file.file_reference) return;
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-gmail`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session?.access_token}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ action: "view_file_asset", file_reference: file.file_reference }),
        }
      );
      if (!resp.ok) {
        toast({ title: "Error", description: "Could not load document", variant: "destructive" });
        return;
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.download = file.title || "document";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      toast({ title: "Error", description: "Failed to load document", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-mono font-bold text-foreground">Documents</h2>
          <p className="text-sm text-muted-foreground">SOPs, safety docs, and compliance tracking</p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && selected.size > 0 && (
            <button
              onClick={() => setBulkDeleteOpen(true)}
              className="flex items-center gap-2 rounded-md bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors"
            >
              <Trash2 size={16} /> Delete {selected.size}
            </button>
          )}
          {canManage && (
            <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              <Upload size={16} /> Upload
            </button>
          )}
        </div>
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
          <p className="text-2xl font-mono font-bold text-accent">{new Set(files.map(f => f.category)).size}</p>
          <p className="text-xs text-muted-foreground mt-1">Categories</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input type="text" placeholder="Search documents..." value={search} onChange={e => setSearch(e.target.value)} className="w-full h-10 rounded-md border border-input bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
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
            {canManage && filtered.length > 0 && (
              <div className="px-4 py-2 bg-secondary/20 flex items-center gap-3">
                <Checkbox
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-xs text-muted-foreground">
                  {selected.size > 0 ? `${selected.size} selected` : "Select all"}
                </span>
              </div>
            )}
            {filtered.map(file => (
              <div key={file.id} className={cn("p-4 hover:bg-secondary/30 transition-colors", selected.has(file.id) && "bg-primary/5")}>
                <div className="flex items-start gap-3">
                  {canManage && (
                    <div className="pt-2 shrink-0">
                      <Checkbox
                        checked={selected.has(file.id)}
                        onCheckedChange={() => toggleSelect(file.id)}
                      />
                    </div>
                  )}
                  <div className="h-10 w-10 rounded-md bg-secondary flex items-center justify-center shrink-0 text-secondary-foreground">
                    {categoryIcons[file.category] || <FileText size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{file.title}</p>
                      {file.requires_acknowledgement && <AlertTriangle size={12} className="text-warning shrink-0" />}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] font-mono text-muted-foreground uppercase">{file.category}</span>
                      <span className="text-[10px] text-muted-foreground">v{file.version}</span>
                      <span className="text-[10px] text-muted-foreground">{new Date(file.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {file.file_reference && (
                      <button
                        onClick={() => handleViewDocument(file)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                      >
                        <Eye size={14} />
                        View
                      </button>
                    )}
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
                            <FolderOpen size={14} />
                            File As
                            <ChevronDown size={12} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52 max-h-72 overflow-y-auto">
                          {filingCategories.map((group, gi) => (
                            <div key={group.group}>
                              {gi > 0 && <DropdownMenuSeparator />}
                              <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">{group.group}</DropdownMenuLabel>
                              {group.items.map(item => (
                                <DropdownMenuItem
                                  key={item.value}
                                  onClick={() => handleRefile(file.id, item.value)}
                                  className={cn("flex items-center gap-2 text-xs", file.category === item.value && "bg-primary/10 font-semibold")}
                                >
                                  {item.icon}
                                  {item.label}
                                  {file.category === item.value && <span className="ml-auto text-[10px] text-primary">current</span>}
                                </DropdownMenuItem>
                              ))}
                            </div>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {canManage && (
                      <button
                        onClick={() => setDeleteId(file.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-destructive/30 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>This will archive the document. It won't appear in the list anymore.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} document{selected.size !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>This will archive all selected documents. They won't appear in the list anymore.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete {selected.size}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DocumentDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={fetchFiles} />
    </div>
  );
}
