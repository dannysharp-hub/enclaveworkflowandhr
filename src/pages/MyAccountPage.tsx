import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { User, KeyRound, Shield, Clock } from "lucide-react";
import { format } from "date-fns";
import { logActivity } from "@/lib/activityLogger";

export default function MyAccountPage() {
  const { user, profile, userRole } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.full_name || "");
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPw, setChangingPw] = useState(false);

  const handleNameChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: displayName.trim() })
        .eq("user_id", user?.id);
      if (error) throw error;

      await supabase.auth.updateUser({ data: { full_name: displayName.trim() } });
      toast({ title: "Name updated" });
      logActivity({ action: "display_name_changed", resourceType: "profile" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    setChangingPw(true);
    try {
      // Re-authenticate with current password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || "",
        password: currentPassword,
      });
      if (signInError) {
        toast({ title: "Current password is incorrect", variant: "destructive" });
        setChangingPw(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: "Password changed successfully" });
      logActivity({ action: "password_changed", resourceType: "profile" });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-mono font-bold text-foreground">My Account</h1>
        <p className="text-sm text-muted-foreground">Manage your profile and security settings</p>
      </div>

      {/* Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User size={16} /> Profile
          </CardTitle>
          <CardDescription>Your account details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Shield size={14} />
              <span>Role:</span>
            </div>
            <Badge variant="secondary">{userRole || "—"}</Badge>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock size={14} />
              <span>Email:</span>
            </div>
            <span className="text-foreground">{user?.email}</span>
          </div>

          <form onSubmit={handleNameChange} className="space-y-3 pt-2">
            <div>
              <Label className="text-xs font-mono text-muted-foreground">DISPLAY NAME</Label>
              <Input
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                required
                className="mt-1"
              />
            </div>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Update Name"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Change Password Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound size={16} /> Change Password
          </CardTitle>
          <CardDescription>Update your password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <div>
              <Label className="text-xs font-mono text-muted-foreground">CURRENT PASSWORD</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-mono text-muted-foreground">NEW PASSWORD</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-mono text-muted-foreground">CONFIRM NEW PASSWORD</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="mt-1"
              />
            </div>
            <Button type="submit" size="sm" disabled={changingPw}>
              {changingPw ? "Changing…" : "Change Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
