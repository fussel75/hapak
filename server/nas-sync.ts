import https from "https";
import fs from "fs";
import path from "path";
import pg from "pg";
import iconv from "iconv-lite";

const NAS_HOST = process.env.HAPAK_NAS_HOST || "megathron1.synology.me";
const NAS_PORT = Number(process.env.HAPAK_NAS_PORT || "5001");
const NAS_USER = process.env.HAPAK_NAS_USER || "";
const NAS_PASS = process.env.HAPAK_NAS_PASS || "";
const NAS_SHARE = process.env.HAPAK_NAS_SHARE || "/HapakV22";
const FIRMA = process.env.HAPAK_NAS_COMPANY_PATH || "/FB ZuB";
const HAPAK_DIR = path.join(process.cwd(), "hapak_data");
const DETAILS_DIR = path.join(HAPAK_DIR, "details");

let SID = "";

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

interface DbfField { name: string; type: string; size: number; dec: number; offset: number; }
interface DbfMeta { fields: DbfField[]; headerSize: number; recordSize: number; count: number; hasMemo: boolean; memoFile?: Buffer; }

export interface SyncCategory {
  label: string;
  neu: number;
  geaendert: number;
  unveraendert: number;
  kalkNachsync: number;
  details: string[];
}

export interface SyncPreview {
  categories: Record<string, SyncCategory>;
  totalNeu: number;
  totalGeaendert: number;
  totalKalkNachsync: number;
  errors: string[];
  nasConnected: boolean;
}

export interface SyncProgress {
  step: string;
  progress: number;
  total: number;
  message: string;
}

type ProgressCallback = (p: SyncProgress) => void;

function nasReqRaw(p: string): Promise<any> {
  return new Promise((res, rej) => {
    const req = https.request({ hostname: NAS_HOST, port: NAS_PORT, path: p, method: "GET", rejectUnauthorized: false, timeout: 30000 }, resp => {
      let d = ""; resp.on("data", (c: string) => d += c); resp.on("end", () => { try { res(JSON.parse(d)); } catch { res(d); } });
    });
    req.on("error", rej); req.on("timeout", () => { req.destroy(); rej(new Error("timeout")); }); req.end();
  });
}

