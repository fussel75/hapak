import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { fmtCurrency, fmtPercent, fmtQty } from "@/lib/format";
import { kalkCalc } from "../../utils";
import { Clock, Info } from "lucide-react";
import type { EditorItem } from "../../types";

function KalkRow({
  label,
  ek,
  markup,
  onEkChange,
  onMarkupChange,
  onVkChange,
  onSubmit,
  color,
  readOnly,
}: {
  label: string;
  ek: string;
  markup: string;
  onEkChange: (v: string) => void;
  onMarkupChange: (v: string) => void;
  onVkChange: (v: string) => void;
  onSubmit: () => void;
  color: string;
  readOnly?: boolean;
}) {
  const [ekFocused, setEkFocused] = useState(false);
  const [mkFocused, setMkFocused] = useState(false);
  const [vkFocused, setVkFocused] = useState(false);
  const fmtBlur = (val: string) => {
    const normalized = val.replace(/\./g, "").replace(",", ".");
    return (parseFloat(normalized) || 0).toFixed(2);
  };
  const displayFmt = (val: string) => {
    const num = parseFloat(val) || 0;
    return num.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const toComma = (val: string) => (val || "0").replace(".", ",");
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); onSubmit(); }
  };

  const vk = kalkCalc(ek, markup);
  const vkStr = vk.toFixed(2);

  return (
    <tr>
      <td className="py-1.5 text-xs font-medium pr-3 text-nowrap">{label}</td>
      <td className="py-1.5">
        <input
          className={`h-8 text-xs text-right font-mono w-full border border-gray-300 rounded px-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${readOnly ? "bg-gray-50 text-gray-500" : ""}`}
          value={ekFocused ? toComma(ek) : displayFmt(ek)}
          onChange={(e) => !readOnly && onEkChange(e.target.value.replace(/\./g, "").replace(",", "."))}
          onFocus={(e) => { setEkFocused(true); setTimeout(() => (e.target as HTMLInputElement).select(), 0); }}
          onBlur={(e) => { setEkFocused(false); if (!readOnly) onEkChange(fmtBlur(e.target.value)); }}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          data-testid={`kalk-ek-${label.toLowerCase()}`}
        />
      </td>
      <td className="py-1.5 px-2">
        <input
          className={`h-8 text-xs text-right font-mono w-full border border-gray-300 rounded px-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${readOnly ? "bg-gray-50 text-gray-500" : ""}`}
          value={mkFocused ? toComma(markup) : displayFmt(markup)}
          onChange={(e) => !readOnly && onMarkupChange(e.target.value.replace(/\./g, "").replace(",", "."))}
          onFocus={(e) => { setMkFocused(true); setTimeout(() => (e.target as HTMLInputElement).select(), 0); }}
          onBlur={(e) => { setMkFocused(false); if (!readOnly) onMarkupChange(fmtBlur(e.target.value)); }}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          data-testid={`kalk-markup-${label.toLowerCase()}`}
        />
      </td>
      <td className="py-1.5">
        <input
          className={`h-8 text-xs text-right font-mono font-semibold w-full border border-gray-300 rounded px-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${color} ${readOnly ? "bg-gray-50" : ""}`}
          value={vkFocused ? toComma(vkStr) : displayFmt(vkStr)}
          onChange={(e) => {
            if (readOnly) return;
            const raw = e.target.value.replace(/\./g, "").replace(",", ".");
            onVkChange(raw);
          }}
          onFocus={(e) => { setVkFocused(true); setTimeout(() => (e.target as HTMLInputElement).select(), 0); }}
          onBlur={(e) => {
            setVkFocused(false);
            if (readOnly) return;
            const normalized = e.target.value.replace(/\./g, "").replace(",", ".");
            const newVk = parseFloat(normalized) || 0;
            onVkChange(newVk.toFixed(2));
          }}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          data-testid={`kalk-vk-${label.toLowerCase()}`}
        />
      </td>
    </tr>
  );
}

