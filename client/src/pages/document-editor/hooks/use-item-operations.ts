import { useCallback, useMemo as useMemoReact } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { fmtPercent, fmtCurrency } from "@/lib/format";
import {
  recalcAllSums,
  buildPositionNumbers,
} from "@shared/document-engine/compute-document-bundle";
import { parseGermanDecimal } from "@shared/document-engine/number-input";
import { recalcJumboFromChildren } from "@shared/document-engine/jumbo";
import { countsForTotal } from "@shared/document-engine/position-types";
import type { LaborRate, CompanySettings, Document, EditorSettings } from "@shared/schema";
import type { EditorItem, IdsArticle, JumboPackage, Material } from "../types";
import { genClientId, emptyItem, getJumboChildInsertIndex, getJumboParentClientId } from "../utils";

export function resolveLaborVkPrice(rate: LaborRate, priceLevel: number): number {
  const tryParse = (v: string | null | undefined): number | null => {
    if (v == null || v === "") return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };
  if (priceLevel === 3) { const p = tryParse(rate.salePrice3); if (p != null) return p; }
  if (priceLevel >= 2) { const p = tryParse(rate.salePrice2); if (p != null) return p; }
  const p1 = tryParse(rate.salePrice1);
  if (p1 != null) return p1;
  return tryParse(rate.hourlyRate) ?? 0;
}

interface UseItemOperationsParams {
  items: EditorItem[];
  setItems: React.Dispatch<React.SetStateAction<EditorItem[]>>;
  focusedRow: number | null;
  setFocusedRow: React.Dispatch<React.SetStateAction<number | null>>;
  setDirty: React.Dispatch<React.SetStateAction<boolean>>;
  setDocForm?: React.Dispatch<React.SetStateAction<any>>;
  setExpandedJumbos: React.Dispatch<React.SetStateAction<Set<string>>>;
  setLohnTargetJumbo: React.Dispatch<React.SetStateAction<number | null>>;
  docForm: {
    taxRate: string;
    skontoPercent: string;
    skontoDays: number;
    skontoNurMaterial?: boolean;
    priceLevel?: number;
    autoPositionNumbers?: boolean;
    positionNumberStep?: number;
    positionNumberStart?: number;
    kurztexteAnzeigen?: boolean;
    langtexteFormatiert?: boolean;
    kupferpreisBeruecksichtigen?: boolean;
    kupferNotation?: string;
  };
  documentId: number | undefined;
  docRecord: Document | undefined;
  tableRef: React.RefObject<HTMLTableElement | null>;
  companySettings: CompanySettings | null | undefined;
  editorSettings?: EditorSettings | null;
}

export interface ItemOperations {
  recalcTitelsummen: (allItems: EditorItem[]) => EditorItem[];
  recalcJumboPrice: (allItems: EditorItem[], jumboIndex: number) => EditorItem[];
  addPosition: (type: string, parentJumboIndex?: number, insertAfterIndex?: number) => void;
  updateItem: (index: number, field: string, value: string) => void;
  removeItem: (index: number) => Promise<void>;
  copyItem: (index: number) => void;
  moveItem: (index: number, direction: -1 | 1) => void;
  insertFloskel: (text: string, name: string) => void;
  insertLohn: (rate: LaborRate, minutes: number, jumboIndex?: number) => void;
  insertFromIds: (articles: IdsArticle[], parentJumboIndex?: number) => void;
  insertFromJumboPackage: (jumbo: JumboPackage, qty: number) => void;
  insertProzentZuschlag: (title: string, amount: number) => void;
  updateMaterialPrices: () => Promise<void>;
  setzeAlternativ: (index: number) => void;
  setzeBedarf: (index: number) => void;
  getTitleBlockIndices: (titleIndex: number) => number[];
  insertFromMaterial: (mat: Material, qty: number, parentJumboIndex?: number) => void;
  positionNumbers: Map<string, string>;
  engineNetTotal: number;
  netTotal: number;
  taxAmount: number;
  grossTotal: number;
  ekTotal: number;
  margeTotal: number;
  markupPercent: number;
  laborTotal: number;
}

