import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { fmtCurrency, fmtNumber, fmtDocNumber, fmtDate } from "@/lib/format";
import { CustomerHoverCard } from "@/components/customer-hover-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CircleDot, TrendingUp, TrendingDown, Receipt, FileText, Search, ArrowLeft,
  ArrowUpDown, ChevronUp, ChevronDown, FolderOpen, BarChart3, Clock, Database,
  AlertTriangle, CheckCircle2, XCircle
} from "lucide-react";

interface NakaData {
  sollLohn: number; istLohn: number;
  sollMaterial: number; istMaterial: number;
  sollFremd: number; istFremd: number;
  sollGeraete: number; istGeraete: number;
  totalVk: number; anzPositionen: number;
}

interface OverviewProject {
  projectId: number;
  projectNumber: string;
  projectName: string;
  projectStatus: string;
  customerName: string | null;
  customerId: number | null;
  startDate: string | null;
  angebotssumme: number;
  anzAngebote: number;
  erloese: number;
  erloesBezahlt: number;
  erloesOffen: number;
  erloesSkonto: number;
  erloesMinderung: number;
  anzRechnungen: number;
  kosten: number;
  kostenBezahlt: number;
  kostenOffen: number;
  anzEingangsrechnungen: number;
  rohertrag: number;
  marge: number;
  sollStunden: number;
  istStunden: number;
  stundenAbw: number;
  hasNaka: boolean;
  naka: NakaData | null;
}

interface OverviewTotals {
  erloese: number;
  erloesBezahlt: number;
  erloesOffen: number;
  erloesSkonto: number;
  erloesMinderung: number;
  kosten: number;
  kostenBezahlt: number;
  kostenOffen: number;
  rohertrag: number;
  marge: number;
  anzProjekte: number;
  sollStunden: number;
  istStunden: number;
}

interface NakaDetail {
  hapakNr: string;
  hasNakaData: boolean;
  anzPositionen: number;
  source: string;
  summary: {
    soll: { stunden: number; lohn: number; material: number; fremd: number; geraete: number; totalEk: number };
    ist: { stunden: number; lohn: number; material: number; fremd: number; geraete: number; totalEk: number };
    vk: { lohn: number; material: number; fremd: number; geraete: number; total: number };
  };
}

