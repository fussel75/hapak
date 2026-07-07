import fs from "node:fs/promises";
import path from "node:path";
import { DBFFile } from "dbffile";
import { expandHapakDetailedJumbos } from "../shared/document-engine/hapak-jumbo-import";
import { cleanHapakTextBlock, isHapakTextArtifactLine, repairHapakMojibake } from "../shared/document-engine/hapak-text-artifacts";

type Row = Record<string, any>;

type StageIssue = {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  examples?: string[];
};

type StageDocument = {
  hapakName: string;
  importSource: "hapak";
  importSourceKey: string;
  visibleDocumentNumber: string;
  documentNumber: string;
  type: string;
  customerNumber: string;
  projectKey: string;
  parentHapakName: string;
  subject: string;
  date: string;
  validUntil: string | null;
  status: string;
  netTotal: number;
  taxRate: number;
  taxAmount: number;
  grossTotal: number;
  customTypeLabel: string | null;
  source: {
    table: "DOKUMENT";
    typUndNr: string;
    id: string;
  };
};

type StagePositionItem = {
  documentImportSourceKey: string;
  sourceLine: number;
  sourceId: string;
  positionNumber: string;
  type: string;
  title: string | null;
  description: string | null;
  unit: string | null;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  laborPrice: string;
  materialPrice: string;
  materialCost: string;
  laborCost: string;
  equipmentCost: string;
  externalCost: string;
  laborMarkup: string | null;
  materialMarkup: string | null;
  equipmentMarkup: string | null;
  externalMarkup: string | null;
  laborTime: string;
  sortOrder: number;
  positionFlag: string;
  flagLabel: string | null;
  afterTotals: boolean;
  priceFollowsCost: boolean;
  parentSourceLine: number | null;
};

type Stage = {
  source: string;
  year: number;
  generatedAt: string;
  readonly: true;
  acceptedStandaloneFreeDocuments: string[];
  counts: Record<string, number>;
  customers: any[];
  projects: any[];
  documents: StageDocument[];
  documentTree: any[];
  fibu: any[];
  fibuEntries: any[];
  wages: any[];
  positions: any[];
  issues: StageIssue[];
};

function argValue(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  const prefixed = process.argv.find((a) => a.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : null;
}

function argValues(name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === name && process.argv[i + 1]) values.push(process.argv[i + 1]);
    if (arg.startsWith(`${name}=`)) values.push(arg.slice(name.length + 1));
  }
  return values;
}

function hasArg(name: string): boolean {
  return process.argv.includes(name) || process.argv.some((a) => a.startsWith(`${name}=`));
}

