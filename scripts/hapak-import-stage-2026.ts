import fs from "node:fs/promises";
import pg from "pg";
import { expandHapakDetailedJumbos } from "../shared/document-engine/hapak-jumbo-import";

type StageIssue = {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  examples?: string[];
};

type Stage = {
  year: number;
  readonly: true;
  counts: Record<string, number>;
  customers: any[];
  projects: any[];
  documents: any[];
  positions?: any[];
  issues: StageIssue[];
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

function requiredString(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function asDate(value: unknown): string | null {
  const text = requiredString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function money(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function quantity(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(3) : "0.000";
}

function boundedDecimal(value: unknown, maxAbs: number): string | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) > maxAbs) return null;
  return n.toFixed(2);
}

function itemTextLooksCorrupt(value: unknown): boolean {
  const text = requiredString(value);
  if (!text) return false;
  const compact = text.replace(/\s/g, "");
  if (!compact) return false;
  if (/^p#$/i.test(compact)) return true;
  if (compact.length <= 2 && !/\d/.test(compact)) return true;
  if (compact.length > 20 && !/[A-Za-z0-9ÄÖÜäöüß]/.test(compact)) return true;
  if (/[Ÿ·¹¾ÁÃÆÇÉËÕ×ØÙÓÚÛÌÎÐÏÒÔÍµ¸»]{10,}/.test(compact)) return true;
  if (/[œ¯ÑÕâãßàîøôðÙÛ]{10,}/.test(compact)) return true;
  const head = compact.slice(0, 24);
  const headSuspicious = head.match(/[^\wÄÖÜäöüß]/g)?.length || 0;
  if (head.length >= 12 && headSuspicious / head.length > 0.45) return true;
  if (/(.)\1{30,}/u.test(compact)) return true;
  if (text.length > 80 && (text.match(/\s/g)?.length || 0) / text.length < 0.03) return true;
  const suspicious = compact.match(/[ÃÂâ�ÿþýŒÑÐÞÛÙØ×ÖÕÔÓÒÁÀ¾½»º¹¸·¶µ´³±°óèñçÙòæåïãíáêÌÉÇÅÃ¾½»º¹¸·¶µ´šœ¡¤ª±²¯¬«©¨¥¦¢Ÿžƒ]/g)?.length || 0;
  return compact.length > 80 && suspicious / compact.length > 0.12;
}

function uniqueValues(items: any[], key: string): string[] {
  return [...new Set(items.map((item) => requiredString(item[key])).filter(Boolean))];
}

function duplicateValues(items: any[], key: string): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = requiredString(item[key]);
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value, count]) => `${value} (${count}x)`);
}

