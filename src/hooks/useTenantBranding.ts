import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface TenantBranding {
  companyName: string;
  subtitle: string;
  primaryColour: string | null;
  logoUrl: string | null;
}

const DEFAULTS: TenantBranding = {
  companyName: "ENCLAVE",
  subtitle: "CABINETRY",
  primaryColour: null,
  logoUrl: null,
};

export function useTenantBranding() {
  const { tenantId } = useAuth();
  const [branding, setBranding] = useState<TenantBranding>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    const load = async () => {
      const { data } = await supabase
        .from("tenants")
        .select("tenant_name, branding")
        .single();
      if (data) {
        const b = data.branding as any;
        setBranding({
          companyName: data.tenant_name || DEFAULTS.companyName,
          subtitle: b?.subtitle || DEFAULTS.subtitle,
          primaryColour: b?.primary_colour || null,
          logoUrl: b?.logo_url || null,
        });
      }
      setLoading(false);
    };
    load();
  }, [tenantId]);

  // Apply primary colour as CSS custom property override
  useEffect(() => {
    if (!branding.primaryColour) return;
    const hex = branding.primaryColour;
    // Convert hex to HSL for CSS variable
    const hsl = hexToHSL(hex);
    if (hsl) {
      document.documentElement.style.setProperty("--primary", hsl);
    }
    return () => {
      document.documentElement.style.removeProperty("--primary");
    };
  }, [branding.primaryColour]);

  return { branding, loading };
}

function hexToHSL(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
