const MOJIBAKE_MARKER_RE = /[ÃÂâï¿½]/;
const MOJIBAKE_SCORE_RE = /[ÃÂâï¿½]/g;

export function repairHapakMojibake(value: unknown): string {
  const text = String(value ?? "");
  if (!MOJIBAKE_MARKER_RE.test(text)) return text;

  try {
    const repaired = Buffer.from(text, "latin1").toString("utf8");
    const originalScore = (text.match(MOJIBAKE_SCORE_RE) || []).length;
    const repairedScore = (repaired.match(MOJIBAKE_SCORE_RE) || []).length;
    return repairedScore < originalScore ? repaired : text;
  } catch {
    return text;
  }
}

export function isHapakTextArtifactLine(value: unknown): boolean {
  const line = repairHapakMojibake(value).trim();
  if (!line) return false;

  const compact = line
    .replace(/\s+/g, "")
    .replace(/[ÃÂ┬]/g, "");

  if (!compact) return false;
  if (/^[º°]+0$/u.test(compact)) return true;
  if (/^\(\d{1,2}$/u.test(compact)) return true;
  if (/^p#$/iu.test(compact)) return true;
  return false;
}

export function cleanHapakTextBlock(value: unknown): string | null {
  const lines = repairHapakMojibake(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !isHapakTextArtifactLine(line));

  return lines.length > 0 ? lines.join("\n") : null;
}
