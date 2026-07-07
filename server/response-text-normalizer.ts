import { repairHapakMojibake } from "@shared/document-engine/hapak-text-artifacts";

const SKIP_TEXT_REPAIR_KEYS = /(?:url|path|email|iban|bic|token|hash|mime|password|secret|filename|fileName|contentType)$/i;

function shouldSkipKey(key: string | null): boolean {
  return !!key && SKIP_TEXT_REPAIR_KEYS.test(key);
}

export function normalizeHapakResponseText<T>(value: T, key: string | null = null): T {
  if (value == null) return value;
  if (typeof value === "string") {
    return (shouldSkipKey(key) ? value : repairHapakMojibake(value)) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeHapakResponseText(item, key)) as T;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
      entryKey,
      normalizeHapakResponseText(entryValue, entryKey),
    ]);
    return Object.fromEntries(entries) as T;
  }
  return value;
}
