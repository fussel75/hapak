import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LaborRate } from "@shared/schema";
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
import { resolveLaborVkPrice } from "../../hooks/use-item-operations";

export function LohnDialog({
  open,
  onClose,
  onInsert,
  priceLevel = 1,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (rate: LaborRate, minutes: number) => void;
  priceLevel?: number;
}) {
  const [minutes, setMinutes] = useState(60);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: rates } = useQuery<LaborRate[]>({
    queryKey: ["/api/labor-rates"],
    enabled: open,
  });
  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setMinutes(60);
    }
  }, [open]);
  const selected = rates?.find((r) => r.id === selectedId);
  const getVkPrice = (r: LaborRate) => resolveLaborVkPrice(r, priceLevel);
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Lohnposition einfügen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
            {(rates || []).map((r) => (
              <button
                key={r.id}
                className={`w-full text-left px-3 py-2 text-xs ${selectedId === r.id ? "bg-primary/10" : "hover:bg-accent"}`}
                onClick={() => setSelectedId(r.id)}
              >
                <div className="flex justify-between">
                  <span className="font-semibold">{r.name}</span>
                  <span className="font-mono">
                    {fmtCurrency(getVkPrice(r))}/Std.
                    <span className="text-[10px] text-gray-400 ml-1">VK{priceLevel}</span>
                  </span>
                </div>
                {r.description && (
                  <div className="text-muted-foreground">{r.description}</div>
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Label className="text-xs shrink-0">Minuten:</Label>
            <Input
              type="number"
              className="h-7 text-xs w-24"
              value={minutes}
              onChange={(e) => setMinutes(parseInt(e.target.value) || 0)}
              min={1}
            />
            <span className="text-xs text-muted-foreground">
              = {(minutes / 60).toFixed(2)} Std.
            </span>
            {selected && (
              <span className="text-xs font-mono ml-auto">
                {fmtCurrency((getVkPrice(selected) * minutes) / 60)}
              </span>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            disabled={!selected || minutes <= 0}
            onClick={() => {
              if (selected) {
                onInsert(selected, minutes);
                onClose();
              }
            }}
          >
            Einfügen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
