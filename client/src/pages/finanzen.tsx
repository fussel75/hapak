import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fmtDate, fmtDocNumber } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Pencil, Trash2, Loader2, TrendingUp, TrendingDown, Scale, Save,
  FileText, Ruler, Search, ChevronLeft, ChevronRight, BookOpen, Percent, AlertCircle,
  Eye, ExternalLink, CreditCard, Banknote, Calendar, ArrowRight, ArrowLeftRight, Check,
} from "lucide-react";

const fmtEur = (v: number | string | null | undefined) => {
  const n = typeof v === "string" ? parseFloat(v) || 0 : (v || 0);
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " €";
};

const typeBadgeVariant = (t: string) => {
  switch (t) {
    case "RA": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "RE": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    case "KB": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
    default: return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
  }
};

const subTypeName = (st: string) => {
  const map: Record<string, string> = {
    HR: "Hauptrechnung", ZA: "Zahlung", SB: "Splitbuchung", VR: "Verrechnung",
    HG: "Hauptgutschrift", KE: "Korrektur/Einbehalt", KA: "Kasse",
  };
  return map[st] || st;
};

const statusBadge = (status: string, bezahlflag: number) => {
  if (status === "storniert") return <Badge className="bg-gray-200 text-gray-600 text-[10px]" data-testid="badge-status-storniert">Storniert</Badge>;
  if (status === "bezahlt" || bezahlflag === 2) return <Badge className="bg-green-100 text-green-800 text-[10px]" data-testid="badge-status-bezahlt">Bezahlt</Badge>;
  if (status === "teilbezahlt" || bezahlflag === 1) return <Badge className="bg-yellow-100 text-yellow-800 text-[10px]" data-testid="badge-status-teil">Teilzahlung</Badge>;
  if (status === "ueberzahlt" || bezahlflag === 3) return <Badge className="bg-orange-100 text-orange-800 text-[10px]" data-testid="badge-status-ueber">Überzahlt</Badge>;
  return <Badge className="bg-red-100 text-red-800 text-[10px]" data-testid="badge-status-offen">Offen</Badge>;
};

interface FibuBuchung {
  id: number; reId: number; idx: number; art: string; typ: string; kennung: number;
  rnr: string; adrNr: string; adrSuch: string; betreff: string;
  belegdat: string; rechdat: string; erfasstdat: string; faelligdat: string;
  zahldat: string; skontodat: string; stornodat: string;
  betrag: number; zahlung: number; netto: number; brutto: number;
  einbehalt: number; minderung: number; offen: number; gutschrift: number; kuerzung: number;
  skProzent: number; skBetrag: number; skBasis: number;
  kontoB: string; kontoG: string; kontoS: string; kontoM: string;
  kst: string; ktr: string; lfdNr: string; periode: string;
  bezahlflag: number; stornoflag: number; mahnflag: number; mahnen: boolean; auszug: string;
  documentId: number | null; status: string;
}

interface PrimanotaResponse {
  data: FibuBuchung[];
  total: number;
  summeRA: number; summeRE: number; summeOffen: number;
  limit: number; offset: number;
}

interface FibuDetail {
  hauptsatz: any;
  nebensaetze: any[];
  zahlungen: any[];
  verrechnungen: any[];
  splits: any[];
  kasse: any[];
}

type Account = {
  id: number; accountNumber: string; name: string;
  category: number; class: number; taxKey: string;
  datevKey: string; skontoAccount: string;
  isGroup: boolean; active: boolean;
};

type TaxRateType = {
  id: number; matchKey: string; name: string;
  rate: string; datevKey: string; accountNumber: string; active: boolean;
};

type Measurement = {
  id: number; documentId: number | null; documentNumber: string;
  projectNumber: string; title: string; room: string; formula: string;
  length: string; width: string; height: string; quantity: string;
  result: string; unit: string; notes: string; createdAt: string;
};

