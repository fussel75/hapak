export function parseGermanDecimal(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const compact = raw.replace(/\s/g, "");
  const hasComma = compact.includes(",");
  const hasDot = compact.includes(".");
  const normalized = hasComma
    ? compact.replace(/\./g, "").replace(",", ".")
    : hasDot
      ? compact
      : compact;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatEditableGermanDecimal(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(".", ",");
}
