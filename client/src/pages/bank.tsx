import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, Pencil, Trash2, Loader2, RefreshCw, Search,
  Landmark, TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownLeft,
  Settings2, Eye, Ban,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const fmtEur = (v: number | string | null | undefined) => {
  const n = typeof v === "string" ? parseFloat(v) || 0 : (v || 0);
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " €";
};

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d));
  } catch { return d; }
};

const bankTypeLabels: Record<string, string> = {
  deutsche_bank: "Deutsche Bank",
  postbank: "Postbank",
  finom: "Finom",
  sonstige: "Sonstige",
};

type BankAccount = {
  id: number;
  bankName: string;
  bankType: string;
  iban: string;
  bic: string | null;
  accountHolder: string | null;
  description: string | null;
  isDefault: boolean;
  active: boolean;
  apiConfig: Record<string, string>;
  notes: string | null;
  sortOrder: number;
};

type BankAccountWithBalance = BankAccount & {
  cachedBalance: {
    id: number;
    balance: string;
    availableBalance: string | null;
    currency: string;
    fetchedAt: string;
  } | null;
};

type DashboardData = {
  accounts: BankAccountWithBalance[];
  totalBalance: number;
};

type CachedTransaction = {
  id: number;
  bankAccountId: number;
  externalId: string | null;
  bookingDate: string;
  valueDate: string | null;
  amount: string;
  currency: string;
  purpose: string | null;
  counterpartName: string | null;
  counterpartIban: string | null;
  counterpartBic: string | null;
  transactionType: string | null;
  fetchedAt: string;
};

