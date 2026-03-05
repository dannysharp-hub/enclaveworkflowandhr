import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useCompanyBySlug(slug: string | undefined) {
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) { setLoading(false); return; }
    const fetch = async () => {
      const { data, error: err } = await (supabase.from("cab_companies") as any)
        .select("id, name, slug, brand_phone, settings_json")
        .eq("slug", slug)
        .maybeSingle();
      if (err) setError(err.message);
      else if (!data) setError("Company not found");
      else setCompany(data);
      setLoading(false);
    };
    fetch();
  }, [slug]);

  return { company, loading, error };
}
