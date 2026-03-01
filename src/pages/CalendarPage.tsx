import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, addDays, startOfWeek, isSameDay, parseISO } from "date-fns";

interface DbEvent {
  id: string;
  title: string;
  event_type: string;
  start_datetime: string;
  end_datetime: string;
  notes: string | null;
}

const eventTypeColors: Record<string, string> = {
  Production: "bg-primary/80 border-primary",
  Install: "bg-accent/80 border-accent",
  Meeting: "bg-info/80 border-info",
  Holiday: "bg-success/80 border-success",
  Sick: "bg-destructive/80 border-destructive",
  Training: "bg-warning/80 border-warning",
  Maintenance: "bg-muted-foreground/80 border-muted-foreground",
};

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarPage() {
  const [events, setEvents] = useState<DbEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  useEffect(() => {
    const fetch = async () => {
      const start = weekStart.toISOString();
      const end = addDays(weekStart, 7).toISOString();
      const { data } = await supabase
        .from("calendar_events")
        .select("*")
        .gte("start_datetime", start)
        .lte("start_datetime", end)
        .order("start_datetime");
      setEvents(data ?? []);
      setLoading(false);
    };
    fetch();
  }, [weekStart]);

  const weekDates = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = addDays(weekStart, i);
        return { day: days[i], date: d.getDate(), full: d, iso: format(d, "yyyy-MM-dd") };
      }),
    [weekStart]
  );

  const today = new Date();

  const prevWeek = () => setWeekStart(addDays(weekStart, -7));
  const nextWeek = () => setWeekStart(addDays(weekStart, 7));

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-mono font-bold text-foreground">Calendar</h2>
          <p className="text-sm text-muted-foreground">Schedule, holidays and production events</p>
        </div>
        <button className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus size={16} />
          New Event
        </button>
      </div>

      <div className="flex items-center justify-between glass-panel rounded-lg px-4 py-3">
        <button onClick={prevWeek} className="h-8 w-8 rounded-md flex items-center justify-center border border-border text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft size={16} />
        </button>
        <h3 className="font-mono text-sm font-bold text-foreground">
          {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "d, yyyy")}
        </h3>
        <button onClick={nextWeek} className="h-8 w-8 rounded-md flex items-center justify-center border border-border text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={16} />
        </button>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground text-sm py-8">Loading events...</div>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-2">
            {weekDates.map(wd => {
              const isToday = isSameDay(wd.full, today);
              const dayEvents = events.filter(e => e.start_datetime.startsWith(wd.iso));
              return (
                <div key={wd.iso} className="space-y-2">
                  <div className={cn("text-center rounded-md p-2", isToday ? "bg-primary/15" : "bg-card")}>
                    <p className="text-[10px] text-muted-foreground uppercase font-mono">{wd.day}</p>
                    <p className={cn("text-lg font-mono font-bold", isToday ? "text-primary" : "text-foreground")}>{wd.date}</p>
                  </div>
                  <div className="space-y-1">
                    {dayEvents.map(event => (
                      <div
                        key={event.id}
                        className={cn(
                          "rounded-md border-l-2 p-2 text-[10px] leading-tight cursor-pointer",
                          eventTypeColors[event.event_type] || "bg-muted border-muted-foreground"
                        )}
                      >
                        <p className="font-medium text-foreground truncate">{event.title}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="glass-panel rounded-lg lg:hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-mono text-sm font-bold text-foreground">THIS WEEK</h3>
            </div>
            {events.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No events this week</div>
            ) : (
              <div className="divide-y divide-border">
                {events.map(event => (
                  <div key={event.id} className="p-4 flex items-center gap-3">
                    <div className={cn("w-2 h-8 rounded-full shrink-0", eventTypeColors[event.event_type]?.split(" ")[0])} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{event.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {event.event_type} · {format(parseISO(event.start_datetime), "EEE HH:mm")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
