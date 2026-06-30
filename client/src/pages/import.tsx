import { useState, useCallback, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Info, CheckCircle, AlertTriangle, X, RefreshCw, Database, ArrowRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const CUSTOMER_FIELDS: Record<string, string> = {
  customerNumber: "Kunden-Nr",
  searchKey: "Such-Name",
  name: "Name",
  name2: "Vorname/Name2",
  salutation: "Anrede",
  street: "Straße",
  zip: "PLZ",
  city: "Ort",
  phone: "Telefon",
  fax: "Fax",
  mobile: "Mobil",
  email: "E-Mail",
};

const MATERIAL_FIELDS: Record<string, string> = {
  articleNumber: "Artikel-Nr",
  name: "Bezeichnung",
  description: "Beschreibung",
  unit: "Einheit",
  purchasePrice: "EK-Preis",
  sellPrice: "VK-Preis",
  supplier: "Lieferant",
};

const HAPAK_CUSTOMER_MAP: Record<string, string> = {
  "Kunden-Nr": "customerNumber",
  "Such-Name": "searchKey",
  "Name": "name",
  "Vorname": "name2",
  "Name2": "name2",
  "Strasse": "street",
  "Straße": "street",
  "PLZ": "zip",
  "Ort": "city",
  "Telefon": "phone",
  "Fax": "fax",
  "Mobil": "mobile",
  "Email": "email",
  "E-Mail": "email",
  "Anrede": "salutation",
};

const HAPAK_MATERIAL_MAP: Record<string, string> = {
  "Artikel-Nr": "articleNumber",
  "Artikelnummer": "articleNumber",
  "Bezeichnung": "name",
  "Einheit": "unit",
  "EK-Preis": "purchasePrice",
  "VK-Preis": "sellPrice",
  "Lieferant": "supplier",
};

interface ParsedData {
  headers: string[];
  rows: string[][];
  totalRows: number;
  fileId: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

function ImportTab({ type, fields, autoMap }: {
  type: "customers" | "materials";
  fields: Record<string, string>;
  autoMap: Record<string, string>;
}) {
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/import/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      return res.json() as Promise<ParsedData>;
    },
    onSuccess: (data) => {
      setParsedData(data);
      setImportResult(null);
      const autoMapping: Record<string, string> = {};
      data.headers.forEach((header) => {
        const normalized = header.trim();
        if (autoMap[normalized]) {
          autoMapping[normalized] = autoMap[normalized];
        } else {
          const lower = normalized.toLowerCase();
          for (const [key, value] of Object.entries(autoMap)) {
            if (key.toLowerCase() === lower) {
              autoMapping[normalized] = value;
              break;
            }
          }
        }
      });
      setMapping(autoMapping);
    },
    onError: (err: any) => {
      toast({ title: "Fehler beim Hochladen", description: err.message, variant: "destructive" });
    },
  });

  const handleFile = useCallback((file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "txt", "dat"].includes(ext || "")) {
      toast({ title: "Ungültiges Dateiformat", description: "Bitte laden Sie eine CSV-, TXT- oder DAT-Datei hoch.", variant: "destructive" });
      return;
    }
    uploadMutation.mutate(file);
  }, [uploadMutation, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleImport = async () => {
    if (!parsedData) return;
    setImporting(true);
    setProgress(10);
    setImportResult(null);

    try {
      setProgress(30);
      const res = await fetch("/api/import/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type, mapping, fileId: parsedData.fileId }),
      });
      setProgress(80);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      const result = await res.json() as ImportResult;
      setProgress(100);
      setImportResult(result);
      if (type === "customers") {
        queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/materials"] });
      }
      toast({ title: "Import abgeschlossen", description: `${result.imported} Datensätze importiert` });
    } catch (err: any) {
      toast({ title: "Importfehler", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const updateMapping = (header: string, field: string) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (field === "__none__") {
        delete next[header];
      } else {
        next[header] = field;
      }
      return next;
    });
  };

  const resetUpload = () => {
    setParsedData(null);
    setMapping({});
    setImportResult(null);
    setProgress(0);
  };

  const mappedFieldValues = Object.values(mapping);

  return (
    <div className="space-y-4">
      {!parsedData ? (
        <Card>
          <CardContent className="p-6">
            <div
              className={`border-2 border-dashed rounded-md p-8 text-center transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25"}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              data-testid={`dropzone-${type}`}
            >
              <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">Datei hierher ziehen</p>
              <p className="text-sm text-muted-foreground mb-4">oder klicken Sie auf den Button</p>
              <label>
                <input
                  type="file"
                  accept=".csv,.txt,.dat"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                  data-testid={`input-file-${type}`}
                />
                <Button
                  variant="outline"
                  className="pointer-events-none"
                  data-testid={`button-upload-${type}`}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Datei auswählen
                </Button>
              </label>
              <p className="text-xs text-muted-foreground mt-3">
                CSV (Semikolon-getrennt), TXT (Tab-getrennt), DAT
              </p>
            </div>
            {uploadMutation.isPending && (
              <div className="mt-4">
                <Progress value={50} data-testid={`progress-upload-${type}`} />
                <p className="text-sm text-muted-foreground mt-2 text-center">Datei wird verarbeitet...</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm text-muted-foreground" data-testid={`text-file-info-${type}`}>
              {parsedData.totalRows} Datensätze gefunden, {parsedData.headers.length} Spalten
            </p>
            <Button variant="outline" size="sm" onClick={resetUpload} data-testid={`button-reset-${type}`}>
              <X className="h-4 w-4 mr-1" />Neue Datei
            </Button>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Spaltenzuordnung</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {parsedData.headers.map((header) => (
                  <div key={header} className="flex items-center gap-2">
                    <span className="text-sm font-mono min-w-0 truncate flex-shrink-0" title={header}>
                      {header}
                    </span>
                    <Select
                      value={mapping[header] || "__none__"}
                      onValueChange={(v) => updateMapping(header, v)}
                    >
                      <SelectTrigger className="flex-1" data-testid={`select-mapping-${header}`}>
                        <SelectValue placeholder="Nicht zuordnen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- Nicht zuordnen --</SelectItem>
                        {Object.entries(fields).map(([key, label]) => (
                          <SelectItem
                            key={key}
                            value={key}
                            disabled={mappedFieldValues.includes(key) && mapping[header] !== key}
                          >
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Vorschau (max. 100 Zeilen)</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {parsedData.headers.map((h) => (
                      <TableHead key={h} className="whitespace-nowrap text-xs">
                        {h}
                        {mapping[h] && (
                          <span className="block text-xs text-primary font-normal">
                            {fields[mapping[h]] || mapping[h]}
                          </span>
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.rows.slice(0, 10).map((row, i) => (
                    <TableRow key={i} data-testid={`row-preview-${type}-${i}`}>
                      {row.map((cell, j) => (
                        <TableCell key={j} className="text-xs whitespace-nowrap">{cell}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {importing && (
            <div>
              <Progress value={progress} data-testid={`progress-import-${type}`} />
              <p className="text-sm text-muted-foreground mt-2 text-center">Import läuft...</p>
            </div>
          )}

          {importResult && (
            <Alert variant={importResult.errors.length > 0 ? "destructive" : "default"} data-testid={`alert-result-${type}`}>
              {importResult.errors.length > 0 ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              <AlertTitle>Import abgeschlossen</AlertTitle>
              <AlertDescription>
                <p data-testid={`text-result-${type}`}>
                  {importResult.imported} Datensätze importiert, {importResult.skipped} übersprungen, {importResult.errors.length} Fehler
                </p>
                {importResult.errors.length > 0 && (
                  <ul className="mt-2 text-xs space-y-1 max-h-32 overflow-auto">
                    {importResult.errors.slice(0, 20).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {importResult.errors.length > 20 && (
                      <li>... und {importResult.errors.length - 20} weitere Fehler</li>
                    )}
                  </ul>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2">
            <Button
              onClick={handleImport}
              disabled={importing || Object.keys(mapping).length === 0}
              data-testid={`button-import-${type}`}
            >
              <Upload className="h-4 w-4 mr-2" />
              Importieren
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function NasPositionsImport() {
  const { toast } = useToast();
  const [status, setStatus] = useState<any>(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    fetch("/api/import/nas-positions-status", { credentials: "include" })
      .then(r => r.json())
      .then(data => { setStatus(data); if (data.running) setPolling(true); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(() => {
      fetch("/api/import/nas-positions-status", { credentials: "include" })
        .then(r => r.json())
        .then(data => {
          setStatus(data);
          if (!data.running) {
            setPolling(false);
            queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
          }
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [polling]);

  const startBgImport = async () => {
    try {
      const res = await fetch("/api/import/nas-positions-bg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      setStatus(data);
      setPolling(true);
      toast({ title: "Hintergrund-Import gestartet" });
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    }
  };

  const importMut = useMutation({
    mutationFn: async (batchSize: number) => {
      const res = await fetch("/api/import/nas-positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ batchSize }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Import fehlgeschlagen");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setStatus(data);
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: `NAS-Import: ${data.imported} Dokumente mit Positionen befüllt` });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const isRunning = status?.running || importMut.isPending;
  const progressPercent = status?.total > 0 ? Math.round((status.processed / status.total) * 100) : 0;

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <FileText className="h-6 w-6 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg">Hapak-Positionen vom NAS nachladen</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Lädt die Detail-DBF-Dateien (Positionen) direkt vom Synology NAS für alle Dokumente,
              die noch keine Positionen haben.
            </p>
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <Button
            onClick={startBgImport}
            disabled={isRunning}
            data-testid="button-nas-import-all"
          >
            {status?.running ? "Import läuft..." : "Alle Positionen vom NAS laden (Hintergrund)"}
          </Button>
          <Button
            variant="outline"
            onClick={() => importMut.mutate(20)}
            disabled={isRunning}
            data-testid="button-nas-import-20"
          >
            {importMut.isPending ? "Läuft..." : "20 Dokumente (Einzelbatch)"}
          </Button>
        </div>

        {isRunning && (
          <div className="space-y-2">
            <Progress value={progressPercent} className="h-2" />
            <p className="text-sm text-muted-foreground">
              {status?.running
                ? `Verarbeite Dokument ${status.processed} von ${status.total} (${progressPercent}%) — ${status.imported} importiert, ${status.skipped} übersprungen, ${status.failed} Fehler`
                : "Verbinde mit NAS und lade Positionsdaten..."}
            </p>
          </div>
        )}

        {status && !status.running && (status.imported > 0 || status.processed > 0) && (
          <Alert className={status.imported > 0 ? "border-green-300 bg-green-50 dark:bg-green-950/20" : "border-amber-300 bg-amber-50"}>
            {status.imported > 0 ? <CheckCircle className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
            <AlertTitle>{status.message || "Import abgeschlossen"}</AlertTitle>
            <AlertDescription>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-sm">
                <div><span className="text-muted-foreground">Importiert:</span> <strong>{status.imported}</strong></div>
                <div><span className="text-muted-foreground">Übersprungen:</span> {status.skipped}</div>
                <div><span className="text-muted-foreground">Fehler:</span> {status.failed}</div>
                <div><span className="text-muted-foreground">Gesamt:</span> {status.total || status.remainingDocs || 0}</div>
              </div>
              {status.errors?.length > 0 && (
                <div className="mt-2 text-xs text-red-600 max-h-32 overflow-auto">
                  {status.errors.map((e: string, i: number) => <p key={i}>{e}</p>)}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

interface SyncCategory {
  label: string;
  neu: number;
  geaendert: number;
  unveraendert: number;
  kalkNachsync: number;
  details: string[];
}

interface SyncPreviewData {
  categories: Record<string, SyncCategory>;
  totalNeu: number;
  totalGeaendert: number;
  totalKalkNachsync: number;
  errors: string[];
  nasConnected: boolean;
}

const CATEGORY_ICONS: Record<string, string> = {
  customers: "👥",
  documents: "📄",
  projects: "📁",
  abschlag: "💰",
  positions: "📋",
  fibu: "📊",
  fibuAdd: "📎",
};

function HapakSyncTab() {
  const [preview, setPreview] = useState<SyncPreviewData | null>(null);
  const [syncResult, setSyncResult] = useState<{ success: boolean; results: Record<string, string>; errors: string[] } | null>(null);
  const [phase, setPhase] = useState<"idle" | "previewing" | "ready" | "syncing" | "done">("idle");
  const { toast } = useToast();

  const previewMut = useMutation({
    mutationFn: async () => {
      setPhase("previewing");
      const res = await fetch("/api/nas/sync-preview", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      setPreview(data.preview);
      setSyncResult(null);
      setPhase("ready");
    },
    onError: (err: any) => {
      toast({ title: "Vorschau fehlgeschlagen", description: err.message, variant: "destructive" });
      setPhase("idle");
    },
  });

  const executeMut = useMutation({
    mutationFn: async () => {
      setPhase("syncing");
      const res = await fetch("/api/nas/sync-execute", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      setSyncResult(data.result);
      setPreview(null);
      setPhase("done");
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "HAPAK-Sync abgeschlossen", description: data.result.success ? "Alle Daten synchronisiert" : "Sync mit Fehlern abgeschlossen" });
    },
    onError: (err: any) => {
      toast({ title: "Sync fehlgeschlagen", description: err.message, variant: "destructive" });
      setPhase("ready");
    },
  });

  const isLoading = phase === "previewing" || phase === "syncing";
  const totalChanges = preview ? preview.totalNeu + preview.totalGeaendert + preview.totalKalkNachsync : 0;

  return (
    <div className="space-y-4" data-testid="hapak-sync-panel">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Database className="h-6 w-6 text-purple-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg" data-testid="text-sync-title">HAPAK Komplett-Sync</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Vollständige Synchronisation aller Daten vom Synology NAS (HAPAK ist Wahrheit).
                Zuerst wird eine Vorschau (Trockenlauf) erstellt — erst nach Bestätigung werden Daten geschrieben.
              </p>
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <Button
              onClick={() => previewMut.mutate()}
              disabled={isLoading}
              variant={phase === "idle" ? "default" : "outline"}
              data-testid="button-sync-preview"
            >
              {phase === "previewing" ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyse läuft...</>
              ) : (
                <><RefreshCw className="h-4 w-4 mr-2" /> Trockenlauf-Vorschau</>
              )}
            </Button>
            {phase === "ready" && totalChanges > 0 && (
              <Button
                onClick={() => executeMut.mutate()}
                disabled={isLoading}
                className="bg-green-600 hover:bg-green-700"
                data-testid="button-sync-execute"
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                Jetzt synchronisieren ({totalChanges} Änderungen)
              </Button>
            )}
          </div>

          {isLoading && (
            <div className="mt-4 space-y-2">
              <Progress value={phase === "previewing" ? 40 : 60} className="h-2" />
              <p className="text-sm text-muted-foreground">
                {phase === "previewing"
                  ? "Verbinde mit NAS und analysiere Datenbestände..."
                  : "Synchronisiere Daten (kann einige Minuten dauern)..."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {preview && phase === "ready" && (
        <Card data-testid="sync-preview-results">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Trockenlauf-Vorschau
              {preview.nasConnected && <Badge variant="outline" className="text-green-600 border-green-300">NAS verbunden</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 text-center">
                <p className="text-2xl font-bold text-blue-600" data-testid="text-sync-total-new">{preview.totalNeu}</p>
                <p className="text-xs text-muted-foreground">Neue Datensätze</p>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-center">
                <p className="text-2xl font-bold text-amber-600" data-testid="text-sync-total-changed">{preview.totalGeaendert}</p>
                <p className="text-xs text-muted-foreground">Geänderte Datensätze</p>
              </div>
              <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/20 text-center">
                <p className="text-2xl font-bold text-purple-600" data-testid="text-sync-total-kalk">{preview.totalKalkNachsync}</p>
                <p className="text-xs text-muted-foreground">Kalk. nachzusyncen</p>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kategorie</TableHead>
                  <TableHead className="text-right">Neu</TableHead>
                  <TableHead className="text-right">Geändert</TableHead>
                  <TableHead className="text-right">Unverändert</TableHead>
                  <TableHead className="text-right">Kalk. fehlt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(preview.categories).map(([key, cat]) => (
                  <TableRow key={key} data-testid={`sync-row-${key}`}>
                    <TableCell className="font-medium">
                      {CATEGORY_ICONS[key] || "📦"} {cat.label}
                    </TableCell>
                    <TableCell className="text-right">
                      {cat.neu > 0 ? <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">{cat.neu}</Badge> : <span className="text-muted-foreground">0</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {cat.geaendert > 0 ? <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{cat.geaendert}</Badge> : <span className="text-muted-foreground">0</span>}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{cat.unveraendert}</TableCell>
                    <TableCell className="text-right">
                      {cat.kalkNachsync > 0 ? <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">{cat.kalkNachsync}</Badge> : <span className="text-muted-foreground">0</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {Object.entries(preview.categories).some(([, cat]) => cat.details.length > 0) && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Details (erste Einträge):</h4>
                {Object.entries(preview.categories).map(([key, cat]) =>
                  cat.details.length > 0 ? (
                    <div key={key} className="text-xs space-y-0.5">
                      <p className="font-medium text-muted-foreground">{cat.label}:</p>
                      {cat.details.map((d, i) => (
                        <p key={i} className="pl-4 text-muted-foreground">{d}</p>
                      ))}
                    </div>
                  ) : null
                )}
              </div>
            )}

            {preview.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Fehler bei der Analyse</AlertTitle>
                <AlertDescription>
                  {preview.errors.map((e, i) => <p key={i} className="text-sm">{e}</p>)}
                </AlertDescription>
              </Alert>
            )}

            {totalChanges === 0 && preview.errors.length === 0 && (
              <Alert className="border-green-300 bg-green-50 dark:bg-green-950/20">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertTitle>Alles aktuell</AlertTitle>
                <AlertDescription>Keine Änderungen nötig — alle HAPAK-Daten sind bereits synchron.</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {syncResult && phase === "done" && (
        <Card data-testid="sync-execution-results">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              {syncResult.success ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
              Synchronisation {syncResult.success ? "erfolgreich" : "mit Fehlern"} abgeschlossen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(syncResult.results).map(([key, val]) => (
                <div key={key} className="flex justify-between items-center py-1.5 border-b last:border-0">
                  <span className="text-sm font-medium capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                  <span className="text-sm text-muted-foreground">{val}</span>
                </div>
              ))}
            </div>

            {syncResult.errors.length > 0 && (
              <Alert variant="destructive" className="mt-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Fehler</AlertTitle>
                <AlertDescription>
                  {syncResult.errors.map((e, i) => <p key={i} className="text-sm">{e}</p>)}
                </AlertDescription>
              </Alert>
            )}

            <Button
              onClick={() => { setPhase("idle"); setSyncResult(null); }}
              variant="outline"
              className="mt-4"
              data-testid="button-sync-reset"
            >
              Neue Synchronisation starten
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ImportPage() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-import-title">Datenimport</h1>
        <p className="text-muted-foreground">Hapak-Daten importieren & synchronisieren</p>
      </div>

      <Alert data-testid="alert-hapak-info">
        <Info className="h-4 w-4" />
        <AlertTitle>Hapak Datenordner</AlertTitle>
        <AlertDescription>
          <p className="mb-1">
            Hapak Datenordner (S:\HapakV22\FB ZuB): Adressen, Daten, Material, Leistung...
          </p>
          <p>Exportieren Sie die Daten als CSV und laden Sie sie hier hoch.</p>
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="sync" data-testid="tabs-import">
        <TabsList>
          <TabsTrigger value="sync" data-testid="tab-sync">HAPAK-Sync</TabsTrigger>
          <TabsTrigger value="nas" data-testid="tab-nas">NAS-Import</TabsTrigger>
          <TabsTrigger value="customers" data-testid="tab-customers">Kunden</TabsTrigger>
          <TabsTrigger value="materials" data-testid="tab-materials">Materialien</TabsTrigger>
        </TabsList>
        <TabsContent value="sync" className="mt-4">
          <HapakSyncTab />
        </TabsContent>
        <TabsContent value="nas" className="mt-4">
          <NasPositionsImport />
        </TabsContent>
        <TabsContent value="customers" className="mt-4">
          <ImportTab type="customers" fields={CUSTOMER_FIELDS} autoMap={HAPAK_CUSTOMER_MAP} />
        </TabsContent>
        <TabsContent value="materials" className="mt-4">
          <ImportTab type="materials" fields={MATERIAL_FIELDS} autoMap={HAPAK_MATERIAL_MAP} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
