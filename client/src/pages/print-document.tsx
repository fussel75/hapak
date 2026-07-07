import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import type {
  Document,
  DocumentItem,
  Customer,
  Project,
  CompanySettings,
  FormTemplate,
} from "@shared/schema";
import { documentTypeLabels } from "@shared/schema";
import { fmtCurrency, fmtDocNumber, fmtQty } from "@/lib/format";
import {
  computeDocumentBundle,
  resolveTemplate,
  paginateDocument,
} from "@shared/document-engine/compute-document-bundle";
import { getEffectiveAfterTotalsText } from "@shared/document-engine/payment-terms";
import { normalizeDocumentTypeLabel } from "@shared/document-engine/document-title";
import { mapDocumentItemsForPrint } from "@shared/document-engine/print-items";
import { countsForTotal } from "@shared/document-engine/position-types";
import { A4PageWrapper, SummaryAndFooterBlock } from "@/pages/document-editor/components/a4-components";
import { PT_TO_PX, parseFontSpec } from "@/pages/document-editor/utils";
import type { EditorItem } from "@/pages/document-editor/types";
import { splitTextByDom, getCombinedText } from "@/lib/dom-text-split";
import type { TextSplitStyles } from "@/lib/dom-text-split";
import { sanitizeRichHtmlWithImages } from "@/lib/safe-html";

declare global {
  interface Window {
    __PRINT_READY?: boolean;
  }
}

interface PrintBundle {
  document: Document;
  items: DocumentItem[];
  customer: Customer | null;
  company: CompanySettings | null;
  template: FormTemplate | null;
  project: Project | null;
  abschlagChain: any[];
  editorSettings: any;
  displayMode?: string;
  mode?: "invoice" | "arbeitszeitliste";
}

function genClientId() {
  return `_p${Math.random().toString(36).slice(2, 8)}`;
}

const noopSetDocForm = (_fn: (f: any) => any) => {};
const noopSetDirty = (_v: boolean) => {};
const noop = () => {};
const noopUpdate = (_i: number, _f: string, _v: string) => {};
const emptySet = new Set<number>();

function normalizeHtmlToPlain(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

function isHtml(text: string): boolean {
  return text.includes("<") && (text.includes("</") || text.includes("/>") || /<br\s*\/?>/i.test(text));
}

function hasInlineImages(text: string): boolean {
  return /<img\s[^>]*>/i.test(text);
}

function sanitizeRichHtml(html: string): string {
  return sanitizeRichHtmlWithImages(html);
}

function textToHtml(text: string): string {
  if (!text) return "";
  if (isHtml(text) && hasInlineImages(text)) {
    return sanitizeRichHtml(text);
  }
  let plain = text;
  if (isHtml(text)) {
    plain = normalizeHtmlToPlain(text);
  }
  return plain
    .replace(/&nbsp;/g, "\x00NBSP\x00")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\x00NBSP\x00/g, "&nbsp;")
    .replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;")
    .replace(/  /g, " &nbsp;")
    .replace(/\n/g, "<br>");
}

export default function PrintDocumentPage() {
  const [bundle, setBundle] = useState<PrintBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.margin = "0";
    document.body.style.padding = "0";
    document.documentElement.style.margin = "0";
    document.documentElement.style.padding = "0";

    const style = document.createElement("style");
    style.textContent = `
      @font-face { font-family: 'Nimbus Sans'; font-style: normal; font-weight: 400; src: url('/fonts/NimbusSans-Regular.otf') format('opentype'); font-feature-settings: "liga" 0; }
      @font-face { font-family: 'Nimbus Sans'; font-style: normal; font-weight: 700; src: url('/fonts/NimbusSans-Bold.otf') format('opentype'); font-feature-settings: "liga" 0; }
      @font-face { font-family: 'Nimbus Sans'; font-style: italic; font-weight: 400; src: url('/fonts/NimbusSans-Italic.otf') format('opentype'); font-feature-settings: "liga" 0; }
      @font-face { font-family: 'Nimbus Sans'; font-style: italic; font-weight: 700; src: url('/fonts/NimbusSans-BoldItalic.otf') format('opentype'); font-feature-settings: "liga" 0; }
      @font-face { font-family: 'Nimbus Sans L'; font-style: normal; font-weight: 400; src: url('/fonts/NimbusSanL-Reg.otf') format('opentype'); font-feature-settings: "liga" 0; }
      @font-face { font-family: 'Nimbus Sans L'; font-style: normal; font-weight: 700; src: url('/fonts/NimbusSanL-Bol.otf') format('opentype'); font-feature-settings: "liga" 0; }
      @font-face { font-family: 'Nimbus Sans L'; font-style: italic; font-weight: 400; src: url('/fonts/NimbusSanL-RegIta.otf') format('opentype'); font-feature-settings: "liga" 0; }
      @font-face { font-family: 'Nimbus Sans L'; font-style: italic; font-weight: 700; src: url('/fonts/NimbusSanL-BolIta.otf') format('opentype'); font-feature-settings: "liga" 0; }
      @font-face { font-family: 'Swis721 Lt BT'; font-style: normal; font-weight: 400; src: url('/fonts/NimbusSans-Regular.otf') format('opentype'); font-feature-settings: "liga" 0; }
      @font-face { font-family: 'Swis721 Lt BT'; font-style: normal; font-weight: 700; src: url('/fonts/NimbusSans-Bold.otf') format('opentype'); font-feature-settings: "liga" 0; }
      @font-face { font-family: 'Swis721 Lt BT'; font-style: italic; font-weight: 400; src: url('/fonts/NimbusSans-Italic.otf') format('opentype'); font-feature-settings: "liga" 0; }
      @font-face { font-family: 'Swis721 BT'; font-style: normal; font-weight: 400; src: url('/fonts/NimbusSans-Regular.otf') format('opentype'); font-feature-settings: "liga" 0; }
      @font-face { font-family: 'Swis721 BT'; font-style: normal; font-weight: 700; src: url('/fonts/NimbusSans-Bold.otf') format('opentype'); font-feature-settings: "liga" 0; }
      body { background: transparent; }
      #print-container {
        background: transparent !important;
        padding: 0 0 32pt 0;
      }
      #print-container .a4-page {
        margin: 0 auto 32pt auto !important;
        box-shadow: 0 10pt 24pt rgba(0, 0, 0, 0.32);
      }
      #print-container .a4-page:last-child {
        margin-bottom: 0 !important;
      }
      @media print {
        body { background: white; }
        #print-container {
          background: white !important;
          padding: 0 !important;
        }
        #print-container .a4-page {
          margin: 0 !important;
          box-shadow: none !important;
        }
      }
      * { font-feature-settings: "liga" 0 !important; font-variant-ligatures: none !important; }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) {
      setError("Kein Token angegeben");
      return;
    }
    fetch(`/api/print-data/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setBundle(data))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div style={{ padding: 20, color: "red" }}>{error}</div>;
  if (!bundle) return <div style={{ padding: 20 }}>Laden...</div>;

  if (bundle.mode === "arbeitszeitliste") {
    return <ArbeitszeitlisteRenderer bundle={bundle} />;
  }

  return <PrintRenderer bundle={bundle} />;
}

