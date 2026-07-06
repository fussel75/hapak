import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Document, Customer, Dunning } from "@shared/schema";
import { invoiceStatusLabels } from "@shared/schema";
import { fmtDocNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fmtCurrency, fmtDate, fmtNumber } from "@/lib/format";
import { ZahlungDialog } from "@/components/zahlung-dialog";
import {
  CreditCard, AlertTriangle, Filter, Search, Banknote,
  FileWarning, Printer, PlayCircle, Euro, Clock, BarChart3,
  ChevronLeft, ChevronRight, Eye, X, ArrowUpDown, TrendingUp,
  Receipt, FileText, Calendar, PanelRightOpen
} from "lucide-react";

interface FibuInvoice {
  fibuId: number;
  reId: number;
  documentNumber: string;
  customerName: string;
  customerNumber: string;
  subject: string;
  date: string;
  dueDate: string;
  paymentDate: string;
  erfasstDat: string;
  skontoDat: string;
  netTotal: number;
  grossTotal: number;
  brutto: number;
  paidAmount: number;
  openAmount: number;
  skontoPercent: number;
  skontoAmount: number;
  minderungAmount: number;
  gutschriftAmount: number;
  kuerzungAmount: number;
  projectNumber: string;
  kostenstelle: string;
  kontoB: string;
  kontoG: string;
  typ: string;
  paymentStatus: string;
  dunningLevel: number;
  bezahlflag: number;
  stornoFlag: number;
  documentId: number | null;
}

interface FibuResponse {
  data: FibuInvoice[];
  total: number;
  totalNetto: number;
  totalBrutto: number;
  totalBezahlt: number;
  totalOffen: number;
  limit: number;
  offset: number;
}

interface FibuDetail {
  hauptsatz: any;
  nebensaetze: any[];
  zahlungen: any[];
  verrechnungen: any[];
  splits: any[];
  kasse: any[];
}

interface UmsatzUebersicht {
  rechnungenCount: number;
  erloese: number;
  gutschriftenNetto: number;
  gutschriftenBrutto: number;
  gutschriftenCount: number;
  skontoGez: number;
  minderung: number;
  netto: number;
  steuerBetrag: number;
  brutto: number;
  bezahlt: number;
  offen: number;
}

interface Statistics {
  byStatus: { status: string; count: number; netto: number; brutto: number; bezahlt: number; offen: number }[];
  byCustomer: { name: string; adrNr: string; count: number; netto: number; brutto: number; offen: number }[];
  byMonth: { month: string; count: number; netto: number; brutto: number }[];
  byKonto: { konto: string; count: number; netto: number }[];
  gutschriften: { count: number; brutto: number };
  skontoTotal: number;
  umsatzUebersicht: UmsatzUebersicht;
}

interface OpenItem {
  id: number;
  documentNumber: string;
  type: string;
  customerId: number;
  customerName: string;
  customerNumber: string;
  date: string;
  dueDate: string;
  grossTotal: string;
  paidAmount: string;
  openAmount: string;
  overdueDays: number;
  status: string;
  subject: string;
  dunningLevel: number;
  dunningCount: number;
  dunningEntries: any[];
  noReminder: boolean;
}

const DUNNING_LABELS: Record<number, string> = { 1: "Erinnerung", 2: "1. Mahnung", 3: "2. Mahnung" };
const DUNNING_COLORS: Record<number, string> = {
  1: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  2: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  3: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};
const DEFAULT_FEES: Record<number, string> = { 1: "0,00", 2: "5,00", 3: "10,00" };
const DEFAULT_TEXTS: Record<number, string> = {
  1: "Sicher ist es Ihrer Aufmerksamkeit entgangen, dass folgende Rechnung noch nicht beglichen wurde. Wir bitten Sie, den ausstehenden Betrag innerhalb von 14 Tagen auf unser Konto zu ueberweisen.",
  2: "Trotz unserer Zahlungserinnerung ist folgende Rechnung noch offen. Wir bitten Sie dringend um umgehende Begleichung des ausstehenden Betrages.",
  3: "Letztmalig fordern wir Sie auf, den ausstehenden Betrag zu begleichen. Sollte der Betrag nicht innerhalb von 14 Tagen auf unserem Konto eingehen, sehen wir uns gezwungen, weitere Schritte einzuleiten.",
};

const statusBadge = (s: string) => {
  const colors: Record<string, string> = {
    offen: "", bezahlt: "bg-green-100 text-green-800", teilbezahlt: "bg-yellow-100 text-yellow-800",
    gemahnt: "bg-orange-100 text-orange-800", storniert: "bg-gray-200 text-gray-600",
  };
  const labels: Record<string, string> = {
    offen: "Offen", bezahlt: "Bezahlt", teilbezahlt: "Teilbezahlt",
    gemahnt: "Gemahnt", storniert: "Storniert",
  };
  return <Badge variant="secondary" className={`text-[10px] ${colors[s] || ""}`}>{labels[s] || s}</Badge>;
};

const typBadge = (typ: string) => {
  if (typ === "HG") return <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">GS</Badge>;
  return null;
};

