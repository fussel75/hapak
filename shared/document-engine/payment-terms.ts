export function stripSkontoFromPaymentText(text: string): string {
  let cleaned = text || "";
  cleaned = cleaned.replace(
    /(Zahlbar\s+innerhalb\s+von\s+\d+\s+Tagen\s+ohne\s+Abzug)\s*,\s*[^.\n]*Skonto[^.\n]*(\.)?/gi,
    "$1.",
  );
  cleaned = cleaned.replace(
    /(\bZahlbar\s+innerhalb\s+von\s+\d+\s+Tagen\s+netto\.)\s*Bei\s+Zahlung\s+innerhalb\s+von\s+\d+\s+Tagen[^.\n]*Skonto[^.\n]*(\.)?/gi,
    "$1",
  );
  cleaned = cleaned.replace(
    /\bBei\s+Zahlung\s+innerhalb\s+von\s+\d+\s+Tagen[^.\n]*Skonto[^.\n]*(\.)?/gi,
    "",
  );
  return cleaned.replace(/[ \t]{2,}/g, " ").replace(/\s+\./g, ".").trim();
}

export function getEffectiveAfterTotalsText(
  afterTotalsText: string | null | undefined,
  skontoImDokument: boolean,
  hasExplicitSkontoBlock = false,
): string {
  const text = afterTotalsText || "";
  // Skonto is shown by explicit skonto rows, not duplicated in the payment text.
  void skontoImDokument;
  void hasExplicitSkontoBlock;
  return stripSkontoFromPaymentText(text);
}
