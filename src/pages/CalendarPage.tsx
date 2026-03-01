import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import EventDialog from "@/components/EventDialog";
import { cn } from "@/lib/utils";
import {
  format, addDays, addMonths, subMonths, startOfWeek, startOfMonth, endOfMonth,
  isSameDay, isSameMonth, parseISO, eachDayOfInterval, getDay,
} from "date-fns";
import {
  ChevronLeft, ChevronRight, Plus, CalendarDays, Clock,
  Users, Wrench, GraduationCap, AlertTriangle,
} from "lucide-react";

// ── Types ──

interface DbEvent {
  id: string;
  title: string;
  event_type: string;
  start_datetime: string;
  end_datetime: string;
  notes: string | null;
  job_id: string | null;
  assigned_staff_ids: string[] | null;
}

interface HolidayOverlay {
  id: string;
  staff_id: string;
  staff_name: string;
  start_date: string;
  end_date: string;
  type: string;
  status: string;
}

type ViewMode = "week" | "month";

// ── Colour config ──

const eventTypeConfig: Record<string, { bg: string; border: string; icon: any; dot: string }> = {
  Production: { bg: "bg-primary/15", border: "border-primary/30", icon: Wrench, dot: "bg-primary" },
  Install: { bg: "bg-accent/15", border: "border-accent/30", icon: Wrench, dot: "bg-accent-foreground" },
  Meeting: { bg: "bg-secondary/30", border: "border-secondary-foreground/20", icon: Users, dot: "bg-secondary-foreground" },
  Holiday: { bg: "bg-primary/10", border: "border-primary/20", icon: CalendarDays, dot: "bg-primary" },
  Sick: { bg: "bg-destructive/15", border: "border-destructive/30", icon: AlertTriangle, dot: "bg-destructive" },
  Training: { bg: "bg-warning/15", border: "border-warning/30", icon: GraduationCap, dot: "bg-warning" },
  Maintenance: { bg: "bg-muted", border: "border-muted-foreground/30", icon: Wrench, dot: "bg-muted-foreground" },
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarPage() {
  const { userRole } = useAuth();
  const [events, setEvents] = useState<DbEvent[]>([]);
  const [holidays, setHolidays] = useState<HolidayOverlay[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [createOpen, setCreateOpen] = useState(false);
  const [createDefaultDate, setCreateDefaultDate] = useState<string | undefined>();
  const [editEvent, setEditEvent] = useState<DbEvent | null>(null);

  const canManage = userRole === "admin" || userRole === "supervisor" || userRole === "office";

  // ── Date ranges ──
  const weekStart = useMemo(() => startOfWeek(currentDate, { weekStartsOn: 1 }), [currentDate]);
  const monthStart = useMemo(() => startOfMonth(currentDate), [currentDate]);
  const monthEnd = useMemo(() => endOfMonth(currentDate), [currentDate]);

  const rangeStart = view === "week" ? weekStart : monthStart;
  const rangeEnd = view === "week" ? addDays(weekStart, 6) : monthEnd;

  // ── Fetch ──
  const fetchData = useCallback(async () => {
    const startStr = rangeStart.toISOString();
    const endStr = addDays(rangeEnd, 1).toISOString();
    const startDate = format(rangeStart, "yyyy-MM-dd");
    const endDate = format(rangeEnd, "yyyy-MM-dd");

    const [eventsRes, holidaysRes, profilesRes] = await Promise.all([
      supabase.from("calendar_events").select("*").gte("start_datetime", startStr).lte("start_datetime", endStr).order("start_datetime"),
      supabase.from("holiday_requests").select("id, staff_id, start_date, end_date, type, status").eq("status", "Approved").lte("start_date", endDate).gte("end_date", startDate),
      supabase.from("profiles").select("user_id, full_name").eq("active", true),
    ]);

    setEvents(eventsRes.data ?? []);
    setHolidays(
      (holidaysRes.data ?? []).map((h: any) => ({ ...h, staff_name: "" }))
    );
    const pMap: Record<string, string> = {};
    (profilesRes.data ?? []).forEach((p: any) => { pMap[p.user_id] = p.full_name; });
    setProfiles(pMap);
    setLoading(false);
  }, [rangeStart, rangeEnd]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Enrich holidays with staff names
  const enrichedHolidays = useMemo(() =>
    holidays.map(h => ({ ...h, staff_name: profiles[h.staff_id] || "Staff" }))
  , [holidays, profiles]);

  // ── Navigation ──
  const prev = () => setCurrentDate(view === "week" ? addDays(currentDate, -7) : subMonths(currentDate, 1));
  const next = () => setCurrentDate(view === "week" ? addDays(currentDate, 7) : addMonths(currentDate, 1));
  const goToday = () => setCurrentDate(new Date());

  // ── Days grid ──
  const daysInView = useMemo(() => {
    if (view === "week") {
      return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    }
    // Month: pad to start on Monday
    const firstDay = startOfMonth(currentDate);
    const dayOfWeek = getDay(firstDay); // 0=Sun
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const gridStart = addDays(firstDay, mondayOffset);
    const gridEnd = addDays(gridStart, 41); // 6 rows
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [view, weekStart, currentDate]);

  const today = new Date();

  // ── Get events for a day ──
  const getEventsForDay = useCallback((day: Date) => {
    const iso = format(day, "yyyy-MM-dd");
    return events.filter(e => e.start_datetime.startsWith(iso));
  }, [events]);

  const getHolidaysForDay = useCallback((day: Date) => {
    const iso = format(day, "yyyy-MM-dd");
    return enrichedHolidays.filter(h => h.start_date <= iso && h.end_date >= iso);
  }, [enrichedHolidays]);

  // ── Click on empty day to create ──
  const handleDayClick = (day: Date) => {
    if (!canManage) return;
    setCreateDefaultDate(format(day, "yyyy-MM-dd'T'09:00"));
    setCreateOpen(true);
  };

  // ── Stats ──
  const stats = useMemo(() => {
    const production = events.filter(e => e.event_type === "Production" || e.event_type === "Install").length;
    const meetings = events.filter(e => e.event_type === "Meeting").length;
    const staffOff = new Set(enrichedHolidays.map(h => h.staff_id)).size;
    return { total: events.length, production, meetings, staffOff };
  }, [events, enrichedHolidays]);

  const headerLabel = view === "week"
    ? `${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 6), "d, yyyy")}`
    : format(currentDate, "MMMM yyyy");

  if (loading) {
    return (
      <div className="space-y-4 animate-slide-in">
        <div className="h-10 bg-card rounded-lg animate-pulse" />
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-32 bg-card rounded-lg animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-slide-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground flex items-center gap-2">
            <CalendarDays size={20} className="text-primary" /> Calendar
          </h1>
          <p className="text-sm text-muted-foreground">
            {stats.total} events · {stats.production} production · {stats.staffOff} staff off
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-md border border-border overflow-hidden">
            <button onClick={() => setView("week")} className={cn("px-3 py-1.5 text-xs font-mono", view === "week" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground")}>Week</button>
            <button onClick={() => setView("month")} className={cn("px-3 py-1.5 text-xs font-mono", view === "month" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground")}>Month</button>
          </div>
          <button onClick={goToday} className="px-3 py-1.5 rounded-md border border-border text-xs font-mono text-muted-foreground hover:text-foreground transition-colors">Today</button>
          {canManage && (
            <button onClick={() => { setCreateDefaultDate(undefined); setCreateOpen(true); }} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              <Plus size={14} /> Event
            </button>
          )}
        </div>
      </div>

      {/* Navigation bar */}
      <div className="flex items-center justify-between glass-panel rounded-lg px-4 py-2.5">
        <button onClick={prev} className="h-7 w-7 rounded-md flex items-center justify-center border border-border text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft size={14} />
        </button>
        <h3 className="font-mono text-sm font-bold text-foreground">{headerLabel}</h3>
        <button onClick={next} className="h-7 w-7 rounded-md flex items-center justify-center border border-border text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Day names header */}
      <div className="grid grid-cols-7 gap-1">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-[10px] font-mono font-medium text-muted-foreground uppercase py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className={cn("grid grid-cols-7 gap-1", view === "month" && "auto-rows-[minmax(80px,1fr)]")}>
        {daysInView.map(day => {
          const isToday = isSameDay(day, today);
          const isCurrentMonth = view === "month" ? isSameMonth(day, currentDate) : true;
          const dayEvents = getEventsForDay(day);
          const dayHolidays = getHolidaysForDay(day);
          const isWeekend = getDay(day) === 0 || getDay(day) === 6;

          return (
            <div
              key={day.toISOString()}
              onClick={() => dayEvents.length === 0 && handleDayClick(day)}
              className={cn(
                "rounded-md border p-1.5 min-h-[80px] transition-colors",
                isToday ? "border-primary/50 bg-primary/5" : "border-border",
                !isCurrentMonth && "opacity-40",
                isWeekend && isCurrentMonth && "bg-muted/30",
                canManage && "cursor-pointer hover:border-primary/30",
              )}
            >
              {/* Date number */}
              <div className="flex items-center justify-between mb-1">
                <span className={cn(
                  "text-xs font-mono",
                  isToday ? "font-bold text-primary bg-primary/15 rounded-full w-6 h-6 flex items-center justify-center" : "text-foreground",
                )}>
                  {day.getDate()}
                </span>
                {dayHolidays.length > 0 && (
                  <span className="text-[9px] font-mono text-warning">{dayHolidays.length} off</span>
                )}
              </div>

              {/* Holiday overlays */}
              {dayHolidays.slice(0, view === "month" ? 1 : 3).map(h => (
                <div key={h.id + h.staff_id} className="mb-0.5 rounded px-1 py-0.5 bg-warning/10 border-l-2 border-warning/40">
                  <p className="text-[9px] font-mono text-warning truncate">{h.staff_name}</p>
                </div>
              ))}
              {view === "month" && dayHolidays.length > 1 && (
                <p className="text-[8px] text-muted-foreground font-mono">+{dayHolidays.length - 1} more off</p>
              )}

              {/* Events */}
              {dayEvents.slice(0, view === "month" ? 2 : 5).map(event => {
                const cfg = eventTypeConfig[event.event_type] || eventTypeConfig.Production;
                return (
                  <div
                    key={event.id}
                    onClick={(e) => { e.stopPropagation(); if (canManage) setEditEvent(event); }}
                    className={cn("mb-0.5 rounded px-1.5 py-0.5 border-l-2 cursor-pointer", cfg.bg, cfg.border)}
                  >
                    <p className="text-[9px] font-medium text-foreground truncate">{event.title}</p>
                    {view === "week" && (
                      <p className="text-[8px] text-muted-foreground">
                        {format(parseISO(event.start_datetime), "HH:mm")}
                      </p>
                    )}
                  </div>
                );
              })}
              {dayEvents.length > (view === "month" ? 2 : 5) && (
                <p className="text-[8px] text-muted-foreground font-mono">+{dayEvents.length - (view === "month" ? 2 : 5)} more</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile list view */}
      <div className="glass-panel rounded-lg lg:hidden">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h3 className="font-mono text-xs font-bold text-foreground">EVENTS</h3>
          <span className="text-[10px] font-mono text-muted-foreground">{events.length} total</span>
        </div>
        {events.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">No events this period</div>
        ) : (
          <div className="divide-y divide-border">
            {events.slice(0, 15).map(event => {
              const cfg = eventTypeConfig[event.event_type] || eventTypeConfig.Production;
              return (
                <div key={event.id} className="p-3 flex items-center gap-3 cursor-pointer hover:bg-secondary/20 transition-colors" onClick={() => canManage && setEditEvent(event)}>
                  <div className={cn("w-2 h-8 rounded-full shrink-0", cfg.dot)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.event_type} · {format(parseISO(event.start_datetime), "EEE d MMM · HH:mm")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-1">
        {Object.entries(eventTypeConfig).map(([type, cfg]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className={cn("w-2 h-2 rounded-full", cfg.dot)} />
            <span className="text-[10px] font-mono text-muted-foreground">{type}</span>
          </div>
        ))}
      </div>

      {/* Dialogs */}
      <EventDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={fetchData} defaultDate={createDefaultDate} />
      {editEvent && <EventDialog open={!!editEvent} onOpenChange={o => { if (!o) setEditEvent(null); }} onSuccess={fetchData} event={editEvent} />}
    </div>
  );
}
