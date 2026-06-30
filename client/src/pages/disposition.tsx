import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { OrderDisposition, Project, Customer } from "@shared/schema";
import { dispositionStatusLabels } from "@shared/schema";
import { fmtDate, fmtDocNumber } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, ArrowUpDown } from "lucide-react";

const priorityLabels: Record<number, { label: string; variant: string }> = {
  1: { label: "Hoch", variant: "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-900/30" },
  2: { label: "Normal", variant: "text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/30" },
  3: { label: "Niedrig", variant: "text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800" },
};

const statusColors: Record<string, string> = {
  geplant: "text-yellow-700 bg-yellow-100 dark:text-yellow-300 dark:bg-yellow-900/30",
  in_arbeit: "text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/30",
  abgeschlossen: "text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-900/30",
  pausiert: "text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800",
};

type SortField = "priority" | "status" | "startDate" | "endDate";

function DispositionForm({ disposition, projects, onSave, onCancel }: {
  disposition?: OrderDisposition;
  projects: Project[];
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    projectId: disposition?.projectId || 0,
    status: disposition?.status || "geplant",
    priority: disposition?.priority || 2,
    startDate: disposition?.startDate || "",
    endDate: disposition?.endDate || "",
    notes: disposition?.notes || "",
  });

  const update = (field: string, value: unknown) => setForm((f) => ({ ...f, [field]: value }));

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Projekt *</Label>
        <Select value={String(form.projectId)} onValueChange={(v) => update("projectId", parseInt(v))}>
          <SelectTrigger data-testid="select-dispo-project">
            <SelectValue placeholder="Projekt wählen..." />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>{fmtDocNumber(p.projectNumber)} - {p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Priorität</Label>
          <Select value={String(form.priority)} onValueChange={(v) => update("priority", parseInt(v))}>
            <SelectTrigger data-testid="select-dispo-priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 - Hoch</SelectItem>
              <SelectItem value="2">2 - Normal</SelectItem>
              <SelectItem value="3">3 - Niedrig</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => update("status", v)}>
            <SelectTrigger data-testid="select-dispo-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(dispositionStatusLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Beginn</Label>
          <Input type="date" value={form.startDate} onChange={(e) => update("startDate", e.target.value)} data-testid="input-dispo-start" />
        </div>
        <div className="space-y-2">
          <Label>Ende</Label>
          <Input type="date" value={form.endDate} onChange={(e) => update("endDate", e.target.value)} data-testid="input-dispo-end" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Bemerkung</Label>
        <Input value={form.notes} onChange={(e) => update("notes", e.target.value)} data-testid="input-dispo-notes" />
      </div>
      <div className="flex gap-2 justify-end pt-4">
        <Button variant="secondary" onClick={onCancel} data-testid="button-dispo-cancel">Abbrechen</Button>
        <Button onClick={() => onSave(form)} data-testid="button-dispo-save">Speichern</Button>
      </div>
    </div>
  );
}

