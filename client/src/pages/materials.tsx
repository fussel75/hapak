import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Material } from "@shared/schema";
import { unitOptions } from "@shared/schema";
import { fmtCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Pencil } from "lucide-react";

function MaterialForm({ material, onSave, onCancel }: {
  material?: Material;
  onSave: (data: any) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    articleNumber: material?.articleNumber || "",
    searchKey: material?.searchKey || "",
    name: material?.name || "",
    description: material?.description || "",
    unit: material?.unit || "Stk",
    purchasePrice: material?.purchasePrice || "0.00",
    sellPrice: material?.sellPrice || "0.00",
    supplier: material?.supplier || "",
    category: material?.category || "",
  });

  const update = (field: string, value: any) => setForm((f) => ({ ...f, [field]: value }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Artikelnummer *</Label>
          <Input data-testid="input-article-number" value={form.articleNumber} onChange={(e) => update("articleNumber", e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Suchbegriff</Label>
          <Input data-testid="input-material-search-key" value={form.searchKey} onChange={(e) => update("searchKey", e.target.value.toUpperCase())} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Bezeichnung *</Label>
        <Input data-testid="input-material-name" value={form.name} onChange={(e) => update("name", e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label>Beschreibung</Label>
        <Input data-testid="input-material-desc" value={form.description} onChange={(e) => update("description", e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Einheit</Label>
          <Select value={form.unit} onValueChange={(v) => update("unit", v)}>
            <SelectTrigger data-testid="select-material-unit"><SelectValue /></SelectTrigger>
            <SelectContent>
              {unitOptions.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>EK-Preis (€)</Label>
          <Input data-testid="input-purchase-price" value={form.purchasePrice} onChange={(e) => update("purchasePrice", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>VK-Preis (€)</Label>
          <Input data-testid="input-sell-price" value={form.sellPrice} onChange={(e) => update("sellPrice", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Lieferant</Label>
          <Input data-testid="input-supplier" value={form.supplier} onChange={(e) => update("supplier", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Kategorie</Label>
          <Input data-testid="input-category" value={form.category} onChange={(e) => update("category", e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-4">
        <Button variant="secondary" onClick={onCancel} data-testid="button-cancel">Abbrechen</Button>
        <Button onClick={() => onSave(form)} data-testid="button-save-material">Speichern</Button>
      </div>
    </div>
  );
}

export default function MaterialsPage() {
  const [search, setSearch] = useState("");
  const [editMaterial, setEditMaterial] = useState<Material | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: matResult, isLoading } = useQuery<{ data: Material[]; total: number }>({
    queryKey: ["/api/materials", "page", search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", limit: "100" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/materials?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Fehler");
      return res.json();
    },
  });
  const materials = matResult?.data;

  const createMutation = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("POST", "/api/materials", data); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/materials"] }); setDialogOpen(false); toast({ title: "Material erstellt" }); },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => { const res = await apiRequest("PATCH", `/api/materials/${editMaterial!.id}`, data); return res.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/materials"] }); setDialogOpen(false); setEditMaterial(undefined); toast({ title: "Material aktualisiert" }); },
    onError: (err: any) => toast({ title: "Fehler", description: err.message, variant: "destructive" }),
  });

  const fmt = fmtCurrency;

  const filtered = materials?.filter((m) =>
    !search || m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.articleNumber.includes(search) ||
    m.searchKey?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-materials-title">Materialien</h1>
          <p className="text-muted-foreground">{materials?.length ?? 0} Artikel gesamt</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditMaterial(undefined); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-material"><Plus className="h-4 w-4 mr-2" />Neues Material</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editMaterial ? "Material bearbeiten" : "Neues Material"}</DialogTitle></DialogHeader>
            <MaterialForm
              material={editMaterial}
              onSave={(data) => editMaterial ? updateMutation.mutate(data) : createMutation.mutate(data)}
              onCancel={() => { setDialogOpen(false); setEditMaterial(undefined); }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-10" placeholder="Material suchen..." value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-materials" />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Art.-Nr.</TableHead>
                  <TableHead>Bezeichnung</TableHead>
                  <TableHead className="hidden md:table-cell">ME</TableHead>
                  <TableHead className="hidden md:table-cell text-right">EK</TableHead>
                  <TableHead className="text-right">VK</TableHead>
                  <TableHead className="hidden lg:table-cell">Lieferant</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered?.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Keine Materialien gefunden</TableCell></TableRow>
                )}
                {filtered?.map((m) => (
                  <TableRow key={m.id} data-testid={`row-material-${m.id}`}>
                    <TableCell className="font-mono text-sm">{m.articleNumber}</TableCell>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="hidden md:table-cell">{m.unit}</TableCell>
                    <TableCell className="hidden md:table-cell text-right font-mono">{fmt(m.purchasePrice)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(m.sellPrice)}</TableCell>
                    <TableCell className="hidden lg:table-cell">{m.supplier || "-"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => { setEditMaterial(m); setDialogOpen(true); }} data-testid={`button-edit-material-${m.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
