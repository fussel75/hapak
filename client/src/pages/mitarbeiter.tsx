import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Employee } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/format";
import {
  Users, Plus, Pencil, Trash2, Upload, Calculator, Euro,
  UserCheck, CheckCircle, FileText,
  Loader2
} from "lucide-react";

function n(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  return Number(v) || 0;
}

function dec(v: number): string {
  return v.toFixed(2).replace(".", ",");
}

function calcEmployerHourlyCost(emp: Employee): { aufschlagPercent: number; aufschlagPerHour: number; additionalPerHour: number; totalPerHour: number; totalMonthly: number } {
  const hourly = n(emp.hourlyRate);
  const monthlyH = n(emp.monthlyHours) || 173.33;
  const aufschlag = n(emp.agAufschlagPercent);
  const addMonthly = n(emp.additionalMonthly);

  const aufschlagPerHour = hourly * aufschlag / 100;
  const additionalPerHour = addMonthly / monthlyH;
  const totalPerHour = hourly + aufschlagPerHour + additionalPerHour;
  const totalMonthly = totalPerHour * monthlyH;

  return { aufschlagPercent: aufschlag, aufschlagPerHour, additionalPerHour, totalPerHour, totalMonthly };
}

const TRADES = ["Zimmerer", "Dachdecker", "Zimmerer/Dachdecker", "Klempner", "Maurer", "Büro", "Geschäftsführung", "Azubi", "Helfer", "Sonstiges"];
const EMPLOYEE_TYPES = ["Monteur", "Meister", "Azubi", "Büro", "Bauleiter", "Geschäftsführer", "Minijob"];

const DEFAULT_AG_AUFSCHLAG = "28.00";
const MINIJOB_AG_AUFSCHLAG = "30.00";

