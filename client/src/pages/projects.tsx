import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CustomerHoverCard } from "@/components/customer-hover-card";
import type {
  Project,
  Customer,
  Document,
  User,
  IncomingInvoice,
  Employee,
} from "@shared/schema";
import {
  branchOptions,
  documentTypeLabels,
  documentStatusLabels,
  projectStatusLabels,
} from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtCurrency, fmtDate, fmtDocNumber } from "@/lib/format";
import {
  Plus,
  Search,
  Pencil,
  FileText,
  FileCheck,
  Receipt,
  RotateCcw,
  ChevronRight,
  ChevronDown,
  FolderKanban,
  FolderPlus,
  FolderOpen,
  Trash2,
  GripVertical,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Clock,
  AlertCircle,
  Loader2,
  ArrowUpDown,
  Link2,
  Unlink,
  Euro,
  Upload,
  ArrowLeft,
} from "lucide-react";
import { Link, useLocation } from "wouter";

const statusColors: Record<string, string> = {
  aktiv: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  abgeschlossen:
    "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  pausiert:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  storniert: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const docTypeIcons: Record<string, typeof FileText> = {
  angebot: FileText,
  auftragsbestaetigung: FileCheck,
  rechnung: Receipt,
  abschlagsrechnung: Receipt,
  gutschrift: RotateCcw,
};

const docTypeColors: Record<string, string> = {
  angebot: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  auftragsbestaetigung:
    "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  abschlagsrechnung:
    "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  teilrechnung:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  rechnung:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  gutschrift:
    "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  lieferschein:
    "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  freies_dokument:
    "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  nachkalkulation:
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
};

const docStatusColors: Record<string, string> = {
  entwurf:
    "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-400",
  gesendet:
    "border-blue-400 text-blue-600 bg-blue-50 dark:border-blue-600 dark:text-blue-400 dark:bg-blue-950/30",
  abgelehnt:
    "border-red-400 text-red-600 bg-red-50 dark:border-red-600 dark:text-red-400 dark:bg-red-950/30",
  beauftragt:
    "border-green-400 text-green-700 bg-green-50 dark:border-green-600 dark:text-green-400 dark:bg-green-950/30",
  teilbezahlt:
    "border-amber-400 text-amber-700 bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:bg-amber-950/30",
  bezahlt:
    "border-green-500 text-green-800 bg-green-100 dark:border-green-600 dark:text-green-300 dark:bg-green-950/30",
  storniert:
    "border-red-500 text-red-800 bg-red-100 dark:border-red-700 dark:text-red-300 dark:bg-red-950/30",
  archiviert:
    "border-gray-400 text-gray-500 bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:bg-gray-900/30",
};

const docTypeShort: Record<string, string> = {
  angebot: "ANG",
  auftragsbestaetigung: "AB",
  abschlagsrechnung: "AR",
  teilrechnung: "TR",
  rechnung: "RE",
  gutschrift: "GU",
  lieferschein: "LS",
  freies_dokument: "FD",
  nachkalkulation: "NK",
};

function ProjectForm({
  project,
  customers,
  onSave,
  onCancel,
}: {
  project?: Project;
  customers: Customer[];
  onSave: (data: any) => void;
  onCancel: () => void;
}) {
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const isNew = !project;

  const { data: nextNumber } = useQuery<{ number: string }>({
    queryKey: ["/api/projects/next-number"],
    enabled: isNew,
  });

  const [form, setForm] = useState({
    projectNumber: project?.projectNumber || "",
    customerId: project?.customerId || 0,
    name: project?.name || "",
    shortName: project?.shortName || "",
    description: project?.description || "",
    street: project?.street || "",
    zip: project?.zip || "",
    city: project?.city || "",
    branch: project?.branch || "",
    status: project?.status || "aktiv",
    startDate: project?.startDate || "",
    endDate: project?.endDate || "",
    budget: project?.budget || "",
    notes: project?.notes || "",
    costCenter: project?.costCenter || "",
    revenueAccount: project?.revenueAccount || "",
    representativeId: project?.representativeId || 0,
    referrerId: project?.referrerId || 0,
    reminderDate: project?.reminderDate || "",
  });
  const u = (f: string, v: any) => setForm((p) => ({ ...p, [f]: v }));

  useEffect(() => {
    if (isNew && nextNumber?.number && !form.projectNumber) {
      setForm((p) => ({ ...p, projectNumber: nextNumber.number }));
    }
  }, [isNew, nextNumber]);

  const handleSave = () => {
    const data: any = { ...form };
    if (!data.shortName) data.shortName = null;
    if (!data.costCenter) data.costCenter = null;
    if (!data.revenueAccount) data.revenueAccount = null;
    if (!data.representativeId) data.representativeId = null;
    if (!data.referrerId) data.referrerId = null;
    if (!data.reminderDate) data.reminderDate = null;
    if (!data.startDate) data.startDate = null;
    if (!data.endDate) data.endDate = null;
    if (!data.budget && data.budget !== 0) data.budget = null;
    if (!data.customerId) data.customerId = null;
    onSave(data);
  };

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Projektnummer {isNew ? "(automatisch)" : "*"}</Label>
          <Input
            data-testid="input-project-number"
            value={form.projectNumber}
            onChange={(e) => u("projectNumber", e.target.value)}
            readOnly={isNew}
            className={isNew ? "bg-muted cursor-not-allowed" : ""}
          />
        </div>
        <div className="space-y-2">
          <Label>Kunde *</Label>
          <Select
            value={String(form.customerId)}
            onValueChange={(v) => u("customerId", parseInt(v))}
          >
            <SelectTrigger data-testid="select-customer">
              <SelectValue placeholder="Kunde wählen" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name} ({c.customerNumber})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2 col-span-2">
          <Label>Betreff / Projektname *</Label>
          <Input
            data-testid="input-project-name"
            value={form.name}
            onChange={(e) => u("name", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Kürzel</Label>
          <Input
            data-testid="input-project-short-name"
            value={form.shortName || ""}
            onChange={(e) => u("shortName", e.target.value)}
            placeholder="z.B. WeWe20"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Beschreibung</Label>
        <Input
          data-testid="input-project-description"
          value={form.description || ""}
          onChange={(e) => u("description", e.target.value)}
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2 col-span-2">
          <Label>Straße</Label>
          <Input
            value={form.street || ""}
            onChange={(e) => u("street", e.target.value)}
            data-testid="input-street"
          />
        </div>
        <div className="space-y-2">
          <Label>PLZ</Label>
          <Input
            value={form.zip || ""}
            onChange={(e) => u("zip", e.target.value)}
            data-testid="input-zip"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Ort</Label>
          <Input
            value={form.city || ""}
            onChange={(e) => u("city", e.target.value)}
            data-testid="input-city"
          />
        </div>
        <div className="space-y-2">
          <Label>Gewerk</Label>
          <Select
            value={form.branch || ""}
            onValueChange={(v) => u("branch", v)}
          >
            <SelectTrigger data-testid="select-branch">
              <SelectValue placeholder="Gewerk" />
            </SelectTrigger>
            <SelectContent>
              {branchOptions.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => u("status", v)}>
            <SelectTrigger data-testid="select-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(projectStatusLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Beginn</Label>
          <Input
            type="date"
            value={form.startDate || ""}
            onChange={(e) => u("startDate", e.target.value)}
            data-testid="input-start"
          />
        </div>
        <div className="space-y-2">
          <Label>Ende</Label>
          <Input
            type="date"
            value={form.endDate || ""}
            onChange={(e) => u("endDate", e.target.value)}
            data-testid="input-end"
          />
        </div>
        <div className="space-y-2">
          <Label>Budget (€)</Label>
          <Input
            value={form.budget || ""}
            onChange={(e) => u("budget", e.target.value)}
            data-testid="input-budget"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Vertreter (intern)</Label>
          <Select
            value={String(form.representativeId || "0")}
            onValueChange={(v) => u("representativeId", parseInt(v) || 0)}
          >
            <SelectTrigger data-testid="select-representative">
              <SelectValue placeholder="Kein Vertreter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Kein Vertreter</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Vermittler</Label>
          <Select
            value={String(form.referrerId || "0")}
            onValueChange={(v) => u("referrerId", parseInt(v) || 0)}
          >
            <SelectTrigger data-testid="select-referrer">
              <SelectValue placeholder="Kein Vermittler" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Kein Vermittler</SelectItem>
              {customers.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name} ({c.customerNumber})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Wiedervorlage</Label>
          <Input
            type="date"
            value={form.reminderDate || ""}
            onChange={(e) => u("reminderDate", e.target.value)}
            data-testid="input-reminder"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Erlöskonto</Label>
          <Input
            value={form.revenueAccount || ""}
            onChange={(e) => u("revenueAccount", e.target.value)}
            data-testid="input-revenue-account"
          />
        </div>
        <div className="space-y-2">
          <Label>Kostenstelle</Label>
          <Input
            value={form.costCenter || ""}
            onChange={(e) => u("costCenter", e.target.value)}
            data-testid="input-cost-center"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Bemerkungen</Label>
        <Textarea
          rows={3}
          value={form.notes || ""}
          onChange={(e) => u("notes", e.target.value)}
          data-testid="input-notes"
        />
      </div>
      <div className="flex gap-2 justify-end pt-4">
        <Button
          variant="secondary"
          onClick={onCancel}
          data-testid="button-cancel"
        >
          Abbrechen
        </Button>
        <Button onClick={handleSave} data-testid="button-save-project">
          Speichern
        </Button>
      </div>
    </div>
  );
}

