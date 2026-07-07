import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { recalcAllSums, calcDocumentTotals, recalcJumboTotal } from "../shared/document-engine/calculations";
import { buildPositionNumbers } from "../shared/document-engine/numbering";
import { paginateDocument } from "../shared/document-engine/layout/paginate";
import { estimateWrappedLines } from "../shared/document-engine/layout/estimate-item-height";
import type { DocumentItemData, ResolvedTemplate } from "../shared/document-engine/types";
import { sanitizeRichHtmlWithImages, textToSafeHtml } from "../client/src/lib/safe-html";
import { buildPrintPayload } from "../client/src/lib/build-print-payload";
import { fmtDocNumber as fmtUiDocNumber, fmtQty as fmtUiQty } from "../client/src/lib/format";
import { normalizePrintDisplayMode } from "../shared/document-engine/display-mode";
import { formatDocumentNumberWithCustomSuffix, normalizeDocumentTypeLabel } from "../shared/document-engine/document-title";
import { getEffectiveAfterTotalsText } from "../shared/document-engine/payment-terms";
import { cleanHapakTextBlock, isHapakTextArtifactLine, repairHapakMojibake } from "../shared/document-engine/hapak-text-artifacts";
import {
  countsForTotal as positionCountsForTotal,
  getDefaultPriceFollowsCost,
  getDefaultQuantityForType,
  getDefaultUnitForType,
  getPositionTypeRule,
  isNumberedType,
  isTextType as isPositionTextType,
} from "../shared/document-engine/position-types";
import {
  getUploadMimeType,
  isAllowedSafeImageUpload,
  isSafeUploadFileName,
  resolveUploadPath,
} from "../server/upload-security";
import {
  applyEditorSettingsToNewDocument,
  getDocumentTypeDefaultFormTemplateId,
  getEffectiveFormTemplateId,
  getNewDocumentDefaultFormTemplateId,
} from "../shared/document-engine/editor-settings";
import {
  buildDocumentSavePayload,
  documentToEditorForm,
  getCalculationInputsFromForm,
} from "../shared/document-engine/document-form";
import { parseGermanDecimal, formatEditableGermanDecimal } from "../shared/document-engine/number-input";
import { recalcJumboFromChildren } from "../shared/document-engine/jumbo";
import { resolveDocumentEditorShortcut } from "../shared/document-engine/editor-shortcuts";
import {
  buildNewDocumentUrl,
  documentCreateTypes,
  documentTypeSettingTypes,
  formTemplateTypeOptions,
  getFormTemplateTypeLabel,
  normalizeFormTemplateType,
  normalizeDocumentCreateType,
} from "../shared/document-engine/document-types";
import {
  buildDocumentItemBulkPayload,
  restoreEditorClientIds,
  validateDocumentItemBulkPayload,
} from "../shared/document-engine/document-item-save";
import { mapDocumentItemsForPrint } from "../shared/document-engine/print-items";
import { buildEditorZones, emptyItem, getJumboChildCount, getJumboChildInsertIndex, getJumboParentClientId, resolveEditorColumnWidths } from "../client/src/pages/document-editor/utils";
import { getSafeTemplateImageUrl } from "../shared/document-engine/template/image-url";
import { resolveVariables } from "../shared/document-engine/template/resolve-variable";
import { buildDocumentBundle } from "../server/pdf-generator";
import { normalizeHapakResponseText } from "../server/response-text-normalizer";
import { planHapakAttachmentMatch } from "../shared/document-engine/hapak-attachment-matching";
import { expandHapakDetailedJumbos } from "../shared/document-engine/hapak-jumbo-import";

function item(partial: Partial<DocumentItemData>): DocumentItemData {
  return {
    type: "leistung",
    quantity: "1",
    unitPrice: "0",
    totalPrice: "0",
    positionFlag: "normal",
    ...partial,
  };
}

function byType(items: DocumentItemData[], type: string): DocumentItemData {
  const found = items.find((i) => i.type === type);
  assert.ok(found, `Expected item of type ${type}`);
  return found;
}

describe("document engine calculations", () => {
  it("uses one central position type matrix for core rules", () => {
    assert.equal(getPositionTypeRule("material").code, "MAT");
    assert.equal(getPositionTypeRule("lohn").countsForTotal, true);
    assert.equal(getPositionTypeRule("freitext").countsForTotal, false);
    assert.equal(getDefaultUnitForType("lohn"), "Std");
    assert.equal(getDefaultUnitForType("jumbo"), "Stk");
    assert.equal(getDefaultQuantityForType("jumbo"), "1.00");
    assert.equal(getDefaultQuantityForType("freitext"), "0.00");
    assert.equal(getDefaultPriceFollowsCost("jumbo"), true);
    assert.equal(getDefaultPriceFollowsCost("leistung"), false);
    assert.equal(isNumberedType("material"), true);
    assert.equal(isNumberedType("zuschlag"), true);
    assert.equal(isNumberedType("skonto"), false);
    assert.equal(getPositionTypeRule("unbekannt").countsForTotal, false);
    assert.equal(isNumberedType("unbekannt"), false);
    assert.equal(isPositionTextType("floskel"), true);
    assert.equal(positionCountsForTotal(item({ type: "material", totalPrice: "20.00" })), true);
    assert.equal(positionCountsForTotal(item({ type: "material", _parentClientId: "jumbo" })), false);
    assert.equal(positionCountsForTotal(item({ type: "leistung", positionFlag: "bedarf" })), false);
  });

  it("calculates skonto either on the full gross amount or only the material share", () => {
    const items = [
      item({
        _clientId: "p1",
        totalPrice: "100.00",
        materialPrice: "40.00",
      }),
      item({
        _clientId: "s1",
        type: "skonto",
      }),
    ];

    const fullSkonto = byType(recalcAllSums(items, 19, 10, 7, false), "skonto");
    const materialSkonto = byType(recalcAllSums(items, 19, 10, 7, true), "skonto");

    assert.equal(fullSkonto.totalPrice, "-11.90");
    assert.equal(materialSkonto.totalPrice, "-4.76");
    assert.match(materialSkonto.title || "", /Materialanteil/);
  });

  it("does not generate invalid skonto text or amounts without skonto days", () => {
    const recalced = recalcAllSums([
      item({ _clientId: "p1", totalPrice: "100.00", materialPrice: "40.00" }),
      item({ _clientId: "s1", type: "skonto" }),
    ], 19, 2, 0, false);

    const skonto = byType(recalced, "skonto");
    assert.equal(skonto.totalPrice, "0.00");
    assert.equal(skonto.title, "Skonto");
    assert.equal(skonto.description, "");
  });

  it("resolves the skonto placeholder only for complete skonto terms", () => {
    const baseDoc: any = {
      type: "angebot",
      documentNumber: "26-00001",
      date: "2026-04-27",
      paymentTermDays: 14,
      skontoPercent: "2.00",
      skontoDays: 0,
    };

    assert.equal(resolveVariables("[Skonto]", baseDoc), "");
    assert.equal(resolveVariables("[Skonto]", { ...baseDoc, skontoDays: 7 }), "2,00% in 7 Tagen");
  });

  it("keeps skonto wording out of payment terms so the explicit skonto block owns it", () => {
    const text = "Zahlbar innerhalb von 14 Tagen ohne Abzug, 2 Prozent Skonto bei Zahlung innerhalb von 7 Tagen.";

    assert.equal(
      getEffectiveAfterTotalsText(text, true),
      "Zahlbar innerhalb von 14 Tagen ohne Abzug.",
    );
    assert.equal(
      getEffectiveAfterTotalsText(text, true, true),
      "Zahlbar innerhalb von 14 Tagen ohne Abzug.",
    );
    assert.equal(
      getEffectiveAfterTotalsText(text, false),
      "Zahlbar innerhalb von 14 Tagen ohne Abzug.",
    );
  });

  it("formats document numbers with five digits and project numbers with four digits in templates", () => {
    const baseDoc: any = {
      type: "angebot",
      documentNumber: "AZZ2600001",
      date: "2026-04-27",
      paymentTermDays: 14,
      skontoPercent: "0.00",
      skontoDays: 0,
    };

    assert.equal(resolveVariables("[Dok.-Nr.]", baseDoc), "26-00001");
    assert.equal(resolveVariables("[Projektnummer]", baseDoc, null, { projectNumber: "PZZ260001", name: "Test" } as any), "26-0001");
    assert.equal(resolveVariables("[ProjektNr]", baseDoc, null, { projectNumber: "P-2026-7", name: "Test" } as any), "26-0007");
    assert.equal(fmtUiDocNumber("AZZ2600001"), "26-00001");
    assert.equal(fmtUiDocNumber("PZZ260001"), "26-0001");
    assert.equal(fmtUiDocNumber("P-2026-7"), "26-0007");
  });

  it("keeps imported HAPAK invoice suffixes on the number without polluting the document type label", () => {
    const custom = "Rechnung 26-00058 (1. Abschlagsrechnung zu AB 25-00018)";

    assert.equal(normalizeDocumentTypeLabel(custom, "Abschlagsrechnung"), "Rechnung");
    assert.equal(
      formatDocumentNumberWithCustomSuffix("26-00058", custom),
      "26-00058 (1. Abschlagsrechnung zu AB 25-00018)",
    );
  });

  it("keeps visible document quantities capped at two decimals while storage can be more precise", () => {
    assert.equal(fmtUiQty("5.600", 3), "5,60");
    assert.equal(fmtUiQty("2.555", 4), "2,56");
    assert.equal(fmtUiQty("1", 0), "1");
  });

  it("excludes alternatives, Bedarf positions and internal jumbo labor from document totals", () => {
    const items = [
      item({ _clientId: "normal", totalPrice: "100.00" }),
      item({ _clientId: "alt", totalPrice: "200.00", positionFlag: "alternativ" }),
      item({ _clientId: "bedarf", totalPrice: "300.00", positionFlag: "bedarf" }),
      item({ _clientId: "jumbo-lohn", totalPrice: "400.00", positionFlag: "jumbo_lohn" }),
      item({ _clientId: "abschluss", type: "abschluss" }),
    ];

    const recalced = recalcAllSums(items, 19, 0, 0);
    const totals = calcDocumentTotals(recalced, 19);

    assert.equal(byType(recalced, "abschluss").totalPrice, "100.00");
    assert.equal(totals.netTotal, 100);
    assert.equal(totals.grossTotal, 119);
  });

  it("uses the central total rules expected by the print renderer", () => {
    const items = recalcAllSums([
      item({ _clientId: "normal", totalPrice: "120.00" }),
      item({ _clientId: "child", _parentClientId: "normal", totalPrice: "999.00" }),
      item({ _clientId: "alt", totalPrice: "220.00", positionFlag: "alternativ" }),
      item({ _clientId: "bedarf", totalPrice: "330.00", positionFlag: "bedarf" }),
      item({ _clientId: "abschluss", type: "abschluss", totalPrice: "0.00" }),
    ], 19, 0, 0);

    const totals = calcDocumentTotals(items, 19);

    assert.equal(totals.netTotal, 120);
    assert.equal(totals.taxAmount, 22.8);
    assert.equal(totals.grossTotal, 142.8);
    assert.equal(byType(items, "abschluss").totalPrice, "120.00");
  });

  it("repairs stale imported net and gross closing rows from current document totals", () => {
    const items = recalcAllSums([
      item({ _clientId: "normal", totalPrice: "100.00" }),
      item({ _clientId: "bedarf", totalPrice: "75.00", positionFlag: "bedarf" }),
      item({ _clientId: "net", type: "nettosumme", title: "Nettosumme", totalPrice: "999.99" }),
      item({ _clientId: "gross", type: "gesamtsumme", title: "Gesamtsumme", totalPrice: "9999.99" }),
    ], 19, 0, 0);

    assert.equal(byType(items, "nettosumme").totalPrice, "100.00");
    assert.equal(byType(items, "gesamtsumme").totalPrice, "119.00");
  });

  it("treats fixed surcharges as numbered positions that affect totals", () => {
    const items = recalcAllSums([
      item({ _clientId: "p1", totalPrice: "100.00" }),
      item({ _clientId: "zu", type: "zuschlag", totalPrice: "15.00" }),
      item({ _clientId: "ab", type: "abschluss", totalPrice: "0.00" }),
    ], 19, 0, 0);
    const numbers = buildPositionNumbers(items);
    const totals = calcDocumentTotals(items, 19);

    assert.equal(byType(items, "abschluss").totalPrice, "115.00");
    assert.equal(totals.netTotal, 115);
    assert.equal(numbers.get("p1"), "1.");
    assert.equal(numbers.get("zu"), "2.");
  });

  it("counts top-level material and labor positions but not jumbo children", () => {
    const items = recalcAllSums([
      item({ _clientId: "leistung", type: "leistung", totalPrice: "100.00" }),
      item({ _clientId: "material", type: "material", totalPrice: "20.00" }),
      item({ _clientId: "lohn", type: "lohn", totalPrice: "30.00" }),
      item({ _clientId: "jumbo", type: "jumbo", totalPrice: "50.00" }),
      item({ _clientId: "jumbo-child", _parentClientId: "jumbo", type: "material", totalPrice: "5.00" }),
      item({ _clientId: "sum", type: "zwischensumme" }),
      item({ _clientId: "abschluss", type: "abschluss" }),
    ], 19, 0, 0);

    assert.equal(calcDocumentTotals(items, 19).netTotal, 155);
    assert.equal(byType(items, "zwischensumme").totalPrice, "155.00");
    assert.equal(byType(items, "abschluss").totalPrice, "155.00");
  });

  it("calculates zwischensumme across title sums until the previous subtotal", () => {
    const items = recalcAllSums([
      item({ _clientId: "title", type: "titel", title: "Dachgeschoss" }),
      item({ _clientId: "p1", totalPrice: "100.00" }),
      item({ _clientId: "ts", type: "titelsumme" }),
      item({ _clientId: "p2", totalPrice: "50.00" }),
      item({ _clientId: "zs", type: "zwischensumme" }),
    ], 19, 0, 0);

    assert.equal(byType(items, "titelsumme").totalPrice, "100.00");
    assert.equal(byType(items, "zwischensumme").totalPrice, "150.00");
  });

  it("does not double count title sums in following subtotals", () => {
    const items = recalcAllSums([
      item({ _clientId: "title", type: "titel", title: "Dachgeschoss" }),
      item({ _clientId: "p1", totalPrice: "100.00" }),
      item({ _clientId: "p2", totalPrice: "50.00" }),
      item({ _clientId: "ts", type: "titelsumme" }),
      item({ _clientId: "zs", type: "zwischensumme" }),
    ], 19, 0, 0);

    assert.equal(byType(items, "titelsumme").totalPrice, "150.00");
    assert.equal(byType(items, "zwischensumme").totalPrice, "150.00");
  });

  it("starts a new subtotal section after the previous subtotal", () => {
    const recalced = recalcAllSums([
      item({ _clientId: "p1", totalPrice: "100.00" }),
      item({ _clientId: "zs1", type: "zwischensumme" }),
      item({ _clientId: "p2", totalPrice: "40.00" }),
      item({ _clientId: "p3", totalPrice: "60.00" }),
      item({ _clientId: "zs2", type: "zwischensumme" }),
    ], 19, 0, 0);
    const subtotals = recalced.filter((it) => it.type === "zwischensumme");

    assert.equal(subtotals[0].totalPrice, "100.00");
    assert.equal(subtotals[1].totalPrice, "100.00");
  });

  it("updates title sums without mutating the original item array", () => {
    const original = [
      item({ _clientId: "title", type: "titel", title: "Dachgeschoss" }),
      item({ _clientId: "p1", totalPrice: "50.00" }),
      item({ _clientId: "p2", totalPrice: "75.00" }),
      item({ _clientId: "sum", type: "titelsumme", title: "alte Summe" }),
    ];

    const recalced = recalcAllSums(original, 19, 0, 0);

    assert.equal(byType(recalced, "titelsumme").totalPrice, "125.00");
    assert.equal(byType(recalced, "titelsumme").title, "Summe 1. Dachgeschoss");
    assert.equal(byType(original, "titelsumme").title, "alte Summe");
    assert.equal(byType(original, "titelsumme").totalPrice, "0");
  });

  it("recalculates imported main title sums after group title sums by matching the position number", () => {
    const recalced = recalcAllSums([
      item({ _clientId: "title", type: "titel", positionNumber: "1.", title: "Elektrikerarbeiten" }),
      item({ _clientId: "group1", type: "gruppe", positionNumber: "1.1.", title: "Steckdosen" }),
      item({ _clientId: "p1", positionNumber: "1.1.1", totalPrice: "1102.11" }),
      item({ _clientId: "sum1", type: "titelsumme", positionNumber: "1.1.", title: "Summe 1.1. Steckdosen" }),
      item({ _clientId: "group2", type: "gruppe", positionNumber: "1.2.", title: "Lichtschalter" }),
      item({ _clientId: "p2", positionNumber: "1.2.1", totalPrice: "1023.04" }),
      item({ _clientId: "sum2", type: "titelsumme", positionNumber: "1.2.", title: "Summe 1.2. Lichtschalter" }),
      item({ _clientId: "mainSum", type: "titelsumme", positionNumber: "1.", title: "Summe 1. Elektrikerarbeiten" }),
    ], 19, 0, 0);

    const sums = recalced.filter((it) => it.type === "titelsumme");
    assert.equal(sums[0].title, "Summe 1.1. Steckdosen");
    assert.equal(sums[0].totalPrice, "1102.11");
    assert.equal(sums[1].title, "Summe 1.2. Lichtschalter");
    assert.equal(sums[1].totalPrice, "1023.04");
    assert.equal(sums[2].title, "Summe 1. Elektrikerarbeiten");
    assert.equal(sums[2].totalPrice, "2125.15");
  });

  it("keeps an imported title sum label when no matching title scope can be found", () => {
    const recalced = recalcAllSums([
      item({ _clientId: "p1", totalPrice: "100.00" }),
      item({ _clientId: "sum", type: "titelsumme", positionNumber: "1.", title: "Summe 1. Importierter Bereich" }),
    ], 19, 0, 0);

    assert.equal(byType(recalced, "titelsumme").title, "Summe 1. Importierter Bereich");
    assert.equal(byType(recalced, "titelsumme").totalPrice, "100.00");
  });

  it("recalculates stale jumbo totals before document sums are built", () => {
    const jumbo = item({
      _clientId: "jumbo",
      type: "jumbo",
      quantity: "2.00",
      unitPrice: "0.00",
      totalPrice: "0.00",
      priceFollowsCost: true,
    });
    const child = item({
      _clientId: "child",
      _parentClientId: "jumbo",
      type: "lohn",
      quantity: "1.00",
      unitPrice: "69.30",
      totalPrice: "69.30",
    });
    const abschluss = item({ type: "abschluss", totalPrice: "0.00" });

    const recalced = recalcAllSums([jumbo, child, abschluss], 19, 0, 0);

    assert.equal(recalced[0].unitPrice, "69.30");
    assert.equal(recalced[0].totalPrice, "138.60");
    assert.equal(byType(recalced, "abschluss").totalPrice, "138.60");
  });

  it("preserves deliberate fixed jumbo totals during document sum calculation", () => {
    const fixedJumbo = item({
      _clientId: "jumbo",
      type: "jumbo",
      quantity: "2.00",
      unitPrice: "150.00",
      totalPrice: "300.00",
      priceFollowsCost: false,
    });
    const child = item({
      _clientId: "child",
      _parentClientId: "jumbo",
      type: "lohn",
      quantity: "1.00",
      unitPrice: "69.30",
      totalPrice: "69.30",
    });
    const abschluss = item({ type: "abschluss", totalPrice: "0.00" });

    const recalced = recalcAllSums([fixedJumbo, child, abschluss], 19, 0, 0);

    assert.equal(recalced[0].unitPrice, "150.00");
    assert.equal(recalced[0].totalPrice, "300.00");
    assert.equal(byType(recalced, "abschluss").totalPrice, "300.00");
  });

  it("applies document position numbering options consistently", () => {
    const items = [
      item({ _clientId: "title", type: "titel", title: "Titel" }),
      item({ _clientId: "p1", type: "leistung" }),
      item({ _clientId: "p2", type: "leistung" }),
    ];

    const automatic = buildPositionNumbers(items, { auto: true, start: 10, step: 5 });
    assert.equal(automatic.get("title"), "10.");
    assert.equal(automatic.get("p1"), "10.5");
    assert.equal(automatic.get("p2"), "10.10");

    const manual = buildPositionNumbers([
      item({ _clientId: "p1", type: "leistung", manualPosNr: "A-1" } as any),
      item({ _clientId: "imported", type: "jumbo", positionNumber: "8.4" }),
    ], { auto: false });
    assert.equal(manual.get("p1"), "A-1");
    assert.equal(manual.get("imported"), "8.4");
  });

  it("numbers top-level material and labor positions but not jumbo children", () => {
    const items = [
      item({ _clientId: "leistung", type: "leistung" }),
      item({ _clientId: "material", type: "material" }),
      item({ _clientId: "lohn", type: "lohn" }),
      item({ _clientId: "jumbo", type: "jumbo" }),
      item({ _clientId: "child", _parentClientId: "jumbo", type: "material" }),
    ];

    const numbers = buildPositionNumbers(items);

    assert.equal(numbers.get("leistung"), "1.");
    assert.equal(numbers.get("material"), "2.");
    assert.equal(numbers.get("lohn"), "3.");
    assert.equal(numbers.get("jumbo"), "4.");
    assert.equal(numbers.get("child"), "");
  });
});

