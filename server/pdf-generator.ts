import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import type { Document, Customer, DocumentItem, CompanySettings, FormTemplate, Project } from "@shared/schema";
import { documentTypeLabels } from "@shared/schema";
import { computeDocumentBundle } from "@shared/document-engine/compute-document-bundle";
import { normalizePrintDisplayMode } from "@shared/document-engine/display-mode";
import { getEffectiveAfterTotalsText } from "@shared/document-engine/payment-terms";
import { getSafeTemplateImageUrl } from "@shared/document-engine/template/image-url";
import { isTextType, isStructuralType } from "@shared/document-engine/visibility";
import { resolveVariables, fmtCurrencyDE, fmtCurrencyEuro, fmtDateDE, fmtNumberDE, fmtDocNumber } from "@shared/document-engine/template/resolve-variable";
import type {
  ComputedDocumentBundle,
  ComputedItem,
  DocumentTotals,
  ResolvedTemplate,
  PageModel,
  LayoutBlock,
  TemplateField,
  WorkAreaConfig,
  DocumentBundle,
  DocumentData,
  CustomerData,
  CompanySettingsData,
  ProjectData,
  FormTemplateData,
  DocumentItemData,
  EndsummeConfig,
} from "@shared/document-engine/types";

function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/-\t/g, "-")
    .replace(/\t/g, "  ")
    .replace(/ {4,}/g, "  ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n").map(line => line.trimEnd()).join("\n")
    .trim();
}

interface HtmlSegment {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color?: string;
  fontSize?: number;
}

interface HtmlBlock {
  type: "paragraph" | "table" | "image";
  segments?: HtmlSegment[];
  listPrefix?: string;
  tableData?: string[][][];
  imageSrc?: string;
}

function extractStyle(tag: string, attr: string): string | null {
  const styleMatch = tag.match(/style="([^"]*)"/i);
  if (!styleMatch) return null;
  const re = new RegExp(`${attr}:\\s*([^;]+)`, "i");
  const m = styleMatch[1].match(re);
  return m ? m[1].trim() : null;
}

function parseHtmlToBlocks(html: string): HtmlBlock[] {
  const blocks: HtmlBlock[] = [];

  const parseInline = (text: string, parentBold = false, parentItalic = false, parentUnderline = false, parentColor?: string, parentFontSize?: number): HtmlSegment[] => {
    const result: HtmlSegment[] = [];
    const inlinePattern = /<(strong|b|em|i|u|s|span)(\s[^>]*)?>[\s\S]*?<\/\1>/gi;
    let lastIdx = 0;
    let match;
    while ((match = inlinePattern.exec(text)) !== null) {
      if (match.index > lastIdx) {
        const plain = text.substring(lastIdx, match.index);
        if (plain) result.push({ text: decodeEntities(plain), bold: parentBold, italic: parentItalic, underline: parentUnderline, color: parentColor, fontSize: parentFontSize });
      }
      const fullMatch = match[0];
      const tag = match[1].toLowerCase();
      const attrs = match[2] || "";
      const innerStart = fullMatch.indexOf(">") + 1;
      const innerEnd = fullMatch.lastIndexOf("<");
      const inner = fullMatch.substring(innerStart, innerEnd);

      let b = parentBold || tag === "strong" || tag === "b";
      let it = parentItalic || tag === "em" || tag === "i";
      let u = parentUnderline || tag === "u";
      let col = parentColor;
      let fs = parentFontSize;

      if (tag === "span") {
        const colorVal = extractStyle(fullMatch, "color");
        if (colorVal) col = colorVal;
        const fsVal = extractStyle(fullMatch, "font-size");
        if (fsVal) {
          const num = parseFloat(fsVal);
          if (num > 0) fs = fsVal.includes("px") ? num * 0.75 : num;
        }
      }

      result.push(...parseInline(inner, b, it, u, col, fs));
      lastIdx = inlinePattern.lastIndex;
    }
    if (lastIdx < text.length) {
      const tail = text.substring(lastIdx);
      if (tail) result.push({ text: decodeEntities(tail), bold: parentBold, italic: parentItalic, underline: parentUnderline, color: parentColor, fontSize: parentFontSize });
    }
    return result;
  };

  const addParaBlock = (content: string, listPrefix?: string) => {
    const segs = parseInline(content);
    blocks.push({
      type: "paragraph",
      segments: segs.length > 0 ? segs : [{ text: decodeEntities(content), bold: false, italic: false, underline: false }],
      listPrefix,
    });
  };

  if (!html.includes("<p>") && !html.includes("<ul>") && !html.includes("<ol>") && !html.includes("<table>") && !html.includes("<img")) {
    const lines = stripHtml(html).split("\n");
    for (const line of lines) {
      blocks.push({ type: "paragraph", segments: [{ text: line, bold: false, italic: false, underline: false }] });
    }
    return blocks;
  }

  const topPattern = /<(p|ul|ol|table|img)(\s[^>]*)?>[\s\S]*?<\/\1>|<img[^>]*\/?>/gi;
  let match;
  while ((match = topPattern.exec(html)) !== null) {
    const fullTag = match[0];
    const tag = (match[1] || "img").toLowerCase();

    if (tag === "p") {
      const inner = fullTag.substring(fullTag.indexOf(">") + 1, fullTag.lastIndexOf("<"));
      addParaBlock(inner);
    } else if (tag === "ul") {
      const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let liMatch;
      while ((liMatch = liRe.exec(fullTag)) !== null) {
        addParaBlock(liMatch[1], "- ");
      }
    } else if (tag === "ol") {
      const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let liMatch;
      let num = 1;
      while ((liMatch = liRe.exec(fullTag)) !== null) {
        addParaBlock(liMatch[1], `${num}. `);
        num++;
      }
    } else if (tag === "table") {
      const rows: string[][] = [];
      const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let trMatch;
      while ((trMatch = trRe.exec(fullTag)) !== null) {
        const cells: string[] = [];
        const tdRe = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
        let tdMatch;
        while ((tdMatch = tdRe.exec(trMatch[1])) !== null) {
          cells.push(stripHtml(tdMatch[1]).trim());
        }
        rows.push(cells);
      }
      if (rows.length > 0) {
        blocks.push({ type: "table", tableData: rows.map(r => r.map(c => [c])) });
      }
    } else if (tag === "img") {
      const srcMatch = fullTag.match(/src="([^"]+)"/i);
      if (srcMatch) {
        blocks.push({ type: "image", imageSrc: srcMatch[1] });
      }
    }
  }

  return blocks;
}

function decodeEntities(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function renderHtmlToPdf(pdf: any, html: string, x: number, y: number, width: number, wf: any, lineGap = 1.5): number {
  const blocks = parseHtmlToBlocks(html);
  let curY = y;

  for (const block of blocks) {
    if (block.type === "image" && block.imageSrc) {
      try {
        if (block.imageSrc.startsWith("data:image/")) {
          const base64Data = block.imageSrc.split(",")[1];
          if (base64Data) {
            const imgBuf = Buffer.from(base64Data, "base64");
            const maxW = width * 0.8;
            const maxH = 200;
            pdf.image(imgBuf, x, curY, { fit: [maxW, maxH], align: "left" });
            curY = pdf.y + 4;
          }
        }
      } catch {}
      continue;
    }

    if (block.type === "table" && block.tableData) {
      const rows = block.tableData;
      const numCols = Math.max(...rows.map(r => r.length));
      const colW = width / numCols;

      for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri];
        let maxCellH = 12;
        for (let ci = 0; ci < numCols; ci++) {
          const cellText = row[ci]?.[0] || "";
          const cellX = x + ci * colW;
          pdf.fontSize(wf.normal.size - 1).font(ri === 0 ? (wf.bold?.name || "Helvetica-Bold") : wf.normal.name).fillColor("#000000");

          if (ri === 0) {
            pdf.save();
            pdf.rect(cellX, curY, colW, 14).fill("#f3f4f6").stroke("#d1d5db");
            pdf.restore();
            pdf.fillColor("#000000");
          } else {
            pdf.save();
            pdf.rect(cellX, curY, colW, 14).stroke("#d1d5db");
            pdf.restore();
          }

          pdf.text(cellText, cellX + 3, curY + 2, { width: colW - 6, lineBreak: false });
          maxCellH = Math.max(maxCellH, 14);
        }
        curY += maxCellH;
      }
      curY += 4;
      continue;
    }

    if (block.type === "paragraph" && block.segments) {
      const prefix = block.listPrefix || "";
      const indentX = prefix ? x + 15 : x;
      const textWidth = prefix ? width - 15 : width;

      if (prefix) {
        pdf.fontSize(wf.normal.size).font(wf.normal.name).fillColor("#000000");
        pdf.text(prefix, x, curY, { continued: false, width: 15 });
      }

      let isFirst = true;
      for (const seg of block.segments) {
        if (!seg.text) continue;
        let fontName = wf.normal.name;
        if (seg.bold && seg.italic) fontName = "Helvetica-BoldOblique";
        else if (seg.bold) fontName = wf.bold?.name || "Helvetica-Bold";
        else if (seg.italic) fontName = "Helvetica-Oblique";

        const fontSize = seg.fontSize || wf.normal.size;
        const fillColor = seg.color || "#000000";

        pdf.fontSize(fontSize).font(fontName).fillColor(fillColor);

        pdf.text(seg.text, isFirst && !prefix ? x : (isFirst ? indentX : undefined), isFirst ? curY : undefined, {
          continued: true,
          width: isFirst && !prefix ? width : textWidth,
          lineGap,
          underline: seg.underline || false,
        });
        isFirst = false;
      }

      pdf.text("", { continued: false });
      curY = pdf.y;
    }
  }

  return curY;
}

const QR_PATH = path.resolve("attached_assets/FB_ZuB-QRCode,_Email_1772923071043.png");
const UPLOADS_ROOT = path.resolve("server/uploads");

function isTemplateLogoField(field: TemplateField): boolean {
  const id = String(field.id || "").toLowerCase();
  const content = String(field.inhalt || "").trim().toLowerCase();
  return (
    id === "logo" ||
    id.startsWith("logo_") ||
    id.endsWith("_logo") ||
    content === "[firmenlogo]" ||
    content === "[logo]" ||
    content === "logo"
  );
}

function isTemplateQrField(field: TemplateField): boolean {
  const id = String(field.id || "").toLowerCase();
  const content = String(field.inhalt || "").trim().toLowerCase();
  return id.includes("qr") || content === "[qr-code]" || content === "qr-code";
}

function resolveTemplateImagePath(imageUrl?: string | null): string | null {
  const safeUrl = getSafeTemplateImageUrl(imageUrl);
  if (!safeUrl) return null;

  if (safeUrl.startsWith("/api/uploads/")) {
    const filename = safeUrl.replace("/api/uploads/", "");
    const resolved = path.resolve(UPLOADS_ROOT, filename);
    return resolved.startsWith(UPLOADS_ROOT + path.sep) ? resolved : null;
  }

  if (safeUrl.startsWith("/")) {
    return path.resolve("." + safeUrl);
  }

  return path.resolve(safeUrl);
}

function drawConfiguredCompanyLogo(
  pdf: PDFKit.PDFDocument,
  imageUrl: string | null | undefined,
  x: number,
  y: number,
  options: { width?: number; height?: number; fit?: [number, number] },
): boolean {
  const logoPath = resolveTemplateImagePath(imageUrl);
  if (!logoPath || !fs.existsSync(logoPath)) return false;
  try {
    pdf.image(logoPath, x, y, options);
    return true;
  } catch {
    return false;
  }
}

const MARGIN_LEFT = 60;
const MARGIN_RIGHT = 60;
const PAGE_WIDTH = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const FOOTER_Y = 780;

const COL_POS = MARGIN_LEFT;
const COL_DESC = MARGIN_LEFT + 45;
const COL_DESC_WIDTH = 220;
const COL_QTY = PAGE_WIDTH - MARGIN_RIGHT - 195;
const COL_UNIT = PAGE_WIDTH - MARGIN_RIGHT - 155;
const COL_EP = PAGE_WIDTH - MARGIN_RIGHT - 110;
const COL_GP = PAGE_WIDTH - MARGIN_RIGHT - 50;

