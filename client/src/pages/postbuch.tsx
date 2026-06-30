import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fmtDocNumber } from "@/lib/format";
import type { MailLogEntry } from "@shared/schema";
import { mailDirections, sendMethods } from "@shared/schema";
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
import { Plus, Pencil, Trash2, Loader2, Mail, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const dirBadge: Record<string, string> = {
  Eingang: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Ausgang: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
};

function MailLogFormDialog({ entry, open, onOpenChange, onSaved }: {
  entry?: MailLogEntry;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!entry;
  const today = new Date().toISOString().split("T")[0];

  const [form, setForm] = useState({
    date: entry?.date || today,
    direction: entry?.direction || "Ausgang",
    recipientSender: entry?.recipientSender || "",
    subject: entry?.subject || "",
    documentType: entry?.documentType || "",
    documentNumber: entry?.documentNumber || "",
    sendMethod: entry?.sendMethod || "E-Mail",
    assignedToName: entry?.assignedToName || "",
    followUpDate: entry?.followUpDate || "",
    notes: entry?.notes || "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const body = { ...form, followUpDate: form.followUpDate || null };
      if (isEdit) {
        await apiRequest("PATCH", `/api/mail-log/${entry.id}`, body);
      } else {
        await apiRequest("POST", "/api/mail-log", body);
      }
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Eintrag aktualisiert" : "Eintrag erstellt" });
      queryClient.invalidateQueries({ queryKey: ["/api/mail-log"] });
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
          <DialogTitle data-testid="dialog-title-maillog">
            {isEdit ? "Postbuch-Eintrag bearbeiten" : "Neuer Postbuch-Eintrag"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Datum</Label>
              <Input data-testid="input-date" type="date" value={form.date} onChange={e => update("date", e.target.value)} />
            </div>
            <div>
              <Label>Richtung</Label>
              <Select value={form.direction} onValueChange={v => update("direction", v)}>
                <SelectTrigger data-testid="select-direction"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {mailDirections.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Versandart</Label>
              <Select value={form.sendMethod || "E-Mail"} onValueChange={v => update("sendMethod", v)}>
                <SelectTrigger data-testid="select-send-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sendMethods.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Empfänger / Absender</Label>
            <Input data-testid="input-recipient" value={form.recipientSender} onChange={e => update("recipientSender", e.target.value)} placeholder="Name" />
          </div>
          <div>
            <Label>Betreff</Label>
            <Input data-testid="input-subject" value={form.subject} onChange={e => update("subject", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Dokumenttyp</Label>
              <Input data-testid="input-doc-type" value={form.documentType || ""} onChange={e => update("documentType", e.target.value)} placeholder="z.B. Angebot, Rechnung" />
            </div>
            <div>
              <Label>Dokument-Nr.</Label>
              <Input data-testid="input-doc-number" value={form.documentNumber || ""} onChange={e => update("documentNumber", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Mitarbeiter</Label>
              <Input data-testid="input-assigned" value={form.assignedToName} onChange={e => update("assignedToName", e.target.value)} />
            </div>
            <div>
              <Label>Wiedervorlage</Label>
              <Input data-testid="input-followup-date" type="date" value={form.followUpDate || ""} onChange={e => update("followUpDate", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Bemerkungen</Label>
            <Textarea data-testid="input-notes" value={form.notes || ""} onChange={e => update("notes", e.target.value)} className="min-h-[60px]" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel">Abbrechen</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.subject || !form.recipientSender} data-testid="button-save-maillog">
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Speichern" : "Erstellen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PostbuchPage() {
  const [dirFilter, setDirFilter] = useState("Alle");
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<MailLogEntry | undefined>();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { toast } = useToast();

  const { data: entries = [], isLoading } = useQuery<MailLogEntry[]>({
    queryKey: ["/api/mail-log"],
  });

  const filtered = dirFilter === "Alle" ? entries : entries.filter(e => e.direction === dirFilter);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/mail-log/${id}`); },
    onSuccess: () => {
      toast({ title: "Eintrag gelöscht" });
      queryClient.invalidateQueries({ queryKey: ["/api/mail-log"] });
      setDeleteId(null);
    },
  });

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Postbuch</h1>
          <p className="text-muted-foreground text-sm">Dokumentation der Ein- und Ausgangspost</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Gesamt", value: entries.length, icon: Mail, color: "text-gray-600" },
          { label: "Eingang", value: entries.filter(e => e.direction === "Eingang").length, icon: ArrowDownLeft, color: "text-blue-600" },
          { label: "Ausgang", value: entries.filter(e => e.direction === "Ausgang").length, icon: ArrowUpRight, color: "text-pink-600" },
        ].map(k => (
          <Card key={k.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2">
                <k.icon className={`h-5 w-5 ${k.color}`} />
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold">{k.label}</p>
                  <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {["Alle", "Eingang", "Ausgang"].map(d => (
            <Button
              key={d}
              variant={dirFilter === d ? "default" : "outline"}
              size="sm"
              onClick={() => setDirFilter(d)}
              data-testid={`button-filter-${d}`}
            >
              {d}
            </Button>
          ))}
        </div>
        <div className="flex-1" />
        <Button onClick={() => { setEditEntry(undefined); setShowForm(true); }} data-testid="button-new-entry">
          <Plus className="mr-2 h-4 w-4" /> Neuer Eintrag
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
                  <TableHead className="w-[80px]">E/A</TableHead>
                  <TableHead>Empfänger/Absender</TableHead>
                  <TableHead>Betreff</TableHead>
                  <TableHead>Dok.-Typ</TableHead>
                  <TableHead>Dok.-Nr.</TableHead>
                  <TableHead>Versandart</TableHead>
                  <TableHead>MA</TableHead>
                  <TableHead>WV</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">Keine Einträge</TableCell>
                  </TableRow>
                ) : filtered.map(e => (
                  <TableRow key={e.id} data-testid={`row-maillog-${e.id}`}>
                    <TableCell className="whitespace-nowrap">{fmtDate(e.date)}</TableCell>
                    <TableCell><Badge className={dirBadge[e.direction] || ""} variant="secondary">{e.direction}</Badge></TableCell>
                    <TableCell className="font-medium">
                      {e.recipientSender ? (
                        <a className="hover:text-primary hover:underline cursor-pointer" onClick={() => window.location.href = `/adressen?search=${encodeURIComponent(e.recipientSender)}`}>{e.recipientSender}</a>
                      ) : "—"}
                    </TableCell>
                    <TableCell>{e.subject}</TableCell>
                    <TableCell>{e.documentType ? <Badge variant="secondary">{e.documentType}</Badge> : "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {e.documentNumber ? (
                        <a className="hover:text-primary hover:underline cursor-pointer" onClick={() => window.location.href = `/dokumente?search=${encodeURIComponent(String(e.documentNumber))}`}>{fmtDocNumber(e.documentNumber)}</a>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-xs">{e.sendMethod || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{e.assignedToName || "—"}</TableCell>
                    <TableCell>
                      {e.followUpDate ? (
                        <span className="text-xs font-medium text-yellow-600">📌 {fmtDate(e.followUpDate)}</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => { setEditEntry(e); setShowForm(true); }}
                          data-testid={`button-edit-${e.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500"
                          onClick={() => setDeleteId(e.id)}
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

      {showForm && (
        <MailLogFormDialog
          entry={editEntry}
          open={showForm}
          onOpenChange={setShowForm}
          onSaved={() => {}}
        />
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eintrag löschen?</AlertDialogTitle>
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
