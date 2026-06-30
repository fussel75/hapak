import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { IncomingInvoice, Project } from "@shared/schema";
import { invoiceStatusLabels } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fmtCurrency, fmtDate, fmtNumber, fmtDocNumber } from "@/lib/format";
import { ZahlungDialog } from "@/components/zahlung-dialog";
import {
  Plus, Pencil, Trash2, CreditCard, Upload, FileText, ChevronDown, ChevronUp,
  Loader2, Search, Database, X, Eye, ChevronLeft, ChevronRight, BarChart3,
  Filter, Calendar, Receipt, ArrowUpDown, Banknote, SplitSquareVertical, PanelRightOpen
} from "lucide-react";

const statusColors: Record<string, string> = {
  offen: "", teilbezahlt: "bg-yellow-100 text-yellow-800", bezahlt: "bg-green-100 text-green-800",
  ueberfaellig: "bg-red-100 text-red-800", storniert: "bg-gray-200 text-gray-600",
};

const SKR03_KONTEN = [
  { konto: "5400", bez: "Wareneingang 19% VSt" },
  { konto: "5420", bez: "EG-Erwerb 7% Vorsteuer und 7% USt" },
  { konto: "5425", bez: "Innergemeinschaftl. Erwerb 19% VSt und 19% USt" },
  { konto: "5430", bez: "EG-Erwerb ohne Vorsteuer und 7% USt" },
  { konto: "5433", bez: "Innergemeinschaftl. Erwerb 16% VSt und 16% USt" },
  { konto: "5435", bez: "Innergemeinschaftl. Erwerb ohne VSt und 19% USt" },
  { konto: "5436", bez: "Innergemeinschaftl. Erwerb ohne VSt und 16% USt" },
  { konto: "5440", bez: "Innergemeinschaftl. Erwerb Neufahrzeuge ohne USt-IdNr" },
  { konto: "5500", bez: "Wareneingang 5% Vorsteuer" },
  { konto: "5505", bez: "Wareneingang 5,5% VSt" },
  { konto: "5530", bez: "Wareneingang 9% Vorsteuer" },
  { konto: "5535", bez: "Wareneingang 10% Vorsteuer" },
  { konto: "5540", bez: "Wareneingang 10,7% VSt" },
  { konto: "5550", bez: "Steuerfreier EG-Erwerb" },
  { konto: "5565", bez: "Waren aus Umsatzsteuerlager, §13b UStG 19% VSt und 19% USt" },
  { konto: "5566", bez: "Waren aus Umsatzsteuerlager, §13b UStG 16% VSt und 16% USt" },
  { konto: "5600", bez: "Nicht abziehbare Vorsteuer" },
  { konto: "5610", bez: "Nicht abziehbare Vorsteuer 7%" },
  { konto: "5650", bez: "Nicht abziehbare Vorsteuer 19%" },
  { konto: "5660", bez: "Nicht abziehbare Vorsteuer 19%" },
  { konto: "5700", bez: "Nachlässe" },
  { konto: "5710", bez: "Nachlässe 7% Vorsteuer" },
  { konto: "5720", bez: "Nachlässe 19% VSt" },
  { konto: "3300", bez: "Verbindlichkeiten aus Lieferungen und Leistungen" },
  { konto: "3400", bez: "Verbindlichkeiten aus Lieferungen (§13b)" },
  { konto: "4200", bez: "Raumkosten" },
  { konto: "4210", bez: "Miete (unbewegliche Wirtschaftsgüter)" },
  { konto: "4240", bez: "Gas, Strom, Wasser" },
  { konto: "4250", bez: "Reinigung" },
  { konto: "4260", bez: "Instandhaltung betrieblicher Räume" },
  { konto: "4300", bez: "Versicherungen" },
  { konto: "4360", bez: "Beiträge" },
  { konto: "4500", bez: "Fahrzeugkosten" },
  { konto: "4510", bez: "Kfz-Steuer" },
  { konto: "4520", bez: "Kfz-Versicherung" },
  { konto: "4530", bez: "Laufende Kfz-Betriebskosten" },
  { konto: "4540", bez: "Kfz-Reparaturen" },
  { konto: "4570", bez: "Fremdfahrzeuge" },
  { konto: "4580", bez: "Sonstige Kfz-Kosten" },
  { konto: "4600", bez: "Werbekosten" },
  { konto: "4610", bez: "Werbekosten" },
  { konto: "4630", bez: "Geschenke abziehbar" },
  { konto: "4640", bez: "Repräsentationskosten" },
  { konto: "4650", bez: "Bewirtungskosten" },
  { konto: "4660", bez: "Reisekosten Arbeitnehmer" },
  { konto: "4670", bez: "Reisekosten Unternehmer" },
  { konto: "4700", bez: "Kosten der Warenabgabe" },
  { konto: "4710", bez: "Verpackungsmaterial" },
  { konto: "4730", bez: "Ausgangsfrachten" },
  { konto: "4780", bez: "Fremdleistungen" },
  { konto: "4800", bez: "Reparaturen und Instandhaltung" },
  { konto: "4805", bez: "Reparaturen und Instandhaltung Gebäude" },
  { konto: "4830", bez: "Abfallbeseitigung" },
  { konto: "4900", bez: "Sonstige betriebliche Aufwendungen" },
  { konto: "4910", bez: "Porto" },
  { konto: "4920", bez: "Telefon" },
  { konto: "4930", bez: "Bürobedarf" },
  { konto: "4940", bez: "Zeitschriften, Bücher" },
  { konto: "4950", bez: "Rechts- und Beratungskosten" },
  { konto: "4955", bez: "Buchführungskosten" },
  { konto: "4957", bez: "Abschluss- und Prüfungskosten" },
  { konto: "4960", bez: "Miete für Einrichtungen" },
  { konto: "4964", bez: "Leasing" },
  { konto: "4969", bez: "Aufwendungen für Abraum- und Abfallbeseitigung" },
  { konto: "4970", bez: "Nebenkosten des Geldverkehrs" },
  { konto: "4980", bez: "Werkzeuge und Kleingeräte" },
];

function isOverdue(inv: IncomingInvoice): boolean {
  if (inv.status === "bezahlt") return false;
  if (!inv.dueDate) return false;
  return new Date(inv.dueDate) < new Date(new Date().toISOString().split("T")[0]);
}
function getEffectiveStatus(inv: IncomingInvoice): string {
  if (inv.status === "bezahlt") return "bezahlt";
  if (isOverdue(inv)) return "ueberfaellig";
  return inv.status;
}

