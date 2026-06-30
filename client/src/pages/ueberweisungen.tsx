import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { fmtCurrency, fmtDate } from "@/lib/format";
import { validateIban, paymentOrderStatusLabels } from "@shared/schema";
import type { BankPaymentOrder, BankAccount } from "@shared/schema";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Send, Plus, Check, X, Search, ArrowRight, Link2, Unlink, Zap,
  CreditCard, AlertTriangle, Clock, CheckCircle, XCircle, Ban
} from "lucide-react";

interface UnmatchedTransaction {
  reId: number;
  rnr: string;
  adrSuch: string;
  betreff: string;
  belegdat: string;
  zahlung: number;
  betrag: number;
  art: string;
  typ: string;
}

interface OpenInvoice {
  id: number;
  documentNumber: string;
  type: string;
  subject: string;
  grossTotal: number;
  paidAmount: number;
  openAmount: number;
  customerName: string;
}

interface PaymentMatch {
  id: number;
  transactionReId: number;
  documentId: number;
  amount: string;
  matchType: string;
  matchedAt: string;
}

const statusColors: Record<string, string> = {
  entwurf: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  freigegeben: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  uebermittelt: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  ausgefuehrt: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  fehlgeschlagen: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const statusIcons: Record<string, typeof Clock> = {
  entwurf: Clock,
  freigegeben: Check,
  uebermittelt: Send,
  ausgefuehrt: CheckCircle,
  fehlgeschlagen: XCircle,
};

function formatIban(iban: string): string {
  const cleaned = iban.replace(/\s/g, "");
  return cleaned.replace(/(.{4})/g, "$1 ").trim();
}

export default function UeberweisungenPage() {
  const [activeTab, setActiveTab] = useState("ueberweisungen");

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Überweisungen & Zahlungsabgleich</h1>
        <p className="text-muted-foreground">SEPA-Überweisungen verwalten und Zahlungen Rechnungen zuordnen</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="ueberweisungen" data-testid="tab-ueberweisungen">
            <Send className="h-4 w-4 mr-2" />
            Überweisungen
          </TabsTrigger>
          <TabsTrigger value="abgleich" data-testid="tab-abgleich">
            <Link2 className="h-4 w-4 mr-2" />
            Zahlungsabgleich
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ueberweisungen">
          <TransferTab />
        </TabsContent>

        <TabsContent value="abgleich">
          <MatchingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TransferTab() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<string>("");
  const [search, setSearch] = useState("");

  const { data: orders = [], isLoading } = useQuery<BankPaymentOrder[]>({
    queryKey: ["/api/payment-orders"],
  });

  const { data: bankAccounts = [] } = useQuery<BankAccount[]>({
    queryKey: ["/api/bank-accounts"],
  });

  const [formData, setFormData] = useState({
    bankAccountId: "",
    recipientName: "",
    recipientIban: "",
    recipientBic: "",
    amount: "",
    reference: "",
  });
  const [ibanError, setIbanError] = useState("");

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/payment-orders", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-orders"] });
      toast({ title: "Überweisung erstellt", description: "Entwurf wurde angelegt." });
      setShowForm(false);
      resetForm();
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/payment-orders/${id}/approve`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-orders"] });
      toast({ title: "Freigegeben", description: "Überweisung wurde freigegeben." });
      setConfirmId(null);
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const submitMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/payment-orders/${id}/submit`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-orders"] });
      toast({ title: "Übermittelt", description: "Überweisung wurde an die Bank übermittelt." });
      setConfirmId(null);
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/payment-orders/${id}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-orders"] });
      toast({ title: "Storniert", description: "Überweisung wurde storniert." });
      setConfirmId(null);
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/payment-orders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-orders"] });
      toast({ title: "Gelöscht" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const resetForm = () => {
    setFormData({ bankAccountId: "", recipientName: "", recipientIban: "", recipientBic: "", amount: "", reference: "" });
    setIbanError("");
  };

  const handleIbanChange = (value: string) => {
    setFormData(prev => ({ ...prev, recipientIban: value }));
    if (value.replace(/\s/g, "").length >= 15) {
      const result = validateIban(value);
      setIbanError(result.valid ? "" : (result.error || "Ungültige IBAN"));
    } else {
      setIbanError("");
    }
  };

  const handleSubmitForm = () => {
    const result = validateIban(formData.recipientIban);
    if (!result.valid) {
      setIbanError(result.error || "Ungültige IBAN");
      return;
    }
    if (!formData.bankAccountId || !formData.recipientName || !formData.amount || !formData.reference) {
      toast({ title: "Fehler", description: "Bitte alle Pflichtfelder ausfüllen", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      ...formData,
      bankAccountId: parseInt(formData.bankAccountId),
    });
  };

  const handleConfirmAction = () => {
    if (!confirmId) return;
    if (confirmAction === "approve") approveMutation.mutate(confirmId);
    else if (confirmAction === "submit") submitMutation.mutate(confirmId);
    else if (confirmAction === "cancel") cancelMutation.mutate(confirmId);
  };

  const filtered = orders.filter(o => {
    if (!search) return true;
    const q = search.toLowerCase();
    return o.recipientName.toLowerCase().includes(q)
      || o.recipientIban.toLowerCase().includes(q)
      || o.reference.toLowerCase().includes(q);
  });

  const stats = useMemo(() => {
    const total = orders.length;
    const entwurf = orders.filter(o => o.status === "entwurf").length;
    const pending = orders.filter(o => ["freigegeben", "uebermittelt"].includes(o.status)).length;
    const done = orders.filter(o => o.status === "ausgefuehrt").length;
    const totalAmount = orders.filter(o => o.status === "ausgefuehrt").reduce((s, o) => s + parseFloat(String(o.amount)), 0);
    return { total, entwurf, pending, done, totalAmount };
  }, [orders]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30"><CreditCard className="h-5 w-5 text-blue-600" /></div>
            <div>
              <p className="text-2xl font-bold" data-testid="stat-total-orders">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Gesamt</p>
            </div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800"><Clock className="h-5 w-5 text-gray-600" /></div>
            <div>
              <p className="text-2xl font-bold" data-testid="stat-draft-orders">{stats.entwurf}</p>
              <p className="text-xs text-muted-foreground">Entwürfe</p>
            </div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30"><AlertTriangle className="h-5 w-5 text-yellow-600" /></div>
            <div>
              <p className="text-2xl font-bold" data-testid="stat-pending-orders">{stats.pending}</p>
              <p className="text-xs text-muted-foreground">In Bearbeitung</p>
            </div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30"><CheckCircle className="h-5 w-5 text-green-600" /></div>
            <div>
              <p className="text-2xl font-bold tabular-nums" data-testid="stat-done-amount">{fmtCurrency(stats.totalAmount)}</p>
              <p className="text-xs text-muted-foreground">Ausgeführt ({stats.done})</p>
            </div>
          </div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Überweisungen ({filtered.length})
            </CardTitle>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 h-8 w-64"
                  placeholder="Empfänger, IBAN, Verwendungszweck..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="input-search-orders"
                />
              </div>
              <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} data-testid="button-new-order">
                <Plus className="h-4 w-4 mr-1" />Neue Überweisung
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Send className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Keine Überweisungen</p>
              <p className="text-sm mt-1">Erstellen Sie eine neue Überweisung.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empfänger</TableHead>
                    <TableHead>IBAN</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead>Verwendungszweck</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Erstellt</TableHead>
                    <TableHead className="w-32"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((order) => {
                    const StatusIcon = statusIcons[order.status] || Clock;
                    return (
                      <TableRow key={order.id} data-testid={`row-order-${order.id}`}>
                        <TableCell className="font-medium" data-testid={`text-recipient-${order.id}`}>{order.recipientName}</TableCell>
                        <TableCell className="font-mono text-xs" data-testid={`text-iban-${order.id}`}>{formatIban(order.recipientIban)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium" data-testid={`text-amount-${order.id}`}>{fmtCurrency(order.amount)}</TableCell>
                        <TableCell className="max-w-[200px] truncate" data-testid={`text-ref-${order.id}`}>{order.reference}</TableCell>
                        <TableCell className="text-center">
                          <Badge className={`text-xs ${statusColors[order.status] || ""}`} data-testid={`badge-status-${order.id}`}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {paymentOrderStatusLabels[order.status] || order.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{order.createdAt ? fmtDate(new Date(order.createdAt).toISOString().slice(0, 10)) : "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {order.status === "entwurf" && (
                              <>
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Freigeben"
                                  onClick={() => { setConfirmId(order.id); setConfirmAction("approve"); }}
                                  data-testid={`button-approve-${order.id}`}>
                                  <Check className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Löschen"
                                  onClick={() => deleteMutation.mutate(order.id)}
                                  data-testid={`button-delete-${order.id}`}>
                                  <X className="h-4 w-4 text-red-500" />
                                </Button>
                              </>
                            )}
                            {order.status === "freigegeben" && (
                              <>
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="An Bank übermitteln"
                                  onClick={() => { setConfirmId(order.id); setConfirmAction("submit"); }}
                                  data-testid={`button-submit-${order.id}`}>
                                  <Send className="h-4 w-4 text-blue-600" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Stornieren"
                                  onClick={() => { setConfirmId(order.id); setConfirmAction("cancel"); }}
                                  data-testid={`button-cancel-${order.id}`}>
                                  <Ban className="h-4 w-4 text-red-500" />
                                </Button>
                              </>
                            )}
                            {order.status === "uebermittelt" && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Stornieren"
                                onClick={() => { setConfirmId(order.id); setConfirmAction("cancel"); }}
                                data-testid={`button-cancel-${order.id}`}>
                                <Ban className="h-4 w-4 text-red-500" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Neue Überweisung</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Quellkonto *</Label>
              <Select value={formData.bankAccountId} onValueChange={(v) => setFormData(prev => ({ ...prev, bankAccountId: v }))}>
                <SelectTrigger data-testid="select-source-account"><SelectValue placeholder="Konto wählen..." /></SelectTrigger>
                <SelectContent>
                  {bankAccounts.map(a => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.bankName} — {formatIban(a.iban)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Empfänger-Name *</Label>
              <Input value={formData.recipientName} onChange={(e) => setFormData(prev => ({ ...prev, recipientName: e.target.value }))}
                placeholder="Max Mustermann GmbH" data-testid="input-recipient-name" />
            </div>
            <div>
              <Label>Empfänger-IBAN *</Label>
              <Input value={formData.recipientIban} onChange={(e) => handleIbanChange(e.target.value)}
                placeholder="DE89 3704 0044 0532 0130 00" className={ibanError ? "border-red-500" : ""} data-testid="input-recipient-iban" />
              {ibanError && <p className="text-xs text-red-500 mt-1" data-testid="text-iban-error">{ibanError}</p>}
            </div>
            <div>
              <Label>BIC (optional)</Label>
              <Input value={formData.recipientBic} onChange={(e) => setFormData(prev => ({ ...prev, recipientBic: e.target.value }))}
                placeholder="COBADEFFXXX" data-testid="input-recipient-bic" />
            </div>
            <div>
              <Label>Betrag (EUR) *</Label>
              <Input type="number" step="0.01" min="0.01" value={formData.amount}
                onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                placeholder="0,00" data-testid="input-amount" />
            </div>
            <div>
              <Label>Verwendungszweck *</Label>
              <Input value={formData.reference} onChange={(e) => setFormData(prev => ({ ...prev, reference: e.target.value }))}
                placeholder="Rechnung Nr. 25-00123" data-testid="input-reference" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-form">Abbrechen</Button>
            <Button onClick={handleSubmitForm} disabled={createMutation.isPending} data-testid="button-save-order">
              {createMutation.isPending ? "Wird erstellt..." : "Als Entwurf speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmId !== null} onOpenChange={(open) => { if (!open) setConfirmId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction === "approve" && "Überweisung freigeben?"}
              {confirmAction === "submit" && "An Bank übermitteln?"}
              {confirmAction === "cancel" && "Überweisung stornieren?"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmAction === "approve" && "Möchten Sie diese Überweisung freigeben? Sie kann danach an die Bank übermittelt werden."}
            {confirmAction === "submit" && "Möchten Sie diese Überweisung an die Bank übermitteln? Der Betrag wird abgebucht."}
            {confirmAction === "cancel" && "Möchten Sie diese Überweisung stornieren? Dieser Vorgang kann nicht rückgängig gemacht werden."}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmId(null)} data-testid="button-cancel-confirm">Abbrechen</Button>
            <Button
              variant={confirmAction === "cancel" ? "destructive" : "default"}
              onClick={handleConfirmAction}
              disabled={approveMutation.isPending || submitMutation.isPending || cancelMutation.isPending}
              data-testid="button-confirm-action"
            >
              {confirmAction === "approve" && "Freigeben"}
              {confirmAction === "submit" && "Übermitteln"}
              {confirmAction === "cancel" && "Stornieren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MatchingTab() {
  const { toast } = useToast();
  const [selectedTx, setSelectedTx] = useState<number | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<string>("");
  const [matchAmount, setMatchAmount] = useState("");

  const { data: unmatched = [], isLoading: unmatchedLoading } = useQuery<UnmatchedTransaction[]>({
    queryKey: ["/api/unmatched-transactions"],
  });

  const { data: openInvoices = [] } = useQuery<OpenInvoice[]>({
    queryKey: ["/api/open-invoices-for-matching"],
  });

  const { data: matches = [] } = useQuery<PaymentMatch[]>({
    queryKey: ["/api/payment-matches"],
  });

  const autoMatchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/payment-matches/auto");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/unmatched-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/open-invoices-for-matching"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-matches"] });
      toast({ title: "Automatischer Abgleich", description: data.message });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const manualMatchMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/payment-matches/manual", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/unmatched-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/open-invoices-for-matching"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-matches"] });
      toast({ title: "Zuordnung erstellt" });
      setSelectedTx(null);
      setSelectedDoc("");
      setMatchAmount("");
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const unmatchMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/payment-matches/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/unmatched-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/open-invoices-for-matching"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-matches"] });
      toast({ title: "Zuordnung aufgelöst" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const handleManualMatch = () => {
    if (!selectedTx || !selectedDoc) {
      toast({ title: "Fehler", description: "Bitte Transaktion und Rechnung auswählen", variant: "destructive" });
      return;
    }
    const amt = parseFloat(matchAmount);
    if (isNaN(amt) || amt <= 0) {
      toast({ title: "Fehler", description: "Bitte gültigen Betrag eingeben", variant: "destructive" });
      return;
    }
    manualMatchMutation.mutate({
      transactionReId: selectedTx,
      documentId: parseInt(selectedDoc),
      amount: amt.toFixed(2),
    });
  };

  const selectTransaction = (tx: UnmatchedTransaction) => {
    setSelectedTx(tx.reId);
    setMatchAmount(String(tx.zahlung));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-[10px] text-muted-foreground uppercase">Nicht zugeordnet</p>
          <p className="text-2xl font-bold" data-testid="stat-unmatched">{unmatched.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-[10px] text-muted-foreground uppercase">Offene Rechnungen</p>
          <p className="text-2xl font-bold" data-testid="stat-open-invoices">{openInvoices.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-[10px] text-muted-foreground uppercase">Zugeordnet</p>
          <p className="text-2xl font-bold text-green-600" data-testid="stat-matched">{matches.length}</p>
        </CardContent></Card>
      </div>

      <div className="flex gap-2">
        <Button onClick={() => autoMatchMutation.mutate()} disabled={autoMatchMutation.isPending} data-testid="button-auto-match">
          <Zap className="h-4 w-4 mr-1" />
          {autoMatchMutation.isPending ? "Abgleich läuft..." : "Automatischer Abgleich"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Nicht zugeordnete Umsätze ({unmatched.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {unmatchedLoading ? (
              <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : unmatched.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Alle Umsätze zugeordnet</p>
              </div>
            ) : (
              <div className="overflow-y-auto max-h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Datum</TableHead>
                      <TableHead className="text-xs">Absender</TableHead>
                      <TableHead className="text-xs">Verwendungszweck</TableHead>
                      <TableHead className="text-xs text-right">Betrag</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unmatched.map((tx) => (
                      <TableRow
                        key={tx.reId}
                        className={selectedTx === tx.reId ? "bg-primary/5 ring-1 ring-primary/30" : "cursor-pointer hover:bg-muted/50"}
                        onClick={() => selectTransaction(tx)}
                        data-testid={`row-unmatched-${tx.reId}`}
                      >
                        <TableCell className="text-xs">{fmtDate(tx.belegdat)}</TableCell>
                        <TableCell className="text-xs font-medium">{tx.adrSuch || "—"}</TableCell>
                        <TableCell className="text-xs max-w-[150px] truncate">{tx.betreff || tx.rnr}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums font-medium">{fmtCurrency(tx.zahlung)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); selectTransaction(tx); }}
                            data-testid={`button-select-tx-${tx.reId}`}>
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Manuelle Zuordnung
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label className="text-xs">Ausgewählte Transaktion</Label>
                {selectedTx ? (
                  <div className="text-sm p-2 bg-muted/50 rounded mt-1">
                    {(() => {
                      const tx = unmatched.find(t => t.reId === selectedTx);
                      if (!tx) return "Transaktion nicht gefunden";
                      return `${tx.adrSuch || "—"} — ${fmtCurrency(tx.zahlung)} — ${tx.betreff || tx.rnr}`;
                    })()}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">Klicken Sie links auf eine Transaktion</p>
                )}
              </div>

              <div>
                <Label className="text-xs">Rechnung zuordnen</Label>
                <Select value={selectedDoc} onValueChange={setSelectedDoc}>
                  <SelectTrigger className="mt-1" data-testid="select-match-invoice"><SelectValue placeholder="Rechnung auswählen..." /></SelectTrigger>
                  <SelectContent>
                    {openInvoices.map(inv => (
                      <SelectItem key={inv.id} value={String(inv.id)}>
                        {inv.documentNumber} — {inv.customerName} — Offen: {fmtCurrency(inv.openAmount)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Zuordnungsbetrag (EUR)</Label>
                <Input type="number" step="0.01" value={matchAmount} onChange={(e) => setMatchAmount(e.target.value)}
                  className="mt-1" data-testid="input-match-amount" />
              </div>

              <Button className="w-full" onClick={handleManualMatch} disabled={manualMatchMutation.isPending || !selectedTx || !selectedDoc}
                data-testid="button-manual-match">
                <Link2 className="h-4 w-4 mr-2" />
                {manualMatchMutation.isPending ? "Wird zugeordnet..." : "Zuordnung erstellen"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {matches.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              Zugeordnete Zahlungen ({matches.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Transaktion</TableHead>
                  <TableHead className="text-xs">Rechnung</TableHead>
                  <TableHead className="text-xs text-right">Betrag</TableHead>
                  <TableHead className="text-xs text-center">Typ</TableHead>
                  <TableHead className="text-xs">Zugeordnet am</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matches.map((m) => (
                  <TableRow key={m.id} data-testid={`row-match-${m.id}`}>
                    <TableCell className="text-xs font-mono">#{m.transactionReId}</TableCell>
                    <TableCell className="text-xs font-mono">Dok #{m.documentId}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums font-medium">{fmtCurrency(m.amount)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-[10px]">
                        {m.matchType === "auto" ? "Automatisch" : "Manuell"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{m.matchedAt ? fmtDate(new Date(m.matchedAt).toISOString().slice(0, 10)) : "—"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-6 w-6" title="Zuordnung aufheben"
                        onClick={() => unmatchMutation.mutate(m.id)} data-testid={`button-unmatch-${m.id}`}>
                        <Unlink className="h-3 w-3 text-red-500" />
                      </Button>
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
