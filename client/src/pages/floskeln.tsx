import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Phrase } from "@shared/schema";
import { phraseTypes, phraseDocumentTypes } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Copy, Loader2, X, FileText } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const typeBadgeColors: Record<string, string> = {
  Vortext: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Nachtext: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

const docTypeBadgeColors: Record<string, string> = {
  Angebot: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  "Auftragsbestätigung": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  Rechnung: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  Mahnung: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  Wartung: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  Bestellung: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
  Allgemein: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

function PhraseFormDialog({ phrase, open, onOpenChange, onSaved }: {
  phrase?: Phrase;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!phrase;

  const [form, setForm] = useState({
    number: phrase?.number || "",
    name: phrase?.name || "",
    type: phrase?.type || "Vortext",
    documentType: phrase?.documentType || "Allgemein",
    text: phrase?.text || "",
    sortOrder: phrase?.sortOrder ?? 0,
    active: phrase?.active ?? true,
  });

  useEffect(() => {
    if (open && !isEdit) {
      fetch("/api/phrases/next-number", { credentials: "include" })
        .then(r => r.json())
        .then(d => setForm(f => ({ ...f, number: d.number })));
    }
  }, [open, isEdit]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        await apiRequest("PATCH", `/api/phrases/${phrase.id}`, form);
      } else {
        await apiRequest("POST", "/api/phrases", form);
      }
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Floskel aktualisiert" : "Floskel erstellt" });
      queryClient.invalidateQueries({ queryKey: ["/api/phrases"] });
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
          <DialogTitle data-testid="dialog-title-phrase">
            {isEdit ? "Floskel bearbeiten" : "Neue Floskel"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Nummer</Label>
              <Input data-testid="input-phrase-number" value={form.number} onChange={e => update("number", e.target.value)} />
            </div>
            <div>
              <Label>Sortierung</Label>
              <Input data-testid="input-phrase-sort" type="number" value={form.sortOrder} onChange={e => update("sortOrder", parseInt(e.target.value) || 0)} />
            </div>
          </div>
          <div>
            <Label>Bezeichnung</Label>
            <Input data-testid="input-phrase-name" value={form.name} onChange={e => update("name", e.target.value)} placeholder="z.B. Angebot Vortext Standard" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Typ</Label>
              <Select value={form.type} onValueChange={v => update("type", v)}>
                <SelectTrigger data-testid="select-phrase-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {phraseTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Dokumenttyp</Label>
              <Select value={form.documentType || "Allgemein"} onValueChange={v => update("documentType", v)}>
                <SelectTrigger data-testid="select-phrase-doctype"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {phraseDocumentTypes.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Text</Label>
            <Textarea
              data-testid="input-phrase-text"
              value={form.text}
              onChange={e => update("text", e.target.value)}
              placeholder="Textbaustein eingeben..."
              className="min-h-[120px]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-phrase">Abbrechen</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.name || !form.text} data-testid="button-save-phrase">
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Speichern" : "Erstellen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function FloskelnPage() {
  const [typeFilter, setTypeFilter] = useState("Alle");
  const [docTypeFilter, setDocTypeFilter] = useState("Alle");
  const [selectedPhrase, setSelectedPhrase] = useState<Phrase | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editPhrase, setEditPhrase] = useState<Phrase | undefined>();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { toast } = useToast();

  const { data: allPhrases = [], isLoading } = useQuery<Phrase[]>({
    queryKey: ["/api/phrases"],
  });

  const filtered = allPhrases.filter(p =>
    (typeFilter === "Alle" || p.type === typeFilter) &&
    (docTypeFilter === "Alle" || p.documentType === docTypeFilter)
  );

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/phrases/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Floskel gelöscht" });
      queryClient.invalidateQueries({ queryKey: ["/api/phrases"] });
      setDeleteId(null);
      if (selectedPhrase?.id === deleteId) setSelectedPhrase(null);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (phrase: Phrase) => {
      const nextNum = await fetch("/api/phrases/next-number", { credentials: "include" }).then(r => r.json());
      await apiRequest("POST", "/api/phrases", {
        number: nextNum.number,
        name: `${phrase.name} (Kopie)`,
        type: phrase.type,
        documentType: phrase.documentType,
        text: phrase.text,
        sortOrder: phrase.sortOrder,
        active: phrase.active,
      });
    },
    onSuccess: () => {
      toast({ title: "Floskel dupliziert" });
      queryClient.invalidateQueries({ queryKey: ["/api/phrases"] });
    },
  });

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Floskeln / Textbausteine</h1>
          <p className="text-muted-foreground text-sm">Vor- und Nachtexte für Dokumente verwalten</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {["Alle", ...phraseTypes].map(t => (
            <Button
              key={t}
              variant={typeFilter === t ? "default" : "outline"}
              size="sm"
              onClick={() => setTypeFilter(t)}
              data-testid={`button-filter-type-${t}`}
            >
              {t}
            </Button>
          ))}
        </div>
        <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-doctype-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Alle">Alle Dokumenttypen</SelectItem>
            {phraseDocumentTypes.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button onClick={() => { setEditPhrase(undefined); setShowForm(true); }} data-testid="button-new-phrase">
          <Plus className="mr-2 h-4 w-4" /> Neue Floskel
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : (
        <div className="flex gap-4 min-w-0">
          <div className="flex-1 min-w-0 space-y-2">
            {filtered.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  Keine Floskeln gefunden
                </CardContent>
              </Card>
            ) : (
              filtered.map(p => (
                <Card
                  key={p.id}
                  className={`cursor-pointer transition-colors hover:border-primary/50 ${selectedPhrase?.id === p.id ? "border-primary bg-primary/5" : ""}`}
                  onClick={() => setSelectedPhrase(p)}
                  data-testid={`card-phrase-${p.id}`}
                >
                  <CardContent className="py-3 px-4 overflow-hidden">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-xs text-muted-foreground">{p.number}</span>
                      <Badge className={typeBadgeColors[p.type] || ""} variant="secondary">{p.type}</Badge>
                      {p.documentType && (
                        <Badge className={docTypeBadgeColors[p.documentType] || ""} variant="secondary">{p.documentType}</Badge>
                      )}
                    </div>
                    <p className="font-medium text-sm break-words">{p.name}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 break-words">{p.text}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {selectedPhrase && (
            <Card className="w-[400px] flex-shrink-0 self-start sticky top-4 overflow-hidden">
              <CardContent className="pt-4 overflow-hidden">
                <div className="flex items-center gap-2 mb-3">
                  <span className="font-bold text-sm">{selectedPhrase.number}</span>
                  <Badge className={typeBadgeColors[selectedPhrase.type] || ""} variant="secondary">{selectedPhrase.type}</Badge>
                  {selectedPhrase.documentType && (
                    <Badge className={docTypeBadgeColors[selectedPhrase.documentType] || ""} variant="secondary">{selectedPhrase.documentType}</Badge>
                  )}
                  <div className="flex-1" />
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedPhrase(null)} data-testid="button-close-detail">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">Bezeichnung</Label>
                    <p className="text-sm font-medium bg-muted/50 px-3 py-2 rounded break-words" data-testid="text-phrase-name">{selectedPhrase.name}</p>
                  </div>
                  <div>
                    <Label className="text-xs uppercase text-muted-foreground">Text</Label>
                    <p className="text-sm bg-muted/50 px-3 py-2 rounded whitespace-pre-wrap break-words leading-relaxed" data-testid="text-phrase-content">{selectedPhrase.text}</p>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" size="sm"
                    onClick={() => { setEditPhrase(selectedPhrase); setShowForm(true); }}
                    data-testid="button-edit-phrase">
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Bearbeiten
                  </Button>
                  <Button variant="outline" size="sm"
                    onClick={() => duplicateMutation.mutate(selectedPhrase)}
                    disabled={duplicateMutation.isPending}
                    data-testid="button-duplicate-phrase">
                    <Copy className="mr-1 h-3.5 w-3.5" /> Duplizieren
                  </Button>
                  <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700"
                    onClick={() => setDeleteId(selectedPhrase.id)}
                    data-testid="button-delete-phrase">
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Löschen
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {showForm && (
        <PhraseFormDialog
          phrase={editPhrase}
          open={showForm}
          onOpenChange={setShowForm}
          onSaved={() => {}}
        />
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Floskel löschen?</AlertDialogTitle>
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
