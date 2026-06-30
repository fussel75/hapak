import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Project } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtNumber, fmtDocNumber } from "@/lib/format";
import { ChevronLeft, ChevronRight, Clock, AlertCircle, Loader2, RefreshCw, Calendar, CalendarDays, CalendarRange } from "lucide-react";

const DAY_NAMES = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTH_NAMES = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const MONTH_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getMondayOfWeek(week: number, year: number): Date {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
  return monday;
}

function getWeekDates(week: number, year: number): Date[] {
  const monday = getMondayOfWeek(week, year);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function formatDateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateDE(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`;
}

function getDaysInMonth(month: number, year: number): number {
  return new Date(year, month + 1, 0).getDate();
}

interface WorkerEntry {
  date: string;
  hours: number;
  isExtraHours: boolean;
  isWurstposition: boolean;
  wageType: string;
  startTime?: string;
  endTime?: string;
  projectNumber?: string;
  projectNumberInternal?: string;
  positionNumber?: string | null;
  positionName?: string | null;
  notes?: string;
}

interface WorkerData {
  name: string;
  workerId: string;
  totalHours: number;
  entries: WorkerEntry[];
}

interface WeeklyData {
  startDate: string;
  endDate: string;
  totalEntries: number;
  totalHours: number;
  totalExtraHours: number;
  totalWurstHours: number;
  workers: WorkerData[];
}

type ViewMode = "week" | "month" | "year" | "custom";

const wageTypeLabels: Record<string, string> = { "001": "Arbeit", "005": "Urlaub", "006": "Krank", "009": "Feiertag", "010": "WE-Bonus" };
const wageTypeColors: Record<string, string> = {
  "001": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "005": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "006": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  "009": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "010": "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  Arbeit: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Urlaub: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  Krank: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const viewModeLabels: Record<ViewMode, string> = {
  week: "Woche",
  month: "Monat",
  year: "Jahr",
  custom: "Zeitraum",
};

function getWorkerWageBreakdown(worker: WorkerData) {
  let arbeit = 0, urlaub = 0, krank = 0, feiertag = 0, extra = 0, wurst = 0;
  for (const e of worker.entries) {
    if (e.isExtraHours) extra += e.hours;
    if (e.isWurstposition) wurst += e.hours;
    if (e.wageType === "005") urlaub += e.hours;
    else if (e.wageType === "006") krank += e.hours;
    else if (e.wageType === "009") feiertag += e.hours;
    else arbeit += e.hours;
  }
  return { arbeit, urlaub, krank, feiertag, extra, wurst };
}

export default function LohnstundenPage() {
  const now = new Date();
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentWeek, setCurrentWeek] = useState(getISOWeek(now));
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [customStart, setCustomStart] = useState(formatDateISO(now));
  const [customEnd, setCustomEnd] = useState(formatDateISO(now));
  const [selectedWorker, setSelectedWorker] = useState<string>("all");

  const weekDates = useMemo(() => getWeekDates(currentWeek, currentYear), [currentWeek, currentYear]);
  const weekDateStrings = useMemo(() => weekDates.map(formatDateISO), [weekDates]);

  const customValid = customStart && customEnd && customStart <= customEnd;

  const { startDate, endDate } = useMemo(() => {
    if (viewMode === "week") {
      return { startDate: weekDateStrings[0], endDate: weekDateStrings[6] };
    } else if (viewMode === "month") {
      const days = getDaysInMonth(currentMonth, currentYear);
      return {
        startDate: `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`,
        endDate: `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(days).padStart(2, "0")}`,
      };
    } else if (viewMode === "year") {
      return {
        startDate: `${currentYear}-01-01`,
        endDate: `${currentYear}-12-31`,
      };
    } else {
      if (!customValid) return { startDate: "", endDate: "" };
      return { startDate: customStart, endDate: customEnd };
    }
  }, [viewMode, weekDateStrings, currentMonth, currentYear, customStart, customEnd, customValid]);

  const { data: projects } = useQuery<Project[]>({ queryKey: ["/api/projects"] });
  const projectMap = useMemo(() => {
    const m = new Map<string, Project>();
    if (projects) {
      for (const p of projects) {
        m.set(p.projectNumber, p);
        const pzzMatch = p.projectNumber.match(/^PZZ(\d{2})0?(\d{5})$/);
        if (pzzMatch) m.set(`${pzzMatch[1]}-${pzzMatch[2]}`, p);
      }
    }
    return m;
  }, [projects]);

  const fetchEnabled = viewMode !== "custom" || !!customValid;

  const { data: weeklyData, isLoading, error, refetch, isFetching } = useQuery<WeeklyData>({
    queryKey: ["/api/time-tracking/weekly", startDate, endDate],
    queryFn: async () => {
      const res = await fetch(`/api/time-tracking/weekly?startDate=${startDate}&endDate=${endDate}`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Fehler" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: fetchEnabled,
  });

  const filteredWorkers = useMemo(() => {
    if (!weeklyData?.workers) return [];
    if (selectedWorker === "all") return weeklyData.workers;
    return weeklyData.workers.filter(w => w.workerId === selectedWorker);
  }, [weeklyData, selectedWorker]);

  const summaryByProject = useMemo(() => {
    if (!weeklyData?.workers) return new Map<string, { name: string; hours: number }>();
    const map = new Map<string, { name: string; hours: number }>();
    for (const w of filteredWorkers) {
      for (const e of w.entries) {
        const pn = e.projectNumber || "Kein Projekt";
        const proj = projectMap.get(pn) || projectMap.get(e.projectNumberInternal || "");
        const name = proj ? proj.name : pn;
        const existing = map.get(pn) || { name, hours: 0 };
        existing.hours += e.hours;
        map.set(pn, existing);
      }
    }
    return map;
  }, [filteredWorkers, projectMap]);

  const summaryByWageType = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of filteredWorkers) {
      for (const e of w.entries) {
        const wt = e.wageType || "001";
        map.set(wt, (map.get(wt) || 0) + e.hours);
      }
    }
    return map;
  }, [filteredWorkers]);

  const totalBreakdown = useMemo(() => {
    let arbeit = 0, urlaub = 0, krank = 0, feiertag = 0, extra = 0, wurst = 0;
    for (const w of filteredWorkers) {
      const b = getWorkerWageBreakdown(w);
      arbeit += b.arbeit;
      urlaub += b.urlaub;
      krank += b.krank;
      feiertag += b.feiertag;
      extra += b.extra;
      wurst += b.wurst;
    }
    return { arbeit, urlaub, krank, feiertag, extra, wurst };
  }, [filteredWorkers]);

  const prevWeek = () => {
    if (currentWeek <= 1) { setCurrentWeek(52); setCurrentYear(currentYear - 1); }
    else setCurrentWeek(currentWeek - 1);
  };
  const nextWeek = () => {
    if (currentWeek >= 52) { setCurrentWeek(1); setCurrentYear(currentYear + 1); }
    else setCurrentWeek(currentWeek + 1);
  };
  const prevMonth = () => {
    if (currentMonth <= 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  };
  const nextMonth = () => {
    if (currentMonth >= 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
  };

  const periodLabel = useMemo(() => {
    if (viewMode === "week") return `KW ${currentWeek} / ${currentYear}`;
    if (viewMode === "month") return `${MONTH_NAMES[currentMonth]} ${currentYear}`;
    if (viewMode === "year") return `Jahr ${currentYear}`;
    if (viewMode === "custom") {
      if (!customStart || !customEnd) return "Zeitraum wählen";
      const s = new Date(customStart);
      const e = new Date(customEnd);
      return `${formatDateDE(s)}${s.getFullYear()} – ${formatDateDE(e)}${e.getFullYear()}`;
    }
    return "";
  }, [viewMode, currentWeek, currentMonth, currentYear, customStart, customEnd]);

  const periodSubLabel = useMemo(() => {
    if (viewMode === "week") return `${formatDateDE(weekDates[0])} – ${formatDateDE(weekDates[6])}${currentYear}`;
    if (viewMode === "month") {
      const days = getDaysInMonth(currentMonth, currentYear);
      return `01.${String(currentMonth + 1).padStart(2, "0")}. – ${String(days).padStart(2, "0")}.${String(currentMonth + 1).padStart(2, "0")}.${currentYear}`;
    }
    return "";
  }, [viewMode, weekDates, currentMonth, currentYear]);

  const monthlyBreakdown = useMemo(() => {
    if (viewMode !== "year" || !weeklyData?.workers) return null;
    const byMonth = new Map<number, Map<string, { arbeit: number; urlaub: number; krank: number; feiertag: number; extra: number; wurst: number; total: number }>>();
    for (let m = 0; m < 12; m++) byMonth.set(m, new Map());
    for (const w of filteredWorkers) {
      for (const e of w.entries) {
        const d = new Date(e.date);
        const m = d.getMonth();
        const monthMap = byMonth.get(m)!;
        if (!monthMap.has(w.workerId)) monthMap.set(w.workerId, { arbeit: 0, urlaub: 0, krank: 0, feiertag: 0, extra: 0, wurst: 0, total: 0 });
        const data = monthMap.get(w.workerId)!;
        data.total += e.hours;
        if (e.isExtraHours) data.extra += e.hours;
        if (e.isWurstposition) data.wurst += e.hours;
        if (e.wageType === "005") data.urlaub += e.hours;
        else if (e.wageType === "006") data.krank += e.hours;
        else if (e.wageType === "009") data.feiertag += e.hours;
        else if (e.wageType === "010") data.arbeit += e.hours;
        else data.arbeit += e.hours;
      }
    }
    return byMonth;
  }, [viewMode, weeklyData, filteredWorkers]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-lohnstunden-title">Lohnstundenerfassung</h1>
          <p className="text-muted-foreground text-sm">Übersicht der Arbeitszeiten (Zeiterfassungs-App)</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-refresh"
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
          Aktualisieren
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList className="grid grid-cols-4 w-full max-w-md" data-testid="tabs-view-mode">
              <TabsTrigger value="week" data-testid="tab-week">
                <Calendar className="h-3.5 w-3.5 mr-1" /> Woche
              </TabsTrigger>
              <TabsTrigger value="month" data-testid="tab-month">
                <CalendarDays className="h-3.5 w-3.5 mr-1" /> Monat
              </TabsTrigger>
              <TabsTrigger value="year" data-testid="tab-year">
                <CalendarRange className="h-3.5 w-3.5 mr-1" /> Jahr
              </TabsTrigger>
              <TabsTrigger value="custom" data-testid="tab-custom">
                Zeitraum
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2">
              {viewMode !== "custom" && (
                <Button variant="outline" size="icon" onClick={() => {
                  if (viewMode === "week") prevWeek();
                  else if (viewMode === "month") prevMonth();
                  else setCurrentYear(currentYear - 1);
                }} data-testid="button-prev">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              )}
              <div className="text-center min-w-[200px]">
                <div className="font-semibold" data-testid="text-period-label">{periodLabel}</div>
                {periodSubLabel && (
                  <div className="text-sm text-muted-foreground" data-testid="text-period-range">{periodSubLabel}</div>
                )}
              </div>
              {viewMode !== "custom" && (
                <Button variant="outline" size="icon" onClick={() => {
                  if (viewMode === "week") nextWeek();
                  else if (viewMode === "month") nextMonth();
                  else setCurrentYear(currentYear + 1);
                }} data-testid="button-next">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
              {viewMode === "custom" && (
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-[150px]"
                    data-testid="input-custom-start"
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-[150px]"
                    data-testid="input-custom-end"
                  />
                  {!customValid && (
                    <span className="text-xs text-destructive">Von-Datum muss vor Bis-Datum liegen</span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Label className="text-sm whitespace-nowrap">Mitarbeiter:</Label>
              <Select value={selectedWorker} onValueChange={setSelectedWorker}>
                <SelectTrigger className="w-[200px]" data-testid="select-employee-filter">
                  <SelectValue placeholder="Alle Mitarbeiter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle Mitarbeiter</SelectItem>
                  {weeklyData?.workers.map((w) => (
                    <SelectItem key={w.workerId} value={w.workerId}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {weeklyData && (
            <div className="flex flex-wrap gap-3 pt-1">
              <Badge variant="secondary" className="text-xs" data-testid="badge-total-hours">
                <Clock className="h-3 w-3 mr-1" />
                Gesamt: {fmtNumber(filteredWorkers.reduce((s, w) => s + w.totalHours, 0))} h
              </Badge>
              {totalBreakdown.extra > 0 && (
                <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" data-testid="badge-extra-hours">
                  Extra: {fmtNumber(totalBreakdown.extra)} h
                </Badge>
              )}
              {totalBreakdown.wurst > 0 && (
                <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" data-testid="badge-wurst-hours">
                  Wurst: {fmtNumber(totalBreakdown.wurst)} h
                </Badge>
              )}
              {totalBreakdown.urlaub > 0 && (
                <Badge variant="secondary" className={`text-xs ${wageTypeColors["005"]}`} data-testid="badge-urlaub-hours">
                  Urlaub: {fmtNumber(totalBreakdown.urlaub)} h
                </Badge>
              )}
              {totalBreakdown.krank > 0 && (
                <Badge variant="secondary" className={`text-xs ${wageTypeColors["006"]}`} data-testid="badge-krank-hours">
                  Krank: {fmtNumber(totalBreakdown.krank)} h
                </Badge>
              )}
              {totalBreakdown.feiertag > 0 && (
                <Badge variant="secondary" className={`text-xs ${wageTypeColors["009"]}`} data-testid="badge-feiertag-hours">
                  Feiertag: {fmtNumber(totalBreakdown.feiertag)} h
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4 flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {(error as Error).message}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Lade Zeiteinträge aus der Zeiterfassungs-App...
            </div>
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </CardContent>
        </Card>
      ) : viewMode === "week" ? (
        <WeeklyView
          weekDates={weekDates}
          weekDateStrings={weekDateStrings}
          filteredWorkers={filteredWorkers}
          weeklyData={weeklyData}
          projectMap={projectMap}
        />
      ) : viewMode === "year" ? (
        <YearlyView
          filteredWorkers={filteredWorkers}
          monthlyBreakdown={monthlyBreakdown}
          currentYear={currentYear}
        />
      ) : (
        <SummaryView
          filteredWorkers={filteredWorkers}
          weeklyData={weeklyData}
          projectMap={projectMap}
          startDate={startDate}
          endDate={endDate}
          viewMode={viewMode}
          currentMonth={currentMonth}
          currentYear={currentYear}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stunden pro Mitarbeiter</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredWorkers.map((w) => {
              const bd = getWorkerWageBreakdown(w);
              return (
                <div key={w.workerId} className="flex justify-between py-1 text-sm" data-testid={`summary-worker-${w.workerId}`}>
                  <span className="flex items-center gap-1.5">
                    {w.name}
                    {bd.urlaub > 0 && <span className="text-[10px] text-green-600 dark:text-green-400">U:{fmtNumber(bd.urlaub)}</span>}
                    {bd.krank > 0 && <span className="text-[10px] text-red-600 dark:text-red-400">K:{fmtNumber(bd.krank)}</span>}
                    {bd.wurst > 0 && <span className="text-[10px] text-amber-600 dark:text-amber-400 italic">W:{fmtNumber(bd.wurst)}</span>}
                  </span>
                  <span className="font-mono">{fmtNumber(w.totalHours)} h</span>
                </div>
              );
            })}
            <div className="flex justify-between pt-2 border-t mt-2 font-semibold text-sm" data-testid="summary-total-hours">
              <span>Gesamt</span>
              <span className="font-mono">{fmtNumber(filteredWorkers.reduce((s, w) => s + w.totalHours, 0))} h</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stunden pro Projekt</CardTitle>
          </CardHeader>
          <CardContent>
            {Array.from(summaryByProject.entries())
              .sort(([, a], [, b]) => b.hours - a.hours)
              .map(([pn, { name, hours }]) => (
              <div key={pn} className="flex justify-between py-1 text-sm" data-testid={`summary-project-${pn}`}>
                <span className="truncate mr-2" title={name}>{name}</span>
                <span className="font-mono shrink-0">{fmtNumber(hours)} h</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stunden pro Lohnart</CardTitle>
          </CardHeader>
          <CardContent>
            {Array.from(summaryByWageType.entries()).map(([wt, h]) => (
              <div key={wt} className="flex justify-between py-1 text-sm" data-testid={`summary-wagetype-${wt}`}>
                <span>
                  <Badge variant="secondary" className={`text-xs mr-2 ${wageTypeColors[wt] || wageTypeColors["001"]}`}>
                    {wageTypeLabels[wt] || wt}
                  </Badge>
                </span>
                <span className="font-mono">{fmtNumber(h)} h</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function WeeklyView({ weekDates, weekDateStrings, filteredWorkers, weeklyData, projectMap }: {
  weekDates: Date[];
  weekDateStrings: string[];
  filteredWorkers: WorkerData[];
  weeklyData: WeeklyData | undefined;
  projectMap: Map<string, Project>;
}) {
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 bg-background min-w-[150px]">Mitarbeiter</TableHead>
              {weekDates.map((d, i) => (
                <TableHead key={i} className="text-center min-w-[100px]">
                  <div>{DAY_NAMES[i]}</div>
                  <div className="text-xs text-muted-foreground font-normal">{formatDateDE(d)}</div>
                </TableHead>
              ))}
              <TableHead className="text-center min-w-[80px]">Summe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredWorkers.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  {weeklyData ? "Keine Einträge für diese Woche" : "Keine Mitarbeiter gefunden"}
                </TableCell>
              </TableRow>
            )}
            {filteredWorkers.map((worker) => {
              const entriesByDate = new Map<string, WorkerEntry[]>();
              for (const e of worker.entries) {
                const key = e.date;
                if (!entriesByDate.has(key)) entriesByDate.set(key, []);
                entriesByDate.get(key)!.push(e);
              }
              const breakdown = getWorkerWageBreakdown(worker);

              return (
                <TableRow key={worker.workerId} data-testid={`row-worker-${worker.workerId}`}>
                  <TableCell className="sticky left-0 z-10 bg-background font-medium">
                    {worker.name}
                  </TableCell>
                  {weekDateStrings.map((dateStr, dayIdx) => {
                    const dayEntries = entriesByDate.get(dateStr) || [];
                    const dayTotal = dayEntries.reduce((s, e) => s + e.hours, 0);
                    const dayExtra = dayEntries.filter(e => e.isExtraHours).reduce((s, e) => s + e.hours, 0);
                    return (
                      <TableCell key={dayIdx} className="text-center p-1 align-top" data-testid={`cell-${worker.workerId}-${dayIdx}`}>
                        {dayEntries.length > 0 ? (
                          <div className="space-y-0.5">
                            {dayEntries.map((entry, eIdx) => {
                              const proj = projectMap.get(entry.projectNumber || "") || projectMap.get(entry.projectNumberInternal || "");
                              return (
                                <div
                                  key={eIdx}
                                  className={`rounded-md px-1 py-0.5 text-xs ${entry.isExtraHours ? "bg-orange-50 dark:bg-orange-950/30" : ""}`}
                                  title={`${entry.startTime || ""}${entry.endTime ? "-" + entry.endTime : ""} | ${proj?.name || entry.projectNumber || ""}${entry.notes ? " | " + entry.notes : ""}`}
                                >
                                  <Badge
                                    variant="secondary"
                                    className={`text-xs ${entry.isWurstposition ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border border-dashed border-amber-400" : entry.isExtraHours ? "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" : wageTypeColors[entry.wageType] || wageTypeColors["001"]}`}
                                  >
                                    {entry.isWurstposition ? "W " : ""}
                                    {entry.isExtraHours ? "E " : ""}
                                    {entry.wageType === "005" ? "U " : entry.wageType === "006" ? "K " : entry.wageType === "009" ? "FT " : ""}
                                    {fmtNumber(entry.hours)} h
                                  </Badge>
                                  {entry.startTime && entry.endTime && (
                                    <div className="text-[10px] text-muted-foreground">{entry.startTime}-{entry.endTime}</div>
                                  )}
                                  {entry.isWurstposition && (
                                    <div className="text-[9px] text-amber-600 dark:text-amber-400 italic">n. zugeordnet</div>
                                  )}
                                  {entry.positionNumber && (
                                    <div className="text-[9px] text-muted-foreground" title={entry.positionName || ""}>
                                      Pos. {entry.positionNumber}
                                    </div>
                                  )}
                                  {proj && (
                                    <div className="text-[9px] text-muted-foreground truncate max-w-[90px]" title={proj.name}>
                                      {proj.name.slice(0, 15)}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            <div className="text-[10px] font-semibold text-muted-foreground pt-0.5 border-t mt-0.5">
                              {fmtNumber(dayTotal)} h
                              {dayExtra > 0 && <span className="text-orange-500 ml-0.5">(+{fmtNumber(dayExtra)})</span>}
                            </div>
                          </div>
                        ) : (
                          <div className="text-muted-foreground text-xs py-2">-</div>
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-center align-top" data-testid={`total-worker-${worker.workerId}`}>
                    <div className="font-semibold">{fmtNumber(worker.totalHours)} h</div>
                    {breakdown.urlaub > 0 && <div className="text-[10px] text-green-600 dark:text-green-400">U: {fmtNumber(breakdown.urlaub)}h</div>}
                    {breakdown.krank > 0 && <div className="text-[10px] text-red-600 dark:text-red-400">K: {fmtNumber(breakdown.krank)}h</div>}
                    {breakdown.feiertag > 0 && <div className="text-[10px] text-purple-600 dark:text-purple-400">FT: {fmtNumber(breakdown.feiertag)}h</div>}
                    {breakdown.extra > 0 && <div className="text-[10px] text-orange-600 dark:text-orange-400">+{fmtNumber(breakdown.extra)}h</div>}
                    {breakdown.wurst > 0 && <div className="text-[10px] text-amber-600 dark:text-amber-400 italic">W:{fmtNumber(breakdown.wurst)}h</div>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SummaryView({ filteredWorkers, weeklyData, projectMap, startDate, endDate, viewMode, currentMonth, currentYear }: {
  filteredWorkers: WorkerData[];
  weeklyData: WeeklyData | undefined;
  projectMap: Map<string, Project>;
  startDate: string;
  endDate: string;
  viewMode: ViewMode;
  currentMonth: number;
  currentYear: number;
}) {
  const daysInPeriod = useMemo(() => {
    if (viewMode === "month") {
      const days = getDaysInMonth(currentMonth, currentYear);
      return Array.from({ length: days }, (_, i) => {
        const d = new Date(currentYear, currentMonth, i + 1);
        return { date: formatDateISO(d), label: String(i + 1), dayName: DAY_NAMES[(d.getDay() + 6) % 7], isWeekend: d.getDay() === 0 || d.getDay() === 6 };
      });
    }
    return [];
  }, [viewMode, currentMonth, currentYear]);

  if (viewMode === "month" && daysInPeriod.length > 0) {
    return (
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-background min-w-[130px] text-xs">Mitarbeiter</TableHead>
                {daysInPeriod.map((d, i) => (
                  <TableHead key={i} className={`text-center min-w-[40px] px-0.5 text-[10px] ${d.isWeekend ? "bg-muted/50" : ""}`}>
                    <div>{d.dayName}</div>
                    <div className="font-normal text-muted-foreground">{d.label}.</div>
                  </TableHead>
                ))}
                <TableHead className="text-center min-w-[50px] text-xs">Arbeit</TableHead>
                <TableHead className="text-center min-w-[35px] text-xs text-green-600">U</TableHead>
                <TableHead className="text-center min-w-[35px] text-xs text-red-600">K</TableHead>
                <TableHead className="text-center min-w-[35px] text-xs text-purple-600">FT</TableHead>
                <TableHead className="text-center min-w-[50px] text-xs font-bold">Σ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredWorkers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={daysInPeriod.length + 6} className="text-center text-muted-foreground py-8">
                    Keine Einträge für diesen Monat
                  </TableCell>
                </TableRow>
              )}
              {filteredWorkers.map((worker) => {
                const entriesByDate = new Map<string, WorkerEntry[]>();
                for (const e of worker.entries) {
                  if (!entriesByDate.has(e.date)) entriesByDate.set(e.date, []);
                  entriesByDate.get(e.date)!.push(e);
                }
                const breakdown = getWorkerWageBreakdown(worker);

                return (
                  <TableRow key={worker.workerId} data-testid={`row-worker-${worker.workerId}`}>
                    <TableCell className="sticky left-0 z-10 bg-background font-medium text-xs py-1">
                      {worker.name}
                    </TableCell>
                    {daysInPeriod.map((day, dayIdx) => {
                      const dayEntries = entriesByDate.get(day.date) || [];
                      const dayTotal = dayEntries.reduce((s, e) => s + e.hours, 0);
                      const hasUrlaub = dayEntries.some(e => e.wageType === "005");
                      const hasKrank = dayEntries.some(e => e.wageType === "006");
                      const hasExtra = dayEntries.some(e => e.isExtraHours);
                      const hasFeiertag = dayEntries.some(e => e.wageType === "009");

                      let cellClass = day.isWeekend ? "bg-muted/50 " : "";
                      if (hasKrank) cellClass += "bg-red-50 dark:bg-red-950/30 ";
                      else if (hasUrlaub) cellClass += "bg-green-50 dark:bg-green-950/30 ";
                      else if (hasFeiertag) cellClass += "bg-purple-50 dark:bg-purple-950/30 ";

                      return (
                        <TableCell key={dayIdx} className={`text-center px-0.5 py-1 ${cellClass}`} data-testid={`cell-month-${worker.workerId}-${dayIdx}`}>
                          {dayTotal > 0 ? (
                            <div className="text-[10px] font-mono font-medium" title={dayEntries.map(e => `${e.startTime || ""}-${e.endTime || ""} ${wageTypeLabels[e.wageType] || ""} ${fmtNumber(e.hours)}h`).join("\n")}>
                              {hasKrank ? <span className="text-red-600 dark:text-red-400">K</span> :
                               hasUrlaub ? <span className="text-green-600 dark:text-green-400">U</span> :
                               hasFeiertag ? <span className="text-purple-600 dark:text-purple-400">FT</span> :
                               <span className={hasExtra ? "text-orange-600 dark:text-orange-400" : ""}>{fmtNumber(dayTotal)}</span>}
                            </div>
                          ) : null}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-center text-xs font-mono font-medium py-1" data-testid={`month-arbeit-${worker.workerId}`}>
                      {fmtNumber(breakdown.arbeit)}
                    </TableCell>
                    <TableCell className="text-center text-xs font-mono py-1 text-green-600 dark:text-green-400">
                      {breakdown.urlaub > 0 ? fmtNumber(breakdown.urlaub) : "-"}
                    </TableCell>
                    <TableCell className="text-center text-xs font-mono py-1 text-red-600 dark:text-red-400">
                      {breakdown.krank > 0 ? fmtNumber(breakdown.krank) : "-"}
                    </TableCell>
                    <TableCell className="text-center text-xs font-mono py-1 text-purple-600 dark:text-purple-400">
                      {breakdown.feiertag > 0 ? fmtNumber(breakdown.feiertag) : "-"}
                    </TableCell>
                    <TableCell className="text-center text-xs font-mono font-bold py-1" data-testid={`month-total-${worker.workerId}`}>
                      {fmtNumber(worker.totalHours)}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredWorkers.length > 1 && (
                <TableRow className="border-t-2 bg-muted/30 font-semibold">
                  <TableCell className="sticky left-0 z-10 bg-muted/30 text-xs py-1.5">Gesamt</TableCell>
                  {daysInPeriod.map((day, i) => {
                    const dayTotal = filteredWorkers.reduce((s, w) => {
                      return s + w.entries.filter(e => e.date === day.date).reduce((es, e) => es + e.hours, 0);
                    }, 0);
                    return (
                      <TableCell key={i} className={`text-center px-0.5 py-1.5 text-[10px] font-mono ${day.isWeekend ? "bg-muted/50" : ""}`}>
                        {dayTotal > 0 ? fmtNumber(dayTotal) : ""}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-center text-xs font-mono py-1.5">
                    {fmtNumber(filteredWorkers.reduce((s, w) => s + getWorkerWageBreakdown(w).arbeit, 0))}
                  </TableCell>
                  <TableCell className="text-center text-xs font-mono py-1.5 text-green-600">
                    {fmtNumber(filteredWorkers.reduce((s, w) => s + getWorkerWageBreakdown(w).urlaub, 0))}
                  </TableCell>
                  <TableCell className="text-center text-xs font-mono py-1.5 text-red-600">
                    {fmtNumber(filteredWorkers.reduce((s, w) => s + getWorkerWageBreakdown(w).krank, 0))}
                  </TableCell>
                  <TableCell className="text-center text-xs font-mono py-1.5 text-purple-600">
                    {fmtNumber(filteredWorkers.reduce((s, w) => s + getWorkerWageBreakdown(w).feiertag, 0))}
                  </TableCell>
                  <TableCell className="text-center text-xs font-mono font-bold py-1.5">
                    {fmtNumber(filteredWorkers.reduce((s, w) => s + w.totalHours, 0))}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs h-7">Mitarbeiter</TableHead>
              <TableHead className="text-xs h-7 text-right">Arbeit</TableHead>
              <TableHead className="text-xs h-7 text-right">Extra</TableHead>
              <TableHead className="text-xs h-7 text-right text-green-600">Urlaub</TableHead>
              <TableHead className="text-xs h-7 text-right text-red-600">Krank</TableHead>
              <TableHead className="text-xs h-7 text-right text-purple-600">Feiertag</TableHead>
              <TableHead className="text-xs h-7 text-right font-bold">Gesamt</TableHead>
              <TableHead className="text-xs h-7 text-right">Einträge</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredWorkers.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Keine Einträge für diesen Zeitraum
                </TableCell>
              </TableRow>
            )}
            {filteredWorkers.map((worker) => {
              const bd = getWorkerWageBreakdown(worker);
              return (
                <TableRow key={worker.workerId} data-testid={`row-worker-${worker.workerId}`}>
                  <TableCell className="text-xs py-1.5 font-medium">
                    <a className="hover:text-primary hover:underline cursor-pointer" onClick={() => window.location.href = `/mitarbeiter?search=${encodeURIComponent(worker.name)}`}>{worker.name}</a>
                  </TableCell>
                  <TableCell className="text-xs py-1.5 text-right font-mono">{fmtNumber(bd.arbeit)}</TableCell>
                  <TableCell className="text-xs py-1.5 text-right font-mono text-orange-600 dark:text-orange-400">
                    {bd.extra > 0 ? fmtNumber(bd.extra) : "-"}
                  </TableCell>
                  <TableCell className="text-xs py-1.5 text-right font-mono text-green-600 dark:text-green-400">
                    {bd.urlaub > 0 ? fmtNumber(bd.urlaub) : "-"}
                  </TableCell>
                  <TableCell className="text-xs py-1.5 text-right font-mono text-red-600 dark:text-red-400">
                    {bd.krank > 0 ? fmtNumber(bd.krank) : "-"}
                  </TableCell>
                  <TableCell className="text-xs py-1.5 text-right font-mono text-purple-600 dark:text-purple-400">
                    {bd.feiertag > 0 ? fmtNumber(bd.feiertag) : "-"}
                  </TableCell>
                  <TableCell className="text-xs py-1.5 text-right font-mono font-bold">
                    {fmtNumber(worker.totalHours)}
                  </TableCell>
                  <TableCell className="text-xs py-1.5 text-right">{worker.entries.length}</TableCell>
                </TableRow>
              );
            })}
            {filteredWorkers.length > 1 && (
              <TableRow className="border-t-2 bg-muted/30 font-semibold">
                <TableCell className="text-xs py-1.5">Gesamt</TableCell>
                <TableCell className="text-xs py-1.5 text-right font-mono">
                  {fmtNumber(filteredWorkers.reduce((s, w) => s + getWorkerWageBreakdown(w).arbeit, 0))}
                </TableCell>
                <TableCell className="text-xs py-1.5 text-right font-mono text-orange-600">
                  {fmtNumber(filteredWorkers.reduce((s, w) => s + getWorkerWageBreakdown(w).extra, 0))}
                </TableCell>
                <TableCell className="text-xs py-1.5 text-right font-mono text-green-600">
                  {fmtNumber(filteredWorkers.reduce((s, w) => s + getWorkerWageBreakdown(w).urlaub, 0))}
                </TableCell>
                <TableCell className="text-xs py-1.5 text-right font-mono text-red-600">
                  {fmtNumber(filteredWorkers.reduce((s, w) => s + getWorkerWageBreakdown(w).krank, 0))}
                </TableCell>
                <TableCell className="text-xs py-1.5 text-right font-mono text-purple-600">
                  {fmtNumber(filteredWorkers.reduce((s, w) => s + getWorkerWageBreakdown(w).feiertag, 0))}
                </TableCell>
                <TableCell className="text-xs py-1.5 text-right font-mono font-bold">
                  {fmtNumber(filteredWorkers.reduce((s, w) => s + w.totalHours, 0))}
                </TableCell>
                <TableCell className="text-xs py-1.5 text-right">
                  {filteredWorkers.reduce((s, w) => s + w.entries.length, 0)}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function YearlyView({ filteredWorkers, monthlyBreakdown, currentYear }: {
  filteredWorkers: WorkerData[];
  monthlyBreakdown: Map<number, Map<string, { arbeit: number; urlaub: number; krank: number; feiertag: number; extra: number; total: number }>> | null;
  currentYear: number;
}) {
  if (!monthlyBreakdown) return null;

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 bg-background min-w-[130px] text-xs">Mitarbeiter</TableHead>
              {MONTH_SHORT.map((m, i) => (
                <TableHead key={i} className="text-center min-w-[55px] text-xs px-1">{m}</TableHead>
              ))}
              <TableHead className="text-center min-w-[50px] text-xs">Arbeit</TableHead>
              <TableHead className="text-center min-w-[35px] text-xs text-green-600">U</TableHead>
              <TableHead className="text-center min-w-[35px] text-xs text-red-600">K</TableHead>
              <TableHead className="text-center min-w-[35px] text-xs text-purple-600">FT</TableHead>
              <TableHead className="text-center min-w-[55px] text-xs font-bold">Σ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredWorkers.length === 0 && (
              <TableRow>
                <TableCell colSpan={18} className="text-center text-muted-foreground py-8">
                  Keine Einträge für dieses Jahr
                </TableCell>
              </TableRow>
            )}
            {filteredWorkers.map((worker) => {
              const yearBreakdown = getWorkerWageBreakdown(worker);
              return (
                <TableRow key={worker.workerId} data-testid={`row-worker-year-${worker.workerId}`}>
                  <TableCell className="sticky left-0 z-10 bg-background font-medium text-xs py-1.5">
                    {worker.name}
                  </TableCell>
                  {Array.from({ length: 12 }, (_, m) => {
                    const monthMap = monthlyBreakdown.get(m)!;
                    const data = monthMap.get(worker.workerId);
                    if (!data || data.total === 0) {
                      return <TableCell key={m} className="text-center text-xs text-muted-foreground py-1.5 px-1">-</TableCell>;
                    }
                    return (
                      <TableCell key={m} className="text-center text-xs py-1.5 px-1" data-testid={`cell-year-${worker.workerId}-${m}`}>
                        <div className="font-mono font-medium">{fmtNumber(data.total)}</div>
                        {(data.urlaub > 0 || data.krank > 0 || data.feiertag > 0) && (
                          <div className="text-[9px] leading-tight">
                            {data.urlaub > 0 && <span className="text-green-600 dark:text-green-400">U:{fmtNumber(data.urlaub)} </span>}
                            {data.krank > 0 && <span className="text-red-600 dark:text-red-400">K:{fmtNumber(data.krank)} </span>}
                            {data.feiertag > 0 && <span className="text-purple-600 dark:text-purple-400">FT:{fmtNumber(data.feiertag)}</span>}
                          </div>
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-center text-xs font-mono font-medium py-1.5">{fmtNumber(yearBreakdown.arbeit)}</TableCell>
                  <TableCell className="text-center text-xs font-mono py-1.5 text-green-600">
                    {yearBreakdown.urlaub > 0 ? fmtNumber(yearBreakdown.urlaub) : "-"}
                  </TableCell>
                  <TableCell className="text-center text-xs font-mono py-1.5 text-red-600">
                    {yearBreakdown.krank > 0 ? fmtNumber(yearBreakdown.krank) : "-"}
                  </TableCell>
                  <TableCell className="text-center text-xs font-mono py-1.5 text-purple-600">
                    {yearBreakdown.feiertag > 0 ? fmtNumber(yearBreakdown.feiertag) : "-"}
                  </TableCell>
                  <TableCell className="text-center text-xs font-mono font-bold py-1.5" data-testid={`year-total-${worker.workerId}`}>
                    {fmtNumber(worker.totalHours)}
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredWorkers.length > 1 && (
              <TableRow className="border-t-2 bg-muted/30 font-semibold">
                <TableCell className="sticky left-0 z-10 bg-muted/30 text-xs py-1.5">Gesamt</TableCell>
                {Array.from({ length: 12 }, (_, m) => {
                  const monthMap = monthlyBreakdown.get(m)!;
                  let total = 0;
                  monthMap.forEach(v => { total += v.total; });
                  return (
                    <TableCell key={m} className="text-center text-xs font-mono py-1.5 px-1">
                      {total > 0 ? fmtNumber(total) : "-"}
                    </TableCell>
                  );
                })}
                <TableCell className="text-center text-xs font-mono py-1.5">
                  {fmtNumber(filteredWorkers.reduce((s, w) => s + getWorkerWageBreakdown(w).arbeit, 0))}
                </TableCell>
                <TableCell className="text-center text-xs font-mono py-1.5 text-green-600">
                  {fmtNumber(filteredWorkers.reduce((s, w) => s + getWorkerWageBreakdown(w).urlaub, 0))}
                </TableCell>
                <TableCell className="text-center text-xs font-mono py-1.5 text-red-600">
                  {fmtNumber(filteredWorkers.reduce((s, w) => s + getWorkerWageBreakdown(w).krank, 0))}
                </TableCell>
                <TableCell className="text-center text-xs font-mono py-1.5 text-purple-600">
                  {fmtNumber(filteredWorkers.reduce((s, w) => s + getWorkerWageBreakdown(w).feiertag, 0))}
                </TableCell>
                <TableCell className="text-center text-xs font-mono font-bold py-1.5">
                  {fmtNumber(filteredWorkers.reduce((s, w) => s + w.totalHours, 0))}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
