/**
 * Document Engine — Seitenumbruch (Pagination)
 * 
 * Verteilt Dokument-Items auf A4-Seiten.
 * Berechnet Überträge, berücksichtigt Titel-Zusammenhalt.
 * 
 * Identische Logik für Editor UND PDF.
 * 
 * Dokumentzonen-Reihenfolge:
 * 1. beforeWorkText (Vortext vor Arbeitsbereich)
 * 2. Positionen (workItems)
 * 3. beforeTotalsText (Text vor Endsumme)
 * 4. Endsumme (summaryBlock)
 * 5. afterTotalsText (Nachtext/AGB nach Endsumme)
 */

import type { DocumentItemData, ResolvedTemplate, PageModel, LayoutBlock } from "../types";
import { estimateItemHeight, estimateTextBlockHeight, estimateWrappedLines, splitTextAtWrappedLine, HEIGHTS } from "./estimate-item-height";
import { countsForCarryForward, getLayoutBlockType, isClosingType, isTextType } from "../position-types";
import { cleanHapakTextBlock } from "../hapak-text-artifacts";

function parseNum(val: string | number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function itemId(item: DocumentItemData): string {
  return item._clientId || String(item.id || "");
}

function isHiddenInternalPosition(item: DocumentItemData, hideInternPositions?: boolean): boolean {
  if (!hideInternPositions) return false;
  const flag = String(item.positionFlag || "").toLowerCase();
  return flag === "intern" || flag === "internal" || flag === "intern_position";
}

export interface DocumentZones {
  beforeWorkText?: string | null;
  beforeTotalsText?: string | null;
  afterTotalsText?: string | null;
  showSkonto?: boolean;
}

/**
 * Hauptfunktion: Verteilt Items auf Seiten.
 * 
 * @returns PageModel[] — jede Seite mit ihren Blöcken und Übertrags-Info
 */
export function paginateDocument(
  allItems: DocumentItemData[],
  template: ResolvedTemplate,
  expandedJumbos?: Set<string>,
  zones?: DocumentZones,
  heightResolver?: (item: DocumentItemData) => number,
  hideInternPositions?: boolean,
): PageModel[] {
  const expandedSet = expandedJumbos || new Set<string>();
  const mainItems = allItems.filter(
    item => !isClosingType(item.type) && !item.afterTotals
      && !item._parentClientId
      && !isHiddenInternalPosition(item, hideInternPositions),
  );
  const abschlussItems = allItems.filter(
    item => item.type === "abschluss",
  );
  const showSkonto = zones?.showSkonto !== false;
  const skontoItems = showSkonto
    ? allItems.filter(item => item.type === "skonto")
    : [];
  const endTexte: DocumentItemData[] = allItems.filter(item => {
    if (!item.afterTotals || item.type === "abschluss" || item.type === "skonto") return false;
    if (isTextType(item.type)) {
      const visibleText = cleanHapakTextBlock(item.title || item.description || "");
      if (!visibleText) return false;
    }
    return true;
  });

  const descCol = template.workArea?.spalten?.find(
    s => (s.name || "").toLowerCase().includes("bezeichnung") || (s.name || "").toLowerCase().includes("beschreibung")
  );
  const descWidthPt = descCol?.breite || 280;
  const charsPerLine = Math.max(30, Math.floor(descWidthPt / 5));

  const getItemH = (item: DocumentItemData) =>
    heightResolver ? heightResolver(item) : estimateItemHeight(item, expandedJumbos, allItems, charsPerLine);

  const SAFETY_BUFFER = 4;
  const SAFE_MARGIN_PT = 2;
  // Der Ausgangs-Uebertrag wird im Formular absolut knapp oberhalb der Fusszeile
  // gezeichnet. Er darf daher keinen zusaetzlichen Tabellenplatz im Fluss blockieren.
  const CARRY_FORWARD_RESERVE = 0;
  const FOOTER_WORKAREA_GAP = 24;
  const resolveContentMax = (area: { y: number; h: number }, footerY: number): number => {
    const footerLimit = Math.max(0, footerY - area.y);
    const usableUntilFooter = Math.max(0, footerLimit - FOOTER_WORKAREA_GAP);
    return Math.min(Math.max(area.h, usableUntilFooter), footerLimit);
  };
  const page1ContentMax = resolveContentMax(template.workAreaPage1, template.footerYPage1);
  const page2ContentMax = resolveContentMax(template.workAreaPage2, template.footerYPage2);
  const page1Available = page1ContentMax - HEIGHTS.TABLE_HEADER - SAFETY_BUFFER;
  const page2Available = page2ContentMax - HEIGHTS.TABLE_HEADER - SAFETY_BUFFER;

  const pages: PageModel[] = [];
  let currentBlocks: LayoutBlock[] = [];
  let currentHeight = 0;
  let currentPageNum = 1;
  let runningSum = 0;
  let carryForwardIn = 0;
  let afterTotals = false;

  const AFTER_TOTALS_TYPES = new Set<string>(["footerText", "afterTotalsTextBlock"]);

  function availableHeight(): number {
    if (afterTotals) {
      return currentPageNum === 1 ? page1ContentMax - SAFETY_BUFFER : page2ContentMax - SAFETY_BUFFER;
    }
    return currentPageNum === 1 ? page1Available : page2Available;
  }

  function flushPage(): void {
    const pageOnlyAfterTotals = afterTotals && currentBlocks.length > 0 && currentBlocks.every(
      b => AFTER_TOTALS_TYPES.has(b.type)
    );

    if (!pageOnlyAfterTotals && runningSum > 0) {
      currentBlocks.push({
        type: "carryForward",
        estimatedHeight: HEIGHTS.CARRY_FORWARD,
        data: { amount: runningSum, direction: "out" },
      });
    }

    pages.push({
      pageNumber: currentPageNum,
      isFirstPage: currentPageNum === 1,
      blocks: currentBlocks,
      carryForwardIn: pageOnlyAfterTotals ? 0 : carryForwardIn,
      carryForwardOut: pageOnlyAfterTotals ? 0 : runningSum,
      isAfterTotals: pageOnlyAfterTotals,
    });

    carryForwardIn = pageOnlyAfterTotals ? 0 : runningSum;
    currentBlocks = [];
    currentHeight = 0;
    currentPageNum++;

    if (!afterTotals && runningSum > 0) {
      currentBlocks.push({
        type: "carryForward",
        estimatedHeight: HEIGHTS.CARRY_FORWARD,
        data: { amount: runningSum, direction: "in" },
      });
      currentHeight += HEIGHTS.CARRY_FORWARD;
    }
  }

  function determineBlockType(item: DocumentItemData): LayoutBlock["type"] {
    return getLayoutBlockType(item);
  }

  function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, "");
  }

  function isHtmlContent(text: string): boolean {
    return text.includes("<p>") || text.includes("<ul>") || text.includes("<ol>");
  }

  function splitHtmlIntoParagraphs(html: string): string[] {
    const parts: string[] = [];
    const tagPattern = /<(p|li)[^>]*>[\s\S]*?<\/\1>/gi;
    let match;
    let lastIdx = 0;
    while ((match = tagPattern.exec(html)) !== null) {
      if (match.index > lastIdx) {
        const between = html.substring(lastIdx, match.index).trim();
        if (between && stripHtml(between).trim()) parts.push(between);
      }
      parts.push(match[0]);
      lastIdx = tagPattern.lastIndex;
    }
    if (lastIdx < html.length) {
      const rest = html.substring(lastIdx).trim();
      if (rest && stripHtml(rest).trim()) parts.push(rest);
    }
    return parts.length > 0 ? parts : [html];
  }

  function addTextZoneBlock(
    text: string,
    blockType: LayoutBlock["type"],
  ): void {
    const plainForHeight = stripHtml(text);
    const totalH = estimateTextBlockHeight(plainForHeight);
    if (totalH <= 0) return;

    const remaining = availableHeight() - currentHeight;
    if (totalH <= remaining) {
      currentBlocks.push({
        type: blockType,
        estimatedHeight: totalH,
        data: { text },
      });
      currentHeight += totalH;
      return;
    }

    const ZONE_LINE_H = HEIGHTS.TEXT_LINE_HEIGHT;
    const ZONE_CPL = 85;
    const htmlMode = isHtmlContent(text);
    const paragraphs = htmlMode ? splitHtmlIntoParagraphs(text) : text.split("\n");
    let currentParagraphs: string[] = [];
    let currentPartH = 4;
    let splitPartIndex = 0;

    const flushTextPart = () => {
      if (currentParagraphs.length === 0) return;
      const partText = htmlMode ? currentParagraphs.join("") : currentParagraphs.join("\n");
      const plainPartText = htmlMode ? stripHtml(partText) : partText;
      if (!plainPartText.trim()) {
        currentParagraphs = [];
        currentPartH = 4;
        return;
      }
      const partH = currentPartH;
      currentBlocks.push({
        type: blockType,
        estimatedHeight: partH,
        data: { text: partText },
        splitPart: splitPartIndex === 0 ? "top" : "bottom",
        splitClipHeight: partH,
        splitPartIndex: splitPartIndex++,
      });
      currentHeight += partH;
      currentParagraphs = [];
      currentPartH = 4;
    };

    const ensureWritablePage = () => {
      const minUsefulSpace = ZONE_LINE_H + 4;
      if (availableHeight() - currentHeight < minUsefulSpace && currentBlocks.length > 0) {
        flushPage();
      }
    };

    for (let pi = 0; pi < paragraphs.length; pi++) {
      let para = paragraphs[pi];
      let plainText = htmlMode ? stripHtml(para) : para;
      let paraLines = plainText.trim().length === 0
        ? 1
        : Math.max(1, Math.ceil(plainText.length / ZONE_CPL));
      let paraH = paraLines * ZONE_LINE_H;

      let avail = availableHeight() - currentHeight;
      if (avail < 0) avail = 0;

      if (currentPartH + paraH > avail && currentParagraphs.length > 0) {
        flushTextPart();
        flushPage();
      }

      ensureWritablePage();

      avail = availableHeight() - currentHeight;
      const usableLines = Math.max(1, Math.floor(Math.max(0, avail - currentPartH) / ZONE_LINE_H));

      if (!htmlMode && paraLines > usableLines) {
        while (para) {
          ensureWritablePage();
          const freshAvail = availableHeight() - currentHeight;
          const maxLines = Math.max(1, Math.floor(Math.max(0, freshAvail - currentPartH) / ZONE_LINE_H));
          const [part, rest] = splitTextAtWrappedLine(para, maxLines, ZONE_CPL);
          const partText = part || para;
          const partLines = Math.max(1, estimateWrappedLines(partText, ZONE_CPL));
          currentParagraphs.push(partText);
          currentPartH += partLines * ZONE_LINE_H;
          para = rest;
          if (para) {
            flushTextPart();
            flushPage();
          }
        }
        continue;
      }

      currentParagraphs.push(para);
      currentPartH += paraH;
    }

    flushTextPart();
  }

  // ─── 1. beforeWorkText (Vortext) ────────────────────────────────────────────
  if (zones?.beforeWorkText?.trim()) {
    addTextZoneBlock(zones.beforeWorkText, "beforeWorkTextBlock");
  }

  // ─── 2. Hauptpositionen verteilen ──────────────────────────────────────────

  for (let i = 0; i < mainItems.length; i++) {
    const item = mainItems[i];
    const h = getItemH(item);
    const id = itemId(item);
    const isText = isTextType(item.type);

    if (item.pageBreakBefore && currentBlocks.length > 0) {
      flushPage();
    }

    if (isText) {
      const originalText = item.title || item.description || "";
      const rawText = originalText
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/div>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
      const visualLines = estimateWrappedLines(originalText, 90);
      if (!rawText.trim() && heightResolver && visualLines <= 1) {
        continue;
      }
    }

    const isTitel = item.type === "titel" || item.type === "gruppe";
    const isTitelsumme = item.type === "titelsumme";

    const cfReserve = (runningSum > 0 && !isText) ? CARRY_FORWARD_RESERVE : 0;

    if (isTitel) {
      const nextItem = mainItems[i + 1];
      const nextH = nextItem ? getItemH(nextItem) : 0;
      const combined = h + nextH;
      if (currentHeight + combined + cfReserve > availableHeight() && currentBlocks.length > 0) {
        flushPage();
      }
    } else if (isTitelsumme) {
      const rawMax = currentPageNum === 1
        ? page1ContentMax - HEIGHTS.TABLE_HEADER
        : page2ContentMax - HEIGHTS.TABLE_HEADER;
      if (currentHeight + h > rawMax && currentBlocks.length > 0) {
        flushPage();
      }
    } else if (!isText && currentHeight + h + cfReserve > availableHeight() && currentBlocks.length > 0) {
      const nextItem = mainItems[i + 1];
      const nextIsTitelsumme = nextItem?.type === "titelsumme";
      if (nextIsTitelsumme) {
        const nextH = getItemH(nextItem);
        if (currentHeight + h + nextH <= availableHeight()) {
        } else {
          flushPage();
        }
      } else {
        const hasDesc = !!(item.description || "").trim();
        const canSplit = hasDesc && h > HEIGHTS.POSITION_ROW + 10;
        if (!canSplit) {
          flushPage();
        } else {
          const bType = determineBlockType(item);
          const isPos = bType === "positionRow" || bType === "jumboRow";
          const splitTopMin = HEIGHTS.POSITION_ROW + 3 * HEIGHTS.DESC_LINE_HEIGHT;
          if (!isPos || availableHeight() - currentHeight < splitTopMin) {
            flushPage();
          }
        }
      }
    }

    const blockType = determineBlockType(item);

    const isPosition = blockType === "positionRow" || blockType === "jumboRow";
    const MIN_SPLIT_TOP = HEIGHTS.POSITION_ROW + 3 * HEIGHTS.DESC_LINE_HEIGHT;
    const canSplitPosition = isPosition && h > HEIGHTS.POSITION_ROW + 10
      && h > availableHeight() - currentHeight
      && availableHeight() - currentHeight >= MIN_SPLIT_TOP;

    if (canSplitPosition) {
      const rawFirstPartH = availableHeight() - currentHeight - SAFE_MARGIN_PT;

      if (heightResolver) {
        currentBlocks.push({
          type: blockType,
          itemIndex: allItems.indexOf(item),
          itemId: id,
          estimatedHeight: rawFirstPartH,
          splitPart: "top",
          splitClipHeight: rawFirstPartH,
          splitPartIndex: 0,
        });
        currentHeight += rawFirstPartH;

        let partIdx = 1;
        let remH = h - rawFirstPartH;
        let rendered = rawFirstPartH;
        while (remH > 0) {
          flushPage();
          const effectiveAvail = availableHeight() - currentHeight;
          const partH = Math.min(remH, effectiveAvail);
          currentBlocks.push({
            type: blockType,
            itemIndex: allItems.indexOf(item),
            itemId: id,
            estimatedHeight: partH,
            splitPart: "bottom",
            splitOffsetHeight: rendered,
            splitClipHeight: partH,
            splitPartIndex: partIdx++,
          });
          currentHeight += partH;
          rendered += partH;
          remH -= partH;
        }
      } else {
        const title = item.title || "";
        const desc = item.description || "";
        const combinedText = title && desc ? title + "\n" + desc : (desc || title);
        const totalLines = estimateWrappedLines(combinedText, charsPerLine);

        const linesOnFirstPage = Math.max(1, 1 + Math.floor(
          (rawFirstPartH - HEIGHTS.POSITION_ROW) / HEIGHTS.DESC_LINE_HEIGHT
        ));
        const clampedFirstLines = Math.min(linesOnFirstPage, totalLines);
        const firstPartH = HEIGHTS.POSITION_ROW + Math.max(0, clampedFirstLines - 1) * HEIGHTS.DESC_LINE_HEIGHT;

        currentBlocks.push({
          type: blockType,
          itemIndex: allItems.indexOf(item),
          itemId: id,
          estimatedHeight: firstPartH,
          splitPart: "top",
          splitClipHeight: firstPartH,
          splitAfterLines: clampedFirstLines,
          charsPerLine,
        });
        currentHeight += firstPartH;

        let linesRendered = clampedFirstLines;
        let remainingLines = totalLines - linesRendered;

        while (remainingLines > 0) {
          flushPage();
          const effectiveAvail = availableHeight() - currentHeight;
          const linesOnThisPage = Math.max(1, Math.floor(effectiveAvail / HEIGHTS.DESC_LINE_HEIGHT));
          const linesThisPart = Math.min(linesOnThisPage, remainingLines);
          const partH = linesThisPart * HEIGHTS.DESC_LINE_HEIGHT;

          currentBlocks.push({
            type: blockType,
            itemIndex: allItems.indexOf(item),
            itemId: id,
            estimatedHeight: partH,
            splitPart: "bottom",
            splitOffsetHeight: linesRendered * HEIGHTS.DESC_LINE_HEIGHT,
            splitClipHeight: partH,
            splitAfterLines: linesRendered,
            charsPerLine,
          });
          linesRendered += linesThisPart;
          currentHeight += partH;
          remainingLines -= linesThisPart;
        }
      }
    } else if (isText && h > availableHeight() - currentHeight) {
      const originalText = item.title || item.description || "";
      let remainingText = originalText;
      let partIdx = 0;

      while (remainingText) {
        let effectiveAvail = availableHeight() - currentHeight;
        if (effectiveAvail < HEIGHTS.TEXT_LINE_HEIGHT && currentBlocks.length > 0) {
          flushPage();
          effectiveAvail = availableHeight() - currentHeight;
        }

        const remainingLines = estimateWrappedLines(remainingText, 90);
        const remainingTextH = HEIGHTS.TEXT_ROW_BASE + remainingLines * HEIGHTS.TEXT_LINE_HEIGHT;
        const relaxedFits = remainingTextH <= effectiveAvail + 6;
        const linesFit = relaxedFits
          ? remainingLines
          : Math.max(1, Math.floor((effectiveAvail - HEIGHTS.TEXT_ROW_BASE - SAFE_MARGIN_PT) / HEIGHTS.TEXT_LINE_HEIGHT));
        const [partTextRaw, restText] = splitTextAtWrappedLine(remainingText, linesFit, 90);
        const partText = partTextRaw || remainingText;
        const partH = HEIGHTS.TEXT_ROW_BASE + estimateWrappedLines(partText, 90) * HEIGHTS.TEXT_LINE_HEIGHT;

        currentBlocks.push({
          type: blockType,
          itemIndex: allItems.indexOf(item),
          itemId: id,
          estimatedHeight: partH,
          splitPart: partIdx === 0 ? "top" : "bottom",
          splitClipHeight: partH,
          splitPartIndex: partIdx++,
          data: { titleOverride: partText },
        });
        currentHeight += partH;
        remainingText = relaxedFits ? "" : restText;

        if (remainingText) {
          flushPage();
        }
      }
    } else {
      currentBlocks.push({
        type: blockType,
        itemIndex: allItems.indexOf(item),
        itemId: id,
        estimatedHeight: h,
        keepWithNext: isTitel,
      });
      currentHeight += h;
    }

    if (item.type === "jumbo" && expandedJumbos?.has(id)) {
      const children = allItems.filter(c =>
        c._parentClientId === id && !isHiddenInternalPosition(c, hideInternPositions)
      );
      for (const child of children) {
        const ch = getItemH(child);
        const cfReserve = runningSum > 0 ? CARRY_FORWARD_RESERVE : 0;
        if (currentHeight + ch + cfReserve > availableHeight() && currentBlocks.length > 1) {
          flushPage();
        }
        currentBlocks.push({
          type: "jumboChildRow",
          itemIndex: allItems.indexOf(child),
          itemId: itemId(child),
          estimatedHeight: ch,
        });
        currentHeight += ch;
      }
    }

    if (countsForCarryForward(item)) {
      runningSum += parseNum(item.totalPrice);
    }
  }

  // ─── 3. Abschluss-Block ───────────────────────────────────────────────────
  {
    const abschlussHeight = HEIGHTS.ABSCHLUSS_BLOCK;
    if (currentHeight + abschlussHeight > availableHeight() && currentBlocks.length > 0) {
      flushPage();
    }
  }

  for (const item of abschlussItems) {
    const abH = HEIGHTS.ABSCHLUSS_BLOCK;
    currentBlocks.push({
      type: "abschlussBlock",
      itemIndex: allItems.indexOf(item),
      itemId: itemId(item),
      estimatedHeight: abH,
    });
    currentHeight += abH;
  }

  // ─── 4. beforeTotalsText (Text vor Endsumme) ─────────────────────────────
  if (zones?.beforeTotalsText?.trim()) {
    addTextZoneBlock(zones.beforeTotalsText, "beforeTotalsTextBlock");
  }

  // ─── 5. Endsumme (Netto/MwSt/Gesamt) — Platz reservieren ────────────────
  const hasSummaryItems = allItems.some(it => it.type === "nettosumme" || it.type === "gesamtsumme" || it.type === "abschluss");
  const SUMMARY_BLOCK_HEIGHT = 80 + skontoItems.length * 38;
  if (hasSummaryItems) {
    if (currentHeight + SUMMARY_BLOCK_HEIGHT > availableHeight() && currentBlocks.length > 0) {
      flushPage();
    }
    currentBlocks.push({
      type: "summaryBlock",
      estimatedHeight: SUMMARY_BLOCK_HEIGHT,
    });
    currentHeight += SUMMARY_BLOCK_HEIGHT;
  }
  afterTotals = true;

  // ─── 6. afterTotalsText (Nachtext/AGB) ───────────────────────────────────
  if (zones?.afterTotalsText?.trim()) {
    addTextZoneBlock(zones.afterTotalsText, "afterTotalsTextBlock");
  }

  // ─── 6b. Legacy: endTexte (Freitext-Items nach Abschluss) ────────────────
  for (const item of endTexte) {
    const h = getItemH(item);

    const remaining = availableHeight() - currentHeight;
    if (h > remaining) {
      let firstPartH = remaining;
      if (firstPartH <= 0) {
        if (currentBlocks.length > 0) flushPage();
        firstPartH = availableHeight() - currentHeight;
      }
      const id2 = itemId(item);
      currentBlocks.push({
        type: "footerText",
        itemIndex: allItems.indexOf(item),
        itemId: id2,
        estimatedHeight: firstPartH,
        splitPart: "top",
        splitClipHeight: firstPartH,
      });
      currentHeight = availableHeight();

      let rendered = firstPartH;
      let rem = h - firstPartH;
      while (rem > 0) {
        flushPage();
        const effectiveAvail = availableHeight() - currentHeight;
        const partH = Math.min(rem, effectiveAvail);
        currentBlocks.push({
          type: "footerText",
          itemIndex: allItems.indexOf(item),
          itemId: id2,
          estimatedHeight: partH,
          splitPart: "bottom",
          splitOffsetHeight: rendered,
          splitClipHeight: partH,
        });
        rendered += partH;
        currentHeight += partH;
        rem -= partH;
      }
    } else {
      currentBlocks.push({
        type: "footerText",
        itemIndex: allItems.indexOf(item),
        itemId: itemId(item),
        estimatedHeight: h,
      });
      currentHeight += h;
    }
  }

  // ─── Letzte Seite abschließen ──────────────────────────────────────────────

  const isVisibleContentBlock = (block: LayoutBlock) => {
    if (block.type === "carryForward") return false;
    if (
      (block.type === "beforeWorkTextBlock" ||
        block.type === "beforeTotalsTextBlock" ||
        block.type === "afterTotalsTextBlock") &&
      !stripHtml(String(block.data?.text ?? "")).trim()
    ) {
      return false;
    }
    return true;
  };

  const hasContentBlocks = currentBlocks.some(isVisibleContentBlock);

  if (hasContentBlocks || pages.length === 0) {
    const visibleBlocks = currentBlocks.filter(isVisibleContentBlock);
    const pageIsAfterTotals = visibleBlocks.length > 0 && visibleBlocks.every(b => AFTER_TOTALS_TYPES.has(b.type));
    pages.push({
      pageNumber: currentPageNum,
      isFirstPage: currentPageNum === 1,
      blocks: currentBlocks.filter((block) => isVisibleContentBlock(block) || block.type === "carryForward"),
      carryForwardIn: pageIsAfterTotals ? 0 : carryForwardIn,
      carryForwardOut: 0,
      remainingHeight: Math.max(0, availableHeight() - currentHeight),
      isAfterTotals: pageIsAfterTotals,
    });
  } else if (pages.length > 0) {
    pages[pages.length - 1].carryForwardOut = 0;
    const prevBlocks = pages[pages.length - 1].blocks;
    const lastBlock = prevBlocks[prevBlocks.length - 1];
    if (lastBlock?.type === "carryForward" && lastBlock.data?.direction === "out") {
      prevBlocks.pop();
    }
  }

  if (pages.length > 0) {
    const lastPage = pages[pages.length - 1];
    lastPage.carryForwardOut = 0;
    const lastBlock = lastPage.blocks[lastPage.blocks.length - 1];
    if (lastBlock?.type === "carryForward" && lastBlock.data?.direction === "out") {
      lastPage.blocks.pop();
    }
    if (lastPage.remainingHeight === undefined) {
      const usedHeight = lastPage.blocks.reduce((sum, b) => sum + (b.estimatedHeight || 0), 0);
      const pageAvail = lastPage.isFirstPage ? page1Available : page2Available;
      lastPage.remainingHeight = Math.max(0, pageAvail - usedHeight);
    }
  }

  return pages;
}
