import fs from "node:fs/promises";
import pg from "pg";

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

function asDate(value: unknown): string | null {
  const text = S(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function money(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function nullableInt(value: unknown): number | null {
  const n = N(value);
  return n ? n : null;
}

function uniqueNumbers(values: unknown[]): number[] {
  return [...new Set(values.map(N).filter((n) => Number.isInteger(n) && n > 0))];
}

async function tableExists(client: pg.PoolClient, tableName: string): Promise<boolean> {
  const result = await client.query(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) AS exists`,
    [tableName],
  );
  return Boolean(result.rows[0]?.exists);
}

async function getDocumentIdMap(client: pg.PoolClient, keys: string[]): Promise<Map<string, number>> {
  if (keys.length === 0) return new Map();
  const result = await client.query(
    `SELECT import_source_key, id FROM documents WHERE import_source = 'hapak' AND import_source_key = ANY($1::text[])`,
    [keys],
  );
  return new Map(result.rows.map((row) => [S(row.import_source_key), Number(row.id)]));
}

async function getProjectNumberMap(client: pg.PoolClient, keys: string[]): Promise<Map<string, string>> {
  if (keys.length === 0) return new Map();
  const result = await client.query(
    `SELECT import_source_key, project_number FROM projects WHERE import_source = 'hapak' AND import_source_key = ANY($1::text[])`,
    [keys],
  );
  return new Map(result.rows.map((row) => [S(row.import_source_key), S(row.project_number)]));
}

function stageRows(stage: any): any[] {
  const entries = Array.isArray(stage.fibuEntries) ? stage.fibuEntries : [];
  if (entries.length > 0) return entries;
  return Array.isArray(stage.fibu) ? stage.fibu : [];
}

function duplicateKeys(rows: any[]): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = `${N(row.reId)}:${N(row.idx)}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([key, count]) => `${key} (${count}x)`);
}

async function preview(client: pg.PoolClient, rows: any[]) {
  const reIds = uniqueNumbers(rows.map((row) => row.reId));
  const existing = reIds.length === 0
    ? { rows: [{ rows: 0, re_ids: 0 }] }
    : await client.query(
        `SELECT count(*)::int AS rows, count(DISTINCT re_id)::int AS re_ids
         FROM fibu_buchungen WHERE re_id = ANY($1::int[])`,
        [reIds],
      );
  const byArtTyp = new Map<string, number>();
  for (const row of rows) {
    const key = `${S(row.art) || "?"}:${S(row.typ) || "?"}:idx${N(row.idx) === 0 ? "0" : ">0"}`;
    byArtTyp.set(key, (byArtTyp.get(key) || 0) + 1);
  }
  return {
    rows: rows.length,
    mainRows: rows.filter((row) => N(row.idx) === 0).length,
    detailRows: rows.filter((row) => N(row.idx) > 0).length,
    reIds: reIds.length,
    duplicateKeys: duplicateKeys(rows),
    existingRowsForStageReIds: existing.rows[0]?.rows || 0,
    existingReIdsForStage: existing.rows[0]?.re_ids || 0,
    byArtTyp: Object.fromEntries([...byArtTyp.entries()].sort()),
  };
}

async function importRows(client: pg.PoolClient, rows: any[], replaceExisting: boolean): Promise<number> {
  const reIds = uniqueNumbers(rows.map((row) => row.reId));
  const documentKeys = [...new Set(rows.map((row) => S(row.rnr)).filter(Boolean))];
  const projectKeys = [...new Set(rows.map((row) => S(row.projectKey || row.ktr)).filter(Boolean))];
  const documentIds = await getDocumentIdMap(client, documentKeys);
  const projectNumbers = await getProjectNumberMap(client, projectKeys);

  if (replaceExisting && reIds.length > 0) {
    await client.query(`DELETE FROM fibu_buchungen WHERE re_id = ANY($1::int[])`, [reIds]);
  }

  let inserted = 0;
  for (const row of rows) {
    const projectKey = S(row.projectKey || row.ktr);
    const normalizedKtr = projectNumbers.get(projectKey) || projectKey || null;
    const documentId = documentIds.get(S(row.rnr)) || null;
    const result = await client.query(
      `
        INSERT INTO fibu_buchungen (
          re_id, idx, lfd_nr, periode, art, typ, kennung, rnr, adr_nr, adr_such, betreff,
          belegdat, rechdat, erfasstdat, faelligdat, zahldat, skontodat, stornodat, bezugidx,
          betrag, zahlung, netto, brutto, einbehalt, minderung, offen, gutschrift, kuerzung,
          sk_prozent, sk_betrag, sk_basis, mahn_geb,
          konto_b, konto_g, konto_s, konto_m, kst, ktr,
          bezahlflag, stornoflag, mahnflag, mahnen, auszug, document_id
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
          $12,$13,$14,$15,$16,$17,$18,$19,
          $20,$21,$22,$23,$24,$25,$26,$27,$28,
          $29,$30,$31,$32,
          $33,$34,$35,$36,$37,$38,
          $39,$40,$41,$42,$43,$44
        )
      `,
      [
        N(row.reId), N(row.idx), S(row.lfdNr) || null, S(row.periode) || null,
        S(row.art), S(row.typ) || null, nullableInt(row.kennung), S(row.rnr), S(row.customerNumber) || null,
        S(row.customerSearch) || null, S(row.subject) || null,
        asDate(row.belegdat), asDate(row.rechdat), asDate(row.erfasstdat), asDate(row.faelligdat),
        asDate(row.zahldat), asDate(row.skontodat), asDate(row.stornodat), nullableInt(row.bezugidx),
        money(row.betrag), money(row.zahlung), money(row.netto), money(row.brutto), money(row.einbehalt),
        money(row.minderung), money(row.offen), money(row.gutschrift), money(row.kuerzung),
        money(row.skProzent), money(row.skBetrag), money(row.skBasis), money(row.mahnGeb),
        S(row.kontoB) || null, S(row.kontoG) || null, S(row.kontoS) || null, S(row.kontoM) || null,
        S(row.kst) || null, normalizedKtr, N(row.bezahlflag), N(row.stornoflag), N(row.mahnflag),
        row.mahnen !== false, S(row.auszug) || null, documentId,
      ],
    );
    inserted += result.rowCount || 0;
  }
  return inserted;
}

async function syncImportedDocumentSkontoFromFibu(client: pg.PoolClient): Promise<number> {
  const result = await client.query(`
    UPDATE documents d
    SET
      skonto_percent = f.sk_prozent,
      skonto_days = CASE
        WHEN COALESCE(d.skonto_days, 0) > 0 THEN d.skonto_days
        ELSE GREATEST(0, (f.skontodat::date - COALESCE(f.belegdat, d.date)::date))
      END,
      skonto_im_dokument = true,
      updated_at = NOW()
    FROM fibu_buchungen f
    WHERE f.document_id = d.id
      AND f.idx = 0
      AND f.art = 'RA'
      AND f.sk_prozent::numeric > 0
      AND f.skontodat IS NOT NULL
      AND COALESCE(f.belegdat, d.date) IS NOT NULL
      AND (
        d.skonto_percent IS DISTINCT FROM f.sk_prozent
        OR COALESCE(d.skonto_days, 0) = 0
        OR d.skonto_im_dokument IS DISTINCT FROM true
      )
  `);
  return result.rowCount || 0;
}

async function main() {
  const stagePath = argValue("--stage") || "D:/Hapak Nachbau Codex/hapak-stage-2026.json";
  const apply = hasArg("--apply");
  const replaceExisting = hasArg("--replace-existing-fibu");
  const stage = JSON.parse(await fs.readFile(stagePath, "utf8"));
  const rows = stageRows(stage);
  const pool = new pg.Pool({ connectionString: databaseUrl() });
  const client = await pool.connect();

  try {
    const blockers: string[] = [];
    if (!(await tableExists(client, "fibu_buchungen"))) blockers.push("Tabelle fibu_buchungen fehlt.");
    if (rows.length === 0) blockers.push("Stage enthaelt keine fibuEntries/fibu-Zeilen.");
    const duplicates = duplicateKeys(rows);
    if (duplicates.length > 0) blockers.push(`Doppelte FIBU-Schluessel RE_ID/IDX: ${duplicates.slice(0, 10).join(", ")}`);

    const plan = await preview(client, rows);
    if (plan.existingRowsForStageReIds > 0 && !replaceExisting) {
      blockers.push(`${plan.existingRowsForStageReIds} bestehende FIBU-Zeilen fuer Stage-RE_IDs gefunden. Fuer Neuimport --replace-existing-fibu verwenden.`);
    }

    if (!apply || blockers.length > 0) {
      console.log(JSON.stringify({
        mode: "preview",
        canApply: blockers.length === 0,
        blockers,
        stagePath,
        plan,
        applyRequires: "--apply",
        replaceExistingRequires: plan.existingRowsForStageReIds > 0 ? "--replace-existing-fibu" : null,
      }, null, 2));
      if (apply && blockers.length > 0) process.exitCode = 1;
      return;
    }

    await client.query("BEGIN");
    try {
      const inserted = await importRows(client, rows, replaceExisting);
      const syncedDocumentSkonto = await syncImportedDocumentSkontoFromFibu(client);
      await client.query("COMMIT");
      console.log(JSON.stringify({
        mode: "apply",
        inserted,
        syncedDocumentSkonto,
        replacedExisting: replaceExisting,
        plan,
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