function fmtDocNumberDisplay(docNumber: string | null | undefined): string {
  if (!docNumber) return "-";
  return fmtDocNumber(docNumber) || "-";
}

function fmtCurrency(value: string | number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined) return "0,00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0,00";
  return num.toLocaleString("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtCurrencyEuroLocal(value: string | number | null | undefined, decimals = 2): string {
  return fmtCurrency(value, decimals) + " €";
}

function fmtNumber(value: string | number | null | undefined, decimals = 2): string {
  return fmtNumberDE(value, decimals) || "0,00";
}

function fmtQuantity(value: string | number | null | undefined, decimals = 2): string {
  return fmtNumber(value, Math.min(Math.max(decimals, 0), 2));
}

function fmtDate(dateStr: string | null): string {
  return fmtDateDE(dateStr) || "";
}

interface FooterInfo {
  companyName: string;
  street: string;
  zipCity: string;
  director: string;
  company: CompanySettings | null;
  templateFooterFields?: { id: string; x: number; y: number; w: number; h: number; inhalt: string; font?: string; farbe?: string }[];
}

function parseFontSpec(fontSpec?: string): { name: string; size: number; bold: boolean } {
  if (!fontSpec) return { name: "Helvetica", size: 9, bold: false };
  const bold = /bold/i.test(fontSpec);
  const oblique = /oblique|italic|kursiv/i.test(fontSpec);
  const sizeMatch = fontSpec.match(/(\d+(?:\.\d+)?)\s*pt/i);
  const size = sizeMatch ? parseFloat(sizeMatch[1]) : 9;
  let name = "Helvetica";
  if (bold && oblique) name = "Helvetica-BoldOblique";
  else if (bold) name = "Helvetica-Bold";
  else if (oblique) name = "Helvetica-Oblique";
  return { name, size, bold };
}

interface WorkAreaFonts {
  normal: { name: string; size: number };
  bold: { name: string; size: number };
  headerFont: { name: string; size: number };
  titel: { name: string; size: number };
  skonto: { name: string; size: number };
}

function resolveWorkAreaFonts(workAreaConfig?: WorkAreaConfig | null): WorkAreaFonts {
  const mainSpec = parseFontSpec(workAreaConfig?.schriftart || undefined);
  const headerSpec = parseFontSpec(workAreaConfig?.tabellenkopf?.schriftart || undefined);
  const titelSpec = parseFontSpec((workAreaConfig as any)?.schriftartTitel || undefined);
  const ec = (workAreaConfig as any)?.endsumme;
  const skontoSpec = parseFontSpec(ec?.schriftartSkonto || ec?.schriftart || undefined);
  return {
    normal: { name: mainSpec.bold ? mainSpec.name : "Helvetica", size: mainSpec.size },
    bold: { name: mainSpec.bold ? mainSpec.name : "Helvetica-Bold", size: mainSpec.size },
    headerFont: { name: headerSpec.name, size: headerSpec.size },
    titel: { name: titelSpec.name || "Helvetica-Bold", size: titelSpec.size || mainSpec.size },
    skonto: { name: skontoSpec.name || (mainSpec.bold ? mainSpec.name : "Helvetica"), size: skontoSpec.size || mainSpec.size },
  };
}

interface ColLayout {
  posX: number; posW: number;
  qtyX: number; qtyW: number;
  unitX: number; unitW: number;
  descX: number; descW: number;
  epX: number; epW: number;
  gpX: number; gpW: number;
  leftEdge: number;
  rightEdge: number;
}

function resolveColLayout(workAreaConfig?: WorkAreaConfig | null, waX?: number, waW?: number): ColLayout {
  const startX = waX ?? MARGIN_LEFT;
  const areaWidth = waW ?? CONTENT_WIDTH;

  const cols = workAreaConfig?.spalten;
  const rightEdge = startX + areaWidth;
  if (!cols?.length) {
    return {
      posX: startX, posW: 40,
      qtyX: rightEdge - 195, qtyW: 40,
      unitX: rightEdge - 155, unitW: 35,
      descX: startX + 45, descW: areaWidth - 45 - 195,
      epX: rightEdge - 110, epW: 55,
      gpX: rightEdge - 50, gpW: 50,
      leftEdge: startX, rightEdge,
    };
  }

  const nameMap: Record<string, string> = {};
  for (const c of cols) {
    const n = (c.name || "").toLowerCase().replace(/[^a-zäöü0-9]/g, "");
    if (n.startsWith("pos")) nameMap.pos = c.name;
    else if (n.startsWith("menge") || n === "mge") nameMap.qty = c.name;
    else if (n.startsWith("me") || n.startsWith("eh") || n === "einheit") nameMap.unit = c.name;
    else if (n.startsWith("bez") || n.startsWith("beschr") || n === "text" || n === "leistung") nameMap.desc = c.name;
    else if (n.startsWith("epreis") || n === "ep" || n === "einzelpreis") nameMap.ep = c.name;
    else if (n.startsWith("gpreis") || n === "gp" || n === "gesamtpreis") nameMap.gp = c.name;
  }

  const layout: ColLayout = {
    posX: startX, posW: 40,
    qtyX: 0, qtyW: 40,
    unitX: 0, unitW: 35,
    descX: 0, descW: 220,
    epX: 0, epW: 55,
    gpX: 0, gpW: 50,
    leftEdge: startX, rightEdge,
  };

  const totalBreite = cols.reduce((s: number, c: any) => s + (c.breite || 0), 0);
  const scale = totalBreite > 0 ? areaWidth / totalBreite : 1;

  let x = startX;
  for (const col of cols) {
    const w = Math.round(col.breite * scale);
    const n = col.name;
    if (n === nameMap.pos) { layout.posX = x; layout.posW = w; }
    else if (n === nameMap.qty) { layout.qtyX = x; layout.qtyW = w; }
    else if (n === nameMap.unit) { layout.unitX = x; layout.unitW = w; }
    else if (n === nameMap.desc) { layout.descX = x; layout.descW = w; }
    else if (n === nameMap.ep) { layout.epX = x; layout.epW = w; }
    else if (n === nameMap.gp) { layout.gpX = x; layout.gpW = w; }
    x += w;
  }

  return layout;
}

export function buildDocumentBundle(
  doc: Document,
  customer: Customer,
  rawItems: DocumentItem[],
  company: CompanySettings | null,
  template?: FormTemplate | null,
  project?: Project | null,
): DocumentBundle {
  const docData: DocumentData = {
    id: doc.id,
    documentNumber: doc.documentNumber,
    type: doc.type,
    customerId: doc.customerId,
    projectId: doc.projectId,
    parentDocumentId: doc.parentDocumentId,
    subject: doc.subject,
    date: doc.date,
    validUntil: doc.validUntil,
    status: doc.status,
    headerText: doc.headerText,
    footerText: doc.footerText,
    beforeWorkText: doc.beforeWorkText,
    beforeTotalsText: doc.beforeTotalsText,
    afterTotalsText: getEffectiveAfterTotalsText(
      doc.afterTotalsText,
      (doc as any).skontoImDokument !== false,
      rawItems.some((item) => item.type === "skonto"),
    ),
    netTotal: doc.netTotal,
    taxRate: doc.taxRate,
    taxAmount: doc.taxAmount,
    grossTotal: doc.grossTotal,
    laborTotal: doc.laborTotal,
    previouslyInvoiced: doc.previouslyInvoiced,
    abschlagNumber: doc.abschlagNumber,
    paymentTermDays: doc.paymentTermDays,
    skontoDays: doc.skontoDays,
    skontoPercent: doc.skontoPercent,
    retentionPercent: doc.retentionPercent,
    paidAmount: doc.paidAmount,
    formTemplateId: doc.formTemplateId,
    hideNetto: doc.hideNetto,
    hideMwst: doc.hideMwst,
    hideGesamt: doc.hideGesamt,
    showLohnanteil: doc.showLohnanteil,
    skontoImDokument: (doc as any).skontoImDokument !== false,
  };

  const customerData: CustomerData = {
    id: customer.id,
    customerNumber: customer.customerNumber || undefined,
    salutation: customer.salutation,
    name: customer.name,
    name2: customer.name2,
    street: customer.street,
    zip: customer.zip,
    city: customer.city,
  };

  const companyData: CompanySettingsData | undefined = company ? {
    companyName: company.companyName || undefined,
    companyName2: (company as any).companyName2 || undefined,
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
    logoUrl: company.logoUrl,
    materialMarkupPercent: (company as any).materialMarkupPercent,
    defaultFormTemplateId: company.defaultFormTemplateId,
  } : undefined;

  const projectData: ProjectData | undefined = project ? {
    id: project.id,
    projectNumber: project.projectNumber || undefined,
    name: project.name,
    description: project.description,
  } : undefined;

  const templateData: FormTemplateData | undefined = template ? {
    id: template.id,
    name: template.name,
    type: template.type || undefined,
    fields: template.fields as TemplateField[] || undefined,
    fieldsPage2: template.fieldsPage2 as TemplateField[] || undefined,
    workArea: template.workArea as WorkAreaConfig || undefined,
  } : undefined;

  const items: DocumentItemData[] = rawItems.map((item, idx) => ({
    id: item.id,
    documentId: item.documentId,
    positionNumber: item.positionNumber || undefined,
    type: item.type,
    title: item.title,
    description: item.description,
    unit: item.unit,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
    laborPrice: item.laborPrice,
    materialPrice: item.materialPrice,
    materialCost: (item as any).materialCost,
    parentItemId: item.parentItemId,
    sortOrder: item.sortOrder,
    positionFlag: item.positionFlag || undefined,
    laborCost: item.laborCost,
    equipmentCost: item.equipmentCost,
    externalCost: item.externalCost,
    laborMarkup: item.laborMarkup,
    materialMarkup: item.materialMarkup,
    equipmentMarkup: item.equipmentMarkup,
    externalMarkup: item.externalMarkup,
    laborTime: item.laborTime,
    priceFollowsCost: (item as any).priceFollowsCost,
    pageBreakBefore: (item as any).pageBreakBefore,
    originalQuantity: item.originalQuantity || null,
    afterTotals: (item as any).afterTotals || false,
    _clientId: `pdf-${item.id || idx}`,
    _parentClientId: null as string | null,
  }));

  const idToClientId = new Map<number, string>();
  const idToType = new Map<number, string>();
  for (const item of items) {
    if (item.id) {
      idToClientId.set(item.id, item._clientId!);
      idToType.set(item.id, item.type);
    }
  }
  for (const item of items) {
    if (item.parentItemId && idToClientId.has(item.parentItemId)) {
      const parentType = idToType.get(item.parentItemId);
      if (parentType === "jumbo") {
        item._parentClientId = idToClientId.get(item.parentItemId)!;
      }
    }
  }

  return {
    document: docData,
    items,
    customer: customerData,
    project: projectData,
    companySettings: companyData,
    template: templateData,
  };
}

export interface AbschlagEntry {
  documentNumber: string;
  date: string;
  netTotal: number;
  taxRate: number;
  taxAmount: number;
  grossTotal: number;
  abschlagNumber: number;
}

export function generateDocumentPdf(
  doc: Document,
  customer: Customer,
  rawItems: DocumentItem[],
  company: CompanySettings | null,
  template?: FormTemplate | null,
  project?: Project | null,
  abschlagChain?: AbschlagEntry[],
  displayMode?: string,
): PDFKit.PDFDocument {
  const bundle = buildDocumentBundle(doc, customer, rawItems, company, template, project);
  
  const computed = computeDocumentBundle(bundle);

  return renderComputedDocumentPdf(computed, doc, company, abschlagChain, displayMode);
}

