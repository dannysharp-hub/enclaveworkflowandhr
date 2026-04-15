import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Landmark, RefreshCw, Check, ExternalLink } from "lucide-react";
import { format } from "date-fns";

interface BankAccount {
  id: string;
  account_name: string;
  provider_name: string | null;
  account_type: string;
  sort_code: string | null;
  account_number_last4: string | null;
  last_synced_at: string | null;
  is_active: boolean;
}

export default function BankConnectionSettings() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<{ connected: boolean; status?: string; last_updated?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [statusRes, accountsRes] = await Promise.all([
        supabase.functions.invoke("truelayer-banking", { body: { action: "status" } }),
        supabase.functions.invoke("truelayer-banking", { body: { action: "get_accounts" } }),
      ]);
      setConnectionStatus(statusRes.data);
      setAccounts(accountsRes.data?.accounts || []);
    } catch {
      // Not connected yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (code && state === "truelayer_connect") {
      window.history.replaceState({}, "", window.location.pathname);
      (async () => {
        try {
          const redirectUri = `${window.location.origin}/settings`;
          await supabase.functions.invoke("truelayer-banking", {
            body: { action: "exchange_code", code, redirect_uri: redirectUri },
          });
          // Sync accounts after connecting
          await supabase.functions.invoke("truelayer-banking", { body: { action: "sync_accounts" } });
          toast({ title: "Bank connected", description: "Monzo account linked successfully" });
          load();
        } catch (err: any) {
          toast({ title: "Connection failed", description: err.message, variant: "destructive" });
        }
      })();
    }
  }, [load]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const redirectUri = `${window.location.origin}/settings`;
      const res = await supabase.functions.invoke("truelayer-banking", {
        body: { action: "get_auth_url", redirect_uri: redirectUri },
      });
      if (res.data?.auth_url) {
        // Add state param for callback identification
        const url = new URL(res.data.auth_url);
        url.searchParams.set("state", "truelayer_connect");
        window.location.href = url.toString();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setConnecting(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const [acctRes, txnRes] = await Promise.all([
        supabase.functions.invoke("truelayer-banking", { body: { action: "sync_accounts" } }),
        supabase.functions.invoke("truelayer-banking", { body: { action: "sync_transactions" } }),
      ]);
      const synced = txnRes.data?.synced || 0;
      const matched = txnRes.data?.matches || 0;
      toast({
        title: "Sync complete",
        description: `${synced} transactions synced, ${matched} auto-matched`,
      });
      load();
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading bank connection…</div>;
  }

  const isConnected = connectionStatus?.connected && connectionStatus.status === "active";

  return (
    <div className="glass-panel rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Landmark size={16} className="text-primary" />
          <h3 className="font-mono text-sm font-bold text-foreground">Open Banking (TrueLayer)</h3>
        </div>
        {isConnected ? (
          <Badge variant="default" className="gap-1"><Check size={10} /> Connected</Badge>
        ) : (
          <Badge variant="outline">Not connected</Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Connect your Monzo business account to automatically sync transactions and match costs to jobs.
      </p>

      {!isConnected ? (
        <Button onClick={handleConnect} disabled={connecting} size="sm" className="gap-2">
          <Landmark size={14} />
          {connecting ? "Redirecting…" : "Connect Bank Account"}
        </Button>
      ) : (
        <>
          {/* Connected accounts */}
          <div className="space-y-2">
            {accounts.map(acct => (
              <div key={acct.id} className="flex items-center justify-between p-3 rounded-md border border-border bg-background">
                <div>
                  <p className="text-sm font-medium text-foreground">{acct.account_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {acct.provider_name || "Bank"} · {acct.sort_code || "—"} · ****{acct.account_number_last4 || "—"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">
                    Last synced: {acct.last_synced_at ? format(new Date(acct.last_synced_at), "dd MMM HH:mm") : "Never"}
                  </p>
                </div>
              </div>
            ))}
            {accounts.length === 0 && (
              <p className="text-xs text-muted-foreground">No accounts found. Click Sync to fetch.</p>
            )}
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSyncNow} disabled={syncing} size="sm" variant="outline" className="gap-2">
              <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Syncing…" : "Sync Now"}
            </Button>
            <Button size="sm" variant="ghost" className="gap-2" onClick={() => window.open("/finance/bank", "_blank")}>
              <ExternalLink size={12} /> View Reconciliation
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
