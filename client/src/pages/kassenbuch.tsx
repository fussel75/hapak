import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CashBookEntry, Project } from "@shared/schema";
import { cashAccountOptions } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtCurrency, fmtDate } from "@/lib/format";
import { Plus, Pencil, Trash2, Loader2, BookOpen, ArrowUpCircle, ArrowDownCircle, Wallet } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const months = [
  { value: "1", label: "Januar" }, { value: "2", label: "Februar" }, { value: "3", label: "März" },
  { value: "4", label: "April" }, { value: "5", label: "Mai" }, { value: "6", label: "Juni" },
  { value: "7", label: "Juli" }, { value: "8", label: "August" }, { value: "9", label: "September" },
  { value: "10", label: "Oktober" }, { value: "11", label: "November" }, { value: "12", label: "Dezember" },
];

const taxOptions = [
  { value: "19", label: "19 %" },
  { value: "7", label: "7 %" },
  { value: "", label: "ohne MwSt." },
];

function EntryFormDialog({ entry, open, onOpenChange, onSaved, selectedMonth, selectedYear }: {
  entry?: CashBookEntry;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  selectedMonth: number;
  selectedYear: number;
}) {
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];
  const isEdit = !!entry;

  const [form, setForm] = useState({
    date: entry?.date || today,
    receiptNumber: entry?.receiptNumber || "",
    subject: entry?.subject || "",
    cashAccount: entry?.cashAccount || "1000",
    contraAccount: entry?.contraAccount || "",
    income: entry?.income || "0.00",
    expense: entry?.expense || "0.00",
    taxRate: entry?.taxRate || "19",
    address: entry?.address || "",
    notes: entry?.notes || "",
    projectId: entry?.projectId || null as number | null,
  });

  useEffect(() => {
    if (open && !isEdit) {
      fetch(`/api/cash-book/next-number?year=${selectedYear}`, { credentials: "include" })
        .then(r => r.json())
        .then(d => setForm(f => ({ ...f, receiptNumber: d.number })));
    }
  }, [open, isEdit, selectedYear]);

  const mutation = useMutation({
    mutationFn: async () => {
      const dateObj = new Date(form.date);
      const body = {
        ...form,
        lfdNr: entry?.lfdNr || 0,
        month: dateObj.getMonth() + 1,
        year: dateObj.getFullYear(),
      };
      if (isEdit) {
        await apiRequest("PATCH", `/api/cash-book/${entry.id}`, body);
      } else {
        await apiRequest("POST", "/api/cash-book", body);
      }
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Buchung aktualisiert" : "Buchung erstellt" });
      queryClient.invalidateQueries({ queryKey: ["/api/cash-book"] });
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
          <DialogTitle data-testid="dialog-title-cashbook">
            {isEdit ? "Buchung bearbeiten" : "Neue Kassenbuchung"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Datum</Label>
              <Input data-testid="input-date" type="date" value={form.date} onChange={e => update("date", e.target.value)} />
            </div>
            <div>
              <Label>Beleg-Nr.</Label>
              <Input data-testid="input-receipt-number" value={form.receiptNumber} onChange={e => update("receiptNumber", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Betreff</Label>
            <Input data-testid="input-subject" value={form.subject} onChange={e => update("subject", e.target.value)} placeholder="z.B. Tankquittung, Barzahlung..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Kassenkonto</Label>
              <Select value={form.cashAccount} onValueChange={v => update("cashAccount", v)}>
                <SelectTrigger data-testid="select-cash-account"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cashAccountOptions.map(o => (
                    <SelectItem key={o.code} value={o.code}>{o.name} ({o.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Gegenkonto</Label>
              <Input data-testid="input-contra-account" value={form.contraAccount} onChange={e => update("contraAccount", e.target.value)} placeholder="z.B. 8400, 6530..." />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Einnahme</Label>
              <Input data-testid="input-income" type="number" step="0.01" min="0" value={form.income} onChange={e => update("income", e.target.value)} className="text-right" />
            </div>
            <div>
              <Label>Ausgabe</Label>
              <Input data-testid="input-expense" type="number" step="0.01" min="0" value={form.expense} onChange={e => update("expense", e.target.value)} className="text-right" />
            </div>
            <div>
              <Label>MwSt.</Label>
              <Select value={form.taxRate || ""} onValueChange={v => update("taxRate", v)}>
                <SelectTrigger data-testid="select-tax-rate"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {taxOptions.map(o => (
                    <SelectItem key={o.value} value={o.value || "none"}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Adresse / Kunde / Lieferant</Label>
              <Input data-testid="input-address" value={form.address} onChange={e => update("address", e.target.value)} placeholder="Kunde/Lieferant" />
            </div>
            <div>
              <Label>Bemerkung</Label>
              <Input data-testid="input-notes" value={form.notes || ""} onChange={e => update("notes", e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-cashbook">Abbrechen</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.subject || !form.receiptNumber} data-testid="button-save-cashbook">
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Speichern" : "Buchen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function KassenbuchPage() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [accountFilter, setAccountFilter] = useState("Alle");
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<CashBookEntry | undefined>();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<CashBookEntry | null>(null);
  const { toast } = useToast();

  const { data: entries = [], isLoading } = useQuery<CashBookEntry[]>({
    queryKey: ["/api/cash-book", `?month=${selectedMonth}&year=${selectedYear}`],
  });

  const filtered = accountFilter === "Alle"
    ? entries
    : entries.filter(e => e.cashAccount === accountFilter);

  const sumIncome = filtered.reduce((s, e) => s + parseFloat(e.income || "0"), 0);
  const sumExpense = filtered.reduce((s, e) => s + parseFloat(e.expense || "0"), 0);
  const balance = sumIncome - sumExpense;

  let runningBalance = 0;
  const withBalance = filtered.map(e => {
    runningBalance += parseFloat(e.income || "0") - parseFloat(e.expense || "0");
    return { ...e, runningBalance };
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/cash-book/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Buchung gelöscht" });
      queryClient.invalidateQueries({ queryKey: ["/api/cash-book"] });
      setDeleteId(null);
      if (selectedEntry?.id === deleteId) setSelectedEntry(null);
    },
  });

  const getAccountName = (code: string) => cashAccountOptions.find(a => a.code === code)?.name || code;
  const currentMonthLabel = months.find(m => m.value === String(selectedMonth))?.label || "";

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Kassenbuch</h1>
          <p className="text-muted-foreground text-sm">Verwaltung der Bargeldbuchungen</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <ArrowUpCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold">Einnahmen</p>
                <p className="text-lg font-bold text-green-600" data-testid="text-total-income">{fmtCurrency(sumIncome)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <ArrowDownCircle className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold">Ausgaben</p>
                <p className="text-lg font-bold text-red-600" data-testid="text-total-expense">{fmtCurrency(sumExpense)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold">Kassenbestand</p>
                <p className={`text-lg font-bold ${balance >= 0 ? "text-blue-600" : "text-red-600"}`} data-testid="text-balance">{fmtCurrency(balance)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-gray-600" />
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold">Buchungen</p>
                <p className="text-lg font-bold" data-testid="text-entry-count">{filtered.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(parseInt(v))}>
          <SelectTrigger className="w-[140px]" data-testid="select-month"><SelectValue /></SelectTrigger>
          <SelectContent>
            {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(parseInt(v))}>
          <SelectTrigger className="w-[100px]" data-testid="select-year"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-account-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Alle">Alle Kassen</SelectItem>
            {cashAccountOptions.map(a => <SelectItem key={a.code} value={a.code}>{a.name} ({a.code})</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button onClick={() => { setEditEntry(undefined); setShowForm(true); }} data-testid="button-new-entry">
          <Plus className="mr-2 h-4 w-4" /> Neue Buchung
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Lfd.</TableHead>
                  <TableHead className="w-[100px]">Datum</TableHead>
                  <TableHead className="w-[100px]">Beleg-Nr.</TableHead>
                  <TableHead>Betreff</TableHead>
                  <TableHead className="w-[70px]">Konto</TableHead>
                  <TableHead className="w-[70px]">Gegenk.</TableHead>
                  <TableHead className="w-[110px] text-right">Einnahme</TableHead>
                  <TableHead className="w-[110px] text-right">Ausgabe</TableHead>
                  <TableHead className="w-[110px] text-right">Saldo</TableHead>
                  <TableHead className="w-[50px]">St.</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {withBalance.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                      Keine Buchungen für {currentMonthLabel} {selectedYear}
                    </TableCell>
                  </TableRow>
                ) : (
                  withBalance.map((e) => {
                    const inc = parseFloat(e.income || "0");
                    const exp = parseFloat(e.expense || "0");
                    return (
                      <TableRow
                        key={e.id}
                        className={`cursor-pointer ${selectedEntry?.id === e.id ? "bg-blue-50 dark:bg-blue-950" : ""}`}
                        onClick={() => setSelectedEntry(e as any)}
                        data-testid={`row-entry-${e.id}`}
                      >
                        <TableCell className="text-muted-foreground font-medium">{e.lfdNr}</TableCell>
                        <TableCell className="whitespace-nowrap">{fmtDate(e.date)}</TableCell>
                        <TableCell className="font-semibold">{e.receiptNumber}</TableCell>
                        <TableCell>{e.subject}</TableCell>
                        <TableCell className="font-mono text-xs">{e.cashAccount}</TableCell>
                        <TableCell className="font-mono text-xs">{e.contraAccount || "—"}</TableCell>
                        <TableCell className={`text-right font-semibold ${inc > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                          {inc > 0 ? fmtCurrency(inc) : "—"}
                        </TableCell>
                        <TableCell className={`text-right font-semibold ${exp > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                          {exp > 0 ? fmtCurrency(exp) : "—"}
                        </TableCell>
                        <TableCell className={`text-right font-bold ${e.runningBalance >= 0 ? "text-blue-600" : "text-red-600"}`}>
                          {fmtCurrency(e.runningBalance)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {e.taxRate && e.taxRate !== "none" ? `${e.taxRate}%` : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              onClick={(ev) => { ev.stopPropagation(); setEditEntry(e); setShowForm(true); }}
                              data-testid={`button-edit-entry-${e.id}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700"
                              onClick={(ev) => { ev.stopPropagation(); setDeleteId(e.id); }}
                              data-testid={`button-delete-entry-${e.id}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              {withBalance.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 bg-muted/50">
                    <td colSpan={6} className="px-4 py-2 font-bold text-sm">Summen / Kassenbestand</td>
                    <td className="px-4 py-2 text-right font-bold text-green-600 text-sm">{fmtCurrency(sumIncome)}</td>
                    <td className="px-4 py-2 text-right font-bold text-red-600 text-sm">{fmtCurrency(sumExpense)}</td>
                    <td className={`px-4 py-2 text-right font-extrabold text-sm ${balance >= 0 ? "text-blue-600" : "text-red-600"}`}>{fmtCurrency(balance)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </Table>
          </CardContent>
        </Card>
      )}

      {selectedEntry && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm">{selectedEntry.receiptNumber} — {selectedEntry.subject}</h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedEntry(null)} data-testid="button-close-detail">✕</Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {[
                ["Lfd. Nr.", selectedEntry.lfdNr],
                ["Datum", fmtDate(selectedEntry.date)],
                ["Beleg-Nr.", selectedEntry.receiptNumber],
                ["Kassenkonto", `${getAccountName(selectedEntry.cashAccount)} (${selectedEntry.cashAccount})`],
                ["Gegenkonto", selectedEntry.contraAccount || "—"],
                ["Einnahme", parseFloat(selectedEntry.income || "0") > 0 ? fmtCurrency(selectedEntry.income) : "—"],
                ["Ausgabe", parseFloat(selectedEntry.expense || "0") > 0 ? fmtCurrency(selectedEntry.expense) : "—"],
                ["MwSt.", selectedEntry.taxRate && selectedEntry.taxRate !== "none" ? `${selectedEntry.taxRate} %` : "ohne"],
                ["Bemerkung", selectedEntry.notes || "—"],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <p className="text-xs text-muted-foreground uppercase font-semibold">{label}</p>
                  <p className="font-medium">{value}</p>
                </div>
              ))}
              {selectedEntry.address && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Adresse</p>
                  <p className="font-medium"><a className="hover:text-primary hover:underline cursor-pointer" onClick={() => window.location.href = `/adressen?search=${encodeURIComponent(String(selectedEntry.address))}`}>{selectedEntry.address}</a></p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {showForm && (
        <EntryFormDialog
          entry={editEntry}
          open={showForm}
          onOpenChange={setShowForm}
          onSaved={() => {}}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
        />
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buchung löschen?</AlertDialogTitle>
            <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} data-testid="button-confirm-delete">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
