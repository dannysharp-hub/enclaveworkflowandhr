import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import FeatureGate from "@/components/FeatureGate";
import RoleGate from "@/components/RoleGate";
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
import PartLibraryPage from "./pages/PartLibraryPage";
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
import BankReconciliationPage from "./pages/BankReconciliationPage";
import ProductionControlPage from "./pages/ProductionControlPage";
import InstallSignOffPage from "./pages/InstallSignOffPage";
import ReportsPage from "./pages/ReportsPage";
import SmartQuotingPage from "./pages/SmartQuotingPage";
import PurchaseOrdersPage from "./pages/PurchaseOrdersPage";
import SupplierPerformancePage from "./pages/SupplierPerformancePage";
import ProductionDriftPage from "./pages/ProductionDriftPage";
import CapacityPlannerPage from "./pages/CapacityPlannerPage";
import AiInboxPage from "./pages/AiInboxPage";
import HrAdminPage from "./pages/HrAdminPage";
import MyHoursPage from "./pages/MyHoursPage";
import ExportCentrePage from "./pages/ExportCentrePage";
import MyPayPage from "./pages/MyPayPage";
import ClientPortalLoginPage from "./pages/portal/ClientPortalLoginPage";
import ClientPortalDashboardPage from "./pages/portal/ClientPortalDashboardPage";
import ClientPortalJobPage from "./pages/portal/ClientPortalJobPage";
import SupplierPortalLoginPage from "./pages/portal/SupplierPortalLoginPage";
import SupplierPortalDashboardPage from "./pages/portal/SupplierPortalDashboardPage";
import NotFound from "./pages/NotFound";
import BootstrapPage from "./pages/cab/BootstrapPage";
import LeadsPage from "./pages/cab/LeadsPage";
import JobDetailPage from "./pages/cab/JobDetailPage";
import EnquiryPage from "./pages/cab/EnquiryPage";
import CustomerPortalJobsPage from "./pages/cab/CustomerPortalJobsPage";
import CustomerPortalJobDetailPage from "./pages/cab/CustomerPortalJobDetailPage";
import GhlSettingsPage from "./pages/cab/GhlSettingsPage";
import WebhookLogsPage from "./pages/cab/WebhookLogsPage";
import TeamPage from "./pages/cab/TeamPage";
import CabSuppliersPage from "./pages/cab/SuppliersPage";
import ProductionBoardPage from "./pages/cab/ProductionBoardPage";
import InstallerJobsPage from "./pages/cab/InstallerJobsPage";
import ProfitWatchPage from "./pages/cab/ProfitWatchPage";
import TestCleanupPage from "./pages/cab/TestCleanupPage";
import AcceptQuotePage from "./pages/AcceptQuotePage";
import { ADMIN_ROLES, FINANCE_ROLES, PRODUCTION_MGMT_ROLES, REPORTING_ROLES, AI_INBOX_ROLES } from "@/lib/roleVisibility";

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
    {/* Public pages */}
    <Route path="/enquiry" element={<EnquiryPage />} />
    <Route path="/accept-quote" element={<AcceptQuotePage />} />
    {/* Client Portal routes (legacy) */}
    <Route path="/portal/login" element={<ClientPortalLoginPage />} />
    <Route path="/portal/dashboard" element={<ClientPortalDashboardPage />} />
    <Route path="/portal/job/:jobId" element={<ClientPortalJobPage />} />
    {/* Company-scoped portal routes */}
    <Route path="/portal/:companySlug/login" element={<ClientPortalLoginPage />} />
    <Route path="/portal/:companySlug/jobs" element={<CustomerPortalJobsPage />} />
    <Route path="/portal/:companySlug/job/:jobRef" element={<CustomerPortalJobDetailPage />} />
    {/* Legacy portal routes */}
    <Route path="/portal/jobs" element={<CustomerPortalJobsPage />} />
    <Route path="/portal/cab-job/:jobRef" element={<CustomerPortalJobDetailPage />} />
    {/* Supplier Portal routes */}
    <Route path="/supplier/login" element={<SupplierPortalLoginPage />} />
    <Route path="/supplier/dashboard" element={<SupplierPortalDashboardPage />} />
    <Route
      path="/*"
      element={
        <ProtectedRoute>
          <AppLayout>
            <Routes>
              {/* Cab admin routes */}
              <Route path="/admin/bootstrap" element={<BootstrapPage />} />
              <Route path="/admin/leads" element={<LeadsPage />} />
              <Route path="/admin/jobs/:jobRef" element={<JobDetailPage />} />
              <Route path="/admin/profit-watch" element={<ProfitWatchPage />} />
              <Route path="/admin/ghl" element={<GhlSettingsPage />} />
              <Route path="/admin/webhooks" element={<WebhookLogsPage />} />
              <Route path="/admin/team" element={<TeamPage />} />
              <Route path="/admin/suppliers" element={<CabSuppliersPage />} />
              <Route path="/admin/production" element={<ProductionBoardPage />} />
              <Route path="/admin/test-cleanup" element={<RoleGate allowedRoles={["admin"]}><TestCleanupPage /></RoleGate>} />
              {/* Installer routes */}
              <Route path="/installer/jobs" element={<InstallerJobsPage />} />
              {/* Open to all authenticated */}
              <Route path="/" element={<Index />} />
              <Route path="/my-work" element={<MyWorkPage />} />
              <Route path="/my-hours" element={<MyHoursPage />} />
              <Route path="/my-pay" element={<MyPayPage />} />
              <Route path="/workflow" element={<WorkflowPage />} />
              <Route path="/jobs" element={<JobsPage />} />
              <Route path="/jobs/:jobId/builder" element={<JobBuilderPage />} />
              <Route path="/jobs/:jobId/install-signoff" element={<InstallSignOffPage />} />
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
              <Route path="/part-library" element={<PartLibraryPage />} />

              {/* Legacy /production removed — use /admin/production instead */}
              <Route path="/drift" element={<RoleGate allowedRoles={PRODUCTION_MGMT_ROLES}><ProductionDriftPage /></RoleGate>} />
              <Route path="/capacity" element={<RoleGate allowedRoles={PRODUCTION_MGMT_ROLES}><CapacityPlannerPage /></RoleGate>} />

              {/* Staff admin — admin/supervisor/office */}
              <Route path="/staff" element={<RoleGate allowedRoles={ADMIN_ROLES}><StaffPage /></RoleGate>} />
              <Route path="/staff/:userId" element={<RoleGate allowedRoles={ADMIN_ROLES}><StaffProfilePage /></RoleGate>} />
              <Route path="/hr-admin" element={<RoleGate allowedRoles={ADMIN_ROLES}><HrAdminPage /></RoleGate>} />
              <Route path="/export-centre" element={<RoleGate allowedRoles={["admin"]}><ExportCentrePage /></RoleGate>} />

              {/* Finance — admin/office/finance */}
              <Route path="/finance" element={<FeatureGate flag="enable_finance" featureName="Finance"><RoleGate allowedRoles={FINANCE_ROLES}><FinanceDashboardPage /></RoleGate></FeatureGate>} />
              <Route path="/finance/invoices" element={<FeatureGate flag="enable_finance" featureName="Finance"><RoleGate allowedRoles={FINANCE_ROLES}><InvoicesPage /></RoleGate></FeatureGate>} />
              <Route path="/finance/bills" element={<FeatureGate flag="enable_finance" featureName="Finance"><RoleGate allowedRoles={FINANCE_ROLES}><BillsPage /></RoleGate></FeatureGate>} />
              <Route path="/finance/wages" element={<FeatureGate flag="enable_finance" featureName="Finance"><RoleGate allowedRoles={FINANCE_ROLES}><WagesPage /></RoleGate></FeatureGate>} />
              <Route path="/finance/overheads" element={<FeatureGate flag="enable_finance" featureName="Finance"><RoleGate allowedRoles={FINANCE_ROLES}><OverheadsPage /></RoleGate></FeatureGate>} />
              <Route path="/finance/customers" element={<FeatureGate flag="enable_finance" featureName="Finance"><RoleGate allowedRoles={FINANCE_ROLES}><CustomersPage /></RoleGate></FeatureGate>} />
              <Route path="/finance/suppliers" element={<FeatureGate flag="enable_finance" featureName="Finance"><RoleGate allowedRoles={FINANCE_ROLES}><SuppliersPage /></RoleGate></FeatureGate>} />
              <Route path="/finance/pandle" element={<FeatureGate flag="enable_finance" featureName="Finance"><RoleGate allowedRoles={FINANCE_ROLES}><PandlePage /></RoleGate></FeatureGate>} />
              <Route path="/finance/pandle/export" element={<FeatureGate flag="enable_finance" featureName="Finance"><RoleGate allowedRoles={FINANCE_ROLES}><PandleExportPage /></RoleGate></FeatureGate>} />
              <Route path="/finance/forecast" element={<FeatureGate flag="enable_finance" featureName="Finance"><RoleGate allowedRoles={FINANCE_ROLES}><CashflowForecastPage /></RoleGate></FeatureGate>} />
              <Route path="/finance/bank" element={<FeatureGate flag="enable_finance" featureName="Finance"><RoleGate allowedRoles={FINANCE_ROLES}><BankReconciliationPage /></RoleGate></FeatureGate>} />

              {/* Purchasing — admin/office/finance */}
              <Route path="/purchasing" element={<RoleGate allowedRoles={[...ADMIN_ROLES, "finance"]}><PurchaseOrdersPage /></RoleGate>} />
              <Route path="/purchasing/performance" element={<RoleGate allowedRoles={[...ADMIN_ROLES, "finance"]}><SupplierPerformancePage /></RoleGate>} />

              {/* Quoting */}
              <Route path="/quoting" element={<FeatureGate flag="enable_smart_quoting" featureName="Smart Quoting"><RoleGate allowedRoles={[...ADMIN_ROLES, "finance"]}><SmartQuotingPage /></RoleGate></FeatureGate>} />

              {/* Reports — admin/supervisor/office */}
              <Route path="/reports" element={<RoleGate allowedRoles={REPORTING_ROLES}><ReportsPage /></RoleGate>} />

              {/* AI Inbox — admin/supervisor/office */}
              <Route path="/ai-inbox" element={<RoleGate allowedRoles={AI_INBOX_ROLES}><AiInboxPage /></RoleGate>} />

              {/* Settings — admin only */}
              <Route path="/settings" element={<RoleGate allowedRoles={["admin"]}><SettingsPage /></RoleGate>} />

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
