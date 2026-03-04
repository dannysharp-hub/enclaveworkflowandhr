import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

interface Props {
  children: React.ReactNode;
  allowedRoles: string[];
  redirectTo?: string;
}

/**
 * Gates content to specific roles. Staff/viewers without the required role are redirected.
 */
export default function RoleGate({ children, allowedRoles, redirectTo = "/" }: Props) {
  const { userRole, loading, user } = useAuth();

  // Still loading auth OR user exists but role hasn't loaded yet — show spinner
  if (loading || (user && !userRole)) {
    return (
      <div className="h-40 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!userRole || !allowedRoles.includes(userRole)) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
