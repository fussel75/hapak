import fs from "node:fs/promises";
import path from "node:path";
import { DBFFile } from "dbffile";
import pg from "pg";

type AuditIssue = {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  examples?: string[];
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

function databaseUrl(): string {
  return process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/fristd_bau";
}

function S(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function N(value: unknown): number {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = S(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function rowTouchesYear(row: Record<string, unknown>, year: number): boolean {
  for (const key of ["BELEGDAT", "RECHDAT", "ERFASSTDAT", "FAELLIGDAT", "ZAHLDAT", "SKONTODAT", "STORNODAT"]) {
    const date = isoDate(row[key]);
    if (date?.startsWith(`${year}-`)) return true;
  }
  return false;
}

function valueBelongsToNumberYear(value: unknown, year: number): boolean {
  const raw = S(value);
  if (!raw) return false;
  const year2 = String(year % 100).padStart(2, "0");
  return new RegExp(`(^|\\D)${year2}-\\d{4,5}\\b`).test(raw) || new RegExp(`(^|[^A-Z0-9])P?ZZ${year2}`, "i").test(raw);
}

function rowBelongsToFibuYear(row: Record<string, unknown>, year: number): boolean {
  return rowTouchesYear(row, year) || ["RNR", "KTR"].some((key) => valueBelongsToNumberYear(row[key], year));
}

async function readFibuRows(source: string, year: number): Promise<Record<string, unknown>[]> {
  const dbfPath = path.join(source, "Fibu", "FIBUZWO.DBF");
  const file = await DBFFile.open(dbfPath, { encoding: "latin1" });
  const rows = await file.readRecords();
  return rows.filter((row) => rowBelongsToFibuYear(row, year));
}

function summarizeStageFibu(stage: any, allFibuRows: Record<string, unknown>[]) {
  const stagedMainKeys = new Set((stage.fibu || []).map((row: any) => `${row.reId}:0`));
  const stagedEntries = Array.isArray(stage.fibuEntries) ? stage.fibuEntries : [];
  const stagedEntryKeys = new Set(stagedEntries.map((row: any) => `${row.reId}:${row.idx || 0}`));
  const grouped = new Map<number, { main: number; details: number; art: string; typ: string; rnr: string }>();

  for (const row of allFibuRows) {
    const reId = N(row.RE_ID);
    if (!reId) continue;
    const entry = grouped.get(reId) || { main: 0, details: 0, art: S(row.ART), typ: S(row.TYP), rnr: S(row.RNR) };
    if (N(row.IDX) === 0) entry.main += 1;
    else entry.details += 1;
    grouped.set(reId, entry);
  }

  const withDetails = [...grouped.entries()].filter(([, row]) => row.details > 0);
  const stagedMissingDetails = withDetails.filter(([reId]) => stagedMainKeys.has(`${reId}:0`));
  const unstagedDetailRows = allFibuRows.filter((row) => N(row.IDX) > 0 && !stagedEntryKeys.has(`${N(row.RE_ID)}:${N(row.IDX)}`));
  const byArtTyp = new Map<string, number>();
  for (const row of allFibuRows) {
    const key = `${S(row.ART) || "?"}:${S(row.TYP) || "?"}:idx${N(row.IDX) === 0 ? "0" : ">0"}`;
    byArtTyp.set(key, (byArtTyp.get(key) || 0) + 1);
  }

  return {
    allRowsInYear: allFibuRows.length,
    groupedReIds: grouped.size,
    reIdsWithDetailRows: withDetails.length,
    detailRows: allFibuRows.filter((row) => N(row.IDX) > 0).length,
    stagedMainRows: stage.fibu?.length || 0,
    stagedAllRows: stagedEntries.length,
    stagedDetailRows: stagedEntries.filter((row: any) => N(row.idx) > 0).length,
    unstagedDetailRows: unstagedDetailRows.length,
    stagedMainRowsWithDetailsNotStaged: stagedEntries.length > 0 ? 0 : stagedMissingDetails.length,
    byArtTyp: Object.fromEntries([...byArtTyp.entries()].sort()),
    examples: (stagedEntries.length > 0
      ? unstagedDetailRows.slice(0, 12).map((row) => `${N(row.RE_ID)} ${S(row.ART)}/${S(row.TYP)} ${S(row.RNR)} IDX ${N(row.IDX)}`)
      : stagedMissingDetails.slice(0, 12).map(([reId, row]) => `${reId} ${row.art}/${row.typ} ${row.rnr} (${row.details} Detailzeile/n)`)),
  };
}

async function queryDatabase(client: pg.PoolClient) {
  const byType = await client.query(`
    WITH calc AS (
      SELECT
        d.id,
        d.type,
        d.net_total::numeric AS header_net,
        d.gross_total::numeric AS header_gross,
        (SELECT di.total_price::numeric FROM document_items di WHERE di.document_id=d.id AND di.type='nettosumme' ORDER BY di.sort_order DESC, di.id DESC LIMIT 1) AS last_net_row,
        (SELECT di.total_price::numeric FROM document_items di WHERE di.document_id=d.id AND di.type='gesamtsumme' ORDER BY di.sort_order DESC, di.id DESC LIMIT 1) AS last_gross_row,
        (SELECT count(*) FROM document_items di WHERE di.document_id=d.id) AS item_count,
        (SELECT count(*) FROM document_items di WHERE di.document_id=d.id AND di.parent_item_id IS NOT NULL) AS child_count,
        (SELECT count(*) FROM document_items di WHERE di.document_id=d.id AND di.type IN ('nettosumme','gesamtsumme','titelsumme','skonto','zwischensumme','titelsumme_block')) AS calc_count,
        (SELECT count(*) FROM document_items di WHERE di.document_id=d.id AND di.type IN ('nettosumme','gesamtsumme','titelsumme') AND abs(di.total_price::numeric) <= 0.005) AS zero_calc_sum_rows
      FROM documents d
      WHERE d.import_source='hapak'
    )
    SELECT
      type,
      count(*)::int AS docs,
      count(*) FILTER (WHERE item_count > 0)::int AS with_items,
      count(*) FILTER (WHERE item_count = 0)::int AS without_items,
      count(*) FILTER (WHERE calc_count > 0)::int AS with_calc_rows,
      count(*) FILTER (WHERE last_net_row IS NOT NULL AND abs(header_net - last_net_row) <= 0.02)::int AS net_ok,
      count(*) FILTER (WHERE last_net_row IS NOT NULL AND abs(header_net - last_net_row) > 0.02)::int AS net_diff_docs,
      sum(item_count)::int AS items,
      sum(child_count)::int AS children,
      sum(calc_count)::int AS calc_rows,
      sum(zero_calc_sum_rows)::int AS zero_calc_sum_rows
    FROM calc
    GROUP BY type
    ORDER BY type
  `);

  const totalMismatchExamples = await client.query(`
    SELECT d.import_source_key, d.document_number, d.type, left(coalesce(d.subject,''), 70) AS subject,
      d.net_total::numeric AS header_net,
      (SELECT di.total_price::numeric FROM document_items di WHERE di.document_id=d.id AND di.type='nettosumme' ORDER BY di.sort_order DESC, di.id DESC LIMIT 1) AS last_net_row,
      (SELECT di.total_price::numeric FROM document_items di WHERE di.document_id=d.id AND di.type='gesamtsumme' ORDER BY di.sort_order DESC, di.id DESC LIMIT 1) AS last_gross_row
    FROM documents d
    WHERE d.import_source='hapak'
      AND (
        EXISTS (
          SELECT 1 FROM document_items di
          WHERE di.document_id=d.id AND di.type='nettosumme' AND abs(d.net_total::numeric - di.total_price::numeric) > 0.02
        )
        OR EXISTS (
          SELECT 1 FROM document_items di
          WHERE di.document_id=d.id AND di.type='gesamtsumme' AND abs(d.gross_total::numeric - di.total_price::numeric) > 0.02
        )
      )
    ORDER BY d.date DESC, d.import_source_key
    LIMIT 15
  `);

  const autoNumberingExamples = await client.query(`
    SELECT d.import_source_key, d.document_number, d.type, left(coalesce(d.subject,''), 70) AS subject,
      count(di.id)::int AS item_count
    FROM documents d
    JOIN document_items di ON di.document_id = d.id
    WHERE d.import_source = 'hapak'
      AND d.auto_position_numbers = true
    GROUP BY d.id, d.import_source_key, d.document_number, d.type, d.subject
    ORDER BY d.date DESC, d.import_source_key
    LIMIT 15
  `);

  const fixedCostJumboExamples = await client.query(`
    SELECT d.import_source_key, d.document_number, di.position_number, left(coalesce(di.title,''), 70) AS title,
      di.unit_price::numeric AS unit_price,
      di.total_price::numeric AS total_price,
      di.material_cost::numeric AS material_cost,
      di.labor_cost::numeric AS labor_cost,
      di.equipment_cost::numeric AS equipment_cost,
      di.external_cost::numeric AS external_cost,
      (SELECT count(*) FROM document_items c WHERE c.parent_item_id = di.id)::int AS child_count
    FROM documents d
    JOIN document_items di ON di.document_id = d.id
    WHERE d.import_source = 'hapak'
      AND di.type = 'jumbo'
      AND coalesce(di.price_follows_cost, false) = false
      AND (
        abs(coalesce(di.material_cost::numeric, 0)) > 0.005
        OR abs(coalesce(di.labor_cost::numeric, 0)) > 0.005
        OR abs(coalesce(di.equipment_cost::numeric, 0)) > 0.005
        OR abs(coalesce(di.external_cost::numeric, 0)) > 0.005
      )
    ORDER BY d.date DESC, d.import_source_key, di.sort_order
    LIMIT 20
  `);

  const redundantJumboChildExamples = await client.query(`
    SELECT d.import_source_key, d.document_number, p.position_number, left(coalesce(p.title,''), 70) AS title,
      c.id AS child_id
    FROM documents d
    JOIN document_items p ON p.document_id = d.id AND p.type = 'jumbo'
    JOIN document_items c ON c.parent_item_id = p.id
    WHERE d.import_source = 'hapak'
      AND c.type = p.type
      AND coalesce(c.title, '') = coalesce(p.title, '')
      AND abs(coalesce(c.quantity::numeric, 0) - coalesce(p.quantity::numeric, 0)) <= 0.0005
      AND abs(coalesce(c.unit_price::numeric, 0) - coalesce(p.unit_price::numeric, 0)) <= 0.005
      AND abs(coalesce(c.total_price::numeric, 0) - coalesce(p.total_price::numeric, 0)) <= 0.005
      AND abs(coalesce(c.material_cost::numeric, 0) - coalesce(p.material_cost::numeric, 0)) <= 0.005
      AND abs(coalesce(c.labor_cost::numeric, 0) - coalesce(p.labor_cost::numeric, 0)) <= 0.005
      AND abs(coalesce(c.equipment_cost::numeric, 0) - coalesce(p.equipment_cost::numeric, 0)) <= 0.005
      AND abs(coalesce(c.external_cost::numeric, 0) - coalesce(p.external_cost::numeric, 0)) <= 0.005
    ORDER BY d.date DESC, d.import_source_key, p.sort_order
    LIMIT 20
  `);

  const syntheticJumboChildExamples = await client.query(`
    SELECT d.import_source_key, d.document_number, p.position_number, left(coalesce(p.title,''), 70) AS parent_title,
      c.id AS child_id, c.position_flag, c.title
    FROM documents d
    JOIN document_items p ON p.document_id = d.id AND p.type = 'jumbo'
    JOIN document_items c ON c.parent_item_id = p.id
    WHERE d.import_source = 'hapak'
      AND (
        c.position_flag = 'jumbo_lohn'
        OR c.title = 'Lohnanteil aus HAPAK-JUMBO'
      )
      AND abs(coalesce(p.external_cost::numeric, 0)) > 0.005
      AND abs(coalesce(p.labor_time::numeric, 0)) <= 0.005
    ORDER BY d.date DESC, d.import_source_key, p.sort_order
    LIMIT 20
  `);

  return {
    byType: byType.rows,
    totalMismatchExamples: totalMismatchExamples.rows,
    autoNumberingExamples: autoNumberingExamples.rows,
    fixedCostJumboExamples: fixedCostJumboExamples.rows,
    redundantJumboChildExamples: redundantJumboChildExamples.rows,
    syntheticJumboChildExamples: syntheticJumboChildExamples.rows,
  };
}

async function main() {
  const stagePath = argValue("--stage") || "D:/Hapak Nachbau Codex/hapak-stage-2026.json";
  const sourceArg = argValue("--source");
  const year = Number(argValue("--year") || 2026);
  const stage = JSON.parse(await fs.readFile(stagePath, "utf8"));
  const source = sourceArg || stage.source || path.join(process.cwd(), "hapak_snapshot_readonly_2026");
  const issues: AuditIssue[] = [];

  const pool = new pg.Pool({ connectionString: databaseUrl() });
  const client = await pool.connect();
  try {
    const db = await queryDatabase(client);
    const allFibuRows = await readFibuRows(source, year);
    const fibu = summarizeStageFibu(stage, allFibuRows);

    const netDiffDocs = db.byType.reduce((sum: number, row: any) => sum + Number(row.net_diff_docs || 0), 0);
    if (netDiffDocs > 0) {
      issues.push({
        severity: "warning",
        code: "calculated_document_total_mismatch",
        message: `${netDiffDocs} importierte HAPAK-Dokumente haben Summenzeilen, die vom Dokumentkopf abweichen.`,
        examples: db.totalMismatchExamples.map((row: any) => `${row.import_source_key} ${row.type} ${row.document_number}: ${row.subject}`),
      });
    }

    if (fibu.unstagedDetailRows > 0 || (fibu.detailRows > 0 && fibu.stagedDetailRows === 0)) {
      issues.push({
        severity: "warning",
        code: "fibu_detail_rows_not_staged",
        message: `${fibu.detailRows} FIBUZWO-Detailzeilen fuer ${year} sind in der Rohquelle vorhanden. Der aktuelle Stage enthaelt ${fibu.stagedDetailRows} davon.`,
        examples: fibu.examples,
      });
    }

    if (db.autoNumberingExamples.length > 0) {
      issues.push({
        severity: "error",
        code: "hapak_documents_auto_numbering_enabled",
        message: `${db.autoNumberingExamples.length} Beispiel(e) zeigen importierte HAPAK-Dokumente mit aktiver automatischer Positionsnummerierung. Importierte HAPAK-Positionsnummern muessen erhalten bleiben.`,
        examples: db.autoNumberingExamples.map((row: any) => `${row.import_source_key} ${row.type} ${row.document_number}: ${row.subject}`),
      });
    }

    if (db.fixedCostJumboExamples.length > 0) {
      issues.push({
        severity: "warning",
        code: "hapak_jumbo_costs_in_fixed_mode",
        message: `${db.fixedCostJumboExamples.length} Beispiel(e) zeigen importierte HAPAK-Jumbos mit Kostenfeldern, aber fester Pauschalpreis-Logik. Diese Positionen muessen fachlich gegen HAPAK geprueft werden.`,
        examples: db.fixedCostJumboExamples.map(
          (row: any) =>
            `${row.import_source_key} ${row.document_number} Pos ${row.position_number}: ${row.title} ` +
            `(EP ${row.unit_price}, Mat ${row.material_cost}, Lohn ${row.labor_cost}, Geraet ${row.equipment_cost}, Fremd ${row.external_cost}, Kinder ${row.child_count})`,
        ),
      });
    }

    if (db.redundantJumboChildExamples.length > 0) {
      issues.push({
        severity: "error",
        code: "hapak_jumbo_redundant_self_children",
        message: `${db.redundantJumboChildExamples.length} Beispiel(e) zeigen importierte Jumbos mit einem identischen Kinddatensatz. Das ist fast sicher eine Import-Duplizierung.`,
        examples: db.redundantJumboChildExamples.map(
          (row: any) => `${row.import_source_key} ${row.document_number} Pos ${row.position_number}: ${row.title} (Kind ${row.child_id})`,
        ),
      });
    }

    if (db.syntheticJumboChildExamples.length > 0) {
      issues.push({
        severity: "error",
        code: "hapak_external_jumbo_synthetic_labor_child",
        message: `${db.syntheticJumboChildExamples.length} Beispiel(e) zeigen externe HAPAK-Jumbos mit synthetischem Lohnkind. Das fuehrt zu falschen Inhalten im Dokument.`,
        examples: db.syntheticJumboChildExamples.map(
          (row: any) => `${row.import_source_key} ${row.document_number} Pos ${row.position_number}: ${row.parent_title} (Kind ${row.child_id})`,
        ),
      });
    }

    const result = {
      year,
      stagePath,
      source,
      generatedAt: new Date().toISOString(),
      documentImport: db,
      fibu,
      issues,
      nextRecommendedSteps: [
        "FIBU- und Projektkennzahlen in Rechnungsausgang, Rechnungseingang, OP-Liste und Projektuebersicht gegen dieselbe fibu_buchungen-Basis pruefen.",
        "HAPAK-Eingangsrechnungen mit Beleganhaengen/gescannten Dateien abgleichen und Importstrategie fuer Anlagen festlegen.",
        "Zeiterfassungsimport ueber die Replit-API vorbereiten, sobald Endpoint und API-Key vorliegen.",
      ],
    };

    if (hasArg("--json")) console.log(JSON.stringify(result, null, 2));
    else {
      console.log("HAPAK Import Audit", year);
      console.table(db.byType);
      console.log("\nFIBU:", fibu);
      console.log("\nIssues:");
      for (const issue of issues) {
        console.log(`- [${issue.severity}] ${issue.code}: ${issue.message}`);
        for (const example of issue.examples || []) console.log(`  - ${example}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