async function nasReq(p: string, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try { return await nasReqRaw(p); } catch (e: any) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

function nasDownloadRaw(filePath: string): Promise<Buffer> {
  const p = `/webapi/entry.cgi?api=SYNO.FileStation.Download&version=2&method=download&path=${encodeURIComponent(NAS_SHARE + FIRMA + filePath)}&mode=download&_sid=${SID}`;
  return new Promise((res, rej) => {
    const req = https.request({ hostname: NAS_HOST, port: NAS_PORT, path: p, method: "GET", rejectUnauthorized: false, timeout: 120000 }, resp => {
      const chunks: Buffer[] = []; resp.on("data", (c: Buffer) => chunks.push(c)); resp.on("end", () => res(Buffer.concat(chunks)));
    });
    req.on("error", rej); req.on("timeout", () => { req.destroy(); rej(new Error("timeout")); }); req.end();
  });
}

async function nasDownload(filePath: string, retries = 3): Promise<Buffer> {
  for (let i = 0; i < retries; i++) {
    try { return await nasDownloadRaw(filePath); } catch (e: any) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw new Error("unreachable");
}

async function nasLogin() {
  if (!NAS_USER || !NAS_PASS) throw new Error("NAS-Zugangsdaten fehlen: HAPAK_NAS_USER und HAPAK_NAS_PASS setzen");
  const auth = await nasReq(`/webapi/auth.cgi?api=SYNO.API.Auth&version=6&method=login&account=${encodeURIComponent(NAS_USER)}&passwd=${encodeURIComponent(NAS_PASS)}&session=FileStation&format=sid`);
  if (!auth?.success) throw new Error("NAS-Login fehlgeschlagen");
  SID = auth.data.sid;
}

async function nasLogout() {
  try { await nasReq(`/webapi/auth.cgi?api=SYNO.API.Auth&version=6&method=logout&session=FileStation&_sid=${SID}`); } catch {}
}

function parseDbfMeta(buf: Buffer): DbfMeta {
  const version = buf[0];
  const hasMemo = (version & 0x80) !== 0 || version === 0x83 || version === 0x8B || version === 0xF5;
  const count = buf.readUInt32LE(4);
  const headerSize = buf.readUInt16LE(8);
  const recordSize = buf.readUInt16LE(10);
  const fields: DbfField[] = [];
  let offset = 32;
  let fieldDataOffset = 1;
  while (buf[offset] !== 0x0D && offset < headerSize) {
    const name = buf.slice(offset, offset + 11).toString("ascii").replace(/\0/g, "");
    const type = String.fromCharCode(buf[offset + 11]);
    const size = buf[offset + 16];
    const dec = buf[offset + 17];
    fields.push({ name, type, size, dec, offset: fieldDataOffset });
    fieldDataOffset += size;
    offset += 32;
  }
  return { fields, headerSize, recordSize, count, hasMemo };
}

function readMemoField(memoFile: Buffer, blockNr: number): string {
  if (!memoFile || !blockNr || isNaN(blockNr) || blockNr <= 0) return "";
  try {
    let blockSize = 512;
    if (memoFile.length >= 8) { const bs = memoFile.readUInt16BE(6); if (bs > 0 && bs < 65536) blockSize = bs; }
    const start = blockNr * blockSize;
    if (start >= memoFile.length || start < 0) return "";
    const sigBytes = memoFile.readUInt32BE(start);
    if (sigBytes === 1) {
      const len = memoFile.readUInt32BE(start + 4);
      const end = Math.min(start + 8 + len, memoFile.length);
      return iconv.decode(memoFile.slice(start + 8, end), "cp1252").replace(/\0/g, "").trim();
    }
    let end = start;
    while (end < memoFile.length && memoFile[end] !== 0x1A) end++;
    return iconv.decode(memoFile.slice(start, end), "cp1252").trim();
  } catch { return ""; }
}

function parseDbfRecords(buf: Buffer, meta: DbfMeta): Record<string, any>[] {
  const records: Record<string, any>[] = [];
  for (let i = 0; i < meta.count; i++) {
    const recStart = meta.headerSize + i * meta.recordSize;
    if (recStart >= buf.length) break;
    if (buf[recStart] === 0x2A) continue;
    const rec: Record<string, any> = {};
    for (const f of meta.fields) {
      const fStart = recStart + f.offset;
      const fEnd = fStart + f.size;
      if (fEnd > buf.length) break;
      const raw = buf.slice(fStart, fEnd);
      if (f.type === "M") {
        const blockStr = raw.toString("ascii").trim();
        const blockNr = parseInt(blockStr, 10);
        rec[f.name] = meta.memoFile ? readMemoField(meta.memoFile, blockNr) : "";
      } else if (f.type === "N") {
        const s = raw.toString("ascii").trim();
        rec[f.name] = s === "" ? 0 : parseFloat(s) || 0;
      } else if (f.type === "L") {
        const c = String.fromCharCode(raw[0]).toUpperCase();
        rec[f.name] = c === "T" || c === "Y" || c === "J";
      } else if (f.type === "D") {
        const s = raw.toString("ascii").trim();
        rec[f.name] = s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
      } else {
        rec[f.name] = iconv.decode(raw, "cp1252").replace(/\0/g, "").replace(/Ç/g, "€").trim();
      }
    }
    records.push(rec);
  }
  return records;
}

async function downloadAndParse(nasPath: string, memoExt?: string): Promise<Record<string, any>[]> {
  const buf = await nasDownload(nasPath);
  if (buf.length < 32) return [];
  const check = buf.toString("utf-8", 0, 50);
  if (check.includes('"error"') || check.includes('"success":false')) return [];
  if (!fs.existsSync(HAPAK_DIR)) fs.mkdirSync(HAPAK_DIR, { recursive: true });
  const localPath = path.join(HAPAK_DIR, path.basename(nasPath));
  fs.writeFileSync(localPath, buf);
  const meta = parseDbfMeta(buf);
  if (meta.hasMemo && memoExt) {
    const memoPath = nasPath.replace(/\.DBF$/i, memoExt);
    try {
      const memoBuf = await nasDownload(memoPath);
      if (memoBuf.length > 32 && !memoBuf.toString("utf-8", 0, 50).includes('"error"')) {
        meta.memoFile = memoBuf;
        fs.writeFileSync(localPath.replace(/\.DBF$/i, memoExt), memoBuf);
      }
    } catch { }
  }
  return parseDbfRecords(buf, meta);
}

function d(v: any): string | null {
  if (!v || v === "0000-00-00" || v === "    -  -  ") return null;
  return typeof v === "string" ? v.slice(0, 10) : null;
}
function n(v: any): number { return typeof v === "number" ? v : parseFloat(v) || 0; }
function s(v: any): string { return (v || "").toString().trim(); }

function mapDocType(typundnr: string, id: string): string {
  const t = typundnr.toLowerCase();
  if (t.startsWith("ordner")) return "ordner_skip";
  if (t.startsWith("angebot")) return "angebot";
  if (t.startsWith("auftrags") || t.startsWith("auftragsbestätigung") || t.startsWith("auftragsbe")) return "auftragsbestaetigung";
  if (t.startsWith("abschlag")) return "abschlagsrechnung";
  if (t.startsWith("schluss")) return "schlussrechnung";
  if (t.startsWith("gutschrift")) return "gutschrift";
  if (t.startsWith("rechnung") && t.includes("abschlagsrechnung")) return "abschlagsrechnung";
  if (t.startsWith("rechnung")) return "rechnung";
  if (t.startsWith("lieferschein")) return "lieferschein";
  if (t.startsWith("nachkalkulation")) return "nachkalkulation";
  if (t.startsWith("mitschnitt")) return "mitschnitt";
  if (id === "5") return "eingangsrechnung";
  return "freies_dokument";
}

const defaultTypeLabels: Record<string, string> = {
  angebot: "Angebot",
  auftragsbestaetigung: "Auftragsbestätigung",
  rechnung: "Rechnung",
  abschlagsrechnung: "Abschlagsrechnung",
  schlussrechnung: "Schlussrechnung",
  gutschrift: "Gutschrift",
  lieferschein: "Lieferschein",
  nachkalkulation: "Nachkalkulation",
  mitschnitt: "Mitschnitt",
  freies_dokument: "Freies Dokument",
};

function extractCustomTypeLabel(typUndNr: string, docType: string): string | null {
  if (!typUndNr) return null;
  const defaultLabel = defaultTypeLabels[docType];
  if (!defaultLabel) return typUndNr;
  const numMatch = typUndNr.match(/\d{2}-\d{5}/);
  const numSuffix = numMatch ? numMatch[0] : "";
  const baseWithNum = numSuffix ? `${defaultLabel} ${numSuffix}` : defaultLabel;
  if (typUndNr === baseWithNum || typUndNr === defaultLabel) return null;
  const abschlagMatch = typUndNr.match(/^Rechnung\s+\d{2}-\d{5}\s*\(\d+\.\s*Abschlag/);
  if (abschlagMatch && docType === "abschlagsrechnung") return null;
  return typUndNr;
}

function mapDocStatus(status: number, id: string, docType?: string): string {
  if (id === "5") return status === 4 ? "bezahlt" : "offen";
  const isInvoice = docType && ["rechnung", "abschlagsrechnung", "schlussrechnung"].includes(docType);
  switch (status) {
    case 0: return "entwurf";
    case 1: return "gesendet";
    case 2: return "beauftragt";
    case 3: return "gesendet";
    case 4: return "archiviert";
    case 5: return isInvoice ? "bezahlt" : "storniert";
    default: return "entwurf";
  }
}

function readFptMemo(fptBuf: Buffer | null, blockNumStr: string): Buffer | null {
  if (!fptBuf) return null;
  const bn = parseInt(blockNumStr);
  if (!bn || isNaN(bn)) return null;
  const blockSize = fptBuf.readUInt16BE(6) || 64;
  const memoOffset = bn * blockSize;
  if (memoOffset + 8 >= fptBuf.length) return null;
  const memoLen = fptBuf.readUInt32BE(memoOffset + 4);
  if (memoLen <= 0 || memoLen > 100000) return null;
  return fptBuf.slice(memoOffset + 8, memoOffset + 8 + Math.min(memoLen, 50000));
}

function extractTextFromBlob(rawBuf: Buffer | null): string {
  if (!rawBuf || rawBuf.length === 0) return "";
  const str = iconv.decode(rawBuf, "cp1252");
  if (!str.startsWith("@R_BLOB@")) return str.replace(/\0/g, "").replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, "").trim();
  let textStart = -1;
  let consecutivePrintable = 0;
  for (let i = 8; i < rawBuf.length; i++) {
    const b = rawBuf[i];
    const isPrintable = (b >= 32 && b <= 126) || (b >= 0x80 && b <= 0xFF) || b === 0x0D || b === 0x0A;
    if (isPrintable) {
      consecutivePrintable++;
      if (consecutivePrintable >= 4 && textStart === -1) textStart = i - consecutivePrintable + 1;
    } else {
      if (textStart !== -1 && consecutivePrintable >= 4) {
        if (b === 0x9C || b === 0x00) {
          let text = iconv.decode(rawBuf.slice(textStart, i), "cp1252").replace(/\0/g, "").trim();
          return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        }
      }
      consecutivePrintable = 0;
    }
  }
  if (textStart !== -1) {
    return iconv.decode(rawBuf.slice(textStart), "cp1252").replace(/\0/g, "").trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }
  return "";
}

function stripFontMetadata(str: string): string {
  return str.replace(/[^\w\s.,;:!?()\-/€%²³°&@#+*~']{1,10}"Swis721[^"]*$/gm, "")
            .replace(/^"Swis721[^"]*$/gm, "")
            .trim();
}

function cleanText(str: string): string {
  if (!str) return "";
  return stripFontMetadata(str.replace(/\x00/g, "").replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, "").trim());
}

function readDbfRecord(buf: Buffer, idx: number, meta: { fields: { name: string; type: string; size: number; dec: number }[]; headerSize: number; recordSize: number; count: number }): Record<string, string> {
  const recOffset = meta.headerSize + idx * meta.recordSize;
  if (buf[recOffset] === 0x2A) return { _DELETED: "true" };
  const row: Record<string, string> = {};
  let fieldOffset = 1;
  for (const f of meta.fields) {
    const raw = buf.slice(recOffset + fieldOffset, recOffset + fieldOffset + f.size);
    if (f.type === "N" || f.type === "D" || f.type === "L") {
      row[f.name] = raw.toString("ascii").trim();
    } else if (f.type === "M") {
      row[f.name] = raw.toString("ascii").trim();
    } else {
      row[f.name] = iconv.decode(raw, "cp1252").replace(/\0/g, "").replace(/Ç/g, "€").trim();
    }
    fieldOffset += f.size;
  }
  return row;
}

function parseDbfFields(buf: Buffer) {
  const count = buf.readUInt32LE(4);
  const headerSize = buf.readUInt16LE(8);
  const recordSize = buf.readUInt16LE(10);
  const fields: { name: string; type: string; size: number; dec: number }[] = [];
  let offset = 32;
  while (buf[offset] !== 0x0D && offset < headerSize) {
    const name = buf.slice(offset, offset + 11).toString("ascii").replace(/\0/g, "");
    const type = String.fromCharCode(buf[offset + 11]);
    const size = buf[offset + 16];
    const dec = buf[offset + 17];
    fields.push({ name, type, size, dec });
    offset += 32;
  }
  return { fields, headerSize, recordSize, count };
}

function splitFullText(ft: string, fallback: string): { t: string; d: string | null } {
  if (!ft) return { t: fallback, d: null };
  const lines = ft.split("\n");
  const t = lines[0].trim() || fallback;
  const d = lines.length > 1 ? lines.slice(1).join("\n").trim() || null : null;
  return { t, d };
}

async function analyzeCustomers(pool: pg.Pool, nasRecords: Record<string, any>[]): Promise<SyncCategory> {
  const cat: SyncCategory = { label: "Kunden / Adressen", neu: 0, geaendert: 0, unveraendert: 0, kalkNachsync: 0, details: [] };
  const { rows: existing } = await pool.query("SELECT customer_number, name, name2, street, zip, city, phone, fax, email, website, iban, bic, bank, tax_id, discount, skonto_percent, skonto_days, payment_term_days, branche, account_holder, gross_invoicing, no_reminder, salutation FROM customers");
  const existingMap = new Map(existing.map(r => [r.customer_number, r]));

  for (const r of nasRecords) {
    const kundnr = s(r.KU_NR);
    if (!kundnr) continue;
    const name1 = s(r.NAME);
    const name2 = s(r.NAME2);
    if (!name1 && !name2) continue;
    const fullName = [s(r.FA_TITEL), name1].filter(Boolean).join(" ");

    const ex = existingMap.get(kundnr);
    if (!ex) {
      cat.neu++;
      if (cat.neu <= 10) cat.details.push(`Neu: ${kundnr} — ${fullName}`);
    } else {
      const changed = ex.name !== fullName
        || ex.name2 !== (name2 || null)
        || (s(r.STRASSE) && ex.street !== s(r.STRASSE))
        || (s(r.PLZ) && ex.zip !== s(r.PLZ))
        || (s(r.ORT) && ex.city !== s(r.ORT))
        || (s(r.TEL) && ex.phone !== s(r.TEL))
        || (s(r.EMAIL) && ex.email !== s(r.EMAIL))
        || (s(r.IBAN) && ex.iban !== s(r.IBAN));
      if (changed) {
        cat.geaendert++;
        if (cat.geaendert <= 10) cat.details.push(`Geändert: ${kundnr} — ${fullName}`);
      } else {
        cat.unveraendert++;
      }
    }
  }
  return cat;
}

async function analyzeDocuments(pool: pg.Pool, nasRecords: Record<string, any>[]): Promise<SyncCategory> {
  const cat: SyncCategory = { label: "Dokumente", neu: 0, geaendert: 0, unveraendert: 0, kalkNachsync: 0, details: [] };
  const { rows: existing } = await pool.query("SELECT document_number, net_total, gross_total, tax_rate, status, type FROM documents");
  const existingMap = new Map(existing.map(r => [r.document_number, r]));

  for (const r of nasRecords) {
    const docName = s(r.NAME);
    if (!docName) continue;
    const docType = mapDocType(s(r.TYPUNDNR), s(r.ID));
    if (docType === "eingangsrechnung" || docType === "ordner_skip") continue;

    const netto = n(r.NETTO);
    const brutto = n(r.BETRAG);
    const mwstSatz = n(r.MWSTSATZ) || 19;
    const status = mapDocStatus(n(r.STATUS), s(r.ID), docType);

    const ex = existingMap.get(docName);
    if (!ex) {
      cat.neu++;
      if (cat.neu <= 10) cat.details.push(`Neu: ${docName} (${docType}) — Netto ${netto.toFixed(2)}€`);
    } else {
      const netDiff = Math.abs(parseFloat(ex.net_total || "0") - netto) > 0.01;
      const bruttoDiff = Math.abs(parseFloat(ex.gross_total || "0") - brutto) > 0.01;
      const statusDiff = ex.status !== status;
      const taxDiff = Math.abs(parseFloat(ex.tax_rate || "19") - mwstSatz) > 0.01;
      if (netDiff || bruttoDiff || statusDiff || taxDiff) {
        cat.geaendert++;
        if (cat.geaendert <= 10) {
          const changes: string[] = [];
          if (netDiff) changes.push(`Netto: ${ex.net_total}→${netto.toFixed(2)}`);
          if (statusDiff) changes.push(`Status: ${ex.status}→${status}`);
          cat.details.push(`Geändert: ${docName} — ${changes.join(", ")}`);
        }
      } else {
        cat.unveraendert++;
      }
    }
  }
  return cat;
}

async function analyzePositions(pool: pg.Pool, nasFileSet: Set<string>): Promise<SyncCategory> {
  const cat: SyncCategory = { label: "Positionen & Kalkulation", neu: 0, geaendert: 0, unveraendert: 0, kalkNachsync: 0, details: [] };

  const { rows: allDocs } = await pool.query(`
    SELECT d.id, d.document_number FROM documents d
    WHERE d.type NOT IN ('eingangsrechnung', 'nachkalkulation')
    ORDER BY d.document_number
  `);

  const { rows: docsWithItems } = await pool.query("SELECT DISTINCT document_id FROM document_items");
  const docIdsWithItems = new Set(docsWithItems.map(r => r.document_id));

  const { rows: docsWithKalk } = await pool.query(`
    SELECT DISTINCT document_id FROM document_items 
    WHERE (labor_cost IS NOT NULL AND labor_cost::numeric != 0) 
       OR (material_price IS NOT NULL AND material_price::numeric != 0)
       OR (labor_markup IS NOT NULL)
  `);
  const docIdsWithKalk = new Set(docsWithKalk.map(r => r.document_id));

  for (const doc of allDocs) {
    const hasOnNas = nasFileSet.has(doc.document_number);
    const hasItems = docIdsWithItems.has(doc.id);
    const hasKalk = docIdsWithKalk.has(doc.id);

    if (!hasOnNas) continue;

    if (!hasItems) {
      cat.neu++;
      if (cat.neu <= 10) cat.details.push(`Positionen fehlen: ${doc.document_number}`);
    } else if (!hasKalk) {
      cat.kalkNachsync++;
      if (cat.kalkNachsync <= 10) cat.details.push(`Kalkulation fehlt: ${doc.document_number}`);
    } else {
      cat.geaendert++;
    }
  }
  cat.unveraendert = allDocs.length - cat.neu - cat.kalkNachsync - cat.geaendert;
  if (cat.unveraendert < 0) cat.unveraendert = 0;
  return cat;
}

async function analyzeFibu(pool: pg.Pool, nasRecords: Record<string, any>[]): Promise<SyncCategory> {
  const cat: SyncCategory = { label: "FiBu-Buchungen (Rechnungsbuch)", neu: 0, geaendert: 0, unveraendert: 0, kalkNachsync: 0, details: [] };
  const { rows } = await pool.query("SELECT COUNT(*) as cnt FROM fibu_buchungen");
  const existingCount = parseInt(rows[0].cnt);

  if (nasRecords.length > existingCount) {
    cat.neu = nasRecords.length - existingCount;
    cat.geaendert = existingCount;
    cat.details.push(`HAPAK: ${nasRecords.length} Buchungen, DB: ${existingCount} → Komplett-Sync (${cat.neu} neu)`);
  } else if (nasRecords.length === existingCount) {
    cat.unveraendert = existingCount;
    cat.details.push(`Gleiche Anzahl: ${existingCount} Buchungen`);
  } else {
    cat.geaendert = nasRecords.length;
    cat.details.push(`HAPAK: ${nasRecords.length}, DB: ${existingCount} → Komplett-Sync`);
  }
  return cat;
}

async function analyzeFibuAdd(pool: pg.Pool, nasRecords: Record<string, any>[]): Promise<SyncCategory> {
  const cat: SyncCategory = { label: "FiBu-Zusatzdaten (Skonto etc.)", neu: 0, geaendert: 0, unveraendert: 0, kalkNachsync: 0, details: [] };
  const { rows } = await pool.query("SELECT COUNT(*) as cnt FROM fibu_add");
  const existingCount = parseInt(rows[0].cnt);

  if (nasRecords.length > existingCount) {
    cat.neu = nasRecords.length - existingCount;
    cat.geaendert = existingCount;
    cat.details.push(`HAPAK: ${nasRecords.length}, DB: ${existingCount} → ${cat.neu} neue Einträge`);
  } else {
    cat.unveraendert = existingCount;
  }
  return cat;
}

async function analyzeProjects(pool: pg.Pool, nasDocRecords: Record<string, any>[]): Promise<SyncCategory> {
  const cat: SyncCategory = { label: "Projekte & Dokumentenbaum", neu: 0, geaendert: 0, unveraendert: 0, kalkNachsync: 0, details: [] };

  const projNames = new Set<string>();
  for (const r of nasDocRecords) {
    const pn = s(r.PROJNAME);
    if (pn) projNames.add(pn);
  }

  const { rows: existing } = await pool.query("SELECT project_number FROM projects");
  const existingSet = new Set(existing.map(r => r.project_number));

  for (const pn of projNames) {
    if (existingSet.has(pn)) {
      cat.unveraendert++;
    } else {
      cat.neu++;
      if (cat.neu <= 10) cat.details.push(`Neues Projekt: ${pn}`);
    }
  }

  const { rows: docTreeCount } = await pool.query("SELECT COUNT(*) as cnt FROM project_document_tree");
  const treeCount = parseInt(docTreeCount[0].cnt);
  const { rows: docsWithProject } = await pool.query("SELECT COUNT(*) as cnt FROM documents WHERE project_id IS NOT NULL");
  const docsWithProjCount = parseInt(docsWithProject[0].cnt);

  if (docsWithProjCount > treeCount) {
    cat.geaendert = docsWithProjCount - treeCount;
    cat.details.push(`Dokumentenbaum: ${treeCount} Einträge, ${docsWithProjCount} Dokumente mit Projekt → ${cat.geaendert} fehlen im Baum`);
  }

  return cat;
}

async function analyzeAbschlag(pool: pg.Pool, nasDocRecords: Record<string, any>[]): Promise<SyncCategory> {
  const cat: SyncCategory = { label: "Abschlagsrechnungen & Verrechnung", neu: 0, geaendert: 0, unveraendert: 0, kalkNachsync: 0, details: [] };

  const abschlagDocs = nasDocRecords.filter(r => {
    const t = mapDocType(s(r.TYPUNDNR), s(r.ID));
    return t === "abschlagsrechnung" || t === "schlussrechnung";
  });

  const { rows: existing } = await pool.query(`
    SELECT document_number, type, previously_invoiced, net_total, gross_total, abschlag_verrechnungen
    FROM documents WHERE type IN ('abschlagsrechnung', 'schlussrechnung')
  `);
  const existingMap = new Map(existing.map(r => [r.document_number, r]));

  for (const r of abschlagDocs) {
    const docName = s(r.NAME);
    const absnetto = n(r.ABSNETTO);
    const absbrutto = n(r.ABSBRUTTO);
    const netto = n(r.NETTO);

    const ex = existingMap.get(docName);
    if (!ex) {
      cat.neu++;
      if (cat.neu <= 5) cat.details.push(`Neue Abschlagsrechnung: ${docName}`);
    } else {
      const prevDiff = Math.abs(parseFloat(ex.previously_invoiced || "0") - absnetto) > 0.01;
      const netDiff = Math.abs(parseFloat(ex.net_total || "0") - netto) > 0.01;
      if (prevDiff || netDiff) {
        cat.geaendert++;
        if (cat.geaendert <= 5) cat.details.push(`Verrechnung geändert: ${docName} (vorab: ${absnetto.toFixed(2)}€)`);
      } else {
        cat.unveraendert++;
      }
    }
  }
  return cat;
}

export async function runSyncPreview(onProgress?: ProgressCallback): Promise<SyncPreview> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const preview: SyncPreview = {
    categories: {},
    totalNeu: 0,
    totalGeaendert: 0,
    totalKalkNachsync: 0,
    errors: [],
    nasConnected: false,
  };

  try {
    onProgress?.({ step: "connect", progress: 0, total: 8, message: "Verbinde mit NAS..." });
    await nasLogin();
    preview.nasConnected = true;

    onProgress?.({ step: "customers", progress: 1, total: 8, message: "Lade Kunden von NAS..." });
    const customerRecords = await downloadAndParse("/Adressen/ADRESSEN.DBF", ".FPT");
    preview.categories.customers = await analyzeCustomers(pool, customerRecords);

    onProgress?.({ step: "documents", progress: 2, total: 8, message: "Lade Dokumente von NAS..." });
    const docRecords = await downloadAndParse("/Daten/DOKUMENT.DBF", ".FPT");
    preview.categories.documents = await analyzeDocuments(pool, docRecords);

    onProgress?.({ step: "projects", progress: 3, total: 8, message: "Analysiere Projekte..." });
    preview.categories.projects = await analyzeProjects(pool, docRecords);

    onProgress?.({ step: "abschlag", progress: 4, total: 8, message: "Prüfe Abschlagsrechnungen..." });
    preview.categories.abschlag = await analyzeAbschlag(pool, docRecords);

    onProgress?.({ step: "positions", progress: 5, total: 8, message: "Prüfe Positionen & Kalkulationen..." });
    const nasListRes = await nasReq(`/webapi/entry.cgi?api=SYNO.FileStation.List&version=2&method=list&folder_path=${encodeURIComponent(NAS_SHARE + FIRMA + "/Daten")}&additional=%5B%22size%22%5D&sort_by=name&limit=20000&_sid=${SID}`);
    const nasFileSet = new Set<string>();
    if (nasListRes?.data?.files) {
      for (const f of nasListRes.data.files) {
        if (f.name.endsWith(".DBF")) nasFileSet.add(f.name.replace(/\.DBF$/i, ""));
      }
    }
    preview.categories.positions = await analyzePositions(pool, nasFileSet);

    onProgress?.({ step: "fibu", progress: 6, total: 8, message: "Lade FiBu-Buchungen..." });
    const fibuRecords = await downloadAndParse("/Fibu/FIBUZWO.DBF", ".FPT");
    preview.categories.fibu = await analyzeFibu(pool, fibuRecords);

    onProgress?.({ step: "fibuadd", progress: 7, total: 8, message: "Lade FiBu-Zusatzdaten..." });
    const fibuAddRecords = await downloadAndParse("/Fibu/FIBUADD.DBF");
    preview.categories.fibuAdd = await analyzeFibuAdd(pool, fibuAddRecords);

    onProgress?.({ step: "done", progress: 8, total: 8, message: "Analyse abgeschlossen" });

    for (const cat of Object.values(preview.categories)) {
      preview.totalNeu += cat.neu;
      preview.totalGeaendert += cat.geaendert;
      preview.totalKalkNachsync += cat.kalkNachsync;
    }

    await nasLogout();
  } catch (e: any) {
    preview.errors.push(e.message || "Unbekannter Fehler");
    try { await nasLogout(); } catch {}
  } finally {
    await pool.end();
  }
  return preview;
}

export async function runSyncExecute(onProgress?: ProgressCallback): Promise<{ success: boolean; results: Record<string, string>; errors: string[] }> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const results: Record<string, string> = {};
  const errors: string[] = [];

  try {
    onProgress?.({ step: "connect", progress: 0, total: 13, message: "Verbinde mit NAS..." });
    await nasLogin();

    onProgress?.({ step: "customers", progress: 1, total: 13, message: "Synchronisiere Kunden..." });
    results.customers = await execSyncCustomers(pool);

    onProgress?.({ step: "documents", progress: 2, total: 13, message: "Synchronisiere Dokumente..." });
    results.documents = await execSyncDocuments(pool);

    onProgress?.({ step: "projects", progress: 3, total: 13, message: "Aktualisiere Projekt-Zuordnungen..." });
    results.projects = await execSyncProjectLinks(pool);

    onProgress?.({ step: "fibu", progress: 4, total: 13, message: "Synchronisiere FiBu-Buchungen..." });
    results.fibu = await execSyncFibu(pool);

    onProgress?.({ step: "fibuadd", progress: 5, total: 13, message: "Synchronisiere FiBu-Zusatzdaten..." });
    results.fibuAdd = await execSyncFibuAdd(pool);

    onProgress?.({ step: "fiburef", progress: 6, total: 13, message: "Synchronisiere FiBu-Referenzdaten..." });
    results.fibuRef = await execSyncFibuRef(pool);

    onProgress?.({ step: "personal", progress: 7, total: 13, message: "Synchronisiere Personal..." });
    results.personal = await execSyncPersonal(pool);

    onProgress?.({ step: "positions", progress: 8, total: 13, message: "Synchronisiere Positionen (kann dauern)..." });
    results.positions = await execSyncPositions(pool, onProgress);

    onProgress?.({ step: "abschlagverr", progress: 9, total: 13, message: "Berechne Abschlag-Verrechnungen (Delta)..." });
    results.abschlagVerrechnungen = await execSyncAbschlagVerrechnungen(pool);

    onProgress?.({ step: "payments", progress: 10, total: 13, message: "Aktualisiere Zahlungsstatus..." });
    results.payments = await execSyncPayments(pool);

    onProgress?.({ step: "docbezug", progress: 11, total: 13, message: "Verknüpfe FiBu mit Dokumenten..." });
    results.docBezug = await execSyncFibuDocLinks(pool);

    onProgress?.({ step: "done", progress: 13, total: 13, message: "Synchronisation abgeschlossen!" });

    await nasLogout();
  } catch (e: any) {
    errors.push(e.message || "Unbekannter Fehler");
    try { await nasLogout(); } catch {}
  } finally {
    await pool.end();
  }

  return { success: errors.length === 0, results, errors };
}

