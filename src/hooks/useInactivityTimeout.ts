import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes
const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "scroll", "touchstart"];
const THROTTLE_MS = 60_000; // Throttle last_active_at updates to 1/min

export function useInactivityTimeout() {
  const { user, signOut } = useAuth();
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const lastUpdateRef = useRef(0);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (user) {
        try { await signOut(); } catch {}
        window.location.href = "/login?reason=timeout";
      }
    }, TIMEOUT_MS);

    // Throttled last_active_at update
    const now = Date.now();
    if (user && now - lastUpdateRef.current > THROTTLE_MS) {
      lastUpdateRef.current = now;
      supabase
        .from("profiles")
        .update({ last_active_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .then(() => {});
    }
  }, [user, signOut]);

  useEffect(() => {
    if (!user) return;

    resetTimer();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true });
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer);
      }
    };
  }, [user, resetTimer]);
}
