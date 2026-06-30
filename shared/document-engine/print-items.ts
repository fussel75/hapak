import { recalcAllSums } from "./calculations";

export type PrintableDocumentItem = {
  id?: number | null;
  parentItemId?: number | null;
  sortOrder?: number | null;
  _clientId?: string | null;
  _parentClientId?: string | null;
  [key: string]: any;
};

export type PrintableDocumentCalculation = {
  taxRate?: string | number | null;
  skontoPercent?: string | number | null;
  skontoDays?: number | null;
  skontoNurMaterial?: boolean | null;
};

function parsePercent(value: string | number | null | undefined, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function mapDocumentItemsForPrint<T extends PrintableDocumentItem>(
  rawItems: T[],
  doc: PrintableDocumentCalculation = {},
): T[] {
  const mapped = rawItems.map((item, index) => {
    const clientId = item._clientId || (item.id ? `db-${item.id}` : `print-${index}`);
    const parentClientId =
      item._parentClientId ||
      (item.parentItemId ? `db-${item.parentItemId}` : null);

    return {
      ...item,
      _clientId: clientId,
      _parentClientId: parentClientId,
      sortOrder: item.sortOrder ?? index,
    };
  });

  return recalcAllSums(
    mapped as any,
    parsePercent(doc.taxRate, 19),
    parsePercent(doc.skontoPercent, 0),
    doc.skontoDays || 0,
    doc.skontoNurMaterial === true,
  ) as unknown as T[];
}