function renderComputedDocumentPdf(
  computed: ComputedDocumentBundle,
  doc: Document,
  company: CompanySettings | null,
  abschlagChain?: AbschlagEntry[],
  displayMode?: string,
): PDFKit.PDFDocument {
  const { template: resolvedTpl, layout, computed: { visibleItems, totals, numbering } } = computed;
  const mode = normalizePrintDisplayMode(displayMode);
  const hidePrices = mode === "ohne-preise";
  const bundle = computed.source;
  const totalPages = layout.totalPages;

  const typeLabel = (doc as any).customTypeLabel || documentTypeLabels[doc.type] || doc.type;
  const isMitschnitt = doc.type === "mitschnitt";
  const dezMengen = (doc as any).dezimalstellenMengen ?? 2;
  const dezPreise = (doc as any).dezimalstellenPreise ?? 2;

  const pdf = new PDFDocument({
    size: "A4",
    margins: { top: 40, bottom: 10, left: MARGIN_LEFT, right: MARGIN_RIGHT },
    autoFirstPage: false,
    info: {
      Title: `${typeLabel} ${fmtDocNumber(doc.documentNumber)}`,
      Author: company?.companyName || "FriStD-Bau ZuB GmbH & Co.KG",
    },
  });

  const footerInfo: FooterInfo = {
    companyName: company?.companyName || "FriStD-Bau ZuB GmbH & Co.KG",
    street: company?.street || "Haldesdorfer Str. 44",
    zipCity: `${company?.zip || "22179"} ${company?.city || "Hamburg"}`,
    director: company?.managingDirector || "Ronny Friedrich",
    company,
  };

  const workAreaConfig = resolvedTpl.workArea;
  const waX = resolvedTpl.workAreaPage1.x;
  const waW = resolvedTpl.workAreaPage1.w;
  const contentRight = waX + waW;
  const cl = resolveColLayout(workAreaConfig, waX, waW);
  const lineSpacing = workAreaConfig?.zeilenAbstand || 4;
  const lineWidth = workAreaConfig?.linienBreite || 0.3;
  const wf = resolveWorkAreaFonts(workAreaConfig);

  const hasTemplateFooter = (fields: TemplateField[]) => {
    return fields.some(f => f.aktiv !== false && f.drucken !== false && f.y > 700);
  };

  const drawTemplateFieldsForPage = (fields: TemplateField[], pageNum: number) => {
    for (const field of fields) {
      if (field.aktiv === false || field.drucken === false) continue;
      if (field.inhalt?.includes("[Arbeitsbereich]")) continue;

      const fontSpec = parseFontSpec(field.font);
      const color = field.farbe || "#000000";

      const isLogoField = isTemplateLogoField(field);
      const isQRField = isTemplateQrField(field);
      if (field.typ === "Bild" || isLogoField || isQRField) {
        const imgOpts = { width: field.w, height: field.h, fit: [field.w, field.h] as [number, number] };

        const tryLoadImage = (filePath: string): boolean => {
          try {
            if (fs.existsSync(filePath)) {
              pdf.image(filePath, field.x, field.y, imgOpts);
              return true;
            }
          } catch {}
          return false;
        };

        let loaded = false;
        const filePath = resolveTemplateImagePath(field.imageUrl);
        if (filePath) {
          loaded = tryLoadImage(filePath);
          if (!loaded && filePath.endsWith(".bmp")) {
            const pngAlt = filePath.replace(/\.bmp$/i, ".png");
            const jpgAlt = filePath.replace(/\.bmp$/i, ".jpg");
            loaded = tryLoadImage(pngAlt) || tryLoadImage(jpgAlt);
          }
        }
        if (!loaded && isLogoField) {
          const companyLogoPath = resolveTemplateImagePath(bundle.companySettings?.logoUrl);
          if (companyLogoPath) loaded = tryLoadImage(companyLogoPath);
        }
        if (!loaded && isQRField) {
          tryLoadImage(QR_PATH);
        }
      } else if (field.typ === "Variabel" || field.typ === "Variable") {
        const resolved = resolveVariables(
          field.inhalt,
          bundle.document,
          bundle.customer,
          bundle.project,
          bundle.companySettings,
          pageNum,
          totalPages,
        );
        if (resolved.trim()) {
          const align = field.ausrichtung === "rechts" ? "right" as const : field.ausrichtung === "zentriert" ? "center" as const : "left" as const;
          const isFooterField = field.y > 750;
          pdf.fontSize(fontSpec.size).font(fontSpec.name).fillColor(color);
          pdf.text(resolved, field.x, field.y, { width: field.w, lineGap: 2, align, lineBreak: !isFooterField });
        }
      } else if (field.typ === "Text") {
        const align = field.ausrichtung === "rechts" ? "right" as const : field.ausrichtung === "zentriert" ? "center" as const : "left" as const;
        const isFooterField = field.y > 750;
        pdf.fontSize(fontSpec.size).font(fontSpec.name).fillColor(color);
        pdf.text(field.inhalt, field.x, field.y, { width: field.w, lineGap: 2, align, lineBreak: !isFooterField });
      }
    }

    if (!hasTemplateFooter(fields)) {
      drawPageFooter(pdf, footerInfo);
    }
  };

  const getFieldsForPage = (pageNum: number): TemplateField[] => {
    if (pageNum === 1) return resolvedTpl.page1Fields;
    return resolvedTpl.page2Fields;
  };

  const getWorkAreaY = (pageNum: number): number => {
    return pageNum === 1 ? resolvedTpl.workAreaPage1.y : resolvedTpl.workAreaPage2.y;
  };

  const sourceItems = computed.source.items;
  const computedItemMap = new Map<string, ComputedItem>();
  for (const ci of visibleItems) {
    const id = ci._clientId || String(ci.id || "");
    if (id) computedItemMap.set(id, ci);
  }

  function getComputedItem(block: LayoutBlock): DocumentItemData | null {
    if (block.itemId) {
      const ci = computedItemMap.get(block.itemId);
      if (ci) return ci;
    }
    if (block.itemIndex != null && sourceItems[block.itemIndex]) {
      const src = sourceItems[block.itemIndex];
      const id = src._clientId || String(src.id || "");
      const ci = computedItemMap.get(id);
      return ci || src;
    }
    return null;
  }

  let pdfPageNum = 0;
  let y = 0;
  let drewTableHeader = false;

  const footerYForPage = (pNum: number): number => {
    return pNum === 1 ? resolvedTpl.footerYPage1 : resolvedTpl.footerYPage2;
  };

  function addPdfPage(): void {
    pdf.addPage();
    pdfPageNum++;
    const fields = getFieldsForPage(pdfPageNum);
    if (fields.length) {
      drawTemplateFieldsForPage(fields, pdfPageNum);
    } else if (pdfPageNum === 1) {
      drawHeader(pdf, footerInfo, company);
      drawReturnAddress(pdf, footerInfo);
      drawCustomerAddress(pdf, bundle.customer!);
      drawDocumentInfo(pdf, doc, bundle.project);
    }
    y = getWorkAreaY(pdfPageNum);
    drewTableHeader = false;
  }

  function ensureTableHeader(): void {
    if (!drewTableHeader) {
      y = drawTableHeader(pdf, y, cl, wf, workAreaConfig);
      drewTableHeader = true;
    }
  }

  function currentFooterY(): number {
    return footerYForPage(pdfPageNum);
  }

  let lastTitleFlag: string | undefined = undefined;

  for (let pageIdx = 0; pageIdx < layout.pages.length; pageIdx++) {
    const page = layout.pages[pageIdx];

    const visibleBlockTypes = page.blocks.filter(b => b.type !== "carryForward");
    if (visibleBlockTypes.length === 0 && page.blocks.every(b => b.type === "carryForward")) {
      continue;
    }

    addPdfPage();

    if (page.carryForwardIn > 0) {
      drawUebertrag(pdf, page.carryForwardIn, cl, wf, dezPreise);
      y = (pdf.y || y) + 4;
    }

    let sawNonTextBlock = false;

    for (const block of page.blocks) {
      if (block.type === "carryForward") continue;

      if (block.type === "beforeWorkTextBlock") {
        const blockHtml = block.data?.text || doc.beforeWorkText || doc.headerText || "";
        if (blockHtml && stripHtml(blockHtml).trim()) {
          const isHtml = blockHtml.includes("<p>") || blockHtml.includes("<ul>") || blockHtml.includes("<ol>");
          if (isHtml) {
            y = renderHtmlToPdf(pdf, blockHtml, cl.posX, y, cl.rightEdge - cl.posX, wf);
            y += lineSpacing;
          } else {
            const bwText = stripHtml(blockHtml);
            pdf.fontSize(wf.normal.size).font(wf.normal.name).fillColor("#000000");
            pdf.text(bwText, cl.posX, y, { width: cl.rightEdge - cl.posX, lineGap: 1.5, lineBreak: true });
            y = pdf.y + lineSpacing;
          }
        }
        continue;
      }

      if (block.type === "summaryBlock") {
        pdf.y = y;
        const endsummeCfg = workAreaConfig?.endsumme;
        const skontoItems = doc.skontoImDokument === false
          ? []
          : visibleItems.filter((it: any) => it.type === "skonto");
        drawTotalsFromEngine(pdf, totals, doc, cl, endsummeCfg, skontoItems, wf);
        y = pdf.y;
        continue;
      }

      if (block.type === "abschlussBlock") {
        const item = getComputedItem(block);
        if (item) {
          ensureTableHeader();
          y = drawTitleSumRow(pdf, item, "", cl, wf, lineSpacing, lineWidth, y, undefined, dezPreise);
        }
        continue;
      }

      if (block.type === "skontoRow") {
        continue;
      }

      if (block.type === "beforeTotalsTextBlock") {
        const text = doc.beforeTotalsText || (doc.footerText && !doc.afterTotalsText ? doc.footerText : null);
        if (text) {
          drawTextRowSimple(pdf, text, cl, wf, lineSpacing, y);
          y = pdf.y + lineSpacing;
        }
        continue;
      }

      if (block.type === "afterTotalsTextBlock") {
        const text = block.data?.text || getEffectiveAfterTotalsText(
          doc.afterTotalsText,
          (doc as any).skontoImDokument !== false,
          visibleItems.some((item: any) => item.type === "skonto"),
        );
        if (text) {
          drawFooterText(pdf, text, cl, wf);
          y = pdf.y;
        }
        continue;
      }

      const item = getComputedItem(block);
      if (!item) continue;

      const iid = item._clientId || String(item.id || "");
      const itemPosNumber = numbering.get(iid) || item.positionNumber || "";

      if (mode === "kurzliste") {
        const keepTypes = ["titel", "titelsumme", "uebertrag", "abschluss", "nachlass"];
        if (!keepTypes.includes(item.type || "")) continue;
      }
      if (mode === "summenliste") {
        if (item.type !== "titelsumme" && item.type !== "abschluss" && item.type !== "uebertrag") continue;
      }

      switch (block.type) {
        case "titleRow":
          sawNonTextBlock = true;
          ensureTableHeader();
          lastTitleFlag = item.positionFlag || undefined;
          y = drawTitleRow(pdf, item, itemPosNumber, cl, wf, lineSpacing, lineWidth, y);
          break;

        case "textRow":
        case "headerText":
        case "footerText": {
          const isPreTableText = !sawNonTextBlock || block.type === "footerText";
          if (!isPreTableText) ensureTableHeader();
          const plainText = stripHtml(block.data?.titleOverride ?? item.title ?? item.description ?? "");
          if (plainText) {
            pdf.fontSize(wf.normal.size).font(wf.normal.name).fillColor("#000000");
            if (block.data?.titleOverride !== undefined) {
              pdf.text(plainText, cl.posX, y, { width: cl.rightEdge - cl.posX, lineGap: 1.5, lineBreak: true });
              y = pdf.y + lineSpacing;
            } else if (block.splitPart === "top" && block.splitClipHeight) {
              pdf.save();
              pdf.rect(cl.posX - 1, y - 1, cl.rightEdge - cl.posX + 2, block.splitClipHeight + 2).clip();
              pdf.text(plainText, cl.posX, y, { width: cl.rightEdge - cl.posX, lineGap: 1.5, lineBreak: true });
              pdf.restore();
              y += block.splitClipHeight;
            } else if (block.splitPart === "bottom" && block.splitOffsetHeight) {
              pdf.save();
              pdf.rect(cl.posX - 1, y - 1, cl.rightEdge - cl.posX + 2, (block.splitClipHeight || block.estimatedHeight) + 2).clip();
              pdf.text(plainText, cl.posX, y - block.splitOffsetHeight, { width: cl.rightEdge - cl.posX, lineGap: 1.5, lineBreak: true });
              pdf.restore();
              y += (block.splitClipHeight || block.estimatedHeight);
            } else {
              pdf.text(plainText, cl.posX, y, { width: cl.rightEdge - cl.posX, lineGap: 1.5, lineBreak: true });
              y = pdf.y + lineSpacing;
            }
          }
          break;
        }

        case "titleSumRow":
          sawNonTextBlock = true;
          ensureTableHeader();
          y = drawTitleSumRow(pdf, item, itemPosNumber, cl, wf, lineSpacing, lineWidth, y, lastTitleFlag, dezPreise);
          lastTitleFlag = undefined;
          break;

        case "subtotalRow":
          sawNonTextBlock = true;
          ensureTableHeader();
          y = drawSubtotalRow(pdf, item, cl, wf, lineSpacing, lineWidth, y, dezPreise);
          break;

        case "positionRow":
        case "jumboRow":
        case "jumboChildRow": {
          sawNonTextBlock = true;
          ensureTableHeader();
          if (block.splitPart === "top" && block.splitClipHeight) {
            pdf.save();
            pdf.rect(cl.posX - 1, y - 1, cl.rightEdge - cl.posX + 2, block.splitClipHeight + 2).clip();
            drawPositionRow(pdf, item, itemPosNumber, cl, wf, lineSpacing, lineWidth, y, isMitschnitt, hidePrices, dezMengen, dezPreise);
            pdf.restore();
            y += block.splitClipHeight;
          } else if (block.splitPart === "bottom" && block.splitOffsetHeight) {
            pdf.save();
            pdf.rect(cl.posX - 1, y - 1, cl.rightEdge - cl.posX + 2, (block.splitClipHeight || block.estimatedHeight) + 2).clip();
            drawPositionRow(pdf, item, itemPosNumber, cl, wf, lineSpacing, lineWidth, y - block.splitOffsetHeight, isMitschnitt, hidePrices, dezMengen, dezPreise);
            pdf.restore();
            y += (block.splitClipHeight || block.estimatedHeight);
          } else {
            y = drawPositionRow(pdf, item, itemPosNumber, cl, wf, lineSpacing, lineWidth, y, isMitschnitt, hidePrices, dezMengen, dezPreise);
          }
          break;
        }
      }
    }

    if (page.carryForwardOut > 0) {
      const uebertragOutY = currentFooterY() - 20;
      pdf.y = uebertragOutY;
      drawUebertrag(pdf, page.carryForwardOut, cl, wf, dezPreise);
    }
  }

  {
    let restsummeBrutto: number | undefined;
    if (abschlagChain && abschlagChain.length > 0 && (doc.abschlagNumber || 0) > 1) {
      const checkPageBreakSimple = (neededHeight: number) => {
        if (y + neededHeight > currentFooterY() - 14) {
          addPdfPage();
          ensureTableHeader();
        }
      };
      const result = drawRechnungenTable(pdf, doc, totals, cl, wf, abschlagChain, checkPageBreakSimple);
      restsummeBrutto = result.restsummeBrutto;
    }

    drawPaymentTerms(pdf, doc, totals, cl, wf, restsummeBrutto, workAreaConfig?.endsumme);

    const lastPageFields = getFieldsForPage(pdfPageNum);
    if (!lastPageFields.length) {
      drawPageFooter(pdf, footerInfo);
    }
  }

  return pdf;
}