function argInt(name: string, fallback: number): number {
  const raw = argValue(name);
  if (raw == null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function S(value: unknown): string {
  const raw = value == null ? "" : String(value).trim();
  return raw.toUpperCase() === "NULL" ? "" : raw;
}

function N(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = S(value).replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function B(value: unknown): boolean {
  return value === true || S(value).toLowerCase() === "true" || S(value) === "1";
}

function normalizeFilterValue(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

function csvArgValues(...names: string[]): Set<string> {
  const values = names
    .flatMap((name) => argValues(name))
    .flatMap((value) => value.split(","))
    .map(normalizeFilterValue)
    .filter(Boolean);
  return new Set(values);
}

function money(value: unknown): string {
  return N(value).toFixed(2);
}

function qty(value: unknown): string {
  return N(value).toFixed(3);
}

function isoDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = S(value);
  if (!raw || raw === "0000-00-00") return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return null;
}

function yearOf(value: unknown): number | null {
  const d = isoDate(value);
  return d ? Number(d.slice(0, 4)) : null;
}

function valueBelongsToNumberYear(value: unknown, year: number): boolean {
  const raw = S(value);
  if (!raw) return false;
  const year2 = String(year % 100).padStart(2, "0");
  return new RegExp(`(^|\\D)${year2}-\\d{4,5}\\b`).test(raw) || new RegExp(`(^|[^A-Z0-9])P?ZZ${year2}`, "i").test(raw);
}

function rowBelongsToYear(row: Row, year: number, dateFields: string[], numberFields: string[] = []): boolean {
  if (dateFields.some((f) => yearOf(row[f]) === year)) return true;
  return numberFields.some((f) => valueBelongsToNumberYear(row[f], year));
}

async function readDbf(root: string, relativeParts: string[]): Promise<Row[]> {
  const dbfPath = path.join(root, ...relativeParts);
  const dbf = await DBFFile.open(dbfPath, { encoding: "cp1252", readMode: "loose" } as any);
  return (await dbf.readRecords(dbf.recordCount)) as Row[];
}

async function dbfExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function mapContactType(row: Row): string {
  const id = S(row.ID).toUpperCase();
  const art = S(row.ART).toLowerCase();
  if (id === "L") return "lieferant";
  if (id === "I") return "interessent";
  if (id === "P") return "personal";
  if (id === "K") return "kunde";
  if (art.includes("liefer")) return "lieferant";
  if (art.includes("inter")) return "interessent";
  if (art.includes("person")) return "personal";
  if (art.includes("sonst")) return "sonstige";
  return "kunde";
}

function mapDocumentType(row: Row): string {
  const id = S(row.ID);
  const t = S(row.TYPUNDNR).toLowerCase();
  if (id === "5") return "eingangsrechnung";
  if (t.startsWith("abschlag")) return "abschlagsrechnung";
  if (t.startsWith("schluss")) return "schlussrechnung";
  if (t.startsWith("gutschrift")) return "gutschrift";
  if (t.startsWith("rechnung") && t.includes("abschlagsrechnung")) return "abschlagsrechnung";
  if (t.startsWith("rechnung")) return "rechnung";
  if (t.startsWith("angebot")) return "angebot";
  if (t.startsWith("auftrags")) return "auftragsbestaetigung";
  if (t.startsWith("lieferschein")) return "lieferschein";
  if (t.startsWith("mitschnitt")) return "mitschnitt";
  if (id === "0" || S(row.NAME) === S(row.PROJNAME)) return "projektkopf";
  return "freies_dokument";
}

function mapDocStatus(row: Row, type: string): string {
  const status = N(row.STATUS);
  if (type === "rechnung" || type === "abschlagsrechnung" || type === "schlussrechnung") {
    if (N(row.OFFEN) <= 0 && N(row.BETRAG) > 0) return "bezahlt";
    return status >= 2 ? "versendet" : "entwurf";
  }
  return status >= 2 ? "versendet" : "entwurf";
}

function humanDocumentNumber(row: Row): string {
  const text = S(row.TYPUNDNR);
  const match = text.match(/\d{2}-\d{5}/);
  return match ? match[0] : S(row.NAME);
}

function projectNumberFromKey(projectKey: string, fallbackDate?: unknown): string {
  const key = S(projectKey);
  const modern = key.match(/^PZZ(\d{2})(\d+)$/i);
  if (modern) return `${modern[1]}-${Number(modern[2]).toString().padStart(4, "0")}`;
  const seq = key.match(/^P[A-Z]*(\d+)$/i);
  const y = yearOf(fallbackDate);
  if (seq && y) return `${String(y % 100).padStart(2, "0")}-${Number(seq[1]).toString().padStart(4, "0")}`;
  return key;
}

function customTypeLabel(row: Row, type: string): string | null {
  const text = S(row.TYPUNDNR);
  if (!text) return null;
  const withoutNumber = text.replace(/\s*\d{2}-\d{5}.*$/, "").trim();
  if (!withoutNumber) return null;
  const defaults: Record<string, string> = {
    angebot: "Angebot",
    auftragsbestaetigung: "Auftragsbestaetigung",
    abschlagsrechnung: "Abschlagsrechnung",
    schlussrechnung: "Schlussrechnung",
    rechnung: "Rechnung",
    gutschrift: "Gutschrift",
    lieferschein: "Lieferschein",
    freies_dokument: "Freies Dokument",
    mitschnitt: "Mitschnitt",
  };
  return withoutNumber === defaults[type] ? null : withoutNumber;
}

function isExplicitHapakFolder(row: Row): boolean {
  return /^Ordner/i.test(S(row.TYPUNDNR));
}

function cleanHapakFolderName(row: Row): string {
  const raw = S(row.TYPUNDNR) || S(row.BETREFF) || humanDocumentNumber(row);
  return repairHapakMojibake(raw)
    .replace(/^Ordner\s*(für|fuer|for)?\s*/i, "")
    .replace(/\s+\d{2}-\d{5}.*$/, "")
    .replace(/\.+$/, "")
    .trim() || humanDocumentNumber(row);
}

function isHapakFreeDocumentFolderReplacement(row: Row, positionFiles: Set<string>, childNames: Set<string>): boolean {
  if (mapDocumentType(row) !== "freies_dokument") return false;
  const name = S(row.NAME).toUpperCase();
  if (!name || !childNames.has(name)) return false;
  if (positionFiles.has(name)) return false;
  const hasMoney = Math.abs(N(row.NETTO)) > 0.005 || Math.abs(N(row.BETRAG)) > 0.005;
  if (hasMoney) return false;
  return true;
}

function mainRowKey(row: Row): string {
  return `${S(row.ART) || "?"}/${S(row.TYP) || "?"}`;
}

function mapFibuRow(row: Row, documents2026ByName: Map<string, Row>) {
  const art = S(row.ART);
  const typ = S(row.TYP);
  const rnr = S(row.RNR);
  const linkedDocument = documents2026ByName.has(rnr.toUpperCase());
  return {
    reId: N(row.RE_ID),
    idx: N(row.IDX),
    lfdNr: S(row.LFD_NR) || null,
    periode: S(row.PERIODE) || null,
    art,
    typ,
    kennung: N(row.KENNUNG),
    key: mainRowKey(row),
    rnr,
    documentNumber: linkedDocument ? rnr : null,
    customerNumber: S(row.ADR_NR),
    customerSearch: S(row.ADR_SUCH),
    subject: S(row.BETREFF),
    projectKey: S(row.KTR),
    belegdat: isoDate(row.BELEGDAT),
    rechdat: isoDate(row.RECHDAT),
    erfasstdat: isoDate(row.ERFASSTDAT),
    faelligdat: isoDate(row.FAELLIGDAT),
    zahldat: isoDate(row.ZAHLDAT),
    skontodat: isoDate(row.SKONTODAT),
    stornodat: isoDate(row.STORNODAT),
    bezugidx: N(row.BEZUGIDX),
    kontoB: S(row.KONTO_B) || null,
    kontoG: S(row.KONTO_G) || null,
    kontoS: S(row.KONTO_S) || null,
    kontoM: S(row.KONTO_M) || null,
    kst: S(row.KST) || null,
    ktr: S(row.KTR) || null,
    betrag: N(row.BETRAG),
    zahlung: N(row.ZAHLUNG),
    netto: N(row.NETTO),
    brutto: N(row.BRUTTO) || N(row.BETRAG),
    einbehalt: N(row.EINBEHALT),
    minderung: N(row.MINDERUNG),
    offen: N(row.OFFEN),
    gutschrift: N(row.GUTSCHRIFT),
    kuerzung: N(row.KUERZUNG),
    skProzent: N(row.SK_PROZENT),
    skBetrag: N(row.SK_BETRAG),
    skBasis: N(row.SK_BASIS),
    mahnGeb: N(row.MAHN_GEB),
    bezahlflag: N(row.BEZAHLFLAG),
    stornoflag: N(row.STORNOFLAG),
    mahnflag: N(row.MAHNFLAG),
    mahnen: B(row.MAHNEN),
    auszug: S(row.AUSZUG) || null,
    source: { table: "FIBUZWO", reId: N(row.RE_ID), idx: N(row.IDX), rnr },
  };
}

const acceptedStandaloneFreeDocuments = new Set(["P7283433"]);

function stripFontMetadata(str: string): string {
  return str
    .replace(/[^\w\s.,;:!?()\-/€%²³°&@#+*~']{1,10}"Swis721[^"]*$/gm, "")
    .replace(/^"Swis721[^"]*$/gm, "")
    .replace(/\u00ff{3,}/g, "")
    .replace(/^P\d+\u00ff$/gm, "")
    .trim();
}

function isMostlyFiller(text: string): boolean {
  const compact = text.replace(/\s/g, "");
  if (!compact) return true;
  const filler = compact.match(/[\u00ff�]/g)?.length || 0;
  return filler / compact.length > 0.5;
}

function isLikelyCorruptMemoFragment(text: string): boolean {
  const compact = text.replace(/\s/g, "");
  if (!compact) return true;
  if (/^p#$/i.test(compact)) return true;
  if (/^[º°]+0$/u.test(compact)) return true;
  if (/^\(\d{1,2}$/u.test(compact)) return true;
  if (compact.length <= 2 && !/\d/.test(compact)) return true;
  if (compact.length > 20 && !/[A-Za-z0-9ÄÖÜäöüß]/.test(compact)) return true;
  if (compact.length <= 3 && !/[A-Za-z0-9ÄÖÜäöüß]/.test(compact)) return true;
  if (/[Ÿ·¹¾ÁÃÆÇÉËÕ×ØÙÓÚÛÌÎÐÏÒÔÍµ¸»]{10,}/.test(compact)) return true;
  if (/[œ¯ÑÕâãßàîøôðÙÛ]{10,}/.test(compact)) return true;
  const head = compact.slice(0, 24);
  const headSuspicious = head.match(/[^\wÄÖÜäöüß]/g)?.length || 0;
  if (head.length >= 12 && headSuspicious / head.length > 0.45) return true;
  if (/(.)\1{30,}/u.test(compact)) return true;
  if (text.length > 80 && (text.match(/\s/g)?.length || 0) / text.length < 0.03) return true;
  const suspicious = compact.match(/[ÃÂâ�ÿþýŒÑÐÞÛÙØ×ÖÕÔÓÒÁÀ¾½»º¹¸·¶µ´³±°óèñçÙòæåïãíáêÌÉÇÅÃ¾½»º¹¸·¶µ´šœ¡¤ª±²¯¬«©¨¥¦¢Ÿžƒ˜¬·¶µ¼º¹¸¢]/g)?.length || 0;
  return compact.length > 80 && suspicious / compact.length > 0.12;
}

function cleanText(value: unknown): string {
  const text = S(value);
  if (!text) return "";
  const cleaned = stripFontMetadata(
    repairHapakMojibake(text)
      .replace(/\0/g, "")
      .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, "")
      .trim(),
  );
  if (isMostlyFiller(cleaned) || isLikelyCorruptMemoFragment(cleaned)) return "";
  return cleaned
    .split("\n")
    .filter((line) => !isMostlyFiller(line) && !isLikelyCorruptMemoFragment(line))
    .join("\n")
    .trim();
}

function extractTextFromMemo(value: unknown): string {
  const raw = value == null ? "" : String(value);
  if (!raw) return "";
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.startsWith("@R_BLOB@")) return cleanText(normalized);

  let best = "";
  let current = "";
  for (let i = 8; i < normalized.length; i++) {
    const ch = normalized[i];
    const code = ch.charCodeAt(0);
    const printable = code === 10 || code === 9 || (code >= 32 && code <= 0x02ff);
    if (printable) {
      current += ch;
    } else {
      const cleaned = cleanText(current);
      if (cleaned.length > best.length) best = cleaned;
      current = "";
    }
  }
  const cleaned = cleanText(current);
  if (cleaned.length > best.length) best = cleaned;
  return best;
}

function splitFullText(fullText: string, fallback: string): { title: string; description: string | null } {
  const cleanedFallback = cleanText(fallback);
  if (!fullText) return { title: cleanedFallback, description: null };
  const lines = cleanText(fullText).split("\n");
  const title = lines[0]?.trim() || cleanedFallback;
  const description = lines.length > 1 ? lines.slice(1).join("\n").trim() || null : null;
  return { title, description };
}

function mapPositionFlag(row: Row): { positionFlag: string; flagLabel: string | null } {
  const flagsHex = S(row.FLAGS) || "00000000";
  const flagsVal = parseInt(flagsHex, 16) || 0;
  const isBedarf = (flagsVal & 0x40) !== 0;
  const isAlternativ = (flagsVal & 0x02) !== 0 && (flagsVal & 0x00080000) !== 0;
  if (isBedarf) return { positionFlag: "bedarf", flagLabel: "Bedarfsposition" };
  if (isAlternativ) return { positionFlag: "alternativ", flagLabel: "Alternativ zu vorstehender Position" };
  return { positionFlag: "normal", flagLabel: null };
}

function isCalculatedSkontoText(text: string): boolean {
  return /^Zahlbetrag\s+bei\s+Skontoabzug\b/i.test(text.trim());
}

function appendCleanText(target: string[], value: unknown): void {
  const cleaned = cleanHapakTextBlock(cleanText(value));
  if (cleaned) target.push(cleaned);
}

function isTopLevelPositionNumber(value: string): boolean {
  return /^\d+\.?$/.test(value.trim());
}

function percentMarkup(cost: number, price: number): string | null {
  if (cost <= 0 || price <= 0 || Math.abs(price - cost) < 0.005) return null;
  return (((price / cost) - 1) * 100).toFixed(2);
}

function shouldSkipPositionRow(row: Row): boolean {
  const id = S(row.ID);
  const posnr = S(row.POSNR);
  const kurztext = S(row.KURZTEXT);
  if (S(row._DELETED) === "true") return true;
  if (["X", "A", "F", "-", "P"].includes(id)) return true;
  if (!id && !posnr && !kurztext && Math.abs(N(row.E_PREIS)) < 0.005 && Math.abs(N(row.PAUSCHAL)) < 0.005) return true;
  return false;
}

async function mapPositionFile(source: string, documentName: string, documentImportSourceKey: string): Promise<any> {
  const dbfPath = path.join(source, "Daten", `${documentName}.DBF`);
  if (!(await dbfExists(dbfPath))) {
    return { documentImportSourceKey, hapakName: documentName, present: false, rows: 0, activeRows: 0, items: [], beforeWorkText: null, afterTotalsText: null, headerDocLabel: null };
  }

  const rows = await readDbf(source, ["Daten", `${documentName}.DBF`]);
  const items: StagePositionItem[] = [];
  const beforeWorkTexts: string[] = [];
  const afterTotalsTexts: string[] = [];
  let headerDone = false;
  let firstContentSeen = false;
  let pastNettosumme = false;
  let sortOrder = 0;
  let activeRows = 0;
  let headerDocLabel: string | null = null;
  let currentJumboSourceLine: number | null = null;
  let seenJumboChild = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (S(row._DELETED) === "true") continue;
    activeRows++;
    if (shouldSkipPositionRow(row)) continue;

    const id = S(row.ID);
    const posnr = S(row.POSNR);
    const kurztext = S(row.KURZTEXT);
    const fullText = extractTextFromMemo(row.TEXTDATA);

    if (!headerDone) {
      const contentIds = ["T", "U", "J", "S", "G", "R", "l", "M", "m"];
      if (contentIds.includes(id)) {
        headerDone = true;
        if (id === "R" && kurztext && /Rechnung|Angebot|Auftrags/i.test(kurztext)) {
          headerDocLabel = kurztext;
          continue;
        }
      } else {
        if (!id && !posnr && kurztext && /^\d+\.\s*(Abschlags|Teil)?[Rr]echnung/i.test(kurztext.trim())) continue;
        if (!id && kurztext && kurztext.length > 2) {
          appendCleanText(beforeWorkTexts, fullText && fullText.length > kurztext.length ? fullText : kurztext);
        }
        continue;
      }
    }

    if (!id && !posnr && kurztext && /^\d+\.\s*(Abschlags|Teil)?[Rr]echnung/i.test(kurztext.trim()) && (N(row.E_PREIS) > 0 || N(row.PAUSCHAL) > 0)) {
      continue;
    }

    let type = "position";
    let { positionFlag, flagLabel } = mapPositionFlag(row);
    let title = kurztext;
    let description: string | null = null;
    let afterTotals = false;
    let parentSourceLine: number | null = null;

    if (id === "U") {
      type = isTopLevelPositionNumber(posnr) ? "titel" : "gruppe";
      firstContentSeen = true;
      ({ title, description } = splitFullText(fullText, kurztext));
    } else if (id === "T") {
      type = "text";
      title = cleanText(fullText || kurztext);
      if (isHapakTextArtifactLine(title)) continue;
      if (!title || title.length <= 1) continue;
      if (!firstContentSeen) {
        appendCleanText(beforeWorkTexts, title);
        continue;
      }
      if (pastNettosumme) {
        if (isCalculatedSkontoText(title)) continue;
        appendCleanText(afterTotalsTexts, title);
        continue;
      }
    } else if (id === "R") {
      type = (fullText || kurztext).toLowerCase().includes("skonto") ? "skonto" : "zuschlag";
      ({ title, description } = splitFullText(fullText, kurztext));
    } else if (id === "J") {
      type = "jumbo";
      firstContentSeen = true;
      if (positionFlag === "normal") positionFlag = "jumbo";
      ({ title, description } = splitFullText(fullText, kurztext));
    } else if (id === "M") {
      type = "material";
      firstContentSeen = true;
      ({ title, description } = splitFullText(fullText, kurztext));
    } else if (id === "l") {
      type = "lohn";
      firstContentSeen = true;
      parentSourceLine = currentJumboSourceLine;
      ({ title, description } = splitFullText(fullText, kurztext));
    } else if (id === "m") {
      type = "material";
      firstContentSeen = true;
      parentSourceLine = currentJumboSourceLine;
      ({ title, description } = splitFullText(fullText, kurztext));
    } else if (id === "B") {
      if (!firstContentSeen) continue;
      type = "titelsumme";
      firstContentSeen = true;
      ({ title } = splitFullText(fullText, kurztext));
    } else if (id === "S") {
      type = "nettosumme";
      title = "Nettosumme";
      pastNettosumme = true;
    } else if (id === "G") {
      type = "gesamtsumme";
      title = "Gesamtsumme";
      pastNettosumme = true;
    } else {
      const flags = S(row.FLAGS);
      if (flags.length > 0 && !flags.startsWith("0000") && !flags.match(/^\d/) && !flags.startsWith("P")) continue;
      if (!posnr && !kurztext) continue;
      if (N(row.MENGE) > 0 || Math.abs(N(row.E_PREIS)) > 0.005) {
        firstContentSeen = true;
        type = N(row.E_PREIS) < 0 && /nachlass|rabatt/i.test(kurztext) ? "zuschlag" : "position";
      } else if (posnr && kurztext && S(row.H_EBENE)) {
        firstContentSeen = true;
        type = isTopLevelPositionNumber(posnr) ? "titel" : "gruppe";
      } else if (!posnr && kurztext) {
        type = "text";
      } else {
        continue;
      }
      if (fullText) ({ title, description } = splitFullText(fullText, kurztext));
    }

    if (type !== "lohn" && type !== "material") {
      if (seenJumboChild) {
        currentJumboSourceLine = null;
        seenJumboChild = false;
      }
    } else if (parentSourceLine) {
      seenJumboChild = true;
    }

    const quantity = N(row.MENGE);
    const unitPrice = N(row.E_PREIS);
    const fixedTotal = N(row.PAUSCHAL);
    let totalPrice = fixedTotal !== 0 ? fixedTotal : (quantity !== 0 && unitPrice !== 0 ? quantity * unitPrice : 0);
    if (parentSourceLine && quantity > 0 && unitPrice !== 0) totalPrice = quantity * unitPrice;

    const laborPrice = id === "l" ? unitPrice : N(row.LOHNSVK_G) || N(row.LOHNSVK_0);
    const materialPrice = id === "m" ? unitPrice : N(row.MATVK_G) || N(row.MATVK_0);
    const materialCost = N(row.MATEK);
    const laborCost = N(row.LOHNSATZEK);
    const equipmentCost = N(row.GEREK);
    const externalCost = N(row.FREMDEK);
    const laborTime = N(row.ZEIT);
    const hasCostBuckets = materialCost > 0 || laborCost > 0 || equipmentCost > 0 || externalCost > 0;

    const sourceLine = i + 1;
    if (type === "jumbo" && !parentSourceLine) {
      currentJumboSourceLine = sourceLine;
      seenJumboChild = false;
    }

    if (pastNettosumme && type !== "nettosumme" && type !== "gesamtsumme") afterTotals = true;

    items.push({
      documentImportSourceKey,
      sourceLine,
      sourceId: id,
      positionNumber: posnr,
      type,
      title: cleanText(title) || null,
      description: description ? cleanText(description) : null,
      unit: S(row.ME) || null,
      quantity: qty(quantity),
      unitPrice: money(unitPrice),
      totalPrice: money(totalPrice),
      laborPrice: money(laborPrice),
      materialPrice: money(materialPrice),
      materialCost: money(materialCost),
      laborCost: money(laborCost),
      equipmentCost: money(equipmentCost),
      externalCost: money(externalCost),
      laborMarkup: percentMarkup(laborCost, laborPrice),
      materialMarkup: percentMarkup(materialCost, materialPrice),
      equipmentMarkup: percentMarkup(equipmentCost, N(row.GERVK)),
      externalMarkup: percentMarkup(externalCost, N(row.FREMDVK)),
      laborTime: money(laborTime),
      sortOrder: sortOrder++,
      positionFlag,
      flagLabel,
      afterTotals,
      priceFollowsCost: type === "jumbo" ? fixedTotal === 0 || hasCostBuckets : parentSourceLine !== null,
      parentSourceLine,
    });
  }

  const normalizedItems = expandHapakDetailedJumbos(items);

  return {
    documentImportSourceKey,
    hapakName: documentName,
    present: true,
    rows: rows.length,
    activeRows,
    items: normalizedItems,
    beforeWorkText: cleanHapakTextBlock(beforeWorkTexts.join("\n")),
    afterTotalsText: cleanHapakTextBlock(afterTotalsTexts.join("\n")),
    headerDocLabel,
  };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function inspectPositionFile(source: string, documentName: string, inspectRows: boolean): Promise<any> {
  const dbfPath = path.join(source, "Daten", `${documentName}.DBF`);
  if (!(await dbfExists(dbfPath))) {
    return { documentNumber: documentName, present: false, rows: 0, activeRows: 0, idCounts: {}, mappedRows: 0 };
  }
  if (!inspectRows) {
    return { documentNumber: documentName, present: true, rows: null, activeRows: null, idCounts: null, mappedRows: null };
  }
  const rows = await readDbf(source, ["Daten", `${documentName}.DBF`]);
  const idCounts: Record<string, number> = {};
  let activeRows = 0;
  let mappedRows = 0;
  for (const row of rows) {
    if (S(row._DELETED) === "true") continue;
    activeRows++;
    const id = S(row.ID) || "(leer)";
    idCounts[id] = (idCounts[id] || 0) + 1;
    if (S(row.POSNR) || S(row.KURZTEXT) || Math.abs(N(row.E_PREIS)) > 0.005 || Math.abs(N(row.PAUSCHAL)) > 0.005) {
      mappedRows++;
    }
  }
  return {
    documentNumber: documentName,
    present: true,
    rows: rows.length,
    activeRows,
    mappedRows,
    idCounts,
  };
}

async function run(): Promise<void> {
  if (hasArg("--help") || hasArg("-h")) {
    console.log("Usage: npx tsx scripts/hapak-stage-2026.ts --source <local HAPAK snapshot> [--year 2026] [--out hapak-stage-2026.json]");
    console.log("Read-only: creates a staging JSON with mapped target objects. No database writes.");
    console.log("Optional: --inspect-positions opens every document position DBF and counts rows; slower.");
    console.log("Optional: --map-positions maps HAPAK position DBFs into document_items staging data; slower and larger.");
    console.log("Optional: --position-document <HAPAK name or visible number> limits position mapping; repeat or use --position-documents a,b.");
    console.log("Optional: --position-batch-size <n> --position-batch-index <1..n> maps one resumable document batch.");
    return;
  }

  const source = argValue("--source");
  if (!source) throw new Error("Bitte --source angeben, z.B. --source \"D:\\\\HAPAK-Snapshot\\\\FB ZuB\"");
  const year = Number(argValue("--year") || "2026");
  if (!Number.isInteger(year) || year < 2000 || year > 2099) throw new Error("--year muss ein gueltiges Jahr sein");
  const inspectPositions = hasArg("--inspect-positions");
  const mapPositions = hasArg("--map-positions");
  const positionDocumentFilters = csvArgValues("--position-document", "--position-documents");
  const positionBatchSize = Math.max(0, argInt("--position-batch-size", 0));
  const positionBatchIndex = Math.max(1, argInt("--position-batch-index", 1));

  const [addresses, documentsAll, fibuAll, wagesAll] = await Promise.all([
    readDbf(source, ["Adressen", "ADRESSEN.DBF"]),
    readDbf(source, ["Daten", "DOKUMENT.DBF"]),
    readDbf(source, ["Fibu", "FIBUZWO.DBF"]),
    readDbf(source, ["Lohn", "LOHNBUCH.DBF"]),
  ]);

  const documents2026 = documentsAll.filter((row) =>
    rowBelongsToYear(row, year, ["DATUM", "ERSTELLDAT", "POSTAUSDAT"], ["TYPUNDNR", "NAME", "PROJNAME"]),
  );
  const fibu2026 = fibuAll.filter((row) =>
    rowBelongsToYear(row, year, ["BELEGDAT", "RECHDAT", "ERFASSTDAT", "FAELLIGDAT", "ZAHLDAT", "SKONTODAT", "STORNODAT"], ["RNR", "KTR"]),
  );
  const wages2026 = wagesAll.filter((row) =>
    rowBelongsToYear(row, year, ["TAG", "BUCHTAG"], ["KTR"]),
  );

  const documentByName = new Map(documentsAll.map((row) => [S(row.NAME).toUpperCase(), row]));
  const documents2026ByName = new Map(documents2026.map((row) => [S(row.NAME).toUpperCase(), row]));
  const childDocumentParentNames = new Set(
    documents2026.map((row) => S(row.BEZUGNAME).toUpperCase()).filter(Boolean),
  );
  const positionFiles = new Set<string>();
  await Promise.all(documents2026.map(async (row) => {
    const name = S(row.NAME).toUpperCase();
    if (name && await dbfExists(path.join(source, "Daten", `${S(row.NAME)}.DBF`))) {
      positionFiles.add(name);
    }
  }));
  const folderReplacementRows = documents2026.filter((row) =>
    isHapakFreeDocumentFolderReplacement(row, positionFiles, childDocumentParentNames),
  );
  const folderReplacementNames = new Set(folderReplacementRows.map((row) => S(row.NAME).toUpperCase()));
  const relevantCustomerNumbers = new Set<string>();
  const projectSourceRows = new Map<string, Row>();
  const issues: StageIssue[] = [];

  for (const row of documents2026) {
    if (S(row.KUNDE)) relevantCustomerNumbers.add(S(row.KUNDE));
    if (S(row.PROJNAME) && !projectSourceRows.has(S(row.PROJNAME))) projectSourceRows.set(S(row.PROJNAME), row);
  }
  for (const row of fibu2026) {
    if (N(row.IDX) === 0 && S(row.ADR_NR)) relevantCustomerNumbers.add(S(row.ADR_NR));
    const projectKey = S(row.KTR);
    if (projectKey && !projectSourceRows.has(projectKey)) {
      const directProjectRow = documentByName.get(projectKey.toUpperCase());
      const referencedProjectRow = directProjectRow || documentsAll.find((doc) => S(doc.PROJNAME) === projectKey);
      if (referencedProjectRow) projectSourceRows.set(projectKey, referencedProjectRow);
    }
  }
  for (const row of projectSourceRows.values()) {
    if (S(row.KUNDE)) relevantCustomerNumbers.add(S(row.KUNDE));
  }
  for (const row of wages2026) {
    if (S(row.KNDNR)) relevantCustomerNumbers.add(S(row.KNDNR));
  }

  const customers = addresses
    .filter((row) => relevantCustomerNumbers.has(S(row.KU_NR)))
    .map((row) => ({
      customerNumber: S(row.KU_NR),
      contactType: mapContactType(row),
      searchKey: S(row.SUCH) || S(row.KU_NR),
      name: [S(row.FA_TITEL), S(row.NAME)].filter(Boolean).join(" ") || S(row.NAME2) || S(row.KU_NR),
      name2: S(row.NAME2) || null,
      salutation: S(row.HERRFRAU) || null,
      street: S(row.STRASSE) || null,
      zip: S(row.PLZ) || null,
      city: S(row.ORT) || null,
      country: S(row.LAND) || null,
      phone: S(row.TEL) || null,
      fax: S(row.FAX) || null,
      mobile: S(row.FUNK_PRIV) || null,
      email: S(row.EMAIL) || null,
      website: S(row.WWW) || null,
      iban: S(row.IBAN) || null,
      bic: S(row.SWIFT) || null,
      bank: S(row.BANK) || null,
      accountHolder: S(row.KONTOINH) || null,
      taxId: S(row.USTIDNR) || null,
      paymentTermDays: N(row.ZAHLZIEL) > 0 ? N(row.ZAHLZIEL) : 14,
      skontoDays: N(row.SKONTOTAGE),
      skontoPercent: N(row.SKONTO),
      discount: N(row.RABATT),
      branche: S(row.BRANCHE) || null,
      grossInvoicing: B(row.BRUTTOFAKT),
      noReminder: B(row.DONTMAHN),
      revenueAccount: S(row.FIBUNR) || null,
      source: { table: "ADRESSEN", key: S(row.KU_NR) },
    }));

  const projects = [...projectSourceRows.entries()].map(([projectKey, row]) => ({
    hapakProjectKey: projectKey,
    importSource: "hapak",
    importSourceKey: projectKey,
    visibleProjectNumber: projectNumberFromKey(projectKey, row.DATUM),
    projectNumber: projectNumberFromKey(projectKey, row.DATUM),
    customerNumber: S(row.KUNDE),
    name: S(row.BETREFF) || S(row.TYPUNDNR) || projectKey,
    shortName: S(row.BETREFF) || null,
    status: "aktiv",
    startDate: isoDate(row.DATUM),
    description: S(row.BEMERKUNG) || null,
    source: { table: "DOKUMENT", key: S(row.NAME), projectKey },
  }));

  const documents = documents2026
    .filter((row) => mapDocumentType(row) !== "projektkopf")
    .filter((row) => !folderReplacementNames.has(S(row.NAME).toUpperCase()))
    .map((row): StageDocument => {
      const type = mapDocumentType(row);
      const netTotal = N(row.NETTO);
      const grossTotal = N(row.BETRAG);
      const taxAmount = N(row.MWST) || grossTotal - netTotal;
      return {
        hapakName: S(row.NAME),
        importSource: "hapak",
        importSourceKey: S(row.NAME),
        visibleDocumentNumber: humanDocumentNumber(row),
        documentNumber: humanDocumentNumber(row),
        type,
        customerNumber: S(row.KUNDE),
        projectKey: S(row.PROJNAME),
        parentHapakName: S(row.BEZUGNAME),
        subject: S(row.BETREFF),
        date: isoDate(row.DATUM) || `${year}-01-01`,
        validUntil: isoDate(row.GUELTIGBIS) || null,
        status: mapDocStatus(row, type),
        netTotal,
        taxRate: N(row.MWSTSATZ) || 19,
        taxAmount,
        grossTotal,
        customTypeLabel: customTypeLabel(row, type),
        source: { table: "DOKUMENT", typUndNr: S(row.TYPUNDNR), id: S(row.ID) },
      };
    });

  const folderReplacementTree = folderReplacementRows
    .filter((row) => S(row.PROJNAME))
    .map((row, idx) => ({
      projectKey: S(row.PROJNAME),
      documentNumber: null,
      importSourceKey: S(row.NAME),
      parentDocumentNumber: S(row.BEZUGNAME) || null,
      parentHapakName: S(row.BEZUGNAME) || null,
      nodeType: "folder",
      folderName: cleanHapakFolderName(row),
      sortOrder: idx,
      source: { table: "DOKUMENT", key: S(row.NAME), typUndNr: S(row.TYPUNDNR), folderReplacement: true },
    }));

  const documentTree = [
    ...folderReplacementTree,
    ...documents
    .filter((doc) => doc.projectKey)
    .map((doc, idx) => ({
      projectKey: doc.projectKey,
      documentNumber: doc.documentNumber,
      importSourceKey: doc.importSourceKey,
      parentDocumentNumber: doc.parentHapakName || null,
      parentHapakName: doc.parentHapakName || null,
      nodeType: "document",
      sortOrder: folderReplacementTree.length + idx,
      source: { table: "DOKUMENT", key: doc.hapakName },
    })),
  ];

  if (folderReplacementRows.length > 0) {
    issues.push({
      severity: "info",
      code: "hapak_free_document_folder_replacements",
      message: `${folderReplacementRows.length} leere freie HAPAK-Dokumente mit Kind-Dokumenten werden als Projektordner statt als Arbeitsdokumente uebernommen.`,
      examples: folderReplacementRows.slice(0, 20).map((row) => `${S(row.NAME)} | ${S(row.TYPUNDNR) || S(row.BETREFF)}`),
    });
  }

  for (const doc of documents) {
    if (doc.parentHapakName && !documentByName.has(doc.parentHapakName.toUpperCase())) {
      issues.push({
        severity: "warning",
        code: "missing_parent_document",
        message: `Parent-Dokument ${doc.parentHapakName} fuer ${doc.documentNumber} fehlt in DOKUMENT.`,
      });
    }
    if (doc.projectKey && !projectSourceRows.has(doc.projectKey)) {
      issues.push({
        severity: "warning",
        code: "missing_project_source",
        message: `Projekt ${doc.projectKey} fuer ${doc.documentNumber} wurde nicht als Projektquelle erkannt.`,
      });
    }
  }

  const documentImportKeyCounts = new Map<string, number>();
  for (const doc of documents) {
    documentImportKeyCounts.set(doc.importSourceKey, (documentImportKeyCounts.get(doc.importSourceKey) || 0) + 1);
  }
  const duplicateDocumentImportKeys = [...documentImportKeyCounts.entries()].filter(([, count]) => count > 1);
  if (duplicateDocumentImportKeys.length > 0) {
    issues.push({
      severity: "error",
      code: "duplicate_document_import_key",
      message: `${duplicateDocumentImportKeys.length} HAPAK-Dokumentidentitaeten kommen mehrfach vor und muessen vor einem Import eindeutig sein.`,
      examples: duplicateDocumentImportKeys.slice(0, 20).map(([number, count]) => `${number} (${count}x)`),
    });
  }

  const documentNumberCounts = new Map<string, number>();
  for (const doc of documents) {
    documentNumberCounts.set(doc.documentNumber, (documentNumberCounts.get(doc.documentNumber) || 0) + 1);
  }
  const duplicateDocumentNumbers = [...documentNumberCounts.entries()].filter(([, count]) => count > 1);
  if (duplicateDocumentNumbers.length > 0) {
    issues.push({
      severity: "info",
      code: "duplicate_visible_document_number",
      message: `${duplicateDocumentNumbers.length} sichtbare Dokumentnummern kommen mehrfach vor. Das ist HAPAK-konform; eindeutig ist importSourceKey/hapakName.`,
      examples: duplicateDocumentNumbers.slice(0, 20).map(([number, count]) => `${number} (${count}x)`),
    });
  }

  const fibuEntries = fibu2026.map((row) => mapFibuRow(row, documents2026ByName));
  const fibu = fibuEntries.filter((row) => row.idx === 0);

  const wages = wages2026.map((row, idx) => ({
    sourceIndex: idx,
    projectKey: S(row.KTR),
    customerNumber: S(row.KNDNR),
    employeeNumber: S(row.PERSNR),
    date: isoDate(row.TAG) || isoDate(row.BUCHTAG),
    text: S(row.BUCHTEXT) || S(row.TEXT),
    hours: N(row.STUNDEN) || N(row.MENGE),
    wageType: S(row.LOART) || null,
    source: { table: "LOHNBUCH" },
  }));

  const allPositionDocuments = documents.filter((doc) => {
    if (doc.type === "eingangsrechnung") return false;
    if (positionDocumentFilters.size === 0) return true;
    const candidates = [
      doc.hapakName,
      doc.importSourceKey,
      doc.documentNumber,
      doc.visibleDocumentNumber,
      doc.source?.typUndNr,
    ].map((value) => normalizeFilterValue(String(value || "")));
    return candidates.some((candidate) =>
      [...positionDocumentFilters].some((filter) => candidate === filter || candidate.includes(filter)),
    );
  });
  if (positionDocumentFilters.size > 0 && allPositionDocuments.length === 0) {
    issues.push({
      severity: "warning",
      code: "position_document_filter_empty",
      message: `Kein Dokument passt zum Positionsfilter: ${[...positionDocumentFilters].join(", ")}`,
    });
  }
  if (positionBatchSize > 0 && positionBatchIndex < 1) {
    issues.push({
      severity: "warning",
      code: "position_batch_index_invalid",
      message: "--position-batch-index muss bei 1 beginnen. Es wird Batch 1 verwendet.",
    });
  }
  const positionBatchStart = positionBatchSize > 0 ? (positionBatchIndex - 1) * positionBatchSize : 0;
  const positionBatchEnd = positionBatchSize > 0 ? positionBatchStart + positionBatchSize : allPositionDocuments.length;
  const positionDocuments = positionBatchSize > 0
    ? allPositionDocuments.slice(positionBatchStart, positionBatchEnd)
    : allPositionDocuments;
  if (positionBatchSize > 0 && positionDocuments.length === 0 && allPositionDocuments.length > 0) {
    issues.push({
      severity: "warning",
      code: "position_batch_empty",
      message: `Positions-Batch ${positionBatchIndex} ist leer. Es gibt ${allPositionDocuments.length} passende Dokumente.`,
    });
  }
  const positions = await mapWithConcurrency(positionDocuments, mapPositions ? 8 : 16, async (doc) => (
    mapPositions
      ? mapPositionFile(source, doc.hapakName, doc.importSourceKey)
      : inspectPositionFile(source, doc.hapakName, inspectPositions)
  ));

  const validStandalone = documents.filter((doc) => acceptedStandaloneFreeDocuments.has(doc.documentNumber.toUpperCase()));
  for (const doc of validStandalone) {
    issues.push({
      severity: "info",
      code: "accepted_standalone_free_document",
      message: `${doc.documentNumber} ist als korrektes eigenstaendiges freies Dokument markiert.`,
    });
  }

  const stage: Stage = {
    source,
    year,
    generatedAt: new Date().toISOString(),
    readonly: true,
    acceptedStandaloneFreeDocuments: [...acceptedStandaloneFreeDocuments],
    counts: {
      customers: customers.length,
      projects: projects.length,
      documents: documents.length,
      documentTree: documentTree.length,
      fibu: fibu.length,
      fibuEntries: fibuEntries.length,
      fibuDetailEntries: fibuEntries.filter((row) => row.idx > 0).length,
      fibuOutgoing: fibu.filter((row) => row.art === "RA").length,
      fibuIncoming: fibu.filter((row) => row.art === "RE").length,
      wages: wages.length,
      positionFilesPresent: positions.filter((row) => row.present).length,
      positionFilesMissing: positions.filter((row) => !row.present).length,
      positionItems: positions.reduce((sum, row) => sum + (Array.isArray(row.items) ? row.items.length : 0), 0),
      positionMappedDocuments: positions.filter((row) => Array.isArray(row.items) && row.items.length > 0).length,
      positionDocumentFilters: positionDocumentFilters.size,
      positionCandidateDocuments: allPositionDocuments.length,
      positionBatchSize,
      positionBatchIndex,
      positionBatchStart,
      positionBatchEnd: Math.min(positionBatchEnd, allPositionDocuments.length),
    },
    customers,
    projects,
    documents,
    documentTree,
    fibu,
    fibuEntries,
    wages,
    positions,
    issues,
  };

  const out = argValue("--out");
  const json = JSON.stringify(stage, null, 2);
  if (out) {
    await fs.writeFile(out, json, "utf8");
    console.log(`HAPAK Staging ${year} geschrieben: ${out}`);
  } else {
    console.log(json);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