async function countExisting(client: pg.PoolClient, table: string, column: string, values: string[]): Promise<number> {
  if (values.length === 0) return 0;
  const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE ${column} = ANY($1::text[])`, [values]);
  return Number(result.rows[0]?.count || 0);
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

async function buildSchemaBlockers(client: pg.PoolClient): Promise<string[]> {
  const blockers: string[] = [];
  if (!(await columnExists(client, "projects", "import_source_key"))) {
    blockers.push("schema_missing: projects.import_source_key fehlt. Erst Schema mit Import-Identitaeten aktualisieren.");
  }
  if (!(await columnExists(client, "documents", "import_source_key"))) {
    blockers.push("schema_missing: documents.import_source_key fehlt. Erst Schema mit Import-Identitaeten aktualisieren.");
  }
  return blockers;
}

async function getIdMap(client: pg.PoolClient, table: string, keyColumn: string, values: string[]): Promise<Map<string, number>> {
  if (values.length === 0) return new Map();
  const result = await client.query(`SELECT id, ${keyColumn} AS key FROM ${table} WHERE ${keyColumn} = ANY($1::text[])`, [values]);
  return new Map(result.rows.map((row) => [String(row.key), Number(row.id)]));
}

async function countItemsByDocumentId(client: pg.PoolClient, documentIds: number[]): Promise<Map<number, number>> {
  if (documentIds.length === 0) return new Map();
  const result = await client.query(
    "SELECT document_id, COUNT(*)::int AS count FROM document_items WHERE document_id = ANY($1::int[]) GROUP BY document_id",
    [documentIds],
  );
  return new Map(result.rows.map((row) => [Number(row.document_id), Number(row.count)]));
}

function buildBlockers(stage: Stage): string[] {
  const blockers = stage.issues.filter((issue) => issue.severity === "error").map((issue) => `${issue.code}: ${issue.message}`);
  const duplicateCustomerNumbers = duplicateValues(stage.customers, "customerNumber");
  const duplicateProjectImportKeys = duplicateValues(stage.projects, "importSourceKey");
  const duplicateDocumentImportKeys = duplicateValues(stage.documents, "importSourceKey");
  if (duplicateCustomerNumbers.length > 0) blockers.push(`duplicate_customer_number: ${duplicateCustomerNumbers.slice(0, 10).join(", ")}`);
  if (duplicateProjectImportKeys.length > 0) blockers.push(`duplicate_project_import_key: ${duplicateProjectImportKeys.slice(0, 10).join(", ")}`);
  if (duplicateDocumentImportKeys.length > 0) blockers.push(`duplicate_document_import_key: ${duplicateDocumentImportKeys.slice(0, 10).join(", ")}`);
  return blockers;
}

function countsForImportedTotal(item: any): boolean {
  if (item.parentSourceLine) return false;
  if (["alternativ", "bedarf", "jumbo_lohn"].includes(item.positionFlag || "")) return false;
  return ["position", "material", "lohn", "leistung", "manuell", "fahrtkosten", "frachtkosten", "jumbo", "zuschlag"].includes(item.type);
}

function calculateImportedTitleSum(items: any[], titleSumIndex: number): number {
  const positionNumber = requiredString(items[titleSumIndex]?.positionNumber);
  const normalizedPosition = positionNumber.replace(/\.+$/, "");
  const isTopLevelTitleSum = normalizedPosition && !normalizedPosition.includes(".");
  if (isTopLevelTitleSum) {
    for (let i = titleSumIndex - 1; i >= 0; i--) {
      const item = items[i];
      const itemPosition = requiredString(item.positionNumber).replace(/\.+$/, "");
      if (item.type === "gruppe" && itemPosition === normalizedPosition) {
        let sectionSum = 0;
        for (let j = i + 1; j < titleSumIndex; j++) {
          const sectionItem = items[j];
          if (!countsForImportedTotal(sectionItem)) continue;
          sectionSum += Number(sectionItem.totalPrice) || 0;
        }
        return sectionSum;
      }
    }
  }

  let sum = 0;
  for (let i = titleSumIndex - 1; i >= 0; i--) {
    const item = items[i];
    if (item.parentSourceLine) continue;
    if (item.type === "titelsumme") break;
    if (!countsForImportedTotal(item)) continue;
    sum += Number(item.totalPrice) || 0;
  }
  return sum;
}

function mainFibuRows(stage: Stage): any[] {
  const entries = Array.isArray(stage.fibuEntries) && stage.fibuEntries.length > 0 ? stage.fibuEntries : stage.fibu || [];
  return entries.filter((row: any) => Number(row.idx) === 0 && requiredString(row.art) === "RA" && requiredString(row.rnr));
}

function documentTotalsFromFibu(doc: any, fibuRow: any | undefined): any {
  if (!fibuRow) return doc;
  return {
    ...doc,
    netTotal: Number(fibuRow.netto) || doc?.netTotal,
    grossTotal: Number(fibuRow.brutto) || Number(fibuRow.betrag) || doc?.grossTotal,
  };
}

function repairCalculatedImportItems(items: any[], doc: any): any[] {
  const expandedItems = expandHapakDetailedJumbos(items);
  return expandedItems.map((item, index) => {
    if (item.type === "titelsumme") {
      return { ...item, totalPrice: money(calculateImportedTitleSum(expandedItems, index)) };
    }
    if (item.type === "nettosumme") {
      return { ...item, totalPrice: money(doc?.netTotal) };
    }
    if (item.type === "gesamtsumme") {
      return { ...item, totalPrice: money(doc?.grossTotal) };
    }
    if (item.type === "skonto") {
      return {
        ...item,
        positionNumber: "",
        title: "Skonto",
        description: "",
        quantity: "0.00",
        unit: "",
        unitPrice: "0.00",
        totalPrice: "0.00",
        afterTotals: true,
      };
    }
    return item;
  });
}

function extractSkontoDaysFromItems(items: any[]): number | null {
  for (const item of items || []) {
    if (item?.type !== "skonto") continue;
    const text = `${item.title || ""}\n${item.description || ""}`;
    const match = text.match(/innerhalb\s+von\s+(\d{1,3})\s+Tagen/i);
    if (!match) continue;
    const days = Number(match[1]);
    if (Number.isInteger(days) && days > 0) return days;
  }
  return null;
}

async function validatePositionImport(
  client: pg.PoolClient,
  stage: Stage,
  replaceExistingItems: boolean,
): Promise<{ blockers: string[]; warnings: string[]; stats: Record<string, number> }> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const positionEntries = (stage.positions || []).filter((entry) => Array.isArray(entry.items) && entry.items.length > 0);
  const documentKeys = positionEntries.map((entry) => requiredString(entry.documentImportSourceKey)).filter(Boolean);
  const documentIds = await getIdMap(client, "documents", "import_source_key", documentKeys);
  const missingDocuments = documentKeys.filter((key) => !documentIds.has(key));
  if (missingDocuments.length > 0) {
    blockers.push(`positions_missing_documents: ${missingDocuments.length} Dokumente fehlen in documents.import_source_key, z.B. ${missingDocuments.slice(0, 5).join(", ")}`);
  }

  const existingItems = await countItemsByDocumentId(client, [...documentIds.values()]);
  const existingDocuments = [...existingItems.entries()].filter(([, count]) => count > 0);
  if (existingDocuments.length > 0 && !replaceExistingItems) {
    blockers.push(`positions_existing_items: ${existingDocuments.length} Dokumente haben bereits Positionen. Fuer Ersatzimport explizit --replace-existing-items setzen.`);
  }

  let expectedParentLinks = 0;
  let missingParentLines = 0;
  let corruptTextFields = 0;
  let jumboWithoutChildren = 0;
  let emptyPositionFiles = 0;
  for (const entry of stage.positions || []) {
    const items = Array.isArray(entry.items) ? expandHapakDetailedJumbos(entry.items) : [];
    if (entry.present && items.length === 0) emptyPositionFiles++;
    const sourceLines = new Set(items.map((item: any) => Number(item.sourceLine)).filter((line: number) => Number.isFinite(line)));
    const parentLines = new Set(items.map((item: any) => Number(item.parentSourceLine)).filter((line: number) => Number.isFinite(line) && line > 0));
    for (const line of parentLines) {
      expectedParentLinks += items.filter((item: any) => Number(item.parentSourceLine) === line).length;
      if (!sourceLines.has(line)) missingParentLines++;
    }
    for (const item of items) {
      if (itemTextLooksCorrupt(item.title) || itemTextLooksCorrupt(item.description)) corruptTextFields++;
      if (item.type === "jumbo" && !parentLines.has(Number(item.sourceLine))) jumboWithoutChildren++;
    }
    if (itemTextLooksCorrupt(entry.beforeWorkText) || itemTextLooksCorrupt(entry.afterTotalsText)) corruptTextFields++;
  }
  if (missingParentLines > 0) blockers.push(`positions_parent_mismatch: ${missingParentLines} Parent-Referenzen zeigen auf keine Stage-Zeile.`);
  if (corruptTextFields > 0) blockers.push(`positions_corrupt_text: ${corruptTextFields} Textfelder wirken wie alte HAPAK-Format-/Binärfragmente. Staging zuerst bereinigen.`);
  if (jumboWithoutChildren > 0) warnings.push(`positions_jumbo_without_children: ${jumboWithoutChildren} HAPAK-Jumbozeilen haben keine Unterpositionen und werden als Jumbo-Kopf importiert.`);
  if (emptyPositionFiles > 0) warnings.push(`positions_empty_files: ${emptyPositionFiles} vorhandene Positionsdateien enthalten keine importierbaren Items.`);

  return {
    blockers,
    warnings,
    stats: {
      positionDocuments: positionEntries.length,
      positionItems: positionEntries.reduce((sum, entry) => sum + entry.items.length, 0),
      existingItemDocuments: existingDocuments.length,
      existingItems: [...existingItems.values()].reduce((sum, count) => sum + count, 0),
      expectedParentLinks,
      missingParentLines,
      corruptTextFields,
      jumboWithoutChildren,
      emptyPositionFiles,
    },
  };
}

async function preview(client: pg.PoolClient, stage: Stage, blockers: string[]) {
  const customerNumbers = uniqueValues(stage.customers, "customerNumber");
  const projectImportKeys = uniqueValues(stage.projects, "importSourceKey");
  const documentImportKeys = uniqueValues(stage.documents, "importSourceKey");
  const positionDocuments = (stage.positions || []).filter((entry) => Array.isArray(entry.items) && entry.items.length > 0);
  const positionItems = positionDocuments.reduce((sum, entry) => sum + entry.items.length, 0);
  const projectsImportReady = await columnExists(client, "projects", "import_source_key");
  const documentsImportReady = await columnExists(client, "documents", "import_source_key");
  return {
    mode: "preview",
    canApply: blockers.length === 0,
    blockers,
    dbSchemaReady: {
      projectsImportSourceKey: projectsImportReady,
      documentsImportSourceKey: documentsImportReady,
    },
    stageCounts: stage.counts,
    dbExisting: {
      customers: await countExisting(client, "customers", "customer_number", customerNumbers),
      projects: projectsImportReady ? await countExisting(client, "projects", "import_source_key", projectImportKeys) : "schema_missing",
      documents: documentsImportReady ? await countExisting(client, "documents", "import_source_key", documentImportKeys) : "schema_missing",
    },
    planned: {
      customers: customerNumbers.length,
      projects: projectImportKeys.length,
      documents: documentImportKeys.length,
      positions: {
        availableDocuments: positionDocuments.length,
        availableItems: positionItems,
        applyRequires: "--include-positions",
      },
      fibu: "not_in_this_step",
      wages: "not_in_this_step",
    },
  };
}

async function upsertCustomers(client: pg.PoolClient, customers: any[]): Promise<number> {
  let affected = 0;
  for (const customer of customers) {
    const result = await client.query(
      `
        INSERT INTO customers (
          customer_number, contact_type, search_key, name, name2, salutation, street, zip, city,
          country, phone, fax, mobile, email, website, iban, bic, bank, account_holder, tax_id,
          payment_term_days, skonto_days, skonto_percent, discount, branche, gross_invoicing,
          no_reminder, revenue_account
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28
        )
        ON CONFLICT (customer_number) DO UPDATE SET
          contact_type=EXCLUDED.contact_type,
          search_key=EXCLUDED.search_key,
          name=EXCLUDED.name,
          name2=EXCLUDED.name2,
          salutation=EXCLUDED.salutation,
          street=EXCLUDED.street,
          zip=EXCLUDED.zip,
          city=EXCLUDED.city,
          country=EXCLUDED.country,
          phone=EXCLUDED.phone,
          fax=EXCLUDED.fax,
          mobile=EXCLUDED.mobile,
          email=EXCLUDED.email,
          website=EXCLUDED.website,
          iban=EXCLUDED.iban,
          bic=EXCLUDED.bic,
          bank=EXCLUDED.bank,
          account_holder=EXCLUDED.account_holder,
          tax_id=EXCLUDED.tax_id,
          payment_term_days=EXCLUDED.payment_term_days,
          skonto_days=EXCLUDED.skonto_days,
          skonto_percent=EXCLUDED.skonto_percent,
          discount=EXCLUDED.discount,
          branche=EXCLUDED.branche,
          gross_invoicing=EXCLUDED.gross_invoicing,
          no_reminder=EXCLUDED.no_reminder,
          revenue_account=EXCLUDED.revenue_account
      `,
      [
        customer.customerNumber,
        customer.contactType || "kunde",
        customer.searchKey || customer.customerNumber,
        customer.name || customer.customerNumber,
        customer.name2 || null,
        customer.salutation || null,
        customer.street || null,
        customer.zip || null,
        customer.city || null,
        customer.country || null,
        customer.phone || null,
        customer.fax || null,
        customer.mobile || null,
        customer.email || null,
        customer.website || null,
        customer.iban || null,
        customer.bic || null,
        customer.bank || null,
        customer.accountHolder || null,
        customer.taxId || null,
        Number(customer.paymentTermDays) || 14,
        Number(customer.skontoDays) || 0,
        money(customer.skontoPercent),
        money(customer.discount),
        customer.branche || null,
        Boolean(customer.grossInvoicing),
        Boolean(customer.noReminder),
        customer.revenueAccount || null,
      ],
    );
    affected += result.rowCount || 0;
  }
  return affected;
}

async function upsertProjects(client: pg.PoolClient, projects: any[], customerIds: Map<string, number>): Promise<number> {
  let affected = 0;
  for (const project of projects) {
    const customerId = customerIds.get(requiredString(project.customerNumber));
    if (!customerId) throw new Error(`Kunde ${project.customerNumber} fuer Projekt ${project.projectNumber} fehlt`);
    const result = await client.query(
      `
        INSERT INTO projects (
          project_number, customer_id, name, short_name, description, status, start_date, cost_center,
          import_source, import_source_key
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (import_source_key) DO UPDATE SET
          customer_id=EXCLUDED.customer_id,
          name=EXCLUDED.name,
          short_name=EXCLUDED.short_name,
          description=EXCLUDED.description,
          status=EXCLUDED.status,
          start_date=EXCLUDED.start_date,
          cost_center=EXCLUDED.cost_center,
          project_number=EXCLUDED.project_number,
          import_source=EXCLUDED.import_source
      `,
      [
        project.projectNumber,
        customerId,
        project.name || project.projectNumber,
        project.shortName || null,
        project.description || null,
        project.status || "aktiv",
        asDate(project.startDate),
        project.hapakProjectKey || null,
        project.importSource || "hapak",
        project.importSourceKey || project.hapakProjectKey,
      ],
    );
    affected += result.rowCount || 0;
  }
  return affected;
}

async function upsertDocuments(
  client: pg.PoolClient,
  documents: any[],
  customerIds: Map<string, number>,
  projectIdsByHapakKey: Map<string, number>,
): Promise<number> {
  let affected = 0;
  for (const doc of documents) {
    const customerId = customerIds.get(requiredString(doc.customerNumber));
    if (!customerId) throw new Error(`Kunde ${doc.customerNumber} fuer Dokument ${doc.documentNumber} fehlt`);
    const projectId = projectIdsByHapakKey.get(requiredString(doc.projectKey)) || null;
    const result = await client.query(
      `
        INSERT INTO documents (
          document_number, type, customer_id, project_id, subject, date, valid_until, status,
          net_total, tax_rate, tax_amount, gross_total, custom_type_label, bemerkungen,
          import_source, import_source_key, auto_position_numbers
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT (import_source_key) DO UPDATE SET
          type=EXCLUDED.type,
          customer_id=EXCLUDED.customer_id,
          project_id=EXCLUDED.project_id,
          subject=EXCLUDED.subject,
          date=EXCLUDED.date,
          valid_until=EXCLUDED.valid_until,
          status=EXCLUDED.status,
          net_total=EXCLUDED.net_total,
          tax_rate=EXCLUDED.tax_rate,
          tax_amount=EXCLUDED.tax_amount,
          gross_total=EXCLUDED.gross_total,
          custom_type_label=EXCLUDED.custom_type_label,
          bemerkungen=EXCLUDED.bemerkungen,
          document_number=EXCLUDED.document_number,
          import_source=EXCLUDED.import_source,
          auto_position_numbers=EXCLUDED.auto_position_numbers,
          updated_at=NOW()
      `,
      [
        doc.documentNumber,
        doc.type,
        customerId,
        projectId,
        doc.subject || null,
        asDate(doc.date) || `${new Date().getFullYear()}-01-01`,
        asDate(doc.validUntil),
        doc.status || "entwurf",
        money(doc.netTotal),
        money(doc.taxRate || 19),
        money(doc.taxAmount),
        money(doc.grossTotal),
        doc.customTypeLabel || null,
        doc.hapakName ? `HAPAK-NAME=${doc.hapakName}` : null,
        doc.importSource || "hapak",
        doc.importSourceKey || doc.hapakName,
        false,
      ],
    );
    affected += result.rowCount || 0;
  }
  return affected;
}

async function linkDocumentParents(client: pg.PoolClient, documents: any[]): Promise<number> {
  const docsWithParents = documents.filter((doc) => requiredString(doc.parentHapakName));
  if (docsWithParents.length === 0) return 0;
  const byHapakName = new Map(documents.map((doc) => [requiredString(doc.hapakName), requiredString(doc.importSourceKey || doc.hapakName)]));
  const allImportKeys = uniqueValues(documents, "importSourceKey");
  const docIds = await getIdMap(client, "documents", "import_source_key", allImportKeys);
  let linked = 0;
  for (const doc of docsWithParents) {
    const documentKey = requiredString(doc.importSourceKey || doc.hapakName);
    const parentKey = byHapakName.get(requiredString(doc.parentHapakName));
    if (!parentKey) continue;
    const docId = docIds.get(documentKey);
    const parentId = docIds.get(parentKey);
    if (!docId || !parentId || docId === parentId) continue;
    const result = await client.query(
      "UPDATE documents SET parent_document_id = $1, updated_at = NOW() WHERE id = $2 AND (parent_document_id IS NULL OR parent_document_id != $1)",
      [parentId, docId],
    );
    linked += result.rowCount || 0;
  }
  return linked;
}

async function replaceDocumentPositions(
  client: pg.PoolClient,
  stage: Stage,
  expectedParentLinks: number,
): Promise<{ documents: number; items: number; parentLinks: number }> {
  const positionEntries = (stage.positions || []).filter((entry) => Array.isArray(entry.items) && entry.items.length > 0);
  if (positionEntries.length === 0) return { documents: 0, items: 0, parentLinks: 0 };
  const documentsByImportKey = new Map((stage.documents || []).map((doc) => [requiredString(doc.importSourceKey || doc.hapakName), doc]));
  const fibuByDocumentKey = new Map(mainFibuRows(stage).map((row: any) => [requiredString(row.rnr), row]));

  const documentKeys = positionEntries.map((entry) => requiredString(entry.documentImportSourceKey)).filter(Boolean);
  const documentIds = await getIdMap(client, "documents", "import_source_key", documentKeys);
  const missingDocuments = documentKeys.filter((key) => !documentIds.has(key));
  if (missingDocuments.length > 0) {
    throw new Error(`Positionsimport abgebrochen: ${missingDocuments.length} Dokumente fehlen in documents.import_source_key, z.B. ${missingDocuments.slice(0, 5).join(", ")}`);
  }

  const idsToReplace = [...documentIds.values()];
  if (idsToReplace.length > 0) {
    await client.query("DELETE FROM document_items WHERE document_id = ANY($1::int[])", [idsToReplace]);
  }

  let insertedItems = 0;
  let parentLinks = 0;
  for (const entry of positionEntries) {
    const documentId = documentIds.get(requiredString(entry.documentImportSourceKey));
    if (!documentId) continue;

    await client.query(
      `
        UPDATE documents SET
          before_work_text = $1,
          after_totals_text = $2,
          custom_type_label = COALESCE($3, custom_type_label),
          skonto_days = COALESCE($4, skonto_days),
          updated_at = NOW()
        WHERE id = $5
      `,
      [entry.beforeWorkText || null, entry.afterTotalsText || null, entry.headerDocLabel || null, extractSkontoDaysFromItems(entry.items), documentId],
    );

    const idsBySourceLine = new Map<number, number>();
    const pendingParentLinks: Array<{ id: number; parentSourceLine: number }> = [];
    const stageDoc = documentsByImportKey.get(requiredString(entry.documentImportSourceKey));
    const fibuRow = fibuByDocumentKey.get(requiredString(stageDoc?.hapakName || entry.documentImportSourceKey));
    const calculationDoc = documentTotalsFromFibu(stageDoc, fibuRow);
    if (fibuRow) {
      await client.query(
        `UPDATE documents SET net_total = $1, gross_total = $2, updated_at = NOW() WHERE id = $3`,
        [money(calculationDoc?.netTotal), money(calculationDoc?.grossTotal), documentId],
      );
    }

    const repairedItems = repairCalculatedImportItems(entry.items, calculationDoc);
    for (const item of repairedItems) {
      const result = await client.query(
        `
          INSERT INTO document_items (
            document_id, position_number, type, title, description, unit, quantity, unit_price,
            total_price, labor_price, material_price, material_cost, labor_cost, equipment_cost,
            external_cost, labor_markup, material_markup, equipment_markup, external_markup,
            labor_time, sort_order, position_flag, flag_label, after_totals, price_follows_cost
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
          )
          RETURNING id
        `,
        [
          documentId,
          requiredString(item.positionNumber),
          item.type || "position",
          item.title || null,
          item.description || null,
          item.unit || null,
          quantity(item.quantity),
          money(item.unitPrice),
          money(item.totalPrice),
          money(item.laborPrice),
          money(item.materialPrice),
          money(item.materialCost),
          money(item.laborCost),
          money(item.equipmentCost),
          money(item.externalCost),
          boundedDecimal(item.laborMarkup, 999.99),
          boundedDecimal(item.materialMarkup, 999.99),
          boundedDecimal(item.equipmentMarkup, 999.99),
          boundedDecimal(item.externalMarkup, 999.99),
          money(item.laborTime),
          Number(item.sortOrder) || 0,
          item.positionFlag || "normal",
          item.flagLabel || null,
          Boolean(item.afterTotals),
          Boolean(item.priceFollowsCost),
        ],
      );
      const insertedId = Number(result.rows[0].id);
      idsBySourceLine.set(Number(item.sourceLine), insertedId);
      if (item.parentSourceLine) {
        pendingParentLinks.push({ id: insertedId, parentSourceLine: Number(item.parentSourceLine) });
      }
      insertedItems++;
    }

    for (const link of pendingParentLinks) {
      const parentId = idsBySourceLine.get(link.parentSourceLine);
      if (!parentId) throw new Error(`Positionsimport abgebrochen: Parent-Zeile ${link.parentSourceLine} fehlt fuer Item ${link.id}`);
      const result = await client.query("UPDATE document_items SET parent_item_id = $1 WHERE id = $2", [parentId, link.id]);
      parentLinks += result.rowCount || 0;
    }
  }

  if (parentLinks !== expectedParentLinks) {
    throw new Error(`Positionsimport abgebrochen: Parent-Link-Mismatch, erwartet ${expectedParentLinks}, gesetzt ${parentLinks}`);
  }

  return { documents: positionEntries.length, items: insertedItems, parentLinks };
}

async function applyImport(client: pg.PoolClient, stage: Stage, includePositions: boolean, expectedParentLinks: number) {
  await client.query("BEGIN");
  try {
    const customers = await upsertCustomers(client, stage.customers);
    const customerIds = await getIdMap(client, "customers", "customer_number", uniqueValues(stage.customers, "customerNumber"));
    const projects = await upsertProjects(client, stage.projects, customerIds);
    const projectRows = await client.query("SELECT id, import_source_key FROM projects WHERE import_source_key = ANY($1::text[])", [
      uniqueValues(stage.projects, "importSourceKey"),
    ]);
    const projectIdsByHapakKey = new Map(projectRows.rows.map((row) => [String(row.import_source_key), Number(row.id)]));
    const documents = await upsertDocuments(client, stage.documents, customerIds, projectIdsByHapakKey);
    const parentLinks = await linkDocumentParents(client, stage.documents);
    const positions = includePositions ? await replaceDocumentPositions(client, stage, expectedParentLinks) : { documents: 0, items: 0, parentLinks: 0 };
    await client.query("COMMIT");
    return { customers, projects, documents, parentLinks, positions };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function run() {
  if (hasArg("--help") || hasArg("-h")) {
    console.log("Usage: npx tsx scripts/hapak-import-stage-2026.ts --stage <hapak-stage-2026.json> [--apply] [--include-positions] [--replace-existing-items]");
    console.log("Default is preview only. --apply writes customers, projects, document headers and parent links in one transaction.");
    console.log("--include-positions replaces document_items for the staged HAPAK documents and imports staged positions/JUMBO children.");
    return;
  }

  const stagePath = argValue("--stage");
  if (!stagePath) throw new Error("Bitte --stage angeben, z.B. --stage \"D:\\\\Hapak Nachbau Codex\\\\hapak-stage-2026.json\"");
  const apply = hasArg("--apply");
  const includePositions = hasArg("--include-positions");
  const replaceExistingItems = hasArg("--replace-existing-items");
  const stage = JSON.parse(await fs.readFile(stagePath, "utf8")) as Stage;
  const pool = new pg.Pool({ connectionString: databaseUrl() });
  const client = await pool.connect();
  try {
    const positionValidation = includePositions || !apply
      ? await validatePositionImport(client, stage, replaceExistingItems)
      : { blockers: [], warnings: [], stats: {} as Record<string, number> };
    const blockers = [...buildBlockers(stage), ...(await buildSchemaBlockers(client)), ...(includePositions ? positionValidation.blockers : [])];
    if (apply && blockers.length > 0) {
      console.log(JSON.stringify({ mode: "apply", applied: false, blockers }, null, 2));
      process.exitCode = 2;
      return;
    }
    if (!apply) {
      const previewResult = await preview(client, stage, blockers);
      console.log(JSON.stringify({ ...previewResult, positionPreflight: positionValidation }, null, 2));
      return;
    }
    const result = await applyImport(client, stage, includePositions, Number(positionValidation.stats.expectedParentLinks) || 0);
    console.log(JSON.stringify({ mode: "apply", applied: true, result, warnings: positionValidation.warnings }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
