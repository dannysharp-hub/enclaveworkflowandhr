import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import Index from "./pages/Index";
import JobsPage from "./pages/JobsPage";
import StaffPage from "./pages/StaffPage";
import StaffProfilePage from "./pages/StaffProfilePage";
import CalendarPage from "./pages/CalendarPage";
import DocumentsPage from "./pages/DocumentsPage";
import CompliancePage from "./pages/CompliancePage";
import TrainingPage from "./pages/TrainingPage";
import SkillsMatrixPage from "./pages/SkillsMatrixPage";
import WhosInPage from "./pages/WhosInPage";
import RemnantsPage from "./pages/RemnantsPage";
import MaterialsPage from "./pages/MaterialsPage";
import JobBuilderPage from "./pages/JobBuilderPage";
import WorkflowPage from "./pages/WorkflowPage";
import MachineAuthPage from "./pages/MachineAuthPage";
import ReviewsPage from "./pages/ReviewsPage";
import MyWorkPage from "./pages/MyWorkPage";
import LoginPage from "./pages/LoginPage";
import HolidayCalendarPage from "./pages/HolidayCalendarPage";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center animate-pulse">
          <span className="font-mono text-sm font-bold text-primary-foreground">E</span>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const AppRoutes = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route
      path="/*"
      element={
        <ProtectedRoute>
          <AppLayout>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/my-work" element={<MyWorkPage />} />
              <Route path="/workflow" element={<WorkflowPage />} />
              <Route path="/jobs" element={<JobsPage />} />
              <Route path="/jobs/:jobId/builder" element={<JobBuilderPage />} />
              <Route path="/staff" element={<StaffPage />} />
              <Route path="/staff/:userId" element={<StaffProfilePage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/holiday-calendar" element={<HolidayCalendarPage />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="/compliance" element={<CompliancePage />} />
              <Route path="/training" element={<TrainingPage />} />
              <Route path="/skills" element={<SkillsMatrixPage />} />
              <Route path="/machine-auth" element={<MachineAuthPage />} />
              <Route path="/reviews" element={<ReviewsPage />} />
              <Route path="/whos-in" element={<WhosInPage />} />
              <Route path="/remnants" element={<RemnantsPage />} />
              <Route path="/materials" element={<MaterialsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppLayout>
        </ProtectedRoute>
      }
    />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
