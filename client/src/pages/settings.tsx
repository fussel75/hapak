import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CompanySettings, User, UnitType, BankAccount, Trade, FormTemplate } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Save, Building2, Plus, Pencil, Trash2, UserPlus, Ruler, Landmark, Star, Hammer, Hash, Info, Shield, Phone, MapPin, Brain, CheckCircle, XCircle, Loader2, Eye, EyeOff } from "lucide-react";
import type { DocumentNumberFormat, AiProvider } from "@shared/schema";
import { numberFormatLabels, formatDocumentNumberFromPattern, AI_PROVIDERS, AI_PROVIDER_LABELS, AI_MODELS } from "@shared/schema";
import { USER_ROLES, ROLE_LABELS, ROLE_HIERARCHY, PERMISSION_AREA_LABELS, type PermissionArea, type UserRole, getPermissions } from "@shared/permissions";
import { EditorSettingsTab } from "./settings/editor-settings-tab";

function CompanyTab({ form, update }: { form: any; update: (f: string, v: string) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Firmenanschrift</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Firmenname</Label>
            <Input data-testid="input-company-name" value={form.companyName} onChange={(e) => update("companyName", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Zusatz</Label>
            <Input data-testid="input-company-name2" value={form.companyName2} onChange={(e) => update("companyName2", e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2 col-span-2">
            <Label>Straße</Label>
            <Input data-testid="input-company-street" value={form.street} onChange={(e) => update("street", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>PLZ</Label>
            <Input data-testid="input-company-zip" value={form.zip} onChange={(e) => update("zip", e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Ort</Label>
          <Input data-testid="input-company-city" value={form.city} onChange={(e) => update("city", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Telefon</Label>
            <Input data-testid="input-company-phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Fax</Label>
            <Input data-testid="input-company-fax" value={form.fax} onChange={(e) => update("fax", e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>E-Mail</Label>
            <Input data-testid="input-company-email" value={form.email} onChange={(e) => update("email", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Website</Label>
            <Input data-testid="input-company-website" value={form.website} onChange={(e) => update("website", e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Geschäftsführer</Label>
          <Input data-testid="input-managing-director" value={form.managingDirector} onChange={(e) => update("managingDirector", e.target.value)} />
        </div>
      </CardContent>
    </Card>
  );
}

function ConfirmDeleteDialog({
  open,
  title,
  description,
  pending,
  testIdBase,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  pending: boolean;
  testIdBase: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid={`dialog-delete-${testIdBase}`}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending} data-testid={`button-cancel-delete-${testIdBase}`}>
            Abbrechen
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={pending}
            onClick={onConfirm}
            data-testid={`button-confirm-delete-${testIdBase}`}
          >
            Loeschen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function BankAccountDialog({ account, open, onOpenChange, onSaved }: {
  account?: BankAccount;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    bankName: account?.bankName || "",
    iban: account?.iban || "",
    bic: account?.bic || "",
    accountHolder: account?.accountHolder || "",
    isDefault: account?.isDefault ?? false,
    notes: account?.notes || "",
    sortOrder: account?.sortOrder ?? 0,
  });

  const createMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/bank-accounts", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
      onOpenChange(false);
      onSaved();
      toast({ title: "Bankverbindung erstellt" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/bank-accounts/${account!.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
      onOpenChange(false);
      onSaved();
      toast({ title: "Bankverbindung aktualisiert" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const handleSave = () => {
    if (!form.bankName.trim() || !form.iban.trim()) {
      toast({ title: "Fehler", description: "Bankname und IBAN sind erforderlich", variant: "destructive" });
      return;
    }
    const payload = { ...form, bic: form.bic || null, accountHolder: form.accountHolder || null, notes: form.notes || null };
    if (account) {
      updateMut.mutate(payload);
    } else {
      createMut.mutate(payload);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{account ? "Bankverbindung bearbeiten" : "Neue Bankverbindung"}</DialogTitle>
          <DialogDescription>{account ? `${account.bankName} bearbeiten` : "Neues Bankkonto anlegen"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Bankname *</Label>
            <Input data-testid="input-bank-name" value={form.bankName} onChange={(e) => setForm(f => ({ ...f, bankName: e.target.value }))} placeholder="z.B. Sparkasse Hamburg" />
          </div>
          <div className="space-y-2">
            <Label>IBAN *</Label>
            <Input data-testid="input-bank-iban" value={form.iban} onChange={(e) => setForm(f => ({ ...f, iban: e.target.value }))} placeholder="DE..." className="font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>BIC</Label>
              <Input data-testid="input-bank-bic" value={form.bic} onChange={(e) => setForm(f => ({ ...f, bic: e.target.value }))} className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>Kontoinhaber</Label>
              <Input data-testid="input-bank-holder" value={form.accountHolder} onChange={(e) => setForm(f => ({ ...f, accountHolder: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Bemerkung</Label>
            <Input data-testid="input-bank-notes" value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="z.B. Geschäftskonto, Baukonto..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Sortierung</Label>
              <Input data-testid="input-bank-sort" type="number" value={form.sortOrder} onChange={(e) => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} className="w-24" />
            </div>
            <div className="space-y-2">
              <Label>Standardkonto</Label>
              <div className="flex items-center gap-3 pt-2">
                <Switch data-testid="switch-bank-default" checked={form.isDefault} onCheckedChange={(v) => setForm(f => ({ ...f, isDefault: v }))} />
                <span className="text-sm">{form.isDefault ? "Ja (wird auf Rechnungen gedruckt)" : "Nein"}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)} data-testid="button-cancel-bank">Abbrechen</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} data-testid="button-save-bank-account">Speichern</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BankTab() {
  const { toast } = useToast();
  const { data: accounts, isLoading } = useQuery<BankAccount[]>({ queryKey: ["/api/bank-accounts"] });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<BankAccount | undefined>();
  const [deleteAccount, setDeleteAccount] = useState<BankAccount | null>(null);

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/bank-accounts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
            setDeleteAccount(null);
toast({ title: "Bankverbindung gelöscht" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5" />Bankverbindungen</CardTitle>
        <Button size="sm" onClick={() => { setEditAccount(undefined); setDialogOpen(true); }} data-testid="button-new-bank">
          <Plus className="h-4 w-4 mr-1" />Neue Bankverbindung
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : accounts?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Landmark className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Noch keine Bankverbindungen angelegt.</p>
            <p className="text-sm mt-1">Klicken Sie auf "Neue Bankverbindung" um ein Konto hinzuzufügen.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bank</TableHead>
                <TableHead>IBAN</TableHead>
                <TableHead>BIC</TableHead>
                <TableHead>Inhaber</TableHead>
                <TableHead>Bemerkung</TableHead>
                <TableHead className="w-24 text-center">Standard</TableHead>
                <TableHead className="text-right w-24">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts?.map((a) => (
                <TableRow key={a.id} data-testid={`row-bank-${a.id}`}>
                  <TableCell className="font-medium" data-testid={`text-bank-name-${a.id}`}>{a.bankName}</TableCell>
                  <TableCell className="font-mono text-sm" data-testid={`text-bank-iban-${a.id}`}>{a.iban}</TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{a.bic || "–"}</TableCell>
                  <TableCell className="text-muted-foreground">{a.accountHolder || "–"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{a.notes || "–"}</TableCell>
                  <TableCell className="text-center">
                    {a.isDefault && (
                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" data-testid={`badge-default-${a.id}`}>
                        <Star className="h-3 w-3 mr-1 fill-current" />Standard
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditAccount(a); setDialogOpen(true); }} data-testid={`button-edit-bank-${a.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteAccount(a)} data-testid={`button-delete-bank-${a.id}`}> 
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {dialogOpen && (
        <BankAccountDialog
          account={editAccount}
          open={dialogOpen}
          onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditAccount(undefined); }}
          onSaved={() => setEditAccount(undefined)}
        />
      )}
      <ConfirmDeleteDialog
        open={deleteAccount !== null}
        title="Bankverbindung loeschen?"
        description={`Die Bankverbindung "${deleteAccount?.bankName || ""}" wird dauerhaft entfernt.`}
        pending={deleteMut.isPending}
        testIdBase="bank-account"
        onOpenChange={(open) => !open && !deleteMut.isPending && setDeleteAccount(null)}
        onConfirm={() => deleteAccount && deleteMut.mutate(deleteAccount.id)}
      />
    </Card>
  );
}

function TaxTab({ form, update }: { form: any; update: (f: string, v: string) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>Steuerdaten</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Steuernummer</Label>
          <Input data-testid="input-tax-id" value={form.taxId} onChange={(e) => update("taxId", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>USt-IdNr.</Label>
          <Input data-testid="input-vat-id" value={form.vatId} onChange={(e) => update("vatId", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Handelsregister</Label>
          <Input data-testid="input-trade-register" value={form.tradeRegister} onChange={(e) => update("tradeRegister", e.target.value)} placeholder="z.B. AG Hamburg, HRA ..." />
        </div>
      </CardContent>
    </Card>
  );
}

function KalkulationTab({ form, update }: { form: any; update: (f: string, v: string) => void }) {
  const { data: formTemplates } = useQuery<FormTemplate[]>({ queryKey: ["/api/form-templates"] });

  return (
    <Card>
      <CardHeader><CardTitle>Grundzuschläge (Kalkulation)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Diese Zuschläge werden auf die Einkaufspreise (EK) aufgeschlagen, um die Kalkulationspreise zu berechnen.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Zuschlag auf Material-EK</Label>
            <div className="flex items-center gap-2">
              <Input type="text" data-testid="input-material-markup" value={String(form.materialMarkupPercent ?? "").replace(".", ",")} onChange={(e) => update("materialMarkupPercent", e.target.value.replace(",", "."))} className="w-24 text-right" />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground">Aufschlag auf Materialeinkaufspreise</p>
          </div>
          <div className="space-y-2">
            <Label>Zuschlag auf Fremdleistung-EK</Label>
            <div className="flex items-center gap-2">
              <Input type="text" data-testid="input-subcontractor-markup" value={String(form.subcontractorMarkupPercent ?? "").replace(".", ",")} onChange={(e) => update("subcontractorMarkupPercent", e.target.value.replace(",", "."))} className="w-24 text-right" />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground">Aufschlag auf Fremdleistungspreise</p>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Standard-Formular für neue Dokumente</Label>
          <Select value={form.defaultFormTemplateId || ""} onValueChange={(v) => update("defaultFormTemplateId", v)}>
            <SelectTrigger className="w-64" data-testid="select-default-form-template"><SelectValue placeholder="Kein Standard-Formular" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Kein Standard-Formular</SelectItem>
              {formTemplates?.filter(t => t.status === "aktiv").map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Wird automatisch bei neuen Dokumenten vorausgewählt</p>
        </div>
      </CardContent>
    </Card>
  );
}

const roleLabels: Record<string, string> = ROLE_LABELS;

function UserDialog({ user, open, onOpenChange, onSaved }: {
  user?: User;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { data: trades } = useQuery<Trade[]>({ queryKey: ["/api/trades"] });
  const [form, setForm] = useState({
    username: user?.username || "",
    password: "",
    fullName: user?.fullName || "",
    email: user?.email || "",
    role: user?.role || "mitarbeiter",
    branch: user?.branch || "",
    active: user?.active ?? true,
    personalNr: (user as any)?.personalNr || "",
    phone: (user as any)?.phone || "",
    mobile: (user as any)?.mobile || "",
    street: (user as any)?.street || "",
    zip: (user as any)?.zip || "",
    city: (user as any)?.city || "",
    hourlyRate: (user as any)?.hourlyRate || "",
    tradeId: (user as any)?.tradeId ? String((user as any).tradeId) : "",
    notes: (user as any)?.notes || "",
  });

  const upd = (f: string, v: any) => setForm(prev => ({ ...prev, [f]: v }));

  const createMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      onOpenChange(false);
      onSaved();
      toast({ title: "Benutzer erstellt" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/users/${user!.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      onOpenChange(false);
      onSaved();
      toast({ title: "Benutzer aktualisiert" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const handleSave = () => {
    if (!form.username.trim() || !form.fullName.trim()) {
      toast({ title: "Fehler", description: "Benutzername und Name sind erforderlich", variant: "destructive" });
      return;
    }
    if (!user && !form.password) {
      toast({ title: "Fehler", description: "Passwort ist beim Erstellen erforderlich", variant: "destructive" });
      return;
    }
    const payload: any = { ...form };
    if (!payload.password) delete payload.password;
    if (!payload.email) payload.email = null;
    if (!payload.branch) payload.branch = null;
    if (!payload.personalNr) payload.personalNr = null;
    if (!payload.phone) payload.phone = null;
    if (!payload.mobile) payload.mobile = null;
    if (!payload.street) payload.street = null;
    if (!payload.zip) payload.zip = null;
    if (!payload.city) payload.city = null;
    if (!payload.hourlyRate) payload.hourlyRate = null;
    payload.tradeId = payload.tradeId && payload.tradeId !== "none" ? parseInt(payload.tradeId) : null;
    if (!payload.notes) payload.notes = null;

    if (user) {
      updateMut.mutate(payload);
    } else {
      createMut.mutate(payload);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">{user ? "Benutzer bearbeiten" : "Neuer Benutzer"}</DialogTitle>
          <DialogDescription className="text-xs">{user ? `Benutzer "${user.username}" bearbeiten` : "Neuen Benutzer anlegen"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Zugangsdaten</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Benutzername *</Label>
              <Input className="h-7 text-xs" data-testid="input-user-username" value={form.username} onChange={(e) => upd("username", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{user ? "Neues Passwort" : "Passwort *"}</Label>
              <Input className="h-7 text-xs" data-testid="input-user-password" type="password" value={form.password} onChange={(e) => upd("password", e.target.value)} placeholder={user ? "Leer = unverändert" : ""} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Personal-Nr.</Label>
              <Input className="h-7 text-xs" data-testid="input-user-personalnr" value={form.personalNr} onChange={(e) => upd("personalNr", e.target.value)} />
            </div>
          </div>

          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground pt-1">Persönliche Daten</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Vollständiger Name *</Label>
              <Input className="h-7 text-xs" data-testid="input-user-fullname" value={form.fullName} onChange={(e) => upd("fullName", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">E-Mail</Label>
              <Input className="h-7 text-xs" data-testid="input-user-email" value={form.email} onChange={(e) => upd("email", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Telefon</Label>
              <Input className="h-7 text-xs" data-testid="input-user-phone" value={form.phone} onChange={(e) => upd("phone", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mobil</Label>
              <Input className="h-7 text-xs" data-testid="input-user-mobile" value={form.mobile} onChange={(e) => upd("mobile", e.target.value)} />
            </div>
          </div>

          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground pt-1">Adresse</p>
          <div className="space-y-1">
            <Label className="text-xs">Straße</Label>
            <Input className="h-7 text-xs" data-testid="input-user-street" value={form.street} onChange={(e) => upd("street", e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">PLZ</Label>
              <Input className="h-7 text-xs" data-testid="input-user-zip" value={form.zip} onChange={(e) => upd("zip", e.target.value)} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Ort</Label>
              <Input className="h-7 text-xs" data-testid="input-user-city" value={form.city} onChange={(e) => upd("city", e.target.value)} />
            </div>
          </div>

          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground pt-1">Rolle & Zuordnung</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Rolle</Label>
              <Select value={form.role} onValueChange={(v) => upd("role", v)}>
                <SelectTrigger className="h-7 text-xs" data-testid="select-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(roleLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Gewerk</Label>
              <Select value={form.tradeId} onValueChange={(v) => upd("tradeId", v)}>
                <SelectTrigger className="h-7 text-xs" data-testid="select-user-trade">
                  <SelectValue placeholder="Kein Gewerk" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kein Gewerk</SelectItem>
                  {trades?.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Niederlassung</Label>
              <Input className="h-7 text-xs" data-testid="input-user-branch" value={form.branch} onChange={(e) => upd("branch", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Stundensatz (€)</Label>
              <Input className="h-7 text-xs" data-testid="input-user-hourlyrate" value={form.hourlyRate} onChange={(e) => upd("hourlyRate", e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <div className="flex items-center gap-2 pt-1">
                <Switch data-testid="switch-user-active" checked={form.active} onCheckedChange={(v) => upd("active", v)} />
                <span className="text-xs">{form.active ? "Aktiv" : "Inaktiv"}</span>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Notizen</Label>
            <Textarea className="text-xs min-h-[50px]" data-testid="input-user-notes" value={form.notes} onChange={(e) => upd("notes", e.target.value)} placeholder="Interne Notizen zum Benutzer..." />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)} data-testid="button-cancel-user">Abbrechen</Button>
            <Button size="sm" onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} data-testid="button-save-user">
              Speichern
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UsersTab() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const { data: allUsers, isLoading } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | undefined>();
  const [deleteUser, setDeleteUser] = useState<User | null>(null);

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
            setDeleteUser(null);
toast({ title: "Benutzer gelöscht" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" />Benutzerverwaltung</CardTitle>
        <Button size="sm" onClick={() => { setEditUser(undefined); setDialogOpen(true); }} data-testid="button-new-user">
          <Plus className="h-4 w-4 mr-1" />Neuer Benutzer
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Benutzername</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>E-Mail</TableHead>
                <TableHead>Rolle</TableHead>
                <TableHead>Gewerk</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allUsers?.map((u) => (
                <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                  <TableCell className="font-mono text-sm" data-testid={`text-username-${u.id}`}>{u.username}</TableCell>
                  <TableCell className="font-medium" data-testid={`text-fullname-${u.id}`}>{u.fullName}</TableCell>
                  <TableCell className="text-muted-foreground" data-testid={`text-email-${u.id}`}>{u.email || "–"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" data-testid={`badge-role-${u.id}`}>
                      {roleLabels[u.role] || u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.branch || "–"}</TableCell>
                  <TableCell>
                    <Badge variant={u.active ? "default" : "secondary"} className={u.active ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" : "bg-gray-100 text-gray-600"} data-testid={`badge-active-${u.id}`}>
                      {u.active ? "Aktiv" : "Inaktiv"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditUser(u); setDialogOpen(true); }} data-testid={`button-edit-user-${u.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {u.id !== currentUser?.id && (
                        <Button variant="ghost" size="icon" onClick={() => setDeleteUser(u)} data-testid={`button-delete-user-${u.id}`}> 
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {dialogOpen && (
        <UserDialog
          user={editUser}
          open={dialogOpen}
          onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditUser(undefined); }}
          onSaved={() => setEditUser(undefined)}
        />
      )}
      <ConfirmDeleteDialog
        open={deleteUser !== null}
        title="Benutzer loeschen?"
        description={`Der Benutzer "${deleteUser?.username || ""}" wird dauerhaft entfernt.`}
        pending={deleteMut.isPending}
        testIdBase="user"
        onOpenChange={(open) => !open && !deleteMut.isPending && setDeleteUser(null)}
        onConfirm={() => deleteUser && deleteMut.mutate(deleteUser.id)}
      />
    </Card>
  );
}

const PERMISSION_GROUPS: { label: string; areas: PermissionArea[] }[] = [
  { label: "Dashboard", areas: ["dashboard_kpi", "dashboard_revenue", "dashboard_quick_actions", "dashboard_gewerke"] },
  { label: "Dokumente & Projekte", areas: ["kunden", "projekte", "dokumente", "dokumente_erstellen", "vertraege"] },
  { label: "Finanzen", areas: ["finanzen", "rechnungsbuch", "offene_posten", "rechnungseingang", "kassenbuch", "finanzbuchhaltung"] },
  { label: "Personal & Zeit", areas: ["personal", "lohnstunden", "ressourcen", "termine"] },
  { label: "Kalkulation", areas: ["kalkulation", "nachkalkulation", "disposition", "stuecklisten"] },
  { label: "Organisation", areas: ["organisation", "wiedervorlagen", "postbuch"] },
  { label: "Lager & Material", areas: ["lager", "materialstamm"] },
  { label: "System", areas: ["stammdaten", "einstellungen", "benutzerverwaltung", "import", "bwa"] },
];

function RolesTab() {
  const [selectedRole, setSelectedRole] = useState<UserRole>("chef");
  const perms = getPermissions(selectedRole);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><Shield className="h-4 w-4" />Rollenverwaltung</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-7 gap-1">
          {USER_ROLES.map(role => (
            <button
              key={role}
              onClick={() => setSelectedRole(role)}
              className={`rounded-md px-2 py-1.5 text-[10px] font-medium text-center transition-colors ${
                selectedRole === role
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
              }`}
              data-testid={`button-role-${role}`}
            >
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>

        <div className="rounded-lg border p-3 bg-muted/30">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-xs font-semibold">{ROLE_LABELS[selectedRole]}</p>
              <p className="text-[10px] text-muted-foreground">Stufe {ROLE_HIERARCHY[selectedRole]} — {perms.length} von {Object.keys(PERMISSION_AREA_LABELS).length} Berechtigungen</p>
            </div>
            <Badge variant="secondary" className="text-[10px]" data-testid="badge-role-level">Level {ROLE_HIERARCHY[selectedRole]}</Badge>
          </div>
        </div>

        <div className="space-y-3">
          {PERMISSION_GROUPS.map(group => {
            const groupPerms = group.areas.filter(a => perms.includes(a));
            const allGranted = groupPerms.length === group.areas.length;
            const noneGranted = groupPerms.length === 0;
            return (
              <div key={group.label} className="rounded-md border" data-testid={`group-${group.label}`}>
                <div className={`flex items-center justify-between px-3 py-1.5 rounded-t-md ${allGranted ? "bg-emerald-50 dark:bg-emerald-950/20" : noneGranted ? "bg-red-50 dark:bg-red-950/20" : "bg-amber-50 dark:bg-amber-950/20"}`}>
                  <span className="text-[11px] font-semibold">{group.label}</span>
                  <span className="text-[10px] text-muted-foreground">{groupPerms.length}/{group.areas.length}</span>
                </div>
                <div className="px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1">
                  {group.areas.map(area => {
                    const granted = perms.includes(area);
                    return (
                      <div key={area} className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${granted ? "bg-emerald-500" : "bg-red-300 dark:bg-red-800"}`} />
                        <span className={`text-[10px] ${granted ? "text-foreground" : "text-muted-foreground line-through"}`}>
                          {PERMISSION_AREA_LABELS[area]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[10px] text-muted-foreground italic">
          Rollen und Berechtigungen sind systemseitig festgelegt. Jeder Benutzer erhält die Rechte seiner zugewiesenen Rolle.
        </p>
      </CardContent>
    </Card>
  );
}

function UnitDialog({ unit, open, onOpenChange, onSaved }: {
  unit?: UnitType;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    code: unit?.code || "",
    name: unit?.name || "",
    sortOrder: unit?.sortOrder ?? 99,
  });

  const createMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/units", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/units"] });
      onOpenChange(false);
      onSaved();
      toast({ title: "Einheit erstellt" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/units/${unit!.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/units"] });
      onOpenChange(false);
      onSaved();
      toast({ title: "Einheit aktualisiert" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const handleSave = () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast({ title: "Fehler", description: "Kürzel und Bezeichnung sind erforderlich", variant: "destructive" });
      return;
    }
    if (unit) {
      updateMut.mutate(form);
    } else {
      createMut.mutate(form);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{unit ? "Einheit bearbeiten" : "Neue Einheit"}</DialogTitle>
          <DialogDescription>{unit ? `Einheit "${unit.code}" bearbeiten` : "Neue Maßeinheit anlegen"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Kürzel *</Label>
            <Input data-testid="input-unit-code" value={form.code} onChange={(e) => setForm(f => ({ ...f, code: e.target.value }))} placeholder="z.B. m², lfm, Stk" />
          </div>
          <div className="space-y-2">
            <Label>Bezeichnung *</Label>
            <Input data-testid="input-unit-name" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="z.B. Quadratmeter" />
          </div>
          <div className="space-y-2">
            <Label>Sortierung</Label>
            <Input data-testid="input-unit-sort" type="number" value={form.sortOrder} onChange={(e) => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} className="w-24" />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)} data-testid="button-cancel-unit">Abbrechen</Button>
            <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending} data-testid="button-save-unit">Speichern</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UnitsTab() {
  const { toast } = useToast();
  const { data: allUnits, isLoading } = useQuery<UnitType[]>({ queryKey: ["/api/units"] });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUnit, setEditUnit] = useState<UnitType | undefined>();
  const [deleteUnit, setDeleteUnit] = useState<UnitType | null>(null);

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/units/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/units"] });
            setDeleteUnit(null);
toast({ title: "Einheit gelöscht" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Ruler className="h-5 w-5" />Einheitenverwaltung</CardTitle>
        <Button size="sm" onClick={() => { setEditUnit(undefined); setDialogOpen(true); }} data-testid="button-new-unit">
          <Plus className="h-4 w-4 mr-1" />Neue Einheit
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Nr</TableHead>
                <TableHead>Kürzel</TableHead>
                <TableHead>Bezeichnung</TableHead>
                <TableHead className="w-24">Sortierung</TableHead>
                <TableHead className="text-right w-24">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allUnits?.map((u, idx) => (
                <TableRow key={u.id} data-testid={`row-unit-${u.id}`}>
                  <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="font-mono font-semibold" data-testid={`text-unit-code-${u.id}`}>{u.code}</TableCell>
                  <TableCell data-testid={`text-unit-name-${u.id}`}>{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.sortOrder}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditUnit(u); setDialogOpen(true); }} data-testid={`button-edit-unit-${u.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteUnit(u)} data-testid={`button-delete-unit-${u.id}`}> 
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {allUnits?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Keine Einheiten vorhanden</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {dialogOpen && (
        <UnitDialog
          unit={editUnit}
          open={dialogOpen}
          onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditUnit(undefined); }}
          onSaved={() => setEditUnit(undefined)}
        />
      )}
      <ConfirmDeleteDialog
        open={deleteUnit !== null}
        title="Einheit loeschen?"
        description={`Die Einheit "${deleteUnit?.code || ""}" wird dauerhaft entfernt.`}
        pending={deleteMut.isPending}
        testIdBase="unit"
        onOpenChange={(open) => !open && !deleteMut.isPending && setDeleteUnit(null)}
        onConfirm={() => deleteUnit && deleteMut.mutate(deleteUnit.id)}
      />
    </Card>
  );
}

function TradeDialog({ trade, open, onOpenChange, onSaved }: {
  trade?: Trade; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(trade?.name || "");
  const [color, setColor] = useState(trade?.color || "#3b82f6");
  const [sortOrder, setSortOrder] = useState(String(trade?.sortOrder ?? 0));

  useEffect(() => {
    setName(trade?.name || "");
    setColor(trade?.color || "#3b82f6");
    setSortOrder(String(trade?.sortOrder ?? 0));
  }, [trade]);

  const mutation = useMutation({
    mutationFn: async () => {
      const body = { name, color, sortOrder: parseInt(sortOrder) || 0 };
      if (trade) {
        await apiRequest("PATCH", `/api/trades/${trade.id}`, body);
      } else {
        await apiRequest("POST", "/api/trades", body);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      toast({ title: trade ? "Gewerk aktualisiert" : "Gewerk erstellt" });
      onOpenChange(false);
      onSaved();
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{trade ? "Gewerk bearbeiten" : "Neues Gewerk"}</DialogTitle>
          <DialogDescription>{trade ? "Gewerkdaten ändern" : "Neues Gewerk anlegen"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Bezeichnung</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Zimmerei" data-testid="input-trade-name" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Farbe</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-10 h-10 rounded cursor-pointer border" data-testid="input-trade-color" />
                <Input value={color} onChange={(e) => setColor(e.target.value)} className="font-mono" data-testid="input-trade-color-text" />
              </div>
            </div>
            <div>
              <Label>Sortierung</Label>
              <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} data-testid="input-trade-sort" />
            </div>
          </div>
          <Button className="w-full" onClick={() => mutation.mutate()} disabled={mutation.isPending || !name.trim()} data-testid="button-save-trade">
            <Save className="h-4 w-4 mr-2" />{mutation.isPending ? "Wird gespeichert..." : "Speichern"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TradesTab() {
  const { toast } = useToast();
  const { data: allTrades, isLoading } = useQuery<Trade[]>({ queryKey: ["/api/trades"] });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTrade, setEditTrade] = useState<Trade | undefined>();
  const [deleteTrade, setDeleteTrade] = useState<Trade | null>(null);

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/trades/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
            setDeleteTrade(null);
toast({ title: "Gewerk gelöscht" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Hammer className="h-5 w-5" />Gewerkeverwaltung</CardTitle>
        <Button size="sm" onClick={() => { setEditTrade(undefined); setDialogOpen(true); }} data-testid="button-new-trade">
          <Plus className="h-4 w-4 mr-1" />Neues Gewerk
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Nr</TableHead>
                <TableHead className="w-12">Farbe</TableHead>
                <TableHead>Bezeichnung</TableHead>
                <TableHead className="w-24">Sortierung</TableHead>
                <TableHead className="text-right w-24">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allTrades?.map((t, idx) => (
                <TableRow key={t.id} data-testid={`row-trade-${t.id}`}>
                  <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell>
                    <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: t.color || "#3b82f6" }} data-testid={`color-trade-${t.id}`} />
                  </TableCell>
                  <TableCell className="font-semibold" data-testid={`text-trade-name-${t.id}`}>{t.name}</TableCell>
                  <TableCell className="text-muted-foreground">{t.sortOrder}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditTrade(t); setDialogOpen(true); }} data-testid={`button-edit-trade-${t.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTrade(t)} data-testid={`button-delete-trade-${t.id}`}> 
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {allTrades?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Keine Gewerke vorhanden</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {dialogOpen && (
        <TradeDialog
          trade={editTrade}
          open={dialogOpen}
          onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditTrade(undefined); }}
          onSaved={() => setEditTrade(undefined)}
        />
      )}
      <ConfirmDeleteDialog
        open={deleteTrade !== null}
        title="Gewerk loeschen?"
        description={`Das Gewerk "${deleteTrade?.name || ""}" wird dauerhaft entfernt.`}
        pending={deleteMut.isPending}
        testIdBase="trade"
        onOpenChange={(open) => !open && !deleteMut.isPending && setDeleteTrade(null)}
        onConfirm={() => deleteTrade && deleteMut.mutate(deleteTrade.id)}
      />
    </Card>
  );
}

function NummernkreiseTab() {
  const { toast } = useToast();
  const { data: formats, isLoading } = useQuery<DocumentNumberFormat[]>({ queryKey: ["/api/document-number-formats"] });
  const [editType, setEditType] = useState<string | null>(null);
  const [editPattern, setEditPattern] = useState("");

  const now = new Date();
  const previewNumber = (pattern: string) => {
    try {
      return formatDocumentNumberFromPattern(pattern, now.getFullYear(), now.getMonth() + 1, 1);
    } catch {
      return "?";
    }
  };

  const validatePattern = (p: string) => {
    const nCount = (p.match(/n/g) || []).length;
    const jCount = (p.match(/j/g) || []).length;
    if (nCount < 3) return "Mind. 3× n";
    if (jCount < 1) return "Mind. 1× j";
    return null;
  };

  const saveMut = useMutation({
    mutationFn: async ({ type, pattern }: { type: string; pattern: string }) => {
      await apiRequest("PATCH", `/api/document-number-formats/${type}`, { formatPattern: pattern });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/document-number-formats"] });
      toast({ title: "Nummernformat gespeichert" });
      setEditType(null);
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const mainTypes = Object.keys(numberFormatLabels);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Hash className="h-5 w-5" />Dokumentnummerierung</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 p-3 bg-muted rounded-lg text-sm">
          <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div>
            <p className="font-medium">Platzhalter</p>
            <p className="text-muted-foreground"><code className="text-xs bg-background px-1 py-0.5 rounded">j</code> = Jahresziffer, <code className="text-xs bg-background px-1 py-0.5 rounded">n</code> = Laufende Nummer, <code className="text-xs bg-background px-1 py-0.5 rounded">m</code> = Monat, <code className="text-xs bg-background px-1 py-0.5 rounded">b</code> = freies Zeichen</p>
            <p className="text-muted-foreground mt-1">Mind. 3× <code className="text-xs bg-background px-1 py-0.5 rounded">n</code> + 1× <code className="text-xs bg-background px-1 py-0.5 rounded">j</code>. Bei Verwendung von <code className="text-xs bg-background px-1 py-0.5 rounded">mm</code> wird die Nummerierung monatlich zurückgesetzt.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dokumenttyp</TableHead>
                <TableHead className="w-48">Format</TableHead>
                <TableHead className="w-36">Vorschau</TableHead>
                <TableHead className="text-right w-24">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mainTypes.map((docType) => {
                const fmt = formats?.find(f => f.documentType === docType);
                const pattern = fmt?.formatPattern || "jj-nnnnn";
                const isEditing = editType === docType;
                const currentPattern = isEditing ? editPattern : pattern;
                const error = isEditing ? validatePattern(editPattern) : null;

                return (
                  <TableRow key={docType} data-testid={`row-numformat-${docType}`}>
                    <TableCell className="font-semibold" data-testid={`text-numformat-label-${docType}`}>
                      {numberFormatLabels[docType]}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <div className="space-y-1">
                          <Input
                            value={editPattern}
                            onChange={(e) => setEditPattern(e.target.value)}
                            className="h-8 font-mono text-sm"
                            data-testid={`input-numformat-${docType}`}
                          />
                          {error && <p className="text-xs text-destructive">{error}</p>}
                        </div>
                      ) : (
                        <code className="text-sm bg-muted px-2 py-1 rounded" data-testid={`text-numformat-pattern-${docType}`}>{pattern}</code>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground font-mono" data-testid={`text-numformat-preview-${docType}`}>
                        {previewNumber(currentPattern)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => saveMut.mutate({ type: docType, pattern: editPattern })}
                            disabled={!!error || saveMut.isPending}
                            data-testid={`button-save-numformat-${docType}`}
                          >
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditType(null)} data-testid={`button-cancel-numformat-${docType}`}>
                            Abbrechen
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { setEditType(docType); setEditPattern(pattern); }}
                          data-testid={`button-edit-numformat-${docType}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function KiTab() {
  const { toast } = useToast();
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<{ success?: boolean; text?: string; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const { data: aiConfig, isLoading } = useQuery<{
    activeProvider: string;
    fastModel: string;
    standardModel: string;
    anthropicApiKey: string;
    openaiApiKey: string;
    googleApiKey: string;
    perplexityApiKey: string;
    mistralApiKey: string;
  }>({ queryKey: ["/api/ai-settings"] });

  const [aiForm, setAiForm] = useState({
    activeProvider: "anthropic" as AiProvider,
    fastModel: "claude-haiku-4-5",
    standardModel: "claude-sonnet-4-6",
    anthropicApiKey: "",
    openaiApiKey: "",
    googleApiKey: "",
    perplexityApiKey: "",
    mistralApiKey: "",
  });

  useEffect(() => {
    if (aiConfig) {
      setAiForm({
        activeProvider: (aiConfig.activeProvider || "anthropic") as AiProvider,
        fastModel: aiConfig.fastModel || "claude-haiku-4-5",
        standardModel: aiConfig.standardModel || "claude-sonnet-4-6",
        anthropicApiKey: aiConfig.anthropicApiKey || "",
        openaiApiKey: aiConfig.openaiApiKey || "",
        googleApiKey: aiConfig.googleApiKey || "",
        perplexityApiKey: aiConfig.perplexityApiKey || "",
        mistralApiKey: aiConfig.mistralApiKey || "",
      });
    }
  }, [aiConfig]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai-settings", aiForm);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-settings"] });
      toast({ title: "KI-Einstellungen gespeichert" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiRequest("POST", "/api/ai-settings/test", {});
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleProviderChange = (provider: AiProvider) => {
    const models = AI_MODELS[provider];
    const fast = models.find(m => m.tier === "fast")?.value || models[0].value;
    const standard = models.find(m => m.tier === "standard")?.value || models[models.length - 1].value;
    setAiForm(f => ({ ...f, activeProvider: provider, fastModel: fast, standardModel: standard }));
  };

  const toggleKeyVisibility = (key: string) => {
    setShowKeys(s => ({ ...s, [key]: !s[key] }));
  };

  const providerKeyMap: Record<AiProvider, { field: keyof typeof aiForm; label: string }> = {
    anthropic: { field: "anthropicApiKey", label: "Anthropic API-Key" },
    openai: { field: "openaiApiKey", label: "OpenAI API-Key" },
    google: { field: "googleApiKey", label: "Google Gemini API-Key" },
    perplexity: { field: "perplexityApiKey", label: "Perplexity API-Key" },
    mistral: { field: "mistralApiKey", label: "Mistral API-Key" },
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const activeModels = AI_MODELS[aiForm.activeProvider] || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Brain className="h-5 w-5" />KI-Anbieter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Aktiver Anbieter</Label>
            <Select value={aiForm.activeProvider} onValueChange={(v) => handleProviderChange(v as AiProvider)}>
              <SelectTrigger data-testid="select-ai-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_PROVIDERS.map(p => (
                  <SelectItem key={p} value={p} data-testid={`option-provider-${p}`}>{AI_PROVIDER_LABELS[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Schnelles Modell (Texte, Chat)</Label>
              <Select value={aiForm.fastModel} onValueChange={(v) => setAiForm(f => ({ ...f, fastModel: v }))}>
                <SelectTrigger data-testid="select-fast-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {activeModels.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Standard-Modell (Analyse, Positionen)</Label>
              <Select value={aiForm.standardModel} onValueChange={(v) => setAiForm(f => ({ ...f, standardModel: v }))}>
                <SelectTrigger data-testid="select-standard-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {activeModels.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />API-Keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Hinterlege den API-Key für den gewählten Anbieter. Du kannst auch Keys für andere Anbieter hinterlegen, um später schnell zu wechseln.</p>
          {AI_PROVIDERS.map(provider => {
            const { field, label } = providerKeyMap[provider];
            const isActive = provider === aiForm.activeProvider;
            const keyValue = aiForm[field] as string;
            const isVisible = showKeys[provider] || false;
            return (
              <div key={provider} className={`space-y-1 p-3 rounded-lg border ${isActive ? "border-primary bg-primary/5" : "border-border"}`}>
                <div className="flex items-center gap-2">
                  <Label className="flex-1">{label} {isActive && <Badge variant="outline" className="ml-2 text-xs">aktiv</Badge>}</Label>
                </div>
                <div className="flex gap-2">
                  <Input
                    data-testid={`input-api-key-${provider}`}
                    type={isVisible ? "text" : "password"}
                    value={keyValue}
                    onChange={(e) => setAiForm(f => ({ ...f, [field]: e.target.value }))}
                    placeholder={`${label} eingeben...`}
                    className="font-mono text-sm"
                  />
                  <Button variant="ghost" size="icon" onClick={() => toggleKeyVisibility(provider)} data-testid={`toggle-key-${provider}`}>
                    {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Verbindung testen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handleTest} disabled={testing} variant="outline" data-testid="button-test-ai">
            {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Brain className="h-4 w-4 mr-2" />}
            {testing ? "Teste..." : "KI-Verbindung testen"}
          </Button>
          {testResult && (
            <div className={`flex items-center gap-2 p-3 rounded-lg ${testResult.success ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"}`} data-testid="text-ai-test-result">
              {testResult.success ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
              <span className="text-sm">{testResult.success ? testResult.text : testResult.error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Button className="w-full" size="lg" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-ai-settings">
        <Save className="h-4 w-4 mr-2" />{saveMutation.isPending ? "Wird gespeichert..." : "KI-Einstellungen speichern"}
      </Button>
    </div>
  );
}

export default function SettingsPage() {
  const { toast } = useToast();
  const { user: authUser } = useAuth();
  const canManageAi = authUser?.role === "chef" || authUser?.role === "admin" || authUser?.role === "buero";
  const { data: settings } = useQuery<CompanySettings | null>({ queryKey: ["/api/company-settings"] });

  const [form, setForm] = useState({
    companyName: "FriStD-Bau ZuB GmbH & Co.KG",
    companyName2: "",
    street: "Haldesdorfer Str. 44",
    zip: "22179",
    city: "Hamburg",
    phone: "",
    fax: "",
    email: "",
    website: "",
    taxId: "",
    vatId: "",
    tradeRegister: "",
    managingDirector: "Ronny Friedrich",
    logoUrl: "",
    materialMarkupPercent: "30.00",
    subcontractorMarkupPercent: "30.00",
    defaultFormTemplateId: "",
  });

  useEffect(() => {
    if (settings) {
      setForm({
        companyName: settings.companyName,
        companyName2: settings.companyName2 || "",
        street: settings.street || "",
        zip: settings.zip || "",
        city: settings.city || "",
        phone: settings.phone || "",
        fax: settings.fax || "",
        email: settings.email || "",
        website: settings.website || "",
        taxId: settings.taxId || "",
        vatId: settings.vatId || "",
        tradeRegister: settings.tradeRegister || "",
        managingDirector: settings.managingDirector || "",
        logoUrl: settings.logoUrl || "",
        materialMarkupPercent: settings.materialMarkupPercent || "30.00",
        subcontractorMarkupPercent: settings.subcontractorMarkupPercent || "30.00",
        defaultFormTemplateId: settings.defaultFormTemplateId ? String(settings.defaultFormTemplateId) : "",
      });
    }
  }, [settings]);

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, defaultFormTemplateId: form.defaultFormTemplateId && form.defaultFormTemplateId !== "0" ? parseInt(form.defaultFormTemplateId) : null };
      const res = await apiRequest("POST", "/api/company-settings", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company-settings"] });
      toast({ title: "Einstellungen gespeichert" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-settings-title">Einstellungen</h1>
        <p className="text-muted-foreground">Firmenstammdaten, Benutzer und Konfiguration</p>
      </div>

      <Tabs defaultValue="firma">
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="firma" data-testid="tab-company">Firmendaten</TabsTrigger>
          <TabsTrigger value="bank" data-testid="tab-bank">Bankverbindungen</TabsTrigger>
          <TabsTrigger value="steuer" data-testid="tab-tax">Steuerdaten</TabsTrigger>
          <TabsTrigger value="kalkulation" data-testid="tab-kalkulation">Kalkulation</TabsTrigger>
          <TabsTrigger value="benutzer" data-testid="tab-users">Benutzer</TabsTrigger>
          <TabsTrigger value="rollen" data-testid="tab-roles">Rollen</TabsTrigger>
          <TabsTrigger value="einheiten" data-testid="tab-units">Einheiten</TabsTrigger>
          <TabsTrigger value="gewerke" data-testid="tab-trades">Gewerke</TabsTrigger>
          <TabsTrigger value="nummernkreise" data-testid="tab-nummernkreise">Nummernkreise</TabsTrigger>
          <TabsTrigger value="dokumentenbearbeitung" data-testid="tab-dokumentenbearbeitung">Dokumentenbearbeitung</TabsTrigger>
          {canManageAi && <TabsTrigger value="ki" data-testid="tab-ki">KI</TabsTrigger>}
        </TabsList>

        <TabsContent value="firma">
          <CompanyTab form={form} update={update} />
          <Button className="w-full mt-4" size="lg" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-settings">
            <Save className="h-4 w-4 mr-2" />{saveMutation.isPending ? "Wird gespeichert..." : "Firmendaten speichern"}
          </Button>
        </TabsContent>

        <TabsContent value="bank">
          <BankTab />
        </TabsContent>

        <TabsContent value="steuer">
          <TaxTab form={form} update={update} />
          <Button className="w-full mt-4" size="lg" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-tax">
            <Save className="h-4 w-4 mr-2" />{saveMutation.isPending ? "Wird gespeichert..." : "Steuerdaten speichern"}
          </Button>
        </TabsContent>

        <TabsContent value="kalkulation">
          <KalkulationTab form={form} update={update} />
          <Button className="w-full mt-4" size="lg" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-kalkulation">
            <Save className="h-4 w-4 mr-2" />{saveMutation.isPending ? "Wird gespeichert..." : "Kalkulation speichern"}
          </Button>
        </TabsContent>

        <TabsContent value="benutzer">
          <UsersTab />
        </TabsContent>

        <TabsContent value="rollen">
          <RolesTab />
        </TabsContent>

        <TabsContent value="einheiten">
          <UnitsTab />
        </TabsContent>

        <TabsContent value="gewerke">
          <TradesTab />
        </TabsContent>

        <TabsContent value="nummernkreise">
          <NummernkreiseTab />
        </TabsContent>

        <TabsContent value="dokumentenbearbeitung">
          <EditorSettingsTab />
        </TabsContent>

        {canManageAi && (
          <TabsContent value="ki">
            <KiTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}




