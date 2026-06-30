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
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Loader2, FileText, CheckCircle, AlertTriangle, ClipboardList } from "lucide-react";

type Contract = {
  id: number;
  contractNumber: string;
  customerName: string;
  subject: string;
  searchKey: string;
  category: string;
  cycle: string;
  startDate: string;
  endDate: string;
  nextDate: string;
  status: string;
  projectNumber: string;
  account: string;
  costCenter: string;
  preText: string;
  postText: string;
  notes: string;
  facilities: string;
  createdAt: string;
};

type ConstructionDiaryEntry = {
  id: number;
  projectId: number;
  projectNumber: string;
  projectName: string;
  date: string;
  weather: string;
  note: string;
  positions: any;
  personnel: any;
  createdAt: string;
};

const categoryOptions = [
  { value: "Wartungsvertrag", label: "Wartungsvertrag" },
  { value: "Vollwartungsvertrag", label: "Vollwartungsvertrag" },
  { value: "Servicevertrag", label: "Servicevertrag" },
  { value: "Mietvertrag", label: "Mietvertrag" },
  { value: "Rahmenvertrag", label: "Rahmenvertrag" },
];

const cycleOptions = [
  { value: "jährlich", label: "Jährlich" },
  { value: "halbjährlich", label: "Halbjährlich" },
  { value: "quartal", label: "Quartal" },
  { value: "monatlich", label: "Monatlich" },
];

const statusOptions = [
  { value: "aktiv", label: "Aktiv" },
  { value: "gekündigt", label: "Gekündigt" },
  { value: "abgelaufen", label: "Abgelaufen" },
  { value: "geplant", label: "Geplant" },
];

function statusBadgeVariant(status: string) {
  switch (status) {
    case "aktiv": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "gekündigt": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    case "abgelaufen": return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    case "geplant": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    default: return "";
  }
}

