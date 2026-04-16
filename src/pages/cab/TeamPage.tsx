import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import {
  UserPlus, Clock, Lock, Unlock, Trash2, KeyRound, ShieldAlert,
  MoreHorizontal, Copy, Check,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { logActivity } from "@/lib/activityLogger";

interface UserRow {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  locked: boolean;
  failed_login_attempts: number;
  locked_at: string | null;
  last_active_at: string | null;
  active: boolean;
  department?: string;
}

export default function TeamPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);

  // Invite form
  const [invEmail, setInvEmail] = useState("");
  const [invName, setInvName] = useState("");
  const [invRole, setInvRole] = useState("office");
  const [creating, setCreating] = useState(false);

  // Create user form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newRole, setNewRole] = useState("office");

  // Confirm dialogs
  const [confirmAction, setConfirmAction] = useState<{ type: string; userId: string; name: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const callManageStaff = async (action: string, body?: Record<string, unknown>, method = "POST") => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-staff?action=${action}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  };

  const load = useCallback(async () => {
    try {
      // Get company for invites
      const { data: membership } = await (supabase.from("cab_company_memberships") as any)
        .select("company_id")
        .eq("user_id", user?.id)
        .limit(1)
        .single();
      if (membership) setCompanyId(membership.company_id);

      const [usersData, invitesRes] = await Promise.all([
        callManageStaff("list-users", undefined, "GET"),
        membership
          ? (supabase.from("cab_company_invites") as any)
              .select("*")
              .eq("company_id", membership.company_id)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] }),
      ]);

      setUsers(usersData.users || []);
      setInvites(invitesRes.data ?? []);
    } catch (err: any) {
      toast({ title: "Error loading team", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const handleRoleChange = async (userId: string, newRole: string, name: string) => {
    try {
      await callManageStaff("update-role", { user_id: userId, role: newRole });
      toast({ title: "Role updated", description: `${name} is now ${newRole}` });
      logActivity({ action: "role_changed", resourceType: "user", resourceId: userId, resourceName: name, metadata: { new_role: newRole } });
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleAction = async () => {
    if (!confirmAction) return;
    setActionLoading(true);
    try {
      const { type, userId, name } = confirmAction;
      if (type === "lock") {
        await callManageStaff("lock", { user_id: userId });
        toast({ title: "Account locked", description: `${name} has been locked` });
        logActivity({ action: "account_locked", resourceType: "user", resourceId: userId, resourceName: name });
      } else if (type === "unlock") {
        await callManageStaff("unlock", { user_id: userId });
        toast({ title: "Account unlocked", description: `${name} has been unlocked` });
        logActivity({ action: "account_unlocked", resourceType: "user", resourceId: userId, resourceName: name });
      } else if (type === "delete") {
        await callManageStaff("delete-user", { user_id: userId });
        toast({ title: "User deleted", description: `${name} has been removed` });
        logActivity({ action: "user_deleted", resourceType: "user", resourceId: userId, resourceName: name });
      } else if (type === "force-reset") {
        const u = users.find(u => u.user_id === userId);
        await callManageStaff("force-password-reset", { email: u?.email });
        toast({ title: "Password reset sent", description: `Reset email sent to ${u?.email}` });
        logActivity({ action: "force_password_reset", resourceType: "user", resourceId: userId, resourceName: name });
      }
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await callManageStaff("create", {
        email: newEmail.trim().toLowerCase(),
        password: newPass,
        full_name: newName.trim(),
        role: newRole,
      });
      toast({ title: "User created", description: `${newName} added successfully` });
      logActivity({ action: "user_created", resourceType: "user", resourceName: newName });
      setShowCreate(false);
      setNewName(""); setNewEmail(""); setNewPass(""); setNewRole("office");
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !invEmail.trim()) return;
    setCreating(true);
    try {
      // Also insert into cab_company_invites for record keeping
      await (supabase.from("cab_company_invites") as any).insert({
        company_id: companyId,
        email: invEmail.trim().toLowerCase(),
        role: invRole,
      });

      // Create user account and send invite email via edge function
      const res = await supabase.functions.invoke("manage-staff?action=invite", {
        body: {
          email: invEmail.trim().toLowerCase(),
          full_name: invEmail.trim().split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          role: invRole,
          company_id: companyId,
        },
      });

      if (res.error) throw new Error(res.error.message);
      if (res.data?.error) throw new Error(res.data.error);

      toast({ title: "Invite sent", description: `Setup email sent to ${invEmail}` });
      logActivity({ action: "user_invited", resourceType: "user", resourceName: invEmail });
      setInvEmail("");
      load();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-muted-foreground text-sm">Loading team…</div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground">Manage team members, roles, and account security</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <UserPlus size={14} className="mr-1.5" /> Create User
        </Button>
      </div>

      {/* Create User Form */}
      {showCreate && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-mono text-sm font-bold text-foreground mb-3">Create New User</h2>
          <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input placeholder="Full name" value={newName} onChange={e => setNewName(e.target.value)} required />
            <Input type="email" placeholder="Email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required />
            <Input type="password" placeholder="Temporary password" value={newPass} onChange={e => setNewPass(e.target.value)} required minLength={6} />
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="office">Office</SelectItem>
                <SelectItem value="supervisor">Supervisor</SelectItem>
                <SelectItem value="production">Production</SelectItem>
                <SelectItem value="installer">Installer</SelectItem>
                <SelectItem value="finance">Finance</SelectItem>
              </SelectContent>
            </Select>
            <div className="sm:col-span-2 flex gap-2">
              <Button type="submit" size="sm" disabled={creating}>
                {creating ? "Creating…" : "Create User"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      {/* Users Table */}
      <div className="rounded-lg border border-border bg-card">
        <div className="p-4 border-b border-border">
          <h2 className="font-mono text-sm font-bold text-foreground">
            All Users ({users.length})
          </h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Active</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map(u => (
              <TableRow key={u.user_id}>
                <TableCell className="font-medium text-foreground">
                  <div className="flex items-center gap-2">
                    {u.full_name || "—"}
                    {u.locked && (
                      <Badge variant="destructive" className="gap-1 text-[10px] px-1.5 py-0">
                        <Lock size={10} /> LOCKED
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">{u.email}</TableCell>
                <TableCell>
                  <Select
                    value={u.role}
                    onValueChange={val => handleRoleChange(u.user_id, val, u.full_name)}
                  >
                    <SelectTrigger className="h-7 w-[120px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="office">Office</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                      <SelectItem value="production">Production</SelectItem>
                      <SelectItem value="installer">Installer</SelectItem>
                      <SelectItem value="finance">Finance</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {u.locked ? (
                    <Badge variant="destructive" className="text-[10px]">Locked</Badge>
                  ) : u.active === false ? (
                    <Badge variant="outline" className="text-destructive text-[10px]">Inactive</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">Active</Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {u.last_active_at ? (
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {format(new Date(u.last_active_at), "dd MMM, HH:mm")}
                    </span>
                  ) : "—"}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                        <MoreHorizontal size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {u.locked ? (
                        <DropdownMenuItem onClick={() => setConfirmAction({ type: "unlock", userId: u.user_id, name: u.full_name })}>
                          <Unlock size={14} className="mr-2" /> Unlock Account
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => setConfirmAction({ type: "lock", userId: u.user_id, name: u.full_name })}>
                          <Lock size={14} className="mr-2" /> Lock Account
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => setConfirmAction({ type: "force-reset", userId: u.user_id, name: u.full_name })}>
                        <KeyRound size={14} className="mr-2" /> Force Password Reset
                      </DropdownMenuItem>
                      {u.user_id !== user?.id && (
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setConfirmAction({ type: "delete", userId: u.user_id, name: u.full_name })}
                        >
                          <Trash2 size={14} className="mr-2" /> Delete User
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Invite Section */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="font-mono text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <UserPlus size={16} className="text-primary" /> Invite Team Member
        </h2>
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
          <Input
            type="email"
            placeholder="email@company.com"
            value={invEmail}
            onChange={e => setInvEmail(e.target.value)}
            required
            className="flex-1"
          />
          <Select value={invRole} onValueChange={setInvRole}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="office">Office</SelectItem>
              <SelectItem value="supervisor">Supervisor</SelectItem>
              <SelectItem value="production">Production</SelectItem>
              <SelectItem value="installer">Installer</SelectItem>
              <SelectItem value="finance">Finance</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" disabled={creating} size="sm">Send Invite</Button>
        </form>
      </div>

      {/* Pending Invites */}
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
                        <Button size="sm" variant="ghost" onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/invite/${inv.token}`);
                          toast({ title: "Copied", description: "Invite link copied" });
                        }}>
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

      {/* Confirm Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "lock" && "Lock Account"}
              {confirmAction?.type === "unlock" && "Unlock Account"}
              {confirmAction?.type === "delete" && "Delete User"}
              {confirmAction?.type === "force-reset" && "Force Password Reset"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "lock" && `Are you sure you want to lock ${confirmAction.name}'s account? They will not be able to log in.`}
              {confirmAction?.type === "unlock" && `Unlock ${confirmAction.name}'s account? This will also reset their failed login attempts.`}
              {confirmAction?.type === "delete" && `Permanently delete ${confirmAction.name}'s account? This cannot be undone.`}
              {confirmAction?.type === "force-reset" && `Send a password reset email to ${confirmAction.name}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAction} disabled={actionLoading}>
              {actionLoading ? "Processing…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