async function execSyncCustomers(pool: pg.Pool): Promise<string> {
  const records = await downloadAndParse("/Adressen/ADRESSEN.DBF", ".FPT");
  const { rows: existing } = await pool.query("SELECT id, customer_number FROM customers");
  const existingMap = new Map(existing.map(r => [r.customer_number, r.id]));

  let inserted = 0, updated = 0;
  for (const r of records) {
    const kundnr = s(r.KU_NR);
    if (!kundnr) continue;
    const name1 = s(r.NAME);
    const name2 = s(r.NAME2);
    if (!name1 && !name2) continue;
    const fullName = [s(r.FA_TITEL), name1].filter(Boolean).join(" ");
    const herrfrau = s(r.HERRFRAU) || null;
    const isInaktiv = r.INAKTIV === true;

    const fields = {
      name: fullName,
      name2: name2 || null,
      search_key: s(r.SUCH) || kundnr,
      salutation: herrfrau,
      street: s(r.STRASSE) || null,
      zip: s(r.PLZ) || null,
      city: s(r.ORT) || null,
      country: s(r.LAND) || null,
      phone: s(r.TEL) || null,
      fax: s(r.FAX) || null,
      mobile: s(r.FUNK_PRIV) || null,
      email: s(r.EMAIL) || null,
      website: s(r.WWW) || null,
      iban: s(r.IBAN) || null,
      bic: s(r.SWIFT) || null,
      bank: s(r.BANK) || null,
      account_holder: s(r.KONTOINH) || null,
      tax_id: s(r.USTIDNR) || null,
      discount: r.RABATT > 0 ? String(r.RABATT) : "0.00",
      skonto_percent: r.SKONTO > 0 ? String(r.SKONTO) : "0",
      skonto_days: r.SKONTOTAGE > 0 ? r.SKONTOTAGE : 0,
      payment_term_days: r.ZAHLZIEL > 0 ? r.ZAHLZIEL : 14,
      branche: s(r.BRANCHE) || null,
      contact_type: mapContactTypeFromId(s(r.ID), s(r.ART)),
      gross_invoicing: r.BRUTTOFAKT === true,
      no_reminder: r.DONTMAHN === true,
      revenue_account: s(r.FIBUNR) || null,
      our_customer_number: s(r.EIGENKDNR) || null,
    };

    if (existingMap.has(kundnr)) {
      const setClauses = Object.keys(fields).map((k, i) => `${k}=$${i + 1}`).join(", ");
      const values = Object.values(fields);
      values.push(kundnr);
      await pool.query(
        `UPDATE customers SET ${setClauses} WHERE customer_number=$${values.length}`,
        values
      );
      updated++;
    } else {
      try {
        const cols = ["customer_number", ...Object.keys(fields)];
        const vals = [kundnr, ...Object.values(fields)];
        const placeholders = vals.map((_, i) => `$${i + 1}`).join(",");
        await pool.query(
          `INSERT INTO customers (${cols.join(",")}) VALUES (${placeholders})`,
          vals
        );
        inserted++;
      } catch {}
    }
  }
  return `${inserted} neu, ${updated} aktualisiert`;
}

