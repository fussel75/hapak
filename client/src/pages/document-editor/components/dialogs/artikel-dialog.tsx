import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { fmtCurrency } from "@/lib/format";
import type { Material } from "../../types";

export function ArtikelDialog({
  open,
  filter,
  onClose,
  onSelect,
  mehrfach = false,
}: {
  open: boolean;
  filter: string;
  onClose: () => void;
  onSelect: (mat: Material, qty: number) => void;
  mehrfach?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: materials } = useQuery<Material[]>({
    queryKey: ["/api/materials", "picker", search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: "1", limit: "50" });
      if (search) params.set("search", search);
      const res = await fetch(`/api/materials?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? json;
    },
    enabled: open,
  });
  useEffect(() => {
    if (!open) {
      setSearch("");
      setSelectedId(null);
      setQty(1);
    }
  }, [open]);
  const filtered = (materials || [])
    .filter(
      (m) =>
        m.active !== false &&
        (!search ||
          m.name.toLowerCase().includes(search.toLowerCase()) ||
          m.articleNumber?.toLowerCase().includes(search.toLowerCase()) ||
          m.searchKey?.toLowerCase().includes(search.toLowerCase())),
    )
    .slice(0, 50);
  const selected = materials?.find((m) => m.id === selectedId);
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[640px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Material / Artikel suchen</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          className="h-7 text-xs"
          placeholder="Suchen: Name, Artikel-Nr., Suchbegriff..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="input-artikel-search"
        />
        <div className="flex-1 overflow-y-auto border rounded-md max-h-[340px]">
          {filtered.map((m) => (
            <button
              key={m.id}
              className={`w-full text-left px-3 py-2 text-xs border-b ${selectedId === m.id ? "bg-primary/10" : "hover:bg-accent"}`}
              onClick={() => setSelectedId(m.id)}
              onDoubleClick={() => {
                onSelect(m, qty);
                if (!mehrfach) onClose();
              }}
              data-testid={`artikel-item-${m.id}`}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-muted-foreground w-24 shrink-0">
                  {m.articleNumber}
                </span>
                <span className="font-medium flex-1">{m.name}</span>
                <span className="font-mono text-right">
                  {fmtCurrency(m.salePrice1)}/{m.unit}
                </span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              Kein Artikel gefunden
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 pt-1">
          <Label className="text-xs shrink-0">Menge:</Label>
          <Input
            type="number"
            className="h-7 text-xs w-24"
            value={qty}
            onChange={(e) => setQty(parseFloat(e.target.value) || 1)}
            min={0.001}
            step={0.001}
          />
          {selected && (
            <span className="text-xs text-muted-foreground">
              {selected.unit} × {fmtCurrency(selected.salePrice1)} ={" "}
              <strong>
                {fmtCurrency(parseFloat(selected.salePrice1) * qty)}
              </strong>
            </span>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            disabled={!selected}
            onClick={() => {
              if (selected) {
                onSelect(selected, qty);
                if (!mehrfach) onClose();
                else {
                  setSelectedId(null);
                  setQty(1);
                }
              }
            }}
            data-testid="button-artikel-insert"
          >
            {mehrfach ? "Einfügen & Weiter" : "Einfügen"}
          </Button>
          {mehrfach && (
            <Button variant="outline" onClick={onClose} data-testid="button-artikel-done">
              Fertig
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
