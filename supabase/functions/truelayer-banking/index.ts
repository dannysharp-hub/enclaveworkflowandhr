import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TRUELAYER_AUTH_URL = "https://auth.truelayer.com";
const TRUELAYER_API_URL = "https://api.truelayer.com";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getEnvOrThrow(name: string): string {
  const val = Deno.env.get(name);
  if (!val) throw new Error(`${name} is not configured`);
  return val;
}

async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");

  const supabase = createClient(
    getEnvOrThrow("SUPABASE_URL"),
    getEnvOrThrow("SUPABASE_ANON_KEY"),
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) throw new Error("Unauthorized");

  return { userId: data.claims.sub as string, supabase };
}

function getAdminClient() {
  return createClient(
    getEnvOrThrow("SUPABASE_URL"),
    getEnvOrThrow("SUPABASE_SERVICE_ROLE_KEY")
  );
}

// Exchange code for tokens
async function exchangeCode(code: string, redirectUri: string) {
  const clientId = getEnvOrThrow("TRUELAYER_CLIENT_ID");
  const clientSecret = getEnvOrThrow("TRUELAYER_CLIENT_SECRET");

  const resp = await fetch(`${TRUELAYER_AUTH_URL}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Token exchange failed: ${err}`);
  }
  return resp.json();
}

// Refresh tokens
async function refreshAccessToken(refreshToken: string) {
  const clientId = getEnvOrThrow("TRUELAYER_CLIENT_ID");
  const clientSecret = getEnvOrThrow("TRUELAYER_CLIENT_SECRET");

  const resp = await fetch(`${TRUELAYER_AUTH_URL}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Token refresh failed: ${err}`);
  }
  return resp.json();
}

// Get valid access token for tenant
async function getValidToken(tenantId: string) {
  const admin = getAdminClient();
  const { data: conn } = await admin
    .from("truelayer_connections")
    .select("*")
    .eq("tenant_id", tenantId)
    .single();

  if (!conn) throw new Error("No TrueLayer connection found");

  const expiresAt = new Date(conn.token_expires_at);
  if (expiresAt > new Date(Date.now() + 60_000)) {
    return conn.access_token;
  }

  // Refresh
  const tokens = await refreshAccessToken(conn.refresh_token);
  const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await admin
    .from("truelayer_connections")
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || conn.refresh_token,
      token_expires_at: newExpiry,
    })
    .eq("id", conn.id);

  return tokens.access_token;
}

