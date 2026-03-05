import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Landmark, RefreshCw, Link2, Unlink, Check, X, FileText, ChevronDown,
  ArrowDownLeft, ArrowUpRight, Search, ExternalLink, Loader2,
} from "lucide-react";

interface BankTransaction {
  id: string;
  transaction_date: string;
  amount: number;
  description: string;
  counterparty_name: string | null;
  transaction_type: string | null;
  transaction_category: string | null;
  status: string;
  bank_accounts?: { account_name: string; provider_name: string | null };
}

interface Match {
  id: string;
  bank_transaction_id: string;
  file_asset_id: string | null;
  bill_id: string | null;
  invoice_id: string | null;
  match_type: string;
  confidence_score: number;
  match_reason: string | null;
  status: string;
  bank_transactions: BankTransaction;
  file_assets: { id: string; title: string; category: string } | null;
  bills: { id: string; bill_reference: string; amount_ex_vat: number } | null;
  invoices: { id: string; invoice_number: string; total_amount: number } | null;
}

interface BankAccount {
  id: string;
  account_name: string;
  provider_name: string | null;
  account_type: string;
  sort_code: string | null;
  account_number_last4: string | null;
  last_synced_at: string | null;
}

interface MatchableDoc {
  id: string;
  title: string;
  type: "file" | "bill" | "invoice";
}

async function callBanking(session: { access_token: string }, action: string, params: Record<string, unknown> = {}) {
  const resp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/truelayer-banking`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ action, ...params }),
    }
  );
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${resp.status}`);
  }
  return resp.json();
}

