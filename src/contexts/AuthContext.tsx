import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userRole: string | null;
  /** The real DB role (unaffected by override) */
  realRole: string | null;
  /** Currently active override, or null */
  roleOverride: string | null;
  setRoleOverride: (role: string | null) => void;
  profile: any | null;
  tenantId: string | null;
  cabCompanyId: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  userRole: null,
  realRole: null,
  roleOverride: null,
  setRoleOverride: () => {},
  profile: null,
  tenantId: null,
  cabCompanyId: null,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [dbRole, setDbRole] = useState<string | null>(null);
  const [roleOverride, setRoleOverride] = useState<string | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [cabCompanyId, setCabCompanyId] = useState<string | null>(null);

  // Effective role: override (admin-only) or real DB role
  const userRole = roleOverride ?? dbRole;

  const fetchUserData = async (userId: string) => {
    const [{ data: roleData }, { data: profileData }, { data: membershipData }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId).limit(1).single(),
      supabase.from("profiles").select("*").eq("user_id", userId).single(),
      supabase.from("cab_company_memberships").select("company_id").eq("user_id", userId).limit(1).single(),
    ]);
    setDbRole(roleData?.role ?? null);
    setProfile(profileData ?? null);
    setTenantId(profileData?.tenant_id ?? null);
    setCabCompanyId(membershipData?.company_id ?? null);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(() => fetchUserData(session.user.id), 0);
      } else {
        setDbRole(null);
        setRoleOverride(null);
        setProfile(null);
        setTenantId(null);
        setCabCompanyId(null);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, userRole, realRole: dbRole, roleOverride, setRoleOverride, profile, tenantId, cabCompanyId, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}