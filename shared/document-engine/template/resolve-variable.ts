/**
 * Document Engine — Variable Resolution
 * 
 * Löst Template-Platzhalter wie [Kundenadresse], [Datum] etc. auf.
 * Identische Logik für Editor und PDF.
 */

import type { DocumentData, CustomerData, ProjectData, CompanySettingsData } from "../types";

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  angebot: "Angebot",
  auftragsbestaetigung: "Auftragsbestätigung",
  abschlagsrechnung: "Abschlagsrechnung",
  teilrechnung: "Teilrechnung",
  rechnung: "Rechnung",
  gutschrift: "Gutschrift",
  lieferschein: "Lieferschein",
  freies_dokument: "Freies Dokument",
};

const HAPAK_ZZ_RE = /^[ABGPRX]ZZ(\d{2})(\d+)$/;
const HAPAK_OLD_RE = /^[ABGPRX]([A-Y])(\d+)$/;
const HAPAK_PROJ_ZZ_RE = /^PZZ(\d{2})(\d+)$/;
const HAPAK_PROJ_OLD_RE = /^P([A-Y])(\d+)$/;
const HAPAK_YEAR_BASE: Record<string, number> = {};
"ABCDEFGHIJKLMNOPQRSTUVWXY".split("").forEach((ch, i) => { HAPAK_YEAR_BASE[ch] = i; });

export function fmtDocNumber(num: string | null | undefined): string {
  if (!num) return "";
  const projZzMatch = num.match(HAPAK_PROJ_ZZ_RE);
  if (projZzMatch) return `${projZzMatch[1]}-${parseInt(projZzMatch[2]).toString().padStart(4, "0")}`;
  const projOldMatch = num.match(HAPAK_PROJ_OLD_RE);
  if (projOldMatch && HAPAK_YEAR_BASE[projOldMatch[1]] !== undefined) return `${HAPAK_YEAR_BASE[projOldMatch[1]].toString().padStart(2, "0")}-${parseInt(projOldMatch[2]).toString().padStart(4, "0")}`;
  const legacyProjectMatch = num.match(/^P-(\d{4})-(\d+)$/);
  if (legacyProjectMatch) return `${legacyProjectMatch[1].slice(-2)}-${parseInt(legacyProjectMatch[2]).toString().padStart(4, "0")}`;
  const zzMatch = num.match(HAPAK_ZZ_RE);
  if (zzMatch) return `${zzMatch[1]}-${parseInt(zzMatch[2]).toString().padStart(5, "0")}`;
  const oldMatch = num.match(HAPAK_OLD_RE);
  if (oldMatch && HAPAK_YEAR_BASE[oldMatch[1]] !== undefined) return `${HAPAK_YEAR_BASE[oldMatch[1]].toString().padStart(2, "0")}-${parseInt(oldMatch[2]).toString().padStart(5, "0")}`;
  return num.replace(/^0+/, "") || num;
}

export function fmtDateDE(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

export function fmtCurrencyDE(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "0,00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0,00";
  return num.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtCurrencyEuro(value: string | number | null | undefined): string {
  return fmtCurrencyDE(value) + " €";
}

export function fmtNumberDE(value: string | number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined) return "";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "";
  return num.toLocaleString("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Baut einen Kundenadress-Block (mehrzeilig) */
export function buildCustomerAddressBlock(customer?: CustomerData | null): string {
  if (!customer) return "";
  return [
    customer.salutation,
    customer.name,
    customer.name2,
    customer.street,
    `${customer.zip || ""} ${customer.city || ""}`.trim(),
  ].filter(Boolean).join("\n");
}

/** Löst ALLE Platzhalter in einem String auf */
export function resolveVariables(
  text: string,
  doc: DocumentData,
  customer?: CustomerData | null,
  project?: ProjectData | null,
  company?: CompanySettingsData | null,
  pageNumber: number = 1,
  totalPages: number = 1,
): string {
  if (!text) return "";

  const typeLabel = DOCUMENT_TYPE_LABELS[doc.type] || doc.type;

  return text
    .replace(/\[Firmenlogo\]/g, "")
    .replace(/\[Kundenadresse\]/g, buildCustomerAddressBlock(customer))
    .replace(/\[Dokumenttyp\]/g, typeLabel)
    .replace(/\[Dok\.-Nr\.\]/g, fmtDocNumber(doc.documentNumber))
    .replace(/\[Datum\]/g, fmtDateDE(doc.date))
    .replace(/\[Betreff\]/g, doc.subject || "")
    .replace(/\[Kundennummer\]/g, customer?.customerNumber || "")
    .replace(/\[KundenNr\]/g, customer?.customerNumber || "")
    .replace(/\[Kundenname\]/g, customer?.name || "")
    .replace(/\[Projektnummer\]/g, fmtDocNumber(project?.projectNumber))
    .replace(/\[ProjektNr\]/g, fmtDocNumber(project?.projectNumber))
    .replace(/\[Projektname\]/g, project?.name || "")
    .replace(/\[Bauvorhaben\]/g, project?.name || "")
    .replace(/\[Ort\]/g, company?.city || "")
    .replace(/\[Sachbearbeiter\]/g, "")
    .replace(/\[Zahlungsbedingung\]/g, `${doc.paymentTermDays || 14} Tage netto`)
    .replace(/\[Skonto\]/g, doc.skontoPercent && parseFloat(String(doc.skontoPercent)) > 0 && (doc.skontoDays || 0) > 0
      ? `${fmtNumberDE(doc.skontoPercent)}% in ${doc.skontoDays} Tagen`
      : "")
    .replace(/\[IBAN\]/g, company?.iban || "")
    .replace(/\[BIC\]/g, company?.bic || "")
    .replace(/\[Steuernummer\]/g, company?.taxId || "")
    .replace(/\[USt-IdNr\.\]/g, company?.vatId || "")
    .replace(/\[Seitenzahl\]/g, String(pageNumber))
    .replace(/\[Blatt\]/g, String(pageNumber))
    .replace(/\[Gesamtseiten\]/g, String(totalPages))
    .replace(/\[Arbeitsbereich\]/g, "")
    .replace(/\[Vortext\/Floskel\]/g, doc.beforeWorkText || doc.headerText || "")
    .replace(/\[Nachtext\/Floskel\]/g, doc.afterTotalsText || doc.footerText || "");
}

/** Baut die Variable-Map für Template-Felder (für den React-Editor) */
export function buildVariableMap(
  doc: DocumentData,
  customer?: CustomerData | null,
  project?: ProjectData | null,
  company?: CompanySettingsData | null,
  pageNumber: number = 1,
  totalPages: number = 1,
): Record<string, string> {
  const typeLabel = DOCUMENT_TYPE_LABELS[doc.type] || doc.type;
  return {
    "Kundenadresse": buildCustomerAddressBlock(customer),
    "Dokumenttyp": typeLabel,
    "Dok.-Nr.": fmtDocNumber(doc.documentNumber) || "",
    "Datum": fmtDateDE(doc.date),
    "Kundennummer": customer?.customerNumber || "",
    "KundenNr": customer?.customerNumber || "",
    "Projektnummer": fmtDocNumber(project?.projectNumber),
    "ProjektNr": fmtDocNumber(project?.projectNumber),
    "Projektname": project?.name || "",
    "Bauvorhaben": project?.name || "",
    "Ort": company?.city || "",
    "Betreff": doc.subject || "",
    "Seitenzahl": String(pageNumber),
    "Blatt": String(pageNumber),
    "Gesamtseiten": String(totalPages),
  };
}
