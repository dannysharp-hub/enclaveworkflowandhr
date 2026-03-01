import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Truck, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";

interface SupplierPerf {
  id: string;
  supplier_id: string;
  total_pos: number;
  on_time_delivery_percent: number;
  average_delivery_delay_days: number;
  discrepancy_rate_percent: number;
  average_order_value: number;
  suppliers?: { name: string };
}

export default function SupplierPerformancePage() {
  const [data, setData] = useState<SupplierPerf[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      // Calculate from PO data directly
      const { data: pos } = await (supabase.from("purchase_orders") as any)
        .select("id, supplier_id, status, expected_delivery_date, confirmed_delivery_date, total_ex_vat, suppliers(name)")
        .neq("status", "draft")
        .neq("status", "cancelled");

      const bySupplier = new Map<string, { name: string; pos: any[] }>();
      (pos ?? []).forEach((po: any) => {
        const key = po.supplier_id;
        if (!bySupplier.has(key)) bySupplier.set(key, { name: po.suppliers?.name || "Unknown", pos: [] });
        bySupplier.get(key)!.pos.push(po);
      });

      const results: SupplierPerf[] = [];
      bySupplier.forEach((val, supplierId) => {
        const received = val.pos.filter((p: any) => p.status === "received");
        const onTime = received.filter((p: any) => {
          if (!p.expected_delivery_date || !p.confirmed_delivery_date) return true;
          return new Date(p.confirmed_delivery_date) <= new Date(p.expected_delivery_date);
        });
        const delays = received
          .filter((p: any) => p.expected_delivery_date && p.confirmed_delivery_date)
          .map((p: any) => {
            const diff = (new Date(p.confirmed_delivery_date).getTime() - new Date(p.expected_delivery_date).getTime()) / (1000 * 60 * 60 * 24);
            return Math.max(0, diff);
          });

        results.push({
          id: supplierId,
          supplier_id: supplierId,
          total_pos: val.pos.length,
          on_time_delivery_percent: received.length > 0 ? Math.round((onTime.length / received.length) * 100) : 0,
          average_delivery_delay_days: delays.length > 0 ? Math.round((delays.reduce((a, b) => a + b, 0) / delays.length) * 10) / 10 : 0,
          discrepancy_rate_percent: 0,
          average_order_value: val.pos.length > 0 ? Math.round(val.pos.reduce((s: number, p: any) => s + Number(p.total_ex_vat), 0) / val.pos.length) : 0,
          suppliers: { name: val.name },
        });
      });

      results.sort((a, b) => b.on_time_delivery_percent - a.on_time_delivery_percent);
      setData(results);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return <div className="space-y-4 animate-slide-in"><div className="h-40 animate-pulse rounded-lg bg-card border border-border" /></div>;
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-mono font-bold text-foreground flex items-center gap-2">
          <TrendingUp size={20} className="text-primary" /> Supplier Performance
        </h1>
        <p className="text-sm text-muted-foreground">Delivery reliability and order metrics across suppliers</p>
      </div>

      {data.length === 0 ? (
        <div className="glass-panel rounded-lg p-8 text-center text-muted-foreground text-sm">
          No supplier data yet. Performance is calculated from completed purchase orders.
        </div>
      ) : (
        <div className="glass-panel rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground">SUPPLIER</th>
                <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground">TOTAL POs</th>
                <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground">ON-TIME %</th>
                <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground">AVG DELAY</th>
                <th className="text-right px-4 py-2 font-mono text-[10px] text-muted-foreground">AVG ORDER</th>
                <th className="text-left px-4 py-2 font-mono text-[10px] text-muted-foreground">RATING</th>
              </tr>
            </thead>
            <tbody>
              {data.map(s => {
                const rating = s.on_time_delivery_percent >= 90 ? "Excellent" :
                  s.on_time_delivery_percent >= 70 ? "Good" :
                  s.on_time_delivery_percent >= 50 ? "Fair" : "Poor";
                const ratingColor = rating === "Excellent" ? "text-primary" :
                  rating === "Good" ? "text-primary" :
                  rating === "Fair" ? "text-warning" : "text-destructive";
                return (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                    <td className="px-4 py-2 font-medium text-foreground flex items-center gap-2">
                      <Truck size={14} className="text-muted-foreground" />
                      {s.suppliers?.name}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-foreground">{s.total_pos}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={cn("font-mono font-bold", s.on_time_delivery_percent >= 80 ? "text-primary" : "text-warning")}>
                        {s.on_time_delivery_percent}%
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-muted-foreground">{s.average_delivery_delay_days}d</td>
                    <td className="px-4 py-2 text-right font-mono text-foreground">£{s.average_order_value.toLocaleString()}</td>
                    <td className="px-4 py-2">
                      <span className={cn("text-[10px] font-mono font-bold", ratingColor)}>{rating}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