export default function BankReconciliationPage() {
  const { session, userRole } = useAuth();
  const [tab, setTab] = useState("unmatched");
  const [connected, setConnected] = useState<boolean | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [manualMatchTxn, setManualMatchTxn] = useState<string | null>(null);
  const [matchableDocs, setMatchableDocs] = useState<MatchableDoc[]>([]);

  const canManage = userRole === "admin" || userRole === "office" || userRole === "finance";

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const [statusRes, txnRes, matchRes, acctRes] = await Promise.all([
        callBanking(session, "status"),
        callBanking(session, "get_transactions", { limit: 500 }),
        callBanking(session, "get_matches"),
        callBanking(session, "get_accounts"),
      ]);
      setConnected(statusRes.connected);
      setTransactions(txnRes.transactions || []);
      setMatches(matchRes.matches || []);
      setAccounts(acctRes.accounts || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [session]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleConnect = async () => {
    if (!session) return;
    try {
      const redirectUri = `${window.location.origin}/finance/bank`;
      const { auth_url } = await callBanking(session, "get_auth_url", { redirect_uri: redirectUri });
      window.location.href = auth_url;
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    }
  };

  // Handle OAuth callback
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    if (code && session) {
      const redirectUri = `${window.location.origin}/finance/bank`;
      callBanking(session, "exchange_code", { code, redirect_uri: redirectUri })
        .then(() => {
          toast({ title: "Connected", description: "Bank account linked successfully" });
          window.history.replaceState({}, "", "/finance/bank");
          return callBanking(session, "sync_accounts");
        })
        .then(() => loadData())
        .catch((err) =>
          toast({ title: "Error", description: String(err), variant: "destructive" })
        );
    }
  }, [session, loadData]);

  const handleSync = async () => {
    if (!session) return;
    setSyncing(true);
    try {
      await callBanking(session, "sync_accounts");
      const result = await callBanking(session, "sync_transactions");
      toast({
        title: "Synced",
        description: `${result.synced} transactions imported, ${result.matches} auto-matched`,
      });
      await loadData();
    } catch (err) {
      toast({ title: "Sync failed", description: String(err), variant: "destructive" });
    }
    setSyncing(false);
  };

  const handleConfirmMatch = async (matchId: string) => {
    if (!session) return;
    try {
      await callBanking(session, "confirm_match", { match_id: matchId });
      toast({ title: "Confirmed" });
      loadData();
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    }
  };

  const handleRejectMatch = async (matchId: string) => {
    if (!session) return;
    try {
      await callBanking(session, "reject_match", { match_id: matchId });
      toast({ title: "Rejected" });
      loadData();
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    }
  };

  const openManualMatch = async (txnId: string) => {
    if (!session) return;
    setManualMatchTxn(txnId);
    // Load matchable docs
    try {
      const [{ data: files }, { data: bills }, { data: invoices }] = await Promise.all([
        supabase.from("file_assets").select("id, title").eq("status", "active"),
        supabase.from("bills").select("id, bill_reference"),
        supabase.from("invoices").select("id, invoice_number"),
      ]);
      const docs: MatchableDoc[] = [
        ...(files || []).map((f) => ({ id: f.id, title: f.title, type: "file" as const })),
        ...(bills || []).map((b) => ({ id: b.id, title: `Bill: ${b.bill_reference}`, type: "bill" as const })),
        ...(invoices || []).map((i) => ({ id: i.id, title: `Invoice: ${i.invoice_number}`, type: "invoice" as const })),
      ];
      setMatchableDocs(docs);
    } catch {
      setMatchableDocs([]);
    }
  };

  const handleManualMatch = async (doc: MatchableDoc) => {
    if (!session || !manualMatchTxn) return;
    const params: Record<string, string> = { transaction_id: manualMatchTxn };
    if (doc.type === "file") params.file_asset_id = doc.id;
    if (doc.type === "bill") params.bill_id = doc.id;
    if (doc.type === "invoice") params.invoice_id = doc.id;

    try {
      await callBanking(session, "manual_match", params);
      toast({ title: "Matched", description: `Transaction linked to ${doc.title}` });
      setManualMatchTxn(null);
      loadData();
    } catch (err) {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    }
  };

  const unmatchedTxns = transactions.filter((t) => t.status === "unmatched");
  const matchedTxns = transactions.filter((t) => t.status === "matched");
  const suggestedMatches = matches.filter((m) => m.status === "suggested" || m.status === "low_confidence");
  const confirmedMatches = matches.filter((m) => m.status === "confirmed");

  const filteredUnmatched = search
    ? unmatchedTxns.filter(
        (t) =>
          t.description?.toLowerCase().includes(search.toLowerCase()) ||
          t.counterparty_name?.toLowerCase().includes(search.toLowerCase())
      )
    : unmatchedTxns;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-mono font-bold text-foreground">Bank Reconciliation</h2>
          <p className="text-sm text-muted-foreground">
            Match bank transactions to invoices, bills, and documents
          </p>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <Button onClick={handleSync} disabled={syncing} variant="outline" size="sm">
              {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              {syncing ? "Syncing..." : "Sync Transactions"}
            </Button>
          ) : (
            <Button onClick={handleConnect} size="sm">
              <Landmark size={16} /> Connect Bank Account
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass-panel rounded-lg p-4 text-center">
          <p className="text-2xl font-mono font-bold text-foreground">{accounts.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Bank Accounts</p>
        </div>
        <div className="glass-panel rounded-lg p-4 text-center">
          <p className="text-2xl font-mono font-bold text-warning">{unmatchedTxns.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Unmatched</p>
        </div>
        <div className="glass-panel rounded-lg p-4 text-center">
          <p className="text-2xl font-mono font-bold text-primary">{suggestedMatches.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Suggested Matches</p>
        </div>
        <div className="glass-panel rounded-lg p-4 text-center">
          <p className="text-2xl font-mono font-bold text-accent">{confirmedMatches.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Reconciled</p>
        </div>
      </div>

      {/* Accounts strip */}
      {accounts.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {accounts.map((acct) => (
            <div key={acct.id} className="glass-panel rounded-lg px-4 py-3 min-w-[200px] shrink-0">
              <div className="flex items-center gap-2">
                <Landmark size={14} className="text-primary" />
                <span className="text-sm font-medium text-foreground">{acct.account_name}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                {acct.provider_name && (
                  <span className="text-[10px] text-muted-foreground">{acct.provider_name}</span>
                )}
                {acct.sort_code && (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {acct.sort_code} ••{acct.account_number_last4}
                  </span>
                )}
              </div>
              {acct.last_synced_at && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Synced {new Date(acct.last_synced_at).toLocaleString()}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="unmatched">
            Unmatched
            {unmatchedTxns.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-[10px]">{unmatchedTxns.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="suggested">
            Suggested
            {suggestedMatches.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-[10px]">{suggestedMatches.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reconciled">Reconciled</TabsTrigger>
          <TabsTrigger value="all">All Transactions</TabsTrigger>
        </TabsList>

        {/* UNMATCHED */}
        <TabsContent value="unmatched" className="space-y-4">
          <div className="relative max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search transactions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="glass-panel rounded-lg overflow-hidden divide-y divide-border">
            {filteredUnmatched.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                {connected ? "No unmatched transactions" : "Connect a bank account to get started"}
              </div>
            ) : (
              filteredUnmatched.map((txn) => (
                <TransactionRow
                  key={txn.id}
                  txn={txn}
                  canManage={canManage}
                  onManualMatch={() => openManualMatch(txn.id)}
                />
              ))
            )}
          </div>
        </TabsContent>

        {/* SUGGESTED */}
        <TabsContent value="suggested" className="space-y-4">
          <div className="glass-panel rounded-lg overflow-hidden divide-y divide-border">
            {suggestedMatches.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No suggested matches</div>
            ) : (
              suggestedMatches.map((match) => (
                <MatchRow
                  key={match.id}
                  match={match}
                  canManage={canManage}
                  onConfirm={() => handleConfirmMatch(match.id)}
                  onReject={() => handleRejectMatch(match.id)}
                />
              ))
            )}
          </div>
        </TabsContent>

        {/* RECONCILED */}
        <TabsContent value="reconciled" className="space-y-4">
          <div className="glass-panel rounded-lg overflow-hidden divide-y divide-border">
            {confirmedMatches.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No reconciled transactions yet</div>
            ) : (
              confirmedMatches.map((match) => (
                <MatchRow key={match.id} match={match} canManage={false} />
              ))
            )}
          </div>
        </TabsContent>

        {/* ALL */}
        <TabsContent value="all" className="space-y-4">
          <div className="glass-panel rounded-lg overflow-hidden divide-y divide-border">
            {transactions.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No transactions</div>
            ) : (
              transactions.map((txn) => (
                <TransactionRow key={txn.id} txn={txn} canManage={false} />
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Manual Match Dialog */}
      <AlertDialog open={!!manualMatchTxn} onOpenChange={(open) => !open && setManualMatchTxn(null)}>
        <AlertDialogContent className="max-w-lg max-h-[70vh] overflow-hidden flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle>Match to Document</AlertDialogTitle>
            <AlertDialogDescription>Select a document, bill, or invoice to link to this transaction.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="overflow-y-auto flex-1 divide-y divide-border -mx-6 px-6">
            {matchableDocs.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground text-center">No documents available</p>
            ) : (
              matchableDocs.map((doc) => (
                <button
                  key={`${doc.type}-${doc.id}`}
                  onClick={() => handleManualMatch(doc)}
                  className="w-full text-left py-3 px-1 hover:bg-secondary/30 transition-colors flex items-center gap-3"
                >
                  <FileText size={14} className="text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">{doc.type}</p>
                  </div>
                  <Link2 size={14} className="text-primary shrink-0" />
                </button>
              ))
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TransactionRow({
  txn,
  canManage,
  onManualMatch,
}: {
  txn: BankTransaction;
  canManage: boolean;
  onManualMatch?: () => void;
}) {
  const isIncoming = txn.amount > 0;

  return (
    <div className="p-4 hover:bg-secondary/30 transition-colors">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "h-9 w-9 rounded-md flex items-center justify-center shrink-0",
            isIncoming ? "bg-accent/20 text-accent" : "bg-destructive/10 text-destructive"
          )}
        >
          {isIncoming ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {txn.counterparty_name || txn.description || "Unknown"}
          </p>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[10px] text-muted-foreground">
              {new Date(txn.transaction_date).toLocaleDateString()}
            </span>
            {txn.transaction_category && (
              <span className="text-[10px] font-mono text-muted-foreground uppercase">
                {txn.transaction_category}
              </span>
            )}
            <Badge
              variant={txn.status === "matched" ? "default" : "secondary"}
              className="text-[10px] h-4"
            >
              {txn.status}
            </Badge>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p
            className={cn(
              "text-sm font-mono font-semibold",
              isIncoming ? "text-accent" : "text-foreground"
            )}
          >
            {isIncoming ? "+" : ""}£{Math.abs(txn.amount).toFixed(2)}
          </p>
        </div>
        {canManage && onManualMatch && txn.status === "unmatched" && (
          <Button variant="outline" size="sm" onClick={onManualMatch} className="shrink-0">
            <Link2 size={14} /> Match
          </Button>
        )}
      </div>
    </div>
  );
}

function MatchRow({
  match,
  canManage,
  onConfirm,
  onReject,
}: {
  match: Match;
  canManage: boolean;
  onConfirm?: () => void;
  onReject?: () => void;
}) {
  const txn = match.bank_transactions;
  const docName =
    match.file_assets?.title ||
    (match.bills ? `Bill: ${match.bills.bill_reference}` : null) ||
    (match.invoices ? `Invoice: ${match.invoices.invoice_number}` : null) ||
    "Unknown";

  const isIncoming = txn?.amount > 0;
  const confidencePct = Math.round(match.confidence_score * 100);

  return (
    <div className="p-4 hover:bg-secondary/30 transition-colors">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "h-9 w-9 rounded-md flex items-center justify-center shrink-0",
            isIncoming ? "bg-accent/20 text-accent" : "bg-destructive/10 text-destructive"
          )}
        >
          {isIncoming ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {txn?.counterparty_name || txn?.description || "Unknown"}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Link2 size={12} className="text-primary shrink-0" />
            <span className="text-xs text-primary truncate">{docName}</span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[10px] text-muted-foreground">
              {txn && new Date(txn.transaction_date).toLocaleDateString()}
            </span>
            <Badge
              variant={confidencePct >= 80 ? "default" : "secondary"}
              className="text-[10px] h-4"
            >
              {confidencePct}% confidence
            </Badge>
            {match.match_reason && (
              <span className="text-[10px] text-muted-foreground truncate">{match.match_reason}</span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p
            className={cn(
              "text-sm font-mono font-semibold",
              isIncoming ? "text-accent" : "text-foreground"
            )}
          >
            {isIncoming ? "+" : ""}£{txn ? Math.abs(txn.amount).toFixed(2) : "0.00"}
          </p>
        </div>
        {canManage && match.status !== "confirmed" && (
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-accent" onClick={onConfirm}>
              <Check size={16} />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onReject}>
              <X size={16} />
            </Button>
          </div>
        )}
        {match.status === "confirmed" && (
          <Badge variant="default" className="text-[10px] shrink-0">Reconciled</Badge>
        )}
      </div>
    </div>
  );
}