function drawTitleRow(
  pdf: PDFKit.PDFDocument,
  item: DocumentItemData,
  posNumber: string,
  cl: ColLayout,
  wf: WorkAreaFonts,
  lineSpacing: number,
  lineWidth: number,
  y: number,
): number {
  y += lineSpacing + 2;
  pdf.fontSize(wf.titel.size).font(wf.titel.name).fillColor("#000000")
    .text(posNumber, cl.posX, y, { width: cl.posW });
  pdf.text(stripHtml(item.title || ""), cl.descX, y, { width: cl.descW + 160 });
  y = pdf.y + 2;
  pdf.moveTo(cl.leftEdge, y).lineTo(cl.rightEdge, y)
    .strokeColor("#000000").lineWidth(lineWidth).stroke();
  y += lineSpacing;

  if (item.type === "gruppe") {
    const plainDesc = stripHtml(item.description || "");
    if (plainDesc) {
      pdf.fontSize(wf.normal.size).font(wf.normal.name).fillColor("#000000")
        .text(plainDesc, cl.descX, y + 1, { width: cl.descW + 100, lineGap: 1 });
      y = pdf.y + 2;
    }
  }
  return y;
}

function drawTextRow(
  pdf: PDFKit.PDFDocument,
  item: DocumentItemData,
  cl: ColLayout,
  wf: WorkAreaFonts,
  lineSpacing: number,
  y: number,
): number {
  const plainText = stripHtml(item.title || item.description || "");
  if (!plainText) return y;
  pdf.fontSize(wf.normal.size).font(wf.normal.name).fillColor("#000000")
    .text(plainText, cl.posX, y, { width: cl.rightEdge - cl.posX, lineGap: 1.5 });
  y = pdf.y + lineSpacing;
  return y;
}

function drawTitleSumRow(
  pdf: PDFKit.PDFDocument,
  item: DocumentItemData,
  posNumber: string,
  cl: ColLayout,
  wf: WorkAreaFonts,
  lineSpacing: number,
  lineWidth: number,
  y: number,
  titleFlag?: string,
  dezPreise: number = 2,
): number {
  y += 4;
  const label = stripHtml(item.title || "") || `Summe ${posNumber}`.trim();
  const isBedarfOrAlt = titleFlag === "bedarf" || titleFlag === "alternativ";
  const fontName = isBedarfOrAlt ? "Helvetica-BoldOblique" : wf.bold.name;
  const fontColor = isBedarfOrAlt ? "#4a5568" : "#000000";
  pdf.fontSize(wf.bold.size).font(fontName).fillColor(fontColor)
    .text(label, cl.descX - 40, y, { width: cl.descW + 40 });
  pdf.font(isBedarfOrAlt ? "Helvetica-Oblique" : wf.normal.name).fillColor(isBedarfOrAlt ? "#718096" : "#000000");
  pdf.text(fmtCurrency(item.totalPrice, dezPreise), cl.gpX, y, { width: cl.gpW, align: "right" });
  y = pdf.y + 4;
  pdf.moveTo(cl.leftEdge, y).lineTo(cl.rightEdge, y)
    .strokeColor("#000000").lineWidth(lineWidth).stroke();
  y += lineSpacing + 4;
  return y;
}

function drawSubtotalRow(
  pdf: PDFKit.PDFDocument,
  item: DocumentItemData,
  cl: ColLayout,
  wf: WorkAreaFonts,
  lineSpacing: number,
  lineWidth: number,
  y: number,
  dezPreise: number = 2,
): number {
  y += 4;
  const label = stripHtml(item.title || "Zwischensumme");
  pdf.fontSize(wf.bold.size).font(wf.bold.name).fillColor("#000000")
    .text(label, cl.descX - 40, y, { width: cl.descW + 40 });
  pdf.text(fmtCurrency(item.totalPrice, dezPreise), cl.gpX, y, { width: cl.gpW, align: "right" });
  y = pdf.y + 4;
  pdf.moveTo(cl.leftEdge, y).lineTo(cl.rightEdge, y)
    .strokeColor("#000000").lineWidth(lineWidth).stroke();
  y += lineSpacing + 4;
  return y;
}

function drawPositionRow(
  pdf: PDFKit.PDFDocument,
  item: DocumentItemData,
  posNumber: string,
  cl: ColLayout,
  wf: WorkAreaFonts,
  lineSpacing: number,
  lineWidth: number,
  y: number,
  isMitschnitt: boolean = false,
  hidePrices: boolean = false,
  dezMengen: number = 2,
  dezPreise: number = 2,
): number {
  const plainTitle = stripHtml(item.title || "");
  const plainDesc = stripHtml(item.description || "");
  const flag = item.positionFlag;
  const isAlt = flag === "alternativ";
  const isBedarf = flag === "bedarf";
  const isOptional = isAlt || isBedarf;
  const fmtOptionalCurrency = (value: string | number | null | undefined) => {
    const formatted = fmtCurrency(value, dezPreise);
    return isOptional ? `(${formatted})` : formatted;
  };

  pdf.fontSize(wf.normal.size).font(wf.normal.name).fillColor("#000000");
  pdf.text(posNumber, cl.posX, y, { width: cl.posW });

  if (isAlt || isBedarf) {
    const defaultLabel = isAlt ? "Alternativposition" : "Bedarfsposition";
    const label = (item as any).flagLabel || defaultLabel;
    pdf.fontSize(wf.normal.size - 2).font("Helvetica-Oblique").fillColor("#7b341e")
      .text(`(${label})`, cl.descX, y, { width: cl.descW });
    y = pdf.y + 1;
  }

  const altNormalFont = isAlt || isBedarf ? "Helvetica-Oblique" : wf.normal.name;

  pdf.fontSize(wf.normal.size).font(altNormalFont).fillColor(isAlt || isBedarf ? "#4a5568" : "#000000")
    .text(plainTitle || "", cl.descX, y, { width: cl.descW });
  let descEndY = pdf.y;

  if (plainDesc) {
    pdf.font(altNormalFont).fontSize(wf.normal.size).fillColor(isAlt || isBedarf ? "#718096" : "#000000")
      .text(plainDesc, cl.descX, descEndY + 1, { width: cl.descW, lineGap: 1 });
    descEndY = pdf.y + 2;
  }

  const rowStartY = y;
  pdf.fontSize(wf.normal.size).font(altNormalFont).fillColor(isAlt || isBedarf ? "#718096" : "#000000");
  pdf.text(fmtQuantity(item.quantity, dezMengen), cl.qtyX, rowStartY, { width: cl.qtyW, align: "right" });
  pdf.text(item.unit || "", cl.unitX, rowStartY, { width: cl.unitW, align: "center" });
  if (!hidePrices) {
    pdf.text(fmtCurrency(item.unitPrice, dezPreise), cl.epX, rowStartY, { width: cl.epW, align: "right" });
    pdf.text(fmtOptionalCurrency(item.totalPrice), cl.gpX, rowStartY, { width: cl.gpW, align: "right" });
  }

  let qtyEndY = rowStartY + 14;
  if (isMitschnitt && item.originalQuantity) {
    const rawOrig = String(item.originalQuantity);
    const origQty = parseFloat(rawOrig.includes(",") ? rawOrig.replace(/\./g, "").replace(",", ".") : rawOrig) || 0;
    if (origQty !== 0) {
      pdf.fontSize(wf.normal.size - 3).font(altNormalFont).fillColor("#999999");
      pdf.text(`(${fmtQuantity(origQty, dezMengen)})`, cl.qtyX, rowStartY + 11, { width: cl.qtyW, align: "right" });
      qtyEndY = rowStartY + 22;
    }
  }

  y = Math.max(descEndY, qtyEndY) + 2;
  y += lineSpacing;
  return y;
}

function drawTextRowSimple(pdf: PDFKit.PDFDocument, text: string, cl: ColLayout, wf: WorkAreaFonts, lineSpacing: number, y: number): void {
  const plainText = stripHtml(text);
  if (!plainText) return;
  pdf.fontSize(wf.normal.size).font(wf.normal.name).fillColor("#000000");
  pdf.text(plainText, cl.posX, y, { width: cl.rightEdge - cl.posX, lineGap: 1.5, lineBreak: true });
}

function drawUebertrag(pdf: PDFKit.PDFDocument, runningTotal: number, cl: ColLayout, wf: WorkAreaFonts, dezPreise: number = 2) {
  const uebertragY = pdf.y || 0;
  pdf.fontSize(wf.normal.size).font(wf.normal.name).fillColor("#666666");
  const areaW = cl.rightEdge - cl.leftEdge;
  const centerX = cl.leftEdge + (areaW / 2) - 20;
  pdf.text("Übertrag", centerX, uebertragY, { width: 80, align: "right" });
  pdf.text(fmtCurrency(runningTotal, dezPreise), cl.gpX, uebertragY, { width: cl.gpW, align: "right" });
}

