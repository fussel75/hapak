import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fmtCurrency, fmtPercent, fmtNumber } from "@/lib/format";
import type { DocumentItemData } from "@shared/document-engine/types";
import { countsForCalculationDetails } from "@shared/document-engine/position-types";

interface NettosummeDetailDialogProps {
  open: boolean;
  onClose: () => void;
  items: DocumentItemData[];
  netTotal: number;
  laborTotal: number;
  selbstkostenLohnsatz?: number;
  kalkulierterLohnsatz?: number;
  onApplyGlobalMarkup?: (category: "material" | "lohn" | "geraete" | "fremd", markupPercent: number) => void;
}

function isCalcPosition(item: DocumentItemData): boolean {
  return countsForCalculationDetails(item);
}

type Category = "material" | "lohn" | "geraete" | "fremd";

export function NettosummeDetailDialog({ open, onClose, items, netTotal, laborTotal, selbstkostenLohnsatz, kalkulierterLohnsatz, onApplyGlobalMarkup }: NettosummeDetailDialogProps) {
  const calcItems = items.filter(isCalcPosition);

  let totalMaterialEk = 0;
  let totalMaterialVk = 0;
  let totalLaborEk = 0;
  let totalLaborVk = 0;
  let totalEquipEk = 0;
  let totalEquipVk = 0;
  let totalFremdEk = 0;
  let totalFremdVk = 0;
  let totalLaborTimeMinutes = 0;

  for (const item of calcItems) {
    const qty = parseFloat(item.quantity || "0");
    const laborTimeMin = parseFloat(item.laborTime || "0");
    const laborTimeHrs = laborTimeMin / 60;

    const laborCostRate = parseFloat(item.laborCost || "0");
    const laborVkRate = parseFloat(item.laborPrice || "0");
    totalLaborEk += laborCostRate * laborTimeHrs;
    totalLaborVk += laborVkRate * laborTimeHrs;
    totalLaborTimeMinutes += laborTimeMin;

    const matVkPerUnit = parseFloat(item.materialPrice || "0");
    const matMarkup = parseFloat(String(item.materialMarkup || "0"));
    const matVkTotal = matVkPerUnit * qty;
    const matEkTotal = matMarkup > 0 ? matVkTotal / (1 + matMarkup / 100) : (matVkTotal > 0 ? matVkTotal : 0);
    totalMaterialEk += matEkTotal;
    totalMaterialVk += matVkTotal;

    const equipEk = parseFloat(item.equipmentCost || "0") * qty;
    const equipMarkup = parseFloat(String(item.equipmentMarkup || "0"));
    totalEquipEk += equipEk;
    totalEquipVk += equipMarkup > 0 ? equipEk * (1 + equipMarkup / 100) : equipEk;

    const fremdEk = parseFloat(item.externalCost || "0") * qty;
    const fremdMarkup = parseFloat(String(item.externalMarkup || "0"));
    totalFremdEk += fremdEk;
    totalFremdVk += fremdMarkup > 0 ? fremdEk * (1 + fremdMarkup / 100) : fremdEk;
  }

  const totalEk = totalMaterialEk + totalLaborEk + totalEquipEk + totalFremdEk;
  const catVkSum = totalMaterialVk + totalLaborVk + totalEquipVk + totalFremdVk;
  const kalkDifferenz = netTotal - catVkSum;

  const costs: { cat: Category; label: string; ek: number; vk: number }[] = [
    { cat: "material", label: "Material", ek: totalMaterialEk, vk: totalMaterialVk },
    { cat: "lohn", label: "Lohn", ek: totalLaborEk, vk: totalLaborVk },
    { cat: "geraete", label: "Geräte", ek: totalEquipEk, vk: totalEquipVk },
    { cat: "fremd", label: "Fremdleistung", ek: totalFremdEk, vk: totalFremdVk },
  ];

  const computedMarkups: Record<Category, number> = {
    material: totalMaterialEk > 0 ? ((totalMaterialVk / totalMaterialEk - 1) * 100) : 0,
    lohn: totalLaborEk > 0 ? ((totalLaborVk / totalLaborEk - 1) * 100) : 0,
    geraete: totalEquipEk > 0 ? ((totalEquipVk / totalEquipEk - 1) * 100) : 0,
    fremd: totalFremdEk > 0 ? ((totalFremdVk / totalFremdEk - 1) * 100) : 0,
  };

  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editValue, setEditValue] = useState("");
  const [pendingChanges, setPendingChanges] = useState<Map<Category, number>>(new Map());

  useEffect(() => {
    if (open) {
      setEditingCategory(null);
      setEditValue("");
      setPendingChanges(new Map());
    }
  }, [open]);

  const getEffectiveMarkup = (cat: Category): number =>
    pendingChanges.has(cat) ? pendingChanges.get(cat)! : computedMarkups[cat];

  const getEffectiveVk = (cat: Category, ek: number, origVk: number): number =>
    pendingChanges.has(cat) ? ek * (1 + pendingChanges.get(cat)! / 100) : origVk;

  const startEdit = (cat: Category) => {
    setEditingCategory(cat);
    setEditValue(getEffectiveMarkup(cat).toFixed(2).replace(".", ","));
  };

  const commitEdit = () => {
    if (editingCategory) {
      const parsed = parseFloat(editValue.replace(",", "."));
      if (!isNaN(parsed)) {
        setPendingChanges(prev => {
          const next = new Map(prev);
          next.set(editingCategory, parsed);
          return next;
        });
      }
      setEditingCategory(null);
      setEditValue("");
    }
  };

  const handleApply = () => {
    if (onApplyGlobalMarkup && pendingChanges.size > 0) {
      pendingChanges.forEach((markup, cat) => onApplyGlobalMarkup(cat, markup));
    }
    onClose();
  };

  const hasPendingChanges = pendingChanges.size > 0;
  const displayNetTotal = hasPendingChanges
    ? costs.reduce((sum, { cat, ek, vk }) => sum + getEffectiveVk(cat, ek, vk), 0)
    : netTotal;
  const totalAufschlag = totalEk > 0 ? ((displayNetTotal / totalEk - 1) * 100) : 0;
  const totalAufschlagAmount = displayNetTotal - totalEk;

  const laborHours = totalLaborTimeMinutes / 60;
  const mannTage = laborHours / 8;
  const deckungsbeitrag = laborHours > 0
    ? (displayNetTotal - totalMaterialEk - totalEquipEk - totalFremdEk) / laborHours
    : 0;

  const skRate = selbstkostenLohnsatz || 0;
  const klRate = kalkulierterLohnsatz || 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg" data-testid="dialog-nettosumme-detail">
        <DialogHeader className="pb-0">
          <DialogTitle className="text-base">Nettosumme</DialogTitle>
          <DialogDescription className="text-[11px] leading-tight">
            Kalkulation{onApplyGlobalMarkup && " · Aufschlag anklicken zum Ändern"}
          </DialogDescription>
        </DialogHeader>

        {(skRate > 0 || klRate > 0) && (
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground bg-muted/40 rounded px-3 py-1.5 -mt-1" data-testid="lohnsatz-info">
            {skRate > 0 && (
              <span>Selbstkosten-Lohnsatz <span className="font-mono font-medium text-foreground">{fmtCurrency(skRate)}</span></span>
            )}
            {klRate > 0 && (
              <span>kalkulierter Lohnsatz <span className="font-mono font-medium text-foreground">{fmtCurrency(klRate)}</span></span>
            )}
          </div>
        )}

        <div className="space-y-4 -mt-1">
          <table className="w-full text-xs border-collapse" data-testid="table-kalk-overview">
            <thead>
              <tr className="border-b text-[10px] text-muted-foreground uppercase tracking-wider">
                <th className="text-left py-1.5 font-medium w-[85px]"></th>
                <th className="text-right py-1.5 font-medium">Kosten</th>
                <th className="text-center py-1.5 font-medium w-4"></th>
                <th className="text-right py-1.5 font-medium">Aufschlag</th>
                <th className="text-right py-1.5 font-medium">€</th>
                <th className="text-center py-1.5 font-medium w-4"></th>
                <th className="text-right py-1.5 font-medium">Verkauf</th>
              </tr>
            </thead>
            <tbody>
              {costs.map(({ cat, label, ek, vk }) => {
                const markup = getEffectiveMarkup(cat);
                const sale = getEffectiveVk(cat, ek, vk);
                const aufschlag = sale - ek;
                const isPending = pendingChanges.has(cat);
                const isEditing = editingCategory === cat;

                return (
                  <tr key={cat} data-testid={`row-${cat}`} className={`border-b border-dashed border-muted/60 ${isPending ? "bg-amber-50/60" : ""}`}>
                    <td className="py-1.5 text-muted-foreground">{label}</td>
                    <td className="py-1.5 text-right tabular-nums font-mono">{fmtCurrency(ek)}</td>
                    <td className="py-1.5 text-center text-muted-foreground/40">+</td>
                    <td className="py-1.5 text-right tabular-nums font-mono">
                      {ek > 0 ? (
                        isEditing ? (
                          <input
                            type="text"
                            className="w-16 text-right border border-blue-400 rounded px-1 py-0.5 text-xs font-mono bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit();
                              if (e.key === "Escape") { setEditingCategory(null); setEditValue(""); }
                            }}
                            autoFocus
                            data-testid={`input-aufschlag-${cat}`}
                          />
                        ) : (
                          <button
                            className={`cursor-pointer hover:bg-blue-50 hover:text-blue-700 rounded px-1 py-0.5 transition-colors text-xs font-mono ${isPending ? "text-amber-700 font-semibold bg-amber-100" : "text-muted-foreground"}`}
                            onClick={() => onApplyGlobalMarkup && startEdit(cat)}
                            title="Klicken zum Ändern"
                            data-testid={`btn-aufschlag-${cat}`}
                          >
                            {fmtPercent(markup)}&thinsp;%
                          </button>
                        )
                      ) : "—"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums font-mono text-muted-foreground">{ek > 0 ? fmtCurrency(aufschlag) : "—"}</td>
                    <td className="py-1.5 text-center text-muted-foreground/40">=</td>
                    <td className={`py-1.5 text-right tabular-nums font-mono font-medium ${isPending ? "text-amber-700" : ""}`}>{fmtCurrency(sale)}</td>
                  </tr>
                );
              })}

              {Math.abs(kalkDifferenz) > 0.01 && !hasPendingChanges && (
                <tr data-testid="row-kalkdifferenz" className="border-b border-dashed border-muted/60">
                  <td className="py-1.5 text-muted-foreground italic text-[10px]" colSpan={6}>
                    + Kalkulationsdifferenz
                  </td>
                  <td className="py-1.5 text-right tabular-nums font-mono text-muted-foreground">{fmtCurrency(kalkDifferenz)}</td>
                </tr>
              )}

              <tr className="border-t-2 border-foreground" data-testid="row-summe">
                <td className="py-2 font-semibold">Summe</td>
                <td className="py-2 text-right tabular-nums font-mono font-semibold">{fmtCurrency(totalEk)}</td>
                <td className="py-2 text-center text-muted-foreground/40">+</td>
                <td className="py-2 text-right tabular-nums font-mono font-semibold">
                  {totalEk > 0 ? fmtPercent(totalAufschlag) + "\u2009%" : "—"}
                </td>
                <td className="py-2 text-right tabular-nums font-mono font-semibold">{fmtCurrency(totalAufschlagAmount)}</td>
                <td className="py-2 text-center text-muted-foreground/40">=</td>
                <td className={`py-2 text-right tabular-nums font-mono text-sm font-bold ${hasPendingChanges ? "text-amber-700" : ""}`}>
                  {fmtCurrency(displayNetTotal)}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs pt-1 border-t border-muted/60">
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Arbeitszeit</div>
              <div className="space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gesamtarbeitszeit</span>
                  <span className="tabular-nums font-mono" data-testid="text-total-minutes">{fmtNumber(totalLaborTimeMinutes)} min</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground pl-2">entspricht</span>
                  <span className="tabular-nums font-mono" data-testid="text-total-hours">{fmtNumber(laborHours)} h</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ø 8 h/Tag</span>
                  <span className="tabular-nums font-mono">{fmtNumber(mannTage)} MT</span>
                </div>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Deckungsbeitrag</div>
              <div className="space-y-0.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">pro Stunde</span>
                  <span className="tabular-nums font-mono font-semibold" data-testid="text-deckungsbeitrag">{fmtCurrency(deckungsbeitrag)}&thinsp;/&thinsp;h</span>
                </div>
                {totalEk > 0 && (
                  <div className="flex justify-between pt-0.5">
                    <span className="text-muted-foreground font-medium">Marge</span>
                    <span className={`tabular-nums font-mono font-semibold ${displayNetTotal - totalEk >= 0 ? "text-green-600" : "text-red-600"}`} data-testid="text-marge">
                      {fmtCurrency(displayNetTotal - totalEk)} <span className="text-[10px]">({fmtPercent(totalAufschlag)}&thinsp;%)</span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {hasPendingChanges && (
          <DialogFooter className="gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setPendingChanges(new Map())} data-testid="btn-aufschlag-reset">
              Zurücksetzen
            </Button>
            <Button size="sm" onClick={handleApply} className="bg-amber-600 hover:bg-amber-700" data-testid="btn-aufschlag-apply">
              Aufschläge anwenden
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