function ContractFormDialog({ contract, open, onOpenChange }: {
  contract?: Contract;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const isEdit = !!contract;
  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    contractNumber: contract?.contractNumber || "",
    customerName: contract?.customerName || "",
    subject: contract?.subject || "",
    category: contract?.category || "Wartungsvertrag",
    cycle: contract?.cycle || "jährlich",
    startDate: contract?.startDate || today,
    endDate: contract?.endDate || "",
    nextDate: contract?.nextDate || "",
    status: contract?.status || "aktiv",
    projectNumber: contract?.projectNumber || "",
    account: contract?.account || "",
    costCenter: contract?.costCenter || "",
    notes: contract?.notes || "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        await apiRequest("PATCH", `/api/contracts/${contract.id}`, form);
      } else {
        await apiRequest("POST", "/api/contracts", form);
      }
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Vertrag aktualisiert" : "Vertrag erstellt" });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const update = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title-contract">
            {isEdit ? "Vertrag bearbeiten" : "Neuer Vertrag"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Vertragsnummer</Label>
              <Input data-testid="input-contract-number" value={form.contractNumber} onChange={e => update("contractNumber", e.target.value)} />
            </div>
            <div>
              <Label>Kunde</Label>
              <Input data-testid="input-customer-name" value={form.customerName} onChange={e => update("customerName", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Betreff</Label>
            <Input data-testid="input-subject" value={form.subject} onChange={e => update("subject", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Kategorie</Label>
              <Select value={form.category} onValueChange={v => update("category", v)}>
                <SelectTrigger data-testid="select-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Zyklus</Label>
              <Select value={form.cycle} onValueChange={v => update("cycle", v)}>
                <SelectTrigger data-testid="select-cycle"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cycleOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Startdatum</Label>
              <Input data-testid="input-start-date" type="date" value={form.startDate} onChange={e => update("startDate", e.target.value)} />
            </div>
            <div>
              <Label>Enddatum</Label>
              <Input data-testid="input-end-date" type="date" value={form.endDate} onChange={e => update("endDate", e.target.value)} />
            </div>
            <div>
              <Label>Nächster Termin</Label>
              <Input data-testid="input-next-date" type="date" value={form.nextDate} onChange={e => update("nextDate", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => update("status", v)}>
                <SelectTrigger data-testid="select-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statusOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Projekt-Nr.</Label>
              <Input data-testid="input-project-number" value={form.projectNumber} onChange={e => update("projectNumber", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Konto</Label>
              <Input data-testid="input-account" value={form.account} onChange={e => update("account", e.target.value)} />
            </div>
            <div>
              <Label>Kostenstelle</Label>
              <Input data-testid="input-cost-center" value={form.costCenter} onChange={e => update("costCenter", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Notizen</Label>
            <Textarea data-testid="input-notes" value={form.notes} onChange={e => update("notes", e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-contract">Abbrechen</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.contractNumber || !form.customerName} data-testid="button-save-contract">
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Speichern" : "Erstellen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DiaryFormDialog({ entry, open, onOpenChange }: {
  entry?: ConstructionDiaryEntry;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const isEdit = !!entry;
  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    projectNumber: entry?.projectNumber || "",
    projectName: entry?.projectName || "",
    date: entry?.date || today,
    weather: entry?.weather || "",
    note: entry?.note || "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        await apiRequest("PATCH", `/api/construction-diary/${entry.id}`, form);
      } else {
        await apiRequest("POST", "/api/construction-diary", form);
      }
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Eintrag aktualisiert" : "Eintrag erstellt" });
      queryClient.invalidateQueries({ queryKey: ["/api/construction-diary"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const update = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title-diary">
            {isEdit ? "Eintrag bearbeiten" : "Neuer Bautagebuch-Eintrag"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Projekt-Nr.</Label>
              <Input data-testid="input-diary-project-number" value={form.projectNumber} onChange={e => update("projectNumber", e.target.value)} />
            </div>
            <div>
              <Label>Projektname</Label>
              <Input data-testid="input-diary-project-name" value={form.projectName} onChange={e => update("projectName", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Datum</Label>
              <Input data-testid="input-diary-date" type="date" value={form.date} onChange={e => update("date", e.target.value)} />
            </div>
            <div>
              <Label>Wetter</Label>
              <Input data-testid="input-diary-weather" value={form.weather} onChange={e => update("weather", e.target.value)} placeholder="z.B. sonnig, bewölkt..." />
            </div>
          </div>
          <div>
            <Label>Notiz</Label>
            <Textarea data-testid="input-diary-note" value={form.note} onChange={e => update("note", e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-diary">Abbrechen</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.projectNumber} data-testid="button-save-diary">
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Speichern" : "Erstellen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function VertraegePage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("Alle");
  const [showContractForm, setShowContractForm] = useState(false);
  const [editContract, setEditContract] = useState<Contract | undefined>();
  const [deleteContractId, setDeleteContractId] = useState<number | null>(null);

  const [diaryProjectFilter, setDiaryProjectFilter] = useState("");
  const [showDiaryForm, setShowDiaryForm] = useState(false);
  const [editDiary, setEditDiary] = useState<ConstructionDiaryEntry | undefined>();
  const [deleteDiaryId, setDeleteDiaryId] = useState<number | null>(null);

  const { data: contracts = [], isLoading: contractsLoading } = useQuery<Contract[]>({
    queryKey: ["/api/contracts"],
  });

  const { data: diaryEntries = [], isLoading: diaryLoading } = useQuery<ConstructionDiaryEntry[]>({
    queryKey: ["/api/construction-diary"],
  });

  const deleteContractMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/contracts/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Vertrag gelöscht" });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      setDeleteContractId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const deleteDiaryMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/construction-diary/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Eintrag gelöscht" });
      queryClient.invalidateQueries({ queryKey: ["/api/construction-diary"] });
      setDeleteDiaryId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const filteredContracts = statusFilter === "Alle"
    ? contracts
    : contracts.filter(c => c.status === statusFilter);

  const today = new Date().toISOString().split("T")[0];
  const totalContracts = contracts.length;
  const activeContracts = contracts.filter(c => c.status === "aktiv").length;
  const dueContracts = contracts.filter(c => c.status === "aktiv" && c.nextDate && c.nextDate < today).length;

  const filteredDiary = diaryProjectFilter
    ? diaryEntries.filter(d => d.projectNumber.toLowerCase().includes(diaryProjectFilter.toLowerCase()))
    : diaryEntries;

  const uniqueProjects = Array.from(new Set(diaryEntries.map(d => d.projectNumber).filter(Boolean)));

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Verträge & Bautagebuch</h1>
        <p className="text-muted-foreground text-sm">Vertragsverwaltung und Bautagebuch</p>
      </div>

      <Tabs defaultValue="vertraege" data-testid="tabs-main">
        <TabsList data-testid="tabs-list">
          <TabsTrigger value="vertraege" data-testid="tab-vertraege">Vertragsverwaltung</TabsTrigger>
          <TabsTrigger value="bautagebuch" data-testid="tab-bautagebuch">Bautagebuch</TabsTrigger>
        </TabsList>

        <TabsContent value="vertraege" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Gesamt</p>
                    <p className="text-lg font-bold" data-testid="text-total-contracts">{totalContracts}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Aktiv</p>
                    <p className="text-lg font-bold text-green-600" data-testid="text-active-contracts">{activeContracts}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Fällig</p>
                    <p className="text-lg font-bold text-orange-600" data-testid="text-due-contracts">{dueContracts}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-status-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Alle">Alle Status</SelectItem>
                {statusOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex-1" />
            <Button onClick={() => { setEditContract(undefined); setShowContractForm(true); }} data-testid="button-new-contract">
              <Plus className="mr-2 h-4 w-4" /> Neuer Vertrag
            </Button>
          </div>

          {contractsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Nr</TableHead>
                      <TableHead>Kunde</TableHead>
                      <TableHead>Betreff</TableHead>
                      <TableHead>Kategorie</TableHead>
                      <TableHead>Zyklus</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Nächster Termin</TableHead>
                      <TableHead className="w-[80px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredContracts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8" data-testid="text-no-contracts">
                          Keine Verträge vorhanden
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredContracts.map(c => (
                        <TableRow key={c.id} data-testid={`row-contract-${c.id}`}>
                          <TableCell className="font-semibold" data-testid={`text-contract-number-${c.id}`}>{c.contractNumber}</TableCell>
                          <TableCell data-testid={`text-customer-${c.id}`}>{c.customerName}</TableCell>
                          <TableCell data-testid={`text-subject-${c.id}`}>{c.subject}</TableCell>
                          <TableCell data-testid={`text-category-${c.id}`}>{c.category}</TableCell>
                          <TableCell data-testid={`text-cycle-${c.id}`}>{c.cycle}</TableCell>
                          <TableCell>
                            <Badge className={`${statusBadgeVariant(c.status)} no-default-hover-elevate no-default-active-elevate`} data-testid={`badge-status-${c.id}`}>
                              {c.status}
                            </Badge>
                          </TableCell>
                          <TableCell data-testid={`text-next-date-${c.id}`}>{fmtDate(c.nextDate)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon"
                                onClick={() => { setEditContract(c); setShowContractForm(true); }}
                                data-testid={`button-edit-contract-${c.id}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon"
                                onClick={() => setDeleteContractId(c.id)}
                                data-testid={`button-delete-contract-${c.id}`}>
                                <Trash2 className="h-3.5 w-3.5" />
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
        </TabsContent>

        <TabsContent value="bautagebuch" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              className="w-[220px]"
              placeholder="Nach Projekt-Nr. filtern..."
              value={diaryProjectFilter}
              onChange={e => setDiaryProjectFilter(e.target.value)}
              data-testid="input-diary-filter"
            />
            <div className="flex-1" />
            <Button onClick={() => { setEditDiary(undefined); setShowDiaryForm(true); }} data-testid="button-new-diary">
              <Plus className="mr-2 h-4 w-4" /> Neuer Eintrag
            </Button>
          </div>

          {diaryLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">Datum</TableHead>
                      <TableHead>Projekt-Nr.</TableHead>
                      <TableHead>Projektname</TableHead>
                      <TableHead>Wetter</TableHead>
                      <TableHead>Notiz</TableHead>
                      <TableHead className="w-[80px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDiary.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8" data-testid="text-no-diary">
                          Keine Einträge vorhanden
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredDiary.map(d => (
                        <TableRow key={d.id} data-testid={`row-diary-${d.id}`}>
                          <TableCell data-testid={`text-diary-date-${d.id}`}>{fmtDate(d.date)}</TableCell>
                          <TableCell className="font-semibold" data-testid={`text-diary-project-number-${d.id}`}>{fmtDocNumber(d.projectNumber)}</TableCell>
                          <TableCell data-testid={`text-diary-project-name-${d.id}`}>{d.projectName}</TableCell>
                          <TableCell data-testid={`text-diary-weather-${d.id}`}>{d.weather}</TableCell>
                          <TableCell className="max-w-[300px] truncate" data-testid={`text-diary-note-${d.id}`}>{d.note}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon"
                                onClick={() => { setEditDiary(d); setShowDiaryForm(true); }}
                                data-testid={`button-edit-diary-${d.id}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon"
                                onClick={() => setDeleteDiaryId(d.id)}
                                data-testid={`button-delete-diary-${d.id}`}>
                                <Trash2 className="h-3.5 w-3.5" />
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
        </TabsContent>
      </Tabs>

      {showContractForm && (
        <ContractFormDialog
          contract={editContract}
          open={showContractForm}
          onOpenChange={setShowContractForm}
        />
      )}

      {showDiaryForm && (
        <DiaryFormDialog
          entry={editDiary}
          open={showDiaryForm}
          onOpenChange={setShowDiaryForm}
        />
      )}

      <AlertDialog open={deleteContractId !== null} onOpenChange={() => setDeleteContractId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vertrag löschen?</AlertDialogTitle>
            <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden. Der Vertrag wird dauerhaft gelöscht.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-contract">Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteContractId && deleteContractMutation.mutate(deleteContractId)} data-testid="button-confirm-delete-contract">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDiaryId !== null} onOpenChange={() => setDeleteDiaryId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eintrag löschen?</AlertDialogTitle>
            <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden. Der Bautagebuch-Eintrag wird dauerhaft gelöscht.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-diary">Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteDiaryId && deleteDiaryMutation.mutate(deleteDiaryId)} data-testid="button-confirm-delete-diary">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