function JumboKalkRow({
  label,
  ek,
  vk,
  color,
}: {
  label: string;
  ek: number;
  vk: number;
  color: string;
}) {
  return (
    <tr>
      <td className="py-1.5 text-xs font-medium pr-3 text-nowrap">{label}</td>
      <td className="py-1.5 text-right text-xs font-mono text-gray-600">{fmtCurrency(ek.toFixed(2))}</td>
      <td className="py-1.5 px-2 text-right text-xs font-mono text-gray-600">{fmtPercent(ek > 0 ? ((vk / ek) - 1) * 100 : 0)}</td>
      <td className={`py-1.5 text-right text-xs font-mono font-semibold ${color}`}>{fmtCurrency(vk.toFixed(2))}</td>
    </tr>
  );
}

function reverseMarkup(ek: string, vk: string): string {
  const ekVal = parseFloat(ek) || 0;
  const vkVal = parseFloat(vk) || 0;
  if (ekVal <= 0) return "0";
  return ((vkVal / ekVal - 1) * 100).toFixed(2);
}

type KalkMode = "pauschal" | "detail";

function parseMoney(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = value.trim();
  const normalized =
    raw.includes(",") && raw.includes(".")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(",", ".");
  return parseFloat(normalized) || 0;
}

function markupFrom(ek: number, vk: number): string {
  if (ek <= 0) return "0.00";
  return (((vk / ek) - 1) * 100).toFixed(2);
}

function childQuantity(item: Partial<EditorItem>): number {
  const qty = parseMoney(item.quantity);
  return qty > 0 ? qty : 1;
}

function childVkTotal(item: Partial<EditorItem>): number {
  const total = parseMoney(item.totalPrice);
  if (total > 0) return total;
  return parseMoney(item.unitPrice) * childQuantity(item);
}

function calcJumboTotals(children: Partial<EditorItem>[], parent?: Partial<EditorItem>) {
  const calculationRows = children.length > 0 ? children : parent ? [parent] : [];
  const totals = {
    materialEk: 0,
    materialVk: 0,
    laborEk: 0,
    laborVk: 0,
    equipmentEk: 0,
    equipmentVk: 0,
    externalEk: 0,
    externalVk: 0,
  };

  for (const child of calculationRows) {
    const vk = childVkTotal(child);
    const quantity = childQuantity(child);
    const materialEk =
      parseMoney((child as any).materialCost) ||
      parseMoney(child.materialPrice);
    const laborTimeHours = parseMoney(child.laborTime) / 60;
    const laborEk =
      child.type === "lohn"
        ? parseMoney(child.laborCost) * quantity
        : parseMoney(child.laborCost) * (laborTimeHours > 0 ? laborTimeHours : 1);
    const equipmentEk = parseMoney(child.equipmentCost);
    const externalEk = parseMoney(child.externalCost);

    if (externalEk > 0) {
      totals.externalEk += externalEk;
      totals.externalVk += vk;
    } else if (equipmentEk > 0) {
      totals.equipmentEk += equipmentEk;
      totals.equipmentVk += vk;
    } else if (child.type === "lohn" || laborEk > 0) {
      totals.laborEk += laborEk;
      totals.laborVk += vk;
    } else if (child.type === "material" || materialEk > 0) {
      totals.materialEk += materialEk;
      totals.materialVk += vk;
    } else {
      totals.externalVk += vk;
    }
  }

  const totalEk = totals.materialEk + totals.laborEk + totals.equipmentEk + totals.externalEk;
  const totalVk = totals.materialVk + totals.laborVk + totals.equipmentVk + totals.externalVk;
  return { ...totals, totalEk, totalVk };
}

