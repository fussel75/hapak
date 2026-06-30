const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:5000";
const credentials = [
  {
    username: process.env.SMOKE_USERNAME || "admin",
    password: process.env.SMOKE_PASSWORD || "admin",
  },
  {
    username: "post@fristd-bau.com",
    password: "admin",
  },
];

let cookie = "";

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

async function expectOk(label, path, options = {}) {
  const response = await request(path, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${label} fehlgeschlagen: HTTP ${response.status} ${body.slice(0, 200)}`);
  }
  console.log(`ok ${label}`);
  return response;
}

async function assertPdfResponse(label, response) {
  const pdfContentType = response.headers.get("content-type") || "";
  const pdfBuffer = await response.arrayBuffer();
  const pdfHeader = String.fromCharCode(...new Uint8Array(pdfBuffer.slice(0, 5)));
  if (!pdfContentType.includes("application/pdf") || pdfHeader !== "%PDF-" || pdfBuffer.byteLength < 1_000) {
    throw new Error(
      `${label} ungueltig: content-type=${pdfContentType}, header=${pdfHeader}, bytes=${pdfBuffer.byteLength}`,
    );
  }
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
  throw new Error("Login fehlgeschlagen: weder admin/admin noch post@fristd-bau.com/admin funktioniert");
}

async function assertImportedHapakInvoiceRegression() {
  const searchResponse = await expectOk("importierte Rechnung 26-00058 suchen", "/api/documents?search=26-00058");
  const searchResult = await searchResponse.json();
  const documents = Array.isArray(searchResult?.data) ? searchResult.data : [];
  const invoice = documents.find(
    (doc) => doc.documentNumber === "26-00058" && doc.type === "abschlagsrechnung",
  );
  if (!invoice?.id) {
    throw new Error("Import-Regressionscheck: Abschlagsrechnung 26-00058 nicht gefunden");
  }

  const itemsResponse = await expectOk("positionen rechnung 26-00058", `/api/documents/${invoice.id}/items`);
  const items = await itemsResponse.json();
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Import-Regressionscheck: Rechnung 26-00058 hat keine Positionen");
  }

  const wrongSyntheticChildren = items.filter(
    (item) => item.title === "Lohnanteil aus HAPAK-JUMBO" || item.positionFlag === "jumbo_lohn",
  );
  if (wrongSyntheticChildren.length > 0) {
    throw new Error(
      `Import-Regressionscheck: falsche HAPAK-Jumbo-Kinder vorhanden ${JSON.stringify(wrongSyntheticChildren.slice(0, 5))}`,
    );
  }

  const socketJumbo = items.find((item) => item.positionNumber === "1.1.1" && item.type === "jumbo");
  if (!socketJumbo) {
    throw new Error("Import-Regressionscheck: HAPAK-Jumbo 1.1.1 nicht gefunden");
  }
  const socketChildren = items.filter((item) => item.parentItemId === socketJumbo.id);
  if (
    String(socketJumbo.unitPrice) !== "156.15" ||
    String(socketJumbo.totalPrice) !== "874.44" ||
    socketJumbo.priceFollowsCost !== true ||
    socketChildren.length !== 0
  ) {
    throw new Error(
      `Import-Regressionscheck: HAPAK-Jumbo 1.1.1 falsch modelliert ${JSON.stringify({
        unitPrice: socketJumbo.unitPrice,
        totalPrice: socketJumbo.totalPrice,
        priceFollowsCost: socketJumbo.priceFollowsCost,
        children: socketChildren.length,
      })}`,
    );
  }

  const skontoItems = items.filter((item) => item.type === "skonto");
  if (skontoItems.length !== 1 || skontoItems[0].afterTotals !== true) {
    throw new Error(
      `Import-Regressionscheck: Skonto-Item nicht eindeutig als Nachsummenblock modelliert ${JSON.stringify(skontoItems)}`,
    );
  }

  const expectedSums = {
    net: "4121.74",
    gross: "4904.87",
  };
  const netRow = items.find((item) => item.type === "nettosumme");
  const grossRow = items.find((item) => item.type === "gesamtsumme");
  if (String(netRow?.totalPrice) !== expectedSums.net || String(grossRow?.totalPrice) !== expectedSums.gross) {
    throw new Error(
      `Import-Regressionscheck: Summen 26-00058 unerwartet netto=${netRow?.totalPrice}, brutto=${grossRow?.totalPrice}`,
    );
  }

  const pdfResponse = await expectOk("pdf rechnung 26-00058", `/api/documents/${invoice.id}/pdf?displayMode=normal`);
  await assertPdfResponse("PDF Rechnung 26-00058", pdfResponse);
  console.log("ok importierte Rechnung 26-00058 ohne HAPAK-Jumbo-/Skonto-Regression");
}

async function assertImportedHapakManualNumberingRegression() {
  const documentsResponse = await expectOk("importiertes Dokument 26-00100 suchen", "/api/documents?search=26-00100&limit=20");
  const documentsResult = await documentsResponse.json();
  const documents = Array.isArray(documentsResult?.data) ? documentsResult.data : documentsResult;
  const doc = documents.find(
    (entry) => entry.documentNumber === "26-00100" && entry.customTypeLabel === "muss noch berechnet werden",
  );
  if (!doc?.id) {
    throw new Error("Import-Regressionscheck: Dokument 26-00100 nicht gefunden");
  }

  const docResponse = await expectOk("importiertes Dokument 26-00100", `/api/documents/${doc.id}`);
  const fullDoc = await docResponse.json();
  if (fullDoc.autoPositionNumbers !== false) {
    throw new Error(`Import-Regressionscheck: 26-00100 muss manuelle Positionsnummern behalten, autoPositionNumbers=${fullDoc.autoPositionNumbers}`);
  }

  const itemsResponse = await expectOk("positionen dokument 26-00100", `/api/documents/${doc.id}/items`);
  const items = await itemsResponse.json();
  const containerSetup = items.find((item) => item.positionNumber === "8.4" && item.type === "jumbo");
  if (!containerSetup) {
    throw new Error("Import-Regressionscheck: HAPAK-Jumbo 8.4 nicht gefunden");
  }
  const containerChildren = items.filter((item) => item.parentItemId === containerSetup.id);
  if (
    String(containerSetup.unitPrice) !== "97.50" ||
    String(containerSetup.totalPrice) !== "97.50" ||
    String(containerSetup.externalCost) !== "75.00" ||
    String(containerSetup.externalMarkup) !== "30.00" ||
    containerSetup.priceFollowsCost !== true ||
    containerChildren.length !== 0
  ) {
    throw new Error(
      `Import-Regressionscheck: HAPAK-Jumbo 8.4 falsch modelliert ${JSON.stringify({
        unitPrice: containerSetup.unitPrice,
        totalPrice: containerSetup.totalPrice,
        externalCost: containerSetup.externalCost,
        externalMarkup: containerSetup.externalMarkup,
        priceFollowsCost: containerSetup.priceFollowsCost,
        children: containerChildren.length,
      })}`,
    );
  }

  console.log("ok importiertes Dokument 26-00100 mit manueller Nummerierung und Fremdleistungs-Jumbo");
}

await expectOk("app shell", "/");
await login();
await expectOk("auth/me", "/api/auth/me");
const documentsResponse = await expectOk("dokumente", "/api/documents?limit=5");
const documentsResult = await documentsResponse.json();
const firstDocument = Array.isArray(documentsResult?.data) ? documentsResult.data[0] : null;
if (!firstDocument?.id) throw new Error("Dokumentliste liefert keinen Dokumentdatensatz fuer den Basis-Smoke");
await expectOk("projekte", "/api/projects");

const docResponse = await expectOk("basis-dokument", `/api/documents/${firstDocument.id}`);
const doc = await docResponse.json();
if (!doc?.id) throw new Error("Basis-Dokument liefert keinen Dokumentdatensatz");
await expectOk("positionen basis-dokument", `/api/documents/${firstDocument.id}/items`);

const pdfResponse = await expectOk("pdf basis-dokument", `/api/documents/${firstDocument.id}/pdf?displayMode=normal`);
await assertPdfResponse("PDF Basis-Dokument", pdfResponse);

await assertImportedHapakInvoiceRegression();
await assertImportedHapakManualNumberingRegression();

console.log("Smoke-Test erfolgreich");
