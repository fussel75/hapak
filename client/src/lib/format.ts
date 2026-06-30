export function fmtCurrency(value: string | number | null | undefined, decimals = 2): string {
  const pad = "0".repeat(decimals);
  const fallback = decimals > 0 ? `0,${pad}` : "0";
  if (value === null || value === undefined || value === "") return fallback;
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return fallback;
  return num.toLocaleString("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fmtPercent(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0,00 %";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0,00 %";
  return num.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " %";
}

export function fmtNumber(value: string | number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || value === "") return "0,00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0,00";
  return num.toLocaleString("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtQty(value: string | number | null | undefined, decimals = 2): string {
  const visibleDecimals = Math.min(Math.max(decimals, 0), 2);
  if (value === null || value === undefined || value === "") return visibleDecimals > 0 ? "0," + "0".repeat(visibleDecimals) : "0";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return visibleDecimals > 0 ? "0," + "0".repeat(visibleDecimals) : "0";
  return num.toLocaleString("de-DE", { minimumFractionDigits: visibleDecimals, maximumFractionDigits: visibleDecimals });
}

const HAPAK_ZZ_RE = /^[ABGPRX]ZZ(\d{2})(\d+)$/;
const HAPAK_OLD_RE = /^[ABGPRX]([A-Y])(\d+)$/;
const HAPAK_PROJ_ZZ_RE = /^PZZ(\d{2})(\d+)$/;
const HAPAK_PROJ_OLD_RE = /^P([A-Y])(\d+)$/;
const HAPAK_YEAR_BASE: Record<string, number> = {};
"ABCDEFGHIJKLMNOPQRSTUVWXY".split("").forEach((ch, i) => { HAPAK_YEAR_BASE[ch] = i; });

export function fmtDocNumber(docNumber: string | null | undefined): string {
  if (!docNumber) return "-";
  const projZzMatch = docNumber.match(HAPAK_PROJ_ZZ_RE);
  if (projZzMatch) {
    const year = projZzMatch[1];
    const seq = parseInt(projZzMatch[2]).toString().padStart(4, "0");
    return `${year}-${seq}`;
  }
  const projOldMatch = docNumber.match(HAPAK_PROJ_OLD_RE);
  if (projOldMatch && HAPAK_YEAR_BASE[projOldMatch[1]] !== undefined) {
    const year = HAPAK_YEAR_BASE[projOldMatch[1]].toString().padStart(2, "0");
    const seq = parseInt(projOldMatch[2]).toString().padStart(4, "0");
    return `${year}-${seq}`;
  }
  const legacyProjectMatch = docNumber.match(/^P-(\d{4})-(\d+)$/);
  if (legacyProjectMatch) {
    return `${legacyProjectMatch[1].slice(-2)}-${parseInt(legacyProjectMatch[2]).toString().padStart(4, "0")}`;
  }
  const zzMatch = docNumber.match(HAPAK_ZZ_RE);
  if (zzMatch) {
    const year = zzMatch[1];
    const seq = parseInt(zzMatch[2]).toString().padStart(5, "0");
    return `${year}-${seq}`;
  }
  const oldMatch = docNumber.match(HAPAK_OLD_RE);
  if (oldMatch && HAPAK_YEAR_BASE[oldMatch[1]] !== undefined) {
    const year = HAPAK_YEAR_BASE[oldMatch[1]].toString().padStart(2, "0");
    const seq = parseInt(oldMatch[2]).toString().padStart(5, "0");
    return `${year}-${seq}`;
  }
  return docNumber;
}