interface FibuInvoice {
  id: number;
  reId?: number;
  invoiceNumber: string;
  supplier: string;
  subject: string;
  date: string;
  dueDate: string;
  paymentDate: string;
  netTotal: number;
  grossTotal: number;
  paidAmount: number;
  openAmount: number;
  projectNumber: string;
  kostenstelle?: string;
  typ?: string;
  status: string;
  dunningLevel: number;
  stornoFlag: number;
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

type ManualIncomingInvoice = IncomingInvoice & {
  registeredReId?: number | null;
};

interface DocumentAttachment {
  id: number;
  originalFilename: string;
  storedFilename?: string | null;
  filePath?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  title?: string | null;
  source?: string | null;
  createdAt?: string | null;
}

interface FibuDetail {
  hauptsatz: any;
  nebensaetze: any[];
  zahlungen: any[];
  verrechnungen: any[];
  splits: any[];
  kasse: any[];
}

interface Statistics {
  byStatus: { status: string; count: number; netto: number; brutto: number; bezahlt: number; offen: number }[];
  byCustomer: { name: string; adrNr: string; count: number; netto: number; brutto: number; offen: number }[];
  byMonth: { month: string; count: number; netto: number; brutto: number }[];
  byKonto: { konto: string; count: number; netto: number }[];
  gutschriften: { count: number; brutto: number };
  skontoTotal: number;
}

function InfoField({ label, value, bold, className }: { label: string; value: string; bold?: boolean; className?: string }) {
  return (
    <div>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <p className={`text-sm ${bold ? "font-semibold" : ""} ${className || ""}`}>{value || "—"}</p>
    </div>
  );
}

function DetailPanel({ reId, onClose }: { reId: number; onClose: () => void }) {
  const [zahlungOpen, setZahlungOpen] = useState(false);
  const { data, isLoading } = useQuery<FibuDetail>({
    queryKey: ["/api/fibu", reId, "details"],
    queryFn: async () => {
      const res = await fetch(`/api/fibu/${reId}/details`, { credentials: "include" });
      if (!res.ok) throw new Error("Fehler");
      return res.json();
    },
    enabled: reId > 0,
  });
  const { data: attachments = [] } = useQuery<DocumentAttachment[]>({
    queryKey: ["/api/fibu", reId, "attachments"],
    queryFn: async () => {
      const res = await fetch(`/api/fibu/${reId}/attachments`, { credentials: "include" });
      if (!res.ok) throw new Error("Belege konnten nicht geladen werden");
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
      <p className="text-sm">Rechnung wählen um Details zu sehen</p>
    </div>
  );

  const h = data.hauptsatz;
  const isGutschrift = h.typ === "HG";
  const canPay = (h.bezahlflag === 0 || h.bezahlflag === 1) && h.stornoflag !== 2;

  return (
    <div className="h-full flex flex-col" data-testid="detail-panel-re">
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 shrink-0" />
            <span className="font-semibold text-sm truncate">{fmtDocNumber(h.rnr)}</span>
            {isGutschrift && <Badge className="bg-red-100 text-red-800 text-[10px] shrink-0">Gutschrift</Badge>}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            <a className="hover:text-primary hover:underline cursor-pointer" onClick={() => window.location.href = `/adressen?search=${encodeURIComponent(h.adrNr || h.adrSuch)}`}>{h.adrSuch}</a>
            {" — "}{h.betreff}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose} data-testid="button-close-detail-re"><X className="h-4 w-4" /></Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <InfoField label="Belegdatum" value={fmtDate(h.belegdat)} />
            <InfoField label="Fällig" value={fmtDate(h.faelligdat)} />
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
            <div className="flex items-center gap-3 text-xs bg-green-50 dark:bg-green-950/20 rounded p-2">
              <span className="text-muted-foreground">Skonto:</span>
              <span className="font-medium">{fmtCurrency(h.skBetrag)} ({fmtNumber(h.skProzent)}%)</span>
            </div>
          )}

          {(h.minderung > 0 || h.gutschrift !== 0 || h.kuerzung !== 0) && (
            <div className="grid grid-cols-3 gap-2 bg-muted/30 rounded-lg p-2.5 text-xs">
              <InfoField label="Minderung" value={fmtCurrency(h.minderung)} />
              <InfoField label="Gutschrift" value={fmtCurrency(h.gutschrift)} />
              <InfoField label="Kürzung" value={fmtCurrency(h.kuerzung)} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            <InfoField label="Kreditor-Konto" value={h.kontoB || "—"} />
            <InfoField label="Aufwandskonto" value={h.kontoG || "—"} />
            <div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Projekt/KTR</span>
              {h.ktr ? (
                <a className="text-xs font-medium hover:text-primary hover:underline cursor-pointer" onClick={() => window.location.href = `/projekte?search=${encodeURIComponent(h.ktr)}`}>{fmtDocNumber(h.ktr)}</a>
              ) : <span className="text-xs font-medium">—</span>}
            </div>
            <InfoField label="Kostenstelle" value={h.kst || "—"} />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <Badge variant="outline" className="text-[10px]">
              {h.bezahlflag === 0 ? "Offen" : h.bezahlflag === 1 ? "Teilzahlung" : h.bezahlflag === 2 ? "Bezahlt" : "Überzahlung"}
            </Badge>
            {h.stornoflag === 2 && <Badge className="bg-gray-200 text-gray-600 text-[10px]">Storniert</Badge>}
          </div>

          {attachments.length > 0 && (
            <div className="space-y-1.5" data-testid="fibu-attachment-list">
              <h4 className="text-xs font-semibold flex items-center gap-1">
                <FileText className="h-3 w-3" /> Belege ({attachments.length})
              </h4>
              <div className="space-y-1">
                {attachments.map((attachment) => (
                  <Button
                    key={attachment.id}
                    size="sm"
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => window.open(`/api/document-attachments/${attachment.id}/file`, "_blank")}
                    data-testid={`button-view-fibu-attachment-${attachment.id}`}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                    <span className="truncate">{attachment.title || attachment.originalFilename || `Beleg ${attachment.id}`}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {canPay && (
            <Button
              size="sm"
              className="w-full"
              onClick={() => setZahlungOpen(true)}
              data-testid="button-zahlung-buchen-re"
            >
              <Banknote className="h-4 w-4 mr-2" />
              Zahlung buchen
            </Button>
          )}

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
                  <TableHeader><TableRow>
                    <TableHead className="text-[10px] py-1 px-2">Datum</TableHead>
                    <TableHead className="text-[10px] py-1 px-2 text-right">Zahlung</TableHead>
                    <TableHead className="text-[10px] py-1 px-2 text-right">Skonto</TableHead>
                    <TableHead className="text-[10px] py-1 px-2">Konto</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {data.zahlungen.map((z: any) => (
                      <TableRow key={z.id}>
                        <TableCell className="text-[11px] py-1 px-2">{fmtDate(z.zahldat || z.belegdat)}</TableCell>
                        <TableCell className="text-[11px] py-1 px-2 text-right font-medium">{fmtCurrency(z.zahlung)}</TableCell>
                        <TableCell className="text-[11px] py-1 px-2 text-right">{z.skBetrag > 0 ? fmtCurrency(z.skBetrag) : "—"}</TableCell>
                        <TableCell className="text-[10px] py-1 px-2 font-mono">{z.kontoB || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {data.splits.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold mb-1.5 flex items-center gap-1">
                <SplitSquareVertical className="h-3 w-3" /> Splitbuchungen ({data.splits.length})
              </h4>
              <div className="border rounded overflow-hidden">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-[10px] py-1 px-2 text-right">Brutto</TableHead>
                    <TableHead className="text-[10px] py-1 px-2 text-right">Zahlung</TableHead>
                    <TableHead className="text-[10px] py-1 px-2">KTR</TableHead>
                    <TableHead className="text-[10px] py-1 px-2">KST</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {data.splits.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-[11px] py-1 px-2 text-right">{fmtCurrency(s.brutto || s.betrag)}</TableCell>
                        <TableCell className="text-[11px] py-1 px-2 text-right font-medium">{fmtCurrency(s.zahlung)}</TableCell>
                        <TableCell className="text-[10px] py-1 px-2 font-mono">{s.ktr ? fmtDocNumber(s.ktr) : "—"}</TableCell>
                        <TableCell className="text-[10px] py-1 px-2">{s.kst || "—"}</TableCell>
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
                  <TableHeader><TableRow>
                    <TableHead className="text-[10px] py-1 px-2">Datum</TableHead>
                    <TableHead className="text-[10px] py-1 px-2 text-right">Betrag</TableHead>
                    <TableHead className="text-[10px] py-1 px-2">Konto</TableHead>
                  </TableRow></TableHeader>
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
                  <TableHeader><TableRow>
                    <TableHead className="text-[10px] py-1 px-2">Typ</TableHead>
                    <TableHead className="text-[10px] py-1 px-2">Datum</TableHead>
                    <TableHead className="text-[10px] py-1 px-2 text-right">Betrag</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {data.kasse.map((k: any) => (
                      <TableRow key={k.id}>
                        <TableCell className="text-[11px] py-1 px-2">{k.typ === "KA" ? "Ausgang" : "Eingang"}</TableCell>
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

function StatisticsPanel({ dateFrom, dateTo }: { dateFrom?: string; dateTo?: string }) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const years = Array.from({ length: currentYear - 2010 }, (_, i) => String(currentYear - i));

  const qs = new URLSearchParams({ art: "RE" });
  if (dateFrom && dateTo) {
    qs.set("dateFrom", dateFrom);
    qs.set("dateTo", dateTo);
  } else if (selectedYear !== "alle") {
    qs.set("year", selectedYear);
  }

  const { data, isLoading } = useQuery<Statistics>({
    queryKey: ["/api/fibu/statistics", "RE", dateFrom, dateTo, selectedYear],
    queryFn: async () => {
      const res = await fetch(`/api/fibu/statistics?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Fehler");
      return res.json();
    },
  });

  if (isLoading) return <div className="space-y-3 p-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;
  if (!data) return null;

  const totalNetto = data.byStatus.reduce((s, r) => s + r.netto, 0);
  const totalOffen = data.byStatus.reduce((s, r) => s + r.offen, 0);

  return (
    <div className="space-y-4" data-testid="statistics-panel-re">
      {!dateFrom && !dateTo && (
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[120px] h-7 text-xs" data-testid="select-stat-re-year"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Jahre</SelectItem>
              {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase">Aufwand (Netto)</p>
          <p className="text-lg font-bold" data-testid="stat-re-aufwand">{fmtCurrency(totalNetto)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase">Gutschriften</p>
          <p className="text-lg font-bold text-green-600" data-testid="stat-re-gutschriften">{data.gutschriften.count}× / {fmtCurrency(data.gutschriften.brutto)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase">Skonto erhalten</p>
          <p className="text-lg font-bold text-green-600" data-testid="stat-re-skonto">{fmtCurrency(data.skontoTotal)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground uppercase">Offen gesamt</p>
          <p className="text-lg font-bold text-red-600" data-testid="stat-re-offen">{fmtCurrency(totalOffen)}</p>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Nach Status</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {data.byStatus.map(s => (
              <div key={s.status} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={`text-[10px] ${statusColors[s.status] || ""}`}>{s.status}</Badge>
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
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top Lieferanten</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 max-h-64 overflow-y-auto">
            {data.byCustomer.slice(0, 15).map(c => (
              <div key={c.name} className="flex items-center justify-between text-sm">
                <span className="truncate flex-1 font-medium">{c.name}</span>
                <span className="text-muted-foreground tabular-nums ml-2">{c.count}×</span>
                <span className="tabular-nums ml-3 w-24 text-right">{fmtCurrency(c.brutto)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {data.byMonth.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Monatliche Kosten</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {data.byMonth.map(m => (
                <div key={m.month} className="text-center p-2 bg-muted/30 rounded">
                  <p className="text-[10px] text-muted-foreground">{m.month}</p>
                  <p className="text-sm font-semibold tabular-nums">{fmtCurrency(m.netto)}</p>
                  <p className="text-[10px] text-muted-foreground">{m.count} Rech.</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KontoSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const match = SKR03_KONTEN.find(k => k.konto === value);
  const filtered = search
    ? SKR03_KONTEN.filter(k => k.konto.includes(search) || k.bez.toLowerCase().includes(search.toLowerCase()))
    : SKR03_KONTEN;

  return (
    <div className="relative">
      <div
        className="flex items-center h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm cursor-pointer hover:bg-muted/50"
        onClick={() => { setOpen(!open); setTimeout(() => inputRef.current?.focus(), 50); }}
        data-testid="select-cost-account"
      >
        {value ? (
          <span className="truncate"><span className="font-mono font-medium">{value}</span> <span className="text-muted-foreground text-xs">{match?.bez || ""}</span></span>
        ) : (
          <span className="text-muted-foreground">Konto wählen...</span>
        )}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-[340px] bg-background border rounded-md shadow-lg max-h-[250px] flex flex-col">
          <div className="p-1.5 border-b">
            <Input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Konto suchen..."
              className="h-7 text-xs"
              data-testid="input-konto-search"
              onKeyDown={(e) => {
                if (e.key === "Escape") { setOpen(false); setSearch(""); }
                if (e.key === "Enter" && filtered.length === 1) { onChange(filtered[0].konto); setOpen(false); setSearch(""); }
              }}
            />
          </div>
          <div className="flex-1 overflow-auto">
            {value && (
              <div
                className="px-2 py-1 text-xs cursor-pointer hover:bg-muted text-muted-foreground"
                onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
              >
                Kein Konto
              </div>
            )}
            {filtered.map(k => (
              <div
                key={k.konto}
                className={`px-2 py-1 text-xs cursor-pointer hover:bg-primary/10 flex gap-2 ${k.konto === value ? "bg-primary/5 font-medium" : ""}`}
                onClick={() => { onChange(k.konto); setOpen(false); setSearch(""); }}
                data-testid={`konto-option-${k.konto}`}
              >
                <span className="font-mono w-10 shrink-0">{k.konto}</span>
                <span className="truncate text-muted-foreground">{k.bez}</span>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="px-2 py-3 text-xs text-center text-muted-foreground">Kein Konto gefunden</div>
            )}
          </div>
        </div>
      )}
      {open && <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setSearch(""); }} />}
    </div>
  );
}

function SupplierAutocomplete({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: customers } = useQuery<any[]>({ queryKey: ["/api/customers"] });
  const suppliers = useMemo(() => {
    if (!customers) return [];
    return customers.filter((c: any) => c.contactType === "lieferant").map((c: any) => ({
      id: c.id, name: c.name, number: c.customerNumber
    }));
  }, [customers]);
  const filtered = useMemo(() => {
    if (!search.trim()) return suppliers.slice(0, 20);
    const q = search.toLowerCase();
    return suppliers.filter(s => s.name.toLowerCase().includes(q) || (s.number && s.number.toLowerCase().includes(q))).slice(0, 20);
  }, [suppliers, search]);
  useEffect(() => { setSearch(value); }, [value]);
  return (
    <div className="relative">
      <Input
        ref={inputRef}
        data-testid="input-supplier"
        value={search}
        onChange={(e) => { setSearch(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="Lieferant eingeben oder suchen..."
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
          {filtered.map(s => (
            <div
              key={s.id}
              className="px-3 py-1.5 text-sm cursor-pointer hover:bg-accent truncate"
              onMouseDown={(e) => { e.preventDefault(); setSearch(s.name); onChange(s.name); setOpen(false); }}
            >
              <span className="font-medium">{s.name}</span>
              {s.number && <span className="text-muted-foreground ml-2 text-xs">{s.number}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InvoiceFormDialog({ invoice, projects, open, onOpenChange, onSaved }: {
  invoice?: IncomingInvoice;
  projects: Project[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState(() => ({
    supplier: invoice?.supplier || "",
    invoiceNumber: invoice?.invoiceNumber || "",
    date: invoice?.date || today,
    dueDate: invoice?.dueDate || "",
    netTotal: invoice?.netTotal || "0.00",
    taxRate: invoice?.taxRate || "19.00",
    taxAmount: invoice?.taxAmount || "0.00",
    grossTotal: invoice?.grossTotal || "0.00",
    projectId: invoice?.projectId || null as number | null,
    costAccount: invoice?.costAccount || "",
    costCenter: invoice?.costCenter || "",
    subject: (invoice as any)?.subject || "",
    notes: invoice?.notes || "",
    discountPercent: (invoice as any)?.discountPercent || "",
    discountAmount: (invoice as any)?.discountAmount || "",
    discountDate: (invoice as any)?.discountDate || "",
    skontoEnabled: !!((invoice as any)?.discountPercent && parseFloat((invoice as any)?.discountPercent) > 0),
    invoiceType: (invoice as any)?.invoiceType || "rechnung",
    reverseCharge: (invoice as any)?.reverseCharge || false,
  }));

  const update = (field: string, value: any) => {
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (field === "reverseCharge" && value) {
        next.taxRate = "0.00";
        next.reverseCharge = true;
      }
      if (field === "reverseCharge" && !value) {
        next.taxRate = "19.00";
        next.reverseCharge = false;
      }
      if (field === "netTotal" || field === "taxRate" || field === "reverseCharge") {
        const net = parseFloat(field === "netTotal" ? value : next.netTotal) || 0;
        const rate = next.reverseCharge ? 0 : (parseFloat(field === "taxRate" ? value : next.taxRate) || 0);
        const tax = Math.round(net * rate) / 100;
        next.taxAmount = tax.toFixed(2);
        next.grossTotal = (net + tax).toFixed(2);
      }
      if (field === "skontoEnabled") {
        if (!value) {
          next.discountPercent = "";
          next.discountAmount = "";
          next.discountDate = "";
        }
      }
      if (field === "discountPercent" || (field === "skontoEnabled" && value)) {
        const gross = parseFloat(next.grossTotal) || 0;
        const pct = parseFloat(field === "discountPercent" ? value : next.discountPercent) || 0;
        next.discountAmount = (Math.round(gross * pct) / 100).toFixed(2);
      }
      return next;
    });
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("POST", "/api/incoming-invoices", data); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/incoming-invoices"] }); onOpenChange(false); onSaved(); toast({ title: "Eingangsrechnung erstellt" }); },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });
  const updateMutation = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("PATCH", `/api/incoming-invoices/${invoice!.id}`, data); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/incoming-invoices"] }); onOpenChange(false); onSaved(); toast({ title: "Eingangsrechnung aktualisiert" }); },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const handleSave = () => {
    if (!form.supplier.trim()) { toast({ title: "Fehler", description: "Lieferant ist erforderlich", variant: "destructive" }); return; }
    const { skontoEnabled, ...rest } = form;
    const payload = { ...rest, projectId: rest.projectId || null };
    if (invoice) updateMutation.mutate(payload); else createMutation.mutate(payload);
  };

  const skontoNet = form.skontoEnabled
    ? (parseFloat(form.grossTotal) - parseFloat(form.discountAmount || "0")).toFixed(2)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{invoice ? "Eingangsrechnung bearbeiten" : "Neue Eingangsrechnung"}</DialogTitle></DialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2 col-span-2"><Label>Lieferant *</Label><SupplierAutocomplete value={form.supplier} onChange={(v) => update("supplier", v)} /></div>
            <div className="space-y-2">
              <Label>Belegart</Label>
              <Select value={form.invoiceType} onValueChange={(v) => update("invoiceType", v)}>
                <SelectTrigger data-testid="select-invoice-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rechnung">Rechnung</SelectItem>
                  <SelectItem value="gutschrift">Gutschrift (Lieferant)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Rechnungs-Nr</Label><Input data-testid="input-invoice-number" value={form.invoiceNumber} onChange={(e) => update("invoiceNumber", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Datum *</Label><Input data-testid="input-date" type="date" value={form.date} onChange={(e) => update("date", e.target.value)} /></div>
            <div className="space-y-2"><Label>Fälligkeit</Label><Input data-testid="input-due-date" type="date" value={form.dueDate} onChange={(e) => update("dueDate", e.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label>Betreff</Label><Input data-testid="input-subject" value={form.subject} onChange={(e) => update("subject", e.target.value)} /></div>

          <div className="grid grid-cols-4 gap-4 items-end">
            <div className="space-y-2"><Label>Netto</Label><Input data-testid="input-net-total" type="number" step="0.01" value={form.netTotal} onChange={(e) => update("netTotal", e.target.value)} /></div>
            <div className="space-y-2"><Label>MwSt %</Label>
              <Select value={form.reverseCharge ? "13b" : form.taxRate} onValueChange={(v) => {
                if (v === "13b") { update("reverseCharge", true); }
                else { update("reverseCharge", false); update("taxRate", v); }
              }}>
                <SelectTrigger data-testid="select-tax-rate"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="19.00">19 % MwSt</SelectItem>
                  <SelectItem value="7.00">7 % MwSt</SelectItem>
                  <SelectItem value="0.00">0 % (steuerfrei)</SelectItem>
                  <SelectItem value="13b">§13b Reverse Charge</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label className="text-xs text-muted-foreground">Steuer-Betrag</Label><Input data-testid="input-tax-amount" value={form.taxAmount} readOnly className="bg-muted text-muted-foreground" tabIndex={-1} /></div>
            <div className="space-y-2"><Label className="text-xs text-muted-foreground">Brutto</Label><Input data-testid="input-gross-total" value={form.grossTotal} readOnly className="bg-muted font-semibold" tabIndex={-1} /></div>
          </div>
          {form.reverseCharge && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-200" data-testid="info-reverse-charge">
              <strong>§13b UStG — Reverse Charge:</strong> USt wird nicht vom Lieferanten ausgewiesen. Die 19% USt werden automatisch als Vorsteuer (1577) und Umsatzsteuer (1787) gegengebucht (Nullsumme). Zahlbetrag = Netto.
            </div>
          )}

          <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="skonto-check"
                checked={form.skontoEnabled}
                onChange={(e) => update("skontoEnabled", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
                data-testid="checkbox-skonto"
              />
              <Label htmlFor="skonto-check" className="cursor-pointer font-medium text-sm">Skonto gewährt</Label>
            </div>
            {form.skontoEnabled && (
              <div className="grid grid-cols-4 gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Skonto %</Label>
                  <Input data-testid="input-discount-percent" type="number" step="0.01" value={form.discountPercent} onChange={(e) => update("discountPercent", e.target.value)} placeholder="2,00" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Skonto-Betrag</Label>
                  <Input data-testid="input-discount-amount" value={form.discountAmount} readOnly className="bg-muted text-muted-foreground" tabIndex={-1} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Skonto bis</Label>
                  <Input data-testid="input-discount-date" type="date" value={form.discountDate} onChange={(e) => update("discountDate", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Betrag - Skonto</Label>
                  <Input data-testid="input-skonto-net" value={skontoNet || ""} readOnly className="bg-muted font-semibold text-muted-foreground" tabIndex={-1} />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Projekt</Label>
              <Select value={form.projectId ? String(form.projectId) : "none"} onValueChange={(v) => update("projectId", v === "none" ? null : parseInt(v))}>
                <SelectTrigger data-testid="select-project"><SelectValue placeholder="Kein Projekt" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kein Projekt</SelectItem>
                  {projects.map((p) => <SelectItem key={p.id} value={String(p.id)}>{fmtDocNumber(p.projectNumber)} - {p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Kostenkonto</Label><KontoSelect value={form.costAccount} onChange={(v) => update("costAccount", v)} /></div>
            <div className="space-y-2"><Label>Kostenstelle</Label><Input data-testid="input-cost-center" value={form.costCenter} onChange={(e) => update("costCenter", e.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label>Bemerkung</Label><Input data-testid="input-notes" value={form.notes} onChange={(e) => update("notes", e.target.value)} /></div>
          <div className="flex gap-2 justify-end pt-4">
            <Button variant="secondary" onClick={() => onOpenChange(false)} data-testid="button-cancel">Abbrechen</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-invoice">Speichern</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ManualDetailPanel({ invoice, onClose, onEdit, onPay, onDelete, onRegisterFibu }: {
  invoice: ManualIncomingInvoice | null;
  onClose: () => void;
  onEdit: (inv: IncomingInvoice) => void;
  onPay: (inv: IncomingInvoice) => void;
  onDelete: (id: number) => void;
  onRegisterFibu: (inv: ManualIncomingInvoice) => void;
}) {
  const { data: attachments = [] } = useQuery<DocumentAttachment[]>({
    queryKey: ["/api/incoming-invoices", invoice?.id, "attachments"],
    queryFn: async () => {
      if (!invoice?.id) return [];
      const res = await fetch(`/api/incoming-invoices/${invoice.id}/attachments`, { credentials: "include" });
      if (!res.ok) throw new Error("Belege konnten nicht geladen werden");
      return res.json();
    },
    enabled: !!invoice?.id,
  });

  if (!invoice) return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
      <PanelRightOpen className="h-12 w-12 mb-3 opacity-20" />
      <p className="text-sm">Rechnung wählen um Details zu sehen</p>
    </div>
  );

  const effStatus = getEffectiveStatus(invoice);
  const net = parseFloat(invoice.netTotal || "0");
  const gross = parseFloat(invoice.grossTotal || "0");
  const paid = parseFloat(invoice.paidAmount || "0");
  const open = gross - paid;
  const registeredReId = invoice.registeredReId || null;

  return (
    <div className="h-full flex flex-col" data-testid="detail-panel-manual">
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 shrink-0" />
            <span className="font-semibold text-sm truncate">{fmtDocNumber(invoice.invoiceNumber || invoice.documentNumber) || `#${invoice.id}`}</span>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            <a className="hover:text-primary hover:underline cursor-pointer" onClick={() => window.location.href = `/adressen?search=${encodeURIComponent(invoice.supplier)}`}>{invoice.supplier}</a>
            {invoice.subject ? ` — ${invoice.subject}` : ""}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose} data-testid="button-close-detail-manual"><X className="h-4 w-4" /></Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          <div className="flex gap-2 flex-wrap">
            {(invoice as any).invoiceType === "gutschrift" && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" data-testid="badge-gutschrift">Gutschrift</span>
            )}
            {(invoice as any).reverseCharge && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" data-testid="badge-reverse-charge">§13b</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <InfoField label="Belegdatum" value={fmtDate(invoice.date)} />
            <InfoField label="Fällig" value={fmtDate(invoice.dueDate)} />
          </div>

          {invoice.subject && (
            <div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Betreff</span>
              <p className="text-sm">{invoice.subject}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 bg-muted/20 rounded-lg p-2.5">
            <InfoField label="Netto" value={fmtCurrency(net)} bold />
            <InfoField label="Brutto" value={fmtCurrency(gross)} bold />
            <InfoField label="Bezahlt" value={fmtCurrency(paid)} className="text-green-700" />
            <InfoField label="Offen" value={fmtCurrency(open)} className={open > 0.01 ? "text-red-600 font-bold" : "text-green-600"} />
          </div>
          {(invoice as any).reverseCharge && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-2 text-[10px] text-amber-800 dark:text-amber-200" data-testid="info-detail-13b">
              §13b UStG — Vorsteuer (1577) und USt (1787) automatisch gegengebucht
            </div>
          )}

          <div className="flex items-center gap-2 text-xs bg-muted/30 rounded p-2">
            <span className="text-muted-foreground">MwSt:</span>
            <span className="font-medium">{fmtCurrency(parseFloat(invoice.taxAmount || "0"))} ({fmtNumber(invoice.taxRate || "19")}%)</span>
          </div>

          {(invoice.discountPercent && parseFloat(invoice.discountPercent) > 0) && (
            <div className="flex items-center gap-3 text-xs bg-orange-50 dark:bg-orange-950/20 rounded p-2">
              <span className="text-muted-foreground">Skonto:</span>
              <span className="font-medium">{fmtCurrency(parseFloat(invoice.discountAmount || "0"))} ({fmtNumber(invoice.discountPercent)}%)</span>
              {invoice.discountDate && <span className="text-muted-foreground">bis {fmtDate(invoice.discountDate)}</span>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            <InfoField label="Kostenkonto" value={invoice.costAccount ? `${invoice.costAccount} – ${SKR03_KONTEN.find(k => k.konto === invoice.costAccount)?.bez || ""}` : "—"} />
            <InfoField label="Kostenstelle" value={invoice.costCenter || "—"} />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <Badge variant="outline" className={`text-[10px] ${statusColors[effStatus] || ""}`}>
              {invoiceStatusLabels[effStatus] || effStatus}
            </Badge>
            {registeredReId && (
              <Badge variant="secondary" className="text-[10px]" data-testid="badge-manual-incoming-registered">
                FIBU RE-{registeredReId}
              </Badge>
            )}
          </div>

          {invoice.notes && (
            <div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Bemerkung</span>
              <p className="text-xs text-muted-foreground">{invoice.notes}</p>
            </div>
          )}

          <div className="flex flex-col gap-1.5 pt-1">
            <Button
              size="sm"
              variant={registeredReId ? "secondary" : "default"}
              className="w-full"
              onClick={() => onRegisterFibu(invoice)}
              data-testid="button-register-manual-incoming-fibu"
            >
              <Database className="h-4 w-4 mr-2" />
              {registeredReId ? "FIBU-Buchung oeffnen" : "In FIBU buchen"}
            </Button>
            {registeredReId && effStatus !== "bezahlt" && (
              <Button size="sm" className="w-full" onClick={() => onRegisterFibu(invoice)} data-testid="button-pay-detail-fibu">
                <Banknote className="h-4 w-4 mr-2" />Zahlung in FIBU buchen
              </Button>
            )}
            {!registeredReId && effStatus !== "bezahlt" && (
              <Button size="sm" className="w-full" onClick={() => onPay(invoice)} data-testid="button-pay-detail">
                <Banknote className="h-4 w-4 mr-2" />Zahlung buchen
              </Button>
            )}
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => onEdit(invoice)} data-testid="button-edit-detail">
                <Pencil className="h-3.5 w-3.5 mr-1" />Bearbeiten
              </Button>
              <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => onDelete(invoice.id)} data-testid="button-delete-detail">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            {(attachments.length > 0 || invoice.pdfPath) && (
              <div className="space-y-1.5 pt-1" data-testid="attachment-list">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wide">
                  <FileText className="h-3.5 w-3.5" />
                  Belege
                </div>
                {attachments.map((attachment) => (
                  <Button
                    key={attachment.id}
                    size="sm"
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => window.open(`/api/document-attachments/${attachment.id}/file`, "_blank")}
                    data-testid={`button-view-attachment-${attachment.id}`}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                    <span className="truncate">{attachment.title || attachment.originalFilename || `Beleg ${attachment.id}`}</span>
                  </Button>
                ))}
                {invoice.pdfPath && attachments.length === 0 && (
                  <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => window.open(`/api/incoming-invoices/${invoice.id}/pdf`, "_blank")} data-testid="button-view-pdf">
                    <Eye className="h-3.5 w-3.5 mr-1.5" />PDF anzeigen
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function PaymentDialog({ invoice, open, onOpenChange }: { invoice: IncomingInvoice; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];
  const remaining = (parseFloat(invoice.grossTotal || "0") - parseFloat(invoice.paidAmount || "0"));
  const [payAmount, setPayAmount] = useState(remaining.toFixed(2));
  const [payDate, setPayDate] = useState(today);

  const payMutation = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("PATCH", `/api/incoming-invoices/${invoice.id}`, data); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/incoming-invoices"] }); onOpenChange(false); toast({ title: "Zahlung erfasst" }); },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Zahlung erfassen</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Lieferant: <span className="font-medium text-foreground">{invoice.supplier}</span></p>
            <p className="text-sm text-muted-foreground">Offen: <span className="font-medium text-red-600">{fmtCurrency(remaining)}</span></p>
          </div>
          <div className="space-y-2"><Label>Zahlungsbetrag</Label><Input data-testid="input-pay-amount" type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></div>
          <div className="space-y-2"><Label>Zahlungsdatum</Label><Input data-testid="input-pay-date" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)} data-testid="button-cancel-pay">Abbrechen</Button>
            <Button onClick={() => {
              const amount = parseFloat(payAmount) || 0;
              const totalPaid = parseFloat(invoice.paidAmount || "0") + amount;
              const gross = parseFloat(invoice.grossTotal || "0");
              payMutation.mutate({ paidAmount: totalPaid.toFixed(2), paidDate: payDate, status: totalPaid >= gross ? "bezahlt" : "teilbezahlt" });
            }} disabled={payMutation.isPending} data-testid="button-confirm-pay">Zahlung buchen</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function RechnungseingangPage() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("manuell");
  const [filterStatus, setFilterStatus] = useState("alle");
  const [filterProject, setFilterProject] = useState("alle");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [fibuPage, setFibuPage] = useState(0);
  const fibuPageSize = 50;
  const [formOpen, setFormOpen] = useState(false);
  const [editInvoice, setEditInvoice] = useState<IncomingInvoice | undefined>();
  const [payInvoice, setPayInvoice] = useState<IncomingInvoice | null>(null);
  const [uploadExpanded, setUploadExpanded] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedReId, setSelectedReId] = useState<number | null>(null);
  const [selectedManualId, setSelectedManualId] = useState<number | null>(null);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data: projects } = useQuery<Project[]>({ queryKey: ["/api/projects"] });

  const fibuQs = new URLSearchParams();
  fibuQs.set("limit", String(fibuPageSize));
  fibuQs.set("offset", String(fibuPage * fibuPageSize));
  if (debouncedSearch) fibuQs.set("search", debouncedSearch);
  if (filterStatus !== "alle") fibuQs.set("status", filterStatus);
  if (dateFrom) fibuQs.set("dateFrom", dateFrom);
  if (dateTo) fibuQs.set("dateTo", dateTo);
  if (filterProject !== "alle") {
    const proj = projects?.find(p => String(p.id) === filterProject);
    if (proj) fibuQs.set("projectNumber", proj.projectNumber);
  }

  const { data: fibuResponse, isLoading: fibuLoading } = useQuery<FibuResponse>({
    queryKey: ["/api/incoming-invoices-fibu", fibuPage, debouncedSearch, filterStatus, filterProject, dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`/api/incoming-invoices-fibu?${fibuQs}`, { credentials: "include" });
      if (!res.ok) return { data: [], total: 0, totalNetto: 0, totalBrutto: 0, totalBezahlt: 0, totalOffen: 0, limit: fibuPageSize, offset: 0 };
      return res.json();
    },
  });

  const [manualPage, setManualPage] = useState(0);
  const manualPageSize = 50;

  interface ManualResponse {
    data: IncomingInvoice[];
    total: number;
    totalNetto: number;
    totalBezahlt: number;
    totalOffen: number;
    limit: number;
    offset: number;
  }

  const manualQs = new URLSearchParams();
  manualQs.set("paginated", "true");
  manualQs.set("limit", String(manualPageSize));
  manualQs.set("offset", String(manualPage * manualPageSize));
  if (debouncedSearch) manualQs.set("search", debouncedSearch);
  if (filterStatus !== "alle") manualQs.set("status", filterStatus);
  if (dateFrom) manualQs.set("dateFrom", dateFrom);
  if (dateTo) manualQs.set("dateTo", dateTo);
  if (filterProject !== "alle") manualQs.set("projectId", filterProject);

  const { data: manualResponse, isLoading: manualLoading } = useQuery<ManualResponse>({
    queryKey: ["/api/incoming-invoices", "paginated", manualPage, debouncedSearch, filterStatus, filterProject, dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`/api/incoming-invoices?${manualQs}`, { credentials: "include" });
      if (!res.ok) return { data: [], total: 0, totalNetto: 0, totalBezahlt: 0, totalOffen: 0, limit: manualPageSize, offset: 0 };
      return res.json();
    },
  });

  const manualInvoices = manualResponse?.data || [];
  const manualTotal = manualResponse?.total || 0;
  const manualTotalPages = Math.ceil(manualTotal / manualPageSize);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/incoming-invoices/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/incoming-invoices"] });
      setSelectedManualId(null);
      setDeleteInvoiceId(null);
      toast({ title: "Eingangsrechnung geloescht" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const registerFibuMutation = useMutation({
    mutationFn: async (invoice: ManualIncomingInvoice) => {
      if (invoice.registeredReId) return { reId: invoice.registeredReId, existing: true };
      const res = await apiRequest("POST", `/api/incoming-invoices/${invoice.id}/register-fibu`);
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/incoming-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/incoming-invoices-fibu"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fibu/statistics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fibu/summary"] });
      setSelectedReId(result.reId);
      setSelectedManualId(null);
      setActiveTab("fibu");
      toast({ title: result.existing ? "FIBU-Buchung geoeffnet" : "Eingangsrechnung in FIBU gebucht" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const handleUpload = useCallback(async (file: File) => {
    const allowedTypes = ["application/pdf", "application/xml", "text/xml", "image/jpeg", "image/png", "image/webp", "image/gif"];
    const ext = file.name.toLowerCase().split(".").pop();
    if (!allowedTypes.includes(file.type) && !["xml", "pdf", "jpg", "jpeg", "png", "webp", "gif"].includes(ext || "")) { toast({ title: "Fehler", description: "PDF, XML, JPG, PNG oder WebP erlaubt", variant: "destructive" }); return; }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("pdf", file);
      const res = await fetch("/api/incoming-invoices/upload", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload fehlgeschlagen");
      const created = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/incoming-invoices"] });
      const fmtLabel = created.detectedFormat ? ` (${created.detectedFormat})` : "";
      toast({ title: `Rechnung eingelesen${fmtLabel}`, description: `Lieferant: ${created.supplier}` });
      setEditInvoice(created); setFormOpen(true);
    } catch (err: any) { toast({ title: "Fehler", description: err.message, variant: "destructive" }); }
    finally { setIsUploading(false); }
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); const file = e.dataTransfer.files[0]; if (file) handleUpload(file); }, [handleUpload]);
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); }, []);
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) handleUpload(file); if (fileInputRef.current) fileInputRef.current.value = ""; }, [handleUpload]);

  const fibuData = fibuResponse?.data || [];
  const fibuTotal = fibuResponse?.total || 0;
  const fibuTotalPages = Math.ceil(fibuTotal / fibuPageSize);

  useEffect(() => {
    if (selectedReId && fibuData.length > 0 && !fibuData.some(inv => (inv.reId || (inv as any).re_id) === selectedReId)) {
      setSelectedReId(null);
    }
  }, [fibuData, selectedReId]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between px-4 pt-3 pb-2 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-rechnungseingang-title">Rechnungseingangsbuch</h1>
          <p className="text-muted-foreground text-xs">{fibuTotal + manualTotal} Eingangsrechnungen</p>
        </div>
        <Button size="sm" data-testid="button-new-invoice" onClick={() => { setEditInvoice(undefined); setFormOpen(true); setActiveTab("manuell"); }}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Neue RE
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap px-4 mb-2">
        <div className="flex-1 min-w-[150px] max-w-xs relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input data-testid="input-search" placeholder="Lieferant, Nr, Projekt..."
            className="pl-7 h-7 text-xs" value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setFibuPage(0); setManualPage(0); }} />
        </div>
        <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setFibuPage(0); setManualPage(0); }}>
          <SelectTrigger data-testid="select-filter-status" className="w-[110px] h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Status</SelectItem>
            <SelectItem value="offen">Offen</SelectItem>
            <SelectItem value="teilbezahlt">Teilbezahlt</SelectItem>
            <SelectItem value="bezahlt">Bezahlt</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterProject} onValueChange={(v) => { setFilterProject(v); setFibuPage(0); setManualPage(0); }}>
          <SelectTrigger data-testid="select-filter-project" className="w-[140px] h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Projekte</SelectItem>
            {projects?.map((p) => <SelectItem key={p.id} value={String(p.id)}>{fmtDocNumber(p.projectNumber)}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="hidden md:flex items-center gap-1">
          <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setFibuPage(0); setManualPage(0); }} className="w-[120px] h-7 text-xs" data-testid="input-date-from" />
          <span className="text-[10px] text-muted-foreground">–</span>
          <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setFibuPage(0); setManualPage(0); }} className="w-[120px] h-7 text-xs" data-testid="input-date-to" />
        </div>
        {(searchTerm || filterStatus !== "alle" || filterProject !== "alle" || dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" className="h-7 text-[10px] px-2" onClick={() => {
            setSearchTerm(""); setFilterStatus("alle"); setFilterProject("alle"); setDateFrom(""); setDateTo(""); setFibuPage(0); setManualPage(0);
          }} data-testid="button-reset-filters"><X className="h-3 w-3" /></Button>
        )}
      </div>
      <div className="flex items-center gap-1 px-4 mb-2 flex-wrap">
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
              onClick={() => { setDateFrom(from); setDateTo(to); setFibuPage(0); setManualPage(0); }}>
              {label}
            </Button>
          );
        })}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 px-4 overflow-hidden">
        <div className="flex items-center gap-2">
          <TabsList className="w-fit">
            <TabsTrigger value="fibu" className="gap-1 text-xs" data-testid="tab-fibu">
              <Database className="h-3 w-3" /> FIBU ({fibuTotal})
            </TabsTrigger>
            <TabsTrigger value="manuell" className="gap-1 text-xs" data-testid="tab-manuell">
              <FileText className="h-3 w-3" /> Manuell ({manualTotal})
            </TabsTrigger>
            <TabsTrigger value="statistik" className="gap-1 text-xs" data-testid="tab-statistik">
              <BarChart3 className="h-3 w-3" /> Auswertungen
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="fibu" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
          <div className="flex-1 flex flex-col md:flex-row gap-0 min-h-0 border rounded-lg overflow-hidden">
            <div className={`${selectedReId ? "md:w-[55%] lg:w-[60%]" : "w-full"} flex flex-col min-h-0 ${selectedReId ? "h-[40vh] md:h-full" : "h-full"}`}>
              <ScrollArea className="flex-1">
                {fibuLoading ? (
                  <div className="p-4 space-y-2">{[...Array(10)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px] py-1.5 px-2 sticky top-0 bg-background">Rech-Nr</TableHead>
                        <TableHead className="text-[10px] py-1.5 px-2 sticky top-0 bg-background">Lieferant</TableHead>
                        <TableHead className="text-[10px] py-1.5 px-2 sticky top-0 bg-background hidden lg:table-cell">Datum</TableHead>
                        <TableHead className="text-[10px] py-1.5 px-2 sticky top-0 bg-background text-right">Netto</TableHead>
                        <TableHead className="text-[10px] py-1.5 px-2 sticky top-0 bg-background text-right hidden sm:table-cell">Bezahlt</TableHead>
                        <TableHead className="text-[10px] py-1.5 px-2 sticky top-0 bg-background">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fibuData.length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8 text-sm">Keine Rechnungen gefunden</TableCell></TableRow>
                      )}
                      {fibuData.map((inv) => {
                        const reId = inv.reId || (inv as any).re_id;
                        return (
                          <TableRow
                            key={inv.id}
                            data-testid={`row-fibu-${inv.id}`}
                            className={`cursor-pointer transition-colors ${selectedReId === reId ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/50"} ${inv.stornoFlag === 2 ? "opacity-50" : ""}`}
                            onClick={() => reId && setSelectedReId(selectedReId === reId ? null : reId)}
                          >
                            <TableCell className="py-1.5 px-2 font-mono text-[11px]">{inv.invoiceNumber || "—"}</TableCell>
                            <TableCell className="py-1.5 px-2">
                              <div className="flex items-center gap-1">
                                <a className="text-xs font-medium truncate block max-w-[120px] hover:text-primary hover:underline cursor-pointer" onClick={(e) => { e.stopPropagation(); setLocation(`/adressen?search=${encodeURIComponent(inv.supplier)}`); }}>{inv.supplier}</a>
                                {(inv as any).reverseCharge && <span className="text-[9px] font-bold px-1 py-0 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 shrink-0">§13b</span>}
                                {(inv as any).invoiceType === "gutschrift" && <span className="text-[9px] font-bold px-1 py-0 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 shrink-0">GS</span>}
                                {(inv as any).registeredReId && <span className="text-[9px] font-bold px-1 py-0 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 shrink-0">FIBU</span>}
                              </div>
                            </TableCell>
                            <TableCell className="py-1.5 px-2 text-[11px] text-muted-foreground hidden lg:table-cell">{fmtDate(inv.date)}</TableCell>
                            <TableCell className="py-1.5 px-2 text-right text-xs font-medium tabular-nums">{fmtCurrency(inv.netTotal)}</TableCell>
                            <TableCell className="py-1.5 px-2 text-right text-[11px] tabular-nums hidden sm:table-cell">{fmtCurrency(inv.paidAmount)}</TableCell>
                            <TableCell className="py-1.5 px-2">
                              <Badge variant="secondary" className={`text-[10px] ${statusColors[inv.status] || ""}`}>
                                {invoiceStatusLabels[inv.status] || inv.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
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
                <DetailPanel reId={selectedReId} onClose={() => setSelectedReId(null)} />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="manuell" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
          <div className="flex-1 flex flex-col md:flex-row gap-0 min-h-0 border rounded-lg overflow-hidden">
            <div className={`${selectedManualId ? "md:w-[55%] lg:w-[60%]" : "w-full"} flex flex-col min-h-0 ${selectedManualId ? "h-[40vh] md:h-full" : "h-full"}`}>
              <div
                data-testid="dropzone-pdf-upload"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => !isUploading && fileInputRef.current?.click()}
                className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 border-b text-xs transition-colors ${isDragOver ? "bg-primary/5 border-primary" : "bg-muted/20 hover:bg-muted/40"}`}
              >
                <input ref={fileInputRef} type="file" accept=".pdf,.xml,.jpg,.jpeg,.png,.webp" onChange={handleFileSelect} className="hidden" />
                {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="text-muted-foreground">{isUploading ? "Wird per KI ausgelesen..." : "Rechnung hier ablegen — PDF, Bild oder XML (Drag & Drop oder Klick)"}</span>
              </div>
              <ScrollArea className="flex-1">
                {manualLoading ? (
                  <div className="p-4 space-y-2">{[...Array(10)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-[10px] py-1.5 px-2 sticky top-0 bg-background">Lieferant</TableHead>
                      <TableHead className="text-[10px] py-1.5 px-2 sticky top-0 bg-background">Rech-Nr</TableHead>
                      <TableHead className="text-[10px] py-1.5 px-2 sticky top-0 bg-background hidden md:table-cell">Betreff</TableHead>
                      <TableHead className="text-[10px] py-1.5 px-2 sticky top-0 bg-background hidden lg:table-cell">Datum</TableHead>
                      <TableHead className="text-[10px] py-1.5 px-2 sticky top-0 bg-background text-right">Netto</TableHead>
                      <TableHead className="text-[10px] py-1.5 px-2 sticky top-0 bg-background text-right hidden sm:table-cell">Brutto</TableHead>
                      <TableHead className="text-[10px] py-1.5 px-2 sticky top-0 bg-background">Status</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {manualInvoices.length === 0 && (
                        <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8 text-sm">Keine Eingangsrechnungen gefunden</TableCell></TableRow>
                      )}
                      {manualInvoices.map((inv) => {
                        const effStatus = getEffectiveStatus(inv);
                        return (
                          <TableRow
                            key={inv.id}
                            data-testid={`row-invoice-${inv.id}`}
                            className={`cursor-pointer transition-colors ${selectedManualId === inv.id ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/50"} ${effStatus === "ueberfaellig" ? "bg-red-50 dark:bg-red-950" : ""}`}
                            onClick={() => setSelectedManualId(selectedManualId === inv.id ? null : inv.id)}
                          >
                            <TableCell className="py-1.5 px-2">
                              <div className="flex items-center gap-1">
                                <a className="text-xs font-medium truncate block max-w-[140px] hover:text-primary hover:underline cursor-pointer" onClick={(e) => { e.stopPropagation(); setLocation(`/adressen?search=${encodeURIComponent(inv.supplier)}`); }} data-testid={`text-supplier-${inv.id}`}>{inv.supplier}</a>
                                {(inv as any).reverseCharge && <span className="text-[9px] font-bold px-1 py-0 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 shrink-0">§13b</span>}
                                {(inv as any).invoiceType === "gutschrift" && <span className="text-[9px] font-bold px-1 py-0 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 shrink-0">GS</span>}
                              </div>
                            </TableCell>
                            <TableCell className="py-1.5 px-2 font-mono text-[11px]">{fmtDocNumber(inv.invoiceNumber || inv.documentNumber) || "—"}</TableCell>
                            <TableCell className="py-1.5 px-2 text-[11px] text-muted-foreground hidden md:table-cell">
                              <span className="truncate block max-w-[200px]">{inv.subject || "—"}</span>
                            </TableCell>
                            <TableCell className="py-1.5 px-2 text-[11px] text-muted-foreground hidden lg:table-cell">{fmtDate(inv.date)}</TableCell>
                            <TableCell className="py-1.5 px-2 text-right text-xs font-medium tabular-nums">{fmtCurrency(inv.netTotal)}</TableCell>
                            <TableCell className="py-1.5 px-2 text-right text-[11px] tabular-nums hidden sm:table-cell">{fmtCurrency(inv.grossTotal)}</TableCell>
                            <TableCell className="py-1.5 px-2">
                              <Badge variant="secondary" className={`text-[10px] ${statusColors[effStatus] || ""}`}>{invoiceStatusLabels[effStatus] || effStatus}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>

              <div className="flex items-center justify-between px-2 py-1.5 border-t bg-muted/30 text-[10px]">
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">S. {manualPage + 1}/{Math.max(1, manualTotalPages)} ({manualTotal})</span>
                  <span className="hidden sm:inline">Netto: <b>{fmtCurrency(manualResponse?.totalNetto || 0)}</b></span>
                  <span className="hidden sm:inline"><b className="text-green-600">{fmtCurrency(manualResponse?.totalBezahlt || 0)}</b> bez.</span>
                  <span className="hidden sm:inline"><b className="text-red-600">{fmtCurrency(manualResponse?.totalOffen || 0)}</b> offen</span>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6" disabled={manualPage === 0} onClick={() => setManualPage(p => p - 1)} data-testid="button-manual-prev">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" disabled={manualPage >= manualTotalPages - 1} onClick={() => setManualPage(p => p + 1)} data-testid="button-manual-next">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            {selectedManualId && (
              <div className="md:w-[45%] lg:w-[40%] border-t md:border-t-0 md:border-l bg-background flex-1 md:flex-none min-h-0 overflow-hidden">
                <ManualDetailPanel
                  invoice={manualInvoices.find(i => i.id === selectedManualId) || null}
                  onClose={() => setSelectedManualId(null)}
                  onEdit={(inv) => { setEditInvoice(inv); setFormOpen(true); }}
                  onPay={(inv) => setPayInvoice(inv)}
                  onDelete={(id) => setDeleteInvoiceId(id)}
                  onRegisterFibu={(inv) => registerFibuMutation.mutate(inv)}
                />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="statistik" className="flex-1 overflow-auto mt-2 pb-4">
          <StatisticsPanel dateFrom={dateFrom || undefined} dateTo={dateTo || undefined} />
        </TabsContent>
      </Tabs>

      {formOpen && (
        <InvoiceFormDialog invoice={editInvoice} projects={projects || []} open={formOpen}
          onOpenChange={(v) => { setFormOpen(v); if (!v) setEditInvoice(undefined); }}
          onSaved={() => setEditInvoice(undefined)} />
      )}
      {payInvoice && (
        <PaymentDialog invoice={payInvoice} open={!!payInvoice} onOpenChange={(v) => { if (!v) setPayInvoice(null); }} />
      )}
      <AlertDialog open={deleteInvoiceId !== null} onOpenChange={(open) => !open && !deleteMutation.isPending && setDeleteInvoiceId(null)}>
        <AlertDialogContent data-testid="dialog-delete-incoming-invoice">
          <AlertDialogHeader>
            <AlertDialogTitle>Eingangsrechnung loeschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die manuell erfasste Eingangsrechnung wird dauerhaft entfernt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending} data-testid="button-cancel-delete-incoming-invoice">
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteInvoiceId !== null && deleteMutation.mutate(deleteInvoiceId)}
              data-testid="button-confirm-delete-incoming-invoice"
            >
              Loeschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