describe("safe html rendering", () => {
  it("removes tags and event handlers from document text before HTML rendering", () => {
    const html = textToSafeHtml(`Text<script>alert("xss")</script><img src=x onerror=alert(1)>`);

    assert.equal(html.includes("<script"), false);
    assert.equal(html.includes("<img"), false);
    assert.equal(html.includes("onerror"), false);
    assert.equal(html, "Text");
  });

  it("keeps line breaks and tabs while escaping angle brackets", () => {
    const html = textToSafeHtml("A\tB\n<C>");

    assert.match(html, /&nbsp;/);
    assert.match(html, /<br>/);
    assert.match(html, /&lt;C&gt;/);
  });

  it("preserves only safe uploaded image tags in rich document html", () => {
    const html = sanitizeRichHtmlWithImages(`
      Hallo
      <img src="/api/uploads/img_safe.png" onerror="alert(1)" data-img-width="240">
      <img src="javascript:alert(1)" data-img-width="50">
      <img src="/api/uploads/../../../secret.txt">
    `);

    assert.match(html, /<img src="\/api\/uploads\/img_safe\.png" data-img-width="100">/);
    assert.equal(html.includes("onerror"), false);
    assert.equal(html.includes("javascript:"), false);
    assert.equal(html.includes("secret.txt"), false);
  });
});

describe("template image handling", () => {
  it("accepts only safe template image formats for preview and PDF paths", () => {
    assert.equal(getSafeTemplateImageUrl("/api/uploads/logo.png"), "/api/uploads/logo.png");
    assert.equal(getSafeTemplateImageUrl("/api/uploads/logo.webp?version=1"), "/api/uploads/logo.webp?version=1");
    assert.equal(getSafeTemplateImageUrl("/api/uploads/logo.bmp"), "");
    assert.equal(getSafeTemplateImageUrl("/api/uploads/logo.svg"), "");
    assert.equal(getSafeTemplateImageUrl(""), "");
  });

  it("carries the company logo url into the document bundle", () => {
    const bundle = buildDocumentBundle(
      {
        id: 1,
        type: "angebot",
        documentNumber: "26-00001",
        date: "2026-05-21",
        taxRate: "19.00",
      } as any,
      { id: 1, name: "Mustermann", customerNumber: "10000" } as any,
      [],
      { companyName: "FriStD-Bau", logoUrl: "/api/uploads/logo.png" } as any,
    );

    assert.equal(bundle.companySettings?.logoUrl, "/api/uploads/logo.png");
  });

  it("does not fall back to a bundled legacy company logo in generated PDFs", () => {
    const pdfGeneratorSource = fs.readFileSync(path.resolve("server/pdf-generator.ts"), "utf8");

    assert.equal(pdfGeneratorSource.includes("FriStD-Bau_ZuB_GmbH_&_CoKG"), false);
    assert.equal(pdfGeneratorSource.includes("LOGO_PATH"), false);
  });
});

describe("upload security helpers", () => {
  it("accepts only matching raster image uploads", () => {
    assert.equal(isAllowedSafeImageUpload("image/png", "logo.png"), true);
    assert.equal(isAllowedSafeImageUpload("image/jpeg", "foto.jpeg"), true);
    assert.equal(isAllowedSafeImageUpload("image/png", "logo.svg"), false);
    assert.equal(isAllowedSafeImageUpload("image/svg+xml", "logo.svg"), false);
    assert.equal(isAllowedSafeImageUpload("text/plain", "logo.png"), false);
  });

  it("rejects traversal filenames and resolves only inside the upload root", () => {
    const root = path.resolve("server/uploads");

    assert.equal(isSafeUploadFileName("img_safe-01.png"), true);
    assert.equal(isSafeUploadFileName("../secret.png"), false);
    assert.equal(isSafeUploadFileName("nested/secret.png"), false);
    assert.equal(isSafeUploadFileName("nested\\secret.png"), false);

    const resolved = resolveUploadPath(root, "img_safe-01.png");
    assert.ok(resolved?.startsWith(root));
    assert.equal(resolveUploadPath(root, "../secret.png"), null);
  });

  it("serves only supported uploaded image mime types", () => {
    assert.equal(getUploadMimeType("logo.png"), "image/png");
    assert.equal(getUploadMimeType("logo.webp"), "image/webp");
    assert.equal(getUploadMimeType("logo.svg"), null);
    assert.equal(getUploadMimeType("beleg.pdf"), null);
  });
});

describe("editor settings defaults", () => {
  const baseForm = {
    type: "angebot",
    formTemplateId: null,
    dezimalstellenMengen: 2,
    dezimalstellenPreise: 2,
    positionenEnthaltenUst: false,
    paymentTermDays: 14,
    skontoPercent: "2.00",
    skontoDays: 7,
    autoPositionNumbers: true,
    positionNumberStep: 1,
    positionNumberStart: 1,
    selbstkostenLohnsatz: "32.00",
    kalkulierterLohnsatz: "69.30",
    aufschlagMaterial: "30.00",
    aufschlagGeraete: "30.00",
    aufschlagFremdleistung: "30.00",
    kupferpreisBeruecksichtigen: false,
    kupferNotation: "200.00",
    langtexteFormatiert: true,
    kurztexteAnzeigen: false,
    jumboListenAnzeigen: true,
    einzelpreiseInJumbo: true,
    mengenInJumbo: true,
    skontoNurMaterial: false,
  };

  it("resolves form templates by document, document type, then company default", () => {
    assert.equal(
      getDocumentTypeDefaultFormTemplateId({ dokumenttypen: { angebot: { formTemplateId: "42" } } } as any, "angebot"),
      42,
    );
    assert.equal(
      getEffectiveFormTemplateId({
        documentFormTemplateId: 7,
        documentTypeDefaultFormTemplateId: 42,
        companyDefaultFormTemplateId: 99,
      }),
      7,
    );
    assert.equal(
      getEffectiveFormTemplateId({
        documentFormTemplateId: null,
        documentTypeDefaultFormTemplateId: 42,
        companyDefaultFormTemplateId: 99,
      }),
      42,
    );
  });

  it("resolves new-document form templates for every creatable document type", () => {
    const dokumenttypen = Object.fromEntries(
      documentCreateTypes.map((type, index) => [type, { formTemplateId: String(100 + index) }]),
    );

    for (const [index, type] of documentCreateTypes.entries()) {
      assert.equal(
        getNewDocumentDefaultFormTemplateId({
          editorSettings: { dokumenttypen } as any,
          documentType: type,
          companyDefaultFormTemplateId: 999,
        }),
        100 + index,
      );
    }

    assert.equal(
      getNewDocumentDefaultFormTemplateId({
        editorSettings: { dokumenttypen: {} } as any,
        documentType: "freies_dokument",
        companyDefaultFormTemplateId: 999,
      }),
      999,
    );
  });

  it("applies new-document defaults without dropping explicit zero values", () => {
    const applied = applyEditorSettingsToNewDocument(baseForm, {
      dezimalstellenMengen: 3,
      dezMaterialPreise: 4,
      preiseInklUst: true,
      defaultZahlungsziel: 21,
      defaultSkonto: "0.00",
      defaultSkontoTage: 0,
      autoPositionNumbers: false,
      positionNumberStep: 5,
      positionNumberStart: 10,
      selbstkostenLohnsatz: "33.00",
      kalkulierterLohnsatz1: "81.50",
      aufschlagMaterial1: "30.00",
      aufschlagGeraete: "25.00",
      aufschlagFremdleistung: "20.00",
      kupferBeruecksichtigen: true,
      kupferNotation: "210,50",
      langtexteFormatiert: false,
      kurztexteVerwenden: true,
      jumboListenAnzeigen: false,
      ePreiseInJumbo: false,
      mengenInJumbo: false,
      skontoNurMaterial: true,
    } as any);

    assert.equal(applied.dezimalstellenMengen, 3);
    assert.equal(applied.dezimalstellenPreise, 4);
    assert.equal(applied.positionenEnthaltenUst, true);
    assert.equal(applied.paymentTermDays, 21);
    assert.equal(applied.skontoPercent, "0.00");
    assert.equal(applied.skontoDays, 0);
    assert.equal(applied.autoPositionNumbers, false);
    assert.equal(applied.positionNumberStep, 5);
    assert.equal(applied.positionNumberStart, 10);
    assert.equal(applied.kupferNotation, "210.50");
    assert.equal(applied.langtexteFormatiert, false);
    assert.equal(applied.kurztexteAnzeigen, true);
    assert.equal(applied.jumboListenAnzeigen, false);
    assert.equal(applied.einzelpreiseInJumbo, false);
    assert.equal(applied.mengenInJumbo, false);
    assert.equal(applied.skontoNurMaterial, true);
  });
});

describe("document form mapping", () => {
  it("maps existing documents without dropping explicit false or zero values", () => {
    const form = documentToEditorForm({
      id: 1,
      documentNumber: "26-00001",
      type: "angebot",
      customerId: 10000,
      projectId: null,
      subject: null,
      date: "2026-04-27",
      validUntil: null,
      status: "entwurf",
      headerText: null,
      footerText: null,
      beforeWorkText: null,
      beforeTotalsText: null,
      afterTotalsText: null,
      taxRate: "0.00",
      paymentTermDays: 0,
      skontoDays: 0,
      skontoPercent: "0.00",
      retentionPercent: "0",
      customTypeLabel: null,
      formTemplateId: null,
      hideNetto: false,
      hideMwst: false,
      hideGesamt: false,
      showLohnanteil: false,
      skontoImDokument: false,
      skontoBase: "netto",
      skontoNurMaterial: false,
      autoPositionNumbers: false,
      positionNumberStep: 0,
      positionNumberStart: 0,
      positionenEnthaltenUst: false,
      einzelpreiseInJumbo: false,
      mengenInJumbo: false,
      internpositionenVerbergen: false,
      langtexteFormatiert: false,
      kurztexteAnzeigen: false,
      jumboListenAnzeigen: false,
      priceLevel: 0,
      kupferpreisBeruecksichtigen: false,
      formularfelder: null,
    } as any);

    assert.equal(form.taxRate, "0.00");
    assert.equal(form.paymentTermDays, 0);
    assert.equal(form.skontoImDokument, false);
    assert.equal(form.skontoBase, "gesamtsumme");
    assert.equal(form.autoPositionNumbers, false);
    assert.equal(form.positionNumberStep, 0);
    assert.equal(form.positionNumberStart, 0);
    assert.equal(form.einzelpreiseInJumbo, false);
    assert.equal(form.mengenInJumbo, false);
    assert.equal(form.internpositionenVerbergen, false);
    assert.equal(form.langtexteFormatiert, false);
    assert.equal(form.jumboListenAnzeigen, false);
    assert.deepEqual(form.formularfelder, {});
  });

  it("builds save payloads consistently for create, update and abschlag documents", () => {
    const payload = buildDocumentSavePayload({
      docForm: { documentNumber: "", customerId: 10000, projectId: 0, validUntil: "", skontoBase: "netto" },
      nextDocNumber: "26-00002",
      netTotal: 100,
      taxAmount: 19,
      grossTotal: 119,
      laborTotal: 40,
      isAbschlagOrSchluss: true,
      previouslyInvoiced: "50.00",
    });

    assert.equal(payload.documentNumber, "26-00002");
    assert.equal(payload.projectId, null);
    assert.equal(payload.validUntil, null);
    assert.equal(payload.netTotal, "100.00");
    assert.equal(payload.skontoBase, "gesamtsumme");
    assert.equal(payload.previouslyInvoiced, "50.00");
  });

  it("uses loaded document values as calculation inputs", () => {
    const inputs = getCalculationInputsFromForm({
      taxRate: "7.00",
      skontoPercent: "2.50",
      skontoDays: 14,
      skontoNurMaterial: true,
    });

    assert.deepEqual(inputs, {
      taxRate: 7,
      skontoPercent: 2.5,
      skontoDays: 14,
      skontoNurMaterial: true,
    });
  });
});

describe("print payload mapping", () => {
  it("preserves explicit document and item flags for preview and PDF generation", () => {
    const payload = buildPrintPayload({
      documentId: 42,
      formTemplateId: 7,
      projectId: 3,
      displayMode: "ohne-preise",
      customer: { id: 10000, name: "Mustermann Immobilien GmbH" },
      docForm: {
        type: "angebot",
        documentNumber: "26-00001",
        date: "2026-05-21",
        validUntil: "2026-06-21",
        subject: "Sanierung",
        taxRate: "19",
        skontoNurMaterial: true,
        skontoImDokument: false,
        par13b: true,
        internpositionenVerbergen: false,
        autoPositionNumbers: false,
        positionNumberStep: 5,
        positionNumberStart: 10,
        hideNetto: true,
        hideMwst: true,
        hideGesamt: false,
      },
      items: [
        {
          id: 5,
          _clientId: "jumbo-1",
          type: "jumbo",
          positionNumber: "1.1",
          quantity: "2.00",
          unitPrice: "150.00",
          totalPrice: "300.00",
          pageBreakBefore: true,
          afterTotals: true,
          positionFlag: "bedarf",
          priceFollowsCost: true,
          articleNumber: "ART-42",
          materialCost: "10.00",
          fontBold: true,
        },
        {
          _clientId: "child-1",
          _parentClientId: "jumbo-1",
          type: "lohn",
          quantity: "1.00",
          unitPrice: "69.30",
          totalPrice: "69.30",
          parentItemId: null,
        },
      ],
    });

    assert.equal(payload.document.skontoImDokument, false);
    assert.equal(payload.document.par13b, true);
    assert.equal(payload.document.internpositionenVerbergen, false);
    assert.equal(payload.document.autoPositionNumbers, false);
    assert.equal(payload.document.positionNumberStep, 5);
    assert.equal(payload.document.positionNumberStart, 10);
    assert.equal(payload.document.hideNetto, true);
    assert.equal(payload.document.hideMwst, true);
    assert.equal(payload.document.hideGesamt, false);
    assert.equal(payload.customerId, 10000);
    assert.equal(payload.formTemplateId, 7);
    assert.equal(payload.projectId, 3);
    assert.equal(payload.displayMode, "ohne-preise");
    assert.equal(payload.items[0].pageBreakBefore, true);
    assert.equal(payload.items[0].afterTotals, true);
    assert.equal(payload.items[0].positionFlag, "bedarf");
    assert.equal(payload.items[0].priceFollowsCost, true);
    assert.equal(payload.items[0].articleNumber, "ART-42");
    assert.equal(payload.items[0].materialCost, "10.00");
    assert.equal(payload.items[0].fontBold, true);
    assert.equal(payload.items[0]._clientId, "jumbo-1");
    assert.equal(payload.items[1]._parentClientId, "jumbo-1");
    assert.equal(payload.items[1].parentItemId, null);
  });

  it("normalizes legacy or unknown display modes to the full document view", () => {
    assert.equal(normalizePrintDisplayMode("normal"), "normal");
    assert.equal(normalizePrintDisplayMode("vollstaendig"), "normal");
    assert.equal(normalizePrintDisplayMode("zeitenliste"), "normal");
    assert.equal(normalizePrintDisplayMode(undefined), "normal");
  });
});