// Fetch accounts from TrueLayer
async function fetchAccounts(accessToken: string) {
  const resp = await fetch(`${TRUELAYER_API_URL}/data/v1/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`Failed to fetch accounts: ${resp.status}`);
  const data = await resp.json();
  return data.results || [];
}

// Fetch transactions for an account
async function fetchTransactions(accessToken: string, accountId: string, from?: string, to?: string) {
  let url = `${TRUELAYER_API_URL}/data/v1/accounts/${accountId}/transactions`;
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (params.toString()) url += `?${params}`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`Failed to fetch transactions: ${resp.status}`);
  const data = await resp.json();
  return data.results || [];
}

// Auto-match transactions to documents/bills/invoices
async function autoMatch(tenantId: string, transactionIds: string[]) {
  const admin = getAdminClient();

  const { data: transactions } = await admin
    .from("bank_transactions")
    .select("*")
    .in("id", transactionIds)
    .eq("tenant_id", tenantId)
    .eq("status", "unmatched");

  if (!transactions?.length) return [];

  // Get bills, invoices, and filed documents for matching
  const [{ data: bills }, { data: invoices }, { data: fileAssets }] = await Promise.all([
    admin.from("bills").select("id, bill_reference, amount_ex_vat, vat_amount, supplier_id, issue_date, status, tenant_id").eq("tenant_id", tenantId),
    admin.from("invoices").select("id, invoice_number, total_amount, customer_id, issue_date, status, tenant_id").eq("tenant_id", tenantId),
    admin.from("file_assets").select("id, title, category, created_at, tenant_id").eq("tenant_id", tenantId).eq("status", "active"),
  ]);

  const matches: Array<{
    bank_transaction_id: string;
    file_asset_id?: string;
    bill_id?: string;
    invoice_id?: string;
    match_type: string;
    confidence_score: number;
    match_reason: string;
    status: string;
    tenant_id: string;
  }> = [];

  for (const txn of transactions) {
    const absAmount = Math.abs(txn.amount);
    let bestMatch: typeof matches[0] | null = null;
    let bestScore = 0;

    // Match against bills (outgoing payments)
    if (txn.amount < 0 && bills) {
      for (const bill of bills) {
        const billTotal = Number(bill.amount_ex_vat) + Number(bill.vat_amount);
        let score = 0;
        const reasons: string[] = [];

        // Amount match
        const amountDiff = Math.abs(absAmount - billTotal);
        if (amountDiff < 0.01) {
          score += 0.5;
          reasons.push("Exact amount match");
        } else if (amountDiff / billTotal < 0.02) {
          score += 0.3;
          reasons.push("Close amount match");
        }

        // Date proximity
        const txnDate = new Date(txn.transaction_date);
        const billDate = new Date(bill.issue_date);
        const daysDiff = Math.abs((txnDate.getTime() - billDate.getTime()) / 86400000);
        if (daysDiff < 3) {
          score += 0.3;
          reasons.push("Date within 3 days");
        } else if (daysDiff < 14) {
          score += 0.15;
          reasons.push("Date within 2 weeks");
        }

        // Counterparty name fuzzy match
        if (txn.counterparty_name && bill.bill_reference) {
          const txnName = txn.counterparty_name.toLowerCase();
          const billRef = bill.bill_reference.toLowerCase();
          if (txnName.includes(billRef) || billRef.includes(txnName)) {
            score += 0.2;
            reasons.push("Counterparty name match");
          }
        }

        if (score > bestScore && score >= 0.4) {
          bestScore = score;
          bestMatch = {
            bank_transaction_id: txn.id,
            bill_id: bill.id,
            match_type: "auto",
            confidence_score: Math.min(score, 0.99),
            match_reason: reasons.join("; "),
            status: score >= 0.8 ? "suggested" : "low_confidence",
            tenant_id: tenantId,
          };
        }
      }
    }

    // Match against invoices (incoming payments)
    if (txn.amount > 0 && invoices) {
      for (const inv of invoices) {
        const invTotal = Number(inv.total_amount);
        let score = 0;
        const reasons: string[] = [];

        const amountDiff = Math.abs(absAmount - invTotal);
        if (amountDiff < 0.01) {
          score += 0.5;
          reasons.push("Exact amount match");
        } else if (invTotal > 0 && amountDiff / invTotal < 0.02) {
          score += 0.3;
          reasons.push("Close amount match");
        }

        const txnDate = new Date(txn.transaction_date);
        const invDate = new Date(inv.issue_date);
        const daysDiff = Math.abs((txnDate.getTime() - invDate.getTime()) / 86400000);
        if (daysDiff < 3) {
          score += 0.3;
          reasons.push("Date within 3 days");
        } else if (daysDiff < 14) {
          score += 0.15;
          reasons.push("Date within 2 weeks");
        }

        if (score > bestScore && score >= 0.4) {
          bestScore = score;
          bestMatch = {
            bank_transaction_id: txn.id,
            invoice_id: inv.id,
            match_type: "auto",
            confidence_score: Math.min(score, 0.99),
            match_reason: reasons.join("; "),
            status: score >= 0.8 ? "suggested" : "low_confidence",
            tenant_id: tenantId,
          };
        }
      }
    }

    // Match against file assets by amount in title or counterparty
    if (fileAssets && !bestMatch) {
      for (const fa of fileAssets) {
        let score = 0;
        const reasons: string[] = [];
        const titleLower = fa.title.toLowerCase();

        if (txn.counterparty_name) {
          const cpLower = txn.counterparty_name.toLowerCase();
          if (titleLower.includes(cpLower) || cpLower.includes(titleLower.split("—")[0].trim())) {
            score += 0.4;
            reasons.push("Document title matches counterparty");
          }
        }

        // Check amount in title
        const amountStr = absAmount.toFixed(2);
        if (titleLower.includes(amountStr)) {
          score += 0.3;
          reasons.push("Amount found in document title");
        }

        if (score > bestScore && score >= 0.4) {
          bestScore = score;
          bestMatch = {
            bank_transaction_id: txn.id,
            file_asset_id: fa.id,
            match_type: "auto",
            confidence_score: Math.min(score, 0.99),
            match_reason: reasons.join("; "),
            status: "suggested",
            tenant_id: tenantId,
          };
        }
      }
    }

    if (bestMatch) matches.push(bestMatch);
  }

  if (matches.length > 0) {
    await admin.from("bank_document_matches").insert(matches);
  }

  return matches;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, ...params } = await req.json();
    const { userId, supabase } = await getAuthenticatedUser(req);
    const admin = getAdminClient();

    // Get tenant
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", userId)
      .single();

    if (!profile?.tenant_id) return json({ error: "No tenant" }, 403);
    const tenantId = profile.tenant_id;

    // ──── GET AUTH URL ────
    if (action === "get_auth_url") {
      const clientId = getEnvOrThrow("TRUELAYER_CLIENT_ID");
      const redirectUri = params.redirect_uri;
      const authUrl =
        `${TRUELAYER_AUTH_URL}/?response_type=code&client_id=${clientId}` +
        `&scope=info%20accounts%20balance%20transactions%20offline_access` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&providers=uk-ob-all%20uk-oauth-all`;
      return json({ auth_url: authUrl });
    }

    // ──── EXCHANGE CODE ────
    if (action === "exchange_code") {
      const tokens = await exchangeCode(params.code, params.redirect_uri);
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

      await admin.from("truelayer_connections").upsert(
        {
          tenant_id: tenantId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: expiresAt,
          status: "active",
        },
        { onConflict: "tenant_id" }
      );

      return json({ success: true });
    }

    // ──── CONNECTION STATUS ────
    if (action === "status") {
      const { data: conn } = await admin
        .from("truelayer_connections")
        .select("status, updated_at")
        .eq("tenant_id", tenantId)
        .single();

      return json({ connected: !!conn, status: conn?.status, last_updated: conn?.updated_at });
    }

    // ──── SYNC ACCOUNTS ────
    if (action === "sync_accounts") {
      const accessToken = await getValidToken(tenantId);
      const accounts = await fetchAccounts(accessToken);

      for (const acct of accounts) {
        await admin.from("bank_accounts").upsert(
          {
            tenant_id: tenantId,
            truelayer_account_id: acct.account_id,
            account_name: acct.display_name || acct.account_id,
            account_type: acct.account_type || "unknown",
            currency: acct.currency || "GBP",
            provider_name: acct.provider?.display_name || null,
            sort_code: acct.account_number?.sort_code || null,
            account_number_last4: acct.account_number?.number
              ? acct.account_number.number.slice(-4)
              : null,
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id,truelayer_account_id" }
        );
      }

      return json({ synced: accounts.length });
    }

    // ──── SYNC TRANSACTIONS ────
    if (action === "sync_transactions") {
      const accessToken = await getValidToken(tenantId);
      const { data: accounts } = await admin
        .from("bank_accounts")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);

      if (!accounts?.length) return json({ error: "No bank accounts" }, 400);

      const from = params.from || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const to = params.to || new Date().toISOString().slice(0, 10);

      let totalSynced = 0;
      const newTransactionIds: string[] = [];

      for (const acct of accounts) {
        const transactions = await fetchTransactions(
          accessToken,
          acct.truelayer_account_id,
          from,
          to
        );

        for (const txn of transactions) {
          const { data: inserted } = await admin
            .from("bank_transactions")
            .upsert(
              {
                tenant_id: tenantId,
                bank_account_id: acct.id,
                truelayer_transaction_id: txn.transaction_id,
                transaction_date: txn.timestamp?.slice(0, 10) || to,
                amount: txn.amount,
                currency: txn.currency || "GBP",
                description: txn.description,
                counterparty_name: txn.merchant_name || txn.description,
                transaction_type: txn.transaction_type,
                transaction_category: txn.transaction_category,
                running_balance: txn.running_balance?.amount ?? null,
              },
              { onConflict: "tenant_id,truelayer_transaction_id" }
            )
            .select("id");

          if (inserted?.[0]) {
            newTransactionIds.push(inserted[0].id);
            totalSynced++;
          }
        }

        await admin
          .from("bank_accounts")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", acct.id);
      }

      // Auto-match new transactions
      let matchCount = 0;
      if (newTransactionIds.length > 0) {
        const matches = await autoMatch(tenantId, newTransactionIds);
        matchCount = matches.length;
      }

      return json({ synced: totalSynced, matches: matchCount });
    }

    // ──── GET TRANSACTIONS ────
    if (action === "get_transactions") {
      const { data: transactions } = await supabase
        .from("bank_transactions")
        .select("*, bank_accounts(account_name, provider_name)")
        .order("transaction_date", { ascending: false })
        .limit(params.limit || 200);

      return json({ transactions: transactions || [] });
    }

    // ──── GET MATCHES ────
    if (action === "get_matches") {
      const { data: matches } = await supabase
        .from("bank_document_matches")
        .select("*, bank_transactions(*), file_assets(id, title, category), bills(id, bill_reference, amount_ex_vat), invoices(id, invoice_number, total_amount)")
        .order("created_at", { ascending: false });

      return json({ matches: matches || [] });
    }

    // ──── CONFIRM MATCH ────
    if (action === "confirm_match") {
      await admin
        .from("bank_document_matches")
        .update({ status: "confirmed", confirmed_by: userId, confirmed_at: new Date().toISOString() })
        .eq("id", params.match_id)
        .eq("tenant_id", tenantId);

      // Mark transaction as matched
      const { data: match } = await admin
        .from("bank_document_matches")
        .select("bank_transaction_id")
        .eq("id", params.match_id)
        .single();

      if (match) {
        await admin
          .from("bank_transactions")
          .update({ status: "matched" })
          .eq("id", match.bank_transaction_id);
      }

      return json({ success: true });
    }

    // ──── REJECT MATCH ────
    if (action === "reject_match") {
      await admin
        .from("bank_document_matches")
        .update({ status: "rejected" })
        .eq("id", params.match_id)
        .eq("tenant_id", tenantId);

      return json({ success: true });
    }

    // ──── MANUAL MATCH ────
    if (action === "manual_match") {
      const insertData: Record<string, unknown> = {
        tenant_id: tenantId,
        bank_transaction_id: params.transaction_id,
        match_type: "manual",
        confidence_score: 1.0,
        match_reason: "Manual match",
        status: "confirmed",
        confirmed_by: userId,
        confirmed_at: new Date().toISOString(),
      };

      if (params.file_asset_id) insertData.file_asset_id = params.file_asset_id;
      if (params.bill_id) insertData.bill_id = params.bill_id;
      if (params.invoice_id) insertData.invoice_id = params.invoice_id;

      await admin.from("bank_document_matches").insert(insertData);
      await admin
        .from("bank_transactions")
        .update({ status: "matched" })
        .eq("id", params.transaction_id);

      return json({ success: true });
    }

    // ──── GET ACCOUNTS ────
    if (action === "get_accounts") {
      const { data: accounts } = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("is_active", true)
        .order("account_name");

      return json({ accounts: accounts || [] });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("truelayer-banking error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message === "Unauthorized" ? 401 : 500;
    return json({ error: message }, status);
  }
});
