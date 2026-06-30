import { useState, useEffect } from "react";
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

export function ProzentZuschlagDialog({
  open,
  onClose,
  onInsert,
  netTotal,
  laborTotal,
  materialTotal,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (title: string, amount: number) => void;
  netTotal: number;
  laborTotal: number;
  materialTotal: number;
}) {
  const [basis, setBasis] = useState<
    "gesamt" | "material" | "lohn" | "lohn_material"
  >("gesamt");
  const [percent, setPercent] = useState("5");
  const [isDiscount, setIsDiscount] = useState(false);
  const [title, setTitle] = useState("");

  const baseAmount =
    basis === "gesamt"
      ? netTotal
      : basis === "material"
        ? materialTotal
        : basis === "lohn"
          ? laborTotal
          : materialTotal + laborTotal;
  const factor = isDiscount ? -1 : 1;
  const amount = baseAmount * (parseFloat(percent) / 100) * factor;

  const basisLabels = {
    gesamt: "Gesamtpreis",
    material: "nur Material",
    lohn: "nur Lohn",
    lohn_material: "Lohn + Material",
  };

  useEffect(() => {
    if (!title)
      setTitle(
        `${isDiscount ? "Rabatt" : "Zuschlag"} ${percent}% auf ${basisLabels[basis]}`,
      );
  }, [basis, percent, isDiscount]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>
            Prozentualer {isDiscount ? "Abzug / Rabatt" : "Zuschlag"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              className={`flex-1 text-xs py-1.5 rounded border ${!isDiscount ? "bg-orange-100 border-orange-300 text-orange-800 font-semibold" : "hover:bg-gray-50"}`}
              onClick={() => setIsDiscount(false)}
            >
              + Zuschlag
            </button>
            <button
              className={`flex-1 text-xs py-1.5 rounded border ${isDiscount ? "bg-red-100 border-red-300 text-red-800 font-semibold" : "hover:bg-gray-50"}`}
              onClick={() => setIsDiscount(true)}
            >
              − Rabatt / Abzug
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["gesamt", "material", "lohn", "lohn_material"] as const).map(
              (b) => (
                <button
                  key={b}
                  className={`text-xs py-2 px-3 rounded border text-left ${basis === b ? "bg-blue-100 border-blue-300 text-blue-800 font-semibold" : "hover:bg-gray-50"}`}
                  onClick={() => setBasis(b)}
                >
                  {basisLabels[b]}
                </button>
              ),
            )}
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs shrink-0">Prozent:</Label>
            <Input
              className="h-7 text-xs w-20"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              type="number"
              min="0"
              max="100"
              step="0.5"
            />
            <span className="text-xs">%</span>
            <span className="text-xs text-muted-foreground ml-auto">
              Basis: {fmtCurrency(baseAmount)}
            </span>
          </div>
          <div className="bg-gray-50 rounded p-2 text-xs space-y-1">
            <div className="flex justify-between">
              <span>Betrag:</span>
              <span
                className={`font-bold font-mono ${amount < 0 ? "text-red-600" : "text-green-700"}`}
              >
                {fmtCurrency(amount)}
              </span>
            </div>
          </div>
          <div>
            <Label className="text-xs">Bezeichnung:</Label>
            <Input
              className="h-7 text-xs mt-1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={() => {
              onInsert(
                title || `${percent}% ${isDiscount ? "Rabatt" : "Zuschlag"}`,
                amount,
              );
              onClose();
            }}
          >
            Einfügen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
