import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fmtDate, fmtDocNumber } from "@/lib/format";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, Loader2, Calendar, Users, Check,
  Clock, CheckCircle, AlertCircle, ClipboardList,
} from "lucide-react";

type Appointment = {
  id: number;
  date: string;
  timeFrom: string;
  timeTo: string;
  subject: string;
  type: string;
  employeeId: number | null;
  employeeName: string;
  customerId: number | null;
  customerName: string;
  projectNumber: string;
  orderNumber: string;
  completed: boolean;
  notes: string;
  createdAt: string;
};

type Employee = {
  id: number;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  type: string;
  color: string;
  hourlyRate: string;
  hourlyRateSale: string;
  entryDate: string;
  exitDate: string;
  phone: string;
  email: string;
  qualification: string;
  ausbildung: string;
  lohngruppe: string;
  tarifstufe: string;
  vehicle: string;
  vacationDays: number;
  vacationTaken: number;
  overtimeHours: number;
  notes: string;
  active: boolean;
  createdAt: string;
};

const appointmentTypes = ["Termin", "Arbeitsauftrag", "Wartung", "Besprechung", "Berufsschule"];
const employeeTypes = ["Monteur", "Meister", "Azubi", "Büro", "Bauleiter", "Geschäftsführer"];

function getTypeBadgeClass(type: string): string {
  switch (type) {
    case "Termin": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "Arbeitsauftrag": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    case "Wartung": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "Besprechung": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
    case "Berufsschule": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    default: return "";
  }
}

function getEmployeeTypeBadgeClass(type: string): string {
  switch (type) {
    case "Monteur": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "Meister": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
    case "Azubi": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "Büro": return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    case "Bauleiter": return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
    case "Geschäftsführer": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    default: return "";
  }
}

function fmtGermanNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0,00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0,00";
  return num.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function AppointmentDialog({ appointment, open, onOpenChange }: {
  appointment?: Appointment;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const isEdit = !!appointment;
  const [form, setForm] = useState({
    date: appointment?.date || todayStr(),
    timeFrom: appointment?.timeFrom || "08:00",
    timeTo: appointment?.timeTo || "09:00",
    subject: appointment?.subject || "",
    type: appointment?.type || "Termin",
    employeeName: appointment?.employeeName || "",
    customerName: appointment?.customerName || "",
    projectNumber: appointment?.projectNumber || "",
    orderNumber: appointment?.orderNumber || "",
    notes: appointment?.notes || "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        await apiRequest("PATCH", `/api/appointments/${appointment.id}`, form);
      } else {
        await apiRequest("POST", "/api/appointments", form);
      }
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Termin aktualisiert" : "Termin erstellt" });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const update = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title-appointment">
            {isEdit ? "Termin bearbeiten" : "Neuer Termin"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Datum</Label>
              <Input data-testid="input-appointment-date" type="date" value={form.date} onChange={e => update("date", e.target.value)} />
            </div>
            <div>
              <Label>Von</Label>
              <Input data-testid="input-appointment-time-from" type="time" value={form.timeFrom} onChange={e => update("timeFrom", e.target.value)} />
            </div>
            <div>
              <Label>Bis</Label>
              <Input data-testid="input-appointment-time-to" type="time" value={form.timeTo} onChange={e => update("timeTo", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Betreff</Label>
            <Input data-testid="input-appointment-subject" value={form.subject} onChange={e => update("subject", e.target.value)} placeholder="Betreff eingeben..." />
          </div>
          <div>
            <Label>Typ</Label>
            <Select value={form.type} onValueChange={v => update("type", v)}>
              <SelectTrigger data-testid="select-appointment-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {appointmentTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Mitarbeiter</Label>
              <Input data-testid="input-appointment-employee" value={form.employeeName} onChange={e => update("employeeName", e.target.value)} placeholder="Mitarbeitername" />
            </div>
            <div>
              <Label>Kunde</Label>
              <Input data-testid="input-appointment-customer" value={form.customerName} onChange={e => update("customerName", e.target.value)} placeholder="Kundenname" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Projekt-Nr.</Label>
              <Input data-testid="input-appointment-project" value={form.projectNumber} onChange={e => update("projectNumber", e.target.value)} />
            </div>
            <div>
              <Label>Auftrags-Nr.</Label>
              <Input data-testid="input-appointment-order" value={form.orderNumber} onChange={e => update("orderNumber", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Notizen</Label>
            <Textarea data-testid="input-appointment-notes" value={form.notes} onChange={e => update("notes", e.target.value)} rows={3} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-appointment">Abbrechen</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.subject} data-testid="button-save-appointment">
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Speichern" : "Erstellen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmployeeDialog({ employee, open, onOpenChange }: {
  employee?: Employee;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const isEdit = !!employee;
  const [form, setForm] = useState({
    employeeNumber: employee?.employeeNumber || "",
    firstName: employee?.firstName || "",
    lastName: employee?.lastName || "",
    type: employee?.type || "Monteur",
    color: employee?.color || "#3b82f6",
    hourlyRate: employee?.hourlyRate || "0",
    hourlyRateSale: employee?.hourlyRateSale || "0",
    entryDate: employee?.entryDate || todayStr(),
    exitDate: employee?.exitDate || "",
    phone: employee?.phone || "",
    email: employee?.email || "",
    qualification: employee?.qualification || "",
    ausbildung: employee?.ausbildung || "",
    lohngruppe: employee?.lohngruppe || "",
    tarifstufe: employee?.tarifstufe || "",
    vehicle: employee?.vehicle || "",
    vacationDays: employee?.vacationDays ?? 30,
    vacationTaken: employee?.vacationTaken ?? 0,
    overtimeHours: employee?.overtimeHours ?? 0,
    notes: employee?.notes || "",
    active: employee?.active ?? true,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        hourlyRate: String(form.hourlyRate),
        hourlyRateSale: String(form.hourlyRateSale),
        overtimeHours: String(form.overtimeHours),
        vacationDays: Number(form.vacationDays),
        vacationTaken: Number(form.vacationTaken),
      };
      if (isEdit) {
        await apiRequest("PATCH", `/api/employees/${employee.id}`, payload);
      } else {
        await apiRequest("POST", "/api/employees", payload);
      }
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Mitarbeiter aktualisiert" : "Mitarbeiter erstellt" });
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const update = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title-employee">
            {isEdit ? "Mitarbeiter bearbeiten" : "Neuer Mitarbeiter"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Mitarbeiter-Nr.</Label>
              <Input data-testid="input-employee-number" value={form.employeeNumber} onChange={e => update("employeeNumber", e.target.value)} />
            </div>
            <div>
              <Label>Vorname</Label>
              <Input data-testid="input-employee-firstname" value={form.firstName} onChange={e => update("firstName", e.target.value)} />
            </div>
            <div>
              <Label>Nachname</Label>
              <Input data-testid="input-employee-lastname" value={form.lastName} onChange={e => update("lastName", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label>Typ</Label>
              <Select value={form.type} onValueChange={v => update("type", v)}>
                <SelectTrigger data-testid="select-employee-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {employeeTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Farbe</Label>
              <Input data-testid="input-employee-color" type="color" value={form.color} onChange={e => update("color", e.target.value)} />
            </div>
            <div>
              <Label>Eintrittsdatum</Label>
              <Input data-testid="input-employee-entry-date" type="date" value={form.entryDate} onChange={e => update("entryDate", e.target.value)} />
            </div>
            <div>
              <Label>Austrittsdatum</Label>
              <Input data-testid="input-employee-exit-date" type="date" value={form.exitDate} onChange={e => update("exitDate", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Stundensatz</Label>
              <Input data-testid="input-employee-hourly-rate" type="number" step="0.01" value={form.hourlyRate} onChange={e => update("hourlyRate", e.target.value)} />
            </div>
            <div>
              <Label>VK-Satz</Label>
              <Input data-testid="input-employee-hourly-rate-sale" type="number" step="0.01" value={form.hourlyRateSale} onChange={e => update("hourlyRateSale", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Telefon</Label>
              <Input data-testid="input-employee-phone" value={form.phone} onChange={e => update("phone", e.target.value)} />
            </div>
            <div>
              <Label>E-Mail</Label>
              <Input data-testid="input-employee-email" type="email" value={form.email} onChange={e => update("email", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Ausbildung</Label>
              <Select value={form.ausbildung || "none"} onValueChange={v => update("ausbildung", v === "none" ? "" : v)}>
                <SelectTrigger data-testid="select-employee-ausbildung"><SelectValue placeholder="Keine Angabe" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Keine Angabe</SelectItem>
                  <SelectItem value="Azubi 1. Lj.">Azubi 1. Lehrjahr</SelectItem>
                  <SelectItem value="Azubi 2. Lj.">Azubi 2. Lehrjahr</SelectItem>
                  <SelectItem value="Azubi 3. Lj.">Azubi 3. Lehrjahr</SelectItem>
                  <SelectItem value="Azubi 4. Lj.">Azubi 4. Lehrjahr</SelectItem>
                  <SelectItem value="Geselle">Geselle</SelectItem>
                  <SelectItem value="Facharbeiter">Facharbeiter</SelectItem>
                  <SelectItem value="Vorarbeiter">Vorarbeiter</SelectItem>
                  <SelectItem value="Meister">Meister</SelectItem>
                  <SelectItem value="Techniker">Techniker</SelectItem>
                  <SelectItem value="Ingenieur">Ingenieur</SelectItem>
                  <SelectItem value="Studium">Studium</SelectItem>
                  <SelectItem value="Sonstige">Sonstige</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Qualifikation</Label>
              <Input data-testid="input-employee-qualification" value={form.qualification} onChange={e => update("qualification", e.target.value)} placeholder="z.B. Zimmerergeselle, SHK-Meister" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Lohngruppe</Label>
              <Input data-testid="input-employee-lohngruppe" value={form.lohngruppe} onChange={e => update("lohngruppe", e.target.value)} placeholder="z.B. LG 4" />
            </div>
            <div>
              <Label>Tarifstufe</Label>
              <Input data-testid="input-employee-tarifstufe" value={form.tarifstufe} onChange={e => update("tarifstufe", e.target.value)} placeholder="z.B. T3" />
            </div>
            <div>
              <Label>Fahrzeug</Label>
              <Input data-testid="input-employee-vehicle" value={form.vehicle} onChange={e => update("vehicle", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Urlaubstage</Label>
              <Input data-testid="input-employee-vacation-days" type="number" value={form.vacationDays} onChange={e => update("vacationDays", parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Urlaub genommen</Label>
              <Input data-testid="input-employee-vacation-taken" type="number" value={form.vacationTaken} onChange={e => update("vacationTaken", parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Überstunden</Label>
              <Input data-testid="input-employee-overtime" type="number" step="0.5" value={form.overtimeHours} onChange={e => update("overtimeHours", parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div>
            <Label>Notizen</Label>
            <Textarea data-testid="input-employee-notes" value={form.notes} onChange={e => update("notes", e.target.value)} rows={3} />
          </div>
          <div className="flex items-center gap-2">
            <Switch data-testid="switch-employee-active" checked={form.active} onCheckedChange={v => update("active", v)} />
            <Label>Aktiv</Label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-employee">Abbrechen</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.lastName} data-testid="button-save-employee">
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Speichern" : "Erstellen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TerminverwaltungTab() {
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState("Alle");
  const [showDialog, setShowDialog] = useState(false);
  const [editAppointment, setEditAppointment] = useState<Appointment | undefined>();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: appointments = [], isLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
  });

  const today = todayStr();
  const filtered = typeFilter === "Alle" ? appointments : appointments.filter(a => a.type === typeFilter);

  const total = appointments.length;
  const todayCount = appointments.filter(a => a.date === today).length;
  const openCount = appointments.filter(a => !a.completed).length;
  const doneCount = appointments.filter(a => a.completed).length;

  const toggleMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/appointments/${id}`, { completed: true });
    },
    onSuccess: () => {
      toast({ title: "Termin als erledigt markiert" });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/appointments/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Termin gelöscht" });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      setDeleteId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold">Gesamt</p>
                <p className="text-lg font-bold" data-testid="text-appointments-total">{total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold">Heute</p>
                <p className="text-lg font-bold" data-testid="text-appointments-today">{todayCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold">Offen</p>
                <p className="text-lg font-bold" data-testid="text-appointments-open">{openCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold">Erledigt</p>
                <p className="text-lg font-bold" data-testid="text-appointments-done">{doneCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-appointment-type-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Alle">Alle Typen</SelectItem>
            {appointmentTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button onClick={() => { setEditAppointment(undefined); setShowDialog(true); }} data-testid="button-new-appointment">
          <Plus className="mr-2 h-4 w-4" /> Neuer Termin
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Von-Bis</TableHead>
                  <TableHead>Betreff</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Mitarbeiter</TableHead>
                  <TableHead>Kunde</TableHead>
                  <TableHead>Projekt</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      Keine Termine vorhanden
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(a => (
                    <TableRow key={a.id} data-testid={`row-appointment-${a.id}`}>
                      <TableCell className="whitespace-nowrap">{fmtDate(a.date)}</TableCell>
                      <TableCell className="whitespace-nowrap">{a.timeFrom} - {a.timeTo}</TableCell>
                      <TableCell>{a.subject}</TableCell>
                      <TableCell>
                        <Badge className={`no-default-hover-elevate no-default-active-elevate ${getTypeBadgeClass(a.type)}`} data-testid={`badge-type-${a.id}`}>
                          {a.type}
                        </Badge>
                      </TableCell>
                      <TableCell>{a.employeeName || "—"}</TableCell>
                      <TableCell>
                        {a.customerName ? (
                          <a className="hover:text-primary hover:underline cursor-pointer" onClick={() => window.location.href = `/adressen?search=${encodeURIComponent(a.customerName)}`}>{a.customerName}</a>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {a.projectNumber ? (
                          <a className="hover:text-primary hover:underline cursor-pointer font-mono text-xs" onClick={() => window.location.href = `/projekte?search=${encodeURIComponent(a.projectNumber)}`}>{fmtDocNumber(a.projectNumber)}</a>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {a.completed ? (
                          <Badge className="no-default-hover-elevate no-default-active-elevate bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid={`badge-status-${a.id}`}>
                            Erledigt
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate" data-testid={`badge-status-${a.id}`}>
                            Offen
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {!a.completed && (
                            <Button variant="ghost" size="icon" onClick={() => toggleMutation.mutate(a.id)} data-testid={`button-complete-appointment-${a.id}`}>
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => { setEditAppointment(a); setShowDialog(true); }} data-testid={`button-edit-appointment-${a.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(a.id)} data-testid={`button-delete-appointment-${a.id}`}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {showDialog && (
        <AppointmentDialog
          appointment={editAppointment}
          open={showDialog}
          onOpenChange={setShowDialog}
        />
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Termin löschen?</AlertDialogTitle>
            <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-appointment">Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} data-testid="button-confirm-delete-appointment">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PersonalverwaltungTab() {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | undefined>();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/employees/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Mitarbeiter gelöscht" });
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setDeleteId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1" />
        <Button onClick={() => { setEditEmployee(undefined); setShowDialog(true); }} data-testid="button-new-employee">
          <Plus className="mr-2 h-4 w-4" /> Neuer Mitarbeiter
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nr</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Ausbildung</TableHead>
                  <TableHead>Lohngruppe</TableHead>
                  <TableHead className="text-right">Stundensatz</TableHead>
                  <TableHead className="text-right">VK-Satz</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Fahrzeug</TableHead>
                  <TableHead>Aktiv</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                      Keine Mitarbeiter vorhanden
                    </TableCell>
                  </TableRow>
                ) : (
                  employees.map(emp => (
                    <TableRow key={emp.id} data-testid={`row-employee-${emp.id}`}>
                      <TableCell className="font-medium">{emp.employeeNumber}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {emp.color && (
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: emp.color }} data-testid={`color-indicator-${emp.id}`} />
                          )}
                          {emp.firstName} {emp.lastName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`no-default-hover-elevate no-default-active-elevate ${getEmployeeTypeBadgeClass(emp.type)}`} data-testid={`badge-employee-type-${emp.id}`}>
                          {emp.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{emp.ausbildung || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{emp.lohngruppe || "—"}</TableCell>
                      <TableCell className="text-right">{fmtGermanNumber(emp.hourlyRate)} EUR</TableCell>
                      <TableCell className="text-right">{fmtGermanNumber(emp.hourlyRateSale)} EUR</TableCell>
                      <TableCell>{emp.phone || "—"}</TableCell>
                      <TableCell>{emp.vehicle || "—"}</TableCell>
                      <TableCell>
                        {emp.active ? (
                          <Badge className="no-default-hover-elevate no-default-active-elevate bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid={`badge-active-${emp.id}`}>Aktiv</Badge>
                        ) : (
                          <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate" data-testid={`badge-active-${emp.id}`}>Inaktiv</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => { setEditEmployee(emp); setShowDialog(true); }} data-testid={`button-edit-employee-${emp.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(emp.id)} data-testid={`button-delete-employee-${emp.id}`}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {showDialog && (
        <EmployeeDialog
          employee={editEmployee}
          open={showDialog}
          onOpenChange={setShowDialog}
        />
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mitarbeiter löschen?</AlertDialogTitle>
            <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-employee">Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} data-testid="button-confirm-delete-employee">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function TerminePage() {
  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title-termine">Termine & Personal</h1>
        <p className="text-muted-foreground text-sm">Verwaltung von Terminen und Mitarbeitern</p>
      </div>

      <Tabs defaultValue="termine" className="space-y-4">
        <TabsList>
          <TabsTrigger value="termine" data-testid="tab-terminverwaltung">
            <Calendar className="mr-2 h-4 w-4" />
            Terminverwaltung
          </TabsTrigger>
          <TabsTrigger value="personal" data-testid="tab-personalverwaltung">
            <Users className="mr-2 h-4 w-4" />
            Personalverwaltung
          </TabsTrigger>
        </TabsList>
        <TabsContent value="termine">
          <TerminverwaltungTab />
        </TabsContent>
        <TabsContent value="personal">
          <PersonalverwaltungTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
