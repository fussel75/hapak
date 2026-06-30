import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Loader2, Package, Layers } from "lucide-react";

type Service = {
  id: number;
  serviceNumber: string;
  searchKey: string;
  shortText: string;
  unit: string;
  trade: string;
  laborTime: string;
  laborRate: string;
  laborPrice: string;
  materialCost: string;
  equipmentCost: string;
  externalCost: string;
  markup: string;
  revenueAccount: string;
  group: string;
  status: string;
  bomItems: any[];
  createdAt: string;
};

type JumboPackage = {
  id: number;
  jumboNumber: string;
  searchKey: string;
  shortText: string;
  unit: string;
  description: string;
  items: any[];
  laborTotal: string;
  materialTotal: string;
  equipmentTotal: string;
  externalTotal: string;
  totalEk: string;
  markup: string;
  salePrice: string;
  revenueAccount: string;
  group: string;
  status: string;
  createdAt: string;
};

function fmtDe(value: string | number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || value === "") return "0,00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0,00";
  return num.toLocaleString("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function ServiceFormDialog({ service, open, onOpenChange }: {
  service?: Service;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const isEdit = !!service;

  const [form, setForm] = useState({
    serviceNumber: service?.serviceNumber || "",
    searchKey: service?.searchKey || "",
    shortText: service?.shortText || "",
    unit: service?.unit || "Stk",
    trade: service?.trade || "",
    laborTime: service?.laborTime || "0",
    laborRate: service?.laborRate || "0",
    laborPrice: service?.laborPrice || "0",
    materialCost: service?.materialCost || "0",
    equipmentCost: service?.equipmentCost || "0",
    externalCost: service?.externalCost || "0",
    markup: service?.markup || "0",
    revenueAccount: service?.revenueAccount || "",
    group_name: service?.group || "",
    status: service?.status || "aktiv",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const body = { ...form, group: form.group_name };
      if (isEdit) {
        await apiRequest("PATCH", `/api/services/${service.id}`, body);
      } else {
        await apiRequest("POST", "/api/services", body);
      }
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Leistung aktualisiert" : "Leistung erstellt" });
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const update = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title-service">
            {isEdit ? "Leistung bearbeiten" : "Neue Leistung"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Leistungsnummer</Label>
              <Input data-testid="input-service-number" value={form.serviceNumber} onChange={e => update("serviceNumber", e.target.value)} />
            </div>
            <div>
              <Label>Suchbegriff</Label>
              <Input data-testid="input-service-search-key" value={form.searchKey} onChange={e => update("searchKey", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Kurztext</Label>
            <Input data-testid="input-service-short-text" value={form.shortText} onChange={e => update("shortText", e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Einheit</Label>
              <Input data-testid="input-service-unit" value={form.unit} onChange={e => update("unit", e.target.value)} />
            </div>
            <div>
              <Label>Gewerk</Label>
              <Input data-testid="input-service-trade" value={form.trade} onChange={e => update("trade", e.target.value)} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => update("status", v)}>
                <SelectTrigger data-testid="select-service-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aktiv">Aktiv</SelectItem>
                  <SelectItem value="Auslauf">Auslauf</SelectItem>
                  <SelectItem value="inaktiv">Inaktiv</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Lohnzeit (Std.)</Label>
              <Input data-testid="input-service-labor-time" type="number" step="0.01" value={form.laborTime} onChange={e => update("laborTime", e.target.value)} className="text-right" />
            </div>
            <div>
              <Label>Lohnsatz</Label>
              <Input data-testid="input-service-labor-rate" type="number" step="0.01" value={form.laborRate} onChange={e => update("laborRate", e.target.value)} className="text-right" />
            </div>
            <div>
              <Label>Lohnpreis</Label>
              <Input data-testid="input-service-labor-price" type="number" step="0.01" value={form.laborPrice} onChange={e => update("laborPrice", e.target.value)} className="text-right" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Materialkosten</Label>
              <Input data-testid="input-service-material-cost" type="number" step="0.01" value={form.materialCost} onChange={e => update("materialCost", e.target.value)} className="text-right" />
            </div>
            <div>
              <Label>Gerätekosten</Label>
              <Input data-testid="input-service-equipment-cost" type="number" step="0.01" value={form.equipmentCost} onChange={e => update("equipmentCost", e.target.value)} className="text-right" />
            </div>
            <div>
              <Label>Fremdleistung</Label>
              <Input data-testid="input-service-external-cost" type="number" step="0.01" value={form.externalCost} onChange={e => update("externalCost", e.target.value)} className="text-right" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Aufschlag (%)</Label>
              <Input data-testid="input-service-markup" type="number" step="0.01" value={form.markup} onChange={e => update("markup", e.target.value)} className="text-right" />
            </div>
            <div>
              <Label>Erlöskonto</Label>
              <Input data-testid="input-service-revenue-account" value={form.revenueAccount} onChange={e => update("revenueAccount", e.target.value)} />
            </div>
            <div>
              <Label>Gruppe</Label>
              <Input data-testid="input-service-group" value={form.group_name} onChange={e => update("group_name", e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-service">Abbrechen</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.serviceNumber} data-testid="button-save-service">
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Speichern" : "Erstellen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function JumboFormDialog({ jumbo, open, onOpenChange }: {
  jumbo?: JumboPackage;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const isEdit = !!jumbo;

  const [form, setForm] = useState({
    jumboNumber: jumbo?.jumboNumber || "",
    searchKey: jumbo?.searchKey || "",
    shortText: jumbo?.shortText || "",
    unit: jumbo?.unit || "Stk",
    description: jumbo?.description || "",
    laborTotal: jumbo?.laborTotal || "0",
    materialTotal: jumbo?.materialTotal || "0",
    equipmentTotal: jumbo?.equipmentTotal || "0",
    externalTotal: jumbo?.externalTotal || "0",
    totalEk: jumbo?.totalEk || "0",
    markup: jumbo?.markup || "0",
    salePrice: jumbo?.salePrice || "0",
    revenueAccount: jumbo?.revenueAccount || "",
    group_name: jumbo?.group || "",
    status: jumbo?.status || "aktiv",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const body = { ...form, group: form.group_name };
      if (isEdit) {
        await apiRequest("PATCH", `/api/jumbo-packages/${jumbo.id}`, body);
      } else {
        await apiRequest("POST", "/api/jumbo-packages", body);
      }
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Jumbo aktualisiert" : "Jumbo erstellt" });
      queryClient.invalidateQueries({ queryKey: ["/api/jumbo-packages"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const update = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title-jumbo">
            {isEdit ? "Jumbo bearbeiten" : "Neuer Jumbo"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Jumbo-Nummer</Label>
              <Input data-testid="input-jumbo-number" value={form.jumboNumber} onChange={e => update("jumboNumber", e.target.value)} />
            </div>
            <div>
              <Label>Suchbegriff</Label>
              <Input data-testid="input-jumbo-search-key" value={form.searchKey} onChange={e => update("searchKey", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Kurztext</Label>
            <Input data-testid="input-jumbo-short-text" value={form.shortText} onChange={e => update("shortText", e.target.value)} />
          </div>
          <div>
            <Label>Beschreibung</Label>
            <Textarea data-testid="input-jumbo-description" value={form.description} onChange={e => update("description", e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Einheit</Label>
              <Input data-testid="input-jumbo-unit" value={form.unit} onChange={e => update("unit", e.target.value)} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => update("status", v)}>
                <SelectTrigger data-testid="select-jumbo-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aktiv">Aktiv</SelectItem>
                  <SelectItem value="Auslauf">Auslauf</SelectItem>
                  <SelectItem value="inaktiv">Inaktiv</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Gruppe</Label>
              <Input data-testid="input-jumbo-group" value={form.group_name} onChange={e => update("group_name", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Lohn gesamt</Label>
              <Input data-testid="input-jumbo-labor-total" type="number" step="0.01" value={form.laborTotal} onChange={e => update("laborTotal", e.target.value)} className="text-right" />
            </div>
            <div>
              <Label>Material gesamt</Label>
              <Input data-testid="input-jumbo-material-total" type="number" step="0.01" value={form.materialTotal} onChange={e => update("materialTotal", e.target.value)} className="text-right" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Geräte gesamt</Label>
              <Input data-testid="input-jumbo-equipment-total" type="number" step="0.01" value={form.equipmentTotal} onChange={e => update("equipmentTotal", e.target.value)} className="text-right" />
            </div>
            <div>
              <Label>Fremdleistung gesamt</Label>
              <Input data-testid="input-jumbo-external-total" type="number" step="0.01" value={form.externalTotal} onChange={e => update("externalTotal", e.target.value)} className="text-right" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>EK-Summe</Label>
              <Input data-testid="input-jumbo-total-ek" type="number" step="0.01" value={form.totalEk} onChange={e => update("totalEk", e.target.value)} className="text-right" />
            </div>
            <div>
              <Label>Aufschlag (%)</Label>
              <Input data-testid="input-jumbo-markup" type="number" step="0.01" value={form.markup} onChange={e => update("markup", e.target.value)} className="text-right" />
            </div>
            <div>
              <Label>VK-Preis</Label>
              <Input data-testid="input-jumbo-sale-price" type="number" step="0.01" value={form.salePrice} onChange={e => update("salePrice", e.target.value)} className="text-right" />
            </div>
          </div>
          <div>
            <Label>Erlöskonto</Label>
            <Input data-testid="input-jumbo-revenue-account" value={form.revenueAccount} onChange={e => update("revenueAccount", e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-jumbo">Abbrechen</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.jumboNumber} data-testid="button-save-jumbo">
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Speichern" : "Erstellen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function StuecklistenPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("leistungen");

  const [showServiceDialog, setShowServiceDialog] = useState(false);
  const [editService, setEditService] = useState<Service | undefined>();
  const [deleteServiceId, setDeleteServiceId] = useState<number | null>(null);

  const [showJumboDialog, setShowJumboDialog] = useState(false);
  const [editJumbo, setEditJumbo] = useState<JumboPackage | undefined>();
  const [deleteJumboId, setDeleteJumboId] = useState<number | null>(null);

  const { data: services = [], isLoading: servicesLoading } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  const { data: jumbos = [], isLoading: jumbosLoading } = useQuery<JumboPackage[]>({
    queryKey: ["/api/jumbo-packages"],
  });

  const deleteServiceMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/services/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Leistung gelöscht" });
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      setDeleteServiceId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const deleteJumboMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/jumbo-packages/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Jumbo gelöscht" });
      queryClient.invalidateQueries({ queryKey: ["/api/jumbo-packages"] });
      setDeleteJumboId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Stücklisten</h1>
          <p className="text-muted-foreground text-sm">Leistungen und Jumbo-Pakete verwalten</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-stuecklisten">
          <TabsTrigger value="leistungen" data-testid="tab-leistungen">
            <Layers className="mr-2 h-4 w-4" />
            Leistungen / Stücklisten
          </TabsTrigger>
          <TabsTrigger value="jumbos" data-testid="tab-jumbos">
            <Package className="mr-2 h-4 w-4" />
            Jumbos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="leistungen" className="space-y-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button onClick={() => { setEditService(undefined); setShowServiceDialog(true); }} data-testid="button-new-service">
              <Plus className="mr-2 h-4 w-4" /> Neue Leistung
            </Button>
          </div>

          {servicesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">Nr</TableHead>
                      <TableHead>Suchbegriff</TableHead>
                      <TableHead>Kurztext</TableHead>
                      <TableHead className="w-[70px]">Einheit</TableHead>
                      <TableHead className="w-[100px]">Gewerk</TableHead>
                      <TableHead className="w-[100px] text-right">Lohnzeit</TableHead>
                      <TableHead className="w-[120px] text-right">Materialkosten</TableHead>
                      <TableHead className="w-[80px]">Status</TableHead>
                      <TableHead className="w-[80px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {services.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                          Keine Leistungen vorhanden
                        </TableCell>
                      </TableRow>
                    ) : (
                      services.map((s) => (
                        <TableRow key={s.id} data-testid={`row-service-${s.id}`}>
                          <TableCell className="font-semibold" data-testid={`text-service-number-${s.id}`}>{s.serviceNumber}</TableCell>
                          <TableCell data-testid={`text-service-search-key-${s.id}`}>{s.searchKey}</TableCell>
                          <TableCell data-testid={`text-service-short-text-${s.id}`}>{s.shortText}</TableCell>
                          <TableCell data-testid={`text-service-unit-${s.id}`}>{s.unit}</TableCell>
                          <TableCell>
                            {s.trade && <Badge variant="secondary" data-testid={`badge-service-trade-${s.id}`}>{s.trade}</Badge>}
                          </TableCell>
                          <TableCell className="text-right" data-testid={`text-service-labor-time-${s.id}`}>{fmtDe(s.laborTime)}</TableCell>
                          <TableCell className="text-right" data-testid={`text-service-material-cost-${s.id}`}>{fmtDe(s.materialCost)}</TableCell>
                          <TableCell>
                            <Badge
                              variant={s.status === "aktiv" ? "default" : "secondary"}
                              className={s.status === "aktiv" ? "bg-green-600 text-white" : s.status === "Auslauf" ? "bg-yellow-500 text-white" : ""}
                              data-testid={`badge-service-status-${s.id}`}
                            >
                              {s.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon"
                                onClick={() => { setEditService(s); setShowServiceDialog(true); }}
                                data-testid={`button-edit-service-${s.id}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon"
                                onClick={() => setDeleteServiceId(s.id)}
                                data-testid={`button-delete-service-${s.id}`}>
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

        <TabsContent value="jumbos" className="space-y-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button onClick={() => { setEditJumbo(undefined); setShowJumboDialog(true); }} data-testid="button-new-jumbo">
              <Plus className="mr-2 h-4 w-4" /> Neuer Jumbo
            </Button>
          </div>

          {jumbosLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">Nr</TableHead>
                      <TableHead>Suchbegriff</TableHead>
                      <TableHead>Kurztext</TableHead>
                      <TableHead className="w-[70px]">Einheit</TableHead>
                      <TableHead className="w-[120px] text-right">EK-Summe</TableHead>
                      <TableHead className="w-[100px] text-right">Aufschlag (%)</TableHead>
                      <TableHead className="w-[120px] text-right">VK</TableHead>
                      <TableHead className="w-[80px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jumbos.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          Keine Jumbo-Pakete vorhanden
                        </TableCell>
                      </TableRow>
                    ) : (
                      jumbos.map((j) => (
                        <TableRow key={j.id} data-testid={`row-jumbo-${j.id}`}>
                          <TableCell className="font-semibold" data-testid={`text-jumbo-number-${j.id}`}>{j.jumboNumber}</TableCell>
                          <TableCell data-testid={`text-jumbo-search-key-${j.id}`}>{j.searchKey}</TableCell>
                          <TableCell data-testid={`text-jumbo-short-text-${j.id}`}>{j.shortText}</TableCell>
                          <TableCell data-testid={`text-jumbo-unit-${j.id}`}>{j.unit}</TableCell>
                          <TableCell className="text-right" data-testid={`text-jumbo-total-ek-${j.id}`}>{fmtDe(j.totalEk)}</TableCell>
                          <TableCell className="text-right" data-testid={`text-jumbo-markup-${j.id}`}>{fmtDe(j.markup)}</TableCell>
                          <TableCell className="text-right font-semibold" data-testid={`text-jumbo-sale-price-${j.id}`}>{fmtDe(j.salePrice)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon"
                                onClick={() => { setEditJumbo(j); setShowJumboDialog(true); }}
                                data-testid={`button-edit-jumbo-${j.id}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon"
                                onClick={() => setDeleteJumboId(j.id)}
                                data-testid={`button-delete-jumbo-${j.id}`}>
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

      {showServiceDialog && (
        <ServiceFormDialog
          service={editService}
          open={showServiceDialog}
          onOpenChange={setShowServiceDialog}
        />
      )}

      {showJumboDialog && (
        <JumboFormDialog
          jumbo={editJumbo}
          open={showJumboDialog}
          onOpenChange={setShowJumboDialog}
        />
      )}

      <AlertDialog open={deleteServiceId !== null} onOpenChange={() => setDeleteServiceId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leistung löschen?</AlertDialogTitle>
            <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-service">Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteServiceId && deleteServiceMutation.mutate(deleteServiceId)} data-testid="button-confirm-delete-service">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteJumboId !== null} onOpenChange={() => setDeleteJumboId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Jumbo löschen?</AlertDialogTitle>
            <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-jumbo">Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteJumboId && deleteJumboMutation.mutate(deleteJumboId)} data-testid="button-confirm-delete-jumbo">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
