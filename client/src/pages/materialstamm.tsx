import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fmtDate, fmtCurrency } from "@/lib/format";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Pencil, Trash2, Loader2, Package, Layers, AlertTriangle, Search,
  Hash, MapPin, Barcode,
} from "lucide-react";

type Material = {
  id: number;
  name: string;
  articleNumber: string;
  description: string;
  unit: string;
  purchasePrice: string;
  salePrice: string;
  category: string;
  supplier: string;
  minStock: number;
  currentStock: number;
  location: string;
  status: string;
  notes: string;
};

type SerialNumber = {
  id: number;
  serialNumber: string;
  materialId: number | null;
  materialNumber: string;
  materialName: string;
  entryDate: string;
  location: string;
  incomingInvoice: string;
  deliveryNote: string;
  supplier: string;
  customerId: number | null;
  customerName: string;
  saleDocument: string;
  saleDate: string;
  history: string;
  createdAt: string;
};

function MaterialFormDialog({ material, open, onOpenChange }: {
  material?: Material;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const isEdit = !!material;

  const [form, setForm] = useState({
    name: material?.name || "",
    articleNumber: material?.articleNumber || "",
    description: material?.description || "",
    unit: material?.unit || "Stk",
    purchasePrice: material?.purchasePrice || "0.00",
    salePrice: material?.salePrice || "0.00",
    category: material?.category || "",
    supplier: material?.supplier || "",
    minStock: material?.minStock ?? 0,
    currentStock: material?.currentStock ?? 0,
    location: material?.location || "",
    status: material?.status || "active",
    notes: material?.notes || "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        await apiRequest("PATCH", `/api/materials/${material.id}`, form);
      } else {
        await apiRequest("POST", "/api/materials", form);
      }
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Material aktualisiert" : "Material erstellt" });
      queryClient.invalidateQueries({ queryKey: ["/api/materials"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const update = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title-material">
            {isEdit ? "Material bearbeiten" : "Neues Material"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Artikelnummer</Label>
              <Input data-testid="input-article-number" value={form.articleNumber} onChange={e => update("articleNumber", e.target.value)} />
            </div>
            <div>
              <Label>Name</Label>
              <Input data-testid="input-material-name" value={form.name} onChange={e => update("name", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Beschreibung</Label>
            <Input data-testid="input-description" value={form.description} onChange={e => update("description", e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Einheit</Label>
              <Select value={form.unit} onValueChange={v => update("unit", v)}>
                <SelectTrigger data-testid="select-unit"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Stk", "m", "m²", "m³", "kg", "l", "Paar", "Set", "Psch"].map(u => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>EK-Preis</Label>
              <Input data-testid="input-purchase-price" type="number" step="0.01" value={form.purchasePrice} onChange={e => update("purchasePrice", e.target.value)} className="text-right" />
            </div>
            <div>
              <Label>VK-Preis</Label>
              <Input data-testid="input-sale-price" type="number" step="0.01" value={form.salePrice} onChange={e => update("salePrice", e.target.value)} className="text-right" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Warengruppe</Label>
              <Input data-testid="input-category" value={form.category} onChange={e => update("category", e.target.value)} />
            </div>
            <div>
              <Label>Lieferant</Label>
              <Input data-testid="input-supplier" value={form.supplier} onChange={e => update("supplier", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Mindestbestand</Label>
              <Input data-testid="input-min-stock" type="number" value={form.minStock} onChange={e => update("minStock", parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Aktueller Bestand</Label>
              <Input data-testid="input-current-stock" type="number" value={form.currentStock} onChange={e => update("currentStock", parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <Label>Lagerort</Label>
              <Input data-testid="input-location" value={form.location} onChange={e => update("location", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => update("status", v)}>
                <SelectTrigger data-testid="select-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktiv</SelectItem>
                  <SelectItem value="inactive">Inaktiv</SelectItem>
                  <SelectItem value="discontinued">Auslauf</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notizen</Label>
              <Input data-testid="input-notes" value={form.notes} onChange={e => update("notes", e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-material">Abbrechen</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.name} data-testid="button-save-material">
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Speichern" : "Erstellen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SerialFormDialog({ serial, open, onOpenChange }: {
  serial?: SerialNumber;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const isEdit = !!serial;

  const [form, setForm] = useState({
    serialNumber: serial?.serialNumber || "",
    materialNumber: serial?.materialNumber || "",
    materialName: serial?.materialName || "",
    entryDate: serial?.entryDate || new Date().toISOString().split("T")[0],
    location: serial?.location || "",
    incomingInvoice: serial?.incomingInvoice || "",
    deliveryNote: serial?.deliveryNote || "",
    supplier: serial?.supplier || "",
    customerName: serial?.customerName || "",
    saleDocument: serial?.saleDocument || "",
    saleDate: serial?.saleDate || "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        await apiRequest("PATCH", `/api/serial-numbers/${serial.id}`, form);
      } else {
        await apiRequest("POST", "/api/serial-numbers", form);
      }
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Seriennummer aktualisiert" : "Seriennummer erstellt" });
      queryClient.invalidateQueries({ queryKey: ["/api/serial-numbers"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const update = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title-serial">
            {isEdit ? "Seriennummer bearbeiten" : "Neue Seriennummer"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Seriennummer</Label>
              <Input data-testid="input-serial-number" value={form.serialNumber} onChange={e => update("serialNumber", e.target.value)} />
            </div>
            <div>
              <Label>Material-Nr.</Label>
              <Input data-testid="input-material-number" value={form.materialNumber} onChange={e => update("materialNumber", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Materialname</Label>
            <Input data-testid="input-material-name-serial" value={form.materialName} onChange={e => update("materialName", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Eingangsdatum</Label>
              <Input data-testid="input-entry-date" type="date" value={form.entryDate} onChange={e => update("entryDate", e.target.value)} />
            </div>
            <div>
              <Label>Lagerort</Label>
              <Input data-testid="input-serial-location" value={form.location} onChange={e => update("location", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Eingangsrechnung</Label>
              <Input data-testid="input-incoming-invoice" value={form.incomingInvoice} onChange={e => update("incomingInvoice", e.target.value)} />
            </div>
            <div>
              <Label>Lieferschein</Label>
              <Input data-testid="input-delivery-note" value={form.deliveryNote} onChange={e => update("deliveryNote", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Lieferant</Label>
              <Input data-testid="input-serial-supplier" value={form.supplier} onChange={e => update("supplier", e.target.value)} />
            </div>
            <div>
              <Label>Kunde</Label>
              <Input data-testid="input-customer-name" value={form.customerName} onChange={e => update("customerName", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Verkaufsbeleg</Label>
              <Input data-testid="input-sale-document" value={form.saleDocument} onChange={e => update("saleDocument", e.target.value)} />
            </div>
            <div>
              <Label>Verkaufsdatum</Label>
              <Input data-testid="input-sale-date" type="date" value={form.saleDate} onChange={e => update("saleDate", e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-serial">Abbrechen</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.serialNumber} data-testid="button-save-serial">
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Speichern" : "Erstellen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function MaterialstammPage() {
  const [activeTab, setActiveTab] = useState("materialstamm");
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [matPage, setMatPage] = useState(1);
  const [locationFilter, setLocationFilter] = useState("");
  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [editMaterial, setEditMaterial] = useState<Material | undefined>();
  const [deleteMaterialId, setDeleteMaterialId] = useState<number | null>(null);
  const [showSerialForm, setShowSerialForm] = useState(false);
  const [editSerial, setEditSerial] = useState<SerialNumber | undefined>();
  const [deleteSerialId, setDeleteSerialId] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchText); setMatPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchText]);

  const MAT_PER_PAGE = 50;
  const { data: matResult, isLoading: materialsLoading } = useQuery<{ data: Material[]; total: number }>({
    queryKey: ["/api/materials", "paginated", matPage, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(matPage), limit: String(MAT_PER_PAGE) });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/materials?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Fehler beim Laden");
      return res.json();
    },
  });
  const materials = matResult?.data ?? [];
  const matTotal = matResult?.total ?? 0;
  const matTotalPages = Math.ceil(matTotal / MAT_PER_PAGE);

  const { data: serials = [], isLoading: serialsLoading } = useQuery<SerialNumber[]>({
    queryKey: ["/api/serial-numbers"],
  });

  const deleteMaterialMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/materials/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Material gelöscht" });
      queryClient.invalidateQueries({ queryKey: ["/api/materials"] });
      setDeleteMaterialId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const deleteSerialMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/serial-numbers/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Seriennummer gelöscht" });
      queryClient.invalidateQueries({ queryKey: ["/api/serial-numbers"] });
      setDeleteSerialId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const filteredMaterials = materials;

  const filteredSerials = serials.filter(s => {
    if (!locationFilter) return true;
    return s.location?.toLowerCase().includes(locationFilter.toLowerCase());
  });

  const uniqueCategories = new Set(materials.map(m => m.category).filter(Boolean));
  const lowStockCount = materials.filter(m => m.currentStock != null && m.minStock != null && m.currentStock <= m.minStock).length;
  const invalidateMaterials = () => queryClient.invalidateQueries({ queryKey: ["/api/materials"] });

  const statusLabel = (status: string) => {
    switch (status) {
      case "active": return "Aktiv";
      case "inactive": return "Inaktiv";
      case "discontinued": return "Auslauf";
      default: return status || "—";
    }
  };

  const statusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "active": return "default";
      case "inactive": return "secondary";
      case "discontinued": return "destructive";
      default: return "outline";
    }
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Materialstamm & Seriennummern</h1>
        <p className="text-muted-foreground text-sm">Verwaltung von Materialien und Seriennummern</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-list">
          <TabsTrigger value="materialstamm" data-testid="tab-materialstamm">Materialstamm</TabsTrigger>
          <TabsTrigger value="seriennummern" data-testid="tab-seriennummern">Seriennummern</TabsTrigger>
        </TabsList>

        <TabsContent value="materialstamm" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Artikel gesamt</p>
                    <p className="text-lg font-bold" data-testid="text-total-materials">{matTotal}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-purple-600" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Warengruppen</p>
                    <p className="text-lg font-bold" data-testid="text-categories-count">{uniqueCategories.size}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Niedrig</p>
                    <p className="text-lg font-bold" data-testid="text-low-stock">{lowStockCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                data-testid="input-search-materials"
                placeholder="Suche nach Name, Artikel-Nr., Warengruppe..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={() => { setEditMaterial(undefined); setShowMaterialForm(true); }} data-testid="button-new-material">
              <Plus className="mr-2 h-4 w-4" /> Neues Material
            </Button>
          </div>

          {materialsLoading ? (
            <div className="space-y-2">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Art.-Nr.</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-[80px]">Einheit</TableHead>
                      <TableHead>Warengruppe</TableHead>
                      <TableHead className="w-[110px] text-right">VK-Preis</TableHead>
                      <TableHead className="w-[90px]">Status</TableHead>
                      <TableHead className="w-[80px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMaterials.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          Keine Materialien gefunden
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredMaterials.map(m => (
                        <TableRow key={m.id} data-testid={`row-material-${m.id}`}>
                          <TableCell className="font-mono text-sm font-semibold" data-testid={`text-article-number-${m.id}`}>
                            {m.articleNumber || m.id}
                          </TableCell>
                          <TableCell data-testid={`text-material-name-${m.id}`}>{m.name}</TableCell>
                          <TableCell className="text-muted-foreground">{m.unit || "—"}</TableCell>
                          <TableCell>{m.category || "—"}</TableCell>
                          <TableCell className="text-right font-semibold" data-testid={`text-sale-price-${m.id}`}>
                            {fmtCurrency(m.salePrice)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(m.status)} className="text-xs" data-testid={`badge-status-${m.id}`}>
                              {statusLabel(m.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon"
                                onClick={() => { setEditMaterial(m); setShowMaterialForm(true); }}
                                data-testid={`button-edit-material-${m.id}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon"
                                onClick={() => setDeleteMaterialId(m.id)}
                                data-testid={`button-delete-material-${m.id}`}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                {matTotalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <span className="text-sm text-muted-foreground">
                      Seite {matPage} von {matTotalPages} ({matTotal} Artikel)
                    </span>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={matPage <= 1} onClick={() => setMatPage(p => p - 1)} data-testid="button-mat-prev">
                        Zurück
                      </Button>
                      <Button variant="outline" size="sm" disabled={matPage >= matTotalPages} onClick={() => setMatPage(p => p + 1)} data-testid="button-mat-next">
                        Weiter
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="seriennummern" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <Barcode className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Seriennummern gesamt</p>
                    <p className="text-lg font-bold" data-testid="text-total-serials">{serials.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Lagerorte</p>
                    <p className="text-lg font-bold" data-testid="text-locations-count">
                      {new Set(serials.map(s => s.location).filter(Boolean)).size}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <Hash className="h-5 w-5 text-orange-600" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Verkauft</p>
                    <p className="text-lg font-bold" data-testid="text-sold-count">
                      {serials.filter(s => s.saleDate).length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                data-testid="input-filter-location"
                placeholder="Nach Lagerort filtern..."
                value={locationFilter}
                onChange={e => setLocationFilter(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={() => { setEditSerial(undefined); setShowSerialForm(true); }} data-testid="button-new-serial">
              <Plus className="mr-2 h-4 w-4" /> Neue Seriennummer
            </Button>
          </div>

          {serialsLoading ? (
            <div className="space-y-2">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Seriennr.</TableHead>
                      <TableHead>Material-Nr.</TableHead>
                      <TableHead>Materialname</TableHead>
                      <TableHead className="w-[100px]">Eingang</TableHead>
                      <TableHead>Lagerort</TableHead>
                      <TableHead>Lieferant</TableHead>
                      <TableHead>Kunde</TableHead>
                      <TableHead className="w-[100px]">Verkauf</TableHead>
                      <TableHead className="w-[80px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSerials.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                          Keine Seriennummern gefunden
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSerials.map(s => (
                        <TableRow key={s.id} data-testid={`row-serial-${s.id}`}>
                          <TableCell className="font-mono text-sm font-semibold" data-testid={`text-serial-number-${s.id}`}>
                            {s.serialNumber}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{s.materialNumber || "—"}</TableCell>
                          <TableCell>{s.materialName || "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{fmtDate(s.entryDate)}</TableCell>
                          <TableCell>{s.location || "—"}</TableCell>
                          <TableCell>
                            {s.supplier ? (
                              <a className="hover:text-primary hover:underline cursor-pointer" onClick={() => window.location.href = `/adressen?search=${encodeURIComponent(s.supplier)}`}>{s.supplier}</a>
                            ) : "—"}
                          </TableCell>
                          <TableCell>
                            {s.customerName ? (
                              <a className="hover:text-primary hover:underline cursor-pointer" onClick={() => window.location.href = `/adressen?search=${encodeURIComponent(s.customerName)}`}>{s.customerName}</a>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{fmtDate(s.saleDate)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon"
                                onClick={() => { setEditSerial(s); setShowSerialForm(true); }}
                                data-testid={`button-edit-serial-${s.id}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon"
                                onClick={() => setDeleteSerialId(s.id)}
                                data-testid={`button-delete-serial-${s.id}`}>
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
        </TabsContent>
      </Tabs>

      {showMaterialForm && (
        <MaterialFormDialog
          material={editMaterial}
          open={showMaterialForm}
          onOpenChange={setShowMaterialForm}
        />
      )}

      {showSerialForm && (
        <SerialFormDialog
          serial={editSerial}
          open={showSerialForm}
          onOpenChange={setShowSerialForm}
        />
      )}

      <AlertDialog open={deleteMaterialId !== null} onOpenChange={() => setDeleteMaterialId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Material löschen?</AlertDialogTitle>
            <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden. Das Material wird dauerhaft gelöscht.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-material">Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMaterialId && deleteMaterialMutation.mutate(deleteMaterialId)} data-testid="button-confirm-delete-material">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteSerialId !== null} onOpenChange={() => setDeleteSerialId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Seriennummer löschen?</AlertDialogTitle>
            <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden. Die Seriennummer wird dauerhaft gelöscht.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-serial">Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteSerialId && deleteSerialMutation.mutate(deleteSerialId)} data-testid="button-confirm-delete-serial">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}