function margeColor(m: number): string {
  if (m >= 20) return "text-green-600 dark:text-green-400";
  if (m >= 10) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function margeBg(m: number): string {
  if (m >= 20) return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
  if (m >= 10) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
  return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
}

function abwColor(soll: number, ist: number): string {
  if (soll <= 0) return "text-muted-foreground";
  const ratio = ist / soll;
  if (ratio > 1.1) return "text-red-600 dark:text-red-400";
  if (ratio > 0.95) return "text-yellow-600 dark:text-yellow-400";
  return "text-green-600 dark:text-green-400";
}

function statusDot(soll: number, ist: number): { color: string; label: string } {
  if (soll <= 0 && ist <= 0) return { color: "bg-gray-300 dark:bg-gray-600", label: "Keine Daten" };
  if (soll <= 0) return { color: "bg-blue-400", label: "Nur Ist" };
  const ratio = ist / soll;
  if (ratio > 1.1) return { color: "bg-red-500", label: "Überschritten" };
  if (ratio > 0.95) return { color: "bg-yellow-500", label: "Grenzbereich" };
  return { color: "bg-green-500", label: "Im Budget" };
}

const statusLabels: Record<string, string> = {
  aktiv: "Aktiv", abgeschlossen: "Abgeschl.", pausiert: "Pausiert", storniert: "Storniert",
};

type SortKey = "projectNumber" | "erloese" | "kosten" | "rohertrag" | "marge" | "customerName" | "sollStunden" | "istStunden";

function fmtStunden(h: number): string {
  if (h === 0) return "—";
  return fmtNumber(h, 1) + " h";
}

function OverviewTab({ onSelectProject }: { onSelectProject: (id: number) => void }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [sortKey, setSortKey] = useState<SortKey>("erloese");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data, isLoading } = useQuery<{ overview: OverviewProject[]; totals: OverviewTotals }>({
    queryKey: ["/api/post-calculations/overview"],
    queryFn: async () => {
      const res = await fetch("/api/post-calculations/overview", { credentials: "include" });
      if (!res.ok) throw new Error("Fehler");
      return res.json();
    },
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />;
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    let items = data.overview;
    if (statusFilter !== "alle") items = items.filter(p => p.projectStatus === statusFilter);
    if (search) {
      const s = search.toLowerCase();
      items = items.filter(p =>
        p.projectName.toLowerCase().includes(s) ||
        p.projectNumber.toLowerCase().includes(s) ||
        (p.customerName || "").toLowerCase().includes(s)
      );
    }
    items = [...items].sort((a, b) => {
      let va: any = a[sortKey], vb: any = b[sortKey];
      if (typeof va === "string") { va = va.toLowerCase(); vb = (vb || "").toLowerCase(); }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return items;
  }, [data, search, statusFilter, sortKey, sortDir]);

  const totals = data?.totals;
  const statusCounts = useMemo(() => {
    if (!data) return { alle: 0, aktiv: 0, abgeschlossen: 0 };
    const o = data.overview;
    return {
      alle: o.length,
      aktiv: o.filter(p => p.projectStatus === "aktiv").length,
      abgeschlossen: o.filter(p => p.projectStatus === "abgeschlossen").length,
    };
  }, [data]);

  const nakaCount = useMemo(() => data ? data.overview.filter(p => p.hasNaka).length : 0, [data]);

  if (isLoading) return (
    <div className="space-y-4">
      {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
    </div>
  );

  return (
    <div className="space-y-4">
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="overview-totals">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <FolderOpen className="h-3.5 w-3.5" />Projekte
              </div>
              <div className="text-2xl font-bold" data-testid="text-total-projekte">{totals.anzProjekte}</div>
              <div className="text-[10px] text-muted-foreground">{nakaCount} mit HAPAK-Nachkalkulation</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <FileText className="h-3.5 w-3.5" />Erlöse (netto)
              </div>
              <div className="text-2xl font-bold text-green-600" data-testid="text-total-erloese">{fmtCurrency(totals.erloese)}</div>
              <div className="text-[10px] text-muted-foreground">
                bezahlt {fmtCurrency(totals.erloesBezahlt)} | offen {fmtCurrency(totals.erloesOffen)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Receipt className="h-3.5 w-3.5" />Kosten (netto)
              </div>
              <div className="text-2xl font-bold text-red-600" data-testid="text-total-kosten">{fmtCurrency(totals.kosten)}</div>
              <div className="text-[10px] text-muted-foreground">
                bezahlt {fmtCurrency(totals.kostenBezahlt)} | offen {fmtCurrency(totals.kostenOffen)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <TrendingUp className="h-3.5 w-3.5" />Ø Marge
              </div>
              <div className={`text-2xl font-bold ${margeColor(totals.marge)}`} data-testid="text-total-marge">{fmtNumber(totals.marge)} %</div>
              <div className="text-[10px] text-muted-foreground">Rohertrag: {fmtCurrency(totals.rohertrag)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Clock className="h-3.5 w-3.5" />Stunden (Soll/Ist)
              </div>
              <div className="text-lg font-bold" data-testid="text-total-stunden">
                {fmtNumber(totals.sollStunden, 0)} <span className="text-xs text-muted-foreground font-normal">/ {fmtNumber(totals.istStunden, 0)}</span>
              </div>
              <div className="text-[10px] text-muted-foreground">Soll vs Ist-Stunden gesamt</div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="flex-shrink-0">
          <TabsList data-testid="tabs-status-filter">
            <TabsTrigger value="alle" data-testid="tab-alle">Alle ({statusCounts.alle})</TabsTrigger>
            <TabsTrigger value="aktiv" data-testid="tab-aktiv">Aktiv ({statusCounts.aktiv})</TabsTrigger>
            <TabsTrigger value="abgeschlossen" data-testid="tab-abgeschlossen">Abgeschl. ({statusCounts.abgeschlossen})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-10"
            placeholder="Projekt, Kunde suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-projects"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px] cursor-pointer" onClick={() => toggleSort("projectNumber")}>
                    <span className="flex items-center">Nr.<SortIcon col="projectNumber" /></span>
                  </TableHead>
                  <TableHead>Projekt</TableHead>
                  <TableHead className="hidden lg:table-cell cursor-pointer" onClick={() => toggleSort("customerName")}>
                    <span className="flex items-center">Kunde<SortIcon col="customerName" /></span>
                  </TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("erloese")}>
                    <span className="flex items-center justify-end">Erlöse<SortIcon col="erloese" /></span>
                  </TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("kosten")}>
                    <span className="flex items-center justify-end">Kosten<SortIcon col="kosten" /></span>
                  </TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("rohertrag")}>
                    <span className="flex items-center justify-end">Rohertrag<SortIcon col="rohertrag" /></span>
                  </TableHead>
                  <TableHead className="text-right w-[80px] cursor-pointer" onClick={() => toggleSort("marge")}>
                    <span className="flex items-center justify-end">Marge<SortIcon col="marge" /></span>
                  </TableHead>
                  <TableHead className="hidden xl:table-cell text-right cursor-pointer w-[100px]" onClick={() => toggleSort("sollStunden")}>
                    <span className="flex items-center justify-end">Soll h<SortIcon col="sollStunden" /></span>
                  </TableHead>
                  <TableHead className="hidden xl:table-cell text-right cursor-pointer w-[100px]" onClick={() => toggleSort("istStunden")}>
                    <span className="flex items-center justify-end">Ist h<SortIcon col="istStunden" /></span>
                  </TableHead>
                  <TableHead className="hidden xl:table-cell text-center w-[40px]">⬤</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      Keine Projekte gefunden
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((p) => {
                  const dot = statusDot(p.sollStunden, p.istStunden);
                  return (
                    <TableRow
                      key={p.projectId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => onSelectProject(p.projectId)}
                      data-testid={`row-project-${p.projectId}`}
                    >
                      <TableCell className="font-mono text-[11px]">
                        {fmtDocNumber(p.projectNumber)}
                        {p.hasNaka && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Database className="h-3 w-3 inline ml-1 text-blue-500" />
                              </TooltipTrigger>
                              <TooltipContent>HAPAK-Nachkalkulation vorhanden</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-medium leading-tight truncate max-w-[250px]">{p.projectName}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant="secondary" className="text-[9px] px-1">{statusLabels[p.projectStatus] || p.projectStatus}</Badge>
                          {p.startDate && <span className="text-[9px] text-muted-foreground">{fmtDate(p.startDate)}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs truncate max-w-[150px]" onClick={(e) => e.stopPropagation()}>
                        {p.customerId ? (
                          <CustomerHoverCard customerId={p.customerId}>
                            <a
                              href={`/adressen?selected=${p.customerId}`}
                              className="hover:text-primary hover:underline transition-colors"
                              data-testid={`link-nk-customer-${p.projectId}`}
                            >{p.customerName || "—"}</a>
                          </CustomerHoverCard>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-medium text-green-700 dark:text-green-400">
                        <div>{fmtCurrency(p.erloese)}</div>
                        {p.erloesOffen > 0 && (
                          <div className="text-[10px] font-normal text-amber-600 dark:text-amber-400">
                            offen {fmtCurrency(p.erloesOffen)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-medium text-red-600 dark:text-red-400">
                        <div>{fmtCurrency(p.kosten)}</div>
                        {p.kostenOffen > 0 && (
                          <div className="text-[10px] font-normal text-amber-600 dark:text-amber-400">
                            offen {fmtCurrency(p.kostenOffen)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className={`text-right font-mono text-xs font-bold ${p.rohertrag >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                        {fmtCurrency(p.rohertrag)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className={`text-[10px] px-1.5 font-mono ${margeBg(p.marge)}`} data-testid={`badge-marge-${p.projectId}`}>
                          {fmtNumber(p.marge)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-right font-mono text-[11px] text-muted-foreground">
                        {p.sollStunden > 0 ? fmtNumber(p.sollStunden, 0) : "—"}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-right font-mono text-[11px] text-muted-foreground">
                        {p.istStunden > 0 ? fmtNumber(p.istStunden, 0) : "—"}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className={`h-3 w-3 rounded-full mx-auto ${dot.color}`} />
                            </TooltipTrigger>
                            <TooltipContent>{dot.label}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface CostRow {
  label: string;
  sollKey: "lohn" | "material" | "fremd" | "geraete";
  icon: typeof Clock;
}

const costRows: CostRow[] = [
  { label: "Lohn", sollKey: "lohn", icon: Clock },
  { label: "Material", sollKey: "material", icon: Receipt },
  { label: "Fremdleistung", sollKey: "fremd", icon: FileText },
  { label: "Geräte", sollKey: "geraete", icon: CircleDot },
];

function ProjectDetailView({ projectId, onBack }: { projectId: number; onBack: () => void }) {
  const { data: overviewData } = useQuery<{ overview: OverviewProject[]; totals: OverviewTotals }>({
    queryKey: ["/api/post-calculations/overview"],
    queryFn: async () => {
      const res = await fetch("/api/post-calculations/overview", { credentials: "include" });
      if (!res.ok) throw new Error("Fehler");
      return res.json();
    },
  });

  const { data: nakaDetail, isLoading: loadingNaka } = useQuery<NakaDetail>({
    queryKey: ["/api/post-calculations/naka-detail", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/post-calculations/naka-detail/${projectId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Fehler");
      return res.json();
    },
    enabled: !!projectId,
  });

  const { data: autoCalc, isLoading: loadingAuto } = useQuery<{
    erloese: { netto: number; brutto: number; gutschriften: number; effektiv: number; bezahlt: number; offen: number; skonto: number; minderung: number; anzRechnungen: number; anzGutschriften: number };
    kosten: { netto: number; brutto: number; gutschriften: number; effektiv: number; bezahlt: number; offen: number; anzEingangsrechnungen: number; anzLieferantengutschriften: number };
    rohertrag: number;
    marge: number;
  }>({
    queryKey: ["/api/post-calculations/auto", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/post-calculations/auto/${projectId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Fehler");
      return res.json();
    },
    enabled: !!projectId,
  });

  const project = overviewData?.overview.find(p => p.projectId === projectId);
  const naka = nakaDetail;
  const isLoading = loadingNaka || loadingAuto;

  const sollIstData = useMemo(() => {
    if (!naka) return null;
    const s = naka.summary;
    return {
      rows: costRows.map(r => ({
        label: r.label,
        soll: s.soll[r.sollKey],
        ist: s.ist[r.sollKey],
        abw: s.ist[r.sollKey] - s.soll[r.sollKey],
        abwPct: s.soll[r.sollKey] > 0 ? ((s.ist[r.sollKey] - s.soll[r.sollKey]) / s.soll[r.sollKey]) * 100 : 0,
      })),
      totalSoll: s.soll.totalEk,
      totalIst: s.ist.totalEk,
    };
  }, [naka]);

  const maxBarVal = useMemo(() => {
    if (!sollIstData) return 1;
    return Math.max(
      ...sollIstData.rows.map(r => Math.max(Math.abs(r.soll), Math.abs(r.ist))),
      1
    );
  }, [sollIstData]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-overview">
          <ArrowLeft className="h-4 w-4 mr-1" />Übersicht
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold truncate" data-testid="text-project-detail-name">
            <a className="hover:text-primary hover:underline cursor-pointer" onClick={() => window.location.href = `/projekte?id=${projectId}`} title="Zum Projekt wechseln">
              {project ? `${fmtDocNumber(project.projectNumber)} — ${project.projectName}` : `Projekt #${projectId}`}
            </a>
          </h2>
        </div>
        {naka && (
          <Badge variant={naka.hasNakaData ? "default" : "secondary"} className="text-[10px]" data-testid="badge-naka-source">
            <Database className="h-3 w-3 mr-1" />
            {naka.hasNakaData ? `HAPAK (${naka.anzPositionen} Pos.)` : `Dokument-Kalkulation (${naka.anzPositionen} Pos.)`}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <>
          {autoCalc && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="auto-calc-cards">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <FileText className="h-3.5 w-3.5" />Erlöse (netto)
                  </div>
                  <div className="text-xl font-bold" data-testid="text-erloese">{fmtCurrency(autoCalc.erloese.effektiv)}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {autoCalc.erloese.anzRechnungen} Rechnung(en)
                  </div>
                  {autoCalc.erloese.bezahlt > 0 && (
                    <div className="text-[10px] text-green-600 dark:text-green-400 mt-0.5">
                      davon bezahlt: {fmtCurrency(autoCalc.erloese.bezahlt)}
                    </div>
                  )}
                  {autoCalc.erloese.offen > 0 && (
                    <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                      noch offen: {fmtCurrency(autoCalc.erloese.offen)}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Receipt className="h-3.5 w-3.5" />Kosten (netto)
                  </div>
                  <div className="text-xl font-bold" data-testid="text-kosten">{fmtCurrency(autoCalc.kosten.effektiv)}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {autoCalc.kosten.anzEingangsrechnungen} Eingangsrechnung(en)
                  </div>
                  {autoCalc.kosten.bezahlt > 0 && (
                    <div className="text-[10px] text-green-600 dark:text-green-400 mt-0.5">
                      davon bezahlt: {fmtCurrency(autoCalc.kosten.bezahlt)}
                    </div>
                  )}
                  {autoCalc.kosten.offen > 0 && (
                    <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                      noch offen: {fmtCurrency(autoCalc.kosten.offen)}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    {autoCalc.rohertrag >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-green-600" /> : <TrendingDown className="h-3.5 w-3.5 text-red-600" />}
                    Rohertrag
                  </div>
                  <div className={`text-xl font-bold ${autoCalc.rohertrag >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`} data-testid="text-rohertrag">
                    {fmtCurrency(autoCalc.rohertrag)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">Erlöse − Kosten</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <CircleDot className={`h-3.5 w-3.5 ${autoCalc.marge >= 20 ? "text-green-600" : autoCalc.marge >= 10 ? "text-yellow-600" : "text-red-600"}`} />
                    Marge
                  </div>
                  <div className={`text-xl font-bold ${margeColor(autoCalc.marge)}`} data-testid="text-marge">
                    {fmtNumber(autoCalc.marge)} %
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">Rohertrag / Erlöse</div>
                </CardContent>
              </Card>
            </div>
          )}

          {sollIstData && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2" data-testid="text-soll-ist-title">
                  <BarChart3 className="h-4 w-4" />
                  Soll-Ist-Vergleich — {project?.projectName || ""}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Kategorie</TableHead>
                      <TableHead className="text-right">Soll (€)</TableHead>
                      <TableHead className="text-right">Ist (€)</TableHead>
                      <TableHead className="text-right">Abweichung (€)</TableHead>
                      <TableHead className="text-right">Abweichung (%)</TableHead>
                      <TableHead className="w-[50px] text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sollIstData.rows.map((row) => {
                      const dot = statusDot(row.soll, row.ist);
                      return (
                        <TableRow key={row.label} data-testid={`row-soll-ist-${row.label.toLowerCase()}`}>
                          <TableCell className="font-medium text-sm">{row.label}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmtCurrency(row.soll)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmtCurrency(row.ist)}</TableCell>
                          <TableCell className={`text-right font-mono text-sm font-medium ${abwColor(row.soll, row.ist)}`}>
                            {fmtCurrency(row.abw)}
                          </TableCell>
                          <TableCell className={`text-right font-mono text-sm ${abwColor(row.soll, row.ist)}`}>
                            {row.soll > 0 ? fmtNumber(row.abwPct, 2) + " %" : "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className={`h-3.5 w-3.5 rounded-full mx-auto ${dot.color}`} />
                                </TooltipTrigger>
                                <TooltipContent>{dot.label}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="font-bold border-t-2" data-testid="row-soll-ist-gesamt">
                      <TableCell>Gesamt</TableCell>
                      <TableCell className="text-right font-mono">{fmtCurrency(sollIstData.totalSoll)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtCurrency(sollIstData.totalIst)}</TableCell>
                      <TableCell className={`text-right font-mono font-medium ${abwColor(sollIstData.totalSoll, sollIstData.totalIst)}`}>
                        {fmtCurrency(sollIstData.totalIst - sollIstData.totalSoll)}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${abwColor(sollIstData.totalSoll, sollIstData.totalIst)}`}>
                        {sollIstData.totalSoll > 0 ? fmtNumber(((sollIstData.totalIst - sollIstData.totalSoll) / sollIstData.totalSoll) * 100, 2) + " %" : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className={`h-3.5 w-3.5 rounded-full mx-auto ${statusDot(sollIstData.totalSoll, sollIstData.totalIst).color}`} />
                            </TooltipTrigger>
                            <TooltipContent>{statusDot(sollIstData.totalSoll, sollIstData.totalIst).label}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {sollIstData && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Kostenvergleich</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {sollIstData.rows.map((row) => {
                    const sollW = maxBarVal > 0 ? (Math.abs(row.soll) / maxBarVal) * 100 : 0;
                    const istW = maxBarVal > 0 ? (Math.abs(row.ist) / maxBarVal) * 100 : 0;
                    const dot = statusDot(row.soll, row.ist);
                    return (
                      <div key={row.label} className="space-y-1" data-testid={`chart-${row.label.toLowerCase()}`}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium w-28">{row.label}</span>
                          <span className="text-muted-foreground text-[10px]">
                            Soll: {fmtCurrency(row.soll)} | Ist: {fmtCurrency(row.ist)}
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] w-6 text-muted-foreground">Soll</span>
                            <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                              <div className="h-full rounded bg-blue-500/80 dark:bg-blue-400/80 transition-all" style={{ width: `${sollW}%` }} />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] w-6 text-muted-foreground">Ist</span>
                            <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                              <div className={`h-full rounded transition-all ${row.ist > row.soll * 1.1 ? "bg-red-500/80 dark:bg-red-400/80" : row.ist > row.soll * 0.95 ? "bg-yellow-500/80 dark:bg-yellow-400/80" : "bg-green-500/80 dark:bg-green-400/80"}`} style={{ width: `${istW}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {naka && naka.summary.soll.stunden > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Stundenvergleich
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg" data-testid="card-soll-stunden">
                    <div className="text-xs text-muted-foreground mb-1">Soll-Stunden</div>
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{fmtNumber(naka.summary.soll.stunden, 1)}</div>
                    <div className="text-[10px] text-muted-foreground">aus Kalkulation</div>
                  </div>
                  <div className="text-center p-4 bg-orange-50 dark:bg-orange-950/30 rounded-lg" data-testid="card-ist-stunden">
                    <div className="text-xs text-muted-foreground mb-1">Ist-Stunden</div>
                    <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{fmtNumber(naka.summary.ist.stunden, 1)}</div>
                    <div className="text-[10px] text-muted-foreground">tatsächlich gebucht</div>
                  </div>
                  <div className={`text-center p-4 rounded-lg ${naka.summary.ist.stunden > naka.summary.soll.stunden * 1.1 ? "bg-red-50 dark:bg-red-950/30" : "bg-green-50 dark:bg-green-950/30"}`} data-testid="card-stunden-abw">
                    <div className="text-xs text-muted-foreground mb-1">Abweichung</div>
                    <div className={`text-2xl font-bold ${naka.summary.ist.stunden > naka.summary.soll.stunden * 1.1 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                      {fmtNumber(naka.summary.ist.stunden - naka.summary.soll.stunden, 1)} h
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {naka.summary.soll.stunden > 0
                        ? `${fmtNumber(((naka.summary.ist.stunden - naka.summary.soll.stunden) / naka.summary.soll.stunden) * 100, 1)} %`
                        : "—"}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs w-12 text-muted-foreground">Soll</span>
                    <div className="flex-1 h-6 rounded bg-muted overflow-hidden">
                      <div className="h-full rounded bg-blue-500/70 transition-all flex items-center justify-end pr-2"
                        style={{ width: `${naka.summary.soll.stunden > 0 ? 100 : 0}%` }}>
                        <span className="text-[10px] text-white font-medium">{fmtNumber(naka.summary.soll.stunden, 0)} h</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs w-12 text-muted-foreground">Ist</span>
                    <div className="flex-1 h-6 rounded bg-muted overflow-hidden">
                      <div className={`h-full rounded transition-all flex items-center justify-end pr-2 ${
                        naka.summary.ist.stunden > naka.summary.soll.stunden * 1.1 ? "bg-red-500/70" : "bg-green-500/70"
                      }`} style={{ width: `${naka.summary.soll.stunden > 0 ? Math.min((naka.summary.ist.stunden / naka.summary.soll.stunden) * 100, 100) : 0}%` }}>
                        <span className="text-[10px] text-white font-medium">{fmtNumber(naka.summary.ist.stunden, 0)} h</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {(!naka || (!naka.hasNakaData && naka.anzPositionen === 0)) && (
            <Card>
              <CardContent className="p-8 text-center">
                <AlertTriangle className="h-8 w-8 mx-auto text-yellow-500 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Für dieses Projekt liegen keine Kalkulationsdaten (Soll-Werte) vor.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Kalkulationsdaten werden aus Angebots-/AB-Positionen oder HAPAK-Nachkalkulation gelesen.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default function NachkalkulationPage() {
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-nachkalkulation-title">
          <BarChart3 className="h-6 w-6" />
          Nachkalkulation
        </h1>
        <p className="text-muted-foreground text-sm">
          {selectedProjectId ? "Soll-Ist-Vergleich — Lohn, Material, Fremdleistung, Geräte" : "Alle Projekte — Erlöse, Kosten, Rohertrag, Marge & Stundenvergleich"}
        </p>
      </div>

      {selectedProjectId ? (
        <ProjectDetailView projectId={selectedProjectId} onBack={() => setSelectedProjectId(null)} />
      ) : (
        <OverviewTab onSelectProject={setSelectedProjectId} />
      )}
    </div>
  );
}
