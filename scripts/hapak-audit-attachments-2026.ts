import fs from "node:fs/promises";
import path from "node:path";
import { DBFFile } from "dbffile";

type Row = Record<string, any>;

type AttachmentFile = {
  relativePath: string;
  extension: string;
  size: number;
  modifiedAt: string;
};

type AttachmentAudit = {
  source: string;
  year: number;
  generatedAt: string;
  readonly: true;
  counts: {
    fibuIncomingMainRows: number;
    dmsRows: number;
    doklinkRows: number;
    physicalAttachmentFiles: number;
    physicalAttachmentBytes: number;
    doklinkRowsMatching2026Documents: number;
    incomingMainRowsWithDirectAttachmentReference: number;
  };
  tables: Record<string, { path: string; rows: number; missing?: boolean }>;
  examples: {
    incomingRows: any[];
    doklinkRows: any[];
    physicalFiles: AttachmentFile[];
    missingAttachmentEvidence: string[];
  };
  issues: Array<{
    severity: "info" | "warning" | "error";
    code: string;
    message: string;
    examples?: string[];
  }>;
  nextRecommendedSteps: string[];
};

function argValue(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  const prefixed = process.argv.find((a) => a.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : null;
}

function hasArg(name: string): boolean {
  return process.argv.includes(name) || process.argv.some((a) => a.startsWith(`${name}=`));
}

function S(value: unknown): string {
  const raw = value == null ? "" : String(value).trim();
  return raw.toUpperCase() === "NULL" ? "" : raw;
}

function N(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(S(value).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
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

function rowBelongsToFibuYear(row: Row, year: number): boolean {
  return ["BELEGDAT", "RECHDAT", "ERFASSTDAT", "FAELLIGDAT", "ZAHLDAT", "SKONTODAT", "STORNODAT"].some((field) => yearOf(row[field]) === year)
    || ["RNR", "KTR", "BETREFF"].some((field) => valueBelongsToNumberYear(row[field], year));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readDbf(root: string, relativeParts: string[], audit: AttachmentAudit, tableName: string): Promise<Row[]> {
  const dbfPath = path.join(root, ...relativeParts);
  const present = await fileExists(dbfPath);
  audit.tables[tableName] = { path: dbfPath, rows: 0, missing: !present };
  if (!present) return [];
  const dbf = await DBFFile.open(dbfPath, { encoding: "cp1252", readMode: "loose" } as any);
  const rows = (await dbf.readRecords(dbf.recordCount)) as Row[];
  audit.tables[tableName] = { path: dbfPath, rows: rows.length };
  return rows;
}

async function walkFiles(root: string, base = root): Promise<AttachmentFile[]> {
  const result: AttachmentFile[] = [];
  let entries: Array<import("node:fs").Dirent>;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...await walkFiles(full, base));
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (![".pdf", ".xml", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff", ".bmp", ".lnk"].includes(ext)) continue;
    const stat = await fs.stat(full);
    result.push({
      relativePath: path.relative(base, full).replace(/\\/g, "/"),
      extension: ext,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    });
  }
  return result;
}

function rowHasAttachmentReference(row: Row): boolean {
  const values = Object.values(row).map(S).filter(Boolean);
  return values.some((value) =>
    /\.(pdf|xml|jpe?g|png|webp|gif|tiff?|bmp|lnk)\b/i.test(value)
      || /^[A-Z]:\\/i.test(value)
      || /^\\\\/.test(value)
      || /(^|[\\/])(dms|scan|beleg|archiv)([\\/]|$)/i.test(value),
  );
}

async function main(): Promise<void> {
  const source = path.resolve(argValue("--source") || path.join(process.cwd(), "hapak_snapshot_readonly_2026"));
  const year = Number(argValue("--year") || "2026");
  const json = hasArg("--json");

  const audit: AttachmentAudit = {
    source,
    year,
    generatedAt: new Date().toISOString(),
    readonly: true,
    counts: {
      fibuIncomingMainRows: 0,
      dmsRows: 0,
      doklinkRows: 0,
      physicalAttachmentFiles: 0,
      physicalAttachmentBytes: 0,
      doklinkRowsMatching2026Documents: 0,
      incomingMainRowsWithDirectAttachmentReference: 0,
    },
    tables: {},
    examples: {
      incomingRows: [],
      doklinkRows: [],
      physicalFiles: [],
      missingAttachmentEvidence: [],
    },
    issues: [],
    nextRecommendedSteps: [],
  };

  const fibuRows = await readDbf(source, ["Fibu", "FIBUZWO.DBF"], audit, "FIBUZWO");
  const documentRows = await readDbf(source, ["Daten", "DOKUMENT.DBF"], audit, "DOKUMENT");
  const dmsRows = await readDbf(source, ["Daten", "DMS.DBF"], audit, "DMS");
  const doklinkRows = await readDbf(source, ["Daten", "DOKLINK.DBF"], audit, "DOKLINK");
  const attachmentFiles = await walkFiles(source);

  const incomingRows = fibuRows.filter((row) => S(row.ART) === "RE" && N(row.IDX) === 0 && rowBelongsToFibuYear(row, year));
  const documentNames2026 = new Set(
    documentRows
      .filter((row) => yearOf(row.DATUM) === year || valueBelongsToNumberYear(row.TYPUNDNR, year) || valueBelongsToNumberYear(row.NAME, year))
      .map((row) => S(row.NAME)),
  );
  const matchingDoklinks = doklinkRows.filter((row) => documentNames2026.has(S(row.NAME)));
  const incomingRowsWithReference = incomingRows.filter(rowHasAttachmentReference);

  audit.counts.fibuIncomingMainRows = incomingRows.length;
  audit.counts.dmsRows = dmsRows.length;
  audit.counts.doklinkRows = doklinkRows.length;
  audit.counts.physicalAttachmentFiles = attachmentFiles.length;
  audit.counts.physicalAttachmentBytes = attachmentFiles.reduce((sum, file) => sum + file.size, 0);
  audit.counts.doklinkRowsMatching2026Documents = matchingDoklinks.length;
  audit.counts.incomingMainRowsWithDirectAttachmentReference = incomingRowsWithReference.length;

  audit.examples.incomingRows = incomingRows.slice(0, 8).map((row) => ({
    reId: N(row.RE_ID),
    rnr: S(row.RNR),
    supplierNumber: S(row.ADR_NR),
    supplier: S(row.ADR_SUCH),
    subject: S(row.BETREFF),
    date: isoDate(row.BELEGDAT),
    grossTotal: N(row.BETRAG),
    netTotal: N(row.NETTO),
    openAmount: N(row.OFFEN),
    projectKey: S(row.KTR),
  }));
  audit.examples.doklinkRows = doklinkRows.slice(0, 8).map((row) => ({
    id: S(row.ID),
    name: S(row.NAME),
    partnerId: S(row.PARTNERID),
    guid: S(row.GUID),
  }));
  audit.examples.physicalFiles = attachmentFiles.slice(0, 12);

  if (attachmentFiles.length === 0) {
    audit.issues.push({
      severity: "warning",
      code: "no_physical_attachment_files_in_snapshot",
      message: "Im lokalen HAPAK-Snapshot wurden keine PDF/XML/Bild/LNK-Dateien gefunden. Beleganhaenge koennen damit noch nicht importiert werden.",
    });
    audit.examples.missingAttachmentEvidence.push("Dateisuche im Snapshot fand nur DBF/FPT-Dateien, keine Belegdateien.");
  }

  if (dmsRows.length === 0) {
    audit.issues.push({
      severity: "info",
      code: "dms_table_empty",
      message: "DMS.DBF ist vorhanden, enthaelt aber keine Datensaetze.",
    });
  }

  if (matchingDoklinks.length === 0) {
    audit.issues.push({
      severity: "info",
      code: "doklink_no_2026_document_matches",
      message: "DOKLINK.DBF enthaelt keine erkennbaren Links zu 2026-Dokumenten.",
      examples: audit.examples.doklinkRows.map((row) => `${row.name} ${row.guid}`),
    });
  }

  if (incomingRowsWithReference.length === 0) {
    audit.issues.push({
      severity: "info",
      code: "incoming_fibu_has_no_direct_file_reference",
      message: "Die 2026-RE-Hauptsaetze in FIBUZWO enthalten keine direkten PDF-/Scanpfade.",
    });
  }

  audit.nextRecommendedSteps = [
    "NAS-Snapshot um HAPAK-Beleg-/Archivordner erweitern und dieses Audit erneut ausfuehren.",
    "Wenn physische Dateien vorhanden sind: Matching nach RNR, ADR_NR/ADR_SUCH, BELEGDAT und Betrag gegen FIBUZWO vorbereiten.",
    "Danach Belegdateien in document_attachments importieren, statt PDF-Dateien nur als losen pdf_path am manuellen Rechnungseingang zu speichern.",
  ];

  if (json) {
    console.log(JSON.stringify(audit, null, 2));
    return;
  }

  console.log(`HAPAK attachment audit ${year}`);
  console.log(`Source: ${source}`);
  console.log(`Incoming RE main rows: ${audit.counts.fibuIncomingMainRows}`);
  console.log(`DMS rows: ${audit.counts.dmsRows}`);
  console.log(`DOKLINK rows: ${audit.counts.doklinkRows}`);
  console.log(`Physical attachment files: ${audit.counts.physicalAttachmentFiles}`);
  for (const issue of audit.issues) console.log(`[${issue.severity}] ${issue.code}: ${issue.message}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
