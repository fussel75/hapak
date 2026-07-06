import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo as useMemoReact,
} from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation, useRoute } from "wouter";
import type {
  Document,
  DocumentItem,
  Customer,
  Project,
  CompanySettings,
  EditorSettings,
  LaborRate,
  FormTemplate,
  UnitType,
} from "@shared/schema";
import { documentTypeLabels, documentStatusLabels } from "@shared/schema";
import { fmtDocNumber } from "@/lib/format";
import { useDocumentTabs } from "@/lib/document-tabs";
import {
  recalcAllSums,
  buildPositionNumbers,
  resolveTemplate,
  paginateDocument,
} from "@shared/document-engine/compute-document-bundle";
import {
  applyEditorSettingsToNewDocument,
  getDocumentTypeDefaultFormTemplateId,
  getEffectiveFormTemplateId,
  getNewDocumentDefaultFormTemplateId,
} from "@shared/document-engine/editor-settings";
import {
  documentToEditorForm,
  getCalculationInputsFromForm,
} from "@shared/document-engine/document-form";
import { recalcJumboFromChildren } from "@shared/document-engine/jumbo";
import { normalizeDocumentCreateType } from "@shared/document-engine/document-types";
import { normalizeDocumentTypeLabel } from "@shared/document-engine/document-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtCurrency, fmtNumber, fmtPercent } from "@/lib/format";
import {
  Plus,
  Save,
  Trash2,
  Type,
  FileText,
  Lock,
  Eye,
  Copy,
  Mail,
  Send,
  Loader2,
  FolderPlus,
  TextCursorInput,
  AlertTriangle,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import DocumentPreview from "@/components/document-preview";

import type { EditorItem, IdsArticle, Material } from "./document-editor/types";
import { genClientId, PT_TO_PX, emptyItem, remapClipboardItems, expandSelectionWithChildren, splitTitleDesc, kalkCalc, getVortextEndIdx, parseFontSpec, resolveEditorColumnWidths, getJumboChildCount, buildEditorZones } from "./document-editor/utils";
import {
  useItemOperations,
  useDocumentSave,
  useDragDrop,
  useKeyboardShortcuts,
  useSlashMenu,
} from "./document-editor/hooks";
import {
  FloskelDialog,
  LohnDialog,
  ArtikelDialog,
  JumboPackageDialog,
  IdsConnectDialog,
  ProzentZuschlagDialog,
  PriceDialog,
  EigenschaftenDialog,
  KiTextDialog,
  NettosummeDetailDialog,
  TitelsummeDetailDialog,
  AbschlagInsertDialog,
  DocPropertiesDialog,
  VortextEditDialog,
} from "./document-editor/components/dialogs";
import { InsertMenu } from "./document-editor/components/menus";
import { PositionRow } from "./document-editor/components/position-row";
import { SlashMenu } from "./document-editor/components/slash-menu";
import { A4PageWrapper, SummaryAndFooterBlock } from "./document-editor/components/a4-components";
import { EditorToolbar } from "./document-editor/components/editor-toolbar";
import { EditorSidebar } from "./document-editor/components/editor-sidebar";
import { EmailDialog } from "./document-editor/components/email-dialog";
import { ProjectAssignDialog } from "./document-editor/components/project-assign-dialog";
import { InvoiceRegisterDialog } from "./document-editor/components/dialogs/invoice-register-dialog";
import { QuickActionBar } from "./document-editor/components/quick-action-bar";
import { useRowSelection } from "./document-editor/hooks/use-row-selection";
import { useContextActions } from "./document-editor/hooks/use-context-actions";

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function DocumentEditorPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [, editParams] = useRoute("/dokumente/:id/bearbeiten");
  const [, newParams] = useRoute("/dokumente/neu");
  const isNew = !!newParams;
  const documentId = editParams?.id ? parseInt(editParams.id) : undefined;
  const { openDocument, updateTabLabel, registerDirtyCheck, unregisterDirtyCheck } = useDocumentTabs();

  const searchParams = new URLSearchParams(window.location.search);
  const defaultType: string = normalizeDocumentCreateType(searchParams.get("type"));
  const defaultCustomerId = searchParams.get("customerId");
  const defaultProjectId = searchParams.get("projectId");
  const sourceDocId = searchParams.get("sourceDocId");

  // ─── State ──────────────────────────────────────────────────────────────────
  const [lockState, setLockState] = useState<
    "none" | "acquiring" | "locked" | "blocked"
  >(isNew ? "none" : "acquiring");
  const [loadedDocumentId, setLoadedDocumentId] = useState<number | null>(isNew ? 0 : null);
  const [lockedByUser, setLockedByUser] = useState("");
  const heartbeatRef = useRef<ReturnType<typeof setInterval>>();
  const [expandedJumbos, setExpandedJumbos] = useState<Set<string>>(new Set());
  const [floskelOpen, setFloskelOpen] = useState(false);
  const [floskelTarget, setFloskelTarget] = useState<string>("position");
  const [lohnOpen, setLohnOpen] = useState(false);
  const [lohnTargetJumbo, setLohnTargetJumbo] = useState<number | null>(null);
  const [kiTextOpen, setKiTextOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [projectAssignOpen, setProjectAssignOpen] = useState(false);
  const [assignProjectId, setAssignProjectId] = useState<number | null>(null);
  const [assignFolderId, setAssignFolderId] = useState<number | null>(null);
  const [projectSearch, setProjectSearch] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [displayMode, setDisplayMode] = useState("normal");
  const [spellCheck, setSpellCheck] = useState(() => {
    const stored = localStorage.getItem("editor-spellcheck");
    return stored !== null ? stored === "true" : false;
  });
  const [nettoDetailOpen, setNettoDetailOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [emailForm, setEmailForm] = useState({
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    message: "",
    attachPdf: true,
  });
  const [priceDialogItem, setPriceDialogItem] = useState<{
    index: number;
    item: Partial<EditorItem>;
  } | null>(null);
  const [titelsummeDetailIndex, setTitelsummeDetailIndex] = useState<number | null>(null);
  const [jumboMenuOpen, setJumboMenuOpen] = useState<number | null>(null);
  const [vortextEditOpen, setVortextEditOpen] = useState(false);
  const [showKalk, setShowKalk] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [showOriginalQuantities, setShowOriginalQuantities] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"kalkulation" | "dokument" | "positionen">("dokument");
  const [artikelDialog, setArtikelDialog] = useState<{
    filter: string;
    parentJumboIndex?: number;
  } | null>(null);
  const [eigenschaftenItem, setEigenschaftenItem] = useState<{
    index: number;
    item: Partial<EditorItem>;
  } | null>(null);
  const [idsDialog, setIdsDialog] = useState<{
    parentJumboIndex?: number;
  } | null>(null);
  const [prozentDialog, setProzentDialog] = useState(false);
  const [abschlagInsertOpen, setAbschlagInsertOpen] = useState(false);
  const [docPropertiesOpen, setDocPropertiesOpen] = useState(false);
  const [invoiceRegisterOpen, setInvoiceRegisterOpen] = useState(false);
  const [clipboard, setClipboard] = useState<EditorItem[] | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const autoOpenedDocPropertiesRef = useRef(false);

  const [docForm, setDocForm] = useState({
    type: defaultType,
    customerId: defaultCustomerId ? parseInt(defaultCustomerId) : 0,
    projectId: defaultProjectId ? parseInt(defaultProjectId) : 0,
    subject: "",
    date: new Date().toISOString().split("T")[0],
    validUntil: "",
    status: "entwurf",
    headerText: "",
    footerText: "",
    beforeWorkText: "",
    beforeTotalsText: "",
    afterTotalsText: "",
    taxRate: "19.00",
    paymentTermDays: 14,
    skontoDays: 0,
    skontoPercent: "0.00",
    retentionPercent: "0",
    documentNumber: "",
    customTypeLabel: null as string | null,
    formTemplateId: null as number | null,
    hideNetto: false,
    hideMwst: false,
    hideGesamt: false,
    showLohnanteil: false,
    abschlagVerrechnungen: [] as any[],
    erstellungsort: "Hamburg",
    leistungsDatumVon: "",
    leistungsDatumBis: "",
    postausgangAm: "",
    wiedervorlageAm: "",
    kundenReferenz: "",
    leitwegId: "",
    bemerkungen: "",
    skontoBase: "gesamtsumme",
    skontoImDokument: false,
    skontoNurMaterial: false,
    retentionDays: 0,
    erloeskonto: "4400",
    steuerklasse: "50",
    autoPositionNumbers: true,
    positionNumberStep: 1,
    positionNumberStart: 1,
    dezimalstellenMengen: 2,
    dezimalstellenPreise: 2,
    positionenEnthaltenUst: false,
    einzelpreiseInJumbo: true,
    mengenInJumbo: true,
    internpositionenVerbergen: true,
    kalkulationsschema: "spezielle Einstellung",
    selbstkostenLohnsatz: "32.00",
    kalkulierterLohnsatz: "69.30",
    aufschlagMaterial: "30.00",
    aufschlagGeraete: "30.00",
    aufschlagFremdleistung: "30.00",
    langtexteFormatiert: true,
    kurztexteAnzeigen: false,
    jumboListenAnzeigen: true,
    priceLevel: 1,
    kupferpreisBeruecksichtigen: false,
    kupferNotation: "200.00",
    par13b: false,
    formularfelder: {} as Record<string, string>,
  });
  const visibleExpandedJumbos = useMemoReact(
    () => (docForm.jumboListenAnzeigen === false ? new Set<string>() : expandedJumbos),
    [docForm.jumboListenAnzeigen, expandedJumbos],
  );

  const [items, setItemsRaw] = useState<EditorItem[]>([]);
  const undoStackRef = useRef<EditorItem[][]>([]);
  const redoStackRef = useRef<EditorItem[][]>([]);
  const [undoLen, setUndoLen] = useState(0);
  const [redoLen, setRedoLen] = useState(0);
  const skipHistoryRef = useRef(false);
  const MAX_UNDO = 10;

  const setItems: typeof setItemsRaw = (valueOrFn) => {
    if (skipHistoryRef.current) {
      setItemsRaw(valueOrFn);
      return;
    }
    setItemsRaw(prev => {
      const next = typeof valueOrFn === "function" ? valueOrFn(prev) : valueOrFn;
      if (prev.length > 0 || next.length > 0) {
        undoStackRef.current = [...undoStackRef.current.slice(-(MAX_UNDO - 1)), prev.map(it => ({ ...it }))];
        redoStackRef.current = [];
        setUndoLen(undoStackRef.current.length);
        setRedoLen(0);
      }
      return next;
    });
  };

  const undo = () => {
    if (undoStackRef.current.length === 0) return;
    const prev = undoStackRef.current.pop()!;
    setUndoLen(undoStackRef.current.length);
    skipHistoryRef.current = true;
    setItemsRaw(current => {
      redoStackRef.current.push(current.map(it => ({ ...it })));
      setRedoLen(redoStackRef.current.length);
      return prev;
    });
    skipHistoryRef.current = false;
    setDirty(true);
  };

  const redo = () => {
    if (redoStackRef.current.length === 0) return;
    const next = redoStackRef.current.pop()!;
    setRedoLen(redoStackRef.current.length);
    skipHistoryRef.current = true;
    setItemsRaw(current => {
      undoStackRef.current.push(current.map(it => ({ ...it })));
      setUndoLen(undoStackRef.current.length);
      return next;
    });
    skipHistoryRef.current = false;
    setDirty(true);
  };

  const [focusedRow, setFocusedRow] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const [toolboxPos, setToolboxPos] = useState<{ x: number; y: number }>({ x: 80, y: 200 });
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const deleteConfirmResolver = useRef<((confirmed: boolean) => void) | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    count: number;
    label?: string;
  }>({ open: false, count: 0 });

  const requestDeleteConfirm = useCallback((count: number, label?: string) => {
    return new Promise<boolean>((resolve) => {
      deleteConfirmResolver.current = resolve;
      setDeleteConfirm({ open: true, count, label });
    });
  }, []);

  const closeDeleteConfirm = useCallback((confirmed: boolean) => {
    deleteConfirmResolver.current?.(confirmed);
    deleteConfirmResolver.current = null;
    setDeleteConfirm({ open: false, count: 0 });
  }, []);

  // ─── Document lock ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;
    const tryLock = async () => {
      try {
        const res = await apiRequest(
          "POST",
          `/api/documents/${documentId}/lock`,
          {},
        );
        const data = await res.json();
        if (cancelled) return;
        if (data.locked) {
          setLockState("locked");
          heartbeatRef.current = setInterval(async () => {
            try {
              await apiRequest(
                "POST",
                `/api/documents/${documentId}/heartbeat`,
                {},
              );
            } catch {
              setLockState("blocked");
              setLockedByUser("Verbindung verloren");
              if (heartbeatRef.current) clearInterval(heartbeatRef.current);
            }
          }, 60000);
        } else {
          setLockState("blocked");
          setLockedByUser(
            data.heldBy?.fullName ||
              data.heldBy?.username ||
              "Anderer Benutzer",
          );
        }
      } catch {
        if (!cancelled) setLockState("none");
      }
    };
    tryLock();
    return () => {
      cancelled = true;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (documentId)
        fetch(`/api/documents/${documentId}/unlock`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }).catch(() => {});
    };
  }, [documentId]);

  useEffect(() => {
    const warnDirty = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = "Ungespeicherte Änderungen gehen verloren.";
      }
    };
    window.addEventListener("beforeunload", warnDirty);
    return () => window.removeEventListener("beforeunload", warnDirty);
  }, []);

  useEffect(() => {
    if (!documentId) return;
    const unlock = () =>
      navigator.sendBeacon(`/api/documents/${documentId}/unlock-beacon`);
    window.addEventListener("pagehide", unlock);
    return () => window.removeEventListener("pagehide", unlock);
  }, [documentId]);

  useEffect(() => {
    const tabId = documentId ? `doc-${documentId}` : undefined;
    if (!tabId) return;
    registerDirtyCheck(tabId, () => dirtyRef.current);
    return () => unregisterDirtyCheck(tabId);
  }, [documentId, registerDirtyCheck, unregisterDirtyCheck]);

  // ─── Queries ─────────────────────────────────────────────────────────────────
  const { data: docRecord, isLoading: docLoading } = useQuery<Document>({
    queryKey: ["/api/documents", documentId],
    enabled: !!documentId,
  });
  const { data: existingItems, error: existingItemsError } = useQuery<DocumentItem[]>({
    queryKey: ["/api/documents", documentId, "items"],
    queryFn: async () => {
      const r = await fetch(`/api/documents/${documentId}/items`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Positionen konnten nicht geladen werden.");
      return r.json();
    },
    enabled: !!documentId,
  });
  const { data: sourceItems, error: sourceItemsError } = useQuery<DocumentItem[]>({
    queryKey: ["/api/documents", sourceDocId, "items"],
    queryFn: async () => {
      const r = await fetch(`/api/documents/${sourceDocId}/items`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Quellpositionen konnten nicht geladen werden.");
      return r.json();
    },
    enabled: isNew && !!sourceDocId,
  });
  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });
  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });
  const { data: assignTreeNodes } = useQuery<any[]>({
    queryKey: ["/api/projects", assignProjectId, "document-tree"],
    enabled: !!assignProjectId && projectAssignOpen,
  });
  const assignToProjectMut = useMutation({
    mutationFn: async ({ projectId, parentId }: { projectId: number; parentId?: number }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/document-tree`, {
        documentId: parseInt(String(documentId)),
        nodeType: "document",
        parentId: parentId || null,
      });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", variables.projectId, "document-tree"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents", variables.projectId] });
      toast({ title: "Dokument zum Projekt hinzugefügt" });
      setProjectAssignOpen(false);
      setAssignProjectId(null);
      setAssignFolderId(null);
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });
  const { data: units } = useQuery<UnitType[]>({ queryKey: ["/api/units"] });
  const { data: companySettings } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
  });

  useEffect(() => {
    const error = existingItemsError || sourceItemsError;
    if (!error) return;
    toast({
      title: "Positionen nicht geladen",
      description: error instanceof Error ? error.message : "Bitte Verbindung und Anmeldung prüfen.",
      variant: "destructive",
    });
  }, [existingItemsError, sourceItemsError, toast]);
  const { data: editorSettings } = useQuery<EditorSettings>({
    queryKey: ["/api/editor-settings"],
  });
  const { data: formTemplates } = useQuery<FormTemplate[]>({
    queryKey: ["/api/form-templates"],
  });
  const documentTypeDefaultFormTemplateId = getDocumentTypeDefaultFormTemplateId(editorSettings, docForm.type);
  const newDocumentDefaultFormTemplateId = getNewDocumentDefaultFormTemplateId({
    editorSettings,
    documentType: docForm.type,
    companyDefaultFormTemplateId: companySettings?.defaultFormTemplateId,
  });
  const { data: nextNumber } = useQuery<{ number: string }>({
    queryKey: ["/api/documents/next-number", docForm.type],
    queryFn: async () => {
      const r = await fetch(`/api/documents/next-number?type=${docForm.type}`, {
        credentials: "include",
      });
      return r.json();
    },
    enabled: isNew,
  });
  const parentDocId = docRecord?.parentDocumentId;
  const { data: parentDoc } = useQuery<Document>({
    queryKey: ["/api/documents", parentDocId],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${parentDocId}`, { credentials: "include" });
      return res.json();
    },
    enabled: !!parentDocId,
  });
  const isAbschlagOrSchluss = ["abschlagsrechnung", "schlussrechnung", "rechnung"].includes(docForm.type);
  const { data: abschlagData } = useQuery<{
    abschlaege: Document[];
    totalPreviouslyInvoiced: string;
    totalPreviouslyInvoicedGross: string;
    auftragssumme: string | null;
  }>({
    queryKey: ["/api/documents", documentId, "abschlaege"],
    queryFn: async () => {
      const r = await fetch(`/api/documents/${documentId}/abschlaege`, { credentials: "include" });
      return r.json();
    },
    enabled: !!documentId && !!docForm.projectId && ["rechnung", "abschlagsrechnung", "schlussrechnung"].includes(docForm.type),
  });
  const { data: childDocuments } = useQuery<Document[]>({
    queryKey: ["/api/documents", "children", documentId],
    queryFn: async () => {
      const res = await fetch(`/api/documents?parentDocumentId=${documentId}`, { credentials: "include" });
      if (!res.ok) return [];
      const payload = await res.json();
      if (Array.isArray(payload)) return payload;
      return Array.isArray(payload?.data) ? payload.data : [];
    },
    enabled: !!documentId,
  });

  // ─── Load document data ───────────────────────────────────────────────────────
  useEffect(() => {
    if (docRecord && !docLoading) {
      setDocForm(documentToEditorForm(docRecord));
      setLoadedDocumentId(documentId || null);
    }
  }, [docRecord, docLoading, documentId]);

  useEffect(() => {
    if (docRecord && documentId) {
      const typeLabel = documentTypeLabels[docRecord.type as keyof typeof documentTypeLabels] || docRecord.type;
      openDocument(
        documentId,
        docRecord.subject || typeLabel,
        docRecord.documentNumber || "",
        docRecord.type,
      );
    }
  }, [docRecord, documentId]);

  useEffect(() => {
    if (existingItems && docRecord) {
      const idToClientId = new Map<number, string>();
      let loaded: EditorItem[] = existingItems.map((item) => {
        const cid = genClientId();
        if (item.id) idToClientId.set(item.id, cid);
        return { ...item, pageBreakBefore: item.pageBreakBefore === true, _clientId: cid, _parentClientId: null };
      });
      loaded.forEach((item) => {
        if (item.parentItemId && idToClientId.has(item.parentItemId))
          item._parentClientId = idToClientId.get(item.parentItemId)!;
      });

      for (let i = 0; i < loaded.length; i++) {
        const it = loaded[i];
        if (it.type !== "jumbo") continue;
        loaded = recalcJumboFromChildren(loaded, i) as EditorItem[];
      }
      const calcInputs = getCalculationInputsFromForm(documentToEditorForm(docRecord));
      loaded = recalcAllSums(
        loaded,
        calcInputs.taxRate,
        calcInputs.skontoPercent,
        calcInputs.skontoDays,
        calcInputs.skontoNurMaterial,
      ) as EditorItem[];
      skipHistoryRef.current = true;
      setItems(loaded);
      skipHistoryRef.current = false;
      setExpandedJumbos(new Set());
    }
  }, [existingItems, docRecord]);

  useEffect(() => {
    if (isNew && sourceItems && sourceItems.length > 0 && items.length === 0) {
      const idToClientId = new Map<number, string>();
      let loaded: EditorItem[] = sourceItems.map((item) => {
        const cid = genClientId();
        if (item.id) idToClientId.set(item.id, cid);
        return {
          ...item,
          pageBreakBefore: item.pageBreakBefore === true,
          id: undefined,
          _clientId: cid,
          _parentClientId: null,
          documentId: 0,
        };
      });
      loaded.forEach((item) => {
        if (item.parentItemId && idToClientId.has(item.parentItemId))
          item._parentClientId = idToClientId.get(item.parentItemId)!;
        item.parentItemId = null;
      });
      for (let i = 0; i < loaded.length; i++) {
        const it = loaded[i];
        if (it.type !== "jumbo") continue;
        loaded = recalcJumboFromChildren(loaded, i) as EditorItem[];
      }
      loaded = recalcAllSums(
        loaded,
        parseFloat(docForm.taxRate || "19"),
        parseFloat(docForm.skontoPercent || "0"),
        docForm.skontoDays || 0,
        docForm.skontoNurMaterial === true,
      ) as EditorItem[];
      skipHistoryRef.current = true;
      setItems(loaded);
      skipHistoryRef.current = false;
      setDirty(true);
    }
  }, [sourceItems, isNew]);

  useEffect(() => {
    if (isNew && nextNumber)
      setDocForm((f) => ({ ...f, documentNumber: nextNumber.number }));
  }, [nextNumber, isNew]);
  useEffect(() => {
    if (isNew && newDocumentDefaultFormTemplateId && !docForm.formTemplateId)
      setDocForm((f) => ({
        ...f,
        formTemplateId: newDocumentDefaultFormTemplateId,
      }));
  }, [documentId, docForm.formTemplateId, isNew, newDocumentDefaultFormTemplateId]);
  useEffect(() => {
    if (isNew && editorSettings) {
      setDocForm((f) => applyEditorSettingsToNewDocument(f, editorSettings));
    }
  }, [editorSettings, isNew]);

  useEffect(() => {
    if (!isNew || !editorSettings?.eigenschaftenNeuanlage || autoOpenedDocPropertiesRef.current) return;
    autoOpenedDocPropertiesRef.current = true;
    setDocPropertiesOpen(true);
  }, [editorSettings?.eigenschaftenNeuanlage, isNew]);

  useEffect(() => {
    if (editorSettings?.zoomMode !== "fest") return;
    setZoomLevel(editorSettings.zoomPercent || 100);
  }, [editorSettings?.zoomMode, editorSettings?.zoomPercent]);

  const prevSkontoRef = useRef({
    pct: docForm.skontoPercent,
    days: docForm.skontoDays,
    taxRate: docForm.taxRate,
    materialOnly: docForm.skontoNurMaterial,
  });
  useEffect(() => {
    const prev = prevSkontoRef.current;
    if (
      prev.pct === docForm.skontoPercent &&
      prev.days === docForm.skontoDays &&
      prev.taxRate === docForm.taxRate &&
      prev.materialOnly === docForm.skontoNurMaterial
    ) return;
    prevSkontoRef.current = {
      pct: docForm.skontoPercent,
      days: docForm.skontoDays,
      taxRate: docForm.taxRate,
      materialOnly: docForm.skontoNurMaterial,
    };
    if (items.some(it => it.type === "skonto")) {
      const updated = recalcAllSums(
        items,
        parseFloat(docForm.taxRate || "19"),
        parseFloat(docForm.skontoPercent || "0"),
        docForm.skontoDays || 0,
        docForm.skontoNurMaterial === true,
      ) as EditorItem[];
      setItems(updated);
    }
  }, [docForm.skontoPercent, docForm.skontoDays, docForm.taxRate, docForm.skontoNurMaterial, items, setItems]);

  // ─── Item Operations (Hook) ──────────────────────────────────────────────────
  const {
    recalcTitelsummen,
    recalcJumboPrice,
    addPosition,
    updateItem,
    removeItem: rawRemoveItem,
    copyItem,
    moveItem,
    insertFloskel,
    insertLohn,
    insertFromIds,
    insertFromJumboPackage,
    insertProzentZuschlag,
    updateMaterialPrices,
    setzeAlternativ,
    setzeBedarf,
    getTitleBlockIndices,
    insertFromMaterial,
    positionNumbers,
    engineNetTotal,
    netTotal,
    taxAmount,
    grossTotal,
    ekTotal,
    margeTotal,
    markupPercent,
    laborTotal,
  } = useItemOperations({
    items,
    setItems,
    focusedRow,
    setFocusedRow,
    setDirty,
    setDocForm,
    setExpandedJumbos,
    setLohnTargetJumbo,
    docForm,
    documentId,
    docRecord,
    tableRef,
    companySettings,
    editorSettings,
  });

  const removeItem = useCallback(async (index: number) => {
    if (!items[index]) return;
    if (editorSettings?.confirmDeleteLines !== false) {
      const item = items[index];
      const label = item.title || item.type || "Position";
      const confirmed = await requestDeleteConfirm(1, label);
      if (!confirmed) return;
    }
    await rawRemoveItem(index);
  }, [rawRemoveItem, editorSettings?.confirmDeleteLines, items, requestDeleteConfirm]);

  const handleAddJumboChild = useCallback((index: number, item: EditorItem, type: string) => {
    setExpandedJumbos((prev) => new Set([...prev, item._clientId]));
    if (type === "material") {
      setArtikelDialog({
        filter: "Material",
        parentJumboIndex: index,
      });
      return;
    }

    addPosition(type, index);
    setJumboMenuOpen(null);
  }, [addPosition, setExpandedJumbos, setArtikelDialog, setJumboMenuOpen]);


  // ─── Document Save (Hook) ────────────────────────────────────────────────────
  const { saveMutation, convertMutation } = useDocumentSave({
    items,
    setItems,
    setDirty,
    docForm,
    nextDocNumber: nextNumber?.number || "",
    documentId,
    isNew,
    navigate,
    positionNumbers,
    netTotal,
    taxAmount,
    grossTotal,
    laborTotal,
    isAbschlagOrSchluss,
    abschlagData,
  });

  // ─── DnD (Hook) ─────────────────────────────────────────────────────────────
  const { dndSensors, handleDragEnd, sortableIds } = useDragDrop({
    items,
    setItems,
    setFocusedRow,
    setDirty,
    expandedJumbos,
    recalcTitelsummen,
  });

  // ─── Row Selection (Hook) ────────────────────────────────────────────────────
  const {
    selectedRows,
    setSelectedRows,
    hoveredRow,
    setHoveredRow,
    activeRowIdx,
    quickActionPos,
    handleToggleSelect,
    handleRowClick,
    selectTitleBlock,
    selectAll,
    dragSelect,
    handleDragSelectDown,
    handleDragSelectMove,
    handleRowMouseEnter,
    handleRowMouseLeave,
  } = useRowSelection({
    items,
    focusedRow,
    setFocusedRow,
    scrollContainerRef,
    getTitleBlockIndices,
  });

  const deleteSelectedRows = useCallback(async () => {
    if (selectedRows.size === 0) return;
    if (editorSettings?.confirmDeleteLines !== false) {
      const confirmed = await requestDeleteConfirm(selectedRows.size);
      if (!confirmed) return;
    }
    const expanded = expandSelectionWithChildren(selectedRows, items);
    setItems(prev => {
      const u = prev.filter((_, i) => !expanded.has(i));
      u.forEach((it, i) => { it.sortOrder = i; });
      return recalcTitelsummen(u);
    });
    setSelectedRows(new Set());
    setFocusedRow(null);
    setDirty(true);
  }, [editorSettings?.confirmDeleteLines, items, recalcTitelsummen, requestDeleteConfirm, selectedRows, setItems]);

  // ─── Context Actions (Hook) ─────────────────────────────────────────────────
  const {
    contextMenu,
    setContextMenu,
    insertIdx,
    setInsertIdx,
    handleContextMenu,
    handleAreaContextMenu,
    handleBeforeTableContextMenu,
    handleAfterTotalsContextMenu,
    handleContextInsert,
    isAfterTotalsInsert,
    isBeforeTableInsert,
  } = useContextActions({
    items,
    setItems,
    focusedRow,
    setFocusedRow,
    clipboard,
    setClipboard,
    selectedRows,
    setSelectedRows,
    setDirty,
    documentId,
    recalcTitelsummen,
    removeItem,
    addPosition,
    getTitleBlockIndices,
    setArtikelDialog,
    setIdsDialog,
    setFloskelOpen,
    setFloskelTarget: setFloskelTarget as any,
    setLohnOpen,
    setLohnTargetJumbo,
    setEigenschaftenItem,
    setPriceDialogItem,
    setProzentDialog,
    setzeAlternativ,
    setzeBedarf,
    updateMaterialPrices,
    confirmDeleteLines: editorSettings?.confirmDeleteLines,
    onRequestDeleteSelected: deleteSelectedRows,
  });

  // ─── Keyboard Shortcuts (Hook) ────────────────────────────────────────────────
  useKeyboardShortcuts({
    items,
    setItems,
    focusedRow,
    setFocusedRow,
    selectedRows,
    setSelectedRows,
    setDirty,
    clipboard,
    setClipboard,
    setArtikelDialog,
    setEigenschaftenItem,
    setLohnOpen,
    setLohnTargetJumbo,
    addPosition,
    removeItem,
    copyItem,
    moveItem,
    selectAll,
    recalcTitelsummen,
    saveMutate: () => saveMutation.mutate(),
    undo,
    redo,
    confirmDeleteLines: editorSettings?.confirmDeleteLines,
    onRequestDeleteSelected: deleteSelectedRows,
  });

  // ─── Slash-Menü (Hook) ─────────────────────────────────────────────────────────
  const {
    slashVisible,
    slashFilter,
    slashAnchorRect,
    closeSlashMenu,
    handleSlashInput,
    handleSlashSelect,
  } = useSlashMenu({
    items,
    setItems,
    focusedRow,
    setFocusedRow,
    setDirty,
    documentId,
    addPosition,
    recalcTitelsummen,
    setArtikelDialog,
    setFloskelOpen,
    setFloskelTarget: setFloskelTarget as any,
    onRequestKiText: () => setKiTextOpen(true),
    setzeBedarf,
    setzeAlternativ,
  });

  // ─── Auto-Save (Hook) ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!editorSettings?.autoSaveEnabled || !documentId || isNew) return;
    const minutes = editorSettings.autoSaveMinutes || 5;
    const interval = setInterval(() => {
      if (dirtyRef.current && !saveMutation.isPending) {
        saveMutation.mutate();
      }
    }, minutes * 60 * 1000);
    return () => clearInterval(interval);
  }, [editorSettings?.autoSaveEnabled, editorSettings?.autoSaveMinutes, documentId, isNew]);

  // ─── Derived ──────────────────────────────────────────────────────────────────
  const selectedCustomer = customers?.find((c) => c.id === docForm.customerId);
  const safeDocType = docForm.type || "angebot";
  const typeLabel = normalizeDocumentTypeLabel(docForm.customTypeLabel, documentTypeLabels[safeDocType] || "Dokument");
  const unitCodes = units?.map((u) => u.code) || [
    "Stk",
    "m",
    "m²",
    "m³",
    "Std",
    "pau",
    "kg",
    "lfm",
  ];
  const getPriceDecimalsForItem = useCallback((item: EditorItem) => {
    const fallback = docForm.dezimalstellenPreise ?? 2;
    if (item.type === "material") return editorSettings?.dezMaterialPreise ?? fallback;
    if (item.type === "jumbo" || item.positionFlag === "jumbo") return editorSettings?.dezJumboPreise ?? fallback;
    return editorSettings?.dezLeistungsPreise ?? fallback;
  }, [docForm.dezimalstellenPreise, editorSettings?.dezJumboPreise, editorSettings?.dezLeistungsPreise, editorSettings?.dezMaterialPreise]);
  const allowedConversionsMap: Record<string, { type: string; label: string }[]> = {
    angebot: [
      { type: "auftragsbestaetigung", label: "Auftragsbestätigung" },
      { type: "rechnung", label: "Rechnung" },
      { type: "abschlagsrechnung", label: "Abschlagsrechnung" },
      { type: "mitschnitt", label: "Mitschnitt" },
      { type: "freies_dokument", label: "Freies Dokument" },
    ],
    auftragsbestaetigung: [
      { type: "rechnung", label: "Rechnung" },
      { type: "abschlagsrechnung", label: "Abschlagsrechnung" },
      { type: "lieferschein", label: "Lieferschein" },
      { type: "mitschnitt", label: "Mitschnitt" },
      { type: "freies_dokument", label: "Freies Dokument" },
    ],
    rechnung: [
      { type: "gutschrift", label: "Gutschrift" },
      { type: "mitschnitt", label: "Mitschnitt" },
      { type: "freies_dokument", label: "Freies Dokument" },
    ],
    abschlagsrechnung: [
      { type: "abschlagsrechnung", label: "nächste Abschlagsrechn." },
      { type: "rechnung", label: "Schlussrechnung" },
      { type: "mitschnitt", label: "Mitschnitt" },
      { type: "freies_dokument", label: "Freies Dokument" },
    ],
    gutschrift: [
      { type: "mitschnitt", label: "Mitschnitt" },
      { type: "freies_dokument", label: "Freies Dokument" },
    ],
    lieferschein: [
      { type: "rechnung", label: "Rechnung" },
      { type: "mitschnitt", label: "Mitschnitt" },
      { type: "freies_dokument", label: "Freies Dokument" },
    ],
    freies_dokument: [
      { type: "angebot", label: "Angebot" },
      { type: "mitschnitt", label: "Mitschnitt" },
    ],
    mitschnitt: [
      { type: "rechnung", label: "Rechnung" },
      { type: "abschlagsrechnung", label: "Abschlagsrechnung" },
      { type: "freies_dokument", label: "Freies Dokument" },
    ],
  };
  const convertTargets = allowedConversionsMap[docForm.type] || [];

  const effectiveTemplateId = getEffectiveFormTemplateId({
    documentFormTemplateId: docForm.formTemplateId,
    documentTypeDefaultFormTemplateId,
    companyDefaultFormTemplateId: companySettings?.defaultFormTemplateId,
  });
  const activeTemplatePre = effectiveTemplateId ? formTemplates?.find(t => t.id === effectiveTemplateId) : undefined;
  const resolvedTemplate = useMemoReact(
    () => resolveTemplate(
      activeTemplatePre ? { id: activeTemplatePre.id, name: activeTemplatePre.name, type: activeTemplatePre.type || undefined, fields: activeTemplatePre.fields as any, fieldsPage2: activeTemplatePre.fieldsPage2 as any, workArea: activeTemplatePre.workArea as any } : undefined,
      companySettings ? { companyName: companySettings.companyName, defaultFormTemplateId: companySettings.defaultFormTemplateId } : undefined,
    ),
    [activeTemplatePre, companySettings],
  );
  const activeWorkArea: any = resolvedTemplate.workArea;
  const tableFont = useMemoReact(() => parseFontSpec(activeWorkArea?.schriftart), [activeWorkArea]);
  const tableFontStyle = useMemoReact(() => ({ fontFamily: tableFont.fontFamily, fontSize: `${tableFont.fontSize}pt` }), [tableFont]);

  const colWidths = useMemoReact(
    () => resolveEditorColumnWidths(activeWorkArea?.spalten),
    [activeWorkArea],
  );
  const usePercentWidths = !!(activeWorkArea?.spalten?.length);

  const templateDefaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (!documentId && activeWorkArea?.endsumme && !templateDefaultsAppliedRef.current) {
      const ec = activeWorkArea.endsumme;
      if (ec.defaultHideNetto || ec.defaultHideMwst || ec.defaultHideGesamt) {
        setDocForm(f => ({
          ...f,
          hideNetto: ec.defaultHideNetto ?? false,
          hideMwst: ec.defaultHideMwst ?? false,
          hideGesamt: ec.defaultHideGesamt ?? false,
        }));
        templateDefaultsAppliedRef.current = true;
      }
    }
  }, [documentId, activeWorkArea]);

  const editorZones = useMemoReact(
    () => buildEditorZones(docForm, items),
    [docForm.beforeWorkText, docForm.headerText, docForm.beforeTotalsText, docForm.footerText, docForm.afterTotalsText, docForm.skontoImDokument, items],
  );

  const enginePages = useMemoReact(
    () => paginateDocument(items, resolvedTemplate, visibleExpandedJumbos, editorZones, undefined, docForm.internpositionenVerbergen !== false),
    [items, resolvedTemplate, visibleExpandedJumbos, editorZones, docForm.internpositionenVerbergen],
  );

  const enginePageCount = enginePages.length;
  const totalPages = enginePageCount;
  const summaryPageIdx = enginePages.findIndex(p => p.blocks.some(b => b.type === "summaryBlock"));
  const needsExtraSummaryPage = false;


  // ─── Early returns ────────────────────────────────────────────────────────────
  const documentDataHydrating =
    !!documentId &&
    (!docRecord ||
      loadedDocumentId !== documentId ||
      (!!docForm.customerId && !customers) ||
      (!!docForm.projectId && !projects));

  if ((docLoading && documentId) || documentDataHydrating)
    return (
      <div className="p-6 space-y-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  if (lockState === "acquiring" && documentId)
    return (
      <div className="p-6 flex items-center justify-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">
          Sperre wird angefordert...
        </span>
      </div>
    );
  if (lockState === "blocked" && documentId)
    return (
      <div className="p-6 space-y-4 max-w-xl mx-auto">
        <Alert className="border-amber-300 bg-amber-50">
          <Lock className="h-5 w-5 text-amber-600" />
          <AlertDescription className="ml-2">
            <p
              className="font-semibold text-amber-800"
              data-testid="text-lock-warning"
            >
              Bearbeitet von: {lockedByUser}
            </p>
            <p className="text-sm text-amber-700 mt-1">
              Dieses Dokument ist gesperrt.
            </p>
          </AlertDescription>
        </Alert>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => navigate("/dokumente")}>
            Zur Übersicht
          </Button>
          <Button onClick={() => navigate(`/dokumente/${documentId}`)}>
            <Eye className="h-4 w-4 mr-2" />
            Nur ansehen
          </Button>
        </div>
      </div>
    );

  // ─── RENDER ───────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-slate-100 dark:bg-slate-950">
      {/* Dialogs */}
      <SlashMenu
        visible={slashVisible}
        filter={slashFilter}
        anchorRect={slashAnchorRect}
        onSelect={handleSlashSelect}
        onClose={closeSlashMenu}
      />
      <FloskelDialog
        open={floskelOpen}
        onClose={() => { setFloskelOpen(false); setFloskelTarget("position"); }}
        onInsert={(text, name) => {
          insertFloskel(text, name);
          setFloskelTarget("position");
        }}
        mehrfach={!!editorSettings?.floskelMehrfach}
      />
      <KiTextDialog
        open={kiTextOpen}
        onClose={() => setKiTextOpen(false)}
        onInsert={(text, insertMode) => {
          if (focusedRow !== null && items[focusedRow]) {
            const item = items[focusedRow];
            const fullCurrent = [item.title || "", item.description || ""].filter(Boolean).join("\n");
            if (insertMode === "append") {
              const combined = fullCurrent ? fullCurrent + "\n" + text : text;
              const { title: newTitle, description: newDesc } = splitTitleDesc(combined);
              updateItem(focusedRow, "title", newTitle);
              updateItem(focusedRow, "description", newDesc);
            } else {
              const { title: newTitle, description: newDesc } = splitTitleDesc(text);
              updateItem(focusedRow, "title", newTitle);
              updateItem(focusedRow, "description", newDesc);
            }
          } else {
            const textItem = emptyItem("freitext", documentId || 0, items.length, null);
            textItem.title = text;
            setItems(prev => {
              const updated = [...prev];
              updated.push(textItem);
              updated.forEach((it, i) => { it.sortOrder = i; });
              return recalcTitelsummen(updated);
            });
            setDirty(true);
          }
        }}
        context={{
          documentType: docForm.type,
          existingTitle: focusedRow !== null
            ? [items[focusedRow]?.title || "", items[focusedRow]?.description || ""].filter(Boolean).join("\n")
            : "",
          positionType: focusedRow !== null ? items[focusedRow]?.type || "" : "",
        }}
      />
      <VortextEditDialog
        open={vortextEditOpen}
        onClose={() => setVortextEditOpen(false)}
        value={docForm.beforeWorkText || docForm.headerText || ""}
        onSave={(html) => {
          setDocForm((prev: any) => ({ ...prev, beforeWorkText: html, headerText: "" }));
          setDirty(true);
        }}
        workAreaWidthPt={
          (resolvedTemplate.fields as any[])?.find((f: any) => f.id === "arbeitsbereich" || f.inhalt === "[Arbeitsbereich]" || f.typ === "Arbeitsbereich")?.w || 494
        }
      />
      <NettosummeDetailDialog
        open={nettoDetailOpen}
        onClose={() => setNettoDetailOpen(false)}
        items={items}
        netTotal={netTotal}
        laborTotal={laborTotal}
        selbstkostenLohnsatz={parseFloat(docForm.selbstkostenLohnsatz || "0")}
        kalkulierterLohnsatz={parseFloat(docForm.kalkulierterLohnsatz || "0")}
        onApplyGlobalMarkup={(category, markupPercent) => {
          setItems(prev => {
            const updated = prev.map(item => {
              if (item._parentClientId) return item;
              if (["abschluss", "titelsumme", "zwischensumme", "freitext", "floskel", "text"].includes(item.type || "")) return item;
              if (item.positionFlag === "alternativ") return item;

              const markupStr = String(markupPercent);
              const qty = parseFloat(item.quantity || "1") || 1;
              const clone = { ...item };

              if (category === "material") {
                clone.materialMarkup = markupStr;
              } else if (category === "lohn") {
                clone.laborMarkup = markupStr;
              } else if (category === "geraete") {
                clone.equipmentMarkup = markupStr;
              } else if (category === "fremd") {
                clone.externalMarkup = markupStr;
              }

              const vkMat = kalkCalc(String(clone.materialPrice || "0"), String(clone.materialMarkup || "0"));
              const vkLab = kalkCalc(String(clone.laborCost || "0"), String(clone.laborMarkup || "0"));
              const vkEq = kalkCalc(String(clone.equipmentCost || "0"), String(clone.equipmentMarkup || "0"));
              const vkExt = kalkCalc(String(clone.externalCost || "0"), String(clone.externalMarkup || "0"));
              const totalVk = vkMat + vkLab + vkEq + vkExt;

              clone.unitPrice = totalVk.toFixed(2);
              clone.totalPrice = (totalVk * qty).toFixed(2);
              clone.laborPrice = vkLab.toFixed(2);

              return clone;
            });
            updated.forEach((it, i) => { it.sortOrder = i; });
            return recalcTitelsummen(updated);
          });
          setDirty(true);
        }}
      />
      {titelsummeDetailIndex !== null && (() => {
        let titelIdx = -1;
        for (let j = titelsummeDetailIndex - 1; j >= 0; j--) {
          if (items[j]?.type === "titel" || items[j]?.type === "gruppe") { titelIdx = j; break; }
          if (items[j]?.type === "titelsumme") break;
        }
        return titelIdx >= 0 ? (
          <TitelsummeDetailDialog
            open
            onClose={() => setTitelsummeDetailIndex(null)}
            items={items}
            titelIndex={titelIdx}
            titelsummeIndex={titelsummeDetailIndex}
          />
        ) : null;
      })()}
      <LohnDialog
        open={lohnOpen}
        onClose={() => {
          setLohnOpen(false);
          setLohnTargetJumbo(null);
        }}
        onInsert={(rate, min) =>
          insertLohn(rate, min, lohnTargetJumbo ?? undefined)
        }
        priceLevel={docForm.priceLevel || 1}
      />
      {artikelDialog && artikelDialog.filter === "Jumbo" && (
        <JumboPackageDialog
          open
          onClose={() => setArtikelDialog(null)}
          onSelect={(jumbo, qty) => insertFromJumboPackage(jumbo, qty)}
          mehrfach={!!editorSettings?.jumboMehrfach}
        />
      )}
      {artikelDialog && artikelDialog.filter !== "Jumbo" && (
        <ArtikelDialog
          open
          filter={artikelDialog.filter}
          onClose={() => setArtikelDialog(null)}
          onSelect={(mat, qty) =>
            insertFromMaterial(mat, qty, artikelDialog.parentJumboIndex)
          }
          mehrfach={
            artikelDialog.filter === "Material" ? !!editorSettings?.materialMehrfach :
            artikelDialog.filter === "Leistung" ? !!editorSettings?.leistungsMehrfach :
            artikelDialog.filter === "Jumbo" ? !!editorSettings?.jumboMehrfach :
            false
          }
        />
      )}
      <AbschlagInsertDialog
        open={abschlagInsertOpen}
        onClose={() => setAbschlagInsertOpen(false)}
        abschlaege={abschlagData?.abschlaege || []}
        loading={!abschlagData && !!docForm.projectId}
        currentDocId={documentId}
        existingDocIds={(docForm.abschlagVerrechnungen || []).map((v: any) => v.docId)}
        onInsertMultiple={(items) => {
          setDocForm((f: any) => {
            const existing: any[] = f.abschlagVerrechnungen || [];
            const newEntries = items
              .filter(ar => !existing.some((v: any) => v.docId === ar.id))
              .sort((a, b) => {
                const da = a.date ? new Date(a.date).getTime() : 0;
                const db = b.date ? new Date(b.date).getTime() : 0;
                return da - db || a.id - b.id;
              })
              .map(ar => ({
                docId: ar.id,
                documentNumber: ar.documentNumber,
                netAmount: parseFloat(ar.deltaNet || ar.netTotal || "0"),
                grossAmount: parseFloat(ar.deltaGross || ar.grossTotal || "0"),
                date: ar.date,
                label: `Rechnung ${fmtDocNumber(ar.documentNumber)}`,
              }));
            return {
              ...f,
              abschlagVerrechnungen: [...existing, ...newEntries],
            };
          });
          setDirty(true);
          setAbschlagInsertOpen(false);
        }}
      />
      <DocPropertiesDialog
        open={docPropertiesOpen}
        onClose={() => setDocPropertiesOpen(false)}
        docForm={docForm}
        setDocForm={setDocForm}
        setDirty={setDirty}
        formTemplates={formTemplates}
        selectedCustomer={selectedCustomer}
        parentDoc={parentDoc}
        projects={projects}
        netTotal={netTotal}
        grossTotal={grossTotal}
        taxAmount={taxAmount}
        currentUser={user}
        formularfelderDefaults={editorSettings?.formularfelderDefaults as Record<string, string> | undefined}
      />
      {priceDialogItem && (
        <PriceDialog
          open
          item={priceDialogItem.item}
          jumboChildren={items.filter((it) => it._parentClientId === (priceDialogItem.item as any)._clientId)}
          markupPercent={markupPercent}
          onClose={() => setPriceDialogItem(null)}
          onUpdate={(fields) => {
            const idx = priceDialogItem.index;
            setItems((prev) => {
              const u = [...prev];
              u[idx] = { ...u[idx], ...fields } as typeof u[number];
              let r = u;
              const pcid = u[idx]._parentClientId;
              if (pcid) {
                const pi = r.findIndex((p) => p._clientId === pcid);
                if (pi >= 0) r = recalcJumboPrice(r, pi);
              }
              if (u[idx]?.type === "jumbo" && fields.priceFollowsCost === true) {
                r = recalcJumboPrice(r, idx);
              }
              return recalcTitelsummen(r);
            });
            setDirty(true);
          }}
        />
      )}
      {eigenschaftenItem && (
        <EigenschaftenDialog
          open
          item={eigenschaftenItem.item}
          onClose={() => setEigenschaftenItem(null)}
          onUpdate={(fields) => {
            const idx = eigenschaftenItem.index;
            setItems((prev) => {
              const u = [...prev];
              u[idx] = { ...u[idx], ...fields };
              return recalcTitelsummen(u);
            });
            setDirty(true);
          }}
        />
      )}
      {idsDialog !== null && (
        <IdsConnectDialog
          open
          onClose={() => setIdsDialog(null)}
          onInsert={(arts, jumboIdx) => insertFromIds(arts, jumboIdx)}
          parentJumboIndex={idsDialog.parentJumboIndex}
        />
      )}
      {prozentDialog && (
        <ProzentZuschlagDialog
          open
          onClose={() => setProzentDialog(false)}
          onInsert={insertProzentZuschlag}
          netTotal={netTotal}
          laborTotal={laborTotal}
          materialTotal={ekTotal}
        />
      )}
      {contextMenu && (
        <InsertMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onSelect={handleContextInsert}
          onClose={() => { setContextMenu(null); }}
          hasClipboard={!!clipboard}
          onCut={() => handleContextInsert("_cut")}
          onCopy={() => handleContextInsert("_copy")}
          onPaste={() => handleContextInsert("_paste")}
          onSelectTitleBlock={() => {
            if (insertIdx !== null) selectTitleBlock(insertIdx);
          }}
          onSelectAll={selectAll}
          isTitelRow={insertIdx !== null && (items[insertIdx]?.type === "titel" || items[insertIdx]?.type === "gruppe")}
          selectedCount={selectedRows.size}
          isAfterTotals={isAfterTotalsInsert}
          isBeforeTable={isBeforeTableInsert}
          hasProject={!!docForm.projectId}
          isJumboRow={
            insertIdx !== null &&
            insertIdx >= 0 &&
            (items[insertIdx]?.positionFlag === "jumbo" ||
              (items[insertIdx]?.type === "jumbo" && !items[insertIdx]?._parentClientId))
          }
          onBeforeTableInsert={(type: string) => {
            const vEnd = getVortextEndIdx(items);
            if (type === "floskel") {
              setFocusedRow(vEnd > 0 ? vEnd - 1 : -1);
              setFloskelOpen(true);
              setContextMenu(null);
              return;
            }
            const ni = emptyItem("freitext", documentId || 0, vEnd);
            if (type === "trennlinie") ni.title = "———";
            const u = [...items];
            u.splice(vEnd, 0, ni);
            u.forEach((it, i) => { it.sortOrder = i; });
            setItems(recalcTitelsummen(u));
            setFocusedRow(vEnd);
            setDirty(true);
            setContextMenu(null);
            if (type !== "trennlinie") {
              requestAnimationFrame(() => {
                setTimeout(() => {
                  const row = document.querySelector(`[data-row="${vEnd}"]`);
                  if (row) {
                    row.scrollIntoView({ block: "nearest" });
                    const editor = row.querySelector('[data-field="title"] [contenteditable]') as HTMLElement;
                    if (editor) { editor.focus(); }
                  }
                }, 50);
              });
            }
          }}
          onAbschlagInsert={() => { setContextMenu(null); setAbschlagInsertOpen(true); }}
        />
      )}

      {quickActionPos && activeRowIdx !== null && activeRowIdx >= 0 && activeRowIdx < items.length && (
        <QuickActionBar
          activeRowIdx={activeRowIdx}
          items={items}
          setItems={setItems}
          setFocusedRow={setFocusedRow}
          setDirty={setDirty}
          removeItem={removeItem}
          recalcTitelsummen={recalcTitelsummen}
          documentId={documentId ?? null}
          position={quickActionPos}
          onMouseEnter={() => setHoveredRow(activeRowIdx)}
          onMouseLeave={() => setHoveredRow(null)}
          selectedRows={selectedRows}
          setSelectedRows={setSelectedRows}
          clipboard={clipboard}
          setClipboard={setClipboard}
          isJumbo={items[activeRowIdx]?.positionFlag === "jumbo" || (items[activeRowIdx]?.type === "jumbo" && !items[activeRowIdx]?._parentClientId)}
          jumboExpanded={visibleExpandedJumbos.has(items[activeRowIdx]?._clientId)}
          onToggleJumbo={() => {
            const cid = items[activeRowIdx]?._clientId;
            if (cid) {
              setExpandedJumbos((prev) => {
                const n = new Set(prev);
                n.has(cid) ? n.delete(cid) : n.add(cid);
                return n;
              });
            }
          }}
          onRequestDeleteSelected={deleteSelectedRows}
        />
      )}

      <EmailDialog
        open={emailDialogOpen}
        onClose={() => setEmailDialogOpen(false)}
        documentId={documentId ?? null}
        emailForm={emailForm}
        setEmailForm={setEmailForm}
      />
      <ProjectAssignDialog
        open={projectAssignOpen}
        onClose={() => setProjectAssignOpen(false)}
        projects={projects}
        projectSearch={projectSearch}
        setProjectSearch={setProjectSearch}
        assignProjectId={assignProjectId}
        setAssignProjectId={setAssignProjectId}
        assignFolderId={assignFolderId}
        setAssignFolderId={setAssignFolderId}
        assignTreeNodes={assignTreeNodes}
        assignToProjectMut={assignToProjectMut}
      />
      {documentId && (
        <InvoiceRegisterDialog
          open={invoiceRegisterOpen}
          onOpenChange={setInvoiceRegisterOpen}
          documentId={documentId}
        />
      )}

      {(editorSettings?.showToolbar !== false) && (
      <EditorToolbar
        dirty={dirty}
        navigate={navigate}
        documentId={documentId}
        isNew={isNew}
        docForm={docForm}
        setDocForm={setDocForm}
        setDirty={setDirty}
        typeLabel={typeLabel}
        selectedCustomer={selectedCustomer}
        showKalk={showKalk}
        setShowKalk={setShowKalk}
        showPreview={showPreview}
        setShowPreview={setShowPreview}
        saveMutation={saveMutation}
        setEmailForm={setEmailForm}
        setEmailDialogOpen={setEmailDialogOpen}
        setAssignProjectId={setAssignProjectId}
        setAssignFolderId={setAssignFolderId}
        setProjectSearch={setProjectSearch}
        setProjectAssignOpen={setProjectAssignOpen}
        convertTargets={convertTargets}
        convertMutation={convertMutation}
        undo={undo}
        redo={redo}
        undoLen={undoLen}
        redoLen={redoLen}
        zoomLevel={zoomLevel}
        setZoomLevel={setZoomLevel}
        parentDoc={parentDoc}
        childDocuments={childDocuments}
        showBezugsDokTyp={editorSettings?.showBezugsDokTyp !== false}
        addPosition={addPosition}
        setArtikelDialog={setArtikelDialog}
        setLohnOpen={setLohnOpen}
        setLohnTargetJumbo={setLohnTargetJumbo}
        setFloskelOpen={setFloskelOpen}
        setFloskelTarget={setFloskelTarget as any}
        focusedRow={focusedRow}
        showOriginalQuantities={showOriginalQuantities}
        setShowOriginalQuantities={setShowOriginalQuantities}
        items={items}
        setExpandedJumbos={setExpandedJumbos}
        setIdsDialog={setIdsDialog}
        updateMaterialPrices={updateMaterialPrices}
        displayMode={displayMode}
        setDisplayMode={setDisplayMode}
        spellCheck={spellCheck}
        setSpellCheck={setSpellCheck}
        isAbschlagOrSchluss={isAbschlagOrSchluss}
        setAbschlagInsertOpen={setAbschlagInsertOpen}
        setDocPropertiesOpen={setDocPropertiesOpen}
        druckMarkerPruefen={!!editorSettings?.druckMarkerPruefen}
        schliessenMarkerPruefen={!!editorSettings?.schliessenMarkerPruefen}
        showFormatBar={editorSettings?.showFormatBar !== false}
        showHelpers={editorSettings?.showHelpers === true}
        onPdfExported={() => {
          const registerTypes = ["rechnung", "abschlagsrechnung", "gutschrift"];
          if (registerTypes.includes(docForm.type)) {
            setInvoiceRegisterOpen(true);
          }
        }}
      />
      )}

      {/* ── MAIN CONTENT: A4 CANVAS ─────────────────────────────────────────── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden work-surface print:bg-white print:overflow-visible" data-testid="document-work-surface" spellCheck={spellCheck} style={{ padding: "34px 28px 56px" }} onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("[data-row]") || target.closest("[data-float-toolbar]") || target.closest("[data-select-bar]")) return;
        if (selectedRows.size > 0) setSelectedRows(new Set());
      }}>
        <div className="flex gap-8 mx-auto max-w-[1600px] print:max-w-none print:gap-0">
          {/* A4 Paper — Multi-page rendering */}
          <div className="flex-1 min-w-0 space-y-10" style={{ transformOrigin: "top center", transform: zoomLevel !== 100 ? `scale(${zoomLevel / 100})` : undefined, cursor: dragSelect?.active ? "default" : undefined, userSelect: dragSelect?.active ? "none" : undefined }} onContextMenu={handleAreaContextMenu} onMouseDown={handleDragSelectDown}>
            {editorSettings?.showTabRuler === true && (
              <div className="mx-auto w-[210mm] h-7 bg-white border border-gray-200 shadow-sm px-[20mm] flex items-end justify-between text-[9px] text-gray-400 tabular-nums print:hidden" data-testid="tab-ruler">
                {Array.from({ length: 18 }, (_, i) => (
                  <div key={i} className="flex flex-col items-center gap-0.5">
                    <span>{i}</span>
                    <span className="block h-2 border-l border-gray-300" />
                  </div>
                ))}
              </div>
            )}
            <DndContext
              sensors={dndSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext
                items={sortableIds}
                strategy={verticalListSortingStrategy}
              >
                {enginePages.map((page, pageIdx) => {
                  const isFirstPage = page.isFirstPage;
                  const isLastEnginePage = pageIdx === enginePages.length - 1;
                  const pageBlockMap = new Map<string, { splitPart?: "top" | "bottom"; splitClipHeight?: number; splitOffsetHeight?: number; splitAfterLines?: number; charsPerLine?: number; data?: Record<string, any> }>();
                  for (const b of page.blocks) {
                    if (b.itemId) pageBlockMap.set(b.itemId + (b.splitPart === "bottom" ? "__bottom" : ""), { splitPart: b.splitPart, splitClipHeight: b.splitClipHeight, splitOffsetHeight: b.splitOffsetHeight, splitAfterLines: b.splitAfterLines, charsPerLine: b.charsPerLine, data: b.data });
                  }
                  const pageItemIds = new Set(page.blocks.filter(b => b.itemId).map(b => b.itemId!));
                  if (isLastEnginePage) {
                    items.forEach(it => {
                      if (!pageItemIds.has(it._clientId) && !it._parentClientId && it.type !== "abschluss" && it.type !== "skonto" && it.type !== "nettosumme" && it.type !== "gesamtsumme") {
                        const onAnyPage = enginePages.some(p => p.blocks.some(b => b.itemId === it._clientId));
                        if (!onAnyPage) { pageItemIds.add(it._clientId); pageBlockMap.set(it._clientId, {}); }
                      }
                    });
                  }
                  const totalCols = 6 + (showKalk ? 3 : 0);
                  const isAfterTotals = page.isAfterTotals === true;

                  return (
                    <A4PageWrapper
                      key={page.pageNumber}
                      docForm={docForm}
                      setDocForm={setDocForm}
                      setDirty={setDirty}
                      formTemplates={formTemplates}
                      resolvedTemplate={resolvedTemplate}
                      selectedCustomer={selectedCustomer}
                      typeLabel={typeLabel}
                      projects={projects}
                      companySettings={companySettings}
                      customers={customers}
                      pageNumber={page.pageNumber}
                      totalPages={totalPages}
                      carryForwardOut={!isLastEnginePage && !isAfterTotals ? page.carryForwardOut : undefined}
                      onVortextContextMenu={handleBeforeTableContextMenu}
                    >
                      

                      {(() => {
                        const bwtBlocks = page.blocks.filter((b: any) => b.type === "beforeWorkTextBlock");
                        const vortextEndIdx = isFirstPage ? getVortextEndIdx(items) : 0;
                        const vortextItems = isFirstPage ? items.slice(0, vortextEndIdx) : [];
                        const hasTableItems = items.some((it, idx) => idx >= vortextEndIdx && !it.afterTotals && pageItemIds.has(it._clientId));
                        const vortextItemIds = new Set(vortextItems.map(v => v._clientId));

                        return (
                      <>
                      {bwtBlocks.length > 0 && (() => {
                        const allBwtBlocks: any[] = [];
                        for (const ep of enginePages) {
                          for (const b of ep.blocks) {
                            if (b.type === "beforeWorkTextBlock") allBwtBlocks.push(b);
                          }
                        }
                        const globalBwtIdx = allBwtBlocks.findIndex((b: any) => bwtBlocks.includes(b));
                        const isHtml = (docForm.beforeWorkText || "").includes("<p>") || (docForm.beforeWorkText || "").includes("<ul>") || (docForm.beforeWorkText || "").includes("<ol>");
                        return bwtBlocks.map((blk: any, bi: number) => {
                          const blockText = blk.data?.text || "";
                          const thisGlobalIdx = globalBwtIdx + bi;
                          const htmlContent = isHtml
                            ? blockText
                            : blockText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
                          return (
                            <div key={`bwt-${page.pageNumber}-${bi}`} className="relative group/bwt">
                              <div
                                data-testid={thisGlobalIdx === 0 ? "before-work-text-edit" : "before-work-text-block"}
                                className="vortext-content cursor-pointer hover:bg-blue-50/30 transition-colors rounded"
                                onClick={() => setVortextEditOpen(true)}
                                style={{
                                  fontFamily: tableFont.fontFamily,
                                  fontSize: `${tableFont.fontSize}pt`,
                                  lineHeight: "1.35",
                                  wordBreak: "break-word",
                                  padding: "4px 0",
                                  minHeight: "20px",
                                }}
                                dangerouslySetInnerHTML={{ __html: htmlContent }}
                              />
                              <button
                                className="absolute top-0 right-0 text-[9px] text-blue-500 bg-white/90 border border-blue-200 rounded px-1.5 py-0.5 opacity-0 group-hover/bwt:opacity-100 transition-opacity cursor-pointer hover:bg-blue-50"
                                onClick={() => setVortextEditOpen(true)}
                                data-testid="button-edit-full-vortext"
                              >
                                Bearbeiten
                              </button>
                            </div>
                          );
                        });
                      })()}
                      {isFirstPage && vortextItems.length > 0 && (
                        <table
                          data-testid="vortext-block"
                          className="w-full border-collapse table-fixed"
                          style={tableFontStyle}
                          onContextMenu={handleBeforeTableContextMenu}
                        >
                          <tbody>
                          {vortextItems.map((item, _vi) => {
                            const index = items.indexOf(item);
                            if (!pageItemIds.has(item._clientId)) return null;
                            return (
                              <PositionRow
                                key={item._clientId}
                                item={item}
                                index={index}
                                focused={focusedRow === index}
                                selected={selectedRows.has(index)}
                                onFocus={() => setFocusedRow(index)}
                                onRowClick={(e) => handleRowClick(index, e)}
                                onToggleSelect={(e) => handleToggleSelect(index, e)}
                                onUpdate={(i, field, value) => {
                                  updateItem(i, field, value);
                                  if (field === "title") {
                                    const row = document.querySelector(`[data-row="${i}"]`);
                                    const titleEl = row?.querySelector('[data-field="title"]') as HTMLElement | null;
                                    handleSlashInput(i, value, titleEl);
                                  }
                                }}
                                onRemove={() => removeItem(index)}
                                onCopy={() => copyItem(index)}
                                onMove={(dir) => moveItem(index, dir)}
                                onInsertLine={() => {
                                  const lineItem = emptyItem("freitext", documentId || 0, index + 1, null);
                                  lineItem.title = "---";
                                  const updated = [...items];
                                  updated.splice(index + 1, 0, lineItem);
                                  updated.forEach((it, i) => { it.sortOrder = i; });
                                  setItems(recalcTitelsummen(updated));
                                  setDirty(true);
                                }}
                                onInsertNewPosition={() => {
                                  addPosition("manuell", undefined, index);
                                }}
                                unitCodes={unitCodes}
                                isSubItem={false}
                                isJumbo={false}
                                jumboExpanded={false}
                                jumboChildCount={0}
                                onToggleJumbo={() => {}}
                                onAddJumboChild={() => {}}
                                onOpenLohnDialog={() => {}}
                                onOpenPriceDialog={() => setPriceDialogItem({ index, item })}
                                onOpenArtikelDialog={(filter) => setArtikelDialog({ filter, parentJumboIndex: undefined })}
                                onOpenFloskelDialog={() => setFloskelOpen(true)}
                                onOpenTitelsummeDetail={() => setTitelsummeDetailIndex(index)}
                                onNavigateToRow={() => {}}
                                showKalk={showKalk}
                                showOriginalQuantities={showOriginalQuantities}
                                positionNumber=""
                                sectionSum={undefined}
                                dragId={item._clientId || `vortext-${index}`}
                                displayPos=""
                                onContextMenu={(e) => handleContextMenu(e, index)}
                                jumboMenuOpen={false}
                                onJumboMenuToggle={() => {}}
                                dezimalstellenMengen={docForm.dezimalstellenMengen}
                                dezimalstellenPreise={getPriceDecimalsForItem(item)}
                                mengeneinheitenAenderbar={editorSettings?.mengeneinheitenAenderbar !== false}
                                altPosGesamtpreis={editorSettings?.altPosGesamtpreis || "kursiv"}
                                statusmarkierungenPositionen={editorSettings?.statusmarkierungenPositionen === true}
                                warnungAufschlagUnter={parseFloat(String(editorSettings?.warnungAufschlagUnter ?? "10"))}
                                alarmAufschlagUnter={parseFloat(String(editorSettings?.alarmAufschlagUnter ?? "0"))}
                                showFormatBar={editorSettings?.showFormatBar !== false}
                                posNrEditable={docForm.autoPositionNumbers === false}
                                jumboEinzelpreise={docForm.einzelpreiseInJumbo !== false}
                                jumboMengen={docForm.mengenInJumbo !== false}
                                showDecimals={editorSettings?.showDecimals !== false}
                                jumboKleinerSchrift={editorSettings?.jumboKleinerSchrift === true}
                                showMouseInfo={editorSettings?.showMouseInfo !== false}
                                tabInTexts={editorSettings?.tabInTexts !== false}
                                showUnitList={editorSettings?.showMengeneinheitenListe !== false}
                                colWidths={usePercentWidths ? { posW: colWidths.posW, qtyW: colWidths.qtyW, unitW: colWidths.unitW, epW: colWidths.epW, gpW: colWidths.gpW } : undefined}
                              />
                            );
                          })}
                          </tbody>
                        </table>
                      )}

                      <div>
                        <table
                          ref={isFirstPage ? tableRef : undefined}
                          className="w-full border-collapse table-fixed"
                          style={tableFontStyle}
                        >
                          {!isAfterTotals && hasTableItems && (
                          <thead>
                            <tr style={{ backgroundColor: activeWorkArea?.tabellenkopf?.hintergrund || "#fafafa", borderBottom: `${activeWorkArea?.tabellenkopf?.linienBreite ?? 1}pt solid #333333`, ...(activeWorkArea?.tabellenkopf?.schriftart ? (() => { const hf = parseFontSpec(activeWorkArea.tabellenkopf.schriftart); return { fontFamily: hf.fontFamily, fontSize: `${hf.fontSize}pt`, fontWeight: hf.fontWeight }; })() : {}) }} className="text-gray-500">
                              <th className="text-left py-1.5 pl-0.5 pr-0 font-bold" style={usePercentWidths ? { width: `${colWidths.posW}%` } : { width: "36px" }}>{colWidths.posLabel}</th>
                              <th className="text-right py-1.5 px-0.5 font-bold" style={usePercentWidths ? { width: `${colWidths.qtyW}%` } : { width: "52px" }}>{colWidths.qtyLabel}</th>
                              <th className="text-left py-1.5 pl-0.5 pr-0 font-bold" style={usePercentWidths ? { width: `${colWidths.unitW}%` } : { width: "30px" }}>{colWidths.hasUnit ? colWidths.unitLabel : ""}</th>
                              <th className="text-left py-1.5 px-1 font-bold" style={usePercentWidths && 'descW' in colWidths ? { width: `${colWidths.descW}%` } : undefined}>{colWidths.descLabel}</th>
                              <th className={`text-right py-1.5 pr-1 pl-0 font-bold ${displayMode === "ohne-preise" ? "text-gray-300" : ""}`} style={usePercentWidths ? { width: `${colWidths.epW}%` } : { width: "65px" }}>{colWidths.epLabel}</th>
                              <th className={`text-right py-1.5 pr-0.5 pl-0 font-bold ${displayMode === "ohne-preise" ? "text-gray-300" : ""}`} style={usePercentWidths ? { width: `${colWidths.gpW}%` } : { width: "70px" }}>{colWidths.gpLabel}</th>
                              {showKalk && (
                                <>
                                  <th className="text-right py-1 px-1 w-[65px] font-medium text-blue-400 border-l border-gray-200">
                                    EK
                                  </th>
                                  <th className="text-right py-1 px-1 w-[65px] font-medium text-blue-400">
                                    Lohn
                                  </th>
                                  <th className="text-right py-1 px-1 w-[55px] font-medium text-blue-400">
                                    Marge%
                                  </th>
                                </>
                              )}
                            </tr>
                          </thead>
                          )}

                          <tbody>
                            {!isFirstPage && !isAfterTotals && page.carryForwardIn > 0 && (
                              <tr data-testid={`row-uebertrag-in-${page.pageNumber}`}>
                                <td colSpan={totalCols} className="text-right py-1.5 pr-1 text-xs text-gray-500 border-b border-gray-300">
                                  <span className="mr-2">Übertrag</span>
                                  <span className="font-mono tabular-nums">{fmtCurrency(page.carryForwardIn)}</span>
                                </td>
                              </tr>
                            )}

                            {isFirstPage && items.length === 0 && (
                              <tr>
                                <td
                                  colSpan={totalCols}
                                  className="text-center text-muted-foreground py-16 text-sm"
                                >
                                  <div className="space-y-3">
                                    <FileText className="h-10 w-10 mx-auto text-gray-200" />
                                    <p className="font-medium text-gray-400">
                                      Noch keine Positionen
                                    </p>
                                    <p className="text-xs text-gray-300">
                                      Toolbar oben nutzen oder Tastenkürzel:
                                    </p>
                                    <div className="flex gap-3 justify-center text-xs text-gray-400">
                                      <span>
                                        <kbd className="px-1 py-0.5 bg-gray-100 rounded border text-[10px]">
                                          F2
                                        </kbd>{" "}
                                        Material
                                      </span>
                                      <span>
                                        <kbd className="px-1 py-0.5 bg-gray-100 rounded border text-[10px]">
                                          F3
                                        </kbd>{" "}
                                        Leistung
                                      </span>
                                      <span>
                                        <kbd className="px-1 py-0.5 bg-gray-100 rounded border text-[10px]">
                                          F4
                                        </kbd>{" "}
                                        Jumbo
                                      </span>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}

                            {items.map((item, index) => {
                              if (item.afterTotals) return null;
                              if (item.type === "skonto") return null;
                              if (item.type === "nettosumme" || item.type === "gesamtsumme") return null;
                              if (!pageItemIds.has(item._clientId)) return null;
                              if (isFirstPage && vortextItemIds.has(item._clientId)) return null;
                              if (item._parentClientId) {
                                if (docForm.jumboListenAnzeigen === false) return null;
                                const parent = items.find(
                                  (p) => p._clientId === item._parentClientId,
                                );
                                  if (parent && !visibleExpandedJumbos.has(parent._clientId))
                                  return null;
                              }

                              if (displayMode === "kurzliste") {
                                const keep = ["titel", "titelsumme", "uebertrag", "abschluss", "nachlass"];
                                if (!keep.includes(item.type)) return null;
                              }
                              if (displayMode === "summenliste") {
                                if (item.type !== "titelsumme" && item.type !== "abschluss" && item.type !== "uebertrag") return null;
                              }

                              const blockInfoBottom = pageBlockMap.get(item._clientId + "__bottom");
                              const blockInfoNormal = pageBlockMap.get(item._clientId);
                              const blockInfo = blockInfoBottom || blockInfoNormal;
                              const isTextItem = item.type === "freitext" || item.type === "floskel" || item.type === "text";
                              const usesTextOverride = blockInfo?.data?.titleOverride !== undefined
                                && !(isTextItem && blockInfo?.splitPart === "top");
                              const displayItem = blockInfo?.data?.titleOverride !== undefined
                                ? { ...item, title: blockInfo.data.titleOverride }
                                : item;
                              if (blockInfo?.splitPart === "bottom") {
                                const bottomOffsetPx = usesTextOverride ? undefined : (blockInfo.splitOffsetHeight || 0) * PT_TO_PX;
                                const bottomClipPx = usesTextOverride ? undefined : (blockInfo.splitClipHeight || 400) * PT_TO_PX;
                                return (
                                  <PositionRow
                                    key={item._clientId + "-cont"}
                                    item={displayItem}
                                    index={index}
                                    focused={focusedRow === index}
                                    selected={selectedRows.has(index)}
                                    onFocus={() => setFocusedRow(index)}
                                    onRowClick={(e) => handleRowClick(index, e)}
                                    onToggleSelect={(e) => handleToggleSelect(index, e)}
                                    onUpdate={(i, field, value) => {
                                      updateItem(i, field, value);
                                      if (field === "title") {
                                        const row = document.querySelector(`[data-row="${i}"]`);
                                        const titleEl = row?.querySelector('[data-field="title"]') as HTMLElement | null;
                                        handleSlashInput(i, value, titleEl);
                                      }
                                    }}
                                    onRemove={() => removeItem(index)}
                                    onCopy={() => copyItem(index)}
                                    onMove={(dir) => moveItem(index, dir)}
                                    onInsertLine={() => {
                                      const lineItem = emptyItem("freitext", documentId || 0, index + 1, null);
                                      lineItem.title = "---";
                                      const updated = [...items];
                                      updated.splice(index + 1, 0, lineItem);
                                      updated.forEach((it, i) => { it.sortOrder = i; });
                                      setItems(recalcTitelsummen(updated));
                                      setDirty(true);
                                    }}
                                    onInsertNewPosition={() => {
                                      addPosition("manuell", undefined, index);
                                    }}
                                    unitCodes={unitCodes}
                                    isSubItem={!!item._parentClientId}
                                    isJumbo={item.positionFlag === "jumbo" || (item.type === "jumbo" && !item._parentClientId)}
                                    jumboExpanded={visibleExpandedJumbos.has(item._clientId)}
                                    jumboChildCount={
                                      (item.positionFlag === "jumbo" || (item.type === "jumbo" && !item._parentClientId))
                                        ? getJumboChildCount(items, index)
                                        : 0
                                    }
                                    onToggleJumbo={() =>
                                      setExpandedJumbos((prev) => {
                                        const n = new Set(prev);
                                        n.has(item._clientId)
                                          ? n.delete(item._clientId)
                                          : n.add(item._clientId);
                                        return n;
                                      })
                                    }
                                    onAddJumboChild={(type) => handleAddJumboChild(index, item, type)}
                                    onOpenLohnDialog={() => {
                                      setLohnOpen(true);
                                      setLohnTargetJumbo(index);
                                    }}
                                    onOpenPriceDialog={() =>
                                      setPriceDialogItem({ index, item })
                                    }
                                    onOpenTitelsummeDetail={() => setTitelsummeDetailIndex(index)}
                                    onOpenArtikelDialog={(filter) =>
                                      setArtikelDialog({ filter })
                                    }
                                    jumboMenuOpen={jumboMenuOpen === index}
                                    onJumboMenuToggle={() =>
                                      setJumboMenuOpen(
                                        jumboMenuOpen === index ? null : index,
                                      )
                                    }
                                    showKalk={showKalk}
                                    onContextMenu={(e) => handleContextMenu(e, index)}
                                    onMouseEnter={() => handleRowMouseEnter(index)}
                                    onMouseLeave={handleRowMouseLeave}
                                    displayPos={
                                      positionNumbers.get(item._clientId) || ""
                                    }
                                    dragId={item._clientId || `fallback-${index}`}
                                    onNavigateToRow={(direction) => {
                                      const targetIdx = index + direction;
                                      if (targetIdx >= 0 && targetIdx < items.length) {
                                        setFocusedRow(targetIdx);
                                      }
                                    }}
                                    showOriginalQuantities={showOriginalQuantities}
                                    splitOffsetHeight={bottomOffsetPx}
                                    maxClipHeight={bottomClipPx}
                                    isSplitContinuation={true}
                                    textOverride={usesTextOverride ? String(blockInfo.data?.titleOverride ?? "") : undefined}
                                    hidePrices={displayMode === "ohne-preise"}
                                    dezimalstellenMengen={docForm.dezimalstellenMengen}
                                    dezimalstellenPreise={getPriceDecimalsForItem(item)}
                                    mengeneinheitenAenderbar={editorSettings?.mengeneinheitenAenderbar !== false}
                                    altPosGesamtpreis={editorSettings?.altPosGesamtpreis || "kursiv"}
                                    statusmarkierungenPositionen={editorSettings?.statusmarkierungenPositionen === true}
                                    warnungAufschlagUnter={parseFloat(String(editorSettings?.warnungAufschlagUnter ?? "10"))}
                                    alarmAufschlagUnter={parseFloat(String(editorSettings?.alarmAufschlagUnter ?? "0"))}
                                    showFormatBar={editorSettings?.showFormatBar !== false}
                                    posNrEditable={docForm.autoPositionNumbers === false}
                                    jumboEinzelpreise={docForm.einzelpreiseInJumbo !== false}
                                    jumboMengen={docForm.mengenInJumbo !== false}
                                    showDecimals={editorSettings?.showDecimals !== false}
                                    jumboKleinerSchrift={editorSettings?.jumboKleinerSchrift === true}
                                    showMouseInfo={editorSettings?.showMouseInfo !== false}
                                    tabInTexts={editorSettings?.tabInTexts !== false}
                                    showUnitList={editorSettings?.showMengeneinheitenListe !== false}
                                    colWidths={usePercentWidths ? { posW: colWidths.posW, qtyW: colWidths.qtyW, unitW: colWidths.unitW, epW: colWidths.epW, gpW: colWidths.gpW } : undefined}
                                  />
                                );
                              }

                              const splitTopClipRaw = !usesTextOverride && blockInfo?.splitPart === "top" ? (blockInfo.splitClipHeight || 400) * PT_TO_PX : undefined;
                              const splitTopClip = splitTopClipRaw !== undefined ? splitTopClipRaw - 8 : undefined;

                              const row = (
                                <PositionRow
                                  key={item._clientId}
                                  item={displayItem}
                                  index={index}
                                  focused={focusedRow === index}
                                  selected={selectedRows.has(index)}
                                  onFocus={() => setFocusedRow(index)}
                                  onRowClick={(e) => handleRowClick(index, e)}
                                  onToggleSelect={(e) => handleToggleSelect(index, e)}
                                  onUpdate={(i, field, value) => {
                                    updateItem(i, field, value);
                                    if (field === "title") {
                                      const row = document.querySelector(`[data-row="${i}"]`);
                                      const titleEl = row?.querySelector('[data-field="title"]') as HTMLElement | null;
                                      handleSlashInput(i, value, titleEl);
                                    }
                                  }}
                                  onRemove={() => removeItem(index)}
                                  onCopy={() => copyItem(index)}
                                  onMove={(dir) => moveItem(index, dir)}
                                  onInsertLine={() => {
                                    const lineItem = emptyItem("freitext", documentId || 0, index + 1, null);
                                    lineItem.title = "---";
                                    const updated = [...items];
                                    updated.splice(index + 1, 0, lineItem);
                                    updated.forEach((it, i) => { it.sortOrder = i; });
                                    setItems(recalcTitelsummen(updated));
                                    setDirty(true);
                                  }}
                                  onInsertNewPosition={() => {
                                    addPosition("manuell", undefined, index);
                                  }}
                                  unitCodes={unitCodes}
                                  isSubItem={!!item._parentClientId}
                                  isJumbo={item.positionFlag === "jumbo" || (item.type === "jumbo" && !item._parentClientId)}
                                  jumboExpanded={visibleExpandedJumbos.has(item._clientId)}
                                  jumboChildCount={
                                    (item.positionFlag === "jumbo" || (item.type === "jumbo" && !item._parentClientId))
                                      ? getJumboChildCount(items, index)
                                      : 0
                                  }
                                  onToggleJumbo={() =>
                                    setExpandedJumbos((prev) => {
                                      const n = new Set(prev);
                                      n.has(item._clientId)
                                        ? n.delete(item._clientId)
                                        : n.add(item._clientId);
                                      return n;
                                    })
                                  }
                                  onAddJumboChild={(type) => handleAddJumboChild(index, item, type)}
                                  onOpenLohnDialog={() => {
                                    setLohnOpen(true);
                                    setLohnTargetJumbo(index);
                                  }}
                                  onOpenPriceDialog={() =>
                                    setPriceDialogItem({ index, item })
                                  }
                                  onOpenTitelsummeDetail={() => setTitelsummeDetailIndex(index)}
                                  onOpenArtikelDialog={(filter) =>
                                    setArtikelDialog({ filter })
                                  }
                                  jumboMenuOpen={jumboMenuOpen === index}
                                  onJumboMenuToggle={() =>
                                    setJumboMenuOpen(
                                      jumboMenuOpen === index ? null : index,
                                    )
                                  }
                                  showKalk={showKalk}
                                  onContextMenu={(e) => handleContextMenu(e, index)}
                                  onMouseEnter={() => handleRowMouseEnter(index)}
                                  onMouseLeave={handleRowMouseLeave}
                                  displayPos={
                                    positionNumbers.get(item._clientId) || ""
                                  }
                                  dragId={item._clientId || `fallback-${index}`}
                                  sectionSum={
                                    (item.type === "titel" || item.type === "gruppe")
                                      ? (() => {
                                          let sum = 0;
                                          for (let j = index + 1; j < items.length; j++) {
                                            const next = items[j];
                                            if (next._parentClientId) continue;
                                            if (["titel", "gruppe", "titelsumme", "abschluss"].includes(next.type || "")) break;
                                            if (["freitext", "floskel", "text", "zwischensumme"].includes(next.type || "")) continue;
                                            if (next.positionFlag === "alternativ") continue;
                                            sum += parseFloat(next.totalPrice || "0");
                                          }
                                          return sum;
                                        })()
                                      : undefined
                                  }
                                  onNavigateToRow={(direction) => {
                                    const targetIdx = index + direction;
                                    if (targetIdx >= 0 && targetIdx < items.length) {
                                      setFocusedRow(targetIdx);
                                    }
                                  }}
                                  showOriginalQuantities={showOriginalQuantities}
                                  maxClipHeight={splitTopClip}
                                  textOverride={usesTextOverride ? String(blockInfo.data?.titleOverride ?? "") : undefined}
                                  hidePrices={displayMode === "ohne-preise"}
                                  dezimalstellenMengen={docForm.dezimalstellenMengen}
                                  dezimalstellenPreise={getPriceDecimalsForItem(item)}
                                  mengeneinheitenAenderbar={editorSettings?.mengeneinheitenAenderbar !== false}
                                  altPosGesamtpreis={editorSettings?.altPosGesamtpreis || "kursiv"}
                                  statusmarkierungenPositionen={editorSettings?.statusmarkierungenPositionen === true}
                                  warnungAufschlagUnter={parseFloat(String(editorSettings?.warnungAufschlagUnter ?? "10"))}
                                  alarmAufschlagUnter={parseFloat(String(editorSettings?.alarmAufschlagUnter ?? "0"))}
                                  showFormatBar={editorSettings?.showFormatBar !== false}
                                  posNrEditable={docForm.autoPositionNumbers === false}
                                  jumboEinzelpreise={docForm.einzelpreiseInJumbo !== false}
                                  jumboMengen={docForm.mengenInJumbo !== false}
                                  showDecimals={editorSettings?.showDecimals !== false}
                                  jumboKleinerSchrift={editorSettings?.jumboKleinerSchrift === true}
                                  showMouseInfo={editorSettings?.showMouseInfo !== false}
                                  tabInTexts={editorSettings?.tabInTexts !== false}
                                  showUnitList={editorSettings?.showMengeneinheitenListe !== false}
                                  colWidths={usePercentWidths ? { posW: colWidths.posW, qtyW: colWidths.qtyW, unitW: colWidths.unitW, epW: colWidths.epW, gpW: colWidths.gpW } : undefined}
                                />
                              );

                              if (
                                (item.positionFlag === "jumbo" || (item.type === "jumbo" && !item._parentClientId)) &&
                                visibleExpandedJumbos.has(item._clientId)
                              ) {
                                const childCount = getJumboChildCount(items, index);
                                if (childCount === 0) {
                                  return row;
                                }
                                return [
                                  row,
                                  <tr
                                    key={`${item._clientId}-expand`}
                                    className="border-b border-gray-100"
                                  >
                                    <td className="w-[40px]"></td>
                                    <td className="py-0.5 px-2 pl-6" colSpan={5}>
                                      <div className="flex items-center">
                                        <span className="text-gray-400 italic">
                                          darin enthalten:
                                        </span>
                                        <div className="relative ml-auto">
                                          {jumboMenuOpen === index && (() => {
                                            const btn = document.querySelector(`[data-testid="button-jumbo-add-${index}"]`);
                                            const rect = btn?.getBoundingClientRect();
                                            if (!rect) return null;
                                            return createPortal(
                                              <>
                                                <div className="fixed inset-0 z-[9998]" onClick={() => setJumboMenuOpen(null)} />
                                                <div
                                                  className="fixed z-[9999] bg-white border rounded-md shadow-lg py-1 min-w-[160px]"
                                                  style={{ top: rect.bottom + 4, left: rect.right - 160 }}
                                                >
                                                  {[
                                                    ["Material", "material", "text-green-600"],
                                                    ["Leistung", "leistung", "text-blue-600"],
                                                    ["Lohn", "_lohn", "text-orange-600"],
                                                    ["Manuell", "manuell", "text-gray-600"],
                                                  ].map(([label, type, color]) => (
                                                    <button
                                                      key={type}
                                                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex items-center gap-2"
                                                      data-testid={`jumbo-menu-${type}`}
                                                      onClick={() => {
                                                        if (type === "material") {
                                                          setArtikelDialog({
                                                            filter: "Material",
                                                            parentJumboIndex: index,
                                                          });
                                                        } else if (type === "_lohn") {
                                                          setLohnOpen(true);
                                                          setLohnTargetJumbo(index);
                                                        } else {
                                                          addPosition(type, index);
                                                        }
                                                        setJumboMenuOpen(null);
                                                      }}
                                                    >
                                                      <span className={`${color} font-medium`}>{label}</span>
                                                    </button>
                                                  ))}
                                                </div>
                                              </>,
                                              document.body
                                            );
                                          })()}
                                        </div>
                                      </div>
                                    </td>
                                    {showKalk && (
                                      <td
                                        colSpan={3}
                                        className="border-l border-gray-100"
                                      ></td>
                                    )}
                                  </tr>,
                                ];
                              }
                              return row;
                            })}


                          </tbody>
                        </table>
                      </div>
                      </>
                        );
                      })()}

                      {pageIdx === summaryPageIdx && editorZones.beforeTotalsText && (
                        <div
                          data-testid="before-totals-text-edit"
                          contentEditable
                          suppressContentEditableWarning
                          style={{
                            fontFamily: "Helvetica, Arial, sans-serif",
                            fontSize: "10pt",
                            lineHeight: "1.35",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            padding: "4px 0",
                            outline: "none",
                            minHeight: "14px",
                            cursor: "text",
                          }}
                          onBlur={(e) => {
                            const newText = e.currentTarget.innerText || "";
                            if (newText !== (docForm.beforeTotalsText || docForm.footerText || "")) {
                              setDocForm((prev: any) => ({ ...prev, beforeTotalsText: newText, footerText: "" }));
                              setDirty(true);
                            }
                          }}
                          dangerouslySetInnerHTML={{ __html: (editorZones.beforeTotalsText || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>") }}
                        />
                      )}

                      {pageIdx === summaryPageIdx && items.some(it => it.type === "abschluss" || it.type === "nettosumme" || it.type === "gesamtsumme") && (
                        <>
                          <SummaryAndFooterBlock
                            netTotal={netTotal}
                            taxAmount={taxAmount}
                            grossTotal={grossTotal}
                            laborTotal={laborTotal}
                            docForm={docForm}
                            setDocForm={setDocForm}
                            setDirty={setDirty}
                            isAbschlagOrSchluss={isAbschlagOrSchluss}
                            abschlagData={abschlagData}
                            showKalk={showKalk}
                            ekTotal={ekTotal}
                            margeTotal={margeTotal}
                            endsummeConfig={activeWorkArea?.endsumme}
                            gpColumnPercent={typeof colWidths.gpW === 'number' ? colWidths.gpW : undefined}
                            onNettoClick={() => setNettoDetailOpen(true)}
                            skontoItems={items.filter(it => it.type === "skonto")}
                            onUpdateItem={updateItem}
                            onRemoveItem={removeItem}
                            allItems={items}
                            focusedRow={focusedRow}
                            onFocusRow={(idx) => { setFocusedRow(idx); setSelectedRows(new Set()); }}
                            selectedRows={selectedRows}
                            onToggleSelect={(idx, e) => {
                              setSelectedRows(prev => {
                                const next = new Set(prev);
                                if (next.has(idx)) next.delete(idx);
                                else next.add(idx);
                                return next;
                              });
                              setFocusedRow(idx);
                            }}
                            noNettoSingleTax={editorSettings?.noNettoSingleTax === true}
                            par13bActive={docForm.par13b === true}
                            par13bText={editorSettings?.par13bText as string | undefined}
                            dezimalstellenPreise={docForm.dezimalstellenPreise ?? 2}
                            skontoImDokument={docForm.skontoImDokument !== false}
                          />
                          <div
                            className="min-h-[30px]"
                            data-testid="after-totals-zone"
                            onContextMenu={handleAfterTotalsContextMenu}
                          >
                            {items.some(it => it.afterTotals && it.type !== "skonto") && (
                              <table
                                className="w-full border-collapse table-fixed mt-3"
                                style={{ fontFamily: "Helvetica, Arial, sans-serif", fontSize: "10pt" }}
                              >
                                <tbody>
                                {items.map((item, index) => {
                                  if (!item.afterTotals) return null;
                                  if (item.type === "skonto") return null;
                                  return (
                                    <PositionRow
                                      key={item._clientId}
                                      item={item}
                                      index={index}
                                      focused={focusedRow === index}
                                      selected={selectedRows.has(index)}
                                      onFocus={() => setFocusedRow(index)}
                                      onRowClick={(e) => handleRowClick(index, e)}
                                      onToggleSelect={(e) => handleToggleSelect(index, e)}
                                      onUpdate={(i, field, value) => {
                                        updateItem(i, field, value);
                                        if (field === "title") {
                                          const row = document.querySelector(`[data-row="${i}"]`);
                                          const titleEl = row?.querySelector('[data-field="title"]') as HTMLElement | null;
                                          handleSlashInput(i, value, titleEl);
                                        }
                                      }}
                                      onRemove={() => removeItem(index)}
                                      onCopy={() => copyItem(index)}
                                      onMove={(dir) => moveItem(index, dir)}
                                      onInsertLine={() => {
                                        const lineItem = emptyItem("freitext", documentId || 0, index + 1, null);
                                        lineItem.title = "---";
                                        lineItem.afterTotals = true;
                                        const updated = [...items];
                                        updated.splice(index + 1, 0, lineItem);
                                        updated.forEach((it, i) => { it.sortOrder = i; });
                                        setItems(recalcTitelsummen(updated));
                                        setDirty(true);
                                      }}
                                      onInsertNewPosition={() => {}}
                                      unitCodes={unitCodes}
                                      isSubItem={false}
                                      isJumbo={false}
                                      jumboExpanded={false}
                                      jumboChildCount={0}
                                      onToggleJumbo={() => {}}
                                      onAddJumboChild={() => {}}
                                      onOpenLohnDialog={() => {}}
                                      onOpenPriceDialog={() => setPriceDialogItem({ index, item })}
                                      onOpenArtikelDialog={(filter) => setArtikelDialog({ filter, parentJumboIndex: undefined })}
                                      onOpenFloskelDialog={() => setFloskelOpen(true)}
                                      onOpenTitelsummeDetail={() => setTitelsummeDetailIndex(index)}
                                      onNavigateToRow={() => {}}
                                      showKalk={showKalk}
                                      showOriginalQuantities={showOriginalQuantities}
                                      positionNumber=""
                                      sectionSum={undefined}
                                      dragId={item._clientId || `aftertext-${index}`}
                                      displayPos=""
                                      onContextMenu={(e) => handleContextMenu(e, index)}
                                      jumboMenuOpen={false}
                                      onJumboMenuToggle={() => {}}
                                      dezimalstellenMengen={docForm.dezimalstellenMengen}
                                      dezimalstellenPreise={getPriceDecimalsForItem(item)}
                                      mengeneinheitenAenderbar={editorSettings?.mengeneinheitenAenderbar !== false}
                                      altPosGesamtpreis={editorSettings?.altPosGesamtpreis || "kursiv"}
                                      statusmarkierungenPositionen={editorSettings?.statusmarkierungenPositionen === true}
                                      warnungAufschlagUnter={parseFloat(String(editorSettings?.warnungAufschlagUnter ?? "10"))}
                                      alarmAufschlagUnter={parseFloat(String(editorSettings?.alarmAufschlagUnter ?? "0"))}
                                      showFormatBar={editorSettings?.showFormatBar !== false}
                                      posNrEditable={docForm.autoPositionNumbers === false}
                                      jumboEinzelpreise={docForm.einzelpreiseInJumbo !== false}
                                      jumboMengen={docForm.mengenInJumbo !== false}
                                      showDecimals={editorSettings?.showDecimals !== false}
                                      jumboKleinerSchrift={editorSettings?.jumboKleinerSchrift === true}
                                      showMouseInfo={editorSettings?.showMouseInfo !== false}
                                      tabInTexts={editorSettings?.tabInTexts !== false}
                                      showUnitList={editorSettings?.showMengeneinheitenListe !== false}
                                      colWidths={usePercentWidths ? { posW: colWidths.posW, qtyW: colWidths.qtyW, unitW: colWidths.unitW, epW: colWidths.epW, gpW: colWidths.gpW } : undefined}
                                    />
                                  );
                                })}
                                </tbody>
                              </table>
                            )}
                          </div>
                          {editorZones.afterTotalsText && (
                            <div
                              data-testid="after-totals-text-edit"
                              contentEditable
                              suppressContentEditableWarning
                              style={{
                                fontFamily: "Helvetica, Arial, sans-serif",
                                fontSize: "10pt",
                                lineHeight: "1.35",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                padding: "8px 0 4px 0",
                                outline: "none",
                                minHeight: "14px",
                                cursor: "text",
                              }}
                              onBlur={(e) => {
                                const newText = e.currentTarget.innerText || "";
                                if (newText !== (docForm.afterTotalsText || "")) {
                                  setDocForm((prev: any) => ({ ...prev, afterTotalsText: newText }));
                                  setDirty(true);
                                }
                              }}
                              dangerouslySetInnerHTML={{ __html: (editorZones.afterTotalsText || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>") }}
                            />
                          )}
                        </>
                      )}


                    </A4PageWrapper>
                  );
                })}
              </SortableContext>
            </DndContext>

            
          </div>

          <EditorSidebar
            sidebarTab={sidebarTab}
            setSidebarTab={setSidebarTab}
            netTotal={netTotal}
            taxAmount={taxAmount}
            grossTotal={grossTotal}
            ekTotal={ekTotal}
            margeTotal={margeTotal}
            items={items}
            positionNumbers={positionNumbers}
            docForm={docForm}
            setDocForm={setDocForm}
            setDirty={setDirty}
            totalPages={totalPages}
            selectedCustomer={selectedCustomer}
            projects={projects}
            formTemplates={formTemplates}
            showFormSelect={editorSettings?.showFormSelect !== false}
            convertTargets={convertTargets}
            convertMutation={convertMutation}
            setFocusedRow={setFocusedRow}
            isNew={isNew}
            navigate={navigate}
          />

          {showPreview && (
            <DocumentPreview
              docForm={docForm}
              items={items}
              customer={selectedCustomer}
              company={companySettings}
              documentId={documentId}
              formTemplateId={docForm.formTemplateId}
              projectId={docForm.projectId ?? null}
              displayMode={displayMode}
              onClose={() => setShowPreview(false)}
              overrideTotals={{ netTotal, taxAmount, grossTotal }}
              abschlaege={abschlagData?.abschlaege?.map((a: any) => ({
                documentNumber: a.documentNumber,
                date: a.date,
                netTotal: a.netTotal,
                taxAmount: a.taxAmount,
                grossTotal: a.grossTotal,
                abschlagNumber: a.abschlagNumber ?? undefined,
                deltaNet: a.deltaNet,
                deltaGross: a.deltaGross,
                deltaTax: a.deltaTax,
              }))}
              onEmail={() => {
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
            />
          )}
        </div>
      </div>

      <Dialog
        open={deleteConfirm.open}
        onOpenChange={(open) => {
          if (!open) closeDeleteConfirm(false);
        }}
      >
        <DialogContent className="max-w-[430px] overflow-hidden border-slate-200 p-0 shadow-2xl" data-testid="dialog-delete-confirm">
          <div className="bg-[linear-gradient(112deg,#07111f_0%,#0f2f3f_55%,#0b7a75_100%)] px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-white/15 bg-white/10">
                <AlertTriangle className="h-5 w-5 text-amber-200" />
              </div>
              <DialogHeader className="space-y-0 text-left">
                <DialogTitle className="text-base text-white">Positionen löschen?</DialogTitle>
                <div className="text-xs text-cyan-50/75">Diese Aktion entfernt die Auswahl aus dem Dokument.</div>
              </DialogHeader>
            </div>
          </div>
          <div className="space-y-3 px-5 py-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {deleteConfirm.count === 1
                ? <>Position <span className="font-semibold text-slate-950">"{deleteConfirm.label || "Position"}"</span> wirklich löschen?</>
                : <><span className="font-semibold text-slate-950">{deleteConfirm.count}</span> markierte Positionen wirklich löschen?</>}
            </div>
            <p className="text-xs text-slate-500">
              Zugehörige Unterpositionen werden mit entfernt. Die Änderung wird erst dauerhaft, wenn du speicherst.
            </p>
          </div>
          <DialogFooter className="border-t border-slate-100 bg-slate-50 px-5 py-3">
            <Button variant="outline" onClick={() => closeDeleteConfirm(false)} data-testid="button-cancel-delete-confirm">
              Abbrechen
            </Button>
            <Button className="bg-red-600 text-white hover:bg-red-700" onClick={() => closeDeleteConfirm(true)} data-testid="button-confirm-delete">
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedRows.size > 0 && (
        <div
          className="fixed z-[9998] bg-white border border-gray-300 rounded-lg shadow-2xl text-xs select-none print:hidden"
          style={{ left: `${toolboxPos.x}px`, top: `${toolboxPos.y}px`, minWidth: "200px" }}
          data-testid="floating-toolbox"
          onMouseDown={(e) => {
            if (!(e.target as HTMLElement).closest("[data-toolbox-action]") && !(e.target as HTMLElement).closest("select")) {
              e.preventDefault();
              const startX = e.clientX - toolboxPos.x;
              const startY = e.clientY - toolboxPos.y;
              const onMove = (ev: MouseEvent) => {
                setToolboxPos({ x: ev.clientX - startX, y: ev.clientY - startY });
              };
              const onUp = () => {
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
              };
              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }
          }}
        >
          <div className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 rounded-t-lg border-b border-red-200 cursor-move">
            <span className="text-red-700 font-semibold" data-testid="text-selected-count">
              {selectedRows.size} Position{selectedRows.size !== 1 ? "en" : ""}
            </span>
            <span className="ml-auto text-gray-400 text-[10px]">⠿ verschiebbar</span>
          </div>
          <div className="flex flex-col gap-0.5 p-1.5">
            <div className="flex items-center gap-1">
              <button
                className="flex-1 flex items-center gap-1.5 px-2 py-1 rounded hover:bg-blue-50 text-gray-700 text-xs"
                data-toolbox-action
                onClick={() => {
                  const sorted = Array.from(selectedRows).sort((a, b) => a - b);
                  const copied = sorted.map(i => items[i]).filter(Boolean);
                  if (copied.length === 0) return;
                  const insertAt = Math.max(...sorted) + 1;
                  setItems(prev => {
                    const u = [...prev];
                    const newItems = copied.map((src, ci) => ({
                      ...src,
                      id: undefined,
                      _clientId: genClientId(),
                      sortOrder: insertAt + ci,
                    }));
                    u.splice(insertAt, 0, ...newItems);
                    u.forEach((it, i) => { it.sortOrder = i; });
                    return recalcTitelsummen(u);
                  });
                  setSelectedRows(new Set());
                  setFocusedRow(insertAt);
                  setDirty(true);
                  toast({ title: `${copied.length} Position${copied.length !== 1 ? "en" : ""} kopiert` });
                }}
                data-testid="button-copy-selected"
              >
                <Copy className="h-3.5 w-3.5" /> Kopieren
              </button>
              <button
                className="flex-1 flex items-center gap-1.5 px-2 py-1 rounded hover:bg-red-50 text-red-700 text-xs"
                data-toolbox-action
                onClick={() => { void deleteSelectedRows(); }}
                data-testid="button-delete-selected"
              >
                <Trash2 className="h-3.5 w-3.5" /> Löschen
              </button>
            </div>
            <button
              className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-100 text-gray-600 text-xs"
              data-toolbox-action
              onClick={() => {
                const insertAt = Math.max(...Array.from(selectedRows)) + 1;
                const ni = emptyItem("freitext", documentId || 0, insertAt);
                ni.title = "———";
                setItems(prev => {
                  const u = [...prev];
                  u.splice(insertAt, 0, ni);
                  u.forEach((x, i) => { x.sortOrder = i; });
                  return recalcTitelsummen(u);
                });
                setSelectedRows(new Set());
                setFocusedRow(insertAt);
                setDirty(true);
              }}
              data-testid="button-line-selected"
            >
              <span className="text-[11px] font-bold leading-none mr-0.5">―</span> Trennlinie einfügen
            </button>
            <button
              className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-100 text-gray-600 text-xs"
              data-toolbox-action
              onClick={() => {
                const insertAt = Math.max(...Array.from(selectedRows)) + 1;
                const ni = emptyItem("freitext", documentId || 0, insertAt);
                setItems(prev => {
                  const u = [...prev];
                  u.splice(insertAt, 0, ni);
                  u.forEach((x, i) => { x.sortOrder = i; });
                  return recalcTitelsummen(u);
                });
                setSelectedRows(new Set());
                setFocusedRow(insertAt);
                setDirty(true);
              }}
              data-testid="button-freitext-selected"
            >
              <TextCursorInput className="h-3.5 w-3.5" /> Freien Text einfügen
            </button>
            <div className="border-t border-gray-200 my-1" />
            <div className="px-2 py-0.5">
              <span className="text-[10px] text-gray-400 font-medium">Schrift</span>
            </div>
            <div className="flex items-center gap-0.5 px-2 py-0.5">
              <button
                className="h-7 w-7 flex items-center justify-center rounded border border-gray-200 hover:bg-gray-100 font-bold text-sm"
                data-toolbox-action
                title="Fett"
                onClick={() => {
                  setItems(prev => {
                    const u = [...prev];
                    selectedRows.forEach(i => {
                      if (u[i]) u[i] = { ...u[i], fontBold: !u[i].fontBold };
                    });
                    return u;
                  });
                  setDirty(true);
                }}
                data-testid="button-bold-selected"
              >
                F
              </button>
              <button
                className="h-7 w-7 flex items-center justify-center rounded border border-gray-200 hover:bg-gray-100 italic text-sm"
                data-toolbox-action
                title="Kursiv"
                onClick={() => {
                  setItems(prev => {
                    const u = [...prev];
                    selectedRows.forEach(i => {
                      if (u[i]) u[i] = { ...u[i], fontItalic: !u[i].fontItalic };
                    });
                    return u;
                  });
                  setDirty(true);
                }}
                data-testid="button-italic-selected"
              >
                K
              </button>
              <button
                className="h-7 w-7 flex items-center justify-center rounded border border-gray-200 hover:bg-gray-100 underline text-sm"
                data-toolbox-action
                title="Unterstrichen"
                onClick={() => {
                  setItems(prev => {
                    const u = [...prev];
                    selectedRows.forEach(i => {
                      if (u[i]) u[i] = { ...u[i], fontUnderline: !(u[i] as any).fontUnderline };
                    });
                    return u;
                  });
                  setDirty(true);
                }}
                data-testid="button-underline-selected"
              >
                U
              </button>
              <span className="text-gray-200 mx-0.5">|</span>
              <select
                className="h-7 text-[11px] border border-gray-200 rounded px-1 bg-white w-[52px]"
                data-toolbox-action
                title="Schriftgröße"
                onChange={(e) => {
                  const size = parseInt(e.target.value);
                  if (!size) return;
                  setItems(prev => {
                    const u = [...prev];
                    selectedRows.forEach(i => {
                      if (u[i]) (u[i] as any).fontSize = size;
                    });
                    return u;
                  });
                  setDirty(true);
                }}
                defaultValue=""
                data-testid="select-fontsize-selected"
              >
                <option value="">Gr.</option>
                <option value="7">7pt</option>
                <option value="8">8pt</option>
                <option value="9">9pt</option>
                <option value="10">10pt</option>
                <option value="11">11pt</option>
                <option value="12">12pt</option>
                <option value="14">14pt</option>
              </select>
            </div>
            <div className="px-2 py-0.5">
              <span className="text-[10px] text-gray-400 font-medium">Farbe</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-0.5 flex-wrap">
              {[
                { color: "#000000", label: "Schwarz" },
                { color: "#dc2626", label: "Rot" },
                { color: "#2563eb", label: "Blau" },
                { color: "#16a34a", label: "Grün" },
                { color: "#9333ea", label: "Lila" },
                { color: "#d97706", label: "Orange" },
                { color: "#6b7280", label: "Grau" },
                { color: "#0891b2", label: "Cyan" },
              ].map(({ color, label }) => (
                <button
                  key={color}
                  className="h-5 w-5 rounded-full border border-gray-300 hover:scale-125 transition-transform hover:border-gray-500"
                  style={{ backgroundColor: color }}
                  title={label}
                  data-toolbox-action
                  onClick={() => {
                    setItems(prev => {
                      const u = [...prev];
                      selectedRows.forEach(i => {
                        if (u[i]) u[i] = { ...u[i], fontColor: color };
                      });
                      return u;
                    });
                    setDirty(true);
                  }}
                  data-testid={`button-color-${label.toLowerCase()}`}
                />
              ))}
            </div>
            <div className="border-t border-gray-200 my-1" />
            <button
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100 text-gray-500 text-xs"
              data-toolbox-action
              onClick={() => setSelectedRows(new Set())}
              data-testid="button-deselect"
            >
              Aufheben <span className="text-[9px] text-gray-400 ml-auto">Esc</span>
            </button>
          </div>
        </div>
      )}

      {(editorSettings?.showStatusLine !== false) && (
        <div
          className="flex items-center gap-3 px-5 py-3 bg-[linear-gradient(90deg,#07111f_0%,#0f2638_54%,#0f766e_100%)] border-t border-slate-800 text-[11px] text-slate-200 shadow-[0_-16px_35px_-26px_rgba(15,23,42,.85)] shrink-0 print:hidden"
          data-testid="editor-status-bar"
        >
          <span className="hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100/70 md:inline">Live-Kontrolle</span>
          <span className="rounded-md border border-white/10 bg-white/10 px-2.5 py-1.5 tabular-nums shadow-sm" data-testid="status-positions">
            {items.filter(it => !it.afterTotals && !["abschluss", "titelsumme", "zwischensumme", "freitext", "floskel", "text", "skonto", "titel", "gruppe"].includes(it.type || "")).length} Positionen
          </span>
          <span className="hidden" aria-hidden="true">|</span>
          <span className="rounded-md border border-white/10 bg-white/10 px-2.5 py-1.5 tabular-nums shadow-sm" data-testid="status-netto">
            Netto: {fmtCurrency(netTotal.toFixed(2))} €
          </span>
          <span className="hidden" aria-hidden="true">|</span>
          <span className="rounded-md border border-white/10 bg-white/10 px-2.5 py-1.5 tabular-nums shadow-sm" data-testid="status-brutto">
            Brutto: {fmtCurrency(grossTotal.toFixed(2))} €
          </span>
          {showKalk && (
            <>
              <span className="hidden" aria-hidden="true">|</span>
              <span className="rounded-md border border-white/10 bg-white/10 px-2.5 py-1.5 tabular-nums shadow-sm" data-testid="status-marge">
                Marge: {netTotal !== 0 ? fmtPercent((margeTotal / netTotal) * 100) : "0,0"} %
              </span>
            </>
          )}
          {dirty && (
            <>
              <span className="hidden" aria-hidden="true">|</span>
              <span className="rounded-md border border-amber-300/40 bg-amber-300/15 px-2.5 py-1.5 font-semibold text-amber-100" data-testid="status-dirty">Nicht gespeichert</span>
            </>
          )}
          {editorSettings?.autoSaveEnabled && (
            <>
              <span className="hidden" aria-hidden="true">|</span>
              <span className="ml-auto rounded-md border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-1.5 text-emerald-100" data-testid="status-autosave">
                Auto-Save: {editorSettings.autoSaveMinutes || 5} Min.
              </span>
            </>
          )}
        </div>
      )}

    </div>
  );
}