describe("document type creation", () => {
  it("offers all supported document creation types without silently forcing offers", () => {
    assert.ok(documentCreateTypes.includes("angebot"));
    assert.ok(documentCreateTypes.includes("rechnung"));
    assert.ok(documentCreateTypes.includes("freies_dokument"));
    assert.equal(normalizeDocumentCreateType("rechnung"), "rechnung");
    assert.equal(normalizeDocumentCreateType("freies_dokument"), "freies_dokument");
    assert.equal(normalizeDocumentCreateType("unbekannt"), "angebot");
    assert.equal(
      buildNewDocumentUrl("rechnung", { customerId: 10000, projectId: 26 }),
      "/dokumente/neu?type=rechnung&customerId=10000&projectId=26",
    );
  });

  it("keeps document settings and form template type options aligned with creatable documents", () => {
    assert.deepEqual([...documentTypeSettingTypes], [...documentCreateTypes]);

    const formTypeValues = formTemplateTypeOptions.map((option) => option.value);
    assert.ok(formTypeValues.includes("Dokument"));
    assert.ok(formTypeValues.includes("Bestellung"));
    assert.ok(formTypeValues.includes("Mahnung"));
    assert.ok(formTypeValues.includes("freies_dokument"));
    assert.ok(formTypeValues.includes("rechnung"));
    assert.ok(formTypeValues.includes("teilrechnung"));
    assert.ok(formTypeValues.includes("mitschnitt"));
    assert.equal(getFormTemplateTypeLabel("freies_dokument"), "Freies Dokument");
    assert.equal(normalizeFormTemplateType("Freies Dokument"), "freies_dokument");
    assert.equal(normalizeFormTemplateType("Rechnung"), "rechnung");
    assert.equal(normalizeFormTemplateType("Unbekannt"), "Dokument");
  });

  it("validates document types on server-side document APIs", () => {
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");

    assert.match(routesSource, /documentCreateTypes/);
    assert.match(routesSource, /function validateDocumentType/);
    assert.match(routesSource, /storage\.getNextDocumentNumber\(validateDocumentType/);
    assert.match(routesSource, /body\.type = validateDocumentType/);
  });

  it("does not trust preloaded document numbers when inserting new documents", () => {
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");

    assert.match(routesSource, /function isDocumentNumberUniqueError/);
    assert.match(routesSource, /body\.documentNumber = await storage\.getNextDocumentNumber\(body\.type \|\| "angebot"\)/);
    assert.match(routesSource, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/);
    assert.match(routesSource, /isDocumentNumberUniqueError\(err\)/);
  });
});

describe("document list UX guards", () => {
  it("does not use native browser confirm dialogs for deleting documents", () => {
    const source = fs.readFileSync(path.resolve("client/src/pages/documents.tsx"), "utf8");

    assert.equal(source.includes("confirm("), false);
    assert.match(source, /dialog-delete-document/);
    assert.match(source, /button-confirm-delete-document/);
  });
});

describe("document editor skonto UX guards", () => {
  it("guards skonto rendering in verrechnung blocks against incomplete skonto terms", () => {
    const source = fs.readFileSync(path.resolve("client/src/pages/document-editor/components/a4-components.tsx"), "utf8");
    assert.match(source, /parseFloat\(docForm\.skontoPercent \|\| "0"\) > 0 && \(docForm\.skontoDays \|\| 0\) > 0/);
  });

  it("keeps the first split free-text part editable in the document editor", () => {
    const source = fs.readFileSync(path.resolve("client/src/pages/document-editor.tsx"), "utf8");

    assert.match(source, /const isTextItem = item\.type === "freitext"/);
    assert.match(source, /&& !\(isTextItem && blockInfo\?\.splitPart === "top"\)/);
  });

  it("uses the same resolved form template for pagination and A4 rendering", () => {
    const editorSource = fs.readFileSync(path.resolve("client/src/pages/document-editor.tsx"), "utf8");
    const a4Source = fs.readFileSync(path.resolve("client/src/pages/document-editor/components/a4-components.tsx"), "utf8");

    assert.match(editorSource, /const effectiveTemplateId = getEffectiveFormTemplateId/);
    assert.match(editorSource, /resolvedTemplate=\{resolvedTemplate\}/);
    assert.match(a4Source, /resolvedTemplate\?: ResolvedTemplate/);
    assert.match(a4Source, /const resolved = resolvedTemplate \|\| resolveTemplate/);
  });

  it("passes the effective form template id into preview and PDF document data", () => {
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");
    const occurrences = routesSource.match(/formTemplateId: effectiveTemplateId \|\| null/g) || [];

    assert.equal(occurrences.length, 2);
    assert.equal(routesSource.includes("formTemplateId: formTemplateId || null"), false);
  });

  it("keeps skonto visibility controllable from the inspector and explicit skonto insertion", () => {
    const editorSource = fs.readFileSync(path.resolve("client/src/pages/document-editor.tsx"), "utf8");
    const sidebarSource = fs.readFileSync(path.resolve("client/src/pages/document-editor/components/editor-sidebar.tsx"), "utf8");
    const operationsSource = fs.readFileSync(path.resolve("client/src/pages/document-editor/hooks/use-item-operations.ts"), "utf8");

    assert.match(editorSource, /skontoImDokument: false/);
    assert.match(editorSource, /buildEditorZones\(docForm, items\)/);
    assert.match(editorSource, /setDocForm,/);
    assert.match(sidebarSource, /input-skonto-visible-sidebar/);
    assert.match(sidebarSource, /skontoImDokument: e\.target\.checked/);
    assert.match(operationsSource, /setDocForm\?\./);
    assert.match(operationsSource, /skontoImDokument: true/);
  });

  it("renders skonto as a clean discount block instead of a normal position row", () => {
    const rowSource = fs.readFileSync(path.resolve("client/src/pages/document-editor/components/position-row.tsx"), "utf8");
    const a4Source = fs.readFileSync(path.resolve("client/src/pages/document-editor/components/a4-components.tsx"), "utf8");
    const skontoBlock = rowSource.slice(
      rowSource.indexOf("if (isSkonto)"),
      rowSource.indexOf("if (isSum)"),
    );
    const a4SkontoBlock = a4Source.slice(
      a4Source.indexOf("skontoItems && skontoItems.length > 0"),
      a4Source.indexOf("const verrechnungen: any[]"),
    );

    assert.match(rowSource, /const isSkonto = item\.type === "skonto"/);
    assert.match(skontoBlock, /item\.title \|\| "Skonto"/);
    assert.match(skontoBlock, /item\.description/);
    assert.doesNotMatch(skontoBlock, /renderUnitEditor/);
    assert.doesNotMatch(skontoBlock, /qtyDisplay/);
    assert.doesNotMatch(a4SkontoBlock, /height:\s*"22pt"/);
    assert.doesNotMatch(a4SkontoBlock, /height:\s*"16pt"/);
    assert.match(a4SkontoBlock, /leading-snug/);
  });

  it("keeps after-totals skonto out of the normal after-totals position table", () => {
    const editorSource = fs.readFileSync(path.resolve("client/src/pages/document-editor.tsx"), "utf8");
    const afterTotalsZone = editorSource.slice(
      editorSource.indexOf('data-testid="after-totals-zone"'),
      editorSource.indexOf("editorZones.afterTotalsText", editorSource.indexOf('data-testid="after-totals-zone"')),
    );

    assert.match(afterTotalsZone, /items\.some\(isVisibleAfterTotalsItem\)/);
    assert.match(afterTotalsZone, /if \(!isVisibleAfterTotalsItem\(item\)\) return null;/);
    assert.match(editorSource, /item\.type === "skonto"/);
  });
});

describe("document editor display polish guards", () => {
  it("keeps imported HAPAK-like structure rows compact and readable", () => {
    const rowSource = fs.readFileSync(path.resolve("client/src/pages/document-editor/components/position-row.tsx"), "utf8");
    const editorSource = fs.readFileSync(path.resolve("client/src/pages/document-editor.tsx"), "utf8");
    const operationsSource = fs.readFileSync(path.resolve("client/src/pages/document-editor/hooks/use-item-operations.ts"), "utf8");

    assert.match(rowSource, /structureTitleInputClass/);
    assert.match(rowSource, /structureSubtitleInputClass/);
    assert.match(rowSource, /leading-\[1\.35\]/);
    assert.match(rowSource, /const isEditableTextSource = textOverride === undefined/);
    assert.match(rowSource, /const textClipHeight = isEditableTextSource \|\| focused \? undefined : maxClipHeight/);
    assert.match(rowSource, /const textSplitOffset = isEditableTextSource \|\| focused \? undefined : splitOffsetHeight/);
    assert.match(rowSource, /placeholder="Text eingeben\.\.\."\s+onFocus=\{onFocus\}/);
    assert.match(rowSource, /const structurePadding = isGruppe \? "py-1\.5" : "py-2"/);
    assert.match(rowSource, /const sumLabelClass = isTitelS \? titleSumLabelClass : normalSumLabelClass/);
    assert.match(rowSource, /const titleSumLabelClass = "font-semibold text-gray-900 cursor-pointer hover:text-gray-950"/);
    assert.doesNotMatch(rowSource, /titleSumLabelClass = .*hover:text-blue/);
    assert.doesNotMatch(rowSource, /titleSumLabelClass = .*hover:underline/);
    assert.match(rowSource, /data-testid=\{`button-jumbo-add-\$\{index\}`\}/);
    assert.match(rowSource, /aria-label="Jumbo-Unterposition anlegen"/);
    assert.match(rowSource, /<Plus className="h-3 w-3" aria-hidden="true" \/>/);
    assert.doesNotMatch(rowSource, />\s*\+\s*Anh.ngen\s*</);
    assert.match(rowSource, /isJumbo && !isSubItem && \(/);
    assert.doesNotMatch(rowSource, /isJumbo && !isSubItem && \(focused \|\| selected \|\| jumboMenuOpen\) &&/);
    assert.match(rowSource, /isJumbo && !isSubItem && jumboMenuOpen &&/);
    assert.match(rowSource, /data-testid="jumbo-menu-manuell"/);
    assert.match(rowSource, /data-testid="jumbo-menu-material"/);
    assert.match(rowSource, /const isOptionalPosition = isAlt \|\| isBedarf/);
    assert.match(rowSource, /const optionalTextClass = isOptionalPosition \? "italic text-slate-700" : ""/);
    assert.match(rowSource, /const optionalPriceClass = isOptionalPosition \? "italic text-slate-600" : ""/);
    assert.match(rowSource, /return isOptionalPosition \? `\(\$\{formatted\}\)` : formatted/);
    assert.match(rowSource, /fmtOptionalP\(item\.totalPrice\)/);
    assert.doesNotMatch(rowSource, /item\.positionFlag === "bedarf" \? "text-blue-500"/);
    assert.doesNotMatch(rowSource, /item\.positionFlag === "alternativ" \? "text-amber-500"/);
    const pdfSource = fs.readFileSync(path.resolve("server/pdf-generator.ts"), "utf8");
    assert.match(pdfSource, /const isOptional = isAlt \|\| isBedarf/);
    assert.match(pdfSource, /return isOptional \? `\(\$\{formatted\}\)` : formatted/);
    assert.match(pdfSource, /fmtOptionalCurrency\(item\.totalPrice\)/);
    const priceDialogSource = fs.readFileSync(path.resolve("client/src/pages/document-editor/components/dialogs/price-dialog.tsx"), "utf8");
    assert.match(priceDialogSource, /const calculationRows = children\.length > 0 \? children : parent \? \[parent\] : \[\]/);
    assert.match(priceDialogSource, /if \(externalEk > 0\)/);
    assert.match(priceDialogSource, /calcJumboTotals\(jumboChildren, item\)/);
    assert.match(priceDialogSource, /gespeicherten Detailkalkulation/);
    assert.match(editorSource, /const handleAddJumboChild = useCallback/);
    assert.match(editorSource, /const visibleExpandedJumbos = useMemoReact/);
    assert.match(editorSource, /docForm\.jumboListenAnzeigen === false \? new Set<string>\(\) : expandedJumbos/);
    assert.match(editorSource, /paginateDocument\(items, resolvedTemplate, visibleExpandedJumbos/);
    assert.doesNotMatch(editorSource, /paginateDocument\(items, resolvedTemplate, expandedJumbos/);
    assert.match(editorSource, /data-testid="document-work-surface"/);
    assert.match(editorSource, /overflow-y-auto overflow-x-hidden work-surface/);
    assert.doesNotMatch(editorSource, /overflow-y-auto overflow-x-auto work-surface/);
    assert.match(editorSource, /const childCount = getJumboChildCount\(items, index\)/);
    assert.match(editorSource, /if \(childCount === 0\)/);
    assert.doesNotMatch(editorSource, /childCount === 0 && !activeJumbo/);
    assert.match(editorSource, /onAddJumboChild=\{\(type\) => handleAddJumboChild\(index, item, type\)\}/);
    assert.equal((editorSource.match(/onAddJumboChild=\{\(type\) => handleAddJumboChild\(index, item, type\)\}/g) || []).length, 2);
    assert.doesNotMatch(editorSource, /aria-label="Jumbo-Unterposition anlegen"/);
    assert.doesNotMatch(editorSource, /<Plus className="h-3 w-3" \/>/);
    assert.doesNotMatch(editorSource, />\s*Anh.ngen\s*</);
    const toolbarSource = fs.readFileSync(path.resolve("client/src/pages/document-editor/components/editor-toolbar.tsx"), "utf8");
    assert.match(toolbarSource, /data-testid="menu-jumbo-lists-show"/);
    assert.match(toolbarSource, /data-testid="menu-jumbo-lists-hide"/);
    assert.match(toolbarSource, /Jumbo-Listen anzeigen/);
    assert.match(toolbarSource, /Jumbo-Listen ausblenden/);
    assert.match(toolbarSource, /Jumbos an/);
    assert.match(toolbarSource, /Jumbos aus/);
    assert.match(operationsSource, /parentClientId && parentJumboIndex != null\s+\? recalcJumboPrice\(updated, parentJumboIndex\)/);
    assert.doesNotMatch(rowSource, /className="w-full font-bold text-gray-900 bg-transparent/);
  });

  it("keeps the visible document summary block calm and aligned", () => {
    const a4Source = fs.readFileSync(path.resolve("client/src/pages/document-editor/components/a4-components.tsx"), "utf8");
    const summaryBlock = a4Source.slice(
      a4Source.indexOf('data-testid="table-summary"'),
      a4Source.indexOf("const verrechnungen: any[]"),
    );
    const verrechnungSkontoBlock = a4Source.slice(
      a4Source.indexOf("skontoImDokument && hasVerrechnungen && skontoItems"),
      a4Source.indexOf("{showKalk &&"),
    );

    assert.match(a4Source, /const valueColPct = gpColumnPercent \? `\$\{gpColumnPercent\}%` : "18%"/);
    assert.match(a4Source, /const labelColPct = gpColumnPercent \? `\$\{100 - gpColumnPercent\}%` : "82%"/);
    assert.match(a4Source, /function splitTrailingGermanAmount/);
    assert.match(a4Source, /const summaryValueBase = "py-1\.5 pr-0\.5 pl-0 text-right tabular-nums text-slate-900"/);
    assert.match(a4Source, /const summaryEditButtonClass = "absolute right-0/);
    assert.doesNotMatch(a4Source, /summaryEditButtonClass = "absolute -right-/);
    assert.match(a4Source, /const hiddenSummaryRestoreClass = "rounded-sm px-0\.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"/);
    assert.match(a4Source, /import \{ X \} from "lucide-react"/);
    assert.match(a4Source, /summaryEditButtonClass/);
    assert.doesNotMatch(summaryBlock, /hover:text-blue-600/);
    assert.doesNotMatch(summaryBlock, /hover:underline/);
    assert.doesNotMatch(summaryBlock, /text-blue-400 hover:text-blue-600 underline/);
    assert.doesNotMatch(summaryBlock, />×<\/button>/);
    assert.match(summaryBlock, /data-testid="text-summary-netto"/);
    assert.match(summaryBlock, /data-testid="text-summary-brutto"/);
    assert.match(summaryBlock, /text-slate-950/);
    assert.match(summaryBlock, /data-testid=\{`skonto-amount-\$\{skontoIdx\}`\}/);
    assert.match(summaryBlock, /data-testid=\{`skonto-hint-\$\{skontoIdx\}`\}/);
    assert.match(summaryBlock, /data-testid=\{`skonto-hint-amount-\$\{skontoIdx\}`\}/);
    assert.doesNotMatch(summaryBlock, /<td colSpan=\{2\} className="text-right pt-0 pb-1\.5"/);
    assert.match(verrechnungSkontoBlock, /Zahlbetrag bei Skontoabzug \{fmtPercent\(parseFloat\(docForm\.skontoPercent \|\| "0"\)\)\}/);
    assert.match(verrechnungSkontoBlock, /data-testid=\{`skonto-hint-amount-\$\{skontoIdx\}`\}/);
    assert.match(verrechnungSkontoBlock, /<X className="h-2\.5 w-2\.5" aria-hidden="true" \/>/);
    assert.doesNotMatch(verrechnungSkontoBlock, /Zahlbetrag bei Skontoabzug \{fmtPercent\(parseFloat\(docForm\.skontoPercent \|\| "0"\)\)\} \{fmtCurrency\(zahlbetragNachSkonto\)\}/);
    assert.doesNotMatch(verrechnungSkontoBlock, />×<\/button>/);
  });
});

describe("invoice register finance flow guards", () => {
  it("keeps document finance fields synchronized from the outgoing invoice ledger", () => {
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");

    assert.match(routesSource, /async function syncDocumentFinanceFromFibu/);
    assert.match(routesSource, /fibu_zahlung = \$2/);
    assert.match(routesSource, /fibu_skonto = \$6/);
    assert.match(routesSource, /fibu_offen = \$7/);
    assert.match(routesSource, /documentStatusFromBezahlflag/);
    assert.ok((routesSource.match(/await syncDocumentFinanceFromFibu\(reId/g) || []).length >= 5);
  });

  it("uses fibu_buchungen as the source for open invoices in payment matching", () => {
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");
    const openInvoicesRoute = routesSource.slice(
      routesSource.indexOf('app.get("/api/open-invoices-for-matching"'),
      routesSource.indexOf('app.post("/api/payment-matches/auto"'),
    );
    const autoMatchRoute = routesSource.slice(
      routesSource.indexOf('app.post("/api/payment-matches/auto"'),
      routesSource.indexOf('app.post("/api/payment-matches/manual"'),
    );

    assert.match(openInvoicesRoute, /FROM fibu_buchungen f/);
    assert.match(openInvoicesRoute, /JOIN documents d ON d\.id = f\.document_id/);
    assert.match(openInvoicesRoute, /f\.art = 'RA'/);
    assert.match(openInvoicesRoute, /f\.idx = 0/);
    assert.match(openInvoicesRoute, /\$\{FIBU_OPEN_AMOUNT_SQL\}::float as "openAmount"/);
    assert.match(openInvoicesRoute, /AND \$\{FIBU_OPEN_AMOUNT_SQL\} > 0\.01/);
    assert.doesNotMatch(openInvoicesRoute, /betrag::numeric\s*-\s*COALESCE\(f\.zahlung/);
    assert.doesNotMatch(openInvoicesRoute, /d\.status NOT IN \('entwurf'/);

    assert.match(autoMatchRoute, /FROM fibu_buchungen f/);
    assert.match(autoMatchRoute, /JOIN documents d ON d\.id = f\.document_id/);
    assert.match(autoMatchRoute, /f\.art = 'RA'/);
    assert.match(autoMatchRoute, /\$\{FIBU_OPEN_AMOUNT_SQL\}::float as "openAmount"/);
    assert.doesNotMatch(autoMatchRoute, /betrag::numeric\s*-\s*COALESCE\(f\.zahlung/);
  });

  it("uses HAPAK offen values consistently in invoice registers and FIBU summaries", () => {
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");
    const incomingFibuRoute = routesSource.slice(
      routesSource.indexOf('app.get("/api/incoming-invoices-fibu"'),
      routesSource.indexOf('app.get("/api/fibu/summary"'),
    );
    const fibuSummaryRoute = routesSource.slice(
      routesSource.indexOf('app.get("/api/fibu/summary"'),
      routesSource.indexOf('app.get("/api/ledger-accounts"'),
    );
    const outgoingFibuRoute = routesSource.slice(
      routesSource.indexOf('app.get("/api/outgoing-invoices-fibu"'),
      routesSource.indexOf('app.get("/api/time-entries"'),
    );
    const financeRegisterRoute = routesSource.slice(
      routesSource.indexOf('app.get("/api/fibu/primanota"'),
      routesSource.indexOf('app.get("/api/fibu/:reId/details"'),
    );
    const outgoingStatsRoute = routesSource.slice(
      routesSource.indexOf('app.get("/api/fibu/statistics"'),
      routesSource.indexOf('app.get("/api/outgoing-invoices-fibu"'),
    );

    for (const route of [incomingFibuRoute, outgoingFibuRoute]) {
      assert.match(route, /\$\{FIBU_OPEN_AMOUNT_SQL\}::float as "openAmount"/);
      assert.match(route, /COALESCE\(SUM\(\$\{FIBU_OPEN_AMOUNT_SQL\}\), 0\) as "totalOffen"/);
      assert.doesNotMatch(route, /betrag::numeric\s*-\s*COALESCE\(f\.zahlung/);
    }

    assert.match(fibuSummaryRoute, /GREATEST\(COALESCE\(offen::numeric,0\), 0\)/);
    assert.match(financeRegisterRoute, /COALESCE\(SUM\(CASE WHEN f\.idx=0 AND f\.bezahlflag != 2 AND f\.stornoflag != 2 THEN\s+\$\{FIBU_OPEN_AMOUNT_SQL\} ELSE 0 END\), 0\)::float as "summeOffen"/);
    assert.match(outgoingStatsRoute, /COALESCE\(SUM\(\$\{FIBU_OPEN_AMOUNT_SQL\}\), 0\)::float as offen/);
    assert.doesNotMatch(financeRegisterRoute, /betrag::numeric\s*-\s*COALESCE\(f\.zahlung/);
    assert.doesNotMatch(outgoingStatsRoute, /betrag::numeric\s*-\s*COALESCE\(f\.zahlung/);
  });

  it("keeps dunning state synchronized with outgoing invoice ledger rows", () => {
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");
    const openItemsRoute = routesSource.slice(
      routesSource.indexOf('app.get("/api/open-items"'),
      routesSource.indexOf('app.post("/api/dunning-run"'),
    );
    const dunningRoutes = routesSource.slice(
      routesSource.indexOf('app.get("/api/dunning/:documentId/pdf"'),
      routesSource.indexOf('app.get("/api/post-calculations"'),
    );
    const dunningRunRoute = routesSource.slice(
      routesSource.indexOf('app.post("/api/dunning-run"'),
      routesSource.indexOf("// ========== KASSENBUCH"),
    );

    assert.match(routesSource, /async function syncDunningToFibu/);
    assert.match(routesSource, /SET mahnflag = \$1/);
    assert.match(routesSource, /mahn_geb = \$2/);
    assert.match(dunningRoutes, /await syncDunningToFibu\(created\.documentId\)/);
    assert.match(dunningRoutes, /await syncDunningToFibu\(updated\.documentId\)/);
    assert.match(dunningRunRoute, /await syncDunningToFibu\(docId\)/);
    assert.match(openItemsRoute, /fibuDunningLevel/);
    assert.match(openItemsRoute, /fibuNoReminder/);
    assert.match(openItemsRoute, /Math\.max\(entryMaxLevel, item\.fibuDunningLevel \|\| 0\)/);
    assert.match(openItemsRoute, /customer\?\.noReminder \|\| item\.fibuNoReminder/);
  });

  it("resynchronizes document finance after payment matching changes", () => {
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");
    const paymentMatchingRoutes = routesSource.slice(
      routesSource.indexOf('app.post("/api/payment-matches/auto"'),
      routesSource.indexOf('app.post("/api/nas/sync-preview"'),
    );

    assert.match(routesSource, /async function applyPaymentMatchToInvoice/);
    assert.match(paymentMatchingRoutes, /await applyPaymentMatchToInvoice\(inv\.id, matchAmount\)/);
    assert.match(paymentMatchingRoutes, /await applyPaymentMatchToInvoice\(documentId, matchAmount\)/);
    assert.match(paymentMatchingRoutes, /await applyPaymentMatchToInvoice\(match\.documentId, -parseFloat\(String\(match\.amount\)\)\)/);
    assert.doesNotMatch(paymentMatchingRoutes, /UPDATE documents SET paid_amount/);
    assert.doesNotMatch(paymentMatchingRoutes, /syncDocumentFinanceFromFibu\(tx\.reId\)/);
    assert.doesNotMatch(paymentMatchingRoutes, /syncDocumentFinanceFromFibu\(transactionReId\)/);
    assert.doesNotMatch(paymentMatchingRoutes, /syncDocumentFinanceFromFibu\(match\.transactionReId\)/);
  });

  it("bases project revenue overview on non-storno fibu main rows with open amounts", () => {
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");
    const overviewRoute = routesSource.slice(
      routesSource.indexOf('app.get("/api/post-calculations/overview"'),
      routesSource.indexOf('app.get("/api/post-calculations/naka-detail/:projectId"'),
    );
    const autoRoute = routesSource.slice(
      routesSource.indexOf('app.get("/api/post-calculations/auto/:projectId"'),
      routesSource.indexOf("const stripPassword"),
    );
    const nakaSource = fs.readFileSync(path.resolve("client/src/pages/nachkalkulation.tsx"), "utf8");

    assert.match(overviewRoute, /WHERE f\.idx = 0/);
    assert.match(overviewRoute, /f\.stornoflag != 2/);
    assert.match(overviewRoute, /GREATEST\(COALESCE\(f\.offen::numeric,0\), 0\)/);
    assert.match(overviewRoute, /erloesOffen/);
    assert.match(overviewRoute, /kostenOffen/);
    assert.doesNotMatch(overviewRoute, /typ='ZA'/);

    assert.match(autoRoute, /WHERE idx = 0 AND stornoflag != 2 AND ktr = \$1/);
    assert.match(autoRoute, /ra_offen/);
    assert.match(autoRoute, /re_offen/);
    assert.doesNotMatch(autoRoute, /typ='ZA'/);

    assert.match(nakaSource, /erloesOffen: number/);
    assert.match(nakaSource, /kostenOffen: number/);
    assert.match(nakaSource, /offen \{fmtCurrency\(p\.erloesOffen\)\}/);
    assert.match(nakaSource, /noch offen: \{fmtCurrency\(autoCalc\.erloese\.offen\)\}/);
  });

  it("keeps the HAPAK data contract explicit and uses FIBU for project finances", () => {
    const contract = fs.readFileSync(path.resolve("docs/hapak-data-contract.md"), "utf8");
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");
    const projectsSource = fs.readFileSync(path.resolve("client/src/pages/projects.tsx"), "utf8");
    const financeRoute = routesSource.slice(
      routesSource.indexOf('app.get("/api/project-finance-summary/:projectId"'),
      routesSource.indexOf('app.get("/api/documents"'),
    );
    const projectFinanceClient = projectsSource.slice(
      projectsSource.indexOf("const { data: projectFinance }"),
      projectsSource.indexOf("const { data: ertragEmployees }"),
    );

    assert.match(contract, /Projektfinanzen duerfen nicht aus `documents\.net_total`/);
    assert.match(contract, /FIBUZWO.*fibu_buchungen/);
    assert.match(contract, /KTR = projects\.cost_center\/import_source_key/);
    assert.match(contract, /Jumbos sind keine pauschalen Positionen/);

    assert.match(financeRoute, /FROM fibu_buchungen/);
    assert.match(financeRoute, /project\.cost_center/);
    assert.match(financeRoute, /project\.import_source_key/);
    assert.match(financeRoute, /AND idx = 0/);
    assert.match(financeRoute, /AND stornoflag != 2/);
    assert.match(financeRoute, /AND ktr = ANY\(\$2::text\[\]\)/);
    assert.doesNotMatch(financeRoute, /FROM documents/);

    assert.match(projectFinanceClient, /\/api\/project-finance-summary\/\$\{selectedProject\.id\}/);
    assert.match(projectFinanceClient, /projectFinance\?\.outgoing\.netto/);
    assert.match(projectFinanceClient, /projectFinance\?\.incoming\.netto/);
    assert.match(projectsSource, /financeSummary=\{projectFinance\}/);
    assert.doesNotMatch(projectFinanceClient, /parseFloat\(d\.netTotal/);
    assert.doesNotMatch(projectFinanceClient, /parentDocumentId/);
  });

  it("bases dashboard finance widgets on outgoing invoice ledger main rows", () => {
    const storageSource = fs.readFileSync(path.resolve("server/storage.ts"), "utf8");
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");
    const dashboardStats = storageSource.slice(
      storageSource.indexOf("async getDashboardStats()"),
      storageSource.indexOf("async getRevenueByRange"),
    );
    const revenueRange = storageSource.slice(
      storageSource.indexOf("async getRevenueByRange"),
      storageSource.indexOf("async getBwaReports"),
    );
    const recentActivityRoute = routesSource.slice(
      routesSource.indexOf('app.get("/api/dashboard/recent-activity"'),
      routesSource.indexOf('app.get("/api/dashboard/revenue-chart"'),
    );

    assert.match(dashboardStats, /FROM fibu_buchungen f\s+INNER JOIN documents d ON d\.id = f\.document_id/);
    assert.match(dashboardStats, /f\.art = 'RA' AND f\.idx = 0/);
    assert.match(dashboardStats, /f\.bezahlflag != 2/);
    assert.match(dashboardStats, /\$\{FIBU_OPEN_AMOUNT_SQL\} as open_amount/);
    assert.match(dashboardStats, /AND \$\{FIBU_OPEN_AMOUNT_SQL\} > 0\.01/);
    assert.doesNotMatch(dashboardStats, /f\.betrag::numeric\s*-\s*COALESCE\(f\.zahlung/);
    assert.doesNotMatch(dashboardStats, /UNION ALL\s+SELECT d\.id/);

    assert.match(revenueRange, /FROM fibu_buchungen f/);
    assert.match(revenueRange, /f\.art = 'RA' AND f\.idx = 0 AND f\.stornoflag != 2/);
    assert.doesNotMatch(revenueRange, /FROM documents d/);

    assert.match(recentActivityRoute, /FROM fibu_buchungen f/);
    assert.match(recentActivityRoute, /JOIN documents d ON d\.id = f\.document_id/);
    assert.match(recentActivityRoute, /f\.faelligdat as "validUntil"/);
    assert.match(recentActivityRoute, /f\.bezahlflag != 2/);
    assert.match(recentActivityRoute, /\$\{FIBU_OPEN_AMOUNT_SQL\}::float as "openAmount"/);
    assert.doesNotMatch(recentActivityRoute, /d\.status NOT IN \('entwurf','storniert','bezahlt'\)/);
  });

  it("bases dashboard incoming invoice widgets on RE ledger rows", () => {
    const storageSource = fs.readFileSync(path.resolve("server/storage.ts"), "utf8");
    const dashboardStats = storageSource.slice(
      storageSource.indexOf("async getDashboardStats()"),
      storageSource.indexOf("async getRevenueByRange"),
    );

    assert.match(dashboardStats, /WHERE f\.art = 'RE' AND f\.idx = 0/);
    assert.match(dashboardStats, /f\.stornoflag != 2 AND f\.bezahlflag != 2/);
    assert.match(dashboardStats, /\$\{FIBU_OPEN_AMOUNT_SQL\} as open_amt/);
    assert.match(dashboardStats, /FROM incoming_invoices ii/);
    assert.match(dashboardStats, /NOT EXISTS \(SELECT 1 FROM fibu_buchungen f3 WHERE f3\.rnr = ii\.invoice_number AND f3\.art = 'RE' AND f3\.idx = 0\)/);
    assert.doesNotMatch(dashboardStats, /f\.art = 'ER'/);
    assert.doesNotMatch(dashboardStats, /f3\.art = 'ER'/);
  });

  it("bases customer finance summary on outgoing invoice ledger main rows", () => {
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");
    const customerRelatedRoute = routesSource.slice(
      routesSource.indexOf('app.get("/api/customers/:id/related"'),
      routesSource.indexOf('app.get("/api/customers/:id/contacts"'),
    );

    assert.match(customerRelatedRoute, /COALESCE\(fibu_zahlung::float, paid_amount::float, 0\) as "paidAmount"/);
    assert.match(customerRelatedRoute, /FROM fibu_buchungen f/);
    assert.match(customerRelatedRoute, /JOIN documents d ON d\.id = f\.document_id/);
    assert.match(customerRelatedRoute, /f\.art = 'RA' AND f\.idx = 0 AND f\.stornoflag != 2/);
    assert.match(customerRelatedRoute, /COUNT\(\*\) FILTER \(WHERE f\.typ = 'HR'\)::int as "anzRechnungen"/);
    assert.match(customerRelatedRoute, /COALESCE\(SUM\(CASE WHEN f\.typ = 'HR' THEN f\.betrag::numeric ELSE 0 END\), 0\)::float as "umsatzBrutto"/);
    assert.match(customerRelatedRoute, /f\.bezahlflag != 2/);
    assert.match(customerRelatedRoute, /AND \$\{FIBU_OPEN_AMOUNT_SQL\} > 0\.01/);
    assert.doesNotMatch(customerRelatedRoute, /COUNT\(\*\) FILTER \(WHERE type IN \('rechnung','schlussrechnung'\)\)/);
  });

  it("shows supplier incoming invoices from RE ledger rows before manual drafts", () => {
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");
    const customerRelatedRoute = routesSource.slice(
      routesSource.indexOf('app.get("/api/customers/:id/related"'),
      routesSource.indexOf('app.get("/api/customers/:id/contacts"'),
    );
    const customerSource = fs.readFileSync(path.resolve("client/src/pages/customers.tsx"), "utf8");

    assert.match(customerRelatedRoute, /fibu_incoming AS/);
    assert.match(customerRelatedRoute, /FROM fibu_buchungen f/);
    assert.match(customerRelatedRoute, /WHERE f\.art = 'RE' AND f\.idx = 0 AND f\.stornoflag != 2/);
    assert.match(customerRelatedRoute, /manual_incoming AS/);
    assert.match(customerRelatedRoute, /FROM incoming_invoices ii/);
    assert.match(customerRelatedRoute, /NOT EXISTS \(/);
    assert.match(customerRelatedRoute, /'fibu' as source/);
    assert.match(customerRelatedRoute, /'manual' as source/);

    assert.match(customerSource, /Rechnungseingang \(\{related!\.incomingInvoices\.length\}\)/);
    assert.match(customerSource, /link-incoming-\$\{inv\.source \|\| "manual"\}-\$\{inv\.id\}/);
    assert.match(customerSource, /inv\.source === "fibu" \? "RE" : "MAN"/);
  });

  it("transfers manual incoming invoices into RE ledger rows", () => {
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");
    const incomingRoute = routesSource.slice(
      routesSource.indexOf('app.get("/api/incoming-invoices"'),
      routesSource.indexOf('app.get("/api/incoming-invoices-fibu"'),
    );
    const clientSource = fs.readFileSync(path.resolve("client/src/pages/rechnungseingang.tsx"), "utf8");

    assert.match(incomingRoute, /registered_re_id/);
    assert.match(incomingRoute, /app\.post\("\/api\/incoming-invoices\/:id\/register-fibu"/);
    assert.match(incomingRoute, /FOR UPDATE/);
    assert.match(incomingRoute, /f\.art = 'RE' AND f\.idx = 0 AND f\.stornoflag != 2/);
    assert.match(incomingRoute, /INSERT INTO fibu_buchungen/);
    assert.match(incomingRoute, /'RE', \$4, 100/);
    assert.match(incomingRoute, /konto_b, konto_g/);
    assert.match(incomingRoute, /document_id/);
    assert.match(incomingRoute, /'ZA', 130/);
    assert.match(incomingRoute, /UPDATE incoming_invoices/);

    assert.match(clientSource, /type ManualIncomingInvoice = IncomingInvoice/);
    assert.match(clientSource, /registeredReId/);
    assert.match(clientSource, /button-register-manual-incoming-fibu/);
    assert.match(clientSource, /\/api\/incoming-invoices\/\$\{invoice\.id\}\/register-fibu/);
    assert.match(clientSource, /queryClient\.invalidateQueries\(\{ queryKey: \["\/api\/incoming-invoices-fibu"\] \}\)/);
    assert.match(clientSource, /setActiveTab\("fibu"\)/);
  });

  it("keeps payments for registered manual incoming invoices in the FIBU ledger", () => {
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");
    const incomingRoute = routesSource.slice(
      routesSource.indexOf('app.patch("/api/incoming-invoices/:id"'),
      routesSource.indexOf('app.delete("/api/incoming-invoices/:id"'),
    );
    const clientSource = fs.readFileSync(path.resolve("client/src/pages/rechnungseingang.tsx"), "utf8");

    assert.match(incomingRoute, /const registeredFibu = await pool\.query/);
    assert.match(incomingRoute, /WHERE art = 'RE' AND idx = 0 AND stornoflag != 2/);
    assert.match(incomingRoute, /const touchesPaymentState = body\.paidAmount !== undefined \|\| body\.paidDate !== undefined \|\| body\.status !== undefined/);
    assert.match(incomingRoute, /return res\.status\(409\)\.json/);
    assert.match(incomingRoute, /Zahlungen bitte ueber die FIBU-Buchung erfassen/);

    assert.match(clientSource, /button-pay-detail-fibu/);
    assert.match(clientSource, /Zahlung in FIBU buchen/);
    assert.match(clientSource, /!registeredReId && effStatus !== "bezahlt"/);
  });

  it("links manual incoming invoice attachments to the created FIBU row", () => {
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");
    const registerStart = routesSource.indexOf('app.post("/api/incoming-invoices/:id/register-fibu"');
    const registerRoute = routesSource.slice(
      registerStart,
      routesSource.indexOf('app.get("/api/incoming-invoices-fibu"', registerStart),
    );

    assert.match(registerRoute, /UPDATE document_attachments/);
    assert.match(registerRoute, /SET fibu_re_id = \$1/);
    assert.match(registerRoute, /WHERE incoming_invoice_id = \$2/);
    assert.match(registerRoute, /AND status = 'active'/);
    assert.match(registerRoute, /AND fibu_re_id IS NULL/);
    assert.match(registerRoute, /duplicate\.rows\[0\]\.re_id/);
    assert.match(registerRoute, /\[reId, invoiceId\]/);
  });

  it("stores uploaded incoming invoice files in the generic attachment ledger", () => {
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");
    const uploadRoute = routesSource.slice(
      routesSource.indexOf('app.post("/api/incoming-invoices/upload"'),
      routesSource.indexOf('app.get("/api/incoming-invoices/:id/pdf"'),
    );
    const attachmentFileRoute = routesSource.slice(
      routesSource.indexOf('app.get("/api/document-attachments/:id/file"'),
      routesSource.indexOf('app.get("/api/incoming-invoices/:id/pdf"'),
    );

    assert.match(uploadRoute, /storage\.createDocumentAttachment/);
    assert.match(uploadRoute, /targetType: "incoming_invoice"/);
    assert.match(uploadRoute, /incomingInvoiceId: invoice\.id/);
    assert.match(uploadRoute, /source: "manual_upload"/);
    assert.match(uploadRoute, /createHash\("sha256"\)\.update\(fileBuffer\)\.digest\("hex"\)/);
    assert.match(uploadRoute, /app\.get\("\/api\/incoming-invoices\/:id\/attachments"/);
    assert.match(uploadRoute, /storage\.getDocumentAttachments\(\{ incomingInvoiceId: invoiceId \}\)/);
    assert.match(uploadRoute, /app\.get\("\/api\/fibu\/:reId\/attachments"/);
    assert.match(uploadRoute, /storage\.getDocumentAttachments\(\{ fibuReId: reId \}\)/);

    assert.match(attachmentFileRoute, /FROM document_attachments/);
    assert.match(attachmentFileRoute, /resolveUploadPath\(uploadsDir, safeName\)/);
    assert.match(attachmentFileRoute, /safeDispositionFilename/);
    assert.doesNotMatch(attachmentFileRoute, /path\.join\(uploadsDir, attachment\.file_path\)/);
  });

  it("storniert FIBU main rows instead of physically deleting the ledger", () => {
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");
    const firstDeleteStart = routesSource.indexOf('app.delete("/api/fibu/:reId"');
    const secondDeleteStart = routesSource.indexOf('app.delete("/api/fibu/:reId"', firstDeleteStart + 1);
    const firstFibuDelete = routesSource.slice(firstDeleteStart, routesSource.indexOf('app.post("/api/fibu/:reId/payment"', firstDeleteStart));
    const smokeScript = fs.readFileSync(path.resolve("scripts/smoke-incoming-fibu.mjs"), "utf8");

    assert.ok(firstDeleteStart >= 0);
    assert.equal(secondDeleteStart, -1);
    assert.match(firstFibuDelete, /FOR UPDATE/);
    assert.match(firstFibuDelete, /SET stornoflag = 2/);
    assert.match(firstFibuDelete, /stornodat = CURRENT_DATE/);
    assert.match(firstFibuDelete, /offen = CASE WHEN idx = 0 THEN 0 ELSE offen END/);
    assert.match(firstFibuDelete, /UPDATE documents[\s\S]*status = 'storniert'/);
    assert.match(firstFibuDelete, /UPDATE incoming_invoices[\s\S]*status = 'storniert'/);
    assert.doesNotMatch(firstFibuDelete, /DELETE FROM fibu_buchungen WHERE re_id = \$1/);
    assert.doesNotMatch(firstFibuDelete, /storage\.deleteDocument/);
    assert.doesNotMatch(routesSource, /__disabled-fibu-hard-delete/);
    assert.match(smokeScript, /FIBU-Testbeleg stornieren/);
    assert.match(smokeScript, /stornoflag !== 2/);
  });

  it("blocks payment edits and verrechnungen on storniert ledger rows", () => {
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");
    const syncRoute = routesSource.slice(
      routesSource.indexOf("async function syncDocumentFinanceFromFibu"),
      routesSource.indexOf("async function syncDunningToFibu"),
    );
    const deletePaymentRoute = routesSource.slice(
      routesSource.indexOf('app.delete("/api/fibu/:reId/payment/:paymentId"'),
      routesSource.indexOf('app.patch("/api/fibu/:reId/payment/:paymentId"'),
    );
    const patchPaymentRoute = routesSource.slice(
      routesSource.indexOf('app.patch("/api/fibu/:reId/payment/:paymentId"'),
      routesSource.indexOf('app.get("/api/fibu/:reId/verrechnbare"'),
    );
    const verrechnbareRoute = routesSource.slice(
      routesSource.indexOf('app.get("/api/fibu/:reId/verrechnbare"'),
      routesSource.indexOf('app.post("/api/fibu/:reId/verrechnung"'),
    );
    const verrechnungRoute = routesSource.slice(
      routesSource.indexOf('app.post("/api/fibu/:reId/verrechnung"'),
      routesSource.indexOf('app.get("/api/fibu/konten"'),
    );

    assert.match(syncRoute, /WHERE re_id = \$1 AND idx = 0 AND art = 'RA' AND stornoflag != 2/);

    assert.match(deletePaymentRoute, /konto_b as "kontoB", konto_g as "kontoG", stornoflag/);
    assert.match(deletePaymentRoute, /if \(h\.stornoflag === 2\)/);
    assert.match(deletePaymentRoute, /Zahlungen stornierter Rechnungen koennen nicht geloescht werden/);

    assert.match(patchPaymentRoute, /FROM fibu_buchungen WHERE re_id = \$1 AND idx = 0\s+FOR UPDATE/);
    assert.match(patchPaymentRoute, /if \(h\.stornoflag === 2\)/);
    assert.match(patchPaymentRoute, /Zahlungen stornierter Rechnungen koennen nicht bearbeitet werden/);

    assert.match(verrechnbareRoute, /WHERE re_id = \$1 AND idx = 0 AND stornoflag != 2/);
    assert.match(verrechnungRoute, /bezahlflag, stornoflag/);
    assert.match(verrechnungRoute, /if \(src\.stornoflag === 2 \|\| dst\.stornoflag === 2\)/);
    assert.match(verrechnungRoute, /Stornierte Buchungen koennen nicht verrechnet werden/);
  });

  it("keeps legacy payment and generic patch routes from bypassing the ledger", () => {
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");
    const documentSaveRoutes = routesSource.slice(
      routesSource.indexOf("function stripDocumentFinanceFields"),
      routesSource.indexOf("async function saveDocumentItemsBulk"),
    );
    const fibuPatchRoute = routesSource.slice(
      routesSource.indexOf('app.patch("/api/fibu/:reId"'),
      routesSource.indexOf('app.delete("/api/fibu/:reId"'),
    );
    const legacyPaymentRoute = routesSource.slice(
      routesSource.indexOf('app.post("/api/payments"'),
      routesSource.indexOf('app.get("/api/dunning/:documentId/pdf"'),
    );

    assert.match(documentSaveRoutes, /stripDocumentFinanceFields/);
    assert.match(documentSaveRoutes, /"paidAmount"/);
    assert.match(documentSaveRoutes, /"fibuZahlung"/);
    assert.match(documentSaveRoutes, /stripDocumentFinanceFields\(body\)/);

    assert.match(fibuPatchRoute, /FOR UPDATE/);
    assert.match(fibuPatchRoute, /if \(check\.rows\[0\]\.stornoflag === 2\)/);
    assert.match(fibuPatchRoute, /Keine erlaubten Aenderungen/);
    assert.doesNotMatch(fibuPatchRoute, /netto: "netto"/);
    assert.doesNotMatch(fibuPatchRoute, /brutto: "brutto"/);
    assert.doesNotMatch(fibuPatchRoute, /betrag: "betrag"/);
    assert.doesNotMatch(fibuPatchRoute, /skBetrag: "sk_betrag"/);
    assert.doesNotMatch(fibuPatchRoute, /minderung: "minderung"/);

    assert.match(legacyPaymentRoute, /FROM fibu_buchungen/);
    assert.match(legacyPaymentRoute, /WHERE art = 'RA' AND idx = 0 AND \(document_id = \$1 OR rnr = \$2\)/);
    assert.match(legacyPaymentRoute, /return res\.status\(409\)\.json/);
    assert.match(legacyPaymentRoute, /Zahlungen fuer registrierte Rechnungen bitte ueber die FIBU-Buchung erfassen/);
    assert.doesNotMatch(legacyPaymentRoute, /fibuByDocNr/);
  });

  it("keeps invoice register statistics from falling back to document totals", () => {
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");
    const statisticsRoute = routesSource.slice(
      routesSource.indexOf('app.get("/api/fibu/statistics"'),
      routesSource.indexOf('app.get("/api/outgoing-invoices-fibu"'),
    );

    assert.match(statisticsRoute, /FROM fibu_buchungen f/);
    assert.match(statisticsRoute, /f\.art = \$1 AND f\.idx = 0 AND f\.typ = 'HR'/);
    assert.match(statisticsRoute, /f\.stornoflag != 2/);
    assert.match(statisticsRoute, /gutschriften: gutschriften\.rows\[0\]/);
    assert.doesNotMatch(statisticsRoute, /const docTotals/);
    assert.doesNotMatch(statisticsRoute, /FROM documents d/);
    assert.doesNotMatch(statisticsRoute, /d\.fibu_netto/);
  });
});

describe("bwa page UX guards", () => {
  it("uses an app dialog instead of native confirm for deleting BWA reports", () => {
    const source = fs.readFileSync(path.resolve("client/src/pages/bwa.tsx"), "utf8");
    assert.equal(source.includes("confirm("), false);
    assert.match(source, /data-testid="dialog-delete-bwa"/);
    assert.match(source, /data-testid="button-confirm-delete-bwa"/);
  });
});

describe("disposition page UX guards", () => {
  it("uses an app dialog instead of native confirm for deleting dispositions", () => {
    const source = fs.readFileSync(path.resolve("client/src/pages/disposition.tsx"), "utf8");
    assert.equal(source.includes("confirm("), false);
    assert.match(source, /data-testid="dialog-delete-disposition"/);
    assert.match(source, /data-testid="button-confirm-delete-disposition"/);
  });
});

describe("customer page UX guards", () => {
  it("uses app dialogs instead of native confirm for customer actions", () => {
    const source = fs.readFileSync(path.resolve("client/src/pages/customers.tsx"), "utf8");
    assert.equal(source.includes("confirm("), false);
    assert.match(source, /data-testid="dialog-delete-contact-person"/);
    assert.match(source, /data-testid="dialog-convert-customer"/);
    assert.match(source, /data-testid="dialog-delete-customer"/);
  });
});

describe("employee page UX guards", () => {
  it("uses an app dialog instead of native confirm for deleting employees", () => {
    const source = fs.readFileSync(path.resolve("client/src/pages/mitarbeiter.tsx"), "utf8");
    assert.equal(source.includes("confirm("), false);
    assert.match(source, /data-testid="dialog-delete-employee"/);
    assert.match(source, /data-testid="button-confirm-delete-employee"/);
  });
});

describe("incoming invoice page UX guards", () => {
  it("uses an app dialog instead of native confirm for deleting manual incoming invoices", () => {
    const source = fs.readFileSync(path.resolve("client/src/pages/rechnungseingang.tsx"), "utf8");
    assert.equal(source.includes("confirm("), false);
    assert.match(source, /data-testid="dialog-delete-incoming-invoice"/);
    assert.match(source, /data-testid="button-confirm-delete-incoming-invoice"/);
  });

  it("shows uploaded incoming invoice attachments from the generic attachment ledger", () => {
    const source = fs.readFileSync(path.resolve("client/src/pages/rechnungseingang.tsx"), "utf8");

    assert.match(source, /interface DocumentAttachment/);
    assert.match(source, /\/api\/incoming-invoices\/\$\{invoice\.id\}\/attachments/);
    assert.match(source, /\/api\/document-attachments\/\$\{attachment\.id\}\/file/);
    assert.match(source, /data-testid="attachment-list"/);
    assert.match(source, /attachments\.length === 0/);
    assert.match(source, /\/api\/incoming-invoices\/\$\{invoice\.id\}\/pdf/);
  });

  it("shows imported FIBU incoming invoice attachments from the same attachment ledger", () => {
    const source = fs.readFileSync(path.resolve("client/src/pages/rechnungseingang.tsx"), "utf8");

    assert.match(source, /\/api\/fibu\/\$\{reId\}\/attachments/);
    assert.match(source, /data-testid="fibu-attachment-list"/);
    assert.match(source, /button-view-fibu-attachment-/);
    assert.match(source, /\/api\/document-attachments\/\$\{attachment\.id\}\/file/);
  });
});

describe("settings page UX guards", () => {
  it("uses app dialogs instead of native confirm for settings delete actions", () => {
    const source = fs.readFileSync(path.resolve("client/src/pages/settings.tsx"), "utf8");
    assert.equal(source.includes("confirm("), false);
    assert.match(source, /function ConfirmDeleteDialog/);
    assert.match(source, /testIdBase="bank-account"/);
    assert.match(source, /testIdBase="user"/);
    assert.match(source, /testIdBase="unit"/);
    assert.match(source, /testIdBase="trade"/);
  });
});

describe("document tab UX guards", () => {
  it("uses an app dialog instead of native confirm for closing dirty document tabs", () => {
    const source = fs.readFileSync(path.resolve("client/src/lib/document-tabs.tsx"), "utf8");
    assert.equal(source.includes("confirm("), false);
    assert.match(source, /data-testid="dialog-close-dirty-document-tab"/);
    assert.match(source, /data-testid="button-confirm-close-dirty-document-tab"/);
  });
});

describe("designer UX guards", () => {
  it("uses an app dialog instead of native confirm for deleting form fields", () => {
    const source = fs.readFileSync(path.resolve("client/src/pages/designer.tsx"), "utf8");
    assert.equal(source.includes("confirm("), false);
    assert.match(source, /data-testid="dialog-delete-form-field"/);
    assert.match(source, /data-testid="button-confirm-delete-form-field"/);
  });
});

describe("encoding UX guards", () => {
  it("keeps common mojibake fragments out of client and smoke source text", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
    };
    walk(path.resolve("client/src"));
    files.push(
      path.resolve("scripts/smoke-browser.mjs"),
      path.resolve("scripts/smoke-local.mjs"),
      path.resolve("scripts/smoke-incoming-fibu.mjs"),
    );

    const mojibakeFragments = [
      "\u00c3",
      "\u00c2",
      "\u00e2",
      "\u00f0",
      "\u0178",
    ];

    const offenders = files.flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      return mojibakeFragments.some((fragment) => source.includes(fragment))
        ? [path.relative(path.resolve("."), file)]
        : [];
    });

    assert.deepEqual(offenders, []);
  });

  it("keeps the IDS dialog focused on the working cart import", () => {
    const source = fs.readFileSync(
      path.resolve("client/src/pages/document-editor/components/dialogs/ids-connect-dialog.tsx"),
      "utf8",
    );

    assert.match(source, /Warenkorb importieren/);
    assert.match(source, /GC-Online-Shop oeffnen/);
    assert.doesNotMatch(source, /Artikel suchen|Direktsuche|in Entwicklung|searchTerm|setTab|tab ===/);
  });
});

describe("browser smoke workflow", () => {
  it("keeps a real browser smoke script wired into package scripts", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
    const smokeScript = fs.readFileSync(path.resolve("scripts/smoke-browser.mjs"), "utf8");

    assert.equal(packageJson.scripts["smoke:browser"], "node scripts/smoke-browser.mjs");
    assert.match(smokeScript, /puppeteer-core/);
    assert.match(smokeScript, /document editor/);
    assert.match(smokeScript, /assertNewDocumentTypeWorkflow/);
    assert.match(smokeScript, /assertNewDocumentSaveRoundtrip/);
    assert.match(smokeScript, /save\/reload roundtrip/);
    assert.match(smokeScript, /new document save roundtrip: PDF fuer \$\{type\} ungueltig/);
    assert.match(smokeScript, /ok new \$\{type\} pdf export/);
    assert.match(smokeScript, /menu-new-document-\$\{type\}/);
    assert.match(smokeScript, /"angebot"/);
    assert.match(smokeScript, /"rechnung"/);
    assert.match(smokeScript, /"lieferschein"/);
    assert.match(smokeScript, /freies_dokument/);
    assert.match(smokeScript, /assertExistingDocumentPdf/);
    assert.match(smokeScript, /assertImportedHapakDocumentVisualGuards/);
    assert.match(smokeScript, /26-00100/);
    assert.match(smokeScript, /sichtbarer Anhängen-Text/);
    assert.match(smokeScript, /importPositionRow/);
    assert.ok(smokeScript.includes("hasManualNumber: /(^|[^\\d])8\\.4([^\\d]|$)/.test(importPositionRow)"));
    assert.ok(smokeScript.includes("hasWrongRenumberedManualPosition: /(^|[^\\d])1\\.4([^\\d]|$)/.test(importPositionRow)"));
    assert.match(smokeScript, /button-collapse-all/);
    assert.match(smokeScript, /button-expand-all/);
    assert.match(smokeScript, /darin enthalten:/);
    assert.match(smokeScript, /assertImportedHapakInvoiceVisualGuards/);
    assert.match(smokeScript, /2-fach Schukosteckdose/);
    assert.match(smokeScript, /Fremdleistungsanteil aus HAPAK-JUMBO/);
    assert.match(smokeScript, /hasBrokenTitleSumText/);
    assert.match(smokeScript, /rightDelta > 2/);
    assert.match(smokeScript, /pageOverflowDeltas\.some\(\(delta\) => delta > 1\)/);
    assert.match(smokeScript, /document-work-surface/);
    assert.match(smokeScript, /workSurfaceOverflowX !== "hidden"/);
    assert.match(smokeScript, /workSurfaceHasVisibleHorizontalScrollbar/);
    assert.match(smokeScript, /titleSumLooksLikeLink/);
    assert.match(smokeScript, /btn-titelsumme-detail-/);
    assert.match(smokeScript, /hover:underline/);
    assert.match(smokeScript, /skonto-hint-amount-/);
    assert.match(smokeScript, /firstDocument\.id/);
    assert.match(smokeScript, /pdf basis-dokument/);
    assert.match(smokeScript, /application\/pdf/);
    assert.match(smokeScript, /withTemporaryEditorDocument/);
    assert.match(smokeScript, /temporary editor document/);
    assert.match(smokeScript, /fetch\(`\/api\/documents\/\$\{id\}`,\s*\{ method: "DELETE"/);
    assert.doesNotMatch(smokeScript, /const firstDocumentId = await getFirstDocumentId/);
    assert.match(smokeScript, /assertEditorTextCellEditable/);
    assert.match(smokeScript, /assertQuantityInputAcceptsGermanDecimal/);
    assert.match(smokeScript, /assertDisplayModeMenu/);
    assert.match(smokeScript, /menu-display-ohne-preise/);
    assert.match(smokeScript, /assertFreeTextMultilineEditing/);
    assert.match(smokeScript, /assertFreeJumboWorkflow/);
    assert.match(smokeScript, /toolbar-add-jumbo-frei/);
    assert.match(smokeScript, /const jumboRowsBefore = await page\.\$\$eval/);
    assert.match(smokeScript, /const known = new Set\(knownJumboRows\)/);
    assert.match(smokeScript, /const parentRow = document\.querySelector\(`\[data-row="\$\{parentIndex\}"\]`\)/);
    assert.match(smokeScript, /Plus-Menue der Jumbo-Zeile/);
    assert.match(smokeScript, /const childRow = document\.querySelector\(`\[data-row="\$\{childIndex\}"\]`\)/);
    assert.match(smokeScript, /Preisbutton der Kindzeile/);
    assert.match(smokeScript, /jumbo-menu-manuell/);
    assert.match(smokeScript, /assertManualToolbarWorkflow/);
    assert.match(smokeScript, /toolbar-add-manuell-material/);
    assert.match(smokeScript, /manual toolbar inserts typed manual positions/);
    assert.match(smokeScript, /kalk-pauschal-price/);
    assert.match(smokeScript, /123,45/);
    assert.match(smokeScript, /\/api\/projects\/\$\{projectId\}\/document-tree/);
    assert.match(smokeScript, /Dokument fehlt im Projektbaum/);
    assert.match(smokeScript, /assertDocumentConversionProjectTree/);
    assert.match(smokeScript, /\/api\/documents\/\$\{sourceDocument\.id\}\/convert/);
    assert.match(smokeScript, /Umgewandeltes Dokument fehlt im Projektbaum/);
    assert.match(smokeScript, /minimumVisibleHeight/);
    assert.match(smokeScript, /assertNoRuntimeOverlay/);
  });

  it("keeps the local smoke test checking the document PDF export", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
    const smokeScript = fs.readFileSync(path.resolve("scripts/smoke-local.mjs"), "utf8");
    const pdfGeneratorSource = fs.readFileSync(path.resolve("server/pdf-generator-v2.ts"), "utf8");

    assert.equal(packageJson.scripts["smoke:local"], "node scripts/smoke-local.mjs");
    assert.match(smokeScript, /getSetCookie/);
    assert.doesNotMatch(smokeScript, /setCookie\.split\(","\)/);
    assert.match(smokeScript, /firstDocument\.id/);
    assert.match(smokeScript, /pdf basis-dokument/);
    assert.match(smokeScript, /assertImportedHapakInvoiceRegression/);
    assert.match(smokeScript, /26-00058/);
    assert.match(smokeScript, /Lohnanteil aus HAPAK-JUMBO/);
    assert.match(smokeScript, /positionFlag === "jumbo_lohn"/);
    assert.match(smokeScript, /pdf rechnung 26-00058/);
    assert.match(smokeScript, /assertImportedHapakManualNumberingRegression/);
    assert.match(smokeScript, /26-00100/);
    assert.match(smokeScript, /autoPositionNumbers !== false/);
    assert.match(smokeScript, /positionNumber === "8\.4"/);
    assert.match(smokeScript, /externalCost\) !== "75\.00"/);
    assert.match(smokeScript, /externalMarkup\) !== "30\.00"/);
    assert.match(smokeScript, /application\/pdf/);
    assert.match(smokeScript, /%PDF-/);
    assert.match(smokeScript, /pdfBuffer\.byteLength < 1_000/);
    assert.match(pdfGeneratorSource, /function findBrowserExecutable/);
    assert.match(pdfGeneratorSource, /PUPPETEER_EXECUTABLE_PATH/);
    assert.match(pdfGeneratorSource, /Microsoft\\\\Edge/);
  });

  it("keeps the incoming-invoice to FIBU smoke test wired", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
    const smokeScript = fs.readFileSync(path.resolve("scripts/smoke-incoming-fibu.mjs"), "utf8");

    assert.equal(packageJson.scripts["smoke:incoming-fibu"], "node scripts/smoke-incoming-fibu.mjs");
    assert.match(smokeScript, /getSetCookie/);
    assert.doesNotMatch(smokeScript, /setCookie\.split\(","\)/);
    assert.match(smokeScript, /\/api\/incoming-invoices\/\$\{incomingId\}\/register-fibu/);
    assert.match(smokeScript, /blockedPayment\.status !== 409/);
    assert.match(smokeScript, /SELECT re_id, art, typ, rnr, adr_such, konto_b, konto_g/);
    assert.match(smokeScript, /DELETE FROM fibu_buchungen WHERE re_id = \$1/);
    assert.match(smokeScript, /DELETE FROM incoming_invoices WHERE id = \$1/);
  });

  it("keeps a one-command local smoke runner wired", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
    const smokeRunner = fs.readFileSync(path.resolve("scripts/smoke-with-server.ps1"), "utf8");

    assert.equal(
      packageJson.scripts["smoke:with-server"],
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke-with-server.ps1",
    );
    assert.match(smokeRunner, /Start-Job/);
    assert.match(smokeRunner, /\/api\/health/);
    assert.match(smokeRunner, /npm run smoke:incoming-fibu/);
    assert.match(smokeRunner, /npm run smoke:local/);
    assert.match(smokeRunner, /npm run smoke:browser/);
    assert.match(smokeRunner, /Stop-Job/);
  });

  it("keeps a one-command local app starter wired", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
    const starter = fs.readFileSync(path.resolve("scripts/ensure-dev-server.ps1"), "utf8");

    assert.equal(
      packageJson.scripts["app:up"],
      "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ensure-dev-server.ps1",
    );
    assert.match(starter, /\/api\/health/);
    assert.match(starter, /Remove-Item -LiteralPath \$logPath -Force -ErrorAction SilentlyContinue/);
    assert.match(starter, /Remove-Item -LiteralPath \$errorLogPath -Force -ErrorAction SilentlyContinue/);
    assert.match(starter, /codex-primary-runtime\\dependencies\\node\\bin\\node\.exe/);
    assert.match(starter, /Get-Command node/);
    assert.match(starter, /Start-Process/);
    assert.match(starter, /-ArgumentList @\("node_modules\/tsx\/dist\/cli\.mjs", "server\/index\.ts"\)/);
    assert.match(starter, /-WindowStyle Hidden/);
    assert.match(starter, /-RedirectStandardOutput \$logPath/);
    assert.match(starter, /-RedirectStandardError \$errorLogPath/);
    assert.match(starter, /FRISTD_DEV_LOG/);
    assert.match(starter, /Exitcode: \$\(\$process\.ExitCode\)/);
    assert.match(starter, /Get-Content -LiteralPath \$logPath -Encoding utf8 -Tail 120/);
    assert.match(starter, /Get-Content -LiteralPath \$errorLogPath -Encoding utf8 -Tail 120/);
    assert.match(starter, /FriStD-Bau ERP gestartet/);
  });

  it("keeps local development startup pinned to a modern bundled Node and a real health route", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
    const startCmd = fs.readFileSync(path.resolve("scripts/start-dev-node24.cmd"), "utf8");
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");

    assert.equal(packageJson.scripts["dev:node24"], "scripts\\start-dev-node24.cmd");
    assert.match(startCmd, /codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node\.exe/);
    assert.match(startCmd, /node_modules\\tsx\\dist\\cli\.mjs/);
    assert.match(startCmd, /server\\index\.ts/);
    assert.match(routesSource, /app\.get\("\/api\/health"/);
    assert.match(routesSource, /service: "fristd-bau-erp"/);
  });

  it("allows PDF rendering to load protected uploaded template images only with a print asset token", () => {
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");
    const pdfGeneratorSource = fs.readFileSync(path.resolve("server/pdf-generator-v2.ts"), "utf8");

    assert.match(pdfGeneratorSource, /const printAssetTokens = new Map/);
    assert.match(pdfGeneratorSource, /function createPrintAssetToken/);
    assert.match(pdfGeneratorSource, /isPrintAssetTokenValid/);
    assert.match(pdfGeneratorSource, /printAssetToken/);
    assert.match(pdfGeneratorSource, /\/api\/uploads\//);
    assert.match(routesSource, /isPrintAssetTokenValid/);
    assert.match(routesSource, /hasSessionAccess/);
    assert.match(routesSource, /hasPrintAccess/);
    assert.match(routesSource, /Nicht angemeldet/);
  });
});

describe("hapak import analysis", () => {
  it("plans deterministic HAPAK attachment matches before importing files", () => {
    const match = planHapakAttachmentMatch(
      {
        reId: 260123,
        idx: 0,
        rnr: "RE-2026-44",
        adrNr: "70123",
        adrSuch: "Muster Lieferant",
        belegdat: "2026-03-14",
        betrag: "1.234,56",
        ktr: "26-0001",
      },
      {
        relativePath: "Belege/2026/RE-2026-44_Muster_Lieferant.pdf",
        rnr: "RE-2026-44",
        adrNr: "70123",
        belegdat: "2026-03-14",
        betrag: 1234.56,
        sha256: "abc123",
        size: 2048,
      },
    );

    assert.ok(match);
    assert.equal(match.confidence, "exact");
    assert.equal(match.fibuReId, 260123);
    assert.equal(match.fibuIdx, 0);
    assert.equal(match.importSource, "hapak");
    assert.equal(match.importSourceKey, "hapak:fibu:260123:0:Belege/2026/RE-2026-44_Muster_Lieferant.pdf");
    assert.equal(match.originalFilename, "RE-2026-44_Muster_Lieferant.pdf");
    assert.equal(match.sha256, "abc123");
    assert.deepEqual(match.evidence, ["rnr", "adrNr", "belegdat", "betrag"]);
  });

  it("rejects ambiguous HAPAK attachment candidates without a document-number match", () => {
    const match = planHapakAttachmentMatch(
      {
        reId: 260124,
        rnr: "RE-2026-45",
        adrSuch: "Muster Lieferant",
        belegdat: "2026-03-14",
        betrag: "1234.56",
      },
      {
        relativePath: "Belege/2026/unbenannter_scan.pdf",
        adrSuch: "Muster Lieferant",
      },
    );

    assert.equal(match, null);
  });

  it("keeps the 2026 HAPAK dry-run wired and read-only", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
    const source = fs.readFileSync(path.resolve("scripts/hapak-import-analysis-2026.ts"), "utf8");

    assert.equal(packageJson.scripts["hapak:analyze:2026"], "tsx scripts/hapak-import-analysis-2026.ts --year 2026");
    assert.match(source, /readonly: true/);
    assert.match(source, /DBFFile\.open/);
    assert.match(source, /encoding: "cp1252"/);
    assert.match(source, /readMode: "loose"/);
    assert.match(source, /ADRESSEN\.DBF/);
    assert.match(source, /DOKUMENT\.DBF/);
    assert.match(source, /FIBUZWO\.DBF/);
    assert.match(source, /LOHNBUCH\.DBF/);
    assert.match(source, /freeDocuments/);
    assert.match(source, /acceptedStandaloneFreeDocuments/);
    assert.match(source, /P7283433/);
    assert.match(source, /validStandalone/);
    assert.match(source, /likelyFolder/);
    assert.match(source, /missingTreeParents/);
    assert.match(source, /fibuWithoutDocument/);
    assert.match(source, /fibuWithoutDocumentIncoming/);
    assert.match(source, /fibuWithoutDocumentOutgoing/);
    assert.match(source, /incoming_fibu_without_document/);
    assert.match(source, /missingPositionFiles/);
    assert.match(source, /importPlan/);
    assert.match(source, /project_document_tree \+ documents\.parent_document_id/);
    assert.match(source, /fibu_buchungen \+ documents\.fibu_\*/);
    assert.match(source, /valueBelongsToNumberYear/);
    assert.equal(source.includes('new RegExp(`(^|\\\\D)${year2}-\\\\d{4,5}\\\\b`)'), true);
    assert.doesNotMatch(source, /includes\(`\$\{year2\}-`\)/);
    assert.doesNotMatch(source, /\["BELEGDAT", "RECHDAT", "ERFASSTDAT", "ZAHLDAT"\]/);

    assert.doesNotMatch(source, /\bINSERT\s+INTO\b/i);
    assert.doesNotMatch(source, /\bUPDATE\s+\w+/i);
    assert.doesNotMatch(source, /\bDELETE\s+FROM\b/i);
    assert.doesNotMatch(source, /\bTRUNCATE\b/i);
    assert.doesNotMatch(source, /new pg\.Pool/);
    assert.doesNotMatch(source, /DATABASE_URL/);
  });

  it("keeps NAS credentials out of source code", () => {
    const source = fs.readFileSync(path.resolve("server/nas-sync.ts"), "utf8");

    assert.match(source, /process\.env\.HAPAK_NAS_USER/);
    assert.match(source, /process\.env\.HAPAK_NAS_PASS/);
    assert.match(source, /NAS-Zugangsdaten fehlen/);
    assert.doesNotMatch(source, /Hapak_3000/);
    assert.doesNotMatch(source, /replit-invoice/);
  });

  it("keeps the 2026 HAPAK staging exporter read-only and mapped to target domains", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
    const source = fs.readFileSync(path.resolve("scripts/hapak-stage-2026.ts"), "utf8");

    assert.equal(packageJson.scripts["hapak:stage:2026"], "tsx scripts/hapak-stage-2026.ts --year 2026");
    assert.match(source, /readonly: true/);
    assert.match(source, /DBFFile\.open/);
    assert.match(source, /encoding: "cp1252"/);
    assert.match(source, /readMode: "loose"/);
    assert.match(source, /acceptedStandaloneFreeDocuments/);
    assert.match(source, /P7283433/);
    assert.match(source, /visibleDocumentNumber: humanDocumentNumber\(row\)/);
    assert.match(source, /documentNumber: humanDocumentNumber\(row\)/);
    assert.match(source, /importSourceKey: S\(row\.NAME\)/);
    assert.match(source, /duplicate_visible_document_number/);
    assert.match(source, /duplicate_document_import_key/);
    assert.match(source, /--map-positions/);
    assert.match(source, /--position-document/);
    assert.match(source, /--position-documents/);
    assert.match(source, /--position-batch-size/);
    assert.match(source, /--position-batch-index/);
    assert.match(source, /positionDocumentFilters/);
    assert.match(source, /positionBatchSize/);
    assert.match(source, /positionCandidateDocuments/);
    assert.match(source, /position_batch_empty/);
    assert.match(source, /mapPositionFile/);
    assert.match(source, /mapWithConcurrency/);
    assert.match(source, /parentSourceLine/);
    assert.match(source, /quantity !== 0 && unitPrice !== 0 \? quantity \* unitPrice : 0/);
    assert.match(source, /repairHapakMojibake/);
    assert.match(source, /isLikelyCorruptMemoFragment/);
    assert.match(source, /customers/);
    assert.match(source, /projects/);
    assert.match(source, /documents/);
    assert.match(source, /documentTree/);
    assert.match(source, /fibu/);
    assert.match(source, /fibuEntries/);
    assert.match(source, /fibuDetailEntries/);
    assert.match(source, /wages/);
    assert.match(source, /positions/);
    assert.match(source, /inspectPositions/);
    assert.match(source, /--inspect-positions/);
    assert.match(source, /positionFilesMissing/);
    assert.match(source, /positionItems/);
    assert.match(source, /positionMappedDocuments/);
    assert.match(source, /fibuIncoming/);
    assert.match(source, /fibuOutgoing/);
    assert.match(source, /mapFibuRow/);
    assert.match(source, /function isTopLevelPositionNumber/);
    assert.match(source, /type = isTopLevelPositionNumber\(posnr\) \? "titel" : "gruppe"/);
    assert.match(source, /documentByName\.get\(projectKey\.toUpperCase\(\)\)/);
    assert.match(source, /documentsAll\.find\(\(doc\) => S\(doc\.PROJNAME\) === projectKey\)/);
    assert.match(source, /FAELLIGDAT/);
    assert.match(source, /ZAHLDAT/);
    assert.match(source, /SKONTODAT/);
    assert.match(source, /idx: N\(row\.IDX\)/);

    assert.doesNotMatch(source, /\bINSERT\s+INTO\b/i);
    assert.doesNotMatch(source, /\bUPDATE\s+\w+/i);
    assert.doesNotMatch(source, /\bDELETE\s+FROM\b/i);
    assert.doesNotMatch(source, /\bTRUNCATE\b/i);
    assert.doesNotMatch(source, /new pg\.Pool/);
    assert.doesNotMatch(source, /DATABASE_URL/);
  });

  it("treats empty HAPAK free-document folder replacements as project tree folders", () => {
    const source = fs.readFileSync(path.resolve("scripts/hapak-stage-2026.ts"), "utf8");
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");
    const storageSource = fs.readFileSync(path.resolve("server/storage.ts"), "utf8");

    assert.match(source, /function isHapakFreeDocumentFolderReplacement/);
    assert.match(source, /mapDocumentType\(row\) !== "freies_dokument"/);
    assert.match(source, /childDocumentParentNames/);
    assert.match(source, /folderReplacementNames/);
    assert.match(source, /\.filter\(\(row\) => !folderReplacementNames\.has/);
    assert.match(source, /nodeType: "folder"/);
    assert.match(source, /hapak_free_document_folder_replacements/);
    assert.match(routesSource, /is_hapak_folder_replacement/);
    assert.match(routesSource, /node_type: "folder"/);
    assert.match(routesSource, /child_doc\.parent_document_id = d\.id/);
    assert.match(routesSource, /child_doc\.parent_document_id = folder_node\.document_id/);
    assert.match(storageSource, /function visibleWorkDocumentCondition/);
    assert.match(storageSource, /project_document_tree parent_node/);
    assert.match(storageSource, /child_doc\.parent_document_id =/);
    assert.match(storageSource, /visibleWorkDocumentCondition\(\)/);
  });

  it("keeps the first 2026 HAPAK importer guarded by preview, blockers and a transaction", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
    const source = fs.readFileSync(path.resolve("scripts/hapak-import-stage-2026.ts"), "utf8");

    assert.equal(packageJson.scripts["hapak:import:2026"], "tsx scripts/hapak-import-stage-2026.ts");
    assert.match(source, /Default is preview only/);
    assert.match(source, /hasArg\("--apply"\)/);
    assert.match(source, /hasArg\("--include-positions"\)/);
    assert.match(source, /buildBlockers\(stage\)/);
    assert.match(source, /if \(apply && blockers\.length > 0\)/);
    assert.match(source, /schema_missing/);
    assert.match(source, /duplicate_document_import_key/);
    assert.match(source, /BEGIN/);
    assert.match(source, /COMMIT/);
    assert.match(source, /ROLLBACK/);
    assert.match(source, /ON CONFLICT \(customer_number\)/);
    assert.match(source, /ON CONFLICT \(import_source_key\)/);
    assert.match(source, /availableItems/);
    assert.match(source, /applyRequires: "--include-positions"/);
    assert.match(source, /replaceDocumentPositions/);
    assert.match(source, /repairCalculatedImportItems/);
    assert.match(source, /calculateImportedTitleSum/);
    assert.match(source, /isTopLevelTitleSum/);
    assert.match(source, /sectionSum \+= Number\(sectionItem\.totalPrice\)/);
    assert.match(source, /mainFibuRows/);
    assert.match(source, /documentTotalsFromFibu/);
    assert.match(source, /UPDATE documents SET net_total = \$1, gross_total = \$2/);
    assert.match(source, /type === "nettosumme"/);
    assert.match(source, /type === "gesamtsumme"/);
    assert.match(source, /item\.type === "skonto"/);
    assert.match(source, /unitPrice: "0\.00"/);
    assert.match(source, /extractSkontoDaysFromItems/);
    assert.match(source, /innerhalb\\s\+von\\s\+\(\\d\{1,3\}\)\\s\+Tagen/i);
    assert.match(source, /import_source, import_source_key, auto_position_numbers/);
    assert.match(source, /auto_position_numbers=EXCLUDED\.auto_position_numbers/);
    assert.match(source, /doc\.importSource \|\| "hapak",\s+doc\.importSourceKey \|\| doc\.hapakName,\s+false,/);
    assert.match(source, /DELETE FROM document_items WHERE document_id = ANY/);
    assert.match(source, /parent_item_id/);
    assert.match(source, /before_work_text/);
    assert.match(source, /after_totals_text/);
    assert.match(source, /before_work_text = \$1/);
    assert.match(source, /after_totals_text = \$2/);
    assert.doesNotMatch(source, /after_totals_text = COALESCE/);
    assert.match(source, /HAPAK-NAME=/);
    assert.match(source, /documents.*import_source_key/s);
    assert.match(source, /projects.*import_source_key/s);
    assert.match(source, /parent_document_id/);
    assert.match(source, /postgresql:\/\/postgres:postgres@localhost:5432\/fristd_bau/);
    assert.doesNotMatch(source, /\bTRUNCATE\b/i);
    assert.doesNotMatch(source, /\bDELETE\s+FROM\s+(?!document_items\b)\w+/i);
  });

  it("models imported HAPAK identities separately from visible numbers", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
    const schemaSource = fs.readFileSync(path.resolve("shared/schema.ts"), "utf8");
    const storageSource = fs.readFileSync(path.resolve("server/storage.ts"), "utf8");
    const prepareSource = fs.readFileSync(path.resolve("scripts/prepare-hapak-import-schema.ts"), "utf8");

    assert.equal(packageJson.scripts["hapak:prepare-import-schema"], "tsx scripts/prepare-hapak-import-schema.ts");
    assert.match(schemaSource, /projectNumber: text\("project_number"\)\.notNull\(\),/);
    assert.match(schemaSource, /documentNumber: text\("document_number"\)\.notNull\(\),/);
    assert.match(schemaSource, /importSource: text\("import_source"\)/);
    assert.match(schemaSource, /importSourceKey: text\("import_source_key"\)\.unique\(\)/);
    assert.doesNotMatch(schemaSource, /documentNumber: text\("document_number"\)\.notNull\(\)\.unique\(\)/);
    assert.doesNotMatch(schemaSource, /projectNumber: text\("project_number"\)\.notNull\(\)\.unique\(\)/);
    assert.match(storageSource, /inArray\(documents\.type, typesInGroup\)/);
    assert.match(prepareSource, /ADD COLUMN "import_source_key" text/);
    assert.match(prepareSource, /DROP CONSTRAINT/);
    assert.match(prepareSource, /ADD CONSTRAINT/);
    assert.match(prepareSource, /UNIQUE \("\$\{column\}"\)/);
    assert.doesNotMatch(prepareSource, /\bDELETE\s+FROM\b/i);
    assert.doesNotMatch(prepareSource, /\bTRUNCATE\b/i);
  });

  it("audits imported HAPAK calculated rows and FIBU detail rows before finance import", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
    const source = fs.readFileSync(path.resolve("scripts/hapak-audit-import-2026.ts"), "utf8");

    assert.equal(packageJson.scripts["hapak:audit:2026"], "tsx scripts/hapak-audit-import-2026.ts");
    assert.match(source, /calculated_document_total_mismatch/);
    assert.match(source, /totalMismatchExamples/);
    assert.match(source, /net_diff_docs/);
    assert.match(source, /rowBelongsToFibuYear/);
    assert.match(source, /valueBelongsToNumberYear/);
    assert.match(source, /zero_calc_sum_rows/);
    assert.match(source, /fibu_detail_rows_not_staged/);
    assert.match(source, /hapak_documents_auto_numbering_enabled/);
    assert.match(source, /hapak_jumbo_costs_in_fixed_mode/);
    assert.match(source, /hapak_jumbo_redundant_self_children/);
    assert.match(source, /hapak_external_jumbo_synthetic_labor_child/);
    assert.match(source, /autoNumberingExamples/);
    assert.match(source, /fixedCostJumboExamples/);
    assert.match(source, /redundantJumboChildExamples/);
    assert.match(source, /syntheticJumboChildExamples/);
    assert.match(source, /price_follows_cost/);
    assert.match(source, /Lohnanteil aus HAPAK-JUMBO/);
    assert.match(source, /IDX\) > 0/);
    assert.match(source, /FIBUZWO\.DBF/);
    assert.match(source, /nettosumme/);
    assert.match(source, /gesamtsumme/);
    assert.match(source, /titelsumme/);
    assert.match(source, /fibu_buchungen-Basis/);
    assert.doesNotMatch(source, /\bINSERT\s+INTO\b/i);
    assert.doesNotMatch(source, /\bUPDATE\s+\w+/i);
    assert.doesNotMatch(source, /\bDELETE\s+FROM\b/i);
    assert.doesNotMatch(source, /\bTRUNCATE\b/i);
  });

  it("audits HAPAK incoming invoice attachments before importing files", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
    const source = fs.readFileSync(path.resolve("scripts/hapak-audit-attachments-2026.ts"), "utf8");

    assert.equal(packageJson.scripts["hapak:audit-attachments:2026"], "tsx scripts/hapak-audit-attachments-2026.ts --year 2026");
    assert.match(source, /readonly: true/);
    assert.match(source, /FIBUZWO\.DBF/);
    assert.match(source, /DOKUMENT\.DBF/);
    assert.match(source, /DMS\.DBF/);
    assert.match(source, /DOKLINK\.DBF/);
    assert.match(source, /physicalAttachmentFiles/);
    assert.match(source, /\^\[A-Z\]:\\\\/);
    assert.match(source, /no_physical_attachment_files_in_snapshot/);
    assert.match(source, /incoming_fibu_has_no_direct_file_reference/);
    assert.match(source, /NAS-Snapshot um HAPAK-Beleg-\/Archivordner erweitern/);
    assert.match(source, /Matching nach RNR, ADR_NR\/ADR_SUCH, BELEGDAT und Betrag/);
    assert.match(source, /document_attachments importieren/);
    assert.doesNotMatch(source, /\bINSERT\s+INTO\b/i);
    assert.doesNotMatch(source, /\bUPDATE\s+\w+/i);
    assert.doesNotMatch(source, /\bDELETE\s+FROM\b/i);
    assert.doesNotMatch(source, /\bTRUNCATE\b/i);
    assert.doesNotMatch(source, /new pg\.Pool/);
    assert.doesNotMatch(source, /DATABASE_URL/);
  });

  it("prepares a generic attachment ledger for imported HAPAK beleg files", () => {
    const schemaSource = fs.readFileSync(path.resolve("shared/schema.ts"), "utf8");
    const storageSource = fs.readFileSync(path.resolve("server/storage.ts"), "utf8");
    const prepareSource = fs.readFileSync(path.resolve("scripts/prepare-hapak-import-schema.ts"), "utf8");

    assert.match(schemaSource, /export const documentAttachments = pgTable\("document_attachments"/);
    assert.match(schemaSource, /targetType: text\("target_type"\)\.notNull\(\)/);
    assert.match(schemaSource, /fibuReId: integer\("fibu_re_id"\)/);
    assert.match(schemaSource, /incomingInvoiceId: integer\("incoming_invoice_id"\)/);
    assert.match(schemaSource, /documentId: integer\("document_id"\)/);
    assert.match(schemaSource, /projectId: integer\("project_id"\)/);
    assert.match(schemaSource, /importSourceKey: text\("import_source_key"\)\.unique\(\)/);
    assert.match(schemaSource, /sha256: text\("sha256"\)/);
    assert.match(schemaSource, /insertDocumentAttachmentSchema/);

    assert.match(storageSource, /documentAttachments/);
    assert.match(storageSource, /getDocumentAttachments\(filters/);
    assert.match(storageSource, /createDocumentAttachment\(attachment/);
    assert.match(storageSource, /eq\(documentAttachments\.fibuReId, filters\.fibuReId\)/);
    assert.match(storageSource, /eq\(documentAttachments\.incomingInvoiceId, filters\.incomingInvoiceId\)/);

    assert.match(prepareSource, /CREATE TABLE document_attachments/);
    assert.match(prepareSource, /import_source_key text UNIQUE/);
    assert.match(prepareSource, /document_attachments_fibu_re_id_idx/);
    assert.match(prepareSource, /document_attachments_incoming_invoice_id_idx/);
    assert.match(prepareSource, /prepareDocumentAttachments\(client\)/);
    assert.doesNotMatch(prepareSource, /\bDROP\s+TABLE\s+document_attachments\b/i);
    assert.doesNotMatch(prepareSource, /\bDELETE\s+FROM\s+document_attachments\b/i);
    assert.doesNotMatch(prepareSource, /\bTRUNCATE\s+document_attachments\b/i);
  });

  it("imports staged HAPAK FIBU rows only through preview, blockers and transactions", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
    const source = fs.readFileSync(path.resolve("scripts/hapak-import-fibu-2026.ts"), "utf8");

    assert.equal(packageJson.scripts["hapak:import-fibu:2026"], "tsx scripts/hapak-import-fibu-2026.ts");
    assert.match(source, /stage\.fibuEntries/);
    assert.match(source, /duplicateKeys/);
    assert.match(source, /existingRowsForStageReIds/);
    assert.match(source, /--replace-existing-fibu/);
    assert.match(source, /BEGIN/);
    assert.match(source, /COMMIT/);
    assert.match(source, /ROLLBACK/);
    assert.match(source, /INSERT INTO fibu_buchungen/);
    assert.match(source, /idx/);
    assert.match(source, /document_id/);
    assert.match(source, /projects WHERE import_source = 'hapak'/);
    assert.match(source, /normalizedKtr/);
    assert.match(source, /syncImportedDocumentSkontoFromFibu/);
    assert.match(source, /skonto_percent = f\.sk_prozent/);
    assert.match(source, /WHEN COALESCE\(d\.skonto_days, 0\) > 0 THEN d\.skonto_days/);
    assert.match(source, /ELSE GREATEST\(0, \(f\.skontodat::date - COALESCE\(f\.belegdat, d\.date\)::date\)\)/);
    assert.match(source, /DELETE FROM fibu_buchungen WHERE re_id = ANY/);
    assert.doesNotMatch(source, /\bTRUNCATE\b/i);
  });

  it("repairs imported HAPAK calculated document rows explicitly and transactionally", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
    const source = fs.readFileSync(path.resolve("scripts/hapak-repair-calculated-rows-2026.ts"), "utf8");

    assert.equal(packageJson.scripts["hapak:repair-calculated:2026"], "tsx scripts/hapak-repair-calculated-rows-2026.ts");
    assert.match(source, /type === "titelsumme"/);
    assert.match(source, /type === "nettosumme"/);
    assert.match(source, /type === "gesamtsumme"/);
    assert.match(source, /countsForImportedTotal/);
    assert.match(source, /position_flag/);
    assert.match(source, /net_total/);
    assert.match(source, /gross_total/);
    assert.match(source, /BEGIN/);
    assert.match(source, /COMMIT/);
    assert.match(source, /ROLLBACK/);
    assert.match(source, /UPDATE document_items SET total_price/);
    assert.doesNotMatch(source, /\bDELETE\s+FROM\b/i);
    assert.doesNotMatch(source, /\bTRUNCATE\b/i);
  });

  it("repairs old synthetic HAPAK jumbo labor children only for external-service jumbos without time", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
    const source = fs.readFileSync(path.resolve("scripts/hapak-repair-jumbo-children-2026.ts"), "utf8");

    assert.equal(packageJson.scripts["hapak:repair-jumbos:2026"], "tsx scripts/hapak-repair-jumbo-children-2026.ts");
    assert.match(source, /d\.import_source = 'hapak'/);
    assert.match(source, /p\.type = 'jumbo'/);
    assert.match(source, /p\.external_cost::text, ''\), '0'\)::numeric > 0/);
    assert.match(source, /p\.labor_time::text, ''\), '0'\)::numeric = 0/);
    assert.match(source, /c\.position_flag = 'jumbo_lohn'/);
    assert.match(source, /c\.title = 'Lohnanteil aus HAPAK-JUMBO'/);
    assert.match(source, /price_follows_cost = true/);
    assert.match(source, /DELETE FROM document_items/);
    assert.match(source, /BEGIN/);
    assert.match(source, /COMMIT/);
    assert.match(source, /ROLLBACK/);
    assert.doesNotMatch(source, /\bTRUNCATE\b/i);
  });
});

describe("project document tree persistence", () => {
  it("synchronizes document tree nodes for every document save path", () => {
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");

    assert.match(routesSource, /async function syncDocumentProjectTree/);
    assert.match(routesSource, /DELETE FROM project_document_tree WHERE document_id = \$1 AND project_id != \$2/);
    assert.match(routesSource, /await syncDocumentProjectTree\(createdDocument\.id, createdDocument\.projectId\)/);
    assert.match(routesSource, /await syncDocumentProjectTree\(updatedDocument\.id, updatedDocument\.projectId\)/);
    assert.match(routesSource, /await syncDocumentProjectTree\(result\.document\.id, result\.document\.projectId\)/);
    assert.match(routesSource, /await syncDocumentProjectTree\(newDoc\.id, newDoc\.projectId\)/);
    assert.equal(routesSource.includes("if (!existingDocumentId && result.document.projectId)"), false);
  });

  it("refreshes project document trees after document conversion in the editor", () => {
    const hookSource = fs.readFileSync(path.resolve("client/src/pages/document-editor/hooks/use-document-save.ts"), "utf8");

    assert.match(hookSource, /onSuccess: \(newDoc: Document\)/);
    assert.match(hookSource, /queryKey: \["\/api\/projects", newDoc\.projectId, "document-tree"\]/);
  });

  it("removes stale project tree nodes when documents are deleted", () => {
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");
    const storageSource = fs.readFileSync(path.resolve("server/storage.ts"), "utf8");

    assert.match(routesSource, /await syncDocumentProjectTree\(documentId, null\)/);
    assert.match(storageSource, /DELETE FROM project_document_tree WHERE document_id = \$1/);
  });

  it("cleans orphan document nodes when the project tree is loaded", () => {
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");

    assert.match(routesSource, /DELETE FROM project_document_tree t/);
    assert.match(routesSource, /NOT EXISTS \(SELECT 1 FROM documents d WHERE d\.id = t\.document_id\)/);
  });

  it("rebuilds missing HAPAK document tree children from document parent links", () => {
    const routesSource = fs.readFileSync(path.resolve("server/routes.ts"), "utf8");
    const helper = routesSource.slice(
      routesSource.indexOf("async function ensureMissingProjectTreeDocumentNodes"),
      routesSource.indexOf("// ========== PROJEKT-DOKUMENTENBAUM =========="),
    );
    const getTreeRoute = routesSource.slice(
      routesSource.indexOf('app.get("/api/projects/:projectId/document-tree"'),
      routesSource.indexOf('app.post("/api/projects/:projectId/document-tree"'),
    );

    assert.match(helper, /parent_document_id/);
    assert.match(helper, /byDocumentId\.has\(parentDocId\)/);
    assert.match(helper, /INSERT INTO project_document_tree/);
    assert.match(getTreeRoute, /ensureMissingProjectTreeDocumentNodes\(projectId\)/);
  });
});

describe("invoice register cache coherence", () => {
  it("refreshes invoice register, payment matching, and register check caches after transfer", () => {
    const dialogSource = fs.readFileSync(path.resolve("client/src/pages/document-editor/components/dialogs/invoice-register-dialog.tsx"), "utf8");

    assert.match(dialogSource, /queryClient\.invalidateQueries\(\{ queryKey: \["\/api\/outgoing-invoices-fibu"\] \}\)/);
    assert.match(dialogSource, /queryClient\.invalidateQueries\(\{ queryKey: \["\/api\/open-invoices-for-matching"\] \}\)/);
    assert.match(dialogSource, /queryClient\.invalidateQueries\(\{ queryKey: \["\/api\/documents", documentId, "invoice-register-check"\] \}\)/);
  });
});

describe("document editor context insertion guards", () => {
  it("keeps normal sum and position rows out of the after-totals area", () => {
    const contextSource = fs.readFileSync(path.resolve("client/src/pages/document-editor/hooks/use-context-actions.ts"), "utf8");

    assert.match(contextSource, /afterTotalsAllowedTypes = new Set\(\["freitext", "text", "floskel", "trennlinie", "skonto"\]\)/);
    assert.match(contextSource, /isAfterTotals && !afterTotalsAllowedTypes\.has\(type\)/);
    assert.match(contextSource, /Nach der Summe nicht moeglich/);
  });

  it("does not expose placeholder document insert actions in the editor menu", () => {
    const contextSource = fs.readFileSync(path.resolve("client/src/pages/document-editor/hooks/use-context-actions.ts"), "utf8");
    const menuSource = fs.readFileSync(path.resolve("client/src/pages/document-editor/components/menus.tsx"), "utf8");

    assert.doesNotMatch(contextSource, /Funktion folgt|_dokument_einfuegen/);
    assert.doesNotMatch(menuSource, /Funktion folgt|_dokument_einfuegen|Inhalt eines Dokuments/);
  });
});

describe("document item save payload", () => {
  it("keeps jumbo parent client references in one bulk save payload", () => {
    const jumbo = emptyItem("jumbo", 1, 0);
    const child = emptyItem("lohn", 1, 1, jumbo._clientId);
    child.articleNumber = "LOHN-01";
    child.materialCost = "12.34";
    const positionNumbers = new Map([
      [jumbo._clientId, "1"],
      [child._clientId, "1.1"],
    ]);

    const payload = buildDocumentItemBulkPayload([jumbo, child], positionNumbers);

    assert.equal(payload.length, 2);
    assert.equal(payload[0]._clientId, jumbo._clientId);
    assert.equal(payload[0].positionNumber, "1");
    assert.equal(payload[1].articleNumber, "LOHN-01");
    assert.equal(payload[1].materialCost, "12.34");
    assert.equal(payload[1]._parentClientId, jumbo._clientId);
    assert.equal(payload[1].positionNumber, "1.1");
  });

  it("keeps unresolved parent client ids visible instead of dropping them", () => {
    const child = emptyItem("lohn", 1, 0, "missing-jumbo");
    const payload = buildDocumentItemBulkPayload([child], new Map());

    assert.equal(payload[0]._parentClientId, "missing-jumbo");
    assert.equal(payload[0].parentItemId ?? null, null);
  });

  it("restores stable editor parent client ids after bulk save", () => {
    const restored = restoreEditorClientIds([
      { id: 10, type: "jumbo", parentItemId: null, _clientId: "jumbo-a" },
      { id: 11, type: "lohn", parentItemId: 10 },
    ]);

    assert.equal(restored[0]._clientId, "jumbo-a");
    assert.equal(restored[1]._parentClientId, "jumbo-a");
  });

  it("rejects bulk save payloads with duplicate client ids", () => {
    assert.throws(
      () => validateDocumentItemBulkPayload([
        { _clientId: "pos-a", type: "leistung" },
        { _clientId: "pos-a", type: "material" },
      ]),
      /Doppelte Positions-ID/,
    );
  });

  it("rejects bulk save payloads with missing or cyclic jumbo parents", () => {
    assert.throws(
      () => validateDocumentItemBulkPayload([
        { _clientId: "child-a", _parentClientId: "missing-jumbo", type: "lohn" },
      ]),
      /Jumbo-Elternposition missing-jumbo/,
    );

    assert.throws(
      () => validateDocumentItemBulkPayload([
        { _clientId: "jumbo-a", _parentClientId: "jumbo-a", type: "jumbo" },
      ]),
      /eigener Jumbo-Elternknoten/,
    );
  });
});

describe("print item mapping", () => {
  it("preserves unsaved jumbo parent client references for preview/PDF", () => {
    const mapped = mapDocumentItemsForPrint([
      { _clientId: "jumbo-a", type: "jumbo", quantity: "1.00", unitPrice: "0.00", totalPrice: "0.00" },
      { _clientId: "child-a", _parentClientId: "jumbo-a", type: "lohn", quantity: "1.00", unitPrice: "69.30", totalPrice: "69.30" },
    ]);

    assert.equal(mapped[0]._clientId, "jumbo-a");
    assert.equal(mapped[1]._parentClientId, "jumbo-a");
    assert.equal(mapped[0].unitPrice, "69.30");
    assert.equal(mapped[0].totalPrice, "69.30");
  });

  it("uses document skonto settings while preparing print items", () => {
    const mapped = mapDocumentItemsForPrint(
      [
        { id: 1, type: "leistung", quantity: "1.00", unitPrice: "100.00", totalPrice: "100.00", materialPrice: "40.00" },
        { id: 2, type: "skonto", quantity: "1.00", unitPrice: "0.00", totalPrice: "0.00" },
      ],
      { taxRate: "19", skontoPercent: "10", skontoDays: 7, skontoNurMaterial: true },
    );

    assert.equal(mapped[1].totalPrice, "-4.76");
    assert.equal(mapped[1].description?.includes("114,24"), true);
  });
});

describe("HAPAK JUMBO import", () => {
  it("keeps HAPAK pre-content reference rows out of imported document positions", () => {
    const source = fs.readFileSync(path.resolve("scripts/hapak-stage-2026.ts"), "utf8");

    assert.match(source, /const contentIds = \["T", "U", "J", "S", "G", "R", "l", "M", "m"\]/);
    assert.match(source, /if \(!firstContentSeen\) continue;/);
  });

  it("drops corrupt HAPAK memo fragments and calculated skonto output lines during import", () => {
    const source = fs.readFileSync(path.resolve("scripts/hapak-stage-2026.ts"), "utf8");

    assert.match(source, /\^\[º°\]\+0\$/);
    assert.match(source, /\^\\\(\\d\{1,2\}\$/);
    assert.match(source, /Zahlbetrag\\s\+bei\\s\+Skontoabzug/);
    assert.match(source, /if \(isCalculatedSkontoText\(title\)\) continue;/);
    assert.match(source, /appendCleanText\(beforeWorkTexts/);
    assert.match(source, /isHapakTextArtifactLine\(title\)/);
  });

  it("cleans HAPAK text control artifacts from text blocks", () => {
    assert.equal(isHapakTextArtifactLine("º0"), true);
    assert.equal(isHapakTextArtifactLine("Âº0"), true);
    assert.equal(isHapakTextArtifactLine("┬º0"), true);
    assert.equal(isHapakTextArtifactLine("(12"), true);
    assert.equal(isHapakTextArtifactLine("Leistungszeitraum Mai - Juni 2026"), false);
    assert.equal(repairHapakMojibake("Zulage zur Vorposition: Aush\u00c3\u00b6hen"), "Zulage zur Vorposition: Aushöhen");
    assert.equal(repairHapakMojibake("37,50 m\u00c2\u00b2 Fermacell"), "37,50 m² Fermacell");
    assert.equal(repairHapakMojibake("St├╝ck"), "Stück");
    assert.equal(repairHapakMojibake("Gesch├ñftsf├╝hrer"), "Geschäftsführer");
    assert.equal(repairHapakMojibake("m┬▓"), "m²");
    assert.equal(repairHapakMojibake("FriStD-Bau ZuB ÔÇô 1-Kopf"), "FriStD-Bau ZuB - 1-Kopf");

    assert.equal(
      cleanHapakTextBlock("Heukoppel 92, WP, FbHzg., Demontage FB.\n┬º0"),
      "Heukoppel 92, WP, FbHzg., Demontage FB.",
    );
    assert.equal(
      cleanHapakTextBlock("Zulage zur Vorposition: Aush\u00c3\u00b6hen\n37,50 m\u00c2\u00b2 Fermacell\n\u00c2\u00ba0"),
      "Zulage zur Vorposition: Aushöhen\n37,50 m² Fermacell",
    );
  });

  it("normalizes HAPAK mojibake in API response text without touching technical fields", () => {
    const normalized = normalizeHapakResponseText({
      name: "Gesch├ñftsf├╝hrer",
      unit: { code: "m┬▓", name: "Quadratmeter" },
      fields: [{ inhalt: "FriStD-Bau ZuB ÔÇô 1-Kopf" }],
      email: "post@fristd-bau.com",
      imageUrl: "/api/uploads/img_680f32b3.jpg",
    });

    assert.equal(normalized.name, "Geschäftsführer");
    assert.equal(normalized.unit.code, "m²");
    assert.equal(normalized.fields[0].inhalt, "FriStD-Bau ZuB - 1-Kopf");
    assert.equal(normalized.email, "post@fristd-bau.com");
    assert.equal(normalized.imageUrl, "/api/uploads/img_680f32b3.jpg");
  });

  it("keeps the imported HAPAK text-artifact repair transactional and previewable", () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
    const source = fs.readFileSync(path.resolve("scripts/hapak-repair-text-artifacts-2026.ts"), "utf8");
    const storageSource = fs.readFileSync(path.resolve("server/storage.ts"), "utf8");

    assert.equal(pkg.scripts["hapak:repair-text:2026"], "tsx scripts/hapak-repair-text-artifacts-2026.ts");
    assert.match(source, /mode: "preview"/);
    assert.match(source, /applyRequires: "--apply"/);
    assert.match(source, /await client\.query\("BEGIN"\)/);
    assert.match(source, /await client\.query\("COMMIT"\)/);
    assert.match(source, /await client\.query\("ROLLBACK"\)/);
    assert.match(source, /cleanHapakTextBlock/);
    assert.match(source, /FROM document_items i/);
    assert.match(source, /isHapakTextArtifactLine\(row\.title\)/);
    assert.match(source, /DELETE FROM document_items WHERE id = \$1/);
    assert.match(storageSource, /isHapakTextArtifactLine\(item\.title\)/);
  });

  it("keeps calculated HAPAK JUMBOs as detailed positions with synthetic labor children", () => {
    const expanded = expandHapakDetailedJumbos([
      {
        documentImportSourceKey: "hapak:doc:AZZ26000001",
        sourceLine: 17,
        sourceId: "J",
        positionNumber: "1.7",
        type: "jumbo",
        title: "Zulage zur Vorposition: Aushöhen",
        description: "falls der Bestand krumm und schief ist",
        unit: "Std",
        quantity: "34.00",
        unitPrice: "69.30",
        totalPrice: "2356.20",
        laborPrice: "69.30",
        materialPrice: "0.00",
        materialCost: "0.00",
        laborCost: "30.00",
        equipmentCost: "0.00",
        externalCost: "0.00",
        laborMarkup: "131.00",
        materialMarkup: null,
        equipmentMarkup: null,
        externalMarkup: null,
        laborTime: "60.00",
        sortOrder: 6,
        positionFlag: "jumbo",
        flagLabel: null,
        afterTotals: false,
        priceFollowsCost: true,
        parentSourceLine: null,
      },
    ]);

    assert.equal(expanded.length, 2);
    assert.equal(expanded[0].priceFollowsCost, true);
    assert.equal(expanded[1].type, "lohn");
    assert.equal(expanded[1].parentSourceLine, 17);
    assert.equal(expanded[1].quantity, "1.00");
    assert.equal(expanded[1].unitPrice, "69.30");
    assert.equal(expanded[1].totalPrice, "69.30");
    assert.equal(expanded[1].laborCost, "30.00");
    assert.equal(expanded[1].laborMarkup, "131.00");
  });

  it("keeps external-service-only HAPAK JUMBOs detailed without inventing child rows", () => {
    const expanded = expandHapakDetailedJumbos([
      {
        documentImportSourceKey: "hapak:doc:RZZ26000058",
        sourceLine: 14,
        sourceId: "J",
        positionNumber: "1.1.1",
        type: "jumbo",
        title: "2-fach Schukosteckdose",
        unit: "Stk",
        quantity: "5.60",
        unitPrice: "156.15",
        totalPrice: "874.44",
        laborPrice: "69.30",
        materialPrice: "0.00",
        materialCost: "0.00",
        laborCost: "32.00",
        equipmentCost: "0.00",
        externalCost: "115.67",
        laborMarkup: "116.56",
        materialMarkup: null,
        equipmentMarkup: null,
        externalMarkup: "35.00",
        laborTime: "0.00",
        sortOrder: 0,
        positionFlag: "jumbo",
        flagLabel: null,
        afterTotals: false,
        priceFollowsCost: true,
        parentSourceLine: null,
      },
    ]);

    assert.equal(expanded.length, 1);
    assert.equal(expanded[0].type, "jumbo");
    assert.equal(expanded[0].priceFollowsCost, true);
    assert.equal(expanded[0].unitPrice, "156.15");
    assert.equal(expanded[0].totalPrice, "874.44");
    assert.equal(expanded[0].externalCost, "115.67");
    assert.equal(expanded[0].externalMarkup, "35.00");
    assert.equal(expanded.some((item) => item.parentSourceLine === 14), false);
  });

  it("keeps HAPAK JUMBO external-service markup as detailed calculation", () => {
    const expanded = expandHapakDetailedJumbos([
      {
        documentImportSourceKey: "hapak:doc:AZZ26000100",
        sourceLine: 14,
        sourceId: "J",
        positionNumber: "8.4",
        type: "jumbo",
        title: "Anfahrt fuer die Erstgestellung von Absetzmulden und Abroller",
        unit: "Stk",
        quantity: "1.00",
        unitPrice: "97.50",
        totalPrice: "97.50",
        materialCost: "0.00",
        laborCost: "0.00",
        equipmentCost: "0.00",
        externalCost: "75.00",
        externalMarkup: "30.00",
        laborTime: "0.00",
        sortOrder: 3,
        positionFlag: "jumbo",
        afterTotals: false,
        priceFollowsCost: true,
        parentSourceLine: null,
      },
      {
        documentImportSourceKey: "hapak:doc:AZZ26000100",
        sourceLine: 15,
        sourceId: "m",
        positionNumber: "",
        type: "material",
        title: "Anfahrt fuer die Erstgestellung von Absetzmulden und Abroller",
        unit: "Stk",
        quantity: "1.00",
        unitPrice: "97.50",
        totalPrice: "97.50",
        materialCost: "0.00",
        laborCost: "0.00",
        equipmentCost: "0.00",
        externalCost: "75.00",
        externalMarkup: "30.00",
        sortOrder: 4,
        priceFollowsCost: true,
        parentSourceLine: 14,
      },
    ]);

    assert.equal(expanded.length, 1);
    assert.equal(expanded[0].priceFollowsCost, true);
    assert.equal(expanded[0].externalCost, "75.00");
    assert.equal(expanded[0].externalMarkup, "30.00");
    assert.equal(expanded.some((item) => item.parentSourceLine === 14), false);
  });

  it("treats HAPAK JUMBOs with parent cost buckets as detailed even when PAUSCHAL is filled", () => {
    const source = fs.readFileSync(path.resolve("scripts/hapak-stage-2026.ts"), "utf8");
    const expanded = expandHapakDetailedJumbos([
      {
        documentImportSourceKey: "hapak:doc:AZZ26000100",
        sourceLine: 14,
        sourceId: "J",
        positionNumber: "8.4",
        type: "jumbo",
        title: "Anfahrt fuer die Erstgestellung von Absetzmulden und Abroller",
        unit: "Stk",
        quantity: "1.00",
        unitPrice: "97.50",
        totalPrice: "97.50",
        materialCost: "0.00",
        laborCost: "0.00",
        equipmentCost: "0.00",
        externalCost: "75.00",
        externalMarkup: "30.00",
        laborTime: "0.00",
        positionFlag: "jumbo",
        priceFollowsCost: false,
        parentSourceLine: null,
      },
    ]);

    assert.match(source, /const hasCostBuckets = materialCost > 0 \|\| laborCost > 0 \|\| equipmentCost > 0 \|\| externalCost > 0/);
    assert.match(source, /fixedTotal === 0 \|\| hasCostBuckets/);
    assert.equal(expanded.length, 1);
    assert.equal(expanded[0].priceFollowsCost, true);
    assert.equal(expanded[0].unitPrice, "97.50");
    assert.equal(expanded[0].externalCost, "75.00");
    assert.equal(expanded[0].externalMarkup, "30.00");
  });

  it("does not duplicate explicit HAPAK JUMBO child rows", () => {
    const expanded = expandHapakDetailedJumbos([
      { sourceLine: 10, sourceId: "J", type: "jumbo", priceFollowsCost: true, laborPrice: "69.30", laborCost: "30.00", laborTime: "60.00" },
      { sourceLine: 11, sourceId: "l", type: "lohn", parentSourceLine: 10, quantity: "1.00", unitPrice: "69.30", totalPrice: "69.30" },
    ]);

    assert.equal(expanded.length, 2);
    assert.equal(expanded[1].sourceId, "l");
  });
});

describe("document editor item entry", () => {
  it("keeps quantity input editable while accepting German decimal notation", () => {
    assert.equal(formatEditableGermanDecimal("25.50"), "25,50");
    assert.equal(formatEditableGermanDecimal("12,"), "12,");
    assert.equal(parseGermanDecimal("69.30"), 69.3);
    assert.equal(parseGermanDecimal("25,50"), 25.5);
    assert.equal(parseGermanDecimal("1.234,50"), 1234.5);
  });

  it("keeps focused document quantities formatted instead of exposing stored precision", () => {
    const rowSource = fs.readFileSync(path.resolve("client/src/pages/document-editor/components/position-row.tsx"), "utf8");
    const qtyDisplaySource = rowSource.slice(
      rowSource.indexOf("const qtyDisplay"),
      rowSource.indexOf("const origQtyHint"),
    );

    assert.match(qtyDisplaySource, /quantityEditing\s*\?/);
    assert.doesNotMatch(qtyDisplaySource, /quantityEditing\s*\|\|\s*focused/);
    assert.match(rowSource, /const input = event\.currentTarget/);
    assert.match(rowSource, /requestAnimationFrame\(\(\) => input\.select\(\)\)/);
    assert.doesNotMatch(rowSource, /onClick=\{\(e\) => \(e\.target as HTMLInputElement\)\.select\(\)\}/);
  });

  it("resolves editor column widths from form designer columns outside the editor component", () => {
    const widths = resolveEditorColumnWidths([
      { name: "Pos", breite: 30 },
      { name: "Menge", breite: 50 },
      { name: "Einheit", breite: 25 },
      { name: "Bezeichnung", breite: 260 },
      { name: "E-Preis", breite: 65 },
      { name: "Gesamtpreis", breite: 70 },
    ]);

    assert.equal(widths.posLabel, "Pos");
    assert.equal(widths.qtyLabel, "Menge");
    assert.equal(widths.unitLabel, "Einheit");
    assert.equal(widths.descLabel, "Bezeichnung");
    assert.equal(widths.gpLabel, "Gesamtpreis");
    assert.equal(widths.hasUnit, true);
    assert.equal(Math.round(widths.gpW), 14);
  });

  it("creates visible manual positions and cost-following free jumbos", () => {
    const rowSource = fs.readFileSync(path.resolve("client/src/pages/document-editor/components/position-row.tsx"), "utf8");
    const manual = emptyItem("manuell", 1, 0);
    const jumbo = emptyItem("jumbo", 1, 1);

    assert.equal(manual.quantity, "1.00");
    assert.equal(manual.unit, "Stk");
    assert.equal(manual.title, "Leistung");
    assert.equal(jumbo.priceFollowsCost, true);
    assert.match(rowSource, /data-testid=\{`button-jumbo-add-\$\{index\}`\}/);
    assert.match(rowSource, /data-testid="jumbo-menu-manuell"/);
    assert.match(rowSource, /data-testid="jumbo-menu-material"/);
    assert.doesNotMatch(rowSource, /focused \|\| selected \|\| jumboMenuOpen/);
  });

  it("creates new items from the central position type defaults", () => {
    const material = emptyItem("material", 1, 0);
    const labor = emptyItem("lohn", 1, 1);
    const text = emptyItem("freitext", 1, 2);

    assert.equal(material.unit, "Stk");
    assert.equal(material.quantity, "0.00");
    assert.equal(labor.unit, "Std");
    assert.equal(labor.quantity, "0.00");
    assert.equal(text.unit, "");
    assert.equal(text.quantity, "0.00");
    assert.equal(text.priceFollowsCost, false);
  });

  it("only accepts real jumbo parents for child insertion", () => {
    const normal = emptyItem("leistung", 1, 0);
    normal._clientId = "normal";
    const jumbo = emptyItem("jumbo", 1, 1);
    jumbo._clientId = "jumbo";
    const child = emptyItem("lohn", 1, 2, jumbo._clientId);

    const items = [normal, jumbo, child];

    assert.equal(getJumboParentClientId(items, 0), null);
    assert.equal(getJumboParentClientId(items, 1), "jumbo");
    assert.equal(getJumboChildInsertIndex(items, 1), 3);
    assert.equal(getJumboChildCount(items, 0), 0);
    assert.equal(getJumboChildCount(items, 1), 1);
  });

  it("builds editor pagination zones outside the editor component", () => {
    const zones = buildEditorZones(
      {
        headerText: "Vortext",
        footerText: "Vor der Summe",
        afterTotalsText: "Zahlbar innerhalb von 14 Tagen ohne Abzug, 2 Prozent Skonto bei Zahlung innerhalb von 7 Tagen.",
        skontoImDokument: true,
      },
      [emptyItem("skonto", 1, 0)],
    );

    assert.equal(zones.beforeWorkText, "Vortext");
    assert.equal(zones.beforeTotalsText, "Vor der Summe");
    assert.equal(zones.afterTotalsText, "Zahlbar innerhalb von 14 Tagen ohne Abzug.");
    assert.equal(zones.showSkonto, true);
  });

  it("calculates free jumbo prices from its children", () => {
    const jumbo = emptyItem("jumbo", 1, 0);
    jumbo.quantity = "2.00";
    const child1 = emptyItem("lohn", 1, 1, jumbo._clientId);
    child1.totalPrice = "69.30";
    const child2 = emptyItem("material", 1, 2, jumbo._clientId);
    child2.totalPrice = "19,50";

    const recalced = recalcJumboFromChildren([jumbo, child1, child2], 0);

    assert.equal(recalced[0].unitPrice, "88.80");
    assert.equal(recalced[0].totalPrice, "177.60");
  });

  it("uses one consistent jumbo calculation path across legacy and editor helpers", () => {
    const jumbo = emptyItem("jumbo", 1, 0);
    jumbo.quantity = "2.00";
    const child = emptyItem("lohn", 1, 1, jumbo._clientId);
    child.totalPrice = "69.30";

    const editorPath = recalcJumboFromChildren([jumbo, child], 0);
    const legacyPath = recalcJumboTotal([jumbo, child], 0);

    assert.equal(editorPath[0].unitPrice, "69.30");
    assert.equal(editorPath[0].totalPrice, "138.60");
    assert.equal(legacyPath[0].unitPrice, editorPath[0].unitPrice);
    assert.equal(legacyPath[0].totalPrice, editorPath[0].totalPrice);
  });

  it("keeps deliberate jumbo fixed prices but repairs empty legacy free jumbos", () => {
    const fixed = emptyItem("jumbo", 1, 0);
    fixed.priceFollowsCost = false;
    fixed.unitPrice = "100.00";
    fixed.totalPrice = "100.00";
    const emptyLegacy = emptyItem("jumbo", 1, 0);
    emptyLegacy.priceFollowsCost = false;
    const child = emptyItem("lohn", 1, 1, emptyLegacy._clientId);
    child.totalPrice = "69.30";

    assert.equal(recalcJumboFromChildren([fixed, child], 0)[0].unitPrice, "100.00");
    assert.equal(recalcJumboFromChildren([emptyLegacy, child], 0)[0].unitPrice, "69.30");
  });

  it("keeps imported cost-following JUMBO prices when HAPAK stores costs on the parent", () => {
    const jumbo = emptyItem("jumbo", 1, 0);
    jumbo.quantity = "1.00";
    jumbo.priceFollowsCost = true;
    jumbo.unitPrice = "97.50";
    jumbo.totalPrice = "97.50";
    jumbo.externalCost = "75.00";

    const recalced = recalcJumboFromChildren([jumbo], 0);

    assert.equal(recalced[0].unitPrice, "97.50");
    assert.equal(recalced[0].totalPrice, "97.50");
  });

  it("keeps loaded fixed jumbo prices while recalculating cost-following jumbos", () => {
    const fixed = emptyItem("jumbo", 1, 0);
    fixed.quantity = "2,00";
    fixed.priceFollowsCost = false;
    fixed.unitPrice = "150.00";
    fixed.totalPrice = "300.00";
    const fixedChild = emptyItem("lohn", 1, 1, fixed._clientId);
    fixedChild.totalPrice = "69.30";

    const following = emptyItem("jumbo", 1, 2);
    following.quantity = "2,00";
    following.priceFollowsCost = true;
    const followingChild = emptyItem("lohn", 1, 3, following._clientId);
    followingChild.totalPrice = "69.30";

    let loaded = [fixed, fixedChild, following, followingChild];
    loaded = recalcJumboFromChildren(loaded, 0);
    loaded = recalcJumboFromChildren(loaded, 2);

    assert.equal(loaded[0].unitPrice, "150.00");
    assert.equal(loaded[0].totalPrice, "300.00");
    assert.equal(loaded[2].unitPrice, "69.30");
    assert.equal(loaded[2].totalPrice, "138.60");
  });

  it("maps function keys to HAPAK-like document editor actions", () => {
    assert.equal(resolveDocumentEditorShortcut("F2"), "open_material_catalog");
    assert.equal(resolveDocumentEditorShortcut("F3"), "add_service_position");
    assert.equal(resolveDocumentEditorShortcut("F4"), "open_jumbo_catalog");
    assert.equal(resolveDocumentEditorShortcut("F5"), "add_free_jumbo");
    assert.equal(resolveDocumentEditorShortcut("F5", { ctrlKey: true }), null);
  });
});

describe("document pagination", () => {
  const template: ResolvedTemplate = {
    page1Fields: [],
    page2Fields: [],
    workArea: {
      x: 0,
      y: 0,
      w: 500,
      h: 100,
      spalten: [{ name: "Bezeichnung", breite: 420, ausrichtung: "links" }],
    },
    workAreaPage1: { x: 0, y: 0, w: 500, h: 100 },
    workAreaPage2: { x: 0, y: 0, w: 500, h: 100 },
    footerYPage1: 130,
    footerYPage2: 130,
  };

  it("counts contenteditable paragraph endings as visual lines, not technical trailing blanks", () => {
    assert.equal(estimateWrappedLines("<div>Test</div><div>Test</div><div>Test</div>", 90), 3);
    assert.equal(estimateWrappedLines("<div>Test</div><div><br></div>", 90), 2);
    assert.equal(estimateWrappedLines("<div><br></div><div><br></div><div><br></div>", 90), 3);
    assert.equal(estimateWrappedLines("Test\rTest\rTest", 90), 3);
    assert.equal(estimateWrappedLines("Test\nTest\nTest", 90), 3);
  });

  it("splits a long Freitext row across pages instead of moving it as one block", () => {
    const items = [
      item({ _clientId: "p1", title: "Position davor", totalPrice: "100.00" }),
      item({
        _clientId: "txt",
        type: "freitext",
        title: "Zeile 1\nZeile 2\nZeile 3\nZeile 4\nZeile 5\nZeile 6\nZeile 7",
      }),
      item({ _clientId: "p2", title: "Position danach", totalPrice: "50.00" }),
    ];

    const pages = paginateDocument(
      items,
      template,
      undefined,
      undefined,
      (testItem) => testItem.type === "freitext" ? 90 : 30,
    );

    const textBlocks = pages.flatMap((page) =>
      page.blocks
        .filter((block) => block.itemId === "txt")
        .map((block) => ({ page: page.pageNumber, block })),
    );

    const followingPositionPage = pages.find((page) =>
      page.blocks.some((block) => block.itemId === "p2"),
    )?.pageNumber;

    assert.equal(textBlocks.length, 2);
    assert.equal(textBlocks[0].page, 1);
    assert.equal(textBlocks[0].block.splitPart, "top");
    assert.equal(textBlocks[1].page, 2);
    assert.equal(textBlocks[1].block.splitPart, "bottom");
    assert.equal(textBlocks[0].block.data?.titleOverride, "Zeile 1\nZeile 2\nZeile 3");
    assert.equal(textBlocks[1].block.data?.titleOverride, "Zeile 4\nZeile 5\nZeile 6\nZeile 7");
    assert.ok(followingPositionPage && followingPositionPage > textBlocks[1].page);
  });

  it("uses free space down to the footer when imported work area height is too short", () => {
    const shortImportedAreaTemplate: ResolvedTemplate = {
      ...template,
      workAreaPage1: { x: 0, y: 0, w: 500, h: 100 },
      footerYPage1: 190,
    };
    const items = [
      item({ _clientId: "p1", title: "Position 1", totalPrice: "100.00" }),
      item({
        _clientId: "txt",
        type: "freitext",
        title: "freie Zeile\nfreie Zeile",
      }),
      item({ _clientId: "p2", title: "Position 2", description: "soll noch auf Seite 1 passen", totalPrice: "50.00" }),
    ];

    const pages = paginateDocument(
      items,
      shortImportedAreaTemplate,
      undefined,
      undefined,
      (testItem) => testItem.type === "freitext" ? 32 : 30,
    );

    const followingPositionPage = pages.find((page) =>
      page.blocks.some((block) => block.itemId === "p2"),
    )?.pageNumber;

    assert.equal(followingPositionPage, 1);
  });

  it("does not move the next position just to reserve flow space for outgoing carry-forward", () => {
    const tightTemplate: ResolvedTemplate = {
      ...template,
      workAreaPage1: { x: 0, y: 0, w: 500, h: 116 },
      footerYPage1: 140,
    };
    const items = [
      item({ _clientId: "p1", title: "Position davor", totalPrice: "100.00" }),
      item({
        _clientId: "txt",
        type: "freitext",
        title: "freie Zeile\nfreie Zeile",
      }),
      item({ _clientId: "p2", title: "Position danach", totalPrice: "50.00" }),
    ];

    const pages = paginateDocument(
      items,
      tightTemplate,
      undefined,
      undefined,
      (testItem) => testItem.type === "freitext" ? 32 : 30,
    );

    assert.equal(pages.find((page) => page.blocks.some((block) => block.itemId === "p2"))?.pageNumber, 1);
  });

  it("keeps four free-text lines and the following position on the page when visual space is available", () => {
    const textTuningTemplate: ResolvedTemplate = {
      ...template,
      workAreaPage1: { x: 0, y: 0, w: 500, h: 128 },
      footerYPage1: 152,
    };
    const items = [
      item({ _clientId: "p1", title: "Position davor", totalPrice: "100.00" }),
      item({
        _clientId: "txt",
        type: "freitext",
        title: "<div>Test</div><div>Test</div><div>Test</div><div>Test</div>",
      }),
      item({ _clientId: "p2", title: "Position danach", totalPrice: "50.00" }),
    ];

    const pages = paginateDocument(items, textTuningTemplate);

    assert.equal(pages.find((page) => page.blocks.some((block) => block.itemId === "p2"))?.pageNumber, 1);
  });

  it("treats intentional blank free-text lines as spacer content in the editor layout", () => {
    const items = [
      item({ _clientId: "p1", title: "Position davor", totalPrice: "100.00" }),
      item({
        _clientId: "txt",
        type: "freitext",
        title: "<div><br></div><div><br></div><div><br></div>",
      }),
      item({ _clientId: "p2", title: "Position danach", totalPrice: "50.00" }),
    ];

    const pages = paginateDocument(
      items,
      template,
      undefined,
      undefined,
      (testItem) => testItem.type === "freitext" ? 44 : 30,
    );

    assert.ok(pages[0].blocks.some((block) => block.itemId === "txt"));
    assert.equal(pages.find((page) => page.blocks.some((block) => block.itemId === "p2"))?.pageNumber, 2);
  });

  it("renders expanded jumbo children exactly once in the page model", () => {
    const items = [
      item({ _clientId: "jumbo", type: "jumbo", title: "Dachflaeche herstellen", totalPrice: "120.00" }),
      item({ _clientId: "child-lohn", _parentClientId: "jumbo", type: "lohn", title: "Monteurstunde", totalPrice: "60.00" }),
    ];

    const pages = paginateDocument(items, template, new Set(["jumbo"]));
    const childBlocks = pages.flatMap((page) => page.blocks).filter((block) => block.itemId === "child-lohn");

    assert.equal(childBlocks.length, 1);
    assert.equal(childBlocks[0].type, "jumboChildRow");
  });

  it("hides explicitly internal positions when the document setting is active", () => {
    const items = [
      item({ _clientId: "jumbo", type: "jumbo", title: "Dachflaeche herstellen", totalPrice: "120.00" }),
      item({ _clientId: "internal-child", _parentClientId: "jumbo", type: "lohn", positionFlag: "intern", title: "Interne Kalkulation", totalPrice: "60.00" }),
    ];

    const hidden = paginateDocument(items, template, new Set(["jumbo"]), undefined, undefined, true);
    const visible = paginateDocument(items, template, new Set(["jumbo"]), undefined, undefined, false);

    assert.equal(hidden.flatMap((page) => page.blocks).some((block) => block.itemId === "internal-child"), false);
    assert.equal(visible.flatMap((page) => page.blocks).some((block) => block.itemId === "internal-child"), true);
  });

  it("keeps every closing row out of the normal pagination flow", () => {
    const items = [
      item({ _clientId: "p1", title: "Position", totalPrice: "100.00" }),
      item({ _clientId: "net", type: "nettosumme", title: "Netto" }),
      item({ _clientId: "sum", type: "gesamtsumme", title: "Gesamt" }),
      item({ _clientId: "sk", type: "skonto", title: "Skonto" }),
      item({ _clientId: "ab", type: "abschluss", title: "Abschluss" }),
    ];

    const pages = paginateDocument(items, template);
    const normalFlowIds = pages.flatMap((page) =>
      page.blocks
        .filter((block) => block.type === "positionRow")
        .map((block) => block.itemId),
    );

    assert.deepEqual(normalFlowIds, ["p1"]);
    assert.equal(pages.some((page) => page.blocks.some((block) => block.type === "skontoRow")), false);
    assert.ok(pages.some((page) => page.blocks.some((block) => block.type === "abschlussBlock")));
    assert.ok(pages.some((page) => page.blocks.some((block) => block.type === "summaryBlock")));
  });

  it("does not reserve skonto summary space when skonto display is disabled", () => {
    const items = [
      item({ _clientId: "p1", title: "Position", totalPrice: "100.00" }),
      item({ _clientId: "sk", type: "skonto", title: "Skonto" }),
      item({ _clientId: "ab", type: "abschluss", title: "Abschluss" }),
    ];

    const visible = paginateDocument(items, template);
    const hidden = paginateDocument(items, template, undefined, { showSkonto: false });
    const visibleSummary = visible.flatMap((page) => page.blocks).find((block) => block.type === "summaryBlock");
    const hiddenSummary = hidden.flatMap((page) => page.blocks).find((block) => block.type === "summaryBlock");

    assert.equal(visibleSummary?.estimatedHeight, 118);
    assert.equal(hiddenSummary?.estimatedHeight, 80);
    assert.equal(hidden.some((page) => page.blocks.some((block) => block.type === "skontoRow")), false);
  });

  it("splits long after-totals floskel text before it can run into the footer", () => {
    const items = [
      item({ _clientId: "net", type: "nettosumme", title: "Nettosumme" }),
      item({ _clientId: "sum", type: "gesamtsumme", title: "Gesamtsumme" }),
    ];
    const longAfterTotalsText = [
      "Wir sind ueberzeugt Ihnen ein faires Angebot unterbreitet zu haben.",
      "Gerne wuerden wir den Auftrag fuer Sie ausfuehren.",
      "An unser Angebot halten wir uns 4 Wochen gebunden.",
      "Wir behalten uns vor, Preisaenderungen von Vorlieferanten geltend zu machen.",
      "Es gilt stets der zum Leistungszeitpunkt gueltige Mehrwertsteuersatz.",
      "Saemtliche Montagekosten sind unter normalen Voraussetzungen kalkuliert.",
      "Zugaenglichkeit der Arbeitsbereiche wird vorausgesetzt.",
      "Erforderliche Extraarbeiten werden vor Ausfuehrung besprochen.",
    ].join("\n");

    const pages = paginateDocument(items, template, undefined, { afterTotalsText: `${longAfterTotalsText}\n\n` });
    const afterTextBlocks = pages.flatMap((page) =>
      page.blocks
        .filter((block) => block.type === "afterTotalsTextBlock")
        .map((block) => ({ page: page.pageNumber, block })),
    );

    assert.equal(afterTextBlocks.length > 1, true);
    assert.equal(afterTextBlocks[0].page, 1);
    assert.equal(afterTextBlocks[0].block.splitPart, "top");
    assert.equal(afterTextBlocks[1].block.splitPart, "bottom");
    assert.equal(pages.some((page) => page.blocks.every((block) => block.type === "carryForward")), false);
    assert.equal(afterTextBlocks.every(({ block }) => block.estimatedHeight <= 102), true);
    assert.equal(afterTextBlocks.every(({ block }) => String(block.data?.text ?? "").trim().length > 0), true);
    assert.equal(pages.every((page) => page.blocks.some((block) => String(block.data?.text ?? block.type).trim().length > 0)), true);
  });

  it("ignores imported HAPAK text artifacts after the totals", () => {
    const items = [
      item({ _clientId: "net", type: "nettosumme", title: "Nettosumme" }),
      item({ _clientId: "sum", type: "gesamtsumme", title: "Gesamtsumme" }),
      item({ _clientId: "artifact", type: "freitext", title: "°0", afterTotals: true }),
    ];

    const pages = paginateDocument(items, template);

    assert.equal(pages.flatMap((page) => page.blocks).some((block) => block.itemId === "artifact"), false);
    assert.equal(pages.some((page) => page.blocks.every((block) => block.type === "footerText")), false);
  });

  it("includes fixed surcharges in page carry-forward totals", () => {
    const items = [
      item({ _clientId: "p1", title: "Position", totalPrice: "100.00" }),
      item({ _clientId: "zu", type: "zuschlag", title: "Zuschlag", totalPrice: "15.00" }),
      item({ _clientId: "p2", title: "Folgeposition", totalPrice: "50.00" }),
    ];

    const pages = paginateDocument(
      items,
      template,
      undefined,
      undefined,
      (testItem) => testItem._clientId === "p2" ? 90 : 30,
    );

    assert.equal(pages[0].carryForwardOut, 115);
  });
});
