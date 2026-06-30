import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { fmtDocNumber } from "@/lib/format";
import { documentTypeLabels, documentStatusLabels } from "@shared/schema";
import type { Customer, Document } from "@shared/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Calculator,
  Eye,
  Download,
  Printer,
  Mail,
  FolderPlus,
  Shuffle,
  Loader2,
  Info,
  ZoomIn,
  ZoomOut,
  Save,
  Undo2,
  Redo2,
  PlusCircle,
  MinusCircle,
  Layers,
  Clock,
  List,
  ChevronDown,
  Check,
  SpellCheck,
  AlertTriangle,
} from "lucide-react";
import type { EditorItem } from "../types";

export interface EditorToolbarProps {
  dirty: boolean;
  navigate: (path: string) => void;
  documentId: number | null | undefined;
  isNew: boolean;
  docForm: any;
  setDocForm: React.Dispatch<React.SetStateAction<any>>;
  setDirty: (v: boolean) => void;
  typeLabel: string;
  selectedCustomer: Customer | null | undefined;
  showKalk: boolean;
  setShowKalk: (v: boolean) => void;
  showPreview: boolean;
  setShowPreview: (v: boolean) => void;
  saveMutation: { mutate: (v?: any, opts?: any) => void; isPending: boolean };
  setEmailForm: (v: any) => void;
  setEmailDialogOpen: (v: boolean) => void;
  setAssignProjectId: (v: number | null) => void;
  setAssignFolderId: (v: number | null) => void;
  setProjectSearch: (v: string) => void;
  setProjectAssignOpen: (v: boolean) => void;
  convertTargets: { type: string; label: string }[];
  convertMutation: { mutate: (v: string) => void; isPending: boolean };
  undo: () => void;
  redo: () => void;
  undoLen: number;
  redoLen: number;
  zoomLevel: number;
  setZoomLevel: React.Dispatch<React.SetStateAction<number>>;
  parentDoc: { id: number; type: string; documentNumber: string } | null | undefined;
  childDocuments: { id: number; type: string; documentNumber: string; date?: string }[] | null | undefined;
  showBezugsDokTyp?: boolean;
  addPosition: (type: string, parentJumboIndex?: number, insertAfterIndex?: number) => void;
  setArtikelDialog: (v: any) => void;
  setLohnOpen: (v: boolean) => void;
  setLohnTargetJumbo: (v: number | null) => void;
  setFloskelOpen: (v: boolean) => void;
  setFloskelTarget?: (v: string) => void;
  focusedRow: number | null;
  showOriginalQuantities: boolean;
  setShowOriginalQuantities: React.Dispatch<React.SetStateAction<boolean>>;
  items: EditorItem[];
  setExpandedJumbos: React.Dispatch<React.SetStateAction<Set<string>>>;
  setIdsDialog: (v: any) => void;
  updateMaterialPrices: () => void;
  displayMode: string;
  setDisplayMode: (v: string) => void;
  spellCheck: boolean;
  setSpellCheck: (v: boolean) => void;
  isAbschlagOrSchluss: boolean;
  setAbschlagInsertOpen: (v: boolean) => void;
  setDocPropertiesOpen?: (v: boolean) => void;
  druckMarkerPruefen?: boolean;
  schliessenMarkerPruefen?: boolean;
  showFormatBar?: boolean;
  showHelpers?: boolean;
  onPdfExported?: () => void;
}

export const DISPLAY_MODES = [
  { value: "normal", label: "Vollständig" },
  { value: "kurzliste", label: "Kurzliste" },
  { value: "summenliste", label: "Summenliste / Titelzusammenstellung" },
  { value: "ohne-preise", label: "Ohne Positionspreise" },
  { value: "zeitenliste", label: "Arbeitszeitliste" },
] as const;

