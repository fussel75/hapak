import type { EditorItem } from "./types";
import {
  getDefaultPriceFollowsCost,
  getDefaultQuantityForType,
  getDefaultUnitForType,
} from "../../../../shared/document-engine/position-types";

let _nextClientId = 1;
export const genClientId = () => `_c${_nextClientId++}`;

export const PT_TO_PX = 4 / 3;

export const posTypeShort: Record<string, string> = {
  titel: "TIT",
  leistung: "LEI",
  material: "MAT",
  jumbo: "JUM",
  lohn: "LOH",
  manuell: "MAN",
  titelsumme: "T∑",
  untertitel: "UT",
  zuschlag: "ZU",
  abschluss: "AB",
  zwischensumme: "Z∑",
  freitext: "FT",
  floskel: "FL",
  skonto: "SK",
  position: "POS",
  text: "TXT",
  gruppe: "GRP",
  fahrtkosten: "FKT",
  frachtkosten: "FRC",
  rabatt: "RAB",
  prozent_zuschlag: "P%",
};

export const rowStyle = (type: string, _isSubItem: boolean): React.CSSProperties => {
  switch (type) {
    case "titel":
    case "gruppe":
      return { background: "#f7fafc" };
    case "titelsumme":
    case "abschluss":
    case "zwischensumme":
      return { background: "#f7fafc" };
    default:
      return { background: "#ffffff" };
  }
};

export function getVortextEndIdx(items: EditorItem[]): number {
  const textTypes = ["freitext", "floskel", "text"];
  let vEnd = 0;
  for (let vi = 0; vi < items.length; vi++) {
    if (textTypes.includes(items[vi].type || "") && !items[vi].afterTotals) {
      vEnd = vi + 1;
    } else break;
  }
  return vEnd;
}

export function isJumboParentItem(item: EditorItem | undefined | null): boolean {
  return !!item && item.type === "jumbo" && !item._parentClientId;
}

export function getJumboParentClientId(
  items: EditorItem[],
  parentJumboIndex?: number | null,
): string | null {
  if (parentJumboIndex == null) return null;
  const parent = items[parentJumboIndex];
  return isJumboParentItem(parent) ? parent._clientId || null : null;
}

export function getJumboChildInsertIndex(
  items: EditorItem[],
  parentJumboIndex: number,
): number {
  const parentClientId = getJumboParentClientId(items, parentJumboIndex);
  if (!parentClientId) return parentJumboIndex + 1;
  let last = parentJumboIndex;
  for (let i = parentJumboIndex + 1; i < items.length; i++) {
    if (items[i]._parentClientId === parentClientId) last = i;
    else break;
  }
  return last + 1;
}

export const emptyItem = (
  type: string,
  documentId: number,
  sortOrder: number,
  parentClientId?: string | null,
): EditorItem => ({
  _clientId: genClientId(),
  _parentClientId: parentClientId || null,
  documentId,
  type,
  positionNumber: "",
  title: type === "manuell" ? "Leistung" : "",
  description: "",
  unit: getDefaultUnitForType(type),
  quantity: getDefaultQuantityForType(type),
  unitPrice: "0.00",
  totalPrice: "0.00",
  laborPrice: "0.00",
  materialPrice: "0.00",
  sortOrder,
  parentItemId: null,
  positionFlag: "normal",
  laborCost: "0.00",
  equipmentCost: "0.00",
  externalCost: "0.00",
  laborMarkup: null,
  materialMarkup: null,
  equipmentMarkup: null,
  externalMarkup: null,
  laborTime: "0.00",
  priceFollowsCost: getDefaultPriceFollowsCost(type),
});

export function remapClipboardItems(clipItems: EditorItem[]): EditorItem[] {
  const idMap = new Map<string, string>();
  clipItems.forEach((it) => {
    if (it._clientId) idMap.set(it._clientId, genClientId());
  });
  return clipItems.map((it) => ({
    ...it,
    id: undefined,
    _clientId: idMap.get(it._clientId!) || genClientId(),
    _parentClientId: it._parentClientId && idMap.has(it._parentClientId)
      ? idMap.get(it._parentClientId)!
      : it._parentClientId && !idMap.has(it._parentClientId)
        ? null
        : it._parentClientId,
  }));
}

export function expandSelectionWithChildren(
  selectedRows: Set<number>,
  items: EditorItem[],
): Set<number> {
  const expanded = new Set(selectedRows);
  for (const idx of selectedRows) {
    const item = items[idx];
    if ((item?.positionFlag === "jumbo" || (item?.type === "jumbo" && !item._parentClientId)) && item._clientId) {
      const jcid = item._clientId;
      for (let i = idx + 1; i < items.length; i++) {
        if (items[i]._parentClientId === jcid) expanded.add(i);
        else break;
      }
    }
  }
  return expanded;
}

export function splitTitleDesc(html: string): { title: string; description: string } {
  const normalized = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>\s*<div[^>]*>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
    .replace(/<\/?(?:div|p)>/gi, "")
    .replace(/^\n+/, "");
  const idx = normalized.indexOf("\n");
  if (idx === -1) return { title: normalized, description: "" };
  return { title: normalized.substring(0, idx), description: normalized.substring(idx + 1) };
}

export function parseFontSpec(fontStr?: string): { fontFamily: string; fontSize: number; fontWeight: string } {
  if (!fontStr) return { fontFamily: "'Nimbus Sans', 'Nimbus Sans L', Arial, sans-serif", fontSize: 10, fontWeight: "normal" };
  const bold = /bold/i.test(fontStr);
  const sizeMatch = fontStr.match(/(\d+(?:\.\d+)?)pt/);
  const size = sizeMatch ? parseFloat(sizeMatch[1]) : 10;
  let family = fontStr.replace(/bold/i, "").replace(/[\d.]+pt/i, "").trim() || "Arial";
  if (/swis/i.test(family)) {
    family = "Nimbus Sans";
  }
  const fallbacks = `"${family}", "Nimbus Sans L", Arial, sans-serif`;
  return { fontFamily: fallbacks, fontSize: size, fontWeight: bold ? "bold" : "normal" };
}

export function resolveVariable(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\[([^\]]+)\]/g, (_, key) => vars[key] || "");
}

export function kalkCalc(ek: string, markup: string) {
  const e = parseFloat(ek) || 0;
  const m = parseFloat(markup) || 0;
  return e * (1 + m / 100);
}