function formatHM(hours: number): string {
  if (hours <= 0) return "0:00 h";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}:${m.toString().padStart(2, "0")} h`;
}

interface AZRow {
  kind: "titel" | "position" | "titelsumme";
  posNum: string;
  label?: string;
  qty?: number;
  unit?: string;
  desc?: string;
  timePerUnit?: number;
  totalTime?: number;
  flag?: string;
}

function ArbeitszeitlisteRenderer({ bundle }: { bundle: PrintBundle }) {
  const { document: doc, items: rawItems, customer, company, template, project } = bundle;

  const docTypeLabel = doc.customTypeLabel || documentTypeLabels[doc.type as keyof typeof documentTypeLabels] || doc.type;
  const docNumberFormatted = fmtDocNumber(doc.documentNumber);
  const azTitle = `Arbeitszeitliste zu ${docTypeLabel} ${docNumberFormatted}`;

  const docForm: any = useMemo(() => ({
    ...doc,
    formTemplateId: doc.formTemplateId || company?.defaultFormTemplateId,
    customTypeLabel: azTitle,
  }), [doc, company, azTitle]);

  const effectiveTmplId = docForm.formTemplateId;
  const activeTemplate = effectiveTmplId && template?.id === effectiveTmplId ? template : null;
  const resolved = useMemo(() => resolveTemplate(
    activeTemplate
      ? {
          id: activeTemplate.id,
          name: activeTemplate.name,
          type: activeTemplate.type || undefined,
          fields: activeTemplate.fields as any,
          fieldsPage2: activeTemplate.fieldsPage2 as any,
          workArea: activeTemplate.workArea as any,
        }
      : undefined,
    company
      ? {
          companyName: company.companyName,
          companyName2: company.companyName2,
          street: company.street,
          zip: company.zip,
          city: company.city,
          phone: company.phone,
          fax: company.fax,
          email: company.email,
          website: company.website,
          taxId: company.taxId,
          vatId: company.vatId,
          managingDirector: company.managingDirector,
          bankName: company.bankName,
          iban: company.iban,
          bic: company.bic,
          materialMarkupPercent: company.materialMarkupPercent || undefined,
          defaultFormTemplateId: company.defaultFormTemplateId,
        }
      : undefined,
  ), [activeTemplate, company]);

  const activeWorkArea: any = resolved.workArea;

  const tableFont = useMemo(() => {
    const fontSpec = activeWorkArea?.schriftart || "Nimbus Sans 10pt";
    return parseFontSpec(fontSpec);
  }, [activeWorkArea]);

  const tableFontStyle = useMemo(() => ({
    fontFamily: tableFont.fontFamily,
    fontSize: `${tableFont.fontSize}pt`,
  }), [tableFont]);

  const colWidths = useMemo(() => {
    const cols = activeWorkArea?.spalten as { name: string; breite: number }[] | undefined;
    if (!cols?.length) return { posW: "6%", qtyW: "8%", unitW: "5%", descW: "57%", proMeW: "12%", gesamtW: "12%", hasUnit: true };
    const total = cols.reduce((s, c) => s + (c.breite || 0), 0);
    if (total <= 0) return { posW: "6%", qtyW: "8%", unitW: "5%", descW: "57%", proMeW: "12%", gesamtW: "12%", hasUnit: true };
    const pct = (v: number) => `${((v / total) * 100).toFixed(2)}%`;
    const nameMap: Record<string, number> = {};
    for (const c of cols) {
      const n = (c.name || "").toLowerCase().replace(/[^a-zäöü0-9]/g, "");
      if (n.startsWith("pos")) nameMap.pos = c.breite;
      else if (n.startsWith("menge") || n === "mge" || n === "qty") nameMap.qty = c.breite;
      else if (n.startsWith("me") || n.startsWith("eh") || n === "einheit") nameMap.unit = c.breite;
      else if (n.startsWith("bez") || n.startsWith("beschr")) nameMap.desc = c.breite;
      else if (n.startsWith("epreis") || n === "ep" || n === "einzelpreis") nameMap.ep = c.breite;
      else if (n.startsWith("gpreis") || n === "gp" || n === "gesamtpreis") nameMap.gp = c.breite;
    }
    return {
      posW: pct(nameMap.pos ?? 28), qtyW: pct(nameMap.qty ?? 35), unitW: pct(nameMap.unit ?? 25),
      descW: pct(nameMap.desc ?? 280), proMeW: pct(nameMap.ep ?? 60), gesamtW: pct(nameMap.gp ?? 65),
      hasUnit: !!nameMap.unit,
    };
  }, [activeWorkArea]);

  const items: EditorItem[] = useMemo(() => {
    return rawItems.map((it, i) => ({
      ...it,
      pageBreakBefore: it.pageBreakBefore === true,
      _clientId: it.id ? `db-${it.id}` : genClientId(),
      _parentClientId: it.parentItemId ? `db-${it.parentItemId}` : null,
      sortOrder: it.sortOrder ?? i,
    }));
  }, [rawItems]);

  const rows: AZRow[] = useMemo(() => {
    const parentItemsMap = new Map<number, typeof items[0]>();
    const childrenByParent = new Map<number, typeof items[0][]>();
    for (const it of items) {
      if (!it.parentItemId) parentItemsMap.set(it.id!, it);
    }
    for (const it of items) {
      if (it.parentItemId && parentItemsMap.has(it.parentItemId)) {
        const list = childrenByParent.get(it.parentItemId) || [];
        list.push(it);
        childrenByParent.set(it.parentItemId, list);
      }
    }

    const result: AZRow[] = [];
    let sectionTime = 0;

    for (const it of items) {
      if (it.parentItemId) continue;
      const type = it.type || "";

      if (type === "titel") {
        sectionTime = 0;
        const label = `${it.positionNumber || ""} ${normalizeHtmlToPlain(it.title || "")}`.trim();
        result.push({ kind: "titel", posNum: it.positionNumber || "", label });
        continue;
      }
      if (type === "titelsumme") {
        const label = normalizeHtmlToPlain(it.title || "") || `Summe ${it.positionNumber || ""}`.trim();
        result.push({ kind: "titelsumme", posNum: it.positionNumber || "", label, totalTime: sectionTime });
        continue;
      }
      if (!countsForTotal(it)) continue;

      const qty = parseFloat(it.quantity || "0");
      const laborTimeMin = parseFloat(it.laborTime || "0");
      let timePerUnitMin = laborTimeMin;

      if (timePerUnitMin <= 0 && (it.unit === "Std." || it.unit === "Std")) {
        timePerUnitMin = 60;
      }

      if (timePerUnitMin <= 0) {
        const children = childrenByParent.get(it.id!) || [];
        let childLaborMin = 0;
        for (const ch of children) {
          if (ch.unit === "Std." || ch.unit === "Std") {
            childLaborMin += parseFloat(ch.quantity || "0") * 60;
          } else if (parseFloat(ch.laborTime || "0") > 0) {
            childLaborMin += parseFloat(ch.laborTime || "0");
          }
        }
        if (childLaborMin > 0) timePerUnitMin = childLaborMin;
      }

      if (timePerUnitMin <= 0 || qty <= 0) continue;

      const timePerUnitH = timePerUnitMin / 60;
      const totalTimeH = timePerUnitH * qty;
      const flag = it.positionFlag || "normal";
      if (flag === "alternativ") continue;

      sectionTime += totalTimeH;
      const combinedText = normalizeHtmlToPlain(
        (it.title ? it.title + "\n" : "") + (it.description || "")
      ).trim();
      result.push({
        kind: "position", posNum: it.positionNumber || "",
        qty, unit: it.unit || "", desc: combinedText,
        timePerUnit: timePerUnitH, totalTime: totalTimeH, flag,
      });
    }
    return result;
  }, [items]);

  const totalGesamt = useMemo(() => rows.reduce((s, r) => s + (r.kind === "position" ? (r.totalTime || 0) : 0), 0), [rows]);

  const waPage1 = resolved.workAreaPage1;
  const waPage2 = resolved.workAreaPage2;
  const lineHeight = (tableFont.fontSize * 1.625 * PT_TO_PX) + 8;

  const pages = useMemo(() => {
    const result: { pageNumber: number; rows: (AZRow | { kind: "carryForward"; total: number } | { kind: "header" } | { kind: "gesamtsumme"; total: number })[]; isFirstPage: boolean }[] = [];
    let currentPage: typeof result[0] = { pageNumber: 1, rows: [{ kind: "header" }], isFirstPage: true };
    const maxH1 = waPage1.h * PT_TO_PX;
    const maxH2 = waPage2.h * PT_TO_PX;
    let usedH = lineHeight * 2;
    let runningTotal = 0;

    const pushPage = () => {
      currentPage.rows.push({ kind: "carryForward", total: runningTotal });
      result.push(currentPage);
      currentPage = { pageNumber: result.length + 1, rows: [{ kind: "carryForward", total: runningTotal }, { kind: "header" }], isFirstPage: false };
      usedH = lineHeight * 3;
    };

    for (const row of rows) {
      const maxH = currentPage.isFirstPage ? maxH1 : maxH2;
      const neededLines = row.kind === "position" ? Math.max(Math.ceil(((row.desc || "").split("\n").length) * lineHeight), lineHeight) + 4 : lineHeight + 4;

      if (usedH + neededLines > maxH - lineHeight * 2) {
        pushPage();
      }

      currentPage.rows.push(row);
      usedH += neededLines;

      if (row.kind === "position") {
        runningTotal += row.totalTime || 0;
      }
    }

    currentPage.rows.push({ kind: "gesamtsumme", total: totalGesamt });
    result.push(currentPage);
    return result;
  }, [rows, waPage1, waPage2, lineHeight, totalGesamt]);

  const totalPages = pages.length;

  useEffect(() => {
    const timer = setTimeout(() => {
      window.__PRINT_READY = true;
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const typeLabel = azTitle;

  return (
    <div style={{ background: "white", width: "595pt", margin: "0 auto" }} id="print-container">
      {pages.map((page) => {
        const carryForwardRow = page.rows.find((r) => r.kind === "carryForward" && page.rows.indexOf(r) === 0) as { kind: "carryForward"; total: number } | undefined;

        return (
          <A4PageWrapper
            key={page.pageNumber}
            docForm={docForm}
            setDocForm={noopSetDocForm}
            setDirty={noopSetDirty}
            formTemplates={template ? [template] : []}
            selectedCustomer={customer || undefined}
            typeLabel={typeLabel}
            projects={project ? [project] : []}
            companySettings={company || undefined}
            customers={customer ? [customer] : []}
            pageNumber={page.pageNumber}
            totalPages={totalPages}
            onVortextContextMenu={noop}
          >
            <div>
              <table className="w-full border-collapse table-fixed" style={tableFontStyle}>
                <colgroup>
                  <col style={{ width: colWidths.posW }} />
                  <col style={{ width: colWidths.qtyW }} />
                  {colWidths.hasUnit && <col style={{ width: colWidths.unitW }} />}
                  <col />
                  <col style={{ width: colWidths.proMeW }} />
                  <col style={{ width: colWidths.gesamtW }} />
                </colgroup>
                <tbody>
                  {page.rows.map((row, ri) => {
                    if (row.kind === "header") {
                      const thStyle: any = {
                        backgroundColor: activeWorkArea?.tabellenkopf?.hintergrund || "#fafafa",
                        borderBottom: `${activeWorkArea?.tabellenkopf?.linienBreite ?? 1}pt solid #333`,
                      };
                      const thFontSpec = activeWorkArea?.tabellenkopf?.schriftart;
                      const thFont = thFontSpec ? parseFontSpec(thFontSpec) : tableFont;
                      const thFontStyle = { fontFamily: thFont.fontFamily, fontSize: `${thFont.fontSize}pt`, fontWeight: thFont.fontWeight as any };
                      const totalCols = colWidths.hasUnit ? 6 : 5;
                      return (
                        <tr key={`hdr-${ri}`} style={thStyle}>
                          <td className="py-1.5 pl-0.5 text-left" style={thFontStyle}>POS</td>
                          <td className="py-1.5 px-0.5 text-right" style={thFontStyle}>MENGE</td>
                          {colWidths.hasUnit && <td className="py-1.5 pl-0.5 text-left" style={thFontStyle}>ME</td>}
                          <td className="py-1.5 px-1 text-left" style={thFontStyle}>BEZEICHNUNG</td>
                          <td className="py-1.5 pr-1 text-right" style={thFontStyle}>PRO ME</td>
                          <td className="py-1.5 pr-0.5 text-right" style={thFontStyle}>GESAMT</td>
                        </tr>
                      );
                    }

                    if (row.kind === "carryForward") {
                      return (
                        <tr key={`cf-${ri}`}>
                          <td colSpan={colWidths.hasUnit ? 5 : 4} className="text-right py-1 pr-2 font-bold" style={{ fontSize: `${tableFont.fontSize}pt` }}>
                            Übertrag
                          </td>
                          <td className="text-right py-1 pr-0.5 font-bold tabular-nums" style={{ fontSize: `${tableFont.fontSize}pt` }}>
                            {formatHM(row.total)}
                          </td>
                        </tr>
                      );
                    }

                    if (row.kind === "gesamtsumme") {
                      return (
                        <tr key={`gs-${ri}`} style={{ borderTop: "1.5pt solid #000" }}>
                          <td colSpan={colWidths.hasUnit ? 5 : 4} className="text-right py-2 pr-2 font-bold" style={{ fontSize: `${tableFont.fontSize + 1}pt` }}>
                            Gesamtsumme:
                          </td>
                          <td className="text-right py-2 pr-0.5 font-bold tabular-nums" style={{ fontSize: `${tableFont.fontSize + 1}pt` }} data-testid="az-gesamtsumme">
                            {formatHM(row.total)}
                          </td>
                        </tr>
                      );
                    }

                    if (row.kind === "titel") {
                      return (
                        <tr key={`titel-${ri}`}>
                          <td className="py-1.5 pl-0.5 pr-0 align-top font-bold">{row.posNum}</td>
                          <td colSpan={(colWidths.hasUnit ? 6 : 5) - 1} className="py-1.5 px-1 align-top font-bold">
                            {row.label}
                          </td>
                        </tr>
                      );
                    }

                    if (row.kind === "titelsumme") {
                      return (
                        <tr key={`ts-${ri}`}>
                          <td colSpan={colWidths.hasUnit ? 5 : 4} className="text-right py-1.5 px-1 font-bold">
                            {row.label}
                          </td>
                          <td className="text-right py-1.5 pr-0.5 font-bold tabular-nums">
                            {formatHM(row.totalTime || 0)}
                          </td>
                        </tr>
                      );
                    }

                    if (row.kind === "position") {
                      const isBedarf = row.flag === "bedarf";
                      return (
                        <tr key={`pos-${ri}`} className={isBedarf ? "italic text-gray-500" : ""}>
                          <td className="py-1.5 pl-0.5 pr-0 align-top text-xs">{row.posNum}</td>
                          <td className="text-right py-1.5 px-0.5 align-top tabular-nums">
                            {(row.qty || 0) !== 0 ? fmtQty(row.qty!, 2) : ""}
                          </td>
                          {colWidths.hasUnit && (
                            <td className="text-left py-1.5 pl-0.5 pr-0 align-top text-xs">{row.unit}</td>
                          )}
                          <td className="py-1.5 px-1 align-top whitespace-pre-wrap leading-relaxed">
                            {isBedarf && <span className="text-[7pt] mr-1">Bedarfsposition</span>}
                            {row.desc}
                          </td>
                          <td className="text-right py-1.5 pr-1 pl-0 align-top tabular-nums">
                            {(row.timePerUnit || 0) > 0 ? formatHM(row.timePerUnit!) : ""}
                          </td>
                          <td className="text-right py-1.5 pr-0.5 pl-0 align-top tabular-nums font-bold">
                            {(row.totalTime || 0) > 0 ? formatHM(row.totalTime!) : ""}
                          </td>
                        </tr>
                      );
                    }

                    return null;
                  })}
                </tbody>
              </table>
            </div>
          </A4PageWrapper>
        );
      })}
    </div>
  );
}

