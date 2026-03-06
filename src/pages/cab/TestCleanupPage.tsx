import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { AlertTriangle, Trash2, Eye, RotateCcw, ExternalLink } from "lucide-react";

interface CleanupResult {
  dryRun: boolean;
  customers: { id: string; name: string; email: string | null }[];
  jobs: { id: string; job_ref: string; customer_name: string; status: string }[];
  counts: Record<string, number>;
  ghlIds: { contactIds: string[]; opportunityIds: string[] };
  warnings: string[];
}

export default function TestCleanupPage() {
  const { session } = useAuth();

  // Filters
  const [emailContainsTest, setEmailContainsTest] = useState(true);
  const [nameContainsTest, setNameContainsTest] = useState(true);
  const [jobRefsInput, setJobRefsInput] = useState("");
  const [includeDannySharp, setIncludeDannySharp] = useState(false);
  const [includeJohnSmith, setIncludeJohnSmith] = useState(false);
  const [createdWithinDays, setCreatedWithinDays] = useState<string>("14");
  const [alsoLogGhl, setAlsoLogGhl] = useState(false);
  const [companyId, setCompanyId] = useState("");

  // State
  const [result, setResult] = useState<CleanupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  // Auto-detect company
  useState(() => {
    (async () => {
      const { data } = await supabase
        .from("cab_company_memberships")
        .select("company_id")
        .limit(1)
        .maybeSingle();
      if (data) setCompanyId(data.company_id);
    })();
  });

  const buildFilters = () => {
    const specificNames: string[] = [];
    if (includeDannySharp) specificNames.push("Danny Sharp");
    if (includeJohnSmith) specificNames.push("John Smith");

    const jobRefs = jobRefsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      emailContainsTest,
      nameContainsTest,
      jobRefs,
      includeSpecificNames: specificNames,
      createdWithinDays: createdWithinDays ? parseInt(createdWithinDays) : null,
      companyId,
      alsoLogGhl,
    };
  };

  const runCleanup = async (dryRun: boolean) => {
    if (!companyId) {
      toast.error("No company detected");
      return;
    }

    if (!dryRun && confirmText !== "DELETE TEST DATA") {
      toast.error('Type "DELETE TEST DATA" to confirm');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-cleanup", {
        body: {
          dryRun,
          filters: buildFilters(),
          confirmation: confirmText,
        },
      });

      if (error) throw error;
      setResult(data as CleanupResult);

      if (dryRun) {
        toast.info("Dry run complete — review below");
      } else {
        toast.success("Test data deleted successfully");
        setConfirmText("");
      }
    } catch (err: any) {
      toast.error(err.message || "Cleanup failed");
    } finally {
      setLoading(false);
    }
  };

  const applyPreset14Days = () => {
    setEmailContainsTest(true);
    setNameContainsTest(true);
    setJobRefsInput("");
    setIncludeDannySharp(false);
    setIncludeJohnSmith(false);
    setCreatedWithinDays("14");
    setAlsoLogGhl(false);
    setResult(null);
    toast.info("Preset applied — click Preview to scan");
  };

  const totalDeleted = result
    ? Object.values(result.counts).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Test Data Cleanup</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Safely remove test/demo cabinetry records without touching production data.
        </p>
      </div>

      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Destructive Action</AlertTitle>
        <AlertDescription>
          This tool permanently deletes records. Always run a <strong>Preview</strong> first
          and verify the results before executing.
        </AlertDescription>
      </Alert>

      {/* ── Filters ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Filters</CardTitle>
            <Button variant="outline" size="sm" onClick={applyPreset14Days}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Preset: Last 14 days
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={emailContainsTest} onCheckedChange={(v) => setEmailContainsTest(!!v)} />
              Email contains "test"
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={nameContainsTest} onCheckedChange={(v) => setNameContainsTest(!!v)} />
              Name contains "test"
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={includeDannySharp} onCheckedChange={(v) => setIncludeDannySharp(!!v)} />
              Include "Danny Sharp"
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={includeJohnSmith} onCheckedChange={(v) => setIncludeJohnSmith(!!v)} />
              Include "John Smith"
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-foreground">Job refs (comma-separated)</label>
              <Input
                placeholder="001_testlead, 002_demo"
                value={jobRefsInput}
                onChange={(e) => setJobRefsInput(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Created within (days)</label>
              <Input
                type="number"
                placeholder="14"
                value={createdWithinDays}
                onChange={(e) => setCreatedWithinDays(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={alsoLogGhl} onCheckedChange={(v) => setAlsoLogGhl(!!v)} />
            Also log GHL contact/opportunity IDs for manual cleanup
          </label>
        </CardContent>
      </Card>

      {/* ── Actions ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={() => runCleanup(true)} disabled={loading} variant="outline" className="gap-1.5">
          <Eye className="h-4 w-4" />
          {loading ? "Scanning..." : "Preview / Dry Run"}
        </Button>

        {result && result.dryRun && totalDeleted > 0 && (
          <div className="flex items-center gap-2">
            <Input
              placeholder='Type "DELETE TEST DATA"'
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-56"
            />
            <Button
              onClick={() => runCleanup(false)}
              disabled={loading || confirmText !== "DELETE TEST DATA"}
              variant="destructive"
              className="gap-1.5"
            >
              <Trash2 className="h-4 w-4" />
              Execute Delete
            </Button>
          </div>
        )}
      </div>

      {/* ── Results ── */}
      {result && (
        <div className="space-y-4">
          {/* Warnings */}
          {result.warnings.map((w, i) => (
            <Alert key={i} variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{w}</AlertDescription>
            </Alert>
          ))}

          {/* Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                {result.dryRun ? (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">DRY RUN</Badge>
                ) : (
                  <Badge variant="destructive">EXECUTED</Badge>
                )}
                Deletion Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                {Object.entries(result.counts)
                  .filter(([, v]) => v > 0)
                  .map(([table, count]) => (
                    <div key={table} className="flex justify-between bg-muted/50 rounded px-2 py-1.5">
                      <span className="text-muted-foreground font-mono text-xs">{table.replace("cab_", "")}</span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ))}
              </div>
              {totalDeleted === 0 && (
                <p className="text-sm text-muted-foreground mt-2">No matching records found.</p>
              )}
            </CardContent>
          </Card>

          {/* Jobs */}
          {result.jobs.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Jobs ({result.jobs.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job Ref</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.jobs.map((j) => (
                      <TableRow key={j.id}>
                        <TableCell className="font-mono text-sm">{j.job_ref}</TableCell>
                        <TableCell>{j.customer_name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{j.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Customers */}
          {result.customers.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Customers ({result.customers.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.customers.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.name}</TableCell>
                        <TableCell className="text-muted-foreground">{c.email || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* GHL IDs */}
          {alsoLogGhl &&
            (result.ghlIds.contactIds.length > 0 ||
              result.ghlIds.opportunityIds.length > 0) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-1.5">
                    <ExternalLink className="h-4 w-4" /> GHL IDs for Manual Cleanup
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {result.ghlIds.contactIds.length > 0 && (
                    <div>
                      <p className="font-medium text-muted-foreground mb-1">Contact IDs:</p>
                      <pre className="bg-muted rounded p-2 text-xs overflow-auto">
                        {result.ghlIds.contactIds.join("\n")}
                      </pre>
                    </div>
                  )}
                  {result.ghlIds.opportunityIds.length > 0 && (
                    <div>
                      <p className="font-medium text-muted-foreground mb-1">Opportunity IDs:</p>
                      <pre className="bg-muted rounded p-2 text-xs overflow-auto">
                        {result.ghlIds.opportunityIds.join("\n")}
                      </pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
        </div>
      )}
    </div>
  );
}