function drawTableHeader(pdf: PDFKit.PDFDocument, y: number, cl: ColLayout, wf: WorkAreaFonts, workAreaConfig?: WorkAreaConfig | null): number {
  const cols = workAreaConfig?.spalten;
  const areaW = cl.rightEdge - cl.leftEdge;
  const headerLineW = (workAreaConfig?.tabellenkopf as any)?.linienBreite ?? 1;

  if (cols?.length) {
    const headerBg = workAreaConfig?.tabellenkopf?.hintergrund || "#ffffff";
    if (headerBg && headerBg !== "transparent" && headerBg !== "#ffffff" && headerBg !== "#fff") {
      pdf.rect(cl.leftEdge, y - 2, areaW, 16).fill(headerBg);
    }

    pdf.fontSize(wf.headerFont.size).font(wf.headerFont.name).fillColor("#000000");

    const totalBreite = cols.reduce((s: number, c: any) => s + (c.breite || 0), 0);
    const scale = totalBreite > 0 ? areaW / totalBreite : 1;
    let colX = cl.leftEdge;
    for (const col of cols) {
      const w = Math.round(col.breite * scale);
      const align = col.ausrichtung === "rechts" ? "right" as const : col.ausrichtung === "zentriert" ? "center" as const : "left" as const;
      pdf.text(col.name, colX, y + 2, { width: w, align, lineBreak: false });
      colX += w;
    }

    const lineY = y + 16;
    pdf.moveTo(cl.leftEdge, lineY).lineTo(cl.rightEdge, lineY)
      .strokeColor("#000000").lineWidth(headerLineW).stroke();
    return lineY + 4;
  }

  pdf.fontSize(wf.headerFont.size).font(wf.headerFont.name).fillColor("#000000");
  pdf.fillColor("#000000");
  pdf.text("Pos", cl.posX, y + 2, { width: cl.posW });
  pdf.text("Menge", cl.qtyX, y + 2, { width: cl.qtyW, align: "right" });
  pdf.text("ME", cl.unitX, y + 2, { width: cl.unitW, align: "center" });
  pdf.text("Bezeichnung", cl.descX, y + 2, { width: cl.descW });
  pdf.text("E-Preis", cl.epX, y + 2, { width: cl.epW, align: "right" });
  pdf.text("G-Preis", cl.gpX, y + 2, { width: cl.gpW, align: "right" });

  const lineY = y + 16;
  pdf.moveTo(cl.leftEdge, lineY).lineTo(cl.rightEdge, lineY)
    .strokeColor("#000000").lineWidth(headerLineW).stroke();
  return lineY + 4;
}

function drawTotalsFromEngine(
  pdf: PDFKit.PDFDocument,
  totals: DocumentTotals,
  doc: Document,
  cl: ColLayout,
  endsummeCfg?: EndsummeConfig,
  skontoItems?: any[],
  wf?: WorkAreaFonts,
) {
  const cfg = {
    labelNetto: "Nettosumme",
    labelMwst: "Umsatzsteuer {satz} %",
    labelGesamt: "Gesamtsumme",
    labelLohn: "Enthaltener Lohnanteil gem. §35a EStG: {betrag}",
    linienBreite: 0.5,
    linienBreiteGesamt: 1,
    abstandZeilen: 4,
    schriftart: "",
    schriftartGesamt: "",
    ...endsummeCfg,
  };

  const fontNormal = parseFontSpec(cfg.schriftart || undefined);
  const fontGesamt = parseFontSpec(cfg.schriftartGesamt || undefined);
  const rowH = Math.max(fontNormal.size, 9) + cfg.abstandZeilen + 2;
  const rowHGesamt = Math.max(fontGesamt.size, 10) + cfg.abstandZeilen + 4;

  let y = pdf.y + 4;

  const labelCol = cl.leftEdge;
  const valCol = cl.rightEdge - 80;
  const areaW = cl.rightEdge - cl.leftEdge;
  const labelWidth = areaW - 85;

  const hideNetto = doc.hideNetto === true;
  const hideMwst = doc.hideMwst === true;
  const hideGesamt = doc.hideGesamt === true;

  const firstVisible = !hideNetto ? "netto" : !hideMwst ? "mwst" : !hideGesamt ? "gesamt" : null;

  if (!hideNetto) {
    pdf.moveTo(cl.leftEdge, y).lineTo(cl.rightEdge, y)
      .strokeColor("#000000").lineWidth(cfg.linienBreite).stroke();
    y += 4;

    pdf.fontSize(fontNormal.size).font(fontNormal.name).fillColor("#000000");
    pdf.text(cfg.labelNetto, labelCol, y, { width: labelWidth });
    pdf.text(fmtCurrencyEuroLocal(totals.netTotal), valCol, y, { width: 80, align: "right" });
    y += rowH;
  }

  if (!hideMwst) {
    if (firstVisible === "mwst") {
      pdf.moveTo(cl.leftEdge, y).lineTo(cl.rightEdge, y)
        .strokeColor("#000000").lineWidth(cfg.linienBreite).stroke();
      y += 4;
    }
    const mwstLabel = (cfg.labelMwst || "").replace("{satz}", String(totals.taxRate));
    pdf.fontSize(fontNormal.size).font(fontNormal.name).fillColor("#000000");
    pdf.text(mwstLabel, labelCol, y, { width: labelWidth });
    pdf.text(fmtCurrencyEuroLocal(totals.taxAmount), valCol, y, { width: 80, align: "right" });
    y += rowH;
  }

  if (totals.previouslyInvoiced > 0) {
    pdf.text("Abzgl. bereits berechnet", labelCol, y, { width: labelWidth });
    pdf.text(`-${fmtCurrencyEuroLocal(totals.previouslyInvoiced)}`, valCol, y, { width: 80, align: "right" });
    y += rowH;
  }

  if (!hideGesamt) {
    if (firstVisible === "gesamt") {
      pdf.moveTo(cl.leftEdge, y).lineTo(cl.rightEdge, y)
        .strokeColor("#000000").lineWidth(cfg.linienBreite).stroke();
    } else {
      pdf.moveTo(cl.leftEdge, y).lineTo(cl.rightEdge, y)
        .strokeColor("#000000").lineWidth(cfg.linienBreiteGesamt).stroke();
    }
    y += 4;

    pdf.fontSize(fontGesamt.size).font(fontGesamt.name).fillColor("#000000");
    pdf.text(cfg.labelGesamt, labelCol, y, { width: labelWidth });
    pdf.text(fmtCurrencyEuroLocal(totals.grossTotal), valCol, y, { width: 80, align: "right" });
    y += rowHGesamt;

    if (totals.laborTotal > 0 && doc.showLohnanteil) {
      const lohnLabel = (cfg.labelLohn || "").replace("{betrag}", fmtCurrencyEuroLocal(totals.laborTotal));
      pdf.fontSize(fontNormal.size - 1).font(fontNormal.name).fillColor("#000000");
      pdf.text(lohnLabel, labelCol, y, { width: areaW, align: "right" });
      y += 12;
    }
  }

  if (skontoItems && skontoItems.length > 0) {
    const skontoFont = wf?.skonto || fontNormal;
    for (const skontoItem of skontoItems) {
      pdf.moveTo(cl.leftEdge, y).lineTo(cl.rightEdge, y)
        .strokeColor("#cccccc").lineWidth(cfg.linienBreite).stroke();
      y += 3;
      const skontoTitle = stripHtml(skontoItem.title || "Skonto");
      const skontoAmount = parseFloat(String(skontoItem.totalPrice || "0"));
      pdf.fontSize(skontoFont.size).font(skontoFont.name).fillColor("#000000");
      pdf.text(skontoTitle, labelCol, y, { width: labelWidth });
      pdf.text(fmtCurrencyEuroLocal(skontoAmount), valCol, y, { width: 80, align: "right" });
      y += rowH;

      const skontoHint = stripHtml(skontoItem.description || "");
      if (skontoHint) {
        pdf.fontSize(skontoFont.size).font(skontoFont.name).fillColor("#333333");
        pdf.text(skontoHint, labelCol, y, { width: areaW, align: "right" });
        y = pdf.y + 2;
      }
    }
  }

  pdf.y = y;
}

function drawHeader(
  pdf: PDFKit.PDFDocument,
  footer: FooterInfo,
  company: CompanySettings | null
) {
  if (fs.existsSync(QR_PATH)) {
    pdf.image(QR_PATH, MARGIN_LEFT, 30, { width: 45 });
  }

  if (!drawConfiguredCompanyLogo(pdf, company?.logoUrl, MARGIN_LEFT + 55, 30, { width: 200 })) {
    pdf.fontSize(16).font("Helvetica-Bold")
      .fillColor("#000000")
      .text(footer.companyName, MARGIN_LEFT + 55, 40, { width: 280 });
  }

  pdf.fontSize(8).font("Helvetica")
    .fillColor("#333333");

  const rightX = PAGE_WIDTH - MARGIN_RIGHT - 160;
  let rightY = 35;

  pdf.text(footer.street, rightX, rightY, { width: 160, align: "right" });
  rightY += 11;
  pdf.text(footer.zipCity, rightX, rightY, { width: 160, align: "right" });
  rightY += 11;
  if (company?.phone) {
    pdf.text(`Tel: ${company.phone}`, rightX, rightY, { width: 160, align: "right" });
    rightY += 11;
  }
  if (company?.email) {
    pdf.text(company.email, rightX, rightY, { width: 160, align: "right" });
    rightY += 11;
  }
  if (company?.website) {
    pdf.text(company.website, rightX, rightY, { width: 160, align: "right" });
  }

  pdf.moveTo(MARGIN_LEFT, 90).lineTo(PAGE_WIDTH - MARGIN_RIGHT, 90)
    .strokeColor("#000000").lineWidth(1).stroke();
}

function drawReturnAddress(pdf: PDFKit.PDFDocument, footer: FooterInfo) {
  pdf.fontSize(6).font("Helvetica").fillColor("#333333")
    .text(`${footer.companyName} \u00b7 ${footer.street} \u00b7 ${footer.zipCity}`, MARGIN_LEFT, 105, { underline: true });
}

function drawCustomerAddress(pdf: PDFKit.PDFDocument, customer: CustomerData) {
  let y = 118;
  pdf.fontSize(10).font("Helvetica").fillColor("#000000");

  if (customer.salutation) {
    pdf.text(customer.salutation, MARGIN_LEFT, y);
    y += 14;
  }
  pdf.font("Helvetica-Bold").text(customer.name, MARGIN_LEFT, y);
  y += 14;
  if (customer.name2) {
    pdf.font("Helvetica").text(customer.name2, MARGIN_LEFT, y);
    y += 14;
  }
  if (customer.street) {
    pdf.font("Helvetica").text(customer.street, MARGIN_LEFT, y);
    y += 14;
  }
  if (customer.zip || customer.city) {
    pdf.font("Helvetica").text(`${customer.zip || ""} ${customer.city || ""}`.trim(), MARGIN_LEFT, y);
  }
}

function drawDocumentInfo(pdf: PDFKit.PDFDocument, doc: Document, project?: ProjectData | null) {
  const rightX = PAGE_WIDTH - MARGIN_RIGHT - 160;
  let y = 118;

  pdf.fontSize(8).font("Helvetica").fillColor("#333333");

  if (project?.projectNumber) {
    pdf.text("Projekt-Nr.:", rightX, y, { width: 60 });
    pdf.font("Helvetica-Bold").fillColor("#333333")
      .text(fmtDocNumber(project.projectNumber), rightX + 60, y, { width: 100, align: "right" });
    y += 14;
    pdf.font("Helvetica").fillColor("#333333");
  }

  pdf.text("Kunden-Nr.:", rightX, y, { width: 60 });
  pdf.font("Helvetica-Bold").fillColor("#333333")
    .text(doc.customerId ? String(doc.customerId) : "", rightX + 60, y, { width: 100, align: "right" });
  y += 14;

  pdf.font("Helvetica").fillColor("#333333")
    .text("Datum:", rightX, y, { width: 60 });
  pdf.font("Helvetica-Bold").fillColor("#333333")
    .text(fmtDate(doc.date), rightX + 60, y, { width: 100, align: "right" });
  y += 14;

  if (doc.validUntil) {
    pdf.font("Helvetica").fillColor("#333333")
      .text("G\u00fcltig bis:", rightX, y, { width: 60 });
    pdf.font("Helvetica-Bold").fillColor("#333333")
      .text(fmtDate(doc.validUntil), rightX + 60, y, { width: 100, align: "right" });
    y += 14;
  }

  if (doc.abschlagNumber) {
    pdf.font("Helvetica").fillColor("#333333")
      .text("Abschlag:", rightX, y, { width: 60 });
    pdf.font("Helvetica-Bold").fillColor("#333333")
      .text(`${doc.abschlagNumber}.`, rightX + 60, y, { width: 100, align: "right" });
  }
}

