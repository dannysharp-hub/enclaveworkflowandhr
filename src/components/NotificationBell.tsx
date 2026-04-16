import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Bell, X, ExternalLink, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  link: string | null;
  created_at: string;
}

export default function NotificationBell() {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingApprovals, setPendingApprovals] = useState(0);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    const items = (data ?? []) as Notification[];
    setNotifications(items);
    setUnreadCount(items.filter(n => !n.read).length);
  }, [user]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  // Fetch pending approval count for admins
  useEffect(() => {
    if (!user || userRole !== "admin") return;
    const fetchApprovals = async () => {
      const { count } = await (supabase.from("cab_approval_requests") as any)
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      setPendingApprovals(count || 0);
    };
    fetchApprovals();
    const interval = setInterval(fetchApprovals, 30000);
    return () => clearInterval(interval);
  }, [user, userRole]);

  // Realtime subscription for new notifications
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications(prev => [newNotif, ...prev].slice(0, 30));
          setUnreadCount(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from("notifications").update({ read: true }).in("id", unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const handleClick = (n: Notification) => {
    if (!n.read) markRead(n.id);
    if (n.link) {
      navigate(n.link);
      setOpen(false);
    }
  };

  const timeAgo = (dateStr: string) => {
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  const typeColour = (type: string) => {
    switch (type) {
      case "warning": return "bg-warning";
      case "error": return "bg-destructive";
      case "success": return "bg-primary";
      default: return "bg-primary";
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative h-9 w-9 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
      >
        <Bell size={16} />
        {(unreadCount + pendingApprovals) > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-[16px] flex items-center justify-center rounded-full bg-destructive text-[10px] font-mono font-bold text-destructive-foreground px-1 animate-pulse">
            {(unreadCount + pendingApprovals) > 9 ? "9+" : (unreadCount + pendingApprovals)}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 z-50 rounded-lg border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between p-3 border-b border-border">
              <h3 className="font-mono text-xs font-bold text-foreground">NOTIFICATIONS</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-[10px] text-primary hover:underline font-medium">
                    Mark all read
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {/* Pending approvals banner for admins */}
              {pendingApprovals > 0 && (
                <button
                  onClick={() => { navigate("/admin/approvals"); setOpen(false); }}
                  className="w-full text-left p-3 border-b border-border bg-primary/5 hover:bg-primary/10 transition-colors flex items-center gap-2"
                >
                  <ShieldCheck size={14} className="text-primary" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-foreground">{pendingApprovals} pending approval{pendingApprovals !== 1 ? "s" : ""}</p>
                    <p className="text-[10px] text-muted-foreground">Review and approve team requests</p>
                  </div>
                </button>
              )}
              {notifications.length === 0 && pendingApprovals === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No notifications</div>
              ) : notifications.length === 0 ? null : (
                notifications.map(n => (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={cn(
                      "w-full text-left p-3 border-b border-border last:border-0 hover:bg-secondary/30 transition-colors",
                      !n.read && "bg-primary/5"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && <div className={cn("mt-1.5 w-2 h-2 rounded-full shrink-0", typeColour(n.type))} />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn("text-xs font-medium truncate", !n.read ? "text-foreground" : "text-muted-foreground")}>
                            {n.title}
                          </p>
                          <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(n.created_at)}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-line">
                          {n.message}
                        </p>
                        {n.link && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-primary mt-1">
                            <ExternalLink size={8} /> View
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
