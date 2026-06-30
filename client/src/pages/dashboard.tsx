import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Users, FolderKanban, FileText, Receipt, TrendingUp, AlertTriangle, Plus,
  ArrowRight, Zap, FileCheck, FilePlus, CreditCard, Truck,
  BarChart3, ArrowUpRight, ArrowDownRight, Minus, X,
  FileInput, CalendarDays, Clock, Activity, ChevronRight, Building2
} from "lucide-react";
import { fmtCurrency, fmtDocNumber } from "@/lib/format";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { hasPermission } from "@shared/permissions";

type RevenueRow = { month: string; revenue: number; count: number };

const MONTH_NAMES_DE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

const TYPE_LABELS: Record<string, string> = {
  angebot: "Angebot",
  auftragsbestaetigung: "AB",
  rechnung: "Rechnung",
  abschlagsrechnung: "Abschlag",
  gutschrift: "Gutschrift",
};

const TYPE_COLORS: Record<string, string> = {
  angebot: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  auftragsbestaetigung: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  rechnung: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  abschlagsrechnung: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

const STATUS_LABELS: Record<string, string> = {
  entwurf: "Entwurf",
  gesendet: "Gesendet",
  bezahlt: "Bezahlt",
  storniert: "Storniert",
  angenommen: "Angenommen",
  abgelehnt: "Abgelehnt",
  aktiv: "Aktiv",
};

function dateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "–";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return d;
}

function getPresetRange(preset: string): { from: string; to: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "this_month": {
      const from = new Date(y, m, 1);
      const to = new Date(y, m + 1, 0);
      return { from: dateStr(from), to: dateStr(to), label: `${MONTH_NAMES_DE[m]} ${y}` };
    }
    case "last_month": {
      const from = new Date(y, m - 1, 1);
      const to = new Date(y, m, 0);
      const lm = (m - 1 + 12) % 12;
      const ly = m === 0 ? y - 1 : y;
      return { from: dateStr(from), to: dateStr(to), label: `${MONTH_NAMES_DE[lm]} ${ly}` };
    }
    case "this_quarter": {
      const qStart = Math.floor(m / 3) * 3;
      const from = new Date(y, qStart, 1);
      const to = new Date(y, qStart + 3, 0);
      return { from: dateStr(from), to: dateStr(to), label: `Q${Math.floor(m / 3) + 1} ${y}` };
    }
    case "last_quarter": {
      const qStart = Math.floor(m / 3) * 3 - 3;
      const qy = qStart < 0 ? y - 1 : y;
      const qs = ((qStart % 12) + 12) % 12;
      const from = new Date(qy, qs, 1);
      const to = new Date(qy, qs + 3, 0);
      return { from: dateStr(from), to: dateStr(to), label: `Q${Math.floor(qs / 3) + 1} ${qy}` };
    }
    case "this_year":
      return { from: `${y}-01-01`, to: `${y}-12-31`, label: `Jahr ${y}` };
    case "last_year":
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: `Jahr ${y - 1}` };
    default:
      return { from: `${y}-01-01`, to: `${y}-12-31`, label: `Jahr ${y}` };
  }
}