export default function MitarbeiterPage() {
  const { toast } = useToast();
  const [editId, setEditId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  const { data: employees, isLoading } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const activeEmployees = useMemo(() => {
    if (!employees) return [];
    return employees.filter(e => e.active).sort((a, b) => a.employeeNumber.localeCompare(b.employeeNumber));
  }, [employees]);

  const inactiveEmployees = useMemo(() => {
    if (!employees) return [];
    return employees.filter(e => !e.active);
  }, [employees]);

  const totals = useMemo(() => {
    let totalMonthly = 0;
    let totalHourly = 0;
    let count = 0;
    for (const e of activeEmployees) {
      const c = calcEmployerHourlyCost(e);
      totalMonthly += c.totalMonthly;
      totalHourly += c.totalPerHour;
      count++;
    }
    return { totalMonthly, avgHourly: count > 0 ? totalHourly / count : 0, count };
  }, [activeEmployees]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/employees/import-payroll", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || "Import fehlgeschlagen");
      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: "Import erfolgreich", description: `${result.updated || 0} Mitarbeiter aktualisiert, ${result.created || 0} neu angelegt` });
    } catch (err: any) {
      toast({ title: "Import-Fehler", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }, [toast]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-mitarbeiter-title">Mitarbeiter & Arbeitgeberkosten</h1>
          <p className="text-muted-foreground">Personal, Arbeitgeberkosten, tatsächliche Stundenkosten</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <input
              type="file"
              accept=".txt,.pdf,.csv"
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
              data-testid="input-payroll-upload"
              disabled={importing}
            />
            <Button variant="outline" size="sm" disabled={importing} data-testid="button-upload-payroll">
              {importing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
              Lohnabrechnung importieren
            </Button>
          </div>
          <Button size="sm" onClick={() => setShowNew(true)} data-testid="button-new-employee">
            <Plus className="h-4 w-4 mr-1" />
            Neuer Mitarbeiter
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Aktive Mitarbeiter</div>
            <div className="text-2xl font-bold" data-testid="text-active-count">{totals.count}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Ø AG-Stundensatz</div>
            <div className="text-2xl font-bold" data-testid="text-avg-hourly">{fmtCurrency(totals.avgHourly)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Σ Monatl. Personalkosten</div>
            <div className="text-2xl font-bold" data-testid="text-total-monthly">{fmtCurrency(totals.totalMonthly)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Letzter Import</div>
            <div className="text-sm font-medium text-muted-foreground">
              {importResult ? `${importResult.month || ""}` : "—"}
            </div>
          </CardContent>
        </Card>
      </div>

      {importResult && importResult.employees && (
        <Card className="border-green-200 dark:border-green-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              Import-Ergebnis: {importResult.month}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {importResult.employees?.map((e: any) => (
                <div key={e.personalNumber} className="flex justify-between border-b py-1">
                  <span>{e.name}</span>
                  <span className="font-mono text-xs">{dec(e.totalEmployerCost)} €/h</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[60px]">P-Nr.</TableHead>
                  <TableHead className="min-w-[150px]">Name</TableHead>
                  <TableHead>Gewerk</TableHead>
                  <TableHead className="text-right">Brutto/Std</TableHead>
                  <TableHead className="text-right">AG-Aufschlag %</TableHead>
                  <TableHead className="text-right">Aufschl./Std</TableHead>
                  <TableHead className="text-right">Zus./Std</TableHead>
                  <TableHead className="text-right font-bold">AG-Kosten/Std</TableHead>
                  <TableHead className="text-right">VK-Satz</TableHead>
                  <TableHead className="text-center">Kasse</TableHead>
                  <TableHead className="text-center">Zeiterfassung</TableHead>
                  <TableHead className="text-center w-[80px]">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeEmployees.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                      Keine Mitarbeiter angelegt
                    </TableCell>
                  </TableRow>
                )}
                {activeEmployees.map((emp) => {
                  const cost = calcEmployerHourlyCost(emp);
                  return (
                    <TableRow key={emp.id} data-testid={`row-employee-${emp.id}`} className="cursor-pointer hover:bg-muted/50" onClick={() => setEditId(emp.id)}>
                      <TableCell className="font-mono text-xs">{emp.employeeNumber}</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: emp.color || "#999" }} />
                          {emp.firstName} {emp.lastName}
                          {emp.type === "Minijob" && (
                            <Badge className="text-[9px] bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 px-1 py-0">Minijob</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{emp.trade || emp.type}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmtCurrency(emp.hourlyRate)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmtPercent(cost.aufschlagPercent)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmtCurrency(cost.aufschlagPerHour)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmtCurrency(cost.additionalPerHour)}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-primary">{fmtCurrency(cost.totalPerHour)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtCurrency(emp.hourlyRateSale)}</TableCell>
                      <TableCell className="text-center text-xs">{emp.healthInsurance || "—"}</TableCell>
                      <TableCell className="text-center">
                        {emp.workerIdExternal ? (
                          <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            <UserCheck className="h-3 w-3 mr-0.5" />
                            Verknüpft
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">Nicht verknüpft</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setEditId(emp.id); }} data-testid={`button-edit-${emp.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {editId && <EmployeeDialog employeeId={editId} onClose={() => setEditId(null)} />}
      {showNew && <EmployeeDialog employeeId={null} onClose={() => setShowNew(false)} />}
    </div>
  );
}

function EmployeeDialog({ employeeId, onClose }: { employeeId: number | null; onClose: () => void }) {
  const { toast } = useToast();
  const isNew = employeeId === null;
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: employee } = useQuery<Employee>({
    queryKey: ["/api/employees", employeeId],
    enabled: !!employeeId,
  });

  const [form, setForm] = useState<Record<string, string>>(() => {
    if (isNew) return {
      employeeNumber: "", firstName: "", lastName: "", type: "Monteur", trade: "Zimmerer",
      color: "#3b82f6", hourlyRate: "0", hourlyRateSale: "81.50", monthlyHours: "173.33",
      agAufschlagPercent: DEFAULT_AG_AUFSCHLAG, additionalMonthly: "100", workerIdExternal: "", healthInsurance: "",
      entryDate: "", exitDate: "", phone: "", email: "", qualification: "", ausbildung: "", lohngruppe: "",
      tarifstufe: "", vehicle: "", vacationDays: "30", vacationTaken: "0", overtimeHours: "0",
      notes: "", active: "true",
    };
    return {} as Record<string, string>;
  });

  const [loaded, setLoaded] = useState(isNew);

  if (!isNew && employee && !loaded) {
    const f: Record<string, string> = {};
    for (const [k, v] of Object.entries(employee)) {
      if (k === "id" || k === "createdAt") continue;
      f[k] = v == null ? "" : String(v);
    }
    setForm(f);
    setLoaded(true);
  }

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      if (isNew) {
        return apiRequest("POST", "/api/employees", data);
      } else {
        return apiRequest("PATCH", `/api/employees/${employeeId}`, data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: isNew ? "Mitarbeiter angelegt" : "Mitarbeiter aktualisiert" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/employees/${employeeId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: "Mitarbeiter gelöscht" });
      onClose();
    },
  });

  const handleSave = () => {
    const data: Record<string, any> = { ...form };
    const numericFields = ["hourlyRate", "hourlyRateSale", "monthlyHours", "agAufschlagPercent",
      "additionalMonthly", "overtimeHours"];
    for (const f of numericFields) {
      data[f] = data[f] ? String(parseFloat(String(data[f]).replace(",", "."))) : "0";
    }
    const intFields = ["vacationDays", "vacationTaken"];
    for (const f of intFields) {
      data[f] = parseInt(data[f]) || 0;
    }
    data.active = data.active === "true" || data.active === true;
    if (!data.entryDate) delete data.entryDate;
    if (!data.exitDate) delete data.exitDate;
    if (!data.workerIdExternal) data.workerIdExternal = null;
    if (!data.healthInsurance) data.healthInsurance = null;
    saveMutation.mutate(data);
  };

  const cost = useMemo(() => {
    const emp = {
      hourlyRate: form.hourlyRate,
      monthlyHours: form.monthlyHours,
      agAufschlagPercent: form.agAufschlagPercent,
      additionalMonthly: form.additionalMonthly,
    } as any;
    return calcEmployerHourlyCost(emp);
  }, [form]);

  if (!isNew && !loaded) return null;

  return (
    <>
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-dialog-title">
            {isNew ? "Neuer Mitarbeiter" : `${form.firstName} ${form.lastName} (${form.employeeNumber})`}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="stamm" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="stamm">Stammdaten</TabsTrigger>
            <TabsTrigger value="kosten">AG-Kosten</TabsTrigger>
            <TabsTrigger value="sonstig">Sonstiges</TabsTrigger>
          </TabsList>

          <TabsContent value="stamm" className="space-y-4 pt-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Personal-Nr.</Label>
                <Input value={form.employeeNumber || ""} onChange={e => set("employeeNumber", e.target.value)} data-testid="input-employee-number" />
              </div>
              <div>
                <Label className="text-xs">Vorname</Label>
                <Input value={form.firstName || ""} onChange={e => set("firstName", e.target.value)} data-testid="input-first-name" />
              </div>
              <div>
                <Label className="text-xs">Nachname</Label>
                <Input value={form.lastName || ""} onChange={e => set("lastName", e.target.value)} data-testid="input-last-name" />
              </div>
              <div>
                <Label className="text-xs">Farbe</Label>
                <Input type="color" value={form.color || "#3b82f6"} onChange={e => set("color", e.target.value)} className="h-9" data-testid="input-color" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Typ</Label>
                <Select value={form.type || "Monteur"} onValueChange={v => {
                  set("type", v);
                  if (v === "Minijob") {
                    setForm(prev => ({ ...prev, type: v, agAufschlagPercent: MINIJOB_AG_AUFSCHLAG, monthlyHours: "43.33" }));
                  } else if (form.type === "Minijob" && v !== "Minijob") {
                    setForm(prev => ({ ...prev, type: v, agAufschlagPercent: DEFAULT_AG_AUFSCHLAG, monthlyHours: "173.33" }));
                  }
                }}>
                  <SelectTrigger data-testid="select-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EMPLOYEE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Gewerk</Label>
                <Select value={form.trade || "Zimmerer"} onValueChange={v => set("trade", v)}>
                  <SelectTrigger data-testid="select-trade"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRADES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Brutto-Stundenlohn</Label>
                <Input value={form.hourlyRate || ""} onChange={e => set("hourlyRate", e.target.value)} data-testid="input-hourly-rate" />
              </div>
              <div>
                <Label className="text-xs">VK-Stundensatz</Label>
                <Input value={form.hourlyRateSale || ""} onChange={e => set("hourlyRateSale", e.target.value)} data-testid="input-hourly-rate-sale" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Eintrittsdatum</Label>
                <Input type="date" value={form.entryDate || ""} onChange={e => set("entryDate", e.target.value)} data-testid="input-entry-date" />
              </div>
              <div>
                <Label className="text-xs">Austrittsdatum</Label>
                <Input type="date" value={form.exitDate || ""} onChange={e => set("exitDate", e.target.value)} data-testid="input-exit-date" />
              </div>
              <div>
                <Label className="text-xs">Krankenkasse</Label>
                <Input value={form.healthInsurance || ""} onChange={e => set("healthInsurance", e.target.value)} data-testid="input-health-insurance" />
              </div>
              <div>
                <Label className="text-xs">Telefon</Label>
                <Input value={form.phone || ""} onChange={e => set("phone", e.target.value)} data-testid="input-phone" />
              </div>
              <div>
                <Label className="text-xs">E-Mail</Label>
                <Input value={form.email || ""} onChange={e => set("email", e.target.value)} data-testid="input-email" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Zeiterfassungs-ID (extern)</Label>
                <Input value={form.workerIdExternal || ""} onChange={e => set("workerIdExternal", e.target.value)} placeholder="UUID aus Zeiterfassungs-App" className="text-xs" data-testid="input-worker-id" />
              </div>
              <div>
                <Label className="text-xs">Aktiv</Label>
                <Select value={form.active === "false" ? "false" : "true"} onValueChange={v => set("active", v)}>
                  <SelectTrigger data-testid="select-active"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Ja</SelectItem>
                    <SelectItem value="false">Nein (Inaktiv)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="kosten" className="space-y-4 pt-2">
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                  <div>
                    <div className="text-xs text-muted-foreground">Brutto/Std</div>
                    <div className="text-lg font-bold">{fmtCurrency(form.hourlyRate)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">+ AG-Aufschlag/Std</div>
                    <div className="text-lg font-bold text-orange-600">{fmtCurrency(cost.aufschlagPerHour)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">+ Zusatz/Std</div>
                    <div className="text-lg font-bold text-blue-600">{fmtCurrency(cost.additionalPerHour)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground font-semibold">= AG-Kosten/Std</div>
                    <div className="text-xl font-bold text-primary">{fmtCurrency(cost.totalPerHour)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Monatl. Gesamt</div>
                    <div className="text-lg font-bold">{fmtCurrency(cost.totalMonthly)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Calculator className="h-4 w-4" />
                  Arbeitgeberkosten
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">AG-Aufschlag % (pauschal)</Label>
                    <Input value={form.agAufschlagPercent || ""} onChange={e => set("agAufschlagPercent", e.target.value)} data-testid="input-ag-aufschlag" />
                    <p className="text-[10px] text-muted-foreground mt-1">SV, Umlagen, BG etc.</p>
                  </div>
                  <div>
                    <Label className="text-xs">Sollstunden/Monat</Label>
                    <Input value={form.monthlyHours || ""} onChange={e => set("monthlyHours", e.target.value)} data-testid="input-monthly-hours" />
                  </div>
                  <div>
                    <Label className="text-xs">Zusätzl. monatl. Kosten (€)</Label>
                    <Input value={form.additionalMonthly || ""} onChange={e => set("additionalMonthly", e.target.value)} data-testid="input-additional-monthly" />
                    <p className="text-[10px] text-muted-foreground mt-1">Fahrgeld, VWL, Unternehmerlohn etc.</p>
                  </div>
                  <div>
                    <Label className="text-xs">Krankenkasse</Label>
                    <Input value={form.healthInsurance || ""} onChange={e => set("healthInsurance", e.target.value)} data-testid="input-health-insurance" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sonstig" className="space-y-4 pt-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Ausbildung</Label>
                <Input value={form.ausbildung || ""} onChange={e => set("ausbildung", e.target.value)} data-testid="input-ausbildung" />
              </div>
              <div>
                <Label className="text-xs">Lohngruppe</Label>
                <Input value={form.lohngruppe || ""} onChange={e => set("lohngruppe", e.target.value)} data-testid="input-lohngruppe" />
              </div>
              <div>
                <Label className="text-xs">Tarifstufe</Label>
                <Input value={form.tarifstufe || ""} onChange={e => set("tarifstufe", e.target.value)} data-testid="input-tarifstufe" />
              </div>
              <div>
                <Label className="text-xs">Qualifikation</Label>
                <Input value={form.qualification || ""} onChange={e => set("qualification", e.target.value)} data-testid="input-qualification" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs">Fahrzeug</Label>
                <Input value={form.vehicle || ""} onChange={e => set("vehicle", e.target.value)} data-testid="input-vehicle" />
              </div>
              <div>
                <Label className="text-xs">Urlaubstage</Label>
                <Input type="number" value={form.vacationDays || ""} onChange={e => set("vacationDays", e.target.value)} data-testid="input-vacation-days" />
              </div>
              <div>
                <Label className="text-xs">Urlaub genommen</Label>
                <Input type="number" value={form.vacationTaken || ""} onChange={e => set("vacationTaken", e.target.value)} data-testid="input-vacation-taken" />
              </div>
              <div>
                <Label className="text-xs">Überstunden</Label>
                <Input value={form.overtimeHours || ""} onChange={e => set("overtimeHours", e.target.value)} data-testid="input-overtime" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notizen</Label>
              <Textarea value={form.notes || ""} onChange={e => set("notes", e.target.value)} rows={3} data-testid="input-notes" />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex justify-between">
          <div>
            {!isNew && (
              <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)} data-testid="button-delete-employee">
                <Trash2 className="h-4 w-4 mr-1" />
                Löschen
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} data-testid="button-cancel">Abbrechen</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save-employee">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
              Speichern
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AlertDialog open={deleteOpen} onOpenChange={(open) => !open && !deleteMutation.isPending && setDeleteOpen(false)}>
      <AlertDialogContent data-testid="dialog-delete-employee">
        <AlertDialogHeader>
          <AlertDialogTitle>Mitarbeiter loeschen?</AlertDialogTitle>
          <AlertDialogDescription>
            Der Mitarbeiter wird dauerhaft entfernt.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending} data-testid="button-cancel-delete-employee">Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
            data-testid="button-confirm-delete-employee"
          >
            Loeschen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