function mapContactTypeFromId(id: string, art: string): string {
  const idUpper = (id || "").trim().toUpperCase();
  if (idUpper === "L") return "lieferant";
  if (idUpper === "I") return "interessent";
  if (idUpper === "P") return "personal";
  if (idUpper === "K") return "kunde";
  if (art) {
    const a = art.toLowerCase().trim();
    if (a.includes("liefer")) return "lieferant";
    if (a.includes("inter")) return "interessent";
    if (a.includes("person")) return "personal";
    if (a.includes("sonst")) return "sonstige";
  }
  return "kunde";
}

async function execSyncDocuments(pool: pg.Pool): Promise<string> {
  const records = await downloadAndParse("/Daten/DOKUMENT.DBF", ".FPT");
  const { rows: existing } = await pool.query("SELECT id, document_number FROM documents");
  const existingMap = new Map(existing.map(r => [r.document_number, r.id]));
  const { rows: customerRows } = await pool.query("SELECT id, customer_number FROM customers");
  const customerMap = new Map(customerRows.map(r => [r.customer_number, r.id]));

  const { rows: ftRows } = await pool.query("SELECT id FROM form_templates WHERE name = 'FB ZuB 1k DBFI' LIMIT 1");
  const formTemplateId = ftRows.length > 0 ? ftRows[0].id : null;

  const bezugMap = new Map<string, string>();
  for (const r of records) {
    const nm = s(r.NAME);
    const bz = s(r.BEZUGNAME);
    if (nm && bz) bezugMap.set(nm, bz);
  }

  let inserted = 0, updated = 0;
  for (const r of records) {
    const docName = s(r.NAME);
    if (!docName) continue;
    const docType = mapDocType(s(r.TYPUNDNR), s(r.ID));
    if (docType === "eingangsrechnung" || docType === "ordner_skip") continue;

    const customerId = customerMap.get(s(r.KUNDE)) || 0;
    const status = mapDocStatus(n(r.STATUS), s(r.ID), docType);
    const datum = d(r.DATUM) || new Date().toISOString().slice(0, 10);
    const netto = n(r.NETTO);
    const mwstSatz = n(r.MWSTSATZ) || 19;
    const brutto = n(r.BETRAG);
    const mwst = n(r.MWST) || (brutto - netto);
    const absnetto = n(r.ABSNETTO);
    const projName = s(r.PROJNAME);
    const typUndNr = s(r.TYPUNDNR);
    const customTypeLabel = extractCustomTypeLabel(typUndNr, docType);
    const erloeskonto = s(r.KONTO) || null;
    const erstelldat = d(r.ERSTELLDAT) || null;

    let projectId: number | null = null;
    if (projName) {
      const { rows: pRows } = await pool.query("SELECT id FROM projects WHERE project_number = $1", [projName]);
      if (pRows.length > 0) projectId = pRows[0].id;
    }

    if (existingMap.has(docName)) {
      await pool.query(`
        UPDATE documents SET
          net_total=$1, tax_amount=$2, gross_total=$3, tax_rate=$4, status=$5,
          customer_id=$6, project_id=COALESCE($7, project_id), subject=$8,
          previously_invoiced=$9, type=$10, form_template_id=COALESCE($11, form_template_id),
          custom_type_label=$13,
          erloeskonto=COALESCE($14, erloeskonto),
          created_at=COALESCE($15::timestamp, created_at)
        WHERE document_number=$12
      `, [netto.toFixed(2), mwst.toFixed(2), brutto.toFixed(2), mwstSatz.toFixed(2), status,
          customerId, projectId, s(r.BETREFF), absnetto > 0 ? absnetto.toFixed(2) : "0.00", docType, formTemplateId, docName, customTypeLabel,
          erloeskonto, erstelldat]);
      updated++;
    } else {
      try {
        await pool.query(`
          INSERT INTO documents (document_number, type, customer_id, project_id, subject, date, status,
            net_total, tax_rate, tax_amount, gross_total, previously_invoiced, form_template_id, custom_type_label,
            erloeskonto, created_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,COALESCE($16::timestamp, NOW()))
        `, [docName, docType, customerId, projectId, s(r.BETREFF), datum, status,
            netto.toFixed(2), mwstSatz.toFixed(2), mwst.toFixed(2), brutto.toFixed(2),
            absnetto > 0 ? absnetto.toFixed(2) : "0.00", formTemplateId, customTypeLabel,
            erloeskonto, erstelldat]);
        inserted++;
      } catch {}
    }
  }

  const { rows: allDocsForBezug } = await pool.query("SELECT id, document_number FROM documents");
  const docIdByNumber = new Map(allDocsForBezug.map(r => [r.document_number, r.id]));
  let parentLinked = 0;
  for (const [docName, bezugName] of bezugMap) {
    const docId = docIdByNumber.get(docName);
    const parentId = docIdByNumber.get(bezugName);
    if (docId && parentId && docId !== parentId) {
      const { rowCount } = await pool.query(
        "UPDATE documents SET parent_document_id = $1 WHERE id = $2 AND (parent_document_id IS NULL OR parent_document_id != $1)",
        [parentId, docId]
      );
      if (rowCount && rowCount > 0) parentLinked++;
    }
  }

  return `${inserted} neu, ${updated} aktualisiert, ${parentLinked} Bezug-Verknüpfungen`;
}

async function execSyncProjectLinks(pool: pg.Pool): Promise<string> {
  const records = await downloadAndParse("/Daten/DOKUMENT.DBF", ".FPT");

  const { rows: allDocs } = await pool.query("SELECT id, document_number, project_id FROM documents WHERE project_id IS NOT NULL");
  const docDbMap = new Map(allDocs.map(r => [r.document_number, r]));
  const { rows: projectRows } = await pool.query("SELECT id, project_number, name, short_name FROM projects");
  const projectMap = new Map(projectRows.map(r => [r.project_number, r]));

  const projRecords = new Map<string, { name: string; bezugName: string; typUndNr: string; betreff: string; sortIdx: number }[]>();
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const projName = s(r.PROJNAME);
    if (!projName) continue;
    if (!projRecords.has(projName)) projRecords.set(projName, []);
    projRecords.get(projName)!.push({
      name: s(r.NAME),
      bezugName: s(r.BEZUGNAME),
      typUndNr: s(r.TYPUNDNR),
      betreff: s(r.BETREFF),
      sortIdx: i,
    });
  }

  let rebuilt = 0, added = 0;
  for (const [projNumber, recs] of projRecords) {
    const proj = projectMap.get(projNumber);
    if (!proj) continue;
    const projectId = proj.id;

    const { rows: existingTree } = await pool.query(
      "SELECT id, document_id, node_type, folder_name FROM project_document_tree WHERE project_id = $1",
      [projectId]
    );

    const folderCount = existingTree.filter(n => n.node_type === "folder").length;
    const hapakHasFolders = recs.some(r => /^Ordner/i.test(r.typUndNr));
    const hasRichStructure = folderCount > 1 || (folderCount === 1 && !hapakHasFolders);
    if (hasRichStructure) {
      const inTree = new Set(existingTree.filter(n => n.document_id).map(n => n.document_id));

      const { rows: treeAll } = await pool.query(
        "SELECT t.id as tree_id, t.node_type, t.folder_name, t.parent_id, d.document_number FROM project_document_tree t LEFT JOIN documents d ON t.document_id = d.id WHERE t.project_id = $1",
        [projectId]
      );
      const hapakNameToTreeId = new Map<string, number>();
      for (const td of treeAll) {
        if (td.document_number) hapakNameToTreeId.set(td.document_number, td.tree_id);
      }

      const isFolder = (typUndNr: string) => /^Ordner/i.test(typUndNr);
      const cleanFolderNameFn = (t: string) => t.replace(/^Ordner\s*(für|Für|fuer|f.r)?\s*/i, "").replace(/\.+$/, "").trim();
      const folders = treeAll.filter(t => t.node_type === "folder" && t.parent_id);
      for (const rec of recs) {
        if (isFolder(rec.typUndNr)) {
          const cleanName = cleanFolderNameFn(rec.typUndNr);
          let match = folders.find(t => t.folder_name === cleanName);
          if (!match) match = folders.find(t => cleanName.startsWith(t.folder_name) || t.folder_name.startsWith(cleanName));
          if (match) hapakNameToTreeId.set(rec.name, match.tree_id);
        }
      }
      hapakNameToTreeId.set(projNumber, treeAll.find(t => t.node_type === "folder" && !t.parent_id)?.tree_id || 0);

      for (const doc of allDocs.filter(d => d.project_id === projectId)) {
        if (!inTree.has(doc.id)) {
          try {
            let parentId: number | null = null;
            const hapakRec = recs.find(r => r.name === doc.document_number);
            if (hapakRec?.bezugName) {
              const parentTreeId = hapakNameToTreeId.get(hapakRec.bezugName);
              if (parentTreeId) parentId = parentTreeId;
            }
            const { rows: maxSort } = await pool.query(
              "SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM project_document_tree WHERE project_id = $1",
              [projectId]
            );
            await pool.query(
              "INSERT INTO project_document_tree (project_id, document_id, parent_id, node_type, sort_order) VALUES ($1, $2, $3, 'document', $4) ON CONFLICT DO NOTHING",
              [projectId, doc.id, parentId, maxSort[0].next]
            );
            added++;
          } catch {}
        }
      }
      continue;
    }

    await pool.query("DELETE FROM project_document_tree WHERE project_id = $1", [projectId]);

    const rootFolderName = buildRootFolderName(projNumber, proj.short_name, proj.name);
    const { rows: rootRow } = await pool.query(
      "INSERT INTO project_document_tree (project_id, document_id, parent_id, node_type, folder_name, sort_order) VALUES ($1, NULL, NULL, 'folder', $2, 0) RETURNING id",
      [projectId, rootFolderName]
    );
    const rootId = rootRow[0].id;

    const isFolder = (typUndNr: string) => /^Ordner/i.test(typUndNr);
    const cleanFolderName = (t: string) => t.replace(/^Ordner\s*(für|Für|fuer|f.r)?\s*/i, "").replace(/\.+$/, "").trim();

    const hapakToTreeId = new Map<string, number>();
    hapakToTreeId.set(projNumber, rootId);

    const allItems = recs.filter(r => r.name !== projNumber).sort((a, b) => a.sortIdx - b.sortIdx);
    const processed = new Set<string>();
    let sortOrder = 10;

    for (let pass = 0; pass < 15; pass++) {
      let progress = false;
      for (const rec of allItems) {
        if (processed.has(rec.name)) continue;
        let parentTreeId: number | null = null;
        if (!rec.bezugName) { parentTreeId = rootId; }
        else if (hapakToTreeId.has(rec.bezugName)) { parentTreeId = hapakToTreeId.get(rec.bezugName)!; }
        else continue;

        if (isFolder(rec.typUndNr)) {
          const fName = cleanFolderName(rec.typUndNr);
          const { rows: fRow } = await pool.query(
            "INSERT INTO project_document_tree (project_id, document_id, parent_id, node_type, folder_name, sort_order) VALUES ($1, NULL, $2, 'folder', $3, $4) RETURNING id",
            [projectId, parentTreeId, fName, sortOrder]
          );
          hapakToTreeId.set(rec.name, fRow[0].id);
          sortOrder += 10;
        } else {
          const docRow = docDbMap.get(rec.name);
          if (docRow) {
            const { rows: dRow } = await pool.query(
              "INSERT INTO project_document_tree (project_id, document_id, parent_id, node_type, sort_order) VALUES ($1, $2, $3, 'document', $4) RETURNING id",
              [projectId, docRow.id, parentTreeId, sortOrder]
            );
            hapakToTreeId.set(rec.name, dRow[0].id);
            sortOrder += 10;
          } else {
            hapakToTreeId.set(rec.name, parentTreeId!);
          }
        }
        processed.add(rec.name);
        progress = true;
      }
      if (!progress) break;
    }
    rebuilt++;
  }

  const { rows: docsNoTree } = await pool.query(`
    SELECT d.id, d.project_id FROM documents d
    WHERE d.project_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM project_document_tree t WHERE t.document_id = d.id)
  `);
  for (const doc of docsNoTree) {
    try {
      const { rows: maxSort } = await pool.query(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM project_document_tree WHERE project_id = $1",
        [doc.project_id]
      );
      await pool.query(
        "INSERT INTO project_document_tree (project_id, document_id, node_type, sort_order) VALUES ($1, $2, 'document', $3) ON CONFLICT DO NOTHING",
        [doc.project_id, doc.id, maxSort[0].next]
      );
      added++;
    } catch {}
  }

  await pool.query(`
    DELETE FROM project_document_tree t
    WHERE t.document_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.id = t.document_id)
  `);

  await pool.query(`
    UPDATE project_document_tree t SET parent_id = NULL
    WHERE t.parent_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM project_document_tree p WHERE p.id = t.parent_id)
  `);

  return `${rebuilt} Projektbäume aus HAPAK aufgebaut, ${added} Dokumente ergänzt`;
}

