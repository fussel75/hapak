/**
 * Document Engine — Kaufmännische Berechnungen
 * 
 * Zentrale Stelle für ALLE Summen- und Preisberechnungen.
 * Wird sowohl vom Editor (live) als auch vom PDF-Generator genutzt.
 */

import type { DocumentItemData, DocumentTotals } from "./types";
import { recalcJumboFromChildren } from "./jumbo";
import { countsForTotal, isTextType } from "./position-types";

// ─── Hilfs-Typen ──────────────────────────────────────────────────────────────

function parseNum(val: string | number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function normalizePosNumber(value: string | null | undefined): string {
  return (value || "").trim().replace(/\.+$/, "");
}

function meaningfulTitleSumLabel(value: string | null | undefined): string {
  const label = (value || "").trim();
  if (!label || label.toLowerCase() === "titelsumme") return "";
  return label;
}

// ─── Positionsberechnung ──────────────────────────────────────────────────────

/** Berechnet totalPrice = quantity × unitPrice für eine einzelne Position */
export function calcPositionTotal(item: DocumentItemData): number {
  const qty = parseNum(item.quantity);
  const ep = parseNum(item.unitPrice);
  return qty * ep;
}

/** Berechnet VK aus EK + Aufschlag */
export function calcMarkup(ek: number, markupPercent: number): number {
  return ek * (1 + markupPercent / 100);
}

// ─── Titelsummen-Berechnung ───────────────────────────────────────────────────

/**
 * Berechnet ALLE Titelsummen, Zwischensummen, Abschluss und Skonto.
 * Dies ist die EINZIGE Stelle wo diese Berechnung stattfindet.
 * 
 * Mutiert das Array nicht — gibt ein neues zurück.
 */
export function recalcAllSums(
  items: DocumentItemData[],
  taxRate: number = 19,
  skontoPercent: number = 0,
  skontoDays: number = 0,
  skontoNurMaterial: boolean = false,
): DocumentItemData[] {
  const hasValidSkontoTerms = skontoPercent > 0 && skontoDays > 0;
  let result = items.map(item => ({ ...item }));

  // Phase 1: Titel-Positionsnummern für Labels sammeln
  for (let i = 0; i < result.length; i++) {
    if (result[i].type === "jumbo") {
      result = recalcJumboFromChildren(result, i) as DocumentItemData[];
    }
  }

  const titelInfo = new Map<number, { posNum: string; title: string }>();
  let titleNum = 0;
  let gruppeNum = 0;
  let inGruppe = false;

  for (let i = 0; i < result.length; i++) {
    const it = result[i];
    if (it._parentClientId) continue;
    if (it.type === "titel") {
      titleNum++;
      gruppeNum = 0;
      inGruppe = false;
      titelInfo.set(i, { posNum: `${titleNum}.`, title: it.title || "" });
    } else if (it.type === "gruppe") {
      if (titleNum > 0) {
        gruppeNum++;
        inGruppe = true;
        titelInfo.set(i, { posNum: `${titleNum}.${gruppeNum}.`, title: it.title || "" });
      } else {
        titleNum++;
        gruppeNum = 0;
        inGruppe = false;
        titelInfo.set(i, { posNum: `${titleNum}.`, title: it.title || "" });
      }
    }
  }

  // Phase 2: Titelsummen berechnen
  for (let i = 0; i < result.length; i++) {
    const item = result[i];
    if (item._parentClientId) continue;

    if (item.type === "titelsumme") {
      let sum = 0;
      let titelName = "";
      let titelPosNum = "";
      let sectionStart = -1;
      const targetPos = normalizePosNumber(item.positionNumber);

      if (targetPos) {
        for (let j = i - 1; j >= 0; j--) {
          if (result[j]._parentClientId) continue;
          if (result[j].type !== "titel" && result[j].type !== "gruppe") continue;

          const info = titelInfo.get(j);
          const candidatePos = normalizePosNumber(result[j].positionNumber || info?.posNum);
          if (candidatePos !== targetPos) continue;

          sectionStart = j;
          titelName = info?.title || result[j].title || "";
          titelPosNum = info?.posNum || result[j].positionNumber || "";
          break;
        }
      }

      if (sectionStart >= 0) {
        for (let j = sectionStart + 1; j < i; j++) {
          if (result[j]._parentClientId) continue;
          if (["titel", "gruppe", "titelsumme"].includes(result[j].type)) continue;
          if (isTextType(result[j].type) || result[j].type === "abschluss" || result[j].type === "zwischensumme") continue;
          if (!countsForTotal(result[j])) continue;
          sum += parseNum(result[j].totalPrice);
        }
      } else {
        for (let j = i - 1; j >= 0; j--) {
          if (result[j]._parentClientId) continue;
          if (result[j].type === "titel" || result[j].type === "gruppe") {
            const info = titelInfo.get(j);
            titelName = info?.title || result[j].title || "";
            titelPosNum = info?.posNum || "";
            break;
          }
          if (result[j].type === "titelsumme") break;
          if (isTextType(result[j].type) || result[j].type === "abschluss" || result[j].type === "zwischensumme") continue;
          if (!countsForTotal(result[j])) continue;
          sum += parseNum(result[j].totalPrice);
        }
      }

      const label = titelName
        ? `Summe ${titelPosNum} ${titelName}`.trim()
        : meaningfulTitleSumLabel(item.title) || "Titelsumme";
      result[i] = { ...item, totalPrice: sum.toFixed(2), title: label };
    }

    if (item.type === "zwischensumme") {
      let sum = 0;
      for (let j = i - 1; j >= 0; j--) {
        if (result[j]._parentClientId) continue;
        if (["zwischensumme", "abschluss"].includes(result[j].type)) break;
        if (["titel", "gruppe", "titelsumme"].includes(result[j].type)) continue;
        if (isTextType(result[j].type) || result[j].type === "abschluss") continue;
        if (!countsForTotal(result[j])) continue;
        sum += parseNum(result[j].totalPrice);
      }
      result[i] = { ...item, totalPrice: sum.toFixed(2) };
    }
  }

  // Phase 3: Nettosumme berechnen (für Abschluss)
  let netSum = 0;
  let materialSkontoBasis = 0;
  for (const it of result) {
    if (it._parentClientId) continue;
    if (!countsForTotal(it)) continue;
    netSum += parseNum(it.totalPrice);
    materialSkontoBasis += parseNum(it.materialPrice) * parseNum(it.quantity);
  }

  // Phase 4: Abschluss und Skonto aktualisieren
  for (let i = 0; i < result.length; i++) {
    const it = result[i];
    if (it.type === "nettosumme") {
      result[i] = { ...it, totalPrice: netSum.toFixed(2), title: it.title || "Nettosumme" };
    }
    if (it.type === "gesamtsumme") {
      const grossSum = netSum * (1 + taxRate / 100);
      result[i] = { ...it, totalPrice: grossSum.toFixed(2), title: it.title || "Gesamtsumme" };
    }
    if (it.type === "abschluss") {
      result[i] = { ...it, totalPrice: netSum.toFixed(2) };
    }
    if (it.type === "skonto") {
      const skontoBasisNet = skontoNurMaterial ? materialSkontoBasis : netSum;
      const gross = skontoBasisNet * (1 + taxRate / 100);
      const skontoVal = hasValidSkontoTerms ? -(gross * skontoPercent / 100) : 0;
      const zahlbetragNachSkonto = netSum * (1 + taxRate / 100) + skontoVal;
      result[i] = {
        ...it,
        totalPrice: skontoVal.toFixed(2),
        title: hasValidSkontoTerms
          ? `${fmtPct(skontoPercent)} Skonto bei Zahlung innerhalb ${skontoDays} Tagen${skontoNurMaterial ? " auf Materialanteil" : ""}`
          : "Skonto",
        description: hasValidSkontoTerms
          ? `Zahlbetrag bei Skontoabzug ${fmtPct(skontoPercent)} ${fmtEur(zahlbetragNachSkonto)}`
          : "",
      };
    }
  }

  return result;
}

// ─── Jumbo-Summe ──────────────────────────────────────────────────────────────

/** Berechnet den Gesamtpreis eines Jumbos aus seinen Unterpositionen */
export function recalcJumboTotal(
  items: DocumentItemData[],
  jumboIndex: number,
): DocumentItemData[] {
  return recalcJumboFromChildren(items.map(item => ({ ...item })), jumboIndex) as DocumentItemData[];
}

// ─── Gesamttotals ─────────────────────────────────────────────────────────────

/** Berechnet alle Gesamtsummen aus den Items */
export function calcDocumentTotals(
  items: DocumentItemData[],
  taxRate: number = 19,
  skontoPercent: number = 0,
  previouslyInvoiced: number = 0,
): DocumentTotals {
  let netTotal = 0;
  let laborTotal = 0;
  let materialTotal = 0;
  let equipmentTotal = 0;
  let externalTotal = 0;

  for (const item of items) {
    if (item._parentClientId) continue;
    if (!countsForTotal(item)) continue;

    const gp = parseNum(item.totalPrice);
    const qty = parseNum(item.quantity);
    netTotal += gp;
    const laborTimeHrs = parseNum(item.laborTime) / 60;
    laborTotal += parseNum(item.laborPrice) * laborTimeHrs;
    materialTotal += parseNum(item.materialPrice) * qty;
    equipmentTotal += parseNum(item.equipmentCost) * qty;
    externalTotal += parseNum(item.externalCost) * qty;
  }

  const taxAmount = netTotal * (taxRate / 100);
  const grossTotal = netTotal + taxAmount;
  const skontoAmount = grossTotal * (skontoPercent / 100);
  const payableAmount = grossTotal - skontoAmount - previouslyInvoiced;

  return {
    netTotal,
    taxRate,
    taxAmount,
    grossTotal,
    laborTotal,
    materialTotal,
    equipmentTotal,
    externalTotal,
    skontoPercent,
    skontoAmount,
    previouslyInvoiced,
    payableAmount,
  };
}

// ─── Formatierung ─────────────────────────────────────────────────────────────

function fmtPct(val: number | string): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "0,00 %";
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %";
}

function fmtEur(val: number): string {
  return val.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