export function useItemOperations(params: UseItemOperationsParams): ItemOperations {
  const {
    items,
    setItems,
    focusedRow,
    setFocusedRow,
    setDirty,
    setDocForm,
    setExpandedJumbos,
    setLohnTargetJumbo,
    docForm,
    documentId,
    docRecord,
    tableRef,
    companySettings,
    editorSettings,
  } = params;
  const { toast } = useToast();

  const recalcTitelsummen = useCallback(
    (allItems: EditorItem[]): EditorItem[] => {
      return recalcAllSums(
        allItems,
        parseFloat(docForm.taxRate || "19"),
        parseFloat(docForm.skontoPercent || "0"),
        docForm.skontoDays || 0,
        docForm.skontoNurMaterial === true,
      ) as EditorItem[];
    },
    [docForm.taxRate, docForm.skontoPercent, docForm.skontoDays, docForm.skontoNurMaterial],
  );

  const recalcJumboPrice = useCallback(
    (allItems: EditorItem[], jumboIndex: number): EditorItem[] => {
      return recalcJumboFromChildren(allItems, jumboIndex);
    },
    [],
  );

  const engineNetTotal = items.reduce((s, i) => {
    if (!countsForTotal(i)) return s;
    return s + parseFloat(i.totalPrice || "0");
  }, 0);

  const laborTotal = items.reduce(
    (s, i) => {
      if (!countsForTotal(i)) return s;
      const laborVkRate = parseFloat(i.laborPrice || "0");
      const laborTimeHrs = parseFloat(i.laborTime || "0") / 60;
      return s + laborVkRate * laborTimeHrs;
    },
    0,
  );

  const parseMoney = (value: string | number | null | undefined) => {
    const n = typeof value === "number" ? value : parseFloat(value || "0");
    return Number.isFinite(n) ? n : 0;
  };

  const ekTotal = items.reduce((s, i) => {
    if (!countsForTotal(i)) return s;
    const materialCost = parseMoney(i.materialCost);
    const materialFallback = materialCost > 0 ? materialCost : parseMoney(i.materialPrice);
    return (
      s +
      materialFallback +
      parseMoney(i.laborCost) +
      parseMoney(i.equipmentCost) +
      parseMoney(i.externalCost)
    );
  }, 0);

  const taxRate = parseFloat(docForm.taxRate) / 100;
  const netTotal = engineNetTotal;
  const taxAmount = engineNetTotal * taxRate;
  const grossTotal = engineNetTotal + engineNetTotal * taxRate;

  const margeTotal = netTotal - ekTotal;
  const markupPercent =
    parseFloat(companySettings?.materialMarkupPercent || "30") || 30;

  const positionNumbers = useMemoReact(
    () => buildPositionNumbers(items, {
      auto: docForm.autoPositionNumbers !== false,
      step: docForm.positionNumberStep || 1,
      start: docForm.positionNumberStart || 1,
    }),
    [items, docForm.autoPositionNumbers, docForm.positionNumberStep, docForm.positionNumberStart],
  );

  const addPosition = useCallback(
    (type: string, parentJumboIndex?: number, insertAfterIndex?: number) => {
      const parentClientId = getJumboParentClientId(items, parentJumboIndex);
      const invalidParentInsert =
        parentJumboIndex != null && !parentClientId ? parentJumboIndex + 1 : null;
      const explicitInsert =
        insertAfterIndex != null ? insertAfterIndex + 1 : invalidParentInsert;
      const insertAt =
        explicitInsert != null
          ? explicitInsert
          : parentClientId && parentJumboIndex != null
            ? getJumboChildInsertIndex(items, parentJumboIndex)
            : focusedRow !== null
              ? focusedRow + 1
              : items.length;
      const newItem = emptyItem(
        type,
        documentId || 0,
        insertAt,
        parentClientId,
      );
      if (type === "material" && editorSettings?.stdMeMaterial) {
        newItem.unit = editorSettings.stdMeMaterial;
      } else if (type === "leistung" && editorSettings?.stdMeLeistung) {
        newItem.unit = editorSettings.stdMeLeistung;
      } else if (type === "jumbo" && editorSettings?.stdMeJumbo) {
        newItem.unit = editorSettings.stdMeJumbo;
      } else if (type === "manuell") {
        newItem.unit = "Stk";
      }
      if (type === "abschluss") {
        newItem.title = "Abschluss";
        newItem.totalPrice = netTotal.toFixed(2);
        const updated = items.filter(it => it.type !== "nettosumme" && it.type !== "gesamtsumme");
        updated.push(newItem);
        updated.forEach((item, i) => { item.sortOrder = i; });
        setItems(recalcTitelsummen(updated));
        setFocusedRow(updated.length - 1);
        setDirty(true);
        return;
      } else if (type === "skonto") {
        setDocForm?.((f: any) => ({ ...f, skontoImDokument: true }));
        const skontoPercent = parseFloat(docForm.skontoPercent || "0");
        const hasValidSkontoTerms = skontoPercent > 0 && (docForm.skontoDays || 0) > 0;
        newItem.title = hasValidSkontoTerms
          ? `${fmtPercent(docForm.skontoPercent)} Skonto bei Zahlung innerhalb ${docForm.skontoDays} Tagen`
          : "Skonto";
        newItem.totalPrice = hasValidSkontoTerms
          ? (-((grossTotal * skontoPercent) / 100)).toFixed(2)
          : "0.00";
      } else if (type === "titelsumme") {
        const st = editorSettings?.standardtexte as Record<string, string> | undefined;
        newItem.title = st?.titelsummenText?.replace("{Titel}", "") || "Titelsumme";
      } else if (type === "zwischensumme") {
        const st = editorSettings?.standardtexte as Record<string, string> | undefined;
        newItem.title = st?.zwischensummenText || "Zwischensumme";
      } else if (type === "untertitel") {
        newItem.type = "gruppe";
        newItem.title = "";
      } else if (type === "fahrtkosten") {
        newItem.title = "Fahrtkosten";
        newItem.unit = "pau";
        newItem.quantity = "1.000";
      } else if (type === "frachtkosten") {
        newItem.title = "Frachtkosten";
        newItem.unit = "pau";
        newItem.quantity = "1.000";
      }
      const updated = [...items];
      updated.splice(insertAt, 0, newItem);
      if (type === "skonto") {
        const skontoAmount = Math.abs(parseFloat(newItem.totalPrice || "0"));
        const zahlbetragNachSkonto = grossTotal - skontoAmount;
        newItem.description = skontoAmount > 0
          ? `Zahlbetrag bei Skontoabzug ${fmtCurrency(zahlbetragNachSkonto)}`
          : "";
      }
      if (type === "titel" && editorSettings?.titelsummenAutoEinfuegen) {
        const tsItem = emptyItem("titelsumme", documentId || 0, insertAt + 1, null);
        const stx = editorSettings?.standardtexte as Record<string, string> | undefined;
        tsItem.title = stx?.titelsummenText?.replace("{Titel}", "") || "Titelsumme";
        updated.splice(insertAt + 1, 0, tsItem);
      }
      updated.forEach((item, i) => {
        item.sortOrder = i;
      });
      const recalculatedItems =
        parentClientId && parentJumboIndex != null
          ? recalcJumboPrice(updated, parentJumboIndex)
          : updated;
      if (parentClientId) {
        setExpandedJumbos((prev) => new Set([...prev, parentClientId]));
      }
      setItems(recalcTitelsummen(recalculatedItems));
      setFocusedRow(insertAt);
      setDirty(true);
      if (type === "jumbo")
        setExpandedJumbos((prev) => new Set([...prev, newItem._clientId]));
      setTimeout(() => {
        const row = tableRef.current?.querySelector(`[data-row="${insertAt}"]`);
        (row?.querySelector("input") as HTMLInputElement)?.focus();
      }, 50);
    },
    [
      focusedRow,
      items,
      documentId,
      netTotal,
      grossTotal,
      docForm.skontoPercent,
      docForm.skontoDays,
      recalcJumboPrice,
      recalcTitelsummen,
      setItems,
      setFocusedRow,
      setDirty,
      setDocForm,
      setExpandedJumbos,
      tableRef,
      editorSettings,
    ],
  );

  const updateItem = useCallback(
    (index: number, field: string, value: string) => {
      setItems((prev) => {
        const updated = [...prev];
        const item = { ...updated[index], [field]: value };
        if (field === "quantity" || field === "unitPrice") {
          item.totalPrice = (
            parseGermanDecimal(item.quantity) * parseGermanDecimal(item.unitPrice)
          ).toFixed(2);
        }
        if (field === "materialPrice" && editorSettings?.vkPreisNachEk !== false) {
          const ekPrice = parseGermanDecimal(value);
          const aufschlag = parseGermanDecimal(String(editorSettings?.aufschlagMaterial1 ?? "30")) / 100;
          if (ekPrice > 0) {
            const newVk = ekPrice * (1 + aufschlag);
            item.unitPrice = newVk.toFixed(2);
            item.totalPrice = (parseGermanDecimal(item.quantity) * newVk).toFixed(2);
          }
        }
        updated[index] = item;
        if (editorSettings?.gleichartigeAktualisieren && (field === "unitPrice" || field === "materialPrice")) {
          const artNr = item.articleNumber;
          if (artNr) {
            for (let j = 0; j < updated.length; j++) {
              if (j === index) continue;
              if (updated[j].articleNumber === artNr) {
                const other = { ...updated[j], [field]: value };
                if (field === "unitPrice") {
                  other.totalPrice = (parseGermanDecimal(other.quantity) * parseGermanDecimal(value)).toFixed(2);
                }
                if (field === "materialPrice" && editorSettings?.vkPreisNachEk !== false) {
                  const ekP = parseGermanDecimal(value);
                  const auf = parseGermanDecimal(String(editorSettings?.aufschlagMaterial1 ?? "30")) / 100;
                  if (ekP > 0) {
                    const vk = ekP * (1 + auf);
                    other.unitPrice = vk.toFixed(2);
                    other.totalPrice = (parseGermanDecimal(other.quantity) * vk).toFixed(2);
                  }
                }
                updated[j] = other;
              }
            }
          }
        }
        let result = updated;
        if (item._parentClientId) {
          const pi = result.findIndex(
            (p) => p._clientId === item._parentClientId,
          );
          if (pi >= 0) result = recalcJumboPrice(result, pi);
        }
        if ((item.positionFlag === "jumbo" || (item.type === "jumbo" && !item._parentClientId)) && field === "quantity")
          result = recalcJumboPrice(result, index);
        if (["quantity", "unitPrice", "totalPrice", "title", "materialPrice"].includes(field))
          result = recalcTitelsummen(result);
        return result;
      });
      setDirty(true);
    },
    [recalcJumboPrice, recalcTitelsummen, setItems, setDirty, editorSettings],
  );

  const removeItem = useCallback(
    async (index: number) => {
      const item = items[index];
      if (item.id) {
        await apiRequest("DELETE", `/api/document-items/${item.id}`);
      }
      if (item.positionFlag === "jumbo" || (item.type === "jumbo" && !item._parentClientId)) {
        const jcid = item._clientId;
        const children = items.filter((i) => i._parentClientId === jcid);
        for (const c of children) {
          if (c.id) {
            try {
              await apiRequest("DELETE", `/api/document-items/${c.id}`);
            } catch {}
          }
        }
        setItems((prev) =>
          recalcTitelsummen(
            prev.filter(
              (it) => it._clientId !== jcid && it._parentClientId !== jcid,
            ),
          ),
        );
      } else {
        setItems((prev) => {
          const updated = prev.filter((_, i) => i !== index);
          let result = updated;
          if (item._parentClientId) {
            const pi = result.findIndex(
              (p) => p._clientId === item._parentClientId,
            );
            if (pi >= 0) result = recalcJumboPrice(result, pi);
          }
          return recalcTitelsummen(result);
        });
      }
      setFocusedRow(null);
      setDirty(true);
    },
    [items, recalcJumboPrice, recalcTitelsummen, setItems, setFocusedRow, setDirty],
  );

  const copyItem = useCallback(
    (index: number) => {
      const source = items[index];
      const copy: EditorItem = {
        ...source,
        id: undefined,
        _clientId: genClientId(),
        sortOrder: index + 1,
      };
      const updated = [...items];
      updated.splice(index + 1, 0, copy);
      updated.forEach((it, i) => {
        it.sortOrder = i;
      });
      let result = updated;
      if (source._parentClientId) {
        const pi = result.findIndex(
          (p) => p._clientId === source._parentClientId,
        );
        if (pi >= 0) result = recalcJumboPrice(result, pi);
      }
      setItems(recalcTitelsummen(result));
      setFocusedRow(index + 1);
      setDirty(true);
    },
    [items, recalcJumboPrice, recalcTitelsummen, setItems, setFocusedRow, setDirty],
  );

  const moveItem = useCallback(
    (index: number, direction: -1 | 1) => {
      const ni = index + direction;
      if (ni < 0 || ni >= items.length) return;
      const updated = [...items];
      [updated[index], updated[ni]] = [updated[ni], updated[index]];
      updated.forEach((it, i) => {
        it.sortOrder = i;
      });
      setItems(recalcTitelsummen(updated));
      setFocusedRow(ni);
      setDirty(true);
    },
    [items, recalcTitelsummen, setItems, setFocusedRow, setDirty],
  );

  const insertFloskel = useCallback(
    (text: string, name: string) => {
      const at = focusedRow !== null ? focusedRow + 1 : items.length;
      const newItem = emptyItem("freitext", documentId || 0, at);
      newItem.title = text;
      const updated = [...items];
      updated.splice(at, 0, newItem);
      updated.forEach((it, i) => {
        it.sortOrder = i;
      });
      setItems(recalcTitelsummen(updated));
      setFocusedRow(at);
      setDirty(true);
    },
    [focusedRow, items, documentId, recalcTitelsummen, setItems, setFocusedRow, setDirty],
  );

  const insertLohn = useCallback(
    (rate: LaborRate, minutes: number, jumboIndex?: number) => {
      const hours = minutes / 60;
      const hourlyRate = resolveLaborVkPrice(rate, docForm.priceLevel || 1);
      const total = hours * hourlyRate;
      const parentClientId = getJumboParentClientId(items, jumboIndex);
      const at =
        parentClientId && jumboIndex != null
          ? getJumboChildInsertIndex(items, jumboIndex)
          : jumboIndex != null
            ? jumboIndex + 1
          : focusedRow !== null
            ? focusedRow + 1
            : items.length;
      const newItem = emptyItem("lohn", documentId || 0, at, parentClientId);
      newItem.title = rate.name;
      newItem.quantity = hours.toFixed(2);
      newItem.unit = "Std.";
      newItem.unitPrice = hourlyRate.toFixed(2);
      newItem.totalPrice = total.toFixed(2);
      newItem.laborPrice = hourlyRate.toFixed(2);
      const ekRate = parseFloat(rate.purchasePrice || "0") || (parseFloat(rate.grossWage || "0") > 0 ? parseFloat(rate.grossWage || "0") * (1 + (parseFloat(rate.socialCostsPercent || "29") / 100)) : 0);
      if (ekRate > 0) {
        newItem.laborCost = ekRate.toFixed(2);
        const markup = hourlyRate > 0 && ekRate > 0 ? ((hourlyRate / ekRate - 1) * 100) : 0;
        newItem.laborMarkup = parseFloat(markup.toFixed(2));
      }
      const updated = [...items];
      updated.splice(at, 0, newItem);
      updated.forEach((it, i) => {
        it.sortOrder = i;
      });
      if (parentClientId && jumboIndex != null) {
        const ji = jumboIndex < at ? jumboIndex : jumboIndex + 1;
        setItems(recalcTitelsummen(recalcJumboPrice(updated, ji)));
        setExpandedJumbos((prev) => new Set([...prev, parentClientId]));
      } else {
        setItems(recalcTitelsummen(updated));
      }
      setFocusedRow(at);
      setDirty(true);
      setLohnTargetJumbo(null);
    },
    [focusedRow, items, documentId, docForm.priceLevel, recalcJumboPrice, recalcTitelsummen, setItems, setFocusedRow, setDirty, setExpandedJumbos, setLohnTargetJumbo],
  );

  const insertFromIds = useCallback(
    (articles: IdsArticle[], parentJumboIndex?: number) => {
      const parentClientId = getJumboParentClientId(items, parentJumboIndex);
      const at =
        parentClientId && parentJumboIndex != null
          ? getJumboChildInsertIndex(items, parentJumboIndex)
          : parentJumboIndex != null
            ? parentJumboIndex + 1
          : focusedRow !== null
            ? focusedRow + 1
            : items.length;
      const newItems: EditorItem[] = articles.map((a, idx) => {
        const ni = emptyItem(
          "material",
          documentId || 0,
          at + idx,
          parentClientId,
        );
        ni.title = a.bezeichnung;
        ni.quantity = a.menge.toFixed(3);
        ni.unit = a.einheit;
        ni.unitPrice = a.einzelpreis.toFixed(2);
        ni.totalPrice = a.gesamtpreis.toFixed(2);
        ni.materialPrice = a.einzelpreis.toFixed(2);
        return ni;
      });
      const updated = [...items];
      updated.splice(at, 0, ...newItems);
      updated.forEach((it, i) => {
        it.sortOrder = i;
      });
      if (parentClientId && parentJumboIndex != null) {
        const ji =
          parentJumboIndex < at
            ? parentJumboIndex
            : parentJumboIndex + newItems.length;
        setItems(recalcTitelsummen(recalcJumboPrice(updated, ji)));
      } else {
        setItems(recalcTitelsummen(updated));
      }
      setFocusedRow(at + newItems.length - 1);
      setDirty(true);
      toast({ title: `${newItems.length} IDS-Artikel eingefügt` });
    },
    [focusedRow, items, documentId, recalcJumboPrice, recalcTitelsummen, toast, setItems, setFocusedRow, setDirty],
  );

  const insertFromJumboPackage = useCallback(
    (jumbo: JumboPackage, qty: number) => {
      const at = focusedRow !== null ? focusedRow + 1 : items.length;
      const quantity = qty || 1;
      const unitPrice = parseFloat(jumbo.salePrice || "0") || 0;
      const newItem = emptyItem("jumbo", documentId || 0, at);

      newItem.title = jumbo.shortText || `Jumbo ${jumbo.jumboNumber}`;
      newItem.description = jumbo.description || "";
      newItem.unit = jumbo.unit || "psch";
      newItem.quantity = quantity.toFixed(3);
      newItem.unitPrice = unitPrice.toFixed(2);
      newItem.totalPrice = (unitPrice * quantity).toFixed(2);
      newItem.materialCost = jumbo.materialTotal || "0.00";
      newItem.laborCost = jumbo.laborTotal || "0.00";
      newItem.equipmentCost = jumbo.equipmentTotal || "0.00";
      newItem.externalCost = jumbo.externalTotal || "0.00";

      const packageItems = Array.isArray(jumbo.items) ? jumbo.items : [];
      const childItems = packageItems
        .filter((child: any) => child && (child.text || child.articleNumber))
        .map((child: any, idx: number) => {
          const matVk = parseFloat(String(child.matVk ?? "0")) || 0;
          const lohnVk = parseFloat(String(child.lohnVk ?? "0")) || 0;
          const gerVk = parseFloat(String(child.gerVk ?? "0")) || 0;
          const fremdVk = parseFloat(String(child.fremdVk ?? "0")) || 0;
          const unitPrice = matVk + lohnVk + gerVk + fremdVk;
          const childQty = parseFloat(String(child.quantity ?? "1")) || 1;
          const type = lohnVk > 0 && matVk === 0 && gerVk === 0 && fremdVk === 0 ? "lohn" : "material";
          const childItem = emptyItem(type, documentId || 0, at + idx + 1, newItem._clientId);

          childItem.title = child.text || child.articleNumber || "";
          childItem.articleNumber = child.articleNumber || null;
          childItem.unit = child.unit || (type === "lohn" ? "Std." : "Stk");
          childItem.quantity = childQty.toFixed(3);
          childItem.unitPrice = unitPrice.toFixed(2);
          childItem.totalPrice = (unitPrice * childQty).toFixed(2);
          childItem.materialPrice = matVk.toFixed(2);
          childItem.laborPrice = lohnVk.toFixed(2);
          childItem.materialCost = (parseFloat(String(child.matEk ?? "0")) || 0).toFixed(2);
          childItem.laborCost = (parseFloat(String(child.lohnEk ?? "0")) || 0).toFixed(2);
          childItem.equipmentCost = (parseFloat(String(child.gerEk ?? "0")) || 0).toFixed(2);
          childItem.externalCost = (parseFloat(String(child.fremdEk ?? "0")) || 0).toFixed(2);
          return childItem;
        });

      const updated = [...items];
      updated.splice(at, 0, newItem, ...childItems);
      updated.forEach((it, i) => {
        it.sortOrder = i;
      });
      setItems(recalcTitelsummen(childItems.length > 0 ? recalcJumboPrice(updated, at) : updated));
      setFocusedRow(at + childItems.length);
      setDirty(true);
      setExpandedJumbos((prev) => new Set([...prev, newItem._clientId]));
    },
    [focusedRow, items, documentId, recalcJumboPrice, recalcTitelsummen, setItems, setFocusedRow, setDirty, setExpandedJumbos],
  );

  const insertProzentZuschlag = useCallback(
    (title: string, amount: number) => {
      const at = focusedRow !== null ? focusedRow + 1 : items.length;
      const ni = emptyItem("zuschlag", documentId || 0, at);
      ni.title = title;
      ni.totalPrice = amount.toFixed(2);
      ni.unitPrice = amount.toFixed(2);
      ni.quantity = "1.000";
      const updated = [...items];
      updated.splice(at, 0, ni);
      updated.forEach((it, i) => {
        it.sortOrder = i;
      });
      setItems(recalcTitelsummen(updated));
      setFocusedRow(at);
      setDirty(true);
    },
    [focusedRow, items, documentId, recalcTitelsummen, setItems, setFocusedRow, setDirty],
  );

  const updateMaterialPrices = useCallback(async () => {
    try {
      const res = await fetch("/api/materials?page=1&limit=200", { credentials: "include" });
      if (!res.ok) throw new Error("Materialstamm nicht erreichbar");
      const json = await res.json();
      const mats: Material[] = json.data ?? json;
      const matMap = new Map(mats.map((m) => [m.name.toLowerCase(), m]));
      let updated = 0;
      setItems((prev) => {
        const u = [...prev].map((item) => {
          if (item.type !== "material") return item;
          const found = matMap.get((item.title || "").toLowerCase());
          if (!found) return item;
          const vk = parseFloat(found.salePrice1 || "0");
          const ek = parseFloat(found.purchasePrice || "0");
          const qty = parseFloat(item.quantity || "1");
          updated++;
          return {
            ...item,
            unitPrice: vk.toFixed(2),
            totalPrice: (vk * qty).toFixed(2),
            materialPrice: ek.toFixed(2),
          };
        });
        return recalcTitelsummen(u);
      });
      setDirty(true);
      setTimeout(
        () => toast({ title: `${updated} Materialpreise aktualisiert` }),
        100,
      );
    } catch (e: any) {
      toast({
        title: "Fehler",
        description: e.message,
        variant: "destructive",
      });
    }
  }, [recalcTitelsummen, toast, setItems, setDirty]);

  const setzeAlternativ = useCallback(
    (index: number) => {
      setItems((prev) => {
        const u = [...prev];
        const wasAlt = u[index].positionFlag === "alternativ";
        const st = editorSettings?.standardtexte as Record<string, string> | undefined;
        u[index] = {
          ...u[index],
          positionFlag: wasAlt ? "normal" : "alternativ",
          flagLabel: wasAlt ? undefined : (st?.alternativZeilen || "Alternativ zu vorstehender Position"),
        };
        return recalcTitelsummen(u);
      });
      setDirty(true);
    },
    [recalcTitelsummen, setItems, setDirty, editorSettings],
  );

  const setzeBedarf = useCallback((index: number) => {
    setItems((prev) => {
      const u = [...prev];
      const wasBed = u[index].positionFlag === "bedarf";
      const st = editorSettings?.standardtexte as Record<string, string> | undefined;
      u[index] = {
        ...u[index],
        positionFlag: wasBed ? "normal" : "bedarf",
        flagLabel: wasBed ? undefined : (st?.bedarfsZeilen || "Falls erforderlich"),
      };
      return recalcTitelsummen(u);
    });
    setDirty(true);
  }, [recalcTitelsummen, setItems, setDirty, editorSettings]);

  const getTitleBlockIndices = useCallback((titleIndex: number) => {
    const indices = [titleIndex];
    const titleLevel = (items[titleIndex]?.posNumber || "").split(".").length;
    for (let i = titleIndex + 1; i < items.length; i++) {
      const t = items[i].type;
      if (t === "titel") {
        const level = (items[i].posNumber || "").split(".").length;
        if (level <= titleLevel) break;
      }
      indices.push(i);
    }
    return indices;
  }, [items]);

  const insertFromMaterial = useCallback(
    (mat: Material, qty: number, parentJumboIndex?: number) => {
      const isLohn = mat.group?.toLowerCase() === "lohn";
      const parentClientId = getJumboParentClientId(items, parentJumboIndex);
      const at =
        parentClientId && parentJumboIndex != null
          ? getJumboChildInsertIndex(items, parentJumboIndex)
          : parentJumboIndex != null
            ? parentJumboIndex + 1
          : focusedRow !== null
            ? focusedRow + 1
            : items.length;
      const newItem = emptyItem(
        isLohn ? "lohn" : "material",
        documentId || 0,
        at,
        parentClientId,
      );
      if (docForm.kurztexteAnzeigen && (mat as any).shortText) {
        newItem.title = (mat as any).shortText;
      } else {
        newItem.title = mat.name;
      }
      if (docForm.langtexteFormatiert !== false && (mat as any).longText) {
        newItem.description = (mat as any).longText;
      }
      newItem.quantity = qty.toFixed(3);
      newItem.articleNumber = mat.articleNumber || null;
      newItem.unit = mat.unit || "Stk";
      let vk = parseFloat(mat.salePrice1 || "0");
      const ek = parseFloat(mat.purchasePrice || "0");
      if (docForm.kupferpreisBeruecksichtigen && (mat as any).copperWeight) {
        const copperNotation = parseFloat(docForm.kupferNotation || "200") / 100;
        vk += parseFloat((mat as any).copperWeight || "0") * copperNotation;
      }
      newItem.unitPrice = vk.toFixed(2);
      newItem.totalPrice = (vk * qty).toFixed(2);
      newItem.materialPrice = ek.toFixed(2);
      if (isLohn) newItem.laborPrice = (vk * qty).toFixed(2);
      const updated = [...items];
      updated.splice(at, 0, newItem);
      updated.forEach((it, i) => {
        it.sortOrder = i;
      });
      if (parentClientId && parentJumboIndex != null) {
        const ji =
          parentJumboIndex < at ? parentJumboIndex : parentJumboIndex + 1;
        setItems(recalcTitelsummen(recalcJumboPrice(updated, ji)));
      } else {
        setItems(recalcTitelsummen(updated));
      }
      setFocusedRow(at);
      setDirty(true);
    },
    [focusedRow, items, documentId, recalcJumboPrice, recalcTitelsummen, setItems, setFocusedRow, setDirty, docForm.kurztexteAnzeigen, docForm.langtexteFormatiert, docForm.kupferpreisBeruecksichtigen, docForm.kupferNotation],
  );

  return {
    recalcTitelsummen,
    recalcJumboPrice,
    addPosition,
    updateItem,
    removeItem,
    copyItem,
    moveItem,
    insertFloskel,
    insertLohn,
    insertFromIds,
    insertFromJumboPackage,
    insertProzentZuschlag,
    updateMaterialPrices,
    setzeAlternativ,
    setzeBedarf,
    getTitleBlockIndices,
    insertFromMaterial,
    positionNumbers,
    engineNetTotal,
    netTotal,
    taxAmount,
    grossTotal,
    ekTotal,
    margeTotal,
    markupPercent,
    laborTotal,
  };
}
