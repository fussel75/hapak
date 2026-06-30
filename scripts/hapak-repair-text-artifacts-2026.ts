import pg from "pg";
import { cleanHapakTextBlock } from "../shared/document-engine/hapak-text-artifacts";

type RepairCandidate = {
  documentId: number;
  documentNumber: string;
  documentType: string;
  beforeWorkText: string | null;
  afterTotalsText: string | null;
};

type PlannedRepair = RepairCandidate & {
  nextBeforeWorkText: string | null;
  nextAfterTotalsText: string | null;
};

function hasArg(name: string): boolean {
  return process.argv.includes(name) || process.argv.some((a) => a.startsWith(`${name}=`));
}

function databaseUrl(): string {
  return process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/fristd_bau";
}

function normalizeDbText(value: string | null): string | null {
  return cleanHapakTextBlock(value);
}

async function main() {
  const apply = hasArg("--apply");
  const pool = new pg.Pool({ connectionString: databaseUrl() });
  const client = await pool.connect();

  try {
    const rows = (await client.query<RepairCandidate>(`
      SELECT
        id AS "documentId",
        document_number AS "documentNumber",
        type AS "documentType",
        before_work_text AS "beforeWorkText",
        after_totals_text AS "afterTotalsText"
      FROM documents
      WHERE import_source = 'hapak'
        AND (before_work_text IS NOT NULL OR after_totals_text IS NOT NULL)
      ORDER BY document_number, id
    `)).rows;

    const planned = rows
      .map((row): PlannedRepair => ({
        ...row,
        nextBeforeWorkText: normalizeDbText(row.beforeWorkText),
        nextAfterTotalsText: normalizeDbText(row.afterTotalsText),
      }))
      .filter((row) => row.nextBeforeWorkText !== row.beforeWorkText || row.nextAfterTotalsText !== row.afterTotalsText);

    const examples = planned.slice(0, 20).map((row) => ({
      documentId: row.documentId,
      documentNumber: row.documentNumber,
      documentType: row.documentType,
      beforeWorkText: row.beforeWorkText,
      nextBeforeWorkText: row.nextBeforeWorkText,
      afterTotalsText: row.afterTotalsText,
      nextAfterTotalsText: row.nextAfterTotalsText,
    }));

    if (!apply) {
      console.log(JSON.stringify({
        mode: "preview",
        canApply: true,
        plannedDocuments: planned.length,
        examples,
        applyRequires: "--apply",
      }, null, 2));
      return;
    }

    await client.query("BEGIN");
    try {
      let updated = 0;
      for (const row of planned) {
        await client.query(
          `UPDATE documents
           SET before_work_text = $1,
               after_totals_text = $2
           WHERE id = $3`,
          [row.nextBeforeWorkText, row.nextAfterTotalsText, row.documentId],
        );
        updated++;
      }
      await client.query("COMMIT");

      console.log(JSON.stringify({
        mode: "apply",
        updatedDocuments: updated,
        examples,
      }, null, 2));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