function KontenrahmenTab() {
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("alle");

  const { data: accs = [], isLoading } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });

  const classNames = ["Anlagevermögen", "Umlaufvermögen", "Eigenkapital", "Fremdkapital",
    "Betriebliche Erträge", "Betriebliche Aufwendungen", "Weitere Erträge", "Weitere Aufwendungen",
    "Finanzerträge", "Vortragskonten"];

  const filtered = accs.filter(a => {
    if (search && !a.accountNumber.includes(search) && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (classFilter !== "alle" && a.class !== parseInt(classFilter)) return false;
    return true;
  });

  const konten = filtered.filter(a => !a.isGroup);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Konto-Nr. oder Name suchen..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-account-search"
          />
        </div>
        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-[200px]" data-testid="select-account-class">
            <SelectValue placeholder="Kontenklasse" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Klassen</SelectItem>
            {classNames.map((n, i) => (
              <SelectItem key={i} value={String(i)}>{i} - {n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline" data-testid="badge-account-count">{konten.length} Konten</Badge>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="max-h-[600px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]" data-testid="th-konto-nr">Konto-Nr.</TableHead>
                    <TableHead data-testid="th-konto-name">Bezeichnung</TableHead>
                    <TableHead className="w-[80px]" data-testid="th-klasse">Klasse</TableHead>
                    <TableHead className="w-[80px]" data-testid="th-steuer">StSchl.</TableHead>
                    <TableHead className="w-[80px]" data-testid="th-datev">DATEV</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {konten.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8" data-testid="text-no-accounts">
                        Keine Konten gefunden
                      </TableCell>
                    </TableRow>
                  ) : (
                    konten.map(a => (
                      <TableRow key={a.id} data-testid={`row-account-${a.id}`}>
                        <TableCell className="font-mono font-semibold" data-testid={`text-account-nr-${a.id}`}>{a.accountNumber}</TableCell>
                        <TableCell data-testid={`text-account-name-${a.id}`}>{a.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground" data-testid={`text-account-class-${a.id}`}>{a.class}</TableCell>
                        <TableCell className="text-xs" data-testid={`text-account-tax-${a.id}`}>{a.taxKey || "—"}</TableCell>
                        <TableCell className="text-xs" data-testid={`text-account-datev-${a.id}`}>{a.datevKey || "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SteuersaetzeTab() {
  const { data: rates = [], isLoading } = useQuery<TaxRateType[]>({
    queryKey: ["/api/tax-rates"],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Badge variant="outline" data-testid="badge-tax-count">{rates.length} Steuerschlüssel</Badge>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead data-testid="th-tax-key">Kürzel</TableHead>
                  <TableHead data-testid="th-tax-name">Bezeichnung</TableHead>
                  <TableHead className="text-right" data-testid="th-tax-rate">Satz (%)</TableHead>
                  <TableHead data-testid="th-tax-datev">DATEV</TableHead>
                  <TableHead data-testid="th-tax-account">Konto</TableHead>
                  <TableHead data-testid="th-tax-active">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map(r => (
                  <TableRow key={r.id} data-testid={`row-tax-${r.id}`}>
                    <TableCell className="font-semibold" data-testid={`text-tax-key-${r.id}`}>{r.matchKey}</TableCell>
                    <TableCell data-testid={`text-tax-name-${r.id}`}>{r.name}</TableCell>
                    <TableCell className="text-right font-mono" data-testid={`text-tax-rate-${r.id}`}>
                      {new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2 }).format(parseFloat(r.rate) || 0)} %
                    </TableCell>
                    <TableCell className="text-xs" data-testid={`text-tax-datev-${r.id}`}>{r.datevKey || "—"}</TableCell>
                    <TableCell className="font-mono text-xs" data-testid={`text-tax-account-${r.id}`}>{r.accountNumber || "—"}</TableCell>
                    <TableCell data-testid={`badge-tax-active-${r.id}`}>
                      <Badge variant={r.active ? "default" : "secondary"}>{r.active ? "Aktiv" : "Inaktiv"}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FibuDetailDialog({ reId, open, onOpenChange }: {
  reId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showPayment, setShowPayment] = useState(false);
  const [payForm, setPayForm] = useState({ betrag: "", skontoBetrag: "0", bankkonto: "1800", zahldat: new Date().toISOString().split("T")[0] });
  const [deletePaymentId, setDeletePaymentId] = useState<number | null>(null);
  const [editPayment, setEditPayment] = useState<{ id: number; betrag: string; zahldat: string; bankkonto: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [showVerrechnung, setShowVerrechnung] = useState(false);
  const [verrForm, setVerrForm] = useState({ gegenReId: 0, betrag: "", verrechnungskonto: "" });
  const [selectedVerrRng, setSelectedVerrRng] = useState<any>(null);

  const { data: detail, isLoading, isError, error } = useQuery<FibuDetail>({
    queryKey: ["/api/fibu", reId, "details"],
    queryFn: async () => {
      const res = await fetch(`/api/fibu/${reId}/details`, { credentials: "include" });
      if (!res.ok) throw new Error("Fehler beim Laden der Buchungsdetails");
      return res.json();
    },
    enabled: open && reId > 0,
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      const parseDe = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
      await apiRequest("POST", `/api/fibu/${reId}/payment`, {
        betrag: parseDe(payForm.betrag),
        skontoBetrag: parseDe(payForm.skontoBetrag),
        bankkonto: payForm.bankkonto,
        zahldat: payForm.zahldat,
      });
    },
    onSuccess: () => {
      toast({ title: "Zahlung gebucht" });
      queryClient.invalidateQueries({ queryKey: ["/api/fibu/primanota"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fibu", reId, "details"] });
      setShowPayment(false);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const deletePayMutation = useMutation({
    mutationFn: async (paymentId: number) => {
      await apiRequest("DELETE", `/api/fibu/${reId}/payment/${paymentId}`);
    },
    onSuccess: () => {
      toast({ title: "Zahlung gelöscht" });
      queryClient.invalidateQueries({ queryKey: ["/api/fibu/primanota"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fibu", reId, "details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/offene-posten"] });
      setDeletePaymentId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const { data: verrechnbare } = useQuery<any>({
    queryKey: ["/api/fibu", reId, "verrechnbare"],
    queryFn: async () => {
      const res = await fetch(`/api/fibu/${reId}/verrechnbare`, { credentials: "include" });
      if (!res.ok) return { candidates: [] };
      return res.json();
    },
    enabled: open && reId > 0 && showVerrechnung,
  });

  const verrechnungMutation = useMutation({
    mutationFn: async () => {
      const pde = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
      await apiRequest("POST", `/api/fibu/${reId}/verrechnung`, {
        gegenReId: verrForm.gegenReId,
        betrag: verrForm.betrag ? pde(verrForm.betrag) : undefined,
        verrechnungskonto: verrForm.verrechnungskonto || undefined,
      });
    },
    onSuccess: () => {
      toast({ title: "Verrechnung gebucht" });
      queryClient.invalidateQueries({ queryKey: ["/api/fibu/primanota"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fibu", reId, "details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/offene-posten"] });
      setShowVerrechnung(false);
      setVerrForm({ gegenReId: 0, betrag: "", verrechnungskonto: "" });
      setSelectedVerrRng(null);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const parseDeNum = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;

  const editPayMutation = useMutation({
    mutationFn: async (data: { id: number; betrag: string; zahldat: string; bankkonto: string }) => {
      await apiRequest("PATCH", `/api/fibu/${reId}/payment/${data.id}`, {
        betrag: parseDeNum(data.betrag),
        zahldat: data.zahldat,
        bankkonto: data.bankkonto,
      });
    },
    onSuccess: () => {
      toast({ title: "Zahlung aktualisiert" });
      queryClient.invalidateQueries({ queryKey: ["/api/fibu/primanota"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fibu", reId, "details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/offene-posten"] });
      setEditPayment(null);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const editBuchungMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      await apiRequest("PATCH", `/api/fibu/${reId}`, data);
    },
    onSuccess: () => {
      toast({ title: "Buchung aktualisiert" });
      queryClient.invalidateQueries({ queryKey: ["/api/fibu/primanota"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fibu", reId, "details"] });
      queryClient.invalidateQueries({ queryKey: ["/api/offene-posten"] });
      setEditing(false);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const fmtDe = (n: number) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const startEditing = () => {
    if (!h) return;
    setEditForm({
      betreff: h.betreff || "",
      netto: fmtDe(h.netto || 0),
      brutto: fmtDe(h.brutto || 0),
      belegdat: h.belegdat ? new Date(h.belegdat).toISOString().split("T")[0] : "",
      faelligdat: h.faelligdat ? new Date(h.faelligdat).toISOString().split("T")[0] : "",
      skontodat: h.skontodat ? new Date(h.skontodat).toISOString().split("T")[0] : "",
      skProzent: String(h.skProzent || 0).replace(".", ","),
      skBetrag: fmtDe(h.skBetrag || 0),
      kontoB: h.kontoB || "",
      kontoG: h.kontoG || "",
      kontoS: h.kontoS || "",
      einbehalt: fmtDe(h.einbehalt || 0),
      minderung: fmtDe(h.minderung || 0),
      adrSuch: h.adrSuch || "",
      ktr: h.ktr || "",
    });
    setEditing(true);
  };

  const saveEditing = () => {
    if (!h) return;
    const pde = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
    const changes: Record<string, any> = {};
    if (editForm.betreff !== (h.betreff || "")) changes.betreff = editForm.betreff;
    if (pde(editForm.netto) !== h.netto) changes.netto = pde(editForm.netto);
    if (pde(editForm.brutto) !== h.brutto) changes.brutto = pde(editForm.brutto);
    if (editForm.belegdat !== (h.belegdat ? new Date(h.belegdat).toISOString().split("T")[0] : "")) changes.belegdat = editForm.belegdat || null;
    if (editForm.faelligdat !== (h.faelligdat ? new Date(h.faelligdat).toISOString().split("T")[0] : "")) changes.faelligdat = editForm.faelligdat || null;
    if (editForm.skontodat !== (h.skontodat ? new Date(h.skontodat).toISOString().split("T")[0] : "")) changes.skontodat = editForm.skontodat || null;
    if (pde(editForm.skProzent) !== (h.skProzent || 0)) changes.skProzent = pde(editForm.skProzent);
    if (pde(editForm.skBetrag) !== (h.skBetrag || 0)) changes.skBetrag = pde(editForm.skBetrag);
    if (editForm.kontoB !== (h.kontoB || "")) changes.kontoB = editForm.kontoB;
    if (editForm.kontoG !== (h.kontoG || "")) changes.kontoG = editForm.kontoG;
    if (editForm.kontoS !== (h.kontoS || "")) changes.kontoS = editForm.kontoS;
    if (pde(editForm.einbehalt) !== (h.einbehalt || 0)) changes.einbehalt = pde(editForm.einbehalt);
    if (pde(editForm.minderung) !== (h.minderung || 0)) changes.minderung = pde(editForm.minderung);
    if (editForm.ktr !== (h.ktr || "")) changes.ktr = editForm.ktr;
    if (Object.keys(changes).length === 0) { setEditing(false); return; }
    editBuchungMutation.mutate(changes);
  };

  const h = detail?.hauptsatz;

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[750px]">
          <div className="space-y-3 p-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}</div>
        </DialogContent>
      </Dialog>
    );
  }

  if (isError || (!detail?.hauptsatz && !isLoading)) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Fehler</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground" data-testid="text-detail-error">
            {isError ? (error as Error)?.message || "Buchungsdetails konnten nicht geladen werden." : "Keine Daten gefunden."}
          </p>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Schließen</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!h) return null;

  const canPay = h.bezahlflag !== 2 && h.bezahlflag !== 3 && h.stornoflag !== 2;
  const isRA = h.art === "RA";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3" data-testid="dialog-title-fibu-detail">
            <Badge className={typeBadgeVariant(h.art)}>{h.art}</Badge>
            <span>{fmtDocNumber(h.rnr)}</span>
            <span className="text-sm font-normal text-muted-foreground">({subTypeName(h.typ)})</span>
            {statusBadge(
              h.stornoflag === 2 ? "storniert" : h.bezahlflag === 2 ? "bezahlt" : h.bezahlflag === 1 ? "teilbezahlt" : "offen",
              h.bezahlflag
            )}
            <div className="ml-auto flex items-center gap-1">
              {editing ? (
                <>
                  <Button variant="default" size="sm" onClick={saveEditing} disabled={editBuchungMutation.isPending} data-testid="button-save-buchung">
                    <Save className="h-3 w-3 mr-1" />{editBuchungMutation.isPending ? "Speichert..." : "Speichern"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditing(false)} data-testid="button-cancel-edit-buchung">
                    Abbrechen
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={startEditing} data-testid="button-edit-buchung">
                  <Pencil className="h-3 w-3 mr-1" />Bearbeiten
                </Button>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            <div>
              <Label className="text-xs text-muted-foreground">Adresse</Label>
              {editing ? (
                <Input className="h-7 text-sm" value={editForm.adrSuch} onChange={e => setEditForm(f => ({...f, adrSuch: e.target.value}))} data-testid="input-edit-adrsuch" />
              ) : (
                <p className="font-medium" data-testid="text-detail-address">{h.adrSuch || "—"} {h.adrNr ? `(${h.adrNr})` : ""}</p>
              )}
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">Betreff</Label>
              {editing ? (
                <Input className="h-7 text-sm" value={editForm.betreff} onChange={e => setEditForm(f => ({...f, betreff: e.target.value}))} data-testid="input-edit-betreff" />
              ) : (
                <p className="font-medium" data-testid="text-detail-subject">{h.betreff || "—"}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <Label className="text-xs text-muted-foreground">Belegdatum</Label>
              {editing ? (
                <Input type="date" className="h-7 text-sm" value={editForm.belegdat} onChange={e => setEditForm(f => ({...f, belegdat: e.target.value}))} data-testid="input-edit-belegdat" />
              ) : (
                <p data-testid="text-detail-belegdat">{fmtDate(h.belegdat) || "—"}</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Fälligkeitsdatum</Label>
              {editing ? (
                <Input type="date" className="h-7 text-sm" value={editForm.faelligdat} onChange={e => setEditForm(f => ({...f, faelligdat: e.target.value}))} data-testid="input-edit-faelligdat" />
              ) : (
                <p data-testid="text-detail-faelligdat" className={h.faelligdat && new Date(h.faelligdat) < new Date() && h.bezahlflag !== 2 ? "text-red-600 font-semibold" : ""}>
                  {fmtDate(h.faelligdat) || "—"}
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Zahldatum</Label>
              <p data-testid="text-detail-zahldat">{fmtDate(h.zahldat) || "—"}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Skontodatum</Label>
              {editing ? (
                <Input type="date" className="h-7 text-sm" value={editForm.skontodat} onChange={e => setEditForm(f => ({...f, skontodat: e.target.value}))} data-testid="input-edit-skontodat" />
              ) : (
                <p data-testid="text-detail-skontodat">{fmtDate(h.skontodat) || "—"}</p>
              )}
            </div>
          </div>

          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">Netto</Label>
                  {editing ? (
                    <Input type="text" inputMode="decimal" className="h-7 text-sm font-mono text-right" value={editForm.netto} onChange={e => setEditForm(f => ({...f, netto: e.target.value}))} data-testid="input-edit-netto" />
                  ) : (
                    <p className="font-mono font-semibold" data-testid="text-detail-netto">{fmtEur(h.netto)}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Brutto</Label>
                  {editing ? (
                    <Input type="text" inputMode="decimal" className="h-7 text-sm font-mono text-right" value={editForm.brutto} onChange={e => setEditForm(f => ({...f, brutto: e.target.value}))} data-testid="input-edit-brutto" />
                  ) : (
                    <p className="font-mono font-semibold" data-testid="text-detail-brutto">{fmtEur(h.brutto)}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Bezahlt</Label>
                  <p className="font-mono font-semibold text-green-600" data-testid="text-detail-zahlung">{fmtEur(h.zahlung)}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Offen</Label>
                  <p className={`font-mono font-semibold ${h.offen > 0.01 ? "text-red-600" : ""}`} data-testid="text-detail-offen">{fmtEur(h.offen)}</p>
                </div>
              </div>
              {editing ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-3 pt-3 border-t border-gray-100">
                  <div>
                    <Label className="text-xs text-muted-foreground">Skonto %</Label>
                    <Input type="text" inputMode="decimal" className="h-7 text-sm font-mono text-right" value={editForm.skProzent} onChange={e => setEditForm(f => ({...f, skProzent: e.target.value}))} data-testid="input-edit-skprozent" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Skontobetrag</Label>
                    <Input type="text" inputMode="decimal" className="h-7 text-sm font-mono text-right" value={editForm.skBetrag} onChange={e => setEditForm(f => ({...f, skBetrag: e.target.value}))} data-testid="input-edit-skbetrag" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Einbehalt</Label>
                    <Input type="text" inputMode="decimal" className="h-7 text-sm font-mono text-right" value={editForm.einbehalt} onChange={e => setEditForm(f => ({...f, einbehalt: e.target.value}))} data-testid="input-edit-einbehalt" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Minderung</Label>
                    <Input type="text" inputMode="decimal" className="h-7 text-sm font-mono text-right" value={editForm.minderung} onChange={e => setEditForm(f => ({...f, minderung: e.target.value}))} data-testid="input-edit-minderung" />
                  </div>
                </div>
              ) : (() => {
                const verrechnetSum = detail?.verrechnungen?.reduce((s: number, v: any) => s + Math.abs(v.betrag || v.zahlung || 0), 0) || 0;
                const ueberwiesen = h.zahlung - (detail?.verrechnungen?.reduce((s: number, v: any) => s + Math.abs(v.zahlung || 0), 0) || 0);
                const hasExtras = h.skBetrag !== 0 || h.einbehalt > 0 || h.minderung > 0 || h.gutschrift !== 0 || h.kuerzung > 0 || verrechnetSum > 0;
                return hasExtras ? (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm mt-3 pt-3 border-t border-gray-100">
                    {h.skBetrag !== 0 && <div><Label className="text-xs text-muted-foreground">Skonto ({h.skProzent}%)</Label><p className="font-mono text-blue-600">{fmtEur(h.skBetrag)}</p></div>}
                    {h.einbehalt > 0 && <div><Label className="text-xs text-muted-foreground">Einbehalt</Label><p className="font-mono">{fmtEur(h.einbehalt)}</p></div>}
                    {h.minderung > 0 && <div><Label className="text-xs text-muted-foreground">Minderung</Label><p className="font-mono">{fmtEur(h.minderung)}</p></div>}
                    {h.gutschrift !== 0 && <div><Label className="text-xs text-muted-foreground">Gutschrift</Label><p className="font-mono text-orange-600">{fmtEur(h.gutschrift)}</p></div>}
                    {h.kuerzung > 0 && <div><Label className="text-xs text-muted-foreground">Kürzung</Label><p className="font-mono">{fmtEur(h.kuerzung)}</p></div>}
                    {verrechnetSum > 0 && <div><Label className="text-xs text-muted-foreground">Verrechnet</Label><p className="font-mono text-orange-600" data-testid="text-detail-verrechnet">{fmtEur(verrechnetSum)}</p></div>}
                    {h.zahlung > 0 && verrechnetSum > 0 && ueberwiesen > 0.01 && <div><Label className="text-xs text-muted-foreground">Überwiesen</Label><p className="font-mono text-green-600" data-testid="text-detail-ueberwiesen">{fmtEur(ueberwiesen)}</p></div>}
                  </div>
                ) : null;
              })()}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <Label className="text-xs text-muted-foreground">Konto Soll (B)</Label>
              {editing ? (
                <Input className="h-7 text-sm font-mono" value={editForm.kontoB} onChange={e => setEditForm(f => ({...f, kontoB: e.target.value}))} data-testid="input-edit-kontob" />
              ) : (
                <p className="font-mono" data-testid="text-detail-kontob">{h.kontoB || "—"}</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Konto Haben (G)</Label>
              {editing ? (
                <Input className="h-7 text-sm font-mono" value={editForm.kontoG} onChange={e => setEditForm(f => ({...f, kontoG: e.target.value}))} data-testid="input-edit-kontog" />
              ) : (
                <p className="font-mono" data-testid="text-detail-kontog">{h.kontoG || "—"}</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Skontokonto (S)</Label>
              {editing ? (
                <Input className="h-7 text-sm font-mono" value={editForm.kontoS} onChange={e => setEditForm(f => ({...f, kontoS: e.target.value}))} data-testid="input-edit-kontos" />
              ) : (
                <p className="font-mono" data-testid="text-detail-kontos">{h.kontoS || "—"}</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Projekt/KTR</Label>
              {editing ? (
                <Input className="h-7 text-sm font-mono" value={editForm.ktr} onChange={e => setEditForm(f => ({...f, ktr: e.target.value}))} data-testid="input-edit-ktr" />
              ) : (
                <p className="font-mono" data-testid="text-detail-ktr">
                  {h.ktr ? (
                    <button className="text-blue-600 hover:underline" onClick={() => { onOpenChange(false); navigate(`/projekte`); }}>
                      {h.ktr}
                    </button>
                  ) : "—"}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <Label className="text-xs text-muted-foreground">Lfd-Nr.</Label>
              <p className="font-mono text-xs">{h.lfdNr || "—"}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Periode</Label>
              <p className="font-mono text-xs">{h.periode || "—"}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Kennung</Label>
              <p className="font-mono text-xs">{h.kennung || "—"}</p>
            </div>
          </div>

          {detail && detail.zahlungen.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-green-600" />
                  Zahlungen ({detail.zahlungen.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Datum</TableHead>
                      <TableHead className="text-xs">Typ</TableHead>
                      <TableHead className="text-right text-xs">Betrag</TableHead>
                      <TableHead className="text-right text-xs">Skonto</TableHead>
                      <TableHead className="text-xs">Konto S</TableHead>
                      <TableHead className="text-xs">Konto H</TableHead>
                      <TableHead className="text-xs w-[70px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.zahlungen.map((z: any) => (
                      <TableRow key={z.id} data-testid={`row-zahlung-${z.id}`}>
                        <TableCell className="text-xs">{fmtDate(z.zahldat || z.belegdat)}</TableCell>
                        <TableCell className="text-xs">{subTypeName(z.typ)}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-medium">{fmtEur(z.zahlung)}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-blue-600">{z.skBetrag > 0 ? fmtEur(z.skBetrag) : "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{z.kontoB || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{z.kontoG || "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-gray-400 hover:text-blue-600"
                              onClick={() => setEditPayment({
                                id: z.id,
                                betrag: new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(z.zahlung || 0),
                                zahldat: z.zahldat ? new Date(z.zahldat).toISOString().split("T")[0] : "",
                                bankkonto: (h.art === "RA" ? z.kontoG : z.kontoB) || "1800",
                              })}
                              data-testid={`button-edit-zahlung-${z.id}`}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-gray-400 hover:text-red-600"
                              onClick={() => setDeletePaymentId(z.id)}
                              data-testid={`button-delete-zahlung-${z.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
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

          {detail && detail.verrechnungen.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-orange-600" />
                  Verrechnungen ({detail.verrechnungen.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Datum</TableHead>
                      <TableHead className="text-xs">Betreff</TableHead>
                      <TableHead className="text-right text-xs">Betrag</TableHead>
                      <TableHead className="text-xs">Konto S</TableHead>
                      <TableHead className="text-xs">Konto H</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.verrechnungen.map((v: any) => (
                      <TableRow key={v.id}>
                        <TableCell className="text-xs whitespace-nowrap">{fmtDate(v.belegdat)}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate" title={v.betreff}>{v.betreff || "—"}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{fmtEur(v.betrag || v.zahlung)}</TableCell>
                        <TableCell className="font-mono text-xs">{v.kontoB || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{v.kontoG || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {detail && detail.splits.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm">Splitbuchungen ({detail.splits.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Konto S</TableHead>
                      <TableHead className="text-xs">Konto H</TableHead>
                      <TableHead className="text-right text-xs">Netto</TableHead>
                      <TableHead className="text-right text-xs">Brutto</TableHead>
                      <TableHead className="text-xs">KTR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.splits.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs">{s.kontoB || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{s.kontoG || "—"}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{fmtEur(s.netto)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{fmtEur(s.brutto)}</TableCell>
                        <TableCell className="font-mono text-xs">{s.ktr || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {showPayment && (
            <Card className="border-blue-200 bg-blue-50/30">
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CreditCard className="h-4 w-4" /> Zahlung erfassen
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Zahlbetrag</Label>
                    <Input type="text" inputMode="decimal" value={payForm.betrag} onChange={e => {
                        const raw = e.target.value.replace(/\./g, "").replace(",", ".");
                        if (raw === "" || raw === "-" || /^-?\d*\.?\d{0,2}$/.test(raw)) setPayForm(f => ({ ...f, betrag: e.target.value }));
                      }}
                      placeholder={fmtEur(h.offen).replace(" €", "")} className="text-right font-mono" data-testid="input-pay-amount" />
                  </div>
                  <div>
                    <Label className="text-xs">Skonto-Abzug</Label>
                    <Input type="text" inputMode="decimal" value={payForm.skontoBetrag} onChange={e => {
                        const raw = e.target.value.replace(/\./g, "").replace(",", ".");
                        if (raw === "" || raw === "-" || /^-?\d*\.?\d{0,2}$/.test(raw)) setPayForm(f => ({ ...f, skontoBetrag: e.target.value }));
                      }}
                      className="text-right font-mono" data-testid="input-pay-skonto" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Bankkonto</Label>
                    <Select value={payForm.bankkonto} onValueChange={v => setPayForm(f => ({ ...f, bankkonto: v }))}>
                      <SelectTrigger data-testid="select-pay-bank"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["1800", "1801", "1802", "1803", "1804", "1805", "1806", "1807"].map(k => (
                          <SelectItem key={k} value={k}>{k}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Zahldatum</Label>
                    <Input type="date" value={payForm.zahldat} onChange={e => setPayForm(f => ({ ...f, zahldat: e.target.value }))} data-testid="input-pay-date" />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowPayment(false)} data-testid="button-cancel-payment">Abbrechen</Button>
                  <Button size="sm" onClick={() => payMutation.mutate()} disabled={payMutation.isPending || !payForm.betrag} data-testid="button-submit-payment">
                    {payMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    Buchen
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {showVerrechnung && (
            <Card className="border-orange-200 bg-orange-50/30">
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ArrowLeftRight className="h-4 w-4 text-orange-600" /> Verrechnung erfassen
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!selectedVerrRng ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {h.typ === "HG"
                        ? "Wählen Sie die Rechnung, mit der diese Gutschrift verrechnet werden soll:"
                        : "Wählen Sie die Gutschrift, die mit dieser Rechnung verrechnet werden soll:"}
                    </p>
                    {verrechnbare?.candidates?.length > 0 ? (
                      <div className="max-h-48 overflow-y-auto border rounded">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">RNr</TableHead>
                              <TableHead className="text-xs">Betreff</TableHead>
                              <TableHead className="text-right text-xs">Brutto</TableHead>
                              <TableHead className="text-right text-xs">Offen</TableHead>
                              <TableHead className="text-xs w-10"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {verrechnbare.candidates.map((c: any) => (
                              <TableRow key={c.reId} className="cursor-pointer hover:bg-orange-50" onClick={() => {
                                setSelectedVerrRng(c);
                                const maxVerr = Math.min(Math.abs(h.offen), Math.abs(c.offen));
                                setVerrForm(f => ({ ...f, gegenReId: c.reId, betrag: fmtDe(maxVerr) }));
                              }} data-testid={`row-verrechn-candidate-${c.reId}`}>
                                <TableCell className="font-mono text-xs">{fmtDocNumber(c.rnr)}</TableCell>
                                <TableCell className="text-xs max-w-[180px] truncate" title={c.betreff}>{c.betreff}</TableCell>
                                <TableCell className="text-right font-mono text-xs">{fmtEur(c.brutto)}</TableCell>
                                <TableCell className="text-right font-mono text-xs">{fmtEur(c.offen)}</TableCell>
                                <TableCell><Check className="h-3 w-3 text-orange-600" /></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        Keine offenen {h.typ === "HG" ? "Rechnungen" : "Gutschriften"} für diesen Lieferanten gefunden.
                      </p>
                    )}
                    <div className="flex justify-end">
                      <Button variant="outline" size="sm" onClick={() => setShowVerrechnung(false)} data-testid="button-cancel-verrechnung">Abbrechen</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-white rounded border p-2 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{h.typ === "HG" ? "Rechnung:" : "Gutschrift:"}</span>
                        <span className="font-mono font-medium">{fmtDocNumber(selectedVerrRng.rnr)}</span>
                      </div>
                      <div className="text-muted-foreground truncate" title={selectedVerrRng.betreff}>{selectedVerrRng.betreff}</div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Offen:</span>
                        <span className="font-mono">{fmtEur(selectedVerrRng.offen)}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Verrechnungsbetrag</Label>
                        <Input type="text" inputMode="decimal" value={verrForm.betrag} onChange={e => {
                          const raw = e.target.value.replace(/\./g, "").replace(",", ".");
                          if (raw === "" || raw === "-" || /^-?\d*\.?\d{0,2}$/.test(raw)) setVerrForm(f => ({ ...f, betrag: e.target.value }));
                        }} className="text-right font-mono" data-testid="input-verrechnung-betrag" />
                      </div>
                      <div>
                        <Label className="text-xs">Verrechnungskonto (opt.)</Label>
                        <Input type="text" value={verrForm.verrechnungskonto} onChange={e => setVerrForm(f => ({ ...f, verrechnungskonto: e.target.value }))} placeholder="1590" className="font-mono" data-testid="input-verrechnung-konto" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setSelectedVerrRng(null); setVerrForm({ gegenReId: 0, betrag: "", verrechnungskonto: "" }); }} data-testid="button-back-verrechnung">
                        Zurück
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setShowVerrechnung(false); setSelectedVerrRng(null); }} data-testid="button-cancel-verrechnung2">Abbrechen</Button>
                      <Button size="sm" onClick={() => verrechnungMutation.mutate()} disabled={verrechnungMutation.isPending || !verrForm.gegenReId || !verrForm.betrag} data-testid="button-submit-verrechnung">
                        {verrechnungMutation.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        Verrechnen
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex justify-between items-center pt-2 border-t">
            <div className="flex gap-2 flex-wrap">
              {h.documentId && (
                <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); navigate(`/dokumente/${h.documentId}/bearbeiten`); }} data-testid="button-goto-document">
                  <ExternalLink className="mr-1 h-3 w-3" /> Dokument öffnen
                </Button>
              )}
              {canPay && !showPayment && !showVerrechnung && (
                <Button variant="outline" size="sm" onClick={() => { setPayForm(f => ({ ...f, betrag: new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(h.offen) })); setShowPayment(true); }} data-testid="button-show-payment">
                  <CreditCard className="mr-1 h-3 w-3" /> Zahlung erfassen
                </Button>
              )}
              {(h.typ === "HR" || h.typ === "HG") && h.bezahlflag !== 2 && !showPayment && !showVerrechnung && (
                <Button variant="outline" size="sm" onClick={() => setShowVerrechnung(true)} data-testid="button-show-verrechnung">
                  <ArrowLeftRight className="mr-1 h-3 w-3" /> Verrechnung
                </Button>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} data-testid="button-close-detail">Schließen</Button>
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={deletePaymentId !== null} onOpenChange={(v) => { if (!v) setDeletePaymentId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zahlung löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Zahlung wird gelöscht und der offene Betrag der Rechnung entsprechend angepasst.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-zahlung">Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => { if (deletePaymentId) deletePayMutation.mutate(deletePaymentId); }}
              disabled={deletePayMutation.isPending}
              data-testid="button-confirm-delete-zahlung"
            >
              {deletePayMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editPayment !== null} onOpenChange={(v) => { if (!v) setEditPayment(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Zahlung bearbeiten</DialogTitle>
          </DialogHeader>
          {editPayment && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Betrag</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={editPayment.betrag}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\./g, "").replace(",", ".");
                    if (raw === "" || raw === "-" || /^-?\d*\.?\d{0,2}$/.test(raw)) {
                      setEditPayment({ ...editPayment, betrag: e.target.value });
                    }
                  }}
                  onFocus={(e) => {
                    const num = parseFloat(editPayment.betrag.replace(/\./g, "").replace(",", "."));
                    if (!isNaN(num)) {
                      setEditPayment({ ...editPayment, betrag: new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num) });
                    }
                  }}
                  className="font-mono text-right"
                  data-testid="input-edit-zahlung-betrag"
                />
              </div>
              <div>
                <Label className="text-xs">Zahldatum</Label>
                <Input
                  type="date"
                  value={editPayment.zahldat}
                  onChange={(e) => setEditPayment({ ...editPayment, zahldat: e.target.value })}
                  data-testid="input-edit-zahlung-datum"
                />
              </div>
              <div>
                <Label className="text-xs">Bankkonto</Label>
                <Select value={editPayment.bankkonto} onValueChange={(v) => setEditPayment({ ...editPayment, bankkonto: v })}>
                  <SelectTrigger data-testid="select-edit-zahlung-bank"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["1800","1801","1802","1803","1804","1805","1806","1807"].map(k => (
                      <SelectItem key={k} value={k}>{k}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setEditPayment(null)}>Abbrechen</Button>
                <Button
                  size="sm"
                  onClick={() => { if (editPayment) editPayMutation.mutate(editPayment); }}
                  disabled={editPayMutation.isPending}
                  data-testid="button-save-edit-zahlung"
                >
                  {editPayMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Speichern
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function getDateRange(zeitraum: string): { dateFrom?: string; dateTo?: string } {
  if (zeitraum === "alle") return {};
  const now = new Date();
  if (zeitraum === "monat") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { dateFrom: from.toISOString().split("T")[0], dateTo: to.toISOString().split("T")[0] };
  }
  if (zeitraum === "jahr") {
    return { dateFrom: `${now.getFullYear()}-01-01`, dateTo: `${now.getFullYear()}-12-31` };
  }
  return {};
}

function PrimanotaTab() {
  const [page, setPage] = useState(0);
  const [artFilter, setArtFilter] = useState("alle");
  const [typFilter, setTypFilter] = useState("alle");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [zeitraumFilter, setZeitraumFilter] = useState("alle");
  const [searchTerm, setSearchTerm] = useState("");
  const [detailReId, setDetailReId] = useState<number | null>(null);
  const pageSize = 100;

  const dateRange = getDateRange(zeitraumFilter);
  const queryParams = new URLSearchParams();
  queryParams.set("limit", String(pageSize));
  queryParams.set("offset", String(page * pageSize));
  if (artFilter !== "alle") queryParams.set("art", artFilter);
  if (typFilter !== "alle") queryParams.set("typ", typFilter);
  if (statusFilter !== "alle") queryParams.set("bezahlflag", statusFilter);
  if (searchTerm.trim()) queryParams.set("search", searchTerm.trim());
  if (dateRange.dateFrom) queryParams.set("dateFrom", dateRange.dateFrom);
  if (dateRange.dateTo) queryParams.set("dateTo", dateRange.dateTo);

  const { data, isLoading } = useQuery<PrimanotaResponse>({
    queryKey: ["/api/fibu/primanota", { page, artFilter, typFilter, statusFilter, searchTerm, zeitraumFilter }],
    queryFn: async () => {
      const res = await fetch(`/api/fibu/primanota?${queryParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Fehler beim Laden");
      return res.json();
    },
  });

  const entries = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold">Gesamt{zeitraumFilter === "monat" ? " (Monat)" : zeitraumFilter === "jahr" ? ` (${new Date().getFullYear()})` : ""}</p>
                <p className="text-lg font-bold" data-testid="text-total-count">{total.toLocaleString("de-DE")} Buchungen</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {data && (
          <>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold">RA Netto</p>
                    <p className="text-sm font-bold text-green-600" data-testid="text-summe-ra">{fmtEur(data.summeRA)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-red-600" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold">RE Netto</p>
                    <p className="text-sm font-bold text-red-600" data-testid="text-summe-re">{fmtEur(data.summeRE)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-orange-600" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Offen</p>
                    <p className="text-sm font-bold text-orange-600" data-testid="text-summe-offen">{fmtEur(data.summeOffen)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="RNr, Adresse, Betreff, KTR..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(0); }}
            data-testid="input-primanota-search"
          />
        </div>
        <Select value={artFilter} onValueChange={v => { setArtFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[130px]" data-testid="select-art-filter">
            <SelectValue placeholder="Art" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Arten</SelectItem>
            <SelectItem value="RA">RA (Ausgang)</SelectItem>
            <SelectItem value="RE">RE (Eingang)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typFilter} onValueChange={v => { setTypFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px]" data-testid="select-typ-filter">
            <SelectValue placeholder="Typ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Typen</SelectItem>
            <SelectItem value="HR">HR (Hauptrechnung)</SelectItem>
            <SelectItem value="HG">HG (Gutschrift)</SelectItem>
            <SelectItem value="ZA">ZA (Zahlung)</SelectItem>
            <SelectItem value="VR">VR (Verrechnung)</SelectItem>
            <SelectItem value="SB">SB (Split)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Status</SelectItem>
            <SelectItem value="offen">Offen</SelectItem>
            <SelectItem value="teilbezahlt">Teilzahlung</SelectItem>
            <SelectItem value="bezahlt">Bezahlt</SelectItem>
          </SelectContent>
        </Select>
        <Select value={zeitraumFilter} onValueChange={v => { setZeitraumFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px]" data-testid="select-zeitraum-filter">
            <Calendar className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
            <SelectValue placeholder="Zeitraum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Gesamter Zeitraum</SelectItem>
            <SelectItem value="monat">Aktueller Monat</SelectItem>
            <SelectItem value="jahr">Aktuelles Jahr</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" disabled={page === 0} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground whitespace-nowrap">{page + 1} / {totalPages || 1}</span>
          <Button variant="outline" size="icon" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} data-testid="button-next-page">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[85px]">Datum</TableHead>
                    <TableHead className="w-[45px]">Art</TableHead>
                    <TableHead className="w-[40px]">Typ</TableHead>
                    <TableHead>RNr</TableHead>
                    <TableHead>Adresse</TableHead>
                    <TableHead className="max-w-[180px]">Betreff</TableHead>
                    <TableHead className="text-right">Netto</TableHead>
                    <TableHead className="text-right">Brutto</TableHead>
                    <TableHead className="text-right">Bezahlt</TableHead>
                    <TableHead className="text-right">Offen</TableHead>
                    <TableHead className="w-[55px]">Sk%</TableHead>
                    <TableHead className="w-[65px]">Kto S</TableHead>
                    <TableHead className="w-[65px]">Kto H</TableHead>
                    <TableHead className="w-[60px]">Status</TableHead>
                    <TableHead className="w-[40px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={15} className="text-center text-muted-foreground py-8" data-testid="text-no-entries">
                        Keine Buchungen gefunden
                      </TableCell>
                    </TableRow>
                  ) : (
                    entries.map(e => (
                      <TableRow
                        key={e.id}
                        data-testid={`row-fibu-${e.id}`}
                        className={`cursor-pointer hover:bg-muted/50 ${e.stornoflag === 2 ? "opacity-50 line-through" : ""} ${e.idx > 0 ? "bg-gray-50/50" : ""}`}
                        onClick={() => setDetailReId(e.reId)}
                      >
                        <TableCell className="whitespace-nowrap text-xs" data-testid={`text-fibu-date-${e.id}`}>
                          {fmtDate(e.belegdat)}
                        </TableCell>
                        <TableCell data-testid={`badge-fibu-art-${e.id}`}>
                          <Badge className={`${typeBadgeVariant(e.art)} text-[10px] px-1`} variant="outline">{e.art}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground" data-testid={`text-fibu-typ-${e.id}`}>
                          {e.typ}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-semibold" data-testid={`text-fibu-rnr-${e.id}`}>
                          {fmtDocNumber(e.rnr)}
                        </TableCell>
                        <TableCell className="text-xs max-w-[110px] truncate" data-testid={`text-fibu-adr-${e.id}`}>
                          {e.adrSuch || "—"}
                        </TableCell>
                        <TableCell className="text-xs max-w-[180px] truncate" data-testid={`text-fibu-betreff-${e.id}`}>
                          {e.betreff || "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs" data-testid={`text-fibu-netto-${e.id}`}>
                          {fmtEur(e.netto)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs" data-testid={`text-fibu-brutto-${e.id}`}>
                          {fmtEur(e.brutto)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-green-600" data-testid={`text-fibu-zahlung-${e.id}`}>
                          {e.zahlung > 0 ? fmtEur(e.zahlung) : "—"}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-xs ${e.offen > 0.01 ? "text-red-600 font-semibold" : ""}`} data-testid={`text-fibu-offen-${e.id}`}>
                          {e.offen > 0.01 ? fmtEur(e.offen) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground" data-testid={`text-fibu-skonto-${e.id}`}>
                          {e.skProzent > 0 ? `${e.skProzent}%` : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-[10px] text-muted-foreground">{e.kontoB || "—"}</TableCell>
                        <TableCell className="font-mono text-[10px] text-muted-foreground">{e.kontoG || "—"}</TableCell>
                        <TableCell data-testid={`badge-fibu-status-${e.id}`}>
                          {e.idx === 0 && statusBadge(e.status, e.bezahlflag)}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(ev) => { ev.stopPropagation(); setDetailReId(e.reId); }}
                            data-testid={`button-detail-${e.id}`}>
                            <Eye className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {detailReId !== null && (
        <FibuDetailDialog reId={detailReId} open={detailReId !== null} onOpenChange={() => setDetailReId(null)} />
      )}
    </div>
  );
}

function OffenePostenTab() {
  const { data: raData, isLoading: raLoading } = useQuery<PrimanotaResponse>({
    queryKey: ["/api/fibu/primanota", "offene-ra"],
    queryFn: async () => {
      const res = await fetch("/api/fibu/primanota?art=RA&typ=HR&bezahlflag=offen&limit=500", { credentials: "include" });
      if (!res.ok) throw new Error("Fehler");
      return res.json();
    },
  });

  const { data: raTeilData } = useQuery<PrimanotaResponse>({
    queryKey: ["/api/fibu/primanota", "teil-ra"],
    queryFn: async () => {
      const res = await fetch("/api/fibu/primanota?art=RA&typ=HR&bezahlflag=teilbezahlt&limit=500", { credentials: "include" });
      if (!res.ok) throw new Error("Fehler");
      return res.json();
    },
  });

  const { data: reData, isLoading: reLoading } = useQuery<PrimanotaResponse>({
    queryKey: ["/api/fibu/primanota", "offene-re"],
    queryFn: async () => {
      const res = await fetch("/api/fibu/primanota?art=RE&typ=HR&bezahlflag=offen&limit=500", { credentials: "include" });
      if (!res.ok) throw new Error("Fehler");
      return res.json();
    },
  });

  const { data: reTeilData, isLoading: reTeilLoading } = useQuery<PrimanotaResponse>({
    queryKey: ["/api/fibu/primanota", "teil-re"],
    queryFn: async () => {
      const res = await fetch("/api/fibu/primanota?art=RE&typ=HR&bezahlflag=teilbezahlt&limit=500", { credentials: "include" });
      if (!res.ok) throw new Error("Fehler");
      return res.json();
    },
  });

  const openRA = [...(raData?.data || []), ...(raTeilData?.data || [])];
  const openRE = [...(reData?.data || []), ...(reTeilData?.data || [])];

  const totalForderungen = openRA.reduce((s, e) => s + (e.offen > 0 ? e.offen : 0), 0);
  const totalVerbindlichkeiten = openRE.reduce((s, e) => s + (e.offen > 0 ? e.offen : 0), 0);

  const isLoading = raLoading || reLoading || reTeilLoading || !raTeilData;
  const [detailReId, setDetailReId] = useState<number | null>(null);

  const renderTable = (entries: FibuBuchung[], type: "RA" | "RE") => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>RNr</TableHead>
          <TableHead>Datum</TableHead>
          <TableHead>{type === "RA" ? "Kunde" : "Lieferant"}</TableHead>
          <TableHead className="max-w-[180px]">Betreff</TableHead>
          <TableHead className="text-right">Brutto</TableHead>
          <TableHead className="text-right">Bezahlt</TableHead>
          <TableHead className="text-right">Offen</TableHead>
          <TableHead>Fällig</TableHead>
          <TableHead>Skonto bis</TableHead>
          <TableHead>KTR</TableHead>
          <TableHead className="w-[60px]">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map(e => {
          const isOverdue = e.faelligdat && new Date(e.faelligdat) < new Date();
          const skontoExpired = e.skontodat && new Date(e.skontodat) < new Date();
          return (
            <TableRow key={e.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailReId(e.reId)}
              data-testid={`row-open-${type.toLowerCase()}-${e.id}`}>
              <TableCell className="font-mono text-xs font-semibold">{fmtDocNumber(e.rnr)}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">{fmtDate(e.belegdat)}</TableCell>
              <TableCell className="text-xs max-w-[120px] truncate">
                {e.adrNr ? (
                  <a
                    href={`/adressen?selected_nr=${e.adrNr}`}
                    className="hover:text-primary hover:underline transition-colors"
                    onClick={(ev) => ev.stopPropagation()}
                    data-testid={`link-fibu-customer-${e.id}`}
                  >{e.adrSuch}</a>
                ) : e.adrSuch}
              </TableCell>
              <TableCell className="text-xs max-w-[180px] truncate">{e.betreff}</TableCell>
              <TableCell className="text-right font-mono text-xs font-medium">{fmtEur(e.brutto)}</TableCell>
              <TableCell className="text-right font-mono text-xs text-green-600">{e.zahlung > 0 ? fmtEur(e.zahlung) : "—"}</TableCell>
              <TableCell className="text-right font-mono text-xs font-semibold text-red-600">{fmtEur(e.offen)}</TableCell>
              <TableCell className={`text-xs whitespace-nowrap ${isOverdue ? "text-red-600 font-semibold" : ""}`}>
                {e.faelligdat ? fmtDate(e.faelligdat) : "—"}
                {isOverdue && <AlertCircle className="inline ml-1 h-3 w-3" />}
              </TableCell>
              <TableCell className={`text-xs whitespace-nowrap ${skontoExpired ? "text-gray-400 line-through" : "text-blue-600"}`}>
                {e.skontodat ? `${fmtDate(e.skontodat)} (${e.skProzent}%)` : "—"}
              </TableCell>
              <TableCell className="font-mono text-xs">{e.ktr || "—"}</TableCell>
              <TableCell>{statusBadge(e.status, e.bezahlflag)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold">Forderungen (RA)</p>
                <p className="text-lg font-bold text-green-600" data-testid="text-forderungen">{fmtEur(totalForderungen)}</p>
                <p className="text-xs text-muted-foreground">{openRA.length} offene Posten</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold">Verbindlichkeiten (RE)</p>
                <p className="text-lg font-bold text-red-600" data-testid="text-verbindlichkeiten">{fmtEur(totalVerbindlichkeiten)}</p>
                <p className="text-xs text-muted-foreground">{openRE.length} offene Posten</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold">Saldo</p>
                <p className={`text-lg font-bold ${totalForderungen - totalVerbindlichkeiten >= 0 ? "text-blue-600" : "text-red-600"}`} data-testid="text-saldo">
                  {fmtEur(totalForderungen - totalVerbindlichkeiten)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <>
          {openRA.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  Offene Forderungen (Rechnungsausgang) — {openRA.length} Posten
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-auto">
                {renderTable(openRA, "RA")}
              </CardContent>
            </Card>
          )}

          {openRE.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-600" />
                  Offene Verbindlichkeiten (Rechnungseingang) — {openRE.length} Posten
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-auto">
                {renderTable(openRE, "RE")}
              </CardContent>
            </Card>
          )}

          {openRA.length === 0 && openRE.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground" data-testid="text-no-open-items">
                Keine offenen Posten vorhanden
              </CardContent>
            </Card>
          )}
        </>
      )}

      {detailReId !== null && (
        <FibuDetailDialog reId={detailReId} open={detailReId !== null} onOpenChange={() => setDetailReId(null)} />
      )}
    </div>
  );
}

function MeasurementFormDialog({ entry, open, onOpenChange }: {
  entry?: Measurement;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const isEdit = !!entry;

  const [form, setForm] = useState({
    title: entry?.title || "",
    room: entry?.room || "",
    length: entry?.length || "0",
    width: entry?.width || "0",
    height: entry?.height || "0",
    quantity: entry?.quantity || "1",
    result: entry?.result || "0",
    unit: entry?.unit || "m²",
    formula: entry?.formula || "",
    projectNumber: entry?.projectNumber || "",
    documentNumber: entry?.documentNumber || "",
    notes: entry?.notes || "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        await apiRequest("PATCH", `/api/measurements/${entry.id}`, form);
      } else {
        await apiRequest("POST", "/api/measurements", form);
      }
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Aufmaß aktualisiert" : "Aufmaß erstellt" });
      queryClient.invalidateQueries({ queryKey: ["/api/measurements"] });
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
          <DialogTitle data-testid="dialog-title-measurement">
            {isEdit ? "Aufmaß bearbeiten" : "Neues Aufmaß"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Titel</Label>
              <Input data-testid="input-measurement-title" value={form.title} onChange={e => update("title", e.target.value)} placeholder="Bezeichnung" />
            </div>
            <div>
              <Label>Raum</Label>
              <Input data-testid="input-measurement-room" value={form.room} onChange={e => update("room", e.target.value)} placeholder="Raum" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <Label>Länge</Label>
              <Input data-testid="input-measurement-length" type="number" step="0.01" value={form.length} onChange={e => update("length", e.target.value)} className="text-right" />
            </div>
            <div>
              <Label>Breite</Label>
              <Input data-testid="input-measurement-width" type="number" step="0.01" value={form.width} onChange={e => update("width", e.target.value)} className="text-right" />
            </div>
            <div>
              <Label>Höhe</Label>
              <Input data-testid="input-measurement-height" type="number" step="0.01" value={form.height} onChange={e => update("height", e.target.value)} className="text-right" />
            </div>
            <div>
              <Label>Menge</Label>
              <Input data-testid="input-measurement-quantity" type="number" step="0.01" value={form.quantity} onChange={e => update("quantity", e.target.value)} className="text-right" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Ergebnis</Label>
              <Input data-testid="input-measurement-result" type="number" step="0.01" value={form.result} onChange={e => update("result", e.target.value)} className="text-right" />
            </div>
            <div>
              <Label>Einheit</Label>
              <Select value={form.unit} onValueChange={v => update("unit", v)}>
                <SelectTrigger data-testid="select-measurement-unit"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["m²", "m³", "m", "lfm", "Stk", "kg", "t", "Psch"].map(u => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Formel</Label>
              <Input data-testid="input-measurement-formula" value={form.formula} onChange={e => update("formula", e.target.value)} placeholder="L*B*H" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Projekt</Label>
              <Input data-testid="input-measurement-project" value={form.projectNumber} onChange={e => update("projectNumber", e.target.value)} placeholder="Projektnummer" />
            </div>
            <div>
              <Label>Dok-Nr.</Label>
              <Input data-testid="input-measurement-docnumber" value={form.documentNumber} onChange={e => update("documentNumber", e.target.value)} placeholder="Dokumentnummer" />
            </div>
          </div>
          <div>
            <Label>Bemerkung</Label>
            <Input data-testid="input-measurement-notes" value={form.notes} onChange={e => update("notes", e.target.value)} placeholder="Anmerkungen" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-measurement">Abbrechen</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-save-measurement">
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Speichern" : "Anlegen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AufmassTab() {
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<Measurement | undefined>();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const { toast } = useToast();

  const { data: entries = [], isLoading } = useQuery<Measurement[]>({
    queryKey: ["/api/measurements"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/measurements/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Aufmaß gelöscht" });
      queryClient.invalidateQueries({ queryKey: ["/api/measurements"] });
      setDeleteId(null);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1" />
        <Button onClick={() => { setEditEntry(undefined); setShowForm(true); }} data-testid="button-new-measurement">
          <Plus className="mr-2 h-4 w-4" /> Neues Aufmaß
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead data-testid="th-titel">Titel</TableHead>
                  <TableHead data-testid="th-raum">Raum</TableHead>
                  <TableHead className="text-right" data-testid="th-laenge">Länge</TableHead>
                  <TableHead className="text-right" data-testid="th-breite">Breite</TableHead>
                  <TableHead className="text-right" data-testid="th-hoehe">Höhe</TableHead>
                  <TableHead className="text-right" data-testid="th-menge">Menge</TableHead>
                  <TableHead className="text-right" data-testid="th-ergebnis">Ergebnis</TableHead>
                  <TableHead data-testid="th-einheit">Einheit</TableHead>
                  <TableHead data-testid="th-projekt-measurement">Projekt</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8" data-testid="text-no-measurements">
                      Keine Aufmaße vorhanden
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map(m => (
                    <TableRow key={m.id} data-testid={`row-measurement-${m.id}`}>
                      <TableCell className="font-semibold" data-testid={`text-measurement-title-${m.id}`}>{m.title}</TableCell>
                      <TableCell data-testid={`text-measurement-room-${m.id}`}>{m.room || "—"}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{m.length}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{m.width}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{m.height}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{m.quantity}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold">{m.result}</TableCell>
                      <TableCell>{m.unit}</TableCell>
                      <TableCell className="text-xs">{m.projectNumber || "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon"
                            onClick={() => { setEditEntry(m); setShowForm(true); }}
                            data-testid={`button-edit-measurement-${m.id}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon"
                            onClick={() => setDeleteId(m.id)}
                            data-testid={`button-delete-measurement-${m.id}`}>
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

      {showForm && (
        <MeasurementFormDialog entry={editEntry} open={showForm} onOpenChange={setShowForm} />
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aufmaß löschen?</AlertDialogTitle>
            <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function FinanzenPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="heading-finanzen">Finanzbuchhaltung</h1>
          <p className="text-muted-foreground text-sm">Primanota, Kontenrahmen, Steuerschlüssel, offene Posten</p>
        </div>
      </div>

      <Tabs defaultValue="primanota" className="space-y-4">
        <TabsList data-testid="tabs-finanzen">
          <TabsTrigger value="primanota" data-testid="tab-primanota">
            <FileText className="mr-1.5 h-4 w-4" />Primanota
          </TabsTrigger>
          <TabsTrigger value="offene-posten" data-testid="tab-offene-posten">
            <AlertCircle className="mr-1.5 h-4 w-4" />Offene Posten
          </TabsTrigger>
          <TabsTrigger value="kontenrahmen" data-testid="tab-kontenrahmen">
            <BookOpen className="mr-1.5 h-4 w-4" />Kontenrahmen
          </TabsTrigger>
          <TabsTrigger value="steuersaetze" data-testid="tab-steuersaetze">
            <Percent className="mr-1.5 h-4 w-4" />Steuerschlüssel
          </TabsTrigger>
          <TabsTrigger value="aufmass" data-testid="tab-aufmass">
            <Ruler className="mr-1.5 h-4 w-4" />Aufmaß
          </TabsTrigger>
        </TabsList>

        <TabsContent value="primanota"><PrimanotaTab /></TabsContent>
        <TabsContent value="offene-posten"><OffenePostenTab /></TabsContent>
        <TabsContent value="kontenrahmen"><KontenrahmenTab /></TabsContent>
        <TabsContent value="steuersaetze"><SteuersaetzeTab /></TabsContent>
        <TabsContent value="aufmass"><AufmassTab /></TabsContent>
      </Tabs>
    </div>
  );
}
