import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Document, Customer, DocumentItem, Project } from "@shared/schema";
import { documentTypeLabels, documentStatusLabels } from "@shared/schema";
import { buildNewDocumentUrl, documentCreateTypes } from "@shared/document-engine/document-types";
import { fmtDocNumber } from "@/lib/format";
import { CustomerHoverCard } from "@/components/customer-hover-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuSeparator,
  ContextMenuLabel,
} from "@/components/ui/context-menu";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Search,
  FileText,
  Pencil,
  Trash2,
  Eye,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  GripVertical,
  PlusCircle,
  MinusCircle,
  RefreshCw,
  FolderPlus,
  Copy,
  ArrowRightLeft,
  ExternalLink,
  ClipboardPaste,
  X,
  MoreVertical,
  AlertTriangle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { fmtCurrency, fmtDate } from "@/lib/format";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const docTypeShort: Record<string, string> = {
  angebot: "ANG",
  auftragsbestaetigung: "AB",
  abschlagsrechnung: "AR",
  teilrechnung: "TR",
  rechnung: "RE",
  gutschrift: "GU",
  lieferschein: "LS",
  freies_dokument: "FD",
  nachkalkulation: "NK",
};

const docTypeBadge: Record<string, string> = {
  angebot: "bg-blue-100 text-blue-700",
  auftragsbestaetigung: "bg-green-100 text-green-700",
  abschlagsrechnung: "bg-orange-100 text-orange-700",
  teilrechnung: "bg-amber-100 text-amber-700",
  rechnung: "bg-purple-100 text-purple-700",
  gutschrift: "bg-teal-100 text-teal-700",
  lieferschein: "bg-cyan-100 text-cyan-700",
  freies_dokument: "bg-gray-100 text-gray-600",
  nachkalkulation: "bg-indigo-100 text-indigo-700",
};

interface PaginatedResult {
  data: Document[];
  total: number;
}

interface OpenTab {
  id: string;
  documentId: number;
  label: string;
  type: string;
}

interface CopiedPosition {
  type: string;
  title: string;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  laborPrice: string;
  materialPrice: string;
}

