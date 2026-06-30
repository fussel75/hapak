/**
 * Document Engine — Höhenschätzung
 * 
 * Schätzt die Render-Höhe jeder Position in Punkten (pt).
 * Wird für die Seitenumbruch-Berechnung genutzt.
 */

import type { DocumentItemData } from "../types";

export const HEIGHTS = {
  TITLE_ROW: 22,
  POSITION_ROW: 20,
  TITLE_SUM_ROW: 22,
  SUBTOTAL_ROW: 22,
  JUMBO_ROW: 22,
  JUMBO_CHILD_ROW: 18,
  JUMBO_FOOTER: 22,
  TEXT_ROW_BASE: 8,
  TEXT_LINE_HEIGHT: 12,
  SEPARATOR_LINE: 10,
  TABLE_HEADER: 20,
  CARRY_FORWARD: 16,
  ABSCHLUSS_BLOCK: 50,
  DESC_LINE_HEIGHT: 13,
};

const DEFAULT_CHARS_PER_LINE = 55;
const CHARS_PER_LINE_FULLWIDTH = 90;
const DEFAULT_IMG_HEIGHT = 150;

function estimateImageHeight(html: string): number {
  if (!html) return 0;
  const imgMatches = html.match(/<img\s[^>]*>/gi);
  if (!imgMatches) return 0;
  let total = 0;
  for (const tag of imgMatches) {
    const widthMatch = tag.match(/data-img-width="(\d+)"/);
    const pct = widthMatch ? parseInt(widthMatch[1]) : 100;
    total += Math.round(DEFAULT_IMG_HEIGHT * (pct / 100)) + 8;
  }
  return total;
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/<img\s[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/-\t/g, "-")
    .replace(/\t/g, "  ")
    .replace(/ {4,}/g, "  ");
}

function normalizedLineSegments(text: string): string[] {
  const htmlBlocks: string[] = [];
  const blockPattern = /<(div|p|li)[^>]*>[\s\S]*?<\/\1>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let hasOnlyHtmlBlocks = false;

  while ((match = blockPattern.exec(text)) !== null) {
    const between = text.slice(lastIndex, match.index);
    if (between.trim()) {
      htmlBlocks.length = 0;
      break;
    }
    htmlBlocks.push(match[0]);
    lastIndex = blockPattern.lastIndex;
  }

  if (htmlBlocks.length > 0 && !text.slice(lastIndex).trim()) {
    hasOnlyHtmlBlocks = true;
  }

  if (hasOnlyHtmlBlocks) {
    return htmlBlocks.map((block) => {
      const parts = normalizeText(block).split("\n");
      while (parts.length > 1 && parts[parts.length - 1] === "") {
        parts.pop();
      }
      return parts.join("\n");
    });
  }

  const normalized = normalizeText(text);
  const segments = normalized.split("\n");

  // contentEditable stores paragraph-based input as <div>...</div> or <p>...</p>.
  // The closing tag adds a technical trailing newline, which must not count as
  // an extra visual blank line. Real blank lines inside the block still count.
  const endsWithHtmlBlock = /(<\/(div|p|li)>\s*)$/i.test(text);
  const endsWithBlankHtmlBlock = /<(div|p|li)[^>]*>\s*(<br\s*\/?>|&nbsp;|\s)*<\/\1>\s*$/i.test(text);
  if (endsWithHtmlBlock) {
    const trailingVisualBlanks = endsWithBlankHtmlBlock ? 1 : 0;
    while (
      segments.length > 1 &&
      segments[segments.length - 1] === "" &&
      segments.filter((segment, index) => index === segments.length - 1 || segment === "").length > trailingVisualBlanks
    ) {
      segments.pop();
    }
  }

  if (endsWithHtmlBlock && !endsWithBlankHtmlBlock && segments.length > 1 && segments[segments.length - 1] === "") {
    segments.pop();
  }

  return segments;
}

export function estimateWrappedLines(text: string, charsPerLine = DEFAULT_CHARS_PER_LINE): number {
  if (!text) return 0;
  let total = 0;
  const segments = normalizedLineSegments(text);
  for (const seg of segments) {
    const trimmed = seg.trimEnd();
    if (trimmed.length === 0) {
      total += 1;
    } else {
      total += Math.max(1, Math.ceil(trimmed.length / charsPerLine));
    }
  }
  return total;
}

