import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScanProvider } from "@/lib/scan-context";
import AppLayout from "@/components/AppLayout";
import { LeadTracker } from "@/lib/lead-tracker";
import WorkspaceLayout from "@/components/workspace/WorkspaceLayout";

// Each route is its own chunk, fetched only when that route is visited,
// rather than shipping the whole app (workspace dashboards, PDF/QR
// generation, charts, every page) in a single bundle to every visitor —
// most of whom only ever hit one or two of these routes.
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const ScanUploadPage = lazy(() => import("@/pages/ScanUploadPage"));
const ScanProcessingPage = lazy(() => import("@/pages/ScanProcessingPage"));
const ScanResultsPage = lazy(() => import("@/pages/ScanResultsPage"));
const AdminLeadsPage = lazy(() => import("@/pages/AdminLeadsPage"));
const ProductHistoryPage = lazy(() => import("@/pages/ProductHistoryPage"));
const GenerateLabelPage = lazy(() => import("@/pages/GenerateLabelPage"));
const PublicLabelPage = lazy(() => import("@/pages/PublicLabelPage"));
const InsightsPage = lazy(() => import("@/pages/InsightsPage"));
const InsightPostPage = lazy(() => import("@/pages/InsightPostPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const AccountPage = lazy(() => import("@/pages/AccountPage"));
const DashboardPage = lazy(() => import("@/pages/workspace/DashboardPage"));
const LabelsPage = lazy(() => import("@/pages/workspace/LabelsPage"));
const ProductsPage = lazy(() => import("@/pages/workspace/ProductsPage"));
const CompliancePage = lazy(() => import("@/pages/workspace/CompliancePage"));
const SuppliersPage = lazy(() => import("@/pages/workspace/SuppliersPage"));
const SeasonalPage = lazy(() => import("@/pages/workspace/SeasonalPage"));
const VersionsPage = lazy(() => import("@/pages/workspace/VersionsPage"));
const DPPPage = lazy(() => import("@/pages/workspace/DPPPage"));
const TeamPage = lazy(() => import("@/pages/workspace/TeamPage"));
const SettingsPage = lazy(() => import("@/pages/workspace/SettingsPage"));

const RouteFallback = () => (
  <div className="flex min-h-[50vh] items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ScanProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <LeadTracker />
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<LandingPage />} />
                <Route path="/scan" element={<ScanUploadPage />} />
                <Route path="/scan/processing" element={<ScanProcessingPage />} />
                <Route path="/scan/results" element={<ScanResultsPage />} />
                <Route path="/admin/leads" element={<AdminLeadsPage />} />
                <Route path="/admin/products/:productKey" element={<ProductHistoryPage />} />
                <Route path="/generate" element={<GenerateLabelPage />} />
                <Route path="/account" element={<AccountPage />} />
                <Route path="/insights" element={<InsightsPage />} />
                <Route path="/insights/:slug" element={<InsightPostPage />} />
              </Route>
              <Route path="/label/:id" element={<PublicLabelPage />} />
              <Route element={<WorkspaceLayout />}>
                <Route path="/workspace" element={<DashboardPage />} />
                <Route path="/workspace/labels" element={<LabelsPage />} />
                <Route path="/workspace/products" element={<ProductsPage />} />
                <Route path="/workspace/compliance" element={<CompliancePage />} />
                <Route path="/workspace/suppliers" element={<SuppliersPage />} />
                <Route path="/workspace/seasonal" element={<SeasonalPage />} />
                <Route path="/workspace/versions" element={<VersionsPage />} />
                <Route path="/workspace/dpp" element={<DPPPage />} />
                <Route path="/workspace/team" element={<TeamPage />} />
                <Route path="/workspace/settings" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ScanProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
