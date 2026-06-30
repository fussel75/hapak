import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fmtDate, fmtCurrency } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Pencil, Trash2, Loader2, Package, ArrowDownToLine, ArrowUpFromLine,
  ShoppingCart, ClipboardList,
} from "lucide-react";

interface InventoryMovement {
  id: number;
  date: string;
  type: string;
  materialId?: number | null;
  materialNumber: string;
  materialName: string;
  quantity: number | string;
  location: string;
  projectNumber?: string | null;
  orderNumber?: string | null;
  employeeName?: string | null;
  notes?: string | null;
  createdAt?: string | null;
}

interface PurchaseOrder {
  id: number;
  orderNumber: string;
  supplier: string;
  orderDate: string;
  deliveryDate?: string | null;
  projectNumber?: string | null;
  status: string;
  items?: any;
  totalAmount: number | string;
  notes?: string | null;
  createdAt?: string | null;
}

const movementTypes = ["Zugang", "Entnahme", "Umbuchung", "Inventur"];
const orderStatuses = ["offen", "bestellt", "teilgeliefert", "geliefert", "storniert"];

function movementBadgeVariant(type: string) {
  switch (type) {
    case "Zugang": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "Entnahme": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    case "Umbuchung": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
  }
}

function orderStatusBadge(status: string) {
  switch (status) {
    case "offen": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    case "bestellt": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "teilgeliefert": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
    case "geliefert": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "storniert": return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
  }
}

function MovementCreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    date: today,
    type: "Zugang",
    materialNumber: "",
    materialName: "",
    quantity: "",
    location: "",
    projectNumber: "",
    orderNumber: "",
    employeeName: "",
    notes: "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/inventory-movements", {
        ...form,
        quantity: parseFloat(form.quantity) || 0,
      });
    },
    onSuccess: () => {
      toast({ title: "Lagerbewegung erfasst" });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-movements"] });
      onOpenChange(false);
      setForm({ date: today, type: "Zugang", materialNumber: "", materialName: "", quantity: "", location: "", projectNumber: "", orderNumber: "", employeeName: "", notes: "" });
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const update = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title-movement">Neue Lagerbewegung</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Datum</Label>
              <Input data-testid="input-movement-date" type="date" value={form.date} onChange={e => update("date", e.target.value)} />
            </div>
            <div>
              <Label>Art</Label>
              <Select value={form.type} onValueChange={v => update("type", v)}>
                <SelectTrigger data-testid="select-movement-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {movementTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Material-Nr.</Label>
              <Input data-testid="input-movement-material-number" value={form.materialNumber} onChange={e => update("materialNumber", e.target.value)} />
            </div>
            <div>
              <Label>Material</Label>
              <Input data-testid="input-movement-material-name" value={form.materialName} onChange={e => update("materialName", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Menge</Label>
              <Input data-testid="input-movement-quantity" type="number" step="0.01" value={form.quantity} onChange={e => update("quantity", e.target.value)} />
            </div>
            <div>
              <Label>Lagerort</Label>
              <Input data-testid="input-movement-location" value={form.location} onChange={e => update("location", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Projekt-Nr.</Label>
              <Input data-testid="input-movement-project" value={form.projectNumber} onChange={e => update("projectNumber", e.target.value)} />
            </div>
            <div>
              <Label>Bestell-Nr.</Label>
              <Input data-testid="input-movement-order" value={form.orderNumber} onChange={e => update("orderNumber", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Mitarbeiter</Label>
            <Input data-testid="input-movement-employee" value={form.employeeName} onChange={e => update("employeeName", e.target.value)} />
          </div>
          <div>
            <Label>Bemerkung</Label>
            <Textarea data-testid="input-movement-notes" value={form.notes} onChange={e => update("notes", e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-movement">Abbrechen</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.materialName} data-testid="button-save-movement">
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Erfassen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OrderFormDialog({ order, open, onOpenChange }: { order?: PurchaseOrder; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const today = new Date().toISOString().split("T")[0];
  const isEdit = !!order;

  const [form, setForm] = useState({
    orderNumber: order?.orderNumber || "",
    supplier: order?.supplier || "",
    orderDate: order?.orderDate ? order.orderDate.split("T")[0] : today,
    deliveryDate: order?.deliveryDate ? order.deliveryDate.split("T")[0] : "",
    projectNumber: order?.projectNumber || "",
    status: order?.status || "offen",
    totalAmount: order?.totalAmount != null ? String(order.totalAmount) : "0",
    notes: order?.notes || "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const body = {
        ...form,
        totalAmount: form.totalAmount,
      };
      if (isEdit) {
        await apiRequest("PATCH", `/api/purchase-orders/${order.id}`, body);
      } else {
        await apiRequest("POST", "/api/purchase-orders", body);
      }
    },
    onSuccess: () => {
      toast({ title: isEdit ? "Bestellung aktualisiert" : "Bestellung erstellt" });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  const update = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title-order">{isEdit ? "Bestellung bearbeiten" : "Neue Bestellung"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Bestell-Nr.</Label>
              <Input data-testid="input-order-number" value={form.orderNumber} onChange={e => update("orderNumber", e.target.value)} />
            </div>
            <div>
              <Label>Lieferant</Label>
              <Input data-testid="input-order-supplier" value={form.supplier} onChange={e => update("supplier", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Bestelldatum</Label>
              <Input data-testid="input-order-date" type="date" value={form.orderDate} onChange={e => update("orderDate", e.target.value)} />
            </div>
            <div>
              <Label>Liefertermin</Label>
              <Input data-testid="input-order-delivery-date" type="date" value={form.deliveryDate} onChange={e => update("deliveryDate", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Projekt-Nr.</Label>
              <Input data-testid="input-order-project" value={form.projectNumber} onChange={e => update("projectNumber", e.target.value)} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => update("status", v)}>
                <SelectTrigger data-testid="select-order-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {orderStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Betrag (netto)</Label>
            <Input data-testid="input-order-amount" type="number" step="0.01" value={form.totalAmount} onChange={e => update("totalAmount", e.target.value)} className="text-right" />
          </div>
          <div>
            <Label>Bemerkung</Label>
            <Textarea data-testid="input-order-notes" value={form.notes} onChange={e => update("notes", e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-order">Abbrechen</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.supplier} data-testid="button-save-order">
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Speichern" : "Erstellen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function LagerPage() {
  const [activeTab, setActiveTab] = useState("lager");
  const [showMovementDialog, setShowMovementDialog] = useState(false);
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [editOrder, setEditOrder] = useState<PurchaseOrder | undefined>();
  const [deleteOrderId, setDeleteOrderId] = useState<number | null>(null);
  const { toast } = useToast();

  const { data: movements = [], isLoading: movementsLoading } = useQuery<InventoryMovement[]>({
    queryKey: ["/api/inventory-movements"],
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ["/api/purchase-orders"],
  });

  const totalMovements = movements.length;
  const zugaengeCount = movements.filter(m => m.type === "Zugang").length;
  const entnahmenCount = movements.filter(m => m.type === "Entnahme").length;

  const deleteOrderMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/purchase-orders/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Bestellung gelöscht" });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      setDeleteOrderId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title-lager">Lager & Bestellungen</h1>
          <p className="text-muted-foreground text-sm">Lagerverwaltung und Bestellwesen</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-lager">
          <TabsTrigger value="lager" data-testid="tab-lageruebersicht">Lagerübersicht</TabsTrigger>
          <TabsTrigger value="bestellungen" data-testid="tab-bestellungen">Bestellungen</TabsTrigger>
        </TabsList>

        <TabsContent value="lager" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Bewegungen gesamt</p>
                    <p className="text-lg font-bold" data-testid="text-total-movements">{totalMovements}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <ArrowDownToLine className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Zugänge</p>
                    <p className="text-lg font-bold text-green-600" data-testid="text-zugaenge-count">{zugaengeCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2">
                  <ArrowUpFromLine className="h-5 w-5 text-red-600" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-semibold">Entnahmen</p>
                    <p className="text-lg font-bold text-red-600" data-testid="text-entnahmen-count">{entnahmenCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1" />
            <Button onClick={() => setShowMovementDialog(true)} data-testid="button-new-movement">
              <Plus className="mr-2 h-4 w-4" /> Neue Bewegung
            </Button>
          </div>

          {movementsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Art</TableHead>
                      <TableHead>Material-Nr.</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead className="text-right">Menge</TableHead>
                      <TableHead>Lagerort</TableHead>
                      <TableHead>Projekt</TableHead>
                      <TableHead>Mitarbeiter</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          Keine Lagerbewegungen vorhanden
                        </TableCell>
                      </TableRow>
                    ) : (
                      movements.map(m => (
                        <TableRow key={m.id} data-testid={`row-movement-${m.id}`}>
                          <TableCell className="whitespace-nowrap">{fmtDate(m.date)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={movementBadgeVariant(m.type)} data-testid={`badge-movement-type-${m.id}`}>
                              {m.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{m.materialNumber}</TableCell>
                          <TableCell>{m.materialName}</TableCell>
                          <TableCell className="text-right font-semibold">{typeof m.quantity === "number" ? m.quantity : parseFloat(String(m.quantity) || "0")}</TableCell>
                          <TableCell>{m.location}</TableCell>
                          <TableCell>{m.projectNumber || "—"}</TableCell>
                          <TableCell>{m.employeeName || "—"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="bestellungen" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1" />
            <Button onClick={() => { setEditOrder(undefined); setShowOrderDialog(true); }} data-testid="button-new-order">
              <Plus className="mr-2 h-4 w-4" /> Neue Bestellung
            </Button>
          </div>

          {ordersLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nr.</TableHead>
                      <TableHead>Lieferant</TableHead>
                      <TableHead>Bestelldatum</TableHead>
                      <TableHead>Liefertermin</TableHead>
                      <TableHead>Projekt</TableHead>
                      <TableHead className="text-right">Betrag</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[80px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          Keine Bestellungen vorhanden
                        </TableCell>
                      </TableRow>
                    ) : (
                      orders.map(o => (
                        <TableRow key={o.id} data-testid={`row-order-${o.id}`}>
                          <TableCell className="font-semibold">{o.orderNumber}</TableCell>
                          <TableCell>{o.supplier}</TableCell>
                          <TableCell className="whitespace-nowrap">{fmtDate(o.orderDate)}</TableCell>
                          <TableCell className="whitespace-nowrap">{o.deliveryDate ? fmtDate(o.deliveryDate) : "—"}</TableCell>
                          <TableCell>{o.projectNumber || "—"}</TableCell>
                          <TableCell className="text-right font-semibold">{fmtCurrency(o.totalAmount)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={orderStatusBadge(o.status)} data-testid={`badge-order-status-${o.id}`}>
                              {o.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon"
                                onClick={() => { setEditOrder(o); setShowOrderDialog(true); }}
                                data-testid={`button-edit-order-${o.id}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon"
                                onClick={() => setDeleteOrderId(o.id)}
                                data-testid={`button-delete-order-${o.id}`}>
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

      {showMovementDialog && (
        <MovementCreateDialog open={showMovementDialog} onOpenChange={setShowMovementDialog} />
      )}

      {showOrderDialog && (
        <OrderFormDialog order={editOrder} open={showOrderDialog} onOpenChange={setShowOrderDialog} />
      )}

      <AlertDialog open={deleteOrderId !== null} onOpenChange={() => setDeleteOrderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="dialog-title-delete-order">Bestellung löschen?</AlertDialogTitle>
            <AlertDialogDescription>Diese Aktion kann nicht rückgängig gemacht werden.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-order">Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteOrderId && deleteOrderMutation.mutate(deleteOrderId)} data-testid="button-confirm-delete-order">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
