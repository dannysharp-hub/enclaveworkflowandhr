import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Copy, UserPlus, Check, Clock } from "lucide-react";
import { format } from "date-fns";

export default function TeamPage() {
  const [invites, setInvites] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("staff");
  const [creating, setCreating] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Get current user's company
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await (supabase.from("cab_user_profiles") as any)
      .select("company_id")
      .eq("id", user.id)
      .single();

    if (!profile) return;
    setCompanyId(profile.company_id);

    const [invitesRes, membersRes] = await Promise.all([
      (supabase.from("cab_company_invites") as any)
        .select("*")
        .eq("company_id", profile.company_id)
        .order("created_at", { ascending: false }),
      (supabase.from("cab_user_profiles") as any)
        .select("id, name, email, role, is_active, created_at")
        .eq("company_id", profile.company_id)
        .order("name"),
    ]);

    setInvites(invitesRes.data ?? []);
    setMembers(membersRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !email.trim()) return;
    setCreating(true);
    try {
      const { error } = await (supabase.from("cab_company_invites") as any).insert({
        company_id: companyId,
        email: email.trim().toLowerCase(),
        role,
      });
      if (error) throw error;
      toast({ title: "Invite created", description: `Invite sent to ${email}` });
      setEmail("");
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Copied", description: "Invite link copied to clipboard" });
  };

  if (loading) {
    return <div className="p-6 text-muted-foreground text-sm">Loading team…</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-mono font-bold text-foreground">Team</h1>
        <p className="text-sm text-muted-foreground">Manage team members and invitations</p>
      </div>

      {/* Invite form */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="font-mono text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <UserPlus size={16} className="text-primary" /> Invite Team Member
        </h2>
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
          <Input
            type="email"
            placeholder="email@company.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="flex-1"
          />
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="staff">Staff</SelectItem>
              <SelectItem value="installer">Installer</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" disabled={creating} size="sm">
            {creating ? "Sending…" : "Send Invite"}
          </Button>
        </form>
      </div>

      {/* Active members */}
      <div className="rounded-lg border border-border bg-card">
        <div className="p-4 border-b border-border">
          <h2 className="font-mono text-sm font-bold text-foreground">
            Active Members ({members.length})
          </h2>
        </div>
        <div className="divide-y divide-border">
          {members.map(m => (
            <div key={m.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{m.name}</p>
                <p className="text-xs text-muted-foreground">{m.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={m.role === "admin" ? "default" : "secondary"}>
                  {m.role}
                </Badge>
                {!m.is_active && <Badge variant="outline" className="text-destructive">Inactive</Badge>}
              </div>
            </div>
          ))}
          {members.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No members yet</p>
          )}
        </div>
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="p-4 border-b border-border">
            <h2 className="font-mono text-sm font-bold text-foreground">
              Pending Invites ({invites.filter(i => !i.accepted_at).length})
            </h2>
          </div>
          <div className="divide-y divide-border">
            {invites.map(inv => {
              const expired = new Date(inv.expires_at) < new Date();
              const accepted = !!inv.accepted_at;
              return (
                <div key={inv.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(inv.created_at), "dd MMM yyyy")} · Expires {format(new Date(inv.expires_at), "dd MMM")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{inv.role}</Badge>
                    {accepted ? (
                      <Badge variant="default" className="gap-1"><Check size={10} /> Accepted</Badge>
                    ) : expired ? (
                      <Badge variant="outline" className="text-destructive">Expired</Badge>
                    ) : (
                      <>
                        <Badge variant="outline" className="gap-1"><Clock size={10} /> Pending</Badge>
                        <Button size="sm" variant="ghost" onClick={() => copyInviteLink(inv.token)}>
                          <Copy size={12} />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
