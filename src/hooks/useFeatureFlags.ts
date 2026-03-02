import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface FeatureFlags {
  enable_qr_tracking: boolean;
  enable_remnants: boolean;
  enable_hr_cases: boolean;
  enable_drive_integration: boolean;
  enable_notifications: boolean;
  enable_finance: boolean;
  enable_client_portal: boolean;
  enable_smart_quoting: boolean;
  enable_polygon_outline_extraction: boolean;
  [key: string]: boolean;
}

const DEFAULTS: FeatureFlags = {
  enable_qr_tracking: false,
  enable_remnants: false,
  enable_hr_cases: false,
  enable_drive_integration: false,
  enable_notifications: false,
  enable_finance: false,
  enable_client_portal: false,
  enable_smart_quoting: false,
  enable_polygon_outline_extraction: false,
};

export function useFeatureFlags() {
  const { tenantId } = useAuth();
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("tenant_feature_flags")
        .select("flag_name, enabled");
      const result = { ...DEFAULTS };
      (data ?? []).forEach((r) => {
        result[r.flag_name] = r.enabled;
      });
      setFlags(result);
      setLoading(false);
    };
    fetch();
  }, [tenantId]);

  return { flags, loading };
}