function drawSubject(pdf: PDFKit.PDFDocument, doc: Document) {
  let y = 200;
  const typeLabel = (doc as any).customTypeLabel || documentTypeLabels[doc.type] || doc.type;

  pdf.fontSize(14).font("Helvetica-Bold").fillColor("#000000")
    .text(`${typeLabel} ${fmtDocNumber(doc.documentNumber)}`, MARGIN_LEFT, y);
  y = pdf.y + 4;

  if (doc.subject) {
    pdf.fontSize(10).font("Helvetica").fillColor("#000000")
      .text(`Bauvorhaben: ${doc.subject}`, MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  }
}

function drawHeaderText(pdf: PDFKit.PDFDocument, text: string, cl: ColLayout, wf: WorkAreaFonts) {
  const y = pdf.y + 12;
  const areaW = cl.rightEdge - cl.leftEdge;
  pdf.fontSize(wf.normal.size).font(wf.normal.name).fillColor("#000000")
    .text(text, cl.leftEdge, y, { width: areaW, lineGap: 2 });
}

function drawFooterText(pdf: PDFKit.PDFDocument, text: string, cl: ColLayout, wf: WorkAreaFonts) {
  let y = pdf.y + 4;
  const areaW = cl.rightEdge - cl.leftEdge;
  pdf.fontSize(Math.min(wf.normal.size, 7.6)).font(wf.normal.name).fillColor("#000000")
    .text(text, cl.leftEdge, y, { width: areaW, lineGap: 0.4 });
}

function drawRechnungenTable(
  pdf: PDFKit.PDFDocument,
  doc: Document,
  totals: DocumentTotals,
  cl: ColLayout,
  wf: WorkAreaFonts,
  abschlagChain: AbschlagEntry[],
  checkPageBreak: (needed: number) => void,
): { restsummeNetto: number; restsummeUst: number; restsummeBrutto: number } {
  const previousEntries = abschlagChain.filter(e => e.abschlagNumber < (doc.abschlagNumber || 0));
  if (previousEntries.length === 0) {
    return { restsummeNetto: totals.netTotal, restsummeUst: totals.taxAmount, restsummeBrutto: totals.grossTotal };
  }

  const areaW = cl.rightEdge - cl.leftEdge;
  const tableH = 14;
  const neededH = (previousEntries.length + 4) * tableH + 30;
  checkPageBreak(neededH);

  let y = pdf.y + 10;

  pdf.moveTo(cl.leftEdge, y).lineTo(cl.rightEdge, y)
    .strokeColor("#333333").lineWidth(0.75).stroke();
  y += 4;

  const colVom = cl.leftEdge + 220;
  const colNetto = colVom + 65;
  const colSatz = colNetto + 70;
  const colUst = colSatz + 30;
  const colBrutto = colUst + 60;

  pdf.fontSize(8).font("Helvetica-Bold").fillColor("#000000");
  pdf.text("RECHNUNGEN", cl.leftEdge, y, { width: 200 });
  pdf.text("vom", colVom, y, { width: 60 });
  pdf.text("Netto", colNetto, y, { width: 65, align: "right" });
  pdf.text("Satz", colSatz, y, { width: 28, align: "right" });
  pdf.text("USt", colUst, y, { width: 55, align: "right" });
  pdf.text("Brutto", colBrutto, y, { width: 55, align: "right" });
  y += tableH + 2;

  pdf.moveTo(cl.leftEdge, y - 2).lineTo(cl.rightEdge, y - 2)
    .strokeColor("#aaaaaa").lineWidth(0.3).stroke();

  const taxRate = parseFloat(String(doc.taxRate)) || 19;

  pdf.fontSize(8).font("Helvetica-Bold").fillColor("#000000");
  pdf.text("Gesamtrechnungsbetrag", cl.leftEdge, y, { width: 200 });
  pdf.text(fmtDateDE(doc.date), colVom, y, { width: 60 });
  pdf.text(fmtCurrencyDE(totals.netTotal), colNetto, y, { width: 65, align: "right" });
  pdf.text(`${fmtNumberDE(taxRate)}%`, colSatz, y, { width: 28, align: "right" });
  pdf.text(fmtCurrencyDE(totals.taxAmount), colUst, y, { width: 55, align: "right" });
  pdf.text(fmtCurrencyDE(totals.grossTotal), colBrutto, y, { width: 55, align: "right" });
  y += tableH + 4;

  pdf.fontSize(8).font("Helvetica").fillColor("#000000");
  let sumPrevNetto = 0;
  let sumPrevUst = 0;
  let sumPrevBrutto = 0;

  for (const entry of previousEntries) {
    const label = `${entry.abschlagNumber}. Rechnung ${fmtDocNumber(entry.documentNumber)}`;
    pdf.text(label, cl.leftEdge, y, { width: 200 });
    pdf.text(fmtDateDE(entry.date), colVom, y, { width: 60 });
    pdf.text(fmtCurrencyDE(entry.netTotal), colNetto, y, { width: 65, align: "right" });
    pdf.text(`${fmtNumberDE(entry.taxRate)}%`, colSatz, y, { width: 28, align: "right" });
    pdf.text(fmtCurrencyDE(entry.taxAmount), colUst, y, { width: 55, align: "right" });
    pdf.text(fmtCurrencyDE(entry.grossTotal), colBrutto, y, { width: 55, align: "right" });
    y += tableH;

    sumPrevNetto += entry.netTotal;
    sumPrevUst += entry.taxAmount;
    sumPrevBrutto += entry.grossTotal;
  }

  y += 2;
  pdf.moveTo(cl.leftEdge, y).lineTo(cl.rightEdge, y)
    .strokeColor("#aaaaaa").lineWidth(0.3).stroke();
  y += 4;

  pdf.fontSize(8).font("Helvetica").fillColor("#000000");
  pdf.text("Summe Abschläge/Teilrechnungen", cl.leftEdge, y, { width: 200 });
  pdf.text(fmtCurrencyDE(sumPrevNetto), colNetto, y, { width: 65, align: "right" });
  pdf.text(`${fmtNumberDE(taxRate)}%`, colSatz, y, { width: 28, align: "right" });
  pdf.text(fmtCurrencyDE(sumPrevUst), colUst, y, { width: 55, align: "right" });
  pdf.text(fmtCurrencyDE(sumPrevBrutto), colBrutto, y, { width: 55, align: "right" });
  y += tableH + 2;

  const restsummeNetto = totals.netTotal - sumPrevNetto;
  const restsummeUst = totals.taxAmount - sumPrevUst;
  const restsummeBrutto = totals.grossTotal - sumPrevBrutto;

  pdf.moveTo(cl.leftEdge, y).lineTo(cl.rightEdge, y)
    .strokeColor("#333333").lineWidth(0.75).stroke();
  y += 4;

  pdf.fontSize(8).font("Helvetica-Bold").fillColor("#000000");
  pdf.text("Restsumme", cl.leftEdge, y, { width: 200 });
  pdf.text(fmtCurrencyDE(restsummeNetto), colNetto, y, { width: 65, align: "right" });
  pdf.text(`${fmtNumberDE(taxRate)}%`, colSatz, y, { width: 28, align: "right" });
  pdf.text(fmtCurrencyDE(restsummeUst), colUst, y, { width: 55, align: "right" });
  pdf.text(fmtCurrencyDE(restsummeBrutto), colBrutto, y, { width: 55, align: "right" });
  y += tableH + 4;

  pdf.y = y;
  return { restsummeNetto, restsummeUst, restsummeBrutto };
}

function drawPaymentTerms(pdf: PDFKit.PDFDocument, doc: Document, totals: DocumentTotals, cl: ColLayout, wf: WorkAreaFonts, restsummeBrutto?: number, endsummeCfg?: EndsummeConfig) {
  let y = pdf.y + 6;
  const areaW = cl.rightEdge - cl.leftEdge;
  const labelCol = cl.leftEdge;
  const valCol = cl.rightEdge - 80;
  const labelWidth = areaW - 85;

  const fontGesamt = parseFontSpec(endsummeCfg?.schriftartGesamt || undefined);

  const skontoPercent = doc.skontoImDokument === false
    ? 0
    : doc.skontoPercent ? parseFloat(doc.skontoPercent) : 0;
  const skontoDays = doc.skontoDays || 0;
  const paymentDays = doc.paymentTermDays || 14;

  const basisBrutto = restsummeBrutto != null ? restsummeBrutto : totals.grossTotal;

  const retentionPercent = doc.retentionPercent ? parseFloat(doc.retentionPercent) : 0;
  let zahlbetrag = basisBrutto;
  if (retentionPercent > 0) {
    const retentionAmount = Math.round(basisBrutto * retentionPercent / 100 * 100) / 100;
    zahlbetrag = basisBrutto - retentionAmount;
    pdf.fontSize(wf.normal.size).font(wf.normal.name).fillColor("#000000")
      .text(`./. ${fmtNumber(String(retentionPercent))}% Sicherheitseinbehalt: ${fmtCurrencyEuroLocal(retentionAmount)}`, cl.leftEdge, y, { width: areaW });
    y = pdf.y + 2;
  }

  if (restsummeBrutto != null || retentionPercent > 0) {
    pdf.fontSize(fontGesamt.size).font(fontGesamt.name).fillColor("#000000");
    pdf.text("Zahlbetrag:", labelCol, y, { width: labelWidth });
    pdf.text(fmtCurrencyEuroLocal(zahlbetrag), valCol, y, { width: 80, align: "right" });
    y = pdf.y + 4;
  }

  if (skontoPercent > 0 && skontoDays > 0) {
    const skontoBasis = retentionPercent > 0 ? (basisBrutto - Math.round(basisBrutto * retentionPercent / 100 * 100) / 100) : basisBrutto;
    const skontoAmount = Math.round(skontoBasis * skontoPercent / 100 * 100) / 100;
    const skontoTotal = skontoBasis - skontoAmount;

    pdf.fontSize(wf.skonto.size).font(wf.skonto.name).fillColor("#000000")
      .text(
        `Zahlbar innerhalb von ${paymentDays} Tagen netto. Bei Zahlung innerhalb von ${skontoDays} Tagen gew\u00e4hren wir ${fmtNumber(String(skontoPercent))}% Skonto (${fmtCurrencyEuroLocal(skontoAmount)}). Skontierter Betrag: ${fmtCurrencyEuroLocal(skontoTotal)}`,
        cl.leftEdge, y, { width: areaW, lineGap: 2 }
      );
  } else {
    pdf.fontSize(wf.skonto.size).font(wf.skonto.name).fillColor("#000000")
      .text(`Zahlbar innerhalb von ${paymentDays} Tagen netto.`, cl.leftEdge, y, { width: areaW });
  }
}

function drawPageFooter(pdf: PDFKit.PDFDocument, footer: FooterInfo) {
  const fields = footer.templateFooterFields;
  if (fields && fields.length > 0) {
    for (const f of fields) {
      const spec = parseFontSpec(f.font);
      pdf.fontSize(spec.size).font(spec.name).fillColor(f.farbe || "#333333");
      const lines = (f.inhalt || "").split("\n");
      const lh = spec.size + 2;
      for (let i = 0; i < lines.length; i++) {
        pdf.text(lines[i], f.x, f.y + i * lh, { width: f.w, lineGap: 0 });
      }
    }
    return;
  }

  pdf.fontSize(6).font("Helvetica").fillColor("#666666");

  pdf.moveTo(MARGIN_LEFT, FOOTER_Y - 6).lineTo(PAGE_WIDTH - MARGIN_RIGHT, FOOTER_Y - 6)
    .strokeColor("#cccccc").lineWidth(0.5).stroke();

  const col1 = MARGIN_LEFT;
  const col2 = MARGIN_LEFT + 160;
  const col3 = PAGE_WIDTH - MARGIN_RIGHT - 160;
  const lh = 8;

  pdf.text(`Geschäftsführer: ${footer.director}`, col1, FOOTER_Y, { width: 155 });
  pdf.text("Vollhafter: FriStD-Bau Verwaltungs GmbH , HRB 117552", col1, FOOTER_Y + lh, { width: 155 });
  pdf.text(`${footer.companyName}, HRA 112897`, col1, FOOTER_Y + lh * 2, { width: 155 });

  pdf.text("Bankverbindungen:", col2, FOOTER_Y, { width: 175 });
  const bankName1 = footer.company?.bankName || "Deutsche Bank";
  const iban1 = footer.company?.iban || "";
  const bic1 = footer.company?.bic || "";
  pdf.text(`${bankName1}, IBAN: ${iban1} BIC: ${bic1}`, col2, FOOTER_Y + lh, { width: 175 });
  pdf.text("Postbank Hamburg, IBAN: DE47200100200035109201 BIC: PBNKDEFF", col2, FOOTER_Y + lh * 2, { width: 175 });

  pdf.text(`${footer.street}, ${footer.zipCity}`, col3, FOOTER_Y, { width: 155 });
  pdf.text(`Tel.: 040 - 38674565, Fax: 040 - 38674566`, col3, FOOTER_Y + lh, { width: 155 });
  pdf.text(`www.fristd-bau.com , post@fristd-bau.com`, col3, FOOTER_Y + lh * 2, { width: 155 });
}

const DUNNING_TITLES: Record<number, string> = {
  1: "Zahlungserinnerung",
  2: "1. Mahnung",
  3: "2. Mahnung",
};

export function generateDunningPdf(
  doc: any,
  customer: any,
  dunning: any,
  company: any
): typeof PDFDocument.prototype {
  const pdf = new PDFDocument({ size: "A4", margins: { top: 50, left: MARGIN_LEFT, right: MARGIN_RIGHT, bottom: 60 } });

  drawConfiguredCompanyLogo(pdf, company?.logoUrl, MARGIN_LEFT, 35, { width: 160 });

  const companyName = company?.companyName || "FriStD-Bau ZuB GmbH & Co.KG";
  const companyStreet = company?.street || "Haldesdorfer Str. 44";
  const companyZip = company?.zip || "22179";
  const companyCity = company?.city || "Hamburg";

  pdf.fontSize(7).fillColor("#888888");
  pdf.text(`${companyName} · ${companyStreet} · ${companyZip} ${companyCity}`, MARGIN_LEFT, 130);

  let y = 145;
  pdf.fontSize(10).fillColor("#000000");
  if (customer) {
    const lines = [customer.name, customer.street, `${customer.zip || ""} ${customer.city || ""}`].filter(Boolean);
    for (const line of lines) {
      pdf.text(line, MARGIN_LEFT, y);
      y += 13;
    }
  }

  const rightX = PAGE_WIDTH - MARGIN_RIGHT - 150;
  pdf.fontSize(8).fillColor("#666666");
  pdf.text("Kundennummer:", rightX, 145);
  pdf.text("Datum:", rightX, 158);
  pdf.text("Rechnungs-Nr.:", rightX, 171);
  pdf.text("Fällig bis:", rightX, 184);
  pdf.fontSize(8).fillColor("#000000");
  pdf.text(customer?.customerNumber || "-", rightX + 80, 145);
  pdf.text(fmtDate(dunning.date), rightX + 80, 158);
  pdf.text(fmtDocNumber(doc.documentNumber), rightX + 80, 171);
  pdf.text(dunning.dueDate ? fmtDate(dunning.dueDate) : "-", rightX + 80, 184);

  y = 210;
  const title = DUNNING_TITLES[dunning.level] || `Mahnung Stufe ${dunning.level}`;
  pdf.fontSize(16).font("Helvetica-Bold").fillColor("#000000");
  pdf.text(title, MARGIN_LEFT, y);
  y += 30;

  if (dunning.level >= 2) {
    pdf.fontSize(9).font("Helvetica-Bold").fillColor("#cc0000");
    pdf.text("MAHNUNG", MARGIN_LEFT, y);
    y += 18;
  }

  pdf.fontSize(10).font("Helvetica").fillColor("#000000");
  pdf.text("Sehr geehrte Damen und Herren,", MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y += 20;

  const mahnText = dunning.text || "Wir bitten um Begleichung des ausstehenden Betrages.";
  pdf.text(mahnText, MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y = pdf.y + 25;

  pdf.moveTo(MARGIN_LEFT, y).lineTo(PAGE_WIDTH - MARGIN_RIGHT, y).strokeColor("#cccccc").lineWidth(0.5).stroke();
  y += 10;

  const gross = parseFloat(doc.grossTotal || "0");
  const paid = parseFloat(doc.paidAmount || "0");
  const open = gross - paid;
  const fee = parseFloat(dunning.fee || "0");
  const total = open + fee;

  pdf.font("Helvetica-Bold").fontSize(9);
  pdf.text("Rechnungsdaten", MARGIN_LEFT, y);
  y += 16;

  pdf.font("Helvetica").fontSize(9);
  const col2 = MARGIN_LEFT + 200;

  pdf.text("Rechnung Nr.:", MARGIN_LEFT, y);
  pdf.text(fmtDocNumber(doc.documentNumber), col2, y);
  y += 14;

  pdf.text("Rechnungsdatum:", MARGIN_LEFT, y);
  pdf.text(fmtDate(doc.date), col2, y);
  y += 14;

  pdf.text("Rechnungsbetrag:", MARGIN_LEFT, y);
  pdf.text(fmtCurrencyEuroLocal(doc.grossTotal), col2, y);
  y += 14;

  if (paid > 0) {
    pdf.text("Bereits bezahlt:", MARGIN_LEFT, y);
    pdf.text(fmtCurrencyEuroLocal(String(paid)), col2, y);
    y += 14;
  }

  pdf.text("Offener Betrag:", MARGIN_LEFT, y);
  pdf.font("Helvetica-Bold").text(fmtCurrencyEuroLocal(String(open)), col2, y);
  y += 14;

  if (fee > 0) {
    pdf.font("Helvetica").text("Mahngebühr:", MARGIN_LEFT, y);
    pdf.text(fmtCurrencyEuroLocal(String(fee)), col2, y);
    y += 14;
  }

  y += 4;
  pdf.moveTo(MARGIN_LEFT, y).lineTo(PAGE_WIDTH - MARGIN_RIGHT, y).strokeColor("#000000").lineWidth(1).stroke();
  y += 8;

  pdf.font("Helvetica-Bold").fontSize(11);
  pdf.text("Gesamtforderung:", MARGIN_LEFT, y);
  pdf.text(fmtCurrencyEuroLocal(String(total)), col2, y);
  y += 30;

  pdf.font("Helvetica").fontSize(9).fillColor("#000000");
  pdf.text("Bitte überweisen Sie den offenen Betrag unter Angabe der Rechnungsnummer auf folgendes Konto:", MARGIN_LEFT, y, { width: CONTENT_WIDTH });
  y = pdf.y + 14;

  if (company?.iban) {
    pdf.text(`IBAN: ${company.iban}`, MARGIN_LEFT, y); y += 12;
  }
  if (company?.bic) {
    pdf.text(`BIC: ${company.bic}`, MARGIN_LEFT, y); y += 12;
  }
  if (company?.bankName) {
    pdf.text(`Bank: ${company.bankName}`, MARGIN_LEFT, y); y += 12;
  }

  y += 20;
  pdf.text("Mit freundlichen Grüßen", MARGIN_LEFT, y);
  y += 14;
  pdf.font("Helvetica-Bold");
  pdf.text(companyName, MARGIN_LEFT, y);

  drawPageFooter(pdf, {
    companyName,
    street: companyStreet,
    zipCity: `${companyZip} ${companyCity}`,
    director: company?.director || "Ronny Friedrich",
    company,
  });

  return pdf;
}

export function generateArbeitszeitlistePdf(
  doc: Document,
  customer: Customer,
  items: DocumentItem[],
  company: CompanySettings | null,
  project?: Project | null,
  template?: FormTemplate | null,
): PDFKit.PDFDocument {
  const companyName = company?.companyName || "FriStD-Bau ZuB GmbH & Co.KG";
  const companyStreet = company?.street || "Haldesdorfer Str. 44";
  const companyZip = company?.zip || "22179";
  const companyCity = company?.city || "Hamburg";
  const rightCol = PAGE_WIDTH - MARGIN_RIGHT;

  const docTypeLabel = (doc as any).customTypeLabel
    || documentTypeLabels[doc.type || "rechnung"]
    || "Rechnung";
  const docNumberFormatted = fmtDocNumberDisplay(doc.documentNumber);
  const azTitle = `Arbeitszeitliste zu ${docTypeLabel} ${docNumberFormatted}`;

  const COL_AZ_POS = MARGIN_LEFT;
  const COL_AZ_QTY = MARGIN_LEFT + 30;
  const COL_AZ_UNIT = MARGIN_LEFT + 80;
  const COL_AZ_DESC = MARGIN_LEFT + 110;
  const COL_AZ_DESC_W = 210;
  const COL_AZ_PROME = rightCol - 110;
  const COL_AZ_GESAMT = rightCol - 50;
  const AZ_FOOTER_Y = FOOTER_Y;
  const AZ_CONTENT_BOTTOM = AZ_FOOTER_Y - 40;

  const formatHM = (hours: number): string => {
    if (hours <= 0) return "0:00 h";
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}:${m.toString().padStart(2, "0")} h`;
  };

  const templateFooterFields = (() => {
    const allFields = [
      ...((template?.fields as any[]) || []),
      ...((template?.fieldsPage2 as any[]) || []),
    ];
    const footers = allFields.filter((f: any) =>
      f.aktiv !== false && (f.id?.startsWith("fusszeile") || f.id?.startsWith("footer"))
    );
    const unique = new Map<string, any>();
    for (const f of footers) unique.set(f.id, f);
    return unique.size > 0 ? Array.from(unique.values()) : undefined;
  })();

  const footerInfo: FooterInfo = {
    companyName, street: companyStreet,
    zipCity: `${companyZip} ${companyCity}`,
    director: company?.managingDirector || "Ronny Friedrich",
    company,
    templateFooterFields,
  };

  type AZRow =
    | { kind: "titel"; posNum: string; label: string }
    | { kind: "position"; posNum: string; qty: number; unit: string; title: string; desc: string; timePerUnit: number; totalTime: number; flag: string }
    | { kind: "titelsumme"; posNum: string; label: string; totalTime: number };

  const parentItems = new Map<number, DocumentItem>();
  const childrenByParent = new Map<number, DocumentItem[]>();
  for (const it of items) {
    if (!it.parentItemId) parentItems.set(it.id!, it);
  }
  for (const it of items) {
    if (it.parentItemId && parentItems.has(it.parentItemId)) {
      const list = childrenByParent.get(it.parentItemId) || [];
      list.push(it);
      childrenByParent.set(it.parentItemId, list);
    }
  }

  const rows: AZRow[] = [];
  let sectionTime = 0;

  for (const it of items) {
    if (it.parentItemId) continue;
    const type = it.type || "";

    if (type === "titel") {
      sectionTime = 0;
      const label = `${it.positionNumber || ""} ${stripHtml(it.title || "")}`.trim();
      rows.push({ kind: "titel", posNum: it.positionNumber || "", label });
      continue;
    }

    if (type === "titelsumme") {
      const label = stripHtml(it.title || "") || `Summe ${it.positionNumber || ""}`.trim();
      rows.push({ kind: "titelsumme", posNum: it.positionNumber || "", label, totalTime: sectionTime });
      continue;
    }

    if (["abschluss", "zwischensumme", "freitext", "floskel", "text", "skonto", "rabatt", "lohn", "material", "bedarf"].includes(type)) continue;

    const qty = parseFloat(it.quantity || "0");
    const laborTimeMin = parseFloat(it.laborTime || "0");
    let timePerUnitMin = laborTimeMin;

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

    if (timePerUnitMin <= 0 && qty <= 0) continue;

    const timePerUnitH = timePerUnitMin / 60;
    const totalTimeH = timePerUnitH * qty;
    const flag = it.positionFlag || "normal";
    if (flag === "alternativ") continue;

    sectionTime += totalTimeH;

    rows.push({
      kind: "position",
      posNum: it.positionNumber || "",
      qty, unit: it.unit || "",
      title: stripHtml(it.title || ""),
      desc: stripHtml(it.description || ""),
      timePerUnit: timePerUnitH,
      totalTime: totalTimeH,
      flag,
    });
  }

  let totalGesamt = 0;
  for (const r of rows) {
    if (r.kind === "position") totalGesamt += r.totalTime;
  }

  const pdf = new PDFDocument({
    size: "A4",
    margins: { top: 40, bottom: 10, left: MARGIN_LEFT, right: MARGIN_RIGHT },
    info: {
      Title: azTitle,
      Author: companyName,
    },
  });

  let pageNum = 0;
  let runningTotal = 0;

  function drawPage1Header() {
    pageNum = 1;
    drawConfiguredCompanyLogo(pdf, company?.logoUrl, MARGIN_LEFT, 35, { width: 160 });

    pdf.fontSize(7).fillColor("#888888");
    pdf.text(
      `${companyName} · ${companyStreet} · ${companyZip} ${companyCity}`,
      MARGIN_LEFT, 95, { width: CONTENT_WIDTH },
    );

    pdf.fillColor("#000000").fontSize(9);
    let addrY = 115;
    if (customer) {
      pdf.text(customer.name || "", MARGIN_LEFT, addrY); addrY += 12;
      if (customer.street) { pdf.text(customer.street, MARGIN_LEFT, addrY); addrY += 12; }
      if (customer.zip || customer.city) {
        pdf.text(`${customer.zip || ""} ${customer.city || ""}`.trim(), MARGIN_LEFT, addrY);
        addrY += 12;
      }
    }

    pdf.fontSize(8).fillColor("#666666");
    const infoX = rightCol - 160;
    let infoY = 115;
    const projectNumber = project?.projectNumber || "";
    if (projectNumber) {
      pdf.text("Projekt-Nr. :", infoX, infoY, { width: 90 });
      pdf.text(projectNumber, infoX + 95, infoY, { width: 65, align: "right" });
      infoY += 12;
    }
    if (customer?.customerNumber) {
      pdf.text("Kunden-Nr. :", infoX, infoY, { width: 90 });
      pdf.text(customer.customerNumber, infoX + 95, infoY, { width: 65, align: "right" });
      infoY += 12;
    }
    pdf.text("Hamburg", infoX, infoY, { width: 90 });
    pdf.text(fmtDate(doc.date), infoX + 95, infoY, { width: 65, align: "right" });
    infoY += 20;

    pdf.fontSize(11).fillColor("#000000").font("Helvetica-Bold");
    pdf.text(azTitle, MARGIN_LEFT, infoY, { width: CONTENT_WIDTH });
    let startY = Math.max(addrY + 10, infoY + 20);

    const bauvorhaben = doc.subject;
    if (bauvorhaben) {
      pdf.fontSize(9).font("Helvetica-Bold").fillColor("#000000");
      pdf.text("Bauvorhaben:", MARGIN_LEFT, startY, { width: 85 });
      pdf.font("Helvetica").text(bauvorhaben, MARGIN_LEFT + 85, startY, { width: CONTENT_WIDTH - 85 });
      startY = pdf.y + 5;
    }

    const lzStart = (doc as any).serviceStartDate || (doc as any).leistungVon || null;
    const lzEnd = (doc as any).serviceEndDate || (doc as any).leistungBis || null;
    if (lzStart || lzEnd) {
      pdf.fontSize(9).font("Helvetica-Bold").fillColor("#000000");
      pdf.text("Leistungszeitraum:", MARGIN_LEFT, startY, { width: 100 });
      const lzText = lzStart && lzEnd
        ? `${fmtDate(lzStart)} - ${fmtDate(lzEnd)}`
        : fmtDate(lzStart || lzEnd);
      pdf.font("Helvetica").text(lzText, MARGIN_LEFT + 100, startY, { width: CONTENT_WIDTH - 100 });
      startY = pdf.y + 5;
    }

    startY += 10;
    return startY;
  }

  function drawPage2PlusHeader() {
    pageNum++;

    pdf.fontSize(8).fillColor("#666666");
    pdf.text(companyName, MARGIN_LEFT, 40, { width: 200 });
    pdf.text(`${fmtDate(doc.date)}`, MARGIN_LEFT + 220, 40, { width: 100 });
    pdf.text(`Blatt ${pageNum}`, rightCol - 80, 40, { width: 80, align: "right" });

    pdf.fontSize(9).fillColor("#000000").font("Helvetica-Bold");
    pdf.text(azTitle, MARGIN_LEFT, 56, { width: CONTENT_WIDTH });
    pdf.font("Helvetica");

    let startY = 72;
    if (customer?.customerNumber) {
      pdf.fontSize(8).fillColor("#666666");
      pdf.text(`Kunden-Nr. : ${customer.customerNumber}`, MARGIN_LEFT, startY, { width: 200 });
      startY += 14;
    }

    return startY;
  }

  function drawColumnHeaders(y: number): number {
    pdf.fontSize(8).font("Helvetica-Bold").fillColor("#666666");
    pdf.text("Pos", COL_AZ_POS, y);
    pdf.text("Menge", COL_AZ_QTY, y, { width: 45, align: "right" });
    pdf.text("ME", COL_AZ_UNIT, y, { width: 25 });
    pdf.text("Bezeichnung", COL_AZ_DESC, y, { width: COL_AZ_DESC_W });
    pdf.text("pro ME", COL_AZ_PROME, y, { width: 55, align: "right" });
    pdf.text("Gesamt", COL_AZ_GESAMT, y, { width: 50, align: "right" });
    y += 14;
    pdf.moveTo(MARGIN_LEFT, y).lineTo(rightCol, y).strokeColor("#cccccc").lineWidth(0.5).stroke();
    y += 6;
    pdf.font("Helvetica").fillColor("#000000");
    return y;
  }

  function drawUebertrag(y: number, label: string): number {
    pdf.moveTo(MARGIN_LEFT, y).lineTo(rightCol, y).strokeColor("#999999").lineWidth(0.3).stroke();
    y += 4;
    pdf.font("Helvetica-Bold").fontSize(8).fillColor("#333333");
    pdf.text(label, COL_AZ_DESC, y, { width: COL_AZ_DESC_W });
    pdf.text(formatHM(runningTotal), COL_AZ_GESAMT, y, { width: 50, align: "right" });
    pdf.font("Helvetica").fillColor("#000000");
    y += 14;
    return y;
  }

  function startNewPage(): number {
    drawPageFooter(pdf, footerInfo);
    let ueY = AZ_CONTENT_BOTTOM + 4;
    pdf.font("Helvetica-Bold").fontSize(8).fillColor("#333333");
    pdf.text("Übertrag", COL_AZ_DESC, ueY, { width: COL_AZ_DESC_W });
    pdf.text(formatHM(runningTotal), COL_AZ_GESAMT, ueY, { width: 50, align: "right" });
    pdf.font("Helvetica").fillColor("#000000");

    pdf.addPage();
    let y2 = drawPage2PlusHeader();
    y2 = drawUebertrag(y2, "Übertrag");
    y2 = drawColumnHeaders(y2);
    return y2;
  }

  function ensureSpace(needed: number, currentY: number): number {
    if (currentY + needed > AZ_CONTENT_BOTTOM) {
      return startNewPage();
    }
    return currentY;
  }

  let y = drawPage1Header();
  y = drawColumnHeaders(y);

  for (const row of rows) {
    if (row.kind === "titel") {
      y = ensureSpace(25, y);
      y += 4;
      pdf.font("Helvetica-Bold").fontSize(9).fillColor("#000000");
      pdf.text(row.label, MARGIN_LEFT, y, { width: CONTENT_WIDTH });
      y = pdf.y + 6;
      pdf.font("Helvetica").fontSize(8);
      continue;
    }

    if (row.kind === "titelsumme") {
      y = ensureSpace(25, y);
      y += 5;
      pdf.font("Helvetica-Bold").fontSize(8).fillColor("#000000");
      pdf.text(row.label, COL_AZ_DESC, y, { width: COL_AZ_DESC_W + 60 });
      pdf.text(formatHM(row.totalTime), COL_AZ_GESAMT, y, { width: 50, align: "right" });
      y = pdf.y + 10;
      pdf.font("Helvetica").fontSize(8);
      continue;
    }

    const titleLines = row.title ? row.title.split("\n") : [];
    const descLines = row.desc ? row.desc.split("\n") : [];
    const allLines = [...titleLines, ...descLines];
    const bedarfExtra = row.flag === "bedarf" ? 10 : 0;
    const blockHeight = Math.max(allLines.length * 11 + 8, 20) + bedarfExtra;

    y = ensureSpace(blockHeight, y);

    if (row.flag === "bedarf") {
      pdf.font("Helvetica-Oblique").fontSize(7).fillColor("#666666");
      pdf.text("Bedarfsposition", COL_AZ_POS, y, { width: 80 });
      pdf.font("Helvetica").fontSize(8).fillColor("#000000");
      y += 10;
    }

    const rowStartY = y;
    pdf.font("Helvetica").fontSize(8).fillColor("#000000");
    if (row.posNum) pdf.text(row.posNum, COL_AZ_POS, rowStartY, { width: 25 });
    pdf.text(fmtNumber(row.qty, 2), COL_AZ_QTY, rowStartY, { width: 45, align: "right" });
    pdf.text(row.unit, COL_AZ_UNIT, rowStartY, { width: 25 });

    if (row.timePerUnit > 0) {
      pdf.text(formatHM(row.timePerUnit), COL_AZ_PROME, rowStartY, { width: 55, align: "right" });
    }
    if (row.totalTime > 0) {
      pdf.font("Helvetica-Bold");
      pdf.text(formatHM(row.totalTime), COL_AZ_GESAMT, rowStartY, { width: 50, align: "right" });
      pdf.font("Helvetica");
    }

    pdf.fontSize(8).font("Helvetica-Bold");
    let textY = rowStartY;
    if (titleLines.length > 0) {
      pdf.text(titleLines[0], COL_AZ_DESC, textY, { width: COL_AZ_DESC_W });
      textY = pdf.y;
    }
    pdf.font("Helvetica").fontSize(7.5);
    for (let i = 1; i < titleLines.length; i++) {
      pdf.text(titleLines[i], COL_AZ_DESC, textY, { width: COL_AZ_DESC_W });
      textY = pdf.y;
    }
    for (const dl of descLines) {
      pdf.text(dl, COL_AZ_DESC, textY, { width: COL_AZ_DESC_W });
      textY = pdf.y;
    }

    y = Math.max(textY, rowStartY + 11) + 6;
    runningTotal += row.totalTime;
  }

  y += 15;
  y = ensureSpace(30, y);
  pdf.moveTo(MARGIN_LEFT, y).lineTo(rightCol, y).strokeColor("#000000").lineWidth(0.8).stroke();
  y += 8;

  pdf.font("Helvetica-Bold").fontSize(9).fillColor("#000000");
  pdf.text("Gesamtsumme:", MARGIN_LEFT + 110, y, { width: 200 });
  pdf.text(formatHM(totalGesamt), COL_AZ_GESAMT, y, { width: 50, align: "right" });

  drawPageFooter(pdf, footerInfo);

  return pdf;
}
