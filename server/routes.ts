import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { db, pool } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";
import { documents, documentItems, projectDocumentTree, fibuBuchungen, ledgerEntries, editorSettings as editorSettingsTable } from "@shared/schema";
import { setupAuth, requireAuth, hashPassword } from "./auth";
import {
  insertCustomerSchema, insertContactPersonSchema, insertProjectSchema, insertDocumentSchema, insertDocumentItemSchema,
  insertMaterialSchema, insertLaborRateSchema, insertTextTemplateSchema, insertCompanySettingsSchema,
  insertIncomingInvoiceSchema, insertTimeEntrySchema, insertHourlyRateCalcSchema,
  insertResourcePlanSchema, insertOrderDispositionSchema, insertCalcSheetSchema,
  insertDunningSchema, insertPostCalcSchema, insertBwaReportSchema,
  insertUnitSchema, insertUserSchema, insertBankAccountSchema, insertTradeSchema,
  insertCashBookEntrySchema, insertPhraseSchema,
  insertFollowUpSchema, insertMailLogSchema, insertCustomerHistorySchema,
  insertContractSchema, insertConstructionDiarySchema, insertEmployeeSchema, insertAppointmentSchema,
  insertSerialNumberSchema, insertServiceSchema, insertJumboPackageSchema,
  insertLedgerEntrySchema, insertInventoryMovementSchema, insertPurchaseOrderSchema,
  insertMeasurementSchema, insertFormTemplateSchema, insertListTemplateSchema,
  insertBankPaymentOrderSchema, insertBankPaymentMatchSchema,
  defaultUnits, defaultTrades,
  numberFormatLabels, formatDocumentNumberFromPattern,
  validateIban,
} from "@shared/schema";
import { z } from "zod";
import { acquireLock, releaseLock, heartbeat, getLockStatus, releaseAllUserLocks } from "./document-locks";
import { generateDocumentPdf, generateDunningPdf, generateArbeitszeitlistePdf, buildDocumentBundle, type AbschlagEntry } from "./pdf-generator";
import { generatePdfFromHtml, createPrintToken, consumePrintToken, isPrintAssetTokenValid } from "./pdf-generator-v2";
import { computeDocumentBundle } from "@shared/document-engine/compute-document-bundle";
import { getNewDocumentDefaultFormTemplateId } from "@shared/document-engine/editor-settings";
import { documentCreateTypes } from "@shared/document-engine/document-types";
import { validateDocumentItemBulkPayload } from "@shared/document-engine/document-item-save";
import { normalizePrintDisplayMode } from "@shared/document-engine/display-mode";
import { fmtDocNumber } from "@shared/document-engine/template/resolve-variable";
import { sendEmail, buildDocumentEmailHtml } from "./email";
import multer from "multer";
import path from "path";
import fs from "fs";
import { createHash, randomUUID } from "crypto";
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerAiRoutes } from "./ai-routes";
import { aiCompleteWithDocument } from "./ai-providers";
import { getUploadMimeType, isAllowedSafeImageUpload, resolveUploadPath } from "./upload-security";
import { normalizeHapakResponseText } from "./response-text-normalizer";

function parsePositiveId(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function validateDocumentType(value: unknown): string {
  const type = typeof value === "string" ? value.trim() : "";
  if (documentCreateTypes.includes(type as any)) return type;
  const error: any = new Error(`Ungueltiger Dokumenttyp: ${type || "(leer)"}`);
  error.status = 400;
  throw error;
}

function isDocumentNumberUniqueError(error: any): boolean {
  return error?.code === "23505" && String(error?.constraint || "").includes("document_number");
}

async function resolveServerFormTemplateId(options: {
  documentType?: string | null;
  documentFormTemplateId?: unknown;
  companyDefaultFormTemplateId?: unknown;
}): Promise<number | null> {
  const documentTemplateId = parsePositiveId(options.documentFormTemplateId);
  if (documentTemplateId) return documentTemplateId;

  const settings = await db.select().from(editorSettingsTable).limit(1);
  return getNewDocumentDefaultFormTemplateId({
    editorSettings: settings[0] || null,
    documentType: options.documentType || "angebot",
    companyDefaultFormTemplateId: parsePositiveId(options.companyDefaultFormTemplateId),
  });
}

async function loadEditorSettings(): Promise<any> {
  const rows = await db.select().from(editorSettingsTable).limit(1);
  return rows[0] || {};
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function documentStatusFromBezahlflag(bezahlflag: number, openAmount: number): string {
  if (bezahlflag === 2 || Math.abs(openAmount) <= 0.005) return "bezahlt";
  if (bezahlflag === 3 || openAmount < -0.005) return "ueberzahlt";
  if (bezahlflag === 1) return "teilbezahlt";
  return "offen";
}

const FIBU_OPEN_AMOUNT_SQL = "GREATEST(COALESCE(f.offen::numeric,0), 0)";

const attachmentMimeTypes: Record<string, string> = {
  ".xml": "application/xml",
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function mimeTypeForAttachment(filename: string, fallback?: string | null): string {
  const ext = path.extname(filename).toLowerCase();
  return fallback || attachmentMimeTypes[ext] || "application/octet-stream";
}

function safeDispositionFilename(filename: string): string {
  return path.basename(filename).replace(/["\r\n]/g, "_") || "beleg";
}

function stripDocumentFinanceFields(body: Record<string, any>): void {
  const financeFields = [
    "paidAmount",
    "paidDate",
    "fibuNetto",
    "fibuBrutto",
    "fibuZahlung",
    "fibuSkonto",
    "fibuOffen",
  ];
  for (const field of financeFields) delete body[field];
}

async function syncDocumentFinanceFromFibu(reId: number, runner: Pick<typeof pool, "query"> = pool): Promise<void> {
  const result = await runner.query(`
    SELECT document_id as "documentId",
      netto::float, brutto::float, betrag::float,
      COALESCE(zahlung::float, 0) as zahlung,
      COALESCE(sk_betrag::float, 0) as "skBetrag",
      COALESCE(offen::float, 0) as offen,
      zahldat, bezahlflag
    FROM fibu_buchungen
    WHERE re_id = $1 AND idx = 0 AND art = 'RA' AND stornoflag != 2
    LIMIT 1
  `, [reId]);
  const row = result.rows[0];
  if (!row?.documentId) return;

  const openAmount = roundMoney(parseFloat(row.offen) || 0);
  const paidAmount = roundMoney(parseFloat(row.zahlung) || 0);
  const status = documentStatusFromBezahlflag(parseInt(row.bezahlflag, 10) || 0, openAmount);

  await runner.query(`
    UPDATE documents
    SET status = $1,
      paid_amount = $2,
      paid_date = $3,
      fibu_netto = $4,
      fibu_brutto = $5,
      fibu_zahlung = $2,
      fibu_skonto = $6,
      fibu_offen = $7
    WHERE id = $8
  `, [
    status,
    paidAmount.toFixed(2),
    row.zahldat || null,
    roundMoney(parseFloat(row.netto) || 0).toFixed(2),
    roundMoney(parseFloat(row.betrag ?? row.brutto) || 0).toFixed(2),
    roundMoney(parseFloat(row.skBetrag) || 0).toFixed(2),
    openAmount.toFixed(2),
    row.documentId,
  ]);
}

async function syncDunningToFibu(documentId: number, runner: Pick<typeof pool, "query"> = pool): Promise<void> {
  const result = await runner.query(`
    SELECT COALESCE(MAX(level), 0)::int as "dunningLevel",
      COALESCE((
        SELECT fee::numeric
        FROM dunning_entries de2
        WHERE de2.document_id = $1
        ORDER BY de2.level DESC, de2.created_at DESC, de2.id DESC
        LIMIT 1
      ), 0)::float as "dunningFee"
    FROM dunning_entries de
    WHERE de.document_id = $1
  `, [documentId]);
  const row = result.rows[0] || { dunningLevel: 0, dunningFee: 0 };
  await runner.query(`
    UPDATE fibu_buchungen
    SET mahnflag = $1,
      mahn_geb = $2
    WHERE document_id = $3 AND art = 'RA' AND idx = 0
  `, [
    parseInt(row.dunningLevel, 10) || 0,
    roundMoney(parseFloat(row.dunningFee) || 0).toFixed(2),
    documentId,
  ]);
}

async function applyPaymentMatchToInvoice(
  documentId: number,
  amountDelta: number,
  runner: Pick<typeof pool, "query"> = pool,
) {
  const invoiceRes = await runner.query(`
    SELECT re_id as "reId", betrag::float as betrag, zahlung::float as zahlung,
      sk_betrag::float as "skBetrag", minderung::float, gutschrift::float, kuerzung::float
    FROM fibu_buchungen
    WHERE document_id = $1 AND art = 'RA' AND idx = 0 AND stornoflag != 2
  `, [documentId]);

  if (invoiceRes.rows.length === 0) {
    throw new Error("Rechnungs-Hauptsatz fuer Zahlungszuordnung nicht gefunden");
  }

  const h = invoiceRes.rows[0];
  const currentPayment = parseFloat(h.zahlung) || 0;
  const newPayment = roundMoney(currentPayment + amountDelta);
  if (newPayment < -0.005) {
    throw new Error("Zahlungszuordnung wuerde die gebuchte Zahlung negativ machen");
  }

  const newOpen = roundMoney(
    (parseFloat(h.betrag) || 0)
      - newPayment
      - (parseFloat(h.skBetrag) || 0)
      - (parseFloat(h.minderung) || 0)
      - (parseFloat(h.gutschrift) || 0)
      - (parseFloat(h.kuerzung) || 0),
  );
  const bezahlflag = Math.abs(newOpen) <= 0.005 ? 2 : newPayment > 0 ? 1 : 0;

  await runner.query(`
    UPDATE fibu_buchungen
    SET zahlung = $1, offen = $2, bezahlflag = $3
    WHERE re_id = $4 AND idx = 0
  `, [newPayment.toFixed(2), newOpen.toFixed(2), bezahlflag, h.reId]);
  await syncDocumentFinanceFromFibu(h.reId, runner);

  return {
    reId: h.reId,
    paidAmount: newPayment,
    openAmount: newOpen,
    bezahlflag,
  };
}

async function loadAbschlagChain(doc: any): Promise<AbschlagEntry[]> {
  if (!doc.abschlagNumber || doc.abschlagNumber <= 1) return [];
  const chain: any[] = [];
  let currentId = doc.parentDocumentId;
  const visited = new Set<number>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const rows = await db.select().from(documents).where(eq(documents.id, currentId));
    if (!rows.length) break;
    const parent = rows[0];
    chain.unshift(parent);
    currentId = parent.parentDocumentId;
  }
  chain.push(doc);
  const abschlagDocs = chain.filter(s => s.abschlagNumber && s.abschlagNumber > 0);
  const result: any[] = [];
  let prevItemsNet = 0;
  for (const s of abschlagDocs) {
    const itemsRows = await pool.query(
      `SELECT COALESCE(SUM(total_price), 0) as items_net FROM document_items WHERE document_id = $1 AND type = 'position'`,
      [s.id]
    );
    const itemsNet = parseFloat(itemsRows.rows[0]?.items_net || "0");
    const taxRate = parseFloat(String(s.taxRate)) || 19;
    const deltaNet = itemsNet - prevItemsNet;
    const deltaGross = deltaNet * (1 + taxRate / 100);
    result.push({
      documentNumber: s.documentNumber,
      date: s.date || "",
      netTotal: parseFloat(String(s.netTotal)) || 0,
      taxRate,
      taxAmount: parseFloat(String(s.taxAmount)) || 0,
      grossTotal: parseFloat(String(s.grossTotal)) || 0,
      abschlagNumber: s.abschlagNumber || 0,
      itemsNet,
      deltaNet: Math.round(deltaNet * 100) / 100,
      deltaGross: Math.round(deltaGross * 100) / 100,
    });
    prevItemsNet = itemsNet;
  }
  return result;
}

const uploadsDir = path.join(process.cwd(), "server", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const uniqueName = randomUUID() + path.extname(file.originalname);
      cb(null, uniqueName);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "application/xml", "text/xml", "image/jpeg", "image/png", "image/webp", "image/gif"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(file.mimetype) || [".xml", ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Nur PDF, XML oder Bilddateien erlaubt"));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

const bwaUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const uniqueName = "bwa_" + randomUUID() + path.extname(file.originalname);
      cb(null, uniqueName);
    },
  }),
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".pdf", ".csv", ".txt"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Nur PDF- und CSV-Dateien erlaubt"));
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 },
});

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const uniqueName = "img_" + randomUUID() + path.extname(file.originalname);
      cb(null, uniqueName);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (isAllowedSafeImageUpload(file.mimetype, file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error("Nur sichere Bilddateien erlaubt (PNG, JPG, WEBP, GIF)"));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

function extractSupplierFromFilename(filename: string): string {
  const name = path.basename(filename, path.extname(filename));
  const parts = name.replace(/[_\-]+/g, " ").split(" ").filter(Boolean);
  const skipWords = ["rechnung", "rg", "re", "invoice", "pdf", "scan", "arg", "bv"];
  const datePattern = /^\d{4}[\.\-]\d{2}([\.\-]\d{2})?$/;
  const numberPattern = /^\d+$/;
  const filtered = parts.filter((p) => {
    const lower = p.toLowerCase();
    if (skipWords.includes(lower)) return false;
    if (datePattern.test(p)) return false;
    if (numberPattern.test(p)) return false;
    return true;
  });
  return filtered.slice(0, 3).join(" ") || "Unbekannt";
}

const BWA_MONTH_MAP: Record<string, number> = {
  "januar": 1, "jan": 1, "februar": 2, "feb": 2, "märz": 3, "mrz": 3, "mar": 3,
  "april": 4, "apr": 4, "mai": 5, "juni": 6, "jun": 6, "juli": 7, "jul": 7,
  "august": 8, "aug": 8, "september": 9, "sep": 9, "oktober": 10, "okt": 10, "oct": 10,
  "november": 11, "nov": 11, "dezember": 12, "dez": 12, "dec": 12,
};

function parseBwaCsv(content: string, sourceFile: string): any[] {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error("CSV enthält keine Daten");

  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"(.*)"$/, "$1").toLowerCase());

  const fieldMap: Record<string, string> = {
    "jahr": "year", "year": "year",
    "monat": "month", "month": "month",
    "zeitraum": "period", "period": "period", "periode": "period",
    "umsatzerlöse": "umsatzerloese", "umsatzerloese": "umsatzerloese", "umsatzerlöse (netto)": "umsatzerloese", "umsatz": "umsatzerloese",
    "bestandsveränderung": "bestandsveraenderung", "bestandsveraenderung": "bestandsveraenderung",
    "aktivierte eigenleistungen": "aktivierteEigenleistungen", "eigenleistungen": "aktivierteEigenleistungen",
    "gesamtleistung": "gesamtleistung",
    "material-/wareneinkauf": "materialWareneinkauf", "materialwareneinkauf": "materialWareneinkauf", "material": "materialWareneinkauf", "wareneinkauf": "materialWareneinkauf",
    "rohertrag": "rohertrag",
    "so. betr. erlöse": "soBetrieblicheErloese", "sonstige betriebliche erlöse": "soBetrieblicheErloese",
    "betrieblicher rohertrag": "betrieblichRohertrag",
    "personalkosten": "personalkosten",
    "raumkosten": "raumkosten",
    "betriebliche steuern": "betrieblicheSteuern",
    "versicherungen/beiträge": "versicherungenBeitraege", "versicherungen": "versicherungenBeitraege",
    "besondere kosten": "besondereKosten",
    "fahrzeugkosten": "fahrzeugkosten", "kfz-kosten": "fahrzeugkosten",
    "werbe-/reisekosten": "werbeReisekosten", "werbung": "werbeReisekosten",
    "kosten warenabgabe": "kostenWarenabgabe",
    "abschreibungen": "abschreibungen", "afa": "abschreibungen",
    "reparatur/instandhaltung": "reparaturInstandhaltung", "reparaturen": "reparaturInstandhaltung",
    "sonstige kosten": "sonstigeKosten",
    "gesamtkosten": "gesamtkosten",
    "betriebsergebnis": "betriebsergebnis",
    "zinsaufwand": "zinsaufwand",
    "neutraler aufwand": "neutralerAufwand",
    "zinserträge": "zinsertraege", "zinsertraege": "zinsertraege",
    "sonstiger neutraler ertrag": "sonstigerNeutralerErtrag",
    "neutraler ertrag": "neutralerErtrag",
    "ergebnis vor steuern": "ergebnisVorSteuern",
    "steuern einkommen u. ertrag": "steuernEinkommenErtrag", "einkommensteuer": "steuernEinkommenErtrag",
    "vorläufiges ergebnis": "vorlaeufigesErgebnis", "vorl. ergebnis": "vorlaeufigesErgebnis", "ergebnis": "vorlaeufigesErgebnis",
  };

  const colMapping: (string | null)[] = headers.map(h => fieldMap[h] || null);

  const results: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/^"(.*)"$/, "$1"));
    const row: any = { sourceFile };

    for (let j = 0; j < cols.length; j++) {
      const field = colMapping[j];
      if (!field) continue;
      let val = cols[j].replace(/\./g, "").replace(",", ".").trim();
      if (field === "year") {
        row.year = parseInt(val) || new Date().getFullYear();
      } else if (field === "month") {
        const num = parseInt(val);
        if (!isNaN(num)) {
          row.month = num;
        } else {
          row.month = BWA_MONTH_MAP[val.toLowerCase()] || 0;
        }
      } else if (field === "period") {
        row.period = cols[j];
      } else {
        row[field] = val || "0.00";
      }
    }

    if (!row.year) continue;
    if (row.month === undefined) row.month = 0;
    if (!row.period) {
      row.period = row.month === 0 ? `Gesamt/${row.year}` : `${Object.entries(BWA_MONTH_MAP).find(([, v]) => v === row.month)?.[0] || row.month}/${row.year}`;
    }

    results.push(row);
  }

  if (results.length === 0) throw new Error("Keine gültigen BWA-Zeilen in der CSV gefunden");
  return results;
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  const expressStatic = (await import("express")).default.static;
  const fontPath = (await import("path")).resolve(process.cwd(), "public/fonts");
  app.use("/fonts", expressStatic(fontPath, { maxAge: "7d" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "fristd-bau-erp" });
  });

  setupAuth(app);
  registerChatRoutes(app);
  registerAiRoutes(app);

  app.get("/api/dashboard/stats", requireAuth, async (_req, res, next) => {
    try { res.json(await storage.getDashboardStats()); } catch (err) { next(err); }
  });

  app.get("/api/dashboard/recent-activity", requireAuth, async (_req, res, next) => {
    try {
      const [recentDocs, recentProjects, overdueItems] = await Promise.all([
        pool.query(`
          SELECT d.id, d.document_number as "documentNumber", d.type, d.subject, d.date, d.status,
            d.net_total::float as "netTotal", d.gross_total::float as "grossTotal",
            COALESCE((SELECT SUM((v->>'grossAmount')::numeric) FROM jsonb_array_elements(d.abschlag_verrechnungen) v), 0)::float as "verrechnungenSum",
            c.name as "customerName"
          FROM documents d
          LEFT JOIN customers c ON d.customer_id = c.id
          WHERE d.type IN ('angebot','auftragsbestaetigung','rechnung','abschlagsrechnung')
          ORDER BY d.id DESC LIMIT 8
        `),
        pool.query(`
          SELECT p.id, p.project_number as "projectNumber", p.name, p.status,
            c.name as "customerName",
            (SELECT COUNT(*) FROM documents WHERE project_id = p.id) as "docCount"
          FROM projects p
          LEFT JOIN customers c ON p.customer_id = c.id
          ORDER BY p.id DESC LIMIT 5
        `),
        pool.query(`
          SELECT d.id, d.document_number as "documentNumber", d.subject, f.belegdat as date,
            f.betrag::float as "grossTotal",
            COALESCE(f.zahlung::float, 0) as "paidAmount",
            ${FIBU_OPEN_AMOUNT_SQL}::float as "openAmount",
            c.name as "customerName",
            f.faelligdat as "validUntil"
          FROM fibu_buchungen f
          JOIN documents d ON d.id = f.document_id
          LEFT JOIN customers c ON d.customer_id = c.id
          WHERE d.type IN ('rechnung','abschlagsrechnung')
            AND f.art = 'RA' AND f.idx = 0 AND f.stornoflag != 2 AND f.bezahlflag != 2
            AND f.faelligdat IS NOT NULL AND f.faelligdat < CURRENT_DATE
            AND ${FIBU_OPEN_AMOUNT_SQL} > 0.01
          ORDER BY f.faelligdat ASC LIMIT 5
        `)
      ]);
      res.json({
        recentDocuments: recentDocs.rows,
        recentProjects: recentProjects.rows,
        overdueInvoices: overdueItems.rows
      });
    } catch (err) { next(err); }
  });

  app.get("/api/dashboard/revenue-chart", requireAuth, async (_req, res, next) => {
    try {
      const now = new Date();
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const from = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, "0")}-01`;
      const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;
      res.json(await storage.getRevenueByRange(from, to));
    } catch (err) { next(err); }
  });

  app.get("/api/dashboard/revenue", requireAuth, async (req, res, next) => {
    try {
      const from = req.query.from as string;
      const to = req.query.to as string;
      if (!from || !to) return res.status(400).json({ message: "'from' und 'to' (YYYY-MM-DD) erforderlich" });
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRe.test(from) || !dateRe.test(to)) return res.status(400).json({ message: "Datumsformat muss YYYY-MM-DD sein" });
      if (from > to) return res.status(400).json({ message: "'from' darf nicht nach 'to' liegen" });
      res.json(await storage.getRevenueByRange(from, to));
    } catch (err) { next(err); }
  });

  app.get("/api/customers", requireAuth, async (req, res, next) => {
    try {
      const { search, type } = req.query;
      if (search) return res.json(normalizeHapakResponseText(await storage.searchCustomers(search as string, type as string | undefined)));
      if (type) return res.json(normalizeHapakResponseText(await storage.getCustomersByType(type as string)));
      res.json(normalizeHapakResponseText(await storage.getCustomers()));
    } catch (err) { next(err); }
  });

  app.get("/api/customers/next-number", requireAuth, async (_req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT GREATEST(COALESCE(MAX(customer_number::int), 9999), 9999) + 1 AS next_number
         FROM customers
         WHERE contact_type = 'kunde' AND customer_number ~ '^[0-9]+$'`
      );
      res.json({ number: String(result.rows[0]?.next_number || 10000) });
    } catch (err) { next(err); }
  });

  app.get("/api/customers/:id", requireAuth, async (req, res, next) => {
    try {
      const c = await storage.getCustomer(parseInt(req.params.id));
      if (!c) return res.status(404).json({ message: "Adresse nicht gefunden" });
      res.json(normalizeHapakResponseText(c));
    } catch (err) { next(err); }
  });

  app.post("/api/customers", requireAuth, async (req, res, next) => {
    try {
      const body = { ...req.body };
      if (body.contactType === "kunde" && (!body.customerNumber || !String(body.customerNumber).trim())) {
        const result = await pool.query(
          `SELECT GREATEST(COALESCE(MAX(customer_number::int), 9999), 9999) + 1 AS next_number
           FROM customers
           WHERE contact_type = 'kunde' AND customer_number ~ '^[0-9]+$'`
        );
        body.customerNumber = String(result.rows[0]?.next_number || 10000);
      }
      res.status(201).json(normalizeHapakResponseText(await storage.createCustomer(insertCustomerSchema.parse(body))));
    } catch (err) { next(err); }
  });

  app.patch("/api/customers/:id", requireAuth, async (req, res, next) => {
    try { res.json(normalizeHapakResponseText(await storage.updateCustomer(parseInt(req.params.id), insertCustomerSchema.partial().parse(req.body)))); } catch (err) { next(err); }
  });

  app.delete("/api/customers/:id", requireAuth, async (req, res, next) => {
    try { await storage.deleteCustomer(parseInt(req.params.id)); res.json({ message: "Adresse gelöscht" }); } catch (err) { next(err); }
  });

  app.post("/api/customers/:id/convert-to-kunde", requireAuth, async (req, res, next) => {
    try { res.json(normalizeHapakResponseText(await storage.convertToKunde(parseInt(req.params.id)))); } catch (err) { next(err); }
  });

  app.get("/api/customers/:id/related", requireAuth, async (req, res, next) => {
    try {
      const customerId = parseInt(req.params.id);
      const [docsResult, projectsResult, incomingResult] = await Promise.all([
        pool.query(`
          SELECT id, document_number as "documentNumber", type, subject, date, status,
            net_total::float as "netTotal", gross_total::float as "grossTotal",
            COALESCE(fibu_zahlung::float, paid_amount::float, 0) as "paidAmount",
            custom_type_label as "customTypeLabel"
          FROM documents WHERE customer_id = $1
          ORDER BY date DESC NULLS LAST LIMIT 20
        `, [customerId]),
        pool.query(`
          SELECT id, project_number as "projectNumber", name, status, start_date as "startDate"
          FROM projects WHERE customer_id = $1
          ORDER BY created_at DESC LIMIT 20
        `, [customerId]),
        pool.query(`
          WITH selected_customer AS (
            SELECT name, customer_number FROM customers WHERE id = $1
          ),
          fibu_incoming AS (
            SELECT f.re_id as id, f.rnr as "invoiceNumber", f.adr_such as supplier,
              f.belegdat as date,
              CASE WHEN f.bezahlflag = 2 THEN 'bezahlt'
                   WHEN f.bezahlflag = 1 THEN 'teilbezahlt'
                   ELSE 'offen' END as status,
              f.betrag::float as "grossTotal",
              COALESCE(f.zahlung::float, 0) as "paidAmount",
              'fibu' as source
            FROM fibu_buchungen f
            JOIN selected_customer c ON f.adr_nr = c.customer_number OR lower(f.adr_such) = lower(c.name)
            WHERE f.art = 'RE' AND f.idx = 0 AND f.stornoflag != 2
          ),
          manual_incoming AS (
            SELECT ii.id, ii.invoice_number as "invoiceNumber", ii.supplier, ii.date, ii.status,
              ii.gross_total::float as "grossTotal", COALESCE(ii.paid_amount::float, 0) as "paidAmount",
              'manual' as source
            FROM incoming_invoices ii
            JOIN selected_customer c ON lower(ii.supplier) = lower(c.name)
            WHERE NOT EXISTS (
              SELECT 1 FROM fibu_buchungen f
              WHERE f.art = 'RE' AND f.idx = 0 AND f.stornoflag != 2
                AND (f.rnr = ii.invoice_number OR lower(f.adr_such) = lower(ii.supplier))
            )
          )
          SELECT * FROM fibu_incoming
          UNION ALL
          SELECT * FROM manual_incoming
          ORDER BY date DESC NULLS LAST LIMIT 10
        `, [customerId]),
      ]);

      const statsResult = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE f.typ = 'HR')::int as "anzRechnungen",
          COALESCE(SUM(CASE WHEN f.typ = 'HR' THEN f.betrag::numeric ELSE 0 END), 0)::float as "umsatzBrutto",
          COALESCE(SUM(CASE WHEN f.typ = 'HR' THEN COALESCE(f.zahlung::numeric, 0) ELSE 0 END), 0)::float as "bezahlt",
          COUNT(*) FILTER (
            WHERE f.typ = 'HR' AND f.bezahlflag != 2
              AND ${FIBU_OPEN_AMOUNT_SQL} > 0.01
          )::int as "offeneRechnungen"
        FROM fibu_buchungen f
        JOIN documents d ON d.id = f.document_id
        WHERE d.customer_id = $1 AND f.art = 'RA' AND f.idx = 0 AND f.stornoflag != 2
      `, [customerId]);

      res.json({
        documents: docsResult.rows,
        projects: projectsResult.rows,
        incomingInvoices: incomingResult.rows,
        stats: statsResult.rows[0],
      });
    } catch (err) { next(err); }
  });

  app.get("/api/customers/:id/contacts", requireAuth, async (req, res, next) => {
    try { res.json(await storage.getContactPersons(parseInt(req.params.id))); } catch (err) { next(err); }
  });

  app.post("/api/customers/:id/contacts", requireAuth, async (req, res, next) => {
    try {
      const customerId = parseInt(req.params.id);
      const customer = await storage.getCustomer(customerId);
      if (!customer) return res.status(404).json({ message: "Adresse nicht gefunden" });
      const data = insertContactPersonSchema.parse({ ...req.body, customerId });
      res.status(201).json(await storage.createContactPerson(data));
    } catch (err) { next(err); }
  });

  app.patch("/api/customers/:id/contacts/:contactId", requireAuth, async (req, res, next) => {
    try {
      const customerId = parseInt(req.params.id);
      const contactId = parseInt(req.params.contactId);
      const persons = await storage.getContactPersons(customerId);
      if (!persons.find(p => p.id === contactId)) return res.status(404).json({ message: "Ansprechpartner nicht gefunden" });
      res.json(await storage.updateContactPerson(contactId, insertContactPersonSchema.partial().parse(req.body)));
    } catch (err) { next(err); }
  });

  app.delete("/api/customers/:id/contacts/:contactId", requireAuth, async (req, res, next) => {
    try {
      const customerId = parseInt(req.params.id);
      const contactId = parseInt(req.params.contactId);
      const persons = await storage.getContactPersons(customerId);
      if (!persons.find(p => p.id === contactId)) return res.status(404).json({ message: "Ansprechpartner nicht gefunden" });
      await storage.deleteContactPerson(contactId);
      res.json({ message: "Ansprechpartner entfernt" });
    } catch (err) { next(err); }
  });

  app.get("/api/projects", requireAuth, async (req, res, next) => {
    try {
      if (req.query.customerId) return res.json(normalizeHapakResponseText(await storage.getProjectsByCustomer(parseInt(req.query.customerId as string))));
      res.json(normalizeHapakResponseText(await storage.getProjects()));
    } catch (err) { next(err); }
  });

  app.get("/api/projects/next-number", requireAuth, async (_req, res, next) => {
    try { res.json({ number: await storage.getNextProjectNumber() }); } catch (err) { next(err); }
  });

  app.get("/api/projects/:id", requireAuth, async (req, res, next) => {
    try {
      const p = await storage.getProject(parseInt(req.params.id));
      if (!p) return res.status(404).json({ message: "Projekt nicht gefunden" });
      res.json(normalizeHapakResponseText(p));
    } catch (err) { next(err); }
  });

  app.post("/api/projects", requireAuth, async (req, res, next) => {
    try {
      const body = req.body;
      if (!body.customerId) {
        return res.status(400).json({ message: "Bitte einen Kunden auswählen" });
      }
      const autoNumber = !body.projectNumber;
      if (autoNumber) {
        body.projectNumber = await storage.getNextProjectNumber();
      }
      let project: any;
      let retries = 3;
      while (retries > 0) {
        try {
          project = await storage.createProject(insertProjectSchema.parse(body));
          break;
        } catch (e: any) {
          if (autoNumber && retries > 1 && e?.message?.includes("unique")) {
            body.projectNumber = await storage.getNextProjectNumber();
            retries--;
            continue;
          }
          throw e;
        }
      }
      const rootFolderName = buildRootFolderName(project.projectNumber, project.shortName ?? null, project.name);
      await pool.query(
        `INSERT INTO project_document_tree (project_id, document_id, parent_id, node_type, folder_name, sort_order) VALUES ($1, NULL, NULL, 'folder', $2, 0)`,
        [project.id, rootFolderName]
      );
      res.status(201).json(normalizeHapakResponseText(project));
    } catch (err) { next(err); }
  });

  app.patch("/api/projects/:id", requireAuth, async (req, res, next) => {
    try {
      const body = { ...req.body };
      const numericFields = ["budget", "customerId"];
      for (const f of numericFields) {
        if (f in body && (body[f] === "" || body[f] === null)) body[f] = undefined;
      }
      res.json(normalizeHapakResponseText(await storage.updateProject(parseInt(req.params.id), insertProjectSchema.partial().parse(body))));
    } catch (err) { next(err); }
  });

  app.delete("/api/projects/:id", requireAuth, async (req, res, next) => {
    try {
      const deleteDocuments = req.query.deleteDocuments === "true";
      const result = await storage.deleteProject(parseInt(req.params.id), deleteDocuments);
      res.json(result);
    } catch (err) { next(err); }
  });

  function formatProjectNumber(pn: string): string {
    const projZz = pn.match(/^PZZ(\d{2})(\d+)$/);
    if (projZz) return `${projZz[1]}-${parseInt(projZz[2]).toString().padStart(4, "0")}`;
    const projOld = pn.match(/^P([A-Y])(\d+)$/);
    const yearBase: Record<string, number> = {};
    "ABCDEFGHIJKLMNOPQRSTUVWXY".split("").forEach((ch, i) => { yearBase[ch] = i; });
    if (projOld && yearBase[projOld[1]] !== undefined) return `${yearBase[projOld[1]].toString().padStart(2, "0")}-${parseInt(projOld[2]).toString().padStart(4, "0")}`;
    const legacy = pn.match(/^P-(\d{4})-(\d+)$/);
    if (legacy) return `${legacy[1].slice(-2)}-${parseInt(legacy[2]).toString().padStart(4, "0")}`;
    return pn;
  }

  function buildRootFolderName(projectNumber: string, shortName: string | null, projectName: string): string {
    const formatted = formatProjectNumber(projectNumber);
    return shortName ? `${formatted} ${shortName}` : `${formatted} ${projectName}`;
  }

  async function ensureProjectRootFolder(projectId: number): Promise<void> {
    const hasRoot = await pool.query(
      `SELECT id FROM project_document_tree WHERE project_id = $1 AND parent_id IS NULL AND node_type = 'folder' LIMIT 1`,
      [projectId]
    );
    if (hasRoot.rows.length > 0) return;
    const project = await pool.query(`SELECT project_number, name, short_name FROM projects WHERE id = $1`, [projectId]);
    if (project.rows.length === 0) return;
    const p = project.rows[0];
    const folderName = buildRootFolderName(p.project_number, p.short_name, p.name);
    const rootResult = await pool.query(
      `INSERT INTO project_document_tree (project_id, document_id, parent_id, node_type, folder_name, sort_order) VALUES ($1, NULL, NULL, 'folder', $2, 0) RETURNING id`,
      [projectId, folderName]
    );
    const rootId = rootResult.rows[0].id;
    await pool.query(
      `UPDATE project_document_tree SET parent_id = $1 WHERE project_id = $2 AND parent_id IS NULL AND id != $1`,
      [rootId, projectId]
    );
  }

  async function syncDocumentProjectTree(documentId: number, projectIdValue: unknown): Promise<void> {
    const projectId = parsePositiveId(projectIdValue);
    if (!projectId) {
      await pool.query(`DELETE FROM project_document_tree WHERE document_id = $1`, [documentId]);
      return;
    }

    await pool.query(
      `DELETE FROM project_document_tree WHERE document_id = $1 AND project_id != $2`,
      [documentId, projectId]
    );
    await ensureProjectRootFolder(projectId);

    const existing = await pool.query(
      `SELECT id FROM project_document_tree WHERE project_id = $1 AND document_id = $2 LIMIT 1`,
      [projectId, documentId]
    );
    if (existing.rows.length > 0) return;

    const root = await pool.query(
      `SELECT id FROM project_document_tree WHERE project_id = $1 AND parent_id IS NULL AND node_type = 'folder' ORDER BY sort_order ASC, id ASC LIMIT 1`,
      [projectId]
    );
    const parentId = root.rows[0]?.id || null;
    const maxOrder = await pool.query(
      `SELECT COALESCE(MAX(sort_order), 0) + 10 as next_order FROM project_document_tree WHERE project_id = $1 AND ${parentId ? 'parent_id = $2' : 'parent_id IS NULL'}`,
      parentId ? [projectId, parentId] : [projectId]
    );

    await pool.query(
      `INSERT INTO project_document_tree (project_id, document_id, parent_id, node_type, sort_order)
       VALUES ($1, $2, $3, 'document', $4)`,
      [projectId, documentId, parentId, maxOrder.rows[0].next_order]
    );
  }

  async function ensureMissingProjectTreeDocumentNodes(projectId: number): Promise<number> {
    await ensureProjectRootFolder(projectId);
    const root = await pool.query(
      `SELECT id FROM project_document_tree
       WHERE project_id = $1 AND parent_id IS NULL AND node_type = 'folder'
       ORDER BY sort_order ASC, id ASC
       LIMIT 1`,
      [projectId],
    );
    const rootId = root.rows[0]?.id;
    if (!rootId) return 0;

    const docsResult = await pool.query(
      `SELECT id, parent_document_id, custom_type_label, subject, document_number, date
       FROM documents
       WHERE project_id = $1
       ORDER BY date ASC NULLS LAST, id ASC`,
      [projectId],
    );
    const nodeResult = await pool.query(
      `SELECT id, document_id
       FROM project_document_tree
       WHERE project_id = $1 AND document_id IS NOT NULL`,
      [projectId],
    );
    const byDocumentId = new Map<number, number>();
    for (const row of nodeResult.rows) {
      if (row.document_id) byDocumentId.set(Number(row.document_id), Number(row.id));
    }

    const sortResult = await pool.query(
      `SELECT COALESCE(MAX(sort_order), 0)::int as max_sort
       FROM project_document_tree
       WHERE project_id = $1`,
      [projectId],
    );
    let nextSort = Number(sortResult.rows[0]?.max_sort || 0) + 10;
    let created = 0;
    let progressed = true;

    while (progressed) {
      progressed = false;
      for (const doc of docsResult.rows) {
        const docId = Number(doc.id);
        if (byDocumentId.has(docId)) continue;

        const parentDocId = doc.parent_document_id ? Number(doc.parent_document_id) : null;
        if (parentDocId && !byDocumentId.has(parentDocId)) continue;
        const parentTreeId = parentDocId ? byDocumentId.get(parentDocId)! : Number(rootId);
        const folderName = String(doc.custom_type_label || doc.subject || doc.document_number || "Dokument")
          .replace(/^Ordner\s*(?:f\S*r)?\s*/i, "")
          .replace(/\s+\d{2}-\d{5}.*$/, "")
          .replace(/\.+$/, "")
          .trim();

        const inserted = await pool.query(
          `INSERT INTO project_document_tree (project_id, document_id, parent_id, node_type, folder_name, sort_order)
           VALUES ($1, $2, $3, 'document', $4, $5)
           RETURNING id`,
          [projectId, docId, parentTreeId, folderName || null, nextSort],
        );
        byDocumentId.set(docId, Number(inserted.rows[0].id));
        nextSort += 10;
        created++;
        progressed = true;
      }
    }

    return created;
  }

  // ========== PROJEKT-DOKUMENTENBAUM ==========
  app.get("/api/projects/:projectId/document-tree", requireAuth, async (req, res, next) => {
    try {
      const projectId = parseInt(String(req.params.projectId));
      await ensureProjectRootFolder(projectId);
      await pool.query(
        `DELETE FROM project_document_tree t
         WHERE t.project_id = $1
           AND t.node_type = 'document'
           AND t.document_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.id = t.document_id)`,
        [projectId]
      );
      await pool.query(
        `WITH root AS (
           SELECT id FROM project_document_tree
           WHERE project_id = $1 AND parent_id IS NULL AND node_type = 'folder'
           ORDER BY sort_order ASC, id ASC
           LIMIT 1
         ),
         folder_docs AS (
           SELECT d.id, d.project_id,
             COALESCE(
               NULLIF(regexp_replace(COALESCE(d.custom_type_label, d.subject, d.document_number), '^Ordner\\s*(für|fuer)?\\s*', '', 'i'), ''),
               d.document_number
             ) AS folder_name,
             COALESCE((SELECT MAX(sort_order) FROM project_document_tree WHERE project_id = $1), 0)
               + ROW_NUMBER() OVER (ORDER BY d.date, d.id) * 10 AS sort_order
           FROM documents d
           WHERE d.project_id = $1
             AND d.import_source = 'hapak'
             AND d.type = 'freies_dokument'
             AND COALESCE(d.net_total, 0) = 0
             AND COALESCE(d.gross_total, 0) = 0
             AND NOT EXISTS (SELECT 1 FROM document_items di WHERE di.document_id = d.id)
             AND EXISTS (SELECT 1 FROM documents child_doc WHERE child_doc.parent_document_id = d.id)
             AND NOT EXISTS (SELECT 1 FROM project_document_tree existing WHERE existing.project_id = $1 AND existing.document_id = d.id)
         )
         INSERT INTO project_document_tree (project_id, document_id, parent_id, node_type, folder_name, sort_order)
         SELECT folder_docs.project_id, folder_docs.id, root.id, 'document', folder_docs.folder_name, folder_docs.sort_order
         FROM folder_docs
         CROSS JOIN root`,
        [projectId],
      );
      await pool.query(
        `UPDATE project_document_tree child_node
         SET parent_id = folder_node.id
         FROM documents child_doc
        JOIN project_document_tree folder_node
          ON child_doc.parent_document_id = folder_node.document_id
          AND folder_node.project_id = $1
         WHERE child_node.project_id = $1
           AND child_node.document_id = child_doc.id
           AND child_doc.project_id = $1
           AND child_doc.parent_document_id IS NOT NULL
           AND child_node.id != folder_node.id
           AND (child_node.parent_id IS DISTINCT FROM folder_node.id)`,
        [projectId],
      );
      await ensureMissingProjectTreeDocumentNodes(projectId);
      const nodes = await pool.query(
        `SELECT t.*, d.document_number, d.type as doc_type, d.subject, d.date as doc_date, d.status as doc_status, d.net_total, d.gross_total, d.parent_document_id, d.previously_invoiced, d.custom_type_label, d.tax_rate, d.fibu_netto, d.fibu_brutto,
          (
            d.import_source = 'hapak'
            AND d.type = 'freies_dokument'
            AND COALESCE(d.net_total, 0) = 0
            AND COALESCE(d.gross_total, 0) = 0
            AND NOT EXISTS (SELECT 1 FROM document_items di WHERE di.document_id = d.id)
            AND (
              EXISTS (SELECT 1 FROM project_document_tree c WHERE c.parent_id = t.id)
              OR EXISTS (SELECT 1 FROM documents child_doc WHERE child_doc.parent_document_id = d.id)
            )
          ) as is_hapak_folder_replacement,
          COALESCE((SELECT SUM((v->>'grossAmount')::numeric) FROM jsonb_array_elements(d.abschlag_verrechnungen) v), 0) as verrechnungen_sum
         FROM project_document_tree t
         LEFT JOIN documents d ON t.document_id = d.id
         WHERE t.project_id = $1
         ORDER BY t.sort_order ASC, t.id ASC`,
        [projectId]
      );
      const normalizedNodes = nodes.rows.map((row: any) => {
        if (!row.is_hapak_folder_replacement) return row;
        const folderName = String(row.custom_type_label || row.subject || row.document_number || "Ordner")
          .replace(/^Ordner\s*(?:f\S*r)?\s*/i, "")
          .replace(/\s+\d{2}-\d{5}.*$/, "")
          .replace(/\.+$/, "")
          .trim() || "Ordner";
        return {
          ...row,
          node_type: "folder",
          folder_name: folderName,
          document_id: null,
          document_number: null,
          doc_type: null,
          subject: null,
          doc_date: null,
          doc_status: null,
          net_total: null,
          gross_total: null,
        };
      });
      res.json(normalizeHapakResponseText(normalizedNodes));
    } catch (err) { next(err); }
  });

  app.post("/api/projects/:projectId/document-tree", requireAuth, async (req, res, next) => {
    try {
      const projectId = parseInt(String(req.params.projectId), 10);
      const { documentId, parentId, nodeType, folderName, sortOrder } = req.body;
      if (documentId) {
        const existing = await pool.query(
          `SELECT id FROM project_document_tree WHERE project_id = $1 AND document_id = $2`,
          [projectId, documentId]
        );
        if (existing.rows.length > 0) {
          return res.status(409).json({ message: "Dokument bereits im Baum" });
        }
      }
      const maxOrder = await pool.query(
        `SELECT COALESCE(MAX(sort_order), 0) + 10 as next_order FROM project_document_tree WHERE project_id = $1 AND ${parentId ? 'parent_id = $2' : 'parent_id IS NULL'}`,
        parentId ? [projectId, parentId] : [projectId]
      );
      const result = await pool.query(
        `INSERT INTO project_document_tree (project_id, document_id, parent_id, node_type, folder_name, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [projectId, documentId || null, parentId || null, nodeType || "document", folderName || null, sortOrder ?? maxOrder.rows[0].next_order]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) { next(err); }
  });

  app.patch("/api/projects/:projectId/document-tree/:nodeId", requireAuth, async (req, res, next) => {
    try {
      const projectId = parseInt(String(req.params.projectId), 10);
      const nodeId = parseInt(req.params.nodeId);
      const { parentId, sortOrder, folderName } = req.body;
      const sets: string[] = [];
      const params: any[] = [];
      if (parentId !== undefined) { params.push(parentId === null ? null : parentId); sets.push(`parent_id = $${params.length}`); }
      if (sortOrder !== undefined) { params.push(sortOrder); sets.push(`sort_order = $${params.length}`); }
      if (folderName !== undefined) { params.push(folderName); sets.push(`folder_name = $${params.length}`); }
      if (sets.length === 0) return res.json({ ok: true });
      params.push(nodeId);
      params.push(projectId);
      const result = await pool.query(
        `UPDATE project_document_tree SET ${sets.join(", ")} WHERE id = $${params.length - 1} AND project_id = $${params.length} RETURNING *`,
        params
      );
      if (result.rows.length === 0) return res.status(404).json({ message: "Node nicht gefunden" });
      res.json(result.rows[0]);
    } catch (err) { next(err); }
  });

  app.delete("/api/projects/:projectId/document-tree/:nodeId", requireAuth, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const nodeId = parseInt(req.params.nodeId);
      const node = await pool.query(`SELECT id, parent_id, node_type FROM project_document_tree WHERE id = $1 AND project_id = $2`, [nodeId, projectId]);
      if (node.rows.length === 0) return res.status(404).json({ message: "Node nicht gefunden" });
      if (node.rows[0].node_type === "folder" && node.rows[0].parent_id === null) return res.status(400).json({ message: "Root-Ordner kann nicht gelöscht werden" });
      await pool.query(`UPDATE project_document_tree SET parent_id = $1 WHERE parent_id = $2 AND project_id = $3`, [node.rows[0].parent_id, nodeId, projectId]);
      await pool.query(`DELETE FROM project_document_tree WHERE id = $1 AND project_id = $2`, [nodeId, projectId]);
      res.json({ message: "Gelöscht" });
    } catch (err) { next(err); }
  });

  app.post("/api/projects/:projectId/document-tree/reorder", requireAuth, async (req, res, next) => {
    try {
      const { nodeId, targetParentId, targetIndex } = req.body;
      const projectId = parseInt(req.params.projectId);
      const siblings = await pool.query(
        `SELECT id FROM project_document_tree WHERE project_id = $1 AND ${targetParentId ? 'parent_id = $2' : 'parent_id IS NULL'} AND id != $3 ORDER BY sort_order ASC, id ASC`,
        targetParentId ? [projectId, targetParentId, nodeId] : [projectId, nodeId]
      );
      const ids = siblings.rows.map((r: any) => r.id);
      ids.splice(targetIndex, 0, nodeId);
      for (let i = 0; i < ids.length; i++) {
        if (targetParentId) {
          await pool.query(`UPDATE project_document_tree SET sort_order = $1, parent_id = $2 WHERE id = $3`, [(i + 1) * 10, targetParentId, ids[i]]);
        } else {
          await pool.query(`UPDATE project_document_tree SET sort_order = $1, parent_id = NULL WHERE id = $2`, [(i + 1) * 10, ids[i]]);
        }
      }
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  app.post("/api/projects/:projectId/document-tree/auto-build", requireAuth, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const project = await pool.query(`SELECT project_number, name, short_name FROM projects WHERE id = $1`, [projectId]);
      if (project.rows.length === 0) return res.status(404).json({ message: "Projekt nicht gefunden" });
      const projRow = project.rows[0];
      const rootFolderName = buildRootFolderName(projRow.project_number, projRow.short_name, projRow.name);
      const existingRoot = await pool.query(
        `SELECT id FROM project_document_tree WHERE project_id = $1 AND parent_id IS NULL AND node_type = 'folder' LIMIT 1`,
        [projectId]
      );
      let rootId: number;
      if (existingRoot.rows.length > 0) {
        rootId = existingRoot.rows[0].id;
        await pool.query(`UPDATE project_document_tree SET folder_name = $1 WHERE id = $2`, [rootFolderName, rootId]);
      } else {
        const rootResult = await pool.query(
          `INSERT INTO project_document_tree (project_id, document_id, parent_id, node_type, folder_name, sort_order) VALUES ($1, NULL, NULL, 'folder', $2, 0) RETURNING id`,
          [projectId, rootFolderName]
        );
        rootId = rootResult.rows[0].id;
      }

      const docs = await pool.query(
        `SELECT id, type, document_number, parent_document_id FROM documents WHERE project_id = $1 ORDER BY date ASC, id ASC`,
        [projectId]
      );
      const existingDocNodes = await pool.query(
        `SELECT id, document_id FROM project_document_tree WHERE project_id = $1 AND node_type = 'document' AND document_id IS NOT NULL`,
        [projectId]
      );
      const nodeIdMap = new Map<number, number>(
        existingDocNodes.rows.map((row: any) => [row.document_id, row.id]),
      );
      const existingDocIds = new Set(nodeIdMap.keys());
      const maxOrder = await pool.query(
        `SELECT COALESCE(MAX(sort_order), 0) as max_order FROM project_document_tree WHERE project_id = $1 AND parent_id = $2`,
        [projectId, rootId]
      );
      let sortOrder = Math.max(10, parseInt(maxOrder.rows[0]?.max_order || "0", 10) + 10);
      let created = 0;

      for (const doc of docs.rows) {
        if (existingDocIds.has(doc.id)) continue;
        let parentTreeId: number | null = rootId;
        if (doc.parent_document_id && nodeIdMap.has(doc.parent_document_id)) {
          parentTreeId = nodeIdMap.get(doc.parent_document_id)!;
        }
        const result = await pool.query(
          `INSERT INTO project_document_tree (project_id, document_id, parent_id, node_type, sort_order) VALUES ($1, $2, $3, 'document', $4) RETURNING id`,
          [projectId, doc.id, parentTreeId, sortOrder]
        );
        nodeIdMap.set(doc.id, result.rows[0].id);
        existingDocIds.add(doc.id);
        sortOrder += 10;
        created++;
      }

      res.json({ message: created > 0 ? "Baum automatisch ergänzt" : "Baum ist bereits vollständig", created });
    } catch (err) { next(err); }
  });

  app.post("/api/projects/:projectId/document-tree/import-hapak", requireAuth, upload.single("file"), async (req, res, next) => {
    try {
      const projectId = parseInt(String(req.params.projectId), 10);
      if (!req.file) return res.status(400).json({ message: "Keine Datei hochgeladen" });

      const AdmZip = require("adm-zip");
      const zip = new AdmZip(req.file.path);
      const dokAuslEntry = zip.getEntries().find((e: any) => /DokAusl\.Dbf$/i.test(e.entryName));
      if (!dokAuslEntry) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: "DokAusl.Dbf nicht in ZIP gefunden" });
      }

      const buf = dokAuslEntry.getData();
      const numRecords = buf.readUInt32LE(4);
      const headerSize = buf.readUInt16LE(8);
      const recordSize = buf.readUInt16LE(10);

      const dbfFields: { name: string; len: number }[] = [];
      let off = 32;
      while (off < headerSize - 1 && buf[off] !== 0x0D) {
        const nm = buf.slice(off, off + 11).toString("ascii").replace(/\x00/g, "").trim();
        const fl = buf[off + 16];
        dbfFields.push({ name: nm, len: fl });
        off += 32;
      }

      const hapakRecords: any[] = [];
      for (let i = 0; i < numRecords; i++) {
        const rOff = headerSize + i * recordSize;
        if (buf[rOff] === 0x2A) continue;
        const rec: any = {};
        let fOff = rOff + 1;
        for (const f of dbfFields) {
          rec[f.name] = buf.slice(fOff, fOff + f.len).toString("latin1").trim();
          fOff += f.len;
        }
        hapakRecords.push(rec);
      }

      const project = await pool.query(`SELECT project_number, name, short_name FROM projects WHERE id = $1`, [projectId]);
      if (project.rows.length === 0) { fs.unlinkSync(req.file.path); return res.status(404).json({ message: "Projekt nicht gefunden" }); }
      const projRow = project.rows[0];
      const projDocNumber = projRow.project_number;

      await pool.query("DELETE FROM project_document_tree WHERE project_id = $1", [projectId]);

      const rootFolderName = buildRootFolderName(projRow.project_number, projRow.short_name, projRow.name);
      const rootRes = await pool.query(
        `INSERT INTO project_document_tree (project_id, document_id, parent_id, node_type, folder_name, sort_order) VALUES ($1, NULL, NULL, 'folder', $2, 0) RETURNING id`,
        [projectId, rootFolderName]
      );
      const rootId = rootRes.rows[0].id;

      const docsRes = await pool.query("SELECT id, document_number FROM documents WHERE project_id = $1", [projectId]);
      const docIdByNumber = new Map<string, number>();
      docsRes.rows.forEach((d: any) => docIdByNumber.set(d.document_number, d.id));

      const isHapakFolder = (r: any) => /^Ordner/i.test(r.TYPUNDNR);
      const cleanFolderName = (t: string) => t.replace(/^Ordner\s*(für|Für|fuer|f.r)?\s*/i, "").replace(/\.+$/, "").trim();

      const hapakToTreeId = new Map<string, number>();
      hapakToTreeId.set(projDocNumber, rootId);

      const allItems = hapakRecords.filter((r: any) => r.NAME !== projDocNumber);
      const processed = new Set<string>();
      let sortOrder = 10;
      let warnings: string[] = [];

      for (let pass = 0; pass < 15; pass++) {
        let progress = false;
        for (const rec of allItems) {
          if (processed.has(rec.NAME)) continue;
          const parentHapak = rec.BEZUGNAME;
          let parentTreeId: number | null = null;
          if (!parentHapak) { parentTreeId = rootId; }
          else if (hapakToTreeId.has(parentHapak)) { parentTreeId = hapakToTreeId.get(parentHapak)!; }
          else continue;

          if (isHapakFolder(rec)) {
            const fName = cleanFolderName(rec.TYPUNDNR);
            const r = await pool.query(
              `INSERT INTO project_document_tree (project_id, document_id, parent_id, node_type, folder_name, sort_order) VALUES ($1, NULL, $2, 'folder', $3, $4) RETURNING id`,
              [projectId, parentTreeId, fName, sortOrder]
            );
            hapakToTreeId.set(rec.NAME, r.rows[0].id);
          } else {
            const docId = docIdByNumber.get(rec.NAME);
            if (docId) {
              const r = await pool.query(
                `INSERT INTO project_document_tree (project_id, document_id, parent_id, node_type, sort_order) VALUES ($1, $2, $3, 'document', $4) RETURNING id`,
                [projectId, docId, parentTreeId, sortOrder]
              );
              hapakToTreeId.set(rec.NAME, r.rows[0].id);
            } else {
              warnings.push(`Dokument ${rec.NAME} nicht in DB gefunden`);
            }
          }
          sortOrder += 10;
          processed.add(rec.NAME);
          progress = true;
        }
        if (!progress) break;
      }

      fs.unlinkSync(req.file.path);
      res.json({ message: "HAPAK-Baum importiert", created: processed.size + 1, warnings });
    } catch (err) { next(err); }
  });

  app.post("/api/documents/:id/lock", requireAuth, async (req, res) => {
    const user = req.user as any;
    const docId = parseInt(req.params.id);
    const result = acquireLock(docId, user.id, user.username, user.fullName);
    if (result.success) {
      res.json({ locked: true, lock: result.lock });
    } else {
      res.json({ locked: false, heldBy: result.heldBy });
    }
  });

  app.post("/api/documents/:id/unlock", requireAuth, async (req, res) => {
    const user = req.user as any;
    releaseLock(parseInt(req.params.id), user.id);
    res.json({ released: true });
  });

  app.post("/api/documents/:id/unlock-beacon", (req, res) => {
    if (req.isAuthenticated() && req.user) {
      releaseLock(parseInt(req.params.id), (req.user as any).id);
    }
    res.status(204).end();
  });

  app.post("/api/documents/:id/heartbeat", requireAuth, async (req, res) => {
    const user = req.user as any;
    heartbeat(parseInt(req.params.id), user.id);
    res.json({ ok: true });
  });

  app.get("/api/documents/:id/lock-status", requireAuth, async (req, res) => {
    const lock = getLockStatus(parseInt(req.params.id));
    res.json({ locked: !!lock, lock });
  });

  app.post("/api/document-locks/release-all", requireAuth, async (req, res) => {
    const user = req.user as any;
    const count = releaseAllUserLocks(user.id);
    res.json({ released: count });
  });

  app.get("/api/project-finance-summary/:projectId", requireAuth, async (req, res, next) => {
    try {
      const projectId = parseInt(String(req.params.projectId), 10);
      if (!Number.isFinite(projectId)) return res.status(400).json({ message: "Ungueltige Projekt-ID" });

      const projectResult = await pool.query(
        `SELECT id, project_number, cost_center, import_source_key
         FROM projects
         WHERE id = $1`,
        [projectId],
      );
      const project = projectResult.rows[0];
      if (!project) return res.status(404).json({ message: "Projekt nicht gefunden" });

      const ktrCandidates = Array.from(new Set([
        project.cost_center,
        project.import_source_key,
        project.project_number,
      ].filter(Boolean).map((value: string) => String(value).trim())));

      const empty = {
        count: 0,
        erloese: 0,
        gutschriften: 0,
        skonto: 0,
        minderung: 0,
        netto: 0,
        steuer: 0,
        brutto: 0,
        bezahlt: 0,
        offen: 0,
        rows: [],
      };
      if (ktrCandidates.length === 0) {
        return res.json({ projectId, ktr: null, ktrCandidates, source: "fibu_buchungen", outgoing: empty, incoming: empty });
      }

      const summarySql = `
        SELECT
          COUNT(*) FILTER (WHERE typ = 'HR')::int as count,
          COALESCE(SUM(CASE WHEN typ = 'HR' THEN COALESCE(netto::numeric, 0) ELSE 0 END), 0)::float as erloese,
          COALESCE(SUM(CASE WHEN typ = 'HG' THEN ABS(COALESCE(netto::numeric, 0)) ELSE 0 END), 0)::float as gutschriften,
          COALESCE(SUM(CASE WHEN typ = 'HR' THEN COALESCE(sk_betrag::numeric, 0) ELSE 0 END), 0)::float as skonto,
          COALESCE(SUM(CASE
            WHEN typ = 'HR' AND COALESCE(betrag::numeric, 0) > 0 AND COALESCE(netto::numeric, 0) > 0
              THEN ROUND((COALESCE(sk_betrag::numeric, 0) * netto::numeric / betrag::numeric)::numeric, 2)
            ELSE 0
          END), 0)::float as skonto_netto,
          COALESCE(SUM(CASE WHEN typ = 'HR' THEN COALESCE(minderung::numeric, 0) ELSE 0 END), 0)::float as minderung,
          COALESCE(SUM(CASE
            WHEN typ = 'HR' AND COALESCE(betrag::numeric, 0) > 0 AND COALESCE(netto::numeric, 0) > 0
              THEN ROUND((COALESCE(minderung::numeric, 0) * netto::numeric / betrag::numeric)::numeric, 2)
            ELSE 0
          END), 0)::float as minderung_netto,
          COALESCE(SUM(CASE
            WHEN typ = 'HR' THEN COALESCE(netto::numeric, 0)
            WHEN typ = 'HG' THEN -ABS(COALESCE(netto::numeric, 0))
            ELSE 0
          END), 0)::float as netto_vor_abzug,
          COALESCE(SUM(CASE
            WHEN typ = 'HR' THEN COALESCE(betrag::numeric, 0) - COALESCE(netto::numeric, 0)
            WHEN typ = 'HG' THEN -(ABS(COALESCE(betrag::numeric, 0)) - ABS(COALESCE(netto::numeric, 0)))
            ELSE 0
          END), 0)::float as steuer_vor_abzug,
          COALESCE(SUM(CASE
            WHEN typ = 'HR' THEN COALESCE(betrag::numeric, COALESCE(brutto::numeric, 0))
            WHEN typ = 'HG' THEN -ABS(COALESCE(betrag::numeric, COALESCE(brutto::numeric, 0)))
            ELSE 0
          END), 0)::float as brutto_vor_abzug,
          COALESCE(SUM(COALESCE(zahlung::numeric, 0)), 0)::float as bezahlt,
          COALESCE(SUM(GREATEST(COALESCE(offen::numeric, 0), 0)), 0)::float as offen
        FROM fibu_buchungen
        WHERE art = $1
          AND idx = 0
          AND stornoflag != 2
          AND ktr = ANY($2::text[])
          AND typ IN ('HR', 'HG')
      `;

      const rowSql = (art: "RA" | "RE") => `
        SELECT re_id as "reId", rnr as "documentNumber", typ, adr_such as "partnerName",
          betreff as subject, belegdat as date, netto::float as "netTotal",
          betrag::float as "grossTotal", zahlung::float as "paidAmount",
          ${FIBU_OPEN_AMOUNT_SQL}::float as "openAmount",
          sk_betrag::float as "skontoAmount", minderung::float as "minderungAmount",
          konto_b as "kontoB", konto_g as "kontoG", ktr,
          CASE WHEN bezahlflag = 2 THEN 'bezahlt'
               WHEN (zahlung::numeric > 0 OR sk_betrag::numeric > 0 OR minderung::numeric > 0 OR gutschrift::numeric > 0 OR kuerzung::numeric > 0)
                 AND ${FIBU_OPEN_AMOUNT_SQL} > 0.01 THEN 'teilbezahlt'
               ELSE 'offen' END as status
        FROM fibu_buchungen f
        WHERE art = '${art}' AND idx = 0 AND stornoflag != 2 AND ktr = ANY($1::text[]) AND typ IN ('HR', 'HG')
        ORDER BY belegdat ASC, re_id ASC
      `;

      const [outgoingSummary, incomingSummary, outgoingRows, incomingRows] = await Promise.all([
        pool.query(summarySql, ["RA", ktrCandidates]),
        pool.query(summarySql, ["RE", ktrCandidates]),
        pool.query(rowSql("RA"), [ktrCandidates]),
        pool.query(rowSql("RE"), [ktrCandidates]),
      ]);

      const normalizeSummary = (row: any, rows: any[]) => {
        const skontoNetto = Number(row?.skonto_netto || 0);
        const minderungNetto = Number(row?.minderung_netto || 0);
        const netto = Number(row?.netto_vor_abzug || 0) - skontoNetto - minderungNetto;
        const skontoSteuer = Number(row?.skonto || 0) - skontoNetto;
        const minderungSteuer = Number(row?.minderung || 0) - minderungNetto;
        const steuer = Number(row?.steuer_vor_abzug || 0) - skontoSteuer - minderungSteuer;
        return {
          count: Number(row?.count || 0),
          erloese: Number(row?.erloese || 0),
          gutschriften: Number(row?.gutschriften || 0),
          skonto: Number(row?.skonto || 0),
          skontoNetto,
          minderung: Number(row?.minderung || 0),
          minderungNetto,
          netto,
          steuer,
          brutto: netto + steuer,
          bezahlt: Number(row?.bezahlt || 0),
          offen: Number(row?.offen || 0),
          rows,
        };
      };

      res.json({
        projectId,
        ktr: ktrCandidates[0] || null,
        ktrCandidates,
        source: "fibu_buchungen",
        rule: "HAPAK Projektfinanzen werden aus FIBUZWO/fibu_buchungen mit idx=0, stornoflag!=2 und KTR=Projekt-Kostentraeger berechnet; Dokument-Summen sind nicht die Wahrheit.",
        outgoing: normalizeSummary(outgoingSummary.rows[0], outgoingRows.rows),
        incoming: normalizeSummary(incomingSummary.rows[0], incomingRows.rows),
      });
    } catch (err) { next(err); }
  });

  app.get("/api/documents", requireAuth, async (req, res, next) => {
    try {
      if (req.query.customerId) return res.json(await storage.getDocumentsByCustomer(parseInt(req.query.customerId as string)));
      if (req.query.projectId) return res.json(await storage.getDocumentsByProject(parseInt(req.query.projectId as string)));
      if (req.query.parentDocumentId) {
        const parentId = parseInt(req.query.parentDocumentId as string);
        const children = await db.select().from(documents).where(eq(documents.parentDocumentId, parentId)).orderBy(desc(documents.date));
        return res.json(children);
      }
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const search = (req.query.search as string) || undefined;
      const type = (req.query.type as string) || undefined;
      const types = req.query.types ? (req.query.types as string).split(",") : undefined;
      const excludeType = (req.query.excludeType as string) || undefined;
      return res.json(await storage.getDocumentsPaginated(page, limit, search, type, types, excludeType));
    } catch (err) { next(err); }
  });

  app.get("/api/documents/next-number", requireAuth, async (req, res, next) => {
    try { res.json({ number: await storage.getNextDocumentNumber(validateDocumentType(req.query.type || "angebot")) }); } catch (err) { next(err); }
  });

  app.get("/api/documents/:id", requireAuth, async (req, res, next) => {
    try {
      const doc = await storage.getDocument(parseInt(req.params.id));
      if (!doc) return res.status(404).json({ message: "Dokument nicht gefunden" });
      res.json(doc);
    } catch (err) { next(err); }
  });

  function applySkontoDefault(data: any): any {
    if (data.skontoPercent !== undefined && data.skontoPercent !== null) return data;
    return { ...data, skontoPercent: "0.00", skontoDays: 0 };
  }

  async function normalizeDocumentBody(input: any, partial = false): Promise<any> {
    const body = { ...(partial ? input : applySkontoDefault(input)) };
    if (!partial || body.type !== undefined) {
      body.type = validateDocumentType(body.type || "angebot");
    }
    if (!partial && (!body.documentNumber || !String(body.documentNumber).trim())) {
      body.documentNumber = await storage.getNextDocumentNumber(body.type || "angebot");
    }
    if (!parsePositiveId(body.formTemplateId)) {
      const company = await storage.getCompanySettings();
      body.formTemplateId = await resolveServerFormTemplateId({
        documentType: body.type || "angebot",
        documentFormTemplateId: body.formTemplateId,
        companyDefaultFormTemplateId: company?.defaultFormTemplateId,
      });
    }
    const dateColNames = ["date","validUntil","paidDate","leistungsDatumVon","leistungsDatumBis","postausgangAm","wiedervorlageAm"];
    for (const f of dateColNames) {
      if (f in body) {
        const raw = body[f];
        if (!raw || (typeof raw === "string" && !/^\d{4}-\d{2}-\d{2}/.test(raw.trim()))) {
          body[f] = f === "date" ? new Date().toISOString().slice(0, 10) : null;
        } else if (typeof raw === "string") {
          body[f] = raw.trim().slice(0, 10);
        }
      }
    }
    stripDocumentFinanceFields(body);
    return body;
  }

  async function saveDocumentItemsBulk(tx: any, docId: number, items: any[]): Promise<any[]> {
    validateDocumentItemBulkPayload(items);
    const existingItems = await tx.select().from(documentItems).where(eq(documentItems.documentId, docId));
    const existingIds = new Set<number>(existingItems.map((i: any) => Number(i.id)));
    const incomingIds = new Set(items.filter(i => i.id && existingIds.has(i.id)).map(i => i.id));
    const clientIdToRealId = new Map<string, number>();
    existingItems.forEach((item: any) => {
      const incoming = items.find((i) => i.id === item.id);
      if (incoming?._clientId) clientIdToRealId.set(incoming._clientId, item.id);
    });

    const saved: any[] = new Array(items.length);
    const ordered = items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => Number(!!a.item._parentClientId) - Number(!!b.item._parentClientId));

    for (const { item, index } of ordered) {
      const data = { ...item, documentId: docId };
      const clientId = data._clientId;
      const parentClientId = data._parentClientId;
      delete data.id;
      delete data._clientId;
      delete data._parentClientId;
      if (parentClientId) {
        const resolvedParentId = clientIdToRealId.get(parentClientId);
        if (!resolvedParentId) {
          const error: any = new Error(`Parent-Position fuer ${clientId || "Position"} nicht gefunden`);
          error.status = 400;
          throw error;
        }
        data.parentItemId = resolvedParentId;
      }
      else if (!data.parentItemId) data.parentItemId = null;

      const parsed = insertDocumentItemSchema.parse(data);
      let row: any;
      if (item.id && existingIds.has(item.id)) {
        [row] = await tx.update(documentItems).set(parsed).where(and(eq(documentItems.id, item.id), eq(documentItems.documentId, docId))).returning();
      } else {
        [row] = await tx.insert(documentItems).values(parsed).returning();
      }
      if (clientId && row?.id) clientIdToRealId.set(clientId, row.id);
      saved[index] = { ...row, _clientId: clientId || null, _parentClientId: parentClientId || null };
    }

    const idsToDelete = [...existingIds].filter((id) => !incomingIds.has(id));
    for (const id of idsToDelete) {
      await tx.delete(documentItems).where(and(eq(documentItems.id, id), eq(documentItems.documentId, docId)));
    }

    return saved;
  }

  app.post("/api/documents", requireAuth, async (req, res, next) => {
    try {
      const body = await normalizeDocumentBody(req.body);
      const createdDocument = await storage.createDocument(insertDocumentSchema.parse(body));
      await syncDocumentProjectTree(createdDocument.id, createdDocument.projectId);
      res.status(201).json(createdDocument);
    } catch (err) { next(err); }
  });

  app.patch("/api/documents/:id", requireAuth, async (req, res, next) => {
    try {
      const body = await normalizeDocumentBody(req.body, true);
      const documentId = parseInt(req.params.id);
      const updatedDocument = await storage.updateDocument(documentId, insertDocumentSchema.partial().parse(body));
      await syncDocumentProjectTree(updatedDocument.id, updatedDocument.projectId);
      res.json(updatedDocument);
    } catch (err) { next(err); }
  });

  app.post("/api/documents/full-save", requireAuth, async (req, res, next) => {
    try {
      const { document: documentInput, items } = req.body as { document?: any; items?: any[] };
      if (!documentInput || typeof documentInput !== "object") return res.status(400).json({ message: "document must be an object" });
      if (!Array.isArray(items)) return res.status(400).json({ message: "items must be an array" });
      validateDocumentItemBulkPayload(items);

      const existingDocumentId = parsePositiveId(documentInput.id);
      const body = await normalizeDocumentBody(documentInput, !!existingDocumentId);
      delete body.id;
      const saveWithFreshNumber = async () => {
        if (!existingDocumentId) {
          body.documentNumber = await storage.getNextDocumentNumber(body.type || "angebot");
        }
        return db.transaction(async (tx) => {
          let savedDocument: any;
          if (existingDocumentId) {
            [savedDocument] = await tx
              .update(documents)
              .set({ ...insertDocumentSchema.partial().parse(body), updatedAt: new Date() })
              .where(eq(documents.id, existingDocumentId))
              .returning();
          } else {
            [savedDocument] = await tx
              .insert(documents)
              .values(insertDocumentSchema.parse(body))
              .returning();
          }
          if (!savedDocument) {
            const error: any = new Error("Dokument konnte nicht gespeichert werden");
            error.status = 404;
            throw error;
          }
          const savedItems = await saveDocumentItemsBulk(tx, savedDocument.id, items);
          return { document: savedDocument, items: savedItems };
        });
      };

      let result: { document: any; items: any[] } | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          result = await saveWithFreshNumber();
          break;
        } catch (err) {
          if (!existingDocumentId && isDocumentNumberUniqueError(err) && attempt < 2) continue;
          throw err;
        }
      }
      if (!result) {
        const error: any = new Error("Dokument konnte nicht gespeichert werden");
        error.status = 500;
        throw error;
      }

      await syncDocumentProjectTree(result.document.id, result.document.projectId);

      res.status(existingDocumentId ? 200 : 201).json(result);
    } catch (err) { next(err); }
  });

  app.delete("/api/documents/:id", requireAuth, async (req, res, next) => {
    try {
      const documentId = parseInt(req.params.id);
      await syncDocumentProjectTree(documentId, null);
      await storage.deleteDocument(documentId);
      res.json({ message: "Dokument gelöscht" });
    } catch (err) { next(err); }
  });

  app.get("/api/documents/:id/stammbaum", requireAuth, async (req, res, next) => {
    try {
      const docId = parseInt(req.params.id);
      const doc = await storage.getDocument(docId);
      if (!doc) return res.status(404).json({ message: "Dokument nicht gefunden" });

      const allDocs = await storage.getDocuments();
      const stammbaum: any[] = [];

      let rootId = docId;
      let current = doc;
      while (current.parentDocumentId) {
        const parent = allDocs.find(d => d.id === current.parentDocumentId);
        if (!parent) break;
        rootId = parent.id;
        current = parent;
      }

      const buildTree = (parentId: number | null, level: number) => {
        const root = allDocs.find(d => d.id === (parentId || rootId));
        if (root && level === 0) {
          stammbaum.push({ ...root, _level: 0 });
        }
        const children = allDocs.filter(d => d.parentDocumentId === (parentId || rootId));
        for (const child of children) {
          stammbaum.push({ ...child, _level: level + 1 });
          buildTree(child.id, level + 1);
        }
      };

      buildTree(null, 0);
      res.json(stammbaum);
    } catch (err) { next(err); }
  });

  app.patch("/api/documents/:id/parent", requireAuth, async (req, res, next) => {
    try {
      const docId = parseInt(req.params.id);
      const { parentDocumentId } = req.body;
      const updated = await storage.updateDocument(docId, { parentDocumentId: parentDocumentId || null } as any);
      res.json(updated);
    } catch (err) { next(err); }
  });

  const allowedConversions: Record<string, string[]> = {
    angebot: ["angebot", "auftragsbestaetigung", "rechnung", "abschlagsrechnung", "freies_dokument", "mitschnitt"],
    auftragsbestaetigung: ["auftragsbestaetigung", "rechnung", "abschlagsrechnung", "lieferschein", "freies_dokument", "mitschnitt"],
    rechnung: ["rechnung", "gutschrift", "freies_dokument", "mitschnitt"],
    abschlagsrechnung: ["abschlagsrechnung", "rechnung", "freies_dokument", "mitschnitt"],
    gutschrift: ["gutschrift", "freies_dokument", "mitschnitt"],
    lieferschein: ["lieferschein", "rechnung", "freies_dokument", "mitschnitt"],
    freies_dokument: ["freies_dokument", "angebot", "auftragsbestaetigung", "abschlagsrechnung", "rechnung", "gutschrift", "lieferschein", "mitschnitt"],
    mitschnitt: ["mitschnitt", "rechnung", "abschlagsrechnung", "freies_dokument"],
  };

  const sourceStatusAfterConvert: Record<string, Record<string, string>> = {
    angebot: { auftragsbestaetigung: "beauftragt" },
  };

  app.post("/api/documents/:id/convert", requireAuth, async (req, res, next) => {
    try {
      const docId = parseInt(req.params.id);
      const targetType = req.body.targetType;
      if (!targetType) return res.status(400).json({ message: "Zieltyp fehlt" });

      const doc = await storage.getDocument(docId);
      if (!doc) return res.status(404).json({ message: "Dokument nicht gefunden" });

      const allowed = allowedConversions[doc.type];
      if (!allowed || !allowed.includes(targetType)) {
        return res.status(400).json({ message: `Umwandlung von ${doc.type} nach ${targetType} nicht erlaubt` });
      }

      const items = await storage.getDocumentItems(docId);
      const nextNum = await storage.getNextDocumentNumber(targetType);

      let abschlagNumber: number | null = null;
      if (targetType === "abschlagsrechnung") {
        if (!doc.projectId) {
          return res.status(400).json({ message: "Abschlagsrechnung benötigt ein zugeordnetes Projekt" });
        }
        const allDocs = await db.select().from(documents)
          .where(eq(documents.projectId, doc.projectId));
        const existingAbschlag = allDocs
          .filter(d => d.type === "abschlagsrechnung")
          .map(d => d.abschlagNumber || 0);
        abschlagNumber = existingAbschlag.length > 0 ? Math.max(...existingAbschlag) + 1 : 1;
      }

      const today = new Date().toISOString().split("T")[0];
      const skontoOverride = { skontoPercent: "0.00", skontoDays: 0 };
      const newDoc = await storage.createDocument({
        ...doc,
        id: undefined,
        documentNumber: nextNum,
        type: targetType,
        parentDocumentId: doc.id,
        status: "entwurf",
        date: today,
        subject: doc.subject || "",
        paidAmount: null,
        paidDate: null,
        previouslyInvoiced: null,
        abschlagNumber,
        ...skontoOverride,
      } as any);

      const isMitschnitt = targetType === "mitschnitt";
      const oldToNewItemId = new Map<number, number>();
      for (const item of items) {
        const oldId = item.id;
        const itemData: any = {
          ...item,
          id: undefined,
          documentId: newDoc.id,
          parentItemId: null,
        };
        if (isMitschnitt) {
          const hasQuantity = item.quantity && parseFloat(item.quantity) !== 0;
          if (hasQuantity) {
            itemData.originalQuantity = item.quantity;
            itemData.quantity = "0.000";
            itemData.totalPrice = "0.00";
          }
        }
        const newItem = await storage.createDocumentItem(itemData);
        oldToNewItemId.set(oldId, newItem.id);
      }
      for (const item of items) {
        if (item.parentItemId && oldToNewItemId.has(item.parentItemId)) {
          const newItemId = oldToNewItemId.get(item.id)!;
          const newParentId = oldToNewItemId.get(item.parentItemId)!;
          await storage.updateDocumentItem(newItemId, { parentItemId: newParentId } as any);
        }
      }

      const newStatus = sourceStatusAfterConvert[doc.type]?.[targetType];
      if (newStatus) {
        await storage.updateDocument(doc.id, { status: newStatus } as any);
      }

      await syncDocumentProjectTree(newDoc.id, newDoc.projectId);

      res.json(newDoc);
    } catch (err) { next(err); }
  });

  app.get("/api/documents/:id/abschlaege", requireAuth, async (req, res, next) => {
    try {
      const docId = parseInt(req.params.id);
      const doc = await storage.getDocument(docId);
      if (!doc) return res.status(404).json({ message: "Dokument nicht gefunden" });
      if (!doc.projectId) return res.json({ abschlaege: [], totalPreviouslyInvoiced: "0.00", auftragssumme: null });

      const allDocs = await db.select().from(documents)
        .where(eq(documents.projectId, doc.projectId));

      const invoiceTypes = ["abschlagsrechnung", "schlussrechnung", "rechnung"];

      const parentAB = doc.parentDocumentId;
      const allAbschlaege = allDocs
        .filter(d => {
          if (!invoiceTypes.includes(d.type) || d.id === docId) return false;
          if (parentAB) {
            return d.parentDocumentId === parentAB;
          }
          return true;
        })
        .sort((a, b) => (a.abschlagNumber || 0) - (b.abschlagNumber || 0) || a.id - b.id);

      const verrechnungen: any[] = (doc as any).abschlagVerrechnungen || [];
      const verrechnungenDocIds = new Set(verrechnungen.map((v: any) => v.docId));

      const relevantAbschlaege = verrechnungenDocIds.size > 0
        ? allAbschlaege.filter(d => verrechnungenDocIds.has(d.id))
        : allAbschlaege;

      const sortedForDelta = [...allAbschlaege].sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return da - db || a.id - b.id;
      });
      let prevItemsNet = 0;
      const deltaMap = new Map<number, { deltaNet: number; deltaGross: number }>();
      for (const s of sortedForDelta) {
        const itemsRows = await pool.query(
          `SELECT COALESCE(SUM(total_price), 0) as items_net FROM document_items WHERE document_id = $1 AND type = 'position'`,
          [s.id]
        );
        const itemsNet = parseFloat(itemsRows.rows[0]?.items_net || "0");
        const taxRate = parseFloat(String(s.taxRate)) || 0;
        const dn = Math.round((itemsNet - prevItemsNet) * 100) / 100;
        const dg = Math.round(dn * (1 + taxRate / 100) * 100) / 100;
        deltaMap.set(s.id, { deltaNet: dn, deltaGross: dg });
        prevItemsNet = itemsNet;
      }

      const abschlaegeWithDelta = relevantAbschlaege.map(d => {
        const verrEntry = verrechnungen.find((v: any) => v.docId === d.id);
        const delta = deltaMap.get(d.id);
        const netVal = verrEntry ? parseFloat(verrEntry.netAmount) : (delta?.deltaNet ?? parseFloat(d.netTotal || "0"));
        const grossVal = verrEntry ? parseFloat(verrEntry.grossAmount) : (delta?.deltaGross ?? parseFloat(d.grossTotal || "0"));
        const taxVal = grossVal - netVal;
        return { ...d, deltaNet: netVal.toFixed(2), deltaGross: grossVal.toFixed(2), deltaTax: taxVal.toFixed(2) };
      });

      const totalPreviouslyInvoicedNet = abschlaegeWithDelta
        .reduce((sum, d) => sum + parseFloat(d.deltaNet), 0)
        .toFixed(2);

      const totalPreviouslyInvoicedGross = abschlaegeWithDelta
        .reduce((sum, d) => sum + parseFloat(d.deltaGross), 0)
        .toFixed(2);

      const ab = parentAB ? allDocs.find(d => d.id === parentAB) : allDocs.find(d => d.type === "auftragsbestaetigung");
      const auftragssumme = ab ? ab.netTotal : null;

      res.json({
        abschlaege: abschlaegeWithDelta,
        totalPreviouslyInvoiced: totalPreviouslyInvoicedNet,
        totalPreviouslyInvoicedGross,
        auftragssumme,
      });
    } catch (err) { next(err); }
  });

  app.post("/api/documents/:id/freistellen", requireAuth, async (req, res, next) => {
    try {
      const docId = parseInt(req.params.id);
      const doc = await storage.getDocument(docId);
      if (!doc) return res.status(404).json({ message: "Dokument nicht gefunden" });
      const items = await storage.getDocumentItems(docId);
      const nextNum = await storage.getNextDocumentNumber("freies_dokument");
      const newDoc = await storage.createDocument({
        ...doc, id: undefined, documentNumber: nextNum, type: "freies_dokument",
        parentDocumentId: null, status: "entwurf", subject: doc.subject || "",
        paidAmount: null, paidDate: null, previouslyInvoiced: null, abschlagNumber: null,
      } as any);
      for (const item of items) {
        await storage.createDocumentItem({ ...item, id: undefined, documentId: newDoc.id } as any);
      }
      res.json(newDoc);
    } catch (err) { next(err); }
  });

  if (process.env.NODE_ENV !== "production") app.get("/api/documents/:id/engine-debug", requireAuth, async (req, res, next) => {
    try {
      const doc = await storage.getDocument(parseInt(req.params.id));
      if (!doc) return res.status(404).json({ message: "Dokument nicht gefunden" });
      const customer = doc.customerId ? await storage.getCustomer(doc.customerId) : null;
      const items = await storage.getDocumentItems(doc.id);
      const company = await storage.getCompanySettings();
      const effectiveFormTemplateId = await resolveServerFormTemplateId({
        documentType: doc.type,
        documentFormTemplateId: doc.formTemplateId,
        companyDefaultFormTemplateId: company?.defaultFormTemplateId,
      });
      let template = null;
      if (effectiveFormTemplateId) template = await storage.getFormTemplate(effectiveFormTemplateId);
      const project = doc.projectId ? await storage.getProject(doc.projectId) : null;
      const bundle = buildDocumentBundle(doc, customer || { id: 0, name: "—", customerNumber: "—" } as any, items, company || null, template, project);
      const computed = computeDocumentBundle(bundle);
      const ci = computed.computed;
      res.json({
        items: ci.visibleItems.map(i => ({
          type: i.type,
          positionNumber: i.positionNumber,
          posNumber: (i as any).posNumber || '',
          description: i.description,
          title: i.title,
          unit: i.unit,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          totalPrice: i.totalPrice,
          positionFlag: i.positionFlag,
          _clientId: i._clientId,
          _parentClientId: i._parentClientId,
        })),
        totals: ci.totals,
        pages: computed.layout.pages.map((p, idx) => ({
          pageIndex: idx,
          blockCount: p.blocks.length,
          blockTypes: p.blocks.map(b => b.type),
          carryForwardIn: p.carryForwardIn,
          carryForwardOut: p.carryForwardOut,
        })),
      });
    } catch (err) { next(err); }
  });

  app.post("/api/documents/preview-pdf", requireAuth, async (req, res, next) => {
    try {
      const { document: docData, items: itemsData, customerId, formTemplateId, projectId, displayMode } = req.body;
      const printDisplayMode = normalizePrintDisplayMode(displayMode);
      if (!docData) return res.status(400).json({ message: "Dokumentdaten fehlen" });

      const customer = customerId ? await storage.getCustomer(customerId) : null;
      const company = await storage.getCompanySettings();
      const effectiveTemplateId = await resolveServerFormTemplateId({
        documentType: docData.type || "angebot",
        documentFormTemplateId: formTemplateId || docData.formTemplateId,
        companyDefaultFormTemplateId: company?.defaultFormTemplateId,
      });
      let template = null;
      if (effectiveTemplateId) {
        template = await storage.getFormTemplate(effectiveTemplateId);
      }
      const project = projectId ? await storage.getProject(projectId) : null;

      const doc = {
        id: docData.id || 0,
        type: docData.type || "angebot",
        documentNumber: docData.documentNumber || "",
        date: (docData.date && /^\d{4}-\d{2}-\d{2}/.test(String(docData.date).trim())) ? String(docData.date).trim().slice(0, 10) : new Date().toISOString().slice(0, 10),
        validUntil: (docData.validUntil && /^\d{4}-\d{2}-\d{2}/.test(String(docData.validUntil).trim())) ? String(docData.validUntil).trim().slice(0, 10) : null,
        subject: docData.subject || "",
        headerText: docData.headerText || "",
        footerText: docData.footerText || "",
        beforeWorkText: docData.beforeWorkText || "",
        beforeTotalsText: docData.beforeTotalsText || "",
        afterTotalsText: docData.afterTotalsText || "",
        taxRate: docData.taxRate || "19.00",
        paymentTermDays: docData.paymentTermDays ?? 14,
        skontoDays: docData.skontoDays ?? 0,
        skontoPercent: docData.skontoPercent || "0",
        skontoNurMaterial: docData.skontoNurMaterial === true,
        retentionPercent: docData.retentionPercent || "0",
        customerId: customerId || null,
        projectId: projectId || null,
        formTemplateId: effectiveTemplateId || null,
        status: docData.status || "entwurf",
        customTypeLabel: docData.customTypeLabel || null,
        parentDocumentId: docData.parentDocumentId || null,
        abschlagNumber: docData.abschlagNumber || null,
        netTotal: docData.netTotal || "0",
        taxAmount: docData.taxAmount || "0",
        grossTotal: docData.grossTotal || "0",
        laborTotal: docData.laborTotal || "0",
        previouslyInvoiced: docData.previouslyInvoiced || "0",
        paidAmount: docData.paidAmount || "0",
        dezimalstellenMengen: docData.dezimalstellenMengen ?? 2,
        dezimalstellenPreise: docData.dezimalstellenPreise ?? 2,
        hideNetto: docData.hideNetto ?? false,
        hideMwst: docData.hideMwst ?? false,
        hideGesamt: docData.hideGesamt ?? false,
        showLohnanteil: docData.showLohnanteil ?? false,
        abschlagVerrechnungen: docData.abschlagVerrechnungen || [],
        skontoImDokument: docData.skontoImDokument !== false,
        par13b: docData.par13b || false,
        internpositionenVerbergen: docData.internpositionenVerbergen !== false,
        autoPositionNumbers: docData.autoPositionNumbers !== false,
        positionNumberStep: docData.positionNumberStep ?? 1,
        positionNumberStart: docData.positionNumberStart ?? 1,
      } as any;

      const mappedItems = (itemsData || []).map((it: any, idx: number) => ({
        id: it.id || idx + 1,
        documentId: doc.id,
        type: it.type || "position",
        positionNumber: it.positionNumber || "",
        title: it.title || null,
        description: it.description || null,
        articleNumber: it.articleNumber || null,
        quantity: it.quantity || "0",
        unit: it.unit || "",
        unitPrice: it.unitPrice || "0",
        totalPrice: it.totalPrice || "0",
        sortOrder: it.sortOrder ?? idx,
        parentItemId: it.parentItemId || null,
        _clientId: it._clientId || null,
        _parentClientId: it._parentClientId || null,
        pageBreakBefore: it.pageBreakBefore || false,
        positionFlag: it.positionFlag || null,
        flagLabel: it.flagLabel || null,
        materialPrice: it.materialPrice || null,
        materialCost: it.materialCost || null,
        laborCost: it.laborCost || null,
        equipmentCost: it.equipmentCost || null,
        externalCost: it.externalCost || null,
        materialMarkup: it.materialMarkup || null,
        laborMarkup: it.laborMarkup || null,
        equipmentMarkup: it.equipmentMarkup || null,
        externalMarkup: it.externalMarkup || null,
        laborPrice: it.laborPrice || null,
        priceFollowsCost: it.priceFollowsCost || false,
        originalQuantity: it.originalQuantity || null,
        afterTotals: it.afterTotals || false,
        laborTime: it.laborTime || null,
        fontBold: it.fontBold || false,
        fontItalic: it.fontItalic || false,
        fontUnderline: it.fontUnderline || false,
        fontSize: it.fontSize || null,
        fontColor: it.fontColor || null,
        discountPercent: it.discountPercent || null,
        discountBase: it.discountBase || null,
      }));

      const abschlagChain = await loadAbschlagChain(doc);
      const editorSettings = await loadEditorSettings();
      const port = parseInt(process.env.PORT || "5000");
      const pdfBuffer = await generatePdfFromHtml({
        document: doc,
        items: mappedItems,
        customer: customer || null,
        company: company || null,
        template: template ?? null,
        project: project ?? null,
        abschlagChain,
        editorSettings,
        displayMode: printDisplayMode,
      }, port);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="vorschau.pdf"`);
      res.send(pdfBuffer);
    } catch (err) { next(err); }
  });

  app.post("/api/documents/preview-token", requireAuth, async (req, res, next) => {
    try {
      const { document: docData, items: itemsData, customerId, formTemplateId, projectId, displayMode } = req.body;
      const printDisplayMode = normalizePrintDisplayMode(displayMode);
      if (!docData) return res.status(400).json({ message: "Dokumentdaten fehlen" });

      const customer = customerId ? await storage.getCustomer(customerId) : null;
      const company = await storage.getCompanySettings();
      const effectiveTemplateId = await resolveServerFormTemplateId({
        documentType: docData.type || "angebot",
        documentFormTemplateId: formTemplateId || docData.formTemplateId,
        companyDefaultFormTemplateId: company?.defaultFormTemplateId,
      });
      let template = null;
      if (effectiveTemplateId) {
        template = await storage.getFormTemplate(effectiveTemplateId);
      }
      const project = projectId ? await storage.getProject(projectId) : null;

      const doc = {
        id: docData.id || 0,
        type: docData.type || "angebot",
        documentNumber: docData.documentNumber || "",
        date: (docData.date && /^\d{4}-\d{2}-\d{2}/.test(String(docData.date).trim())) ? String(docData.date).trim().slice(0, 10) : new Date().toISOString().slice(0, 10),
        validUntil: (docData.validUntil && /^\d{4}-\d{2}-\d{2}/.test(String(docData.validUntil).trim())) ? String(docData.validUntil).trim().slice(0, 10) : null,
        subject: docData.subject || "",
        headerText: docData.headerText || "",
        footerText: docData.footerText || "",
        beforeWorkText: docData.beforeWorkText || "",
        beforeTotalsText: docData.beforeTotalsText || "",
        afterTotalsText: docData.afterTotalsText || "",
        taxRate: docData.taxRate || "19.00",
        paymentTermDays: docData.paymentTermDays ?? 14,
        skontoDays: docData.skontoDays ?? 0,
        skontoPercent: docData.skontoPercent || "0",
        skontoNurMaterial: docData.skontoNurMaterial === true,
        retentionPercent: docData.retentionPercent || "0",
        customerId: customerId || null,
        projectId: projectId || null,
        formTemplateId: effectiveTemplateId || null,
        status: docData.status || "entwurf",
        customTypeLabel: docData.customTypeLabel || null,
        parentDocumentId: docData.parentDocumentId || null,
        abschlagNumber: docData.abschlagNumber || null,
        netTotal: docData.netTotal || "0",
        taxAmount: docData.taxAmount || "0",
        grossTotal: docData.grossTotal || "0",
        laborTotal: docData.laborTotal || "0",
        previouslyInvoiced: docData.previouslyInvoiced || "0",
        paidAmount: docData.paidAmount || "0",
        dezimalstellenMengen: docData.dezimalstellenMengen ?? 2,
        dezimalstellenPreise: docData.dezimalstellenPreise ?? 2,
        hideNetto: docData.hideNetto ?? false,
        hideMwst: docData.hideMwst ?? false,
        hideGesamt: docData.hideGesamt ?? false,
        showLohnanteil: docData.showLohnanteil ?? false,
        abschlagVerrechnungen: docData.abschlagVerrechnungen || [],
        skontoImDokument: docData.skontoImDokument !== false,
        par13b: docData.par13b || false,
        internpositionenVerbergen: docData.internpositionenVerbergen !== false,
        autoPositionNumbers: docData.autoPositionNumbers !== false,
        positionNumberStep: docData.positionNumberStep ?? 1,
        positionNumberStart: docData.positionNumberStart ?? 1,
      } as any;

      const mappedItems = (itemsData || []).map((it: any, idx: number) => ({
        id: it.id || idx + 1,
        documentId: doc.id,
        type: it.type || "position",
        positionNumber: it.positionNumber || "",
        title: it.title || null,
        description: it.description || null,
        articleNumber: it.articleNumber || null,
        quantity: it.quantity || "0",
        unit: it.unit || "",
        unitPrice: it.unitPrice || "0",
        totalPrice: it.totalPrice || "0",
        sortOrder: it.sortOrder ?? idx,
        parentItemId: it.parentItemId || null,
        _clientId: it._clientId || null,
        _parentClientId: it._parentClientId || null,
        pageBreakBefore: it.pageBreakBefore || false,
        positionFlag: it.positionFlag || null,
        flagLabel: it.flagLabel || null,
        materialPrice: it.materialPrice || null,
        materialCost: it.materialCost || null,
        laborCost: it.laborCost || null,
        equipmentCost: it.equipmentCost || null,
        externalCost: it.externalCost || null,
        materialMarkup: it.materialMarkup || null,
        laborMarkup: it.laborMarkup || null,
        equipmentMarkup: it.equipmentMarkup || null,
        externalMarkup: it.externalMarkup || null,
        laborPrice: it.laborPrice || null,
        priceFollowsCost: it.priceFollowsCost || false,
        originalQuantity: it.originalQuantity || null,
        afterTotals: it.afterTotals || false,
        laborTime: it.laborTime || null,
        fontBold: it.fontBold || false,
        fontItalic: it.fontItalic || false,
        fontUnderline: it.fontUnderline || false,
        fontSize: it.fontSize || null,
        fontColor: it.fontColor || null,
        discountPercent: it.discountPercent || null,
        discountBase: it.discountBase || null,
      }));

      const editorSettings = await loadEditorSettings();

      const abschlagChain = await loadAbschlagChain(doc);

      const token = createPrintToken({
        document: doc,
        items: mappedItems,
        customer: customer ?? null,
        company: company ?? null,
        template: template ?? null,
        project: project ?? null,
        abschlagChain,
        editorSettings,
        displayMode: printDisplayMode,
      });

      res.json({ token });
    } catch (err) { next(err); }
  });

  app.get("/api/print-data/:token", async (req, res) => {
    const data = consumePrintToken(req.params.token);
    if (!data) return res.status(403).json({ message: "Ungültiger oder abgelaufener Token" });
    res.json(data);
  });

  app.get("/api/documents/:id/pdf", requireAuth, async (req, res, next) => {
    try {
      const doc = await storage.getDocument(parseInt(req.params.id));
      if (!doc) return res.status(404).json({ message: "Dokument nicht gefunden" });
      const customer = doc.customerId ? await storage.getCustomer(doc.customerId) : null;
      const items = await storage.getDocumentItems(doc.id);
      const company = await storage.getCompanySettings();
      const effectiveFormTemplateId = await resolveServerFormTemplateId({
        documentType: doc.type,
        documentFormTemplateId: doc.formTemplateId,
        companyDefaultFormTemplateId: company?.defaultFormTemplateId,
      });
      let template = null;
      if (effectiveFormTemplateId) {
        template = await storage.getFormTemplate(effectiveFormTemplateId);
      }
      const project = doc.projectId ? await storage.getProject(doc.projectId) : null;
      const abschlagChain = await loadAbschlagChain(doc);
      const pdfDisplayMode = normalizePrintDisplayMode(req.query.displayMode as string);
      const useLegacy = req.query.legacy === "1";
      if (useLegacy) {
        const pdfDoc = generateDocumentPdf(doc, customer || { id: 0, name: "—", customerNumber: "—" } as any, items, company || null, template, project, abschlagChain, pdfDisplayMode);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${doc.type}_${fmtDocNumber(doc.documentNumber)}.pdf"`);
        pdfDoc.pipe(res);
        pdfDoc.end();
        return;
      }
      const port = parseInt(process.env.PORT || "5000");
      const pdfBuffer = await generatePdfFromHtml({
        document: doc,
        items,
        customer: customer || null,
        company: company || null,
        template: template ?? null,
        project: project ?? null,
        abschlagChain,
        editorSettings: await loadEditorSettings(),
        displayMode: pdfDisplayMode,
      }, port);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${doc.type}_${fmtDocNumber(doc.documentNumber)}.pdf"`);
      res.send(pdfBuffer);
    } catch (err) { next(err); }
  });

  app.get("/api/documents/:id/invoice-register-check", requireAuth, async (req, res, next) => {
    try {
      const docId = parseInt(req.params.id);
      const doc = await storage.getDocument(docId);
      if (!doc) return res.status(404).json({ message: "Dokument nicht gefunden" });
      const registerTypes = ["rechnung", "abschlagsrechnung", "gutschrift"];
      if (!registerTypes.includes(doc.type)) {
        return res.json({ isInvoice: false });
      }
      const existing = await pool.query(
        `SELECT re_id, netto::float, brutto::float, betrag::float, offen::float, zahlung::float,
                belegdat, faelligdat, skontodat, sk_prozent::float, sk_betrag::float, konto_g, mahnen
         FROM fibu_buchungen WHERE document_id = $1 AND idx = 0`,
        [docId]
      );
      const customer = doc.customerId ? await storage.getCustomer(doc.customerId) : null;
      const edSettings = await pool.query(`SELECT default_skonto, default_skonto_tage, default_zahlungsziel FROM editor_settings LIMIT 1`);
      const defaults = edSettings.rows[0] || { default_skonto: 2, default_skonto_tage: 7, default_zahlungsziel: 14 };
      const fullNetTotal = parseFloat(String(doc.netTotal || "0"));
      const fullGrossTotal = parseFloat(String(doc.grossTotal || "0"));
      const verrechnungen: any[] = (doc as any).abschlagVerrechnungen || [];
      const sumVerrechnungenNet = verrechnungen.reduce((s: number, v: any) => s + (parseFloat(v.netAmount) || 0), 0);
      const sumVerrechnungenGross = verrechnungen.reduce((s: number, v: any) => s + (parseFloat(v.grossAmount) || 0), 0);
      const hasVerrechnungen = verrechnungen.length > 0;
      const retentionPct = parseFloat(String((doc as any).retentionPercent || "0"));

      const netTotal = Math.round((hasVerrechnungen ? fullNetTotal - sumVerrechnungenNet : fullNetTotal) * 100) / 100;
      const grossBeforeRetention = hasVerrechnungen ? fullGrossTotal - sumVerrechnungenGross : fullGrossTotal;
      const einbehaltBetrag = retentionPct > 0 ? Math.round(grossBeforeRetention * retentionPct) / 100 : 0;
      const grossTotal = Math.round((grossBeforeRetention - einbehaltBetrag) * 100) / 100;
      const steuer = Math.round((grossTotal - netTotal) * 100) / 100;
      const belegDatum = doc.date || new Date().toISOString().slice(0, 10);
      const erloeskonto = doc.erloeskonto || "4400";
      const isGutschrift = doc.type === "gutschrift";

      const typLabel = doc.type === "abschlagsrechnung" ? "Abschlagsrechnung"
        : doc.type === "gutschrift" ? "Gutschrift" : "Rechnung";

      const ex = existing.rows[0];
      if (ex) {
        const skontoPct = ex.sk_prozent || 0;
        const skontoBetrag = ex.sk_betrag || 0;
        res.json({
          isInvoice: true,
          isGutschrift,
          alreadyRegistered: true,
          existingReId: ex.re_id,
          documentNumber: doc.documentNumber,
          customerName: customer?.name || "—",
          customerNumber: customer?.customerNumber || "—",
          subject: doc.subject || "",
          typLabel,
          netTotal,
          steuer,
          grossTotal,
          erloeskonto: ex.konto_g || erloeskonto,
          belegDatum: ex.belegdat ? new Date(ex.belegdat).toISOString().slice(0, 10) : belegDatum,
          faelligDatum: ex.faelligdat ? new Date(ex.faelligdat).toISOString().slice(0, 10) : "",
          skontoDatum: ex.skontodat ? new Date(ex.skontodat).toISOString().slice(0, 10) : "",
          skontoPct,
          skontoBetrag,
          nichtMahnen: ex.mahnen === false,
          bereitsGezahlt: ex.zahlung || 0,
        });
      } else {
        const skontoPct = isGutschrift ? 0 : (customer?.skontoPercent ? parseFloat(String(customer.skontoPercent)) : parseFloat(defaults.default_skonto || "2"));
        const skontoTage = isGutschrift ? 0 : (customer?.skontoDays || parseInt(defaults.default_skonto_tage || "7"));
        const zahlungsziel = parseInt(defaults.default_zahlungsziel || "14");
        const skontoBetrag = isGutschrift ? 0 : Math.round(grossTotal * skontoPct / 100 * 100) / 100;
        const faelligDatum = new Date(new Date(belegDatum).getTime() + zahlungsziel * 86400000).toISOString().slice(0, 10);
        const skontoDatum = skontoTage > 0 ? new Date(new Date(belegDatum).getTime() + skontoTage * 86400000).toISOString().slice(0, 10) : "";
        res.json({
          isInvoice: true,
          isGutschrift,
          alreadyRegistered: false,
          existingReId: null,
          documentNumber: doc.documentNumber,
          customerName: customer?.name || "—",
          customerNumber: customer?.customerNumber || "—",
          subject: doc.subject || "",
          typLabel,
          netTotal,
          steuer,
          grossTotal,
          erloeskonto,
          belegDatum,
          faelligDatum,
          skontoDatum,
          skontoPct,
          skontoBetrag,
          nichtMahnen: false,
          bereitsGezahlt: 0,
        });
      }
    } catch (err) { next(err); }
  });

  app.post("/api/documents/:id/register-invoice", requireAuth, async (req, res, next) => {
    try {
      const docId = parseInt(req.params.id);
      const doc = await storage.getDocument(docId);
      if (!doc) return res.status(404).json({ message: "Dokument nicht gefunden" });
      const registerTypes = ["rechnung", "abschlagsrechnung", "gutschrift"];
      if (!registerTypes.includes(doc.type)) {
        return res.status(400).json({ message: "Nur Rechnungen/Gutschriften können ins Rechnungsausgangsbuch eingetragen werden" });
      }
      const {
        belegDatum, faelligDatum, skontoDatum, skontoPct, skontoBetrag,
        erloeskonto, netTotal, grossTotal, steuer, zahlBetrag, nichtMahnen
      } = req.body;

      const customer = doc.customerId ? await storage.getCustomer(doc.customerId) : null;
      const isGutschrift = doc.type === "gutschrift";
      const fibuTyp = isGutschrift ? "HG" : "HR";
      const today = new Date().toISOString().slice(0, 10);
      const periode = belegDatum ? belegDatum.slice(0, 7).replace("-", "") : today.slice(0, 7).replace("-", "");

      let existing = await pool.query(
        `SELECT re_id, zahlung::float, minderung::float, gutschrift::float, kuerzung::float, einbehalt::float, sk_betrag::float
         FROM fibu_buchungen WHERE document_id = $1 AND idx = 0`,
        [docId]
      );
      if (existing.rows.length === 0 && doc.documentNumber) {
        existing = await pool.query(
          `SELECT re_id, zahlung::float, minderung::float, gutschrift::float, kuerzung::float, einbehalt::float, sk_betrag::float
           FROM fibu_buchungen WHERE rnr = $1 AND art = 'RA' AND idx = 0`,
          [doc.documentNumber]
        );
        if (existing.rows.length > 0) {
          await pool.query(`UPDATE fibu_buchungen SET document_id = $1 WHERE re_id = $2 AND idx = 0`, [docId, existing.rows[0].re_id]);
        }
      }

      if (existing.rows.length > 0) {
        const reId = existing.rows[0].re_id;
        const ex = existing.rows[0];
        const betrag = zahlBetrag ?? grossTotal;
        const existingPayments = (parseFloat(ex.zahlung) || 0) + (parseFloat(ex.minderung) || 0) +
          (parseFloat(ex.gutschrift) || 0) + (parseFloat(ex.kuerzung) || 0) + (parseFloat(ex.einbehalt) || 0);
        const offen = Math.max(0, betrag - existingPayments);

        await pool.query(`
          UPDATE fibu_buchungen SET
            typ = $1,
            netto = $2, brutto = $3, betrag = $4, offen = $5,
            belegdat = $6, faelligdat = $7, skontodat = $8,
            sk_prozent = $9, sk_betrag = $10, sk_basis = $11,
            konto_g = $12, betreff = $13, adr_such = $14, adr_nr = $15,
            periode = $16, rechdat = $17, mahnen = $18
          WHERE re_id = $19 AND idx = 0
        `, [
          fibuTyp,
          netTotal, grossTotal, betrag, offen,
          belegDatum, faelligDatum, skontoDatum,
          skontoPct, skontoBetrag, grossTotal,
          erloeskonto, doc.subject || "",
          customer?.name || "", customer?.customerNumber || "",
          periode, today, nichtMahnen !== true,
          reId
        ]);
        await syncDocumentFinanceFromFibu(reId);
        res.json({ success: true, reId, updated: true });
      } else {
        const maxReId = await pool.query(`SELECT COALESCE(MAX(re_id), 9000) + 1 as next_id FROM fibu_buchungen`);
        const reId = maxReId.rows[0].next_id;
        const betrag = zahlBetrag ?? grossTotal;
        await pool.query(`
          INSERT INTO fibu_buchungen (
            re_id, idx, art, typ, rnr, adr_nr, adr_such, betreff,
            belegdat, rechdat, erfasstdat, faelligdat, skontodat,
            betrag, netto, brutto, offen,
            sk_prozent, sk_betrag, sk_basis,
            konto_g, periode, mahnen, document_id, bezahlflag
          ) VALUES (
            $1, 0, 'RA', $2, $3, $4, $5, $6,
            $7, $8, $8, $9, $10,
            $11, $12, $13, $11,
            $14, $15, $16,
            $17, $18, $19, $20, 0
          )
        `, [
          reId, fibuTyp, doc.documentNumber,
          customer?.customerNumber || "", customer?.name || "", doc.subject || "",
          belegDatum, today, faelligDatum, skontoDatum,
          betrag, netTotal, grossTotal,
          skontoPct, skontoBetrag, grossTotal,
          erloeskonto, periode, nichtMahnen !== true, docId
        ]);
        await syncDocumentFinanceFromFibu(reId);
        res.json({ success: true, reId, updated: false });
      }
    } catch (err) { next(err); }
  });

  app.get("/api/documents/:id/arbeitszeitliste-pdf", requireAuth, async (req, res, next) => {
    try {
      const doc = await storage.getDocument(parseInt(req.params.id));
      if (!doc) return res.status(404).json({ message: "Dokument nicht gefunden" });
      const customer = doc.customerId ? await storage.getCustomer(doc.customerId) : null;
      const items = await storage.getDocumentItems(doc.id);
      const company = await storage.getCompanySettings();
      const effectiveFormTemplateId = await resolveServerFormTemplateId({
        documentType: doc.type,
        documentFormTemplateId: doc.formTemplateId,
        companyDefaultFormTemplateId: company?.defaultFormTemplateId,
      });
      let template = null;
      if (effectiveFormTemplateId) {
        template = await storage.getFormTemplate(effectiveFormTemplateId);
      }
      const project = doc.projectId ? await storage.getProject(doc.projectId) : null;
      const port = parseInt(process.env.PORT || "5000");
      const pdfBuffer = await generatePdfFromHtml({
        document: doc,
        items,
        customer: customer || null,
        company: company || null,
        template,
        project,
        abschlagChain: [],
        editorSettings: await loadEditorSettings(),
        mode: "arbeitszeitliste",
      } as any, port);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Arbeitszeitliste_${fmtDocNumber(doc.documentNumber)}.pdf"`);
      res.send(pdfBuffer);
    } catch (err) { next(err); }
  });

  const sendEmailSchema = z.object({
    to: z.string().min(1, "Empfänger-E-Mail fehlt"),
    cc: z.string().optional(),
    bcc: z.string().optional(),
    subject: z.string().max(500).optional(),
    message: z.string().max(10000).optional(),
    attachPdf: z.boolean().optional().default(true),
  });

  app.post("/api/documents/:id/send-email", requireAuth, async (req, res, next) => {
    try {
      if (!process.env.RESEND_API_KEY) return res.status(500).json({ message: "RESEND_API_KEY nicht konfiguriert" });
      const parsed = sendEmailSchema.parse(req.body);
      const { to, cc, bcc, subject, message: customMessage, attachPdf } = parsed;
      const doc = await storage.getDocument(parseInt(req.params.id));
      if (!doc) return res.status(404).json({ message: "Dokument nicht gefunden" });

      const customer = doc.customerId ? await storage.getCustomer(doc.customerId) : null;
      const company = await storage.getCompanySettings();
      const user = req.user as any;
      const docTypeLabels: Record<string, string> = {
        angebot: "Angebot", auftragsbestaetigung: "Auftragsbestätigung",
        abschlagsrechnung: "Abschlagsrechnung",
        rechnung: "Rechnung", gutschrift: "Gutschrift", lieferschein: "Lieferschein",
        freies_dokument: "Freies Dokument",
      };
      const typeLabel = (doc as any).customTypeLabel || docTypeLabels[doc.type] || doc.type;
      const emailSubject = subject || `${typeLabel} Nr. ${doc.documentNumber}`;
      const html = buildDocumentEmailHtml({
        customerName: customer?.name || "Kunde",
        documentType: doc.type,
        documentNumber: doc.documentNumber,
        companyName: company?.companyName || undefined,
        senderName: user?.fullName || undefined,
        customMessage: customMessage || undefined,
      });

      let attachments: Array<{ filename: string; content: Buffer; contentType?: string }> | undefined;
      if (attachPdf !== false && customer) {
        const items = await storage.getDocumentItems(doc.id);
        const emailEffectiveTemplateId = await resolveServerFormTemplateId({
          documentType: doc.type,
          documentFormTemplateId: doc.formTemplateId,
          companyDefaultFormTemplateId: company?.defaultFormTemplateId,
        });
        let template = null;
        if (emailEffectiveTemplateId) template = await storage.getFormTemplate(emailEffectiveTemplateId);
        const project = doc.projectId ? await storage.getProject(doc.projectId) : null;
        const emailAbschlagChain = await loadAbschlagChain(doc);
        const port = parseInt(process.env.PORT || "5000");
        const pdfBuffer = await generatePdfFromHtml({
          document: doc,
          items,
          customer,
          company: company || null,
          template: template ?? null,
          project: project ?? null,
          abschlagChain: emailAbschlagChain,
          editorSettings: await loadEditorSettings(),
        }, port);
        attachments = [{ filename: `${typeLabel}_${fmtDocNumber(doc.documentNumber)}.pdf`, content: pdfBuffer, contentType: "application/pdf" }];
      }

      const result = await sendEmail({
        to: to.split(",").map(e => e.trim()).filter(Boolean),
        cc: cc ? cc.split(",").map(e => e.trim()).filter(Boolean) : undefined,
        bcc: bcc ? bcc.split(",").map(e => e.trim()).filter(Boolean) : undefined,
        subject: emailSubject,
        html,
        attachments,
      });

      if (result.success) {
        await storage.createMailLogEntry({
          date: new Date().toISOString().split("T")[0],
          direction: "Ausgang",
          recipientSender: to,
          subject: emailSubject,
          documentType: doc.type,
          documentNumber: doc.documentNumber,
          sendMethod: "E-Mail (PDF)",
          assignedTo: user?.id || null,
          assignedToName: user?.fullName || null,
          notes: `Gesendet an: ${to}${cc ? `, CC: ${cc}` : ""}`,
        });
      }

      res.json(result);
    } catch (err) { next(err); }
  });

  app.get("/api/documents/:id/items", requireAuth, async (req, res, next) => {
    try { res.json(await storage.getDocumentItems(parseInt(req.params.id))); } catch (err) { next(err); }
  });

  app.post("/api/documents/:id/items", requireAuth, async (req, res, next) => {
    try {
      res.status(201).json(await storage.createDocumentItem(insertDocumentItemSchema.parse({ ...req.body, documentId: parseInt(req.params.id) })));
    } catch (err) { next(err); }
  });

  app.patch("/api/document-items/:id", requireAuth, async (req, res, next) => {
    try { res.json(await storage.updateDocumentItem(parseInt(req.params.id), insertDocumentItemSchema.partial().parse(req.body))); } catch (err) { next(err); }
  });

  app.put("/api/documents/:id/items/bulk", requireAuth, async (req, res, next) => {
    try {
      const docId = parseInt(req.params.id);
      const { items } = req.body as { items: any[] };
      if (!Array.isArray(items)) return res.status(400).json({ message: "items must be an array" });
      const savedByInputIndex = await db.transaction(async (tx) => {
        return saveDocumentItemsBulk(tx, docId, items);
      });
      res.json(savedByInputIndex);
    } catch (err) { next(err); }
  });

  app.delete("/api/document-items/:id", requireAuth, async (req, res, next) => {
    try { await storage.deleteDocumentItem(parseInt(req.params.id)); res.json({ message: "Position gelöscht" }); } catch (err) { next(err); }
  });

  app.get("/api/materials", requireAuth, async (req, res, next) => {
    try {
      if (req.query.search && !req.query.page) return res.json(await storage.searchMaterials(req.query.search as string));
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const search = (req.query.search as string) || undefined;
      const category = (req.query.category as string) || undefined;
      return res.json(await storage.getMaterialsPaginated(page, limit, search, category));
    } catch (err) { next(err); }
  });

  app.post("/api/materials", requireAuth, async (req, res, next) => {
    try { res.status(201).json(await storage.createMaterial(insertMaterialSchema.parse(req.body))); } catch (err) { next(err); }
  });

  app.patch("/api/materials/:id", requireAuth, async (req, res, next) => {
    try { res.json(await storage.updateMaterial(parseInt(req.params.id), insertMaterialSchema.partial().parse(req.body))); } catch (err) { next(err); }
  });

  app.get("/api/labor-rates", requireAuth, async (_req, res, next) => {
    try { res.json(await storage.getLaborRates()); } catch (err) { next(err); }
  });

  app.post("/api/labor-rates", requireAuth, async (req, res, next) => {
    try { res.status(201).json(await storage.createLaborRate(insertLaborRateSchema.parse(req.body))); } catch (err) { next(err); }
  });

  app.patch("/api/labor-rates/:id", requireAuth, async (req, res, next) => {
    try { res.json(await storage.updateLaborRate(parseInt(req.params.id), insertLaborRateSchema.partial().parse(req.body))); } catch (err) { next(err); }
  });

  app.delete("/api/labor-rates/:id", requireAuth, async (req, res, next) => {
    try { await storage.deleteLaborRate(parseInt(req.params.id)); res.json({ message: "Lohnsatz gelöscht" }); } catch (err) { next(err); }
  });

  app.get("/api/text-templates", requireAuth, async (_req, res, next) => {
    try { res.json(await storage.getTextTemplates()); } catch (err) { next(err); }
  });

  app.post("/api/text-templates", requireAuth, async (req, res, next) => {
    try { res.status(201).json(await storage.createTextTemplate(insertTextTemplateSchema.parse(req.body))); } catch (err) { next(err); }
  });

  app.patch("/api/text-templates/:id", requireAuth, async (req, res, next) => {
    try { res.json(await storage.updateTextTemplate(parseInt(req.params.id), insertTextTemplateSchema.partial().parse(req.body))); } catch (err) { next(err); }
  });

  app.delete("/api/text-templates/:id", requireAuth, async (req, res, next) => {
    try { await storage.deleteTextTemplate(parseInt(req.params.id)); res.json({ message: "Textvorlage gelöscht" }); } catch (err) { next(err); }
  });

  app.get("/api/company-settings", requireAuth, async (_req, res, next) => {
    try { res.json(normalizeHapakResponseText(await storage.getCompanySettings() || null)); } catch (err) { next(err); }
  });

  app.post("/api/company-settings", requireAuth, async (req, res, next) => {
    try { res.json(normalizeHapakResponseText(await storage.upsertCompanySettings(insertCompanySettingsSchema.parse(req.body)))); } catch (err) { next(err); }
  });

  app.get("/api/editor-settings", requireAuth, async (_req, res, next) => {
    try {
      const { editorSettings } = await import("@shared/schema");
      const result = await db.select().from(editorSettings).limit(1);
      res.json(normalizeHapakResponseText(result[0] || null));
    } catch (err) { next(err); }
  });

  app.post("/api/editor-settings", requireAuth, async (req, res, next) => {
    try {
      const { editorSettings } = await import("@shared/schema");
      const body = { ...req.body };
      const decimalFields = [
        "kupferNotation", "selbstkostenLohnsatz",
        "aufschlagMaterial1", "aufschlagMaterial2", "aufschlagMaterial3",
        "kalkulierterLohnsatz1", "kalkulierterLohnsatz2", "kalkulierterLohnsatz3",
        "aufschlagGeraete", "aufschlagFremdleistung",
        "defaultRabatt", "defaultSkonto",
        "warnungAufschlagUnter", "alarmAufschlagUnter",
      ];
      for (const f of decimalFields) {
        if (typeof body[f] === "string") {
          body[f] = body[f].replace(",", ".");
        }
      }
      const existing = await db.select().from(editorSettings).limit(1);
      let result;
      if (existing.length > 0) {
        const updated = await db.update(editorSettings).set(body).where(eq(editorSettings.id, existing[0].id)).returning();
        result = updated[0];
      } else {
        const inserted = await db.insert(editorSettings).values(body).returning();
        result = inserted[0];
      }
      res.json(result);
    } catch (err) { next(err); }
  });

  function parseEInvoiceXml(xmlContent: string): any {
    const extracted: any = { format: null };
    try {
      const xml = xmlContent.trim();

      const isUBL = xml.includes("urn:oasis:names:specification:ubl") || xml.includes("<Invoice") || xml.includes("<ubl:Invoice");
      const isCII = xml.includes("urn:un:unece:uncefact:data") || xml.includes("CrossIndustryInvoice") || xml.includes("<rsm:");
      const isXRechnung = xml.includes("urn:cen.eu:en16931") || xml.includes("xrechnung");
      const isPeppol = xml.includes("urn:fdc:peppol.eu") || xml.includes("peppol");

      if (isCII || xml.includes("CrossIndustryInvoice")) {
        extracted.format = isXRechnung ? "XRechnung (CII)" : "CII/UN-CEFACT";
        const getText = (tag: string) => {
          const patterns = [
            new RegExp(`<(?:ram|rsm)?:?${tag}>([^<]+)<`, "i"),
            new RegExp(`<${tag}>([^<]+)<`, "i"),
          ];
          for (const p of patterns) { const m = xml.match(p); if (m) return m[1].trim(); }
          return null;
        };
        extracted.supplier = getText("Name") || getText("TradingBusinessName");
        const docIdMatch = xml.match(/<(?:rsm:)?ExchangedDocument>[\s\S]*?<(?:ram:)?ID>([^<]+)</i);
        extracted.invoiceNumber = docIdMatch ? docIdMatch[1].trim() : null;
        const issueDateMatch = xml.match(/(?:ExchangedDocument|IssueDateTime)[\s\S]*?DateTimeString[^>]*>(\d{8})</i) ||
                               xml.match(/IssueDateTime[\s\S]*?DateTimeString[^>]*>(\d{8})</i);
        if (issueDateMatch) {
          const d = issueDateMatch[1];
          extracted.date = `${d.substring(0,4)}-${d.substring(4,6)}-${d.substring(6,8)}`;
        }

        const dueDateStr = xml.match(/DueDateDateTime[\s\S]*?DateTimeString[^>]*>(\d{8})</i);
        if (dueDateStr) {
          const d = dueDateStr[1];
          extracted.dueDate = `${d.substring(0,4)}-${d.substring(4,6)}-${d.substring(6,8)}`;
        }

        const taxTotal = getText("TaxTotalAmount") || getText("GrandTotalAmount");
        const lineTotal = getText("LineTotalAmount") || getText("TaxBasisTotalAmount");
        const grandTotal = getText("DuePayableAmount") || getText("GrandTotalAmount");
        if (lineTotal) extracted.netTotal = parseFloat(lineTotal.replace(",", "."));
        if (grandTotal) extracted.grossTotal = parseFloat(grandTotal.replace(",", "."));

        const taxPercent = getText("RateApplicablePercent") || getText("Percent");
        if (taxPercent) extracted.taxRate = parseFloat(taxPercent.replace(",", "."));

        const taxAmt = getText("CalculatedAmount") || getText("TaxTotalAmount");
        if (taxAmt) extracted.taxAmount = parseFloat(taxAmt.replace(",", "."));

        const subjectMatch = xml.match(/IncludedNote[\s\S]*?Content[^>]*>([^<]+)</i) ||
                             xml.match(/InvoiceReferencedDocument[\s\S]*?Name[^>]*>([^<]+)</i);
        if (subjectMatch) extracted.subject = subjectMatch[1].trim();

      } else if (isUBL || isPeppol) {
        extracted.format = isPeppol ? "PEPPOL BIS Billing 3" : (isXRechnung ? "XRechnung (UBL)" : "UBL Invoice");
        const getText = (tag: string) => {
          const patterns = [
            new RegExp(`<(?:cbc|cac)?:?${tag}[^>]*>([^<]+)<`, "i"),
            new RegExp(`<${tag}[^>]*>([^<]+)<`, "i"),
          ];
          for (const p of patterns) { const m = xml.match(p); if (m) return m[1].trim(); }
          return null;
        };
        const ublIdMatch = xml.match(/<(?:cbc:)?ID>([^<]+)</i);
        extracted.invoiceNumber = ublIdMatch ? ublIdMatch[1].trim() : null;
        const issueDate = getText("IssueDate");
        if (issueDate) extracted.date = issueDate;
        const dueDate = getText("DueDate") || getText("PaymentDueDate");
        if (dueDate) extracted.dueDate = dueDate;

        const supplierMatch = xml.match(/AccountingSupplierParty[\s\S]*?<(?:cbc:)?(?:RegistrationName|Name)>([^<]+)</i);
        if (supplierMatch) extracted.supplier = supplierMatch[1].trim();

        const lineExt = getText("LineExtensionAmount") || getText("TaxExclusiveAmount");
        if (lineExt) extracted.netTotal = parseFloat(lineExt.replace(",", "."));
        const payable = getText("PayableAmount") || getText("TaxInclusiveAmount");
        if (payable) extracted.grossTotal = parseFloat(payable.replace(",", "."));
        const taxAmtMatch = xml.match(/TaxTotal[\s\S]*?<(?:cbc:)?TaxAmount[^>]*>([^<]+)</i);
        if (taxAmtMatch) extracted.taxAmount = parseFloat(taxAmtMatch[1].replace(",", "."));
        const taxPercent = getText("Percent");
        if (taxPercent) extracted.taxRate = parseFloat(taxPercent.replace(",", "."));

        const noteMatch = xml.match(/<(?:cbc:)?Note>([^<]+)</i);
        if (noteMatch) extracted.subject = noteMatch[1].trim();
      }

      if (extracted.netTotal && extracted.grossTotal && !extracted.taxRate) {
        const diff = extracted.grossTotal - extracted.netTotal;
        if (diff > 0 && extracted.netTotal > 0) {
          const rate = (diff / extracted.netTotal) * 100;
          if (Math.abs(rate - 19) < 0.5) extracted.taxRate = 19;
          else if (Math.abs(rate - 7) < 0.5) extracted.taxRate = 7;
          else extracted.taxRate = Math.round(rate * 100) / 100;
        }
      }
      if (extracted.netTotal && extracted.taxRate && !extracted.taxAmount) {
        extracted.taxAmount = Math.round(extracted.netTotal * extracted.taxRate) / 100;
      }
    } catch (e) {
      console.error("E-Invoice XML parse error:", e);
    }
    return extracted;
  }

  function extractZugferdXml(pdfBuffer: Buffer): string | null {
    const bufStr = pdfBuffer.toString("binary");
    const xmlPatterns = [
      /(<\?xml[\s\S]*?CrossIndustryInvoice[\s\S]*?<\/(?:rsm:)?CrossIndustryInvoice>)/,
      /(<\?xml[\s\S]*?<Invoice[\s\S]*?<\/(?:ubl:)?Invoice>)/,
    ];
    for (const pattern of xmlPatterns) {
      const m = bufStr.match(pattern);
      if (m) return m[1];
    }
    const xmlStart = bufStr.indexOf("<?xml");
    if (xmlStart >= 0) {
      const candidates = ["</CrossIndustryInvoice>", "</rsm:CrossIndustryInvoice>", "</Invoice>", "</ubl:Invoice>"];
      for (const end of candidates) {
        const endIdx = bufStr.indexOf(end, xmlStart);
        if (endIdx > xmlStart) {
          return bufStr.substring(xmlStart, endIdx + end.length);
        }
      }
    }
    return null;
  }

  app.post("/api/incoming-invoices/upload", requireAuth, upload.single("pdf"), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ message: "Keine Datei hochgeladen" });
      const filePath = path.join(uploadsDir, req.file.filename);
      const fileBuffer = fs.readFileSync(filePath);
      const ext = path.extname(req.file.originalname).toLowerCase();
      const supplier = extractSupplierFromFilename(req.file.originalname);
      const today = new Date().toISOString().split("T")[0];

      let extracted: any = {};
      let detectedFormat: string | null = null;

      const imageExts = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
      const isImage = imageExts.includes(ext);

      const invoiceExtractionPrompt = `Du bist ein Rechnungs-Datenextrahierer. Extrahiere folgende Felder und gib NUR ein JSON-Objekt zurück (keine Markdown, kein Text drumherum):
{
  "supplier": "Lieferantenname",
  "invoiceNumber": "Rechnungsnummer",
  "date": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD oder null",
  "netTotal": "Nettobetrag als Zahl (Punkt als Dezimaltrenner)",
  "taxRate": "MwSt-Satz als Zahl (z.B. 19.00)",
  "grossTotal": "Bruttobetrag als Zahl",
  "subject": "Betreff/Leistungsbeschreibung (kurz)",
  "iban": "IBAN des Lieferanten oder null",
  "skontoProzent": "Skonto-Prozentsatz oder null",
  "skontoTage": "Skonto-Tage oder null"
}
Wenn ein Feld nicht erkennbar ist, setze null. Deutsche Zahlenformate (Komma als Dezimaltrenner) in Punkt-Format umwandeln.`;

      if (ext === ".xml") {
        const xmlContent = fileBuffer.toString("utf-8");
        extracted = parseEInvoiceXml(xmlContent);
        detectedFormat = extracted.format || "XML";
        delete extracted.format;
        console.log(`E-Invoice XML parsed (${detectedFormat}):`, JSON.stringify(extracted));
      } else if (isImage) {
        try {
          const { aiCompleteWithDocument } = await import("./ai-providers");
          const mimeMap: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };
          const result = await aiCompleteWithDocument({
            system: invoiceExtractionPrompt,
            documentBase64: fileBuffer.toString("base64"),
            documentMediaType: mimeMap[ext] || "image/jpeg",
            userMessage: "Lies diese Rechnung und extrahiere alle erkennbaren Daten.",
            maxTokens: 800,
          });
          const jsonMatch = result.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) extracted = JSON.parse(jsonMatch[0]);
          detectedFormat = "Bild (KI-Vision)";
        } catch (imgErr) {
          console.error("Image AI extraction failed:", imgErr);
        }
      } else {
        const zugferdXml = extractZugferdXml(fileBuffer);
        if (zugferdXml) {
          extracted = parseEInvoiceXml(zugferdXml);
          detectedFormat = extracted.format ? `ZUGFeRD / ${extracted.format}` : "ZUGFeRD";
          delete extracted.format;
          console.log(`ZUGFeRD XML extracted and parsed (${detectedFormat}):`, JSON.stringify(extracted));
        }

        if (!extracted.supplier && !extracted.invoiceNumber) {
          try {
            const pdfParseModule: any = await import("pdf-parse");
            const pdfParse = pdfParseModule.default ?? pdfParseModule;
            const pdfData = await pdfParse(fileBuffer);
            const pdfText = (pdfData.text || "").substring(0, 4000);

            if (pdfText.trim().length > 20) {
              try {
                const { aiComplete } = await import("./ai-providers");
                const result = await aiComplete({
                  system: invoiceExtractionPrompt,
                  messages: [{ role: "user", content: pdfText }],
                  tier: "fast",
                  maxTokens: 500,
                });
                const jsonMatch = result.text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  extracted = JSON.parse(jsonMatch[0]);
                }
                if (!detectedFormat) detectedFormat = "PDF (KI-Extraktion)";
              } catch (aiErr) {
                console.error("AI extraction failed, using text fallback:", aiErr);
              }
            }
          } catch (pdfErr) {
            console.error("PDF parse failed:", pdfErr);
          }
        }
      }

      const netTotal = extracted.netTotal ? parseFloat(String(extracted.netTotal)) : 0;
      const taxRate = extracted.taxRate ? parseFloat(String(extracted.taxRate)) : 19;
      const taxAmount = extracted.taxAmount
        ? parseFloat(String(extracted.taxAmount))
        : (netTotal * taxRate / 100);
      const grossTotal = extracted.grossTotal ? parseFloat(String(extracted.grossTotal)) : (netTotal + taxAmount);

      const skontoProzent = extracted.skontoProzent ? parseFloat(String(extracted.skontoProzent)) : null;
      const skontoTage = extracted.skontoTage ? parseInt(String(extracted.skontoTage)) : null;
      let discountDate: string | null = null;
      if (skontoTage && extracted.date) {
        const d2 = new Date(extracted.date);
        d2.setDate(d2.getDate() + skontoTage);
        discountDate = d2.toISOString().split("T")[0];
      }

      const invoice = await storage.createIncomingInvoice({
        supplier: extracted.supplier || supplier,
        invoiceNumber: extracted.invoiceNumber || null,
        date: extracted.date || today,
        dueDate: extracted.dueDate || null,
        netTotal: netTotal.toFixed(2),
        taxRate: taxRate.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        grossTotal: grossTotal.toFixed(2),
        subject: extracted.subject || null,
        status: "offen",
        pdfPath: req.file.filename,
        discountPercent: skontoProzent ? skontoProzent.toFixed(2) : null,
        discountAmount: skontoProzent ? (grossTotal * skontoProzent / 100).toFixed(2) : null,
        discountDate,
      });
      await storage.createDocumentAttachment({
        targetType: "incoming_invoice",
        targetId: invoice.id,
        incomingInvoiceId: invoice.id,
        source: "manual_upload",
        originalFilename: req.file.originalname,
        storedFilename: req.file.filename,
        filePath: req.file.filename,
        mimeType: mimeTypeForAttachment(req.file.originalname, req.file.mimetype),
        fileSize: req.file.size,
        sha256: createHash("sha256").update(fileBuffer).digest("hex"),
        title: extracted.subject || req.file.originalname,
        status: "active",
      });
      res.status(201).json({ ...invoice, detectedFormat: detectedFormat || "PDF" });
    } catch (err) { next(err); }
  });

  app.get("/api/incoming-invoices/:id/attachments", requireAuth, async (req, res, next) => {
    try {
      const invoiceId = parseInt(req.params.id);
      if (!Number.isFinite(invoiceId)) return res.status(400).json({ message: "Ungültige Eingangsrechnungs-ID" });
      res.json(await storage.getDocumentAttachments({ incomingInvoiceId: invoiceId }));
    } catch (err) { next(err); }
  });

  app.get("/api/fibu/:reId/attachments", requireAuth, async (req, res, next) => {
    try {
      const reId = parseInt(req.params.reId);
      if (!Number.isFinite(reId)) return res.status(400).json({ message: "Ungültige FIBU-RE-ID" });
      res.json(await storage.getDocumentAttachments({ fibuReId: reId }));
    } catch (err) { next(err); }
  });

  app.get("/api/document-attachments/:id/file", requireAuth, async (req, res, next) => {
    try {
      const attachmentId = parseInt(req.params.id);
      if (!Number.isFinite(attachmentId)) return res.status(400).json({ message: "Ungültige Anhang-ID" });
      const attachments = await pool.query(`
        SELECT id, original_filename, stored_filename, file_path, mime_type
        FROM document_attachments
        WHERE id = $1 AND status = 'active'
        LIMIT 1
      `, [attachmentId]);
      const attachment = attachments.rows[0];
      if (!attachment) return res.status(404).json({ message: "Anhang nicht gefunden" });

      const safeName = path.basename(String(attachment.file_path || attachment.stored_filename || ""));
      if (!safeName || safeName !== String(attachment.file_path || attachment.stored_filename || "")) {
        return res.status(400).json({ message: "Ungültiger Dateipfad" });
      }
      const resolvedPath = resolveUploadPath(uploadsDir, safeName);
      if (!resolvedPath || !resolvedPath.startsWith(path.resolve(uploadsDir))) return res.status(400).json({ message: "Ungültiger Dateipfad" });
      if (!fs.existsSync(resolvedPath)) return res.status(404).json({ message: "Datei nicht gefunden" });

      res.setHeader("Content-Type", mimeTypeForAttachment(safeName, attachment.mime_type));
      res.setHeader("Content-Disposition", `inline; filename="${safeDispositionFilename(attachment.original_filename || safeName)}"`);
      fs.createReadStream(resolvedPath).pipe(res);
    } catch (err) { next(err); }
  });

  app.get("/api/incoming-invoices/:id/pdf", requireAuth, async (req, res, next) => {
    try {
      const inv = await storage.getIncomingInvoice(parseInt(req.params.id));
      if (!inv || !inv.pdfPath) return res.status(404).json({ message: "PDF nicht gefunden" });
      const safeName = path.basename(inv.pdfPath);
      if (safeName !== inv.pdfPath || safeName.includes("..")) return res.status(400).json({ message: "Ungültiger Dateipfad" });
      const resolvedPath = resolveUploadPath(uploadsDir, safeName);
      if (!resolvedPath) return res.status(400).json({ message: "Ungültiger Dateipfad" });
      if (!resolvedPath.startsWith(path.resolve(uploadsDir))) return res.status(400).json({ message: "Ungültiger Dateipfad" });
      if (!fs.existsSync(resolvedPath)) return res.status(404).json({ message: "Datei nicht gefunden" });
      const ext = path.extname(safeName).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".xml": "application/xml", ".pdf": "application/pdf",
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif"
      };
      const contentType = mimeTypes[ext] || "application/pdf";
      const fileExt = ext.replace(".", "") || "pdf";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `inline; filename="rechnung_${inv.id}.${fileExt}"`);
      fs.createReadStream(resolvedPath).pipe(res);
    } catch (err) { next(err); }
  });

  app.get("/api/incoming-invoices", requireAuth, async (req, res, next) => {
    try {
      if (req.query.paginated === "true") {
        const limit = Math.max(1, Math.min(parseInt(req.query.limit as string) || 50, 500));
        const offset = Math.max(0, parseInt(req.query.offset as string) || 0);
        const search = (req.query.search as string || "").trim();
        const status = req.query.status as string || "";
        const dateFrom = req.query.dateFrom as string || "";
        const dateTo = req.query.dateTo as string || "";
        const projectId = req.query.projectId as string || "";

        let where = "WHERE 1=1";
        const params: any[] = [];
        let pi = 1;
        if (search) {
          where += ` AND (supplier ILIKE $${pi} OR invoice_number ILIKE $${pi} OR document_number ILIKE $${pi} OR subject ILIKE $${pi} OR project_number ILIKE $${pi})`;
          params.push(`%${search}%`); pi++;
        }
        if (status && status !== "alle") {
          where += ` AND status = $${pi}`;
          params.push(status); pi++;
        }
        if (dateFrom) { where += ` AND date >= $${pi}`; params.push(dateFrom); pi++; }
        if (dateTo) { where += ` AND date <= $${pi}`; params.push(dateTo); pi++; }
        if (projectId) { where += ` AND project_id = $${pi}`; params.push(parseInt(projectId)); pi++; }

        const countRes = await pool.query(`SELECT COUNT(*) as total, COALESCE(SUM(net_total),0) as total_netto, COALESCE(SUM(gross_total),0) as total_brutto, COALESCE(SUM(paid_amount),0) as total_bezahlt FROM incoming_invoices ${where}`, params);
        const total = parseInt(countRes.rows[0].total);
        const totalNetto = parseFloat(countRes.rows[0].total_netto);
        const totalBezahlt = parseFloat(countRes.rows[0].total_bezahlt);
        const totalOffen = parseFloat(countRes.rows[0].total_brutto) - totalBezahlt;

        const dataRes = await pool.query(`
          SELECT ii.*,
            (
              SELECT f.re_id
              FROM fibu_buchungen f
              WHERE f.art = 'RE' AND f.idx = 0 AND f.stornoflag != 2
                AND (
                  f.document_id = ii.id OR
                  (f.rnr = ii.invoice_number AND LOWER(COALESCE(f.adr_such, '')) = LOWER(COALESCE(ii.supplier, '')))
                )
              ORDER BY f.re_id DESC
              LIMIT 1
            ) as registered_re_id
          FROM incoming_invoices ii ${where}
          ORDER BY date DESC NULLS LAST, id DESC
          LIMIT $${pi} OFFSET $${pi + 1}
        `, [...params, limit, offset]);
        const mapped = dataRes.rows.map((r: any) => ({
          id: r.id, lfdNr: r.lfd_nr, supplier: r.supplier, supplierNumber: r.supplier_number,
          invoiceNumber: r.invoice_number, documentId: r.document_id, documentNumber: r.document_number,
          date: r.date, dueDate: r.due_date, netTotal: r.net_total, taxRate: r.tax_rate,
          taxAmount: r.tax_amount, grossTotal: r.gross_total, paidAmount: r.paid_amount,
          paidDate: r.paid_date, status: r.status, projectId: r.project_id,
          projectNumber: r.project_number, costAccount: r.cost_account, costCenter: r.cost_center,
          subject: r.subject, notes: r.notes, bookingDate: r.booking_date, pdfPath: r.pdf_path,
          discountPercent: r.discount_percent, discountAmount: r.discount_amount,
          discountDate: r.discount_date, paymentMethod: r.payment_method, bankAccount: r.bank_account,
          invoiceType: r.invoice_type || "rechnung", reverseCharge: r.reverse_charge || false,
          registeredReId: r.registered_re_id ? Number(r.registered_re_id) : null,
          createdAt: r.created_at,
        }));
        return res.json({ data: mapped, total, totalNetto, totalBezahlt, totalOffen, limit, offset });
      }
      if (req.query.projectId) return res.json(await storage.getIncomingInvoicesByProject(parseInt(req.query.projectId as string)));
      res.json(await storage.getIncomingInvoices());
    } catch (err) { next(err); }
  });

  app.get("/api/incoming-invoices/:id", requireAuth, async (req, res, next) => {
    try {
      const inv = await storage.getIncomingInvoice(parseInt(req.params.id));
      if (!inv) return res.status(404).json({ message: "Eingangsrechnung nicht gefunden" });
      res.json(inv);
    } catch (err) { next(err); }
  });

  app.post("/api/incoming-invoices", requireAuth, async (req, res, next) => {
    try {
      const body = { ...req.body };
      const numericFields = ["netTotal", "taxRate", "taxAmount", "grossTotal", "paidAmount", "discountPercent", "discountAmount"];
      const intFields = ["projectId", "documentId", "lfdNr"];
      for (const f of numericFields) { if (body[f] === "" || body[f] === undefined) body[f] = null; }
      for (const f of intFields) { if (body[f] === "" || body[f] === undefined) body[f] = null; }
      const dateFields = ["dueDate", "paidDate", "bookingDate", "discountDate"];
      for (const f of dateFields) { if (body[f] === "" || body[f] === undefined) body[f] = null; }

      if (body.reverseCharge) {
        body.taxRate = "0.00";
        body.taxAmount = "0.00";
        const net = parseFloat(body.netTotal) || 0;
        body.grossTotal = net.toFixed(2);
      } else {
        const net = parseFloat(body.netTotal);
        const rate = parseFloat(body.taxRate || "19");
        if (net && rate > 0) {
          if (!body.taxAmount || body.taxAmount === null || parseFloat(body.taxAmount) === 0) {
            body.taxAmount = (net * rate / 100).toFixed(2);
          }
          if (!body.grossTotal || body.grossTotal === null || parseFloat(body.grossTotal) === 0) {
            body.grossTotal = (net + parseFloat(body.taxAmount)).toFixed(2);
          }
        }
      }
      const invoice = await storage.createIncomingInvoice(insertIncomingInvoiceSchema.parse(body));

      if (body.reverseCharge) {
        const net = parseFloat(body.netTotal) || 0;
        const ustBetrag = parseFloat((net * 0.19).toFixed(2));
        const bookDate = body.date || new Date().toISOString().split("T")[0];
        const desc13b = `§13b Reverse Charge - ${body.supplier || ""}`;
        await db.insert(ledgerEntries).values([
          { date: bookDate, type: "ER", documentRef: body.invoiceNumber || `ER-${invoice.id}`, debitAccount: "1577", creditAccount: "1787", amount: ustBetrag.toFixed(2), taxRate: "19", description: desc13b, address: body.supplier || "", reId: invoice.id, bookingType: "13b_vorsteuer" },
          { date: bookDate, type: "ER", documentRef: body.invoiceNumber || `ER-${invoice.id}`, debitAccount: "1787", creditAccount: "1577", amount: ustBetrag.toFixed(2), taxRate: "19", description: desc13b, address: body.supplier || "", reId: invoice.id, bookingType: "13b_ust" },
        ]);
      }

      res.status(201).json(invoice);
    } catch (err) { next(err); }
  });

  app.patch("/api/incoming-invoices/:id", requireAuth, async (req, res, next) => {
    try {
      const body = { ...req.body };
      const invoiceId = parseInt(req.params.id);
      const numericFields = ["netTotal", "taxRate", "taxAmount", "grossTotal", "paidAmount", "discountPercent", "discountAmount"];
      const intFields = ["projectId", "documentId", "lfdNr"];
      for (const f of numericFields) { if (body[f] === "") body[f] = null; }
      for (const f of intFields) { if (body[f] === "") body[f] = null; }
      const dateFields = ["dueDate", "paidDate", "bookingDate", "discountDate"];
      for (const f of dateFields) { if (body[f] === "") body[f] = null; }

      const existing = await storage.getIncomingInvoice(invoiceId);
      const registeredFibu = await pool.query(`
        SELECT re_id
        FROM fibu_buchungen
        WHERE art = 'RE' AND idx = 0 AND stornoflag != 2
          AND (
            document_id = $1 OR
            (rnr = $2 AND LOWER(COALESCE(adr_such, '')) = LOWER(COALESCE($3, '')))
          )
        LIMIT 1
      `, [invoiceId, existing?.invoiceNumber || "", existing?.supplier || ""]);
      const touchesPaymentState = body.paidAmount !== undefined || body.paidDate !== undefined || body.status !== undefined;
      if (registeredFibu.rows.length > 0 && touchesPaymentState) {
        return res.status(409).json({
          message: "Diese Eingangsrechnung ist bereits in FIBU gebucht. Zahlungen bitte ueber die FIBU-Buchung erfassen.",
          reId: registeredFibu.rows[0].re_id,
        });
      }
      const isReverseCharge = body.reverseCharge !== undefined ? body.reverseCharge : (existing?.reverseCharge || false);
      const isFullEdit = body.supplier !== undefined || body.netTotal !== undefined || body.reverseCharge !== undefined;

      if (isFullEdit && isReverseCharge) {
        body.reverseCharge = true;
        body.taxRate = "0.00";
        body.taxAmount = "0.00";
        const net = parseFloat(body.netTotal || existing?.netTotal || "0") || 0;
        body.grossTotal = net.toFixed(2);
      } else if (isFullEdit && !isReverseCharge) {
        body.reverseCharge = false;
        const net = parseFloat(body.netTotal || existing?.netTotal || "0");
        const rate = parseFloat(body.taxRate || existing?.taxRate || "19");
        if (net && rate > 0) {
          if (!body.taxAmount || body.taxAmount === null || parseFloat(body.taxAmount) === 0) {
            body.taxAmount = (net * rate / 100).toFixed(2);
          }
          if (!body.grossTotal || body.grossTotal === null || parseFloat(body.grossTotal) === 0) {
            body.grossTotal = (net + parseFloat(body.taxAmount)).toFixed(2);
          }
        }
      }
      const data = insertIncomingInvoiceSchema.partial().parse(body);
      delete (data as any).pdfPath;
      const updated = await storage.updateIncomingInvoice(invoiceId, data);

      if (isFullEdit) {
        await db.delete(ledgerEntries).where(and(eq(ledgerEntries.reId, invoiceId), sql`booking_type IN ('13b_vorsteuer', '13b_ust')`));

        if (isReverseCharge) {
          const effNet = parseFloat(body.netTotal || existing?.netTotal || "0") || 0;
          const ustBetrag = parseFloat((effNet * 0.19).toFixed(2));
          const bookDate = body.date || existing?.date || new Date().toISOString().split("T")[0];
          const effSupplier = body.supplier || existing?.supplier || "";
          const desc13b = `§13b Reverse Charge - ${effSupplier}`;
          const docRef = body.invoiceNumber || existing?.invoiceNumber || `ER-${invoiceId}`;
          await db.insert(ledgerEntries).values([
            { date: bookDate, type: "ER", documentRef: docRef, debitAccount: "1577", creditAccount: "1787", amount: ustBetrag.toFixed(2), taxRate: "19", description: desc13b, address: effSupplier, reId: invoiceId, bookingType: "13b_vorsteuer" },
            { date: bookDate, type: "ER", documentRef: docRef, debitAccount: "1787", creditAccount: "1577", amount: ustBetrag.toFixed(2), taxRate: "19", description: desc13b, address: effSupplier, reId: invoiceId, bookingType: "13b_ust" },
          ]);
        }
      }

      res.json(normalizeHapakResponseText(updated));
    } catch (err) { next(err); }
  });

  app.delete("/api/incoming-invoices/:id", requireAuth, async (req, res, next) => {
    try {
      const invoiceId = parseInt(req.params.id);
      await db.delete(ledgerEntries).where(and(eq(ledgerEntries.reId, invoiceId), sql`booking_type IN ('13b_vorsteuer', '13b_ust')`));
      await storage.deleteIncomingInvoice(invoiceId);
      res.json({ message: "Eingangsrechnung gelöscht" });
    } catch (err) { next(err); }
  });

  app.post("/api/incoming-invoices/:id/register-fibu", requireAuth, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const invoiceId = parseInt(req.params.id);
      if (isNaN(invoiceId)) return res.status(400).json({ message: "Ungueltige Eingangsrechnung" });

      await client.query("BEGIN");

      const invRes = await client.query(`
        SELECT *
        FROM incoming_invoices
        WHERE id = $1
        FOR UPDATE
      `, [invoiceId]);
      if (invRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Eingangsrechnung nicht gefunden" });
      }

      const inv = invRes.rows[0];
      const duplicate = await client.query(`
        SELECT re_id
        FROM fibu_buchungen f
        WHERE f.art = 'RE' AND f.idx = 0 AND f.stornoflag != 2
          AND (
            f.document_id = $1 OR
            (f.rnr = $2 AND LOWER(COALESCE(f.adr_such, '')) = LOWER(COALESCE($3, '')))
          )
        ORDER BY f.re_id DESC
        LIMIT 1
      `, [invoiceId, inv.invoice_number || "", inv.supplier || ""]);
      if (duplicate.rows.length > 0) {
        await client.query(`
          UPDATE document_attachments
          SET fibu_re_id = $1,
              fibu_idx = COALESCE(fibu_idx, 0)
          WHERE incoming_invoice_id = $2
            AND status = 'active'
            AND fibu_re_id IS NULL
        `, [duplicate.rows[0].re_id, invoiceId]);
        await client.query("COMMIT");
        return res.json({ success: true, reId: duplicate.rows[0].re_id, existing: true });
      }

      const grossTotal = Number(inv.gross_total || 0);
      const netTotal = Number(inv.net_total || 0);
      const paidAmount = Number(inv.paid_amount || 0);
      const openAmount = Math.max(0, Math.round((grossTotal - paidAmount) * 100) / 100);
      const bezahlflag = openAmount <= 0.005 ? 2 : paidAmount > 0 ? 1 : 0;
      const today = new Date().toISOString().slice(0, 10);
      const belegDatum = inv.date || today;
      const periode = String(belegDatum).slice(0, 7).replace("-", "");
      const rnr = inv.invoice_number || inv.document_number || `ER-${invoiceId}`;
      const fibuTyp = inv.invoice_type === "gutschrift" ? "HG" : "HR";
      const kontoB = inv.reverse_charge ? "3400" : "3300";
      const kontoG = inv.cost_account || "5400";
      const bankKonto = inv.bank_account || "1800";

      const maxReId = await client.query(`SELECT COALESCE(MAX(re_id), 9000) + 1 as next_id FROM fibu_buchungen`);
      const reId = maxReId.rows[0].next_id;

      await client.query(`
        INSERT INTO fibu_buchungen (
          re_id, idx, lfd_nr, periode, art, typ, kennung, rnr, adr_nr, adr_such, betreff,
          belegdat, rechdat, erfasstdat, faelligdat, zahldat, skontodat,
          betrag, netto, brutto, zahlung, offen,
          sk_prozent, sk_betrag, sk_basis,
          konto_b, konto_g, kst, ktr, bezahlflag, stornoflag, mahnen, document_id
        ) VALUES (
          $1, 0, $2, $3, 'RE', $4, 100, $5, $6, $7, $8,
          $9, $9, $10, $11, $12, $13,
          $14, $15, $14, $16, $17,
          $18, 0, $14,
          $19, $20, $21, $22, $23, 0, true, $24
        )
      `, [
        reId, inv.lfd_nr ? String(inv.lfd_nr) : null, periode, fibuTyp, rnr,
        inv.supplier_number || null, inv.supplier || "", inv.subject || "",
        belegDatum, today, inv.due_date || null, paidAmount > 0 ? (inv.paid_date || today) : null, inv.discount_date || null,
        grossTotal, netTotal, paidAmount, openAmount,
        Number(inv.discount_percent || 0), kontoB, kontoG,
        inv.cost_center || null, inv.project_number || null, bezahlflag, invoiceId,
      ]);

      if (paidAmount > 0) {
        await client.query(`
          INSERT INTO fibu_buchungen (
            re_id, idx, art, typ, kennung, rnr, adr_nr, adr_such, betreff,
            zahldat, zahlung, sk_betrag, brutto, konto_b, konto_g, ktr, kst, periode, bezahlflag, stornoflag, document_id
          ) VALUES (
            $1, 1, 'RE', 'ZA', 130, $2, $3, $4, $5,
            $6, $7, 0, $7, $8, $9, $10, $11, $12, 0, 0, $13
          )
        `, [
          reId, rnr, inv.supplier_number || null, inv.supplier || "", inv.subject || "",
          inv.paid_date || today, paidAmount, bankKonto, kontoB,
          inv.project_number || null, inv.cost_center || null, periode, invoiceId,
        ]);
      }

      await client.query(`
        UPDATE incoming_invoices
        SET booking_date = COALESCE(booking_date, $1),
            status = CASE WHEN $2::numeric <= 0.005 THEN 'bezahlt' WHEN $3::numeric > 0 THEN 'teilbezahlt' ELSE status END
        WHERE id = $4
      `, [today, openAmount, paidAmount, invoiceId]);

      await client.query(`
        UPDATE document_attachments
        SET fibu_re_id = $1,
            fibu_idx = COALESCE(fibu_idx, 0)
        WHERE incoming_invoice_id = $2
          AND status = 'active'
          AND fibu_re_id IS NULL
      `, [reId, invoiceId]);

      await client.query("COMMIT");
      res.status(201).json({ success: true, reId, existing: false });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  });

  app.get("/api/incoming-invoices-fibu", requireAuth, async (req, res, next) => {
    try {
      const projectNumber = req.query.projectNumber as string | undefined;
      const search = req.query.search as string | undefined;
      const status = req.query.status as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = parseInt(req.query.offset as string) || 0;

      const baseSelect = `
        f.id, f.re_id as "reId", f.rnr as "invoiceNumber", f.adr_such as supplier, f.betreff as subject,
        f.belegdat as date, f.faelligdat as "dueDate", f.zahldat as "paymentDate",
        f.netto::float as "netTotal", f.betrag::float as "grossTotal",
        f.zahlung::float as "paidAmount",
        ${FIBU_OPEN_AMOUNT_SQL}::float as "openAmount",
        f.ktr as "projectNumber", f.kst as "kostenstelle",
        f.typ,
        CASE WHEN f.bezahlflag = 2 THEN 'bezahlt'
             WHEN (f.zahlung::numeric > 0 OR f.sk_betrag::numeric > 0 OR f.minderung::numeric > 0 OR f.gutschrift::numeric > 0 OR f.kuerzung::numeric > 0)
               AND ${FIBU_OPEN_AMOUNT_SQL} > 0.01
               THEN 'teilbezahlt'
             ELSE 'offen' END as status,
        f.mahnflag as "dunningLevel", f.stornoflag as "stornoFlag"
      `;
      let where = `f.art = 'RE' AND f.idx = 0 AND f.stornoflag != 2`;
      const params: any[] = [];

      if (projectNumber) {
        params.push(projectNumber);
        where += ` AND f.ktr = $${params.length}`;
      }
      if (search) {
        params.push(`%${search.toLowerCase()}%`);
        where += ` AND (LOWER(f.adr_such) LIKE $${params.length} OR LOWER(f.rnr) LIKE $${params.length} OR LOWER(f.betreff) LIKE $${params.length} OR LOWER(f.ktr) LIKE $${params.length})`;
      }
      if (dateFrom) { params.push(dateFrom); where += ` AND f.belegdat >= $${params.length}`; }
      if (dateTo) { params.push(dateTo); where += ` AND f.belegdat <= $${params.length}`; }
      if (status && status !== "alle") {
        if (status === "bezahlt") {
          where += ` AND f.bezahlflag = 2`;
        } else if (status === "teilbezahlt") {
          where += ` AND f.bezahlflag != 2 AND (f.zahlung::numeric > 0 OR f.sk_betrag::numeric > 0 OR f.minderung::numeric > 0 OR f.gutschrift::numeric > 0 OR f.kuerzung::numeric > 0) AND ${FIBU_OPEN_AMOUNT_SQL} > 0.01`;
        } else if (status === "offen") {
          where += ` AND f.bezahlflag != 2 AND COALESCE(f.zahlung::numeric,0) <= 0 AND COALESCE(f.sk_betrag::numeric,0) <= 0 AND COALESCE(f.minderung::numeric,0) <= 0 AND COALESCE(f.gutschrift::numeric,0) <= 0 AND COALESCE(f.kuerzung::numeric,0) <= 0`;
        }
      }

      const countResult = await pool.query(`
        SELECT COUNT(*) as total,
          COALESCE(SUM(f.netto::numeric), 0) as "totalNetto",
          COALESCE(SUM(f.betrag::numeric), 0) as "totalBrutto",
          COALESCE(SUM(f.zahlung::numeric), 0) as "totalBezahlt",
          COALESCE(SUM(${FIBU_OPEN_AMOUNT_SQL}), 0) as "totalOffen"
        FROM fibu_buchungen f WHERE ${where}
      `, params);
      const { total, totalNetto, totalBrutto, totalBezahlt, totalOffen } = countResult.rows[0];

      params.push(limit, offset);
      const dataResult = await pool.query(`SELECT ${baseSelect} FROM fibu_buchungen f WHERE ${where} ORDER BY f.belegdat DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);

      res.json({
        data: dataResult.rows,
        total: parseInt(total),
        totalNetto: parseFloat(totalNetto || "0"),
        totalBrutto: parseFloat(totalBrutto || "0"),
        totalBezahlt: parseFloat(totalBezahlt || "0"),
        totalOffen: parseFloat(totalOffen || "0"),
        limit,
        offset,
      });
    } catch (err) { next(err); }
  });

  app.get("/api/fibu/summary", requireAuth, async (req, res, next) => {
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const result = await pool.query(`
        SELECT
          art,
          COUNT(*) FILTER (WHERE idx = 0 AND stornoflag != 2) as count,
          COALESCE(SUM(netto::numeric) FILTER (WHERE idx = 0 AND stornoflag != 2), 0)::float as netto_total,
          COALESCE(SUM(betrag::numeric) FILTER (WHERE idx = 0 AND stornoflag != 2), 0)::float as brutto_total,
          COALESCE(SUM(zahlung::numeric) FILTER (WHERE idx = 0 AND stornoflag != 2), 0)::float as bezahlt_total,
          COALESCE(SUM(
            GREATEST(COALESCE(offen::numeric,0), 0)
          ) FILTER (WHERE idx = 0 AND stornoflag != 2 AND bezahlflag != 2), 0)::float as offen_total,
          COUNT(*) FILTER (WHERE idx = 0 AND stornoflag = 2) as storniert_count
        FROM fibu_buchungen
        WHERE EXTRACT(YEAR FROM belegdat::date) = $1
        GROUP BY art
      `, [year]);

      const monthlyResult = await pool.query(`
        SELECT
          art,
          to_char(belegdat::date, 'YYYY-MM') as month,
          COALESCE(SUM(netto::numeric), 0)::float as netto,
          COUNT(*)::int as count
        FROM fibu_buchungen
        WHERE idx = 0 AND stornoflag != 2
          AND EXTRACT(YEAR FROM belegdat::date) = $1
        GROUP BY art, to_char(belegdat::date, 'YYYY-MM')
        ORDER BY month
      `, [year]);

      const summary: any = {};
      for (const row of result.rows) {
        summary[row.art] = {
          count: parseInt(row.count),
          nettoTotal: row.netto_total,
          bruttoTotal: row.brutto_total,
          bezahltTotal: row.bezahlt_total,
          offenTotal: row.offen_total,
          storniertCount: parseInt(row.storniert_count),
        };
      }

      const monthly: any = {};
      for (const row of monthlyResult.rows) {
        if (!monthly[row.art]) monthly[row.art] = [];
        monthly[row.art].push({ month: row.month, netto: row.netto, count: row.count });
      }

      res.json({ year, summary, monthly });
    } catch (err) { next(err); }
  });

  app.get("/api/fibu/primanota", requireAuth, async (req, res, next) => {
    try {
      const art = req.query.art as string | undefined;
      const typ = req.query.typ as string | undefined;
      const search = req.query.search as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const bezahlflag = req.query.bezahlflag as string | undefined;
      const konto = req.query.konto as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = parseInt(req.query.offset as string) || 0;

      const baseSelect = `
        f.id, f.re_id as "reId", f.idx, f.art, f.typ, f.kennung,
        f.rnr, f.adr_nr as "adrNr", f.adr_such as "adrSuch", f.betreff,
        f.belegdat, f.rechdat, f.erfasstdat, f.faelligdat, f.zahldat, f.skontodat, f.stornodat,
        f.betrag::float, f.zahlung::float, f.netto::float, f.brutto::float,
        f.einbehalt::float, f.minderung::float, f.offen::float, f.gutschrift::float, f.kuerzung::float,
        f.sk_prozent::float as "skProzent", f.sk_betrag::float as "skBetrag", f.sk_basis::float as "skBasis",
        f.konto_b as "kontoB", f.konto_g as "kontoG", f.konto_s as "kontoS", f.konto_m as "kontoM",
        f.kst, f.ktr, f.lfd_nr as "lfdNr", f.periode,
        f.bezahlflag, f.stornoflag, f.mahnflag, f.mahnen, f.auszug,
        f.document_id as "documentId",
        CASE WHEN f.stornoflag = 2 THEN 'storniert'
             WHEN f.bezahlflag = 2 THEN 'bezahlt'
             WHEN f.bezahlflag = 1 THEN 'teilbezahlt'
             WHEN f.bezahlflag = 3 THEN 'ueberzahlt'
             ELSE 'offen' END as status
      `;
      let where = `1=1`;
      const params: any[] = [];

      if (art && art !== "alle") {
        params.push(art);
        where += ` AND f.art = $${params.length}`;
      }
      if (typ && typ !== "alle") {
        params.push(typ);
        where += ` AND f.typ = $${params.length}`;
      }
      if (search) {
        params.push(`%${search.toLowerCase()}%`);
        where += ` AND (LOWER(f.adr_such) LIKE $${params.length} OR LOWER(f.rnr) LIKE $${params.length} OR LOWER(f.betreff) LIKE $${params.length} OR LOWER(f.ktr) LIKE $${params.length})`;
      }
      if (dateFrom) { params.push(dateFrom); where += ` AND f.belegdat >= $${params.length}`; }
      if (dateTo) { params.push(dateTo); where += ` AND f.belegdat <= $${params.length}`; }
      if (bezahlflag && bezahlflag !== "alle") {
        if (bezahlflag === "offen") {
          where += ` AND f.idx = 0 AND f.bezahlflag = 0 AND f.stornoflag != 2`;
        } else if (bezahlflag === "teilbezahlt") {
          where += ` AND f.idx = 0 AND f.bezahlflag = 1`;
        } else if (bezahlflag === "bezahlt") {
          where += ` AND f.idx = 0 AND f.bezahlflag = 2`;
        }
      }
      if (konto) {
        params.push(konto);
        where += ` AND (f.konto_b = $${params.length} OR f.konto_g = $${params.length} OR f.konto_s = $${params.length})`;
      }

      const countResult = await pool.query(`
        SELECT COUNT(*) as total,
          COALESCE(SUM(CASE WHEN f.art='RA' AND f.idx=0 THEN f.netto::numeric ELSE 0 END), 0)::float as "summeRA",
          COALESCE(SUM(CASE WHEN f.art='RE' AND f.idx=0 THEN f.netto::numeric ELSE 0 END), 0)::float as "summeRE",
          COALESCE(SUM(CASE WHEN f.idx=0 AND f.bezahlflag != 2 AND f.stornoflag != 2 THEN
            ${FIBU_OPEN_AMOUNT_SQL} ELSE 0 END), 0)::float as "summeOffen"
        FROM fibu_buchungen f WHERE ${where}
      `, params);
      const { total, summeRA, summeRE, summeOffen } = countResult.rows[0];

      params.push(limit, offset);
      const dataResult = await pool.query(`
        SELECT ${baseSelect}
        FROM fibu_buchungen f WHERE ${where}
        ORDER BY f.belegdat DESC, f.re_id DESC, f.idx ASC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `, params);

      res.json({
        data: dataResult.rows,
        total: parseInt(total),
        summeRA, summeRE, summeOffen,
        limit, offset,
      });
    } catch (err) { next(err); }
  });

  app.get("/api/fibu/:reId/details", requireAuth, async (req, res, next) => {
    try {
      const reId = parseInt(req.params.reId);
      if (isNaN(reId)) return res.status(400).json({ message: "Ungültige reId" });

      const result = await pool.query(`
        SELECT id, re_id as "reId", idx, art, typ, kennung,
          rnr, adr_nr as "adrNr", adr_such as "adrSuch", betreff,
          belegdat as "belegdat", rechdat, erfasstdat, faelligdat, zahldat, skontodat, stornodat,
          betrag::float, zahlung::float, netto::float, brutto::float,
          einbehalt::float, minderung::float, offen::float, gutschrift::float, kuerzung::float,
          sk_prozent::float as "skProzent", sk_betrag::float as "skBetrag",
          bezahlflag as "bezahlflag", stornoflag as "stornoflag", mahnflag as "mahnflag",
          konto_b as "kontoB", konto_g as "kontoG", konto_s as "kontoS", konto_m as "kontoM",
          ktr, kst, lfd_nr as "lfdNr", periode,
          document_id as "documentId"
        FROM fibu_buchungen
        WHERE re_id = $1
        ORDER BY idx ASC
      `, [reId]);

      if (result.rows.length === 0) return res.status(404).json({ message: "Buchung nicht gefunden" });

      const hauptsatz = result.rows[0];
      const nebensaetze = result.rows.filter(r => r.idx > 0);

      res.json({
        hauptsatz,
        nebensaetze,
        zahlungen: nebensaetze.filter(n => n.typ === "ZA"),
        verrechnungen: nebensaetze.filter(n => n.typ === "VR"),
        splits: nebensaetze.filter(n => n.typ === "SB"),
        kasse: nebensaetze.filter(n => n.typ === "KE" || n.typ === "KA"),
      });
    } catch (err) { next(err); }
  });

  app.patch("/api/fibu/:reId", requireAuth, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const reId = parseInt(req.params.reId);
      if (isNaN(reId)) return res.status(400).json({ message: "Ungültige reId" });

      await client.query("BEGIN");

      const check = await client.query(`
        SELECT id, art, stornoflag
        FROM fibu_buchungen
        WHERE re_id = $1 AND idx = 0
        FOR UPDATE
      `, [reId]);
      if (check.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Buchung nicht gefunden" });
      }
      if (check.rows[0].stornoflag === 2) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Stornierte Buchungen koennen nicht bearbeitet werden" });
      }

      const allowedFields: Record<string, string> = {
        betreff: "betreff",
        belegdat: "belegdat", faelligdat: "faelligdat", skontodat: "skontodat",
        skProzent: "sk_prozent",
        kontoB: "konto_b", kontoG: "konto_g", kontoS: "konto_s",
        adrNr: "adr_nr", adrSuch: "adr_such", ktr: "ktr", kst: "kst",
      };

      const updates: string[] = [];
      const params: any[] = [];
      let pi = 1;
      for (const [key, col] of Object.entries(allowedFields)) {
        if (key in req.body) {
          const val = req.body[key];
          updates.push(`${col} = $${pi}`);
          params.push(val === "" ? null : val);
          pi++;
        }
      }
      if (updates.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Keine erlaubten Aenderungen" });
      }

      params.push(reId);
      await client.query(`UPDATE fibu_buchungen SET ${updates.join(", ")} WHERE re_id = $${pi} AND idx = 0`, params);
      if (check.rows[0].art === "RA") await syncDocumentFinanceFromFibu(reId, client);

      await client.query("COMMIT");
      res.json({ message: "Buchung aktualisiert" });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  });

  app.delete("/api/fibu/:reId", requireAuth, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const reId = parseInt(req.params.reId);
      if (isNaN(reId)) return res.status(400).json({ message: "Ungueltige reId" });

      await client.query("BEGIN");

      const check = await client.query(`
        SELECT id, art, document_id as "documentId", bezahlflag, stornoflag
        FROM fibu_buchungen
        WHERE re_id = $1 AND idx = 0
        FOR UPDATE
      `, [reId]);
      if (check.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Buchung nicht gefunden" });
      }

      const hauptsatz = check.rows[0];
      if (hauptsatz.stornoflag === 2) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Buchung ist bereits storniert" });
      }
      if (hauptsatz.bezahlflag === 2 || hauptsatz.bezahlflag === 3) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Bezahlte Rechnungen koennen nicht storniert werden" });
      }

      await client.query(`
        UPDATE fibu_buchungen
        SET stornoflag = 2,
          stornodat = CURRENT_DATE,
          offen = CASE WHEN idx = 0 THEN 0 ELSE offen END
        WHERE re_id = $1
      `, [reId]);

      if (hauptsatz.documentId) {
        if (hauptsatz.art === "RA") {
          await client.query(`
            UPDATE documents
            SET status = 'storniert',
              fibu_offen = '0.00'
            WHERE id = $1
          `, [hauptsatz.documentId]);
        } else if (hauptsatz.art === "RE") {
          await client.query(`
            UPDATE incoming_invoices
            SET status = 'storniert'
            WHERE id = $1
          `, [hauptsatz.documentId]);
        }
      }

      await client.query("COMMIT");
      return res.json({ message: "Buchung storniert" });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  });

  app.post("/api/fibu/:reId/payment", requireAuth, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const reId = parseInt(req.params.reId);
      if (isNaN(reId)) return res.status(400).json({ message: "Ungültige reId" });

      const { betrag, skontoBetrag = 0, bankkonto, zahldat } = req.body;
      const zahlBetrag = parseFloat(betrag);
      const skontoVal = parseFloat(skontoBetrag) || 0;
      const bankKonto = String(bankkonto || "1800");

      if (isNaN(zahlBetrag) || zahlBetrag <= 0) return res.status(400).json({ message: "Betrag muss > 0 sein" });
      if (skontoVal < 0) return res.status(400).json({ message: "Skonto-Betrag darf nicht negativ sein" });
      if (!zahldat) return res.status(400).json({ message: "Zahldatum ist erforderlich" });

      const bankKontoNr = parseInt(bankKonto);
      if (isNaN(bankKontoNr) || bankKontoNr < 1800 || bankKontoNr > 1807) return res.status(400).json({ message: "Ungültiges Bankkonto (erlaubt: 1800-1807)" });

      const bankCheck = await pool.query(`SELECT id FROM fibu_bankkonten WHERE konto_nr = $1`, [bankKontoNr]);
      if (bankCheck.rows.length === 0) return res.status(400).json({ message: "Ungültiges Bankkonto" });

      await client.query("BEGIN");

      const hauptRes = await client.query(`
        SELECT id, re_id as "reId", art, typ, kennung, rnr, adr_nr as "adrNr", adr_such as "adrSuch", betreff,
          brutto::float, zahlung::float, offen::float, sk_betrag::float as "skBetrag",
          minderung::float, gutschrift::float, kuerzung::float,
          konto_b as "kontoB", konto_g as "kontoG", ktr, kst, periode,
          bezahlflag, stornoflag
        FROM fibu_buchungen WHERE re_id = $1 AND idx = 0
        FOR UPDATE
      `, [reId]);

      if (hauptRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Buchung nicht gefunden" });
      }

      const h = hauptRes.rows[0];
      if (h.stornoflag === 2) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Stornierte Rechnung kann nicht bezahlt werden" });
      }
      if (h.bezahlflag === 2 || h.bezahlflag === 3) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Rechnung ist bereits vollständig bezahlt" });
      }

      const offenBetrag = h.offen || 0;
      if (zahlBetrag + skontoVal > offenBetrag + 0.01) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: `Zahlung + Skonto (${(zahlBetrag + skontoVal).toFixed(2)}) übersteigt offenen Betrag (${offenBetrag.toFixed(2)})` });
      }

      const maxIdxRes = await client.query(`SELECT COALESCE(MAX(idx), 0) as max_idx FROM fibu_buchungen WHERE re_id = $1`, [reId]);
      const newIdx = maxIdxRes.rows[0].max_idx + 1;

      const isRA = h.art === "RA";
      const zaKennung = isRA ? 330 : 130;
      const zaKontoB = isRA ? h.kontoG : bankKonto;
      const zaKontoG = isRA ? bankKonto : h.kontoB;

      await client.query(`
        INSERT INTO fibu_buchungen (re_id, idx, art, typ, kennung, rnr, adr_nr, adr_such, betreff,
          zahldat, zahlung, sk_betrag, brutto, konto_b, konto_g, ktr, kst, periode, bezahlflag, stornoflag)
        VALUES ($1, $2, $3, 'ZA', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 0, 0)
      `, [
        reId, newIdx, h.art, zaKennung, h.rnr, h.adrNr, h.adrSuch, h.betreff,
        zahldat, zahlBetrag, skontoVal, zahlBetrag,
        zaKontoB, zaKontoG, h.ktr, h.kst, h.periode
      ]);

      if (skontoVal > 0) {
        const skIdx = newIdx + 1;
        const skKennung = isRA ? 331 : 131;
        await client.query(`
          INSERT INTO fibu_buchungen (re_id, idx, art, typ, kennung, rnr, adr_nr, adr_such, betreff,
            zahldat, zahlung, sk_betrag, brutto, konto_b, konto_g, ktr, kst, periode, bezahlflag, stornoflag)
          VALUES ($1, $2, $3, 'SK', $4, $5, $6, $7, $8, $9, 0, $10, $10, $11, $12, $13, $14, $15, 0, 0)
        `, [
          reId, skIdx, h.art, skKennung, h.rnr, h.adrNr, h.adrSuch, h.betreff,
          zahldat, skontoVal,
          isRA ? "3736" : h.kontoB, isRA ? h.kontoG : "3736", h.ktr, h.kst, h.periode
        ]);
      }

      const neueZahlung = h.zahlung + zahlBetrag;
      const neuerSkBetrag = h.skBetrag + skontoVal;

      let neuesOffen: number;
      if (isRA) {
        neuesOffen = h.brutto - neueZahlung - neuerSkBetrag - h.minderung - h.gutschrift - h.kuerzung;
      } else {
        neuesOffen = h.brutto - neueZahlung - neuerSkBetrag - h.minderung - h.gutschrift;
      }
      neuesOffen = Math.round(neuesOffen * 100) / 100;

      let neuerBezahlflag: number;
      if (neuesOffen <= 0.005 && neuesOffen >= -0.005) {
        neuerBezahlflag = 2;
      } else if (neuesOffen < -0.005) {
        neuerBezahlflag = 3;
      } else if (neueZahlung > 0 || neuerSkBetrag > 0) {
        neuerBezahlflag = 1;
      } else {
        neuerBezahlflag = 0;
      }

      await client.query(`
        UPDATE fibu_buchungen
        SET zahlung = $1, sk_betrag = $2, offen = $3, bezahlflag = $4, zahldat = $5
        WHERE re_id = $6 AND idx = 0
      `, [neueZahlung, neuerSkBetrag, neuesOffen, neuerBezahlflag, zahldat, reId]);

      await syncDocumentFinanceFromFibu(reId, client);
      await client.query("COMMIT");

      res.json({
        message: "Zahlung erfolgreich gebucht",
        zahlung: neueZahlung,
        offen: neuesOffen,
        bezahlflag: neuerBezahlflag,
      });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  });

  app.delete("/api/fibu/:reId/payment/:paymentId", requireAuth, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const reId = parseInt(req.params.reId);
      const paymentId = parseInt(req.params.paymentId);
      if (isNaN(reId) || isNaN(paymentId)) return res.status(400).json({ message: "Ungültige Parameter" });

      await client.query("BEGIN");

      const hauptRes = await client.query(`
        SELECT id, re_id as "reId", art, brutto::float,
          minderung::float, gutschrift::float, kuerzung::float,
          konto_b as "kontoB", konto_g as "kontoG", stornoflag
        FROM fibu_buchungen WHERE re_id = $1 AND idx = 0
        FOR UPDATE
      `, [reId]);

      if (hauptRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Buchung nicht gefunden" });
      }

      const h = hauptRes.rows[0];
      if (h.stornoflag === 2) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Zahlungen stornierter Rechnungen koennen nicht geloescht werden" });
      }

      const paymentRes = await client.query(`
        SELECT id, idx, typ, zahlung::float as "zahlBetrag", sk_betrag::float as "skBetrag"
        FROM fibu_buchungen WHERE id = $1 AND re_id = $2 AND idx > 0
      `, [paymentId, reId]);

      if (paymentRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Zahlung nicht gefunden" });
      }

      const payment = paymentRes.rows[0];
      if (!["ZA", "SK", "VR"].includes(payment.typ)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Nur Zahlungen/Skonto/Verrechnungen können gelöscht werden" });
      }

      const payIdx = payment.idx;
      let skIdx: number | null = null;
      if (payment.typ === "ZA") {
        const skRes = await client.query(`SELECT id, idx FROM fibu_buchungen WHERE re_id = $1 AND idx = $2 AND typ = 'SK'`, [reId, payIdx + 1]);
        if (skRes.rows.length > 0) skIdx = skRes.rows[0].idx;
      }

      await client.query(`DELETE FROM fibu_buchungen WHERE id = $1`, [paymentId]);
      if (skIdx !== null) {
        await client.query(`DELETE FROM fibu_buchungen WHERE re_id = $1 AND idx = $2 AND typ = 'SK'`, [reId, skIdx]);
      }

      const isRA = h.art === "RA";
      const totals = await client.query(`
        SELECT COALESCE(SUM(CASE WHEN typ='ZA' THEN zahlung::numeric ELSE 0 END), 0) as total_zahlung,
               COALESCE(SUM(CASE WHEN typ='SK' THEN sk_betrag::numeric ELSE 0 END), 0) as total_sk
        FROM fibu_buchungen WHERE re_id = $1 AND idx > 0
      `, [reId]);

      const neueZahlung = parseFloat(totals.rows[0].total_zahlung);
      const neuerSk = parseFloat(totals.rows[0].total_sk);
      let neuesOffen: number;
      if (isRA) {
        neuesOffen = h.brutto - neueZahlung - neuerSk - h.minderung - h.gutschrift - h.kuerzung;
      } else {
        neuesOffen = h.brutto - neueZahlung - neuerSk - h.minderung - h.gutschrift;
      }
      neuesOffen = Math.round(neuesOffen * 100) / 100;

      let neuerBezahlflag: number;
      if (neuesOffen <= 0.005 && neuesOffen >= -0.005) neuerBezahlflag = 2;
      else if (neuesOffen < -0.005) neuerBezahlflag = 3;
      else if (neueZahlung > 0 || neuerSk > 0) neuerBezahlflag = 1;
      else neuerBezahlflag = 0;

      const lastZahldat = await client.query(`SELECT zahldat FROM fibu_buchungen WHERE re_id = $1 AND idx > 0 AND typ = 'ZA' ORDER BY zahldat DESC LIMIT 1`, [reId]);
      const zahldat = lastZahldat.rows.length > 0 ? lastZahldat.rows[0].zahldat : null;

      await client.query(`
        UPDATE fibu_buchungen
        SET zahlung = $1, sk_betrag = $2, offen = $3, bezahlflag = $4, zahldat = $5
        WHERE re_id = $6 AND idx = 0
      `, [neueZahlung, neuerSk, neuesOffen, neuerBezahlflag, zahldat, reId]);

      await syncDocumentFinanceFromFibu(reId, client);
      await client.query("COMMIT");

      res.json({
        message: "Zahlung gelöscht",
        zahlung: neueZahlung,
        offen: neuesOffen,
        bezahlflag: neuerBezahlflag,
      });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  });

  app.patch("/api/fibu/:reId/payment/:paymentId", requireAuth, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const reId = parseInt(req.params.reId);
      const paymentId = parseInt(req.params.paymentId);
      if (isNaN(reId) || isNaN(paymentId)) return res.status(400).json({ message: "Ungültige Parameter" });

      const { betrag, zahldat, bankkonto } = req.body;

      await client.query("BEGIN");

      const hauptRes = await client.query(`
        SELECT brutto::float, minderung::float, gutschrift::float, kuerzung::float, art, stornoflag
        FROM fibu_buchungen WHERE re_id = $1 AND idx = 0
        FOR UPDATE
      `, [reId]);

      if (hauptRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Buchung nicht gefunden" });
      }

      const h = hauptRes.rows[0];
      if (h.stornoflag === 2) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Zahlungen stornierter Rechnungen koennen nicht bearbeitet werden" });
      }

      const paymentRes = await client.query(`
        SELECT id, idx, typ, zahlung::float as "zahlBetrag", art
        FROM fibu_buchungen WHERE id = $1 AND re_id = $2 AND idx > 0
      `, [paymentId, reId]);

      if (paymentRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Zahlung nicht gefunden" });
      }

      const payment = paymentRes.rows[0];
      if (payment.typ !== "ZA") {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Nur Zahlungen können bearbeitet werden" });
      }

      const updates: string[] = [];
      const params: any[] = [];
      let pi = 1;

      if (betrag !== undefined) {
        const b = parseFloat(betrag);
        if (isNaN(b) || b <= 0) { await client.query("ROLLBACK"); return res.status(400).json({ message: "Betrag muss > 0 sein" }); }
        updates.push(`zahlung = $${pi}`, `brutto = $${pi}`);
        params.push(b);
        pi++;
      }
      if (zahldat !== undefined) {
        updates.push(`zahldat = $${pi}`);
        params.push(zahldat);
        pi++;
      }
      if (bankkonto !== undefined) {
        const isRA = payment.art === "RA";
        if (isRA) {
          updates.push(`konto_g = $${pi}`);
        } else {
          updates.push(`konto_b = $${pi}`);
        }
        params.push(String(bankkonto));
        pi++;
      }

      if (updates.length > 0) {
        params.push(paymentId);
        await client.query(`UPDATE fibu_buchungen SET ${updates.join(", ")} WHERE id = $${pi}`, params);
      }

      const isRA = h.art === "RA";

      const totals = await client.query(`
        SELECT COALESCE(SUM(CASE WHEN typ='ZA' THEN zahlung::numeric ELSE 0 END), 0) as total_zahlung,
               COALESCE(SUM(CASE WHEN typ='SK' THEN sk_betrag::numeric ELSE 0 END), 0) as total_sk
        FROM fibu_buchungen WHERE re_id = $1 AND idx > 0
      `, [reId]);

      const neueZahlung = parseFloat(totals.rows[0].total_zahlung);
      const neuerSk = parseFloat(totals.rows[0].total_sk);
      let neuesOffen = isRA
        ? h.brutto - neueZahlung - neuerSk - h.minderung - h.gutschrift - h.kuerzung
        : h.brutto - neueZahlung - neuerSk - h.minderung - h.gutschrift;
      neuesOffen = Math.round(neuesOffen * 100) / 100;

      let neuerBezahlflag: number;
      if (neuesOffen <= 0.005 && neuesOffen >= -0.005) neuerBezahlflag = 2;
      else if (neuesOffen < -0.005) neuerBezahlflag = 3;
      else if (neueZahlung > 0 || neuerSk > 0) neuerBezahlflag = 1;
      else neuerBezahlflag = 0;

      const lastZahldat = await client.query(`SELECT zahldat FROM fibu_buchungen WHERE re_id = $1 AND idx > 0 AND typ = 'ZA' ORDER BY zahldat DESC LIMIT 1`, [reId]);
      const zd = lastZahldat.rows.length > 0 ? lastZahldat.rows[0].zahldat : null;

      await client.query(`
        UPDATE fibu_buchungen
        SET zahlung = $1, sk_betrag = $2, offen = $3, bezahlflag = $4, zahldat = $5
        WHERE re_id = $6 AND idx = 0
      `, [neueZahlung, neuerSk, neuesOffen, neuerBezahlflag, zd, reId]);

      await syncDocumentFinanceFromFibu(reId, client);
      await client.query("COMMIT");

      res.json({
        message: "Zahlung aktualisiert",
        zahlung: neueZahlung,
        offen: neuesOffen,
        bezahlflag: neuerBezahlflag,
      });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  });

  app.get("/api/fibu/:reId/verrechnbare", requireAuth, async (req, res, next) => {
    try {
      const reId = parseInt(req.params.reId);
      if (isNaN(reId)) return res.status(400).json({ message: "Ungültige reId" });

      const hauptRes = await pool.query(`
        SELECT art, typ, adr_nr as "adrNr", brutto::float, offen::float, rnr
        FROM fibu_buchungen WHERE re_id = $1 AND idx = 0 AND stornoflag != 2
      `, [reId]);
      if (hauptRes.rows.length === 0) return res.status(404).json({ message: "Buchung nicht gefunden" });

      const h = hauptRes.rows[0];
      const isGutschrift = h.typ === "HG";

      let candidates;
      if (isGutschrift) {
        candidates = await pool.query(`
          SELECT re_id as "reId", rnr, betreff, brutto::float, offen::float, belegdat as date, art, typ
          FROM fibu_buchungen
          WHERE idx = 0 AND adr_nr = $1 AND art = $2 AND typ = 'HR'
            AND offen::numeric > 0.01 AND bezahlflag != 2 AND stornoflag != 2
            AND re_id != $3
          ORDER BY belegdat DESC
          LIMIT 50
        `, [h.adrNr, h.art, reId]);
      } else {
        candidates = await pool.query(`
          SELECT re_id as "reId", rnr, betreff, brutto::float, offen::float, belegdat as date, art, typ
          FROM fibu_buchungen
          WHERE idx = 0 AND adr_nr = $1 AND art = $2 AND typ = 'HG'
            AND offen::numeric < -0.01 AND bezahlflag != 2 AND stornoflag != 2
            AND re_id != $3
          ORDER BY belegdat DESC
          LIMIT 50
        `, [h.adrNr, h.art, reId]);
      }

      res.json({
        isGutschrift,
        hauptsatz: { reId, rnr: h.rnr, brutto: h.brutto, offen: h.offen, art: h.art, typ: h.typ },
        candidates: candidates.rows,
      });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/fibu/:reId/verrechnung", requireAuth, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const reId = parseInt(req.params.reId);
      if (isNaN(reId)) return res.status(400).json({ message: "Ungültige reId" });

      const { gegenReId, betrag: rawBetrag, verrechnungskonto } = req.body;
      if (!gegenReId) return res.status(400).json({ message: "Gegen-Buchung (reId) fehlt" });
      const gegenId = parseInt(gegenReId);
      if (isNaN(gegenId)) return res.status(400).json({ message: "Ungültige gegenReId" });

      await client.query("BEGIN");

      const srcRes = await client.query(`
        SELECT id, re_id as "reId", art, typ, rnr, adr_nr as "adrNr", adr_such as "adrSuch", betreff,
          brutto::float, zahlung::float, offen::float, sk_betrag::float as "skBetrag",
          minderung::float, gutschrift::float, kuerzung::float,
          konto_b as "kontoB", konto_g as "kontoG", ktr, kst, periode, bezahlflag, stornoflag
        FROM fibu_buchungen WHERE re_id = $1 AND idx = 0
        FOR UPDATE
      `, [reId]);

      const dstRes = await client.query(`
        SELECT id, re_id as "reId", art, typ, rnr, adr_nr as "adrNr", adr_such as "adrSuch", betreff,
          brutto::float, zahlung::float, offen::float, sk_betrag::float as "skBetrag",
          minderung::float, gutschrift::float, kuerzung::float,
          konto_b as "kontoB", konto_g as "kontoG", ktr, kst, periode, bezahlflag, stornoflag
        FROM fibu_buchungen WHERE re_id = $1 AND idx = 0
        FOR UPDATE
      `, [gegenId]);

      if (srcRes.rows.length === 0 || dstRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Buchung(en) nicht gefunden" });
      }

      const src = srcRes.rows[0];
      const dst = dstRes.rows[0];
      if (src.stornoflag === 2 || dst.stornoflag === 2) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Stornierte Buchungen koennen nicht verrechnet werden" });
      }

      const srcIsGS = src.typ === "HG";
      const gs = srcIsGS ? src : dst;
      const rng = srcIsGS ? dst : src;

      if (gs.typ !== "HG" || rng.typ !== "HR") {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Verrechnung benötigt eine Gutschrift (HG) und eine Rechnung (HR)" });
      }

      let verrBetrag: number;
      if (rawBetrag !== undefined && rawBetrag !== null && rawBetrag !== "") {
        verrBetrag = parseFloat(rawBetrag);
        if (isNaN(verrBetrag) || verrBetrag <= 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "Betrag muss > 0 sein" });
        }
      } else {
        verrBetrag = Math.min(Math.abs(gs.offen), Math.abs(rng.offen));
      }

      if (verrBetrag > Math.abs(gs.offen) + 0.01) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: `Verrechnungsbetrag (${verrBetrag.toFixed(2)}) übersteigt offenen Gutschriftsbetrag (${Math.abs(gs.offen).toFixed(2)})` });
      }
      if (verrBetrag > Math.abs(rng.offen) + 0.01) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: `Verrechnungsbetrag (${verrBetrag.toFixed(2)}) übersteigt offenen Rechnungsbetrag (${Math.abs(rng.offen).toFixed(2)})` });
      }

      const heute = new Date().toISOString().split("T")[0];
      const vrKonto = verrechnungskonto || rng.kontoB || "1590";

      const maxIdxGS = await client.query(`SELECT COALESCE(MAX(idx), 0) as m FROM fibu_buchungen WHERE re_id = $1`, [gs.reId]);
      const gsNewIdx = maxIdxGS.rows[0].m + 1;
      await client.query(`
        INSERT INTO fibu_buchungen (re_id, idx, art, typ, kennung, rnr, adr_nr, adr_such, betreff,
          zahldat, zahlung, betrag, brutto, konto_b, konto_g, ktr, kst, periode, bezahlflag, stornoflag)
        VALUES ($1, $2, $3, 'VR', 0, $4, $5, $6, $7, $8, $9, $9, $9, $10, $11, $12, $13, $14, 0, 0)
      `, [
        gs.reId, gsNewIdx, gs.art, gs.rnr, gs.adrNr, gs.adrSuch,
        `verrechn. mit RNG ${rng.rnr}`,
        heute, -verrBetrag, vrKonto, gs.kontoG || vrKonto,
        gs.ktr, gs.kst, gs.periode
      ]);

      const maxIdxRNG = await client.query(`SELECT COALESCE(MAX(idx), 0) as m FROM fibu_buchungen WHERE re_id = $1`, [rng.reId]);
      const rngNewIdx = maxIdxRNG.rows[0].m + 1;
      await client.query(`
        INSERT INTO fibu_buchungen (re_id, idx, art, typ, kennung, rnr, adr_nr, adr_such, betreff,
          zahldat, zahlung, betrag, brutto, konto_b, konto_g, ktr, kst, periode, bezahlflag, stornoflag)
        VALUES ($1, $2, $3, 'VR', 0, $4, $5, $6, $7, $8, $9, $9, $9, $10, $11, $12, $13, $14, 0, 0)
      `, [
        rng.reId, rngNewIdx, rng.art, rng.rnr, rng.adrNr, rng.adrSuch,
        `verrechn. mit GS ${gs.rnr}`,
        heute, verrBetrag, rng.kontoB || vrKonto, vrKonto,
        rng.ktr, rng.kst, rng.periode
      ]);

      const updateHauptsatz = async (h: any, extraGutschrift: number) => {
        const isRA = h.art === "RA";
        const neueGutschrift = h.gutschrift + extraGutschrift;
        let neuesOffen: number;
        if (isRA) {
          neuesOffen = h.brutto - h.zahlung - h.skBetrag - h.minderung - neueGutschrift - h.kuerzung;
        } else {
          neuesOffen = h.brutto - h.zahlung - h.skBetrag - h.minderung - neueGutschrift;
        }
        neuesOffen = Math.round(neuesOffen * 100) / 100;

        let bezahlflag: number;
        if (Math.abs(neuesOffen) <= 0.005) bezahlflag = 2;
        else if (h.typ === "HG" ? neuesOffen > 0.005 : neuesOffen < -0.005) bezahlflag = 3;
        else if (h.zahlung !== 0 || h.skBetrag !== 0 || neueGutschrift !== 0) bezahlflag = 1;
        else bezahlflag = 0;

        await client.query(`
          UPDATE fibu_buchungen SET gutschrift = $1, offen = $2, bezahlflag = $3
          WHERE re_id = $4 AND idx = 0
        `, [neueGutschrift, neuesOffen, bezahlflag, h.reId]);
      };

      await updateHauptsatz(gs, -verrBetrag);
      await updateHauptsatz(rng, verrBetrag);
      await syncDocumentFinanceFromFibu(gs.reId, client);
      await syncDocumentFinanceFromFibu(rng.reId, client);

      await client.query("COMMIT");

      res.json({
        message: `Verrechnung über ${verrBetrag.toFixed(2)} € erfolgreich`,
        betrag: verrBetrag,
      });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  });

  app.get("/api/fibu/konten", requireAuth, async (req, res, next) => {
    try {
      const search = (req.query.search as string || "").trim();
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;

      let whereClause = "";
      const params: any[] = [];

      if (search) {
        params.push(`%${search}%`);
        const searchNum = parseInt(search);
        if (!isNaN(searchNum)) {
          whereClause = `WHERE (bezeichnung ILIKE $1 OR konto_nr::text LIKE $1 OR konto_nr = ${searchNum})`;
        } else {
          whereClause = `WHERE bezeichnung ILIKE $1`;
        }
      }

      params.push(limit, offset);
      const result = await pool.query(`
        SELECT id, konto_nr as "kontoNr", kategorie, klasse, bezeichnung,
          str_id as "strId", ustvakz, bp_nr as "bpNr", guv,
          skonto_kto as "skontoKto", minder_kto as "minderKto"
        FROM fibu_konten
        ${whereClause}
        ORDER BY konto_nr ASC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `, params);

      const countResult = await pool.query(`SELECT COUNT(*)::int as total FROM fibu_konten ${whereClause}`, search ? [`%${search}%`] : []);

      res.json({ data: result.rows, total: countResult.rows[0].total });
    } catch (err) { next(err); }
  });

  app.get("/api/fibu/erloeskonten", requireAuth, async (_req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT k.konto_nr as "kontoNr", k.bezeichnung, k.str_id as "strId",
               s.prozent, s.match as "steuerMatch"
        FROM fibu_konten k
        LEFT JOIN fibu_steuersaetze s ON k.str_id::int = s.str_id
        WHERE k.konto_nr BETWEEN 4000 AND 4999
          AND k.bezeichnung ILIKE '%erl%'
        ORDER BY k.konto_nr ASC
      `);
      res.json(result.rows);
    } catch (err) { next(err); }
  });

  app.get("/api/fibu/bankkonten", requireAuth, async (req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT id, konto_nr as "kontoNr", bezeichnung, konto_nr2 as "kontoNr2",
          blz, inhaber, iban, bic, stand::float
        FROM fibu_bankkonten
        ORDER BY konto_nr ASC
      `);
      res.json(result.rows);
    } catch (err) { next(err); }
  });

  app.get("/api/fibu/steuersaetze", requireAuth, async (req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT id, str_id as "strId", match, bezeichnung,
          prozent::float, knt_nr as "kntNr", konto_datev as "kontoDatev",
          vst_kto as "vstKto", ust_kto as "ustKto",
          vst_prz::float as "vstPrz", ust_prz::float as "ustPrz", flags
        FROM fibu_steuersaetze
        ORDER BY str_id ASC
      `);
      res.json(result.rows);
    } catch (err) { next(err); }
  });

  app.get("/api/fibu/textvorgaben", requireAuth, async (req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT id, text, konto, konto2, adr_nr as "adrNr",
          betrag::float, beleg_nr as "belegNr", kst
        FROM fibu_textvorgaben
        ORDER BY id ASC
      `);
      res.json(result.rows);
    } catch (err) { next(err); }
  });

  app.get("/api/fibu/statistics", requireAuth, async (req, res, next) => {
    try {
      const art = (req.query.art as string) || "RA";
      const yearParam = req.query.year as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;

      let dateWhere = "";
      const params: any[] = [art];
      if (dateFrom && dateTo) {
        params.push(dateFrom, dateTo);
        dateWhere = ` AND f.belegdat >= $${params.length - 1} AND f.belegdat <= $${params.length}`;
      } else if (yearParam === "alle") {
        dateWhere = "";
      } else {
        const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();
        params.push(year);
        dateWhere = ` AND EXTRACT(YEAR FROM f.belegdat::date) = $${params.length}`;
      }

      const byStatus = await pool.query(`
        SELECT
          CASE WHEN f.stornoflag = 2 THEN 'storniert'
               WHEN f.bezahlflag = 2 THEN 'bezahlt'
               WHEN f.bezahlflag = 1 THEN 'teilbezahlt'
               WHEN f.mahnflag > 0 THEN 'gemahnt'
               ELSE 'offen' END as status,
          COUNT(*)::int as count,
          COALESCE(SUM(f.netto::numeric), 0)::float as netto,
          COALESCE(SUM(f.betrag::numeric), 0)::float as brutto,
          COALESCE(SUM(f.zahlung::numeric), 0)::float as bezahlt,
          COALESCE(SUM(${FIBU_OPEN_AMOUNT_SQL}), 0)::float as offen
        FROM fibu_buchungen f
        WHERE f.art = $1 AND f.idx = 0 AND f.typ = 'HR' ${dateWhere}
        GROUP BY 1
        ORDER BY 1
      `, params);

      const byCustomer = await pool.query(`
        SELECT f.adr_such as name, f.adr_nr as "adrNr",
          COUNT(*)::int as count,
          COALESCE(SUM(f.netto::numeric), 0)::float as netto,
          COALESCE(SUM(f.betrag::numeric), 0)::float as brutto,
          COALESCE(SUM(${FIBU_OPEN_AMOUNT_SQL}), 0)::float as offen
        FROM fibu_buchungen f
        WHERE f.art = $1 AND f.idx = 0 AND f.typ = 'HR' AND f.stornoflag != 2 ${dateWhere}
        GROUP BY f.adr_such, f.adr_nr
        ORDER BY brutto DESC
        LIMIT 30
      `, params);

      const byMonth = await pool.query(`
        SELECT to_char(f.belegdat::date, 'YYYY-MM') as month,
          COUNT(*)::int as count,
          COALESCE(SUM(f.netto::numeric), 0)::float as netto,
          COALESCE(SUM(f.betrag::numeric), 0)::float as brutto
        FROM fibu_buchungen f
        WHERE f.art = $1 AND f.idx = 0 AND f.typ = 'HR' AND f.stornoflag != 2 ${dateWhere}
        GROUP BY 1
        ORDER BY 1
      `, params);

      const byKonto = await pool.query(`
        SELECT f.konto_b as konto,
          COUNT(*)::int as count,
          COALESCE(SUM(f.netto::numeric), 0)::float as netto
        FROM fibu_buchungen f
        WHERE f.art = $1 AND f.idx = 0 AND f.typ = 'HR' AND f.stornoflag != 2 ${dateWhere}
        GROUP BY f.konto_b
        ORDER BY netto DESC
        LIMIT 20
      `, params);

      const gutschriften = await pool.query(`
        SELECT COUNT(*)::int as count,
          COALESCE(SUM(ABS(f.betrag::numeric)), 0)::float as brutto
        FROM fibu_buchungen f
        WHERE f.art = $1 AND f.idx = 0 AND f.typ = 'HG' AND f.stornoflag != 2 ${dateWhere}
      `, params);

      const skontoTotal = await pool.query(`
        SELECT COALESCE(SUM(f.sk_betrag::numeric), 0)::float as total
        FROM fibu_buchungen f
        WHERE f.art = $1 AND f.idx = 0 AND f.stornoflag != 2 ${dateWhere}
      `, params);

      let totals = await pool.query(`
        SELECT
          COUNT(*)::int as count,
          COALESCE(SUM(f.netto::numeric), 0)::float as erloese,
          COALESCE(SUM(f.betrag::numeric), 0)::float as brutto,
          COALESCE(SUM(f.zahlung::numeric), 0)::float as bezahlt,
          COALESCE(SUM(f.sk_betrag::numeric), 0)::float as skonto,
          COALESCE(SUM(
            CASE WHEN f.betrag::numeric > 0 AND f.netto::numeric > 0
              THEN ROUND((f.sk_betrag::numeric * f.netto::numeric / f.betrag::numeric)::numeric, 2)
              ELSE 0
            END
          ), 0)::float as skonto_netto,
          COALESCE(SUM(f.minderung::numeric), 0)::float as minderung,
          COALESCE(SUM(
            CASE WHEN f.betrag::numeric > 0 AND f.netto::numeric > 0
              THEN ROUND((f.minderung::numeric * f.netto::numeric / f.betrag::numeric)::numeric, 2)
              ELSE 0
            END
          ), 0)::float as minderung_netto,
          COALESCE(SUM(f.offen::numeric), 0)::float as offen
        FROM fibu_buchungen f
        WHERE f.art = $1 AND f.idx = 0 AND f.typ = 'HR' AND f.stornoflag != 2 ${dateWhere}
      `, params);

      let guTotals = await pool.query(`
        SELECT
          COUNT(*)::int as count,
          COALESCE(SUM(ABS(f.netto::numeric)), 0)::float as netto,
          COALESCE(SUM(ABS(f.betrag::numeric)), 0)::float as brutto
        FROM fibu_buchungen f
        WHERE f.art = $1 AND f.idx = 0 AND f.typ = 'HG' AND f.stornoflag != 2 ${dateWhere}
      `, params);

      let t = totals.rows[0];
      let gu = guTotals.rows[0];

      const skontoNetto = t.skonto_netto || 0;
      const minderungNetto = t.minderung_netto || 0;
      const nettoNachAbzug = t.erloese - gu.netto - skontoNetto - minderungNetto;
      const rawSteuer = (t.brutto - t.erloese);
      const guSteuer = (gu.brutto - gu.netto);
      const skontoSteuer = (t.skonto || 0) - skontoNetto;
      const minderungSteuer = (t.minderung || 0) - minderungNetto;
      const steuerBetrag = rawSteuer - guSteuer - skontoSteuer - minderungSteuer;
      const bruttoNachAbzug = nettoNachAbzug + steuerBetrag;

      res.json({
        byStatus: byStatus.rows,
        byCustomer: byCustomer.rows,
        byMonth: byMonth.rows,
        byKonto: byKonto.rows,
        gutschriften: gutschriften.rows[0],
        skontoTotal: skontoTotal.rows[0]?.total || 0,
        umsatzUebersicht: {
          rechnungenCount: t.count + gu.count,
          erloese: t.erloese,
          gutschriftenNetto: gu.netto,
          gutschriftenBrutto: gu.brutto,
          gutschriftenCount: gu.count,
          skontoGez: skontoNetto,
          minderung: minderungNetto,
          netto: nettoNachAbzug,
          steuerBetrag: steuerBetrag,
          brutto: bruttoNachAbzug,
          bezahlt: t.bezahlt,
          offen: t.offen,
        },
      });
    } catch (err) { next(err); }
  });

  app.get("/api/outgoing-invoices-fibu", requireAuth, async (req, res, next) => {
    try {
      const search = req.query.search as string | undefined;
      const status = req.query.status as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const projectNumber = req.query.projectNumber as string | undefined;
      const konto = req.query.konto as string | undefined;
      const typ = req.query.typ as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = parseInt(req.query.offset as string) || 0;

      const baseSelect = `
        f.id as "fibuId", f.re_id as "reId", f.rnr as "documentNumber", f.adr_such as "customerName",
        f.adr_nr as "customerNumber",
        f.betreff as subject, f.belegdat as date, f.faelligdat as "dueDate", f.zahldat as "paymentDate",
        f.erfasstdat as "erfasstDat", f.skontodat as "skontoDat",
        f.netto::float as "netTotal", f.betrag::float as "grossTotal", f.brutto::float as brutto,
        f.zahlung::float as "paidAmount",
        ${FIBU_OPEN_AMOUNT_SQL}::float as "openAmount",
        f.sk_prozent::float as "skontoPercent", f.sk_betrag::float as "skontoAmount",
        f.minderung::float as "minderungAmount",
        f.gutschrift::float as "gutschriftAmount", f.kuerzung::float as "kuerzungAmount",
        f.ktr as "projectNumber", f.kst as "kostenstelle",
        f.konto_b as "kontoB", f.konto_g as "kontoG",
        f.typ,
        CASE WHEN f.stornoflag = 2 THEN 'storniert'
             WHEN f.bezahlflag = 2 THEN 'bezahlt'
             WHEN (f.zahlung::numeric > 0 OR f.sk_betrag::numeric > 0 OR f.minderung::numeric > 0 OR f.gutschrift::numeric > 0 OR f.kuerzung::numeric > 0)
               AND ${FIBU_OPEN_AMOUNT_SQL} > 0.01
               THEN 'teilbezahlt'
             WHEN f.mahnflag > 0 THEN 'gemahnt'
             ELSE 'offen' END as "paymentStatus",
        f.mahnflag as "dunningLevel", f.bezahlflag as "bezahlflag", f.stornoflag as "stornoFlag",
        f.document_id as "documentId"
      `;
      let where = `f.art = 'RA' AND f.idx = 0`;
      const params: any[] = [];

      if (search) {
        params.push(`%${search.toLowerCase()}%`);
        where += ` AND (LOWER(f.adr_such) LIKE $${params.length} OR LOWER(f.rnr) LIKE $${params.length} OR LOWER(f.betreff) LIKE $${params.length} OR LOWER(f.ktr) LIKE $${params.length})`;
      }
      if (dateFrom) { params.push(dateFrom); where += ` AND f.belegdat >= $${params.length}`; }
      if (dateTo) { params.push(dateTo); where += ` AND f.belegdat <= $${params.length}`; }
      if (projectNumber) { params.push(projectNumber); where += ` AND f.ktr = $${params.length}`; }
      if (konto) { params.push(konto); where += ` AND f.konto_b = $${params.length}`; }
      if (typ && typ !== "alle") {
        params.push(typ);
        where += ` AND f.typ = $${params.length}`;
      }
      if (status && status !== "alle") {
        if (status === "storniert") where += ` AND f.stornoflag = 2`;
        else if (status === "bezahlt") where += ` AND f.bezahlflag = 2 AND f.stornoflag != 2`;
        else if (status === "teilbezahlt") where += ` AND f.bezahlflag != 2 AND f.stornoflag != 2 AND (f.zahlung::numeric > 0 OR f.sk_betrag::numeric > 0 OR f.minderung::numeric > 0 OR f.gutschrift::numeric > 0 OR f.kuerzung::numeric > 0) AND ${FIBU_OPEN_AMOUNT_SQL} > 0.01`;
        else if (status === "offen") where += ` AND f.bezahlflag != 2 AND f.stornoflag != 2 AND COALESCE(f.zahlung::numeric,0) <= 0 AND COALESCE(f.sk_betrag::numeric,0) <= 0 AND COALESCE(f.minderung::numeric,0) <= 0 AND COALESCE(f.gutschrift::numeric,0) <= 0 AND COALESCE(f.kuerzung::numeric,0) <= 0`;
        else if (status === "gemahnt") where += ` AND f.mahnflag > 0 AND f.bezahlflag != 2 AND f.stornoflag != 2`;
      }

      const countResult = await pool.query(`
        SELECT COUNT(*) as total,
          COALESCE(SUM(f.netto::numeric), 0) as "totalNetto",
          COALESCE(SUM(f.betrag::numeric), 0) as "totalBrutto",
          COALESCE(SUM(f.zahlung::numeric), 0) as "totalBezahlt",
          COALESCE(SUM(${FIBU_OPEN_AMOUNT_SQL}), 0) as "totalOffen"
        FROM fibu_buchungen f WHERE ${where}
      `, params);
      const { total, totalNetto, totalBrutto, totalBezahlt, totalOffen } = countResult.rows[0];

      params.push(limit, offset);
      const dataResult = await pool.query(`SELECT ${baseSelect} FROM fibu_buchungen f WHERE ${where} ORDER BY f.belegdat DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);

      res.json({
        data: dataResult.rows,
        total: parseInt(total),
        totalNetto: parseFloat(totalNetto || "0"),
        totalBrutto: parseFloat(totalBrutto || "0"),
        totalBezahlt: parseFloat(totalBezahlt || "0"),
        totalOffen: parseFloat(totalOffen || "0"),
        limit,
        offset,
      });
    } catch (err) { next(err); }
  });

  app.get("/api/time-entries", requireAuth, async (req, res, next) => {
    try {
      const filters: any = {};
      if (req.query.employeeId) filters.employeeId = parseInt(req.query.employeeId as string);
      if (req.query.projectId) filters.projectId = parseInt(req.query.projectId as string);
      if (req.query.week) filters.week = parseInt(req.query.week as string);
      if (req.query.month) filters.month = parseInt(req.query.month as string);
      if (req.query.year) filters.year = parseInt(req.query.year as string);
      res.json(await storage.getTimeEntries(Object.keys(filters).length > 0 ? filters : undefined));
    } catch (err) { next(err); }
  });

  app.post("/api/time-entries", requireAuth, async (req, res, next) => {
    try { res.status(201).json(await storage.createTimeEntry(insertTimeEntrySchema.parse(req.body))); } catch (err) { next(err); }
  });

  app.patch("/api/time-entries/:id", requireAuth, async (req, res, next) => {
    try { res.json(await storage.updateTimeEntry(parseInt(req.params.id), insertTimeEntrySchema.partial().parse(req.body))); } catch (err) { next(err); }
  });

  app.delete("/api/time-entries/:id", requireAuth, async (req, res, next) => {
    try { await storage.deleteTimeEntry(parseInt(req.params.id)); res.json({ message: "Stundeneintrag gelöscht" }); } catch (err) { next(err); }
  });

  app.get("/api/hourly-rate-calcs", requireAuth, async (_req, res, next) => {
    try { res.json(await storage.getHourlyRateCalcs()); } catch (err) { next(err); }
  });

  app.get("/api/hourly-rate-calcs/:id", requireAuth, async (req, res, next) => {
    try {
      const c = await storage.getHourlyRateCalc(parseInt(req.params.id));
      if (!c) return res.status(404).json({ message: "Stundensatz nicht gefunden" });
      res.json(c);
    } catch (err) { next(err); }
  });

  app.post("/api/hourly-rate-calcs", requireAuth, async (req, res, next) => {
    try { res.status(201).json(await storage.createHourlyRateCalc(insertHourlyRateCalcSchema.parse(req.body))); } catch (err) { next(err); }
  });

  app.patch("/api/hourly-rate-calcs/:id", requireAuth, async (req, res, next) => {
    try { res.json(await storage.updateHourlyRateCalc(parseInt(req.params.id), insertHourlyRateCalcSchema.partial().parse(req.body))); } catch (err) { next(err); }
  });

  app.delete("/api/hourly-rate-calcs/:id", requireAuth, async (req, res, next) => {
    try { await storage.deleteHourlyRateCalc(parseInt(req.params.id)); res.json({ message: "Stundensatz gelöscht" }); } catch (err) { next(err); }
  });

  app.get("/api/resource-plans", requireAuth, async (req, res, next) => {
    try {
      if (req.query.projectId) return res.json(await storage.getResourcePlansByProject(parseInt(req.query.projectId as string)));
      res.json(await storage.getResourcePlans());
    } catch (err) { next(err); }
  });

  app.post("/api/resource-plans", requireAuth, async (req, res, next) => {
    try { res.status(201).json(await storage.createResourcePlan(insertResourcePlanSchema.parse(req.body))); } catch (err) { next(err); }
  });

  app.patch("/api/resource-plans/:id", requireAuth, async (req, res, next) => {
    try { res.json(await storage.updateResourcePlan(parseInt(req.params.id), insertResourcePlanSchema.partial().parse(req.body))); } catch (err) { next(err); }
  });

  app.delete("/api/resource-plans/:id", requireAuth, async (req, res, next) => {
    try { await storage.deleteResourcePlan(parseInt(req.params.id)); res.json({ message: "Ressourcenplan gelöscht" }); } catch (err) { next(err); }
  });

  app.get("/api/order-dispositions", requireAuth, async (_req, res, next) => {
    try { res.json(await storage.getOrderDispositions()); } catch (err) { next(err); }
  });

  app.post("/api/order-dispositions", requireAuth, async (req, res, next) => {
    try { res.status(201).json(await storage.createOrderDisposition(insertOrderDispositionSchema.parse(req.body))); } catch (err) { next(err); }
  });

  app.patch("/api/order-dispositions/:id", requireAuth, async (req, res, next) => {
    try { res.json(await storage.updateOrderDisposition(parseInt(req.params.id), insertOrderDispositionSchema.partial().parse(req.body))); } catch (err) { next(err); }
  });

  app.delete("/api/order-dispositions/:id", requireAuth, async (req, res, next) => {
    try { await storage.deleteOrderDisposition(parseInt(req.params.id)); res.json({ message: "Disposition gelöscht" }); } catch (err) { next(err); }
  });

  app.get("/api/calculation-sheets", requireAuth, async (_req, res, next) => {
    try { res.json(await storage.getCalcSheets()); } catch (err) { next(err); }
  });

  app.get("/api/calculation-sheets/:id", requireAuth, async (req, res, next) => {
    try {
      const s = await storage.getCalcSheet(parseInt(req.params.id));
      if (!s) return res.status(404).json({ message: "Kalkulation nicht gefunden" });
      res.json(s);
    } catch (err) { next(err); }
  });

  app.post("/api/calculation-sheets", requireAuth, async (req, res, next) => {
    try { res.status(201).json(await storage.createCalcSheet(insertCalcSheetSchema.parse(req.body))); } catch (err) { next(err); }
  });

  app.patch("/api/calculation-sheets/:id", requireAuth, async (req, res, next) => {
    try { res.json(await storage.updateCalcSheet(parseInt(req.params.id), insertCalcSheetSchema.partial().parse(req.body))); } catch (err) { next(err); }
  });

  app.delete("/api/calculation-sheets/:id", requireAuth, async (req, res, next) => {
    try { await storage.deleteCalcSheet(parseInt(req.params.id)); res.json({ message: "Kalkulation gelöscht" }); } catch (err) { next(err); }
  });

  const paymentSchema = z.object({
    date: z.string().min(1),
    amount: z.number().positive(),
    customerId: z.number(),
    bankAccount: z.string().optional(),
    reference: z.string().optional(),
    allocations: z.array(z.object({
      documentId: z.number(),
      amount: z.number().positive(),
    })).default([]),
    skontoApplied: z.boolean().optional(),
  });

  app.post("/api/payments", requireAuth, async (req, res, next) => {
    try {
      const parsed = paymentSchema.parse(req.body);

      if (parsed.allocations.length > 0) {
        const allocTotal = parsed.allocations.reduce((s, a) => s + a.amount, 0);
        if (Math.abs(allocTotal - parsed.amount) > 0.01) {
          return res.status(400).json({ message: "Zuordnungssumme stimmt nicht mit Zahlbetrag überein" });
        }
      }

      let updatedCount = 0;

      for (const alloc of parsed.allocations) {
        const doc = await storage.getDocument(alloc.documentId);
        if (!doc) continue;

        if (doc.type === "gutschrift") {
          return res.status(400).json({ message: `Gutschriften können nicht mit Zahlungen verrechnet werden` });
        }
        if (doc.customerId !== parsed.customerId) {
          return res.status(400).json({ message: `Dokument ${alloc.documentId} gehört nicht zum ausgewählten Kunden` });
        }

        const existingPaid = parseFloat(doc.paidAmount || "0");
        let effectiveBrutto: number;
        const fibuRes = await pool.query(`
          SELECT re_id as "reId"
          FROM fibu_buchungen
          WHERE art = 'RA' AND idx = 0 AND (document_id = $1 OR rnr = $2)
          ORDER BY CASE WHEN document_id = $1 THEN 0 ELSE 1 END
          LIMIT 1
        `, [alloc.documentId, doc.documentNumber]);
        if (fibuRes.rows.length > 0) {
          return res.status(409).json({
            message: "Zahlungen fuer registrierte Rechnungen bitte ueber die FIBU-Buchung erfassen",
            reId: fibuRes.rows[0].reId,
          });
        }

        if (doc.fibuBrutto) {
          effectiveBrutto = parseFloat(doc.fibuBrutto);
        } else {
          effectiveBrutto = parseFloat(doc.grossTotal || "0");
          const prevInvoiced = parseFloat(doc.previouslyInvoiced || "0");
          if (prevInvoiced > 0) {
            const taxRate = parseFloat(doc.taxRate || "19");
            effectiveBrutto -= prevInvoiced * (1 + taxRate / 100);
          } else if (doc.type === "abschlagsrechnung" && doc.parentDocumentId) {
            const parent = await storage.getDocument(doc.parentDocumentId);
            if (parent && parent.type === "abschlagsrechnung") {
              effectiveBrutto -= parseFloat(parent.grossTotal || "0");
            }
          }
        }

        const openAmount = effectiveBrutto - existingPaid;

        let skontoAmount = 0;
        if (parsed.skontoApplied && doc.skontoDays && doc.skontoPercent && doc.date) {
          const skontoDeadline = new Date(doc.date);
          skontoDeadline.setDate(skontoDeadline.getDate() + doc.skontoDays);
          if (new Date(parsed.date) <= skontoDeadline) {
            skontoAmount = openAmount * (parseFloat(String(doc.skontoPercent)) / 100);
          }
        }

        const cappedAlloc = Math.min(alloc.amount, Math.max(0, openAmount));
        const effectivePaid = existingPaid + cappedAlloc + skontoAmount;
        const finalPaid = Math.min(effectivePaid, effectiveBrutto);
        const status = finalPaid >= effectiveBrutto - 0.01 ? "bezahlt" : "teilbezahlt";

        await storage.updateDocument(alloc.documentId, {
          paidAmount: finalPaid.toFixed(2),
          paidDate: parsed.date,
          status,
        } as any);
        updatedCount++;
      }

      res.json({ success: true, updatedDocuments: updatedCount });
    } catch (err) { next(err); }
  });

  app.get("/api/dunning/:documentId/pdf", requireAuth, async (req, res, next) => {
    try {
      const docId = parseInt(req.params.documentId);
      const doc = await storage.getDocument(docId);
      if (!doc) return res.status(404).json({ message: "Dokument nicht gefunden" });

      const customer = doc.customerId ? await storage.getCustomer(doc.customerId) : null;
      const dunnings = await storage.getDunningEntries(docId);
      if (dunnings.length === 0) return res.status(404).json({ message: "Keine Mahnungen vorhanden" });

      const latestDunning = dunnings.sort((a, b) => b.level - a.level)[0];
      const settings = await storage.getCompanySettings();

      const pdfDoc = generateDunningPdf(doc, customer, latestDunning, settings || null);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="Mahnung_${fmtDocNumber(doc.documentNumber)}_Stufe${latestDunning.level}.pdf"`);
      pdfDoc.pipe(res);
      pdfDoc.end();
    } catch (err) { next(err); }
  });

  app.get("/api/dunning-entries", requireAuth, async (req, res, next) => {
    try {
      if (!req.query.documentId) return res.status(400).json({ message: "documentId required" });
      res.json(await storage.getDunningEntries(parseInt(req.query.documentId as string)));
    } catch (err) { next(err); }
  });

  app.post("/api/dunning-entries", requireAuth, async (req, res, next) => {
    try {
      const created = await storage.createDunning(insertDunningSchema.parse(req.body));
      await syncDunningToFibu(created.documentId);
      res.status(201).json(created);
    } catch (err) { next(err); }
  });

  app.patch("/api/dunning-entries/:id", requireAuth, async (req, res, next) => {
    try {
      const updated = await storage.updateDunning(parseInt(req.params.id), insertDunningSchema.partial().parse(req.body));
      if (updated) await syncDunningToFibu(updated.documentId);
      res.json(updated);
    } catch (err) { next(err); }
  });

  app.get("/api/post-calculations", requireAuth, async (req, res, next) => {
    try {
      if (!req.query.projectId) return res.status(400).json({ message: "projectId required" });
      res.json(await storage.getPostCalculations(parseInt(req.query.projectId as string)));
    } catch (err) { next(err); }
  });

  app.post("/api/post-calculations", requireAuth, async (req, res, next) => {
    try { res.status(201).json(await storage.createPostCalc(insertPostCalcSchema.parse(req.body))); } catch (err) { next(err); }
  });

  app.patch("/api/post-calculations/:id", requireAuth, async (req, res, next) => {
    try { res.json(await storage.updatePostCalc(parseInt(req.params.id), insertPostCalcSchema.partial().parse(req.body))); } catch (err) { next(err); }
  });

  function projectNumberToHapak(pn: string): string {
    if (/^P[A-Z]\d+$/.test(pn)) {
      const numPart = pn.substring(2);
      return `P-${numPart.padStart(5, "0")}`;
    }
    return "";
  }

  app.get("/api/post-calculations/overview", requireAuth, async (req, res, next) => {
    try {
      const [fibuRows, angebotRows, timeRows, nakaRows, sollRows] = await Promise.all([
        pool.query(`
          SELECT f.ktr,
            COALESCE(SUM(CASE WHEN f.art='RA' AND f.typ='HR' THEN COALESCE(f.netto::numeric,0) ELSE 0 END),0)::float as ra_netto,
            COALESCE(SUM(CASE WHEN f.art='RA' AND f.typ='HG' THEN COALESCE(f.netto::numeric,0) ELSE 0 END),0)::float as ra_gs_netto,
            COALESCE(SUM(CASE WHEN f.art='RA' THEN COALESCE(f.zahlung::numeric,0) ELSE 0 END),0)::float as ra_bezahlt,
            COALESCE(SUM(CASE WHEN f.art='RA' THEN COALESCE(f.sk_betrag::numeric,0) ELSE 0 END),0)::float as ra_skonto,
            COALESCE(SUM(CASE WHEN f.art='RA' THEN COALESCE(f.minderung::numeric,0) ELSE 0 END),0)::float as ra_minderung,
            COALESCE(SUM(CASE WHEN f.art='RA' THEN GREATEST(COALESCE(f.offen::numeric,0), 0) ELSE 0 END),0)::float as ra_offen,
            COALESCE(COUNT(*) FILTER (WHERE f.art='RA' AND f.typ='HR'),0) as anz_rechnungen,
            COALESCE(SUM(CASE WHEN f.art='RE' AND f.typ IN ('HR','SB') THEN COALESCE(f.netto::numeric,0) ELSE 0 END),0)::float as re_netto,
            COALESCE(SUM(CASE WHEN f.art='RE' AND f.typ='HG' THEN COALESCE(f.netto::numeric,0) ELSE 0 END),0)::float as re_gs_netto,
            COALESCE(SUM(CASE WHEN f.art='RE' THEN COALESCE(f.zahlung::numeric,0) ELSE 0 END),0)::float as re_bezahlt,
            COALESCE(SUM(CASE WHEN f.art='RE' THEN GREATEST(COALESCE(f.offen::numeric,0), 0) ELSE 0 END),0)::float as re_offen,
            COALESCE(COUNT(*) FILTER (WHERE f.art='RE' AND f.typ='HR'),0) as anz_eingangsrechnungen
          FROM fibu_buchungen f
          WHERE f.idx = 0
            AND f.stornoflag != 2
            AND f.ktr IS NOT NULL AND f.ktr != ''
          GROUP BY f.ktr
        `),
        pool.query(`
          SELECT project_id,
            COALESCE(SUM(COALESCE(net_total::float, 0)), 0) as angebotssumme_netto,
            COUNT(*) as anz_angebote
          FROM documents
          WHERE project_id IS NOT NULL AND type = 'angebot' AND status NOT IN ('storniert')
          GROUP BY project_id
        `),
        pool.query(`
          SELECT project_id,
            COALESCE(SUM(COALESCE(hours::float, 0)), 0) as total_hours
          FROM time_entries WHERE project_id IS NOT NULL GROUP BY project_id
        `),
        pool.query(`
          SELECT project_number,
            COALESCE(SUM(COALESCE(labor_time::float, 0)), 0) / 60.0 as soll_stunden,
            COALESCE(SUM(COALESCE(ist_labor_time::float, 0)), 0) / 60.0 as ist_stunden,
            COALESCE(SUM(COALESCE(labor_ek::float, 0)), 0) as soll_lohn,
            COALESCE(SUM(COALESCE(ist_labor::float, 0)), 0) as ist_lohn,
            COALESCE(SUM(COALESCE(material_ek::float, 0)), 0) as soll_material,
            COALESCE(SUM(COALESCE(ist_material::float, 0)), 0) as ist_material,
            COALESCE(SUM(COALESCE(external_ek::float, 0)), 0) as soll_fremd,
            COALESCE(SUM(COALESCE(ist_external::float, 0)), 0) as ist_fremd,
            COALESCE(SUM(COALESCE(equipment_ek::float, 0)), 0) as soll_geraete,
            COALESCE(SUM(COALESCE(ist_equipment::float, 0)), 0) as ist_geraete,
            COALESCE(SUM(COALESCE(total_vk::float, 0)), 0) as total_vk,
            COUNT(*) as anz_positionen
          FROM post_calculation_items
          WHERE excluded IS NOT TRUE
          GROUP BY project_number
        `),
        pool.query(`
          SELECT d.project_id,
            COALESCE(SUM(COALESCE(di.labor_time::float, 0)), 0) as soll_stunden,
            COALESCE(SUM(COALESCE(di.labor_cost::float, 0)), 0) as soll_lohn,
            COALESCE(SUM(COALESCE(di.material_price::float, 0)), 0) as soll_material,
            COALESCE(SUM(COALESCE(di.external_cost::float, 0)), 0) as soll_fremd,
            COALESCE(SUM(COALESCE(di.equipment_cost::float, 0)), 0) as soll_geraete
          FROM document_items di
          JOIN documents d ON d.id = di.document_id
          WHERE d.project_id IS NOT NULL AND d.status NOT IN ('storniert')
            AND d.type IN ('auftragsbestaetigung','angebot')
            AND di.labor_time IS NOT NULL AND di.labor_time::float > 0
          GROUP BY d.project_id
        `),
      ]);

      const fibuMap = new Map(fibuRows.rows.map((r: any) => [r.ktr, r]));
      const angebotMap = new Map(angebotRows.rows.map((r: any) => [r.project_id, r]));
      const timeMap = new Map(timeRows.rows.map((r: any) => [r.project_id, r]));
      const nakaMap = new Map(nakaRows.rows.map((r: any) => [r.project_number, r]));
      const sollMap = new Map(sollRows.rows.map((r: any) => [r.project_id, r]));

      const hapakToProjectId = new Map<string, number>();
      const allProjRes = await pool.query(`SELECT id, project_number FROM projects WHERE project_number ~ '^P[A-Z]\\d+$'`);
      for (const p of allProjRes.rows) {
        const nr = projectNumberToHapak(p.project_number as string);
        if (nr && nakaMap.has(nr)) hapakToProjectId.set(nr, p.id);
      }

      const allProjectIds = new Set([
        ...fibuRows.rows.map((r: any) => r.ktr).filter((k: string) => /^P[A-Z]\d+$/.test(k)),
        ...sollRows.rows.map((r: any) => r.project_id),
        ...hapakToProjectId.values(),
      ]);

      const projectsByKtr = new Map<string, number>();
      for (const p of allProjRes.rows) {
        projectsByKtr.set(p.project_number, p.id);
        allProjectIds.add(p.id);
      }

      const projectsRes = await pool.query(`
        SELECT id, project_number, name, status, customer_id, start_date
        FROM projects WHERE id = ANY($1::int[])
        ORDER BY start_date DESC NULLS LAST, id DESC
      `, [Array.from(allProjectIds).filter(v => typeof v === 'number')]);

      const customerIds = [...new Set(projectsRes.rows.map((p: any) => p.customer_id).filter(Boolean))];
      const customersRes = customerIds.length > 0
        ? await pool.query(`SELECT id, name FROM customers WHERE id = ANY($1::int[])`, [customerIds])
        : { rows: [] };
      const customerMap = new Map(customersRes.rows.map((c: any) => [c.id, c.name]));

      const overview = projectsRes.rows.map((p: any) => {
        const pn = p.project_number || "";
        const fibu = fibuMap.get(pn);
        const a = angebotMap.get(p.id);
        const t = timeMap.get(p.id);
        const soll = sollMap.get(p.id);

        const hapakNr = projectNumberToHapak(pn);
        const naka = hapakNr ? nakaMap.get(hapakNr) : undefined;

        const erloese = fibu ? (fibu.ra_netto + fibu.ra_gs_netto) : 0;
        const reKosten = fibu ? (fibu.re_netto + fibu.re_gs_netto) : 0;
        const kosten = reKosten;
        const rohertrag = erloese - kosten;
        const marge = erloese > 0 ? Math.round((rohertrag / erloese) * 10000) / 100 : 0;

        const sollStunden = naka ? naka.soll_stunden : (soll ? soll.soll_stunden : 0);
        const istStunden = naka ? naka.ist_stunden : (t ? t.total_hours : 0);

        return {
          projectId: p.id,
          projectNumber: p.project_number,
          projectName: p.name,
          projectStatus: p.status,
          customerName: customerMap.get(p.customer_id) || null,
          customerId: p.customer_id,
          startDate: p.start_date,
          angebotssumme: a ? a.angebotssumme_netto : 0,
          anzAngebote: a ? parseInt(a.anz_angebote) : 0,
          erloese,
          erloesBezahlt: fibu ? fibu.ra_bezahlt : 0,
          erloesOffen: fibu ? fibu.ra_offen : 0,
          erloesSkonto: fibu ? fibu.ra_skonto : 0,
          erloesMinderung: fibu ? fibu.ra_minderung : 0,
          anzRechnungen: fibu ? parseInt(fibu.anz_rechnungen) : 0,
          kosten,
          kostenBezahlt: fibu ? fibu.re_bezahlt : 0,
          kostenOffen: fibu ? fibu.re_offen : 0,
          anzEingangsrechnungen: fibu ? parseInt(fibu.anz_eingangsrechnungen) : 0,
          rohertrag,
          marge,
          sollStunden,
          istStunden,
          stundenAbw: sollStunden > 0 ? Math.round(((istStunden - sollStunden) / sollStunden) * 10000) / 100 : 0,
          hasNaka: !!naka,
          naka: naka ? {
            sollLohn: naka.soll_lohn,
            istLohn: naka.ist_lohn,
            sollMaterial: naka.soll_material,
            istMaterial: naka.ist_material,
            sollFremd: naka.soll_fremd,
            istFremd: naka.ist_fremd,
            sollGeraete: naka.soll_geraete,
            istGeraete: naka.ist_geraete,
            totalVk: naka.total_vk,
            anzPositionen: parseInt(naka.anz_positionen),
          } : null,
        };
      });

      const totals = {
        erloese: overview.reduce((s, o) => s + o.erloese, 0),
        erloesBezahlt: overview.reduce((s, o) => s + o.erloesBezahlt, 0),
        erloesOffen: overview.reduce((s, o) => s + o.erloesOffen, 0),
        erloesSkonto: overview.reduce((s, o) => s + o.erloesSkonto, 0),
        erloesMinderung: overview.reduce((s, o) => s + o.erloesMinderung, 0),
        kosten: overview.reduce((s, o) => s + o.kosten, 0),
        kostenBezahlt: overview.reduce((s, o) => s + o.kostenBezahlt, 0),
        kostenOffen: overview.reduce((s, o) => s + o.kostenOffen, 0),
        rohertrag: overview.reduce((s, o) => s + o.rohertrag, 0),
        anzProjekte: overview.length,
        sollStunden: overview.reduce((s, o) => s + o.sollStunden, 0),
        istStunden: overview.reduce((s, o) => s + o.istStunden, 0),
        marge: 0,
      };
      totals.marge = totals.erloese > 0 ? Math.round((totals.rohertrag / totals.erloese) * 10000) / 100 : 0;

      res.json({ overview, totals });
    } catch (err) { next(err); }
  });

  app.get("/api/post-calculations/naka-detail/:projectId", requireAuth, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return res.status(400).json({ message: "Ungültige Projekt-ID" });

      const projRes = await pool.query(`SELECT project_number FROM projects WHERE id = $1`, [projectId]);
      if (projRes.rows.length === 0) return res.status(404).json({ message: "Projekt nicht gefunden" });

      const pn = projRes.rows[0].project_number || "";
      const hapakNr = projectNumberToHapak(pn);

      const nakaItems = await pool.query(`
        SELECT pos_nr, description, unit, quantity,
          COALESCE(labor_time::float, 0) / 60.0 as soll_stunden,
          COALESCE(ist_labor_time::float, 0) / 60.0 as ist_stunden,
          COALESCE(labor_ek::float, 0) as soll_lohn,
          COALESCE(ist_labor::float, 0) as ist_lohn,
          COALESCE(material_ek::float, 0) as soll_material,
          COALESCE(ist_material::float, 0) as ist_material,
          COALESCE(external_ek::float, 0) as soll_fremd,
          COALESCE(ist_external::float, 0) as ist_fremd,
          COALESCE(equipment_ek::float, 0) as soll_geraete,
          COALESCE(ist_equipment::float, 0) as ist_geraete,
          COALESCE(total_vk::float, 0) as total_vk,
          COALESCE(labor_vk::float, 0) as labor_vk,
          COALESCE(material_vk::float, 0) as material_vk,
          COALESCE(external_vk::float, 0) as external_vk,
          COALESCE(amount::float, 0) as amount,
          item_type, source_type, hierarchy_level, excluded
        FROM post_calculation_items
        WHERE project_number = $1 AND excluded IS NOT TRUE
        ORDER BY doc_index, sec_index, line_id
      `, [hapakNr]);

      const sollFromDocs = await pool.query(`
        SELECT di.position_number, di.title, di.unit, 
          COALESCE(di.quantity::float, 0) as menge,
          COALESCE(di.labor_time::float, 0) as soll_stunden,
          COALESCE(di.labor_cost::float, 0) as soll_lohn,
          COALESCE(di.labor_price::float, 0) as soll_lohn_vk,
          COALESCE(di.material_price::float, 0) as soll_material,
          COALESCE(di.external_cost::float, 0) as soll_fremd,
          COALESCE(di.equipment_cost::float, 0) as soll_geraete,
          COALESCE(di.total_price::float, 0) as total_vk,
          d.type as doc_type, d.document_number
        FROM document_items di
        JOIN documents d ON d.id = di.document_id
        WHERE d.project_id = $1 AND d.status NOT IN ('storniert')
          AND d.type IN ('auftragsbestaetigung','angebot')
          AND di.type = 'position'
          AND (di.labor_time::float > 0 OR di.labor_cost::float > 0 OR di.material_price::float > 0)
        ORDER BY d.type DESC, di.sort_order
      `, [projectId]);

      const summary = {
        soll: { stunden: 0, lohn: 0, material: 0, fremd: 0, geraete: 0, totalEk: 0 },
        ist: { stunden: 0, lohn: 0, material: 0, fremd: 0, geraete: 0, totalEk: 0 },
        vk: { lohn: 0, material: 0, fremd: 0, geraete: 0, total: 0 },
      };

      if (nakaItems.rows.length > 0) {
        for (const r of nakaItems.rows) {
          summary.soll.stunden += r.soll_stunden;
          summary.soll.lohn += r.soll_lohn;
          summary.soll.material += r.soll_material;
          summary.soll.fremd += r.soll_fremd;
          summary.soll.geraete += r.soll_geraete;
          summary.ist.stunden += r.ist_stunden;
          summary.ist.lohn += r.ist_lohn;
          summary.ist.material += r.ist_material;
          summary.ist.fremd += r.ist_fremd;
          summary.ist.geraete += r.ist_geraete;
          summary.vk.lohn += r.labor_vk;
          summary.vk.material += r.material_vk;
          summary.vk.fremd += r.external_vk;
          summary.vk.total += r.total_vk;
        }
      } else {
        for (const r of sollFromDocs.rows) {
          summary.soll.stunden += r.soll_stunden;
          summary.soll.lohn += r.soll_lohn;
          summary.soll.material += r.soll_material;
          summary.soll.fremd += r.soll_fremd;
          summary.soll.geraete += r.soll_geraete;
          summary.vk.lohn += r.soll_lohn_vk;
          summary.vk.total += r.total_vk;
        }
      }

      summary.soll.totalEk = summary.soll.lohn + summary.soll.material + summary.soll.fremd + summary.soll.geraete;
      summary.ist.totalEk = summary.ist.lohn + summary.ist.material + summary.ist.fremd + summary.ist.geraete;

      res.json({
        hapakNr,
        hasNakaData: nakaItems.rows.length > 0,
        anzPositionen: nakaItems.rows.length || sollFromDocs.rows.length,
        summary,
        source: nakaItems.rows.length > 0 ? "hapak" : "documents",
      });
    } catch (err) { next(err); }
  });

  app.get("/api/post-calculations/auto/:projectId", requireAuth, async (req, res, next) => {
    try {
      const projectId = parseInt(req.params.projectId);
      if (isNaN(projectId)) return res.status(400).json({ message: "Ungültige Projekt-ID" });

      const projRes = await pool.query(`SELECT project_number FROM projects WHERE id = $1`, [projectId]);
      if (projRes.rows.length === 0) return res.status(404).json({ message: "Projekt nicht gefunden" });
      const ktr = projRes.rows[0].project_number || "";

      const fibuResult = await pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN art='RA' AND typ='HR' THEN COALESCE(netto::numeric,0) ELSE 0 END),0)::float as ra_netto,
          COALESCE(SUM(CASE WHEN art='RA' AND typ='HG' THEN COALESCE(netto::numeric,0) ELSE 0 END),0)::float as ra_gs_netto,
          COALESCE(SUM(CASE WHEN art='RA' THEN COALESCE(zahlung::numeric,0) ELSE 0 END),0)::float as ra_bezahlt,
          COALESCE(SUM(CASE WHEN art='RA' THEN GREATEST(COALESCE(offen::numeric,0), 0) ELSE 0 END),0)::float as ra_offen,
          COALESCE(SUM(CASE WHEN art='RA' THEN COALESCE(sk_betrag::numeric,0) ELSE 0 END),0)::float as ra_skonto,
          COALESCE(SUM(CASE WHEN art='RA' THEN COALESCE(minderung::numeric,0) ELSE 0 END),0)::float as ra_minderung,
          COALESCE(COUNT(*) FILTER (WHERE art='RA' AND typ='HR'),0) as anz_rechnungen,
          COALESCE(COUNT(*) FILTER (WHERE art='RA' AND typ='HG'),0) as anz_gutschriften,
          COALESCE(SUM(CASE WHEN art='RE' AND typ IN ('HR','SB') THEN COALESCE(netto::numeric,0) ELSE 0 END),0)::float as re_netto,
          COALESCE(SUM(CASE WHEN art='RE' AND typ='HG' THEN COALESCE(netto::numeric,0) ELSE 0 END),0)::float as re_gs_netto,
          COALESCE(SUM(CASE WHEN art='RE' THEN COALESCE(zahlung::numeric,0) ELSE 0 END),0)::float as re_bezahlt,
          COALESCE(SUM(CASE WHEN art='RE' THEN GREATEST(COALESCE(offen::numeric,0), 0) ELSE 0 END),0)::float as re_offen,
          COALESCE(COUNT(*) FILTER (WHERE art='RE' AND typ='HR'),0) as anz_eingangsrechnungen,
          COALESCE(COUNT(*) FILTER (WHERE art='RE' AND typ='HG'),0) as anz_lieferantengutschriften
        FROM fibu_buchungen
        WHERE idx = 0 AND stornoflag != 2 AND ktr = $1
      `, [ktr]);

      const f = fibuResult.rows[0];

      const erloese = f.ra_netto + f.ra_gs_netto;
      const reKosten = f.re_netto + f.re_gs_netto;
      const kosten = reKosten;
      const rohertrag = erloese - kosten;
      const marge = erloese > 0 ? (rohertrag / erloese) * 100 : 0;

      res.json({
        erloese: {
          netto: f.ra_netto + f.ra_gs_netto,
          brutto: f.ra_netto + f.ra_gs_netto,
          gutschriften: f.ra_gs_netto,
          effektiv: erloese,
          bezahlt: f.ra_bezahlt,
          offen: f.ra_offen,
          skonto: f.ra_skonto,
          minderung: f.ra_minderung,
          anzRechnungen: parseInt(f.anz_rechnungen),
          anzGutschriften: parseInt(f.anz_gutschriften),
        },
        kosten: {
          netto: reKosten,
          brutto: reKosten,
          gutschriften: f.re_gs_netto,
          effektiv: kosten,
          bezahlt: f.re_bezahlt,
          offen: f.re_offen,
          anzEingangsrechnungen: parseInt(f.anz_eingangsrechnungen),
          anzLieferantengutschriften: parseInt(f.anz_lieferantengutschriften),
        },
        rohertrag,
        marge: Math.round(marge * 100) / 100,
      });
    } catch (err) { next(err); }
  });

  const stripPassword = (u: any) => { const { password, ...safe } = u; return safe; };

  app.get("/api/users", requireAuth, async (_req, res, next) => {
    try { res.json((await storage.getUsers()).map(stripPassword)); } catch (err) { next(err); }
  });

  const requireAdmin = (req: any, res: any, next: any) => {
    const user = req.user as any;
    if (!user || (user.role !== "chef" && user.role !== "admin")) {
      return res.status(403).json({ message: "Nur Administratoren dürfen Benutzer verwalten" });
    }
    next();
  };

  const requireRole = (...roles: string[]) => (req: any, res: any, next: any) => {
    const user = req.user as any;
    if (!user || (!["chef", "admin"].includes(user.role) && !roles.includes(user.role))) {
      return res.status(403).json({ message: "Keine Berechtigung für diese Aktion" });
    }
    next();
  };

  app.post("/api/users", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const data = insertUserSchema.parse(req.body);
      if (!data.password || data.password.length < 4) return res.status(400).json({ message: "Passwort muss mindestens 4 Zeichen haben" });
      const existing = await storage.getUserByUsername(data.username);
      if (existing) return res.status(400).json({ message: "Benutzername bereits vergeben" });
      const hashedPw = await hashPassword(data.password);
      const user = await storage.createUser({ ...data, password: hashedPw });
      res.status(201).json(stripPassword(user));
    } catch (err) { next(err); }
  });

  app.patch("/api/users/:id", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const data = insertUserSchema.partial().parse(req.body);
      if (data.password) {
        if (data.password.length < 4) return res.status(400).json({ message: "Passwort muss mindestens 4 Zeichen haben" });
        data.password = await hashPassword(data.password);
      } else {
        delete data.password;
      }
      if (data.username) {
        const existing = await storage.getUserByUsername(data.username);
        if (existing && existing.id !== id) return res.status(400).json({ message: "Benutzername bereits vergeben" });
      }
      const user = await storage.updateUser(id, data);
      res.json(stripPassword(user));
    } catch (err) { next(err); }
  });

  app.delete("/api/users/:id", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (id === (req.user as any)?.id) return res.status(400).json({ message: "Sie können sich nicht selbst löschen" });
      await storage.deleteUser(id);
      res.json({ message: "Benutzer gelöscht" });
    } catch (err) { next(err); }
  });

  app.get("/api/units", requireAuth, async (_req, res, next) => {
    try {
      let allUnits = await storage.getUnits();
      if (allUnits.length === 0) {
        for (const u of defaultUnits) {
          await storage.createUnit(u);
        }
        allUnits = await storage.getUnits();
      }
      res.json(normalizeHapakResponseText(allUnits));
    } catch (err) { next(err); }
  });

  app.post("/api/units", requireAuth, async (req, res, next) => {
    try {
      const data = insertUnitSchema.parse(req.body);
      const unit = await storage.createUnit(data);
      res.status(201).json(normalizeHapakResponseText(unit));
    } catch (err) { next(err); }
  });

  app.patch("/api/units/:id", requireAuth, async (req, res, next) => {
    try {
      const unit = await storage.updateUnit(parseInt(req.params.id), insertUnitSchema.partial().parse(req.body));
      res.json(normalizeHapakResponseText(unit));
    } catch (err) { next(err); }
  });

  app.delete("/api/units/:id", requireAuth, async (req, res, next) => {
    try {
      await storage.deleteUnit(parseInt(req.params.id));
      res.json({ message: "Einheit gelöscht" });
    } catch (err) { next(err); }
  });

  app.get("/api/bank-accounts", requireAuth, async (_req, res, next) => {
    try { res.json(await storage.getBankAccounts()); } catch (err) { next(err); }
  });

  app.post("/api/bank-accounts", requireAuth, async (req, res, next) => {
    try {
      const data = insertBankAccountSchema.parse(req.body);
      if (data.isDefault) {
        const existing = await storage.getBankAccounts();
        for (const a of existing) {
          if (a.isDefault) await storage.updateBankAccount(a.id, { isDefault: false });
        }
      }
      const account = await storage.createBankAccount(data);
      res.status(201).json(account);
    } catch (err) { next(err); }
  });

  app.patch("/api/bank-accounts/:id", requireAuth, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const data = insertBankAccountSchema.partial().parse(req.body);
      if (data.isDefault) {
        const existing = await storage.getBankAccounts();
        for (const a of existing) {
          if (a.isDefault && a.id !== id) await storage.updateBankAccount(a.id, { isDefault: false });
        }
      }
      const account = await storage.updateBankAccount(id, data);
      res.json(account);
    } catch (err) { next(err); }
  });

  app.delete("/api/bank-accounts/:id", requireAuth, async (req, res, next) => {
    try {
      await storage.deleteBankAccount(parseInt(req.params.id));
      res.json({ message: "Bankverbindung gelöscht" });
    } catch (err) { next(err); }
  });

  app.get("/api/document-number-formats", requireAuth, async (_req, res, next) => {
    try {
      const formats = await storage.getDocumentNumberFormats();
      if (formats.length === 0) {
        for (const docType of Object.keys(numberFormatLabels)) {
          await storage.updateDocumentNumberFormat(docType, "jj-nnnnn");
        }
        res.json(await storage.getDocumentNumberFormats());
      } else {
        res.json(formats);
      }
    } catch (err) { next(err); }
  });

  app.patch("/api/document-number-formats/:type", requireAuth, async (req, res, next) => {
    try {
      const { formatPattern } = req.body;
      if (!formatPattern || typeof formatPattern !== "string") {
        return res.status(400).json({ message: "formatPattern ist erforderlich" });
      }
      const nCount = (formatPattern.match(/n/g) || []).length;
      const jCount = (formatPattern.match(/j/g) || []).length;
      if (nCount < 3) return res.status(400).json({ message: "Mindestens 3 Nummern-Platzhalter (n) erforderlich" });
      if (jCount < 1) return res.status(400).json({ message: "Mindestens 1 Jahres-Platzhalter (j) erforderlich" });
      res.json(await storage.updateDocumentNumberFormat(req.params.type, formatPattern));
    } catch (err) { next(err); }
  });

  app.get("/api/document-number-formats/preview", requireAuth, async (req, res, next) => {
    try {
      const pattern = (req.query.pattern as string) || "jj-nnnnn";
      const now = new Date();
      const preview = formatDocumentNumberFromPattern(pattern, now.getFullYear(), now.getMonth() + 1, 1);
      res.json({ preview });
    } catch (err) { next(err); }
  });

  app.get("/api/trades", requireAuth, async (_req, res, next) => {
    try {
      let allTrades = await storage.getTrades();
      if (allTrades.length === 0) {
        for (const t of defaultTrades) {
          await storage.createTrade(t);
        }
        allTrades = await storage.getTrades();
      }
      res.json(allTrades);
    } catch (err) { next(err); }
  });

  app.post("/api/trades", requireAuth, async (req, res, next) => {
    try {
      const data = insertTradeSchema.parse(req.body);
      res.status(201).json(await storage.createTrade(data));
    } catch (err) { next(err); }
  });

  app.patch("/api/trades/:id", requireAuth, async (req, res, next) => {
    try {
      res.json(await storage.updateTrade(parseInt(req.params.id), insertTradeSchema.partial().parse(req.body)));
    } catch (err) { next(err); }
  });

  app.delete("/api/trades/:id", requireAuth, async (req, res, next) => {
    try {
      await storage.deleteTrade(parseInt(req.params.id));
      res.json({ message: "Gewerk gelöscht" });
    } catch (err) { next(err); }
  });

  app.get("/api/bwa-reports/year-summary/:year", requireAuth, async (req, res, next) => {
    try {
      const year = parseInt(req.params.year);
      const annual = await storage.getBwaReportByYearMonth(year, 0);
      if (!annual) return res.status(404).json({ message: `Keine BWA für ${year} vorhanden` });

      const gemeinkosten =
        parseFloat(annual.raumkosten ?? "0") +
        parseFloat(annual.betrieblicheSteuern ?? "0") +
        parseFloat(annual.versicherungenBeitraege ?? "0") +
        parseFloat(annual.besondereKosten ?? "0") +
        parseFloat(annual.fahrzeugkosten ?? "0") +
        parseFloat(annual.werbeReisekosten ?? "0") +
        parseFloat(annual.kostenWarenabgabe ?? "0") +
        parseFloat(annual.abschreibungen ?? "0") +
        parseFloat(annual.reparaturInstandhaltung ?? "0") +
        parseFloat(annual.sonstigeKosten ?? "0");

      res.json({
        year,
        umsatz: parseFloat(annual.umsatzerloese ?? "0"),
        materialkosten: parseFloat(annual.materialWareneinkauf ?? "0"),
        rohertrag: parseFloat(annual.rohertrag ?? "0"),
        personalkosten: parseFloat(annual.personalkosten ?? "0"),
        raumkosten: parseFloat(annual.raumkosten ?? "0"),
        fahrzeugkosten: parseFloat(annual.fahrzeugkosten ?? "0"),
        versicherungen: parseFloat(annual.versicherungenBeitraege ?? "0"),
        abschreibungen: parseFloat(annual.abschreibungen ?? "0"),
        sonstigeKosten: parseFloat(annual.sonstigeKosten ?? "0"),
        betrieblicheSteuern: parseFloat(annual.betrieblicheSteuern ?? "0"),
        werbeReisekosten: parseFloat(annual.werbeReisekosten ?? "0"),
        reparaturInstandhaltung: parseFloat(annual.reparaturInstandhaltung ?? "0"),
        kostenWarenabgabe: parseFloat(annual.kostenWarenabgabe ?? "0"),
        besondereKosten: parseFloat(annual.besondereKosten ?? "0"),
        gemeinkosten,
        gesamtkosten: parseFloat(annual.gesamtkosten ?? "0"),
        betriebsergebnis: parseFloat(annual.betriebsergebnis ?? "0"),
        betriebskostenOhneMaterial: parseFloat(annual.gesamtkosten ?? "0"),
      });
    } catch (err) { next(err); }
  });

  app.get("/api/bwa-reports", requireAuth, async (_req, res, next) => {
    try { res.json(await storage.getBwaReports()); } catch (err) { next(err); }
  });

  app.get("/api/bwa-reports/:id", requireAuth, async (req, res, next) => {
    try {
      const report = await storage.getBwaReport(parseInt(req.params.id));
      if (!report) return res.status(404).json({ message: "BWA nicht gefunden" });
      res.json(report);
    } catch (err) { next(err); }
  });

  app.post("/api/bwa-reports", requireAuth, async (req, res, next) => {
    try { res.status(201).json(await storage.createBwaReport(insertBwaReportSchema.parse(req.body))); } catch (err) { next(err); }
  });

  app.patch("/api/bwa-reports/:id", requireAuth, async (req, res, next) => {
    try { res.json(await storage.updateBwaReport(parseInt(req.params.id), insertBwaReportSchema.partial().parse(req.body))); } catch (err) { next(err); }
  });

  app.delete("/api/bwa-reports/:id", requireAuth, async (req, res, next) => {
    try { await storage.deleteBwaReport(parseInt(req.params.id)); res.sendStatus(204); } catch (err) { next(err); }
  });

  app.post("/api/bwa-reports/upload", requireAuth, bwaUpload.single("file"), async (req, res, next) => {
    let filePath: string | null = null;
    try {
      if (!req.file) return res.status(400).json({ message: "Keine Datei hochgeladen" });
      filePath = path.join(uploadsDir, req.file.filename);
      const originalName = req.file.originalname || "upload";
      const ext = path.extname(originalName).toLowerCase();

      let reports: any[] = [];

      if (ext === ".csv" || ext === ".txt") {
        const content = fs.readFileSync(filePath, "utf-8");
        reports = parseBwaCsv(content, originalName);
      } else if (ext === ".pdf") {
        const pdfBuffer = fs.readFileSync(filePath);
        const base64 = pdfBuffer.toString("base64");

        const bwaFields = [
          "year", "month", "period",
          "umsatzerloese", "bestandsveraenderung", "aktivierteEigenleistungen", "gesamtleistung",
          "materialWareneinkauf", "rohertrag", "soBetrieblicheErloese", "betrieblichRohertrag",
          "personalkosten", "raumkosten", "betrieblicheSteuern", "versicherungenBeitraege",
          "besondereKosten", "fahrzeugkosten", "werbeReisekosten", "kostenWarenabgabe",
          "abschreibungen", "reparaturInstandhaltung", "sonstigeKosten", "gesamtkosten",
          "betriebsergebnis", "zinsaufwand", "neutralerAufwand", "zinsertraege",
          "sonstigerNeutralerErtrag", "neutralerErtrag", "ergebnisVorSteuern",
          "steuernEinkommenErtrag", "vorlaeufigesErgebnis"
        ];

        const systemPrompt = `Du bist ein Experte für Betriebswirtschaftliche Auswertungen (BWA) im DATEV-Format (SKR 03/04).
Extrahiere ALLE Monatsdaten und die Jahressumme aus dem PDF.
Gib NUR ein JSON-Array zurück, KEIN weiterer Text.
Jedes Element hat diese Felder: ${bwaFields.join(", ")}
- year: Jahreszahl (z.B. 2025)
- month: Monatsnummer (1-12), oder 0 für Jahressumme/kumuliert
- period: Textbezeichnung (z.B. "Jan/2025", "Feb/2025", ..., "Jan-Dez/2025" für Summe)
- Alle Beträge als Zahlen (Dezimalpunkt, KEIN Tausendertrennzeichen), negative Werte mit Minus
- Fehlende Werte = 0

Beispiel für ein Element:
{"year":2025,"month":1,"period":"Jan/2025","umsatzerloese":50000.00,"bestandsveraenderung":0,"aktivierteEigenleistungen":0,"gesamtleistung":50000.00,"materialWareneinkauf":-15000.00,"rohertrag":35000.00,"soBetrieblicheErloese":0,"betrieblichRohertrag":35000.00,"personalkosten":-20000.00,"raumkosten":-2000.00,"betrieblicheSteuern":-100.00,"versicherungenBeitraege":-500.00,"besondereKosten":0,"fahrzeugkosten":-1500.00,"werbeReisekosten":-200.00,"kostenWarenabgabe":0,"abschreibungen":-1000.00,"reparaturInstandhaltung":-300.00,"sonstigeKosten":-400.00,"gesamtkosten":-26000.00,"betriebsergebnis":9000.00,"zinsaufwand":-100.00,"neutralerAufwand":-100.00,"zinsertraege":0,"sonstigerNeutralerErtrag":0,"neutralerErtrag":0,"ergebnisVorSteuern":8900.00,"steuernEinkommenErtrag":0,"vorlaeufigesErgebnis":8900.00}

WICHTIG: Antworte NUR mit dem JSON-Array. Kein Markdown, kein Erklärtext.`;

        const result = await aiCompleteWithDocument({
          system: systemPrompt,
          documentBase64: base64,
          documentMediaType: "application/pdf",
          userMessage: "Extrahiere alle BWA-Monatsdaten und die Jahressumme aus diesem PDF.",
          maxTokens: 16384,
        });

        let parsed: any[];
        try {
          let jsonText = result.text.trim();
          const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
          if (jsonMatch) jsonText = jsonMatch[0];
          parsed = JSON.parse(jsonText);
        } catch (e) {
          return res.status(422).json({
            message: "KI konnte die BWA-Daten nicht aus dem PDF extrahieren. Bitte prüfen Sie das Format.",
          });
        }

        if (!Array.isArray(parsed) || parsed.length === 0) {
          return res.status(422).json({ message: "Keine BWA-Daten im PDF erkannt." });
        }

        for (const entry of parsed) {
          const report: any = {
            year: entry.year,
            month: entry.month ?? 0,
            period: entry.period || `${entry.month === 0 ? "Gesamt" : `Monat ${entry.month}`}/${entry.year}`,
            sourceFile: originalName,
          };
          for (const f of bwaFields) {
            if (f === "year" || f === "month" || f === "period") continue;
            report[f] = String(entry[f] ?? "0.00");
          }
          reports.push(report);
        }
      } else {
        fs.unlinkSync(filePath);
        return res.status(400).json({ message: "Nur PDF- und CSV-Dateien werden unterstützt." });
      }

      const validReports = reports.filter(r => r.year && typeof r.year === "number" && r.year > 2000 && r.year < 2100);
      if (validReports.length === 0) {
        return res.status(422).json({ message: "Keine gültigen BWA-Daten gefunden (Jahr muss zwischen 2000 und 2100 liegen)." });
      }

      const created: any[] = [];
      for (const report of validReports) {
        const existing = await storage.getBwaReportByYearMonth(report.year, report.month);
        if (existing) {
          const updated = await storage.updateBwaReport(existing.id, report);
          created.push({ ...updated, _action: "updated" });
        } else {
          const newReport = await storage.createBwaReport(report);
          created.push({ ...newReport, _action: "created" });
        }
      }

      res.json({
        message: `${created.length} BWA-Berichte importiert (${created.filter(c => c._action === "created").length} neu, ${created.filter(c => c._action === "updated").length} aktualisiert)`,
        reports: created,
        count: created.length,
      });
    } catch (err) { next(err); } finally {
      if (filePath) { try { fs.unlinkSync(filePath); } catch {} }
    }
  });

  const importsDir = path.join(process.cwd(), "server", "uploads", "imports");
  if (!fs.existsSync(importsDir)) {
    fs.mkdirSync(importsDir, { recursive: true });
  }

  const importUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, importsDir),
      filename: (_req, file, cb) => {
        const uniqueName = randomUUID() + path.extname(file.originalname);
        cb(null, uniqueName);
      },
    }),
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if ([".csv", ".txt", ".dat"].includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error("Nur CSV-, TXT- oder DAT-Dateien erlaubt"));
      }
    },
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  function detectDelimiter(content: string): string {
    const firstLines = content.split("\n").slice(0, 5).join("\n");
    const semicolons = (firstLines.match(/;/g) || []).length;
    const tabs = (firstLines.match(/\t/g) || []).length;
    const commas = (firstLines.match(/,/g) || []).length;
    if (tabs >= semicolons && tabs >= commas && tabs > 0) return "\t";
    if (semicolons >= commas && semicolons > 0) return ";";
    if (commas > 0) return ",";
    return ";";
  }

  function parseCSVLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === delimiter) {
          result.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }
    result.push(current.trim());
    return result;
  }

  app.post("/api/import/upload", requireAuth, importUpload.single("file"), async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ message: "Keine Datei hochgeladen" });

      let content = fs.readFileSync(file.path, "utf-8");
      if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
      }

      const delimiter = detectDelimiter(content);
      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        return res.status(400).json({ message: "Die Datei enthält keine Daten (mindestens Kopfzeile + 1 Datenzeile erforderlich)" });
      }

      const headers = parseCSVLine(lines[0], delimiter);
      const rows = lines.slice(1).map((line) => parseCSVLine(line, delimiter));
      const previewRows = rows.slice(0, 100);

      res.json({
        headers,
        rows: previewRows,
        totalRows: rows.length,
        fileId: file.filename,
      });
    } catch (err) { next(err); }
  });

  app.post("/api/import/execute", requireAuth, async (req, res, next) => {
    try {
      const { type, mapping, fileId } = req.body as {
        type: "customers" | "materials";
        mapping: Record<string, string>;
        fileId: string;
      };

      if (!type || !mapping || !fileId) {
        return res.status(400).json({ message: "Typ, Zuordnung und Datei-ID sind erforderlich" });
      }

      const safeFileId = path.basename(fileId);
      if (safeFileId !== fileId || safeFileId.includes("..")) {
        return res.status(400).json({ message: "Ungültige Datei-ID" });
      }
      const filePath = path.join(importsDir, safeFileId);
      const resolvedImportPath = path.resolve(filePath);
      if (!resolvedImportPath.startsWith(path.resolve(importsDir))) {
        return res.status(400).json({ message: "Ungültige Datei-ID" });
      }
      if (!fs.existsSync(resolvedImportPath)) {
        return res.status(404).json({ message: "Datei nicht gefunden. Bitte laden Sie die Datei erneut hoch." });
      }

      let content = fs.readFileSync(resolvedImportPath, "utf-8");
      if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
      }

      const delimiter = detectDelimiter(content);
      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
      const headers = parseCSVLine(lines[0], delimiter);
      const dataRows = lines.slice(1).map((line) => parseCSVLine(line, delimiter));

      const headerToFieldMap: Record<number, string> = {};
      for (const [csvHeader, dbField] of Object.entries(mapping)) {
        const idx = headers.indexOf(csvHeader);
        if (idx >= 0) {
          headerToFieldMap[idx] = dbField;
        }
      }

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const record: Record<string, string> = {};
        for (const [idxStr, field] of Object.entries(headerToFieldMap)) {
          const idx = parseInt(idxStr);
          if (idx < row.length) {
            record[field] = row[idx];
          }
        }

        try {
          if (type === "customers") {
            if (!record.customerNumber || !record.name) {
              skipped++;
              continue;
            }
            if (!record.searchKey) {
              record.searchKey = record.name.toUpperCase().substring(0, 20);
            }
            await storage.createCustomer({
              customerNumber: record.customerNumber,
              contactType: "kunde",
              searchKey: record.searchKey,
              name: record.name,
              name2: record.name2 || null,
              salutation: record.salutation || null,
              street: record.street || null,
              zip: record.zip || null,
              city: record.city || null,
              phone: record.phone || null,
              fax: record.fax || null,
              mobile: record.mobile || null,
              email: record.email || null,
            });
            imported++;
          } else if (type === "materials") {
            if (!record.articleNumber || !record.name) {
              skipped++;
              continue;
            }
            const parseGermanNumber = (val: string | undefined): string => {
              if (!val) return "0.00";
              return val.replace(/\./g, "").replace(",", ".");
            };
            await storage.createMaterial({
              articleNumber: record.articleNumber,
              name: record.name,
              description: record.description || null,
              unit: record.unit || "Stk",
              purchasePrice: parseGermanNumber(record.purchasePrice),
              sellPrice: parseGermanNumber(record.sellPrice),
              supplier: record.supplier || null,
            });
            imported++;
          }
        } catch (err: any) {
          const msg = err.message || String(err);
          if (msg.includes("duplicate") || msg.includes("unique")) {
            skipped++;
          } else {
            errors.push(`Zeile ${i + 2}: ${msg.substring(0, 100)}`);
          }
        }
      }

      res.json({ imported, skipped, errors });
    } catch (err) { next(err); }
  });

  app.post("/api/import/nas-positions", requireAuth, async (req, res, next) => {
    try {
      const https = await import("https");
      const { DBFFile } = await import("dbffile");

      const NAS_HOST = "megathron1.synology.me";
      const NAS_PORT = 5001;
      const NAS_USER = "replit-invoice";
      const NAS_PASS = "Hapak_3000";
      const NAS_SHARE = "/HapakV22";

      const nasRequest = (path: string, method = "GET", postData?: string): Promise<any> => {
        return new Promise((resolve, reject) => {
          const options: any = {
            hostname: NAS_HOST, port: NAS_PORT, path, method,
            rejectUnauthorized: false,
            headers: postData ? { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(postData) } : {},
          };
          const req = https.request(options, (resp: any) => {
            let data = "";
            resp.on("data", (c: string) => data += c);
            resp.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
          });
          req.on("error", reject);
          if (postData) req.write(postData);
          req.end();
        });
      };

      const nasDownloadBinary = (path: string): Promise<Buffer> => {
        return new Promise((resolve, reject) => {
          const options: any = {
            hostname: NAS_HOST, port: NAS_PORT, path, method: "GET",
            rejectUnauthorized: false,
          };
          const req = https.request(options, (resp: any) => {
            const chunks: Buffer[] = [];
            resp.on("data", (c: Buffer) => chunks.push(c));
            resp.on("end", () => resolve(Buffer.concat(chunks)));
          });
          req.on("error", reject);
          req.end();
        });
      };

      const authResult = await nasRequest(
        `/webapi/auth.cgi?api=SYNO.API.Auth&version=6&method=login&account=${encodeURIComponent(NAS_USER)}&passwd=${encodeURIComponent(NAS_PASS)}&session=FileStation&format=sid`
      );
      if (!authResult?.success) {
        return res.status(500).json({ message: "NAS-Authentifizierung fehlgeschlagen", detail: authResult });
      }
      const sid = authResult.data.sid;

      const nasListPath = path.join(process.cwd(), "hapak_data", "nas_dbf_list.json");
      let nasDbfSet: Set<string>;
      if (fs.existsSync(nasListPath)) {
        nasDbfSet = new Set(JSON.parse(fs.readFileSync(nasListPath, "utf-8")));
      } else {
        const allFiles: string[] = [];
        let offset = 0;
        const limit = 5000;
        while (true) {
          const list = await nasRequest(
            `/webapi/entry.cgi?api=SYNO.FileStation.List&version=2&method=list&folder_path=${encodeURIComponent(NAS_SHARE + "/FB ZuB/Daten")}&sort_by=name&sort_direction=asc&offset=${offset}&limit=${limit}&filetype=file&_sid=${sid}`
          );
          if (!list?.success || !list.data?.files?.length) break;
          for (const f of list.data.files) {
            if (f.name.endsWith(".DBF")) allFiles.push(f.name.replace(".DBF", ""));
          }
          offset += list.data.files.length;
          if (list.data.files.length < limit) break;
        }
        nasDbfSet = new Set(allFiles);
        fs.writeFileSync(nasListPath, JSON.stringify(allFiles));
      }

      const allDocs = await storage.getDocuments();
      const docIdsWithItems = new Set(
        (await db.select({ documentId: documentItems.documentId }).from(documentItems).groupBy(documentItems.documentId))
          .map(r => r.documentId)
      );
      const docsWithoutItems = allDocs.filter(d => !docIdsWithItems.has(d.id) && nasDbfSet.has(d.documentNumber));

      let imported = 0;
      let skipped = 0;
      let failed = 0;
      const errors: string[] = [];
      const batchSize = req.body?.batchSize || 50;
      const docsToProcess = docsWithoutItems.slice(0, batchSize);

      const CONCURRENCY = 10;
      const tmpDir = path.join(process.cwd(), "hapak_data", "details");
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

      async function processDoc(doc: any): Promise<"imported" | "skipped" | "failed"> {
        const dbfName = doc.documentNumber;

        try {
          const downloadPath = `/webapi/entry.cgi?api=SYNO.FileStation.Download&version=2&method=download&path=${encodeURIComponent(NAS_SHARE + "/FB ZuB/Daten/" + dbfName + ".DBF")}&mode=download&_sid=${sid}`;
          const dbfBuffer = await nasDownloadBinary(downloadPath);
          if (dbfBuffer.length < 100) return "skipped";
          const bufStr = dbfBuffer.toString("utf-8", 0, Math.min(50, dbfBuffer.length));
          if (bufStr.includes('"error"') || bufStr.includes('"success":false')) return "skipped";

          const tmpPath = path.join(tmpDir, `${dbfName}.DBF`);
          fs.writeFileSync(tmpPath, dbfBuffer);

          const fptPath = `/webapi/entry.cgi?api=SYNO.FileStation.Download&version=2&method=download&path=${encodeURIComponent(NAS_SHARE + "/FB ZuB/Daten/" + dbfName + ".FPT")}&mode=download&_sid=${sid}`;
          try {
            const fptBuffer = await nasDownloadBinary(fptPath);
            if (fptBuffer.length > 100) {
              fs.writeFileSync(path.join(tmpDir, `${dbfName}.FPT`), fptBuffer);
            }
          } catch {}

          const dbf = await DBFFile.open(tmpPath);
          const recs = await dbf.readRecords();

          let sortOrder = 0;
          for (const rec of recs) {
            const flags = String(rec.FLAGS || "").trim();
            const posnr = String(rec.POSNR || "").trim();
            const kurztext = String(rec.KURZTEXT || "").trim();
            const me = String(rec.ME || "").trim();
            const menge = rec.MENGE;
            const ePreis = rec.E_PREIS;
            const hEbene = rec.H_EBENE;
            const recId = String(rec.ID || "").trim();

            if (!posnr && !kurztext && !flags.startsWith("0000")) continue;
            if (flags.length > 0 && !flags.startsWith("0000") && !flags.match(/^\d/)) continue;

            const isPosition = (typeof menge === "number" && menge > 0) || (typeof ePreis === "number" && ePreis > 0);
            const isTitel = hEbene !== null && hEbene !== undefined && !isPosition && posnr && kurztext;

            let itemType = "position";
            if (recId === "U") itemType = "titel";
            else if (recId === "B") itemType = "titelsumme";
            else if (recId === "T") itemType = "text";
            else if (recId === "J") itemType = "position";
            else if (recId === "l") itemType = "lohn";
            else if (recId === "m") itemType = "material";
            else if (isTitel && !isPosition) itemType = "titel";
            else if (!posnr && kurztext && !isPosition) itemType = "text";

            const qty = (typeof menge === "number" && menge > 0) ? menge : 0;
            const ep = (typeof ePreis === "number") ? ePreis : 0;
            const gp = qty > 0 && ep > 0 ? qty * ep : (typeof rec.PAUSCHAL === "number" && rec.PAUSCHAL > 0 ? rec.PAUSCHAL : ep);

            const num = (v: any) => (typeof v === "number" && !isNaN(v)) ? v : 0;
            const matEk = num(rec.MATEK);
            const matVkG = num(rec.MATVK_G);
            const lohnEkStd = num(rec.LOHNSATZEK);
            const lohnVkStd = num(rec.LOHNSVK_G);
            const zeit = num(rec.ZEIT);
            const gerEk = num(rec.GEREK);
            const gerVk = num(rec.GERVK);
            const fremdEk = num(rec.FREMDEK);
            const fremdVk = num(rec.FREMDVK);
            const setePreis = Boolean(rec.SETE_PREIS);

            const lohnEkGes = lohnEkStd * (zeit / 60);
            const lohnVkGes = lohnVkStd * (zeit / 60);

            const calcMarkup = (ek: number, vk: number) => {
              if (ek <= 0) return null;
              return ((vk / ek - 1) * 100).toFixed(2);
            };

            if (itemType === "text" && !kurztext) continue;

            try {
              await storage.createDocumentItem({
                documentId: doc.id,
                positionNumber: posnr || "",
                type: itemType,
                title: kurztext || null,
                description: null,
                unit: me || null,
                quantity: qty.toFixed(3),
                unitPrice: ep.toFixed(2),
                totalPrice: gp.toFixed(2),
                materialPrice: matEk.toFixed(2),
                laborCost: lohnEkStd.toFixed(2),
                laborPrice: lohnVkGes.toFixed(2),
                equipmentCost: gerEk.toFixed(2),
                externalCost: fremdEk.toFixed(2),
                materialMarkup: calcMarkup(matEk, matVkG) ?? undefined,
                laborMarkup: calcMarkup(lohnEkStd, lohnVkStd) ?? undefined,
                equipmentMarkup: calcMarkup(gerEk, gerVk) ?? undefined,
                externalMarkup: calcMarkup(fremdEk, fremdVk) ?? undefined,
                laborTime: zeit > 0 ? zeit.toFixed(2) : undefined,
                priceFollowsCost: setePreis,
                sortOrder: sortOrder++,
              });
            } catch (e: any) {
              errors.push(`${dbfName} Pos ${posnr}: ${e.message?.substring(0, 80)}`);
            }
          }

          return sortOrder > 0 ? "imported" : "skipped";
        } catch (e: any) {
          if (errors.length < 20) errors.push(`${dbfName}: ${e.message?.substring(0, 100)}`);
          return "failed";
        }
      }

      for (let i = 0; i < docsToProcess.length; i += CONCURRENCY) {
        const chunk = docsToProcess.slice(i, i + CONCURRENCY);
        const results = await Promise.all(chunk.map(processDoc));
        for (const r of results) {
          if (r === "imported") imported++;
          else if (r === "failed") failed++;
          else skipped++;
        }
      }

      try {
        await nasRequest(`/webapi/auth.cgi?api=SYNO.API.Auth&version=6&method=logout&session=FileStation&_sid=${sid}`);
      } catch {}

      res.json({
        message: `NAS-Import abgeschlossen`,
        imported, skipped, failed,
        totalDocsWithoutItems: docsWithoutItems.length,
        processedInBatch: docsToProcess.length,
        remainingDocs: docsWithoutItems.length - docsToProcess.length,
        errors,
      });
    } catch (err) { next(err); }
  });

  let backfillProgress = { running: false, processed: 0, totalDocs: 0, updated: 0, skipped: 0, errors: 0, errorDetails: [] as string[] };

  app.post("/api/import/backfill-kalkulation", requireAuth, async (req, res, next) => {
    try {
      if (backfillProgress.running) {
        return res.json({ message: "Backfill läuft bereits", ...backfillProgress });
      }

      const { DBFFile } = await import("dbffile");
      const detailsDir = path.join(process.cwd(), "hapak_data", "details");
      if (!fs.existsSync(detailsDir)) {
        return res.status(400).json({ error: "hapak_data/details/ Verzeichnis nicht gefunden" });
      }

      const docsResult = await db.execute(sql`
        SELECT DISTINCT d.id, d.document_number 
        FROM documents d
        JOIN document_items di ON di.document_id = d.id
        WHERE di.unit_price > 0 
          AND di.material_price = 0 AND di.labor_cost = 0 
          AND di.equipment_cost = 0 AND di.external_cost = 0
          AND di.material_markup IS NULL
      `);
      const docs = docsResult.rows as { id: number; document_number: string }[];

      backfillProgress = { running: true, processed: 0, totalDocs: docs.length, updated: 0, skipped: 0, errors: 0, errorDetails: [] };
      res.json({ message: "Backfill gestartet", totalDocs: docs.length });

      const num = (v: any) => (typeof v === "number" && !isNaN(v)) ? v : 0;
      const calcMarkup = (ek: number, vk: number) => {
        if (ek <= 0) return null;
        return Number(((vk / ek - 1) * 100).toFixed(2));
      };

      (async () => {
        for (const doc of docs) {
          const dbfName = doc.document_number;
          if (!dbfName) { backfillProgress.skipped++; backfillProgress.processed++; continue; }

          const dbfPath = path.join(detailsDir, `${dbfName}.DBF`);
          if (!fs.existsSync(dbfPath)) { backfillProgress.skipped++; backfillProgress.processed++; continue; }

          try {
            const dbf = await DBFFile.open(dbfPath);
            const recs = await dbf.readRecords();

            const items = await db.execute(sql`
              SELECT id, position_number, sort_order FROM document_items 
              WHERE document_id = ${doc.id} AND type IN ('position','leistung','material','lohn','manuell','jumbo')
              ORDER BY sort_order
            `);
            const dbItems = items.rows as { id: number; position_number: string; sort_order: number }[];

            const posRecs = recs.filter((r: any) => {
              const posnr = String(r.POSNR || "").trim();
              const ePreis = r.E_PREIS;
              const menge = r.MENGE;
              return posnr && ((typeof menge === "number" && menge > 0) || (typeof ePreis === "number" && ePreis > 0));
            });

            for (const dbItem of dbItems) {
              const matchRec = posRecs.find((r: any) => String(r.POSNR || "").trim() === dbItem.position_number);
              if (!matchRec) continue;

              const matEk = num(matchRec.MATEK);
              const matVkG = num(matchRec.MATVK_G);
              const lohnEkStd = num(matchRec.LOHNSATZEK);
              const lohnVkStd = num(matchRec.LOHNSVK_G);
              const zeit = num(matchRec.ZEIT);
              const gerEk = num(matchRec.GEREK);
              const gerVk = num(matchRec.GERVK);
              const fremdEk = num(matchRec.FREMDEK);
              const fremdVk = num(matchRec.FREMDVK);
              const setePreis = Boolean(matchRec.SETE_PREIS);

              const lohnEkGes = lohnEkStd * (zeit / 60);
              const lohnVkGes = lohnVkStd * (zeit / 60);

              const hasKalkData = matEk > 0 || lohnEkStd > 0 || gerEk > 0 || fremdEk > 0;
              if (!hasKalkData && !setePreis) continue;

              await db.execute(sql`
                UPDATE document_items SET
                  material_price = ${matEk.toFixed(2)},
                  labor_cost = ${lohnEkStd.toFixed(2)},
                  labor_price = ${lohnVkGes.toFixed(2)},
                  equipment_cost = ${gerEk.toFixed(2)},
                  external_cost = ${fremdEk.toFixed(2)},
                  material_markup = ${calcMarkup(matEk, matVkG)},
                  labor_markup = ${calcMarkup(lohnEkStd, lohnVkStd)},
                  equipment_markup = ${calcMarkup(gerEk, gerVk)},
                  external_markup = ${calcMarkup(fremdEk, fremdVk)},
                  labor_time = ${zeit > 0 ? zeit.toFixed(2) : null},
                  price_follows_cost = ${setePreis}
                WHERE id = ${dbItem.id}
              `);
              backfillProgress.updated++;
            }
          } catch (e: any) {
            backfillProgress.errors++;
            if (backfillProgress.errorDetails.length < 20) backfillProgress.errorDetails.push(`${dbfName}: ${(e.message || "").substring(0, 80)}`);
          }
          backfillProgress.processed++;
          if (backfillProgress.processed % 100 === 0) {
            console.log(`[Backfill] ${backfillProgress.processed}/${backfillProgress.totalDocs} Dokumente, ${backfillProgress.updated} Positionen aktualisiert`);
          }
        }
        backfillProgress.running = false;
        console.log(`[Backfill] Fertig: ${backfillProgress.updated} Positionen aktualisiert, ${backfillProgress.skipped} übersprungen, ${backfillProgress.errors} Fehler`);
      })();
    } catch (err) { next(err); }
  });

  app.get("/api/import/backfill-kalkulation/status", requireAuth, async (_req, res) => {
    res.json(backfillProgress);
  });

  let bgImportChild: any = null;
  let bgImportProgress = { imported: 0, skipped: 0, failed: 0, total: 0, processed: 0, running: false, startedAt: "" };

  app.post("/api/import/nas-positions-bg", requireAuth, async (req, res, next) => {
    try {
      if (bgImportChild && bgImportProgress.running) {
        return res.json({ message: "Import läuft bereits", ...bgImportProgress });
      }

      const { spawn } = await import("child_process");
      bgImportProgress = { imported: 0, skipped: 0, failed: 0, total: 0, processed: 0, running: true, startedAt: new Date().toISOString() };

      const reimportAll = req.body?.mode === "reimport-all";
      const args = ["tsx", "scripts/import-nas-positions.ts"];
      if (reimportAll) args.push("reimport-all");
      const child = spawn("npx", args, {
        cwd: process.cwd(),
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });
      bgImportChild = child;

      child.stdout?.on("data", (data: Buffer) => {
        const line = data.toString().trim();
        console.log(`[NAS-Import] ${line}`);
        const nasMatch = line.match(/NAS:\s+(\d+)\/(\d+)\s+\(imp=(\d+),\s*skip=(\d+),\s*fail=(\d+)\)/);
        const lokalMatch = line.match(/Lokal:\s+(\d+)\/(\d+)\s+\(imp=(\d+),\s*skip=(\d+),\s*fail=(\d+)\)/);
        const totalMatch = line.match(/davon\s+(\d+)\s+(?:ohne|zu importieren)/);
        const fertigMatch = line.match(/FERTIG:\s+Importiert=(\d+),\s*Übersprungen=(\d+),\s*Fehlgeschlagen=(\d+)/);
        if (totalMatch) bgImportProgress.total = parseInt(totalMatch[1]);
        if (nasMatch || lokalMatch) {
          const m = nasMatch || lokalMatch;
          if (m) {
            bgImportProgress.processed = parseInt(m[1]);
            bgImportProgress.imported = parseInt(m[3]);
            bgImportProgress.skipped = parseInt(m[4]);
            bgImportProgress.failed = parseInt(m[5]);
          }
        }
        if (fertigMatch) {
          bgImportProgress.imported = parseInt(fertigMatch[1]);
          bgImportProgress.skipped = parseInt(fertigMatch[2]);
          bgImportProgress.failed = parseInt(fertigMatch[3]);
          bgImportProgress.processed = bgImportProgress.total;
          bgImportProgress.running = false;
        }
      });

      child.stderr?.on("data", (data: Buffer) => {
        console.error(`[NAS-Import ERR] ${data.toString().trim()}`);
      });

      child.on("exit", (code: number | null) => {
        console.log(`[NAS-Import] Prozess beendet mit Code ${code}`);
        bgImportProgress.running = false;
        bgImportChild = null;
      });

      child.unref();
      res.json({ message: "Hintergrund-Import gestartet", ...bgImportProgress });
    } catch (err) { next(err); }
  });

  app.get("/api/import/nas-positions-status", requireAuth, async (_req, res) => {
    res.json(bgImportProgress);
  });

  let bgKalkChild: any = null;
  let bgKalkProgress = { updated: 0, failed: 0, total: 0, processed: 0, running: false, done: false, startedAt: "" };

  app.post("/api/import/kalk-values-bg", requireAuth, async (req, res, next) => {
    try {
      if (bgKalkProgress.running) {
        return res.json({ message: "Kalk-Import läuft bereits", ...bgKalkProgress });
      }

      const reset = req.body?.reset;
      const pFile = path.join(process.cwd(), "hapak_data", "kalk_progress.json");
      if (reset && fs.existsSync(pFile)) fs.unlinkSync(pFile);

      const { DBFFile } = await import("dbffile");
      const DETAILS_DIR = path.join(process.cwd(), "hapak_data", "details");
      const dbfFiles = fs.readdirSync(DETAILS_DIR).filter((f: string) => f.endsWith(".DBF")).sort();

      let startIdx = 0;
      let cumUpdated = 0;
      if (fs.existsSync(pFile)) {
        const prog = JSON.parse(fs.readFileSync(pFile, "utf-8"));
        if (prog.done) return res.json({ message: "Kalk-Import bereits abgeschlossen", done: true, cumUpdated: prog.cumUpdated });
        startIdx = prog.lastIdx || 0;
        cumUpdated = prog.cumUpdated || 0;
      }

      bgKalkProgress = { updated: cumUpdated, failed: 0, total: dbfFiles.length, processed: startIdx, running: true, done: false, startedAt: new Date().toISOString() };
      res.json({ message: "Kalk-Import im Hintergrund gestartet", ...bgKalkProgress });

      const allDocs = await storage.getDocuments();
      const docMap = new Map<string, number>();
      for (const d of allDocs) docMap.set(d.documentNumber, d.id);

      let updated = 0;
      let failed = 0;

      const processDoc = async (docId: number, dbfPath: string): Promise<number> => {
        const dbf = await DBFFile.open(dbfPath);
        const recs = await dbf.readRecords();
        const kalkItems: any[] = [];
        for (const rec of recs) {
          const flags = String(rec.FLAGS || "").trim();
          const posnr = String(rec.POSNR || "").trim();
          const kurztext = String(rec.KURZTEXT || "").trim();
          if (!posnr && !kurztext && !flags.startsWith("0000")) continue;
          if (flags.length > 0 && !flags.startsWith("0000") && !flags.match(/^\d/)) continue;
          const fek = (typeof rec.FREMDEK === "number") ? rec.FREMDEK : 0;
          const mek = (typeof rec.MATEK === "number") ? rec.MATEK : 0;
          const gek = (typeof rec.GEREK === "number") ? rec.GEREK : 0;
          const lek = (typeof rec.LOHNSATZEK === "number") ? rec.LOHNSATZEK : 0;
          const zt = (typeof rec.ZEIT === "number") ? rec.ZEIT : 0;
          if (fek > 0 || mek > 0 || gek > 0 || lek > 0 || zt > 0) {
            const fvk = (typeof rec.FREMDVK === "number") ? rec.FREMDVK : 0;
            const mvk = (typeof rec.MATVK_G === "number") ? rec.MATVK_G : 0;
            const gvk = (typeof rec.GERVK === "number") ? rec.GERVK : 0;
            const lvk = (typeof rec.LOHNSVK_G === "number") ? rec.LOHNSVK_G : 0;
            kalkItems.push({ posNr: posnr.replace(/\.$/, "").trim(), title: kurztext.split(/[\r\n]/)[0].trim(), fek, mek, gek, lek, zt, fvk, mvk, gvk, lvk });
          }
        }
        if (kalkItems.length === 0) return 0;
        const existingItems = await db.select({ id: documentItems.id, positionNumber: documentItems.positionNumber, title: documentItems.title })
          .from(documentItems).where(eq(documentItems.documentId, docId));
        const vals: string[] = [];
        const matchedIds = new Set<number>();
        for (const kr of kalkItems) {
          let match = existingItems.find(ei => !matchedIds.has(ei.id) && ei.positionNumber?.replace(/\.$/, "").trim() === kr.posNr && kr.posNr !== "");
          if (!match && kr.title) match = existingItems.find(ei => !matchedIds.has(ei.id) && ei.title?.split(/[\r\n]/)[0].trim() === kr.title);
          if (!match) continue;
          matchedIds.add(match.id);
          const fm = kr.fek > 0 ? Math.max(0, ((kr.fvk / kr.fek) - 1) * 100) : 0;
          const mm = kr.mek > 0 ? Math.max(0, ((kr.mvk / kr.mek) - 1) * 100) : 0;
          const gm = kr.gek > 0 ? Math.max(0, ((kr.gvk / kr.gek) - 1) * 100) : 0;
          const lm = (kr.lek > 0 && kr.lvk > 0 && kr.zt > 0) ? Math.max(0, ((kr.lvk / (kr.lek * kr.zt)) - 1) * 100) : 0;
          vals.push(`(${match.id},${kr.fek},${kr.mek},${kr.gek},${kr.lek},${kr.zt},${fm.toFixed(2)},${mm.toFixed(2)},${gm.toFixed(2)},${lm.toFixed(2)},${kr.lvk})`);
        }
        if (vals.length > 0) {
          await db.execute(sql.raw(`UPDATE document_items di SET external_cost=v.fek,material_price=v.mek,equipment_cost=v.gek,labor_cost=v.lek,labor_time=v.lt,external_markup=v.em,material_markup=v.mm,equipment_markup=v.gm,labor_markup=v.lm,labor_price=v.lp FROM (VALUES ${vals.join(",")}) AS v(id,fek,mek,gek,lek,lt,em,mm,gm,lm,lp) WHERE di.id=v.id`));
        }
        return vals.length;
      };

      (async () => {
        for (let i = startIdx; i < dbfFiles.length; i++) {
          if (!bgKalkProgress.running) break;
          const dbfFile = dbfFiles[i];
          const docNumber = dbfFile.replace(".DBF", "");
          const docId = docMap.get(docNumber);
          if (!docId) continue;
          try {
            const timeoutP = new Promise<number>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000));
            const count = await Promise.race([processDoc(docId, path.join(DETAILS_DIR, dbfFile)), timeoutP]);
            updated += count;
          } catch { failed++; }
          bgKalkProgress.processed = i + 1;
          bgKalkProgress.updated = cumUpdated + updated;
          bgKalkProgress.failed = failed;
          if ((i + 1) % 50 === 0) {
            fs.writeFileSync(pFile, JSON.stringify({ lastIdx: i + 1, cumUpdated: cumUpdated + updated }));
            console.log(`[Kalk] ${i + 1}/${dbfFiles.length} (${cumUpdated + updated} items)`);
          }
        }
        bgKalkProgress.done = true;
        bgKalkProgress.running = false;
        fs.writeFileSync(pFile, JSON.stringify({ lastIdx: dbfFiles.length, cumUpdated: cumUpdated + updated, done: true }));
        console.log(`[Kalk] FERTIG: ${cumUpdated + updated} items aktualisiert, ${failed} fehlgeschlagen`);
      })().catch(e => {
        console.error(`[Kalk] Fehler: ${e.message}`);
        bgKalkProgress.running = false;
      });
    } catch (err) { next(err); }
  });

  app.get("/api/import/kalk-values-status", requireAuth, async (_req, res) => {
    const pFile = path.join(process.cwd(), "hapak_data", "kalk_progress.json");
    let fileProgress: any = {};
    if (fs.existsSync(pFile)) {
      try { fileProgress = JSON.parse(fs.readFileSync(pFile, "utf-8")); } catch {}
    }
    res.json({ ...bgKalkProgress, fileProgress });
  });

  app.post("/api/import/material-dbf", requireAuth, async (req, res, next) => {
    try {
      const { DBFFile } = await import("dbffile");
      const { materials: materialsTable } = await import("@shared/schema");
      const dbfPath = path.join(process.cwd(), "hapak_data", "MATERIAL09.DBF");
      if (!fs.existsSync(dbfPath)) {
        return res.status(404).json({ message: "MATERIAL09.DBF nicht gefunden" });
      }
      const dbf = await DBFFile.open(dbfPath);
      const recs = await dbf.readRecords();

      const existingArts = new Set(
        (await db.select({ a: materialsTable.articleNumber }).from(materialsTable)).map(r => r.a)
      );

      let imported = 0, skipped = 0;
      const bulkValues: any[] = [];

      for (const rec of recs) {
        const artNr = String(rec.MATNR || "").trim();
        const name = String(rec.KURZTEXT || "").trim();
        if (!artNr || !name) { skipped++; continue; }

        const liefNr = String(rec.LIEFERANT || "").trim();
        const fullArtNr = liefNr ? `${liefNr}/${artNr}` : artNr;
        if (existingArts.has(fullArtNr)) { skipped++; continue; }
        existingArts.add(fullArtNr);

        bulkValues.push({
          articleNumber: fullArtNr,
          searchKey: String(rec.SUCH || "").trim() || null,
          name,
          unit: String(rec.ME || "Stk").trim(),
          purchasePrice: rec.EUMATEK != null ? String(Number(rec.EUMATEK).toFixed(2)) : "0.00",
          sellPrice: rec.EUMATVK1 != null ? String(Number(rec.EUMATVK1).toFixed(2)) : "0.00",
          salePrice1: rec.EUMATVK1 != null ? String(Number(rec.EUMATVK1).toFixed(2)) : "0.00",
          salePrice2: rec.EUMATVK2 != null ? String(Number(rec.EUMATVK2).toFixed(2)) : "0.00",
          salePrice3: rec.EUMATVK3 != null ? String(Number(rec.EUMATVK3).toFixed(2)) : "0.00",
          laborCostEk: rec.EULOHNSEK != null ? String(Number(rec.EULOHNSEK).toFixed(2)) : null,
          laborCostVk1: rec.EULOHNS1 != null ? String(Number(rec.EULOHNS1).toFixed(2)) : null,
          laborTime: rec.ZEIT != null && Number(rec.ZEIT) > 0 ? String(Number(rec.ZEIT).toFixed(2)) : null,
          supplier: liefNr || null,
          category: String(rec.HAUPTWG || "").trim() || null,
          group: String(rec.WG || "").trim() || null,
          active: true,
          inStock: rec.INLAGER === true,
          isFixedPrice: rec.ISFESTPR === true,
        });
      }

      const CHUNK = 1000;
      for (let i = 0; i < bulkValues.length; i += CHUNK) {
        const chunk = bulkValues.slice(i, i + CHUNK);
        await db.insert(materialsTable).values(chunk);
        imported += chunk.length;
      }

      res.json({ message: "MATERIAL09.DBF Import", imported, skipped, total: recs.length });
    } catch (err) { next(err); }
  });

  app.post("/api/import/labor-rates-dbf", requireAuth, async (req, res, next) => {
    try {
      const { DBFFile } = await import("dbffile");
      const dbfPath = path.join(process.cwd(), "hapak_data", "LOHN.DBF");
      if (!fs.existsSync(dbfPath)) {
        return res.status(404).json({ message: "LOHN.DBF nicht gefunden" });
      }
      const dbf = await DBFFile.open(dbfPath);
      const recs = await dbf.readRecords();

      const existing = await storage.getLaborRates();
      const existingNames = new Set(existing.map(r => r.name.toLowerCase()));

      let imported = 0, skipped = 0;

      for (const rec of recs) {
        const name = String(rec.KURZTEXT || "").trim();
        const nr = String(rec.NR || "").trim();
        if (!name) { skipped++; continue; }
        if (existingNames.has(name.toLowerCase())) { skipped++; continue; }

        const hourlyRate = rec.EULOHNS1 != null ? Number(rec.EULOHNS1) : (rec.EULOHNSEK != null ? Number(rec.EULOHNSEK) : 0);
        if (hourlyRate <= 0) { skipped++; continue; }

        await storage.createLaborRate({
          laborNumber: nr,
          name: name,
          description: `Hapak-Nr: ${nr}`,
          hourlyRate: hourlyRate.toFixed(2),
          purchasePrice: rec.EULOHNSEK != null ? Number(rec.EULOHNSEK).toFixed(2) : null,
          salePrice1: rec.EULOHNS1 != null ? Number(rec.EULOHNS1).toFixed(2) : null,
          salePrice2: rec.EULOHNS2 != null ? Number(rec.EULOHNS2).toFixed(2) : null,
          salePrice3: rec.EULOHNS3 != null ? Number(rec.EULOHNS3).toFixed(2) : null,
          costType: rec.KOSTENART ? String(rec.KOSTENART).trim() : null,
          revenueAccount: rec.ERLOESKTO ? String(rec.ERLOESKTO).trim() : null,
          category: rec.KOSTENART ? String(rec.KOSTENART).trim() : null,
        });
        existingNames.add(name.toLowerCase());
        imported++;
      }

      res.json({ message: "LOHN.DBF Import", imported, skipped, total: recs.length });
    } catch (err) { next(err); }
  });

  app.post("/api/import/jumbo-dbf", requireAuth, async (req, res, next) => {
    try {
      const { DBFFile } = await import("dbffile");
      const headerPath = path.join(process.cwd(), "hapak_data", "JUMBO09.DBF");
      const itemsPath = path.join(process.cwd(), "hapak_data", "JUMPOS09.DBF");
      if (!fs.existsSync(headerPath)) {
        return res.status(404).json({ message: "JUMBO09.DBF nicht gefunden" });
      }
      const headerDbf = await DBFFile.open(headerPath);
      const headerRecs = await headerDbf.readRecords();

      const subItems = new Map<string, any[]>();
      if (fs.existsSync(itemsPath)) {
        const itemsDbf = await DBFFile.open(itemsPath);
        const itemRecs = await itemsDbf.readRecords();
        for (const rec of itemRecs) {
          const nr = String(rec.JUMBONR || "").trim();
          if (!nr) continue;
          if (!subItems.has(nr)) subItems.set(nr, []);
          subItems.get(nr)!.push(rec);
        }
      }

      const existing = await storage.getJumboPackages();
      const existingNrs = new Set(existing.map(j => j.jumboNumber));
      const forceReimport = req.body?.force === true;
      if (forceReimport && existing.length > 0) {
        await pool.query("DELETE FROM jumbo_packages");
        existingNrs.clear();
      }

      let imported = 0, skipped = 0;

      for (const hdr of headerRecs) {
        const nr = String(hdr.JUMBONR || "").trim();
        if (!nr) { skipped++; continue; }
        if (existingNrs.has(nr)) { skipped++; continue; }

        const name = String(hdr.SUCH || hdr.KURZTEXT || "").trim();
        const unit = String(hdr.ME || "psch").trim();
        const subs = subItems.get(nr) || [];

        const jumboItems = subs.length > 0
          ? subs.map((i: any) => ({
              posNr: Number(i.POSNR) || 0,
              id: String(i.ID || "").trim(),
              supplier: String(i.GEW_LIEF || "").trim(),
              articleNumber: String(i.ARTNR || "").trim(),
              text: String(i.KURZTEXT || "").trim(),
              unit: String(i.ME || "Stk").trim(),
              quantity: Number(i.MENGE) || 0,
              zeit: Number(i.ZEIT) || 0,
              matEk: Number(i.EUMATEK) || 0,
              matVk: Number(i.EUMATVK1) || 0,
              lohnEk: Number(i.EULOHNSEK) || 0,
              lohnVk: Number(i.EULOHNS1) || 0,
              gerEk: Number(i.EUGEREK) || 0,
              gerVk: Number(i.EUGERVK) || 0,
              fremdEk: Number(i.EUFREMDEK) || 0,
              fremdVk: Number(i.EUFREMDVK) || 0,
            }))
          : [{
              posNr: Number(hdr.POSNR) || 0,
              text: String(hdr.KURZTEXT || "").trim(),
              unit: String(hdr.ME || "Stk").trim(),
              matEk: Number(hdr.EUMATEK) || 0,
              matVk: Number(hdr.EUMATVK1) || 0,
              lohnEk: Number(hdr.EULOHNSEK) || 0,
              lohnVk: Number(hdr.EULOHNS1) || 0,
              gerEk: Number(hdr.EUGEREK) || 0,
              gerVk: Number(hdr.EUGERVK) || 0,
              fremdEk: Number(hdr.EUFREMDEK) || 0,
              fremdVk: Number(hdr.EUFREMDVK) || 0,
            }];

        const laborTot = Number(hdr.EULOHNSEK) || 0;
        const matTot = Number(hdr.EUMATEK) || 0;
        const equipTot = Number(hdr.EUGEREK) || 0;
        const extTot = Number(hdr.EUFREMDEK) || 0;
        const totalEk = matTot + laborTot + equipTot + extTot;
        const totalVk = (Number(hdr.EUMATVK1) || 0) + (Number(hdr.EULOHNS1) || 0) + (Number(hdr.EUGERVK) || 0) + (Number(hdr.EUFREMDVK) || 0);

        await storage.createJumboPackage({
          jumboNumber: nr,
          searchKey: String(hdr.SUCH || "").trim() || null,
          shortText: String(hdr.KURZTEXT || "").trim() || `Jumbo ${nr}`,
          description: null,
          unit,
          items: jumboItems,
          laborTotal: laborTot.toFixed(2),
          materialTotal: matTot.toFixed(2),
          equipmentTotal: equipTot.toFixed(2),
          externalTotal: extTot.toFixed(2),
          totalEk: totalEk.toFixed(2),
          salePrice: totalVk.toFixed(2),
        });
        imported++;
      }

      res.json({ message: "JUMBO09.DBF + JUMPOS09.DBF Import", imported, skipped, totalHeaders: headerRecs.length, totalSubItems: [...subItems.values()].reduce((s, a) => s + a.length, 0) });
    } catch (err) { next(err); }
  });

  app.post("/api/import/nas-all-databases", requireAuth, async (req, res, next) => {
    try {
      const { DBFFile } = await import("dbffile");
      const {
        balanceSheetItems, incomeStatementItems, hourlyRateConfig,
        positionHistory, priceHistory, documentLinks,
        projectAddresses, statusEvents
      } = await import("@shared/schema");
      const { sql: sqlDrizzle } = await import("drizzle-orm");

      const HAPAK_DIR = path.join(process.cwd(), "hapak_data");
      const FIBU_DIR = path.join(HAPAK_DIR, "fibu");
      const results: Record<string, any> = {};

      const trimStr = (v: any) => typeof v === "string" ? v.trim() : String(v ?? "").trim();
      const numOrNull = (v: any) => { const n = Number(v); return isNaN(n) ? null : n; };
      const fmtDate = (d: any) => d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d) : null;

      const bilanzPath = path.join(FIBU_DIR, "BILANZPOSTEN.DBF");
      if (fs.existsSync(bilanzPath)) {
        const dbf = await DBFFile.open(bilanzPath);
        const recs = await dbf.readRecords();
        await db.delete(balanceSheetItems);
        if (recs.length > 0) {
          await db.insert(balanceSheetItems).values(recs.map((r: any) => ({ bpNr: Number(r.BP_NR) || 0, description: trimStr(r.BEZ) })));
        }
        results.bilanzposten = recs.length;
      }

      const guvPath = path.join(FIBU_DIR, "GUV.DBF");
      if (fs.existsSync(guvPath)) {
        const dbf = await DBFFile.open(guvPath);
        const recs = await dbf.readRecords();
        await db.delete(incomeStatementItems);
        if (recs.length > 0) {
          await db.insert(incomeStatementItems).values(recs.map((r: any) => ({ nr: Number(r.NR) || 0, description: trimStr(r.BEZ) })));
        }
        results.guv = recs.length;
      }

      const ssatzPath = path.join(FIBU_DIR, "SSATZ.DBF");
      if (fs.existsSync(ssatzPath)) {
        const dbf = await DBFFile.open(ssatzPath);
        const recs = await dbf.readRecords();
        await db.delete(hourlyRateConfig);
        for (const r of recs) {
          await db.insert(hourlyRateConfig).values({
            configId: Number(r.ID) || 0, description: trimStr(r.BEZ),
            stdWoche: String(numOrNull(r.STD_WOCHE) ?? 0), erstattung: Number(r.ERSTATTUNG) || 0,
            anwesend: String(numOrNull(r.ANWESEND) ?? 0), stdJahr: Number(r.STD_JAHR) || 0,
            zusatz: Number(r.ZUSATZ) || 0, fehltage: Number(r.FEHLTAGE) || 0,
            personen: Number(r.PERSONEN) || 0, upProzent: String(numOrNull(r.UP_PROZENT) ?? 0),
            uGehalt: String(numOrNull(r.U_GEHALT) ?? 0), lnk: String(numOrNull(r.LNK) ?? 0),
            faktor: String(numOrNull(r.FAKTOR) ?? 0), ycostChef: String(numOrNull(r.YCOST_CHEF) ?? 0),
            ycostPers: String(numOrNull(r.YCOST_PERS) ?? 0), ycostSach: String(numOrNull(r.YCOST_SACH) ?? 0),
            ycostFix: String(numOrNull(r.YCOST_FIX) ?? 0), przSachk: String(numOrNull(r.PRZ_SACHK) ?? 0),
            lkStd: String(numOrNull(r.LK_STD) ?? 0), fea: String(numOrNull(r.FEA) ?? 0),
            gewinn: String(numOrNull(r.GEWINN) ?? 0), umsatz: String(numOrNull(r.UMSATZ) ?? 0),
            stdSatz: String(numOrNull(r.STD_SATZ) ?? 0), aktuell: Boolean(r.AKTUELL),
            xpCost: String(numOrNull(r.XP_COST) ?? 0),
          });
        }
        results.ssatz = recs.length;
      }

      for (const htype of ["normal", "settled"] as const) {
        const fileName = htype === "normal" ? "HISTORY.DBF" : "HIST_AB.DBF";
        const filePath = path.join(HAPAK_DIR, fileName);
        if (!fs.existsSync(filePath)) continue;
        const dbf = await DBFFile.open(filePath);
        await db.execute(sqlDrizzle`DELETE FROM position_history WHERE history_type = ${htype}`);
        let total = 0;
        let offset = 0;
        while (offset < dbf.recordCount) {
          const records = await dbf.readRecords(Math.min(500, dbf.recordCount - offset));
          const batch = records.map((r: any) => ({
            docNr: trimStr(r.DOKNR), lineId: Number(r.LINEID) || 0, docDate: fmtDate(r.DOKDATE),
            customerNr: trimStr(r.KU_NUMMER), endCustomer: trimStr(r.ENDKUNDE), flags: trimStr(r.FLAGS),
            posNr: trimStr(r.POSNR), quantity: String(numOrNull(r.MENGE) ?? 0), unit: trimStr(r.ME),
            itemId: trimStr(r.ID), supplierTrade: trimStr(r.LIEF_GEW), articleNr: trimStr(r.NUMMER),
            jumbLineId: numOrNull(r.JUMLINEID), shortText: trimStr(r.KURZTEXT),
            laborTime: String(numOrNull(r.ZEIT) ?? 0), laborCostEk: String(numOrNull(r.LOHNSATZEK) ?? 0),
            laborCostVk: String(numOrNull(r.LOHNSATZVK) ?? 0), materialEk: String(numOrNull(r.MATEK) ?? 0),
            materialVk: String(numOrNull(r.MATVK) ?? 0), equipmentEk: String(numOrNull(r.GEREK) ?? 0),
            equipmentVk: String(numOrNull(r.GERVK) ?? 0), externalEk: String(numOrNull(r.FREMDEK) ?? 0),
            externalVk: String(numOrNull(r.FREMDVK) ?? 0), flatRate: String(numOrNull(r.PAUSCHAL) ?? 0),
            setUnitPrice: Boolean(r.SETE_PREIS), unitPrice: String(numOrNull(r.E_PREIS) ?? 0),
            discountRate: String(numOrNull(r.RABATTSATZ) ?? 0), discountValue: String(numOrNull(r.RABATTWERT) ?? 0),
            isEuro: Boolean(r.ISEURO), mainGroup: trimStr(r.HAUPTWG), subGroup: trimStr(r.WG),
            costType: numOrNull(r.KOSTENART), revenueAccount: trimStr(r.ERLOESKTO),
            costCenter: trimStr(r.KST), tariff: trimStr(r.TAR), historyType: htype,
          }));
          if (batch.length > 0) {
            for (let i = 0; i < batch.length; i += 100) {
              await db.insert(positionHistory).values(batch.slice(i, i + 100));
            }
          }
          total += batch.length;
          offset += records.length;
        }
        results[htype === "normal" ? "history" : "histAb"] = total;
      }

      const preisPath = path.join(HAPAK_DIR, "PREISHIST.DBF");
      if (fs.existsSync(preisPath)) {
        const dbf = await DBFFile.open(preisPath);
        await db.delete(priceHistory);
        let total = 0, offset = 0;
        while (offset < dbf.recordCount) {
          const records = await dbf.readRecords(Math.min(500, dbf.recordCount - offset));
          const batch = records.map((r: any) => ({
            itemId: trimStr(r.ID), supplierTrade: trimStr(r.LIEF_GEW), articleNr: trimStr(r.NUMMER),
            docDate: fmtDate(r.DOKDATE), docName: trimStr(r.DOKNAME), posNr: trimStr(r.POSNR),
            quantity: String(numOrNull(r.MENGE) ?? 0), unit: trimStr(r.ME),
            unitPrice: String(numOrNull(r.E_PREIS) ?? 0), discountRate: String(numOrNull(r.RABATTSATZ) ?? 0),
            customerNr: trimStr(r.KUNDE), endCustomer: trimStr(r.ENDKUNDE),
            lineId: numOrNull(r.LINEID), jumbLineId: numOrNull(r.JUMLINEID), flags: trimStr(r.FLAGS),
          }));
          if (batch.length > 0) {
            for (let i = 0; i < batch.length; i += 100) {
              await db.insert(priceHistory).values(batch.slice(i, i + 100));
            }
          }
          total += batch.length;
          offset += records.length;
        }
        results.preishist = total;
      }

      const doklinkPath = path.join(HAPAK_DIR, "DOKLINK.DBF");
      if (fs.existsSync(doklinkPath)) {
        const dbf = await DBFFile.open(doklinkPath);
        const recs = await dbf.readRecords();
        await db.delete(documentLinks);
        if (recs.length > 0) {
          await db.insert(documentLinks).values(recs.map((r: any) => ({
            docId: trimStr(r.ID), docName: trimStr(r.NAME), partnerId: trimStr(r.PARTNERID),
            guid: trimStr(r.GUID), crc: trimStr(r.CRC),
          })));
        }
        results.doklink = recs.length;
      }

      const projadrPath = path.join(HAPAK_DIR, "PROJADR.DBF");
      if (fs.existsSync(projadrPath)) {
        const dbf = await DBFFile.open(projadrPath);
        const recs = await dbf.readRecords();
        await db.delete(projectAddresses);
        for (const r of recs) {
          await db.insert(projectAddresses).values({
            projectName: trimStr(r.PROJNAME), functionRole: trimStr(r.FUNKTION),
            addressNr: trimStr(r.ADRNR), contactNr: trimStr(r.ANSPRNR),
          });
        }
        results.projadr = recs.length;
      }

      const statevntPath = path.join(HAPAK_DIR, "STATEVNT.DBF");
      if (fs.existsSync(statevntPath)) {
        const dbf = await DBFFile.open(statevntPath);
        const recs = await dbf.readRecords();
        await db.delete(statusEvents);
        for (const r of recs) {
          await db.insert(statusEvents).values({
            event: trimStr(r.EVENT), statProject: trimStr(r.STATPROJ), docType: trimStr(r.TYPDOK),
            statDoc: trimStr(r.STATDOK), newDocType: trimStr(r.TYPNDOK),
            newStatProject: trimStr(r.NSTATPROJ), fnNewStatProject: trimStr(r.FNSTATPROJ),
            newStatDoc: trimStr(r.NSTATDOK), fnNewStatDoc: trimStr(r.FNSTATDOK),
            newStatNewDoc: trimStr(r.NSTATNDOK), fnNewStatNewDoc: trimStr(r.FNSTATNDOK),
            description: trimStr(r.BEZ),
          });
        }
        results.statevnt = recs.length;
      }

      res.json({ message: "Alle NAS-Datenbanken importiert", results });
    } catch (err) { next(err); }
  });

  app.get("/api/open-items", requireAuth, async (_req, res, next) => {
    try {
      const allDocs = await storage.getDocuments();
      const docMap = new Map(allDocs.map(d => [d.id, d]));
      const invoiceTypes = ["rechnung", "abschlagsrechnung", "teilrechnung", "gutschrift"];
      const invoices = allDocs.filter(d => invoiceTypes.includes(d.type));

      const customers = await storage.getCustomers();
      const customerMap = new Map(customers.map(c => [c.id, c]));

      const fibuRows = await db.select().from(fibuBuchungen).where(
        and(eq(fibuBuchungen.art, "RA"), eq(fibuBuchungen.idx, 0))
      );
      const fibuByRnr = new Map(fibuRows.map(f => [f.rnr, f]));
      const fibuByDocumentId = new Map(fibuRows.filter(f => f.documentId).map(f => [f.documentId, f]));

      const today = new Date();
      const items = invoices.map(inv => {
        const closedStatuses = ["bezahlt", "storniert", "archiviert", "entwurf", "beauftragt"];
        if (inv.type === "gutschrift") return null;
        const fibu = fibuByRnr.get(inv.documentNumber);

        let effectiveGross: number;
        let paid: number;
        let open: number;
        let dueDate: Date;

        if (fibu) {
          if (fibu.stornoflag === 2) return null;
          if (closedStatuses.includes(inv.status)) return null;

          effectiveGross = parseFloat(fibu.betrag || "0");
          const fibuZahlung = parseFloat(fibu.zahlung || "0");
          const skonto = parseFloat(fibu.skBetrag || "0");
          const minderung = parseFloat(fibu.minderung || "0");
          const gutschrift = parseFloat(fibu.gutschrift || "0");
          const kuerzung = parseFloat(fibu.kuerzung || "0");

          const docPaid = parseFloat(inv.paidAmount || "0");
          const additionalPayments = Math.max(0, docPaid - fibuZahlung);
          paid = fibuZahlung + additionalPayments;

          open = effectiveGross - paid - skonto - minderung - gutschrift - kuerzung;

          if (fibu.bezahlflag === 2 && additionalPayments <= 0) return null;
          if (open <= 0.01) return null;

          if (fibu.faelligdat) {
            dueDate = new Date(fibu.faelligdat);
          } else {
            const invDate = new Date(inv.date);
            dueDate = new Date(invDate);
            dueDate.setDate(dueDate.getDate() + (inv.paymentTermDays || 14));
          }
        } else {
          const gross = parseFloat(inv.grossTotal || "0");
          paid = parseFloat(inv.paidAmount || "0");

          if (inv.fibuBrutto) {
            effectiveGross = parseFloat(inv.fibuBrutto);
            if (inv.fibuZahlung) paid = Math.max(paid, parseFloat(inv.fibuZahlung));
          } else {
            effectiveGross = gross;
            const prevInvoiced = parseFloat(inv.previouslyInvoiced || "0");
            if (prevInvoiced > 0) {
              const taxRate = parseFloat(inv.taxRate || "19");
              effectiveGross = gross - prevInvoiced * (1 + taxRate / 100);
            } else if (inv.type === "abschlagsrechnung" && inv.parentDocumentId) {
              const parent = docMap.get(inv.parentDocumentId);
              if (parent && parent.type === "abschlagsrechnung") {
                const parentGross = parseFloat(parent.grossTotal || "0");
                effectiveGross = gross - parentGross;
              }
            }
          }

          open = effectiveGross - paid;
          if (open <= 0.01 || closedStatuses.includes(inv.status)) return null;

          const invDate = new Date(inv.date);
          dueDate = new Date(invDate);
          dueDate.setDate(dueDate.getDate() + (inv.paymentTermDays || 14));
        }

        const overdueDays = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
        const customer = customerMap.get(inv.customerId);

        const fibuByDoc = fibuByDocumentId.get(inv.id);
        return {
          id: inv.id,
          documentNumber: inv.documentNumber,
          type: inv.type,
          customerId: inv.customerId,
          customerName: customer?.name || "Unbekannt",
          customerNumber: customer?.customerNumber || "",
          date: inv.date,
          dueDate: dueDate.toISOString().split("T")[0],
          grossTotal: effectiveGross.toFixed(2),
          paidAmount: paid.toFixed(2),
          openAmount: open.toFixed(2),
          overdueDays,
          status: overdueDays > 0 ? "ueberfaellig" : "offen",
          subject: inv.subject,
          fibuDunningLevel: parseInt(String(fibuByDoc?.mahnflag || 0), 10) || 0,
          fibuNoReminder: fibuByDoc?.mahnen === false,
        };
      }).filter(Boolean);

      items.sort((a: any, b: any) => b.overdueDays - a.overdueDays);

      const allDunnings = await Promise.all(
        items.map(async (item: any) => {
          const entries = await storage.getDunningEntries(item.id);
          return { docId: item.id, entries };
        })
      );
      const dunningMap = new Map(allDunnings.map(d => [d.docId, d.entries]));

      const enrichedItems = items.map((item: any) => {
        const entries = dunningMap.get(item.id) || [];
        const entryMaxLevel = entries.length > 0 ? Math.max(...entries.map((e: any) => e.level)) : 0;
        const maxLevel = Math.max(entryMaxLevel, item.fibuDunningLevel || 0);
        const customer = customerMap.get(item.customerId);
        return {
          ...item,
          dunningLevel: maxLevel,
          dunningCount: entries.length,
          dunningEntries: entries,
          noReminder: customer?.noReminder || item.fibuNoReminder || false,
        };
      });

      const totalOpen = enrichedItems.reduce((s: number, i: any) => s + parseFloat(i.openAmount), 0);
      const totalOverdue = enrichedItems.filter((i: any) => i.overdueDays > 0).reduce((s: number, i: any) => s + parseFloat(i.openAmount), 0);

      res.json({
        items: enrichedItems,
        summary: {
          count: enrichedItems.length,
          totalOpen: totalOpen.toFixed(2),
          overdueCount: enrichedItems.filter((i: any) => i.overdueDays > 0).length,
          totalOverdue: totalOverdue.toFixed(2),
        },
      });
    } catch (err) { next(err); }
  });

  app.post("/api/dunning-run", requireAuth, async (req, res, next) => {
    try {
      const { documentIds, feePerLevel } = req.body as { documentIds: number[]; feePerLevel?: Record<string, string> };
      if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ message: "documentIds required" });
      }

      const defaultFees: Record<number, string> = { 1: "0.00", 2: "5.00", 3: "10.00" };
      const results: { documentId: number; level: number; success: boolean; skipped?: string }[] = [];
      const allCustomers = await storage.getCustomers();
      const custMap = new Map(allCustomers.map(c => [c.id, c]));

      for (const docId of documentIds) {
        const doc = await storage.getDocument(docId);
        if (!doc) { results.push({ documentId: docId, level: 0, success: false, skipped: "Dokument nicht gefunden" }); continue; }

        const cust = custMap.get(doc.customerId);
        if (cust?.noReminder) { results.push({ documentId: docId, level: 0, success: false, skipped: "Mahnsperre" }); continue; }

        const existingDunnings = await storage.getDunningEntries(docId);
        const maxLevel = existingDunnings.length > 0 ? Math.max(...existingDunnings.map(e => e.level)) : 0;
        if (maxLevel >= 3) { results.push({ documentId: docId, level: 3, success: false, skipped: "Stufe 3 bereits erreicht" }); continue; }
        const nextLevel = maxLevel + 1;

        const fee = feePerLevel?.[String(nextLevel)] || defaultFees[nextLevel] || "5.00";
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 14);

        const texts: Record<number, string> = {
          1: "Sicher ist es Ihrer Aufmerksamkeit entgangen, dass folgende Rechnung noch nicht beglichen wurde. Wir bitten Sie, den ausstehenden Betrag innerhalb von 14 Tagen auf unser Konto zu überweisen.",
          2: "Trotz unserer Zahlungserinnerung ist folgende Rechnung noch offen. Wir bitten Sie dringend um umgehende Begleichung des ausstehenden Betrages.",
          3: "Letztmalig fordern wir Sie auf, den ausstehenden Betrag zu begleichen. Sollte der Betrag nicht innerhalb von 14 Tagen auf unserem Konto eingehen, sehen wir uns gezwungen, weitere Schritte einzuleiten.",
        };

        await storage.createDunning({
          documentId: docId,
          level: nextLevel,
          date: new Date().toISOString().split("T")[0],
          dueDate: dueDate.toISOString().split("T")[0],
          fee,
          text: texts[nextLevel] || `Mahnung Stufe ${nextLevel}`,
          status: "erstellt",
        });
        await syncDunningToFibu(docId);
        results.push({ documentId: docId, level: nextLevel, success: true });
      }

      const successful = results.filter(r => r.success);
      const skipped = results.filter(r => !r.success);
      res.json({ success: true, processed: successful.length, skipped: skipped.length, results });
    } catch (err) { next(err); }
  });

  // ========== KASSENBUCH (Cash Book) ==========
  app.get("/api/cash-book", requireAuth, async (req, res, next) => {
    try {
      const filters: any = {};
      if (req.query.month) filters.month = parseInt(req.query.month as string);
      if (req.query.year) filters.year = parseInt(req.query.year as string);
      if (req.query.cashAccount) filters.cashAccount = req.query.cashAccount as string;
      const entries = await storage.getCashBookEntries(filters);
      res.json(entries);
    } catch (err) { next(err); }
  });

  app.get("/api/cash-book/next-number", requireAuth, async (req, res, next) => {
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const number = await storage.getNextCashBookNumber(year);
      res.json({ number });
    } catch (err) { next(err); }
  });

  app.get("/api/cash-book/:id", requireAuth, async (req, res, next) => {
    try {
      const entry = await storage.getCashBookEntry(parseInt(req.params.id));
      if (!entry) return res.status(404).json({ message: "Buchung nicht gefunden" });
      res.json(entry);
    } catch (err) { next(err); }
  });

  app.post("/api/cash-book", requireAuth, async (req, res, next) => {
    try {
      const data = insertCashBookEntrySchema.parse(req.body);
      const existing = await storage.getCashBookEntries({ year: data.year });
      const maxLfd = existing.reduce((max, e) => Math.max(max, e.lfdNr), 0);
      data.lfdNr = maxLfd + 1;
      if (!data.receiptNumber) {
        data.receiptNumber = `KB-${String(data.lfdNr).padStart(4, "0")}`;
      }
      const entry = await storage.createCashBookEntry(data);
      res.status(201).json(entry);
    } catch (err) { next(err); }
  });

  app.patch("/api/cash-book/:id", requireAuth, async (req, res, next) => {
    try {
      const data = insertCashBookEntrySchema.partial().parse(req.body);
      const entry = await storage.updateCashBookEntry(parseInt(req.params.id), data);
      res.json(entry);
    } catch (err) { next(err); }
  });

  app.delete("/api/cash-book/:id", requireAuth, async (req, res, next) => {
    try {
      await storage.deleteCashBookEntry(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // ========== FLOSKELN (Phrases) ==========
  app.get("/api/phrases", requireAuth, async (req, res, next) => {
    try {
      const allPhrases = await storage.getPhrases();
      res.json(allPhrases);
    } catch (err) { next(err); }
  });

  app.get("/api/phrases/next-number", requireAuth, async (req, res, next) => {
    try {
      const number = await storage.getNextPhraseNumber();
      res.json({ number });
    } catch (err) { next(err); }
  });

  app.get("/api/phrases/:id", requireAuth, async (req, res, next) => {
    try {
      const phrase = await storage.getPhrase(parseInt(req.params.id));
      if (!phrase) return res.status(404).json({ message: "Floskel nicht gefunden" });
      res.json(phrase);
    } catch (err) { next(err); }
  });

  app.post("/api/phrases", requireAuth, async (req, res, next) => {
    try {
      const data = insertPhraseSchema.parse(req.body);
      const phrase = await storage.createPhrase(data);
      res.status(201).json(phrase);
    } catch (err) { next(err); }
  });

  app.patch("/api/phrases/:id", requireAuth, async (req, res, next) => {
    try {
      const data = insertPhraseSchema.partial().parse(req.body);
      const phrase = await storage.updatePhrase(parseInt(req.params.id), data);
      res.json(phrase);
    } catch (err) { next(err); }
  });

  app.delete("/api/phrases/:id", requireAuth, async (req, res, next) => {
    try {
      await storage.deletePhrase(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // ========== WIEDERVORLAGEN (Follow-ups) ==========
  app.get("/api/follow-ups", requireAuth, async (req, res, next) => {
    try {
      const filters: any = {};
      if (req.query.status) filters.status = req.query.status as string;
      const entries = await storage.getFollowUps(filters);
      res.json(entries);
    } catch (err) { next(err); }
  });

  app.get("/api/follow-ups/:id", requireAuth, async (req, res, next) => {
    try {
      const entry = await storage.getFollowUp(parseInt(req.params.id));
      if (!entry) return res.status(404).json({ message: "Wiedervorlage nicht gefunden" });
      res.json(entry);
    } catch (err) { next(err); }
  });

  app.post("/api/follow-ups", requireAuth, async (req, res, next) => {
    try {
      const data = insertFollowUpSchema.parse(req.body);
      const entry = await storage.createFollowUp(data);
      res.status(201).json(entry);
    } catch (err) { next(err); }
  });

  app.patch("/api/follow-ups/:id", requireAuth, async (req, res, next) => {
    try {
      const data = insertFollowUpSchema.partial().parse(req.body);
      const entry = await storage.updateFollowUp(parseInt(req.params.id), data);
      res.json(entry);
    } catch (err) { next(err); }
  });

  app.delete("/api/follow-ups/:id", requireAuth, async (req, res, next) => {
    try {
      await storage.deleteFollowUp(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // ========== POSTBUCH (Mail Log) ==========
  app.get("/api/mail-log", requireAuth, async (req, res, next) => {
    try {
      const filters: any = {};
      if (req.query.direction) filters.direction = req.query.direction as string;
      const entries = await storage.getMailLogEntries(filters);
      res.json(entries);
    } catch (err) { next(err); }
  });

  app.get("/api/mail-log/:id", requireAuth, async (req, res, next) => {
    try {
      const entry = await storage.getMailLogEntry(parseInt(req.params.id));
      if (!entry) return res.status(404).json({ message: "Postbuch-Eintrag nicht gefunden" });
      res.json(entry);
    } catch (err) { next(err); }
  });

  app.post("/api/mail-log", requireAuth, async (req, res, next) => {
    try {
      const data = insertMailLogSchema.parse(req.body);
      const entry = await storage.createMailLogEntry(data);
      res.status(201).json(entry);
    } catch (err) { next(err); }
  });

  app.patch("/api/mail-log/:id", requireAuth, async (req, res, next) => {
    try {
      const data = insertMailLogSchema.partial().parse(req.body);
      const entry = await storage.updateMailLogEntry(parseInt(req.params.id), data);
      res.json(entry);
    } catch (err) { next(err); }
  });

  app.delete("/api/mail-log/:id", requireAuth, async (req, res, next) => {
    try {
      await storage.deleteMailLogEntry(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // ========== HISTORIE (Customer History) ==========
  app.get("/api/customer-history/:customerId", requireAuth, async (req, res, next) => {
    try {
      const entries = await storage.getCustomerHistoryEntries(parseInt(req.params.customerId));
      res.json(entries);
    } catch (err) { next(err); }
  });

  app.post("/api/customer-history", requireAuth, async (req, res, next) => {
    try {
      const data = insertCustomerHistorySchema.parse(req.body);
      const entry = await storage.createCustomerHistoryEntry(data);
      res.status(201).json(entry);
    } catch (err) { next(err); }
  });

  app.patch("/api/customer-history/:id", requireAuth, async (req, res, next) => {
    try {
      const data = insertCustomerHistorySchema.partial().parse(req.body);
      const entry = await storage.updateCustomerHistoryEntry(parseInt(req.params.id), data);
      res.json(entry);
    } catch (err) { next(err); }
  });

  app.delete("/api/customer-history/:id", requireAuth, async (req, res, next) => {
    try {
      await storage.deleteCustomerHistoryEntry(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // ========== VERTRÄGE (Contracts) ==========
  app.get("/api/contracts", requireAuth, async (req, res, next) => {
    try { res.json(await storage.getContracts()); } catch (err) { next(err); }
  });
  app.get("/api/contracts/:id", requireAuth, async (req, res, next) => {
    try {
      const c = await storage.getContract(parseInt(req.params.id));
      if (!c) return res.status(404).json({ message: "Vertrag nicht gefunden" });
      res.json(c);
    } catch (err) { next(err); }
  });
  app.post("/api/contracts", requireAuth, async (req, res, next) => {
    try { res.status(201).json(await storage.createContract(insertContractSchema.parse(req.body))); } catch (err) { next(err); }
  });
  app.patch("/api/contracts/:id", requireAuth, async (req, res, next) => {
    try { res.json(await storage.updateContract(parseInt(req.params.id), insertContractSchema.partial().parse(req.body))); } catch (err) { next(err); }
  });
  app.delete("/api/contracts/:id", requireAuth, async (req, res, next) => {
    try { await storage.deleteContract(parseInt(req.params.id)); res.json({ success: true }); } catch (err) { next(err); }
  });

  // ========== BAUTAGEBUCH (Construction Diary) ==========
  app.get("/api/construction-diary", requireAuth, async (req, res, next) => {
    try { res.json(await storage.getConstructionDiaryEntries(req.query.projectNumber as string | undefined)); } catch (err) { next(err); }
  });
  app.post("/api/construction-diary", requireAuth, async (req, res, next) => {
    try { res.status(201).json(await storage.createConstructionDiaryEntry(insertConstructionDiarySchema.parse(req.body))); } catch (err) { next(err); }
  });
  app.patch("/api/construction-diary/:id", requireAuth, async (req, res, next) => {
    try { res.json(await storage.updateConstructionDiaryEntry(parseInt(req.params.id), insertConstructionDiarySchema.partial().parse(req.body))); } catch (err) { next(err); }
  });
  app.delete("/api/construction-diary/:id", requireAuth, async (req, res, next) => {
    try { await storage.deleteConstructionDiaryEntry(parseInt(req.params.id)); res.json({ success: true }); } catch (err) { next(err); }
  });

  // ========== PERSONAL (Employees) ==========
  app.get("/api/employees", requireAuth, async (req, res, next) => {
    try { res.json(await storage.getEmployees()); } catch (err) { next(err); }
  });
  app.get("/api/employees/summary/costs", requireAuth, async (_req, res, next) => {
    try {
      const employees = await storage.getEmployees();
      const active = employees.filter(e => e.active);
      let totalMonthly = 0;
      let totalHourly = 0;
      let count = 0;
      for (const e of active) {
        const hourly = parseFloat(e.hourlyRate || "0");
        const aufschlag = parseFloat(e.agAufschlagPercent || "20");
        const monthlyH = parseFloat(e.monthlyHours || "173");
        const aufschlagPerHour = hourly * (aufschlag / 100);
        const additionalPerHour = monthlyH > 0 ? parseFloat(e.additionalMonthly || "0") / monthlyH : 0;
        const totalPerHour = hourly + aufschlagPerHour + additionalPerHour;
        const totalMonthlyEmp = totalPerHour * monthlyH;
        totalMonthly += totalMonthlyEmp;
        totalHourly += totalPerHour;
        count++;
      }
      res.json({
        activeCount: count,
        totalYearlyPersonnelCosts: (totalMonthly * 12).toFixed(2),
        avgHourlyCost: count > 0 ? (totalHourly / count).toFixed(2) : "0.00",
        avgAufschlagPercent: count > 0
          ? (active.reduce((s, e) => s + parseFloat(e.agAufschlagPercent || "20"), 0) / count).toFixed(2)
          : "20.00",
      });
    } catch (err) { next(err); }
  });
  app.get("/api/employees/:id", requireAuth, async (req, res, next) => {
    try {
      const e = await storage.getEmployee(parseInt(req.params.id));
      if (!e) return res.status(404).json({ message: "Mitarbeiter nicht gefunden" });
      res.json(e);
    } catch (err) { next(err); }
  });
  app.post("/api/employees", requireAuth, async (req, res, next) => {
    try { res.status(201).json(await storage.createEmployee(insertEmployeeSchema.parse(req.body))); } catch (err) { next(err); }
  });
  app.patch("/api/employees/:id", requireAuth, async (req, res, next) => {
    try { res.json(await storage.updateEmployee(parseInt(req.params.id), insertEmployeeSchema.partial().parse(req.body))); } catch (err) { next(err); }
  });
  app.delete("/api/employees/:id", requireAuth, async (req, res, next) => {
    try { await storage.deleteEmployee(parseInt(req.params.id)); res.json({ success: true }); } catch (err) { next(err); }
  });

  app.post("/api/employees/import-payroll", requireAuth, upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ message: "Keine Datei hochgeladen" });
      const filePath = req.file.path;
      const fileBuffer = fs.readFileSync(filePath);
      fs.unlinkSync(filePath);
      let text: string;
      if (fileBuffer[0] === 0x25 && fileBuffer[1] === 0x50 && fileBuffer[2] === 0x44 && fileBuffer[3] === 0x46) {
        const pdfParseModule: any = await import("pdf-parse");
        const pdfParse = pdfParseModule.default ?? pdfParseModule;
        const pdfData = await pdfParse(fileBuffer);
        text = pdfData.text;
      } else {
        text = fileBuffer.toString("latin1");
      }

      interface ParsedEmployee {
        personalNumber: string;
        name: string;
        firstName: string;
        lastName: string;
        hourlyRate: number;
        healthInsurance: string;
        gesamtBrutto: number;
        svAgAnteil: number;
        zusAgKosten: number;
        gesamtKosten: number;
        bezStunden: number;
        zeitlohnStd: number;
        ueberstunden: number;
        kvBrutto: number;
        kvBeitragAg: number;
        rvBeitragAg: number;
        avBeitragAg: number;
        pvBeitragAg: number;
        additionalMonthly: number;
        lohnarten: { nr: string; bez: string; menge: number; faktor: number; betrag: number }[];
      }

      const employees: ParsedEmployee[] = [];
      let abrechnungsMonat = "";

      const sections = text.split(/Abrechnung der Brutto\/Netto-Bezüge/);

      const monthMatch = text.match(/für\s+(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/);
      if (monthMatch) abrechnungsMonat = `${monthMatch[1]} ${monthMatch[2]}`;

      for (let si = 1; si < sections.length; si++) {
        const section = sections[si];
        const emp: ParsedEmployee = {
          personalNumber: "", name: "", firstName: "", lastName: "",
          hourlyRate: 0, healthInsurance: "",
          gesamtBrutto: 0, svAgAnteil: 0, zusAgKosten: 0, gesamtKosten: 0,
          bezStunden: 0, zeitlohnStd: 0, ueberstunden: 0,
          kvBrutto: 0, kvBeitragAg: 0, rvBeitragAg: 0, avBeitragAg: 0, pvBeitragAg: 0,
          additionalMonthly: 0, lohnarten: [],
        };

        const pnrMatch = section.match(/Personal-Nr\.\s+(\d{5})\s/);
        if (!pnrMatch) {
          const pnrMatch2 = section.match(/\*Pers\.-Nr\.\s+(\d{5})\*/);
          if (pnrMatch2) emp.personalNumber = pnrMatch2[1];
        } else {
          emp.personalNumber = pnrMatch[1];
        }
        if (!emp.personalNumber) continue;

        const prevSection = sections[si - 1] || "";
        const nameBlockMatch = (prevSection + section).match(/\*Pers\.-Nr\.\s+\d{5}\*.*?\n.*?\n\s*\n\s+(\S.*?)\n\s+(\S.*?)\n\s+\d{5}/s);
        if (nameBlockMatch) {
          emp.name = nameBlockMatch[1].trim();
        }

        const lines = section.split("\n");
        let inBrutto = false;
        let foundName = false;

        for (let li = 0; li < lines.length; li++) {
          const line = lines[li];

          if (!foundName && line.match(/^\s{6,}\S/) && !line.match(/FriStD|Pers\.-Nr|Form\.|Abrechnung|Hinweise|Beson|GfB/)) {
            const namePart = line.trim();
            if (namePart.length > 2 && namePart.length < 50 && !namePart.match(/^\d/) && !namePart.match(/^[A-Z]{2}\s/) && namePart.match(/[a-zäöü]/i)) {
              if (!emp.name) {
                emp.name = namePart;
                foundName = true;
              }
            }
          }

          if (line.match(/Brutto-Bezüge/)) { inBrutto = true; continue; }
          if (line.match(/Steuer\/Sozialversicherung|Gesamt-Brutto/)) inBrutto = false;

          if (inBrutto) {
            const laMatch = line.match(/^\s+(\d{3})\s+(.{30,50}?)\s+(Std|T|Km|EUR)?\s*([\d.,]+)?\s+([\d.,]+)?\s+.*?([\d.,]+)$/);
            if (laMatch) {
              const nr = laMatch[1];
              const bez = laMatch[2].trim();
              const einheit = laMatch[3] || "";
              const menge = parseFloat((laMatch[4] || "0").replace(",", "."));
              const faktor = parseFloat((laMatch[5] || "0").replace(",", "."));
              const betragStr = laMatch[6] || "0";
              const betrag = parseFloat(betragStr.replace(".", "").replace(",", "."));
              emp.lohnarten.push({ nr, bez, menge, faktor, betrag });

              if (nr === "001" && einheit === "Std" && faktor > 0) {
                emp.hourlyRate = faktor;
                emp.zeitlohnStd = menge;
              }
              if (["031", "066", "302"].includes(nr)) {
                emp.additionalMonthly += betrag;
              }
            }
          }

          const zeitlohnMatch = line.match(/Zeitlohn Std\.\s*Überstd\.\s*Bez\. Std\./);
          if (zeitlohnMatch) {
            const nextLine = lines[li + 1] || "";
            const stdMatch = nextLine.match(/(\d+)\s+(\d*)\s+(\d+)\s*$/);
            if (stdMatch) {
              emp.zeitlohnStd = parseFloat(stdMatch[1]) / 100;
              emp.ueberstunden = parseFloat(stdMatch[2] || "0") / 100;
              emp.bezStunden = parseFloat(stdMatch[3]) / 100;
            }
          }

          const gbMatch = line.match(/Gesamt-Brutto\s*$/);
          if (gbMatch) {
            const nextLine = lines[li + 1] || "";
            const valMatch = nextLine.match(/([\d.,]+)\s*$/);
            if (valMatch) {
              emp.gesamtBrutto = parseFloat(valMatch[1].replace(".", "").replace(",", "."));
            }
          }

          const svAgMatch = line.match(/SV-AG-Anteil\s+Zus\. AG-Kosten\s+Gesamtkosten/);
          if (svAgMatch) {
            const nextLine = lines[li + 1] || "";
            const vals = nextLine.match(/([\d.,]+)\s+([\d.,]*)\s*([\d.,]*)\s*$/);
            if (vals) {
              emp.svAgAnteil = parseFloat(vals[1].replace(".", "").replace(",", ".")) / 100;
              emp.zusAgKosten = vals[2] ? parseFloat(vals[2].replace(".", "").replace(",", ".")) / 100 : 0;
            }
          }

          const svDetailMatch = line.match(/^(L)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d]+)\s+([\d]+)\s+([\d]+)\s*([Z1-5E])?\s+([\d]+)/);
          if (svDetailMatch) {
            emp.kvBrutto = parseFloat(svDetailMatch[2].replace(".", "").replace(",", ".")) / 100;
            emp.kvBeitragAg = parseFloat(svDetailMatch[6]) / 100;
            emp.rvBeitragAg = parseFloat(svDetailMatch[7]) / 100;
            emp.avBeitragAg = parseFloat(svDetailMatch[8]) / 100;
            emp.pvBeitragAg = parseFloat(svDetailMatch[10]) / 100;
          }

          const kkMatch = line.match(/(\d{11}[A-Z]\d{3})\s+(.+?)(?:\s{2,})/);
          if (kkMatch) {
            emp.healthInsurance = kkMatch[2].trim();
          }
        }

        if (emp.name) {
          const parts = emp.name.split(/\s+/);
          if (parts.length >= 2) {
            emp.firstName = parts[0];
            emp.lastName = parts.slice(1).join(" ");
          } else {
            emp.firstName = emp.name;
            emp.lastName = "";
          }
        }

        if (emp.personalNumber && (emp.name || emp.hourlyRate > 0)) {
          employees.push(emp);
        }
      }

      const existingEmployees = await storage.getEmployees();
      let updated = 0;
      let created = 0;
      const resultEmployees: any[] = [];

      for (const parsed of employees) {
        const existing = existingEmployees.find(e => e.employeeNumber === parsed.personalNumber);

        const updateData: any = {};
        if (parsed.hourlyRate > 0) updateData.hourlyRate = String(parsed.hourlyRate);
        if (parsed.healthInsurance) updateData.healthInsurance = parsed.healthInsurance;
        if (parsed.additionalMonthly > 0) updateData.additionalMonthly = String(parsed.additionalMonthly);

        let totalEmployerCost = 0;
        if (existing) {
          await storage.updateEmployee(existing.id, updateData);
          const updatedEmp = { ...existing, ...updateData };
          const aufschlag = n(updatedEmp.agAufschlagPercent) || 28;
          totalEmployerCost = n(updatedEmp.hourlyRate) * (1 + aufschlag / 100) + n(updatedEmp.additionalMonthly) / n(updatedEmp.monthlyHours || "173.33");
          updated++;
        } else {
          await storage.createEmployee({
            employeeNumber: parsed.personalNumber,
            firstName: parsed.firstName,
            lastName: parsed.lastName,
            type: "Monteur",
            active: true,
            agAufschlagPercent: "28",
            ...updateData,
          } as any);
          totalEmployerCost = parsed.hourlyRate * (1 + 28 / 100) + parsed.additionalMonthly / 173.33;
          created++;
        }

        resultEmployees.push({
          personalNumber: parsed.personalNumber,
          name: `${parsed.firstName} ${parsed.lastName}`,
          hourlyRate: parsed.hourlyRate,
          gesamtBrutto: parsed.gesamtBrutto,
          svAgAnteil: parsed.svAgAnteil,
          bezStunden: parsed.bezStunden,
          additionalMonthly: parsed.additionalMonthly,
          totalEmployerCost,
        });
      }

      function n(v: any): number { return Number(v) || 0; }

      res.json({
        success: true,
        month: abrechnungsMonat,
        updated,
        created,
        total: employees.length,
        employees: resultEmployees,
      });
    } catch (err) { next(err); }
  });

  // ========== TERMINE (Appointments) ==========
  app.get("/api/appointments", requireAuth, async (req, res, next) => {
    try {
      const filters: any = {};
      if (req.query.date) filters.date = req.query.date as string;
      if (req.query.employeeId) filters.employeeId = parseInt(req.query.employeeId as string);
      res.json(await storage.getAppointments(filters));
    } catch (err) { next(err); }
  });
  app.post("/api/appointments", requireAuth, async (req, res, next) => {
    try { res.status(201).json(await storage.createAppointment(insertAppointmentSchema.parse(req.body))); } catch (err) { next(err); }
  });
  app.patch("/api/appointments/:id", requireAuth, async (req, res, next) => {
    try { res.json(await storage.updateAppointment(parseInt(req.params.id), insertAppointmentSchema.partial().parse(req.body))); } catch (err) { next(err); }
  });
  app.delete("/api/appointments/:id", requireAuth, async (req, res, next) => {
    try { await storage.deleteAppointment(parseInt(req.params.id)); res.json({ success: true }); } catch (err) { next(err); }
  });

  // ========== SERIENNUMMERN (Serial Numbers) ==========
  app.get("/api/serial-numbers", requireAuth, async (req, res, next) => {
    try { res.json(await storage.getSerialNumbers()); } catch (err) { next(err); }
  });
  app.post("/api/serial-numbers", requireAuth, async (req, res, next) => {
    try { res.status(201).json(await storage.createSerialNumber(insertSerialNumberSchema.parse(req.body))); } catch (err) { next(err); }
  });
  app.patch("/api/serial-numbers/:id", requireAuth, async (req, res, next) => {
    try { res.json(await storage.updateSerialNumber(parseInt(req.params.id), insertSerialNumberSchema.partial().parse(req.body))); } catch (err) { next(err); }
  });
  app.delete("/api/serial-numbers/:id", requireAuth, async (req, res, next) => {
    try { await storage.deleteSerialNumber(parseInt(req.params.id)); res.json({ success: true }); } catch (err) { next(err); }
  });

  // ========== LEISTUNGEN / STÜCKLISTEN (Services) ==========
  app.get("/api/services", requireAuth, async (req, res, next) => {
    try { res.json(await storage.getServices()); } catch (err) { next(err); }
  });
  app.post("/api/services", requireAuth, async (req, res, next) => {
    try { res.status(201).json(await storage.createService(insertServiceSchema.parse(req.body))); } catch (err) { next(err); }
  });
  app.patch("/api/services/:id", requireAuth, async (req, res, next) => {
    try { res.json(await storage.updateService(parseInt(req.params.id), insertServiceSchema.partial().parse(req.body))); } catch (err) { next(err); }
  });
  app.delete("/api/services/:id", requireAuth, async (req, res, next) => {
    try { await storage.deleteService(parseInt(req.params.id)); res.json({ success: true }); } catch (err) { next(err); }
  });

  // ========== JUMBOS (Packages) ==========
  app.get("/api/jumbo-packages", requireAuth, async (req, res, next) => {
    try { res.json(await storage.getJumboPackages()); } catch (err) { next(err); }
  });
  app.post("/api/jumbo-packages", requireAuth, async (req, res, next) => {
    try { res.status(201).json(await storage.createJumboPackage(insertJumboPackageSchema.parse(req.body))); } catch (err) { next(err); }
  });
  app.patch("/api/jumbo-packages/:id", requireAuth, async (req, res, next) => {
    try { res.json(await storage.updateJumboPackage(parseInt(req.params.id), insertJumboPackageSchema.partial().parse(req.body))); } catch (err) { next(err); }
  });
  app.delete("/api/jumbo-packages/:id", requireAuth, async (req, res, next) => {
    try { await storage.deleteJumboPackage(parseInt(req.params.id)); res.json({ success: true }); } catch (err) { next(err); }
  });

  // ========== KONTENRAHMEN & STEUERSÄTZE ==========
  app.get("/api/accounts", requireAuth, async (_req, res, next) => {
    try { res.json(await storage.getAccounts()); } catch (err) { next(err); }
  });
  app.get("/api/tax-rates", requireAuth, async (_req, res, next) => {
    try { res.json(await storage.getTaxRates()); } catch (err) { next(err); }
  });

  // ========== FINANZBUCHHALTUNG (Ledger) ==========
  app.get("/api/ledger-entries", requireAuth, async (req, res, next) => {
    try {
      const filters = {
        period: req.query.period as string | undefined,
        bookingType: req.query.bookingType as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
      };
      res.json(await storage.getLedgerEntries(filters));
    } catch (err) { next(err); }
  });
  app.post("/api/ledger-entries", requireAuth, async (req, res, next) => {
    try { res.status(201).json(await storage.createLedgerEntry(insertLedgerEntrySchema.parse(req.body))); } catch (err) { next(err); }
  });
  app.patch("/api/ledger-entries/:id", requireAuth, async (req, res, next) => {
    try { res.json(await storage.updateLedgerEntry(parseInt(req.params.id), insertLedgerEntrySchema.partial().parse(req.body))); } catch (err) { next(err); }
  });
  app.delete("/api/ledger-entries/:id", requireAuth, async (req, res, next) => {
    try { await storage.deleteLedgerEntry(parseInt(req.params.id)); res.json({ success: true }); } catch (err) { next(err); }
  });

  // ========== LAGERBEWEGUNGEN (Inventory Movements) ==========
  app.get("/api/inventory-movements", requireAuth, async (req, res, next) => {
    try { res.json(await storage.getInventoryMovements()); } catch (err) { next(err); }
  });
  app.post("/api/inventory-movements", requireAuth, async (req, res, next) => {
    try { res.status(201).json(await storage.createInventoryMovement(insertInventoryMovementSchema.parse(req.body))); } catch (err) { next(err); }
  });

  // ========== BESTELLUNGEN (Purchase Orders) ==========
  app.get("/api/purchase-orders", requireAuth, async (req, res, next) => {
    try { res.json(await storage.getPurchaseOrders()); } catch (err) { next(err); }
  });
  app.post("/api/purchase-orders", requireAuth, async (req, res, next) => {
    try { res.status(201).json(await storage.createPurchaseOrder(insertPurchaseOrderSchema.parse(req.body))); } catch (err) { next(err); }
  });
  app.patch("/api/purchase-orders/:id", requireAuth, async (req, res, next) => {
    try { res.json(await storage.updatePurchaseOrder(parseInt(req.params.id), insertPurchaseOrderSchema.partial().parse(req.body))); } catch (err) { next(err); }
  });
  app.delete("/api/purchase-orders/:id", requireAuth, async (req, res, next) => {
    try { await storage.deletePurchaseOrder(parseInt(req.params.id)); res.json({ success: true }); } catch (err) { next(err); }
  });

  // ========== AUFMASS (Measurements) ==========
  app.get("/api/measurements", requireAuth, async (req, res, next) => {
    try { res.json(await storage.getMeasurements(req.query.projectNumber as string | undefined)); } catch (err) { next(err); }
  });
  app.post("/api/measurements", requireAuth, async (req, res, next) => {
    try { res.status(201).json(await storage.createMeasurement(insertMeasurementSchema.parse(req.body))); } catch (err) { next(err); }
  });
  app.patch("/api/measurements/:id", requireAuth, async (req, res, next) => {
    try { res.json(await storage.updateMeasurement(parseInt(req.params.id), insertMeasurementSchema.partial().parse(req.body))); } catch (err) { next(err); }
  });
  app.delete("/api/measurements/:id", requireAuth, async (req, res, next) => {
    try { await storage.deleteMeasurement(parseInt(req.params.id)); res.json({ success: true }); } catch (err) { next(err); }
  });

  // ========== BILD-UPLOAD (Formulare/Logo) ==========
  app.post("/api/uploads/image", requireAuth, imageUpload.single("image"), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ message: "Keine Bilddatei hochgeladen" });
      res.json({ url: `/api/uploads/${req.file.filename}`, filename: req.file.filename });
    } catch (err) { next(err); }
  });

  app.get("/api/uploads/:filename", async (req, res, next) => {
    try {
      const hasSessionAccess = typeof (req as any).isAuthenticated === "function" && (req as any).isAuthenticated();
      const hasPrintAccess = isPrintAssetTokenValid(req.query.printAssetToken);
      if (!hasSessionAccess && !hasPrintAccess) return res.status(401).json({ message: "Nicht angemeldet" });

      const safeName = String(req.params.filename || "");
      const resolvedPath = resolveUploadPath(uploadsDir, safeName);
      if (!resolvedPath) return res.status(400).json({ message: "Ungültiger Dateipfad" });
      if (!fs.existsSync(resolvedPath)) return res.status(404).json({ message: "Datei nicht gefunden" });
      const mimeType = getUploadMimeType(safeName);
      if (!mimeType) return res.status(415).json({ message: "Dateityp nicht erlaubt" });
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Cache-Control", "private, max-age=86400");
      res.setHeader("X-Content-Type-Options", "nosniff");
      fs.createReadStream(resolvedPath).pipe(res);
    } catch (err) { next(err); }
  });

  app.get("/api/uploads-legacy-disabled/:filename", requireAuth, async (_req, res, _next) => {
    return res.status(410).json({ message: "Legacy upload route disabled" });
  });

  app.get("/api/uploads-legacy-code-disabled/:filename", requireAuth, async (req, res, next) => {
    try {
      const safeName = String(req.params.filename || "");
      if (safeName !== req.params.filename || safeName.includes("..")) return res.status(400).json({ message: "Ungültiger Dateipfad" });
      const filePath = path.join(uploadsDir, safeName);
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(uploadsDir))) return res.status(400).json({ message: "Ungültiger Dateipfad" });
      if (!fs.existsSync(resolvedPath)) return res.status(404).json({ message: "Datei nicht gefunden" });
      const ext = path.extname(safeName).toLowerCase();
      const mimeMap: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp" };
      res.setHeader("Content-Type", mimeMap[ext] || "application/octet-stream");
      res.setHeader("Cache-Control", "public, max-age=86400");
      fs.createReadStream(resolvedPath).pipe(res);
    } catch (err) { next(err); }
  });

  // ========== FORMULARDESIGNER ==========
  app.get("/api/form-templates", requireAuth, async (req, res, next) => {
    try { res.json(normalizeHapakResponseText(await storage.getFormTemplates())); } catch (err) { next(err); }
  });
  app.post("/api/form-templates", requireAuth, async (req, res, next) => {
    try { res.status(201).json(normalizeHapakResponseText(await storage.createFormTemplate(insertFormTemplateSchema.parse(req.body)))); } catch (err) { next(err); }
  });
  app.patch("/api/form-templates/:id", requireAuth, async (req, res, next) => {
    try { res.json(normalizeHapakResponseText(await storage.updateFormTemplate(parseInt(req.params.id), insertFormTemplateSchema.partial().parse(req.body)))); } catch (err) { next(err); }
  });
  app.delete("/api/form-templates/:id", requireAuth, async (req, res, next) => {
    try { await storage.deleteFormTemplate(parseInt(req.params.id)); res.json({ success: true }); } catch (err) { next(err); }
  });

  // ========== ZEITERFASSUNG (externe App: fristd-bau.replit.app) ==========
  const timeTrackingCache = new Map<string, { data: any; ts: number }>();
  const CACHE_TTL = 5 * 60 * 1000;
  let partnerSessionCookie: string | null = null;
  let partnerSessionExpiry = 0;

  async function getPartnerSession(): Promise<string> {
    if (partnerSessionCookie && Date.now() < partnerSessionExpiry) return partnerSessionCookie;
    const username = process.env.PARTNER_APP_USERNAME;
    const password = process.env.PARTNER_APP_PASSWORD;
    if (!username || !password) throw new Error("Partner-App-Zugangsdaten nicht konfiguriert (PARTNER_APP_USERNAME / PARTNER_APP_PASSWORD)");
    const resp = await fetch("https://fristd-bau.replit.app/api/login/local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!resp.ok) throw new Error("Partner-App Login fehlgeschlagen: " + resp.status);
    const cookies: string[] = [];
    resp.headers.forEach((v, k) => { if (k === "set-cookie") cookies.push(v.split(";")[0]); });
    if (cookies.length === 0) throw new Error("Partner-App Login: kein Session-Cookie erhalten");
    partnerSessionCookie = cookies.join("; ");
    partnerSessionExpiry = Date.now() + 6 * 60 * 60 * 1000;
    return partnerSessionCookie;
  }

  async function fetchPartnerTimeEntries(startDate: string, endDate: string): Promise<any[]> {
    const cookie = await getPartnerSession();
    const resp = await fetch(`https://fristd-bau.replit.app/api/time-entries?includeTeam=true&startDate=${startDate}&endDate=${endDate}`, {
      headers: { Cookie: cookie, Accept: "application/json" },
    });
    if (resp.status === 401) {
      partnerSessionCookie = null;
      partnerSessionExpiry = 0;
      const cookie2 = await getPartnerSession();
      const resp2 = await fetch(`https://fristd-bau.replit.app/api/time-entries?includeTeam=true&startDate=${startDate}&endDate=${endDate}`, {
        headers: { Cookie: cookie2, Accept: "application/json" },
      });
      if (!resp2.ok) throw new Error("Partner-App Zeiteinträge: " + resp2.status);
      const data = await resp2.json();
      return Array.isArray(data) ? data : (data.entries || data.timeEntries || []);
    }
    if (!resp.ok) throw new Error("Partner-App Zeiteinträge: " + resp.status);
    const data = await resp.json();
    return Array.isArray(data) ? data : (data.entries || data.timeEntries || []);
  }

  app.get("/api/time-tracking/weekly", requireAuth, async (req, res, next) => {
    try {
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      if (!startDate || !endDate) return res.status(400).json({ message: "startDate und endDate erforderlich" });

      const cacheKey = `weekly-${startDate}-${endDate}`;
      const cached = timeTrackingCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        return res.json(cached.data);
      }

      const rawEntries = await fetchPartnerTimeEntries(startDate, endDate);
      const allEntries = rawEntries.filter((e: any) => e.date >= startDate && e.date <= endDate);

      const projectLookup = new Map<number, string>();
      const projIds = [...new Set(allEntries.map((e: any) => e.projectId).filter(Boolean))];
      if (projIds.length > 0) {
        const apiKey = process.env.PARTNER_API_KEY;
        if (apiKey) {
          try {
            const projResp = await fetch("https://fristd-bau.replit.app/api/partner/projects", {
              headers: { "x-api-key": apiKey, Accept: "application/json" },
            });
            if (projResp.ok) {
              const projData = await projResp.json();
              for (const p of projData.projects || []) {
                projectLookup.set(p.id || 0, p.projectNumber);
              }
            }
          } catch {}
        }
      }

      const byWorker = new Map<string, { name: string; workerId: string; entries: any[] }>();
      for (const e of allEntries) {
        const key = e.employeeNumber || e.employeeName || "unbekannt";
        if (!byWorker.has(key)) byWorker.set(key, { name: e.employeeName || e.workerName || "Unbekannt", workerId: key, entries: [] });
        byWorker.get(key)!.entries.push(e);
      }

      const mapEntry = (e: any) => {
        const hours = Number(e.calculatedHours) || Number(e.hours) || 0;
        return {
          date: e.date,
          hours,
          isExtraHours: e.isExtraHours || false,
          isWurstposition: e.isWurstPosition || e.isWurstposition || false,
          wageType: e.wageType || "001",
          startTime: e.startTime,
          endTime: e.endTime,
          projectNumber: e.projectNumber || null,
          projectNumberInternal: null,
          positionNumber: e.positionNumber || null,
          positionName: e.positionDescription || e.positionName || null,
          notes: e.shortText || e.notes || null,
        };
      };

      const mappedAll = allEntries.map(mapEntry);
      const result = {
        startDate,
        endDate,
        totalEntries: mappedAll.length,
        totalHours: mappedAll.reduce((s, e) => s + e.hours, 0),
        totalExtraHours: mappedAll.filter(e => e.isExtraHours).reduce((s, e) => s + e.hours, 0),
        totalWurstHours: mappedAll.filter(e => e.isWurstposition).reduce((s, e) => s + e.hours, 0),
        workers: Array.from(byWorker.values()).map(w => {
          const mapped = w.entries.map(mapEntry);
          return {
            name: w.name,
            workerId: w.workerId,
            totalHours: mapped.reduce((s, e) => s + e.hours, 0),
            entries: mapped,
          };
        }).sort((a, b) => b.totalHours - a.totalHours),
      };

      timeTrackingCache.set(cacheKey, { data: result, ts: Date.now() });
      res.json(result);
    } catch (err) { next(err); }
  });

  app.get("/api/time-tracking/summary/:projectNumber", requireAuth, async (req, res, next) => {
    try {
      const apiKey = process.env.PARTNER_API_KEY;
      if (!apiKey) {
        return res.status(503).json({ message: "Partner-API-Key nicht konfiguriert (PARTNER_API_KEY)" });
      }

      const params = new URLSearchParams();
      if (req.query.trade) params.set("trade", req.query.trade as string);
      if (req.query.startDate) params.set("startDate", req.query.startDate as string);
      if (req.query.endDate) params.set("endDate", req.query.endDate as string);

      let rawProjNr = req.params.projectNumber;
      const pzzMatch = rawProjNr.match(/^PZZ(\d{2})0?(\d{5})$/);
      const hapakProjNr = pzzMatch ? `${pzzMatch[1]}-${pzzMatch[2]}` : rawProjNr;
      const projNr = encodeURIComponent(hapakProjNr);
      const qs = params.toString();
      const url = `https://fristd-bau.replit.app/api/partner/projects/${projNr}/timeentries${qs ? "?" + qs : ""}`;

      const response = await fetch(url, {
        headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return res.json({
            projectNumber: req.params.projectNumber,
            totalHours: 0, totalExtraHours: 0, totalEntries: 0,
            byEmployee: [], byTrade: [], entries: [],
          });
        }
        const text = await response.text();
        return res.status(response.status).json({ message: `Zeiterfassung-API: ${text}` });
      }

      const data = await response.json();
      const entries: any[] = Array.isArray(data) ? data : (data.entries || data.timeEntries || []);
      const summary = data.summary || null;

      const byEmployee = new Map<string, { name: string; employeeNumber: string; hours: number; extraHours: number; entries: number; trade: string }>();
      const byTrade = new Map<string, { trade: string; hours: number; entries: number }>();
      let totalHours = 0;
      let totalExtraHours = 0;

      for (const e of entries) {
        const empName = e.workerName || "Unbekannt";
        const empNr = e.employeeNumber || "";
        const hours = Number(e.hours) || 0;
        const isExtra = e.isExtraHours === true;
        const trade = e.trade || "";
        totalHours += hours;
        if (isExtra) totalExtraHours += hours;

        const empKey = empNr || empName;
        const emp = byEmployee.get(empKey) || { name: empName, employeeNumber: empNr, hours: 0, extraHours: 0, entries: 0, trade };
        emp.hours += hours;
        if (isExtra) emp.extraHours += hours;
        emp.entries += 1;
        byEmployee.set(empKey, emp);

        const tr = byTrade.get(trade || "Sonstige") || { trade: trade || "Sonstige", hours: 0, entries: 0 };
        tr.hours += hours;
        tr.entries += 1;
        byTrade.set(trade || "Sonstige", tr);
      }

      res.json({
        projectNumber: req.params.projectNumber,
        totalHours: summary?.totalHours ?? totalHours,
        totalExtraHours,
        totalEntries: entries.length,
        byEmployee: Array.from(byEmployee.values()).sort((a, b) => b.hours - a.hours),
        byTrade: summary?.byTrade ?? Array.from(byTrade.values()).sort((a, b) => b.hours - a.hours),
        entries,
      });
    } catch (err) { next(err); }
  });

  // ========== STUNDENSATZ IST-STUNDEN ==========
  app.get("/api/time-tracking/year-summary/:year", requireAuth, async (req, res, next) => {
    try {
      const year = parseInt(req.params.year);
      if (isNaN(year)) return res.status(400).json({ message: "Ungültiges Jahr" });
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      const entries = await fetchPartnerTimeEntries(startDate, endDate);
      let arbeitStunden = 0, urlaubStunden = 0, krankStunden = 0, feiertagStunden = 0;
      let arbeitAnzahl = 0, urlaubAnzahl = 0, krankAnzahl = 0, feiertagAnzahl = 0;
      const byEmployee = new Map<string, { name: string; arbeit: number; urlaub: number; krank: number; feiertag: number; gesamt: number }>();

      for (const e of entries) {
        const entryDate = e.date || "";
        if (entryDate < startDate || entryDate > endDate) continue;

        const hours = Number(e.calculatedHours || e.hours) || 0;
        const wageType = (e.wageType || "001") as string;
        const empName = e.employeeName || e.workerName || "Unbekannt";
        const empKey = e.employeeNumber || empName;
        const emp = byEmployee.get(empKey) || { name: empName, arbeit: 0, urlaub: 0, krank: 0, feiertag: 0, gesamt: 0 };
        emp.gesamt += hours;

        if (wageType === "005") {
          urlaubStunden += hours; urlaubAnzahl++; emp.urlaub += hours;
        } else if (wageType === "006") {
          krankStunden += hours; krankAnzahl++; emp.krank += hours;
        } else if (wageType === "009") {
          feiertagStunden += hours; feiertagAnzahl++; emp.feiertag += hours;
        } else {
          arbeitStunden += hours; arbeitAnzahl++; emp.arbeit += hours;
        }
        byEmployee.set(empKey, emp);
      }

      const filteredCount = arbeitAnzahl + urlaubAnzahl + krankAnzahl + feiertagAnzahl;
      res.json({
        year,
        totalEntries: filteredCount,
        arbeit: { stunden: Math.round(arbeitStunden * 100) / 100, anzahl: arbeitAnzahl },
        urlaub: { stunden: Math.round(urlaubStunden * 100) / 100, anzahl: urlaubAnzahl },
        krank: { stunden: Math.round(krankStunden * 100) / 100, anzahl: krankAnzahl },
        feiertag: { stunden: Math.round(feiertagStunden * 100) / 100, anzahl: feiertagAnzahl },
        gesamt: { stunden: Math.round((arbeitStunden + urlaubStunden + krankStunden + feiertagStunden) * 100) / 100, anzahl: filteredCount },
        produktivStunden: Math.round(arbeitStunden * 100) / 100,
        abwesenheitStunden: Math.round((urlaubStunden + krankStunden + feiertagStunden) * 100) / 100,
        mitarbeiter: Array.from(byEmployee.values()).sort((a, b) => b.gesamt - a.gesamt),
        mitarbeiterAnzahl: byEmployee.size,
      });
    } catch (err) { next(err); }
  });

  // ========== BANK MODULE ==========
  function redactBankAccount(account: any) {
    const { apiConfig, ...safe } = account;
    return safe;
  }

  app.get("/api/bank/accounts", requireAuth, async (_req, res, next) => {
    try {
      const accounts = await storage.getBankAccounts();
      res.json(accounts.map(redactBankAccount));
    } catch (err) { next(err); }
  });

  app.get("/api/bank/accounts/:id", requireAuth, async (req, res, next) => {
    try {
      const account = await storage.getBankAccount(parseInt(req.params.id));
      if (!account) return res.status(404).json({ message: "Bankkonto nicht gefunden" });
      res.json(redactBankAccount(account));
    } catch (err) { next(err); }
  });

  const validBankTypes = ["deutsche_bank", "postbank", "finom", "sonstige"];
  app.post("/api/bank/accounts", requireAuth, async (req, res, next) => {
    try {
      const data = insertBankAccountSchema.parse(req.body);
      if (data.bankType && !validBankTypes.includes(data.bankType)) {
        return res.status(400).json({ message: "Ungültiger Banktyp" });
      }
      if (data.isDefault) {
        const existing = await storage.getBankAccounts();
        for (const a of existing) {
          if (a.isDefault) await storage.updateBankAccount(a.id, { isDefault: false });
        }
      }
      res.status(201).json(redactBankAccount(await storage.createBankAccount(data)));
    } catch (err) { next(err); }
  });

  app.patch("/api/bank/accounts/:id", requireAuth, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const data = insertBankAccountSchema.partial().parse(req.body);
      if (data.bankType !== undefined && !validBankTypes.includes(data.bankType)) {
        return res.status(400).json({ message: "Ungültiger Banktyp" });
      }
      if (data.isDefault) {
        const existing = await storage.getBankAccounts();
        for (const a of existing) {
          if (a.isDefault && a.id !== id) await storage.updateBankAccount(a.id, { isDefault: false });
        }
      }
      res.json(redactBankAccount(await storage.updateBankAccount(id, data)));
    } catch (err) { next(err); }
  });

  app.delete("/api/bank/accounts/:id", requireAuth, async (req, res, next) => {
    try {
      await storage.deleteBankAccount(parseInt(req.params.id));
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  app.get("/api/bank/accounts/:id/balance", requireAuth, async (req, res, next) => {
    try {
      const { getBankProvider } = await import("./bank-providers");
      const account = await storage.getBankAccount(parseInt(req.params.id));
      if (!account) return res.status(404).json({ message: "Bankkonto nicht gefunden" });
      const provider = getBankProvider(account.bankType);
      if (!provider) {
        const cached = await storage.getBankCachedBalance(account.id);
        return res.json(cached || { balance: "0.00", availableBalance: null, currency: "EUR" });
      }
      const balance = await provider.getBalance(account.id, account.iban, (account.apiConfig || {}) as Record<string, string>);
      const cached = await storage.upsertBankCachedBalance({
        bankAccountId: account.id,
        balance: String(balance.balance),
        availableBalance: balance.availableBalance ? String(balance.availableBalance) : null,
        currency: balance.currency,
      });
      res.json(cached);
    } catch (err) { next(err); }
  });

  app.get("/api/bank/accounts/:id/transactions", requireAuth, async (req, res, next) => {
    try {
      const { getBankProvider } = await import("./bank-providers");
      const account = await storage.getBankAccount(parseInt(req.params.id));
      if (!account) return res.status(404).json({ message: "Bankkonto nicht gefunden" });
      const { fromDate, toDate, search, minAmount, maxAmount } = req.query;
      const cached = await storage.getBankCachedTransactions(account.id, {
        fromDate: fromDate as string,
        toDate: toDate as string,
        search: search as string,
        minAmount: minAmount ? parseFloat(minAmount as string) : undefined,
        maxAmount: maxAmount ? parseFloat(maxAmount as string) : undefined,
      });
      if (cached.length > 0) return res.json(cached);
      const provider = getBankProvider(account.bankType);
      if (!provider) return res.json([]);
      const transactions = await provider.getTransactions(
        account.id, account.iban, (account.apiConfig || {}) as Record<string, string>,
        fromDate as string, toDate as string
      );
      const toInsert = transactions.map(tx => ({
        bankAccountId: account.id,
        externalId: tx.externalId,
        bookingDate: tx.bookingDate,
        valueDate: tx.valueDate,
        amount: String(tx.amount),
        currency: tx.currency,
        purpose: tx.purpose,
        counterpartName: tx.counterpartName,
        counterpartIban: tx.counterpartIban,
        counterpartBic: tx.counterpartBic,
        transactionType: tx.transactionType,
        creditorId: tx.creditorId || null,
        mandateReference: tx.mandateReference || null,
        endToEndReference: tx.endToEndReference || null,
      }));
      const created = await storage.bulkCreateBankCachedTransactions(toInsert);
      res.json(created);
    } catch (err) { next(err); }
  });

  app.post("/api/bank/accounts/:id/sync", requireAuth, async (req, res, next) => {
    try {
      const { getBankProvider } = await import("./bank-providers");
      const account = await storage.getBankAccount(parseInt(req.params.id));
      if (!account) return res.status(404).json({ message: "Bankkonto nicht gefunden" });
      const provider = getBankProvider(account.bankType);
      if (!provider) return res.status(400).json({ message: "Kein Provider für diesen Banktyp verfügbar" });
      const balance = await provider.getBalance(account.id, account.iban, (account.apiConfig || {}) as Record<string, string>);
      await storage.upsertBankCachedBalance({
        bankAccountId: account.id,
        balance: String(balance.balance),
        availableBalance: balance.availableBalance ? String(balance.availableBalance) : null,
        currency: balance.currency,
      });
      await storage.clearBankCachedTransactions(account.id);
      const transactions = await provider.getTransactions(account.id, account.iban, (account.apiConfig || {}) as Record<string, string>);
      const toInsert = transactions.map(tx => ({
        bankAccountId: account.id,
        externalId: tx.externalId,
        bookingDate: tx.bookingDate,
        valueDate: tx.valueDate,
        amount: String(tx.amount),
        currency: tx.currency,
        purpose: tx.purpose,
        counterpartName: tx.counterpartName,
        counterpartIban: tx.counterpartIban,
        counterpartBic: tx.counterpartBic,
        transactionType: tx.transactionType,
        creditorId: tx.creditorId || null,
        mandateReference: tx.mandateReference || null,
        endToEndReference: tx.endToEndReference || null,
      }));
      await storage.bulkCreateBankCachedTransactions(toInsert);
      res.json({ success: true, balanceSynced: true, transactionsSynced: toInsert.length });
    } catch (err) { next(err); }
  });

  app.get("/api/bank/dashboard", requireAuth, async (_req, res, next) => {
    try {
      const accounts = await storage.getBankAccounts();
      const activeAccounts = accounts.filter(a => a.active);
      const accountsWithBalances = await Promise.all(
        activeAccounts.map(async (account) => {
          const balance = await storage.getBankCachedBalance(account.id);
          return {
            ...redactBankAccount(account),
            cachedBalance: balance || null,
          };
        })
      );
      const totalBalance = accountsWithBalances.reduce((sum, a) => {
        return sum + (a.cachedBalance ? parseFloat(String(a.cachedBalance.balance)) : 0);
      }, 0);
      res.json({ accounts: accountsWithBalances, totalBalance });
    } catch (err) { next(err); }
  });

  // ========== LISTENDESIGNER ==========
  app.get("/api/list-templates", requireAuth, async (req, res, next) => {
    try { res.json(await storage.getListTemplates()); } catch (err) { next(err); }
  });
  app.post("/api/list-templates", requireAuth, async (req, res, next) => {
    try { res.status(201).json(await storage.createListTemplate(insertListTemplateSchema.parse(req.body))); } catch (err) { next(err); }
  });
  app.patch("/api/list-templates/:id", requireAuth, async (req, res, next) => {
    try { res.json(await storage.updateListTemplate(parseInt(req.params.id), insertListTemplateSchema.partial().parse(req.body))); } catch (err) { next(err); }
  });
  app.delete("/api/list-templates/:id", requireAuth, async (req, res, next) => {
    try { await storage.deleteListTemplate(parseInt(req.params.id)); res.json({ success: true }); } catch (err) { next(err); }
  });

  // ========== ÜBERWEISUNGEN (Payment Orders) ==========
  const requireFinanz = requireRole("chef", "admin", "manager", "buchhaltung");

  app.get("/api/payment-orders", requireAuth, requireFinanz, async (_req, res, next) => {
    try { res.json(await storage.getPaymentOrders()); } catch (err) { next(err); }
  });

  app.get("/api/payment-orders/:id", requireAuth, requireFinanz, async (req, res, next) => {
    try {
      const order = await storage.getPaymentOrder(parseInt(req.params.id));
      if (!order) return res.status(404).json({ message: "Überweisung nicht gefunden" });
      res.json(order);
    } catch (err) { next(err); }
  });

  app.post("/api/payment-orders", requireAuth, requireFinanz, async (req, res, next) => {
    try {
      const body = req.body;
      const ibanResult = validateIban(body.recipientIban || "");
      if (!ibanResult.valid) {
        return res.status(400).json({ message: ibanResult.error });
      }
      body.recipientIban = (body.recipientIban || "").replace(/\s/g, "").toUpperCase();
      const amount = parseFloat(body.amount);
      if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({ message: "Betrag muss größer als 0 sein" });
      }
      body.status = "entwurf";
      delete body.externalRef;
      delete body.errorMessage;
      delete body.approvedAt;
      delete body.submittedAt;
      delete body.executedAt;
      const parsed = insertBankPaymentOrderSchema.parse(body);
      res.status(201).json(await storage.createPaymentOrder(parsed));
    } catch (err) { next(err); }
  });

  app.patch("/api/payment-orders/:id", requireAuth, requireFinanz, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getPaymentOrder(id);
      if (!existing) return res.status(404).json({ message: "Überweisung nicht gefunden" });
      if (existing.status !== "entwurf") {
        return res.status(400).json({ message: "Nur Entwürfe können bearbeitet werden" });
      }
      if (req.body.recipientIban) {
        const ibanResult = validateIban(req.body.recipientIban);
        if (!ibanResult.valid) return res.status(400).json({ message: ibanResult.error });
        req.body.recipientIban = req.body.recipientIban.replace(/\s/g, "").toUpperCase();
      }
      delete req.body.status;
      delete req.body.externalRef;
      delete req.body.errorMessage;
      delete req.body.approvedAt;
      delete req.body.submittedAt;
      delete req.body.executedAt;
      const { status, externalRef, errorMessage, ...safeFields } = insertBankPaymentOrderSchema.partial().parse(req.body);
      res.json(await storage.updatePaymentOrder(id, safeFields));
    } catch (err) { next(err); }
  });

  app.post("/api/payment-orders/:id/approve", requireAuth, requireRole("chef", "admin", "manager"), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const order = await storage.getPaymentOrder(id);
      if (!order) return res.status(404).json({ message: "Überweisung nicht gefunden" });
      if (order.status !== "entwurf") {
        return res.status(400).json({ message: "Nur Entwürfe können freigegeben werden" });
      }
      await pool.query(`UPDATE bank_payment_orders SET status = 'freigegeben', approved_at = NOW() WHERE id = $1`, [id]);
      const result = await pool.query(`SELECT * FROM bank_payment_orders WHERE id = $1`, [id]);
      res.json(result.rows[0]);
    } catch (err) { next(err); }
  });

  app.post("/api/payment-orders/:id/submit", requireAuth, requireRole("chef", "admin", "manager"), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const order = await storage.getPaymentOrder(id);
      if (!order) return res.status(404).json({ message: "Überweisung nicht gefunden" });
      if (order.status !== "freigegeben") {
        return res.status(400).json({ message: "Nur freigegebene Überweisungen können übermittelt werden" });
      }
      const extRef = `SEPA-${Date.now()}-${id}`;
      await pool.query(`UPDATE bank_payment_orders SET status = 'uebermittelt', external_ref = $2, submitted_at = NOW() WHERE id = $1`, [id, extRef]);
      setTimeout(async () => {
        try {
          await pool.query(`UPDATE bank_payment_orders SET status = 'ausgefuehrt', executed_at = NOW() WHERE id = $1 AND status = 'uebermittelt'`, [id]);
        } catch (e) { console.error("Dummy payment execution error:", e); }
      }, 3000);
      const result = await pool.query(`SELECT * FROM bank_payment_orders WHERE id = $1`, [id]);
      res.json(result.rows[0]);
    } catch (err) { next(err); }
  });

  app.post("/api/payment-orders/:id/cancel", requireAuth, requireFinanz, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const order = await storage.getPaymentOrder(id);
      if (!order) return res.status(404).json({ message: "Überweisung nicht gefunden" });
      if (order.status === "ausgefuehrt") {
        return res.status(400).json({ message: "Ausgeführte Überweisungen können nicht storniert werden" });
      }
      await pool.query(`UPDATE bank_payment_orders SET status = 'fehlgeschlagen', error_message = 'Storniert durch Benutzer' WHERE id = $1`, [id]);
      const result = await pool.query(`SELECT * FROM bank_payment_orders WHERE id = $1`, [id]);
      res.json(result.rows[0]);
    } catch (err) { next(err); }
  });

  app.delete("/api/payment-orders/:id", requireAuth, requireFinanz, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const order = await storage.getPaymentOrder(id);
      if (!order) return res.status(404).json({ message: "Überweisung nicht gefunden" });
      if (order.status !== "entwurf" && order.status !== "fehlgeschlagen") {
        return res.status(400).json({ message: "Nur Entwürfe und fehlgeschlagene Überweisungen können gelöscht werden" });
      }
      await storage.deletePaymentOrder(id);
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  // ========== ZAHLUNGSABGLEICH (Payment Matching) ==========
  app.get("/api/payment-matches", requireAuth, requireFinanz, async (_req, res, next) => {
    try { res.json(await storage.getPaymentMatches()); } catch (err) { next(err); }
  });

  app.get("/api/unmatched-transactions", requireAuth, requireFinanz, async (_req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT f.re_id as "reId", f.rnr, f.adr_such as "adrSuch", f.betreff,
          f.belegdat, f.zahlung::float as zahlung, f.betrag::float as betrag,
          f.art, f.typ
        FROM fibu_buchungen f
        WHERE f.idx > 0 AND f.zahlung > 0
          AND f.re_id NOT IN (SELECT transaction_re_id FROM bank_payment_matches)
        ORDER BY f.belegdat DESC
        LIMIT 200
      `);
      res.json(result.rows);
    } catch (err) { next(err); }
  });

  app.get("/api/open-invoices-for-matching", requireAuth, requireFinanz, async (_req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT d.id, d.document_number as "documentNumber", d.type, d.subject,
          f.betrag::float as "grossTotal",
          COALESCE(f.zahlung::float, 0) as "paidAmount",
          ${FIBU_OPEN_AMOUNT_SQL}::float as "openAmount",
          c.name as "customerName"
        FROM fibu_buchungen f
        JOIN documents d ON d.id = f.document_id
        LEFT JOIN customers c ON d.customer_id = c.id
        WHERE f.art = 'RA'
          AND f.idx = 0
          AND f.stornoflag != 2
          AND f.bezahlflag != 2
          AND d.type IN ('rechnung', 'abschlagsrechnung')
          AND d.status != 'storniert'
          AND ${FIBU_OPEN_AMOUNT_SQL} > 0.01
        ORDER BY COALESCE(f.belegdat, d.date) DESC
        LIMIT 200
      `);
      res.json(result.rows);
    } catch (err) { next(err); }
  });

  app.post("/api/payment-matches/auto", requireAuth, requireFinanz, async (_req, res, next) => {
    try {
      const txResult = await pool.query(`
        SELECT f.re_id as "reId", f.rnr, f.betreff, f.zahlung::float as zahlung, f.adr_such as "adrSuch"
        FROM fibu_buchungen f
        WHERE f.idx > 0 AND f.zahlung > 0
          AND f.re_id NOT IN (SELECT transaction_re_id FROM bank_payment_matches)
        ORDER BY f.belegdat DESC
      `);

      const openResult = await pool.query(`
        SELECT d.id, d.document_number as "documentNumber",
          f.betrag::float as "grossTotal",
          COALESCE(f.zahlung::float, 0) as "paidAmount",
          ${FIBU_OPEN_AMOUNT_SQL}::float as "openAmount"
        FROM fibu_buchungen f
        JOIN documents d ON d.id = f.document_id
        WHERE f.art = 'RA'
          AND f.idx = 0
          AND f.stornoflag != 2
          AND f.bezahlflag != 2
          AND d.type IN ('rechnung', 'abschlagsrechnung')
          AND d.status != 'storniert'
          AND ${FIBU_OPEN_AMOUNT_SQL} > 0.01
      `);

      const invoiceMap = new Map<string, any>();
      for (const inv of openResult.rows) {
        invoiceMap.set(inv.documentNumber, inv);
      }

      let matched = 0;
      for (const tx of txResult.rows) {
        const betreff = (tx.betreff || tx.rnr || "").toUpperCase();
        for (const [docNum, inv] of invoiceMap) {
          const patterns = [
            docNum,
            docNum.replace(/-/g, ""),
            docNum.replace(/^0+/, ""),
          ];
          const found = patterns.some(p => betreff.includes(p.toUpperCase()));
          if (found && inv.openAmount > 0.01) {
            const matchAmount = Math.min(tx.zahlung, inv.openAmount);
            await storage.createPaymentMatch({
              transactionReId: tx.reId,
              documentId: inv.id,
              amount: matchAmount.toFixed(2),
              matchType: "auto",
            });
            const applied = await applyPaymentMatchToInvoice(inv.id, matchAmount);
            inv.paidAmount = applied.paidAmount;
            inv.openAmount = Math.max(0, applied.openAmount);
            matched++;
            break;
          }
        }
      }

      res.json({ matched, message: `${matched} Zuordnung(en) automatisch erstellt` });
    } catch (err) { next(err); }
  });

  app.post("/api/payment-matches/manual", requireAuth, requireFinanz, async (req, res, next) => {
    try {
      const { transactionReId, documentId, amount } = req.body;
      if (!transactionReId || !documentId || !amount) {
        return res.status(400).json({ message: "transactionReId, documentId und amount sind erforderlich" });
      }

      const existingMatch = await pool.query(`SELECT id FROM bank_payment_matches WHERE transaction_re_id = $1`, [transactionReId]);
      if (existingMatch.rows.length > 0) {
        return res.status(400).json({ message: "Diese Transaktion ist bereits zugeordnet" });
      }

      const txCheck = await pool.query(`SELECT re_id, zahlung::float as zahlung FROM fibu_buchungen WHERE re_id = $1 AND idx > 0`, [transactionReId]);
      if (txCheck.rows.length === 0) return res.status(404).json({ message: "Transaktion nicht gefunden" });

      const invoiceCheck = await pool.query(`
        SELECT d.id,
          f.betrag::float as "grossTotal",
          COALESCE(f.zahlung::float, 0) as "paidAmount",
          ${FIBU_OPEN_AMOUNT_SQL}::float as "openAmount"
        FROM fibu_buchungen f
        JOIN documents d ON d.id = f.document_id
        WHERE d.id = $1 AND f.art = 'RA' AND f.idx = 0 AND f.stornoflag != 2 AND f.bezahlflag != 2
      `, [documentId]);
      if (invoiceCheck.rows.length === 0) return res.status(404).json({ message: "Rechnung nicht gefunden" });

      const matchAmount = parseFloat(amount);
      if (isNaN(matchAmount) || matchAmount <= 0) return res.status(400).json({ message: "Ungültiger Betrag" });

      const doc = invoiceCheck.rows[0];
      const openAmount = doc.openAmount;
      if (matchAmount > openAmount + 0.01) {
        return res.status(400).json({ message: `Betrag übersteigt offenen Rechnungsbetrag (${openAmount.toFixed(2)} €)` });
      }

      const match = await storage.createPaymentMatch({
        transactionReId,
        documentId,
        amount: matchAmount.toFixed(2),
        matchType: "manual",
      });

      await applyPaymentMatchToInvoice(documentId, matchAmount);

      res.status(201).json(match);
    } catch (err) { next(err); }
  });

  app.delete("/api/payment-matches/:id", requireAuth, requireFinanz, async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      const matches = await storage.getPaymentMatches();
      const match = matches.find(m => m.id === id);
      if (!match) return res.status(404).json({ message: "Zuordnung nicht gefunden" });

      await applyPaymentMatchToInvoice(match.documentId, -parseFloat(String(match.amount)));

      await storage.deletePaymentMatch(id);
      res.json({ success: true });
    } catch (err) { next(err); }
  });

  app.post("/api/nas/sync-preview", requireAuth, async (req, res, next) => {
    try {
      const { runSyncPreview } = await import("./nas-sync");
      const progressMessages: any[] = [];
      const preview = await runSyncPreview((p) => { progressMessages.push(p); });
      res.json({ preview, progressMessages });
    } catch (err) { next(err); }
  });

  app.post("/api/nas/sync-execute", requireAuth, async (req, res, next) => {
    try {
      const { runSyncExecute } = await import("./nas-sync");
      const progressMessages: any[] = [];
      const result = await runSyncExecute((p) => { progressMessages.push(p); });
      res.json({ result, progressMessages });
    } catch (err) { next(err); }
  });

  return httpServer;
}