async function execSyncFibu(pool: pg.Pool): Promise<string> {
  const records = await downloadAndParse("/Fibu/FIBUZWO.DBF", ".FPT");
  await pool.query("DELETE FROM fibu_buchungen");
  let inserted = 0;
  const seen = new Set<string>();
  for (const r of records) {
    const dedupeKey = `${n(r.RE_ID)}_${n(r.IDX)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    try {
      await pool.query(`
        INSERT INTO fibu_buchungen (re_id, idx, lfd_nr, periode, art, typ, kennung, rnr,
          adr_nr, adr_such, betreff, belegdat, rechdat, erfasstdat, faelligdat, zahldat, skontodat, stornodat,
          bezugidx, betrag, zahlung, netto, brutto, einbehalt, minderung, offen, gutschrift, kuerzung,
          sk_prozent, sk_betrag, sk_basis, mahn_geb, konto_b, konto_g, konto_s, konto_m,
          kst, ktr, bezahlflag, stornoflag, mahnflag, mahnen, auszug)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43)
      `, [
        n(r.RE_ID), n(r.IDX), s(r.LFD_NR) || null, s(r.PERIODE) || null,
        s(r.ART), s(r.TYP) || null, n(r.KENNUNG) || null, s(r.RNR),
        s(r.ADR_NR) || null, s(r.ADR_SUCH) || null, s(r.BETREFF) || null,
        d(r.BELEGDAT), d(r.RECHDAT), d(r.ERFASSTDAT), d(r.FAELLIGDAT),
        d(r.ZAHLDAT), d(r.SKONTODAT), d(r.STORNODAT),
        n(r.BEZUGIDX) || null,
        n(r.BETRAG), n(r.ZAHLUNG), n(r.NETTO), n(r.BRUTTO),
        n(r.EINBEHALT), n(r.MINDERUNG), n(r.OFFEN), n(r.GUTSCHRIFT), n(r.KUERZUNG),
        n(r.SK_PROZENT), n(r.SK_BETRAG), n(r.SK_BASIS), n(r.MAHN_GEB),
        s(r.KONTO_B) || null, s(r.KONTO_G) || null, s(r.KONTO_S) || null, s(r.KONTO_M) || null,
        s(r.KST) || null, s(r.KTR) || null,
        n(r.BEZAHLFLAG), n(r.STORNOFLAG), n(r.MAHNFLAG),
        s(r.MAHNEN) === "T" || r.MAHNEN === true,
        s(r.AUSZUG) || null
      ]);
      inserted++;
    } catch {}
  }

  const fibuUpdate = await pool.query(`
    UPDATE documents d SET
      fibu_netto = sub.netto,
      fibu_brutto = sub.brutto,
      fibu_zahlung = sub.zahlung,
      fibu_skonto = sub.sk_betrag,
      fibu_offen = sub.offen
    FROM (
      SELECT rnr, netto, brutto, zahlung, sk_betrag, offen
      FROM fibu_buchungen
      WHERE art = 'RA' AND typ = 'HR'
    ) sub
    WHERE d.document_number = sub.rnr
  `);

  const guUpdate = await pool.query(`
    UPDATE documents d SET
      fibu_netto = ABS(sub.netto)::text,
      fibu_brutto = ABS(sub.brutto)::text,
      fibu_zahlung = sub.zahlung,
      fibu_skonto = sub.sk_betrag,
      fibu_offen = sub.offen
    FROM (
      SELECT rnr, netto::numeric as netto, brutto::numeric as brutto, zahlung, sk_betrag, offen
      FROM fibu_buchungen
      WHERE art = 'RA' AND typ = 'HG'
    ) sub
    WHERE d.document_number = sub.rnr
  `);

  return `${inserted} Buchungen importiert, ${fibuUpdate.rowCount} RE + ${guUpdate.rowCount} GU Dokumente mit FIBU-Daten verknüpft`;
}

async function execSyncFibuAdd(pool: pg.Pool): Promise<string> {
  const records = await downloadAndParse("/Fibu/FIBUADD.DBF");
  await pool.query("DELETE FROM fibu_add");
  let inserted = 0;
  for (const r of records) {
    try {
      await pool.query(`
        INSERT INTO fibu_add (re_id, art, adr_nr, betreff, rg_nr, rg_datum, zahlungsziel,
          skonto_tage, skonto_prozent, netto, ust_satz, ust_betrag, brutto, zahlbetrag,
          storno_datum, buchungskonto, kst, flags)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      `, [
        n(r.RE_ID), s(r.ART), s(r.ADR_NR), s(r.BETREFF), s(r.RG_NR),
        d(r.RG_DATUM), n(r.ZAHLZIEL),
        n(r.SK_TAGE), n(r.SK_PROZENT), n(r.NETTO), n(r.UST_SATZ),
        n(r.UST_BETRAG), n(r.BRUTTO), n(r.ZAHLBETRAG),
        d(r.STORNODAT), s(r.BUCH_KONTO), s(r.KST), s(r.FLAGS)
      ]);
      inserted++;
    } catch {}
  }
  return `${inserted} Zusatzdaten importiert (Komplett-Sync)`;
}

async function execSyncFibuRef(pool: pg.Pool): Promise<string> {
  const banks = await downloadAndParse("/Fibu/BANK.DBF");
  await pool.query("DELETE FROM fibu_bankkonten");
  for (const r of banks) {
    await pool.query(`
      INSERT INTO fibu_bankkonten (konto_nr, bezeichnung, konto_nr2, blz, inhaber, iban, bic, stand)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (konto_nr) DO UPDATE SET bezeichnung=EXCLUDED.bezeichnung, iban=EXCLUDED.iban, bic=EXCLUDED.bic
    `, [n(r.KNT_NR), s(r.BEZ), s(r.KONTONR) || null, s(r.BLZ) || null, s(r.INHABER) || null, s(r.IBAN) || null, s(r.SWIFT) || null, n(r.STAND)]);
  }

  const steuern = await downloadAndParse("/Fibu/STEUERSATZ.DBF");
  await pool.query("DELETE FROM fibu_steuersaetze");
  for (const r of steuern) {
    await pool.query(`
      INSERT INTO fibu_steuersaetze (str_id, match, bezeichnung, prozent, knt_nr, konto_datev, vst_kto, ust_kto, vst_prz, ust_prz, flags)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `, [n(r.ID), s(r.MATCH), s(r.BEZ), n(r.PROZENT), s(r.KNT_NR) || null, s(r.KONTO_D) || null, s(r.VST_KTO) || null, s(r.UST_KTO) || null, n(r.VST_PRZ), n(r.UST_PRZ), s(r.FLAGS) || null]);
  }

  const konten = await downloadAndParse("/Fibu/KONTO.DBF");
  await pool.query("DELETE FROM fibu_konten");
  let kCount = 0;
  for (const r of konten) {
    const bez = s(r.BEZ);
    if (!bez) continue;
    await pool.query(`
      INSERT INTO fibu_konten (konto_nr, kategorie, klasse, bezeichnung, str_id, ustvakz, bp_nr, guv, skonto_kto, minder_kto)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [n(r.KNT_NR), n(r.KATEGORIE), n(r.KLASSE), bez, s(r.STR_ID) || null, s(r.USTVAKZ) || null, n(r.BP_NR), n(r.GUV) || null, n(r.SKONTO_KTO) || null, n(r.MINDER_KTO) || null]);
    kCount++;
  }

  return `${banks.length} Bankkonten, ${steuern.length} Steuersätze, ${kCount} Konten`;
}