export default function DispositionPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<OrderDisposition | undefined>();
  const [deleteItem, setDeleteItem] = useState<OrderDisposition | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("alle");
  const [sortField, setSortField] = useState<SortField>("priority");
  const [sortAsc, setSortAsc] = useState(true);
  const { toast } = useToast();

  const { data: dispositions, isLoading } = useQuery<OrderDisposition[]>({
    queryKey: ["/api/order-dispositions"],
  });
  const { data: projects } = useQuery<Project[]>({ queryKey: ["/api/projects"] });
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });

  const projectMap = useMemo(() => new Map(projects?.map((p) => [p.id, p]) || []), [projects]);
  const customerMap = useMemo(() => new Map(customers?.map((c) => [c.id, c]) || []), [customers]);

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/order-dispositions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/order-dispositions"] });
      setDialogOpen(false);
      toast({ title: "Disposition erstellt" });
    },
    onError: (err: Error) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/order-dispositions/${editItem!.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/order-dispositions"] });
      setDialogOpen(false);
      setEditItem(undefined);
      toast({ title: "Disposition aktualisiert" });
    },
    onError: (err: Error) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/order-dispositions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/order-dispositions"] });
      setDeleteItem(null);
      toast({ title: "Disposition gelöscht" });
    },
    onError: (err: Error) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const statusChangeMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/order-dispositions/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/order-dispositions"] });
      toast({ title: "Status aktualisiert" });
    },
    onError: (err: Error) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const filtered = useMemo(() => {
    let items = dispositions || [];
    if (filterStatus !== "alle") items = items.filter((d) => d.status === filterStatus);
    const sorted = [...items].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "priority":
          cmp = (a.priority ?? 2) - (b.priority ?? 2);
          break;
        case "status":
          cmp = (a.status || "").localeCompare(b.status || "");
          break;
        case "startDate":
          cmp = (a.startDate || "").localeCompare(b.startDate || "");
          break;
        case "endDate":
          cmp = (a.endDate || "").localeCompare(b.endDate || "");
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [dispositions, filterStatus, sortField, sortAsc]);

  const SortButton = ({ field, children }: { field: SortField; children: string }) => (
    <Button variant="ghost" size="sm" className="gap-1 -ml-3" onClick={() => toggleSort(field)} data-testid={`button-sort-${field}`}>
      {children}
      <ArrowUpDown className="h-3 w-3" />
    </Button>
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-disposition-title">Auftragsdisposition</h1>
          <p className="text-muted-foreground">{dispositions?.length ?? 0} Dispositionen gesamt</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditItem(undefined); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-disposition"><Plus className="h-4 w-4 mr-2" />Neue Disposition</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editItem ? "Disposition bearbeiten" : "Neue Disposition"}</DialogTitle></DialogHeader>
            <DispositionForm
              disposition={editItem}
              projects={projects || []}
              onSave={(data) => editItem ? updateMutation.mutate(data) : createMutation.mutate(data)}
              onCancel={() => { setDialogOpen(false); setEditItem(undefined); }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Status filtern</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[180px]" data-testid="select-filter-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle</SelectItem>
              {Object.entries(dispositionStatusLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Projekt</TableHead>
                  <TableHead className="hidden md:table-cell">Kunde</TableHead>
                  <TableHead><SortButton field="priority">Priorität</SortButton></TableHead>
                  <TableHead><SortButton field="status">Status</SortButton></TableHead>
                  <TableHead className="hidden lg:table-cell"><SortButton field="startDate">Beginn</SortButton></TableHead>
                  <TableHead className="hidden lg:table-cell"><SortButton field="endDate">Ende</SortButton></TableHead>
                  <TableHead className="hidden xl:table-cell">Bemerkung</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Keine Dispositionen gefunden</TableCell></TableRow>
                )}
                {filtered.map((d) => {
                  const proj = projectMap.get(d.projectId);
                  const cust = proj ? customerMap.get(proj.customerId) : undefined;
                  const prio = priorityLabels[d.priority ?? 2] || priorityLabels[2];
                  const sc = statusColors[d.status] || "";
                  return (
                    <TableRow key={d.id} data-testid={`row-disposition-${d.id}`}>
                      <TableCell>
                        <a className="font-medium hover:text-primary hover:underline cursor-pointer" onClick={() => window.location.href = `/projekte?id=${d.projectId}`}>{proj?.name || `Projekt #${d.projectId}`}</a>
                        <span className="block text-xs text-muted-foreground">{fmtDocNumber(proj?.projectNumber)}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {cust ? (
                          <a className="hover:text-primary hover:underline cursor-pointer" onClick={() => window.location.href = `/adressen?search=${encodeURIComponent(cust.customerNumber || cust.name)}`}>{cust.name}</a>
                        ) : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={prio.variant} data-testid={`badge-priority-${d.id}`}>{prio.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={d.status}
                          onValueChange={(v) => statusChangeMutation.mutate({ id: d.id, status: v })}
                        >
                          <SelectTrigger className="w-[140px]" data-testid={`select-status-${d.id}`}>
                            <Badge variant="secondary" className={sc}>{dispositionStatusLabels[d.status] || d.status}</Badge>
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(dispositionStatusLabels).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell" data-testid={`text-start-${d.id}`}>{fmtDate(d.startDate)}</TableCell>
                      <TableCell className="hidden lg:table-cell" data-testid={`text-end-${d.id}`}>{fmtDate(d.endDate)}</TableCell>
                      <TableCell className="hidden xl:table-cell max-w-[200px] truncate" data-testid={`text-notes-${d.id}`}>{d.notes || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => { setEditItem(d); setDialogOpen(true); }} data-testid={`button-edit-disposition-${d.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteItem(d)} data-testid={`button-delete-disposition-${d.id}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <AlertDialog open={deleteItem !== null} onOpenChange={(open) => !open && !deleteMutation.isPending && setDeleteItem(null)}>
        <AlertDialogContent data-testid="dialog-delete-disposition">
          <AlertDialogHeader>
            <AlertDialogTitle>Disposition loeschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Disposition wird dauerhaft entfernt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending} data-testid="button-cancel-delete-disposition">
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)}
              data-testid="button-confirm-delete-disposition"
            >
              Loeschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