export function PriceDialog({
  open,
  item,
  jumboChildren = [],
  markupPercent,
  onClose,
  onUpdate,
}: {
  open: boolean;
  item: Partial<EditorItem>;
  jumboChildren?: Partial<EditorItem>[];
  markupPercent: number;
  onClose: () => void;
  onUpdate: (fields: Partial<EditorItem>) => void;
}) {
  const isJumbo = item.type === "jumbo";
  const jumboTotals = useMemo(() => calcJumboTotals(jumboChildren, item), [jumboChildren, item]);
  const [mode, setMode] = useState<KalkMode>("detail");
  const [pauschalPrice, setPauschalPrice] = useState("0");
  const [pauschalFocused, setPauschalFocused] = useState(false);

  const [mat, setMat] = useState({ ek: "0", markup: "0" });
  const [eq, setEq] = useState({ ek: "0", markup: "0" });
  const [ext, setExt] = useState({ ek: "0", markup: "0" });
  const [priceFollowsCost, setPriceFollowsCost] = useState(true);
  const [totalVkOverride, setTotalVkOverride] = useState<string | null>(null);
  const [totalVkFocused, setTotalVkFocused] = useState(false);

  const [laborTimeMin, setLaborTimeMin] = useState("0");
  const [laborEkRate, setLaborEkRate] = useState("0");
  const [laborVkRate, setLaborVkRate] = useState("0");

  const [ltFocused, setLtFocused] = useState(false);
  const [ekRateFocused, setEkRateFocused] = useState(false);
  const [vkRateFocused, setVkRateFocused] = useState(false);

  useEffect(() => {
    if (open) {
      if (isJumbo) {
        const calculatedPrice = jumboTotals.totalVk > 0 ? jumboTotals.totalVk.toFixed(2) : (item.unitPrice || "0");
        setMode(item.priceFollowsCost === false ? "pauschal" : "detail");
        setPauschalPrice(item.priceFollowsCost === false ? (item.unitPrice || "0") : calculatedPrice);
        setMat({ ek: jumboTotals.materialEk.toFixed(2), markup: markupFrom(jumboTotals.materialEk, jumboTotals.materialVk) });
        setEq({ ek: jumboTotals.equipmentEk.toFixed(2), markup: markupFrom(jumboTotals.equipmentEk, jumboTotals.equipmentVk) });
        setExt({ ek: jumboTotals.externalEk.toFixed(2), markup: markupFrom(jumboTotals.externalEk, jumboTotals.externalVk) });
        setLaborTimeMin("0");
        setLaborEkRate(jumboTotals.laborEk.toFixed(2));
        setLaborVkRate(jumboTotals.laborVk.toFixed(2));
        setPriceFollowsCost(item.priceFollowsCost !== false);
        setTotalVkOverride(null);
        return;
      }
      const hasKalk =
        (parseFloat(item.materialPrice || "0") > 0) ||
        (parseFloat(item.laborCost || "0") > 0) ||
        (parseFloat(item.equipmentCost || "0") > 0) ||
        (parseFloat(item.externalCost || "0") > 0) ||
        (parseFloat(item.laborTime || "0") > 0) ||
        (item.materialMarkup !== null && item.materialMarkup !== undefined) ||
        (item.laborMarkup !== null && item.laborMarkup !== undefined) ||
        (item.equipmentMarkup !== null && item.equipmentMarkup !== undefined) ||
        (item.externalMarkup !== null && item.externalMarkup !== undefined);

      if (hasKalk) {
        setMode("detail");
      } else {
        setMode("pauschal");
      }

      setPauschalPrice(item.unitPrice || "0");

      setMat({
        ek: item.materialPrice || "0",
        markup: item.materialMarkup ? String(item.materialMarkup) : String(markupPercent),
      });
      setEq({
        ek: item.equipmentCost || "0",
        markup: item.equipmentMarkup ? String(item.equipmentMarkup) : "0",
      });
      setExt({
        ek: item.externalCost || "0",
        markup: item.externalMarkup ? String(item.externalMarkup) : "0",
      });

      const lt = parseFloat(item.laborTime || "0") || 0;
      const lc = parseFloat(item.laborCost || "0") || 0;
      setLaborTimeMin(lt > 0 ? lt.toFixed(2) : "0");
      setLaborEkRate(lc > 0 ? lc.toFixed(2) : "0");

      if (lt > 0 && lc > 0) {
        const laborMarkupVal = parseFloat(String(item.laborMarkup || "0")) || 0;
        const vkRate = lc * (1 + laborMarkupVal / 100);
        setLaborVkRate(vkRate.toFixed(2));
      } else {
        setLaborVkRate("0");
      }

      setPriceFollowsCost(item.priceFollowsCost !== false);
      setTotalVkOverride(null);
    }
  }, [open, item, markupPercent, isJumbo, jumboTotals]);

  const laborTimeHours = (parseFloat(laborTimeMin) || 0) / 60;
  const laborEkPerUnit = (parseFloat(laborEkRate) || 0) * laborTimeHours;
  const laborVkPerUnit = (parseFloat(laborVkRate) || 0) * laborTimeHours;
  const laborMarkupPct = laborEkPerUnit > 0 ? ((laborVkPerUnit / laborEkPerUnit - 1) * 100) : 0;

  const vkMat = kalkCalc(mat.ek, mat.markup);
  const vkEq = kalkCalc(eq.ek, eq.markup);
  const vkExt = kalkCalc(ext.ek, ext.markup);
  const totalVk = vkMat + laborVkPerUnit + vkEq + vkExt;
  const totalEk =
    (parseFloat(mat.ek) || 0) +
    laborEkPerUnit +
    (parseFloat(eq.ek) || 0) +
    (parseFloat(ext.ek) || 0);
  const marge = totalVk - totalEk;
  const margePercent = totalEk > 0 ? (marge / totalEk) * 100 : 0;

  const displayFmt = (val: string) => {
    const num = parseFloat(val) || 0;
    return num.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const toComma = (val: string) => (val || "0").replace(".", ",");

  const fmtBlur = (val: string) => {
    const normalized = val.replace(/\./g, "").replace(",", ".");
    return (parseFloat(normalized) || 0).toFixed(2);
  };

  const handleVkRowChange = (
    category: "mat" | "eq" | "ext",
    newVkRaw: string
  ) => {
    const setter = { mat: setMat, eq: setEq, ext: setExt }[category];
    setter(prev => {
      const newMarkup = reverseMarkup(prev.ek, newVkRaw);
      return { ...prev, markup: newMarkup };
    });
  };

  const handleTotalVkChange = (newTotalVkRaw: string) => {
    setTotalVkOverride(newTotalVkRaw);
  };

  const commitTotalVk = () => {
    if (totalVkOverride === null) return;
    const newTotal = parseFloat(totalVkOverride) || 0;
    if (totalVk <= 0 || newTotal <= 0) {
      setTotalVkOverride(null);
      return;
    }
    const factor = newTotal / totalVk;
    const adjustMarkup = (prev: { ek: string; markup: string }) => {
      const ekVal = parseFloat(prev.ek) || 0;
      if (ekVal <= 0) return prev;
      const oldVk = kalkCalc(prev.ek, prev.markup);
      const newVk = oldVk * factor;
      const newMarkup = ((newVk / ekVal - 1) * 100).toFixed(2);
      return { ...prev, markup: newMarkup };
    };
    setMat(adjustMarkup);
    setEq(adjustMarkup);
    setExt(adjustMarkup);
    if (laborVkPerUnit > 0) {
      const newLaborVk = laborVkPerUnit * factor;
      const newVkRate = laborTimeHours > 0 ? newLaborVk / laborTimeHours : 0;
      setLaborVkRate(newVkRate.toFixed(2));
    }
    setTotalVkOverride(null);
  };

  const handleSubmit = () => {
    const qty = parseFloat(item.quantity || "1") || 1;

    if (mode === "pauschal") {
      const price = parseFloat(pauschalPrice) || 0;
      const fields: Partial<EditorItem> = isJumbo
        ? {
            unitPrice: price.toFixed(2),
            totalPrice: (price * qty).toFixed(2),
            priceFollowsCost: false,
          }
        : {
            unitPrice: price.toFixed(2),
            totalPrice: (price * qty).toFixed(2),
            materialPrice: "0",
            laborCost: "0",
            equipmentCost: "0",
            externalCost: "0",
            materialMarkup: null,
            laborMarkup: null,
            equipmentMarkup: null,
            externalMarkup: null,
            laborPrice: "0",
            laborTime: "0",
            priceFollowsCost: false,
          };
      onUpdate(fields);
      onClose();
      return;
    }

    if (isJumbo) {
      onUpdate({
        unitPrice: jumboTotals.totalVk.toFixed(2),
        totalPrice: (jumboTotals.totalVk * qty).toFixed(2),
        priceFollowsCost: true,
      });
      onClose();
      return;
    }

    if (totalVkOverride !== null) commitTotalVk();
    const finalVkMat = kalkCalc(mat.ek, mat.markup);
    const finalVkEq = kalkCalc(eq.ek, eq.markup);
    const finalVkExt = kalkCalc(ext.ek, ext.markup);
    const finalLaborVk = laborVkPerUnit;
    const finalTotalVk = finalVkMat + finalLaborVk + finalVkEq + finalVkExt;

    const ekRate = parseFloat(laborEkRate) || 0;
    const vkRate = parseFloat(laborVkRate) || 0;
    const computedLaborMarkup = ekRate > 0 ? ((vkRate / ekRate - 1) * 100) : 0;

    const fields: Partial<EditorItem> = {
      materialPrice: mat.ek,
      laborCost: laborEkRate,
      laborTime: laborTimeMin,
      equipmentCost: eq.ek,
      externalCost: ext.ek,
      materialMarkup: mat.markup && parseFloat(mat.markup) ? String(parseFloat(mat.markup)) : null,
      laborMarkup: computedLaborMarkup !== 0 ? String(parseFloat(computedLaborMarkup.toFixed(3))) : null,
      equipmentMarkup: eq.markup && parseFloat(eq.markup) ? String(parseFloat(eq.markup)) : null,
      externalMarkup: ext.markup && parseFloat(ext.markup) ? String(parseFloat(ext.markup)) : null,
      priceFollowsCost,
    };
    fields.unitPrice = finalTotalVk.toFixed(2);
    fields.totalPrice = (finalTotalVk * qty).toFixed(2);
    fields.laborPrice = vkRate.toFixed(2);
    onUpdate(fields);
    onClose();
  };

  const totalVkDisplay = totalVkOverride !== null ? totalVkOverride : totalVk.toFixed(2);

  const handleModeSwitch = (newMode: KalkMode) => {
    if (newMode === mode) return;
    if (newMode === "pauschal" && mode === "detail") {
      const basis = isJumbo ? jumboTotals.totalVk : totalVk;
      setPauschalPrice(basis > 0 ? basis.toFixed(2) : (item.unitPrice || "0"));
    }
    if (!isJumbo && newMode === "detail" && mode === "pauschal") {
      const price = parseFloat(pauschalPrice) || 0;
      if (price > 0 && totalEk <= 0) {
        setMat({ ek: "0", markup: String(markupPercent) });
        setLaborTimeMin("0");
        setLaborEkRate("0");
        setLaborVkRate("0");
        setEq({ ek: "0", markup: "0" });
        setExt({ ek: "0", markup: "0" });
      }
    }
    setMode(newMode);
  };

  const formatTimeHM = (minutes: number): string => {
    if (minutes <= 0) return "0:00";
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h}:${m.toString().padStart(2, "0")}`;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); handleSubmit(); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-sm">Kalkulation: {item.title || "Position"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-6 pb-2 border-b">
            <label className="flex items-center gap-2 cursor-pointer text-xs" data-testid="kalk-mode-pauschal">
              <input
                type="radio"
                name="kalk-mode"
                checked={mode === "pauschal"}
                onChange={() => handleModeSwitch("pauschal")}
                className="accent-blue-600"
              />
              <span className={mode === "pauschal" ? "font-semibold" : ""}>Position wird pauschal berechnet mit</span>
              {mode === "pauschal" && (
                <input
                  className="h-7 text-xs text-right font-mono font-semibold w-[100px] border border-gray-300 rounded px-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ml-1"
                  value={pauschalFocused ? toComma(pauschalPrice) : displayFmt(pauschalPrice)}
                  onChange={(e) => setPauschalPrice(e.target.value.replace(/\./g, "").replace(",", "."))}
                  onFocus={(e) => { setPauschalFocused(true); setTimeout(() => (e.target as HTMLInputElement).select(), 0); }}
                  onBlur={(e) => {
                    setPauschalFocused(false);
                    const normalized = e.target.value.replace(/\./g, "").replace(",", ".");
                    setPauschalPrice((parseFloat(normalized) || 0).toFixed(2));
                  }}
                  onKeyDown={handleKeyDown}
                  data-testid="kalk-pauschal-price"
                />
              )}
              {mode === "pauschal" && <span className="text-xs text-muted-foreground">€</span>}
            </label>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs" data-testid="kalk-mode-detail">
              <input
                type="radio"
                name="kalk-mode"
                checked={mode === "detail"}
                onChange={() => handleModeSwitch("detail")}
                className="accent-blue-600"
              />
              <span className={mode === "detail" ? "font-semibold" : ""}>Detaillierte Kalkulation</span>
            </label>
          </div>

          {isJumbo && mode === "detail" && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              {jumboChildren.length > 0
                ? "Diese JUMBO-Position wird aus den enthaltenen Positionen berechnet. Einzelpreis und Gesamtpreis folgen der Summe der Unterpositionen und der Menge des Jumbos."
                : "Diese JUMBO-Position wird aus der gespeicherten Detailkalkulation berechnet. Einzelpreis und Gesamtpreis folgen den Kostenarten und der Menge des Jumbos."}
            </div>
          )}

          {isJumbo && mode === "pauschal" && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Der manuelle Pauschalpreis ueberschreibt den aus den Unterpositionen berechneten Verkaufspreis. Die enthaltenen Positionen bleiben sichtbar und koennen weiter bearbeitet werden.
            </div>
          )}

          {mode === "detail" && isJumbo && (
            <>
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-left text-[10px] text-muted-foreground py-1 w-[100px]">Kostenart</th>
                    <th className="text-right text-[10px] text-muted-foreground w-[110px]">EK (EUR)</th>
                    <th className="text-right text-[10px] text-muted-foreground px-2 w-[80px]">Aufschl. %</th>
                    <th className="text-right text-[10px] text-muted-foreground w-[110px]">VK (EUR)</th>
                  </tr>
                </thead>
                <tbody>
                  <JumboKalkRow label="Material" ek={jumboTotals.materialEk} vk={jumboTotals.materialVk} color="text-green-700" />
                  <JumboKalkRow label="Lohn" ek={jumboTotals.laborEk} vk={jumboTotals.laborVk} color="text-orange-700" />
                  <JumboKalkRow label="Gerät" ek={jumboTotals.equipmentEk} vk={jumboTotals.equipmentVk} color="text-blue-700" />
                  <JumboKalkRow label="Fremdleistung" ek={jumboTotals.externalEk} vk={jumboTotals.externalVk} color="text-purple-700" />
                  <tr className="border-t border-gray-300">
                    <td className="py-2 text-xs font-bold">Gesamt</td>
                    <td className="text-right text-xs font-mono font-semibold py-2">{fmtCurrency(jumboTotals.totalEk.toFixed(2))}</td>
                    <td></td>
                    <td className="text-right text-xs font-mono font-bold py-2">{fmtCurrency(jumboTotals.totalVk.toFixed(2))}</td>
                  </tr>
                  <tr>
                    <td colSpan={2} className="text-xs text-muted-foreground pb-1">Deckungsbeitrag (Marge)</td>
                    <td></td>
                    <td className={`text-right text-xs font-mono font-semibold pb-1 ${jumboTotals.totalVk - jumboTotals.totalEk >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {fmtCurrency((jumboTotals.totalVk - jumboTotals.totalEk).toFixed(2))} ({fmtPercent(jumboTotals.totalEk > 0 ? ((jumboTotals.totalVk - jumboTotals.totalEk) / jumboTotals.totalEk) * 100 : 0)})
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="flex items-center gap-4 pt-2 border-t text-xs text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">Preise je {fmtQty(item.quantity)} {item.unit || "Stk"}</span>
                </div>
                <div className="flex-1" />
                <span>{jumboChildren.length} Unterposition{jumboChildren.length === 1 ? "" : "en"}</span>
              </div>
            </>
          )}

          {mode === "detail" && !isJumbo && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2" data-testid="kalk-labor-section">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-xs font-semibold text-blue-800">Lohnkalkulation</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] text-blue-600 font-medium block mb-0.5">Selbstkosten-Lohnsatz</label>
                    <div className="flex items-center gap-1">
                      <input
                        className="h-7 text-xs text-right font-mono w-full border border-blue-300 rounded px-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
                        value={ekRateFocused ? toComma(laborEkRate) : displayFmt(laborEkRate)}
                        onChange={(e) => setLaborEkRate(e.target.value.replace(/\./g, "").replace(",", "."))}
                        onFocus={(e) => { setEkRateFocused(true); setTimeout(() => (e.target as HTMLInputElement).select(), 0); }}
                        onBlur={(e) => { setEkRateFocused(false); setLaborEkRate(fmtBlur(e.target.value)); }}
                        onKeyDown={handleKeyDown}
                        data-testid="kalk-labor-ek-rate"
                      />
                      <span className="text-[10px] text-blue-600 whitespace-nowrap">€/h</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-blue-600 font-medium block mb-0.5">Zeitbedarf</label>
                    <div className="flex items-center gap-1">
                      <input
                        className="h-7 text-xs text-right font-mono w-full border border-blue-300 rounded px-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
                        value={ltFocused ? toComma(laborTimeMin) : displayFmt(laborTimeMin)}
                        onChange={(e) => setLaborTimeMin(e.target.value.replace(/\./g, "").replace(",", "."))}
                        onFocus={(e) => { setLtFocused(true); setTimeout(() => (e.target as HTMLInputElement).select(), 0); }}
                        onBlur={(e) => { setLtFocused(false); setLaborTimeMin(fmtBlur(e.target.value)); }}
                        onKeyDown={handleKeyDown}
                        data-testid="kalk-labor-time"
                      />
                      <span className="text-[10px] text-blue-600 whitespace-nowrap">min</span>
                    </div>
                    {laborTimeHours > 0 && (
                      <div className="text-[10px] text-blue-500 mt-0.5 text-right font-mono">
                        = {laborTimeHours.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] text-blue-600 font-medium block mb-0.5">kalk. Lohnsatz</label>
                    <div className="flex items-center gap-1">
                      <input
                        className="h-7 text-xs text-right font-mono w-full border border-blue-300 rounded px-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
                        value={vkRateFocused ? toComma(laborVkRate) : displayFmt(laborVkRate)}
                        onChange={(e) => setLaborVkRate(e.target.value.replace(/\./g, "").replace(",", "."))}
                        onFocus={(e) => { setVkRateFocused(true); setTimeout(() => (e.target as HTMLInputElement).select(), 0); }}
                        onBlur={(e) => { setVkRateFocused(false); setLaborVkRate(fmtBlur(e.target.value)); }}
                        onKeyDown={handleKeyDown}
                        data-testid="kalk-labor-vk-rate"
                      />
                      <span className="text-[10px] text-blue-600 whitespace-nowrap">€/h</span>
                    </div>
                    {laborMarkupPct !== 0 && (
                      <div className="text-[10px] text-blue-500 mt-0.5 text-right font-mono">
                        Aufschlag {laborMarkupPct.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %
                      </div>
                    )}
                  </div>
                </div>
                {laborTimeHours > 0 && (parseFloat(laborEkRate) || 0) > 0 && (
                  <div className="flex justify-between text-[10px] text-blue-700 border-t border-blue-200 pt-1.5 mt-1 font-mono">
                    <span>Lohn EK: {displayFmt(laborEkPerUnit.toFixed(2))} €</span>
                    <span>Lohn VK: {displayFmt(laborVkPerUnit.toFixed(2))} €</span>
                  </div>
                )}
              </div>

              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-left text-[10px] text-muted-foreground py-1 w-[100px]">Kostenart</th>
                    <th className="text-right text-[10px] text-muted-foreground w-[110px]">EK (€)</th>
                    <th className="text-right text-[10px] text-muted-foreground px-2 w-[80px]">Aufschl. %</th>
                    <th className="text-right text-[10px] text-muted-foreground w-[110px]">VK (€)</th>
                  </tr>
                </thead>
                <tbody>
                  <KalkRow label="Material" ek={mat.ek} markup={mat.markup} onEkChange={(v) => setMat(s => ({ ...s, ek: v }))} onMarkupChange={(v) => setMat(s => ({ ...s, markup: v }))} onVkChange={(v) => handleVkRowChange("mat", v)} onSubmit={handleSubmit} color="text-green-700" />
                  <KalkRow
                    label="Lohn"
                    ek={laborEkPerUnit.toFixed(2)}
                    markup={laborMarkupPct.toFixed(2)}
                    onEkChange={() => {}}
                    onMarkupChange={() => {}}
                    onVkChange={() => {}}
                    onSubmit={handleSubmit}
                    color="text-orange-700"
                    readOnly
                  />
                  <KalkRow label="Gerät" ek={eq.ek} markup={eq.markup} onEkChange={(v) => setEq(s => ({ ...s, ek: v }))} onMarkupChange={(v) => setEq(s => ({ ...s, markup: v }))} onVkChange={(v) => handleVkRowChange("eq", v)} onSubmit={handleSubmit} color="text-blue-700" />
                  <KalkRow label="Fremdleistung" ek={ext.ek} markup={ext.markup} onEkChange={(v) => setExt(s => ({ ...s, ek: v }))} onMarkupChange={(v) => setExt(s => ({ ...s, markup: v }))} onVkChange={(v) => handleVkRowChange("ext", v)} onSubmit={handleSubmit} color="text-purple-700" />
                  <tr className="border-t border-gray-300">
                    <td className="py-2 text-xs font-bold">Gesamt</td>
                    <td className="text-right text-xs font-mono font-semibold py-2">{fmtCurrency(totalEk.toFixed(2))}</td>
                    <td></td>
                    <td className="py-2">
                      <input
                        className="h-8 text-xs text-right font-mono font-bold w-full border border-gray-300 rounded px-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        value={totalVkFocused ? toComma(totalVkDisplay) : displayFmt(totalVkDisplay)}
                        onChange={(e) => handleTotalVkChange(e.target.value.replace(/\./g, "").replace(",", "."))}
                        onFocus={(e) => { setTotalVkFocused(true); setTimeout(() => (e.target as HTMLInputElement).select(), 0); }}
                        onBlur={(e) => {
                          setTotalVkFocused(false);
                          commitTotalVk();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); commitTotalVk(); handleSubmit(); }
                        }}
                        data-testid="kalk-vk-gesamt"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={2} className="text-xs text-muted-foreground pb-1">Deckungsbeitrag (Marge)</td>
                    <td></td>
                    <td className={`text-right text-xs font-mono font-semibold pb-1 ${marge >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {fmtCurrency(marge.toFixed(2))} ({fmtPercent(margePercent)})
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="flex items-center gap-4 pt-2 border-t text-xs text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">Preise je {fmtQty(item.quantity)} {item.unit || "Stk"}</span>
                </div>
                <div className="flex-1" />
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={priceFollowsCost}
                    onChange={(e) => setPriceFollowsCost(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Verkaufspreis folgt den Kosten
                </label>
              </div>
            </>
          )}

          {mode === "pauschal" && (
            <div className="text-xs text-muted-foreground py-4 text-center border rounded bg-muted/30">
              <p>Keine Kalkulationsdetails — der Einheitspreis wird direkt als Pauschalpreis übernommen.</p>
              <p className="mt-1 font-medium text-foreground">
                Preise je {fmtQty(item.quantity)} {item.unit || "Stk"}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="kalk-cancel">
            Abbrechen
          </Button>
          <Button data-testid="kalk-submit" onClick={handleSubmit}>
            Übernehmen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
