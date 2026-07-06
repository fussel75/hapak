import type { EditorItem } from "./types";
import { getEffectiveAfterTotalsText } from "../../../../shared/document-engine/payment-terms";
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
  titelsumme: "TS",
  untertitel: "UT",
  zuschlag: "ZU",
  abschluss: "AB",
  zwischensumme: "ZS",
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

export function getJumboChildCount(items: EditorItem[], parentJumboIndex: number): number {
  const parentClientId = getJumboParentClientId(items, parentJumboIndex);
  if (!parentClientId) return 0;
  return items.filter((item) => item._parentClientId === parentClientId).length;
}

export type EditorZoneInputs = {
  beforeWorkText?: string | null;
  headerText?: string | null;
  beforeTotalsText?: string | null;
  footerText?: string | null;
  afterTotalsText?: string | null;
  skontoImDokument?: boolean | null;
};

export type EditorZones = {
  beforeWorkText: string;
  beforeTotalsText: string;
  afterTotalsText: string;
  showSkonto: boolean;
};

export function buildEditorZones(form: EditorZoneInputs, items: Pick<EditorItem, "type">[]): EditorZones {
  const showSkonto = form.skontoImDokument !== false;
  return {
    beforeWorkText: form.beforeWorkText || form.headerText || "",
    beforeTotalsText: form.beforeTotalsText || form.footerText || "",
    afterTotalsText: getEffectiveAfterTotalsText(
      form.afterTotalsText || "",
      showSkonto,
      items.some((item) => item.type === "skonto"),
    ),
    showSkonto,
  };
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

export type EditorColumnDefinition = {
  name: string;
  breite: number;
  ausrichtung?: string;
};

export type EditorColumnWidths = {
  posW: number;
  qtyW: number;
  unitW: number;
  descFlex: true;
  descW?: number;
  epW: number;
  gpW: number;
  posLabel: string;
  qtyLabel: string;
  unitLabel: string;
  descLabel: string;
  epLabel: string;
  gpLabel: string;
  hasUnit: boolean;
};

export const DEFAULT_EDITOR_COLUMN_WIDTHS: EditorColumnWidths = {
  posW: 36,
  qtyW: 52,
  unitW: 30,
  descFlex: true,
  epW: 65,
  gpW: 70,
  posLabel: "Pos",
  qtyLabel: "Menge",
  unitLabel: "ME",
  descLabel: "Bezeichnung",
  epLabel: "E-Preis",
  gpLabel: "G-Preis",
  hasUnit: true,
};

function normalizeColumnName(name: string): string {
  return (name || "").toLowerCase().replace(/[^a-z\u00e4\u00f6\u00fc0-9]/g, "");
}

export function resolveEditorColumnWidths(
  cols?: EditorColumnDefinition[],
): EditorColumnWidths {
  if (!cols?.length) return DEFAULT_EDITOR_COLUMN_WIDTHS;

  const nameMap: Record<string, { breite: number; label: string }> = {};
  for (const c of cols) {
    const normalizedName = normalizeColumnName(c.name);
    const entry = { breite: c.breite, label: (c.name || "").trim() };
    if (normalizedName.startsWith("pos")) nameMap.pos = entry;
    else if (normalizedName.startsWith("menge") || normalizedName === "mge" || normalizedName === "qty") nameMap.qty = entry;
    else if (normalizedName.startsWith("me") || normalizedName.startsWith("eh") || normalizedName === "einheit") nameMap.unit = entry;
    else if (normalizedName.startsWith("bez") || normalizedName.startsWith("beschr") || normalizedName === "text" || normalizedName === "leistung") nameMap.desc = entry;
    else if (normalizedName.startsWith("epreis") || normalizedName === "ep" || normalizedName === "einzelpreis") nameMap.ep = entry;
    else if (normalizedName.startsWith("gpreis") || normalizedName === "gp" || normalizedName === "gesamtpreis") nameMap.gp = entry;
  }

  const total = cols.reduce((sum, col) => sum + (col.breite || 0), 0);
  if (total <= 0) return DEFAULT_EDITOR_COLUMN_WIDTHS;

  const pct = (value: number) => (value / total) * 100;
  return {
    posW: pct(nameMap.pos?.breite ?? 35),
    qtyW: pct(nameMap.qty?.breite ?? 45),
    unitW: pct(nameMap.unit?.breite ?? 25),
    descFlex: true,
    descW: pct(nameMap.desc?.breite ?? 250),
    epW: pct(nameMap.ep?.breite ?? 70),
    gpW: pct(nameMap.gp?.breite ?? 70),
    posLabel: nameMap.pos?.label || "Pos",
    qtyLabel: nameMap.qty?.label || "Menge",
    unitLabel: nameMap.unit?.label || "ME",
    descLabel: nameMap.desc?.label || "Bezeichnung",
    epLabel: nameMap.ep?.label || "E-Preis",
    gpLabel: nameMap.gp?.label || "G-Preis",
    hasUnit: !!nameMap.unit,
  };
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
