import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import SignaturePad from "@/components/SignaturePad";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  ClipboardCheck, MapPin, Camera, Check, ArrowLeft, Loader2,
} from "lucide-react";

interface GeoLocation { lat: number; lng: number; accuracy: number }

export default function InstallSignOffPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { tenantId, user } = useAuth();

  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [signedByName, setSignedByName] = useState("");
  const [signedByRole, setSignedByRole] = useState("customer");
  const [notes, setNotes] = useState("");
  const [followUp, setFollowUp] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [geo, setGeo] = useState<GeoLocation | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);

  // Load job
  useEffect(() => {
    if (!jobId) return;
    supabase.from("jobs").select("*").eq("id", jobId).single().then(({ data }) => {
      setJob(data);
      setLoading(false);
    });
  }, [jobId]);

  // Capture geo
  const captureGeo = useCallback(() => {
    if (!navigator.geolocation) { toast.error("Geolocation not supported"); return; }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGeoLoading(false);
        toast.success("Location captured");
      },
      () => { setGeoLoading(false); toast.error("Location access denied"); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // Handle photos
  const handlePhotoAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (photos.length + files.length > 5) { toast.error("Max 5 photos"); return; }
    setPhotos(prev => [...prev, ...files]);
    const urls = files.map(f => URL.createObjectURL(f));
    setPhotoPreviewUrls(prev => [...prev, ...urls]);
  };

  const removePhoto = (idx: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
    setPhotoPreviewUrls(prev => prev.filter((_, i) => i !== idx));
  };

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signatureData) { toast.error("Signature required"); return; }
    if (!customerName.trim()) { toast.error("Customer name required"); return; }
    if (!signedByName.trim()) { toast.error("Signed-by name required"); return; }
    if (!tenantId || !jobId) return;

    setSubmitting(true);
    try {
      // Upload signature
      const sigBlob = await fetch(signatureData).then(r => r.blob());
      const sigPath = `${tenantId}/${jobId}/signature-${Date.now()}.png`;
      await supabase.storage.from("install-signoffs").upload(sigPath, sigBlob, { contentType: "image/png" });

      // Upload photos
      const uploadedPhotoPaths: string[] = [];
      for (const photo of photos) {
        const path = `${tenantId}/${jobId}/photo-${Date.now()}-${photo.name}`;
        await supabase.storage.from("install-signoffs").upload(path, photo, { contentType: photo.type });
        uploadedPhotoPaths.push(path);
      }

      // Insert sign-off record
      const { error } = await (supabase.from("install_signoffs") as any).insert([{
        job_id: jobId,
        tenant_id: tenantId,
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim() || null,
        signed_by_name: signedByName.trim(),
        signed_by_role: signedByRole,
        signature_image_reference: sigPath,
        photos: uploadedPhotoPaths.length > 0 ? uploadedPhotoPaths : null,
        geo_location: geo ? { lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy } : null,
        notes: notes.trim() || null,
        follow_up_required: followUp,
        status: "signed",
      }]);

      if (error) throw error;
      toast.success("Install sign-off saved!");
      navigate(`/jobs/${jobId}/builder`);
    } catch (err: any) {
      toast.error(err.message || "Failed to save sign-off");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  if (!job) return <div className="p-8 text-center text-sm text-muted-foreground">Job not found</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-slide-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-md hover:bg-secondary/50 transition-colors">
          <ArrowLeft size={18} className="text-muted-foreground" />
        </button>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <ClipboardCheck size={20} className="text-primary" />
            <h2 className="text-xl font-mono font-bold text-foreground">Install Sign-Off</h2>
          </div>
          <p className="text-sm text-muted-foreground">{job.job_id} — {job.job_name}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Customer Details */}
        <fieldset className="glass-panel rounded-lg p-5 space-y-4">
          <legend className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-wider px-1">Customer Details</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Customer Name *</label>
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} required
                className="w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Email (optional)</label>
              <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Signed By *</label>
              <input value={signedByName} onChange={e => setSignedByName(e.target.value)} required
                className="w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Role</label>
              <select value={signedByRole} onChange={e => setSignedByRole(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="customer">Customer</option>
                <option value="site_manager">Site Manager</option>
                <option value="contractor">Contractor</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </fieldset>

        {/* Signature */}
        <fieldset className="glass-panel rounded-lg p-5 space-y-3">
          <legend className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-wider px-1">Digital Signature *</legend>
          <SignaturePad onSignature={setSignatureData} />
        </fieldset>

        {/* Photos */}
        <fieldset className="glass-panel rounded-lg p-5 space-y-3">
          <legend className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-wider px-1">Site Photos</legend>
          <div className="flex flex-wrap gap-3">
            {photoPreviewUrls.map((url, i) => (
              <div key={i} className="relative w-20 h-20 rounded-md overflow-hidden border border-border">
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button type="button" onClick={() => removePhoto(i)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-[10px]">×</button>
              </div>
            ))}
            {photos.length < 5 && (
              <label className="w-20 h-20 rounded-md border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors">
                <Camera size={16} className="text-muted-foreground mb-1" />
                <span className="text-[9px] text-muted-foreground">Add</span>
                <input type="file" accept="image/*" capture="environment" onChange={handlePhotoAdd} className="hidden" multiple />
              </label>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">{photos.length}/5 photos</p>
        </fieldset>

        {/* Location & Notes */}
        <fieldset className="glass-panel rounded-lg p-5 space-y-4">
          <legend className="text-[10px] font-mono font-medium text-muted-foreground uppercase tracking-wider px-1">Additional Info</legend>
          
          <div className="flex items-center gap-3">
            <button type="button" onClick={captureGeo} disabled={geoLoading}
              className={cn("flex items-center gap-2 px-3 py-2 rounded-md border text-xs font-medium transition-colors",
                geo ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : "border-border text-foreground hover:bg-secondary/50")}>
              {geoLoading ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
              {geo ? `${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}` : "Capture Location"}
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={followUp} onChange={e => setFollowUp(e.target.checked)}
              className="rounded border-border" />
            <span className="text-sm text-foreground">Follow-up required</span>
          </label>
        </fieldset>

        {/* Submit */}
        <button type="submit" disabled={submitting || !signatureData}
          className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
          {submitting ? "Saving…" : "Complete Sign-Off"}
        </button>
      </form>
    </div>
  );
}
