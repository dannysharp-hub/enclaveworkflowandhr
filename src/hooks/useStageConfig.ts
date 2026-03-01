import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface StageConfigItem {
  id: string;
  stage_name: string;
  order_index: number;
  active: boolean;
  required_skills: string[] | null;
}

export function useStageConfig() {
  const { tenantId } = useAuth();
  const [stages, setStages] = useState<StageConfigItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("stage_config")
        .select("*")
        .eq("active", true)
        .order("order_index");
      setStages(data ?? []);
      setLoading(false);
    };
    fetch();
  }, [tenantId]);

  return { stages, loading };
}
