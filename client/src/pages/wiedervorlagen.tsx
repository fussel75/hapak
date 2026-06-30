import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fmtDocNumber } from "@/lib/format";
import type { FollowUp, Customer } from "@shared/schema";
import { followUpTypes } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate } from "@/lib/format";
import { Plus, Pencil, Trash2, Loader2, CheckCircle, Clock, AlertTriangle, ListChecks, X } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const statusBadge: Record<string, string> = {
  offen: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  erledigt: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "überfällig": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

function isOverdue(dueDate: string): boolean {
  return new Date(dueDate) < new Date(new Date().toISOString().split("T")[0]);
}

function getEffectiveStatus(entry: FollowUp): string {
  if (entry.status === "erledigt") return "erledigt";
  if (isOverdue(entry.dueDate)) return "überfällig";
  return "offen";
}

function FollowUpFormDialog({ entry, customers, open, onOpenChange, onSaved }: {
  entry?: FollowUp;
  customers: Customer[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!entry;
  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    dueDate: entry?.dueDate || today,
    subject: entry?.subject || "",
    customerId: entry?.customerId || null as number | null,
    documentNumber: entry?.documentNumber || "",
    type: entry?.type || "Allgemein",
    assignedToName: entry?.assignedToName || "",
    status: entry?.status || "offen",
    source: entry?.source || "",
    notes: entry?.notes || "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        await apiRequest("PATCH", `/api/follow-ups/${entry.id}`, form);
      } else {
        await apiRequest("POST", "/api/follow-ups", form);
      }
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Wiedervorlage aktualisiert" : "Wiedervorlage erstellt" });
      queryClient.invalidateQueries({ queryKey: ["/api/follow-ups"] });
      onSaved();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const update = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title-followup">
            {isEdit ? "Wiedervorlage bearbeiten" : "Neue Wiedervorlage"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Fälligkeitsdatum</Label>
              <Input data-testid="input-due-date" type="date" value={form.dueDate} onChange={e => update("dueDate", e.target.value)} />
            </div>
            <div>
              <Label>Typ</Label>
              <Select value={form.type} onValueChange={v => update("type", v)}>
                <SelectTrigger data-testid="select-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {followUpTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Betreff</Label>
            <Input data-testid="input-subject" value={form.subject} onChange={e => update("subject", e.target.value)} placeholder="z.B. Angebot nachfassen, Wartung durchführen..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Kunde</Label>
              <Select value={form.customerId ? String(form.customerId) : "none"} onValueChange={v => update("customerId", v === "none" ? null : parseInt(v))}>
                <SelectTrigger data-testid="select-customer"><SelectValue placeholder="Kunde wählen" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Kein Kunde —</SelectItem>
                  {customers.slice(0, 50).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.customerNumber} — {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Mitarbeiter</Label>
              <Input data-testid="input-assigned" value={form.assignedToName} onChange={e => update("assignedToName", e.target.value)} placeholder="Name" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Dokument-Nr.</Label>
              <Input data-testid="input-doc-number" value={form.documentNumber || ""} onChange={e => update("documentNumber", e.target.value)} />
            </div>
            <div>
              <Label>Quelle</Label>
              <Input data-testid="input-source" value={form.source || ""} onChange={e => update("source", e.target.value)} placeholder="z.B. Dokumentbearbeitung" />
            </div>
          </div>
          <div>
            <Label>Bemerkungen</Label>
            <Textarea data-testid="input-notes" value={form.notes || ""} onChange={e => update("notes", e.target.value)} className="min-h-[60px]" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel">Abbrechen</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.subject} data-testid="button-save-followup">
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Speichern" : "Erstellen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function WiedervorlagenPage() {
  const [statusFilter, setStatusFilter] = useState("Alle");
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<FollowUp | undefined>();
  const [selectedEntry, setSelectedEntry] = useState<FollowUp | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { toast } = useToast();

  const { data: entries = [], isLoading } = useQuery<FollowUp[]>({
    queryKey: ["/api/follow-ups"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const customerMap = new Map(customers.map(c => [c.id, c]));

  const enriched = entries.map(e => ({
    ...e,
    effectiveStatus: getEffectiveStatus(e),
    customerName: e.customerId ? customerMap.get(e.customerId)?.name || "" : "",
  }));

  const filtered = statusFilter === "Alle"
    ? enriched
    : enriched.filter(e => e.effectiveStatus === statusFilter);

  const sortedFiltered = [...filtered].sort((a, b) => {
    if (a.effectiveStatus === "überfällig" && b.effectiveStatus !== "überfällig") return -1;
    if (b.effectiveStatus === "überfällig" && a.effectiveStatus !== "überfällig") return 1;
    return 0;
  });

  const counts = {
    total: enriched.length,
    offen: enriched.filter(e => e.effectiveStatus === "offen").length,
    overdue: enriched.filter(e => e.effectiveStatus === "überfällig").length,
    done: enriched.filter(e => e.effectiveStatus === "erledigt").length,
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/follow-ups/${id}`); },
    onSuccess: () => {
      toast({ title: "Wiedervorlage gelöscht" });
      queryClient.invalidateQueries({ queryKey: ["/api/follow-ups"] });
      setDeleteId(null);
      if (selectedEntry?.id === deleteId) setSelectedEntry(null);
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/follow-ups/${id}`, { status: "erledigt" });
    },
    onSuccess: () => {
      toast({ title: "Als erledigt markiert" });
      queryClient.invalidateQueries({ queryKey: ["/api/follow-ups"] });
    },
  });

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Wiedervorlagen</h1>
          <p className="text-muted-foreground text-sm">Termine und Aufgaben im Blick behalten</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Gesamt", value: counts.total, icon: ListChecks, color: "text-gray-600" },
          { label: "Offen", value: counts.offen, icon: Clock, color: "text-yellow-600" },
          { label: "Überfällig", value: counts.overdue, icon: AlertTriangle, color: counts.overdue > 0 ? "text-red-600" : "text-green-600" },
          { label: "Erledigt", value: counts.done, icon: CheckCircle, color: "text-green-600" },
        ].map(k => (
          <Card key={k.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2">
                <k.icon className={`h-5 w-5 ${k.color}`} />
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold">{k.label}</p>
                  <p className={`text-lg font-bold ${k.color}`} data-testid={`text-count-${k.label.toLowerCase()}`}>{k.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {["Alle", "offen", "überfällig", "erledigt"].map(s => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(s)}
              data-testid={`button-filter-${s}`}
            >
              {s}{s === "überfällig" && counts.overdue > 0 ? ` (${counts.overdue})` : ""}
            </Button>
          ))}
        </div>
        <div className="flex-1" />
        <Button onClick={() => { setEditEntry(undefined); setShowForm(true); }} data-testid="button-new-followup">
          <Plus className="mr-2 h-4 w-4" /> Neue Wiedervorlage
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Datum</TableHead>
                  <TableHead>Betreff</TableHead>
                  <TableHead>Kunde</TableHead>
                  <TableHead className="w-[100px]">Typ</TableHead>
                  <TableHead>Mitarbeiter</TableHead>
                  <TableHead>Quelle</TableHead>
                  <TableHead>Dokument</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedFiltered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">Keine Wiedervorlagen</TableCell>
                  </TableRow>
                ) : sortedFiltered.map(e => (
                  <TableRow
                    key={e.id}
                    className={`cursor-pointer ${selectedEntry?.id === e.id ? "bg-blue-50 dark:bg-blue-950" : e.effectiveStatus === "überfällig" ? "bg-red-50 dark:bg-red-950/30" : ""}`}
                    onClick={() => setSelectedEntry(e)}
                    data-testid={`row-followup-${e.id}`}
                  >
                    <TableCell className="whitespace-nowrap font-medium">{fmtDate(e.dueDate)}</TableCell>
                    <TableCell className="font-semibold">{e.subject}</TableCell>
                    <TableCell>
                      {e.customerName ? (
                        <a className="hover:text-primary hover:underline cursor-pointer" onClick={(ev) => { ev.stopPropagation(); window.location.href = `/adressen?search=${encodeURIComponent(e.customerName)}`; }}>{e.customerName}</a>
                      ) : "—"}
                    </TableCell>
                    <TableCell><Badge variant="secondary">{e.type}</Badge></TableCell>
                    <TableCell>{e.assignedToName || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{e.source || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {e.documentNumber ? (
                        <a className="hover:text-primary hover:underline cursor-pointer" onClick={(ev) => { ev.stopPropagation(); window.location.href = `/dokumente?search=${encodeURIComponent(String(e.documentNumber))}`; }}>{fmtDocNumber(e.documentNumber)}</a>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusBadge[e.effectiveStatus] || ""} variant="secondary">{e.effectiveStatus}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {e.effectiveStatus !== "erledigt" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600"
                            onClick={ev => { ev.stopPropagation(); completeMutation.mutate(e.id); }}
                            data-testid={`button-complete-${e.id}`}>
                            <CheckCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={ev => { ev.stopPropagation(); setEditEntry(e); setShowForm(true); }}
                          data-testid={`button-edit-${e.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500"
                          onClick={ev => { ev.stopPropagation(); setDeleteId(e.id); }}
                          data-testid={`button-delete-${e.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {selectedEntry && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm">{selectedEntry.subject}</h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedEntry(null)} data-testid="button-close-detail"><X className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {[
                ["Fälligkeitsdatum", fmtDate(selectedEntry.dueDate)],
                ["Typ", selectedEntry.type],
                ["Kunde", (selectedEntry as any).customerName || "—"],
                ["Mitarbeiter", selectedEntry.assignedToName || "—"],
                ["Quelle", selectedEntry.source || "—"],
                ["Dokument", selectedEntry.documentNumber || "—"],
                ["Status", (selectedEntry as any).effectiveStatus],
                ["Bemerkungen", selectedEntry.notes || "—"],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <p className="text-xs text-muted-foreground uppercase font-semibold">{label}</p>
                  <p className="font-medium">{value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {showForm && (
        <FollowUpFormDialog
          entry={editEntry}
          customers={customers}
          open={showForm}
          onOpenChange={setShowForm}
          onSaved={() => {}}
        />
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wiedervorlage löschen?</AlertDialogTitle>
            <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} data-testid="button-confirm-delete">Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
