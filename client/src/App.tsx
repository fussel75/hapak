import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { DocumentTabsProvider, DocumentTabBar } from "@/lib/document-tabs";
import AppLayout from "@/components/app-layout";
import { Skeleton } from "@/components/ui/skeleton";
import type { EditorSettings } from "@shared/schema";

const LoginPage = lazy(() => import("@/pages/login"));
const DashboardPage = lazy(() => import("@/pages/dashboard"));
const CustomersPage = lazy(() => import("@/pages/customers"));
const ProjectsPage = lazy(() => import("@/pages/projects"));
const DocumentsPage = lazy(() => import("@/pages/documents"));
const DocumentEditorPage = lazy(() => import("@/pages/document-editor"));
const DocumentViewPage = lazy(() => import("@/pages/document-view"));
const MaterialsPage = lazy(() => import("@/pages/materials"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const RechnungsbuchPage = lazy(() => import("@/pages/rechnungsbuch"));
const RechnungseingangPage = lazy(() => import("@/pages/rechnungseingang"));
const LohnstundenPage = lazy(() => import("@/pages/lohnstunden"));
const NachkalkulationPage = lazy(() => import("@/pages/nachkalkulation"));
const StundensatzPage = lazy(() => import("@/pages/stundensatz"));
const RessourcenPage = lazy(() => import("@/pages/ressourcen"));
const DispositionPage = lazy(() => import("@/pages/disposition"));
const BwaPage = lazy(() => import("@/pages/bwa"));
const ImportPage = lazy(() => import("@/pages/import"));
const OffenePostenPage = lazy(() => import("@/pages/offene-posten"));
const KassenbuchPage = lazy(() => import("@/pages/kassenbuch"));
const FloskelnPage = lazy(() => import("@/pages/floskeln"));
const WiedervorlagenPage = lazy(() => import("@/pages/wiedervorlagen"));
const PostbuchPage = lazy(() => import("@/pages/postbuch"));
const VertraegePage = lazy(() => import("@/pages/vertraege"));
const TerminePage = lazy(() => import("@/pages/termine"));
const MaterialstammPage = lazy(() => import("@/pages/materialstamm"));
const StuecklistenPage = lazy(() => import("@/pages/stuecklisten"));
const FinanzenPage = lazy(() => import("@/pages/finanzen"));
const MitarbeiterPage = lazy(() => import("@/pages/mitarbeiter"));
const LagerPage = lazy(() => import("@/pages/lager"));
const DesignerPage = lazy(() => import("@/pages/designer"));
const BankPage = lazy(() => import("@/pages/bank"));
const UeberweisungenPage = lazy(() => import("@/pages/ueberweisungen"));
const PrintDocumentPage = lazy(() => import("@/pages/print-document"));
const NotFound = lazy(() => import("@/pages/not-found"));

function PageFallback() {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center">
      <div className="space-y-3 text-center">
        <Skeleton className="mx-auto h-10 w-10 rounded-md" />
        <Skeleton className="mx-auto h-4 w-40" />
      </div>
    </div>
  );
}

function AuthenticatedRoutes() {
  const { data: editorSettings } = useQuery<EditorSettings>({
    queryKey: ["/api/editor-settings"],
  });

  return (
    <DocumentTabsProvider>
      <AppLayout>
        <Suspense fallback={<PageFallback />}>
          <Switch>
          <Route path="/" component={DashboardPage} />
          <Route path="/adressen" component={CustomersPage} />
          <Route path="/kunden" component={CustomersPage} />
          <Route path="/projekte" component={ProjectsPage} />
          <Route path="/dokumente" component={DocumentsPage} />
          <Route path="/dokumente/neu" component={DocumentEditorPage} />
          <Route path="/dokumente/:id/bearbeiten" component={DocumentEditorPage} />
          <Route path="/dokumente/:id" component={DocumentViewPage} />
          <Route path="/materialien" component={MaterialsPage} />
          <Route path="/einstellungen" component={SettingsPage} />
          <Route path="/rechnungsbuch" component={RechnungsbuchPage} />
          <Route path="/offene-posten" component={OffenePostenPage} />
          <Route path="/rechnungseingang" component={RechnungseingangPage} />
          <Route path="/lohnstunden" component={LohnstundenPage} />
          <Route path="/nachkalkulation" component={NachkalkulationPage} />
          <Route path="/stundensatz" component={StundensatzPage} />
          <Route path="/ressourcen" component={RessourcenPage} />
          <Route path="/disposition" component={DispositionPage} />
          <Route path="/bwa" component={BwaPage} />
          <Route path="/import" component={ImportPage} />
          <Route path="/kassenbuch" component={KassenbuchPage} />
          <Route path="/floskeln" component={FloskelnPage} />
          <Route path="/wiedervorlagen" component={WiedervorlagenPage} />
          <Route path="/postbuch" component={PostbuchPage} />
          <Route path="/vertraege" component={VertraegePage} />
          <Route path="/termine" component={TerminePage} />
          <Route path="/mitarbeiter" component={MitarbeiterPage} />
          <Route path="/materialstamm" component={MaterialstammPage} />
          <Route path="/stuecklisten" component={StuecklistenPage} />
          <Route path="/finanzen" component={FinanzenPage} />
          <Route path="/lager" component={LagerPage} />
          <Route path="/designer" component={DesignerPage} />
          <Route path="/bank" component={BankPage} />
          <Route path="/ueberweisungen" component={UeberweisungenPage} />
          <Route component={NotFound} />
          </Switch>
        </Suspense>
      </AppLayout>
      {editorSettings?.showStatusLine !== false && <DocumentTabBar />}
    </DocumentTabsProvider>
  );
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-4 text-center">
          <Skeleton className="h-12 w-12 rounded-full mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<PageFallback />}>
        <LoginPage />
      </Suspense>
    );
  }

  return <AuthenticatedRoutes />;
}

function App() {
  if (window.location.pathname === "/print") {
    return (
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={<PageFallback />}>
          <PrintDocumentPage />
        </Suspense>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
