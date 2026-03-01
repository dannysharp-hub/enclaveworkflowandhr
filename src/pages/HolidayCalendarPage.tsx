import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, Palmtree } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isSameMonth, isWeekend } from "date-fns";

interface LeaveDay {
  staff_name: string;
  department: string;
  type: string;
  start_date: string;
  end_date: string;
}

const typeColor: Record<string, string> = {
  Holiday: "bg-success/20 text-success",
  Sick: "bg-destructive/20 text-destructive",
  Unpaid: "bg-muted text-muted-foreground",
  Appointment: "bg-info/20 text-info",
};

export default function HolidayCalendarPage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [leaves, setLeaves] = useState<LeaveDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaves();
  }, [month]);

  const fetchLeaves = async () => {
    setLoading(true);
    const start = format(startOfMonth(month), "yyyy-MM-dd");
    const end = format(endOfMonth(month), "yyyy-MM-dd");

    const { data: requests } = await supabase
      .from("holiday_requests")
      .select("staff_id, start_date, end_date, type, status")
      .eq("status", "Approved")
      .lte("start_date", end)
      .gte("end_date", start);

    if (!requests || requests.length === 0) {
      setLeaves([]);
      setLoading(false);
      return;
    }

    const staffIds = [...new Set(requests.map(r => r.staff_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, department")
      .in("user_id", staffIds);

    const profileMap = new Map((profiles ?? []).map(p => [p.user_id, p]));

    const mapped: LeaveDay[] = requests.map(r => {
      const p = profileMap.get(r.staff_id);
      return {
        staff_name: p?.full_name ?? "Unknown",
        department: p?.department ?? "",
        type: r.type,
        start_date: r.start_date,
        end_date: r.end_date,
      };
    });

    setLeaves(mapped);
    setLoading(false);
  };

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // Pad start to Monday
    const startDow = getDay(monthStart);
    const padStart = startDow === 0 ? 6 : startDow - 1;

    return { allDays, padStart };
  }, [month]);

  const getLeavesForDay = (day: Date) => {
    const iso = format(day, "yyyy-MM-dd");
    return leaves.filter(l => l.start_date <= iso && l.end_date >= iso);
  };

  const today = new Date();

  // Summary stats
  const totalStaffOnLeave = new Set(leaves.map(l => l.staff_name)).size;
  const byDept = leaves.reduce<Record<string, Set<string>>>((acc, l) => {
    if (!acc[l.department]) acc[l.department] = new Set();
    acc[l.department].add(l.staff_name);
    return acc;
  }, {});

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h2 className="text-2xl font-mono font-bold text-foreground">Holiday Calendar</h2>
        <p className="text-sm text-muted-foreground">
          Approved leave across all staff · {totalStaffOnLeave} staff on leave this month
        </p>
      </div>

      {/* Department summary chips */}
      {Object.keys(byDept).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(byDept).map(([dept, names]) => (
            <span key={dept} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-mono font-medium bg-secondary text-secondary-foreground">
              {dept} <span className="text-primary">{names.size}</span>
            </span>
          ))}
        </div>
      )}

      {/* Month navigation */}
      <div className="flex items-center justify-between glass-panel rounded-lg px-4 py-3">
        <button onClick={() => setMonth(subMonths(month, 1))} className="h-8 w-8 rounded-md flex items-center justify-center border border-border text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft size={16} />
        </button>
        <h3 className="font-mono text-sm font-bold text-foreground">
          {format(month, "MMMM yyyy")}
        </h3>
        <button onClick={() => setMonth(addMonths(month, 1))} className="h-8 w-8 rounded-md flex items-center justify-center border border-border text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground text-sm py-8">Loading...</div>
      ) : (
        <>
          {/* Calendar grid */}
          <div className="glass-panel rounded-lg overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-border">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
                <div key={d} className="text-center py-2 text-[10px] font-mono font-medium text-muted-foreground uppercase">
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
              {/* Padding cells */}
              {Array.from({ length: calendarDays.padStart }).map((_, i) => (
                <div key={`pad-${i}`} className="min-h-[80px] border-b border-r border-border bg-card/30" />
              ))}

              {calendarDays.allDays.map(day => {
                const isToday = isSameDay(day, today);
                const dayLeaves = getLeavesForDay(day);
                const weekend = isWeekend(day);

                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "min-h-[80px] border-b border-r border-border p-1.5",
                      weekend ? "bg-card/30" : "bg-card/60",
                      isToday && "ring-1 ring-inset ring-primary/40"
                    )}
                  >
                    <span className={cn(
                      "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-mono",
                      isToday ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground"
                    )}>
                      {day.getDate()}
                    </span>
                    <div className="space-y-0.5 mt-0.5">
                      {dayLeaves.slice(0, 3).map((l, i) => (
                        <div
                          key={i}
                          className={cn("rounded px-1 py-0.5 text-[9px] font-mono leading-tight truncate", typeColor[l.type] || "bg-muted text-muted-foreground")}
                          title={`${l.staff_name} (${l.type})`}
                        >
                          {l.staff_name.split(" ")[0]}
                        </div>
                      ))}
                      {dayLeaves.length > 3 && (
                        <span className="text-[9px] text-muted-foreground font-mono pl-1">+{dayLeaves.length - 3} more</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3">
            {Object.entries(typeColor).map(([type, cls]) => (
              <div key={type} className="flex items-center gap-1.5">
                <span className={cn("w-3 h-3 rounded", cls.split(" ")[0])} />
                <span className="text-[10px] font-mono text-muted-foreground">{type}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
