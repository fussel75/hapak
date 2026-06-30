import pg from "pg";

const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:5000";
const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/fristd_bau";
const credentials = [
  { username: process.env.SMOKE_USERNAME || "admin", password: process.env.SMOKE_PASSWORD || "admin" },
  { username: "post@fristd-bau.com", password: "admin" },
];

const pool = new pg.Pool({ connectionString: databaseUrl });
const marker = `SMOKE-RE-FIBU-${Date.now()}`;
let cookie = "";
let incomingId = null;
let reId = null;

function captureCookies(response) {
  const rawCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);
  if (!rawCookies.length) return;
  cookie = rawCookies
    .flatMap((header) => header.split(/,(?=\s*[^;,]+=)/))
    .map((part) => part.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  captureCookies(response);
  return response;
}

async function expectJson(label, path, options = {}) {
  const response = await request(path, options);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label} fehlgeschlagen: HTTP ${response.status} ${text.slice(0, 300)}`);
  }
  console.log(`ok ${label}`);
  return text ? JSON.parse(text) : {};
}

async function login() {
  for (const account of credentials) {
    const response = await request("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(account),
    });
    if (response.ok) {
      console.log(`ok login ${account.username}`);
      return;
    }
  }
  throw new Error("Login fehlgeschlagen");
}

try {
  await login();
  const created = await expectJson("manuelle Eingangsrechnung anlegen", "/api/incoming-invoices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      supplier: marker,
      supplierNumber: "SMOKE",
      invoiceNumber: marker,
      date: "2026-06-10",
      dueDate: "2026-06-24",
      netTotal: "100.00",
      taxRate: "19.00",
      taxAmount: "19.00",
      grossTotal: "119.00",
      paidAmount: "0.00",
      status: "offen",
      costAccount: "5400",
      costCenter: "SMOKE",
      subject: "Smoke Test manuell zu FIBU",
      discountPercent: "2.00",
      discountDate: "2026-06-17",
      invoiceType: "rechnung",
      reverseCharge: false,
    }),
  });
  incomingId = created.id;
  if (!incomingId) throw new Error("Angelegte Eingangsrechnung hat keine ID");

  const registered = await expectJson("Eingangsrechnung in FIBU buchen", `/api/incoming-invoices/${incomingId}/register-fibu`, {
    method: "POST",
  });
  reId = registered.reId;
  if (!reId) throw new Error("FIBU-Buchung hat keine reId");

  const fibuRow = await pool.query(
    `SELECT re_id, art, typ, rnr, adr_such, konto_b, konto_g, betrag::float, offen::float
     FROM fibu_buchungen
     WHERE re_id = $1 AND idx = 0`,
    [reId],
  );
  if (fibuRow.rows.length !== 1) throw new Error(`Kein RE-Hauptsatz fuer reId ${reId}`);
  const row = fibuRow.rows[0];
  if (row.art !== "RE" || row.typ !== "HR" || row.rnr !== marker || row.adr_such !== marker) {
    throw new Error(`Unerwarteter RE-Hauptsatz: ${JSON.stringify(row)}`);
  }
  if (row.konto_b !== "3300" || row.konto_g !== "5400" || row.betrag !== 119 || row.offen !== 119) {
    throw new Error(`Unerwartete RE-Betraege/Konten: ${JSON.stringify(row)}`);
  }
  console.log("ok RE-Hauptsatz geprueft");

  const blockedPayment = await request(`/api/incoming-invoices/${incomingId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paidAmount: "119.00",
      paidDate: "2026-06-11",
      status: "bezahlt",
    }),
  });
  const blockedText = await blockedPayment.text();
  if (blockedPayment.status !== 409) {
    throw new Error(`Lokale Zahlung nach FIBU-Buchung wurde nicht blockiert: HTTP ${blockedPayment.status} ${blockedText.slice(0, 300)}`);
  }
  const blockedBody = blockedText ? JSON.parse(blockedText) : {};
  if (blockedBody.reId !== reId) {
    throw new Error(`Blockierte Zahlung verweist nicht auf die FIBU-Buchung: ${blockedText.slice(0, 300)}`);
  }
  console.log("ok lokale Zahlung nach FIBU-Buchung blockiert");

  const listed = await expectJson("FIBU-Liste enthaelt Testbeleg", `/api/incoming-invoices-fibu?search=${encodeURIComponent(marker)}&limit=5`);
  if (!listed.data?.some((entry) => entry.reId === reId)) {
    throw new Error("Gebuchter Testbeleg wurde in /api/incoming-invoices-fibu nicht gefunden");
  }

  const storno = await expectJson("FIBU-Testbeleg stornieren", `/api/fibu/${reId}`, {
    method: "DELETE",
  });
  if (!/storniert/i.test(storno.message || "")) {
    throw new Error(`FIBU-Storno meldet keinen Storno: ${JSON.stringify(storno)}`);
  }
  const stornoRow = await pool.query(
    `SELECT stornoflag, stornodat, offen::float
     FROM fibu_buchungen
     WHERE re_id = $1 AND idx = 0`,
    [reId],
  );
  if (stornoRow.rows.length !== 1 || stornoRow.rows[0].stornoflag !== 2 || !stornoRow.rows[0].stornodat || stornoRow.rows[0].offen !== 0) {
    throw new Error(`FIBU-Storno wurde nicht sauber gespeichert: ${JSON.stringify(stornoRow.rows[0])}`);
  }
  console.log("ok FIBU-Testbeleg storniert");

  console.log("Smoke-Test Eingangsrechnung -> FIBU erfolgreich");
} finally {
  if (reId) await pool.query(`DELETE FROM fibu_buchungen WHERE re_id = $1`, [reId]).catch(() => {});
  if (incomingId) await pool.query(`DELETE FROM incoming_invoices WHERE id = $1`, [incomingId]).catch(() => {});
  await pool.end();
}
