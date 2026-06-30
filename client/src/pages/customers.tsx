import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Customer, ContactPerson, User } from "@shared/schema";
import { contactTypeLabels } from "@shared/schema";
import { fmtCurrency, fmtDate, fmtDocNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Pencil, Trash2, Phone, Mail, MapPin, AlertTriangle, UserPlus, ArrowRightLeft, Users, X, FileText, FolderOpen, TrendingUp, ExternalLink, Euro, Building2, Globe, Receipt } from "lucide-react";

const contactTypeBadgeColors: Record<string, string> = {
  kunde: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  interessent: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  lieferant: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  personal: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  sonstige: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

const colorOptions = [
  { value: "none", label: "Keine" },
  { value: "red", label: "Rot" },
  { value: "orange", label: "Orange" },
  { value: "yellow", label: "Gelb" },
  { value: "green", label: "Grün" },
  { value: "blue", label: "Blau" },
  { value: "purple", label: "Lila" },
];

const colorCssMap: Record<string, string> = {
  red: "border-l-4 border-l-red-500",
  orange: "border-l-4 border-l-orange-500",
  yellow: "border-l-4 border-l-yellow-500",
  green: "border-l-4 border-l-green-500",
  blue: "border-l-4 border-l-blue-500",
  purple: "border-l-4 border-l-purple-500",
};

function ContactPersonsSection({ customerId }: { customerId: number }) {
  const [editPerson, setEditPerson] = useState<ContactPerson | null>(null);
  const [deletePerson, setDeletePerson] = useState<ContactPerson | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    salutation: "", firstName: "", lastName: "", position: "", department: "",
    phone: "", mobile: "", fax: "", email: "", isPrimary: false,
    website: "", birthDate: "", briefAnrede: "",
  });
  const { toast } = useToast();

  const { data: persons = [] } = useQuery<ContactPerson[]>({
    queryKey: ["/api/customers", customerId, "contacts"],
    queryFn: async () => { const r = await fetch(`/api/customers/${customerId}/contacts`, { credentials: "include" }); return r.json(); },
  });

  const createMut = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest("POST", `/api/customers/${customerId}/contacts`, data); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "contacts"] }); setShowForm(false); resetForm(); toast({ title: "Ansprechpartner hinzugefügt" }); },
  });

  const updateMut = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest("PATCH", `/api/customers/${customerId}/contacts/${editPerson!.id}`, data); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "contacts"] }); setEditPerson(null); setShowForm(false); resetForm(); toast({ title: "Ansprechpartner aktualisiert" }); },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/customers/${customerId}/contacts/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "contacts"] }); setDeletePerson(null); toast({ title: "Ansprechpartner entfernt" }); },
  });

  const resetForm = () => setForm({
    salutation: "", firstName: "", lastName: "", position: "", department: "",
    phone: "", mobile: "", fax: "", email: "", isPrimary: false,
    website: "", birthDate: "", briefAnrede: "",
  });

  const startEdit = (p: ContactPerson) => {
    setEditPerson(p);
    setForm({
      salutation: p.salutation || "", firstName: p.firstName || "", lastName: p.lastName,
      position: p.position || "", department: p.department || "",
      phone: p.phone || "", mobile: p.mobile || "", fax: p.fax || "",
      email: p.email || "", isPrimary: p.isPrimary,
      website: (p as any).website || "", birthDate: (p as any).birthDate || "",
      briefAnrede: (p as any).briefAnrede || "",
    });
    setShowForm(true);
  };

  const handleSaveContact = () => {
    const data: any = { ...form };
    if (!data.birthDate) data.birthDate = null;
    editPerson ? updateMut.mutate(data) : createMut.mutate(data);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Ansprechpartner</Label>
        <Button variant="outline" size="sm" onClick={() => { resetForm(); setEditPerson(null); setShowForm(true); }} data-testid="button-add-contact-person">
          <UserPlus className="h-3 w-3 mr-1" />Neu
        </Button>
      </div>
      {persons.length > 0 && (
        <div className="space-y-1">
          {persons.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm border rounded px-2 py-1" data-testid={`contact-person-${p.id}`}>
              <div className="flex items-center gap-2">
                {p.isPrimary && <Badge variant="secondary" className="text-xs">Haupt</Badge>}
                <span>{p.salutation} {p.firstName} {p.lastName}</span>
                {p.position && <span className="text-muted-foreground">({p.position})</span>}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => startEdit(p)}><Pencil className="h-3 w-3" /></Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setDeletePerson(p)} data-testid={`button-delete-contact-person-${p.id}`}><Trash2 className="h-3 w-3 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {showForm && (
        <div className="border rounded p-3 space-y-2 bg-muted/30">
          <div className="grid grid-cols-3 gap-2">
            <div><Label className="text-xs">Anrede</Label><Input className="h-8 text-sm" value={form.salutation} onChange={(e) => setForm(f => ({ ...f, salutation: e.target.value }))} placeholder="Herr/Frau" /></div>
            <div><Label className="text-xs">Vorname</Label><Input className="h-8 text-sm" value={form.firstName} onChange={(e) => setForm(f => ({ ...f, firstName: e.target.value }))} /></div>
            <div><Label className="text-xs">Nachname *</Label><Input className="h-8 text-sm" value={form.lastName} onChange={(e) => setForm(f => ({ ...f, lastName: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Funktion</Label><Input className="h-8 text-sm" value={form.position} onChange={(e) => setForm(f => ({ ...f, position: e.target.value }))} placeholder="z.B. Geschäftsführer" /></div>
            <div><Label className="text-xs">Abteilung</Label><Input className="h-8 text-sm" value={form.department} onChange={(e) => setForm(f => ({ ...f, department: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label className="text-xs">Telefon</Label><Input className="h-8 text-sm" value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><Label className="text-xs">Mobil</Label><Input className="h-8 text-sm" value={form.mobile} onChange={(e) => setForm(f => ({ ...f, mobile: e.target.value }))} /></div>
            <div><Label className="text-xs">Fax</Label><Input className="h-8 text-sm" value={form.fax} onChange={(e) => setForm(f => ({ ...f, fax: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">E-Mail</Label><Input className="h-8 text-sm" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div><Label className="text-xs">Website</Label><Input className="h-8 text-sm" value={form.website} onChange={(e) => setForm(f => ({ ...f, website: e.target.value }))} data-testid="input-contact-website" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Geburtstag</Label><Input className="h-8 text-sm" type="date" value={form.birthDate} onChange={(e) => setForm(f => ({ ...f, birthDate: e.target.value }))} data-testid="input-contact-birthdate" /></div>
            <div><Label className="text-xs">Briefanrede</Label><Input className="h-8 text-sm" value={form.briefAnrede} onChange={(e) => setForm(f => ({ ...f, briefAnrede: e.target.value }))} placeholder="z.B. Sehr geehrter Herr Meier" data-testid="input-contact-briefanrede" /></div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.isPrimary} onCheckedChange={(v) => setForm(f => ({ ...f, isPrimary: v }))} />
            <Label className="text-xs">Hauptansprechpartner</Label>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={() => { setShowForm(false); setEditPerson(null); }}>Abbrechen</Button>
            <Button size="sm" disabled={!form.lastName} onClick={handleSaveContact} data-testid="button-save-contact-person">
              {editPerson ? "Aktualisieren" : "Hinzufügen"}
            </Button>
          </div>
        </div>
      )}
      <AlertDialog open={deletePerson !== null} onOpenChange={(open) => !open && !deleteMut.isPending && setDeletePerson(null)}>
        <AlertDialogContent data-testid="dialog-delete-contact-person">
          <AlertDialogHeader>
            <AlertDialogTitle>Ansprechpartner entfernen?</AlertDialogTitle>
            <AlertDialogDescription>
              Der Ansprechpartner wird aus dieser Adresse entfernt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending} data-testid="button-cancel-delete-contact-person">Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMut.isPending}
              onClick={() => deletePerson && deleteMut.mutate(deletePerson.id)}
              data-testid="button-confirm-delete-contact-person"
            >
              Entfernen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddressForm({ customer, onSave, onCancel }: {
  customer?: Customer;
  onSave: (data: any) => void;
  onCancel: () => void;
}) {
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: allCustomers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const isNew = !customer;
  const { data: nextCustomerNumber } = useQuery<{ number: string }>({
    queryKey: ["/api/customers/next-number"],
    enabled: isNew,
  });

  const [form, setForm] = useState({
    contactType: customer?.contactType || "kunde",
    customerNumber: customer?.customerNumber || "",
    searchKey: customer?.searchKey || "",
    salutation: customer?.salutation || "",
    name: customer?.name || "",
    name2: customer?.name2 || "",
    street: customer?.street || "",
    zip: customer?.zip || "",
    city: customer?.city || "",
    country: customer?.country || "",
    phone: customer?.phone || "",
    fax: customer?.fax || "",
    mobile: customer?.mobile || "",
    email: customer?.email || "",
    website: customer?.website || "",
    isBusiness: customer?.isBusiness ?? true,
    taxId: customer?.taxId || "",
    iban: customer?.iban || "",
    bic: customer?.bic || "",
    bank: customer?.bank || "",
    paymentTermDays: customer?.paymentTermDays ?? 14,
    skontoDays: customer?.skontoDays ?? 5,
    skontoPercent: customer?.skontoPercent || "2.00",
    discount: customer?.discount || "0.00",
    notes: customer?.notes || "",
    colorCode: customer?.colorCode || "none",
    alertText: customer?.alertText || "",
    ourCustomerNumber: customer?.ourCustomerNumber || "",
    supplierDiscount: customer?.supplierDiscount || "0.00",
    vacationDaysPerYear: customer?.vacationDaysPerYear ?? 30,
    employeeNumber: customer?.employeeNumber || "",
    birthDate: customer?.birthDate || "",
    entryDate: customer?.entryDate || "",
    exitDate: customer?.exitDate || "",
    deliveryStreet: customer?.deliveryStreet || "",
    deliveryZip: customer?.deliveryZip || "",
    deliveryCity: customer?.deliveryCity || "",
    invoiceStreet: customer?.invoiceStreet || "",
    invoiceZip: customer?.invoiceZip || "",
    invoiceCity: customer?.invoiceCity || "",
    branche: customer?.branche || "",
    typ: customer?.typ || "",
    accountHolder: customer?.accountHolder || "",
    grossInvoicing: customer?.grossInvoicing ?? false,
    noReminder: customer?.noReminder ?? false,
    revenueAccount: customer?.revenueAccount || "",
    representativeId: customer?.representativeId || 0,
    referrerId: customer?.referrerId || 0,
  });

  useEffect(() => {
    if (isNew && form.contactType === "kunde" && nextCustomerNumber?.number && !form.customerNumber) {
      setForm((f) => ({ ...f, customerNumber: nextCustomerNumber.number }));
    }
  }, [isNew, form.contactType, form.customerNumber, nextCustomerNumber?.number]);

  const update = (field: string, value: any) => setForm((f) => ({ ...f, [field]: value }));
  const ct = form.contactType;

  const handleSave = () => {
    const data: any = { ...form };
    if (data.colorCode === "none") data.colorCode = "";
    if (!data.birthDate) data.birthDate = null;
    if (!data.entryDate) data.entryDate = null;
    if (!data.exitDate) data.exitDate = null;
    if (!data.country) data.country = null;
    if (!data.colorCode) data.colorCode = null;
    if (!data.alertText) data.alertText = null;
    if (!data.ourCustomerNumber) data.ourCustomerNumber = null;
    if (!data.supplierDiscount || data.supplierDiscount === "0.00") data.supplierDiscount = null;
    if (!data.employeeNumber) data.employeeNumber = null;
    if (!data.deliveryStreet) data.deliveryStreet = null;
    if (!data.deliveryZip) data.deliveryZip = null;
    if (!data.deliveryCity) data.deliveryCity = null;
    if (!data.invoiceStreet) data.invoiceStreet = null;
    if (!data.invoiceZip) data.invoiceZip = null;
    if (!data.invoiceCity) data.invoiceCity = null;
    if (!data.vacationDaysPerYear) data.vacationDaysPerYear = null;
    if (!data.branche) data.branche = null;
    if (!data.typ) data.typ = null;
    if (!data.accountHolder) data.accountHolder = null;
    if (!data.revenueAccount) data.revenueAccount = null;
    if (!data.representativeId) data.representativeId = null;
    if (!data.referrerId) data.referrerId = null;
    onSave(data);
  };

  return (
    <div className="max-h-[75vh] overflow-y-auto pr-2">
      <Tabs defaultValue="stamm" className="w-full">
        <TabsList className="grid w-full grid-cols-5 mb-4">
          <TabsTrigger value="stamm">Stammdaten</TabsTrigger>
          <TabsTrigger value="bereich">
            {ct === "lieferant" ? "Lieferantendaten" : ct === "personal" ? "Personaldaten" : "Kundendaten"}
          </TabsTrigger>
          <TabsTrigger value="bank">Bank</TabsTrigger>
          <TabsTrigger value="ansprech">Ansprechpartner</TabsTrigger>
          <TabsTrigger value="sonstiges">Sonstiges</TabsTrigger>
        </TabsList>

        <TabsContent value="stamm" className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Bereich *</Label>
              <Select value={form.contactType} onValueChange={(v) => update("contactType", v)} data-testid="select-contact-type">
                <SelectTrigger data-testid="trigger-contact-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="kunde">Kunde</SelectItem>
                  <SelectItem value="interessent">Interessent</SelectItem>
                  <SelectItem value="lieferant">Lieferant</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="sonstige">Sonstige</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nummer *</Label>
              <Input className="h-9" data-testid="input-customer-number" value={form.customerNumber} onChange={(e) => update("customerNumber", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Suchbegriff *</Label>
              <Input className="h-9" data-testid="input-search-key" value={form.searchKey} onChange={(e) => update("searchKey", e.target.value.toUpperCase())} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Anrede</Label>
              <Input className="h-9" data-testid="input-salutation" value={form.salutation} onChange={(e) => update("salutation", e.target.value)} placeholder="Herr / Frau / Firma" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Name / Firma *</Label>
              <Input className="h-9" data-testid="input-customer-name" value={form.name} onChange={(e) => update("name", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Name 2 / Zusatz</Label>
              <Input className="h-9" data-testid="input-customer-name2" value={form.name2} onChange={(e) => update("name2", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Straße</Label>
              <Input className="h-9" data-testid="input-street" value={form.street} onChange={(e) => update("street", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">PLZ</Label>
              <Input className="h-9" data-testid="input-zip" value={form.zip} onChange={(e) => update("zip", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ort</Label>
              <Input className="h-9" data-testid="input-city" value={form.city} onChange={(e) => update("city", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Land</Label>
              <Input className="h-9" value={form.country} onChange={(e) => update("country", e.target.value)} placeholder="Deutschland" data-testid="input-country" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Telefon</Label>
              <Input className="h-9" data-testid="input-phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mobil / Funk</Label>
              <Input className="h-9" data-testid="input-mobile" value={form.mobile} onChange={(e) => update("mobile", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fax</Label>
              <Input className="h-9" data-testid="input-fax" value={form.fax} onChange={(e) => update("fax", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">E-Mail</Label>
              <Input className="h-9" data-testid="input-email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Website</Label>
              <Input className="h-9" value={form.website} onChange={(e) => update("website", e.target.value)} data-testid="input-website" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">USt-IdNr. / Steuernummer</Label>
              <Input className="h-9" value={form.taxId} onChange={(e) => update("taxId", e.target.value)} data-testid="input-tax-id" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Branche</Label>
              <Input className="h-9" value={form.branche} onChange={(e) => update("branche", e.target.value)} placeholder="z.B. Handwerk, Handel..." data-testid="input-branche" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Typ</Label>
              <Input className="h-9" value={form.typ} onChange={(e) => update("typ", e.target.value)} placeholder="z.B. Stammkunde, Gelegenheit..." data-testid="input-typ" />
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Switch data-testid="switch-business" checked={form.isBusiness} onCheckedChange={(v) => update("isBusiness", v)} />
              <Label className="text-xs">Gewerblich</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch data-testid="switch-gross-invoicing" checked={form.grossInvoicing} onCheckedChange={(v) => update("grossInvoicing", v)} />
              <Label className="text-xs">Brutto-Fakturierung</Label>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="bereich" className="space-y-3">
          {(ct === "kunde" || ct === "interessent" || ct === "sonstige") && (
            <>
              <h4 className="text-sm font-semibold">Konditionen</h4>
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Rabatt %</Label>
                  <Input className="h-9" data-testid="input-discount" value={form.discount} onChange={(e) => update("discount", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Zahlungsziel (Tage)</Label>
                  <Input className="h-9" data-testid="input-payment-term" type="number" value={form.paymentTermDays} onChange={(e) => update("paymentTermDays", parseInt(e.target.value) || 0)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Skonto-Tage</Label>
                  <Input className="h-9" data-testid="input-skonto-days" type="number" value={form.skontoDays} onChange={(e) => update("skontoDays", parseInt(e.target.value) || 0)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Skonto %</Label>
                  <Input className="h-9" data-testid="input-skonto-percent" value={form.skontoPercent} onChange={(e) => update("skontoPercent", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Erlöskonto</Label>
                  <Input className="h-9" value={form.revenueAccount} onChange={(e) => update("revenueAccount", e.target.value)} data-testid="input-revenue-account" />
                </div>
                <div className="flex items-center space-x-2 pt-5">
                  <Switch data-testid="switch-no-reminder" checked={form.noReminder} onCheckedChange={(v) => update("noReminder", v)} />
                  <Label className="text-xs">Nicht mahnen</Label>
                </div>
              </div>
              {(ct === "kunde" || ct === "interessent") && (
                <>
                  <h4 className="text-sm font-semibold mt-4">Abweichende Lieferanschrift</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Straße</Label>
                      <Input className="h-9" value={form.deliveryStreet} onChange={(e) => update("deliveryStreet", e.target.value)} data-testid="input-delivery-street" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">PLZ</Label>
                      <Input className="h-9" value={form.deliveryZip} onChange={(e) => update("deliveryZip", e.target.value)} data-testid="input-delivery-zip" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ort</Label>
                      <Input className="h-9" value={form.deliveryCity} onChange={(e) => update("deliveryCity", e.target.value)} data-testid="input-delivery-city" />
                    </div>
                  </div>
                  <h4 className="text-sm font-semibold mt-4">Abweichende Rechnungsanschrift</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Straße</Label>
                      <Input className="h-9" value={form.invoiceStreet} onChange={(e) => update("invoiceStreet", e.target.value)} data-testid="input-invoice-street" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">PLZ</Label>
                      <Input className="h-9" value={form.invoiceZip} onChange={(e) => update("invoiceZip", e.target.value)} data-testid="input-invoice-zip" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Ort</Label>
                      <Input className="h-9" value={form.invoiceCity} onChange={(e) => update("invoiceCity", e.target.value)} data-testid="input-invoice-city" />
                    </div>
                  </div>
                </>
              )}
            </>
          )}
          {ct === "lieferant" && (
            <>
              <h4 className="text-sm font-semibold">Lieferantendaten</h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Unsere Kd.-Nr. beim Lieferanten</Label>
                  <Input className="h-9" data-testid="input-our-number" value={form.ourCustomerNumber} onChange={(e) => update("ourCustomerNumber", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Rabatt %</Label>
                  <Input className="h-9" value={form.supplierDiscount} onChange={(e) => update("supplierDiscount", e.target.value)} data-testid="input-supplier-discount" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Zahlungsziel (Tage)</Label>
                  <Input className="h-9" type="number" value={form.paymentTermDays} onChange={(e) => update("paymentTermDays", parseInt(e.target.value) || 0)} data-testid="input-lieferant-payment-term" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Skonto-Tage</Label>
                  <Input className="h-9" type="number" value={form.skontoDays} onChange={(e) => update("skontoDays", parseInt(e.target.value) || 0)} data-testid="input-lieferant-skonto-days" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Skonto %</Label>
                  <Input className="h-9" value={form.skontoPercent} onChange={(e) => update("skontoPercent", e.target.value)} data-testid="input-lieferant-skonto-percent" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Erlöskonto</Label>
                  <Input className="h-9" value={form.revenueAccount} onChange={(e) => update("revenueAccount", e.target.value)} data-testid="input-lieferant-revenue-account" />
                </div>
              </div>
            </>
          )}
          {ct === "personal" && (
            <>
              <h4 className="text-sm font-semibold">Personaldaten</h4>
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Personalnummer</Label>
                  <Input className="h-9" data-testid="input-employee-number" value={form.employeeNumber} onChange={(e) => update("employeeNumber", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Geburtsdatum</Label>
                  <Input className="h-9" type="date" value={form.birthDate} onChange={(e) => update("birthDate", e.target.value)} data-testid="input-birth-date" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Eintrittsdatum</Label>
                  <Input className="h-9" type="date" value={form.entryDate} onChange={(e) => update("entryDate", e.target.value)} data-testid="input-entry-date" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Austrittsdatum</Label>
                  <Input className="h-9" type="date" value={form.exitDate} onChange={(e) => update("exitDate", e.target.value)} data-testid="input-exit-date" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Urlaubsanspruch (Tage/Jahr)</Label>
                  <Input className="h-9" type="number" value={form.vacationDaysPerYear} onChange={(e) => update("vacationDaysPerYear", parseInt(e.target.value) || 0)} data-testid="input-vacation-days" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Zahlungsziel (Tage)</Label>
                  <Input className="h-9" type="number" value={form.paymentTermDays} onChange={(e) => update("paymentTermDays", parseInt(e.target.value) || 0)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Erlöskonto</Label>
                  <Input className="h-9" value={form.revenueAccount} onChange={(e) => update("revenueAccount", e.target.value)} />
                </div>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="bank" className="space-y-3">
          <h4 className="text-sm font-semibold">Bankverbindung</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">IBAN</Label>
              <Input className="h-9" data-testid="input-iban" value={form.iban} onChange={(e) => update("iban", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">BIC / SWIFT</Label>
              <Input className="h-9" data-testid="input-bic" value={form.bic} onChange={(e) => update("bic", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Bank / Kreditinstitut</Label>
              <Input className="h-9" data-testid="input-bank" value={form.bank} onChange={(e) => update("bank", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kontoinhaber</Label>
              <Input className="h-9" data-testid="input-account-holder" value={form.accountHolder} onChange={(e) => update("accountHolder", e.target.value)} placeholder="Falls abweichend vom Adressnamen" />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="ansprech">
          {customer?.id ? (
            <ContactPersonsSection customerId={customer.id} />
          ) : (
            <div className="text-sm text-muted-foreground py-4">Bitte erst die Adresse speichern, dann können Ansprechpartner hinzugefügt werden.</div>
          )}
        </TabsContent>

        <TabsContent value="sonstiges" className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Farbkennzeichen</Label>
              <Select value={form.colorCode || "none"} onValueChange={(v) => update("colorCode", v)}>
                <SelectTrigger data-testid="select-color-code"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {colorOptions.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vertreter (intern)</Label>
              <Select value={String(form.representativeId || "0")} onValueChange={(v) => update("representativeId", parseInt(v) || 0)}>
                <SelectTrigger data-testid="select-representative"><SelectValue placeholder="Kein Vertreter" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Kein Vertreter</SelectItem>
                  {users.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.fullName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Vermittler (Adresse)</Label>
              <Select value={String(form.referrerId || "0")} onValueChange={(v) => update("referrerId", parseInt(v) || 0)}>
                <SelectTrigger data-testid="select-referrer"><SelectValue placeholder="Kein Vermittler" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Kein Vermittler</SelectItem>
                  {allCustomers.filter(c => customer ? c.id !== customer.id : true).map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name} ({c.customerNumber})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-500" />Meldetext (erscheint automatisch bei Auswahl)</Label>
            <Textarea className="text-sm" rows={2} value={form.alertText} onChange={(e) => update("alertText", e.target.value)} placeholder="z.B. Säumiger Zahler, Bonität prüfen..." data-testid="input-alert-text" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Bemerkungen</Label>
            <Textarea className="text-sm" rows={4} value={form.notes} onChange={(e) => update("notes", e.target.value)} data-testid="input-notes" />
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex gap-2 justify-end pt-4 border-t mt-4">
        <Button variant="secondary" onClick={onCancel} data-testid="button-cancel">Abbrechen</Button>
        <Button onClick={handleSave} data-testid="button-save-customer">Speichern</Button>
      </div>
    </div>
  );
}

const docTypeLabels: Record<string, string> = {
  angebot: "Angebot", auftragsbestaetigung: "AB", rechnung: "Rechnung",
  abschlagsrechnung: "AR", gutschrift: "Gutschrift",
  lieferschein: "LS", freies_dokument: "Frei", mitschnitt: "Mitschn.",
};

const docStatusColors: Record<string, string> = {
  entwurf: "bg-gray-100 text-gray-800", gesendet: "bg-blue-100 text-blue-800",
  beauftragt: "bg-green-100 text-green-800", bezahlt: "bg-green-100 text-green-800",
  teilbezahlt: "bg-yellow-100 text-yellow-800", storniert: "bg-red-100 text-red-800",
};

function CustomerDetailPanel({ customer, onClose, onEdit }: { customer: Customer; onClose: () => void; onEdit: () => void }) {
  const [, setLocation] = useLocation();

  const { data: related, isLoading } = useQuery<{
    documents: any[]; projects: any[]; incomingInvoices: any[]; stats: any;
  }>({
    queryKey: ["/api/customers", customer.id, "related"],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${customer.id}/related`, { credentials: "include" });
      if (!res.ok) throw new Error("Fehler");
      return res.json();
    },
  });

  const stats = related?.stats;

  return (
    <div className="w-[420px] border-l bg-background flex flex-col h-full overflow-hidden" data-testid="customer-detail-panel">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 className="h-5 w-5 text-primary flex-shrink-0" />
          <div className="min-w-0">
            <h3 className="font-bold text-sm truncate" data-testid="text-detail-name">{customer.name}</h3>
            {customer.name2 && <p className="text-xs text-muted-foreground truncate">{customer.name2}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={onEdit} title="Bearbeiten" data-testid="button-detail-edit">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-detail-close">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Badge className={`text-xs ${contactTypeBadgeColors[customer.contactType] || ""}`}>
              {contactTypeLabels[customer.contactType] || customer.contactType}
            </Badge>
            <span className="text-xs text-muted-foreground font-mono">Nr. {customer.customerNumber}</span>
          </div>

          <div className="space-y-1.5 text-sm">
            {(customer.street || customer.city) && (
              <div className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>{customer.street}{customer.street && customer.city ? ", " : ""}{customer.zip} {customer.city}</span>
              </div>
            )}
            {customer.phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                <a href={`tel:${customer.phone}`} className="hover:text-primary hover:underline">{customer.phone}</a>
              </div>
            )}
            {customer.email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                <a href={`mailto:${customer.email}`} className="hover:text-primary hover:underline truncate">{customer.email}</a>
              </div>
            )}
            {customer.website && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Globe className="h-3.5 w-3.5 flex-shrink-0" />
                <a href={customer.website.startsWith("http") ? customer.website : `https://${customer.website}`} target="_blank" rel="noreferrer" className="hover:text-primary hover:underline truncate">{customer.website}</a>
              </div>
            )}
          </div>

          {customer.alertText && (
            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md p-2 text-xs text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>{customer.alertText}</span>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : stats && (
            <>
              <div className="grid grid-cols-2 gap-2" data-testid="customer-stats">
                <Card className="shadow-none">
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">Umsatz</p>
                    <p className="text-sm font-bold text-green-600" data-testid="text-customer-umsatz">{fmtCurrency(stats.umsatzBrutto)}</p>
                  </CardContent>
                </Card>
                <Card className="shadow-none">
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold">Offen</p>
                    <p className="text-sm font-bold text-orange-600" data-testid="text-customer-offen">
                      {stats.offeneRechnungen > 0 ? `${stats.offeneRechnungen} Rechn.` : "—"}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {related!.projects.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase">Projekte ({related!.projects.length})</span>
                  </div>
                  <div className="space-y-1">
                    {related!.projects.map((p: any) => (
                      <button
                        key={p.id}
                        className="w-full text-left px-2 py-1.5 rounded-md hover:bg-muted transition-colors text-sm flex items-center justify-between group"
                        onClick={() => setLocation(`/projekte?id=${p.id}`)}
                        data-testid={`link-project-${p.id}`}
                      >
                        <div className="min-w-0">
                          <span className="font-mono text-xs text-muted-foreground mr-1.5">{fmtDocNumber(p.projectNumber)}</span>
                          <span className="truncate">{p.name}</span>
                        </div>
                        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {related!.documents.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase">Dokumente ({related!.documents.length})</span>
                  </div>
                  <div className="space-y-1">
                    {related!.documents.map((d: any) => (
                      <button
                        key={d.id}
                        className="w-full text-left px-2 py-1.5 rounded-md hover:bg-muted transition-colors text-sm flex items-center justify-between group"
                        onClick={() => setLocation(`/dokumente/${d.id}/bearbeiten`)}
                        data-testid={`link-doc-${d.id}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge className={`text-[9px] px-1 py-0 ${docStatusColors[d.status] || "bg-gray-100 text-gray-800"}`}>
                            {d.customTypeLabel || docTypeLabels[d.type] || d.type}
                          </Badge>
                          <span className="font-mono text-xs">{fmtDocNumber(d.documentNumber)}</span>
                          {d.grossTotal > 0 && <span className="text-xs text-muted-foreground">{fmtCurrency(d.grossTotal)}</span>}
                        </div>
                        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {related!.incomingInvoices.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase">Rechnungseingang ({related!.incomingInvoices.length})</span>
                  </div>
                  <div className="space-y-1">
                    {related!.incomingInvoices.map((inv: any) => (
                      <button
                        key={`${inv.source || "manual"}-${inv.id}`}
                        className="w-full text-left px-2 py-1.5 rounded-md hover:bg-muted transition-colors text-sm flex items-center justify-between group"
                        onClick={() => setLocation("/rechnungseingang")}
                        data-testid={`link-incoming-${inv.source || "manual"}-${inv.id}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge className={`text-[9px] px-1 py-0 ${inv.source === "fibu" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"}`}>
                            {inv.source === "fibu" ? "RE" : "MAN"}
                          </Badge>
                          <span className="font-mono text-xs">{inv.invoiceNumber || "ohne Nr."}</span>
                          {inv.grossTotal > 0 && <span className="text-xs text-muted-foreground">{fmtCurrency(inv.grossTotal)}</span>}
                        </div>
                        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {related!.documents.length === 0 && related!.projects.length === 0 && related!.incomingInvoices.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Keine verknüpften Daten</p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="border-t p-3 flex gap-2">
        <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => setLocation(`/dokumente/neu?customerId=${customer.id}`)} data-testid="button-new-doc-for-customer">
          <FileText className="h-3.5 w-3.5 mr-1" />Neues Dokument
        </Button>
        <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => setLocation(`/projekte?newProject=1&customerId=${customer.id}`)} data-testid="button-new-project-for-customer">
          <FolderOpen className="h-3.5 w-3.5 mr-1" />Neues Projekt
        </Button>
      </div>
    </div>
  );
}

export default function AddressStammPage() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("alle");
  const [editCustomer, setEditCustomer] = useState<Customer | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [deleteCustomer, setDeleteCustomer] = useState<Customer | null>(null);
  const [convertCustomer, setConvertCustomer] = useState<Customer | null>(null);
  const { toast } = useToast();

  const { data: allCustomers, isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  useEffect(() => {
    if (!allCustomers) return;
    const params = new URLSearchParams(window.location.search);
    const selectedId = params.get("selected");
    const selectedNr = params.get("selected_nr");
    const searchParam = params.get("search");
    if (selectedId) {
      const found = allCustomers.find((c) => c.id === Number(selectedId));
      if (found) setSelectedCustomer(found);
    } else if (selectedNr) {
      const found = allCustomers.find((c) => c.customerNumber === selectedNr);
      if (found) setSelectedCustomer(found);
    } else if (searchParam) {
      setSearch(searchParam);
      const lower = searchParam.toLowerCase();
      const found = allCustomers.find((c) =>
        c.customerNumber?.toLowerCase() === lower ||
        c.name?.toLowerCase() === lower ||
        c.searchKey?.toLowerCase() === lower
      );
      if (found) setSelectedCustomer(found);
    }
    if (selectedId || selectedNr || searchParam) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [allCustomers]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/customers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setDialogOpen(false);
      toast({ title: "Adresse erstellt" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/customers/${editCustomer!.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setDialogOpen(false);
      setEditCustomer(undefined);
      toast({ title: "Adresse aktualisiert" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/customers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setDeleteCustomer(null);
      setSelectedCustomer(null);
      toast({ title: "Adresse gelöscht" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const convertMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/customers/${id}/convert-to-kunde`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setConvertCustomer(null);
      toast({ title: "Interessent in Kunde umgewandelt" });
    },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const filtered = allCustomers?.filter((c) => {
    if (activeTab !== "alle" && c.contactType !== activeTab) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return c.name.toLowerCase().includes(s) ||
      c.searchKey.toLowerCase().includes(s) ||
      c.customerNumber.includes(s) ||
      c.city?.toLowerCase().includes(s) ||
      c.email?.toLowerCase().includes(s) ||
      c.phone?.replace(/[\/\-\s]/g, "").includes(s.replace(/[\/\-\s]/g, ""));
  });

  const counts = {
    alle: allCustomers?.length || 0,
    kunde: allCustomers?.filter(c => c.contactType === "kunde").length || 0,
    interessent: allCustomers?.filter(c => c.contactType === "interessent").length || 0,
    lieferant: allCustomers?.filter(c => c.contactType === "lieferant").length || 0,
    personal: allCustomers?.filter(c => c.contactType === "personal").length || 0,
    sonstige: allCustomers?.filter(c => c.contactType === "sonstige").length || 0,
  };

  return (
    <div className="flex h-[calc(100vh-3rem)]">
    <div className={`flex-1 p-6 space-y-4 overflow-y-auto ${selectedCustomer ? "border-r" : ""}`}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-customers-title">
            <Users className="h-6 w-6" />Adress-Stamm
          </h1>
          <p className="text-muted-foreground text-sm">{counts.alle} Adressen gesamt</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditCustomer(undefined); }}>
          <Button onClick={() => { setEditCustomer(undefined); setDialogOpen(true); }} data-testid="button-new-customer">
            <Plus className="h-4 w-4 mr-2" />Neue Adresse
          </Button>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>{editCustomer ? "Adresse bearbeiten" : "Neue Adresse"}</DialogTitle>
              <DialogDescription>
                {editCustomer ? `${contactTypeLabels[editCustomer.contactType] || "Adresse"} bearbeiten` : "Neue Adresse im Adress-Stamm anlegen"}
              </DialogDescription>
            </DialogHeader>
            <AddressForm
              customer={editCustomer}
              onSave={(data) => editCustomer ? updateMutation.mutate(data) : createMutation.mutate(data)}
              onCancel={() => { setDialogOpen(false); setEditCustomer(undefined); }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList data-testid="tabs-contact-type">
            <TabsTrigger value="alle" data-testid="tab-alle">Alle ({counts.alle})</TabsTrigger>
            <TabsTrigger value="kunde" data-testid="tab-kunde">Kunden ({counts.kunde})</TabsTrigger>
            <TabsTrigger value="interessent" data-testid="tab-interessent">Interessenten ({counts.interessent})</TabsTrigger>
            <TabsTrigger value="lieferant" data-testid="tab-lieferant">Lieferanten ({counts.lieferant})</TabsTrigger>
            <TabsTrigger value="personal" data-testid="tab-personal">Personal ({counts.personal})</TabsTrigger>
            <TabsTrigger value="sonstige" data-testid="tab-sonstige">Sonstige ({counts.sonstige})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-10"
          placeholder="Adressen suchen (Name, Nr., Ort, E-Mail, Telefon)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="input-search-customers"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">Nr.</TableHead>
                  <TableHead className="w-[100px]">Bereich</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Ort</TableHead>
                  <TableHead className="hidden lg:table-cell">Telefon</TableHead>
                  <TableHead className="hidden lg:table-cell">E-Mail</TableHead>
                  <TableHead className="text-right w-[140px]">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Keine Adressen gefunden
                    </TableCell>
                  </TableRow>
                )}
                {filtered?.map((c) => (
                  <TableRow
                    key={c.id}
                    className={`cursor-pointer hover:bg-muted/50 ${c.colorCode ? colorCssMap[c.colorCode] || "" : ""} ${selectedCustomer?.id === c.id ? "bg-muted" : ""}`}
                    onClick={() => setSelectedCustomer(selectedCustomer?.id === c.id ? null : c)}
                    data-testid={`row-customer-${c.id}`}
                  >
                    <TableCell className="font-mono text-xs">{c.customerNumber}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`text-xs ${contactTypeBadgeColors[c.contactType] || ""}`} data-testid={`badge-type-${c.id}`}>
                        {contactTypeLabels[c.contactType] || c.contactType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div>
                          <span className="font-medium">{c.name}</span>
                          {c.name2 && <span className="text-sm text-muted-foreground ml-2">{c.name2}</span>}
                        </div>
                        {c.alertText && (
                          <span title={c.alertText}>
                            <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {c.city && <span className="flex items-center gap-1 text-sm"><MapPin className="h-3 w-3" />{c.zip} {c.city}</span>}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {c.phone && <span className="flex items-center gap-1 text-sm"><Phone className="h-3 w-3" />{c.phone}</span>}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {c.email && <span className="flex items-center gap-1 text-sm"><Mail className="h-3 w-3" />{c.email}</span>}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1 justify-end">
                        {c.contactType === "interessent" && (
                          <Button variant="ghost" size="sm" title="In Kunde umwandeln" onClick={() => setConvertCustomer(c)} data-testid={`button-convert-${c.id}`}>
                            <ArrowRightLeft className="h-4 w-4 text-blue-600" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => { setEditCustomer(c); setDialogOpen(true); }} data-testid={`button-edit-customer-${c.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteCustomer(c)} data-testid={`button-delete-customer-${c.id}`}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
    {selectedCustomer && (
      <CustomerDetailPanel
        customer={selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
        onEdit={() => { setEditCustomer(selectedCustomer); setDialogOpen(true); }}
      />
    )}
    <AlertDialog open={convertCustomer !== null} onOpenChange={(open) => !open && !convertMutation.isPending && setConvertCustomer(null)}>
      <AlertDialogContent data-testid="dialog-convert-customer">
        <AlertDialogHeader>
          <AlertDialogTitle>Interessent umwandeln?</AlertDialogTitle>
          <AlertDialogDescription>
            {convertCustomer ? `"${convertCustomer.name}"` : "Diese Adresse"} wird als Kunde gefuehrt.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={convertMutation.isPending} data-testid="button-cancel-convert-customer">Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            disabled={convertMutation.isPending}
            onClick={() => convertCustomer && convertMutation.mutate(convertCustomer.id)}
            data-testid="button-confirm-convert-customer"
          >
            Umwandeln
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={deleteCustomer !== null} onOpenChange={(open) => !open && !deleteMutation.isPending && setDeleteCustomer(null)}>
      <AlertDialogContent data-testid="dialog-delete-customer">
        <AlertDialogHeader>
          <AlertDialogTitle>Adresse loeschen?</AlertDialogTitle>
          <AlertDialogDescription>
            {deleteCustomer ? `"${deleteCustomer.name}"` : "Diese Adresse"} wird dauerhaft entfernt.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending} data-testid="button-cancel-delete-customer">Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteMutation.isPending}
            onClick={() => deleteCustomer && deleteMutation.mutate(deleteCustomer.id)}
            data-testid="button-confirm-delete-customer"
          >
            Loeschen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </div>
  );
}