async function execSyncPersonal(pool: pg.Pool): Promise<string> {
  const records = await downloadAndParse("/Adressen/PERSONAL.DBF", ".FPT");
  const { rows: existing } = await pool.query("SELECT id, employee_number, worker_id_external FROM employees");
  const existingByNr = new Map<string, number>();
  for (const e of existing) {
    if (e.employee_number) existingByNr.set(e.employee_number, e.id);
    if (e.worker_id_external) existingByNr.set(e.worker_id_external, e.id);
  }

  let inserted = 0, updated = 0;
  for (const r of records) {
    const nr = s(r.NR);
    const name = s(r.NAME);
    if (!name) continue;
    const parts = name.split(" ");
    const firstName = parts[0] || "";
    const lastName = parts.slice(1).join(" ") || "";
    const isActive = !(r.INAKTIV === true || s(r.INAKTIV) === "T");
    const hourlyEk = n(r.LOHNSATZEK) || 0;
    const hourlySale = n(r.LOHNSATZ1) || 0;
    const entry = r.EINTRITT && r.EINTRITT !== "0000-00-00" ? r.EINTRITT : null;
    const exit = r.AUSTRITT && r.AUSTRITT !== "0000-00-00" ? r.AUSTRITT : null;

    const existingId = existingByNr.get(nr);
    if (existingId) {
      await pool.query(`
        UPDATE employees SET
          first_name = COALESCE(NULLIF($1, ''), first_name),
          last_name = COALESCE(NULLIF($2, ''), last_name),
          qualification = COALESCE(NULLIF($3, ''), qualification),
          hourly_rate = CASE WHEN $4::numeric > 0 THEN $4::numeric ELSE hourly_rate END,
          hourly_rate_sale = CASE WHEN $5::numeric > 0 THEN $5::numeric ELSE hourly_rate_sale END,
          entry_date = COALESCE($6::date, entry_date),
          exit_date = $7::date,
          active = $8,
          worker_id_external = COALESCE(NULLIF($9, ''), worker_id_external),
          trade = COALESCE(NULLIF($10, ''), trade),
          employee_number = COALESCE(NULLIF($11, ''), employee_number)
        WHERE id = $12
      `, [firstName, lastName, s(r.QUALI), hourlyEk, hourlySale, entry, exit, isActive, nr, s(r.TAETIGKEIT), nr, existingId]);
      updated++;
    } else {
      await pool.query(`
        INSERT INTO employees (employee_number, first_name, last_name, type, hourly_rate, hourly_rate_sale,
          entry_date, exit_date, qualification, active, worker_id_external, trade)
        VALUES ($1, $2, $3, 'gewerblich', $4, $5, $6, $7, $8, $9, $10, $11)
      `, [nr, firstName, lastName, hourlyEk, hourlySale, entry, exit, s(r.QUALI), isActive, nr, s(r.TAETIGKEIT)]);
      inserted++;
    }
  }

  const { rows: allEmps } = await pool.query("SELECT employee_number, first_name, last_name, active, phone, email, qualification, trade, entry_date, exit_date FROM employees");
  let addrInserted = 0;
  for (const e of allEmps) {
    const custNr = "P-" + (e.employee_number || "").padStart(5, "0");
    const fullName = [e.first_name, e.last_name].filter(Boolean).join(" ") || "Unbenannt";
    const searchKey = (e.last_name || e.first_name || "").toUpperCase();
    const notes = (e.active ? "aktiv" : "inaktiv") + (e.qualification ? " | " + e.qualification : "") + (e.trade ? " | " + e.trade : "");
    const { rowCount } = await pool.query(`
      INSERT INTO customers (customer_number, search_key, name, contact_type, employee_number, entry_date, exit_date, phone, email, notes)
      VALUES ($1, $2, $3, 'personal', $4, $5, $6, $7, $8, $9)
      ON CONFLICT (customer_number) DO UPDATE SET
        search_key = EXCLUDED.search_key, name = EXCLUDED.name,
        employee_number = EXCLUDED.employee_number, entry_date = EXCLUDED.entry_date,
        exit_date = EXCLUDED.exit_date, phone = COALESCE(NULLIF(EXCLUDED.phone,''), customers.phone),
        email = COALESCE(NULLIF(EXCLUDED.email,''), customers.email), notes = EXCLUDED.notes
    `, [custNr, searchKey, fullName, e.employee_number, e.entry_date, e.exit_date, e.phone || null, e.email || null, notes]);
    if (rowCount) addrInserted++;
  }

  return `${inserted} neu, ${updated} aktualisiert, ${addrInserted} Adressen sync (${records.length} HAPAK-Datensätze)`;
}

async function execSyncPositions(pool: pg.Pool, onProgress?: ProgressCallback): Promise<string> {
  const { rows: allDocs } = await pool.query(`
    SELECT d.id, d.document_number FROM documents d
    WHERE d.type NOT IN ('eingangsrechnung', 'nachkalkulation')
    ORDER BY d.document_number
  `);

  const { rows: docsWithKalk } = await pool.query(`
    SELECT DISTINCT document_id FROM document_items 
    WHERE (labor_cost IS NOT NULL AND labor_cost::numeric != 0) 
       OR (material_price IS NOT NULL AND material_price::numeric != 0)
       OR (labor_markup IS NOT NULL)
  `);
  const docIdsWithKalk = new Set(docsWithKalk.map(r => r.document_id));

  const { rows: docsWithItems } = await pool.query("SELECT DISTINCT document_id FROM document_items");
  const docIdsWithItems = new Set(docsWithItems.map(r => r.document_id));

  const nasListRes = await nasReq(`/webapi/entry.cgi?api=SYNO.FileStation.List&version=2&method=list&folder_path=${encodeURIComponent(NAS_SHARE + FIRMA + "/Daten")}&additional=%5B%22size%22%5D&sort_by=name&limit=20000&_sid=${SID}`);
  const nasFileSet = new Set<string>();
  if (nasListRes?.data?.files) {
    for (const f of nasListRes.data.files) {
      if (f.name.endsWith(".DBF")) nasFileSet.add(f.name.replace(/\.DBF$/i, ""));
    }
  }

  const toSync = allDocs.filter(doc => {
    if (!nasFileSet.has(doc.document_number)) return false;
    if (!docIdsWithItems.has(doc.id)) return true;
    if (!docIdsWithKalk.has(doc.id)) return true;
    return false;
  });

  if (!fs.existsSync(DETAILS_DIR)) fs.mkdirSync(DETAILS_DIR, { recursive: true });

  let imported = 0, failed = 0;
  for (let i = 0; i < toSync.length; i++) {
    const doc = toSync[i];
    if (i % 20 === 0) {
      onProgress?.({ step: "positions", progress: 7, total: 10, message: `Positionen: ${i}/${toSync.length} (${doc.document_number})...` });
    }

    try {
      await pool.query("DELETE FROM document_items WHERE document_id = $1", [doc.id]);

      const buf = await nasDownload(`/Daten/${doc.document_number}.DBF`);
      if (buf.length < 100) { failed++; continue; }
      const check = buf.toString("utf-8", 0, Math.min(50, buf.length));
      if (check.includes('"error"')) { failed++; continue; }

      const tmpPath = path.join(DETAILS_DIR, `${doc.document_number}.DBF`);
      fs.writeFileSync(tmpPath, buf);

      try {
        const fptBuf = await nasDownload(`/Daten/${doc.document_number}.FPT`);
        if (fptBuf.length > 100 && !fptBuf.toString("utf-8", 0, 50).includes('"error"')) {
          fs.writeFileSync(path.join(DETAILS_DIR, `${doc.document_number}.FPT`), fptBuf);
        }
      } catch {}

      const result = await importPositionsFromDbf(pool, doc.id, tmpPath);
      if (result === "imported") imported++;
      else failed++;
    } catch {
      failed++;
    }

    if (i > 0 && i % 300 === 0) {
      try { await nasLogout(); } catch {}
      await nasLogin();
    }
  }
  return `${imported} Dokumente mit Positionen importiert, ${failed} fehlgeschlagen (von ${toSync.length} gesamt)`;
}