export function EditorToolbar({
  dirty,
  navigate,
  documentId,
  isNew,
  docForm,
  setDocForm,
  setDirty,
  typeLabel,
  selectedCustomer,
  showKalk,
  setShowKalk,
  showPreview,
  setShowPreview,
  saveMutation,
  setEmailForm,
  setEmailDialogOpen,
  setAssignProjectId,
  setAssignFolderId,
  setProjectSearch,
  setProjectAssignOpen,
  convertTargets,
  convertMutation,
  undo,
  redo,
  undoLen,
  redoLen,
  zoomLevel,
  setZoomLevel,
  parentDoc,
  childDocuments,
  showBezugsDokTyp = true,
  addPosition,
  setArtikelDialog,
  setLohnOpen,
  setLohnTargetJumbo,
  setFloskelOpen,
  setFloskelTarget,
  focusedRow,
  showOriginalQuantities,
  setShowOriginalQuantities,
  items,
  setExpandedJumbos,
  setIdsDialog,
  updateMaterialPrices,
  displayMode,
  setDisplayMode,
  spellCheck,
  setSpellCheck,
  isAbschlagOrSchluss,
  setAbschlagInsertOpen,
  setDocPropertiesOpen,
  druckMarkerPruefen,
  schliessenMarkerPruefen,
  showFormatBar,
  showHelpers = false,
  onPdfExported,
}: EditorToolbarProps) {
  const confirmResolver = useRef<((confirmed: boolean) => void) | null>(null);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    details?: string[];
    confirmLabel: string;
    cancelLabel?: string;
    tone?: "warning" | "danger" | "info";
    alertOnly?: boolean;
  }>({
    open: false,
    title: "",
    description: "",
    confirmLabel: "OK",
  });

  const helperTitle = (text: string) => showHelpers ? text : undefined;
  const countableItems = items.filter((item) => !item._parentClientId && !["abschluss", "titelsumme", "zwischensumme", "freitext", "floskel", "text"].includes(item.type || ""));
  const documentLabel = `${typeLabel}: ${fmtDocNumber(docForm.documentNumber) || "Neu"}`;
  const customerLabel = selectedCustomer?.name || "Kein Kunde";

  const hasMarkerWarnings = (checkItems: EditorItem[]): string[] => {
    const warnings: string[] = [];
    for (const it of checkItems) {
      if (it.title?.includes("✗") || it.description?.includes("✗")) {
        warnings.push(`Pos ${it.posNumber || "?"}: Marker "✗" gefunden`);
      }
    }
    return warnings;
  };

  const requestConfirm = useCallback((config: Omit<typeof confirmState, "open">) => {
    return new Promise<boolean>((resolve) => {
      confirmResolver.current = resolve;
      setConfirmState({ ...config, open: true });
    });
  }, []);

  const closeConfirm = useCallback((confirmed: boolean) => {
    confirmResolver.current?.(confirmed);
    confirmResolver.current = null;
    setConfirmState((current) => ({ ...current, open: false }));
  }, []);

  const confirmMarkerWarnings = useCallback(async (title: string, description: string) => {
    const warnings = hasMarkerWarnings(items);
    if (!warnings.length) return true;
    return requestConfirm({
      title,
      description,
      details: warnings,
      confirmLabel: "Trotzdem fortfahren",
      cancelLabel: "Abbrechen",
      tone: "warning",
    });
  }, [items, requestConfirm]);

  const confirmDirtyLeave = useCallback(async () => {
    if (!dirty) return true;
    return requestConfirm({
      title: "Ungespeicherte Aenderungen",
      description: "Das Dokument wurde geaendert. Beim Verlassen gehen nicht gespeicherte Aenderungen verloren.",
      confirmLabel: "Trotzdem verlassen",
      cancelLabel: "Bleiben",
      tone: "danger",
    });
  }, [dirty, requestConfirm]);

  const handleBack = useCallback(async () => {
    if (schliessenMarkerPruefen) {
      const markerOk = await confirmMarkerWarnings("Marker-Warnung", "Im Dokument wurden offene Marker gefunden.");
      if (!markerOk) return;
    }
    const dirtyOk = await confirmDirtyLeave();
    if (!dirtyOk) return;
    navigate(documentId ? `/dokumente/${documentId}` : "/dokumente");
  }, [confirmDirtyLeave, confirmMarkerWarnings, documentId, navigate, schliessenMarkerPruefen]);

  const showInfo = useCallback((title: string, description: string) => {
    return requestConfirm({
      title,
      description,
      confirmLabel: "OK",
      tone: "info",
      alertOnly: true,
    });
  }, [requestConfirm]);

  const openDocumentPdf = useCallback(() => {
    window.open(`/api/documents/${documentId}/pdf${displayMode !== "normal" ? `?displayMode=${displayMode}` : ""}`, "_blank");
    onPdfExported?.();
  }, [displayMode, documentId, onPdfExported]);

  const handlePdf = useCallback(async () => {
    if (isNew) {
      await showInfo("Dokument zuerst speichern", "Bitte speichere das Dokument, bevor ein PDF erstellt werden kann.");
      return;
    }
    if (druckMarkerPruefen) {
      const markerOk = await confirmMarkerWarnings("Marker-Warnung vor PDF-Export", "Im Dokument wurden offene Marker gefunden.");
      if (!markerOk) return;
    }
    if (dirty) {
      const shouldSave = await requestConfirm({
        title: "Vor PDF speichern?",
        description: "Es gibt ungespeicherte Aenderungen. Soll das Dokument zuerst gespeichert und danach als PDF geoeffnet werden?",
        confirmLabel: "Speichern und PDF",
        cancelLabel: "Abbrechen",
        tone: "warning",
      });
      if (!shouldSave) return;
      saveMutation.mutate(undefined, { onSuccess: openDocumentPdf });
      return;
    }
    openDocumentPdf();
  }, [confirmMarkerWarnings, dirty, druckMarkerPruefen, isNew, openDocumentPdf, requestConfirm, saveMutation, showInfo]);

  const handleArbeitszeitlistePdf = useCallback(async () => {
    if (isNew) {
      await showInfo("Dokument zuerst speichern", "Bitte speichere das Dokument, bevor die Arbeitszeitliste erstellt werden kann.");
      return;
    }
    if (druckMarkerPruefen) {
      const markerOk = await confirmMarkerWarnings("Marker-Warnung vor PDF-Export", "Im Dokument wurden offene Marker gefunden.");
      if (!markerOk) return;
    }
    const openList = () => window.open(`/api/documents/${documentId}/arbeitszeitliste-pdf`, "_blank");
    if (dirty) {
      const shouldSave = await requestConfirm({
        title: "Vor PDF speichern?",
        description: "Es gibt ungespeicherte Aenderungen. Soll das Dokument zuerst gespeichert und danach die Arbeitszeitliste geoeffnet werden?",
        confirmLabel: "Speichern und PDF",
        cancelLabel: "Abbrechen",
        tone: "warning",
      });
      if (!shouldSave) return;
      saveMutation.mutate(undefined, { onSuccess: openList });
      return;
    }
    openList();
  }, [confirmMarkerWarnings, dirty, documentId, druckMarkerPruefen, isNew, requestConfirm, saveMutation, showInfo]);

  const handlePrint = useCallback(async () => {
    if (druckMarkerPruefen) {
      const markerOk = await confirmMarkerWarnings("Marker-Warnung vor Druck", "Im Dokument wurden offene Marker gefunden.");
      if (!markerOk) return;
    }
    window.print();
    onPdfExported?.();
  }, [confirmMarkerWarnings, druckMarkerPruefen, onPdfExported]);

  const jumboParentIds = items
    .filter((item) => (item.type === "jumbo" || item.positionFlag === "jumbo") && !item._parentClientId)
    .map((item) => item._clientId)
    .filter(Boolean);
  const hasJumboParents = jumboParentIds.length > 0;
  const showAllJumboLists = useCallback(() => {
    setExpandedJumbos(new Set(jumboParentIds));
  }, [jumboParentIds, setExpandedJumbos]);
  const hideAllJumboLists = useCallback(() => {
    setExpandedJumbos(new Set());
  }, [setExpandedJumbos]);

  return (
    <div className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 shadow-lg backdrop-blur-xl print:hidden dark:bg-gray-900/90">
      <Dialog open={confirmState.open} onOpenChange={(open) => { if (!open) closeConfirm(false); }}>
        <DialogContent className="max-w-[460px] overflow-hidden border-slate-200 p-0 shadow-2xl" data-testid="dialog-toolbar-confirm">
          <div className="bg-[linear-gradient(112deg,#07111f_0%,#0f2f3f_55%,#0b7a75_100%)] px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-white/15 bg-white/10">
                <AlertTriangle className={`h-5 w-5 ${confirmState.tone === "danger" ? "text-red-200" : confirmState.tone === "info" ? "text-cyan-100" : "text-amber-200"}`} />
              </div>
              <DialogHeader className="space-y-0 text-left">
                <DialogTitle className="text-base text-white">{confirmState.title}</DialogTitle>
                <div className="text-xs text-cyan-50/75">Dokument-Workbench</div>
              </DialogHeader>
            </div>
          </div>
          <div className="space-y-3 px-5 py-4">
            <p className="text-sm text-slate-700">{confirmState.description}</p>
            {confirmState.details?.length ? (
              <div className="max-h-32 overflow-auto rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {confirmState.details.map((detail, index) => (
                  <div key={`${detail}-${index}`}>{detail}</div>
                ))}
              </div>
            ) : null}
          </div>
          <DialogFooter className="border-t border-slate-100 bg-slate-50 px-5 py-3">
            {!confirmState.alertOnly && (
              <Button variant="outline" onClick={() => closeConfirm(false)} data-testid="button-toolbar-confirm-cancel">
                {confirmState.cancelLabel || "Abbrechen"}
              </Button>
            )}
            <Button
              className={confirmState.tone === "danger" ? "bg-red-600 text-white hover:bg-red-700" : "bg-sky-600 text-white hover:bg-sky-700"}
              onClick={() => closeConfirm(true)}
              data-testid="button-toolbar-confirm-ok"
            >
              {confirmState.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="relative overflow-hidden border-b border-slate-900/20 bg-[linear-gradient(112deg,#07111f_0%,#0f2f3f_47%,#0b7a75_100%)] px-4 py-3 text-white">
        <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="pointer-events-none absolute left-1/2 top-0 h-px w-1/3 bg-white/30" />
        <div className="relative flex items-center justify-between gap-4 overflow-x-auto scrollbar-hide">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 shrink-0 rounded-md border border-white/10 bg-white/10 px-0 text-white shadow-sm hover:bg-white/20 hover:text-white"
              onClick={() => { void handleBack(); }}
              data-testid="button-back-workbench"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100/80">
                <span>Dokument-Workbench</span>
                {dirty && <span className="rounded-full bg-amber-300/95 px-2 py-0.5 text-[9px] tracking-normal text-amber-950">Ungespeichert</span>}
              </div>
              <div className="mt-0.5 flex min-w-0 items-baseline gap-2">
                <span className="truncate text-[15px] font-semibold tracking-normal text-white sm:text-lg" data-testid="text-doc-title-workbench">
                  {documentLabel}
                </span>
                <span className="hidden max-w-[280px] truncate text-xs text-cyan-50/70 md:inline">- {customerLabel}</span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-2 lg:flex">
              <span className="rounded-md border border-white/10 bg-white/10 px-2.5 py-1.5 text-[11px] text-cyan-50 shadow-sm">
                {countableItems.length} Positionen
              </span>
              <span className="rounded-md border border-white/10 bg-white/10 px-2.5 py-1.5 text-[11px] text-cyan-50 shadow-sm">
                {showPreview ? "Vorschau aktiv" : "Bearbeiten"}
              </span>
              <span className="rounded-md border border-amber-200/30 bg-amber-300/15 px-2.5 py-1.5 text-[11px] font-semibold text-amber-100 shadow-sm">
                VK{docForm.priceLevel || 1}
              </span>
            </div>
            <Button
              size="sm"
              className="h-9 rounded-md bg-white px-3 text-xs font-semibold text-slate-950 shadow-lg hover:bg-cyan-50"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              title={helperTitle("Dokument speichern")}
              data-testid="button-save-workbench"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">{saveMutation.isPending ? "Speichert..." : "Speichern"}</span>
            </Button>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between px-4 py-2.5 gap-3 overflow-x-auto scrollbar-hide bg-white/95">
        <div className="flex items-center gap-2 min-w-0 shrink-0 sm:shrink">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 px-0 shrink-0 rounded-md text-slate-600 hover:text-slate-950 hover:bg-slate-100"
            onClick={() => { void handleBack(); }}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="h-6 hidden sm:block" />
          <div className="flex items-center gap-2 min-w-0 rounded-md bg-slate-50/90 px-2.5 py-1.5 border border-slate-200/70 shadow-xs">
            <span
              className="text-[13px] font-semibold tracking-tight text-slate-950 truncate max-w-[160px] sm:max-w-[360px]"
              data-testid="text-doc-title"
            >
              {documentLabel}
            </span>
            {dirty && (
              <span className="shrink-0 w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Ungespeicherte Änderungen" data-testid="indicator-dirty" />
            )}
            <span className="text-[11px] text-slate-500 hidden sm:inline truncate">
              - {selectedCustomer?.name || "Kein Kunde"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1 rounded-md border border-slate-200/70 bg-slate-50/80 px-1 py-1 shadow-xs">
          <Select
            value={docForm.status}
            onValueChange={(v) => {
              setDocForm((f: any) => ({ ...f, status: v }));
              setDirty(true);
            }}
          >
            <SelectTrigger
              className={`h-8 rounded-md text-xs w-auto border-slate-200 shadow-sm ${
                docForm.status === "bezahlt" ? "bg-green-50 text-green-700 border-green-300" :
                docForm.status === "storniert" ? "bg-red-50 text-red-700 border-red-300" :
                docForm.status === "versendet" ? "bg-blue-50 text-blue-700 border-blue-300" :
                docForm.status === "beauftragt" ? "bg-cyan-50 text-cyan-700 border-cyan-300" :
                "bg-gray-50 text-gray-600 border-gray-300"
              }`}
              data-testid="select-status"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(documentStatusLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={String(docForm.priceLevel || 1)}
            onValueChange={(v) => {
              setDocForm((f: any) => ({ ...f, priceLevel: parseInt(v) }));
              setDirty(true);
            }}
          >
            <SelectTrigger
              className="h-8 rounded-md text-xs w-auto border-amber-200 bg-amber-50 text-amber-800 shadow-sm"
              data-testid="select-price-level"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">VK1</SelectItem>
              <SelectItem value="2">VK2</SelectItem>
              <SelectItem value="3">VK3</SelectItem>
            </SelectContent>
          </Select>
          </div>

          <Separator orientation="vertical" className="h-5" />

          <Button
            variant={showKalk ? "default" : "outline"}
            size="sm"
            className="h-8 rounded-md text-xs gap-1.5 px-3"
            onClick={() => setShowKalk(!showKalk)}
            title={helperTitle("Kalkulationsspalten ein-/ausblenden")}
            data-testid="button-kalkulation"
          >
            <Calculator className="h-3 w-3" />
            <span className="hidden sm:inline">Kalkulation</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-md text-xs gap-1.5 px-3 text-slate-700 hover:bg-slate-100"
            onClick={() => setDocPropertiesOpen?.(true)}
            title={helperTitle("Eigenschaften des aktuellen Dokumentes öffnen")}
            data-testid="button-doc-properties"
          >
            <Info className="h-3 w-3" />
            <span className="hidden sm:inline">Eigenschaften</span>
          </Button>

          <Separator orientation="vertical" className="h-5" />

          <Button
            variant={showPreview ? "default" : "ghost"}
            size="sm"
            className="h-8 rounded-md text-xs gap-1.5 px-3"
            onClick={() => {
              setShowPreview(!showPreview);
            }}
            title={helperTitle("Dokumentvorschau ein-/ausblenden")}
            data-testid="button-preview"
          >
            <Eye className="h-3 w-3" />
            <span className="hidden sm:inline">Vorschau</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-md text-xs gap-1.5 px-3 text-slate-700 hover:bg-slate-100"
            onClick={() => { void handlePdf(); }}
            disabled={isNew}
            title={helperTitle("PDF für dieses Dokument erstellen")}
            data-testid="button-pdf"
          >
            <Download className="h-3 w-3" />
            <span className="hidden sm:inline">PDF</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={`h-8 rounded-md text-xs gap-1.5 px-3 ${displayMode !== "normal" ? "bg-blue-50 text-blue-700 border border-blue-200" : "text-slate-700 hover:bg-slate-100"}`}
                data-testid="button-listen-dropdown"
              >
                <List className="h-3 w-3" />
                <span className="hidden sm:inline">{DISPLAY_MODES.find(m => m.value === displayMode)?.label || "Listen"}</span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {DISPLAY_MODES.filter(m => m.value !== "zeitenliste").map((mode) => (
                <DropdownMenuItem
                  key={mode.value}
                  onClick={() => setDisplayMode(mode.value)}
                  className="flex items-center justify-between"
                  data-testid={`menu-display-${mode.value}`}
                >
                  <span>{mode.label}</span>
                  {displayMode === mode.value && <Check className="h-3.5 w-3.5 text-blue-600" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => { void handleArbeitszeitlistePdf(); }}
                data-testid="menu-display-zeitenliste"
              >
                <span>Arbeitszeitliste (PDF)</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 w-8 rounded-md p-0 text-xs ${spellCheck ? "bg-green-50 text-green-700 border border-green-200" : "text-slate-400 hover:bg-slate-100"}`}
            onClick={() => {
              const next = !spellCheck;
              setSpellCheck(next);
              localStorage.setItem("editor-spellcheck", String(next));
            }}
            title={spellCheck ? "Rechtschreibprüfung aus" : "Rechtschreibprüfung ein"}
            data-testid="button-spellcheck"
          >
            <SpellCheck className="h-3 w-3" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-md text-xs gap-1.5 px-3 text-slate-700 hover:bg-slate-100"
                data-testid="button-more-actions"
              >
                <ChevronDown className="h-3 w-3" />
                <span className="hidden sm:inline">Mehr</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onClick={() => { void handlePrint(); }}
                data-testid="button-print"
              >
                <Printer className="h-4 w-4 mr-2" />
                Drucken
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setEmailForm({
                    to: selectedCustomer?.email || "",
                    cc: "",
                    bcc: "post@fristd-bau.com",
                    subject: `${typeLabel} Nr. ${fmtDocNumber(docForm.documentNumber)}`,
                    message: "",
                    attachPdf: true,
                  });
                  setEmailDialogOpen(true);
                }}
                data-testid="button-send-email"
              >
                <Mail className="h-4 w-4 mr-2" />
                E-Mail senden
              </DropdownMenuItem>
              {hasJumboParents && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={showAllJumboLists}
                    data-testid="menu-jumbo-lists-show"
                  >
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Jumbo-Listen anzeigen
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={hideAllJumboLists}
                    data-testid="menu-jumbo-lists-hide"
                  >
                    <MinusCircle className="h-4 w-4 mr-2" />
                    Jumbo-Listen ausblenden
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  if (isNew) {
                    void showInfo("Dokument zuerst speichern", "Bitte speichere das Dokument, bevor du es einem Projekt zuordnest.");
                    return;
                  }
                  setAssignProjectId(docForm.projectId || null);
                  setAssignFolderId(null);
                  setProjectSearch("");
                  setProjectAssignOpen(true);
                }}
                disabled={isNew}
                data-testid="button-project-assign"
              >
                <FolderPlus className="h-4 w-4 mr-2" />
                Projektzuordnung
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {convertTargets.length > 0 && (
            <Select
              onValueChange={(v) => convertMutation.mutate(v)}
              disabled={convertMutation.isPending}
            >
              <SelectTrigger
                className="h-8 rounded-md text-xs w-auto gap-1.5 border-slate-200 bg-slate-50"
                data-testid="button-umwandeln"
              >
                {convertMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Shuffle className="h-3 w-3" />
                )}
                <span className="hidden sm:inline">Umwandeln</span>
              </SelectTrigger>
              <SelectContent>
                {convertTargets.map((t) => (
                  <SelectItem key={t.type} value={t.type}>
                    → {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Separator orientation="vertical" className="h-5" />
          <div className="flex items-center gap-0.5 rounded-md border border-slate-200/70 bg-slate-50/80 p-0.5" data-testid="undo-redo-group">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 rounded-md p-0 text-slate-600 hover:bg-slate-100"
              onClick={undo}
              disabled={undoLen === 0}
              title={`Rückgängig (${undoLen})`}
              data-testid="button-undo"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 rounded-md p-0 text-slate-600 hover:bg-slate-100"
              onClick={redo}
              disabled={redoLen === 0}
              title={`Wiederherstellen (${redoLen})`}
              data-testid="button-redo"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Separator orientation="vertical" className="h-5" />
          <Button
            size="sm"
            className="h-8 rounded-md gap-1.5 bg-blue-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            title={helperTitle("Dokument speichern")}
            data-testid="button-save"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">{saveMutation.isPending ? "Speichert..." : "Speichern"}</span>
          </Button>
          <Separator orientation="vertical" className="h-5 hidden sm:block" />
          <div className="hidden sm:flex items-center gap-0.5 rounded-md border border-slate-200/70 bg-slate-50/80 p-0.5" data-testid="zoom-controls">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 rounded-md p-0 text-slate-600 hover:bg-slate-100"
              onClick={() => setZoomLevel(z => Math.max(50, z - 10))}
              disabled={zoomLevel <= 50}
              title={helperTitle("Ansicht verkleinern")}
              data-testid="button-zoom-out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <button
              className="w-12 rounded-md py-1 text-center font-mono text-[11px] text-slate-600 hover:bg-slate-100"
              onClick={() => setZoomLevel(100)}
              title={helperTitle("Zoom auf 100% zurücksetzen")}
              data-testid="button-zoom-reset"
            >
              {zoomLevel}%
            </button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 rounded-md p-0 text-slate-600 hover:bg-slate-100"
              onClick={() => setZoomLevel(z => Math.min(150, z + 10))}
              disabled={zoomLevel >= 150}
              title={helperTitle("Ansicht vergrößern")}
              data-testid="button-zoom-in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {(parentDoc || (childDocuments && childDocuments.length > 0)) && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-t bg-blue-50 dark:bg-blue-950/30 text-xs" data-testid="convert-info-banner">
          <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-blue-700 dark:text-blue-300">
            {parentDoc && (
              <span>
                Erstellt aus {showBezugsDokTyp ? `${documentTypeLabels[parentDoc.type] || parentDoc.type} ` : ""}
                <button
                  className="underline hover:text-blue-900 dark:hover:text-blue-100 font-medium"
                  onClick={() => navigate(`/dokumente/${parentDoc.id}/bearbeiten`)}
                  data-testid="link-parent-doc"
                >
                  {fmtDocNumber(parentDoc.documentNumber)}
                </button>
              </span>
            )}
            {(childDocuments || []).map((child) => (
              <span key={child.id}>
                → Umgewandelt in {documentTypeLabels[child.type] || child.type}{" "}
                <button
                  className="underline hover:text-blue-900 dark:hover:text-blue-100 font-medium"
                  onClick={() => navigate(`/dokumente/${child.id}/bearbeiten`)}
                  data-testid={`link-child-doc-${child.id}`}
                >
                  {fmtDocNumber(child.documentNumber)}
                </button>
                {child.date && ` am ${child.date}`}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 px-4 py-2 border-t border-slate-100 bg-[linear-gradient(180deg,#f8fafc_0%,#eef6fb_100%)] overflow-x-auto">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mr-1 shrink-0">Einfügen</span>
        {[
          { key: "titel", label: "Titel" },
          { key: "material", label: "Material", action: () => setArtikelDialog({ filter: "Material" }) },
          { key: "leistung", label: "Leistung", shortcut: "F3" },
          { key: "jumbo", label: "Jumbo", shortcut: "F4", action: () => setArtikelDialog({ filter: "Jumbo" }) },
          { key: "jumbo-frei", label: "Jumbo frei", shortcut: "F5", action: () => addPosition("jumbo") },
          { key: "lohn", label: "Lohn", action: () => { setLohnOpen(true); setLohnTargetJumbo(null); } },
          { key: "manuell", label: "Manuell" },
        ].map(({ key, label, action, shortcut }: any) => (
          <button
            key={key}
            className="h-7 rounded-md border border-transparent px-2.5 text-[11px] font-medium shrink-0 text-slate-600 hover:border-cyan-100 hover:text-slate-950 hover:bg-white hover:shadow-sm transition-all"
            onClick={() => (action ? action() : addPosition(key))}
            title={helperTitle(`${label} einfügen`)}
            data-testid={`toolbar-add-${key}`}
          >
            {label}
            {shortcut && <span className="text-[9px] text-slate-400 ml-1">{shortcut}</span>}
          </button>
        ))}
        <span className="h-4 border-l border-slate-200 mx-1" />
        {(() => {
          const insertIdx = focusedRow ?? items.length - 1;
          const afterAbschluss = items.some((it, i) => it.type === "abschluss" && i <= insertIdx);
          return [
            { key: "freitext", label: "Text", action: afterAbschluss ? () => { setFloskelTarget?.("afterTotalsText"); setFloskelOpen(true); } : undefined },
            { key: "floskel", label: "Floskel", action: () => { if (afterAbschluss) setFloskelTarget?.("afterTotalsText"); setFloskelOpen(true); } },
            { key: "titelsumme", label: "TitS" },
            { key: "zwischensumme", label: "ZwS" },
            { key: "abschluss", label: "Abschl" },
            { key: "skonto", label: "Skonto" },
          ].map(({ key, label, action }: any) => (
            <button
              key={key}
              className="h-7 rounded-md border border-transparent px-2.5 text-[11px] shrink-0 text-slate-500 hover:border-cyan-100 hover:text-slate-900 hover:bg-white hover:shadow-sm transition-all"
              onClick={() => (action ? action() : addPosition(key))}
              title={helperTitle(`${label} einfügen`)}
              data-testid={`toolbar-add-${key}`}
            >
              {label}
            </button>
          ));
        })()}
        {docForm.type === "mitschnitt" && (
          <>
            <span className="h-4 border-l border-slate-200 mx-1" />
            <button
              className={`h-6 rounded-md px-2 text-[11px] shrink-0 transition-colors ${showOriginalQuantities ? "bg-blue-100 text-blue-700 font-semibold" : "text-slate-500 hover:text-slate-900 hover:bg-white hover:shadow-sm"}`}
              onClick={() => setShowOriginalQuantities(v => !v)}
              data-testid="toolbar-toggle-original-quantities"
              title={helperTitle("Mengen aus Ursprungsdokument ein-/ausblenden")}
            >
              {showOriginalQuantities ? "Orig.-Mengen ✓" : "Orig.-Mengen"}
            </button>
          </>
        )}
        <div className="ml-auto flex items-center gap-0.5 shrink-0">
          <button
            className="h-6 rounded-md px-2 text-[11px] shrink-0 text-slate-500 hover:text-slate-900 hover:bg-white hover:shadow-sm transition-colors"
            onClick={() => setIdsDialog({})}
            title="IDS Connect - GC Warenkorb importieren"
            data-testid="toolbar-ids-connect"
          >
            GC/IDS
          </button>
          <button
            className="h-6 rounded-md px-2 text-[11px] shrink-0 text-slate-500 hover:text-slate-900 hover:bg-white hover:shadow-sm transition-colors"
            onClick={() => updateMaterialPrices()}
            title={helperTitle("Alle Materialpreise aus Stamm aktualisieren")}
            data-testid="toolbar-update-prices"
          >
            ↻ Preise
          </button>
          {hasJumboParents && (
            <>
              <button
                className="h-6 rounded-md px-2 text-[11px] text-slate-500 hover:text-slate-900 hover:bg-white hover:shadow-sm transition-colors flex items-center gap-1"
                onClick={showAllJumboLists}
                title="Jumbo-Positionslisten im gesamten Dokument anzeigen"
                data-testid="button-expand-all"
              >
                <Layers className="h-3 w-3" />
                Jumbos an
              </button>
              <button
                className="h-6 rounded-md px-2 text-[11px] text-slate-500 hover:text-slate-900 hover:bg-white hover:shadow-sm transition-colors flex items-center gap-1"
                onClick={hideAllJumboLists}
                title="Jumbo-Positionslisten im gesamten Dokument ausblenden"
                data-testid="button-collapse-all"
              >
                <MinusCircle className="h-3 w-3" />
                Jumbos aus
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

