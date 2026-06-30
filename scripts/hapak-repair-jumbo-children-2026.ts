import pg from "pg";

type RepairCandidate = {
  documentId: number;
  documentNumber: string;
  documentType: string;
  parentId: number;
  positionNumber: string;
  parentTitle: string | null;
  childId: number;
  childTitle: string | null;
};

function hasArg(name: string): boolean {
  return process.argv.includes(name) || process.argv.some((a) => a.startsWith(`${name}=`));
}

function databaseUrl(): string {
  return process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/fristd_bau";
}

const candidateSql = `
  SELECT
    d.id AS "documentId",
    d.document_number AS "documentNumber",
    d.type AS "documentType",
    p.id AS "parentId",
    p.position_number AS "positionNumber",
    p.title AS "parentTitle",
    c.id AS "childId",
    c.title AS "childTitle"
  FROM document_items p
  JOIN documents d ON d.id = p.document_id
  JOIN document_items c ON c.parent_item_id = p.id
  WHERE d.import_source = 'hapak'
    AND p.type = 'jumbo'
    AND COALESCE(NULLIF(p.external_cost::text, ''), '0')::numeric > 0
    AND COALESCE(NULLIF(p.labor_time::text, ''), '0')::numeric = 0
    AND c.position_flag = 'jumbo_lohn'
    AND c.title = 'Lohnanteil aus HAPAK-JUMBO'
  ORDER BY d.document_number, p.position_number, c.id
`;

async function main() {
  const apply = hasArg("--apply");
  const pool = new pg.Pool({ connectionString: databaseUrl() });
  const client = await pool.connect();

  try {
    const candidates = (await client.query<RepairCandidate>(candidateSql)).rows;
    const parentIds = Array.from(new Set(candidates.map((row) => row.parentId)));
    const childIds = candidates.map((row) => row.childId);
    const examples = candidates.slice(0, 20).map((row) => ({
      documentId: row.documentId,
      documentNumber: row.documentNumber,
      documentType: row.documentType,
      positionNumber: row.positionNumber,
      parentTitle: row.parentTitle,
      childId: row.childId,
      childTitle: row.childTitle,
    }));

    if (!apply) {
      console.log(JSON.stringify({
        mode: "preview",
        canApply: true,
        plannedDeletedChildren: childIds.length,
        plannedFixedParents: parentIds.length,
        examples,
        applyRequires: "--apply",
      }, null, 2));
      return;
    }

    await client.query("BEGIN");
    try {
      const updateParents = await client.query(
        `UPDATE document_items
         SET price_follows_cost = true
         WHERE id = ANY($1::int[])`,
        [parentIds],
      );
      const deleteChildren = await client.query(
        `DELETE FROM document_items
         WHERE id = ANY($1::int[])`,
        [childIds],
      );
      await client.query("COMMIT");

      console.log(JSON.stringify({
        mode: "apply",
        fixedParents: updateParents.rowCount || 0,
        deletedChildren: deleteChildren.rowCount || 0,
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