function TabDocumentView({
  documentId,
  copiedPositions,
  onCopyPositions,
  onPastePositions,
}: {
  documentId: number;
  copiedPositions: CopiedPosition[];
  onCopyPositions: (items: CopiedPosition[]) => void;
  onPastePositions: (documentId: number, items: CopiedPosition[]) => void;
}) {
  const { data: doc } = useQuery<Document>({
    queryKey: ["/api/documents", documentId],
  });

  const { data: items } = useQuery<DocumentItem[]>({
    queryKey: ["/api/documents", documentId, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/documents/${documentId}/items`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [expandedJumbos, setExpandedJumbos] = useState<Set<number>>(new Set());
  const { toast } = useToast();

  const isItemVisible = (item: DocumentItem) => {
    if (!item.parentItemId) return true;
    return expandedJumbos.has(item.parentItemId);
  };

  const visibleIndices = (items || []).reduce<number[]>((acc, item, idx) => {
    if (isItemVisible(item)) acc.push(idx);
    return acc;
  }, []);

  const toggleSelect = (idx: number) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selectAll = () => {
    if (!items) return;
    const allVisible = new Set(visibleIndices);
    const allSelected = visibleIndices.every((i) => selectedItems.has(i));
    setSelectedItems(allSelected ? new Set() : allVisible);
  };

  const copySelected = () => {
    if (!items) return;
    const copied = Array.from(selectedItems)
      .filter((idx) => visibleIndices.includes(idx))
      .map((idx) => items[idx])
      .filter(Boolean)
      .map((item) => ({
        type: item.type,
        title: item.title || "",
        description: item.description || "",
        unit: item.unit || "",
        quantity: item.quantity || "0",
        unitPrice: item.unitPrice || "0",
        totalPrice: item.totalPrice || "0",
        laborPrice: item.laborPrice || "0",
        materialPrice: item.materialPrice || "0",
      }));
    onCopyPositions(copied);
    toast({ title: `${copied.length} Position(en) kopiert` });
  };

  const pasteHere = () => {
    if (copiedPositions.length === 0) return;
    onPastePositions(documentId, copiedPositions);
  };

  if (!doc || !items) {
    return (
      <div className="p-6">
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="font-semibold text-sm">
            {fmtDocNumber(doc.documentNumber)} -{" "}
            {documentTypeLabels[doc.type] || doc.type}
          </h3>
          <p className="text-xs text-muted-foreground truncate max-w-sm">
            {doc.subject || "Kein Betreff"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {selectedItems.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={copySelected}
              data-testid="button-copy-positions"
            >
              <Copy className="h-3 w-3 mr-1" />
              {selectedItems.size} kopieren
            </Button>
          )}
          {copiedPositions.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={pasteHere}
              data-testid="button-paste-positions"
            >
              <ClipboardPaste className="h-3 w-3 mr-1" />
              {copiedPositions.length} einfügen
            </Button>
          )}
        </div>
      </div>

      {items.some((i) => i.type === "jumbo") && (
        <div className="flex items-center gap-1 mb-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] gap-1"
            onClick={() => {
              const ids = new Set(
                items.filter((i) => i.type === "jumbo").map((i) => i.id),
              );
              setExpandedJumbos(ids);
            }}
            data-testid="button-tab-expand-all"
          >
            <PlusCircle className="h-3 w-3" />
            Alle einblenden
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] gap-1"
            onClick={() => setExpandedJumbos(new Set())}
            data-testid="button-tab-collapse-all"
          >
            <MinusCircle className="h-3 w-3" />
            Alle ausblenden
          </Button>
        </div>
      )}

      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="w-8 p-2">
                <input
                  type="checkbox"
                  checked={
                    visibleIndices.length > 0 &&
                    visibleIndices.every((i) => selectedItems.has(i))
                  }
                  onChange={selectAll}
                  className="rounded"
                />
              </TableHead>
              <TableHead className="p-2">Pos</TableHead>
              <TableHead className="p-2">Typ</TableHead>
              <TableHead className="p-2">Bezeichnung</TableHead>
              <TableHead className="p-2 text-right">Menge</TableHead>
              <TableHead className="p-2 text-right">EP</TableHead>
              <TableHead className="p-2 text-right">GP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground py-6 text-sm"
                >
                  Keine Positionen
                </TableCell>
              </TableRow>
            )}
            {items.map((item, idx) => {
              if (item.parentItemId) {
                const parent = items.find((p) => p.id === item.parentItemId);
                if (parent && !expandedJumbos.has(parent.id)) return null;
              }
              const isJumbo = item.type === "jumbo";
              const childCount = isJumbo
                ? items.filter((c) => c.parentItemId === item.id).length
                : 0;
              const isChild = !!item.parentItemId;

              return (
                <TableRow
                  key={item.id}
                  className={`text-xs ${selectedItems.has(idx) ? "bg-primary/5" : ""} ${
                    isJumbo
                      ? "bg-purple-50/30 dark:bg-purple-950/10"
                      : isChild
                        ? "bg-purple-50/20 dark:bg-purple-950/5"
                        : item.type === "titel" || item.type === "gruppe"
                          ? "bg-amber-50/40 dark:bg-amber-950/10 font-semibold"
                          : ""
                  }`}
                  style={{
                    borderLeft: isJumbo
                      ? "3px solid #9333ea"
                      : item.type === "titel" || item.type === "gruppe"
                        ? "3px solid #d97706"
                        : "3px solid transparent",
                  }}
                  data-testid={`tab-position-${item.id}`}
                >
                  <TableCell className="p-2">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(idx)}
                      onChange={() => toggleSelect(idx)}
                      className="rounded"
                    />
                  </TableCell>
                  <TableCell className="p-2 font-mono">
                    {item.positionNumber || "-"}
                  </TableCell>
                  <TableCell className="p-2">
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      {item.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="p-2 max-w-[300px]">
                    <div className="flex items-center gap-1">
                      {isJumbo && (
                        <button
                          onClick={() => {
                            setExpandedJumbos((prev) => {
                              const next = new Set(prev);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            });
                          }}
                          className="text-purple-600 hover:text-purple-800 shrink-0"
                          data-testid={`button-toggle-jumbo-tab-${item.id}`}
                        >
                          {expandedJumbos.has(item.id) ? (
                            <MinusCircle className="h-3 w-3" />
                          ) : (
                            <PlusCircle className="h-3 w-3" />
                          )}
                        </button>
                      )}
                      {isChild && (
                        <span className="text-muted-foreground pl-4">↳</span>
                      )}
                      <span className="truncate">{item.title || "-"}</span>
                      {isJumbo &&
                        childCount > 0 &&
                        !expandedJumbos.has(item.id) && (
                          <span className="text-[9px] text-purple-500 shrink-0">
                            ({childCount} Pos.)
                          </span>
                        )}
                    </div>
                  </TableCell>
                  <TableCell className="p-2 text-right font-mono">
                    {item.type !== "freitext" && item.type !== "floskel"
                      ? fmtCurrency(item.quantity).replace(" €", "")
                      : ""}
                  </TableCell>
                  <TableCell className="p-2 text-right font-mono">
                    {item.type !== "freitext" && item.type !== "floskel"
                      ? fmtCurrency(item.unitPrice)
                      : ""}
                  </TableCell>
                  <TableCell className="p-2 text-right font-mono font-semibold">
                    {item.type !== "freitext" && item.type !== "floskel"
                      ? fmtCurrency(item.totalPrice)
                      : ""}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-between items-center text-sm border-t pt-2">
        <span className="text-muted-foreground">
          {items.filter((i) => !i.parentItemId).length} Positionen
        </span>
        <div className="text-right">
          <span className="text-muted-foreground">Netto: </span>
          <span className="font-semibold font-mono">
            {fmtCurrency(doc.netTotal)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function DocumentsPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [copiedPositions, setCopiedPositions] = useState<CopiedPosition[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const searchParam = params.get("search");
    if (searchParam) {
      setSearch(searchParam);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [typeFilter]);

  const { data: paginatedDocs, isLoading } = useQuery<PaginatedResult>({
    queryKey: [
      "/api/documents",
      "paginated",
      page,
      pageSize,
      debouncedSearch,
      typeFilter,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (typeFilter !== "all") params.set("type", typeFilter);
      params.set("excludeType", "eingangsrechnung");
      const res = await fetch(`/api/documents?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Fehler beim Laden");
      return res.json();
    },
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignDocId, setAssignDocId] = useState<number | null>(null);
  const [assignProjectSearch, setAssignProjectSearch] = useState("");
  const [assignSelectedProject, setAssignSelectedProject] = useState<number | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<Document | null>(null);
  const assignToProjectMut = useMutation({
    mutationFn: async ({ docId, projectId }: { docId: number; projectId: number }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/document-tree`, {
        documentId: docId,
        nodeType: "document",
      });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", variables.projectId, "document-tree"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      const proj = projects?.find(p => p.id === variables.projectId);
      toast({ title: "Projekt zugeordnet", description: proj ? `→ ${proj.name}` : undefined });
      setAssignDialogOpen(false);
      setAssignDocId(null);
      setAssignSelectedProject(null);
      setAssignProjectSearch("");
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const statusChangeMut = useMutation({
    mutationFn: async ({ docId, status }: { docId: number; status: string }) => {
      await apiRequest("PATCH", `/api/documents/${docId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Status geändert" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const duplicateDoc = (doc: Document) => {
    convertMutation.mutate({ id: doc.id, targetType: doc.type });
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setDeleteDoc(null);
      toast({ title: "Dokument gelöscht" });
    },
    onError: (err: any) =>
      toast({
        title: "Fehler",
        description: err.message,
        variant: "destructive",
      }),
  });

  const convertMutation = useMutation({
    mutationFn: async ({
      id,
      targetType,
    }: {
      id: number;
      targetType: string;
    }) => {
      const res = await apiRequest("POST", `/api/documents/${id}/convert`, {
        targetType,
      });
      return res.json();
    },
    onSuccess: (newDoc: Document) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      const label = documentTypeLabels[newDoc.type] || newDoc.type;
      toast({
        title: "Umgewandelt",
        description: `${label} ${fmtDocNumber(newDoc.documentNumber)} erstellt`,
      });
      setLocation(`/dokumente/${newDoc.id}/bearbeiten`);
    },
    onError: (err: any) =>
      toast({
        title: "Fehler",
        description: err.message,
        variant: "destructive",
      }),
  });

  const moveDocMutation = useMutation({
    mutationFn: async ({
      docId,
      parentId,
    }: {
      docId: number;
      parentId: number | null;
    }) => {
      await apiRequest("PATCH", `/api/documents/${docId}/parent`, {
        parentDocumentId: parentId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Dokument verschoben" });
      setDragDoc(null);
    },
    onError: (err: any) =>
      toast({
        title: "Fehler",
        description: err.message,
        variant: "destructive",
      }),
  });

  const [stammbaum, setStammbaum] = useState<
    (Document & { _level: number })[] | null
  >(null);
  const [stammbaumDocId, setStammbaumDocId] = useState<number | null>(null);
  const [dragDoc, setDragDoc] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const didDragRef = { current: false };

  const customerMap = new Map(customers?.map((c) => [c.id, c]) || []);

  const docs = paginatedDocs?.data || [];
  const total = paginatedDocs?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  const getRelatedDocs = (doc: Document) => {
    const related: Document[] = [];
    if (doc.parentDocumentId) {
      const parent = docs.find((d) => d.id === doc.parentDocumentId);
      if (parent) related.push(parent);
    }
    const children = docs.filter((d) => d.parentDocumentId === doc.id);
    related.push(...children);
    return related;
  };

  const showStammbaum = async (docId: number) => {
    if (stammbaumDocId === docId) {
      setStammbaumDocId(null);
      setStammbaum(null);
      return;
    }
    try {
      const res = await fetch(`/api/documents/${docId}/stammbaum`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setStammbaum(data);
        setStammbaumDocId(docId);
      }
    } catch {}
  };

  const handleDragStart = (e: React.DragEvent, docId: number) => {
    didDragRef.current = true;
    setDragDoc(docId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(docId));
  };

  const handleDragOver = (e: React.DragEvent, targetDocId: number) => {
    e.preventDefault();
    if (dragDoc && dragDoc !== targetDocId) {
      setDragOver(targetDocId);
      e.dataTransfer.dropEffect = "move";
    }
  };

  const handleDrop = (e: React.DragEvent, targetDocId: number) => {
    e.preventDefault();
    setDragOver(null);
    if (dragDoc && dragDoc !== targetDocId) {
      moveDocMutation.mutate({ docId: dragDoc, parentId: targetDocId });
    }
  };

  const handleDropFreistellen = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    if (dragDoc) {
      moveDocMutation.mutate({ docId: dragDoc, parentId: null });
    }
  };

  const statusColors: Record<string, string> = {
    entwurf: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    gesendet: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    abgelehnt: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    beauftragt:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    teilbezahlt:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    bezahlt:
      "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    storniert: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    archiviert:
      "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  };

  const handlePastePositions = useCallback(
    async (documentId: number, items: CopiedPosition[]) => {
      try {
        const existingRes = await fetch(`/api/documents/${documentId}/items`, {
          credentials: "include",
        });
        const existingItems = existingRes.ok ? await existingRes.json() : [];
        let sortOrder = existingItems.length;

        for (const item of items) {
          await apiRequest("POST", `/api/documents/${documentId}/items`, {
            documentId,
            type: item.type,
            positionNumber: "",
            title: item.title,
            description: item.description,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            laborPrice: item.laborPrice,
            materialPrice: item.materialPrice,
            sortOrder: sortOrder++,
          });
        }
        queryClient.invalidateQueries({
          queryKey: ["/api/documents", documentId, "items"],
        });
        queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
        toast({ title: `${items.length} Position(en) eingefügt` });
      } catch (err: any) {
        toast({
          title: "Fehler beim Einfügen",
          description: err.message,
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-base font-bold tracking-tight"
            data-testid="text-documents-title"
          >
            Dokumentbearbeitung
          </h1>
          <p className="text-[10px] text-muted-foreground">
            {total.toLocaleString("de-DE")} Dokumente
            {copiedPositions.length > 0 && (
              <span className="ml-2 text-blue-600 font-medium">
                · {copiedPositions.length} Pos. in Zwischenablage
              </span>
            )}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              className="h-7 text-xs"
              data-testid="button-new-document"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Neues Dokument
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Dokumenttyp wählen</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {documentCreateTypes.map((type) => (
              <DropdownMenuItem
                key={type}
                onClick={() => setLocation(buildNewDocumentUrl(type))}
                data-testid={`menu-new-document-${type}`}
              >
                <FileText className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                {documentTypeLabels[type] || type}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            className="pl-7 h-7 text-xs"
            placeholder="Nr., Betreff, Kunde..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-documents"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger
            className="w-[140px] h-7 text-xs"
            data-testid="select-type-filter"
          >
            <SelectValue placeholder="Alle Typen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Typen</SelectItem>
            {Object.entries(documentTypeLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="h-6 bg-muted/30 border-b-2">
                  <TableHead className="w-5 text-[9px] py-1 font-semibold uppercase tracking-wide"></TableHead>
                  <TableHead className="w-24 text-[9px] py-1 font-semibold uppercase tracking-wide">
                    NR.
                  </TableHead>
                  <TableHead className="w-14 text-[9px] py-1 font-semibold uppercase tracking-wide">
                    TYP
                  </TableHead>
                  <TableHead className="text-[9px] py-1 font-semibold uppercase tracking-wide">
                    BETREFF
                  </TableHead>
                  <TableHead className="hidden md:table-cell w-36 text-[9px] py-1 font-semibold uppercase tracking-wide">
                    KUNDE
                  </TableHead>
                  <TableHead className="hidden md:table-cell w-20 text-[9px] py-1 font-semibold uppercase tracking-wide">
                    DATUM
                  </TableHead>
                  <TableHead className="text-right w-28 text-[9px] py-1 font-semibold uppercase tracking-wide">
                    NETTO
                  </TableHead>
                  <TableHead className="w-20 text-[9px] py-1 font-semibold uppercase tracking-wide">
                    STATUS
                  </TableHead>
                  <TableHead className="w-6 text-[9px] py-1 text-center">
                    <GitBranch className="h-3 w-3 mx-auto text-muted-foreground" />
                  </TableHead>
                  <TableHead className="text-right w-10 text-[9px] py-1 font-semibold uppercase tracking-wide">
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dragDoc && (
                  <TableRow
                    className="bg-green-50 dark:bg-green-950/20 border-2 border-dashed border-green-300"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={handleDropFreistellen}
                  >
                    <TableCell
                      colSpan={10}
                      className="text-center text-xs text-green-700 dark:text-green-400 py-2"
                    >
                      ↗ Hier ablegen = Dokument freistellen (aus Stammbaum
                      lösen)
                    </TableCell>
                  </TableRow>
                )}
                {docs.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="text-center text-muted-foreground py-8"
                    >
                      Keine Dokumente gefunden
                    </TableCell>
                  </TableRow>
                )}
                {docs.map((d) => {
                  const hasChildren = docs.some(
                    (c) => c.parentDocumentId === d.id,
                  );
                  const hasParent = !!d.parentDocumentId;
                  const hasStammbaum = hasChildren || hasParent;
                  const isDragTarget = dragOver === d.id;
                  return (
                    <ContextMenu key={d.id}>
                      <ContextMenuTrigger asChild>
                    <TableRow
                      className={`cursor-pointer h-7 text-[11px] hover:bg-muted/30 transition-colors ${isDragTarget ? "ring-2 ring-inset ring-blue-400 bg-blue-50/50 dark:bg-blue-950/30" : ""}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, d.id)}
                      onDragOver={(e) => handleDragOver(e, d.id)}
                      onDrop={(e) => handleDrop(e, d.id)}
                      onDragEnd={() => {
                        setDragDoc(null);
                        setDragOver(null);
                        setTimeout(() => { didDragRef.current = false; }, 0);
                      }}
                      onClick={(e) => {
                        if (didDragRef.current) { didDragRef.current = false; return; }
                        const t = e.target as HTMLElement;
                        if (t.closest("button, [role='menuitem'], [data-radix-collection-item]")) return;
                        setLocation(`/dokumente/${d.id}/bearbeiten`);
                      }}
                      data-testid={`row-document-${d.id}`}
                    >
                      <TableCell className="py-1 px-1 cursor-grab active:cursor-grabbing">
                        <GripVertical className="h-3 w-3 text-muted-foreground/40" />
                      </TableCell>
                      <TableCell
                        className="font-mono text-[11px] py-1"
                        data-testid={`text-docnr-${d.id}`}
                      >
                        {fmtDocNumber(d.documentNumber)}
                      </TableCell>
                      <TableCell className="py-1 w-14">
                        <span
                          className={`inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded ${docTypeBadge[d.type] || "bg-gray-100 text-gray-600"}`}
                        >
                          {docTypeShort[d.type] ||
                            d.type.slice(0, 3).toUpperCase()}
                        </span>
                      </TableCell>
                      <TableCell
                        className="max-w-[250px] truncate text-[11px] py-1"
                        data-testid={`text-subject-${d.id}`}
                      >
                        {hasParent && (
                          <span className="text-muted-foreground text-[10px] mr-1">
                            ↳
                          </span>
                        )}
                        {d.subject || "-"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-[11px] truncate max-w-[180px] py-1">
                        {d.customerId ? (
                          <CustomerHoverCard customerId={d.customerId}>
                            <button
                              className="text-left hover:text-primary hover:underline transition-colors truncate"
                              onClick={(e) => { e.stopPropagation(); setLocation(`/adressen?selected=${d.customerId}`); }}
                              data-testid={`link-customer-${d.customerId}`}
                            >
                              {customerMap.get(d.customerId)?.name || "-"}
                            </button>
                          </CustomerHoverCard>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-[11px] py-1 whitespace-nowrap">
                        {fmtDate(d.date)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[11px] py-1 whitespace-nowrap">
                        {fmtCurrency(d.netTotal)}
                      </TableCell>
                      <TableCell className="py-1">
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${statusColors[d.status] || "bg-gray-100 text-gray-600"}`}
                        >
                          {documentStatusLabels[d.status] || d.status}
                        </span>
                      </TableCell>
                      <TableCell className="py-1 text-center">
                        {hasStammbaum ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    showStammbaum(d.id);
                                  }}
                                  className={`p-0.5 rounded hover:bg-accent ${stammbaumDocId === d.id ? "bg-accent text-primary" : "text-muted-foreground"}`}
                                  data-testid={`button-stammbaum-${d.id}`}
                                >
                                  <GitBranch className="h-3 w-3" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="text-xs">
                                Stammbaum anzeigen
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right py-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              data-testid={`button-actions-${d.id}`}
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel className="text-[10px]">
                              {fmtDocNumber(d.documentNumber)} · {documentTypeLabels[d.type] || d.type}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-xs gap-2 cursor-pointer"
                              onClick={() => setLocation(`/dokumente/${d.id}/bearbeiten`)}
                              data-testid={`dd-edit-${d.id}`}
                            >
                              <Pencil className="h-3 w-3" />
                              Bearbeiten
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-xs gap-2 cursor-pointer"
                              onClick={() => setLocation(`/dokumente/${d.id}`)}
                              data-testid={`dd-view-${d.id}`}
                            >
                              <Eye className="h-3 w-3" />
                              Vorschau
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-xs gap-2 cursor-pointer"
                              onClick={() => { setAssignDocId(d.id); setAssignDialogOpen(true); }}
                              data-testid={`dd-assign-project-${d.id}`}
                            >
                              <FolderPlus className="h-3 w-3" />
                              Projekt zuordnen
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-xs gap-2 cursor-pointer"
                              onClick={() => duplicateDoc(d)}
                              data-testid={`dd-duplicate-${d.id}`}
                            >
                              <Copy className="h-3 w-3" />
                              Duplizieren
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-[10px] text-muted-foreground font-normal">
                              Umwandeln in…
                            </DropdownMenuLabel>
                            {([
                              ["angebot", "Angebot"],
                              ["auftragsbestaetigung", "AB"],
                              ["abschlagsrechnung", "AR"],
                              ["rechnung", "Rechnung"],
                              ["gutschrift", "Gutschrift"],
                              ["lieferschein", "LS"],
                              ["freies_dokument", "FD"],
                            ] as [string, string][]).filter(([t]) => t !== d.type).map(([targetType, label]) => (
                              <DropdownMenuItem
                                key={targetType}
                                className="text-xs cursor-pointer pl-6"
                                onClick={() => convertMutation.mutate({ id: d.id, targetType })}
                                data-testid={`dd-convert-to-${targetType}-${d.id}`}
                              >
                                <span className={`text-[9px] font-bold px-1 rounded mr-2 ${docTypeBadge[targetType] || "bg-gray-100 text-gray-600"}`}>
                                  {docTypeShort[targetType]}
                                </span>
                                {documentTypeLabels[targetType]}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-[10px] text-muted-foreground font-normal">
                              Status ändern
                            </DropdownMenuLabel>
                            {Object.entries(documentStatusLabels).map(([key, label]) => (
                              <DropdownMenuItem
                                key={key}
                                className={`text-xs cursor-pointer pl-6 ${d.status === key ? "font-bold" : ""}`}
                                onClick={() => statusChangeMut.mutate({ docId: d.id, status: key })}
                                data-testid={`dd-status-${key}-${d.id}`}
                              >
                                {label}
                                {d.status === key && " ✓"}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-xs gap-2 text-destructive focus:text-destructive cursor-pointer"
                              onClick={() => setDeleteDoc(d)}
                              data-testid={`dd-delete-${d.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
                              Löschen
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-56">
                        <ContextMenuLabel className="text-[10px]">
                          {fmtDocNumber(d.documentNumber)} · {documentTypeLabels[d.type] || d.type}
                        </ContextMenuLabel>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          className="text-xs gap-2"
                          onSelect={() => setLocation(`/dokumente/${d.id}/bearbeiten`)}
                          data-testid={`ctx-edit-${d.id}`}
                        >
                          <Pencil className="h-3 w-3" />
                          Bearbeiten
                        </ContextMenuItem>
                        <ContextMenuItem
                          className="text-xs gap-2"
                          onSelect={() => setLocation(`/dokumente/${d.id}`)}
                          data-testid={`ctx-view-${d.id}`}
                        >
                          <Eye className="h-3 w-3" />
                          Vorschau
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          className="text-xs gap-2"
                          onSelect={() => {
                            setAssignDocId(d.id);
                            setAssignDialogOpen(true);
                          }}
                          data-testid={`ctx-assign-project-${d.id}`}
                        >
                          <FolderPlus className="h-3 w-3" />
                          Projekt zuordnen
                        </ContextMenuItem>
                        <ContextMenuItem
                          className="text-xs gap-2"
                          onSelect={() => duplicateDoc(d)}
                          data-testid={`ctx-duplicate-${d.id}`}
                        >
                          <Copy className="h-3 w-3" />
                          Duplizieren
                        </ContextMenuItem>
                        <ContextMenuSub>
                          <ContextMenuSubTrigger className="text-xs gap-2" data-testid={`ctx-convert-${d.id}`}>
                            <ArrowRightLeft className="h-3 w-3" />
                            Umwandeln in…
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent className="w-52">
                            {([
                              ["angebot", "Angebot"],
                              ["auftragsbestaetigung", "Auftragsbestätigung"],
                              ["abschlagsrechnung", "Abschlagsrechnung"],
                              ["rechnung", "Rechnung"],
                              ["gutschrift", "Gutschrift"],
                              ["lieferschein", "Lieferschein"],
                              ["mitschnitt", "Mitschnitt"],
                              ["freies_dokument", "Freies Dokument"],
                            ] as [string, string][]).filter(([t]) => t !== d.type).map(([targetType, label]) => (
                              <ContextMenuItem
                                key={targetType}
                                className="text-xs cursor-pointer"
                                onSelect={() => convertMutation.mutate({ id: d.id, targetType })}
                                data-testid={`ctx-convert-to-${targetType}-${d.id}`}
                              >
                                <span className={`text-[9px] font-bold px-1 rounded mr-2 ${docTypeBadge[targetType] || "bg-gray-100 text-gray-600"}`}>
                                  {docTypeShort[targetType]}
                                </span>
                                {label}
                              </ContextMenuItem>
                            ))}
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuSub>
                          <ContextMenuSubTrigger className="text-xs gap-2" data-testid={`ctx-status-${d.id}`}>
                            <RefreshCw className="h-3 w-3" />
                            Status ändern
                          </ContextMenuSubTrigger>
                          <ContextMenuSubContent className="w-44">
                            {Object.entries(documentStatusLabels).map(([key, label]) => (
                              <ContextMenuItem
                                key={key}
                                className={`text-xs cursor-pointer ${d.status === key ? "font-bold" : ""}`}
                                onSelect={() => statusChangeMut.mutate({ docId: d.id, status: key })}
                                data-testid={`ctx-status-${key}-${d.id}`}
                              >
                                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${statusColors[key]?.split(" ")[0] || "bg-gray-200"}`} />
                                {label}
                                {d.status === key && " ✓"}
                              </ContextMenuItem>
                            ))}
                          </ContextMenuSubContent>
                        </ContextMenuSub>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          className="text-xs gap-2 text-destructive focus:text-destructive"
                          onSelect={() => setDeleteDoc(d)}
                          data-testid={`ctx-delete-${d.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                          Löschen
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {stammbaum && stammbaum.length > 0 && (
        <Card className="border-primary/30">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <GitBranch className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold">Dokumenten-Stammbaum</span>
              <span className="text-xs text-muted-foreground">
                ({stammbaum.length} Dokumente)
              </span>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px]"
                onClick={() => {
                  setStammbaum(null);
                  setStammbaumDocId(null);
                }}
                data-testid="button-close-stammbaum"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-0.5">
              {stammbaum.map((sd: any) => {
                const isActive = sd.id === stammbaumDocId;
                return (
                  <div
                    key={sd.id}
                    className={`flex items-center gap-2 p-1.5 rounded text-xs transition-colors ${isActive ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-accent"}`}
                    style={{ paddingLeft: `${(sd._level || 0) * 24 + 8}px` }}
                    draggable
                    onDragStart={(e) => handleDragStart(e, sd.id)}
                    onDragOver={(e) => handleDragOver(e, sd.id)}
                    onDrop={(e) => handleDrop(e, sd.id)}
                    onDragEnd={() => {
                      setDragDoc(null);
                      setDragOver(null);
                    }}
                    data-testid={`stammbaum-doc-${sd.id}`}
                  >
                    <GripVertical className="h-3 w-3 text-muted-foreground/40 cursor-grab" />
                    {(sd._level || 0) > 0 && (
                      <span className="text-muted-foreground">↳</span>
                    )}
                    <Badge variant="secondary" className="text-[9px] px-1 py-0">
                      {documentTypeLabels[sd.type] || sd.type}
                    </Badge>
                    <span className="font-mono font-medium">
                      {fmtDocNumber(sd.documentNumber)}
                    </span>
                    <span className="text-muted-foreground truncate flex-1">
                      {sd.subject || ""}
                    </span>
                    <Badge
                      variant="secondary"
                      className={`text-[9px] px-1 py-0 ${statusColors[sd.status] || ""}`}
                    >
                      {documentStatusLabels[sd.status] || sd.status}
                    </Badge>
                    <span className="text-muted-foreground font-mono">
                      {fmtCurrency(sd.netTotal)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() =>
                        setLocation(`/dokumente/${sd.id}/bearbeiten`)
                      }
                      data-testid={`stammbaum-edit-${sd.id}`}
                    >
                      <Pencil className="h-2.5 w-2.5" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          title="Kopie erstellen als..."
                          disabled={convertMutation.isPending}
                          data-testid={`stammbaum-convert-${sd.id}`}
                        >
                          <RefreshCw className="h-2.5 w-2.5 text-amber-600" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="text-xs w-48">
                        <DropdownMenuLabel className="text-[10px] text-muted-foreground font-normal">
                          Kopie erstellen als...
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {[
                          ["angebot", "Angebot"],
                          ["auftragsbestaetigung", "AB"],
                          ["abschlagsrechnung", "Abschlagsrechnung"],
                          ["rechnung", "Rechnung"],
                          ["gutschrift", "Gutschrift"],
                          ["lieferschein", "Lieferschein"],
                          ["mitschnitt", "Mitschnitt"],
                          ["freies_dokument", "Freies Dokument"],
                        ]
                          .map(([targetType, label]) => (
                            <DropdownMenuItem
                              key={targetType}
                              className="text-xs cursor-pointer"
                              onClick={() =>
                                convertMutation.mutate({
                                  id: sd.id,
                                  targetType,
                                })
                              }
                            >
                              {label}{targetType === sd.type ? " (Kopie)" : ""}
                            </DropdownMenuItem>
                          ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 italic">
              Dokumente per Drag & Drop im Stammbaum verschieben. ↺-Icon = Kopie
              als anderen Typ erstellen (Original bleibt erhalten).
            </p>
          </CardContent>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            Seite {page} von {totalPages} ({total} Dokumente)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Zurück
            </Button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i + 1;
              } else if (page <= 4) {
                pageNum = i + 1;
              } else if (page >= totalPages - 3) {
                pageNum = totalPages - 6 + i;
              } else {
                pageNum = page - 3 + i;
              }
              return (
                <Button
                  key={pageNum}
                  variant={pageNum === page ? "default" : "outline"}
                  size="sm"
                  className="w-8 h-8 p-0"
                  onClick={() => setPage(pageNum)}
                  data-testid={`button-page-${pageNum}`}
                >
                  {pageNum}
                </Button>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              data-testid="button-next-page"
            >
              Weiter
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={assignDialogOpen} onOpenChange={(o) => { setAssignDialogOpen(o); if (!o) { setAssignDocId(null); setAssignSelectedProject(null); setAssignProjectSearch(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Projekt zuordnen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs mb-1 block">Projekt suchen</Label>
              <Input
                className="h-7 text-xs"
                placeholder="Projektname oder Nummer..."
                value={assignProjectSearch}
                onChange={(e) => setAssignProjectSearch(e.target.value)}
                autoFocus
                data-testid="input-assign-project-search"
              />
            </div>
            <div className="max-h-[250px] overflow-y-auto border rounded">
              {(projects || [])
                .filter((p) => {
                  if (!assignProjectSearch) return true;
                  const s = assignProjectSearch.toLowerCase();
                  return p.name.toLowerCase().includes(s) || (p.projectNumber || "").toLowerCase().includes(s);
                })
                .slice(0, 50)
                .map((p) => (
                  <div
                    key={p.id}
                    className={`px-2 py-1.5 text-xs cursor-pointer hover:bg-accent flex items-center gap-2 border-b last:border-0 ${assignSelectedProject === p.id ? "bg-blue-100 dark:bg-blue-900" : ""}`}
                    onClick={() => setAssignSelectedProject(p.id)}
                    data-testid={`assign-project-option-${p.id}`}
                  >
                    <span className="font-mono text-[10px] text-muted-foreground shrink-0">{fmtDocNumber(p.projectNumber)}</span>
                    <span className="truncate">{p.name}</span>
                  </div>
                ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAssignDialogOpen(false)}>Abbrechen</Button>
            <Button
              size="sm"
              disabled={!assignSelectedProject || assignToProjectMut.isPending}
              onClick={() => {
                if (assignDocId && assignSelectedProject) {
                  assignToProjectMut.mutate({ docId: assignDocId, projectId: assignSelectedProject });
                }
              }}
              data-testid="button-confirm-assign-project"
            >
              <FolderPlus className="h-3.5 w-3.5 mr-1" />
              Zuordnen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteDoc}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setDeleteDoc(null);
        }}
      >
        <DialogContent className="max-w-[430px] overflow-hidden border-slate-200 p-0 shadow-2xl" data-testid="dialog-delete-document">
          <div className="bg-[linear-gradient(112deg,#07111f_0%,#0f2f3f_55%,#0b7a75_100%)] px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-white/15 bg-white/10">
                <AlertTriangle className="h-5 w-5 text-amber-200" />
              </div>
              <DialogHeader className="space-y-0 text-left">
                <DialogTitle className="text-base text-white">Dokument löschen?</DialogTitle>
                <div className="text-xs text-cyan-50/75">Diese Aktion entfernt das Dokument dauerhaft aus der Liste.</div>
              </DialogHeader>
            </div>
          </div>
          <div className="space-y-3 px-5 py-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <span className="font-semibold text-slate-950">
                {deleteDoc ? `${documentTypeLabels[deleteDoc.type] || deleteDoc.type} ${fmtDocNumber(deleteDoc.documentNumber)}` : "Dokument"}
              </span>
              {deleteDoc?.subject ? ` - ${deleteDoc.subject}` : ""} wirklich löschen?
            </div>
            <p className="text-xs text-slate-500">
              Verknüpfungen im Projektbaum werden ebenfalls entfernt. Diese Aktion kann nicht automatisch rückgängig gemacht werden.
            </p>
          </div>
          <DialogFooter className="border-t border-slate-100 bg-slate-50 px-5 py-3">
            <Button
              variant="outline"
              onClick={() => setDeleteDoc(null)}
              disabled={deleteMutation.isPending}
              data-testid="button-cancel-delete-document"
            >
              Abbrechen
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => deleteDoc && deleteMutation.mutate(deleteDoc.id)}
              disabled={!deleteDoc || deleteMutation.isPending}
              data-testid="button-confirm-delete-document"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {deleteMutation.isPending ? "Löscht..." : "Löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
