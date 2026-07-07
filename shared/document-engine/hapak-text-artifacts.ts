const MOJIBAKE_MARKER_RE = /[ÃÂâï¿½├┬ÔÇ]/;
const MOJIBAKE_SCORE_RE = /[ÃÂâï¿½├┬ÔÇ]/g;

const CODEPAGE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/├ñ/g, "ä"],
  [/├ä/g, "Ä"],
  [/├Â/g, "ö"],
  [/├û/g, "Ö"],
  [/├╝/g, "ü"],
  [/├£/g, "Ü"],
  [/├ƒ/g, "ß"],
  [/├®/g, "é"],
  [/┬▓/g, "²"],
  [/┬│/g, "³"],
  [/┬º/g, "§"],
  [/┬À/g, "·"],
  [/ÔÇô/g, "-"],
  [/ÔÇö/g, "-"],
  [/ÔÇ×/g, "-"],
];

function repairCodepageMojibake(text: string): string {
  return CODEPAGE_REPLACEMENTS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);
}

export function repairHapakMojibake(value: unknown): string {
  const text = String(value ?? "");
  if (!MOJIBAKE_MARKER_RE.test(text)) return text;
  const codepageRepaired = repairCodepageMojibake(text);

  try {
    const utf8Repaired = repairCodepageMojibake(Buffer.from(codepageRepaired, "latin1").toString("utf8"));
    const originalScore = (text.match(MOJIBAKE_SCORE_RE) || []).length;
    const codepageScore = (codepageRepaired.match(MOJIBAKE_SCORE_RE) || []).length;
    const utf8Score = (utf8Repaired.match(MOJIBAKE_SCORE_RE) || []).length;
    return utf8Score < codepageScore && utf8Score < originalScore ? utf8Repaired : codepageRepaired;
  } catch {
    return codepageRepaired;
  }
}

export function isHapakTextArtifactLine(value: unknown): boolean {
  const line = repairHapakMojibake(value).trim();
  if (!line) return false;

  const compact = line
    .replace(/\s+/g, "")
    .replace(/[ÃÂ┬]/g, "");

  if (!compact) return false;
  if (/^[º°§]+0$/u.test(compact)) return true;
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
