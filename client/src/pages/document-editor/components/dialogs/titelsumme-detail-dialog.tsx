import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { fmtCurrency, fmtPercent, fmtNumber } from "@/lib/format";
import type { DocumentItemData } from "@shared/document-engine/types";
import { countsForCalculationDetails } from "@shared/document-engine/position-types";

interface TitelsummeDetailDialogProps {
  open: boolean;
  onClose: () => void;
  items: DocumentItemData[];
  titelIndex: number;
  titelsummeIndex: number;
}

export function TitelsummeDetailDialog({ open, onClose, items, titelIndex, titelsummeIndex }: TitelsummeDetailDialogProps) {
  const titelItem = items[titelIndex];
  const tsItem = items[titelsummeIndex];
  const titelName = titelItem?.title || "Titel";
  const titelPosNum = titelItem?.positionNumber || "";
  const gesamtsumme = parseFloat(tsItem?.totalPrice || "0");

  let totalMaterialCost = 0;
  let totalLaborCost = 0;
  let totalEquipmentCost = 0;
  let totalExternalCost = 0;
  let totalLaborTimeMinutes = 0;

  let totalMaterialSale = 0;
  let totalLaborSale = 0;
  let totalEquipmentSale = 0;
  let totalExternalSale = 0;

  for (let i = titelIndex + 1; i < titelsummeIndex; i++) {
    const it = items[i];
    if (!it || !countsForCalculationDetails(it)) continue;

    const qty = parseFloat(it.quantity || "0") || 1;
    const laborTimeMin = parseFloat(it.laborTime || "0");
    const laborCostRate = parseFloat(it.laborCost || "0");
    const laborVkRate = parseFloat(it.laborPrice || "0");
    const laborTimeHrs = laborTimeMin / 60;

    const laborEkTotal = laborCostRate * laborTimeHrs;
    const laborVkTotal = laborVkRate * laborTimeHrs;

    const matVkPerUnit = parseFloat(it.materialPrice || "0");
    const matMarkup = parseFloat(String(it.materialMarkup || "0"));
    const matVkTotal = matVkPerUnit * qty;
    const matEkTotal = matMarkup > 0 ? matVkTotal / (1 + matMarkup / 100) : matVkTotal;

    const eqEk = parseFloat(it.equipmentCost || "0") * qty;
    const eqMarkup = parseFloat(String(it.equipmentMarkup || "0"));
    const eqVkTotal = eqMarkup > 0 ? eqEk * (1 + eqMarkup / 100) : eqEk;

    const extEk = parseFloat(it.externalCost || "0") * qty;
    const extMarkup = parseFloat(String(it.externalMarkup || "0"));
    const extVkTotal = extMarkup > 0 ? extEk * (1 + extMarkup / 100) : extEk;

    totalMaterialCost += matEkTotal;
    totalLaborCost += laborEkTotal;
    totalEquipmentCost += eqEk;
    totalExternalCost += extEk;
    totalLaborTimeMinutes += laborTimeMin;

    totalLaborSale += laborVkTotal;
    totalMaterialSale += matVkTotal;
    totalEquipmentSale += eqVkTotal;
    totalExternalSale += extVkTotal;
  }

  const totalCost = totalMaterialCost + totalLaborCost + totalEquipmentCost + totalExternalCost;
  const kalkDifferenz = gesamtsumme - (totalMaterialSale + totalLaborSale + totalEquipmentSale + totalExternalSale);

  const matMarkupPct = totalMaterialCost > 0 ? ((totalMaterialSale / totalMaterialCost - 1) * 100) : 0;
  const laborMarkupPct = totalLaborCost > 0 ? ((totalLaborSale / totalLaborCost - 1) * 100) : 0;
  const eqMarkupPct = totalEquipmentCost > 0 ? ((totalEquipmentSale / totalEquipmentCost - 1) * 100) : 0;
  const extMarkupPct = totalExternalCost > 0 ? ((totalExternalSale / totalExternalCost - 1) * 100) : 0;
  const totalAufschlag = totalCost > 0 ? ((gesamtsumme / totalCost - 1) * 100) : 0;
  const totalAufschlagAmount = gesamtsumme - totalCost;

  const laborHours = totalLaborTimeMinutes / 60;
  const mannTage = laborHours / 8;
  const deckungsbeitrag = laborHours > 0 ? (gesamtsumme - totalMaterialCost - totalEquipmentCost - totalExternalCost) / laborHours : 0;

  const costs = [
    { label: "Material", ek: totalMaterialCost, markup: matMarkupPct, aufschlag: totalMaterialSale - totalMaterialCost, vk: totalMaterialSale },
    { label: "Lohn", ek: totalLaborCost, markup: laborMarkupPct, aufschlag: totalLaborSale - totalLaborCost, vk: totalLaborSale },
    { label: "Geräte", ek: totalEquipmentCost, markup: eqMarkupPct, aufschlag: totalEquipmentSale - totalEquipmentCost, vk: totalEquipmentSale },
    { label: "Fremdleistung", ek: totalExternalCost, markup: extMarkupPct, aufschlag: totalExternalSale - totalExternalCost, vk: totalExternalSale },
  ];

  const laborEkRate = laborHours > 0 ? totalLaborCost / laborHours : 0;
  const laborVkRate = laborHours > 0 ? totalLaborSale / laborHours : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl w-[95vw] sm:w-auto" data-testid="dialog-titelsumme-detail">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Summe {titelPosNum} {titelName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Kalkulations-Übersicht für diesen Titel
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-blue-50 rounded-md p-3 space-y-1.5 border border-blue-200">
            <div className="flex items-center gap-2 text-xs text-blue-700 font-medium mb-1">
              Lohnkalkulation
            </div>
            <div className="grid grid-cols-3 gap-x-4 text-xs">
              <div>
                <div className="text-gray-500 text-[10px]">Selbstkosten-Lohnsatz</div>
                <div className="font-mono tabular-nums font-semibold">{fmtCurrency(laborEkRate)} €/h</div>
              </div>
              <div>
                <div className="text-gray-500 text-[10px]">Zeitbedarf</div>
                <div className="font-mono tabular-nums">{fmtNumber(totalLaborTimeMinutes)} min</div>
                <div className="font-mono tabular-nums text-gray-500">= {fmtNumber(laborHours)} h</div>
              </div>
              <div>
                <div className="text-gray-500 text-[10px]">kalk. Lohnsatz</div>
                <div className="font-mono tabular-nums font-semibold">{fmtCurrency(laborVkRate)} €/h</div>
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 pt-1 border-t border-blue-200">
              <span>Lohn EK: {fmtCurrency(totalLaborCost)} €</span>
              <span>Lohn VK: {fmtCurrency(totalLaborSale)} €</span>
            </div>
          </div>

          <table className="w-full text-xs border-collapse" data-testid="table-titelsumme-kalk">
            <thead>
              <tr className="border-b border-gray-300 text-gray-500">
                <th className="text-left py-1.5 pr-2 font-normal">KOSTENART</th>
                <th className="text-right py-1.5 pr-2 font-normal">Kosten €</th>
                <th className="py-1.5 pr-1 hidden sm:table-cell"></th>
                <th className="text-right py-1.5 pr-2 font-normal">Aufschlag %</th>
                <th className="text-right py-1.5 pr-2 font-normal hidden sm:table-cell">€</th>
                <th className="py-1.5 pr-1 hidden sm:table-cell"></th>
                <th className="text-right py-1.5 font-normal">Verkauf €</th>
              </tr>
            </thead>
            <tbody>
              {costs.map(({ label, ek, markup, aufschlag, vk }) => (
                <tr key={label} data-testid={`row-${label.toLowerCase()}`}>
                  <td className="py-1 pr-2 text-gray-700">{label}</td>
                  <td className="py-1 pr-2 text-right tabular-nums font-mono">{fmtCurrency(ek)}</td>
                  <td className="py-1 pr-1 text-right text-gray-400 hidden sm:table-cell">+</td>
                  <td className="py-1 pr-2 text-right tabular-nums font-mono text-gray-500">
                    {ek > 0 ? `${fmtPercent(markup)} %` : "—"}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums font-mono text-gray-500 hidden sm:table-cell">{fmtCurrency(aufschlag)}</td>
                  <td className="py-1 pr-1 text-gray-400 hidden sm:table-cell">=</td>
                  <td className="py-1 text-right tabular-nums font-mono font-semibold">{fmtCurrency(vk)}</td>
                </tr>
              ))}

              {Math.abs(kalkDifferenz) > 0.01 && (
                <tr data-testid="row-kalkdifferenz">
                  <td className="py-1 pr-2 text-gray-500 italic" colSpan={6}>+ Kalkulationsdifferenz</td>
                  <td className="py-1 text-right tabular-nums font-mono text-gray-500">{fmtCurrency(kalkDifferenz)}</td>
                </tr>
              )}

              <tr className="border-t-2 border-gray-800 font-semibold" data-testid="row-summe">
                <td className="py-2 pr-2">Summe Kosten</td>
                <td className="py-2 pr-2 text-right tabular-nums font-mono">{fmtCurrency(totalCost)}</td>
                <td className="py-2 pr-1 text-right text-gray-400 hidden sm:table-cell">+</td>
                <td className="py-2 pr-2 text-right tabular-nums font-mono">
                  {totalCost > 0 ? `${fmtPercent(totalAufschlag)} %` : "—"}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums font-mono hidden sm:table-cell">{fmtCurrency(totalAufschlagAmount)}</td>
                <td className="py-2 pr-1 text-gray-400 hidden sm:table-cell">=</td>
                <td className="py-2 text-right tabular-nums font-mono text-base font-bold">{fmtCurrency(gesamtsumme)}</td>
              </tr>
            </tbody>
          </table>

          <div className="border-t border-gray-200 pt-3 space-y-1.5">
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
              Arbeitszeit / Deckungsbeitrag
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-xs">
              <div className="text-gray-500">Gesamtarbeitszeit</div>
              <div className="text-right tabular-nums font-mono" data-testid="text-total-minutes">{fmtNumber(totalLaborTimeMinutes)} min</div>
              <div className="text-gray-500 pl-4">das entspricht</div>
              <div className="text-right tabular-nums font-mono" data-testid="text-total-hours">{fmtNumber(laborHours)} h</div>
              <div className="text-gray-500">Bei 8 h Tagesarbeitszeit</div>
              <div className="text-right tabular-nums font-mono">{fmtNumber(mannTage)} Manntage</div>
              <div className="text-gray-500 font-semibold pt-1">Deckungsbeitrag</div>
              <div className="text-right tabular-nums font-mono font-semibold pt-1 text-green-700" data-testid="text-deckungsbeitrag">
                {fmtCurrency(deckungsbeitrag)} / h
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