function DetailPanel({ reId, invoice, onClose }: { reId: number; invoice?: FibuInvoice | null; onClose: () => void }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [zahlungOpen, setZahlungOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async (deleteReId: number) => {
      await apiRequest("DELETE", `/api/fibu/${deleteReId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fibu"] });
      queryClient.invalidateQueries({ queryKey: ["/api/outgoing-invoices-fibu"] });
      toast({ title: "Rechnung geloescht" });
      onClose();
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });
  const { data, isLoading } = useQuery<FibuDetail>({
    queryKey: ["/api/fibu", reId, "details"],
    queryFn: async () => {
      const res = await fetch(`/api/fibu/${reId}/details`, { credentials: "include" });
      if (!res.ok) throw new Error("Fehler");
      return res.json();
    },
    enabled: reId > 0,
  });

  if (isLoading) return (
    <div className="p-4 space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
  );

  if (!data) return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
      <PanelRightOpen className="h-12 w-12 mb-3 opacity-20" />
      <p className="text-sm">Rechnung waehlen um Details zu sehen</p>
    </div>
  );

  const h = data.hauptsatz;
  const isGutschrift = h.typ === "HG";
  const canPay = (h.bezahlflag === 0 || h.bezahlflag === 1) && h.stornoflag !== 2;

  return (
    <div className="h-full flex flex-col" data-testid="detail-panel">
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 shrink-0" />
            <span className="font-semibold text-sm truncate">{fmtDocNumber(h.rnr)}</span>
            {isGutschrift && <Badge className="bg-red-100 text-red-800 text-[10px] shrink-0">Gutschrift</Badge>}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            <a className="hover:text-primary hover:underline cursor-pointer" onClick={() => navigate(`/adressen?search=${encodeURIComponent(h.adrNr)}`)} data-testid="link-detail-customer">{h.adrSuch}</a>
            {" - "}{h.betreff}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose} data-testid="button-close-detail"><X className="h-4 w-4" /></Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <InfoField label="Belegdatum" value={fmtDate(h.belegdat)} />
            <InfoField label="Faellig" value={fmtDate(h.faelligdat)} />
            <InfoField label="Erfasst" value={fmtDate(h.erfasstdat)} />
            <InfoField label="Zahldatum" value={fmtDate(h.zahldat)} />
          </div>

          <div className="grid grid-cols-2 gap-2 bg-muted/20 rounded-lg p-2.5">
            <InfoField label="Netto" value={fmtCurrency(h.netto)} bold />
            <InfoField label="Brutto" value={fmtCurrency(h.betrag)} bold />
            <InfoField label="Bezahlt" value={fmtCurrency(h.zahlung)} className="text-green-700" />
            <InfoField label="Offen" value={fmtCurrency(h.offen)} className={h.offen > 0.01 ? "text-red-600 font-bold" : "text-green-600"} />
          </div>

          {h.skBetrag > 0 && (
            <div className="flex items-center gap-3 text-xs bg-orange-50 dark:bg-orange-950/20 rounded p-2">
              <span className="text-muted-foreground">Skonto:</span>
              <span className="font-medium">{fmtCurrency(h.skBetrag)} ({fmtNumber(h.skProzent)}%)</span>
            </div>
          )}

          {(h.minderung > 0 || h.gutschrift !== 0 || h.kuerzung !== 0) && (
            <div className="grid grid-cols-3 gap-2 bg-muted/30 rounded-lg p-2.5 text-xs">
              <InfoField label="Minderung" value={fmtCurrency(h.minderung)} />
              <InfoField label="Gutschrift" value={fmtCurrency(h.gutschrift)} />
              <InfoField label="Kuerzung" value={fmtCurrency(h.kuerzung)} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            <InfoField label="Personenkonto" value={h.kontoB || "-"} />
            <InfoField label="Erloeskonto" value={h.kontoG || "-"} />
            <div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Projekt/KTR</span>
              {h.ktr ? (
                <a className="text-xs font-medium hover:text-primary hover:underline cursor-pointer" onClick={() => navigate(`/projekte?search=${encodeURIComponent(h.ktr)}`)} data-testid="link-detail-projekt">{fmtDocNumber(h.ktr)}</a>
              ) : <span className="text-xs font-medium">-</span>}
            </div>
            <InfoField label="Kostenstelle" value={h.kst || "-"} />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <Badge variant="outline" className="text-[10px]">
              {h.bezahlflag === 0 ? "Offen" : h.bezahlflag === 1 ? "Teilzahlung" : h.bezahlflag === 2 ? "Bezahlt" : "Ueberzahlung"}
            </Badge>
            {h.stornoflag === 2 && <Badge className="bg-gray-200 text-gray-600 text-[10px]">Storniert</Badge>}
            {h.mahnflag > 0 && <Badge className="bg-orange-100 text-orange-800 text-[10px]">Mahnstufe {h.mahnflag}</Badge>}
          </div>

          <div className="flex gap-2">
            {canPay && (
              <Button
                size="sm"
                className="flex-1"
                onClick={() => setZahlungOpen(true)}
                data-testid="button-zahlung-buchen-detail"
              >
                <Banknote className="h-4 w-4 mr-2" />
                Zahlung buchen
              </Button>
            )}
            {h.documentId ? (
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => navigate(`/dokumente/${h.documentId}/bearbeiten`)}
                data-testid="button-edit-detail"
              >
                <FileText className="h-4 w-4 mr-2" />
                Bearbeiten
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                disabled
                title="Nur fuer im System erstellte Rechnungen"
                data-testid="button-edit-detail"
              >
                <FileText className="h-4 w-4 mr-2" />
                Bearbeiten
              </Button>
            )}
          </div>

          <div>
            {!deleteConfirm ? (
              <Button
                size="sm"
                variant="outline"
                className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => setDeleteConfirm(true)}
                disabled={h.bezahlflag === 2 || h.bezahlflag === 3}
                title={h.bezahlflag >= 2 ? "Bezahlte Rechnungen koennen nicht geloescht werden" : undefined}
                data-testid="button-delete-detail"
              >
                <X className="h-4 w-4 mr-2" />
                Rechnung loeschen
              </Button>
            ) : (
              <div className="flex gap-2 items-center bg-red-50 dark:bg-red-950/20 p-2 rounded-lg">
                <span className="text-xs text-red-700 flex-1">Wirklich loeschen?</span>
                <Button size="sm" variant="destructive" className="h-7 text-xs"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(reId)}
                  data-testid="button-confirm-delete"
                >
                  {deleteMutation.isPending ? "Loescht..." : "Ja, loeschen"}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => setDeleteConfirm(false)}
                  data-testid="button-cancel-delete"
                >
                  Abbrechen
                </Button>
              </div>
            )}
          </div>

          <ZahlungDialog
            open={zahlungOpen}
            onOpenChange={setZahlungOpen}
            reId={reId}
            offen={h.offen}
            brutto={h.brutto || h.betrag}
            rnr={h.rnr}
            adrSuch={h.adrSuch}
            skProzent={h.skProzent}
          />

          {data.zahlungen.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold mb-1.5 flex items-center gap-1"><Banknote className="h-3 w-3" /> Zahlungen ({data.zahlungen.length})</h4>
              <div className="border rounded overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] py-1 px-2">Datum</TableHead>
                      <TableHead className="text-[10px] py-1 px-2 text-right">Zahlung</TableHead>
                      <TableHead className="text-[10px] py-1 px-2 text-right">Skonto</TableHead>
                      <TableHead className="text-[10px] py-1 px-2">Konto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.zahlungen.map((z: any) => (
                      <TableRow key={z.id}>
                        <TableCell className="text-[11px] py-1 px-2">{fmtDate(z.zahldat || z.belegdat)}</TableCell>
                        <TableCell className="text-[11px] py-1 px-2 text-right font-medium">{fmtCurrency(z.zahlung)}</TableCell>
                        <TableCell className="text-[11px] py-1 px-2 text-right">{z.skBetrag > 0 ? fmtCurrency(z.skBetrag) : "-"}</TableCell>
                        <TableCell className="text-[10px] py-1 px-2 font-mono">{z.kontoG || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {data.verrechnungen.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold mb-1.5 flex items-center gap-1"><ArrowUpDown className="h-3 w-3" /> Verrechnungen ({data.verrechnungen.length})</h4>
              <div className="border rounded overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] py-1 px-2">Datum</TableHead>
                      <TableHead className="text-[10px] py-1 px-2 text-right">Betrag</TableHead>
                      <TableHead className="text-[10px] py-1 px-2">Konto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.verrechnungen.map((v: any) => (
                      <TableRow key={v.id}>
                        <TableCell className="text-[11px] py-1 px-2">{fmtDate(v.belegdat)}</TableCell>
                        <TableCell className="text-[11px] py-1 px-2 text-right font-medium">{fmtCurrency(v.betrag || v.brutto)}</TableCell>
                        <TableCell className="text-[10px] py-1 px-2 font-mono">{v.kontoG || v.kontoB || "3630"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {data.kasse.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold mb-1.5">Kassenbuchungen ({data.kasse.length})</h4>
              <div className="border rounded overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] py-1 px-2">Typ</TableHead>
                      <TableHead className="text-[10px] py-1 px-2">Datum</TableHead>
                      <TableHead className="text-[10px] py-1 px-2 text-right">Betrag</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.kasse.map((k: any) => (
                      <TableRow key={k.id}>
                        <TableCell className="text-[11px] py-1 px-2">{k.typ === "KE" ? "Eingang" : "Ausgang"}</TableCell>
                        <TableCell className="text-[11px] py-1 px-2">{fmtDate(k.belegdat)}</TableCell>
                        <TableCell className="text-[11px] py-1 px-2 text-right font-medium">{fmtCurrency(k.zahlung || k.betrag)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function InfoField({ label, value, bold, className }: { label: string; value: string; bold?: boolean; className?: string }) {
  return (
    <div>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <p className={`text-sm ${bold ? "font-semibold" : ""} ${className || ""}`}>{value || "-"}</p>
    </div>
  );
}

function StatisticsPanel({ art, dateFrom, dateTo }: { art: string; dateFrom?: string; dateTo?: string }) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const years = Array.from({ length: currentYear - 2010 }, (_, i) => String(currentYear - i));

  const qs = new URLSearchParams({ art });
  if (dateFrom && dateTo) {
    qs.set("dateFrom", dateFrom);
    qs.set("dateTo", dateTo);
  } else if (selectedYear !== "alle") {
    qs.set("year", selectedYear);
  }

  const { data, isLoading } = useQuery<Statistics>({
    queryKey: ["/api/fibu/statistics", art, dateFrom, dateTo, selectedYear],
    queryFn: async () => {
      const res = await fetch(`/api/fibu/statistics?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Fehler");
      return res.json();
    },
  });

  if (isLoading) return <div className="space-y-3 p-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (!data) return null;

  const totalOffen = data.byStatus.reduce((s, r) => s + r.offen, 0);
  const u = data.umsatzUebersicht;

  const periodLabel = dateFrom && dateTo
    ? `vom ${fmtDate(dateFrom)} bis ${fmtDate(dateTo)}`
    : selectedYear === "alle" ? "Gesamt" : `Jahr ${selectedYear}`;

  return (
    <div className="space-y-4" data-testid="statistics-panel">
      {!dateFrom && !dateTo && (
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[120px] h-7 text-xs" data-testid="select-stat-year"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Jahre</SelectItem>
              {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {u && (
        <Card className="border-primary/20 bg-primary/[0.02]" data-testid="umsatz-uebersicht">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Statistik (Uebersicht Umsatz/Forderungen)
            </CardTitle>
            <p className="text-xs text-muted-foreground">Belegdatum {periodLabel}</p>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
              <div className="flex justify-between text-sm py-0.5">
                <span>Erloese</span>
                <span className="font-semibold tabular-nums" data-testid="umsatz-erloese">{fmtCurrency(u.erloese)}</span>
              </div>
              <div />
              <div className="flex justify-between text-sm py-0.5 text-red-600">
                <span>Gutschriften</span>
                <span className="font-semibold tabular-nums" data-testid="umsatz-gutschriften">-{fmtCurrency(u.gutschriftenNetto)}</span>
              </div>
              <div className="flex items-center text-xs text-muted-foreground">
                ({u.gutschriftenCount} Stk.)
              </div>
              <div className="flex justify-between text-sm py-0.5 text-orange-600">
                <span>Skonto gez.</span>
                <span className="font-semibold tabular-nums" data-testid="umsatz-skonto">-{fmtCurrency(u.skontoGez)}</span>
              </div>
              <div />
              {u.minderung > 0.01 && (
                <>
                  <div className="flex justify-between text-sm py-0.5 text-orange-600">
                    <span>Minderung</span>
                    <span className="font-semibold tabular-nums">-{fmtCurrency(u.minderung)}</span>
                  </div>
                  <div />
                </>
              )}
              <div className="flex justify-between text-sm py-1 border-t border-border mt-1 font-semibold">
                <span>Netto</span>
                <span className="tabular-nums" data-testid="umsatz-netto">{fmtCurrency(u.netto)}</span>
              </div>
              <div />
              <div className="flex justify-between text-sm py-0.5">
                <span>Steuer-Betrag</span>
                <span className="tabular-nums" data-testid="umsatz-steuer">{fmtCurrency(u.steuerBetrag)}</span>
              </div>
              <div />
              <div className="flex justify-between text-sm py-1 border-t border-border mt-1 font-bold text-base">
                <span>Brutto</span>
                <span className="tabular-nums" data-testid="umsatz-brutto">{fmtCurrency(u.brutto)}</span>
              </div>
              <div />
            </div>
            <div className="mt-2 pt-2 border-t border-border flex justify-between text-xs text-muted-foreground">
              <span>{u.rechnungenCount} Rechnungen/Gutschriften</span>
              {totalOffen > 0.01 && <span className="text-red-600 font-medium">{fmtCurrency(totalOffen)} offen</span>}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Nach Status</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {data.byStatus.map(s => (
              <div key={s.status} className="flex items-center justify-between text-sm" data-testid={`stat-status-${s.status}`}>
                <div className="flex items-center gap-2">
                  {statusBadge(s.status)}
                  <span className="text-muted-foreground">{s.count} Stk.</span>
                </div>
                <div className="flex gap-4 tabular-nums">
                  <span>{fmtCurrency(s.brutto)}</span>
                  {s.offen > 0.01 && <span className="text-red-600 font-medium">{fmtCurrency(s.offen)} offen</span>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top Kunden</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 max-h-64 overflow-y-auto">
            {data.byCustomer.slice(0, 15).map(c => (
              <div key={c.name} className="flex items-center justify-between text-sm" data-testid={`stat-customer-${c.name}`}>
                <span className="truncate flex-1 font-medium">{c.name}</span>
                <span className="text-muted-foreground tabular-nums ml-2">{c.count}x</span>
                <span className="tabular-nums ml-3 w-24 text-right">{fmtCurrency(c.brutto)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {data.byMonth.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Monatliche Umsaetze</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {data.byMonth.map(m => (
                <div key={m.month} className="text-center p-2 bg-muted/30 rounded" data-testid={`stat-month-${m.month}`}>
                  <p className="text-[10px] text-muted-foreground">{m.month}</p>
                  <p className="text-sm font-semibold tabular-nums">{fmtCurrency(m.netto)}</p>
                  <p className="text-[10px] text-muted-foreground">{m.count} Rech.</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.byKonto.length > 1 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Nach Erloeskonto</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {data.byKonto.map(k => (
              <div key={k.konto} className="flex items-center justify-between text-sm">
                <span className="font-mono text-xs">{k.konto || "-"}</span>
                <span className="text-muted-foreground">{k.count}x</span>
                <span className="tabular-nums font-medium">{fmtCurrency(k.netto)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function RechnungsbuchPage() {
  const [location, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("fibu");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [typFilter, setTypFilter] = useState("alle");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [fibuPage, setFibuPage] = useState(0);
  const fibuPageSize = 50;
  const [selectedReId, setSelectedReId] = useState<number | null>(null);

  const [dunningDialogOpen, setDunningDialogOpen] = useState(false);
  const [selectedOpenItem, setSelectedOpenItem] = useState<OpenItem | null>(null);
  const [dunningLevel, setDunningLevel] = useState("1");
  const [dunningFee, setDunningFee] = useState("0,00");
  const [dunningText, setDunningText] = useState("");

  const [opDialogOpen, setOpDialogOpen] = useState(false);
  const [opDate, setOpDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [opAmount, setOpAmount] = useState("");
  const [opCustomerId, setOpCustomerId] = useState<number | null>(null);
  const [opReference, setOpReference] = useState("");
  const [opBankAccount, setOpBankAccount] = useState("bank");
  const [opSkontoEnabled, setOpSkontoEnabled] = useState(false);
  const [opSkontoPercent, setOpSkontoPercent] = useState("2.00");
  const [customerSearch, setCustomerSearch] = useState("");

  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const month = params.get("month");
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split("-");
      const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
      setDateFrom(`${y}-${m}-01`);
      setDateTo(`${y}-${m}-${String(lastDay).padStart(2, "0")}`);
      setActiveTab("fibu");
    }
  }, [location]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fibuQs = new URLSearchParams();
  fibuQs.set("limit", String(fibuPageSize));
  fibuQs.set("offset", String(fibuPage * fibuPageSize));
  if (debouncedSearch) fibuQs.set("search", debouncedSearch);
  if (statusFilter !== "alle") fibuQs.set("status", statusFilter);
  if (typFilter !== "alle") fibuQs.set("typ", typFilter);
  if (dateFrom) fibuQs.set("dateFrom", dateFrom);
  if (dateTo) fibuQs.set("dateTo", dateTo);

  const { data: fibuResponse, isLoading: fibuLoading } = useQuery<FibuResponse>({
    queryKey: ["/api/outgoing-invoices-fibu", fibuPage, debouncedSearch, statusFilter, typFilter, dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`/api/outgoing-invoices-fibu?${fibuQs}`, { credentials: "include" });
      if (!res.ok) return { data: [], total: 0, totalNetto: 0, totalBrutto: 0, totalBezahlt: 0, totalOffen: 0, limit: fibuPageSize, offset: 0 };
      return res.json();
    },
  });

  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: openItemsData } = useQuery<{ items: OpenItem[]; summary: any }>({ queryKey: ["/api/open-items"] });

  const customerMap = useMemo(() => new Map(customers?.map((c) => [c.id, c]) || []), [customers]);
  const fibuData = fibuResponse?.data || [];
  const fibuTotal = fibuResponse?.total || 0;
  const fibuTotalPages = Math.ceil(fibuTotal / fibuPageSize);

  const selectedInvoice = useMemo(() => fibuData.find(inv => inv.reId === selectedReId) || null, [fibuData, selectedReId]);

  useEffect(() => {
    if (selectedReId && fibuData.length > 0 && !fibuData.some(inv => inv.reId === selectedReId)) {
      setSelectedReId(null);
    }
  }, [fibuData, selectedReId]);

  const overdueItems = useMemo(() => (openItemsData?.items || []).filter(i => i.overdueDays > 0), [openItemsData]);

  const mahnwesenSummary = useMemo(() => {
    const items = openItemsData?.items || [];
    const overdue = items.filter(i => i.overdueDays > 0);
    return {
      faellig: items.length,
      ueberfaellig: overdue.length,
      totalFaellig: items.reduce((s, i) => s + parseFloat(i.openAmount), 0),
      totalUeberfaellig: overdue.reduce((s, i) => s + parseFloat(i.openAmount), 0),
    };
  }, [openItemsData]);

  const parseDeNum = (v: string) => parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;

  const dunningMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/dunning-entries", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/open-items"] });
      setDunningDialogOpen(false);
      setSelectedOpenItem(null);
      toast({ title: "Mahnung erstellt", description: `${DUNNING_LABELS[parseInt(dunningLevel)] || `Stufe ${dunningLevel}`} wurde erstellt.` });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const batchDunningMutation = useMutation({
    mutationFn: async (docIds: number[]) => {
      const res = await apiRequest("POST", "/api/dunning-run", { documentIds: docIds });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/open-items"] });
      toast({ title: "Mahnlauf abgeschlossen", description: `${data.processed} Mahnungen erstellt${data.skipped > 0 ? `, ${data.skipped} uebersprungen` : ""}` });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const paymentMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", "/api/payments", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/open-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/outgoing-invoices-fibu"] });
      setOpDialogOpen(false);
      toast({ title: "Zahlung gebucht" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const openDunningFromOpenItem = (item: OpenItem) => {
    setSelectedOpenItem(item);
    const nextLevel = Math.min(item.dunningLevel + 1, 3);
    setDunningLevel(String(nextLevel));
    setDunningFee(DEFAULT_FEES[nextLevel] || "5,00");
    setDunningText(DEFAULT_TEXTS[nextLevel] || "");
    setDunningDialogOpen(true);
  };

  const handleDunningSave = () => {
    if (!selectedOpenItem) return;
    const fee = parseFloat(dunningFee.replace(",", "."));
    if (isNaN(fee)) { toast({ title: "Fehler", description: "Bitte gueltige Mahngebuehr eingeben", variant: "destructive" }); return; }
    const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + 14);
    dunningMutation.mutate({
      documentId: selectedOpenItem.id,
      level: parseInt(dunningLevel),
      date: new Date().toISOString().slice(0, 10),
      fee: fee.toFixed(2),
      text: dunningText || `Mahnung Stufe ${dunningLevel}`,
      dueDate: dueDate.toISOString().slice(0, 10),
    });
  };

  const handleBatchDunning = () => {
    const eligible = overdueItems.filter(i => !i.noReminder && i.dunningLevel < 3);
    if (eligible.length === 0) {
      toast({ title: "Keine faelligen Rechnungen", description: "Alle ueberfaelligen sind bereits auf Stufe 3 oder haben Mahnsperre.", variant: "destructive" });
      return;
    }
    batchDunningMutation.mutate(eligible.map(i => i.id));
  };

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    if (!customerSearch.trim()) return customers.slice(0, 30);
    const q = customerSearch.toLowerCase();
    return customers.filter(c => c.name?.toLowerCase().includes(q) || c.customerNumber?.toLowerCase().includes(q)).slice(0, 30);
  }, [customers, customerSearch]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between px-4 pt-3 pb-2 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-rechnungsbuch-title">Rechnungsausgangsbuch</h1>
          <p className="text-muted-foreground text-xs">
            {fibuTotal} Ausgangsrechnungen
            {mahnwesenSummary.ueberfaellig > 0 && <span className="text-red-600 ml-2">* {mahnwesenSummary.ueberfaellig} ueberfaellig</span>}
          </p>
        </div>
        <Button size="sm" onClick={() => setOpDialogOpen(true)} data-testid="button-zahlung-buchen" className="gap-1">
          <Banknote className="h-3.5 w-3.5" /> Zahlung buchen
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 px-4">
        <TabsList data-testid="tabs-rechnungsbuch" className="w-fit">
          <TabsTrigger value="fibu" data-testid="tab-fibu" className="gap-1 text-xs">
            <FileText className="h-3 w-3" /> Rechnungen
          </TabsTrigger>
          <TabsTrigger value="mahnwesen" data-testid="tab-mahnwesen" className="gap-1 text-xs">
            <FileWarning className="h-3 w-3" /> Mahnwesen
            {mahnwesenSummary.ueberfaellig > 0 && (
              <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">{mahnwesenSummary.ueberfaellig}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="statistik" data-testid="tab-statistik" className="gap-1 text-xs">
            <BarChart3 className="h-3 w-3" /> Auswertungen
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fibu" className="flex-1 flex flex-col min-h-0 mt-2">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <div className="flex-1 min-w-[150px] max-w-xs relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input data-testid="input-search" placeholder="Nr., Kunde, Projekt..."
                className="pl-7 h-7 text-xs" value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setFibuPage(0); }} />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setFibuPage(0); }}>
              <SelectTrigger data-testid="select-status-filter" className="w-[110px] h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle Status</SelectItem>
                <SelectItem value="offen">Offen</SelectItem>
                <SelectItem value="teilbezahlt">Teilbezahlt</SelectItem>
                <SelectItem value="bezahlt">Bezahlt</SelectItem>
                <SelectItem value="gemahnt">Gemahnt</SelectItem>
                <SelectItem value="storniert">Storniert</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typFilter} onValueChange={(v) => { setTypFilter(v); setFibuPage(0); }}>
              <SelectTrigger className="w-[100px] h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle Typen</SelectItem>
                <SelectItem value="HR">Rechnungen</SelectItem>
                <SelectItem value="HG">Gutschriften</SelectItem>
              </SelectContent>
            </Select>
            <div className="hidden md:flex items-center gap-1">
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setFibuPage(0); }} className="w-[120px] h-7 text-xs" data-testid="input-date-from" />
              <span className="text-[10px] text-muted-foreground">-</span>
              <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setFibuPage(0); }} className="w-[120px] h-7 text-xs" data-testid="input-date-to" />
            </div>
            {(searchTerm || statusFilter !== "alle" || typFilter !== "alle" || dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" className="h-7 text-[10px] px-2" onClick={() => {
                setSearchTerm(""); setStatusFilter("alle"); setTypFilter("alle"); setDateFrom(""); setDateTo(""); setFibuPage(0);
              }} data-testid="button-reset-filters">
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-1 mb-2 flex-wrap">
            {[
              { label: "Dieser Monat", key: "monat", fn: () => { const now = new Date(); return { from: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`, to: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()).padStart(2,'0')}` }; } },
              { label: "Letzter Monat", key: "lmonat", fn: () => { const now = new Date(); const pm = new Date(now.getFullYear(), now.getMonth()-1, 1); return { from: `${pm.getFullYear()}-${String(pm.getMonth()+1).padStart(2,'0')}-01`, to: `${pm.getFullYear()}-${String(pm.getMonth()+1).padStart(2,'0')}-${String(new Date(pm.getFullYear(), pm.getMonth()+1, 0).getDate()).padStart(2,'0')}` }; } },
              { label: "Quartal", key: "quartal", fn: () => { const now = new Date(); const q = Math.floor(now.getMonth()/3); const s = new Date(now.getFullYear(), q*3, 1); const e = new Date(now.getFullYear(), q*3+3, 0); return { from: s.toISOString().slice(0,10), to: e.toISOString().slice(0,10) }; } },
              { label: "Halbjahr", key: "halbjahr", fn: () => { const now = new Date(); const h = now.getMonth() < 6 ? 0 : 6; const s = new Date(now.getFullYear(), h, 1); const e = new Date(now.getFullYear(), h+6, 0); return { from: s.toISOString().slice(0,10), to: e.toISOString().slice(0,10) }; } },
              { label: "Dieses Jahr", key: "jahr", fn: () => { const y = new Date().getFullYear(); return { from: `${y}-01-01`, to: `${y}-12-31` }; } },
              { label: "Letztes Jahr", key: "ljahr", fn: () => { const y = new Date().getFullYear()-1; return { from: `${y}-01-01`, to: `${y}-12-31` }; } },
              { label: "Alles", key: "alles", fn: () => ({ from: "", to: "" }) },
            ].map(({ label, key, fn }) => {
              const { from, to } = fn();
              const active = dateFrom === from && dateTo === to;
              return (
                <Button key={key} variant={active ? "default" : "outline"} size="sm"
                  className="h-6 text-[10px] px-2" data-testid={`btn-period-${key}`}
                  onClick={() => { setDateFrom(from); setDateTo(to); setFibuPage(0); }}>
                  {label}
                </Button>
              );
            })}
          </div>

          <div className="flex-1 flex flex-col md:flex-row gap-0 min-h-0 border rounded-lg overflow-hidden">
            <div className={`${selectedReId ? "md:w-[55%] lg:w-[60%]" : "w-full"} flex flex-col min-h-0 ${selectedReId ? "h-[40vh] md:h-full" : "h-full"}`}>
              <ScrollArea className="flex-1">
                {fibuLoading ? (
                  <div className="p-4 space-y-2">{[...Array(10)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px] py-1.5 px-2 sticky top-0 bg-background">Nr.</TableHead>
                        <TableHead className="text-[10px] py-1.5 px-2 sticky top-0 bg-background">Kunde</TableHead>
                        <TableHead className="text-[10px] py-1.5 px-2 sticky top-0 bg-background hidden lg:table-cell">Datum</TableHead>
                        <TableHead className="text-[10px] py-1.5 px-2 sticky top-0 bg-background text-right">Brutto</TableHead>
                        <TableHead className="text-[10px] py-1.5 px-2 sticky top-0 bg-background text-right">Offen</TableHead>
                        <TableHead className="text-[10px] py-1.5 px-2 sticky top-0 bg-background">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fibuData.length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8 text-sm">Keine Rechnungen gefunden</TableCell></TableRow>
                      )}
                      {fibuData.map((inv) => (
                        <TableRow
                          key={inv.fibuId}
                          data-testid={`row-fibu-${inv.fibuId}`}
                          className={`cursor-pointer transition-colors ${selectedReId === inv.reId ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/50"} ${inv.typ === "HG" ? "bg-red-50/30 dark:bg-red-950/10" : ""} ${inv.stornoFlag === 2 ? "opacity-50" : ""}`}
                          onClick={() => setSelectedReId(selectedReId === inv.reId ? null : inv.reId)}
                        >
                          <TableCell className="py-1.5 px-2">
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-[11px] font-medium" data-testid={`text-nr-${inv.fibuId}`}>{fmtDocNumber(inv.documentNumber)}</span>
                              {typBadge(inv.typ)}
                            </div>
                          </TableCell>
                          <TableCell className="py-1.5 px-2">
                            <a
                              className="text-xs font-medium truncate block max-w-[140px] hover:text-primary hover:underline cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); navigate(`/adressen?search=${encodeURIComponent(inv.customerNumber)}`); }}
                              title={`${inv.customerName} (${inv.customerNumber})`}
                              data-testid={`text-customer-${inv.fibuId}`}
                            >{inv.customerName}</a>
                          </TableCell>
                          <TableCell className="py-1.5 px-2 text-[11px] text-muted-foreground hidden lg:table-cell">{fmtDate(inv.date)}</TableCell>
                          <TableCell className="py-1.5 px-2 text-right text-xs font-medium tabular-nums">{fmtCurrency(inv.grossTotal)}</TableCell>
                          <TableCell className={`py-1.5 px-2 text-right text-xs tabular-nums font-medium ${inv.openAmount > 0.01 ? "text-red-600" : "text-green-600"}`}>
                            {fmtCurrency(Math.max(0, inv.openAmount))}
                          </TableCell>
                          <TableCell className="py-1.5 px-2">{statusBadge(inv.paymentStatus)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>

              <div className="flex items-center justify-between px-2 py-1.5 border-t bg-muted/30 text-[10px]">
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">S. {fibuPage + 1}/{Math.max(1, fibuTotalPages)} ({fibuTotal})</span>
                  <span className="hidden sm:inline"><b>{fmtCurrency(fibuResponse?.totalBrutto || 0)}</b> Brutto</span>
                  <span className="hidden sm:inline"><b className="text-green-600">{fmtCurrency(fibuResponse?.totalBezahlt || 0)}</b> bez.</span>
                  <span className="hidden sm:inline"><b className="text-red-600">{fmtCurrency(fibuResponse?.totalOffen || 0)}</b> offen</span>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6" disabled={fibuPage === 0} onClick={() => setFibuPage(p => p - 1)} data-testid="button-prev-page">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" disabled={fibuPage >= fibuTotalPages - 1} onClick={() => setFibuPage(p => p + 1)} data-testid="button-next-page">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            {selectedReId && (
              <div className="md:w-[45%] lg:w-[40%] border-t md:border-t-0 md:border-l bg-background flex-1 md:flex-none min-h-0 overflow-hidden">
                <DetailPanel reId={selectedReId} invoice={selectedInvoice} onClose={() => setSelectedReId(null)} />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="mahnwesen" className="flex-1 overflow-auto mt-2 space-y-4 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30"><Clock className="h-4 w-4 text-amber-600" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Offene Posten</p>
                    <p className="text-xl font-bold" data-testid="text-mahn-faellig">{mahnwesenSummary.faellig}</p>
                    <p className="text-[10px] text-muted-foreground">{mahnwesenSummary.ueberfaellig} ueberfaellig</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30"><Euro className="h-4 w-4 text-red-600" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">Faellige Forderungen</p>
                    <p className="text-xl font-bold tabular-nums" data-testid="text-mahn-total">{fmtCurrency(mahnwesenSummary.totalFaellig)}</p>
                    <p className="text-[10px] text-red-600 font-medium">{fmtCurrency(mahnwesenSummary.totalUeberfaellig)} ueberfaellig</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex items-center justify-center">
                <Button onClick={handleBatchDunning} size="sm"
                  disabled={batchDunningMutation.isPending || overdueItems.filter(i => !i.noReminder && i.dunningLevel < 3).length === 0}
                  className="gap-1" data-testid="button-alle-mahnen">
                  <PlayCircle className="h-4 w-4" />
                  {batchDunningMutation.isPending ? "Laeuft..." : `Alle mahnen (${overdueItems.filter(i => !i.noReminder && i.dunningLevel < 3).length})`}
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><FileWarning className="h-4 w-4" /> Ueberfaellige ({overdueItems.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {overdueItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileWarning className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Keine ueberfaelligen Rechnungen</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">Rech-Nr.</TableHead>
                      <TableHead className="text-[10px]">Kunde</TableHead>
                      <TableHead className="text-[10px] text-center">Tage</TableHead>
                      <TableHead className="text-[10px] text-right">Offen</TableHead>
                      <TableHead className="text-[10px] text-center">Stufe</TableHead>
                      <TableHead className="text-[10px] text-right">Aktion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overdueItems.map((item) => {
                      const lastEntry = item.dunningEntries.length > 0 ? item.dunningEntries.sort((a: any, b: any) => b.level - a.level)[0] : null;
                      return (
                        <TableRow key={item.id} data-testid={`row-mahn-${item.id}`} className={item.overdueDays > 30 ? "bg-red-50/50 dark:bg-red-950/10" : ""}>
                          <TableCell className="font-mono text-[11px] font-medium" data-testid={`text-mahn-nr-${item.id}`}>{fmtDocNumber(item.documentNumber)}</TableCell>
                          <TableCell data-testid={`text-mahn-customer-${item.id}`}>
                            <span className="font-medium text-xs">{item.customerName}</span>
                            {item.noReminder && <Badge variant="outline" className="ml-1 text-[9px]">Sperre</Badge>}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className={`text-[10px] ${item.overdueDays > 30 ? "bg-red-100 text-red-800" : item.overdueDays > 14 ? "bg-orange-100 text-orange-800" : "bg-amber-100 text-amber-800"}`} data-testid={`badge-faellig-${item.id}`}>
                              {item.overdueDays}d
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium text-xs" data-testid={`text-mahn-offen-${item.id}`}>{fmtCurrency(item.openAmount)}</TableCell>
                          <TableCell className="text-center" data-testid={`badge-mahn-stufe-${item.id}`}>
                            {item.dunningLevel > 0 ? (
                              <Badge className={`text-[10px] ${DUNNING_COLORS[item.dunningLevel] || DUNNING_COLORS[3]}`}>
                                {item.dunningLevel}
                              </Badge>
                            ) : <span className="text-[10px] text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              {!item.noReminder && item.dunningLevel < 3 && (
                                <Button variant="outline" size="sm" className="text-[10px] h-6 px-2" onClick={() => openDunningFromOpenItem(item)} data-testid={`button-mahn-action-${item.id}`}>
                                  <AlertTriangle className="h-3 w-3 mr-0.5" /> Mahnen
                                </Button>
                              )}
                              {item.dunningLevel >= 3 && <Badge className="bg-red-600 text-white text-[9px]">Inkasso</Badge>}
                              {item.dunningLevel > 0 && (
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => window.open(`/api/dunning/${item.id}/pdf`, "_blank")} data-testid={`button-mahn-print-${item.id}`}>
                                  <Printer className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statistik" className="flex-1 overflow-auto mt-2 pb-4">
          <StatisticsPanel art="RA" dateFrom={dateFrom || undefined} dateTo={dateTo || undefined} />
        </TabsContent>
      </Tabs>

      <Dialog open={opDialogOpen} onOpenChange={(v) => { if (!v) setOpDialogOpen(false); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Banknote className="h-5 w-5" /> Zahlungseingang buchen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Datum</Label>
                <Input type="date" value={opDate} onChange={(e) => setOpDate(e.target.value)} data-testid="input-op-date" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Betrag</Label>
                <Input value={opAmount} onChange={(e) => setOpAmount(e.target.value)} placeholder="0,00" data-testid="input-op-amount" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kunde</Label>
              <div className="relative">
                <div className="flex items-center border rounded-md px-2 gap-1">
                  <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <Input
                    value={opCustomerId ? (customerMap.get(opCustomerId)?.name || "") : customerSearch}
                    onChange={(e) => { setCustomerSearch(e.target.value); if (opCustomerId) setOpCustomerId(null); }}
                    placeholder="Kunde suchen..."
                    className="border-0 h-8 focus-visible:ring-0 px-0"
                    data-testid="input-op-customer"
                  />
                  {opCustomerId && (
                    <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { setOpCustomerId(null); setCustomerSearch(""); }} data-testid="button-clear-customer">x</button>
                  )}
                </div>
                {!opCustomerId && customerSearch.trim() && filteredCustomers.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg max-h-40 overflow-y-auto">
                    {filteredCustomers.map((c) => (
                      <button key={c.id} className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex justify-between" onClick={() => { setOpCustomerId(c.id); setCustomerSearch(""); }} data-testid={`option-customer-${c.id}`}>
                        <span className="font-medium">{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.customerNumber} - {c.city}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Bank/Kasse</Label>
                <Select value={opBankAccount} onValueChange={setOpBankAccount}>
                  <SelectTrigger data-testid="select-op-bank"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">Bankkonto</SelectItem>
                    <SelectItem value="kasse">Barkasse</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Verwendung</Label>
                <Input value={opReference} onChange={(e) => setOpReference(e.target.value)} placeholder="Verwendungszweck" data-testid="input-op-reference" />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="secondary" onClick={() => setOpDialogOpen(false)} data-testid="button-cancel-op">Abbrechen</Button>
              <Button onClick={() => {
                if (!opCustomerId || parseDeNum(opAmount) <= 0) { toast({ title: "Fehler", description: "Kunde und Betrag sind erforderlich", variant: "destructive" }); return; }
                paymentMutation.mutate({ date: opDate, amount: parseDeNum(opAmount), customerId: opCustomerId, bankAccount: opBankAccount, reference: opReference, allocations: [], skontoApplied: opSkontoEnabled });
              }} disabled={paymentMutation.isPending} data-testid="button-submit-payment">
                <CreditCard className="h-4 w-4 mr-1" />
                {paymentMutation.isPending ? "Bucht..." : "Zahlung buchen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dunningDialogOpen} onOpenChange={(v) => { setDunningDialogOpen(v); if (!v) setSelectedOpenItem(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              {DUNNING_LABELS[parseInt(dunningLevel)] || "Mahnung"} erstellen
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedOpenItem && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Rechnung:</span> <span className="font-mono font-medium">{fmtDocNumber(selectedOpenItem.documentNumber)}</span></p>
                <p><span className="text-muted-foreground">Kunde:</span> <span className="font-medium">{selectedOpenItem.customerName}</span></p>
                <p><span className="text-muted-foreground">Offen:</span> <span className="font-medium tabular-nums">{fmtCurrency(selectedOpenItem.openAmount)}</span></p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Mahnstufe</Label>
                <Select value={dunningLevel} onValueChange={(v) => { setDunningLevel(v); setDunningFee(DEFAULT_FEES[parseInt(v)] || "5,00"); setDunningText(DEFAULT_TEXTS[parseInt(v)] || ""); }}>
                  <SelectTrigger data-testid="select-mahnstufe"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Zahlungserinnerung</SelectItem>
                    <SelectItem value="2">1. Mahnung</SelectItem>
                    <SelectItem value="3">2. Mahnung</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mahngebuehr (EUR)</Label>
                <Input value={dunningFee} onChange={(e) => setDunningFee(e.target.value)} data-testid="input-mahngebuehr" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mahntext</Label>
              <Textarea value={dunningText} onChange={(e) => setDunningText(e.target.value)} rows={4} data-testid="input-mahntext" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setDunningDialogOpen(false)}>Abbrechen</Button>
              <Button onClick={handleDunningSave} disabled={dunningMutation.isPending} className="bg-orange-600 hover:bg-orange-700" data-testid="button-save-mahnung">
                {dunningMutation.isPending ? "Erstellt..." : "Mahnung erstellen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
