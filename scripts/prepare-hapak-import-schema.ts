import pg from "pg";

function databaseUrl(): string {
  return process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/fristd_bau";
}

async function columnExists(client: pg.PoolClient, table: string, column: string): Promise<boolean> {
  const result = await client.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
      LIMIT 1
    `,
    [table, column],
  );
  return result.rowCount > 0;
}

async function dropSingleColumnUniqueConstraints(client: pg.PoolClient, table: string, column: string): Promise<string[]> {
  const result = await client.query(
    `
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'public'
        AND rel.relname = $1
        AND con.contype = 'u'
        AND (
          SELECT array_agg(att.attname ORDER BY att.attnum)
          FROM unnest(con.conkey) AS cols(attnum)
          JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = cols.attnum
        ) = ARRAY[$2]::name[]
    `,
    [table, column],
  );

  const dropped: string[] = [];
  for (const row of result.rows) {
    const constraintName = String(row.conname);
    await client.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${constraintName}"`);
    dropped.push(constraintName);
  }
  return dropped;
}

async function addUniqueConstraintIfMissing(client: pg.PoolClient, table: string, constraint: string, column: string): Promise<boolean> {
  const exists = await client.query(
    `
      SELECT 1
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'public'
        AND rel.relname = $1
        AND con.conname = $2
      LIMIT 1
    `,
    [table, constraint],
  );
  if (exists.rowCount > 0) return false;
  await client.query(`ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" UNIQUE ("${column}")`);
  return true;
}

async function tableExists(client: pg.PoolClient, table: string): Promise<boolean> {
  const result = await client.query(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
      LIMIT 1
    `,
    [table],
  );
  return result.rowCount > 0;
}

async function prepareTable(client: pg.PoolClient, table: string, visibleNumberColumn: string) {
  const changes: string[] = [];
  if (!(await columnExists(client, table, "import_source"))) {
    await client.query(`ALTER TABLE "${table}" ADD COLUMN "import_source" text`);
    changes.push(`${table}.import_source angelegt`);
  }
  if (!(await columnExists(client, table, "import_source_key"))) {
    await client.query(`ALTER TABLE "${table}" ADD COLUMN "import_source_key" text`);
    changes.push(`${table}.import_source_key angelegt`);
  }

  const dropped = await dropSingleColumnUniqueConstraints(client, table, visibleNumberColumn);
  for (const name of dropped) changes.push(`${table}.${visibleNumberColumn} Unique-Constraint ${name} entfernt`);

  const uniqueAdded = await addUniqueConstraintIfMissing(
    client,
    table,
    `${table}_import_source_key_unique`,
    "import_source_key",
  );
  if (uniqueAdded) changes.push(`${table}.import_source_key Unique-Constraint angelegt`);
  return changes;
}

async function createIndexIfMissing(client: pg.PoolClient, indexName: string, statement: string): Promise<boolean> {
  const exists = await client.query(
    `
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = $1
      LIMIT 1
    `,
    [indexName],
  );
  if (exists.rowCount > 0) return false;
  await client.query(statement);
  return true;
}

async function prepareDocumentAttachments(client: pg.PoolClient): Promise<string[]> {
  const changes: string[] = [];
  if (!(await tableExists(client, "document_attachments"))) {
    await client.query(`
      CREATE TABLE document_attachments (
        id serial PRIMARY KEY,
        target_type text NOT NULL,
        target_id integer,
        fibu_re_id integer,
        fibu_idx integer,
        incoming_invoice_id integer,
        document_id integer,
        project_id integer,
        source text NOT NULL DEFAULT 'manual',
        import_source text,
        import_source_key text UNIQUE,
        original_filename text NOT NULL,
        stored_filename text,
        file_path text NOT NULL,
        mime_type text,
        file_size integer,
        sha256 text,
        title text,
        notes text,
        status text NOT NULL DEFAULT 'active',
        created_at timestamp DEFAULT now()
      )
    `);
    changes.push("document_attachments angelegt");
  }

  if (await createIndexIfMissing(client, "document_attachments_fibu_re_id_idx", "CREATE INDEX document_attachments_fibu_re_id_idx ON document_attachments (fibu_re_id)")) {
    changes.push("document_attachments.fibu_re_id Index angelegt");
  }
  if (await createIndexIfMissing(client, "document_attachments_incoming_invoice_id_idx", "CREATE INDEX document_attachments_incoming_invoice_id_idx ON document_attachments (incoming_invoice_id)")) {
    changes.push("document_attachments.incoming_invoice_id Index angelegt");
  }
  if (await createIndexIfMissing(client, "document_attachments_document_id_idx", "CREATE INDEX document_attachments_document_id_idx ON document_attachments (document_id)")) {
    changes.push("document_attachments.document_id Index angelegt");
  }
  if (await createIndexIfMissing(client, "document_attachments_project_id_idx", "CREATE INDEX document_attachments_project_id_idx ON document_attachments (project_id)")) {
    changes.push("document_attachments.project_id Index angelegt");
  }
  return changes;
}

async function run() {
  const pool = new pg.Pool({ connectionString: databaseUrl() });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const changes = [
      ...(await prepareTable(client, "projects", "project_number")),
      ...(await prepareTable(client, "documents", "document_number")),
      ...(await prepareDocumentAttachments(client)),
    ];
    await client.query("COMMIT");
    console.log(JSON.stringify({ ok: true, changes, changed: changes.length }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
