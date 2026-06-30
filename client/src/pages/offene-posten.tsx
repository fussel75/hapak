import { Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState, useMemo } from "react";
import { fmtCurrency, fmtDate, fmtDocNumber } from "@/lib/format";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  AlertTriangle, FileText, Search, TrendingDown, Euro, Clock, Filter,
  ChevronDown, ChevronUp, ArrowRight, Mail, Play, Gavel, ShieldAlert,
  History, Ban, CheckCircle2
} from "lucide-react";
import { documentTypeLabels } from "@shared/schema";

interface DunningEntry {
  id: number;
  documentId: number;
  level: number;
  date: string;
  dueDate: string | null;
  fee: string;
  text: string | null;
  status: string;
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
  dunningEntries: DunningEntry[];
  noReminder: boolean;
}

interface OpenItemsResponse {
  items: OpenItem[];
  summary: {
    count: number;
    totalOpen: string;
    overdueCount: number;
    totalOverdue: string;
  };
}

export default function OffenePostenPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("alle");
  const [sortField, setSortField] = useState<string>("overdueDays");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [dunningDialogOpen, setDunningDialogOpen] = useState(false);
  const [dunningDoc, setDunningDoc] = useState<OpenItem | null>(null);
  const [dunningLevel, setDunningLevel] = useState("1");
  const [dunningFee, setDunningFee] = useState("5,00");
  const [dunningText, setDunningText] = useState("");

  const [batchDialogOpen, setBatchDialogOpen] = useState(false);

  const { data, isLoading } = useQuery<OpenItemsResponse>({
    queryKey: ["/api/open-items"],
  });

  const items = data?.items || [];
  const summary = data?.summary;

  const filtered = items.filter(item => {
    if (filterStatus === "ueberfaellig" && item.overdueDays <= 0) return false;
    if (filterStatus === "offen" && item.overdueDays > 0) return false;
    if (filterStatus === "gemahnt" && item.dunningLevel === 0) return false;
    if (filterStatus === "ungemahnt" && (item.dunningLevel > 0 || item.overdueDays <= 0)) return false;
    if (search) {
      const q = search.toLowerCase();
      return item.customerName.toLowerCase().includes(q)
        || item.documentNumber.toLowerCase().includes(q)
        || item.customerNumber.toLowerCase().includes(q)
        || (item.subject || "").toLowerCase().includes(q);
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case "overdueDays": cmp = a.overdueDays - b.overdueDays; break;
      case "openAmount": cmp = parseFloat(a.openAmount) - parseFloat(b.openAmount); break;
      case "dueDate": cmp = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(); break;
      case "customerName": cmp = a.customerName.localeCompare(b.customerName); break;
      case "documentNumber": cmp = a.documentNumber.localeCompare(b.documentNumber); break;
      case "dunningLevel": cmp = a.dunningLevel - b.dunningLevel; break;
      default: cmp = a.overdueDays - b.overdueDays;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortDir === "desc" ? <ChevronDown className="h-3 w-3 ml-1 inline" /> : <ChevronUp className="h-3 w-3 ml-1 inline" />;
  };

  const getOverdueColor = (days: number) => {
    if (days > 30) return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    if (days > 14) return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
    if (days > 0) return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
  };

  const getDunningBadge = (level: number) => {
    if (level === 0) return null;
    const colors: Record<number, string> = {
      1: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
      2: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
      3: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    };
    const labels: Record<number, string> = { 1: "1. Mahnung", 2: "2. Mahnung", 3: "3. Mahnung" };
    return (
      <Badge className={`text-xs ${colors[level] || colors[3]}`}>
        {labels[level] || `Stufe ${level}`}
      </Badge>
    );
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllOverdue = () => {
    const overdueIds = sorted
      .filter(i => i.overdueDays > 0 && !i.noReminder && i.dunningLevel < 3)
      .map(i => i.id);
    setSelectedIds(new Set(overdueIds));
  };

  const dunningMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/dunning-entries", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/open-items"] });
      setDunningDialogOpen(false);
      toast({ title: "Mahnung erstellt", description: `Mahnung Stufe ${dunningLevel} wurde erstellt.` });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const batchDunningMutation = useMutation({
    mutationFn: async (docIds: number[]) => {
      const res = await apiRequest("POST", "/api/dunning-run", { documentIds: docIds });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/open-items"] });
      setBatchDialogOpen(false);
      setSelectedIds(new Set());
      toast({ title: "Mahnlauf abgeschlossen", description: `${data.processed} Mahnungen wurden erstellt.` });
    },
    onError: (err: any) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const openSingleDunning = (item: OpenItem) => {
    setDunningDoc(item);
    const nextLevel = Math.min(item.dunningLevel + 1, 3);
    setDunningLevel(String(nextLevel));
    const fees: Record<number, string> = { 1: "5,00", 2: "10,00", 3: "25,00" };
    setDunningFee(fees[nextLevel] || "5,00");
    const texts: Record<number, string> = {
      1: "Zahlungserinnerung",
      2: "2. Mahnung - Wir bitten um umgehende Zahlung",
      3: "Letzte Mahnung vor gerichtlichem Mahnverfahren",
    };
    setDunningText(texts[nextLevel] || "");
    setDunningDialogOpen(true);
  };

  const handleDunningSave = () => {
    if (!dunningDoc) return;
    const fee = parseFloat(dunningFee.replace(",", "."));
    if (isNaN(fee)) {
      toast({ title: "Fehler", description: "Bitte gültige Mahngebühr eingeben", variant: "destructive" });
      return;
    }
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);
    dunningMutation.mutate({
      documentId: dunningDoc.id,
      level: parseInt(dunningLevel),
      date: new Date().toISOString().slice(0, 10),
      fee: fee.toFixed(2),
      text: dunningText || `Mahnung Stufe ${dunningLevel}`,
      dueDate: dueDate.toISOString().slice(0, 10),
    });
  };

  const batchEligible = useMemo(() => {
    return sorted.filter(i => selectedIds.has(i.id) && !i.noReminder && i.dunningLevel < 3);
  }, [sorted, selectedIds]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-op-title">Offene Posten & Mahnwesen</h1>
          <p className="text-muted-foreground">Übersicht aller unbezahlten Rechnungen mit Fälligkeiten und Mahnverwaltung</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={selectAllOverdue}
            data-testid="button-select-overdue"
          >
            <ShieldAlert className="h-4 w-4 mr-1" />
            Alle Überfälligen
          </Button>
          <Button
            size="sm"
            onClick={() => setBatchDialogOpen(true)}
            disabled={selectedIds.size === 0}
            data-testid="button-mahnlauf"
          >
            <Play className="h-4 w-4 mr-1" />
            Mahnlauf ({selectedIds.size})
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-op-count">{summary?.count || 0}</p>
                <p className="text-xs text-muted-foreground">Offene Rechnungen</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <Euro className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums" data-testid="text-op-total">{fmtCurrency(summary?.totalOpen || "0")}</p>
                <p className="text-xs text-muted-foreground">Gesamt offen</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-op-overdue-count">{summary?.overdueCount || 0}</p>
                <p className="text-xs text-muted-foreground">Überfällig</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <TrendingDown className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums" data-testid="text-op-overdue-total">{fmtCurrency(summary?.totalOverdue || "0")}</p>
                <p className="text-xs text-muted-foreground">Überfällig Betrag</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              OP-Liste ({sorted.length})
            </CardTitle>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 h-8 w-64"
                  placeholder="Kunde, Rechnungsnr. suchen..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="input-op-search"
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 w-44" data-testid="select-op-filter">
                  <Filter className="h-3.5 w-3.5 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle</SelectItem>
                  <SelectItem value="ueberfaellig">Überfällig</SelectItem>
                  <SelectItem value="offen">Noch nicht fällig</SelectItem>
                  <SelectItem value="gemahnt">Bereits gemahnt</SelectItem>
                  <SelectItem value="ungemahnt">Überfällig ungemahnt</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Euro className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Keine offenen Posten</p>
              <p className="text-sm mt-1">Alle Rechnungen sind bezahlt.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={sorted.length > 0 && sorted.every(i => selectedIds.has(i.id))}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedIds(new Set(sorted.map(i => i.id)));
                          } else {
                            setSelectedIds(new Set());
                          }
                        }}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("documentNumber")} data-testid="th-docnr">
                      Rechnungs-Nr.<SortIcon field="documentNumber" />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("customerName")} data-testid="th-customer">
                      Kunde<SortIcon field="customerName" />
                    </TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort("dueDate")} data-testid="th-due">
                      Fällig am<SortIcon field="dueDate" />
                    </TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort("openAmount")} data-testid="th-open">
                      Offen<SortIcon field="openAmount" />
                    </TableHead>
                    <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort("overdueDays")} data-testid="th-overdue">
                      Überfällig<SortIcon field="overdueDays" />
                    </TableHead>
                    <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort("dunningLevel")} data-testid="th-mahnstufe">
                      Mahnstufe<SortIcon field="dunningLevel" />
                    </TableHead>
                    <TableHead className="w-28"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((item) => (
                    <Fragment key={item.id}>
                      <TableRow
                        className={`${item.overdueDays > 30 ? "bg-red-50/50 dark:bg-red-950/10" : item.overdueDays > 0 ? "bg-amber-50/30 dark:bg-amber-950/10" : ""} ${selectedIds.has(item.id) ? "ring-1 ring-primary/30" : ""}`}
                        data-testid={`row-op-${item.id}`}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(item.id)}
                            onCheckedChange={() => toggleSelect(item.id)}
                            data-testid={`checkbox-op-${item.id}`}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm font-medium" data-testid={`text-op-docnr-${item.id}`}>
                          <a
                            className="hover:text-primary hover:underline cursor-pointer"
                            onClick={() => setLocation(`/dokumente/${item.id}/bearbeiten`)}
                          >{fmtDocNumber(item.documentNumber)}</a>
                        </TableCell>
                        <TableCell>
                          <div>
                            <a
                              className="font-medium hover:text-primary hover:underline cursor-pointer"
                              onClick={() => setLocation(`/adressen?search=${encodeURIComponent(item.customerNumber)}`)}
                              data-testid={`text-op-customer-${item.id}`}
                            >{item.customerName}</a>
                            <span className="text-xs text-muted-foreground ml-2">({item.customerNumber})</span>
                            {item.noReminder && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                <Ban className="h-3 w-3 mr-1" />Mahnsperre
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">{fmtDate(item.dueDate)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium" data-testid={`text-op-open-${item.id}`}>
                          {fmtCurrency(item.openAmount)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={`text-xs ${getOverdueColor(item.overdueDays)}`} data-testid={`badge-overdue-${item.id}`}>
                            {item.overdueDays > 0 ? `${item.overdueDays} Tage` : "Frist läuft"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center" data-testid={`text-mahnstufe-${item.id}`}>
                          {getDunningBadge(item.dunningLevel) || <span className="text-xs text-muted-foreground">–</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {item.overdueDays > 0 && !item.noReminder && item.dunningLevel < 3 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => openSingleDunning(item)}
                                title="Mahnung erstellen"
                                data-testid={`button-mahnung-${item.id}`}
                              >
                                <AlertTriangle className="h-4 w-4 text-orange-500" />
                              </Button>
                            )}
                            {item.dunningCount > 0 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                                title="Mahnhistorie"
                                data-testid={`button-history-${item.id}`}
                              >
                                <History className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setLocation(`/dokumente/${item.id}/bearbeiten`)}
                              title="Dokument öffnen"
                              data-testid={`button-op-open-${item.id}`}
                            >
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedId === item.id && item.dunningEntries.length > 0 && (
                        <TableRow key={`history-${item.id}`} className="bg-muted/30">
                          <TableCell colSpan={8}>
                            <div className="py-2 px-4">
                              <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                                <History className="h-3 w-3" /> Mahnhistorie
                              </p>
                              <div className="space-y-1">
                                {item.dunningEntries
                                  .sort((a, b) => b.level - a.level)
                                  .map((entry) => (
                                  <div key={entry.id} className="flex items-center gap-4 text-sm py-1 border-b border-border/50 last:border-0" data-testid={`dunning-entry-${entry.id}`}>
                                    <Badge className={`text-xs ${entry.level >= 3 ? "bg-red-100 text-red-800" : entry.level >= 2 ? "bg-orange-100 text-orange-800" : "bg-yellow-100 text-yellow-800"}`}>
                                      Stufe {entry.level}
                                    </Badge>
                                    <span className="text-muted-foreground">{fmtDate(entry.date)}</span>
                                    <span className="text-muted-foreground">Frist: {entry.dueDate ? fmtDate(entry.dueDate) : "–"}</span>
                                    <span className="tabular-nums">{fmtCurrency(entry.fee)} Gebühr</span>
                                    <span className="text-muted-foreground flex-1 truncate">{entry.text || "–"}</span>
                                    <Badge variant="outline" className="text-xs">
                                      {entry.status === "erstellt" ? "Erstellt" : entry.status === "versendet" ? "Versendet" : entry.status}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {sorted.length > 0 && (
            <div className="mt-4 pt-4 border-t flex justify-between items-center text-sm">
              <span className="text-muted-foreground">
                {sorted.length} offene Posten angezeigt
                {selectedIds.size > 0 && <span className="ml-2 font-medium text-primary">({selectedIds.size} ausgewählt)</span>}
              </span>
              <div className="flex gap-6">
                <span className="text-muted-foreground">
                  Gesamt offen: <span className="font-bold text-foreground tabular-nums" data-testid="text-op-footer-total">
                    {fmtCurrency(sorted.reduce((s, i) => s + parseFloat(i.openAmount), 0))}
                  </span>
                </span>
                {sorted.filter(i => i.overdueDays > 0).length > 0 && (
                  <span className="text-red-600">
                    Davon überfällig: <span className="font-bold tabular-nums">
                      {fmtCurrency(sorted.filter(i => i.overdueDays > 0).reduce((s, i) => s + parseFloat(i.openAmount), 0))}
                    </span>
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dunningDialogOpen} onOpenChange={setDunningDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Mahnung erstellen
            </DialogTitle>
          </DialogHeader>
          {dunningDoc && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <p><span className="text-muted-foreground">Rechnung:</span> <span className="font-mono font-medium">{fmtDocNumber(dunningDoc.documentNumber)}</span></p>
                <p><span className="text-muted-foreground">Kunde:</span> <span className="font-medium">{dunningDoc.customerName}</span></p>
                <p><span className="text-muted-foreground">Offener Betrag:</span> <span className="font-medium tabular-nums">{fmtCurrency(dunningDoc.openAmount)} €</span></p>
                <p><span className="text-muted-foreground">Überfällig:</span> <span className="font-medium text-red-600">{dunningDoc.overdueDays} Tage</span></p>
                {dunningDoc.dunningLevel > 0 && (
                  <p><span className="text-muted-foreground">Bisherige Stufe:</span> {getDunningBadge(dunningDoc.dunningLevel)}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Mahnstufe</Label>
                  <Select value={dunningLevel} onValueChange={setDunningLevel}>
                    <SelectTrigger data-testid="select-dunning-level">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Stufe 1 - Erinnerung</SelectItem>
                      <SelectItem value="2">Stufe 2 - Mahnung</SelectItem>
                      <SelectItem value="3">Stufe 3 - Letzte Mahnung</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Mahngebühr (€)</Label>
                  <Input
                    value={dunningFee}
                    onChange={(e) => setDunningFee(e.target.value)}
                    data-testid="input-dunning-fee"
                  />
                </div>
              </div>

              <div>
                <Label>Mahntext</Label>
                <Textarea
                  value={dunningText}
                  onChange={(e) => setDunningText(e.target.value)}
                  rows={3}
                  data-testid="input-dunning-text"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDunningDialogOpen(false)} data-testid="button-cancel-dunning">Abbrechen</Button>
            <Button onClick={handleDunningSave} disabled={dunningMutation.isPending} data-testid="button-save-dunning">
              {dunningMutation.isPending ? "Wird erstellt..." : "Mahnung erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-primary" />
              Mahnlauf starten
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <p className="font-medium mb-2">{selectedIds.size} Dokumente ausgewählt</p>
              {batchEligible.length < selectedIds.size && (
                <p className="text-amber-600 text-xs">
                  {selectedIds.size - batchEligible.length} Dokumente werden übersprungen (Mahnsperre oder bereits Stufe 3)
                </p>
              )}
              <p className="text-muted-foreground text-xs mt-1">
                Für jedes Dokument wird automatisch die nächste Mahnstufe erstellt.
              </p>
            </div>

            <div className="max-h-60 overflow-y-auto border rounded-lg divide-y">
              {batchEligible.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-3 py-2 text-sm" data-testid={`batch-item-${item.id}`}>
                  <div>
                    <span className="font-mono text-xs">{fmtDocNumber(item.documentNumber)}</span>
                    <span className="ml-2 text-muted-foreground">{item.customerName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-xs">{fmtCurrency(item.openAmount)} €</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <Badge className="text-xs bg-orange-100 text-orange-800">
                      Stufe {Math.min(item.dunningLevel + 1, 3)}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-xs text-muted-foreground">
              Mahngebühren: Stufe 1 = 5,00 € | Stufe 2 = 10,00 € | Stufe 3 = 25,00 €
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDialogOpen(false)} data-testid="button-cancel-batch">Abbrechen</Button>
            <Button
              onClick={() => batchDunningMutation.mutate(batchEligible.map(i => i.id))}
              disabled={batchDunningMutation.isPending || batchEligible.length === 0}
              data-testid="button-start-mahnlauf"
            >
              {batchDunningMutation.isPending ? "Wird verarbeitet..." : `${batchEligible.length} Mahnungen erstellen`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
