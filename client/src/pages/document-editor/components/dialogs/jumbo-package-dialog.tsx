import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtCurrency } from "@/lib/format";
import type { JumboPackage } from "../../types";

export function JumboPackageDialog({
  open,
  onClose,
  onSelect,
  mehrfach = false,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (jumbo: JumboPackage, qty: number) => void;
  mehrfach?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: jumbos = [] } = useQuery<JumboPackage[]>({
    queryKey: ["/api/jumbo-packages"],
    enabled: open,
  });

  useEffect(() => {
    if (!open) {
      setSearch("");
      setSelectedId(null);
      setQty(1);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return jumbos
      .filter((j) => j.status !== "inaktiv")
      .filter((j) => {
        if (!s) return true;
        return (
          j.jumboNumber.toLowerCase().includes(s) ||
          (j.searchKey || "").toLowerCase().includes(s) ||
          j.shortText.toLowerCase().includes(s) ||
          (j.group || "").toLowerCase().includes(s)
        );
      })
      .slice(0, 80);
  }, [jumbos, search]);

  const selected = jumbos.find((j) => j.id === selectedId);

  const insertSelected = () => {
    if (!selected) return;
    onSelect(selected, qty);
    if (!mehrfach) onClose();
    else {
      setSelectedId(null);
      setQty(1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[760px] max-h-[82vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>JUMBO aus Katalog einfuegen</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          className="h-7 text-xs"
          placeholder="Suchen: Nummer, Suchbegriff, Text, Gruppe..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="input-jumbo-package-search"
        />
        <div className="flex-1 overflow-y-auto border rounded-md max-h-[380px]">
          {filtered.map((j) => (
            <button
              key={j.id}
              className={`w-full text-left px-3 py-2 text-xs border-b ${selectedId === j.id ? "bg-primary/10" : "hover:bg-accent"}`}
              onClick={() => setSelectedId(j.id)}
              onDoubleClick={insertSelected}
              data-testid={`jumbo-package-item-${j.id}`}
            >
              <div className="grid grid-cols-[110px_1fr_80px_100px] gap-3 items-start">
                <span className="font-mono text-muted-foreground">{j.jumboNumber}</span>
                <span>
                  <span className="font-medium block">{j.shortText}</span>
                  <span className="text-muted-foreground">{j.searchKey || j.group || ""}</span>
                </span>
                <span className="font-mono text-muted-foreground">{j.unit || "psch"}</span>
                <span className="font-mono text-right">{fmtCurrency(j.salePrice || "0")}</span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              Kein Jumbo im Katalog gefunden
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
              {selected.unit || "psch"} x {fmtCurrency(selected.salePrice || "0")} ={" "}
              <strong>{fmtCurrency((parseFloat(selected.salePrice || "0") * qty).toFixed(2))}</strong>
            </span>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button disabled={!selected} onClick={insertSelected} data-testid="button-jumbo-package-insert">
            {mehrfach ? "Einfuegen & Weiter" : "Einfuegen"}
          </Button>
          {mehrfach && (
            <Button variant="outline" onClick={onClose} data-testid="button-jumbo-package-done">
              Fertig
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
