import type { DocumentItemData, LayoutBlock } from "./types";

export type PositionTypeRole =
  | "position"
  | "jumbo"
  | "text"
  | "structure"
  | "sum"
  | "closing";

export interface PositionTypeRule {
  id: string;
  role: PositionTypeRole;
  label: string;
  code: string;
  countsForTotal: boolean;
  numbered: boolean;
  layoutBlock?: LayoutBlock["type"] | null;
  defaultUnit?: string;
  defaultQuantity?: string;
  priceFollowsCost?: boolean;
  aliases?: string[];
}

const POSITION_TYPE_RULES: PositionTypeRule[] = [
  { id: "leistung", role: "position", label: "Leistungsposition", code: "LEI", countsForTotal: true, numbered: true, layoutBlock: "positionRow", defaultUnit: "Stk", defaultQuantity: "0.00", aliases: ["position"] },
  { id: "position", role: "position", label: "Leistungsposition", code: "LEI", countsForTotal: true, numbered: true, layoutBlock: "positionRow", defaultUnit: "Stk", defaultQuantity: "0.00" },
  { id: "material", role: "position", label: "Materialposition", code: "MAT", countsForTotal: true, numbered: true, layoutBlock: "positionRow", defaultUnit: "Stk", defaultQuantity: "0.00" },
  { id: "lohn", role: "position", label: "Lohnposition", code: "LOH", countsForTotal: true, numbered: true, layoutBlock: "positionRow", defaultUnit: "Std", defaultQuantity: "0.00" },
  { id: "manuell", role: "position", label: "Manuelle Position", code: "MAN", countsForTotal: true, numbered: true, layoutBlock: "positionRow", defaultUnit: "Stk", defaultQuantity: "1.00" },
  { id: "fahrtkosten", role: "position", label: "Fahrtkosten", code: "FKT", countsForTotal: true, numbered: true, layoutBlock: "positionRow", defaultUnit: "pau", defaultQuantity: "1.00" },
  { id: "frachtkosten", role: "position", label: "Frachtkosten", code: "FRC", countsForTotal: true, numbered: true, layoutBlock: "positionRow", defaultUnit: "pau", defaultQuantity: "1.00" },
  { id: "jumbo", role: "jumbo", label: "JUMBO-Position", code: "JUM", countsForTotal: true, numbered: true, layoutBlock: "jumboRow", defaultUnit: "Stk", defaultQuantity: "1.00", priceFollowsCost: true },

  { id: "titel", role: "structure", label: "Titel", code: "TIT", countsForTotal: false, numbered: true, layoutBlock: "titleRow", aliases: ["heading"] },
  { id: "heading", role: "structure", label: "Titel", code: "TIT", countsForTotal: false, numbered: true, layoutBlock: "titleRow" },
  { id: "gruppe", role: "structure", label: "Untertitel", code: "UNT", countsForTotal: false, numbered: true, layoutBlock: "titleRow" },

  { id: "titelsumme", role: "sum", label: "Titelsumme", code: "SUM", countsForTotal: false, numbered: true, layoutBlock: "titleSumRow" },
  { id: "zwischensumme", role: "sum", label: "Zwischensumme", code: "ZWS", countsForTotal: false, numbered: false, layoutBlock: "subtotalRow" },
  { id: "zuschlag", role: "sum", label: "Zuschlag/Abschlag", code: "ZU", countsForTotal: true, numbered: true, layoutBlock: "positionRow", defaultUnit: "pau", defaultQuantity: "1.00" },

  { id: "freitext", role: "text", label: "Freitext", code: "TXT", countsForTotal: false, numbered: false, layoutBlock: "textRow" },
  { id: "floskel", role: "text", label: "Floskel", code: "TXT", countsForTotal: false, numbered: false, layoutBlock: "textRow" },
  { id: "text", role: "text", label: "Textposition", code: "TXT", countsForTotal: false, numbered: false, layoutBlock: "textRow" },

  { id: "abschluss", role: "closing", label: "Abschluss", code: "AB", countsForTotal: false, numbered: false, layoutBlock: "abschlussBlock" },
  { id: "skonto", role: "closing", label: "Skonto", code: "SK", countsForTotal: false, numbered: false, layoutBlock: "skontoRow" },
  { id: "nettosumme", role: "closing", label: "Nettosumme", code: "NET", countsForTotal: false, numbered: false, layoutBlock: "summaryBlock" },
  { id: "gesamtsumme", role: "closing", label: "Gesamtsumme", code: "GES", countsForTotal: false, numbered: false, layoutBlock: "summaryBlock" },
];

const RULE_BY_TYPE = new Map<string, PositionTypeRule>();
for (const rule of POSITION_TYPE_RULES) {
  RULE_BY_TYPE.set(rule.id, rule);
  for (const alias of rule.aliases || []) {
    if (!RULE_BY_TYPE.has(alias)) RULE_BY_TYPE.set(alias, rule);
  }
}

const UNKNOWN_POSITION_RULE: PositionTypeRule = {
  id: "unknown",
  role: "text",
  label: "Unbekannte Positionsart",
  code: "UNK",
  countsForTotal: false,
  numbered: false,
  layoutBlock: "textRow",
};

export function getPositionTypeRule(type: string | null | undefined): PositionTypeRule {
  return RULE_BY_TYPE.get(type || "") || UNKNOWN_POSITION_RULE;
}

export function isTextType(type: string | null | undefined): boolean {
  return getPositionTypeRule(type).role === "text";
}

export function isStructuralType(type: string | null | undefined): boolean {
  const role = getPositionTypeRule(type).role;
  return role === "structure" || role === "sum" || role === "closing";
}

export function isPositionType(type: string | null | undefined): boolean {
  const role = getPositionTypeRule(type).role;
  return role === "position" || role === "jumbo";
}

export function isNumberedType(type: string | null | undefined): boolean {
  return getPositionTypeRule(type).numbered;
}

export function isClosingType(type: string | null | undefined): boolean {
  return getPositionTypeRule(type).role === "closing";
}

export function getDefaultUnitForType(type: string | null | undefined): string {
  return getPositionTypeRule(type).defaultUnit || "";
}

export function getDefaultQuantityForType(type: string | null | undefined): string {
  return getPositionTypeRule(type).defaultQuantity || "0.00";
}

export function getDefaultPriceFollowsCost(type: string | null | undefined): boolean {
  return getPositionTypeRule(type).priceFollowsCost === true;
}

export function getLayoutBlockType(
  itemOrType: DocumentItemData | string | null | undefined,
): LayoutBlock["type"] {
  if (typeof itemOrType === "object" && itemOrType?._parentClientId) return "jumboChildRow";
  const type = typeof itemOrType === "object" ? itemOrType?.type : itemOrType;
  return getPositionTypeRule(type).layoutBlock || "positionRow";
}

export function isOptionalFlag(flag: string | null | undefined): boolean {
  return flag === "alternativ" || flag === "bedarf" || flag === "jumbo_lohn";
}

export function countsForTotal(item: DocumentItemData): boolean {
  if (item._parentClientId) return false;
  if (isOptionalFlag(item.positionFlag)) return false;
  return getPositionTypeRule(item.type).countsForTotal;
}

export function countsForCarryForward(item: DocumentItemData): boolean {
  return countsForTotal(item);
}

export function countsForCalculationDetails(item: DocumentItemData): boolean {
  if (!countsForTotal(item)) return false;
  const rule = getPositionTypeRule(item.type);
  return rule.role === "position" || rule.id === "zuschlag";
}

export function isSubItem(item: DocumentItemData): boolean {
  return !!item._parentClientId;
}

export { POSITION_TYPE_RULES };
