import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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
import { BarChart3, TrendingUp, TrendingDown, FileText, ExternalLink, Upload, FileUp, Loader2, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/format";
import { useState, useRef, useCallback } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { BwaReport } from "@shared/schema";

function BwaRow({ label, value, percent, bold, indent, negative }: {
  label: string;
  value: string | number | null | undefined;
  percent?: string | number | null;
  bold?: boolean;
  indent?: boolean;
  negative?: boolean;
}) {
  const num = typeof value === "string" ? parseFloat(value || "0") : (value ?? 0);
  const isNeg = num < 0;
  return (
    <div className={`flex items-center py-1.5 px-3 border-b border-border/30 ${bold ? "font-semibold bg-muted/30" : ""} ${indent ? "pl-8" : ""}`}
         data-testid={`bwa-row-${label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}>
      <div className="flex-1 text-sm">{label}</div>
      <div className={`w-40 text-right text-sm font-mono ${isNeg ? "text-red-600" : ""}`}>
        {fmtCurrency(value)}
      </div>
      {percent !== undefined && (
        <div className="w-24 text-right text-sm font-mono text-muted-foreground">
          {fmtPercent(percent)}
        </div>
      )}
    </div>
  );
}

function BwaSectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center py-2 px-3 bg-primary/10 border-b border-primary/20">
      <span className="text-sm font-bold text-primary">{title}</span>
    </div>
  );
}

function BwaUploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch("/api/bwa-reports/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ message: "Upload fehlgeschlagen" }));
        throw new Error(err.message || "Upload fehlgeschlagen");
      }
      return resp.json();
    },
    onSuccess: (data) => {
      toast({ title: "BWA importiert", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/bwa-reports"] });
      setSelectedFile(null);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler beim Import", description: err.message, variant: "destructive" });
    },
  });

  const handleFile = useCallback((file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "csv", "txt"].includes(ext || "")) {
      toast({ title: "Ungültiges Format", description: "Nur PDF- und CSV-Dateien werden unterstützt.", variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Datei zu groß", description: "Maximale Dateigröße: 20 MB", variant: "destructive" });
      return;
    }
    setSelectedFile(file);
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const isPdf = selectedFile?.name.toLowerCase().endsWith(".pdf");

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!uploadMutation.isPending) { onOpenChange(o); setSelectedFile(null); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            BWA importieren
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3 bg-muted/30">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium">PDF</span>
              </div>
              <p className="text-xs text-muted-foreground">DATEV BWA-PDF vom Steuerberater. Zahlen werden per KI erkannt.</p>
            </div>
            <div className="rounded-lg border p-3 bg-muted/30">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium">CSV</span>
              </div>
              <p className="text-xs text-muted-foreground">Semikolon-getrennt, erste Zeile = Spaltenköpfe (Jahr, Monat, Personalkosten, …)</p>
            </div>
          </div>

          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            data-testid="bwa-upload-dropzone"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.csv,.txt"
              className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
              data-testid="input-bwa-file"
            />
            {selectedFile ? (
              <div className="space-y-2">
                <FileUp className="h-10 w-10 mx-auto text-primary" />
                <p className="font-medium text-sm">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(0)} KB · {isPdf ? "PDF (KI-Erkennung)" : "CSV (direkt)"}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  PDF oder CSV hierher ziehen
                </p>
                <p className="text-xs text-muted-foreground">oder klicken zum Auswählen</p>
              </div>
            )}
          </div>

          {isPdf && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 p-3">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800 dark:text-amber-200">
                Die PDF wird per KI ausgelesen. Das kann 15–30 Sekunden dauern. Bereits vorhandene Monate werden aktualisiert.
              </p>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => { onOpenChange(false); setSelectedFile(null); }}
              disabled={uploadMutation.isPending}
              data-testid="button-cancel-upload"
            >
              Abbrechen
            </Button>
            <Button
              onClick={() => selectedFile && uploadMutation.mutate(selectedFile)}
              disabled={!selectedFile || uploadMutation.isPending}
              data-testid="button-start-upload"
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isPdf ? "KI analysiert…" : "Importiere…"}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Importieren
                </>
              )}
            </Button>
          </div>

          {uploadMutation.isSuccess && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950 p-3">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <p className="text-sm text-green-800 dark:text-green-200">{(uploadMutation.data as any)?.message}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function BwaPage() {
  const { data: reports, isLoading } = useQuery<BwaReport[]>({
    queryKey: ["/api/bwa-reports"],
  });
  const { toast } = useToast();

  const [selectedId, setSelectedId] = useState<string>("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteReport, setDeleteReport] = useState<BwaReport | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/bwa-reports/${id}`);
    },
    onSuccess: () => {
      toast({ title: "BWA-Bericht gelöscht" });
      queryClient.invalidateQueries({ queryKey: ["/api/bwa-reports"] });
      setDeleteReport(null);
    },
  });

  const selectedReport = reports?.find(r => r.id.toString() === selectedId) || (reports && reports.length > 0 ? reports[0] : null);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!reports || reports.length === 0) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold" data-testid="text-page-title">BWA Auswertung</h1>
          <Button onClick={() => setUploadOpen(true)} data-testid="button-bwa-upload">
            <Upload className="h-4 w-4 mr-2" />
            BWA importieren
          </Button>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <BarChart3 className="h-12 w-12 mb-4" />
            <p>Keine BWA-Daten hinterlegt</p>
            <p className="text-sm mt-2">Laden Sie eine BWA-PDF oder CSV hoch, um Daten zu importieren.</p>
            <Button className="mt-4" onClick={() => setUploadOpen(true)} data-testid="button-bwa-upload-empty">
              <Upload className="h-4 w-4 mr-2" />
              BWA hochladen
            </Button>
          </CardContent>
        </Card>
        <BwaUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      </div>
    );
  }

  const r = selectedReport!;
  const gl = parseFloat(r.gesamtleistung || "0");
  const calcPercent = (val: string | null | undefined) => {
    if (!val || gl === 0) return null;
    return ((parseFloat(val) / gl) * 100);
  };
  const be = parseFloat(r.betriebsergebnis || "0");
  const eve = parseFloat(r.ergebnisVorSteuern || "0");
  const ve = parseFloat(r.vorlaeufigesErgebnis || "0");
  const pk = parseFloat(r.personalkosten || "0");
  const gk = parseFloat(r.gesamtkosten || "0");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">BWA Auswertung</h1>
          <p className="text-sm text-muted-foreground">Betriebswirtschaftliche Auswertung – Kurzfristige Erfolgsrechnung</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => setUploadOpen(true)} data-testid="button-bwa-upload">
            <Upload className="h-4 w-4 mr-2" />
            BWA importieren
          </Button>
          <Select value={selectedId || (selectedReport?.id.toString() ?? "")} onValueChange={setSelectedId}>
            <SelectTrigger className="w-[280px]" data-testid="select-bwa-period">
              <SelectValue placeholder="Zeitraum wählen..." />
            </SelectTrigger>
            <SelectContent>
              {reports.map(rep => (
                <SelectItem key={rep.id} value={rep.id.toString()}>
                  {rep.period} ({rep.year}) {rep.month === 0 ? "– Gesamtjahr" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Link href="/rechnungsbuch">
          <Card className="cursor-pointer hover:shadow-md transition-all hover:-translate-y-0.5">
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">Umsatzerlöse <ExternalLink className="h-3 w-3" /></div>
              <div className="text-lg font-bold" data-testid="text-bwa-umsatz">{fmtCurrency(r.umsatzerloese)}</div>
            </CardContent>
          </Card>
        </Link>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground mb-1">Betriebsergebnis</div>
            <div className={`text-lg font-bold flex items-center gap-1 ${be < 0 ? "text-red-600" : "text-green-600"}`} data-testid="text-bwa-betriebsergebnis">
              {be >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {fmtCurrency(r.betriebsergebnis)}
            </div>
          </CardContent>
        </Card>
        <Link href="/mitarbeiter">
          <Card className="cursor-pointer hover:shadow-md transition-all hover:-translate-y-0.5">
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">Personalkosten <ExternalLink className="h-3 w-3" /></div>
              <div className="text-lg font-bold" data-testid="text-bwa-personal">{fmtCurrency(r.personalkosten)}</div>
              <div className="text-xs text-muted-foreground">{fmtPercent(calcPercent(r.personalkosten))} der Gesamtleistung</div>
            </CardContent>
          </Card>
        </Link>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground mb-1">Vorl. Ergebnis</div>
            <div className={`text-lg font-bold ${ve < 0 ? "text-red-600" : "text-green-600"}`} data-testid="text-bwa-ergebnis">
              {fmtCurrency(r.vorlaeufigesErgebnis)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Kurzfristige Erfolgsrechnung
            </CardTitle>
            <p className="text-xs text-muted-foreground">{r.period} – Handelsrecht (DATEV-BWA, SKR 03)</p>
          </CardHeader>
          <CardContent className="p-0">
            <BwaSectionHeader title="Leistung" />
            <BwaRow label="Umsatzerlöse" value={r.umsatzerloese} percent={100} />
            <BwaRow label="Bestandsveränderung FE/UE" value={r.bestandsveraenderung} percent={calcPercent(r.bestandsveraenderung)} indent />
            <BwaRow label="Aktivierte Eigenleistungen" value={r.aktivierteEigenleistungen} percent={calcPercent(r.aktivierteEigenleistungen)} indent />
            <BwaRow label="Gesamtleistung" value={r.gesamtleistung} percent={100} bold />

            <BwaSectionHeader title="Material & Rohertrag" />
            <BwaRow label="Material-/Wareneinkauf" value={r.materialWareneinkauf} percent={calcPercent(r.materialWareneinkauf)} indent />
            <BwaRow label="Rohertrag" value={r.rohertrag} percent={calcPercent(r.rohertrag)} bold />
            <BwaRow label="So. betr. Erlöse" value={r.soBetrieblicheErloese} percent={calcPercent(r.soBetrieblicheErloese)} indent />
            <BwaRow label="Betrieblicher Rohertrag" value={r.betrieblichRohertrag} percent={calcPercent(r.betrieblichRohertrag)} bold />

            <BwaSectionHeader title="Kostenarten" />
            <BwaRow label="Personalkosten" value={r.personalkosten} percent={calcPercent(r.personalkosten)} indent />
            <BwaRow label="Raumkosten" value={r.raumkosten} percent={calcPercent(r.raumkosten)} indent />
            <BwaRow label="Betriebliche Steuern" value={r.betrieblicheSteuern} percent={calcPercent(r.betrieblicheSteuern)} indent />
            <BwaRow label="Versicherungen/Beiträge" value={r.versicherungenBeitraege} percent={calcPercent(r.versicherungenBeitraege)} indent />
            <BwaRow label="Besondere Kosten" value={r.besondereKosten} percent={calcPercent(r.besondereKosten)} indent />
            <BwaRow label="Fahrzeugkosten" value={r.fahrzeugkosten} percent={calcPercent(r.fahrzeugkosten)} indent />
            <BwaRow label="Werbe-/Reisekosten" value={r.werbeReisekosten} percent={calcPercent(r.werbeReisekosten)} indent />
            <BwaRow label="Kosten Warenabgabe" value={r.kostenWarenabgabe} percent={calcPercent(r.kostenWarenabgabe)} indent />
            <BwaRow label="Abschreibungen" value={r.abschreibungen} percent={calcPercent(r.abschreibungen)} indent />
            <BwaRow label="Reparatur/Instandhaltung" value={r.reparaturInstandhaltung} percent={calcPercent(r.reparaturInstandhaltung)} indent />
            <BwaRow label="Sonstige Kosten" value={r.sonstigeKosten} percent={calcPercent(r.sonstigeKosten)} indent />
            <BwaRow label="Gesamtkosten" value={r.gesamtkosten} percent={calcPercent(r.gesamtkosten)} bold />

            <BwaSectionHeader title="Ergebnis" />
            <BwaRow label="Betriebsergebnis" value={r.betriebsergebnis} percent={calcPercent(r.betriebsergebnis)} bold />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Neutrales Ergebnis & Steuern
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <BwaSectionHeader title="Neutraler Aufwand" />
            <BwaRow label="Zinsaufwand" value={r.zinsaufwand} percent={calcPercent(r.zinsaufwand)} indent />
            <BwaRow label="Sonstiger neutraler Aufwand" value={r.neutralerAufwand} indent />
            <BwaRow label="Neutraler Aufwand gesamt" value={r.neutralerAufwand} bold />

            <BwaSectionHeader title="Neutraler Ertrag" />
            <BwaRow label="Zinserträge" value={r.zinsertraege} percent={calcPercent(r.zinsertraege)} indent />
            <BwaRow label="Sonstiger neutraler Ertrag" value={r.sonstigerNeutralerErtrag} percent={calcPercent(r.sonstigerNeutralerErtrag)} indent />
            <BwaRow label="Neutraler Ertrag gesamt" value={r.neutralerErtrag} bold />

            <BwaSectionHeader title="Endergebnis" />
            <BwaRow label="Ergebnis vor Steuern" value={r.ergebnisVorSteuern} percent={calcPercent(r.ergebnisVorSteuern)} bold />
            <BwaRow label="Steuern Einkommen u. Ertrag" value={r.steuernEinkommenErtrag} percent={calcPercent(r.steuernEinkommenErtrag)} indent />
            <BwaRow label="Vorläufiges Ergebnis" value={r.vorlaeufigesErgebnis} percent={calcPercent(r.vorlaeufigesErgebnis)} bold />
          </CardContent>

          <CardHeader className="pb-2 pt-6">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Kennzahlen</span>
              <Link href="/stundensatz">
                <span className="text-xs font-normal text-primary hover:underline cursor-pointer flex items-center gap-1">
                  Stundensatzermittlung <ExternalLink className="h-3 w-3" />
                </span>
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Rohertrag-Quote</div>
                <div className="text-lg font-bold" data-testid="text-bwa-rohertrag-quote">{fmtPercent(calcPercent(r.rohertrag))}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Personalkostenquote</div>
                <div className="text-lg font-bold" data-testid="text-bwa-pk-quote">{fmtPercent(calcPercent(r.personalkosten))}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Umsatzrendite</div>
                <div className={`text-lg font-bold ${eve < 0 ? "text-red-600" : "text-green-600"}`} data-testid="text-bwa-rendite">
                  {fmtPercent(calcPercent(r.ergebnisVorSteuern))}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Materialkostenquote</div>
                <div className="text-lg font-bold" data-testid="text-bwa-material-quote">{fmtPercent(calcPercent(r.materialWareneinkauf))}</div>
              </div>
            </div>

            {r.notes && (
              <div className="rounded-lg border p-3 bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">Hinweis</div>
                <div className="text-sm">{r.notes}</div>
              </div>
            )}

            {r.sourceFile && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-3 w-3" />
                Quelle: {r.sourceFile}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {reports.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Gespeicherte BWA-Berichte</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {reports.map(rep => (
                <div
                  key={rep.id}
                  className={`flex items-center py-2 px-3 cursor-pointer hover:bg-muted/50 rounded ${rep.id === selectedReport?.id ? "bg-primary/5" : ""}`}
                  onClick={() => setSelectedId(rep.id.toString())}
                  data-testid={`bwa-report-${rep.id}`}
                >
                  <div className="flex-1">
                    <span className="font-medium text-sm">{rep.period}</span>
                    {rep.month === 0 && <Badge variant="secondary" className="ml-2 text-xs">Gesamtjahr</Badge>}
                  </div>
                  <div className="text-sm font-mono">{fmtCurrency(rep.umsatzerloese)}</div>
                  <div className={`text-sm font-mono ml-6 w-32 text-right ${parseFloat(rep.vorlaeufigesErgebnis || "0") < 0 ? "text-red-600" : "text-green-600"}`}>
                    {fmtCurrency(rep.vorlaeufigesErgebnis)}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-2 h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteReport(rep);
                    }}
                    data-testid={`button-delete-bwa-${rep.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <BwaUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      <AlertDialog open={deleteReport !== null} onOpenChange={(open) => !open && !deleteMutation.isPending && setDeleteReport(null)}>
        <AlertDialogContent data-testid="dialog-delete-bwa">
          <AlertDialogHeader>
            <AlertDialogTitle>BWA-Bericht löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Der Bericht {deleteReport ? `"${deleteReport.period}"` : ""} wird dauerhaft entfernt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending} data-testid="button-cancel-delete-bwa">
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteReport && deleteMutation.mutate(deleteReport.id)}
              data-testid="button-confirm-delete-bwa"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
