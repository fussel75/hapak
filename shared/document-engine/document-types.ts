import { documentTypeLabels } from "../schema";
import type { DocumentType } from "../schema";

export const documentCreateTypes = [
  "angebot",
  "auftragsbestaetigung",
  "rechnung",
  "abschlagsrechnung",
  "teilrechnung",
  "gutschrift",
  "lieferschein",
  "freies_dokument",
  "mitschnitt",
] as const satisfies readonly DocumentType[];

export type DocumentCreateType = (typeof documentCreateTypes)[number];

export const documentTypeSettingTypes = documentCreateTypes;

const legacyFormTemplateTypes = ["Dokument", "Bestellung", "Mahnung"] as const;

export const formTemplateTypeOptions = [
  ...legacyFormTemplateTypes.map((type) => ({ value: type, label: type })),
  ...documentCreateTypes.map((type) => ({
    value: type,
    label: documentTypeLabels[type] || type,
  })),
] as const;

export function normalizeFormTemplateType(type: string | null | undefined): string {
  if (!type) return "Dokument";
  if (documentCreateTypes.includes(type as DocumentCreateType)) return type;
  if ((legacyFormTemplateTypes as readonly string[]).includes(type)) return type;

  const matchingDocumentType = documentCreateTypes.find((documentType) => documentTypeLabels[documentType] === type);
  return matchingDocumentType || "Dokument";
}

export function getFormTemplateTypeLabel(type: string | null | undefined): string {
  const normalized = normalizeFormTemplateType(type);
  return documentTypeLabels[normalized] || normalized;
}

export function normalizeDocumentCreateType(type: string | null | undefined): DocumentCreateType {
  return documentCreateTypes.includes(type as DocumentCreateType)
    ? (type as DocumentCreateType)
    : "angebot";
}

export function buildNewDocumentUrl(type: string, params: Record<string, string | number | null | undefined> = {}): string {
  const search = new URLSearchParams();
  search.set("type", normalizeDocumentCreateType(type));
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    search.set(key, String(value));
  });
  return `/dokumente/neu?${search.toString()}`;
}
