import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import FeatureGate from "@/components/FeatureGate";
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
import FinanceDashboardPage from "./pages/FinanceDashboardPage";
import InvoicesPage from "./pages/InvoicesPage";
import BillsPage from "./pages/BillsPage";
import WagesPage from "./pages/WagesPage";
import OverheadsPage from "./pages/OverheadsPage";
import CustomersPage from "./pages/CustomersPage";
import SuppliersPage from "./pages/SuppliersPage";
import PandlePage from "./pages/PandlePage";
import PandleExportPage from "./pages/PandleExportPage";
import CashflowForecastPage from "./pages/CashflowForecastPage";
import ProductionControlPage from "./pages/ProductionControlPage";
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
              <Route path="/production" element={<ProductionControlPage />} />
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
              <Route path="/remnants" element={<FeatureGate flag="enable_remnants" featureName="Remnants"><RemnantsPage /></FeatureGate>} />
              <Route path="/materials" element={<MaterialsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/finance" element={<FeatureGate flag="enable_finance" featureName="Finance"><FinanceDashboardPage /></FeatureGate>} />
              <Route path="/finance/invoices" element={<FeatureGate flag="enable_finance" featureName="Finance"><InvoicesPage /></FeatureGate>} />
              <Route path="/finance/bills" element={<FeatureGate flag="enable_finance" featureName="Finance"><BillsPage /></FeatureGate>} />
              <Route path="/finance/wages" element={<FeatureGate flag="enable_finance" featureName="Finance"><WagesPage /></FeatureGate>} />
              <Route path="/finance/overheads" element={<FeatureGate flag="enable_finance" featureName="Finance"><OverheadsPage /></FeatureGate>} />
              <Route path="/finance/customers" element={<FeatureGate flag="enable_finance" featureName="Finance"><CustomersPage /></FeatureGate>} />
              <Route path="/finance/suppliers" element={<FeatureGate flag="enable_finance" featureName="Finance"><SuppliersPage /></FeatureGate>} />
              <Route path="/finance/pandle" element={<FeatureGate flag="enable_finance" featureName="Finance"><PandlePage /></FeatureGate>} />
              <Route path="/finance/pandle/export" element={<FeatureGate flag="enable_finance" featureName="Finance"><PandleExportPage /></FeatureGate>} />
              <Route path="/finance/forecast" element={<FeatureGate flag="enable_finance" featureName="Finance"><CashflowForecastPage /></FeatureGate>} />
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