async function importPositionsFromDbf(pool: pg.Pool, docId: number, dbfPath: string): Promise<string> {
  try {
    const dbfBuf = fs.readFileSync(dbfPath);
    if (dbfBuf.length < 32) return "skipped";
    const meta = parseDbfFields(dbfBuf);
    if (meta.count === 0 || meta.count > 50000 || meta.recordSize === 0) return "skipped";

    let fptBuf: Buffer | null = null;
    const fptPath = dbfPath.replace(/\.DBF$/i, ".FPT");
    if (fs.existsSync(fptPath)) {
      try { fptBuf = fs.readFileSync(fptPath); } catch {}
    }

    let sortOrder = 0;
    const rows: any[][] = [];
    let headerDone = false;
    let headerDocLabel: string | null = null;
    let firstContentSeen = false;
    const beforeWorkTexts: string[] = [];
    const afterTotalsTexts: string[] = [];
    let pastNettosumme = false;

    for (let i = 0; i < meta.count; i++) {
      const rec = readDbfRecord(dbfBuf, i, meta);
      if (rec._DELETED === "true") continue;

      const id = rec.ID || "";
      const posnr = rec.POSNR || "";
      const kurztext = rec.KURZTEXT || "";
      const me = rec.ME || "";
      const menge = parseFloat(rec.MENGE || "0") || 0;
      const ePreis = parseFloat(rec.E_PREIS || "0") || 0;
      const pauschal = parseFloat(rec.PAUSCHAL || "0") || 0;
      const zeit = parseFloat(rec.ZEIT || "0") || 0;
      const hEbene = rec.H_EBENE || "";
      const restmenge = parseFloat(rec.RESTMENGE || "0") || 0;

      const lohnsatzEk = parseFloat(rec.LOHNSATZEK || "0") || 0;
      const lohnVk0 = parseFloat(rec.LOHNSVK_0 || "0") || 0;
      const lohnVkG = parseFloat(rec.LOHNSVK_G || "0") || 0;
      const matEk = parseFloat(rec.MATEK || "0") || 0;
      const matVk0 = parseFloat(rec.MATVK_0 || "0") || 0;
      const matVkG = parseFloat(rec.MATVK_G || "0") || 0;
      const gerEk = parseFloat(rec.GEREK || "0") || 0;
      const gerVk = parseFloat(rec.GERVK || "0") || 0;
      const fremdEk = parseFloat(rec.FREMDEK || "0") || 0;
      const fremdVk = parseFloat(rec.FREMDVK || "0") || 0;

      if (id === "X" || id === "A" || id === "F" || id === "-" || id === "P") continue;
      if (id === "" && !posnr && !kurztext) continue;
      if (!headerDone) {
        const contentIds = ["T", "U", "J", "B", "S", "G", "R", "l", "M", "m"];
        if (contentIds.includes(id)) {
          headerDone = true;
          if (id === "R") {
            if (kurztext && (kurztext.includes("Rechnung") || kurztext.includes("Angebot") || kurztext.includes("Auftrags"))) {
              headerDocLabel = kurztext;
            }
            continue;
          }
        } else {
          if (id === "" && !posnr && kurztext && /^\d+\.\s*(Abschlags|Teil)?[Rr]echnung/i.test(kurztext.trim())) {
            continue;
          }
          if (id === "" && kurztext && kurztext.length > 2) {
            const textDataRawPre = readFptMemo(fptBuf, rec.TEXTDATA || "");
            const fullTextPre = extractTextFromBlob(textDataRawPre);
            const preText = fullTextPre && fullTextPre.length > kurztext.length ? fullTextPre : kurztext;
            beforeWorkTexts.push(cleanText(preText));
          }
          continue;
        }
      }
      if (id === "" && !posnr && kurztext && /^\d+\.\s*(Abschlags|Teil)?[Rr]echnung/i.test(kurztext.trim()) && (ePreis > 0 || pauschal > 0)) {
        continue;
      }

      const textDataRaw = readFptMemo(fptBuf, rec.TEXTDATA || "");
      const fullText = extractTextFromBlob(textDataRaw);

      let itemType = "position";
      let posFlag = "normal";
      let title = kurztext;
      let description: string | null = null;

      const flagsHex = rec.FLAGS || "00000000";
      const flagsVal = parseInt(flagsHex, 16) || 0;
      const hasBit1 = (flagsVal & 0x02) !== 0;
      const hasBit6 = (flagsVal & 0x40) !== 0;
      if (hasBit6) {
        posFlag = "bedarf";
      } else if (hasBit1 && (flagsVal & 0x00080000) !== 0) {
        posFlag = "alternativ";
      }

      if (id === "U") {
        itemType = "gruppe";
        firstContentSeen = true;
        const { t, d: desc } = splitFullText(fullText, kurztext);
        title = t; description = desc;
      } else if (id === "T") {
        itemType = "text";
        if (fullText && fullText.length > title.length) title = fullText;
        if (!title || title.length <= 1) continue;
        if (!firstContentSeen) {
          beforeWorkTexts.push(cleanText(title));
          continue;
        }
        if (pastNettosumme) {
          afterTotalsTexts.push(cleanText(title));
          continue;
        }
      } else if (id === "R") {
        const titleCheck = (fullText || kurztext || "").toLowerCase();
        if (titleCheck.includes("skonto")) {
          itemType = "skonto";
        } else {
          itemType = "zuschlag";
        }
        const { t, d: desc } = splitFullText(fullText, kurztext);
        title = t; description = desc;
      } else if (id === "J") {
        itemType = "position";
        firstContentSeen = true;
        if (posFlag === "normal") posFlag = "jumbo";
        const { t, d: desc } = splitFullText(fullText, kurztext);
        title = t; description = desc;
      } else if (id === "M") {
        itemType = "position";
        firstContentSeen = true;
        const { t, d: desc } = splitFullText(fullText, kurztext);
        title = t; description = desc;
      } else if (id === "l") {
        itemType = "jumbo";
        firstContentSeen = true;
        const { t, d: desc } = splitFullText(fullText, kurztext);
        title = t; description = desc;
      } else if (id === "m") {
        itemType = "jumbo";
        firstContentSeen = true;
        const { t, d: desc } = splitFullText(fullText, kurztext);
        title = t; description = desc;
      } else if (id === "B") {
        itemType = "titelsumme";
        firstContentSeen = true;
        const { t } = splitFullText(fullText, kurztext);
        title = t;
      } else if (id === "S") {
        itemType = "nettosumme"; title = "Nettosumme";
        pastNettosumme = true;
      } else if (id === "G") {
        itemType = "gesamtsumme"; title = "Gesamtsumme";
        pastNettosumme = true;
      } else {
        const flags = rec.FLAGS || "";
        if (flags.length > 0 && !flags.startsWith("0000") && !flags.match(/^\d/) && !flags.startsWith("P")) continue;
        if (!posnr && !kurztext) continue;
        if (menge > 0 || ePreis > 0 || ePreis < 0) {
          firstContentSeen = true;
          const titleLower = kurztext.toLowerCase();
          if (ePreis < 0 && (titleLower.includes("nachlass") || titleLower.includes("rabatt"))) itemType = "zuschlag";
          else itemType = "position";
        } else if (posnr && kurztext && hEbene) {
          firstContentSeen = true;
          itemType = "gruppe";
        } else if (!posnr && kurztext) {
          itemType = "text";
        } else continue;
        if (fullText) {
          const { t, d: desc } = splitFullText(fullText, kurztext);
          title = t; description = desc;
        }
      }

      const qty = menge;
      const ep = ePreis;
      let gp: number;
      if (id === "R") gp = pauschal !== 0 ? pauschal : ep;
      else if (id === "J") gp = pauschal !== 0 ? pauschal : (qty !== 0 && ep !== 0 ? qty * ep : ep);
      else if (id === "l" || id === "m") gp = qty > 0 && ep > 0 ? qty * ep : 0;
      else gp = pauschal !== 0 ? pauschal : (qty !== 0 && ep !== 0 ? qty * ep : ep);

      let laborPrice: number, materialPrice: number, laborCost: number, equipCost: number, externalCost: number, laborTime: number;
      if (id === "B") { laborPrice = 0; materialPrice = 0; laborCost = 0; equipCost = 0; externalCost = 0; laborTime = 0; }
      else if (id === "R") { laborPrice = lohnVkG; materialPrice = matVkG; laborCost = lohnsatzEk; equipCost = gerEk; externalCost = fremdEk; laborTime = zeit; }
      else if (id === "J") { laborPrice = lohnVkG || lohnVk0; materialPrice = matVkG || matVk0; laborCost = lohnsatzEk; equipCost = gerEk; externalCost = fremdEk; laborTime = zeit; }
      else if (id === "l") { laborPrice = ep; materialPrice = 0; laborCost = lohnsatzEk || (qty > 0 ? matEk : 0); equipCost = 0; externalCost = 0; laborTime = zeit > 0 ? zeit * (menge > 0 ? menge : 1) : 0; }
      else if (id === "m") { laborPrice = 0; materialPrice = ep; laborCost = 0; equipCost = gerEk; externalCost = fremdEk; laborTime = 0; }
      else { laborPrice = lohnVkG || lohnVk0; materialPrice = matVkG || matVk0; laborCost = lohnsatzEk; equipCost = gerEk; externalCost = fremdEk; laborTime = zeit; }

      let laborMarkup: number | null = null, materialMarkup: number | null = null, equipMarkup: number | null = null, externalMarkup: number | null = null;
      if (laborCost > 0 && laborPrice > 0 && laborPrice !== laborCost) laborMarkup = ((laborPrice / laborCost) - 1) * 100;
      if (matEk > 0 && materialPrice > 0 && materialPrice !== matEk) materialMarkup = ((materialPrice / matEk) - 1) * 100;
      if (gerEk > 0 && gerVk > 0 && gerVk !== gerEk) equipMarkup = ((gerVk / gerEk) - 1) * 100;
      if (fremdEk > 0 && fremdVk > 0 && fremdVk !== fremdEk) externalMarkup = ((fremdVk / fremdEk) - 1) * 100;

      const flagLabel = posFlag === "alternativ" ? "Alternativ zu vorstehender Position"
        : posFlag === "bedarf" ? "Bedarfsposition" : null;

      rows.push([
        docId, posnr, itemType, cleanText(title) || null, description ? cleanText(description) : null, me || null,
        qty.toFixed(3), ep.toFixed(2), gp.toFixed(2),
        laborPrice.toFixed(2), materialPrice.toFixed(2),
        laborCost.toFixed(2), equipCost.toFixed(2), externalCost.toFixed(2),
        laborMarkup !== null ? laborMarkup.toFixed(2) : null,
        materialMarkup !== null ? materialMarkup.toFixed(2) : null,
        equipMarkup !== null ? equipMarkup.toFixed(2) : null,
        externalMarkup !== null ? externalMarkup.toFixed(2) : null,
        laborTime > 0 ? laborTime.toFixed(2) : "0",
        sortOrder++, posFlag, flagLabel,
      ]);
    }

    if (rows.length === 0) return "skipped";

    const nettoIdx = rows.findIndex(r => r[2] === "nettosumme" || (r[2] === "text" && typeof r[3] === "string" && (
      r[3].trim() === "Nettosumme" || r[3].trim().startsWith("Summe Netto")
    )));

    const filteredRows: typeof rows = [];
    let foundAbschlussPoint = false;
    for (let i = 0; i < rows.length; i++) {
      if (nettoIdx >= 0 && i >= nettoIdx && !foundAbschlussPoint) {
        foundAbschlussPoint = true;
        filteredRows.push([docId, "", "abschluss", "", null, null, "0", "0", "0", "0", "0", "0", "0", "0", null, null, null, null, "0", sortOrder++, "normal", null]);
      }
      filteredRows.push(rows[i]);
    }
    if (!foundAbschlussPoint) {
      filteredRows.push([docId, "", "abschluss", "", null, null, "0", "0", "0", "0", "0", "0", "0", "0", null, null, null, null, "0", sortOrder++, "normal", null]);
    }

    let finalSortOrder = 0;
    let pastAbschluss = false;
    for (const r of filteredRows) {
      r[19] = finalSortOrder++;
      if (r[2] === "abschluss") { pastAbschluss = true; r.push(false); r.push(false); continue; }
      r.push(pastAbschluss);
      const hasEk = parseFloat(String(r[11])) > 0 || parseFloat(String(r[12])) > 0 || parseFloat(String(r[13])) > 0 || parseFloat(String(r[10])) > 0 || parseFloat(String(r[18])) > 0;
      r.push(hasEk);
    }

    const cols = "document_id, position_number, type, title, description, unit, quantity, unit_price, total_price, labor_price, material_price, labor_cost, equipment_cost, external_cost, labor_markup, material_markup, equipment_markup, external_markup, labor_time, sort_order, position_flag, flag_label, after_totals, price_follows_cost";
    const paramCount = 24;
    const batchSize = 100;
    for (let batchStart = 0; batchStart < filteredRows.length; batchStart += batchSize) {
      const batch = filteredRows.slice(batchStart, batchStart + batchSize);
      const placeholders = batch.map((_, ri) => {
        const base = ri * paramCount;
        return `(${Array.from({ length: paramCount }, (_, ci) => `$${base + ci + 1}`).join(",")})`;
      }).join(",");
      await pool.query(`INSERT INTO document_items (${cols}) VALUES ${placeholders}`, batch.flat());
    }

    const { rows: insertedItems } = await pool.query(
      "SELECT id, type, position_flag, sort_order FROM document_items WHERE document_id = $1 ORDER BY sort_order",
      [docId]
    );
    let currentJumboParentId: number | null = null;
    let seenJumboChild = false;
    for (const item of insertedItems) {
      if (item.type === "position" && item.position_flag === "jumbo") {
        currentJumboParentId = item.id;
        seenJumboChild = false;
      } else if (item.type === "jumbo" && currentJumboParentId) {
        seenJumboChild = true;
        await pool.query("UPDATE document_items SET parent_item_id = $1 WHERE id = $2", [currentJumboParentId, item.id]);
      } else if (item.type === "jumbo" && !currentJumboParentId) {
        // orphan jumbo child – find previous jumbo header by sort_order
        const { rows: prevHeaders } = await pool.query(
          `SELECT id FROM document_items WHERE document_id = $1 AND type = 'position' AND position_flag = 'jumbo' AND sort_order < $2 ORDER BY sort_order DESC LIMIT 1`,
          [docId, item.sort_order]
        );
        if (prevHeaders.length > 0) {
          currentJumboParentId = prevHeaders[0].id;
          seenJumboChild = true;
          await pool.query("UPDATE document_items SET parent_item_id = $1 WHERE id = $2", [currentJumboParentId, item.id]);
        }
      } else if (item.type !== "jumbo") {
        if (seenJumboChild) {
          currentJumboParentId = null;
          seenJumboChild = false;
        }
      }
    }

    if (headerDocLabel) {
      await pool.query("UPDATE documents SET custom_type_label = $1 WHERE id = $2 AND (custom_type_label IS NULL OR custom_type_label = '')", [headerDocLabel, docId]);
    }

    if (beforeWorkTexts.length > 0 || afterTotalsTexts.length > 0) {
      const bwt = beforeWorkTexts.length > 0 ? beforeWorkTexts.join("\n") : null;
      const att = afterTotalsTexts.length > 0 ? afterTotalsTexts.join("\n") : null;
      await pool.query(
        `UPDATE documents SET
          before_work_text = COALESCE($1, before_work_text),
          after_totals_text = COALESCE($2, after_totals_text)
        WHERE id = $3`,
        [bwt, att, docId]
      );
    }

    return "imported";
  } catch {
    return "failed";
  }
}