function PrintRenderer({ bundle }: { bundle: PrintBundle }) {
  const { document: doc, items: rawItems, customer, company, template, project, abschlagChain, editorSettings } = bundle;
  const displayMode = bundle.displayMode || "normal";
  const hidePrices = displayMode === "ohne-preise";

  const docForm: any = useMemo(() => {
    const base: any = {
      ...doc,
      formTemplateId: doc.formTemplateId || company?.defaultFormTemplateId,
    };
    if (
      ["abschlagsrechnung", "schlussrechnung"].includes(doc.type) &&
      abschlagChain?.length > 0
    ) {
      const currentDocNum = doc.documentNumber;
      const previousAbschlaege = abschlagChain.filter(
        (a: any) => a.documentNumber !== currentDocNum
      );
      if (previousAbschlaege.length > 0) {
        const chainVerrechnungen = previousAbschlaege.map((a: any) => ({
          docId: a.id,
          documentNumber: a.documentNumber,
          label: `${a.abschlagNumber || ""}. Abschlagsrechnung ${fmtDocNumber(a.documentNumber)}`,
          date: a.date || "",
          netAmount: String(a.deltaNet || a.netTotal || 0),
          grossAmount: String(a.deltaGross || a.grossTotal || 0),
        }));
        if (base.abschlagVerrechnungen?.length > 0) {
          base.abschlagVerrechnungen = base.abschlagVerrechnungen.map((v: any) => {
            const chainEntry = chainVerrechnungen.find((c: any) =>
              c.documentNumber === v.documentNumber || c.docId === v.docId
            );
            if (chainEntry) {
              return { ...v, netAmount: chainEntry.netAmount, grossAmount: chainEntry.grossAmount, label: chainEntry.label };
            }
            return v;
          });
        } else {
          base.abschlagVerrechnungen = chainVerrechnungen;
        }
      }
    }
    return base;
  }, [doc, company, abschlagChain]);

  const preparedItems: EditorItem[] = useMemo(() => {
    return mapDocumentItemsForPrint(rawItems as any, docForm) as EditorItem[];
  }, [rawItems, docForm]);

  const effectiveTmplId = docForm.formTemplateId;
  const activeTemplate = effectiveTmplId && template?.id === effectiveTmplId ? template : null;
  const computedBundle = useMemo(() => computeDocumentBundle({
    document: docForm,
    items: preparedItems as any,
    customer: customer || undefined,
    project: project || undefined,
    companySettings: company || undefined,
    template: activeTemplate
      ? {
          id: activeTemplate.id,
          name: activeTemplate.name,
          type: activeTemplate.type || undefined,
          fields: activeTemplate.fields as any,
          fieldsPage2: activeTemplate.fieldsPage2 as any,
          workArea: activeTemplate.workArea as any,
        }
      : undefined,
  } as any), [docForm, preparedItems, customer, project, company, activeTemplate]);
  const items = useMemo(() => computedBundle.computed.visibleItems as unknown as EditorItem[], [computedBundle]);
  const resolved = computedBundle.template;
  const printItems = useMemo(() => {
    if (displayMode === "kurzliste") {
      const keep = new Set(["titel", "titelsumme", "uebertrag", "abschluss", "nachlass"]);
      return items.filter((item) => keep.has(item.type));
    }
    if (displayMode === "summenliste") {
      return items.filter((item) => item.type === "titelsumme" || item.type === "abschluss" || item.type === "uebertrag");
    }
    return items;
  }, [displayMode, items]);

  const activeWorkArea: any = resolved.workArea;

  const colWidths = useMemo(() => {
    const cols = activeWorkArea?.spalten as { name: string; breite: number; ausrichtung?: string }[] | undefined;
    const defaults = {
      posW: 36, qtyW: 52, unitW: 30, descFlex: true, epW: 65, gpW: 70,
      posLabel: "Pos", qtyLabel: "Menge", unitLabel: "ME", descLabel: "Bezeichnung", epLabel: "E-Preis", gpLabel: "G-Preis",
      hasUnit: true,
    };
    if (!cols?.length) return defaults;

    const nameMap: Record<string, { breite: number; label: string }> = {};
    for (const c of cols) {
      const n = (c.name || "").toLowerCase().replace(/[^a-zäöü0-9]/g, "");
      const entry = { breite: c.breite, label: (c.name || "").trim() };
      if (n.startsWith("pos")) nameMap.pos = entry;
      else if (n.startsWith("menge") || n === "mge" || n === "qty") nameMap.qty = entry;
      else if (n.startsWith("me") || n.startsWith("eh") || n === "einheit") nameMap.unit = entry;
      else if (n.startsWith("bez") || n.startsWith("beschr") || n === "text" || n === "leistung") nameMap.desc = entry;
      else if (n.startsWith("epreis") || n === "ep" || n === "einzelpreis") nameMap.ep = entry;
      else if (n.startsWith("gpreis") || n === "gp" || n === "gesamtpreis") nameMap.gp = entry;
    }
    const total = cols.reduce((s, c) => s + (c.breite || 0), 0);
    if (total <= 0) return defaults;

    const pct = (v: number) => (v / total) * 100;
    return {
      posW: pct(nameMap.pos?.breite ?? 35),
      qtyW: pct(nameMap.qty?.breite ?? 45),
      unitW: pct(nameMap.unit?.breite ?? 25),
      descFlex: true as const,
      descW: pct(nameMap.desc?.breite ?? 250),
      epW: pct(nameMap.ep?.breite ?? 70),
      gpW: pct(nameMap.gp?.breite ?? 70),
      posLabel: nameMap.pos?.label || "Pos",
      qtyLabel: nameMap.qty?.label || "Menge",
      unitLabel: nameMap.unit?.label || "ME",
      descLabel: nameMap.desc?.label || "Bezeichnung",
      epLabel: nameMap.ep?.label || "E-Preis",
      gpLabel: nameMap.gp?.label || "G-Preis",
      hasUnit: !!nameMap.unit,
    };
  }, [activeWorkArea]);

  const tableFont = useMemo(() => {
    const fontSpec = activeWorkArea?.schriftart || "Nimbus Sans 10pt";
    return parseFontSpec(fontSpec);
  }, [activeWorkArea]);

  const tableFontStyle = useMemo(() => ({
    fontFamily: tableFont.fontFamily,
    fontSize: `${tableFont.fontSize}pt`,
  }), [tableFont]);

  const usePercentWidths = !!(activeWorkArea?.spalten?.length);
  const positionNumbers = computedBundle.computed.numbering;
  const expandedJumbos = useMemo(() => new Set<string>(), []);

  const editorZones = useMemo(() => ({
    beforeWorkText: docForm.beforeWorkText || docForm.headerText || "",
    beforeTotalsText: docForm.beforeTotalsText || docForm.footerText || "",
    afterTotalsText: getEffectiveAfterTotalsText(
      docForm.afterTotalsText || "",
      docForm.skontoImDokument !== false,
      items.some((item) => item.type === "skonto"),
    ),
    showSkonto: docForm.skontoImDokument !== false,
  }), [docForm, items]);

  const typeLabel = normalizeDocumentTypeLabel(doc.customTypeLabel, documentTypeLabels[doc.type as keyof typeof documentTypeLabels] || doc.type);
  const dezMengen = docForm.dezimalstellenMengen ?? 2;
  const dezPreise = docForm.dezimalstellenPreise ?? 2;

  const taxRate = parseFloat(String(doc.taxRate)) || 19;
  const printTotals = computedBundle.computed.totals;
  const netTotal = printTotals.netTotal > 0 ? printTotals.netTotal : (parseFloat(String(doc.netTotal)) || 0);
  const taxAmount = printTotals.netTotal > 0 ? printTotals.taxAmount : netTotal * (taxRate / 100);
  const grossTotal = printTotals.netTotal > 0 ? printTotals.grossTotal : netTotal + taxAmount;
  const laborTotal = printTotals.laborTotal;

  const isAbschlagOrSchluss = ["abschlagsrechnung", "schlussrechnung"].includes(doc.type);
  const abschlagData = useMemo(() => {
    if (!isAbschlagOrSchluss || !abschlagChain?.length) return undefined;
    const totalPrev = abschlagChain.reduce((s: number, a: any) => s + parseFloat(String(a.deltaGross || "0")), 0);
    return {
      abschlaege: abschlagChain,
      totalPreviouslyInvoiced: abschlagChain.reduce((s: number, a: any) => s + parseFloat(String(a.deltaNet || "0")), 0),
      totalPreviouslyInvoicedGross: totalPrev,
      auftragssumme: netTotal,
    };
  }, [isAbschlagOrSchluss, abschlagChain, netTotal]);

  const waW = resolved.workAreaPage1.w;

  const [phase, setPhase] = useState<"measuring" | "ready">("measuring");
  const [textSplits, setTextSplits] = useState<Map<string, string[]>>(new Map());
  const [enginePages, setEnginePages] = useState<any[]>([]);
  const measureRef = useRef<HTMLDivElement>(null);

  const hideIntern = docForm.internpositionenVerbergen !== false;
  const mainItems = useMemo(() => printItems.filter(
    (it) => !it.afterTotals && it.type !== "abschluss" && it.type !== "skonto" && it.type !== "nettosumme" && it.type !== "gesamtsumme"
      && !it._parentClientId
  ), [printItems, hideIntern]);

  useLayoutEffect(() => {
    if (phase !== "measuring") return;
    const container = measureRef.current;
    if (!container) return;

    const measuredHeights = new Map<string, number>();
    container.querySelectorAll("[data-measure-id]").forEach((el) => {
      const id = el.getAttribute("data-measure-id")!;
      const h = el.getBoundingClientRect().height;
      measuredHeights.set(id, h);
    });

    const heightResolver = (item: any) => {
      const id = item._clientId || (item.id ? `db-${item.id}` : "");
      const pxH = measuredHeights.get(id);
      if (pxH !== undefined) return pxH / PT_TO_PX;
      return 20;
    };

    const pages = paginateDocument(printItems as any, resolved, expandedJumbos, editorZones, heightResolver, hideIntern);

    const descCells = container.querySelectorAll("[data-measure-desc-col]");
    let descWidthPx = waW * 0.568 * PT_TO_PX;
    if (descCells.length > 0) {
      descWidthPx = (descCells[0] as HTMLElement).getBoundingClientRect().width;
    } else {
      const fallback = container.querySelector("td[data-measure-desc-cell]") as HTMLElement | null;
      if (fallback) descWidthPx = fallback.getBoundingClientRect().width;
    }

    const ROW_VERTICAL_PADDING_PX = 12;

    const descStyles: TextSplitStyles = {
      fontFamily: tableFont.fontFamily,
      fontSize: `${tableFont.fontSize}pt`,
      lineHeight: "1.625",
      padding: "0px 4px",
    };

    const splits = new Map<string, string[]>();

    const splitBlocksByItem = new Map<string, { splitClipHeight: number; splitPartIndex: number }[]>();
    for (const page of pages) {
      for (const block of page.blocks) {
        if (block.splitPart && block.itemId && block.splitPartIndex !== undefined) {
          const arr = splitBlocksByItem.get(block.itemId) || [];
          arr.push({ splitClipHeight: block.splitClipHeight || 100, splitPartIndex: block.splitPartIndex });
          splitBlocksByItem.set(block.itemId, arr);
        }
      }
    }

    const measureTitleHeight = (titleText: string): number => {
      if (!titleText.trim()) return 0;
      const div = document.createElement("div");
      Object.assign(div.style, {
        position: "absolute",
        visibility: "hidden",
        left: "-9999px",
        top: "0",
        width: `${descWidthPx}px`,
        fontFamily: descStyles.fontFamily,
        fontSize: descStyles.fontSize,
        lineHeight: descStyles.lineHeight,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        padding: descStyles.padding,
        boxSizing: "border-box",
      });
      div.textContent = titleText;
      document.body.appendChild(div);
      const h = div.getBoundingClientRect().height;
      document.body.removeChild(div);
      return h;
    };

    for (const [itemId, blocks] of splitBlocksByItem) {
      const item = printItems.find((it) => it._clientId === itemId);
      if (!item) continue;

      const isTextItem = item.type === "freitext" || item.type === "floskel" || item.type === "text";
      const descOnly = isTextItem ? (item.title || "") : (item.description || "");
      const titleText = isTextItem ? "" : (item.title || "");
      const titleHeightPx = titleText ? measureTitleHeight(titleText) : 0;
      const parts: string[] = [];
      let remainingText = descOnly;

      blocks.sort((a, b) => a.splitPartIndex - b.splitPartIndex);

      for (let bi = 0; bi < blocks.length; bi++) {
        const block = blocks[bi];
        const isLastBlock = bi === blocks.length - 1;
        if (isLastBlock) {
          parts.push(remainingText);
          remainingText = "";
          break;
        }
        const rawHeightPx = block.splitClipHeight * PT_TO_PX;
        let maxHeightPx = Math.max(rawHeightPx - ROW_VERTICAL_PADDING_PX, 16);
        if (bi === 0 && titleHeightPx > 0) {
          maxHeightPx = Math.max(maxHeightPx - titleHeightPx, 16);
        }
        const [part, rest] = splitTextByDom(remainingText, descWidthPx, maxHeightPx, descStyles);
        if (!part.trim() && rest === remainingText) {
          parts.push(remainingText);
          remainingText = "";
          break;
        }
        parts.push(part);
        remainingText = rest;
        if (!rest.trim()) break;
      }

      if (remainingText.trim()) {
        if (parts.length > 0) {
          parts[parts.length - 1] = parts[parts.length - 1] + "\n" + remainingText;
        } else {
          parts.push(remainingText);
        }
      }

      splits.set(itemId, parts);
    }

    setTextSplits(splits);
    setEnginePages(pages);
    setPhase("ready");
  }, [phase, printItems, resolved, expandedJumbos, editorZones, waW]);

  useEffect(() => {
    if (phase === "ready") {
      const timer = setTimeout(() => {
        window.__PRINT_READY = true;
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  const fmtP = (v: any) => {
    const n = parseFloat(String(v || "0"));
    return n.toLocaleString("de-DE", { minimumFractionDigits: dezPreise, maximumFractionDigits: dezPreise });
  };

  const cwPos = usePercentWidths ? `${colWidths.posW}%` : "36px";
  const cwQty = usePercentWidths ? `${colWidths.qtyW}%` : "52px";
  const cwUnit = usePercentWidths ? `${colWidths.unitW}%` : "30px";
  const cwEP = usePercentWidths ? `${colWidths.epW}%` : "65px";
  const cwGP = usePercentWidths ? `${colWidths.gpW}%` : "70px";

  if (phase === "measuring") {
    return (
      <>
        <div
          ref={measureRef}
          style={{
            position: "absolute",
            visibility: "hidden",
            left: "-9999px",
            top: 0,
            width: `${waW * PT_TO_PX}px`,
          }}
        >
          <table
            className="w-full border-collapse table-fixed"
            style={tableFontStyle}
          >
            <colgroup>
              <col style={{ width: cwPos }} />
              <col style={{ width: cwQty }} />
              {colWidths.hasUnit && <col style={{ width: cwUnit }} />}
              <col />
              <col style={{ width: cwEP }} />
              <col style={{ width: cwGP }} />
            </colgroup>
            <tbody>
              {mainItems.map((item) => {
                const isText = item.type === "freitext" || item.type === "floskel" || item.type === "text";
                const isTitel = item.type === "titel" || item.type === "gruppe";
                const isTitelSum = item.type === "titelsumme";
                const isZwischen = item.type === "zwischensumme";
                const isJumbo = item.type === "jumbo";
                const totalCols = colWidths.hasUnit ? 6 : 5;

                if (isText) {
                  return (
                    <tr key={item._clientId} data-measure-id={item._clientId}>
                      <td colSpan={totalCols} className="py-1 pl-0.5 pr-1 align-top" data-measure-desc-cell>
                        <div className="leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: textToHtml(item.title || "") }} />
                      </td>
                    </tr>
                  );
                }

                if (isTitel) {
                  return (
                    <tr key={item._clientId} data-measure-id={item._clientId}>
                      <td className="py-1.5 pl-0.5 pr-0 align-top" style={{ width: cwPos }}>
                        <span className="font-bold text-xs">{positionNumbers.get(item._clientId) || ""}</span>
                      </td>
                      <td colSpan={totalCols - 1} className="py-1.5 px-1 align-top font-bold">
                        {item.title || ""}
                      </td>
                    </tr>
                  );
                }

                if (isTitelSum || isZwischen) {
                  const gp = parseFloat(item.totalPrice || "0");
                  return (
                    <tr key={item._clientId} data-measure-id={item._clientId}>
                      <td colSpan={totalCols - 1} className="py-1.5 px-1 font-bold text-right">
                        {item.title || (isTitelSum ? "Summe" : "Zwischensumme")}
                      </td>
                      <td className="text-right py-1.5 pr-0.5 font-bold tabular-nums" style={{ width: cwGP }}>
                        {gp !== 0 ? fmtP(gp) : ""}
                      </td>
                    </tr>
                  );
                }

                const combinedText = getCombinedText(item);
                const gp = parseFloat(item.totalPrice || "0");
                const ep = parseFloat(item.unitPrice || "0");
                const qty = parseFloat(item.quantity || "0");
                const displayPos = positionNumbers.get(item._clientId) || "";

                return (
                  <tr key={item._clientId} data-measure-id={item._clientId}>
                    <td className="py-1.5 pl-0.5 pr-0 align-top" style={{ width: cwPos }}>
                      <span className="text-xs">{displayPos}</span>
                    </td>
                    <td className="text-right py-1.5 px-0.5 align-top tabular-nums" style={{ width: cwQty }}>
                      {qty !== 0 ? fmtQty(qty, dezMengen) : ""}
                    </td>
                    {colWidths.hasUnit && (
                      <td className="text-left py-1.5 pl-0.5 pr-0 align-top" style={{ width: cwUnit }}>
                        <span className="text-xs">{item.unit || ""}</span>
                      </td>
                    )}
                    <td className="py-1.5 px-1 align-top" data-measure-desc-col>
                      <div className="leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: textToHtml(combinedText) }} />
                    </td>
                      <td className="text-right py-1.5 pr-1 pl-0 align-top tabular-nums" style={{ width: cwEP }}>
                      {!hidePrices && ep !== 0 ? fmtP(ep) : ""}
                    </td>
                    <td className="text-right py-1.5 pr-0.5 pl-0 align-top tabular-nums" style={{ width: cwGP }}>
                      {!hidePrices && gp !== 0 ? fmtP(gp) : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  const totalPages = enginePages.length;
  const summaryPageIdx = enginePages.findIndex((p: any) => p.blocks.some((b: any) => b.type === "summaryBlock"));

  return (
    <div
      style={{ background: "white", width: "595pt", margin: "0 auto" }}
      id="print-container"
    >
      {enginePages.map((page: any, pageIdx: number) => {
        const isFirstPage = page.isFirstPage;
        const isLastEnginePage = pageIdx === enginePages.length - 1;
        const isAfterTotals = page.isAfterTotals === true;

        const pageBlocks = page.blocks as any[];
        const pageItemIds = new Set(pageBlocks.filter((b) => b.itemId).map((b) => b.itemId!));

        const splitBlockMap = new Map<string, any>();
        for (const b of pageBlocks) {
          if (b.itemId && b.splitPart) {
            const key = b.itemId + (b.splitPartIndex !== undefined ? `__${b.splitPartIndex}` : "");
            splitBlockMap.set(key, b);
          }
        }

        if (isLastEnginePage) {
          printItems.forEach((it) => {
            if (!pageItemIds.has(it._clientId) && !it._parentClientId && it.type !== "abschluss" && it.type !== "skonto" && it.type !== "nettosumme" && it.type !== "gesamtsumme") {
              const onAnyPage = enginePages.some((p: any) => p.blocks.some((b: any) => b.itemId === it._clientId));
              if (!onAnyPage) pageItemIds.add(it._clientId);
            }
          });
        }

        const totalCols = colWidths.hasUnit ? 6 : 5;
        const hasTableItems = pageBlocks.some((b) => b.itemId && b.type !== "carryForward" && b.type !== "summaryBlock");

        return (
          <A4PageWrapper
            key={page.pageNumber}
            docForm={docForm}
            setDocForm={noopSetDocForm}
            setDirty={noopSetDirty}
            formTemplates={template ? [template] : []}
            selectedCustomer={customer || undefined}
            typeLabel={typeLabel}
            projects={project ? [project] : []}
            companySettings={company || undefined}
            customers={customer ? [customer] : []}
            pageNumber={page.pageNumber}
            totalPages={totalPages}
            carryForwardOut={!isLastEnginePage && !isAfterTotals ? page.carryForwardOut : undefined}
            onVortextContextMenu={noop}
          >
            <div>
              <table
                className="w-full border-collapse table-fixed"
                style={tableFontStyle}
              >
                <colgroup>
                  <col style={{ width: cwPos }} />
                  <col style={{ width: cwQty }} />
                  {colWidths.hasUnit && <col style={{ width: cwUnit }} />}
                  <col />
                  <col style={{ width: cwEP }} />
                  <col style={{ width: cwGP }} />
                </colgroup>

                {!isAfterTotals && hasTableItems && (
                  <thead>
                    <tr
                      style={{
                        backgroundColor: activeWorkArea?.tabellenkopf?.hintergrund || "#fafafa",
                        borderBottom: `${activeWorkArea?.tabellenkopf?.linienBreite ?? 1}pt solid #333333`,
                      }}
                      className="text-gray-500"
                    >
                      <th className="text-left py-1.5 pl-0.5 pr-0 font-bold" style={{ width: cwPos }}>{colWidths.posLabel}</th>
                      <th className="text-right py-1.5 px-0.5 font-bold" style={{ width: cwQty }}>{colWidths.qtyLabel}</th>
                      {colWidths.hasUnit && <th className="text-left py-1.5 pl-0.5 pr-0 font-bold" style={{ width: cwUnit }}>{colWidths.unitLabel}</th>}
                      <th className="text-left py-1.5 px-1 font-bold">{colWidths.descLabel}</th>
                      <th className={`text-right py-1.5 pr-1 pl-0 font-bold ${hidePrices ? "text-gray-300" : ""}`} style={{ width: cwEP }}>{colWidths.epLabel}</th>
                      <th className={`text-right py-1.5 pr-0.5 pl-0 font-bold ${hidePrices ? "text-gray-300" : ""}`} style={{ width: cwGP }}>{colWidths.gpLabel}</th>
                    </tr>
                  </thead>
                )}

                <tbody>
                  {!isFirstPage && !isAfterTotals && page.carryForwardIn > 0 && (
                    <tr>
                      <td colSpan={totalCols} className="text-right py-1.5 pr-1 text-xs text-gray-500">
                        <span className="mr-2">Übertrag</span>
                        <span className="tabular-nums">{fmtCurrency(page.carryForwardIn)}</span>
                      </td>
                    </tr>
                  )}

                  {pageBlocks.map((block: any, blockIdx: number) => {
                    if (block.type === "beforeWorkTextBlock" || block.type === "afterTotalsTextBlock" || block.type === "beforeTotalsTextBlock") {
                      const zoneText = block.data?.text || "";
                      if (!zoneText.trim()) return null;
                      const isAfterTotalsText = block.type === "afterTotalsTextBlock";
                      return (
                        <tr key={`zone-${block.type}-${blockIdx}`}>
                          <td colSpan={totalCols} className="py-1 px-0.5 align-top">
                            <div
                              className="whitespace-pre-wrap text-gray-700"
                              style={isAfterTotalsText ? { fontFamily: "Helvetica, Arial, sans-serif", fontSize: "7.6pt", lineHeight: 1.22 } : tableFontStyle}
                              dangerouslySetInnerHTML={{ __html: textToHtml(zoneText) }}
                            />
                          </td>
                        </tr>
                      );
                    }
                    if (!block.itemId) return null;
                    if (block.type === "carryForward") return null;

                    const item = items.find((it) => it._clientId === block.itemId);
                    if (!item) return null;

                    const index = items.indexOf(item);
                    const isText = item.type === "freitext" || item.type === "floskel" || item.type === "text";
                    const isTitel = item.type === "titel" || item.type === "gruppe";
                    const isTitelSum = item.type === "titelsumme";
                    const isZwischen = item.type === "zwischensumme";
                    const displayPos = positionNumbers.get(item._clientId) || "";
                    const gp = parseFloat(item.totalPrice || "0");
                    const ep = parseFloat(item.unitPrice || "0");
                    const qty = parseFloat(item.quantity || "0");
                    const isAlt = item.positionFlag === "alternativ";
                    const isBedarf = item.positionFlag === "bedarf";
                    const altStyle: React.CSSProperties = (isAlt || isBedarf) ? { fontStyle: "italic" } : {};
                    const splitParts = textSplits.get(item._clientId);
                    const partIndex = block.splitPartIndex ?? 0;

                    if (block.splitPart && splitParts) {
                      const descPart = splitParts[partIndex] || "";
                      const titleText = item.title || "";
                      const topDisplayText = !isText && titleText && partIndex === 0
                        ? titleText + (descPart ? "\n" + descPart : "")
                        : descPart;

                      if (block.splitPart === "bottom") {
                        const plainCheck = isHtml(descPart) ? normalizeHtmlToPlain(descPart) : descPart;
                        if (!plainCheck.trim()) return null;
                        return (
                          <tr key={`${item._clientId}-p${partIndex}`} data-testid={`row-cont-${item._clientId}`}>
                            <td className="py-1 pl-0.5 pr-0 align-top" style={{ width: cwPos }}></td>
                            <td style={{ width: cwQty }}></td>
                            {colWidths.hasUnit && <td style={{ width: cwUnit }}></td>}
                            <td className="py-1 px-1 align-top">
                              <div className="leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: textToHtml(descPart) }} />
                            </td>
                            <td style={{ width: cwEP }}></td>
                            <td style={{ width: cwGP }}></td>
                          </tr>
                        );
                      }

                      if (isText) {
                        return (
                          <tr key={`${item._clientId}-p${partIndex}`} data-testid={`row-text-${item._clientId}`}>
                            <td colSpan={totalCols} className="py-1 pl-0.5 pr-1 align-top">
                              <div className="leading-relaxed whitespace-pre-wrap text-gray-600" dangerouslySetInnerHTML={{ __html: textToHtml(descPart) }} />
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={`${item._clientId}-p${partIndex}`} style={altStyle} data-testid={`row-pos-${item._clientId}`}>
                          <td className="py-1.5 pl-0.5 pr-0 align-top" style={{ width: cwPos }}>
                            <span className="text-xs">{displayPos}</span>
                          </td>
                          <td className="text-right py-1.5 px-0.5 align-top tabular-nums" style={{ width: cwQty }}>
                            {qty !== 0 ? fmtQty(qty, dezMengen) : ""}
                          </td>
                          {colWidths.hasUnit && (
                            <td className="text-left py-1.5 pl-0.5 pr-0 align-top" style={{ width: cwUnit }}>
                              <span className="text-xs">{item.unit || ""}</span>
                            </td>
                          )}
                          <td className="py-1.5 px-1 align-top">
                            <div className="leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: textToHtml(topDisplayText) }} />
                          </td>
                          <td className="text-right py-1.5 pr-1 pl-0 align-top tabular-nums" style={{ width: cwEP }}>
                            {!hidePrices && ep !== 0 ? fmtP(ep) : ""}
                          </td>
                          <td className="text-right py-1.5 pr-0.5 pl-0 align-top tabular-nums font-medium" style={{ width: cwGP }}>
                            {!hidePrices && gp !== 0 ? fmtP(gp) : ""}
                          </td>
                        </tr>
                      );
                    }

                    if (isText) {
                      return (
                        <tr key={`${item._clientId}-b${blockIdx}`} data-testid={`row-text-${item._clientId}`}>
                          <td colSpan={totalCols} className="py-1 pl-0.5 pr-1 align-top">
                            <div className="leading-relaxed whitespace-pre-wrap text-gray-600" dangerouslySetInnerHTML={{ __html: textToHtml(item.title || "") }} />
                          </td>
                        </tr>
                      );
                    }

                    if (isTitel) {
                      return (
                        <tr key={`${item._clientId}-b${blockIdx}`} data-testid={`row-title-${item._clientId}`}>
                          <td className="py-1.5 pl-0.5 pr-0 align-top font-bold" style={{ width: cwPos }}>
                            <span className="text-xs">{displayPos}</span>
                          </td>
                          <td colSpan={totalCols - 1} className="py-1.5 px-1 align-top font-bold">
                            {item.title || ""}
                          </td>
                        </tr>
                      );
                    }

                    if (isTitelSum || isZwischen) {
                      return (
                        <tr key={`${item._clientId}-b${blockIdx}`} className="font-bold" data-testid={`row-sum-${item._clientId}`}>
                          <td colSpan={totalCols - 1} className="py-1.5 px-1 text-right">
                            {item.title || (isTitelSum ? "Summe" : "Zwischensumme")}
                          </td>
                          <td className="text-right py-1.5 pr-0.5 font-bold tabular-nums" style={{ width: cwGP }}>
                            {!hidePrices && gp !== 0 ? fmtP(gp) : ""}
                          </td>
                        </tr>
                      );
                    }

                    const combinedText = getCombinedText(item);

                    return (
                      <tr key={`${item._clientId}-b${blockIdx}`} style={altStyle} data-testid={`row-pos-${item._clientId}`}>
                        <td className="py-1.5 pl-0.5 pr-0 align-top" style={{ width: cwPos }}>
                          <span className="text-xs">{displayPos}</span>
                        </td>
                        <td className="text-right py-1.5 px-0.5 align-top tabular-nums" style={{ width: cwQty }}>
                          {qty !== 0 ? fmtQty(qty, dezMengen) : ""}
                        </td>
                        {colWidths.hasUnit && (
                          <td className="text-left py-1.5 pl-0.5 pr-0 align-top" style={{ width: cwUnit }}>
                            <span className="text-xs">{item.unit || ""}</span>
                          </td>
                        )}
                        <td className="py-1.5 px-1 align-top">
                          <div className="leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: textToHtml(combinedText) }} />
                        </td>
                        <td className="text-right py-1.5 pr-1 pl-0 align-top tabular-nums" style={{ width: cwEP }}>
                          {!hidePrices && ep !== 0 ? fmtP(ep) : ""}
                        </td>
                        <td className="text-right py-1.5 pr-0.5 pl-0 align-top tabular-nums font-medium" style={{ width: cwGP }}>
                          {!hidePrices && gp !== 0 ? fmtP(gp) : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pageIdx === summaryPageIdx && (
              <SummaryAndFooterBlock
                netTotal={netTotal}
                taxAmount={taxAmount}
                grossTotal={grossTotal}
                laborTotal={laborTotal}
                docForm={docForm}
                setDocForm={noopSetDocForm}
                setDirty={noopSetDirty}
                isAbschlagOrSchluss={isAbschlagOrSchluss}
                abschlagData={abschlagData}
                showKalk={false}
                ekTotal={0}
                margeTotal={0}
                endsummeConfig={activeWorkArea?.endsumme}
                gpColumnPercent={(() => { const s = activeWorkArea?.spalten; if (!s) return undefined; const cols = Object.values(s as Record<string, any>); const total = cols.reduce((a: number, c: any) => a + (parseFloat(c?.breite) || 0), 0); const gp = cols.find((c: any) => c?.art === "gesamtpreis"); return gp && total > 0 ? (parseFloat(gp.breite) / total) * 100 : undefined; })()}
                skontoItems={items.filter((it) => it.type === "skonto")}
                onUpdateItem={noopUpdate}
                onRemoveItem={noop}
                allItems={items}
                focusedRow={null}
                onFocusRow={noop}
                selectedRows={emptySet}
                onToggleSelect={noop}
                noNettoSingleTax={editorSettings?.noNettoSingleTax === true}
                par13bActive={docForm.par13b === true}
                par13bText={editorSettings?.par13bText as string | undefined}
                dezimalstellenPreise={dezPreise}
                skontoImDokument={docForm.skontoImDokument !== false}
              />
            )}
          </A4PageWrapper>
        );
      })}
    </div>
  );
}
