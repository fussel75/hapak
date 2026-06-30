import fs from "node:fs/promises";
import path from "node:path";
import { DBFFile } from "dbffile";

type Row = Record<string, any>;

type Issue = {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  examples?: string[];
};

type Summary = {
  source: string;
  year: number;
  generatedAt: string;
  readonly: true;
  tables: Record<string, { path: string; rows: number; rows2026?: number; missing?: boolean }>;
  counts: {
    customersRelevant: number;
    projects: number;
    projectHeads: number;
    documents: number;
    documentsByType: Record<string, number>;
    fibuRows: number;
    fibuMainRows: number;
    fibuByArtTyp: Record<string, number>;
    incomingInvoices: number;
    timeRows: number;
    positionFilesExpected: number;
    positionFilesFound: number;
  };
  freeDocuments: {
    total: number;
    withPositionFile: number;
    validStandalone: number;
    likelyFolder: number;
    emptyUnclear: number;
    examplesValidStandalone: string[];
    examplesLikelyFolder: string[];
    examplesEmptyUnclear: string[];
  };
  mappings: {
    documentsWithProject: number;
    documentsWithoutProject: number;
    documentsWithCustomer: number;
    documentsWithoutCustomer: number;
    fibuLinkedToDocument: number;
    fibuWithoutDocument: number;
    fibuWithoutDocumentIncoming: number;
    fibuWithoutDocumentOutgoing: number;
    documentsWithoutFibuForInvoiceTypes: number;
    documentTreeEdges: number;
    missingTreeParents: number;
  };
  samples: {
    projects: any[];
    documents: any[];
    fibuMainRows: any[];
    fibuWithoutDocument: any[];
    incomingInvoices: any[];
    missingPositionFiles: any[];
  };
  importPlan: {
    step: number;
    source: string;
    target: string;
    mode: "upsert" | "insert" | "link";
    count: number;
    note: string;
  }[];
  issues: Issue[];
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
  const normalized = S(value).replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
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

function isPlausibleDate(value: unknown): boolean {
  const y = yearOf(value);
  return y == null || (y >= 1990 && y <= 2035);
}

function addCount(target: Record<string, number>, key: string): void {
  target[key] = (target[key] || 0) + 1;
}

function firstExisting(root: string, candidates: string[]): string {
  return path.join(root, ...candidates);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readDbf(root: string, relativeParts: string[], tableName: string, summary: Summary): Promise<Row[]> {
  const dbfPath = firstExisting(root, relativeParts);
  const present = await exists(dbfPath);
  summary.tables[tableName] = { path: dbfPath, rows: 0, missing: !present };
  if (!present) {
    summary.issues.push({
      severity: "warning",
      code: "table_missing",
      message: `${tableName} fehlt: ${dbfPath}`,
    });
    return [];
  }

  const dbf = await DBFFile.open(dbfPath, { encoding: "cp1252", readMode: "loose" } as any);
  const rows = await dbf.readRecords(dbf.recordCount);
  summary.tables[tableName].rows = rows.length;
  return rows as Row[];
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

async function collectPositionFiles(root: string): Promise<Set<string>> {
  const dataDir = path.join(root, "Daten");
  const files = await fs.readdir(dataDir).catch(() => []);
  return new Set(files.filter((f) => /\.dbf$/i.test(f)).map((f) => f.replace(/\.dbf$/i, "").toUpperCase()));
}

function sample<T>(items: T[], max = 10): T[] {
  return items.slice(0, max);
}

function mainRowKey(row: Row): string {
  return `${S(row.ART) || "?"}/${S(row.TYP) || "?"}`;
}

const acceptedStandaloneFreeDocuments = new Set([
  // Vom Anwender bestätigt: korrektes freies Dokument, kein Ordner- oder Fehlerfall.
  "P7283433",
]);

async function run(): Promise<void> {
  if (hasArg("--help") || hasArg("-h")) {
    console.log("Usage: npx tsx scripts/hapak-import-analysis-2026.ts --source <HAPAK-FB-ZuB-root> [--year 2026] [--out report.json]");
    console.log("Read-only: parses local DBF/FPT files and writes only the optional JSON report.");
    return;
  }

  const source = argValue("--source");
  if (!source) throw new Error("Bitte --source angeben, z.B. --source \"D:\\\\HAPAK-Snapshot\\\\FB ZuB\"");
  const year = Number(argValue("--year") || "2026");
  if (!Number.isInteger(year) || year < 2000 || year > 2099) throw new Error("--year muss ein gueltiges Jahr sein");

  const summary: Summary = {
    source,
    year,
    generatedAt: new Date().toISOString(),
    readonly: true,
    tables: {},
    counts: {
      customersRelevant: 0,
      projects: 0,
      projectHeads: 0,
      documents: 0,
      documentsByType: {},
      fibuRows: 0,
      fibuMainRows: 0,
      fibuByArtTyp: {},
      incomingInvoices: 0,
      timeRows: 0,
      positionFilesExpected: 0,
      positionFilesFound: 0,
    },
    freeDocuments: {
      total: 0,
      withPositionFile: 0,
      validStandalone: 0,
      likelyFolder: 0,
      emptyUnclear: 0,
      examplesValidStandalone: [],
      examplesLikelyFolder: [],
      examplesEmptyUnclear: [],
    },
    mappings: {
      documentsWithProject: 0,
      documentsWithoutProject: 0,
      documentsWithCustomer: 0,
      documentsWithoutCustomer: 0,
      fibuLinkedToDocument: 0,
      fibuWithoutDocument: 0,
      fibuWithoutDocumentIncoming: 0,
      fibuWithoutDocumentOutgoing: 0,
      documentsWithoutFibuForInvoiceTypes: 0,
      documentTreeEdges: 0,
      missingTreeParents: 0,
    },
    samples: {
      projects: [],
      documents: [],
      fibuMainRows: [],
      fibuWithoutDocument: [],
      incomingInvoices: [],
      missingPositionFiles: [],
    },
    importPlan: [],
    issues: [],
  };

  const [addresses, documentsAll, fibuAll, wagesAll] = await Promise.all([
    readDbf(source, ["Adressen", "ADRESSEN.DBF"], "ADRESSEN", summary),
    readDbf(source, ["Daten", "DOKUMENT.DBF"], "DOKUMENT", summary),
    readDbf(source, ["Fibu", "FIBUZWO.DBF"], "FIBUZWO", summary),
    readDbf(source, ["Lohn", "LOHNBUCH.DBF"], "LOHNBUCH", summary),
  ]);
  const positionFiles = await collectPositionFiles(source);

  const documents2026 = documentsAll.filter((r) =>
    rowBelongsToYear(r, year, ["DATUM", "ERSTELLDAT", "POSTAUSDAT"], ["TYPUNDNR", "NAME", "PROJNAME"]),
  );
  const fibu2026 = fibuAll.filter((r) =>
    rowBelongsToYear(r, year, ["BELEGDAT", "RECHDAT", "ERFASSTDAT"], ["RNR", "KTR"]),
  );
  const wages2026 = wagesAll.filter((r) =>
    rowBelongsToYear(r, year, ["TAG", "BUCHTAG"], ["KTR"]),
  );
  summary.tables.DOKUMENT.rows2026 = documents2026.length;
  summary.tables.FIBUZWO.rows2026 = fibu2026.length;
  summary.tables.LOHNBUCH.rows2026 = wages2026.length;

  const documentByName = new Map(documentsAll.map((r) => [S(r.NAME).toUpperCase(), r]));
  const doc2026Names = new Set(documents2026.map((r) => S(r.NAME).toUpperCase()).filter(Boolean));
  const customersRelevant = new Set<string>();
  const projects = new Map<string, Row>();
  const treeParentNames = new Set<string>();

  for (const row of documents2026) {
    const type = mapDocumentType(row);
    const name = S(row.NAME).toUpperCase();
    const proj = S(row.PROJNAME);
    const customer = S(row.KUNDE);
    const parent = S(row.BEZUGNAME).toUpperCase();

    if (customer) customersRelevant.add(customer);
    if (proj) {
      summary.mappings.documentsWithProject++;
      if (!projects.has(proj)) projects.set(proj, row);
    } else {
      summary.mappings.documentsWithoutProject++;
    }
    if (customer) summary.mappings.documentsWithCustomer++;
    else summary.mappings.documentsWithoutCustomer++;
    if (parent) {
      summary.mappings.documentTreeEdges++;
      treeParentNames.add(parent);
    }

    summary.counts.documents++;
    addCount(summary.counts.documentsByType, type);
    if (type === "projektkopf") summary.counts.projectHeads++;

    const hasPositionFile = positionFiles.has(name);
    if (type !== "projektkopf" && type !== "eingangsrechnung") {
      summary.counts.positionFilesExpected++;
      if (hasPositionFile) summary.counts.positionFilesFound++;
      else if (summary.samples.missingPositionFiles.length < 20) {
        summary.samples.missingPositionFiles.push({
          hapakName: S(row.NAME),
          number: humanDocumentNumber(row),
          type,
          subject: S(row.BETREFF),
          date: isoDate(row.DATUM),
        });
      }
    }

    if (type === "freies_dokument") {
      summary.freeDocuments.total++;
      if (hasPositionFile) summary.freeDocuments.withPositionFile++;
      const hasChildren = documentsAll.some((d) => S(d.BEZUGNAME).toUpperCase() === name);
      const hasMoney = Math.abs(N(row.NETTO)) > 0.005 || Math.abs(N(row.BETRAG)) > 0.005;
      const likelyFolder = !hasMoney && !hasPositionFile && hasChildren;
      if (!hasPositionFile && acceptedStandaloneFreeDocuments.has(name)) {
        summary.freeDocuments.validStandalone++;
        if (summary.freeDocuments.examplesValidStandalone.length < 10) {
          summary.freeDocuments.examplesValidStandalone.push(`${S(row.NAME)} | ${S(row.TYPUNDNR) || S(row.BETREFF)}`);
        }
      } else if (likelyFolder) {
        summary.freeDocuments.likelyFolder++;
        if (summary.freeDocuments.examplesLikelyFolder.length < 10) {
          summary.freeDocuments.examplesLikelyFolder.push(`${S(row.NAME)} | ${S(row.TYPUNDNR) || S(row.BETREFF)}`);
        }
      } else if (!hasMoney && !hasPositionFile) {
        summary.freeDocuments.emptyUnclear++;
        if (summary.freeDocuments.examplesEmptyUnclear.length < 10) {
          summary.freeDocuments.examplesEmptyUnclear.push(`${S(row.NAME)} | ${S(row.TYPUNDNR) || S(row.BETREFF)}`);
        }
      }
    }
  }

  const fibuMainByRnr = new Map<string, Row[]>();
  for (const row of fibu2026) {
    summary.counts.fibuRows++;
    const idx = N(row.IDX);
    if (idx === 0) {
      summary.counts.fibuMainRows++;
      addCount(summary.counts.fibuByArtTyp, mainRowKey(row));
      const rnr = S(row.RNR).toUpperCase();
      if (rnr) {
        const arr = fibuMainByRnr.get(rnr) || [];
        arr.push(row);
        fibuMainByRnr.set(rnr, arr);
      }
      if (S(row.ART) === "RE") summary.counts.incomingInvoices++;
      if (S(row.ADR_NR)) customersRelevant.add(S(row.ADR_NR));
    }
  }

  for (const [rnr, rows] of fibuMainByRnr) {
    if (documentByName.has(rnr)) summary.mappings.fibuLinkedToDocument += rows.length;
    else {
      summary.mappings.fibuWithoutDocument += rows.length;
      for (const row of rows) {
        if (S(row.ART) === "RE") summary.mappings.fibuWithoutDocumentIncoming++;
        else summary.mappings.fibuWithoutDocumentOutgoing++;
        if (summary.samples.fibuWithoutDocument.length < 20) {
          summary.samples.fibuWithoutDocument.push({
            reId: N(row.RE_ID),
            art: S(row.ART),
            typ: S(row.TYP),
            rnr: S(row.RNR),
            projectKey: S(row.KTR),
            customerNumber: S(row.ADR_NR),
            date: isoDate(row.BELEGDAT) || isoDate(row.RECHDAT),
            net: N(row.NETTO),
            gross: N(row.BRUTTO) || N(row.BETRAG),
            paid: N(row.ZAHLUNG),
            open: N(row.OFFEN),
          });
        }
      }
    }
  }

  for (const row of documents2026) {
    const type = mapDocumentType(row);
    if (["rechnung", "abschlagsrechnung", "schlussrechnung", "gutschrift"].includes(type)) {
      if (!fibuMainByRnr.has(S(row.NAME).toUpperCase())) summary.mappings.documentsWithoutFibuForInvoiceTypes++;
    }
  }

  for (const parentName of treeParentNames) {
    if (!documentByName.has(parentName)) summary.mappings.missingTreeParents++;
  }

  for (const row of wages2026) {
    summary.counts.timeRows++;
    if (S(row.KNDNR)) customersRelevant.add(S(row.KNDNR));
    if (!isPlausibleDate(row.TAG)) {
      summary.issues.push({
        severity: "warning",
        code: "implausible_wage_date",
        message: `Unplausibles Lohn-Datum in LOHNBUCH: ${S(row.TAG)}`,
        examples: [S(row.PERSNR), S(row.KTR), S(row.BUCHTEXT)],
      });
    }
  }

  summary.counts.customersRelevant = addresses.filter((r) => customersRelevant.has(S(r.KU_NR))).length;
  summary.counts.projects = projects.size;

  summary.samples.projects = sample([...projects.entries()].map(([key, row]) => ({
    hapakProjectKey: key,
    projectNumber: projectNumberFromKey(key, row.DATUM),
    customerNumber: S(row.KUNDE),
    name: S(row.BETREFF),
    date: isoDate(row.DATUM),
  })));
  summary.samples.documents = sample(documents2026.map((row) => ({
    hapakName: S(row.NAME),
    number: humanDocumentNumber(row),
    type: mapDocumentType(row),
    projectKey: S(row.PROJNAME),
    customerNumber: S(row.KUNDE),
    parentName: S(row.BEZUGNAME),
    subject: S(row.BETREFF),
    date: isoDate(row.DATUM),
    net: N(row.NETTO),
    gross: N(row.BETRAG),
  })));
  summary.samples.fibuMainRows = sample(fibu2026.filter((r) => N(r.IDX) === 0).map((row) => ({
    reId: N(row.RE_ID),
    art: S(row.ART),
    typ: S(row.TYP),
    rnr: S(row.RNR),
    projectKey: S(row.KTR),
    customerNumber: S(row.ADR_NR),
    date: isoDate(row.BELEGDAT) || isoDate(row.RECHDAT),
    net: N(row.NETTO),
    gross: N(row.BRUTTO) || N(row.BETRAG),
    paid: N(row.ZAHLUNG),
    open: N(row.OFFEN),
    storno: N(row.STORNOFLAG),
  })));
  summary.samples.incomingInvoices = sample(fibu2026.filter((r) => N(r.IDX) === 0 && S(r.ART) === "RE").map((row) => ({
    reId: N(row.RE_ID),
    invoiceNumber: S(row.RNR),
    supplierNumber: S(row.ADR_NR),
    supplier: S(row.ADR_SUCH),
    projectKey: S(row.KTR),
    date: isoDate(row.BELEGDAT) || isoDate(row.RECHDAT),
    net: N(row.NETTO),
    gross: N(row.BRUTTO) || N(row.BETRAG),
    costAccount: S(row.KONTO_G),
  })));

  summary.importPlan = [
    {
      step: 1,
      source: "Adressen/ADRESSEN.DBF",
      target: "customers",
      mode: "upsert",
      count: summary.counts.customersRelevant,
      note: "Importiert alle in Dokumenten, FIBU oder Lohnstunden referenzierten Kunden/Lieferanten anhand KU_NR.",
    },
    {
      step: 2,
      source: "Daten/DOKUMENT.DBF Projektkoepfe",
      target: "projects",
      mode: "upsert",
      count: summary.counts.projects,
      note: "Projektkennung PROJNAME bleibt als HAPAK-Schluessel erhalten; sichtbare Projektnummer wird in das Format 26-0001 normalisiert.",
    },
    {
      step: 3,
      source: "Daten/DOKUMENT.DBF Dokumente",
      target: "documents",
      mode: "upsert",
      count: summary.counts.documents - summary.counts.projectHeads,
      note: "Alle Dokumenttypen werden bearbeitbar uebernommen; HAPAK NAME bleibt Dokumentnummer/Import-Schluessel.",
    },
    {
      step: 4,
      source: "Daten/DOKUMENT.DBF BEZUGNAME/PROJNAME",
      target: "project_document_tree + documents.parent_document_id",
      mode: "link",
      count: summary.mappings.documentTreeEdges,
      note: "Dokumentbaeume werden aus BEZUGNAME rekonstruiert; freie Dokumente bleiben Dokumente und koennen zugleich Baumknoten sein.",
    },
    {
      step: 5,
      source: "Daten/<DOKUMENT.NAME>.DBF/FPT",
      target: "document_items",
      mode: "upsert",
      count: summary.counts.positionFilesFound,
      note: "Positionen werden erst nach Dokumentanlage importiert; fehlende Positionsdateien blockieren nur das betroffene Dokument nicht den Lauf.",
    },
    {
      step: 6,
      source: "Fibu/FIBUZWO.DBF",
      target: "fibu_buchungen + documents.fibu_*",
      mode: "upsert",
      count: summary.counts.fibuMainRows,
      note: "RA/H* wird mit Ausgangsdokumenten verknuepft, RE/H* wird als Rechnungseingang ohne DOKUMENT-Pflicht importiert.",
    },
    {
      step: 7,
      source: "Lohn/LOHNBUCH.DBF",
      target: "Lohnstunden/Nachkalkulation",
      mode: "upsert",
      count: summary.counts.timeRows,
      note: "Zeitbuchungen werden ueber KTR dem Projekt zugeordnet und spaeter fuer Nachkalkulation und Projektsteuerung nutzbar.",
    },
  ];

  if (summary.mappings.fibuWithoutDocumentOutgoing > 0) {
    summary.issues.push({
      severity: "warning",
      code: "fibu_without_document",
      message: `${summary.mappings.fibuWithoutDocumentOutgoing} ausgehende FIBU-Hauptsaetze 2026 haben kein passendes DOKUMENT.NAME.`,
      examples: summary.samples.fibuWithoutDocument
        .filter((row) => row.art !== "RE")
        .slice(0, 10)
        .map((row) => `${row.art}/${row.typ} ${row.rnr} | ${row.projectKey} | ${row.gross}`),
    });
  }
  if (summary.mappings.fibuWithoutDocumentIncoming > 0) {
    summary.issues.push({
      severity: "info",
      code: "incoming_fibu_without_document",
      message: `${summary.mappings.fibuWithoutDocumentIncoming} Rechnungseingangs-Hauptsaetze stehen erwartungsgemaess nur in FIBUZWO und nicht in DOKUMENT.`,
      examples: summary.samples.fibuWithoutDocument
        .filter((row) => row.art === "RE")
        .slice(0, 10)
        .map((row) => `${row.art}/${row.typ} ${row.rnr} | ${row.projectKey} | ${row.gross}`),
    });
  }
  if (summary.mappings.missingTreeParents > 0) {
    summary.issues.push({
      severity: "warning",
      code: "missing_tree_parent",
      message: `${summary.mappings.missingTreeParents} Dokumentbaum-Bezuege zeigen auf nicht gefundene BEZUGNAME-Werte.`,
    });
  }
  if (summary.freeDocuments.likelyFolder > 0) {
    summary.issues.push({
      severity: "info",
      code: "free_documents_as_folders",
      message: `${summary.freeDocuments.likelyFolder} freie Dokumente wirken wie Ordner-Ersatz und sollten im Import als Baumknoten geprueft werden.`,
      examples: summary.freeDocuments.examplesLikelyFolder,
    });
  }

  const json = JSON.stringify(summary, null, 2);
  const out = argValue("--out");
  if (out) {
    await fs.writeFile(out, json, "utf8");
    console.log(`HAPAK Importanalyse ${year} geschrieben: ${out}`);
  } else {
    console.log(json);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
