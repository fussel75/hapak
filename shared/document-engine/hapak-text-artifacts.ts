export function isHapakTextArtifactLine(value: unknown): boolean {
  const line = String(value ?? "").trim();
  if (!line) return false;

  const compact = line
    .replace(/\s+/g, "")
    .replace(/[Â┬]/g, "");

  if (!compact) return false;
  if (/^[º°]+0$/u.test(compact)) return true;
  if (/^\(\d{1,2}$/u.test(compact)) return true;
  if (/^p#$/iu.test(compact)) return true;
  return false;
}

export function cleanHapakTextBlock(value: unknown): string | null {
  const lines = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !isHapakTextArtifactLine(line));

  return lines.length > 0 ? lines.join("\n") : null;
}