export function splitTextAtWrappedLine(
  text: string,
  afterLine: number,
  charsPerLine = DEFAULT_CHARS_PER_LINE,
): [string, string] {
  if (!text) return ["", ""];
  if (afterLine <= 0) return ["", text];

  const segments = normalizedLineSegments(text);
  let lineCount = 0;

  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    const trimmed = seg.trimEnd();

    if (trimmed.length === 0) {
      lineCount++;
      if (lineCount >= afterLine) {
        return [segments.slice(0, si + 1).join("\n"), segments.slice(si + 1).join("\n")];
      }
    } else {
      const segLines = Math.max(1, Math.ceil(trimmed.length / charsPerLine));
      if (lineCount + segLines >= afterLine) {
        const linesFromThisSeg = afterLine - lineCount;
        const charPos = linesFromThisSeg * charsPerLine;
        if (charPos >= trimmed.length) {
          return [segments.slice(0, si + 1).join("\n"), segments.slice(si + 1).join("\n")];
        }
        let splitAt = charPos;
        for (let j = Math.min(charPos + 8, seg.length - 1); j >= Math.max(0, charPos - 8); j--) {
          if (seg[j] === " " || seg[j] === "-") {
            splitAt = seg[j] === " " ? j + 1 : j + 1;
            break;
          }
        }
        const before = [...segments.slice(0, si), seg.substring(0, splitAt).trimEnd()].join("\n");
        const after = [seg.substring(splitAt).trimStart(), ...segments.slice(si + 1)].join("\n");
        return [before, after];
      }
      lineCount += segLines;
    }
  }

  return [text, ""];
}

/**
 * Schätzt die Höhe eines Freitext-Blocks (Dokumentzone) in PT.
 */
export function estimateTextBlockHeight(text: string | null | undefined): number {
  if (!text || !text.trim()) return 0;
  const lines = estimateWrappedLines(text, CHARS_PER_LINE_FULLWIDTH);
  return Math.max(0, lines * HEIGHTS.TEXT_LINE_HEIGHT + 4) + estimateImageHeight(text);
}

/**
 * Schätzt die Höhe eines einzelnen Items in PT.
 */
export function estimateItemHeight(
  item: DocumentItemData,
  expandedJumbos?: Set<string>,
  allItems?: DocumentItemData[],
  charsPerLine?: number,
): number {
  const cpl = charsPerLine || DEFAULT_CHARS_PER_LINE;
  const type = item.type || "position";

  if (type === "titel" || type === "gruppe") return HEIGHTS.TITLE_ROW;

  if (type === "titelsumme") return HEIGHTS.TITLE_SUM_ROW;
  if (type === "zwischensumme") return HEIGHTS.SUBTOTAL_ROW;

  if (type === "abschluss" || type === "skonto") return 0;

  if (type === "jumbo") {
    let h = HEIGHTS.JUMBO_ROW;
    const desc = item.description || "";
    if (desc) {
      h += estimateWrappedLines(desc, cpl) * HEIGHTS.DESC_LINE_HEIGHT;
    }
    if (expandedJumbos?.has(item._clientId || "") && allItems) {
      const children = allItems.filter(c => c._parentClientId === (item._clientId || ""));
      for (const child of children) {
        h += estimateChildHeight(child, cpl);
      }
      h += HEIGHTS.JUMBO_FOOTER;
    }
    return h;
  }

  if (item._parentClientId) {
    return estimateChildHeight(item, cpl);
  }

  if (["freitext", "floskel", "text"].includes(type)) {
    const txt = item.title || item.description || "";
    if (/^[-_—─═\s]+$/.test(txt.trim()) && txt.trim().length > 0) {
      return HEIGHTS.SEPARATOR_LINE;
    }
    return HEIGHTS.TEXT_ROW_BASE + (estimateWrappedLines(txt, CHARS_PER_LINE_FULLWIDTH) * HEIGHTS.TEXT_LINE_HEIGHT) + estimateImageHeight(txt);
  }

  const desc = item.description || "";
  const title = item.title || "";
  const combinedText = title && desc ? title + "\n" + desc : (desc || title);
  const wrappedLines = estimateWrappedLines(combinedText, cpl);
  const extraLines = Math.max(0, wrappedLines - 1);
  return HEIGHTS.POSITION_ROW + extraLines * HEIGHTS.DESC_LINE_HEIGHT + estimateImageHeight(combinedText);
}

function estimateChildHeight(item: DocumentItemData, cpl = DEFAULT_CHARS_PER_LINE): number {
  const title = item.title || "";
  const wrappedLines = estimateWrappedLines(title, cpl);
  if (wrappedLines <= 1) return HEIGHTS.JUMBO_CHILD_ROW;
  return HEIGHTS.JUMBO_CHILD_ROW + (wrappedLines - 1) * HEIGHTS.DESC_LINE_HEIGHT;
}