function RevenueDialog({ open, onClose, currentMonthRevenue }: { open: boolean; onClose: () => void; currentMonthRevenue: number }) {
  const [, navigate] = useLocation();
  const [preset, setPreset] = useState("this_year");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [compareYear, setCompareYear] = useState<string>("");

  const range = useMemo(() => {
    if (preset === "custom") {
      if (customFrom && customTo && customFrom <= customTo)
        return { from: customFrom, to: customTo, label: "Eigener Zeitraum" };
      return null;
    }
    return getPresetRange(preset);
  }, [preset, customFrom, customTo]);

  const { data: revenueData, isLoading } = useQuery<RevenueRow[]>({
    queryKey: ["/api/dashboard/revenue", range?.from, range?.to],
    queryFn: () => fetch(`/api/dashboard/revenue?from=${range!.from}&to=${range!.to}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!range && open,
  });

  const compareRange = useMemo(() => {
    if (!compareYear || compareYear === "none" || !range) return null;
    const cy = parseInt(compareYear);
    if (isNaN(cy)) return null;
    const fromDate = new Date(range.from);
    const toDate = new Date(range.to);
    const yearOffset = cy - fromDate.getFullYear();
    const cFrom = new Date(fromDate);
    cFrom.setFullYear(cFrom.getFullYear() + yearOffset);
    const cTo = new Date(toDate);
    cTo.setFullYear(cTo.getFullYear() + yearOffset);
    if (cFrom > cTo) return null;
    return { from: dateStr(cFrom), to: dateStr(cTo) };
  }, [compareYear, range]);

  const { data: compareData } = useQuery<RevenueRow[]>({
    queryKey: ["/api/dashboard/revenue", compareRange?.from, compareRange?.to],
    queryFn: () => fetch(`/api/dashboard/revenue?from=${compareRange!.from}&to=${compareRange!.to}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!compareRange && open,
  });

  const totalRevenue = useMemo(() => (revenueData || []).reduce((sum, r) => sum + r.revenue, 0), [revenueData]);
  const totalCount = useMemo(() => (revenueData || []).reduce((sum, r) => sum + r.count, 0), [revenueData]);
  const compareTotalRevenue = useMemo(() => (compareData || []).reduce((sum, r) => sum + r.revenue, 0), [compareData]);
  const diffPercent = compareTotalRevenue > 0 ? ((totalRevenue - compareTotalRevenue) / compareTotalRevenue) * 100 : null;
  const maxRevenue = useMemo(() => {
    const allValues = [...(revenueData || []).map(r => r.revenue), ...(compareData || []).map(r => r.revenue)];
    return Math.max(...allValues, 1);
  }, [revenueData, compareData]);

  const allMonths = useMemo(() => {
    if (!range) return [];
    const months = new Set<string>();
    const startDate = new Date(range.from);
    const endDate = new Date(range.to);
    let cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    while (cur <= endDate) {
      months.add(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return Array.from(months).sort();
  }, [range]);

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-cyan-600" />
            Netto-Umsatzanalyse
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Zeitraum</Label>
              <Select value={preset} onValueChange={setPreset}>
                <SelectTrigger className="h-8 text-xs w-[160px]" data-testid="select-revenue-preset">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this_month">Aktueller Monat</SelectItem>
                  <SelectItem value="last_month">Vormonat</SelectItem>
                  <SelectItem value="this_quarter">Aktuelles Quartal</SelectItem>
                  <SelectItem value="last_quarter">Vorquartal</SelectItem>
                  <SelectItem value="this_year">Aktuelles Jahr</SelectItem>
                  <SelectItem value="last_year">Vorjahr</SelectItem>
                  <SelectItem value="custom">Eigener Zeitraum</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {preset === "custom" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Von</Label>
                  <Input type="date" className="h-8 text-xs w-[140px]" value={customFrom}
                    onChange={e => setCustomFrom(e.target.value)} data-testid="input-revenue-from" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Bis</Label>
                  <Input type="date" className="h-8 text-xs w-[140px]" value={customTo}
                    onChange={e => setCustomTo(e.target.value)} data-testid="input-revenue-to" />
                </div>
              </>
            )}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Vergleich mit</Label>
              <Select value={compareYear} onValueChange={setCompareYear}>
                <SelectTrigger className="h-8 text-xs w-[120px]" data-testid="select-compare-year">
                  <SelectValue placeholder="- kein -" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">- kein -</SelectItem>
                  {yearOptions.map(yr => (
                    <SelectItem key={yr} value={String(yr)}>{yr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border p-3 bg-cyan-50/50 dark:bg-cyan-950/20 border-cyan-200 dark:border-cyan-800">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Umsatz netto {range?.label ?? "..."}</p>
              {isLoading ? <Skeleton className="h-7 w-24" /> : (
                <p className="text-lg font-bold text-cyan-700 dark:text-cyan-400" data-testid="text-revenue-total">{fmtCurrency(totalRevenue)}</p>
              )}
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">Rechnungen</p>
              {isLoading ? <Skeleton className="h-7 w-12" /> : (
                <p className="text-lg font-bold" data-testid="text-revenue-count">{totalCount}</p>
              )}
            </div>
            {compareYear && compareYear !== "none" && (
              <div className="rounded-lg border p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">vs. {compareYear}</p>
                <div className="flex items-center gap-1.5">
                  {diffPercent !== null ? (
                    <>
                      {diffPercent > 0 ? <ArrowUpRight className="h-4 w-4 text-emerald-600" /> :
                       diffPercent < 0 ? <ArrowDownRight className="h-4 w-4 text-red-600" /> :
                       <Minus className="h-4 w-4 text-muted-foreground" />}
                      <span className={cn("text-lg font-bold", diffPercent > 0 ? "text-emerald-600" : diffPercent < 0 ? "text-red-600" : "")}
                        data-testid="text-revenue-diff">
                        {diffPercent > 0 ? "+" : ""}{diffPercent.toFixed(1).replace(".", ",")} %
                      </span>
                    </>
                  ) : <span className="text-sm text-muted-foreground">keine Daten</span>}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{fmtCurrency(compareTotalRevenue)}</p>
              </div>
            )}
          </div>

          {allMonths.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Monatliche Aufschlüsselung</p>
              <div className="space-y-1">
                {allMonths.map(month => {
                  const parts = month.split("-");
                  const mIdx = parseInt(parts[1]) - 1;
                  const label = `${MONTH_NAMES_DE[mIdx]} ${parts[0]}`;
                  const row = (revenueData || []).find(r => r.month === month);
                  const rev = row?.revenue || 0;
                  const cnt = row?.count || 0;
                  const pct = maxRevenue > 0 ? (rev / maxRevenue) * 100 : 0;

                  let compareRev: number | null = null;
                  let comparePct = 0;
                  if (compareYear && compareYear !== "none" && compareData && compareRange) {
                    const cy = parseInt(compareYear);
                    const yearOffset = cy - parseInt(range!.from.substring(0, 4));
                    const cMonthKey = `${parseInt(parts[0]) + yearOffset}-${parts[1]}`;
                    const cRow = compareData.find(r => r.month === cMonthKey);
                    compareRev = cRow?.revenue || 0;
                    comparePct = maxRevenue > 0 ? (compareRev / maxRevenue) * 100 : 0;
                  }

                  return (
                    <div key={month}
                      className="group cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
                      data-testid={`revenue-bar-${month}`}
                      onClick={() => { onClose(); navigate(`/rechnungsbuch?month=${month}`); }}
                      title={`Rechnungen ${label} anzeigen`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-muted-foreground w-16 shrink-0">{label}</span>
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-4 overflow-hidden relative">
                              <div className="h-full bg-gradient-to-r from-cyan-500 to-cyan-600 rounded-full transition-all duration-500 flex items-center justify-end pr-1"
                                style={{ width: `${Math.max(pct, 0.5)}%` }}>
                                {pct > 15 && <span className="text-[9px] text-white font-medium">{fmtCurrency(rev)}</span>}
                              </div>
                            </div>
                            {pct <= 15 && <span className="text-[10px] text-muted-foreground shrink-0">{fmtCurrency(rev)}</span>}
                          </div>
                          {compareRev !== null && (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2.5 overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-orange-400 to-orange-500 rounded-full transition-all duration-500 opacity-60"
                                  style={{ width: `${Math.max(comparePct, 0.5)}%` }} />
                              </div>
                              <span className="text-[9px] text-orange-600 dark:text-orange-400 shrink-0">{fmtCurrency(compareRev)}</span>
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground w-6 text-right shrink-0">{cnt > 0 ? cnt : ""}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {compareYear && compareYear !== "none" && (
                <div className="flex items-center gap-4 pt-1">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-6 rounded-full bg-gradient-to-r from-cyan-500 to-cyan-600" />
                    <span className="text-[10px] text-muted-foreground">{range?.from.substring(0, 4)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-6 rounded-full bg-gradient-to-r from-orange-400 to-orange-500 opacity-60" />
                    <span className="text-[10px] text-muted-foreground">{compareYear}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {!range && preset === "custom" && (
            <p className="text-sm text-muted-foreground text-center py-6">Bitte Von- und Bis-Datum eingeben (Von ≤ Bis)</p>
          )}
          {range && allMonths.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground text-center py-6">Keine Rechnungsdaten im gewählten Zeitraum</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MiniRevenueChart({ data }: { data: RevenueRow[] }) {
  if (!data || data.length === 0) return null;
  const maxVal = Math.max(...data.map(r => r.revenue), 1);

  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((row, i) => {
        const pct = Math.max((row.revenue / maxVal) * 100, 3);
        const parts = row.month.split("-");
        const mIdx = parseInt(parts[1]) - 1;
        return (
          <div key={row.month} className="flex-1 flex flex-col items-center gap-0.5" title={`${MONTH_NAMES_DE[mIdx]}: ${fmtCurrency(row.revenue)}`}>
            <div className="w-full rounded-t transition-all duration-700"
              style={{
                height: `${pct}%`,
                background: i === data.length - 1
                  ? "linear-gradient(to top, rgb(6, 182, 212), rgb(34, 211, 238))"
                  : "linear-gradient(to top, rgb(148, 163, 184), rgb(203, 213, 225))"
              }}
            />
            <span className="text-[8px] text-muted-foreground leading-none">{MONTH_NAMES_DE[mIdx]}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const role = user?.role || "mitarbeiter";
  const [, navigate] = useLocation();
  const [revenueOpen, setRevenueOpen] = useState(false);

  const { data: stats, isLoading } = useQuery<{
    totalCustomers: number;
    activeProjects: number;
    openOffers: number;
    openInvoices: number;
    overdueInvoices: number;
    monthlyRevenue: number;
    openIncomingInvoices: number;
    openIncomingTotal: number;
    upcomingAppointments: number;
  }>({ queryKey: ["/api/dashboard/stats"] });

  const { data: revenueChart } = useQuery<RevenueRow[]>({
    queryKey: ["/api/dashboard/revenue-chart"],
  });

  const { data: activity } = useQuery<{
    recentDocuments: any[];
    recentProjects: any[];
    overdueInvoices: any[];
  }>({ queryKey: ["/api/dashboard/recent-activity"] });

  const showRevenue = hasPermission(role, "dashboard_revenue");
  const showKpi = hasPermission(role, "dashboard_kpi");
  const showQuickActions = hasPermission(role, "dashboard_quick_actions");

  const userName = user?.fullName?.split(" ")[0] || "...";
  const now = new Date();
  const greeting = now.getHours() < 12 ? "Guten Morgen" : now.getHours() < 18 ? "Guten Tag" : "Guten Abend";

  const quickActions = [
    { label: "Neues Angebot", shortcut: "Alt+F5", href: "/dokumente/neu?type=angebot", icon: FilePlus, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/30" },
    { label: "Neue AB", shortcut: "Alt+F6", href: "/dokumente/neu?type=auftragsbestaetigung", icon: FileCheck, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
    { label: "Neue Rechnung", shortcut: "Alt+F7", href: "/dokumente/neu?type=rechnung", icon: Receipt, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/30" },
    { label: "Neue Gutschrift", shortcut: "Alt+F8", href: "/dokumente/neu?type=gutschrift", icon: CreditCard, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30" },
    { label: "Lieferschein", shortcut: "Alt+F9", href: "/dokumente/neu?type=lieferschein", icon: Truck, color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-950/30" },
    { label: "Freies Dokument", shortcut: "", href: "/dokumente/neu?type=freies_dokument", icon: FileText, color: "text-slate-600 dark:text-slate-400", bg: "bg-slate-50 dark:bg-slate-950/30" },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1600px] mx-auto">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-900 p-6 sm:p-8 text-white shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full translate-y-1/2 -translate-x-1/4 blur-3xl" />
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-4 w-4 text-cyan-400" />
              <span className="text-cyan-400 text-xs font-medium tracking-wide">ERP-System</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold mb-1" data-testid="text-dashboard-title">
              {greeting}, {stats ? userName : "..."}
            </h1>
            <p className="text-slate-400 text-sm">
              FriStD-Bau ZuB GmbH & Co.KG — Haldesdorfer Str. 44, 22179 Hamburg
            </p>
          </div>
          {showRevenue && revenueChart && revenueChart.length > 0 && (
            <div className="hidden sm:block w-44 cursor-pointer opacity-80 hover:opacity-100 transition-opacity"
              onClick={() => setRevenueOpen(true)} title="Umsatzanalyse öffnen">
              <MiniRevenueChart data={revenueChart} />
            </div>
          )}
        </div>
      </div>

      {showKpi && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 xl:grid-cols-4">
          <KpiCard
            title="Offene Angebote" value={stats?.openOffers ?? 0} icon={FileText}
            color="blue" href="/dokumente" loading={isLoading}
            subtitle={`${stats?.totalCustomers ?? 0} Kunden gesamt`}
          />
          <KpiCard
            title="Aktive Projekte" value={stats?.activeProjects ?? 0} icon={FolderKanban}
            color="emerald" href="/projekte" loading={isLoading}
          />
          <KpiCard
            title="Offene Rechnungen" value={stats?.openInvoices ?? 0} icon={Receipt}
            color="violet" href="/rechnungsbuch" loading={isLoading}
            alert={stats?.overdueInvoices ? `${stats.overdueInvoices} überfällig` : undefined}
          />
          <KpiCard
            title="Netto-Umsatz" value={fmtCurrency(stats?.monthlyRevenue ?? 0)} icon={TrendingUp}
            color="cyan" loading={isLoading} isText
            subtitle="Laufender Monat"
            onClick={showRevenue ? () => setRevenueOpen(true) : undefined}
          />
        </div>
      )}

      {showKpi && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 xl:grid-cols-4">
          <KpiCardSmall title="Überfällige Rg." value={stats?.overdueInvoices ?? 0} icon={AlertTriangle}
            color="red" href="/offene-posten" loading={isLoading} />
          <KpiCardSmall title="Offene ER" value={stats?.openIncomingInvoices ?? 0} icon={FileInput}
            color="pink" href="/rechnungseingang" loading={isLoading}
            subtitle={fmtCurrency(stats?.openIncomingTotal ?? 0)} />
          <KpiCardSmall title="Termine (7 Tage)" value={stats?.upcomingAppointments ?? 0} icon={CalendarDays}
            color="indigo" href="/termine" loading={isLoading} />
          <KpiCardSmall title="Kunden" value={stats?.totalCustomers ?? 0} icon={Users}
            color="slate" href="/adressen" loading={isLoading} />
        </div>
      )}

      <div className="grid gap-5 grid-cols-1 lg:grid-cols-3">
        {showQuickActions && (
          <Card className="shadow-sm border-0 bg-card/80">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary" />
                Schnellzugriff
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-2 gap-2">
                {quickActions.map((item) => (
                  <Link key={item.label} href={item.href}>
                    <button
                      className={cn(
                        "w-full text-left px-3 py-2.5 rounded-lg border border-transparent",
                        "hover:border-border hover:shadow-sm transition-all duration-150",
                        "flex items-center gap-2.5 group",
                        item.bg
                      )}
                      data-testid={`quick-${item.label.toLowerCase().replace(/\s/g, "-")}`}
                    >
                      <item.icon className={cn("h-4 w-4 shrink-0", item.color)} />
                      <div className="min-w-0">
                        <span className="text-xs font-medium block truncate">{item.label}</span>
                        {item.shortcut && (
                          <span className="text-[10px] text-muted-foreground font-mono">{item.shortcut}</span>
                        )}
                      </div>
                    </button>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="lg:col-span-2 shadow-sm border-0 bg-card/80">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Letzte Dokumente
              </CardTitle>
              <Link href="/dokumente">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" data-testid="link-all-documents">
                  Alle <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {!activity ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : activity.recentDocuments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Noch keine Dokumente vorhanden</p>
            ) : (
              <div className="space-y-1">
                {activity.recentDocuments.map((doc: any) => (
                  <div key={doc.id}
                    className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors group"
                    onClick={() => navigate(`/dokumente/${doc.id}/bearbeiten`)}
                    data-testid={`recent-doc-${doc.id}`}
                  >
                    <Badge variant="secondary" className={cn("text-[10px] font-medium shrink-0 px-1.5", TYPE_COLORS[doc.type] || "")}>
                      {TYPE_LABELS[doc.type] || doc.type}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground shrink-0">{fmtDocNumber(doc.documentNumber)}</span>
                        <span className="text-xs truncate">{doc.customerName || doc.subject}</span>
                      </div>
                    </div>
                    <span className="text-xs font-medium tabular-nums shrink-0">
                      {doc.grossTotal ? fmtCurrency(doc.verrechnungenSum > 0 ? doc.grossTotal - doc.verrechnungenSum : doc.grossTotal) : "–"}
                    </span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {activity && activity.overdueInvoices && activity.overdueInvoices.length > 0 && (
        <Card className="shadow-sm border-0 bg-red-50/50 dark:bg-red-950/10 border-l-4 border-l-red-500">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
                Überfällige Rechnungen
              </CardTitle>
              <Link href="/offene-posten">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-red-600 hover:text-red-700" data-testid="link-overdue">
                  Alle anzeigen <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-1">
              {activity.overdueInvoices.map((inv: any) => (
                <div key={inv.id}
                  className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-red-100/50 dark:hover:bg-red-950/20 cursor-pointer transition-colors"
                  onClick={() => navigate(`/dokumente/${inv.id}/bearbeiten`)}
                  data-testid={`overdue-${inv.id}`}
                >
                  <span className="text-xs font-mono text-muted-foreground shrink-0">{fmtDocNumber(inv.documentNumber)}</span>
                  <span className="text-xs flex-1 truncate">{inv.customerName || inv.subject}</span>
                  <span className="text-xs text-red-600 dark:text-red-400 shrink-0">
                    fällig {fmtDate(inv.validUntil)}
                  </span>
                  <span className="text-xs font-bold tabular-nums shrink-0">
                    {fmtCurrency((inv.grossTotal || 0) - (inv.paidAmount || 0))}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {activity && activity.recentProjects && activity.recentProjects.length > 0 && (
        <Card className="shadow-sm border-0 bg-card/80">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FolderKanban className="h-4 w-4 text-primary" />
                Neueste Projekte
              </CardTitle>
              <Link href="/projekte">
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" data-testid="link-all-projects">
                  Alle <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {activity.recentProjects.map((proj: any) => (
                <div key={proj.id}
                  className="rounded-lg border p-3 hover:shadow-sm cursor-pointer transition-all hover:border-primary/30"
                  onClick={() => navigate("/projekte")}
                  data-testid={`recent-proj-${proj.id}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono text-muted-foreground">{fmtDocNumber(proj.projectNumber)}</span>
                    <Badge variant="outline" className="text-[9px] px-1 h-4">
                      {STATUS_LABELS[proj.status] || proj.status}
                    </Badge>
                  </div>
                  <p className="text-xs font-medium truncate" title={proj.name}>{proj.name}</p>
                  {proj.customerName && (
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">{proj.customerName}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">{proj.docCount || 0} Dokumente</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <RevenueDialog open={revenueOpen} onClose={() => setRevenueOpen(false)} currentMonthRevenue={stats?.monthlyRevenue ?? 0} />
    </div>
  );
}

const COLOR_MAP: Record<string, { border: string; bg: string; text: string; icon: string }> = {
  blue: { border: "border-l-blue-500", bg: "bg-blue-50 dark:bg-blue-950/30", text: "text-blue-700 dark:text-blue-300", icon: "text-blue-500" },
  emerald: { border: "border-l-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-300", icon: "text-emerald-500" },
  violet: { border: "border-l-violet-500", bg: "bg-violet-50 dark:bg-violet-950/30", text: "text-violet-700 dark:text-violet-300", icon: "text-violet-500" },
  cyan: { border: "border-l-cyan-500", bg: "bg-cyan-50 dark:bg-cyan-950/30", text: "text-cyan-700 dark:text-cyan-300", icon: "text-cyan-500" },
  red: { border: "border-l-red-500", bg: "bg-red-50 dark:bg-red-950/30", text: "text-red-700 dark:text-red-300", icon: "text-red-500" },
  pink: { border: "border-l-pink-500", bg: "bg-pink-50 dark:bg-pink-950/30", text: "text-pink-700 dark:text-pink-300", icon: "text-pink-500" },
  indigo: { border: "border-l-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-950/30", text: "text-indigo-700 dark:text-indigo-300", icon: "text-indigo-500" },
  slate: { border: "border-l-slate-400", bg: "bg-slate-50 dark:bg-slate-950/30", text: "text-slate-700 dark:text-slate-300", icon: "text-slate-500" },
  amber: { border: "border-l-amber-500", bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-300", icon: "text-amber-500" },
};

function KpiCard({ title, value, icon: Icon, color, href, loading, subtitle, alert, isText, onClick }: {
  title: string; value: string | number; icon: typeof Users; color: string;
  href?: string; loading?: boolean; subtitle?: string; alert?: string; isText?: boolean; onClick?: () => void;
}) {
  const c = COLOR_MAP[color] || COLOR_MAP.slate;
  const inner = (
    <Card className={cn(
      "relative overflow-hidden border-l-4 transition-all duration-200",
      c.border,
      (href || onClick) && "cursor-pointer hover:shadow-md hover:-translate-y-0.5"
    )} onClick={onClick} data-testid={`kpi-${title.toLowerCase().replace(/[\s()\/]/g, "-")}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className={cn("p-2 rounded-lg", c.bg)}>
            <Icon className={cn("h-4 w-4", c.icon)} />
          </div>
          {alert && (
            <Badge variant="destructive" className="text-[10px] px-1.5 h-5 font-medium">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {alert}
            </Badge>
          )}
        </div>
        {loading ? (
          <Skeleton className="h-8 w-20 mb-1" />
        ) : (
          <div className={cn("text-2xl font-bold tracking-tight", isText && "text-lg")} data-testid={`stat-${title.toLowerCase().replace(/\s/g, "-")}`}>
            {value}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">{title}</p>
        {subtitle && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{subtitle}</p>}
        {(href || onClick) && (
          <div className="absolute bottom-2 right-2">
            <ArrowRight className="h-3 w-3 text-muted-foreground/30" />
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (href && !onClick) return <Link href={href}>{inner}</Link>;
  return inner;
}

function KpiCardSmall({ title, value, icon: Icon, color, href, loading, subtitle }: {
  title: string; value: string | number; icon: typeof Users; color: string;
  href?: string; loading?: boolean; subtitle?: string;
}) {
  const c = COLOR_MAP[color] || COLOR_MAP.slate;
  const inner = (
    <Card className={cn(
      "border-l-4 transition-all duration-200",
      c.border,
      href && "cursor-pointer hover:shadow-sm hover:-translate-y-0.5"
    )} data-testid={`kpi-sm-${title.toLowerCase().replace(/[\s()\/]/g, "-")}`}>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={cn("p-1.5 rounded-md", c.bg)}>
          <Icon className={cn("h-3.5 w-3.5", c.icon)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-muted-foreground truncate">{title}</p>
          {loading ? <Skeleton className="h-5 w-10" /> : (
            <p className="text-sm font-bold">{value}</p>
          )}
        </div>
        {subtitle && <span className="text-[10px] text-muted-foreground shrink-0">{subtitle}</span>}
      </CardContent>
    </Card>
  );

  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}
