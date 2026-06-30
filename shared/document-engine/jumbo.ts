import { parseGermanDecimal } from "./number-input";

export type JumboCalculationItem = {
  _clientId?: string | null;
  _parentClientId?: string | null;
  type?: string | null;
  quantity?: string | number | null;
  unitPrice?: string | number | null;
  totalPrice?: string | number | null;
  materialCost?: string | number | null;
  laborCost?: string | number | null;
  equipmentCost?: string | number | null;
  externalCost?: string | number | null;
  priceFollowsCost?: boolean | null;
};

export function recalcJumboFromChildren<T extends JumboCalculationItem>(
  allItems: T[],
  jumboIndex: number,
): T[] {
  const jumbo = allItems[jumboIndex];
  if (!jumbo || jumbo.type !== "jumbo") return allItems;
  const hasManualOverride =
    jumbo.priceFollowsCost === false &&
    (parseGermanDecimal(jumbo.unitPrice) !== 0 || parseGermanDecimal(jumbo.totalPrice) !== 0);
  if (hasManualOverride) return allItems;

  const children = allItems.filter((item) => item._parentClientId === jumbo._clientId);
  const hasOwnCostBuckets =
    parseGermanDecimal(jumbo.materialCost) !== 0 ||
    parseGermanDecimal(jumbo.laborCost) !== 0 ||
    parseGermanDecimal(jumbo.equipmentCost) !== 0 ||
    parseGermanDecimal(jumbo.externalCost) !== 0;
  const unitPrice = children.reduce((sum, child) => sum + parseGermanDecimal(child.totalPrice), 0);
  const quantity = parseGermanDecimal(jumbo.quantity) || 1;
  if (children.length === 0 && hasOwnCostBuckets && parseGermanDecimal(jumbo.unitPrice) !== 0) {
    const updated = [...allItems];
    updated[jumboIndex] = {
      ...jumbo,
      totalPrice: (parseGermanDecimal(jumbo.unitPrice) * quantity).toFixed(2),
    };
    return updated;
  }
  const updated = [...allItems];
  updated[jumboIndex] = {
    ...jumbo,
    unitPrice: unitPrice.toFixed(2),
    totalPrice: (unitPrice * quantity).toFixed(2),
  };
  return updated;
}
