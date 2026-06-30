import pg from "pg";

type ItemRow = {
  id: number;
  document_id: number;
  sort_order: number;
  type: string;
  title: string | null;
  total_price: string | number | null;
  parent_item_id: number | null;
  position_flag: string | null;
};

type DocumentRow = {
  id: number;
  import_source_key: string;
  document_number: string;
  type: string;
  net_total: string | number | null;
  gross_total: string | number | null;
};

function hasArg(name: string): boolean {
  return process.argv.includes(name) || process.argv.some((a) => a.startsWith(`${name}=`));
}

function databaseUrl(): string {
  return process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/fristd_bau";
}

function N(value: unknown): number {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value: unknown): string {
  return N(value).toFixed(2);
}

function countsForImportedTotal(item: ItemRow): boolean {
  if (item.parent_item_id) return false;
  if (["alternativ", "bedarf", "jumbo_lohn"].includes(item.position_flag || "")) return false;
  return ["position", "material", "lohn", "leistung", "manuell", "fahrtkosten", "frachtkosten", "jumbo", "zuschlag"].includes(item.type);
}

function calculateTitleSum(items: ItemRow[], titleSumIndex: number): number {
  let sum = 0;
  for (let i = titleSumIndex - 1; i >= 0; i--) {
    const item = items[i];
    if (item.parent_item_id) continue;
    if (item.type === "titelsumme") break;
    if (!countsForImportedTotal(item)) continue;
    sum += N(item.total_price);
  }
  return sum;
}

async function loadImportedDocuments(client: pg.PoolClient): Promise<DocumentRow[]> {
  const result = await client.query(`
    SELECT id, import_source_key, document_number, type, net_total, gross_total
    FROM documents
    WHERE import_source = 'hapak'
    ORDER BY id
  `);
  return result.rows;
}

async function loadItems(client: pg.PoolClient, documentId: number): Promise<ItemRow[]> {
  const result = await client.query(`
    SELECT id, document_id, sort_order, type, title, total_price, parent_item_id, position_flag
    FROM document_items
    WHERE document_id = $1
    ORDER BY sort_order, id
  `, [documentId]);
  return result.rows;
}

async function main() {
  const apply = hasArg("--apply");
  const pool = new pg.Pool({ connectionString: databaseUrl() });
  const client = await pool.connect();
  const examples: string[] = [];
  let titleRows = 0;
  let netRows = 0;
  let grossRows = 0;
  let changedRows = 0;

  try {
    const documents = await loadImportedDocuments(client);
    const plannedUpdates: { id: number; value: string; kind: string; doc: DocumentRow }[] = [];

    for (const doc of documents) {
      const items = await loadItems(client, doc.id);
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type === "titelsumme") {
          const value = money(calculateTitleSum(items, i));
          titleRows++;
          if (money(item.total_price) !== value) plannedUpdates.push({ id: item.id, value, kind: "titelsumme", doc });
        } else if (item.type === "nettosumme") {
          const value = money(doc.net_total);
          netRows++;
          if (money(item.total_price) !== value) plannedUpdates.push({ id: item.id, value, kind: "nettosumme", doc });
        } else if (item.type === "gesamtsumme") {
          const value = money(doc.gross_total);
          grossRows++;
          if (money(item.total_price) !== value) plannedUpdates.push({ id: item.id, value, kind: "gesamtsumme", doc });
        }
      }
    }

    for (const update of plannedUpdates.slice(0, 20)) {
      examples.push(`${update.doc.import_source_key} ${update.doc.type} ${update.doc.document_number} ${update.kind} => ${update.value}`);
    }

    if (!apply) {
      console.log(JSON.stringify({
        mode: "preview",
        canApply: true,
        scannedDocuments: documents.length,
        scannedRows: { titleRows, netRows, grossRows },
        plannedUpdates: plannedUpdates.length,
        examples,
        applyRequires: "--apply",
      }, null, 2));
      return;
    }

    await client.query("BEGIN");
    try {
      for (const update of plannedUpdates) {
        const result = await client.query(
          `UPDATE document_items SET total_price = $1 WHERE id = $2`,
          [update.value, update.id],
        );
        changedRows += result.rowCount || 0;
      }
      await client.query("COMMIT");
      console.log(JSON.stringify({
        mode: "apply",
        scannedDocuments: documents.length,
        scannedRows: { titleRows, netRows, grossRows },
        changedRows,
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
