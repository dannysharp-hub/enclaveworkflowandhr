import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { cn } from "@/lib/utils";
import { ShieldOff } from "lucide-react";

interface FeatureGateProps {
  flag: string;
  children: React.ReactNode;
  featureName?: string;
}

export default function FeatureGate({ flag, children, featureName }: FeatureGateProps) {
  const { flags, loading } = useFeatureFlags();

  if (loading) return null;

  if (!flags[flag]) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
          <ShieldOff size={24} className="text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-lg font-mono font-bold text-foreground">Module Not Enabled</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {featureName || "This feature"} is not enabled for your organisation.
            <br />
            Contact your administrator to enable it in Settings.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