async function execSyncAbschlagVerrechnungen(pool: pg.Pool): Promise<string> {
  const { rows: abDocs } = await pool.query(`
    SELECT d.id, d.document_number, d.type, d.parent_document_id, d.date, d.tax_rate,
      d.net_total, d.gross_total
    FROM documents d
    WHERE d.type IN ('abschlagsrechnung', 'schlussrechnung')
    ORDER BY d.id
  `);
  if (abDocs.length === 0) return "0 Verrechnungen";

  const parentGroups = new Map<number, typeof abDocs>();
  for (const d of abDocs) {
    const parentId = d.parent_document_id;
    if (!parentId) continue;
    if (!parentGroups.has(parentId)) parentGroups.set(parentId, []);
    parentGroups.get(parentId)!.push(d);
  }

  let updated = 0;
  for (const [parentId, siblings] of parentGroups) {
    siblings.sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return da - db || a.id - b.id;
    });

    let prevItemsNet = 0;
    const deltas: { id: number; docNum: string; date: string; deltaNet: number; deltaGross: number; type: string }[] = [];

    for (const sib of siblings) {
      const { rows: itemsRows } = await pool.query(
        `SELECT COALESCE(SUM(total_price), 0) as items_net FROM document_items WHERE document_id = $1 AND type = 'position'`,
        [sib.id]
      );
      const itemsNet = parseFloat(itemsRows[0]?.items_net || "0");
      const taxRate = parseFloat(String(sib.tax_rate)) || 0;
      const dn = Math.round((itemsNet - prevItemsNet) * 100) / 100;
      const dg = Math.round(dn * (1 + taxRate / 100) * 100) / 100;
      deltas.push({ id: sib.id, docNum: sib.document_number, date: sib.date || "", deltaNet: dn, deltaGross: dg, type: sib.type });
      prevItemsNet = itemsNet;
    }

    for (let i = 0; i < deltas.length; i++) {
      const current = deltas[i];
      if (current.type !== 'schlussrechnung' && i === 0) continue;

      const previousOnes = current.type === 'schlussrechnung'
        ? deltas.filter(dd => dd.type === 'abschlagsrechnung')
        : deltas.slice(0, i);

      if (previousOnes.length === 0) continue;

      const verrechnungen = previousOnes.map(p => ({
        docId: p.id,
        documentNumber: p.docNum,
        label: `Rechnung ${p.docNum}`,
        date: p.date,
        netAmount: p.deltaNet,
        grossAmount: p.deltaGross,
      }));

      await pool.query(
        `UPDATE documents SET abschlag_verrechnungen = $1::jsonb WHERE id = $2`,
        [JSON.stringify(verrechnungen), current.id]
      );
      updated++;
    }
  }
  return `${updated} Verrechnungen aktualisiert`;
}

async function execSyncPayments(pool: pg.Pool): Promise<string> {
  const { rows: raEntries } = await pool.query(`
    SELECT rnr, betrag, zahlung, offen, bezahlflag, stornoflag
    FROM fibu_buchungen WHERE art = 'RA' AND typ = 'HR'
  `);
  const fibuMap = new Map(raEntries.map(r => [r.rnr.trim(), r]));

  let updatedRA = 0;
  const { rows: raDocs } = await pool.query(`
    SELECT id, document_number, gross_total, paid_amount, status
    FROM documents WHERE type IN ('rechnung', 'abschlagsrechnung', 'schlussrechnung') AND document_number LIKE 'R%'
  `);

  const { rows: docTypeRows } = await pool.query(`
    SELECT id, type FROM documents WHERE type IN ('rechnung', 'abschlagsrechnung', 'schlussrechnung') AND document_number LIKE 'R%'
  `);
  const docTypeMap = new Map(docTypeRows.map(r => [r.id, r.type]));

  for (const doc of raDocs) {
    const entry = fibuMap.get(doc.document_number);
    if (!entry) continue;
    const offen = parseFloat(entry.offen) || 0;
    const zahlung = parseFloat(entry.zahlung) || 0;
    const betrag = parseFloat(entry.betrag) || 0;
    const storno = entry.stornoflag || 0;

    let newStatus: string;
    if (storno > 0) newStatus = "storniert";
    else if (offen <= 0 && zahlung > 0) newStatus = "bezahlt";
    else if (zahlung > 0 && offen > 0) newStatus = "teilbezahlt";
    else if (offen > 0) newStatus = "gesendet";
    else newStatus = "entwurf";

    const isAbschlagOrSchluss = ["abschlagsrechnung", "schlussrechnung"].includes(docTypeMap.get(doc.id) || "");
    if (isAbschlagOrSchluss) {
      await pool.query(
        "UPDATE documents SET paid_amount=$1, status=$2, fibu_netto=COALESCE(fibu_netto,$3::numeric), fibu_brutto=COALESCE(fibu_brutto,$3::numeric) WHERE id=$4",
        [zahlung.toFixed(2), newStatus, betrag.toFixed(2), doc.id]
      );
    } else {
      await pool.query(
        "UPDATE documents SET paid_amount=$1, status=$2, gross_total=$3 WHERE id=$4",
        [zahlung.toFixed(2), newStatus, betrag.toFixed(2), doc.id]
      );
    }
    updatedRA++;
  }

  const { rows: reEntries } = await pool.query(`
    SELECT rnr, betrag, zahlung, offen, bezahlflag, netto, brutto,
      sk_prozent, sk_betrag, faelligdat, skontodat, rechdat, adr_nr, adr_such, betreff,
      konto_b, kst
    FROM fibu_buchungen WHERE art = 'RE' AND typ = 'HR'
  `);
  const reMap = new Map(reEntries.map(r => [r.rnr.trim(), r]));

  let updatedRE = 0, insertedRE = 0;
  const { rows: incomingDocs } = await pool.query("SELECT id, invoice_number, status FROM incoming_invoices");
  const existingInvNrs = new Set(incomingDocs.map(i => (i.invoice_number || "").trim()));

  for (const inv of incomingDocs) {
    const entry = reMap.get(inv.invoice_number?.trim());
    if (!entry) continue;
    const offen = parseFloat(entry.offen) || 0;
    const zahlung = parseFloat(entry.zahlung) || 0;
    const brutto = parseFloat(entry.brutto) || 0;
    const netto = parseFloat(entry.netto) || 0;
    const skProzent = parseFloat(entry.sk_prozent) || 0;
    const skBetrag = parseFloat(entry.sk_betrag) || 0;

    let newStatus: string;
    if (offen <= 0 && zahlung > 0) newStatus = "bezahlt";
    else if (zahlung > 0 && offen > 0) newStatus = "teilbezahlt";
    else newStatus = "offen";

    await pool.query(`UPDATE incoming_invoices SET
      paid_amount=$1, status=$2,
      gross_total=COALESCE(NULLIF(gross_total::numeric, 0), $3)::text,
      net_total=COALESCE(NULLIF(net_total::numeric, 0), $4)::text,
      discount_percent=COALESCE(discount_percent, $5::text),
      discount_amount=COALESCE(discount_amount, $6::text),
      due_date=COALESCE(due_date, $7),
      discount_date=COALESCE(discount_date, $8),
      cost_account=COALESCE(cost_account, $9)
    WHERE id=$10`, [
      zahlung.toFixed(2), newStatus,
      Math.abs(brutto).toFixed(2), Math.abs(netto).toFixed(2),
      skProzent > 0 ? skProzent.toFixed(2) : null,
      skBetrag > 0 ? skBetrag.toFixed(2) : null,
      entry.faelligdat || null,
      entry.skontodat || null,
      entry.konto_b || null,
      inv.id
    ]);
    updatedRE++;
  }

  for (const [rnr, entry] of reMap) {
    if (existingInvNrs.has(rnr)) continue;
    const brutto = parseFloat(entry.brutto) || 0;
    const netto = parseFloat(entry.netto) || 0;
    const zahlung = parseFloat(entry.zahlung) || 0;
    const offen = parseFloat(entry.offen) || 0;
    const mwst = Math.abs(brutto) - Math.abs(netto);
    const mwstSatz = Math.abs(netto) > 0 ? (mwst / Math.abs(netto)) * 100 : 19;
    let newStatus = "offen";
    if (offen <= 0 && zahlung > 0) newStatus = "bezahlt";
    else if (zahlung > 0 && offen > 0) newStatus = "teilbezahlt";

    try {
      await pool.query(`
        INSERT INTO incoming_invoices (invoice_number, supplier, supplier_number, date, due_date,
          net_total, tax_rate, tax_amount, gross_total, paid_amount, status,
          cost_account, cost_center, subject,
          discount_percent, discount_amount, discount_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      `, [
        rnr,
        (entry.adr_such || "").trim() || rnr,
        (entry.adr_nr || "").trim() || null,
        entry.rechdat || entry.faelligdat || new Date().toISOString().slice(0, 10),
        entry.faelligdat || null,
        Math.abs(netto).toFixed(2),
        mwstSatz.toFixed(2),
        mwst.toFixed(2),
        Math.abs(brutto).toFixed(2),
        zahlung.toFixed(2),
        newStatus,
        (entry.konto_b || "").trim() || null,
        (entry.kst || "").trim() || null,
        (entry.betreff || "").trim() || null,
        parseFloat(entry.sk_prozent) > 0 ? parseFloat(entry.sk_prozent).toFixed(2) : null,
        parseFloat(entry.sk_betrag) > 0 ? parseFloat(entry.sk_betrag).toFixed(2) : null,
        entry.skontodat || null
      ]);
      insertedRE++;
    } catch {}
  }

  return `${updatedRA} RA, ${updatedRE} RE aktualisiert, ${insertedRE} RE neu angelegt`;
}

async function execSyncFibuDocLinks(pool: pg.Pool): Promise<string> {
  let linked = 0;

  const { rows: buchungen } = await pool.query(`
    SELECT id, rnr FROM fibu_buchungen WHERE document_id IS NULL AND rnr IS NOT NULL AND rnr != ''
  `);
  const { rows: docs } = await pool.query("SELECT id, document_number FROM documents");
  const docMap = new Map(docs.map(r => [r.document_number, r.id]));

  for (const b of buchungen) {
    const rnr = b.rnr.trim();
    const docId = docMap.get(rnr);
    if (docId) {
      await pool.query("UPDATE fibu_buchungen SET document_id = $1 WHERE id = $2", [docId, b.id]);
      linked++;
    }
  }

  return `${linked} FiBu-Buchungen mit Dokumenten verknüpft`;
}