function DashboardTab() {
  const { toast } = useToast();
  const { data: dashboard, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/bank/dashboard"],
  });

  const syncMutation = useMutation({
    mutationFn: async (accountId: number) => {
      await apiRequest("POST", `/api/bank/accounts/${accountId}/sync`);
    },
    onSuccess: () => {
      toast({ title: "Kontodaten synchronisiert" });
      queryClient.invalidateQueries({ queryKey: ["/api/bank/dashboard"] });
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const syncAllMutation = useMutation({
    mutationFn: async () => {
      const accounts = dashboard?.accounts || [];
      for (const a of accounts) {
        if (a.active) await apiRequest("POST", `/api/bank/accounts/${a.id}/sync`);
      }
    },
    onSuccess: () => {
      toast({ title: "Alle Konten synchronisiert" });
      queryClient.invalidateQueries({ queryKey: ["/api/bank/dashboard"] });
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const accounts = dashboard?.accounts || [];
  const totalBalance = dashboard?.totalBalance || 0;
  const positiveBalances = accounts.filter(a => a.cachedBalance && parseFloat(a.cachedBalance.balance) > 0);
  const totalPositive = positiveBalances.reduce((s, a) => s + parseFloat(a.cachedBalance!.balance), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" data-testid="text-dashboard-title">Kontenübersicht</h2>
          <p className="text-sm text-muted-foreground">Alle aktiven Bankkonten und Salden</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => syncAllMutation.mutate()}
          disabled={syncAllMutation.isPending}
          data-testid="button-sync-all"
        >
          {syncAllMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Alle synchronisieren
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="md:col-span-1 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-blue-800 dark:text-blue-300">Gesamtsaldo</span>
            </div>
            <p className="text-2xl font-bold text-blue-900 dark:text-blue-100" data-testid="text-total-balance">
              {fmtEur(totalBalance)}
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">{accounts.length} aktive Konten</p>
          </CardContent>
        </Card>

        {accounts.map(account => {
          const balance = account.cachedBalance ? parseFloat(account.cachedBalance.balance) : 0;
          const isPositive = balance >= 0;
          return (
            <Card key={account.id} data-testid={`card-account-${account.id}`}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Landmark className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium truncate">{account.bankName}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => syncMutation.mutate(account.id)}
                    disabled={syncMutation.isPending}
                    data-testid={`button-sync-${account.id}`}
                  >
                    <RefreshCw className={`h-3 w-3 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                  </Button>
                </div>
                <p className={`text-xl font-bold ${isPositive ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`} data-testid={`text-balance-${account.id}`}>
                  {fmtEur(balance)}
                </p>
                <div className="mt-2 space-y-0.5">
                  <p className="text-[10px] text-muted-foreground truncate" data-testid={`text-iban-${account.id}`}>{account.iban}</p>
                  <Badge variant="outline" className="text-[9px]" data-testid={`badge-type-${account.id}`}>
                    {bankTypeLabels[account.bankType] || account.bankType}
                  </Badge>
                </div>
                {account.cachedBalance?.fetchedAt && (
                  <p className="text-[9px] text-muted-foreground mt-1">
                    Stand: {fmtDate(account.cachedBalance.fetchedAt)}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {accounts.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Landmark className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-lg font-medium mb-1" data-testid="text-no-accounts">Noch keine Bankkonten</p>
            <p className="text-sm text-muted-foreground mb-4">Erstellen Sie Ihr erstes Bankkonto im Tab "Einstellungen".</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TransactionsTab() {
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [search, setSearch] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);

  const { data: accounts = [] } = useQuery<BankAccount[]>({
    queryKey: ["/api/bank/accounts"],
  });

  const activeAccounts = accounts.filter(a => a.active);
  const accountId = selectedAccount ? parseInt(selectedAccount) : (activeAccounts[0]?.id || 0);

  const { data: transactions = [], isLoading } = useQuery<CachedTransaction[]>({
    queryKey: ["/api/bank/accounts", accountId, "transactions", { fromDate, toDate, search, minAmount, maxAmount }],
    queryFn: async () => {
      if (!accountId) return [];
      const params = new URLSearchParams();
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      if (search) params.set("search", search);
      if (minAmount) params.set("minAmount", minAmount);
      if (maxAmount) params.set("maxAmount", maxAmount);
      const res = await fetch(`/api/bank/accounts/${accountId}/transactions?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Fehler beim Laden der Umsätze");
      return res.json();
    },
    enabled: accountId > 0,
  });

  const totalIn = transactions.filter(t => parseFloat(t.amount) > 0).reduce((s, t) => s + parseFloat(t.amount), 0);
  const totalOut = transactions.filter(t => parseFloat(t.amount) < 0).reduce((s, t) => s + parseFloat(t.amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedAccount || String(activeAccounts[0]?.id || "")} onValueChange={setSelectedAccount}>
          <SelectTrigger className="w-[250px]" data-testid="select-tx-account">
            <SelectValue placeholder="Konto auswählen" />
          </SelectTrigger>
          <SelectContent>
            {activeAccounts.map(a => (
              <SelectItem key={a.id} value={String(a.id)}>{a.bankName} ({a.iban.slice(-4)})</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={fromDate}
          onChange={e => setFromDate(e.target.value)}
          className="w-[150px]"
          data-testid="input-tx-from"
        />
        <span className="text-sm text-muted-foreground">bis</span>
        <Input
          type="date"
          value={toDate}
          onChange={e => setToDate(e.target.value)}
          className="w-[150px]"
          data-testid="input-tx-to"
        />

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Verwendungszweck suchen..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-tx-search"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Betrag:</span>
        <Input
          type="number"
          step="0.01"
          placeholder="Min €"
          value={minAmount}
          onChange={e => setMinAmount(e.target.value)}
          className="w-[120px]"
          data-testid="input-tx-min-amount"
        />
        <span className="text-sm text-muted-foreground">bis</span>
        <Input
          type="number"
          step="0.01"
          placeholder="Max €"
          value={maxAmount}
          onChange={e => setMaxAmount(e.target.value)}
          className="w-[120px]"
          data-testid="input-tx-max-amount"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900">
              <ArrowDownLeft className="h-4 w-4 text-green-700 dark:text-green-300" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Eingänge</p>
              <p className="text-lg font-bold text-green-700 dark:text-green-400" data-testid="text-total-in">{fmtEur(totalIn)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900">
              <ArrowUpRight className="h-4 w-4 text-red-700 dark:text-red-300" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ausgänge</p>
              <p className="text-lg font-bold text-red-700 dark:text-red-400" data-testid="text-total-out">{fmtEur(totalOut)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
              <TrendingUp className="h-4 w-4 text-blue-700 dark:text-blue-300" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Saldo Zeitraum</p>
              <p className="text-lg font-bold" data-testid="text-period-net">{fmtEur(totalIn + totalOut)}</p>
            </div>
          </CardContent>
        </Card>
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
                    <TableHead className="w-[100px]">Datum</TableHead>
                    <TableHead>Gegenkonto</TableHead>
                    <TableHead>Verwendungszweck</TableHead>
                    <TableHead className="w-[100px]">Art</TableHead>
                    <TableHead className="text-right w-[130px]">Betrag</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8" data-testid="text-no-transactions">
                        Keine Umsätze gefunden
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions.map(tx => {
                      const amount = parseFloat(tx.amount);
                      const isPositive = amount > 0;
                      return (
                        <TableRow key={tx.id} data-testid={`row-tx-${tx.id}`}>
                          <TableCell className="text-xs" data-testid={`text-tx-date-${tx.id}`}>{fmtDate(tx.bookingDate)}</TableCell>
                          <TableCell>
                            <div className="text-sm font-medium" data-testid={`text-tx-counterpart-${tx.id}`}>{tx.counterpartName || "—"}</div>
                            {tx.counterpartIban && (
                              <div className="text-[10px] text-muted-foreground">{tx.counterpartIban}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm max-w-[300px] truncate" data-testid={`text-tx-purpose-${tx.id}`}>
                            {tx.purpose || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[9px]" data-testid={`badge-tx-type-${tx.id}`}>
                              {tx.transactionType || "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className={`text-right font-mono font-semibold ${isPositive ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`} data-testid={`text-tx-amount-${tx.id}`}>
                            {isPositive ? "+" : ""}{fmtEur(amount)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="text-xs text-muted-foreground text-right" data-testid="text-tx-count">
        {transactions.length} Umsätze angezeigt
      </div>
    </div>
  );
}

function SettingsTab() {
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({
    bankName: "",
    bankType: "sonstige",
    iban: "",
    bic: "",
    accountHolder: "",
    description: "",
    isDefault: false,
    active: true,
    notes: "",
    sortOrder: 0,
  });

  const { data: accounts = [], isLoading } = useQuery<BankAccount[]>({
    queryKey: ["/api/bank/accounts"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      if (editId) {
        await apiRequest("PATCH", `/api/bank/accounts/${editId}`, data);
      } else {
        await apiRequest("POST", "/api/bank/accounts", data);
      }
    },
    onSuccess: () => {
      toast({ title: editId ? "Konto aktualisiert" : "Konto erstellt" });
      queryClient.invalidateQueries({ queryKey: ["/api/bank/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bank/dashboard"] });
      setShowDialog(false);
      setEditId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/bank/accounts/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Konto gelöscht" });
      queryClient.invalidateQueries({ queryKey: ["/api/bank/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bank/dashboard"] });
      setDeleteId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      await apiRequest("PATCH", `/api/bank/accounts/${id}`, { active });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bank/dashboard"] });
    },
  });

  const openCreate = () => {
    setEditId(null);
    setForm({ bankName: "", bankType: "sonstige", iban: "", bic: "", accountHolder: "", description: "", isDefault: false, active: true, notes: "", sortOrder: 0 });
    setShowDialog(true);
  };

  const openEdit = (a: BankAccount) => {
    setEditId(a.id);
    setForm({
      bankName: a.bankName,
      bankType: a.bankType,
      iban: a.iban,
      bic: a.bic || "",
      accountHolder: a.accountHolder || "",
      description: a.description || "",
      isDefault: a.isDefault,
      active: a.active,
      notes: a.notes || "",
      sortOrder: a.sortOrder,
    });
    setShowDialog(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Bankkonten verwalten</h2>
          <p className="text-sm text-muted-foreground">Konten anlegen, bearbeiten und deaktivieren</p>
        </div>
        <Button onClick={openCreate} size="sm" data-testid="button-add-account">
          <Plus className="h-4 w-4 mr-1" />Konto anlegen
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kontoname</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>IBAN</TableHead>
                  <TableHead>BIC</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8" data-testid="text-settings-no-accounts">
                      Noch keine Bankkonten angelegt
                    </TableCell>
                  </TableRow>
                ) : (
                  accounts.map(a => (
                    <TableRow key={a.id} className={!a.active ? "opacity-50" : ""} data-testid={`row-settings-account-${a.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium" data-testid={`text-settings-name-${a.id}`}>{a.bankName}</span>
                          {a.isDefault && <Badge variant="default" className="text-[9px]">Standard</Badge>}
                        </div>
                        {a.description && <p className="text-xs text-muted-foreground">{a.description}</p>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]" data-testid={`badge-settings-type-${a.id}`}>
                          {bankTypeLabels[a.bankType] || a.bankType}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs" data-testid={`text-settings-iban-${a.id}`}>{a.iban}</TableCell>
                      <TableCell className="text-xs" data-testid={`text-settings-bic-${a.id}`}>{a.bic || "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={a.active}
                            onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: a.id, active: checked })}
                            data-testid={`switch-active-${a.id}`}
                          />
                          <span className="text-xs">{a.active ? "Aktiv" : "Inaktiv"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)} data-testid={`button-edit-account-${a.id}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => setDeleteId(a.id)} data-testid={`button-delete-account-${a.id}`}>
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

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title-account">
              {editId ? "Bankkonto bearbeiten" : "Neues Bankkonto"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Kontoname *</Label>
                <Input
                  value={form.bankName}
                  onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))}
                  placeholder="z.B. Geschäftskonto Deutsche Bank"
                  data-testid="input-bank-name"
                />
              </div>
              <div>
                <Label>Banktyp *</Label>
                <Select value={form.bankType} onValueChange={v => setForm(f => ({ ...f, bankType: v }))}>
                  <SelectTrigger data-testid="select-bank-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deutsche_bank">Deutsche Bank</SelectItem>
                    <SelectItem value="postbank">Postbank</SelectItem>
                    <SelectItem value="finom">Finom</SelectItem>
                    <SelectItem value="sonstige">Sonstige</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>IBAN *</Label>
                <Input
                  value={form.iban}
                  onChange={e => setForm(f => ({ ...f, iban: e.target.value.toUpperCase() }))}
                  placeholder="DE89 3704 0044 0532 0130 00"
                  data-testid="input-iban"
                />
              </div>
              <div>
                <Label>BIC</Label>
                <Input
                  value={form.bic}
                  onChange={e => setForm(f => ({ ...f, bic: e.target.value.toUpperCase() }))}
                  placeholder="COBADEFFXXX"
                  data-testid="input-bic"
                />
              </div>
            </div>
            <div>
              <Label>Kontoinhaber</Label>
              <Input
                value={form.accountHolder}
                onChange={e => setForm(f => ({ ...f, accountHolder: e.target.value }))}
                placeholder="FriStD-Bau GmbH & Co. KG"
                data-testid="input-account-holder"
              />
            </div>
            <div>
              <Label>Beschreibung</Label>
              <Input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="z.B. Hauptgeschäftskonto"
                data-testid="input-description"
              />
            </div>
            <div>
              <Label>Notizen</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Interne Notizen..."
                rows={2}
                data-testid="input-notes"
              />
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.isDefault}
                  onCheckedChange={v => setForm(f => ({ ...f, isDefault: v }))}
                  data-testid="switch-default"
                />
                <Label className="text-sm">Standard-Konto</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.active}
                  onCheckedChange={v => setForm(f => ({ ...f, active: v }))}
                  data-testid="switch-active-form"
                />
                <Label className="text-sm">Aktiv</Label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowDialog(false)} data-testid="button-cancel-account">Abbrechen</Button>
              <Button
                onClick={() => createMutation.mutate(form)}
                disabled={createMutation.isPending || !form.bankName || !form.iban}
                data-testid="button-save-account"
              >
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {editId ? "Speichern" : "Anlegen"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bankkonto löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Das Bankkonto und alle zugehörigen Cache-Daten werden unwiderruflich gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function BankPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Landmark className="h-6 w-6 text-blue-600" />
        <div>
          <h1 className="text-xl font-bold" data-testid="text-page-title">Bank</h1>
          <p className="text-sm text-muted-foreground">Bankkonten, Kontostände & Umsätze</p>
        </div>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList data-testid="tabs-bank">
          <TabsTrigger value="dashboard" data-testid="tab-dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="transactions" data-testid="tab-transactions">Umsätze</TabsTrigger>
          <TabsTrigger value="settings" data-testid="tab-settings">Einstellungen</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard" className="mt-4">
          <DashboardTab />
        </TabsContent>
        <TabsContent value="transactions" className="mt-4">
          <TransactionsTab />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
