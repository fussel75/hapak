type HapakImportItem = {
  sourceLine?: number | string | null;
  sourceId?: string | null;
  type?: string | null;
  title?: string | null;
  description?: string | null;
  unit?: string | null;
  quantity?: string | number | null;
  unitPrice?: string | number | null;
  totalPrice?: string | number | null;
  laborPrice?: string | number | null;
  materialPrice?: string | number | null;
  materialCost?: string | number | null;
  laborCost?: string | number | null;
  equipmentCost?: string | number | null;
  externalCost?: string | number | null;
  laborMarkup?: string | number | null;
  materialMarkup?: string | number | null;
  equipmentMarkup?: string | number | null;
  externalMarkup?: string | number | null;
  laborTime?: string | number | null;
  sortOrder?: number | string | null;
  positionFlag?: string | null;
  flagLabel?: string | null;
  afterTotals?: boolean | null;
  priceFollowsCost?: boolean | null;
  parentSourceLine?: number | string | null;
  [key: string]: any;
};

function parseAmount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function quantity(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Number.isInteger(rounded * 100) ? rounded.toFixed(2) : rounded.toFixed(3).replace(/0$/, "");
}

function lineNumber(item: HapakImportItem): number {
  return parseAmount(item.sourceLine);
}

function comparableText(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function isRedundantSelfChild(child: HapakImportItem, parent: HapakImportItem | undefined): boolean {
  if (!parent || parseAmount(child.parentSourceLine) <= 0) return false;
  if (comparableText(child.title) !== comparableText(parent.title)) return false;
  if (parseAmount(child.quantity) !== parseAmount(parent.quantity)) return false;
  if (parseAmount(child.unitPrice) !== parseAmount(parent.unitPrice)) return false;
  if (parseAmount(child.totalPrice) !== parseAmount(parent.totalPrice)) return false;
  return (
    parseAmount(child.materialCost) === parseAmount(parent.materialCost) &&
    parseAmount(child.laborCost) === parseAmount(parent.laborCost) &&
    parseAmount(child.equipmentCost) === parseAmount(parent.equipmentCost) &&
    parseAmount(child.externalCost) === parseAmount(parent.externalCost)
  );
}

function buildLaborChild(
  parent: HapakImportItem,
  sequence: number,
  values: {
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    cost: number;
    markup?: string | number | null;
  },
): HapakImportItem {
  const sourceLine = lineNumber(parent);
  return {
    documentImportSourceKey: parent.documentImportSourceKey,
    sourceLine: sourceLine + sequence / 100,
    sourceId: "l*",
    positionNumber: "",
    type: "lohn",
    title: "Lohnanteil aus HAPAK-JUMBO",
    description: null,
    unit: "Std.",
    quantity: quantity(values.quantity || 1),
    unitPrice: money(values.unitPrice),
    totalPrice: money(values.totalPrice),
    laborPrice: money(values.unitPrice),
    materialPrice: "0.00",
    materialCost: "0.00",
    laborCost: money(values.cost),
    equipmentCost: "0.00",
    externalCost: "0.00",
    laborMarkup: values.markup ?? null,
    materialMarkup: null,
    equipmentMarkup: null,
    externalMarkup: null,
    laborTime: money(parseAmount(parent.laborTime)),
    sortOrder: (Number(parent.sortOrder) || 0) + sequence / 100,
    positionFlag: "jumbo_lohn",
    flagLabel: null,
    afterTotals: Boolean(parent.afterTotals),
    priceFollowsCost: true,
    parentSourceLine: sourceLine,
  };
}

function synthesizeJumboChildren(parent: HapakImportItem): HapakImportItem[] {
  const children: HapakImportItem[] = [];
  const laborMinutes = parseAmount(parent.laborTime);
  const laborQty = laborMinutes > 0 ? laborMinutes / 60 : 1;
  const laborUnitPrice = parseAmount(parent.laborPrice);
  const laborCost = parseAmount(parent.laborCost);

  // HAPAK stores default labor cost/price fields on many detailed JUMBOs even
  // when the parent contains only material or external-service cost buckets.
  // A visible synthetic labor child is only justified when HAPAK has a real time
  // demand; other cost buckets remain part of the parent calculation.
  if (laborMinutes > 0) {
    children.push(buildLaborChild(parent, 1, {
      quantity: laborQty,
      unitPrice: laborUnitPrice || parseAmount(parent.unitPrice),
      totalPrice: laborQty * (laborUnitPrice || parseAmount(parent.unitPrice)),
      cost: laborCost,
      markup: parent.laborMarkup,
    }));
  }

  return children;
}

function hasParentCostBuckets(item: HapakImportItem): boolean {
  return (
    parseAmount(item.materialCost) > 0 ||
    parseAmount(item.laborCost) > 0 ||
    parseAmount(item.equipmentCost) > 0 ||
    parseAmount(item.externalCost) > 0
  );
}

export function expandHapakDetailedJumbos<T extends HapakImportItem>(items: T[]): HapakImportItem[] {
  const parentsByLine = new Map(
    items
      .filter((item) => item.type === "jumbo")
      .map((item) => [lineNumber(item), item]),
  );
  const cleanedItems = items.filter((item) => !isRedundantSelfChild(item, parentsByLine.get(parseAmount(item.parentSourceLine))));
  const parentLinesWithChildren = new Set(
    cleanedItems
      .map((item) => parseAmount(item.parentSourceLine))
      .filter((line) => Number.isFinite(line) && line > 0),
  );

  const expanded: HapakImportItem[] = [];
  for (const item of cleanedItems) {
    if (item.type !== "jumbo") {
      expanded.push(item);
      continue;
    }

    const sourceLine = lineNumber(item);
    const hasExplicitChildren = parentLinesWithChildren.has(sourceLine);
    const hasOwnDetailedCalculation = hasParentCostBuckets(item);
    const costFollowingJumbo = item.priceFollowsCost === true || hasOwnDetailedCalculation;
    if (!costFollowingJumbo) {
      expanded.push(item);
      continue;
    }

    const syntheticChildren = hasExplicitChildren ? [] : synthesizeJumboChildren(item);
    const canFollowCalculation = hasExplicitChildren || syntheticChildren.length > 0 || hasOwnDetailedCalculation;
    expanded.push({ ...item, priceFollowsCost: canFollowCalculation });
    expanded.push(...syntheticChildren);
  }

  return expanded.map((item, index) => ({
    ...item,
    sortOrder: index,
  }));
}
