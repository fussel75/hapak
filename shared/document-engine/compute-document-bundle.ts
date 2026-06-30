/**
 * Document Engine — Compute Document Bundle
 * 
 * DIE ZENTRALE FUNKTION.
 * 
 * Nimmt Rohdaten (Dokument, Items, Kunde, Projekt, Firma, Template)
 * und liefert ein vollständig berechnetes Bundle zurück:
 * - Sichtbare Items mit Positionsnummern
 * - Alle Summen (Netto, USt, Brutto, Lohn, Material, Skonto)
 * - Aufgelöstes Template
 * - Layout mit Seitenumbrüchen und Überträgen
 * 
 * Diese Funktion wird sowohl vom React-Editor als auch vom PDF-Generator genutzt.
 * Keine UI-Abhängigkeiten.
 */

import type {
  DocumentBundle,
  ComputedDocumentBundle,
  ComputedItem,
  DocumentTotals,
  DocumentItemData,
  ResolvedTemplate,
  LayoutResult,
} from "./types";

import { recalcAllSums, calcDocumentTotals } from "./calculations";
import { buildPositionNumbers, getItemId } from "./numbering";
import { resolveTemplate } from "./template/resolve-template";
import { paginateDocument } from "./layout/paginate";
import { getEffectiveAfterTotalsText } from "./payment-terms";

function parseNum(val: string | number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

/**
 * Berechnet das vollständige Dokument-Bundle.
 * 
 * @param bundle - Rohdaten aus DB/API
 * @param expandedJumbos - Set der aufgeklappten Jumbos (nur Editor, optional)
 * @returns ComputedDocumentBundle — alles was Editor und PDF brauchen
 */
export function computeDocumentBundle(
  bundle: DocumentBundle,
  expandedJumbos?: Set<string>,
): ComputedDocumentBundle {
  const { document: doc, items: rawItems, customer, project, companySettings, template } = bundle;

  // 1. Template auflösen
  const resolvedTemplate: ResolvedTemplate = resolveTemplate(template, companySettings);

  // 2. Summen neu berechnen (Titelsummen, Zwischensummen, Abschluss, Skonto)
  const taxRate = doc.taxRate != null && doc.taxRate !== '' ? parseNum(doc.taxRate) : 19;
  const skontoPercent = parseNum(doc.skontoPercent) || 0;
  const skontoDays = doc.skontoDays || 0;
  const skontoNurMaterial = doc.skontoNurMaterial === true;
  const recalcedItems = recalcAllSums(rawItems, taxRate, skontoPercent, skontoDays, skontoNurMaterial);

  // 3. Positionsnummern berechnen
  const numbering = buildPositionNumbers(recalcedItems, {
    auto: (doc as any).autoPositionNumbers !== false,
    step: (doc as any).positionNumberStep || 1,
    start: (doc as any).positionNumberStart || 1,
  });

  // 4. ComputedItems bauen
  const visibleItems: ComputedItem[] = recalcedItems.map(item => {
    const id = getItemId(item);
    return {
      ...item,
      computedTotalPrice: parseNum(item.totalPrice),
      computedUnitPrice: parseNum(item.unitPrice),
      computedQuantity: parseNum(item.quantity),
      isVisible: true,
      isAlternativ: item.positionFlag === "alternativ",
      isBedarf: item.positionFlag === "bedarf",
      posNumber: numbering.get(id) || "",
    };
  });

  // 5. Gesamttotals
  const previouslyInvoiced = parseNum(doc.previouslyInvoiced);
  const totals: DocumentTotals = calcDocumentTotals(
    recalcedItems,
    taxRate,
    skontoPercent,
    previouslyInvoiced,
  );

  // 6. Layout / Pagination
  const zones = {
    beforeWorkText: doc.beforeWorkText || doc.headerText || null,
    beforeTotalsText: doc.beforeTotalsText || doc.footerText || null,
    afterTotalsText: getEffectiveAfterTotalsText(
      doc.afterTotalsText,
      (doc as any).skontoImDokument !== false,
      recalcedItems.some((item) => item.type === "skonto"),
    ) || null,
    showSkonto: (doc as any).skontoImDokument !== false,
  };
  const hideIntern = (doc as any).internpositionenVerbergen !== false;
  const pages = paginateDocument(recalcedItems, resolvedTemplate, expandedJumbos, zones, undefined, hideIntern);
  const layout: LayoutResult = {
    pages,
    totalPages: pages.length,
  };

  return {
    source: bundle,
    computed: {
      visibleItems,
      numbering,
      totals,
    },
    template: resolvedTemplate,
    layout,
  };
}

// Re-exports für bequemen Zugriff
export { recalcAllSums, recalcJumboTotal, calcDocumentTotals } from "./calculations";
export { buildPositionNumbers } from "./numbering";
export { resolveTemplate } from "./template/resolve-template";
export { resolveVariables, buildVariableMap, fmtCurrencyDE, fmtCurrencyEuro, fmtDateDE, fmtNumberDE, fmtDocNumber } from "./template/resolve-variable";
export { paginateDocument } from "./layout/paginate";
export { estimateItemHeight, estimateWrappedLines, splitTextAtWrappedLine, HEIGHTS } from "./layout/estimate-item-height";
export { isTextType, isStructuralType, isPositionType, countsForTotal, isSubItem, findEndTexteStart } from "./visibility";
export type * from "./types";
