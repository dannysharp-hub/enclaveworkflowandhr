import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Camera, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CompletionPhotosProps {
  jobId: string;
  companyId: string;
}

export default function CompletionPhotos({ jobId, companyId }: CompletionPhotosProps) {
  const [photos, setPhotos] = useState<{ name: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  const basePath = `${jobId}/completion`;

  const loadPhotos = async () => {
    const { data } = await supabase.storage.from("job-photos").list(basePath, { limit: 50 });
    if (data && data.length > 0) {
      const urls = data
        .filter(f => !f.id?.startsWith("."))
        .map(f => {
          const { data: urlData } = supabase.storage.from("job-photos").getPublicUrl(`${basePath}/${f.name}`);
          return { name: f.name, url: urlData.publicUrl };
        });
      setPhotos(urls);
    } else {
      setPhotos([]);
    }
    setLoading(false);
  };

  useEffect(() => { loadPhotos(); }, [jobId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);

    try {
      for (const file of files) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${basePath}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from("job-photos").upload(path, file, { contentType: file.type });
        if (error) throw error;
      }
      toast({ title: `${files.length} photo(s) uploaded` });
      await loadPhotos();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm font-bold text-foreground flex items-center gap-2">
          <Camera size={14} className="text-primary" /> Completion Photos
        </h3>
        <label>
          <Button size="sm" variant="outline" asChild disabled={uploading}>
            <span className="cursor-pointer">
              {uploading ? <Loader2 size={14} className="animate-spin mr-1" /> : <Camera size={14} className="mr-1" />}
              {uploading ? "Uploading…" : "Add Photos"}
            </span>
          </Button>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={handleUpload} />
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
      ) : photos.length === 0 ? (
        <p className="text-xs text-muted-foreground">No completion photos yet.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photos.map((photo) => (
            <a key={photo.name} href={photo.url} target="_blank" rel="noopener noreferrer"
              className="aspect-square rounded-md overflow-hidden border border-border hover:border-primary/50 transition-colors">
              <img src={photo.url} alt="" className="w-full h-full object-cover" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