interface TimeTrackingSummary {
  projectNumber: string;
  totalHours: number;
  totalExtraHours: number;
  totalEntries: number;
  byEmployee: {
    name: string;
    employeeNumber: string;
    hours: number;
    extraHours: number;
    entries: number;
    trade: string;
  }[];
  byTrade: { trade: string; hours: number; entries: number }[];
  entries: {
    projectNumber: string;
    date: string;
    hours: number;
    isExtraHours: boolean;
    wageType: string;
    workerName: string;
    employeeNumber: string;
    trade: string;
    positionNumber: string | null;
    positionName: string | null;
    notes: string;
    startTime: string;
    endTime: string;
    isWurstposition?: boolean;
  }[];
}

const fmtHours = (h: number) =>
  h.toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

function nv(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  return Number(v) || 0;
}

function calcAgCostPerHour(emp: Employee): number {
  const hourly = nv(emp.hourlyRate);
  const monthlyH = nv(emp.monthlyHours) || 173.33;
  const aufschlag = nv(emp.agAufschlagPercent);
  const aufschlagPerHour = (hourly * aufschlag) / 100;
  const additionalPerHour = nv(emp.additionalMonthly) / monthlyH;
  return hourly + aufschlagPerHour + additionalPerHour;
}

function TimeTrackingTab({ projectNumber }: { projectNumber: string }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [tradeFilter, setTradeFilter] = useState("");
  const [showEntries, setShowEntries] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState({
    trade: "",
    startDate: "",
    endDate: "",
  });

  const queryParams = new URLSearchParams();
  if (appliedFilters.trade) queryParams.set("trade", appliedFilters.trade);
  if (appliedFilters.startDate)
    queryParams.set("startDate", appliedFilters.startDate);
  if (appliedFilters.endDate)
    queryParams.set("endDate", appliedFilters.endDate);
  const qs = queryParams.toString();

  const applyFilters = () =>
    setAppliedFilters({ trade: tradeFilter, startDate, endDate });
  const resetFilters = () => {
    setStartDate("");
    setEndDate("");
    setTradeFilter("");
    setAppliedFilters({ trade: "", startDate: "", endDate: "" });
  };

  const { data, isLoading, error } = useQuery<TimeTrackingSummary>({
    queryKey: ["/api/time-tracking/summary", projectNumber, qs],
    queryFn: async () => {
      const res = await fetch(
        `/api/time-tracking/summary/${encodeURIComponent(projectNumber)}${qs ? "?" + qs : ""}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Fehler" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    retry: false,
  });

  const { data: employees } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const empCostMap = new Map<string, number>();
  if (employees) {
    for (const emp of employees) {
      const cost = calcAgCostPerHour(emp);
      const fullName = `${emp.firstName} ${emp.lastName}`;
      empCostMap.set(fullName, cost);
      empCostMap.set(fullName.toLowerCase(), cost);
      if (emp.employeeNumber) empCostMap.set(emp.employeeNumber, cost);
      if (emp.workerIdExternal) empCostMap.set(emp.workerIdExternal, cost);
    }
  }

  const getEmpCost = (name: string, empNr: string): number => {
    return (
      empCostMap.get(name) ||
      empCostMap.get(name.toLowerCase()) ||
      empCostMap.get(empNr) ||
      0
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Zeiterfassung wird
          geladen...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-4">
          <div
            className="flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400"
            data-testid="text-zeiterfassung-error"
          >
            <AlertCircle className="h-4 w-4" />
            {(error as Error).message}
          </div>
        </CardContent>
      </Card>
    );
  }

  const wageTypeLabels: Record<string, string> = {
    "001": "Arbeit",
    "005": "Urlaub",
    "006": "Krank",
    "009": "Feiertag",
    "010": "WE-Bonus",
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Von</Label>
              <Input
                type="date"
                className="h-7 text-xs w-36"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="input-zeit-start"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Bis</Label>
              <Input
                type="date"
                className="h-7 text-xs w-36"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                data-testid="input-zeit-end"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                Gewerk
              </Label>
              <Input
                className="h-7 text-xs w-32"
                value={tradeFilter}
                onChange={(e) => setTradeFilter(e.target.value)}
                placeholder="z.B. Zimmerer"
                data-testid="input-zeit-trade"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={applyFilters}
              data-testid="button-zeit-filter"
            >
              <Search className="h-3 w-3 mr-1" />
              Filtern
            </Button>
            {(startDate || endDate || tradeFilter) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={resetFilters}
                data-testid="button-zeit-reset"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Zurücksetzen
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {!data || data.totalEntries === 0 ? (
        <Card>
          <CardContent
            className="p-4 text-sm text-muted-foreground"
            data-testid="text-zeiterfassung-empty"
          >
            <Clock className="h-4 w-4 inline mr-1" /> Keine Zeiteinträge für
            Projekt {projectNumber}
          </CardContent>
        </Card>
      ) : (
        <>
          {(() => {
            const totalLaborCost = data.byEmployee.reduce((sum, emp) => {
              const costPerH = getEmpCost(emp.name, emp.employeeNumber);
              return sum + emp.hours * costPerH;
            }, 0);
            const avgCostPerH =
              data.totalHours > 0 ? totalLaborCost / data.totalHours : 0;
            return (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Card>
                  <CardContent className="p-3">
                    <span className="text-muted-foreground text-[10px]">
                      Gesamtstunden
                    </span>
                    <p
                      className="text-lg font-bold"
                      data-testid="text-zeiterfassung-total"
                    >
                      {fmtHours(data.totalHours)} h
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <span className="text-muted-foreground text-[10px]">
                      davon Extrastunden
                    </span>
                    <p
                      className="text-lg font-bold text-orange-600 dark:text-orange-400"
                      data-testid="text-zeiterfassung-extra"
                    >
                      {fmtHours(data.totalExtraHours)} h
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <span className="text-muted-foreground text-[10px]">
                      Einträge
                    </span>
                    <p
                      className="text-lg font-bold"
                      data-testid="text-zeiterfassung-entries"
                    >
                      {data.totalEntries}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-primary/30">
                  <CardContent className="p-3">
                    <span className="text-muted-foreground text-[10px]">
                      Σ Lohnkosten (AG)
                    </span>
                    <p
                      className="text-lg font-bold text-primary"
                      data-testid="text-zeiterfassung-lohnkosten"
                    >
                      {totalLaborCost > 0 ? fmtCurrency(totalLaborCost) : "—"}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <span className="text-muted-foreground text-[10px]">
                      Ø AG-Kosten/Std
                    </span>
                    <p
                      className="text-lg font-bold"
                      data-testid="text-zeiterfassung-avg-cost"
                    >
                      {avgCostPerH > 0 ? fmtCurrency(avgCostPerH) : "—"}
                    </p>
                  </CardContent>
                </Card>
              </div>
            );
          })()}

          {data.byTrade.length > 0 && (
            <Card>
              <CardContent className="p-3">
                <h4 className="text-xs font-semibold mb-2">Nach Gewerk</h4>
                <div className="flex flex-wrap gap-2">
                  {data.byTrade.map((t, i) => (
                    <div
                      key={i}
                      className="border rounded-md px-3 py-1.5 text-xs"
                      data-testid={`badge-trade-${i}`}
                    >
                      <span className="font-medium">{t.trade}</span>
                      <span className="ml-2 text-muted-foreground">
                        {fmtHours(t.hours)} h ({t.entries})
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-3">
              <h4 className="text-xs font-semibold mb-2">Nach Mitarbeiter</h4>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs h-7">Mitarbeiter</TableHead>
                    <TableHead className="text-xs h-7">MA-Nr.</TableHead>
                    <TableHead className="text-xs h-7">Gewerk</TableHead>
                    <TableHead className="text-xs h-7 text-right">
                      Stunden
                    </TableHead>
                    <TableHead className="text-xs h-7 text-right">
                      Extra
                    </TableHead>
                    <TableHead className="text-xs h-7 text-right">
                      AG/Std
                    </TableHead>
                    <TableHead className="text-xs h-7 text-right font-semibold">
                      Lohnkosten
                    </TableHead>
                    <TableHead className="text-xs h-7 text-right">
                      Einträge
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byEmployee.map((emp, idx) => {
                    const costPerH = getEmpCost(emp.name, emp.employeeNumber);
                    const totalCost = emp.hours * costPerH;
                    return (
                      <TableRow key={idx} data-testid={`row-employee-${idx}`}>
                        <TableCell className="text-xs py-1 font-medium">
                          {emp.name}
                        </TableCell>
                        <TableCell className="text-xs py-1 text-muted-foreground">
                          {emp.employeeNumber}
                        </TableCell>
                        <TableCell className="text-xs py-1">
                          {emp.trade}
                        </TableCell>
                        <TableCell className="text-xs py-1 text-right font-mono">
                          {fmtHours(emp.hours)}
                        </TableCell>
                        <TableCell className="text-xs py-1 text-right font-mono text-orange-600 dark:text-orange-400">
                          {emp.extraHours > 0 ? fmtHours(emp.extraHours) : "-"}
                        </TableCell>
                        <TableCell className="text-xs py-1 text-right font-mono text-muted-foreground">
                          {costPerH > 0 ? fmtCurrency(costPerH) : "—"}
                        </TableCell>
                        <TableCell className="text-xs py-1 text-right font-mono font-semibold text-primary">
                          {totalCost > 0 ? fmtCurrency(totalCost) : "—"}
                        </TableCell>
                        <TableCell className="text-xs py-1 text-right">
                          {emp.entries}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {data.byEmployee.length > 1 && (
                    <TableRow className="border-t-2 font-semibold bg-muted/30">
                      <TableCell className="text-xs py-1.5" colSpan={3}>
                        Gesamt
                      </TableCell>
                      <TableCell className="text-xs py-1.5 text-right font-mono">
                        {fmtHours(data.totalHours)}
                      </TableCell>
                      <TableCell className="text-xs py-1.5 text-right font-mono text-orange-600 dark:text-orange-400">
                        {data.totalExtraHours > 0
                          ? fmtHours(data.totalExtraHours)
                          : "-"}
                      </TableCell>
                      <TableCell className="text-xs py-1.5 text-right font-mono text-muted-foreground">
                        {(() => {
                          const total = data.byEmployee.reduce(
                            (s, e) =>
                              s +
                              e.hours * getEmpCost(e.name, e.employeeNumber),
                            0,
                          );
                          return data.totalHours > 0 && total > 0
                            ? `Ø ${fmtCurrency(total / data.totalHours)}`
                            : "—";
                        })()}
                      </TableCell>
                      <TableCell className="text-xs py-1.5 text-right font-mono font-bold text-primary">
                        {(() => {
                          const total = data.byEmployee.reduce(
                            (s, e) =>
                              s +
                              e.hours * getEmpCost(e.name, e.employeeNumber),
                            0,
                          );
                          return total > 0 ? fmtCurrency(total) : "—";
                        })()}
                      </TableCell>
                      <TableCell className="text-xs py-1.5 text-right">
                        {data.totalEntries}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold">
                  Einzeleinträge ({data.entries.length})
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() => setShowEntries(!showEntries)}
                  data-testid="button-toggle-entries"
                >
                  {showEntries ? "Ausblenden" : "Einblenden"}
                </Button>
              </div>
              {showEntries && (
                <div className="max-h-[400px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px] h-6">Datum</TableHead>
                        <TableHead className="text-[10px] h-6">
                          Mitarbeiter
                        </TableHead>
                        <TableHead className="text-[10px] h-6">
                          Gewerk
                        </TableHead>
                        <TableHead className="text-[10px] h-6">
                          Position
                        </TableHead>
                        <TableHead className="text-[10px] h-6">
                          Lohnart
                        </TableHead>
                        <TableHead className="text-[10px] h-6">Zeit</TableHead>
                        <TableHead className="text-[10px] h-6 text-right">
                          Stunden
                        </TableHead>
                        <TableHead className="text-[10px] h-6">
                          Bemerkung
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.entries.map((e, i) => (
                        <TableRow
                          key={i}
                          className={
                            e.isExtraHours
                              ? "bg-orange-50/50 dark:bg-orange-950/20"
                              : ""
                          }
                          data-testid={`row-entry-${i}`}
                        >
                          <TableCell className="text-[10px] py-0.5">
                            {e.date
                              ? new Date(e.date).toLocaleDateString("de-DE")
                              : ""}
                          </TableCell>
                          <TableCell className="text-[10px] py-0.5">
                            {e.workerName}
                          </TableCell>
                          <TableCell className="text-[10px] py-0.5">
                            {e.trade}
                          </TableCell>
                          <TableCell
                            className="text-[10px] py-0.5 max-w-[140px] truncate"
                            data-testid={`cell-position-${i}`}
                          >
                            {e.isWurstposition ||
                            (!e.positionNumber && !e.positionName) ? (
                              <span className="text-amber-600 dark:text-amber-400 italic">
                                n. zugeordnet
                              </span>
                            ) : (
                              <span title={e.positionName || ""}>
                                {e.positionNumber && (
                                  <span className="font-mono mr-1">
                                    {e.positionNumber}
                                  </span>
                                )}
                                {e.positionName}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-[10px] py-0.5">
                            {wageTypeLabels[e.wageType] || e.wageType}
                          </TableCell>
                          <TableCell className="text-[10px] py-0.5 font-mono">
                            {e.startTime && e.endTime
                              ? `${e.startTime}-${e.endTime}`
                              : ""}
                          </TableCell>
                          <TableCell className="text-[10px] py-0.5 text-right font-mono font-medium">
                            {fmtHours(Number(e.hours) || 0)}
                          </TableCell>
                          <TableCell className="text-[10px] py-0.5 text-muted-foreground max-w-[150px] truncate">
                            {e.notes}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

interface TreeNode {
  id: number;
  project_id: number;
  document_id: number | null;
  parent_id: number | null;
  node_type: string;
  folder_name: string | null;
  sort_order: number;
  document_number?: string;
  doc_type?: string;
  subject?: string;
  doc_date?: string;
  doc_status?: string;
  net_total?: string;
  gross_total?: string;
  custom_type_label?: string;
  previously_invoiced?: string;
  tax_rate?: string;
  fibu_netto?: string;
  fibu_brutto?: string;
  verrechnungen_sum?: string;
}

type DropZone = "before" | "inside" | "after";

function TreeNodeRow({
  node,
  children: childNodes,
  allNodes,
  depth,
  expanded,
  toggleExpand,
  onDragStart,
  onDragOverNode,
  onDropOnNode,
  onRemove,
  onRenameFolder,
  onAddDocToFolder,
  unlinkedDocs,
  dragOverId,
  dropZone,
}: {
  node: TreeNode;
  children: TreeNode[];
  allNodes: TreeNode[];
  depth: number;
  expanded: Set<number>;
  toggleExpand: (id: number) => void;
  onDragStart: (id: number) => void;
  onDragOverNode: (e: React.DragEvent, id: number, zone: DropZone) => void;
  onDropOnNode: (e: React.DragEvent, targetId: number, zone: DropZone) => void;
  onRemove: (id: number) => void;
  onRenameFolder: (id: number, name: string) => void;
  onAddDocToFolder?: (docId: number, parentId: number) => void;
  unlinkedDocs?: Document[];
  dragOverId: number | null;
  dropZone: DropZone | null;
}) {
  const isFolder = node.node_type === "folder";
  const isRootFolder = isFolder && node.parent_id === null;
  const hasChildren = childNodes.length > 0;
  const isExpanded = expanded.has(node.id);
  const Icon = isRootFolder
    ? FolderKanban
    : isFolder
      ? isExpanded
        ? FolderOpen
        : FolderKanban
      : docTypeIcons[node.doc_type || ""] || FileText;
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(node.folder_name || "");

  const isOver = dragOverId === node.id;
  const showTopLine = isOver && dropZone === "before";
  const showInside = isOver && dropZone === "inside";
  const showBottomLine = isOver && dropZone === "after";

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;
    let zone: DropZone;
    if (y < h * 0.25) zone = "before";
    else if (y > h * 0.75) zone = "after";
    else zone = "inside";
    onDragOverNode(e, node.id, zone);
  };

  const rowContent = (
      <div
        className={`flex items-center gap-1 px-1 py-0.5 text-sm rounded cursor-pointer group
          ${showInside ? "bg-blue-100 dark:bg-blue-900/40 ring-1 ring-blue-400 ring-inset" : "hover:bg-accent"}`}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        draggable={!isRootFolder && !editing}
        onDragStart={(e) => {
          if (editing) { e.preventDefault(); return; }
          e.dataTransfer.setData("text/plain", String(node.id));
          onDragStart(node.id);
        }}
        onDragOver={handleDragOver}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          const y = e.clientY - rect.top;
          const h = rect.height;
          let zone: DropZone;
          if (y < h * 0.25) zone = "before";
          else if (y > h * 0.75) zone = "after";
          else zone = "inside";
          onDropOnNode(e, node.id, zone);
        }}
      >
        <button
          className="h-4 w-4 flex items-center justify-center shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren || isFolder) toggleExpand(node.id);
          }}
          data-testid={`toggle-node-${node.id}`}
        >
          {hasChildren || isFolder ? (
            isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )
          ) : (
            <span className="w-3" />
          )}
        </button>
        <Icon
          className={`h-3.5 w-3.5 shrink-0 ${isRootFolder ? "text-blue-600" : isFolder ? "text-amber-500" : "text-blue-500"}`}
        />
        {isFolder && editing ? (
          <Input
            className="h-5 text-xs flex-1 px-1 py-0"
            value={editName}
            autoFocus
            onChange={(e) => setEditName(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => {
              setEditing(false);
              if (editName.trim()) onRenameFolder(node.id, editName.trim());
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setEditing(false);
                if (editName.trim()) onRenameFolder(node.id, editName.trim());
              }
              if (e.key === "Escape") setEditing(false);
            }}
            data-testid={`input-rename-folder-${node.id}`}
          />
        ) : isFolder ? (
          <span
            className={`flex-1 truncate ${isRootFolder ? "text-xs font-bold text-blue-700 dark:text-blue-400" : "text-xs font-semibold"}`}
            onDoubleClick={() => !isRootFolder && setEditing(true)}
            data-testid={`text-folder-name-${node.id}`}
          >
            {node.folder_name || "Ordner"}{" "}
            {hasChildren && (
              <span className="text-muted-foreground font-normal">
                ({childNodes.length})
              </span>
            )}
          </span>
        ) : (
          <Link
            href={`/dokumente/${node.document_id}/bearbeiten`}
            className="flex items-center gap-1.5 flex-1 min-w-0 group/link"
          >
            <span
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${docTypeColors[node.doc_type || ""] || "bg-gray-100 text-gray-600"}`}
              data-testid={`badge-doctype-${node.id}`}
            >
              {docTypeShort[node.doc_type || ""] ||
                node.doc_type?.toUpperCase()?.slice(0, 3) ||
                "?"}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground shrink-0">
              {fmtDocNumber(node.document_number || "")}
            </span>
            <span className="truncate flex-1 text-xs group-hover/link:text-blue-600 transition-colors">
              {node.custom_type_label
                ? `${node.custom_type_label.replace(/\s+\d{2}-\d{5}$/, "")}${node.subject ? `, ${node.subject}` : ""}`
                : (node.subject || "-")}
            </span>
            {hasChildren && (
              <span className="text-[8px] text-muted-foreground shrink-0 bg-muted px-1 rounded">
                +{childNodes.length}
              </span>
            )}
            {node.net_total && parseFloat(node.net_total) > 0 && (() => {
              const grossTotal = parseFloat(node.gross_total || node.net_total);
              const prevInv = parseFloat(node.previously_invoiced || "0");
              const taxRate = parseFloat(node.tax_rate || "19");
              const isAbschlag = prevInv > 0 || (node.doc_type === "abschlagsrechnung");
              const fibuBrutto = node.fibu_brutto ? parseFloat(node.fibu_brutto) : null;
              const zahlbetrag = fibuBrutto !== null
                ? fibuBrutto
                : isAbschlag
                  ? (parseFloat(node.net_total!) - prevInv) * (1 + taxRate / 100)
                  : grossTotal;
              const verrechnungenSum = node.verrechnungen_sum ? parseFloat(node.verrechnungen_sum) : 0;
              const displayAmount = verrechnungenSum > 0 ? grossTotal - verrechnungenSum : zahlbetrag;
              const tooltip = isAbschlag
                ? `Rechnungssumme: ${fmtCurrency(grossTotal)}, FIBU-Brutto: ${fibuBrutto !== null ? fmtCurrency(fibuBrutto) : "n/a"}, Zahlbetrag: ${fmtCurrency(zahlbetrag)}`
                : undefined;
              return (
                <span className="text-[10px] font-mono font-semibold text-right shrink-0" title={tooltip}>
                  {fmtCurrency(displayAmount)}
                </span>
              );
            })()}
            <span className="text-[9px] text-muted-foreground shrink-0">
              {fmtDate(node.doc_date)}
            </span>
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded-full border shrink-0 ${docStatusColors[node.doc_status || ""] || ""}`}
              data-testid={`badge-status-${node.id}`}
            >
              {documentStatusLabels[node.doc_status || ""] || node.doc_status}
            </span>
          </Link>
        )}
        {!isRootFolder && (
          <button
            className="h-4 w-4 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(node.id);
            }}
            data-testid={`button-remove-node-${node.id}`}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
  );

  const availDocs = unlinkedDocs || [];

  return (
    <div data-testid={`tree-node-${node.id}`}>
      {showTopLine && (
        <div className="h-0.5 bg-blue-500 rounded mx-1" style={{ marginLeft: `${depth * 16 + 4}px` }} />
      )}
      {isFolder && onAddDocToFolder && availDocs.length > 0 ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            {rowContent}
          </ContextMenuTrigger>
          <ContextMenuContent className="w-72">
            <ContextMenuSub>
              <ContextMenuSubTrigger data-testid="ctx-add-doc">
                <Plus className="h-3.5 w-3.5 mr-2" />
                Dokument hinzufügen
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="max-h-[300px] overflow-y-auto w-80">
                {availDocs.map((doc) => (
                  <ContextMenuItem
                    key={doc.id}
                    onClick={() => onAddDocToFolder(doc.id, node.id)}
                    data-testid={`ctx-add-doc-${doc.id}`}
                  >
                    <span className={`text-[8px] font-bold px-1 py-0.5 rounded mr-1 shrink-0 ${docTypeColors[doc.type] || "bg-gray-100 text-gray-600"}`}>
                      {docTypeShort[doc.type] || "?"}
                    </span>
                    <span className="font-mono text-[10px] mr-1 shrink-0">{fmtDocNumber(doc.documentNumber)}</span>
                    <span className="truncate text-xs">{doc.subject || "-"}</span>
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
            {!isRootFolder && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => setEditing(true)} data-testid="ctx-rename">
                  <Pencil className="h-3.5 w-3.5 mr-2" />
                  Umbenennen
                </ContextMenuItem>
                <ContextMenuItem
                  className="text-destructive"
                  onClick={() => onRemove(node.id)}
                  data-testid="ctx-delete"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Löschen
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        rowContent
      )}
      {showBottomLine && !isExpanded && (
        <div className="h-0.5 bg-blue-500 rounded mx-1" style={{ marginLeft: `${depth * 16 + 4}px` }} />
      )}
      {isExpanded &&
        childNodes
          .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
          .map((child) => {
            const grandChildren = allNodes.filter(
              (n) => n.parent_id === child.id,
            );
            return (
              <TreeNodeRow
                key={child.id}
                node={child}
                children={grandChildren}
                allNodes={allNodes}
                depth={depth + 1}
                expanded={expanded}
                toggleExpand={toggleExpand}
                onDragStart={onDragStart}
                onDragOverNode={onDragOverNode}
                onDropOnNode={onDropOnNode}
                onRemove={onRemove}
                onRenameFolder={onRenameFolder}
                onAddDocToFolder={onAddDocToFolder}
                unlinkedDocs={unlinkedDocs}
                dragOverId={dragOverId}
                dropZone={dropZone}
              />
            );
          })}
    </div>
  );
}

function DocumentTree({
  documents,
  projectName,
  projectId,
}: {
  documents: Document[];
  projectName: string;
  projectId: number;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [currentDropZone, setCurrentDropZone] = useState<DropZone | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [showAddDocs, setShowAddDocs] = useState(false);

  const { data: treeNodes = [], isLoading: treeLoading } = useQuery<TreeNode[]>(
    {
      queryKey: ["/api/projects", projectId, "document-tree"],
      queryFn: async () => {
        const res = await fetch(`/api/projects/${projectId}/document-tree`, {
          credentials: "include",
        });
        if (!res.ok) return [];
        return res.json();
      },
      enabled: !!projectId,
      staleTime: 2000,
      refetchOnWindowFocus: true,
      refetchOnMount: "always",
    },
  );

  useEffect(() => {
    if (treeNodes.length > 0) {
      setExpanded(prev => {
        const next = new Set(prev);
        const parentIds = new Set(treeNodes.map(n => n.parent_id).filter(Boolean));
        for (const n of treeNodes) {
          if (parentIds.has(n.id) || (n.node_type === "folder" && n.parent_id === null)) {
            next.add(n.id);
          }
        }
        return next.size !== prev.size ? next : prev;
      });
    }
  }, [treeNodes]);

  const hapakFileRef = useRef<HTMLInputElement>(null);
  const hapakImportMut = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/projects/${projectId}/document-tree/import-hapak`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error((await res.json()).message || "Import fehlgeschlagen");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "document-tree"] });
      toast({ title: `HAPAK-Import: ${data.created} Einträge`, description: data.warnings?.length ? data.warnings.join(", ") : undefined });
    },
    onError: (err: any) => toast({ title: "Import-Fehler", description: err.message, variant: "destructive" }),
  });

  const autoBuildMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/projects/${projectId}/document-tree/auto-build`,
      );
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, "document-tree"],
      });
      toast({ title: `Baum erstellt: ${data.created} Einträge` });
    },
  });

  const addNodeMut = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest(
        "POST",
        `/api/projects/${projectId}/document-tree`,
        body,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, "document-tree"],
      });
    },
  });

  const updateNodeMut = useMutation({
    mutationFn: async ({ nodeId, body }: { nodeId: number; body: any }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/projects/${projectId}/document-tree/${nodeId}`,
        body,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, "document-tree"],
      });
    },
  });

  const removeNodeMut = useMutation({
    mutationFn: async (nodeId: number) => {
      const res = await apiRequest(
        "DELETE",
        `/api/projects/${projectId}/document-tree/${nodeId}`,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, "document-tree"],
      });
    },
  });

  const reorderMut = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest(
        "POST",
        `/api/projects/${projectId}/document-tree/reorder`,
        body,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, "document-tree"],
      });
    },
  });

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getDescendantIds = useCallback(
    (nodeId: number): Set<number> => {
      const ids = new Set<number>();
      const stack = [nodeId];
      while (stack.length) {
        const current = stack.pop()!;
        ids.add(current);
        treeNodes
          .filter((n) => n.parent_id === current)
          .forEach((c) => stack.push(c.id));
      }
      return ids;
    },
    [treeNodes],
  );

  const sortedChildren = useCallback(
    (parentId: number | null) => {
      return treeNodes
        .filter((n) =>
          parentId === null ? !n.parent_id : n.parent_id === parentId,
        )
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    },
    [treeNodes],
  );

  const handleDropOnNode = (e: React.DragEvent, targetId: number, zone: DropZone) => {
    const sourceId = parseInt(e.dataTransfer.getData("text/plain"));
    if (!sourceId || sourceId === targetId) {
      setDragOverId(null);
      setCurrentDropZone(null);
      setDraggingId(null);
      return;
    }
    const descendants = getDescendantIds(sourceId);
    if (descendants.has(targetId)) {
      setDragOverId(null);
      setCurrentDropZone(null);
      setDraggingId(null);
      return;
    }
    const targetNode = treeNodes.find((n) => n.id === targetId);
    if (!targetNode) return;

    let targetParentId: number | null;
    let targetIdx: number;

    if (zone === "inside") {
      targetParentId = targetId;
      const siblings = sortedChildren(targetId).filter((n) => n.id !== sourceId);
      targetIdx = siblings.length;
      setExpanded((prev) => new Set(prev).add(targetId));
    } else {
      targetParentId = targetNode.parent_id ?? null;
      const siblings = sortedChildren(targetParentId).filter((n) => n.id !== sourceId);
      const refIdx = siblings.findIndex((s) => s.id === targetId);
      targetIdx = zone === "before" ? Math.max(0, refIdx) : refIdx + 1;
    }

    reorderMut.mutate({
      nodeId: sourceId,
      targetParentId,
      targetIndex: Math.max(0, targetIdx),
    });
    setDragOverId(null);
    setCurrentDropZone(null);
    setDraggingId(null);
  };

  const handleDropRoot = (e: React.DragEvent) => {
    const sourceId = parseInt(e.dataTransfer.getData("text/plain"));
    if (!sourceId) return;
    reorderMut.mutate({
      nodeId: sourceId,
      targetParentId: null,
      targetIndex: 0,
    });
    setDragOverId(null);
    setCurrentDropZone(null);
    setDraggingId(null);
  };

  const docIdsInTree = new Set(
    treeNodes.filter((n) => n.document_id).map((n) => n.document_id),
  );
  const unlinkedDocs = documents.filter((d) => !docIdsInTree.has(d.id));
  const rootNodes = sortedChildren(null);

  if (treeLoading) {
    return (
      <div className="p-2 space-y-1">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 px-2 py-1.5 font-medium text-sm">
        <span data-testid="text-project-tree-name" className="flex-1 text-xs text-muted-foreground">
          Dokumentenbaum
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px]"
            onClick={() => {
              const root = treeNodes.find(n => n.node_type === "folder" && n.parent_id === null);
              addNodeMut.mutate({
                nodeType: "folder",
                folderName: "Neuer Ordner",
                parentId: root?.id || null,
              });
            }}
            data-testid="button-add-folder"
          >
            <FolderPlus className="h-3 w-3 mr-0.5" />
            Ordner
          </Button>
          {treeNodes.filter(n => n.node_type === "document").length === 0 && documents.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[10px]"
              onClick={() => autoBuildMut.mutate()}
              disabled={autoBuildMut.isPending}
              data-testid="button-auto-build-tree"
            >
              {autoBuildMut.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin mr-0.5" />
              ) : (
                <ArrowUpDown className="h-3 w-3 mr-0.5" />
              )}
              Auto-Baum
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px]"
            onClick={() => hapakFileRef.current?.click()}
            disabled={hapakImportMut.isPending}
            data-testid="button-hapak-import"
          >
            {hapakImportMut.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin mr-0.5" />
            ) : (
              <Upload className="h-3 w-3 mr-0.5" />
            )}
            HAPAK
          </Button>
          <input
            ref={hapakFileRef}
            type="file"
            accept=".zip,.ZIP"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) hapakImportMut.mutate(file);
              e.target.value = "";
            }}
          />
          {unlinkedDocs.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[10px]"
              onClick={() => setShowAddDocs(!showAddDocs)}
              data-testid="button-toggle-unlinked"
            >
              <Link2 className="h-3 w-3 mr-0.5" />
              {unlinkedDocs.length} frei
            </Button>
          )}
        </div>
      </div>

      {documents.length > 0 &&
        (() => {
          const rechnungen = documents.filter((d) =>
            [
              "rechnung",
              "abschlagsrechnung",
              "teilrechnung",
            ].includes(d.type),
          );
          const angebote = documents.filter((d) => d.type === "angebot");
          const sumRech = rechnungen.reduce((s, d) => {
            if (d.status === "storniert") return s;
            const fibuBrutto = (d as any).fibuBrutto ? parseFloat((d as any).fibuBrutto) : null;
            if (fibuBrutto !== null) return s + fibuBrutto;
            const net = parseFloat(d.netTotal || "0");
            const prevInv = parseFloat(d.previouslyInvoiced || "0");
            const taxRate = parseFloat(d.taxRate || "19");
            const zahlbetrag = (net - prevInv) * (1 + taxRate / 100);
            return s + zahlbetrag;
          }, 0);
          const sumAng = angebote.reduce(
            (s, d) => s + parseFloat(d.netTotal || "0"),
            0,
          );
          const bezahlt = rechnungen.reduce((s, d) => {
            const fibuZahlung = (d as any).fibuZahlung ? parseFloat((d as any).fibuZahlung) : null;
            return s + (fibuZahlung !== null ? fibuZahlung : parseFloat(d.paidAmount || "0"));
          }, 0);
          return (
            <div className="grid grid-cols-3 gap-2 px-2 pb-2 border-b">
              <div className="text-center">
                <div className="text-[9px] text-muted-foreground uppercase tracking-wider">
                  Angebote
                </div>
                <div className="text-xs font-bold text-blue-600">
                  {fmtCurrency(sumAng)}
                </div>
                <div className="text-[9px] text-muted-foreground">
                  {angebote.length} Dok.
                </div>
              </div>
              <div className="text-center">
                <div className="text-[9px] text-muted-foreground uppercase tracking-wider">
                  Rechnungen
                </div>
                <div className="text-xs font-bold text-orange-600">
                  {fmtCurrency(sumRech)}
                </div>
                <div className="text-[9px] text-muted-foreground">
                  {rechnungen.length} Dok.
                </div>
              </div>
              <div className="text-center">
                <div className="text-[9px] text-muted-foreground uppercase tracking-wider">
                  Bezahlt
                </div>
                <div className="text-xs font-bold text-green-600">
                  {fmtCurrency(bezahlt)}
                </div>
                <div className="text-[9px] text-muted-foreground">erhalten</div>
              </div>
            </div>
          );
        })()}
      <div
        className="min-h-[40px]"
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDragLeave={() => {
          setDragOverId(null);
          setCurrentDropZone(null);
        }}
      >
        {rootNodes.length > 0 && (
          <div
            className={`h-2 rounded mx-1 transition-colors ${dragOverId === -1 ? "bg-blue-200 dark:bg-blue-800" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOverId(-1);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleDropRoot(e);
            }}
          />
        )}
        {rootNodes.map((node) => {
          const children = treeNodes.filter((n) => n.parent_id === node.id);
          return (
            <TreeNodeRow
              key={node.id}
              node={node}
              children={children}
              allNodes={treeNodes}
              depth={0}
              expanded={expanded}
              toggleExpand={toggleExpand}
              onDragStart={setDraggingId}
              onDragOverNode={(e, id, zone) => {
                e.preventDefault();
                setDragOverId(id);
                setCurrentDropZone(zone);
              }}
              onDropOnNode={handleDropOnNode}
              onRemove={(id) => removeNodeMut.mutate(id)}
              onRenameFolder={(id, name) =>
                updateNodeMut.mutate({ nodeId: id, body: { folderName: name } })
              }
              onAddDocToFolder={(docId, parentId) =>
                addNodeMut.mutate({ documentId: docId, nodeType: "document", parentId })
              }
              unlinkedDocs={unlinkedDocs}
              dragOverId={dragOverId}
              dropZone={currentDropZone}
            />
          );
        })}
        <div
          className={`h-4 rounded mx-1 transition-colors ${dragOverId === -2 ? "bg-blue-200 dark:bg-blue-800" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragOverId(-2);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const sourceId = parseInt(e.dataTransfer.getData("text/plain"));
            if (!sourceId) return;
            const rootCount = sortedChildren(null).filter((n) => n.id !== sourceId).length;
            reorderMut.mutate({ nodeId: sourceId, targetParentId: null, targetIndex: rootCount });
            setDragOverId(null);
            setCurrentDropZone(null);
            setDraggingId(null);
          }}
        />
      </div>

      {treeNodes.length === 0 && documents.length === 0 && (
        <div className="ml-6 py-2 text-sm text-muted-foreground">
          Keine Dokumente vorhanden
        </div>
      )}

      {(showAddDocs || treeNodes.length === 0) && unlinkedDocs.length > 0 && (
        <div className="border-t pt-2 mt-2">
          <div className="px-2 text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
            <Unlink className="h-3 w-3" />
            Nicht zugeordnete Dokumente ({unlinkedDocs.length})
          </div>
          <div className="max-h-[300px] overflow-auto">
            {unlinkedDocs.map((doc) => {
              const Icon = docTypeIcons[doc.type] || FileText;
              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-1 px-2 py-0.5 text-xs hover:bg-accent rounded group"
                >
                  <Badge
                    className={`text-[7px] h-3 px-0.5 rounded font-bold shrink-0 border-0 ${docTypeColors[doc.type] || "bg-gray-100 text-gray-600"}`}
                  >
                    {docTypeShort[doc.type] || "?"}
                  </Badge>
                  <span className="font-mono text-[10px] shrink-0">
                    {fmtDocNumber(doc.documentNumber)}
                  </span>
                  <span className="truncate flex-1">{doc.subject || "-"}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1 text-[10px] opacity-0 group-hover:opacity-100"
                    onClick={() =>
                      addNodeMut.mutate({
                        documentId: doc.id,
                        nodeType: "document",
                      })
                    }
                    data-testid={`button-link-doc-${doc.id}`}
                  >
                    <Plus className="h-2.5 w-2.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectDetailHeader({
  project,
  customerName,
  onUpdate,
  onDelete,
}: {
  project: Project;
  customerName: string;
  onUpdate: (data: Partial<Project>) => void;
  onDelete: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(project.name);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descVal, setDescVal] = useState(project.description || "");

  useEffect(() => {
    setNameVal(project.name);
    setDescVal(project.description || "");
  }, [project.id, project.name, project.description]);

  const saveName = () => {
    setEditingName(false);
    if (nameVal.trim() && nameVal.trim() !== project.name)
      onUpdate({ name: nameVal.trim() });
  };
  const saveDesc = () => {
    setEditingDesc(false);
    if (descVal.trim() !== (project.description || ""))
      onUpdate({ description: descVal.trim() });
  };

  return (
    <div className="px-5 py-3 border-b bg-gradient-to-r from-slate-50 to-white dark:from-slate-900/50 dark:to-transparent">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
              {fmtDocNumber(project.projectNumber)}
            </span>
            {editingName ? (
              <Input
                className="h-6 text-sm font-bold flex-1 px-1"
                value={nameVal}
                autoFocus
                onChange={(e) => setNameVal(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") {
                    setEditingName(false);
                    setNameVal(project.name);
                  }
                }}
                data-testid="input-edit-project-name"
              />
            ) : (
              <h2
                className="font-bold text-sm cursor-pointer hover:text-blue-600 flex-1 group truncate"
                onClick={() => setEditingName(true)}
                data-testid="text-selected-project"
              >
                {project.name}
                <Pencil className="h-2.5 w-2.5 ml-1 inline opacity-0 group-hover:opacity-40" />
              </h2>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <button
              className="text-[11px] text-muted-foreground hover:text-primary hover:underline transition-colors"
              onClick={() => { if (project.customerId) window.location.href = `/adressen?selected=${project.customerId}`; }}
              data-testid="link-project-customer"
            >
              {customerName}
            </button>
            {editingDesc ? (
              <Input
                className="h-5 text-[10px] flex-1 px-1"
                value={descVal}
                autoFocus
                placeholder="Beschreibung..."
                onChange={(e) => setDescVal(e.target.value)}
                onBlur={saveDesc}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveDesc();
                  if (e.key === "Escape") {
                    setEditingDesc(false);
                    setDescVal(project.description || "");
                  }
                }}
                data-testid="input-edit-project-desc"
              />
            ) : (
              <span
                className="text-[10px] text-muted-foreground cursor-pointer hover:text-blue-600 truncate italic"
                onClick={() => setEditingDesc(true)}
                data-testid="text-project-desc"
              >
                {project.description || "+ Beschreibung"}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          {project.startDate && (
            <span className="text-[9px] text-muted-foreground">
              {fmtDate(project.startDate)}{" "}
              {project.endDate ? `→ ${fmtDate(project.endDate)}` : ""}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600"
            onClick={onDelete}
            data-testid="button-delete-project"
            title="Projekt löschen"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const [search, setSearch] = useState("");
  const [editProject, setEditProject] = useState<Project | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteWithDocs, setDeleteWithDocs] = useState(false);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [splitPercent, setSplitPercent] = useState(55);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.min(80, Math.max(25, pct)));
    };
    const onUp = () => {
      dragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });
  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  useEffect(() => {
    if (!projects) return;
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get("id");
    const searchParam = params.get("search");
    if (idParam) {
      const found = projects.find((p) => p.id === Number(idParam));
      if (found) { setSelectedProject(found); setMobileDetailOpen(true); }
      window.history.replaceState({}, "", window.location.pathname);
    } else if (searchParam) {
      setSearch(searchParam);
      const lower = searchParam.toLowerCase();
      const found = projects.find((p) =>
        p.projectNumber?.toLowerCase() === lower ||
        p.name?.toLowerCase().includes(lower)
      );
      if (found) { setSelectedProject(found); setMobileDetailOpen(true); }
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [projects]);

  useEffect(() => {
    if (selectedProject && projects) {
      const updated = projects.find((p) => p.id === selectedProject.id);
      if (
        updated &&
        (updated.name !== selectedProject.name ||
          updated.description !== selectedProject.description ||
          updated.status !== selectedProject.status)
      ) {
        setSelectedProject(updated);
      }
    }
  }, [projects]);
  const { data: projectDocuments } = useQuery<Document[]>({
    queryKey: ["/api/documents", selectedProject?.id],
    queryFn: async () => {
      if (!selectedProject) return [];
      const res = await fetch(
        `/api/documents?projectId=${selectedProject.id}`,
        { credentials: "include" },
      );
      if (!res.ok) return [];
      const payload = await res.json();
      if (Array.isArray(payload)) return payload;
      return Array.isArray(payload?.data) ? payload.data : [];
    },
    enabled: !!selectedProject,
    staleTime: 2000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });

  const { data: incomingInvoicesResponse } = useQuery<any>({
    queryKey: ["/api/incoming-invoices-fibu", selectedProject?.projectNumber],
    queryFn: async () => {
      if (!selectedProject?.projectNumber) return { data: [], total: 0 };
      const res = await fetch(
        `/api/incoming-invoices-fibu?projectNumber=${encodeURIComponent(selectedProject.projectNumber)}&limit=500`,
        { credentials: "include" },
      );
      if (!res.ok) return { data: [], total: 0 };
      return res.json();
    },
    enabled: !!selectedProject?.projectNumber,
  });
  const projectDocumentList: Document[] = Array.isArray(projectDocuments)
    ? projectDocuments
    : Array.isArray((projectDocuments as any)?.data)
      ? (projectDocuments as any).data
      : [];
  const incomingInvoices = incomingInvoicesResponse?.data || [];

  const outgoingTypes = ["rechnung", "abschlagsrechnung"];
  const outgoingInvoices =
    projectDocumentList.filter((d) => outgoingTypes.includes(d.type));
  const outgoingSumNetto = outgoingInvoices.reduce((s, d) => {
    const net = parseFloat(d.netTotal || "0");
    if (d.type === "abschlagsrechnung" && d.parentDocumentId) {
      const parent = projectDocumentList.find((p) => p.id === d.parentDocumentId);
      if (parent) {
        const delta = net - parseFloat(parent.netTotal || "0");
        return s + (delta >= 0 ? delta : net);
      }
    }
    return s + net;
  }, 0);
  const outgoingSumBrutto = outgoingInvoices.reduce((s, d) => {
    const gross = parseFloat(d.grossTotal || "0");
    if (d.type === "abschlagsrechnung" && d.parentDocumentId) {
      const parent = projectDocumentList.find((p) => p.id === d.parentDocumentId);
      if (parent) {
        const delta = gross - parseFloat(parent.grossTotal || "0");
        return s + (delta >= 0 ? delta : gross);
      }
    }
    return s + gross;
  }, 0);
  const incomingSumNetto = (incomingInvoices || []).reduce(
    (s: number, d: any) => s + parseFloat(d.netTotal || "0"),
    0,
  );
  const incomingSumBrutto = (incomingInvoices || []).reduce(
    (s: number, d: any) => s + parseFloat(d.grossTotal || "0"),
    0,
  );

  const { data: ertragEmployees } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });
  const projNrForTimeTracking = selectedProject?.projectNumber || "";
  const pzzMatchErtrag = projNrForTimeTracking.match(/^PZZ(\d{2})0?(\d{5})$/);
  const hapakProjNrErtrag = pzzMatchErtrag
    ? `${pzzMatchErtrag[1]}-${pzzMatchErtrag[2]}`
    : projNrForTimeTracking;

  const { data: ertragTimeData } = useQuery<TimeTrackingSummary>({
    queryKey: ["/api/time-tracking/summary", projNrForTimeTracking, "ertrag"],
    queryFn: async () => {
      const res = await fetch(
        `/api/time-tracking/summary/${encodeURIComponent(hapakProjNrErtrag)}`,
        { credentials: "include" },
      );
      if (!res.ok)
        return {
          projectNumber: "",
          totalHours: 0,
          totalExtraHours: 0,
          totalEntries: 0,
          byEmployee: [],
          byTrade: [],
          entries: [],
        };
      return res.json();
    },
    enabled: !!selectedProject?.projectNumber,
    retry: false,
  });

  const ertragLohnkosten = (() => {
    if (!ertragTimeData?.byEmployee || !ertragEmployees) return 0;
    const empCosts = new Map<string, number>();
    for (const emp of ertragEmployees) {
      const cost = calcAgCostPerHour(emp);
      empCosts.set(`${emp.firstName} ${emp.lastName}`, cost);
      if (emp.employeeNumber) empCosts.set(emp.employeeNumber, cost);
    }
    return ertragTimeData.byEmployee.reduce((sum, be) => {
      const costH =
        empCosts.get(be.name) || empCosts.get(be.employeeNumber) || 0;
      return sum + be.hours * costH;
    }, 0);
  })();

  const totalAusgaben = incomingSumNetto + ertragLohnkosten;

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/projects", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setDialogOpen(false);
      toast({ title: "Projekt erstellt" });
    },
    onError: (err: any) =>
      toast({
        title: "Fehler",
        description: err.message,
        variant: "destructive",
      }),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest(
        "PATCH",
        `/api/projects/${editProject!.id}`,
        data,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setDialogOpen(false);
      setEditProject(undefined);
      toast({ title: "Projekt aktualisiert" });
    },
    onError: (err: any) =>
      toast({
        title: "Fehler",
        description: err.message,
        variant: "destructive",
      }),
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "DELETE",
        `/api/projects/${selectedProject!.id}?deleteDocuments=${deleteWithDocs}`,
      );
      return res.json();
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setDeleteDialogOpen(false);
      setDeleteWithDocs(false);
      setSelectedProject(null);
      setMobileDetailOpen(false);
      const msg = result.deletedDocuments > 0
        ? `Projekt gelöscht inkl. ${result.deletedDocuments} Dokument${result.deletedDocuments === 1 ? "" : "e"}`
        : "Projekt gelöscht";
      toast({ title: msg });
    },
    onError: (err: any) =>
      toast({
        title: "Fehler beim Löschen",
        description: err.message,
        variant: "destructive",
      }),
  });

  const customerMap = new Map(customers?.map((c) => [c.id, c]) || []);
  const filtered = projects?.filter(
    (p) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return p.name.toLowerCase().includes(s) ||
        p.projectNumber.toLowerCase().includes(s) ||
        fmtDocNumber(p.projectNumber).toLowerCase().includes(s) ||
        (customerMap.get(p.customerId)?.name || "").toLowerCase().includes(s);
    },
  );

  const selectedCustomer = selectedProject
    ? customerMap.get(selectedProject.customerId)
    : null;

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <div
      className="flex p-2 md:p-6 gap-0 md:gap-4 h-screen max-h-screen overflow-hidden"
      ref={containerRef}
    >
      <div
        className={`flex flex-col min-w-0 border rounded-lg overflow-hidden ${mobileDetailOpen ? "hidden md:flex" : "flex"}`}
        style={isMobile ? undefined : { width: `${splitPercent}%` }}
      >
        <div className="p-4 border-b space-y-2 bg-gradient-to-b from-slate-50 to-white dark:from-slate-900/30 dark:to-transparent">
          <div className="flex items-center justify-between">
            <div>
              <h1
                className="text-base font-bold tracking-tight"
                data-testid="text-projects-title"
              >
                Projektüberwachung
              </h1>
              <p className="text-[10px] text-muted-foreground">
                {filtered?.length ?? 0} von {projects?.length ?? 0} Projekten
              </p>
            </div>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setEditProject(undefined);
                setDialogOpen(true);
              }}
              data-testid="button-new-project"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Neu
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              className="pl-7 h-7 text-xs rounded-md"
              placeholder="Projekt, Kunde, Nummer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-projects"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="text-[10px] text-muted-foreground border-b-2">
                  <TableHead className="py-1.5 font-semibold uppercase tracking-wider w-24">
                    Nr.
                  </TableHead>
                  <TableHead className="py-1.5 font-semibold uppercase tracking-wider">
                    Projekt / Kunde
                  </TableHead>
                  <TableHead className="py-1.5 font-semibold uppercase tracking-wider">
                    Status
                  </TableHead>
                  <TableHead className="py-1.5 w-6"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered?.map((p) => (
                  <TableRow
                    key={p.id}
                    className={`cursor-pointer group transition-colors ${selectedProject?.id === p.id ? "bg-blue-50 dark:bg-blue-950/30 border-l-2 border-l-blue-500" : "hover:bg-muted/40"}`}
                    onClick={() => { setSelectedProject(p); setMobileDetailOpen(true); }}
                    data-testid={`row-project-${p.id}`}
                  >
                    <TableCell className="py-2 pr-0">
                      <div className="font-mono text-[10px] text-muted-foreground leading-none">
                        {fmtDocNumber(p.projectNumber)}
                      </div>
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="font-medium text-xs leading-tight">
                        {p.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {p.customerId ? (
                          <CustomerHoverCard customerId={p.customerId}>
                            <a
                              href={`/adressen?selected=${p.customerId}`}
                              className="hover:text-primary hover:underline transition-colors"
                              onClick={(ev) => ev.stopPropagation()}
                              data-testid={`link-project-list-customer-${p.id}`}
                            >{customerMap.get(p.customerId)?.name || "—"}</a>
                          </CustomerHoverCard>
                        ) : "—"}
                      </div>
                      {(p.startDate || p.endDate) && (
                        <div className="text-[9px] text-muted-foreground/70 mt-0.5">
                          {p.startDate ? fmtDate(p.startDate) : "?"}{" "}
                          {p.endDate ? `→ ${fmtDate(p.endDate)}` : ""}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge
                        variant="secondary"
                        className={`text-[9px] px-1.5 ${statusColors[p.status] || ""}`}
                      >
                        {projectStatusLabels[p.status] || p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 w-6">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditProject(p);
                          setDialogOpen(true);
                        }}
                        data-testid={`button-edit-project-${p.id}`}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered?.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground py-8 text-sm"
                    >
                      Keine Projekte gefunden
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <div
        className="w-1.5 bg-border/50 hover:bg-primary/30 cursor-col-resize hidden md:flex items-center justify-center transition-colors shrink-0 rounded"
        onMouseDown={handleMouseDown}
        data-testid="split-handle"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className={`flex-1 flex flex-col min-w-0 border rounded-lg overflow-hidden ${mobileDetailOpen ? "flex" : "hidden md:flex"}`}>
        {selectedProject ? (
          <>
            <div className="flex items-center gap-2 p-2 border-b md:hidden bg-muted/30">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={() => setMobileDetailOpen(false)}
                data-testid="button-mobile-back"
              >
                <ArrowLeft className="h-4 w-4" />
                Projekte
              </Button>
              <span className="text-xs text-muted-foreground truncate flex-1">
                {selectedProject.name}
              </span>
            </div>
            <ProjectDetailHeader
              project={selectedProject}
              customerName={selectedCustomer?.name || ""}
              onUpdate={(data) => {
                apiRequest("PATCH", `/api/projects/${selectedProject.id}`, data)
                  .then(() => {
                    queryClient.invalidateQueries({
                      queryKey: ["/api/projects"],
                    });
                    toast({ title: "Projekt aktualisiert" });
                  })
                  .catch((err: any) =>
                    toast({
                      title: "Fehler",
                      description: err.message,
                      variant: "destructive",
                    }),
                  );
              }}
              onDelete={() => {
                setDeleteWithDocs(false);
                setDeleteDialogOpen(true);
              }}
            />
            <Tabs defaultValue="dokumente" className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-auto flex-wrap px-2 py-1 gap-1">
                {[
                  ["dokumente", "Dokumente", "📄"],
                  ["allgemein", "Allgemein", "ℹ️"],
                  ["budget", "Budget", "💰"],
                  ["rech-ausgang", "Rech-Ausgang", "📤"],
                  ["rech-eingang", "Rech-Eingang", "📥"],
                  ["ertrag", "Ertragsübersicht", "📊"],
                  ["zeiterfassung", "Zeiterfassung", "⏱"],
                ].map(([val, label, icon]) => (
                  <TabsTrigger
                    key={val}
                    value={val}
                    data-testid={`tab-${val}`}
                    className="text-[11px] h-7 px-2.5 rounded-md border border-transparent data-[state=active]:border-blue-200 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:shadow-none gap-1"
                  >
                    <span className="text-xs">{icon}</span>
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent
                value="dokumente"
                className="flex-1 overflow-auto px-4 pb-4"
              >
                <div className="mb-2 flex justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        data-testid="button-new-doc"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Neues Dokument
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">
                        Dokumenttyp wählen
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {(["angebot", "auftragsbestaetigung", "rechnung", "abschlagsrechnung", "teilrechnung", "gutschrift", "lieferschein", "freies_dokument", "mitschnitt"] as const).map((dtype) => (
                        <DropdownMenuItem
                          key={dtype}
                          className="text-xs cursor-pointer"
                          data-testid={`new-doc-type-${dtype}`}
                          onSelect={() => {
                            navigate(`/dokumente/neu?projectId=${selectedProject.id}&customerId=${selectedProject.customerId}&type=${dtype}`);
                          }}
                        >
                          {documentTypeLabels[dtype]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <Card>
                  <CardContent className="p-2">
                    <DocumentTree
                      documents={projectDocumentList}
                      projectName={selectedProject.name}
                      projectId={selectedProject.id}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent
                value="allgemein"
                className="flex-1 overflow-auto px-4 pb-4"
              >
                <Card>
                  <CardContent className="p-4 space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-muted-foreground text-xs">
                          Projektnummer
                        </span>
                        <p className="font-mono" data-testid="text-pnr">
                          {fmtDocNumber(selectedProject.projectNumber)}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">
                          Kürzel
                        </span>
                        <p className="font-mono" data-testid="text-short-name">
                          {selectedProject.shortName || "–"}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">
                          Status
                        </span>
                        <p>
                          <Badge
                            variant="secondary"
                            className={
                              statusColors[selectedProject.status] || ""
                            }
                          >
                            {projectStatusLabels[selectedProject.status]}
                          </Badge>
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">
                          Beginn
                        </span>
                        <p>{fmtDate(selectedProject.startDate)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">
                          Ende
                        </span>
                        <p>{fmtDate(selectedProject.endDate)}</p>
                      </div>
                    </div>
                    {selectedProject.description && (
                      <div>
                        <span className="text-muted-foreground text-xs">
                          Beschreibung
                        </span>
                        <p>{selectedProject.description}</p>
                      </div>
                    )}
                    {selectedCustomer && (
                      <div className="border rounded-lg p-3 bg-muted/50">
                        <span className="text-muted-foreground text-xs">
                          Kunde
                        </span>
                        <p className="font-medium">{selectedCustomer.name}</p>
                        {selectedCustomer.street && (
                          <p className="text-xs">{selectedCustomer.street}</p>
                        )}
                        {selectedCustomer.zip && (
                          <p className="text-xs">
                            {selectedCustomer.zip} {selectedCustomer.city}
                          </p>
                        )}
                      </div>
                    )}
                    {selectedProject.street && (
                      <div className="border rounded-lg p-3 bg-muted/50">
                        <span className="text-muted-foreground text-xs">
                          Baustelle
                        </span>
                        <p>{selectedProject.street}</p>
                        <p className="text-xs">
                          {selectedProject.zip} {selectedProject.city}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent
                value="budget"
                className="flex-1 overflow-auto px-4 pb-4"
              >
                <Card>
                  <CardContent className="p-4 space-y-3 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs">
                        Budget
                      </span>
                      <p
                        className="text-lg font-bold"
                        data-testid="text-budget"
                      >
                        {fmtCurrency(selectedProject.budget)}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">
                        Rechnungen (Ausgang netto)
                      </span>
                      <p className="font-medium">
                        {fmtCurrency(outgoingSumNetto)}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">
                        Dokumente gesamt
                      </span>
                      <p>{projectDocumentList.length}</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent
                value="rech-ausgang"
                className="flex-1 overflow-auto px-4 pb-4"
              >
                <Card>
                  <CardContent className="p-2">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-xs">
                          <TableHead className="py-2">Nr.</TableHead>
                          <TableHead className="py-2">Datum</TableHead>
                          <TableHead className="py-2">Betreff</TableHead>
                          <TableHead className="py-2 text-right">
                            Netto
                          </TableHead>
                          <TableHead className="py-2">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {outgoingInvoices.map((doc) => (
                          <TableRow
                            key={doc.id}
                            className="text-sm"
                            data-testid={`row-ausgang-${doc.id}`}
                          >
                            <TableCell className="font-mono text-xs py-2">
                              {fmtDocNumber(doc.documentNumber)}
                            </TableCell>
                            <TableCell className="text-xs py-2">
                              {fmtDate(doc.date)}
                            </TableCell>
                            <TableCell className="py-2 text-xs truncate max-w-[200px]">
                              {doc.subject || "-"}
                            </TableCell>
                            <TableCell className="text-right py-2 text-xs font-medium">
                              {fmtCurrency(doc.netTotal)}
                            </TableCell>
                            <TableCell className="py-2">
                              <Badge variant="outline" className="text-[10px]">
                                {documentStatusLabels[doc.status] || doc.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                        {outgoingInvoices.length === 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              className="text-center text-muted-foreground py-8 text-sm"
                            >
                              Keine ausgehenden Rechnungen
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                    {outgoingInvoices.length > 0 && (
                      <div
                        className="flex justify-end gap-6 px-4 py-2 border-t text-xs font-semibold"
                        data-testid="text-ausgang-summe"
                      >
                        <span>
                          Summe Netto: {fmtCurrency(outgoingSumNetto)}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent
                value="rech-eingang"
                className="flex-1 overflow-auto px-4 pb-4"
              >
                <Card>
                  <CardContent className="p-2">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-xs">
                          <TableHead className="py-2">Nr.</TableHead>
                          <TableHead className="py-2">Datum</TableHead>
                          <TableHead className="py-2">Lieferant</TableHead>
                          <TableHead className="py-2 text-right">
                            Netto
                          </TableHead>
                          <TableHead className="py-2">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(incomingInvoices || []).map((inv: any) => (
                          <TableRow
                            key={inv.id}
                            className="text-sm"
                            data-testid={`row-eingang-${inv.id}`}
                          >
                            <TableCell className="font-mono text-xs py-2">
                              {inv.invoiceNumber || "-"}
                            </TableCell>
                            <TableCell className="text-xs py-2">
                              {fmtDate(inv.date)}
                            </TableCell>
                            <TableCell className="py-2 text-xs truncate max-w-[200px]">
                              {inv.supplier}
                            </TableCell>
                            <TableCell className="text-right py-2 text-xs font-medium">
                              {fmtCurrency(inv.netTotal)}
                            </TableCell>
                            <TableCell className="py-2">
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${inv.status === "bezahlt" ? "bg-green-50 text-green-700" : inv.status === "offen" ? "bg-amber-50 text-amber-700" : ""}`}
                              >
                                {inv.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                        {(incomingInvoices || []).length === 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              className="text-center text-muted-foreground py-8 text-sm"
                            >
                              Keine Eingangsrechnungen
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                    {(incomingInvoices || []).length > 0 && (
                      <div
                        className="flex justify-end gap-6 px-4 py-2 border-t text-xs font-semibold"
                        data-testid="text-eingang-summe"
                      >
                        <span>
                          Summe Netto: {fmtCurrency(incomingSumNetto)}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent
                value="ertrag"
                className="flex-1 overflow-auto px-4 pb-4"
              >
                <Card>
                  <CardContent className="p-4 space-y-4 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="border rounded-md p-3">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                          <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                          Einnahmen (netto)
                        </div>
                        <p
                          className="text-lg font-bold text-green-600 dark:text-green-400"
                          data-testid="text-ertrag-einnahmen"
                        >
                          {fmtCurrency(outgoingSumNetto)}
                        </p>
                      </div>
                      <div className="border rounded-md p-3">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                          <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                          Ausgaben gesamt
                        </div>
                        <p
                          className="text-lg font-bold text-red-600 dark:text-red-400"
                          data-testid="text-ertrag-ausgaben"
                        >
                          {fmtCurrency(totalAusgaben)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="border rounded-md p-3">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                          <BarChart3 className="h-3.5 w-3.5" />
                          Budget
                        </div>
                        <p
                          className="text-lg font-bold"
                          data-testid="text-ertrag-budget"
                        >
                          {fmtCurrency(selectedProject.budget)}
                        </p>
                      </div>
                      <div className="border rounded-md p-3">
                        <span className="text-muted-foreground text-xs">
                          Rech.-Eingang (netto)
                        </span>
                        <p
                          className="text-base font-semibold text-red-500 dark:text-red-400 mt-0.5"
                          data-testid="text-ertrag-rechnungseingang"
                        >
                          {fmtCurrency(incomingSumNetto)}
                        </p>
                      </div>
                      <div className="border rounded-md p-3 border-primary/30">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-primary" />
                          <span className="text-muted-foreground text-xs">
                            Lohnkosten (AG)
                          </span>
                        </div>
                        <p
                          className="text-base font-semibold text-primary mt-0.5"
                          data-testid="text-ertrag-lohnkosten"
                        >
                          {ertragLohnkosten > 0
                            ? fmtCurrency(ertragLohnkosten)
                            : "0,00 €"}
                        </p>
                        {ertragTimeData && ertragTimeData.totalHours > 0 && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {ertragTimeData.totalHours.toLocaleString("de-DE", {
                              minimumFractionDigits: 1,
                            })}{" "}
                            h × Ø{" "}
                            {ertragLohnkosten > 0
                              ? fmtCurrency(
                                  ertragLohnkosten / ertragTimeData.totalHours,
                                )
                              : "—"}
                            /h
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="border rounded-md p-3">
                        <span className="text-muted-foreground text-xs">
                          Ertrag netto (Einnahmen − Ausgaben)
                        </span>
                        <p
                          className={`text-lg font-bold ${outgoingSumNetto - totalAusgaben >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                          data-testid="text-ertrag-ergebnis"
                        >
                          {fmtCurrency(outgoingSumNetto - totalAusgaben)}
                        </p>
                      </div>
                      <div className="border rounded-md p-3">
                        <span className="text-muted-foreground text-xs">
                          Deckungsgrad
                        </span>
                        <p
                          className="text-lg font-bold"
                          data-testid="text-ertrag-deckung"
                        >
                          {totalAusgaben > 0
                            ? (
                                (outgoingSumNetto / totalAusgaben) *
                                100
                              ).toLocaleString("de-DE", {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1,
                              }) + " %"
                            : outgoingSumNetto > 0
                              ? "∞ %"
                              : "0,0 %"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent
                value="zeiterfassung"
                className="flex-1 overflow-auto px-4 pb-4"
              >
                <TimeTrackingTab
                  projectNumber={selectedProject.projectNumber}
                />
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <div className="text-center">
              <FolderKanban className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>Projekt auswählen</p>
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) setEditProject(undefined);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editProject ? "Projekt bearbeiten" : "Neues Projekt"}
            </DialogTitle>
          </DialogHeader>
          <ProjectForm
            project={editProject}
            customers={customers || []}
            onSave={(data) =>
              editProject
                ? updateMutation.mutate(data)
                : createMutation.mutate(data)
            }
            onCancel={() => {
              setDialogOpen(false);
              setEditProject(undefined);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={(v) => { setDeleteDialogOpen(v); if (!v) setDeleteWithDocs(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Projekt löschen
            </DialogTitle>
          </DialogHeader>
          {selectedProject && (
            <div className="space-y-4">
              <p className="text-sm">
                Möchtest du das Projekt{" "}
                <strong>{fmtDocNumber(selectedProject.projectNumber)} – {selectedProject.name}</strong>{" "}
                wirklich löschen?
              </p>
              {projectDocumentList.length > 0 && (
                <div className="border rounded-md p-3 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Dieses Projekt hat <strong>{projectDocumentList.length}</strong> zugehörige{" "}
                    {projectDocumentList.length === 1 ? "Dokument" : "Dokumente"}.
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer select-none" data-testid="checkbox-delete-docs">
                    <input
                      type="checkbox"
                      checked={deleteWithDocs}
                      onChange={(e) => setDeleteWithDocs(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 accent-red-600"
                    />
                    <span className="text-sm">
                      Alle zugehörigen Dokumente ebenfalls löschen
                    </span>
                  </label>
                  {!deleteWithDocs && (
                    <p className="text-xs text-muted-foreground italic">
                      Die Dokumente bleiben erhalten, werden aber keinem Projekt mehr zugeordnet.
                    </p>
                  )}
                  {deleteWithDocs && (
                    <p className="text-xs text-red-600 font-medium">
                      ⚠ {projectDocumentList.length} Dokument{projectDocumentList.length === 1 ? "" : "e"} mit allen Positionen werden unwiderruflich gelöscht!
                    </p>
                  )}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(false)}
                  data-testid="button-cancel-delete"
                >
                  Abbrechen
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteProjectMutation.mutate()}
                  disabled={deleteProjectMutation.isPending}
                  data-testid="button-confirm-delete-project"
                >
                  {deleteProjectMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Trash2 className="h-3 w-3 mr-1" />
                  )}
                  {deleteWithDocs ? "Projekt + Dokumente löschen" : "Projekt löschen"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
