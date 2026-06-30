export function normalizeDocumentTypeLabel(customTypeLabel: string | null | undefined, fallback: string): string {
  const raw = (customTypeLabel || "").trim();
  if (!raw) return fallback;
  const withoutDocumentNumber = raw.replace(/\s+\d{2}-\d{5}.*$/, "").trim();
  const withoutNumberedSuffix = withoutDocumentNumber.replace(/\s+\(\d+\..*$/, "").trim();
  return withoutNumberedSuffix || fallback;
}

function fmtDocNumberLocal(documentNumber: string | null | undefined): string {
  const raw = String(documentNumber || "").trim();
  if (!raw) return "";
  const modern = raw.match(/^(\d{2})-(\d{4,5})(.*)$/);
  if (modern) return `${modern[1]}-${modern[2]}${modern[3] || ""}`;
  const hapak = raw.match(/^[A-Z]+(\d{2})(\d{4,5})(.*)$/i);
  if (hapak) return `${hapak[1]}-${hapak[2]}${hapak[3] || ""}`;
  return raw;
}

export function formatDocumentNumberWithCustomSuffix(
  documentNumber: string | null | undefined,
  customTypeLabel: string | null | undefined,
): string {
  const formatted = fmtDocNumberLocal(documentNumber);
  const raw = (customTypeLabel || "").trim();
  const suffix = raw.match(/\d{2}-\d{5}\s*(\(.+\))$/)?.[1]
    || raw.match(/\s(\(\d+\..+\))$/)?.[1]
    || "";
  return suffix && formatted ? `${formatted} ${suffix}` : formatted;
}
