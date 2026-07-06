import fs from "fs";
import os from "os";
import path from "path";
import puppeteer from "puppeteer-core";

const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:5000";
const username = process.env.SMOKE_USERNAME || "admin";
const password = process.env.SMOKE_PASSWORD || "admin";

const browserCandidates = [
  process.env.BROWSER_EXECUTABLE_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findBrowserExecutable() {
  for (const candidate of browserCandidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    "Kein Edge/Chrome gefunden. Setze BROWSER_EXECUTABLE_PATH auf den Browser-Pfad.",
  );
}

async function assertNoRuntimeOverlay(page, label) {
  const bodyText = await page.evaluate(() => document.body?.innerText || "");
  const forbidden = [
    "[plugin:runtime-error-plugin]",
    "Uncaught TypeError",
    "projectDocuments.filter is not a function",
    "This site can't be reached",
    "ERR_CONNECTION_REFUSED",
  ];
  const hit = forbidden.find((needle) => bodyText.includes(needle));
  if (hit) {
    throw new Error(`${label}: Runtime-Overlay oder Fehlertext gefunden: ${hit}`);
  }
}

async function gotoAndCheck(page, pathName, label) {
  const response = await page.goto(`${baseUrl}${pathName}`, {
    waitUntil: "networkidle2",
    timeout: 30_000,
  });
  if (!response || !response.ok()) {
    throw new Error(`${label}: HTTP ${response?.status() ?? "keine Antwort"}`);
  }
  await assertNoRuntimeOverlay(page, label);
  console.log(`ok ${label}`);
}

async function assertNewDocumentTypeWorkflow(page) {
  await gotoAndCheck(page, "/dokumente", "dokumente page for new document types");
  await page.click('[data-testid="button-new-document"]');

  const expectedTypes = [
    "angebot",
    "auftragsbestaetigung",
    "rechnung",
    "abschlagsrechnung",
    "teilrechnung",
    "gutschrift",
    "lieferschein",
    "freies_dokument",
    "mitschnitt",
  ];

  for (const type of expectedTypes) {
    await page.waitForSelector(`[data-testid="menu-new-document-${type}"]`, { timeout: 10_000 });
  }

  const menuState = await page.evaluate((types) => {
    return types.map((type) => {
      const item = document.querySelector(`[data-testid="menu-new-document-${type}"]`);
      return { type, text: item?.textContent || "", visible: !!item };
    });
  }, expectedTypes);
  const missing = menuState.filter((entry) => !entry.visible);
  if (missing.length) {
    throw new Error(`new document types: fehlende Menuepunkte ${missing.map((entry) => entry.type).join(", ")}`);
  }

  const assertNewDocumentType = async (type, label) => {
    await gotoAndCheck(page, `/dokumente/neu?type=${type}`, `new ${type} editor`);
    await page.waitForFunction(
      (expectedLabel) => {
        const title = document.querySelector('[data-testid="text-doc-title"]')?.textContent || "";
        const body = document.body?.innerText || "";
        return title.includes(expectedLabel) && body.includes(expectedLabel);
      },
      { timeout: 20_000 },
      label,
    );
    const state = await page.evaluate(() => ({
      title: document.querySelector('[data-testid="text-doc-title"]')?.textContent || "",
      body: document.body?.innerText || "",
      url: window.location.pathname + window.location.search,
    }));
    if (!state.url.includes(`type=${type}`) || !state.title.includes(label)) {
      throw new Error(`new document type ${type}: falscher Editorzustand ${JSON.stringify(state)}`);
    }
  };

  await assertNewDocumentType("rechnung", "Rechnung");
  await assertNewDocumentType("lieferschein", "Lieferschein");
  await assertNewDocumentType("freies_dokument", "Freies Dokument");

  await assertNoRuntimeOverlay(page, "new document type workflow");
  console.log("ok document new-type menu and editor routing");
}

async function assertNewDocumentSaveRoundtrip(page, type = "freies_dokument", label = "Freies Dokument") {
  const marker = `Smoke Roundtrip ${label} ${Date.now()}`;
  let savedDocumentId = null;
  let projectId = null;

  try {
    const project = await page.evaluate(async () => {
      const response = await fetch("/api/projects", { credentials: "include" });
      if (!response.ok) return null;
      const projects = await response.json();
      return Array.isArray(projects) && projects.length > 0 ? projects[0] : null;
    });
    projectId = project?.id || null;
    const customerId = project?.customerId || 1;
    if (!projectId) {
      throw new Error("new document save roundtrip: kein Projekt fuer Projektbaum-Pruefung gefunden");
    }

    await gotoAndCheck(page, `/dokumente/neu?type=${type}&customerId=${customerId}&projectId=${projectId}`, `new ${type} save roundtrip editor`);
    await page.waitForFunction(
      (expectedLabel) => (document.querySelector('[data-testid="text-doc-title"]')?.textContent || "").includes(expectedLabel),
      { timeout: 20_000 },
      label,
    );

    await page.click('[data-testid="toolbar-add-freitext"]');
    await page.waitForSelector('[contenteditable="true"][data-field="title"][data-placeholder="Text eingeben..."]', {
      timeout: 10_000,
    });
    await page.evaluate(() => {
      const cells = Array.from(
        document.querySelectorAll('[contenteditable="true"][data-field="title"][data-placeholder="Text eingeben..."]'),
      );
      const cell = cells[cells.length - 1];
      if (!(cell instanceof HTMLElement)) throw new Error("Freitext-Zelle fuer Roundtrip nicht gefunden");
      cell.focus();
      const range = document.createRange();
      range.selectNodeContents(cell);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    await page.keyboard.type(`${marker} Zeile 1`);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type(`${marker} Zeile 3`);

    const saveResponsePromise = page.waitForResponse(
      (response) => response.url().includes("/api/documents/full-save") && response.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.click('[data-testid="button-save"]');
    const saveResponse = await saveResponsePromise;
    if (!saveResponse.ok()) {
      throw new Error(`new document save roundtrip: HTTP ${saveResponse.status()} beim Speichern`);
    }
    const savePayload = await saveResponse.json();
    savedDocumentId = savePayload?.document?.id || null;
    const savedNumber = savePayload?.document?.documentNumber || "";
    if (!savedDocumentId || savePayload?.document?.type !== type || !/^\d{2}-\d{5}$/.test(savedNumber)) {
      throw new Error(`new document save roundtrip: unerwartete Speicherdaten ${JSON.stringify(savePayload?.document || {})}`);
    }
    if (Number(savePayload?.document?.projectId) !== Number(projectId)) {
      throw new Error(`new document save roundtrip: Projektbezug nicht gespeichert ${JSON.stringify(savePayload?.document || {})}`);
    }

    const treeState = await page.evaluate(async ({ documentId, projectId }) => {
      const response = await fetch(`/api/projects/${projectId}/document-tree`, { credentials: "include" });
      if (!response.ok) return { ok: false, status: response.status, hasNode: false };
      const nodes = await response.json();
      return {
        ok: true,
        status: response.status,
        hasNode: Array.isArray(nodes) && nodes.some((node) => Number(node.document_id) === Number(documentId)),
      };
    }, { documentId: savedDocumentId, projectId });
    if (!treeState.ok || !treeState.hasNode) {
      throw new Error(`new document save roundtrip: Dokument fehlt im Projektbaum ${JSON.stringify(treeState)}`);
    }

    await page.waitForFunction(
      (id) => window.location.pathname === `/dokumente/${id}/bearbeiten`,
      { timeout: 30_000 },
      savedDocumentId,
    );
    await page.reload({ waitUntil: "networkidle2", timeout: 30_000 });
    await assertNoRuntimeOverlay(page, "new document save roundtrip reload");
    await page.waitForFunction(
      (expectedMarker) => (document.body?.innerText || "").includes(expectedMarker),
      { timeout: 20_000 },
      marker,
    );

    const pdfState = await page.evaluate(async (id) => {
      const response = await fetch(`/api/documents/${id}/pdf?displayMode=normal`, { credentials: "include" });
      const contentType = response.headers.get("content-type") || "";
      const buffer = await response.arrayBuffer();
      const header = String.fromCharCode(...Array.from(new Uint8Array(buffer.slice(0, 5))));
      return {
        ok: response.ok,
        status: response.status,
        contentType,
        header,
        byteLength: buffer.byteLength,
      };
    }, savedDocumentId);
    if (!pdfState.ok || !pdfState.contentType.includes("application/pdf") || pdfState.header !== "%PDF-" || pdfState.byteLength < 1_000) {
      throw new Error(`new document save roundtrip: PDF fuer ${type} ungueltig ${JSON.stringify(pdfState)}`);
    }

    console.log(`ok new ${type} save/reload roundtrip`);
    console.log(`ok new ${type} pdf export`);
  } finally {
    if (savedDocumentId) {
      await page.evaluate(async (id) => {
        await fetch(`/api/documents/${id}`, { method: "DELETE", credentials: "include" });
      }, savedDocumentId).catch(() => null);
      if (projectId) {
        const deletedTreeState = await page.evaluate(async ({ documentId, projectId }) => {
          const response = await fetch(`/api/projects/${projectId}/document-tree`, { credentials: "include" });
          if (!response.ok) return { ok: false, status: response.status, hasNode: false };
          const nodes = await response.json();
          return {
            ok: true,
            status: response.status,
            hasNode: Array.isArray(nodes) && nodes.some((node) => Number(node.document_id) === Number(documentId)),
          };
        }, { documentId: savedDocumentId, projectId }).catch(() => null);
        if (deletedTreeState?.hasNode) {
          throw new Error("new document save roundtrip: geloeschtes Dokument steht weiter im Projektbaum");
        }
      }
    }
  }
}

async function assertExistingDocumentPdf(page) {
  const result = await page.evaluate(async () => {
    const documentsResponse = await fetch("/api/documents?limit=5", { credentials: "include" });
    const documentsResult = await documentsResponse.json();
    const firstDocument = Array.isArray(documentsResult?.data) ? documentsResult.data[0] : null;
    if (!documentsResponse.ok || !firstDocument?.id) {
      return {
        ok: false,
        status: documentsResponse.status,
        contentType: "",
        byteLength: 0,
        header: "",
        documentId: null,
      };
    }
    const response = await fetch(`/api/documents/${firstDocument.id}/pdf?displayMode=normal`, { credentials: "include" });
    const contentType = response.headers.get("content-type") || "";
    const buffer = await response.arrayBuffer();
    const bytes = Array.from(new Uint8Array(buffer.slice(0, 5)));
    const header = String.fromCharCode(...bytes);
    return {
      ok: response.ok,
      status: response.status,
      contentType,
      byteLength: buffer.byteLength,
      header,
      documentId: firstDocument.id,
    };
  });

  if (!result.ok || !result.contentType.includes("application/pdf") || result.header !== "%PDF-" || result.byteLength < 1_000) {
    throw new Error(`document pdf: ungueltige PDF-Antwort ${JSON.stringify(result)}`);
  }
  console.log(`ok pdf basis-dokument ${result.documentId}`);
}

async function assertImportedHapakDocumentVisualGuards(page) {
  const docState = await page.evaluate(async () => {
    const response = await fetch("/api/documents?search=26-00100&limit=20", { credentials: "include" });
    if (!response.ok) return { ok: false, status: response.status, id: null, message: "Dokumentsuche fehlgeschlagen" };
    const result = await response.json();
    const documents = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : [];
    const doc = documents.find((entry) => entry.documentNumber === "26-00100" && entry.customTypeLabel === "muss noch berechnet werden");
    if (!doc?.id) return { ok: false, status: response.status, id: null, message: "26-00100 nicht gefunden" };
    return { ok: true, status: response.status, id: doc.id, message: "" };
  });

  if (!docState.ok || !docState.id) {
    throw new Error(`imported HAPAK visual guards: ${docState.message}`);
  }

  await gotoAndCheck(page, `/dokumente/${docState.id}/bearbeiten`, "importiertes HAPAK-Dokument 26-00100 editor");
  await page.waitForFunction(
    () => (document.querySelector('[data-testid="text-doc-title"]')?.textContent || "").includes("26-00100"),
    { timeout: 20_000 },
  );

  const visualState = await page.evaluate(() => {
    const bodyText = document.body?.innerText || "";
    const visibleAppendButtons = Array.from(document.querySelectorAll("button, a, span, div"))
      .filter((element) => {
        if ((element.textContent || "").trim() !== "+ Anhängen" && (element.textContent || "").trim() !== "Anhängen") return false;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
      })
      .length;
    const rowLines = Array.from(document.querySelectorAll("[data-row]"))
      .map((row) => (row.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const importPositionRow = rowLines.find((text) => text.includes("Anfahrt")) || "";
    return {
      hasAppendText: bodyText.includes("+ Anhängen") || bodyText.includes("Anhängen"),
      visibleAppendButtons,
      hasImportedPosition: importPositionRow.includes("Anfahrt"),
      importedPositionRow: importPositionRow,
      hasManualNumber: /(^|[^\d])8\.4([^\d]|$)/.test(importPositionRow),
      hasWrongRenumberedManualPosition: /(^|[^\d])1\.4([^\d]|$)/.test(importPositionRow),
    };
  });

  if (visualState.hasAppendText || visualState.visibleAppendButtons > 0) {
    throw new Error(`imported HAPAK visual guards: sichtbarer Anhängen-Text im Dokument ${JSON.stringify(visualState)}`);
  }
  if (!visualState.hasImportedPosition || !visualState.hasManualNumber || visualState.hasWrongRenumberedManualPosition) {
    throw new Error(`imported HAPAK visual guards: erwartete Importposition nicht sichtbar ${JSON.stringify(visualState)}`);
  }

  await page.waitForSelector('[data-testid="button-collapse-all"]', { timeout: 10_000 });
  await page.click('[data-testid="button-collapse-all"]');
  await page.waitForFunction(
    () => !(document.body?.innerText || "").includes("darin enthalten:"),
    { timeout: 10_000 },
  );

  await page.click('[data-testid="button-expand-all"]');
  await page.waitForFunction(
    () => (document.body?.innerText || "").includes("darin enthalten:"),
    { timeout: 10_000 },
  );

  console.log("ok importiertes HAPAK-Dokument ohne sichtbare Anhängen-Artefakte");
}

async function assertImportedHapakInvoiceVisualGuards(page) {
  const docState = await page.evaluate(async () => {
    const response = await fetch("/api/documents?search=26-00058&limit=20", { credentials: "include" });
    if (!response.ok) return { ok: false, status: response.status, id: null, message: "Dokumentsuche fehlgeschlagen" };
    const result = await response.json();
    const documents = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : [];
    const doc = documents.find((entry) => entry.documentNumber === "26-00058" && entry.type === "abschlagsrechnung");
    if (!doc?.id) return { ok: false, status: response.status, id: null, message: "26-00058 nicht gefunden" };
    return { ok: true, status: response.status, id: doc.id, message: "" };
  });

  if (!docState.ok || !docState.id) {
    throw new Error(`imported HAPAK invoice visual guards: ${docState.message}`);
  }

  await gotoAndCheck(page, `/dokumente/${docState.id}/bearbeiten`, "importierte HAPAK-Rechnung 26-00058 editor");
  await page.waitForFunction(
    () => (document.querySelector('[data-testid="text-doc-title"]')?.textContent || "").includes("26-00058"),
    { timeout: 20_000 },
  );

  const visualState = await page.evaluate(() => {
    const bodyText = document.body?.innerText || "";
    const rowLines = Array.from(document.querySelectorAll("[data-row]"))
      .map((row) => (row.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const socketRow = rowLines.find((text) => text.includes("2-fach Schukosteckdose")) || "";
    const amountSelectors = [
      '[data-testid="text-summary-netto"]',
      '[data-testid="text-summary-mwst"]',
      '[data-testid="text-summary-brutto"]',
      '[data-testid^="skonto-amount-"]',
      '[data-testid^="skonto-hint-amount-"]',
    ];
    const amountRights = amountSelectors.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector)).map((element) =>
        Math.round(element.getBoundingClientRect().right * 10) / 10,
      ),
    );
    const rightDelta =
      amountRights.length > 1 ? Math.max(...amountRights) - Math.min(...amountRights) : 0;
    const pageOverflowDeltas = Array.from(document.querySelectorAll(".a4-page")).map(
      (element) => element.scrollWidth - element.clientWidth,
    );
    const workSurface = document.querySelector('[data-testid="document-work-surface"]');
    const workSurfaceStyle = workSurface ? getComputedStyle(workSurface) : null;
    const workSurfaceHasVisibleHorizontalScrollbar =
      !!workSurface &&
      workSurface.scrollWidth > workSurface.clientWidth + 1 &&
      ["auto", "scroll"].includes(workSurfaceStyle?.overflowX || "");
    const titleSumLooksLikeLink = Array.from(document.querySelectorAll('[data-testid^="btn-titelsumme-detail-"]')).some(
      (element) => /\bhover:underline\b|\bhover:text-blue/.test(element.getAttribute("class") || ""),
    );
    return {
      hasSyntheticJumboLabor: bodyText.includes("Lohnanteil aus HAPAK-JUMBO") || bodyText.includes("Fremdleistungsanteil aus HAPAK-JUMBO"),
      hasInvoiceTitle: bodyText.includes("Rechnung 26-00058"),
      socketRow,
      hasSocketRow: socketRow.includes("2-fach Schukosteckdose"),
      hasSocketNumber: /(^|[^\d])1\.1\.1([^\d]|$)/.test(socketRow),
      hasSocketUnitPrice: socketRow.includes("156,15"),
      hasSocketTotalPrice: socketRow.includes("874,44"),
      hasBrokenTitleSumText: bodyText.includes("Titelumme"),
      rightDelta: Math.round(rightDelta * 10) / 10,
      pageOverflowDeltas,
      workSurfaceOverflowX: workSurfaceStyle?.overflowX || "",
      workSurfaceHasVisibleHorizontalScrollbar,
      titleSumLooksLikeLink,
    };
  });

  if (
    visualState.hasSyntheticJumboLabor ||
    !visualState.hasInvoiceTitle ||
    !visualState.hasSocketRow ||
    !visualState.hasSocketNumber ||
    !visualState.hasSocketUnitPrice ||
    !visualState.hasSocketTotalPrice ||
    visualState.hasBrokenTitleSumText ||
    visualState.rightDelta > 2 ||
    visualState.pageOverflowDeltas.some((delta) => delta > 1) ||
    visualState.workSurfaceOverflowX !== "hidden" ||
    visualState.workSurfaceHasVisibleHorizontalScrollbar ||
    visualState.titleSumLooksLikeLink
  ) {
    throw new Error(`imported HAPAK invoice visual guards: sichtbare Rechnung 26-00058 unerwartet ${JSON.stringify(visualState)}`);
  }

  console.log("ok importierte HAPAK-Rechnung 26-00058 ohne sichtbare Jumbo-Import-Artefakte");
}

async function withTemporaryEditorDocument(page, callback) {
  const marker = `Smoke Editor ${Date.now()}`;
  let documentId = null;
  let projectId = null;

  try {
    const setup = await page.evaluate(async (markerText) => {
      const projectsResponse = await fetch("/api/projects", { credentials: "include" });
      if (!projectsResponse.ok) return { ok: false, message: `Projekte HTTP ${projectsResponse.status}` };
      const projects = await projectsResponse.json();
      const project = Array.isArray(projects) && projects.length > 0 ? projects[0] : null;
      if (!project?.id) return { ok: false, message: "Kein Projekt fuer Editor-Smoke gefunden" };

      const payload = {
        document: {
          type: "angebot",
          customerId: project.customerId || 1,
          projectId: project.id,
          subject: markerText,
          status: "entwurf",
          date: new Date().toISOString().slice(0, 10),
          taxRate: "19.00",
        },
        items: [
          {
            type: "leistung",
            positionNumber: "1.",
            title: `${markerText} Basisposition`,
            description: "Temporäre Smoke-Position",
            unit: "Stk",
            quantity: "1.000",
            unitPrice: "10.00",
            totalPrice: "10.00",
            sortOrder: 0,
            positionFlag: "normal",
          },
        ],
      };

      const saveResponse = await fetch("/api/documents/full-save", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!saveResponse.ok) return { ok: false, message: `Editor-Smoke-Dokument speichern HTTP ${saveResponse.status}` };
      const saved = await saveResponse.json();
      if (!saved?.document?.id) return { ok: false, message: "Editor-Smoke-Dokument ohne Dokument-ID gespeichert" };

      return {
        ok: true,
        message: "",
        documentId: saved.document.id,
        projectId: project.id,
      };
    }, marker);

    documentId = setup.documentId || null;
    projectId = setup.projectId || null;
    if (!setup.ok || !documentId) {
      throw new Error(`temporary editor document: ${setup.message}`);
    }

    await gotoAndCheck(page, `/dokumente/${documentId}/bearbeiten`, "temporary document editor");
    await callback(documentId);
  } finally {
    if (documentId) {
      await page.evaluate(async (id) => {
        await fetch(`/api/documents/${id}`, { method: "DELETE", credentials: "include" });
      }, documentId).catch(() => null);
    }
    if (documentId && projectId) {
      const cleanupState = await page.evaluate(async ({ documentId: id, pid }) => {
        const response = await fetch(`/api/projects/${pid}/document-tree`, { credentials: "include" });
        if (!response.ok) return { ok: false, hasNode: false, status: response.status };
        const nodes = await response.json();
        return {
          ok: true,
          hasNode: Array.isArray(nodes) && nodes.some((node) => Number(node.document_id) === Number(id)),
          status: response.status,
        };
      }, { documentId, pid: projectId }).catch(() => null);
      if (cleanupState?.hasNode) {
        throw new Error("temporary editor document: geloeschtes Smoke-Dokument steht weiter im Projektbaum");
      }
    }
  }
}

async function assertDocumentConversionProjectTree(page) {
  const marker = `Smoke Convert ${Date.now()}`;
  let sourceId = null;
  let convertedId = null;
  let projectId = null;

  try {
    const setup = await page.evaluate(async (markerText) => {
      const projectsResponse = await fetch("/api/projects", { credentials: "include" });
      if (!projectsResponse.ok) return { ok: false, message: `Projekte HTTP ${projectsResponse.status}` };
      const projects = await projectsResponse.json();
      const project = Array.isArray(projects) && projects.length > 0 ? projects[0] : null;
      if (!project?.id) return { ok: false, message: "Kein Projekt fuer Umwandlungs-Smoke gefunden" };

      const payload = {
        document: {
          type: "angebot",
          customerId: project.customerId || 1,
          projectId: project.id,
          subject: markerText,
          status: "entwurf",
          date: new Date().toISOString().slice(0, 10),
          taxRate: "19.00",
        },
        items: [],
      };
      const saveResponse = await fetch("/api/documents/full-save", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!saveResponse.ok) return { ok: false, message: `Quelle speichern HTTP ${saveResponse.status}` };
      const saved = await saveResponse.json();
      const sourceDocument = saved.document;
      if (!sourceDocument?.id) return { ok: false, message: "Quelle ohne Dokument-ID gespeichert" };

      const convertResponse = await fetch(`/api/documents/${sourceDocument.id}/convert`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: "rechnung" }),
      });
      if (!convertResponse.ok) return { ok: false, message: `Umwandlung HTTP ${convertResponse.status}` };
      const converted = await convertResponse.json();
      if (converted.type !== "rechnung") {
        return { ok: false, message: `Unerwarteter Zieltyp ${converted.type}`, sourceId: sourceDocument.id, convertedId: converted.id, projectId: project.id };
      }

      const treeResponse = await fetch(`/api/projects/${project.id}/document-tree`, { credentials: "include" });
      if (!treeResponse.ok) return { ok: false, message: `Projektbaum HTTP ${treeResponse.status}`, sourceId: sourceDocument.id, convertedId: converted.id, projectId: project.id };
      const nodes = await treeResponse.json();
      const hasConvertedNode = Array.isArray(nodes) && nodes.some((node) => Number(node.document_id) === Number(converted.id));
      return {
        ok: hasConvertedNode,
        message: hasConvertedNode ? "" : "Umgewandeltes Dokument fehlt im Projektbaum",
        sourceId: sourceDocument.id,
        convertedId: converted.id,
        projectId: project.id,
      };
    }, marker);

    sourceId = setup.sourceId || null;
    convertedId = setup.convertedId || null;
    projectId = setup.projectId || null;
    if (!setup.ok) {
      throw new Error(`document conversion project tree: ${setup.message}`);
    }

    console.log("ok document conversion keeps project tree in sync");
  } finally {
    for (const id of [convertedId, sourceId].filter(Boolean)) {
      await page.evaluate(async (documentId) => {
        await fetch(`/api/documents/${documentId}`, { method: "DELETE", credentials: "include" });
      }, id).catch(() => null);
    }
    if (projectId && convertedId) {
      const cleanupState = await page.evaluate(async ({ documentId, pid }) => {
        const response = await fetch(`/api/projects/${pid}/document-tree`, { credentials: "include" });
        if (!response.ok) return { ok: false, hasNode: false };
        const nodes = await response.json();
        return {
          ok: true,
          hasNode: Array.isArray(nodes) && nodes.some((node) => Number(node.document_id) === Number(documentId)),
        };
      }, { documentId: convertedId, pid: projectId }).catch(() => null);
      if (cleanupState?.hasNode) {
        throw new Error("document conversion project tree: geloeschtes Zieldokument steht weiter im Projektbaum");
      }
    }
  }
}

async function assertEditorTextCellEditable(page) {
  const result = await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('[contenteditable="true"][data-field="title"]'));
    const cell = cells.find((candidate) => {
      const row = candidate.closest("[data-row]");
      return row && candidate.getBoundingClientRect().width > 50;
    });
    if (!cell) {
      return { ok: false, message: "Keine editierbare Text-/Titelzelle im Dokumenteditor gefunden" };
    }

    const marker = ` smoke-${Date.now()} `;
    const before = cell.innerHTML;
    cell.focus();
    cell.innerHTML = `${before}${marker}`;
    cell.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: marker }));
    const inserted = cell.textContent?.includes(marker.trim()) === true;
    cell.innerHTML = before;
    cell.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward", data: null }));

    return inserted
      ? { ok: true, message: "" }
      : { ok: false, message: "Editierbare Zelle hat Testtext nicht angenommen" };
  });

  if (!result.ok) {
    throw new Error(`document editor editability: ${result.message}`);
  }
  console.log("ok document editor editable text cell");
}

async function assertFreeTextMultilineEditing(page) {
  const initialTextCells = await page.$$eval(
    '[contenteditable="true"][data-field="title"][data-placeholder="Text eingeben..."]',
    (cells) => cells.length,
  );

  const firstRow = await page.$('[data-row="0"]');
  if (!firstRow) {
    throw new Error("document editor free text: keine erste Dokumentzeile gefunden");
  }
  await firstRow.click();
  await page.click('[data-testid="toolbar-add-freitext"]');
  await page.waitForFunction(
    (count) => document.querySelectorAll('[contenteditable="true"][data-field="title"][data-placeholder="Text eingeben..."]').length > count,
    { timeout: 10_000 },
    initialTextCells,
  );

  const result = await page.evaluate(() => {
    const cells = Array.from(
      document.querySelectorAll('[contenteditable="true"][data-field="title"][data-placeholder="Text eingeben..."]'),
    );
    const cell = cells[cells.length - 1];
    if (!cell) {
      return { ok: false, message: "Freitext-Zelle wurde nicht angelegt" };
    }

    const lines = Array.from({ length: 8 }, (_, index) => `<div>Smoke Freitext ${index + 1}</div>`).join("");
    cell.focus();
    cell.innerHTML = lines;
    cell.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "Smoke Freitext" }));
    const row = cell.closest("[data-row]");
    const accepted = cell.textContent?.includes("Smoke Freitext 8") === true;
    const editable = cell.getAttribute("contenteditable") === "true";
    const rect = cell.getBoundingClientRect();
    const rowRect = row?.getBoundingClientRect();
    const lineHeight = parseFloat(window.getComputedStyle(cell).lineHeight || "0") || 14;
    const minimumVisibleHeight = lineHeight * 7;
    const visiblyExpanded = rect.height >= minimumVisibleHeight && (!rowRect || rowRect.height >= minimumVisibleHeight);

    return accepted && editable && !!row && visiblyExpanded
      ? { ok: true, message: "" }
      : {
          ok: false,
          message: `Mehrzeiliger Freitext ist nicht stabil sichtbar/editierbar (cell=${Math.round(rect.height)}px, row=${Math.round(rowRect?.height || 0)}px)`,
        };
  });

  if (!result.ok) {
    throw new Error(`document editor free text: ${result.message}`);
  }

  await sleep(500);
  await assertNoRuntimeOverlay(page, "free text multiline editing");
  console.log("ok document editor multiline free text editing");
}

async function assertQuantityInputAcceptsGermanDecimal(page) {
  const quantityInput = await page.evaluateHandle(() => {
    const inputs = Array.from(document.querySelectorAll('input[data-field="quantity"]'));
    return inputs.find((input) => {
      const rect = input.getBoundingClientRect();
      return rect.width > 20 && rect.height > 10 && rect.bottom > 0 && rect.top < window.innerHeight;
    }) || null;
  });
  if (!quantityInput) {
    throw new Error("document editor quantity: kein Mengenfeld gefunden");
  }

  await quantityInput.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.keyboard.type("12,50");

  const result = await page.evaluate((input) => {
    if (!(input instanceof HTMLInputElement)) {
      return { ok: false, message: "Mengenfeld ist kein Eingabefeld" };
    }
    const value = input.value;
    const accepted = value.includes("12,50") || value.includes("12.50");
    return accepted
      ? { ok: true, message: "" }
      : { ok: false, message: `Mengenfeld hat mehrstellige deutsche Eingabe nicht behalten (testid=${input.getAttribute("data-testid")}, value=${value})` };
  }, quantityInput);

  if (!result.ok) {
    throw new Error(`document editor quantity: ${result.message}`);
  }

  await assertNoRuntimeOverlay(page, "quantity german decimal editing");
  console.log("ok document editor quantity accepts german decimal");
}

async function openDisplayMenu(page, expectedSelector) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.click('[data-testid="button-listen-dropdown"]');
    try {
      await page.waitForSelector(expectedSelector, { timeout: 2_500, visible: true });
      return;
    } catch {
      await page.keyboard.press("Escape").catch(() => null);
      await sleep(250);
    }
  }
  const toolbarText = await page.evaluate(() => document.body?.innerText?.slice(0, 2000) || "");
  throw new Error(`display mode: Dropdown liess sich nicht oeffnen (${expectedSelector}). Textauszug: ${toolbarText}`);
}

async function chooseDisplayMode(page, selector) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await openDisplayMenu(page, selector);
    const clicked = await page.evaluate((targetSelector) => {
      const item = document.querySelector(targetSelector);
      if (!(item instanceof HTMLElement)) return false;
      item.click();
      return true;
    }, selector);
    if (clicked) return;
    await page.keyboard.press("Escape").catch(() => null);
    await sleep(250);
  }
  throw new Error(`display mode: Menuepunkt verschwunden vor Auswahl (${selector})`);
}

async function assertDisplayModeMenu(page) {
  const initialState = await page.evaluate(() => {
    const trigger = document.querySelector('[data-testid="button-listen-dropdown"]');
    const visiblePriceCells = Array.from(
      document.querySelectorAll('[data-testid^="input-ep-"], [data-testid^="button-price-"]'),
    ).filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (el.textContent || "").trim().length > 0;
    });
    return {
      label: trigger?.textContent || "",
      visiblePriceCount: visiblePriceCells.length,
    };
  });

  if (!initialState.label.includes("Vollständig")) {
    throw new Error(`display mode: Startlabel ist nicht Vollständig (${initialState.label})`);
  }
  if (initialState.visiblePriceCount === 0) {
    throw new Error("display mode: keine sichtbaren Preiszellen im vollständigen Modus gefunden");
  }

  await chooseDisplayMode(page, '[data-testid="menu-display-ohne-preise"]');
  await page.waitForFunction(
    () => (document.querySelector('[data-testid="button-listen-dropdown"]')?.textContent || "").includes("Ohne Positionspreise"),
    { timeout: 10_000 },
  );

  const hiddenState = await page.evaluate(() => {
    const trigger = document.querySelector('[data-testid="button-listen-dropdown"]');
    const visiblePriceCells = Array.from(
      document.querySelectorAll('[data-testid^="input-ep-"], [data-testid^="button-price-"]'),
    ).filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (el.textContent || "").trim().length > 0;
    });
    return {
      label: trigger?.textContent || "",
      visiblePriceCount: visiblePriceCells.length,
    };
  });

  if (!hiddenState.label.includes("Ohne Positionspreise")) {
    throw new Error(`display mode: Dropdownlabel folgt Auswahl nicht (${hiddenState.label})`);
  }
  if (hiddenState.visiblePriceCount !== 0) {
    throw new Error(`display mode: Preise sind im Modus Ohne Positionspreise noch sichtbar (${hiddenState.visiblePriceCount})`);
  }

  await chooseDisplayMode(page, '[data-testid="menu-display-normal"]');
  await page.waitForFunction(
    () => (document.querySelector('[data-testid="button-listen-dropdown"]')?.textContent || "").includes("Vollständig"),
    { timeout: 10_000 },
  );

  await assertNoRuntimeOverlay(page, "display mode menu");
  console.log("ok document editor display mode menu hides and restores position prices");
}

async function assertFreeJumboWorkflow(page) {
  const firstRow = await page.$('[data-row="0"]');
  if (!firstRow) {
    throw new Error("document editor free jumbo: keine erste Dokumentzeile gefunden");
  }

  const rowsBeforeJumbo = await page.$$eval("[data-row]", (rows) => rows.length);
  const jumboRowsBefore = await page.$$eval("[data-row]", (rows) =>
    rows
      .filter((row) => (row.getAttribute("data-position-type") || "").toLowerCase() === "jumbo")
      .map((row) => row.getAttribute("data-row")),
  );
  await firstRow.click();
  await page.click('[data-testid="toolbar-add-jumbo-frei"]');
  await page.waitForFunction(
    (count) => document.querySelectorAll("[data-row]").length > count,
    { timeout: 10_000 },
    rowsBeforeJumbo,
  );

  const jumboState = await page.evaluate((knownJumboRows) => {
    const known = new Set(knownJumboRows);
    const rows = Array.from(document.querySelectorAll("[data-row]"));
    const jumboRows = rows.filter((row) => (row.getAttribute("data-position-type") || "").toLowerCase() === "jumbo");
    const row = jumboRows.find((candidate) => !known.has(candidate.getAttribute("data-row"))) || jumboRows[jumboRows.length - 1];
    if (!row) {
      return { ok: false, message: "Nach Toolbar-Klick wurde keine Jumbo-Position sichtbar", rowIndex: null };
    }
    const rowIndex = row.getAttribute("data-row");
    const titleCell = row.querySelector('[contenteditable="true"][data-field="title"]');
    const addButton = row.parentElement?.querySelector(`[data-testid="button-jumbo-add-${rowIndex}"]`);
    return {
      ok: !!rowIndex && !!titleCell && !!addButton,
      message: `rowIndex=${rowIndex}, titleCell=${!!titleCell}, addButton=${!!addButton}`,
      rowIndex,
    };
  }, jumboRowsBefore);

  if (!jumboState.ok || !jumboState.rowIndex) {
    throw new Error(`document editor free jumbo: ${jumboState.message}`);
  }

  const rowsBeforeChild = await page.$$eval("[data-row]", (rows) => rows.length);
  await page.click(`[data-testid="button-jumbo-add-${jumboState.rowIndex}"]`);
  await page.waitForSelector('[data-testid="jumbo-menu-manuell"]', { timeout: 10_000 });
  await page.$eval('[data-testid="jumbo-menu-manuell"]', (button) => button.click());
  await page.waitForFunction(
    (count) => document.querySelectorAll("[data-row]").length > count,
    { timeout: 10_000 },
    rowsBeforeChild,
  );

  const childState = await page.evaluate((parentIndex) => {
    const parentRow = document.querySelector(`[data-row="${parentIndex}"]`);
    if (!parentRow) {
      return { ok: false, message: "Jumbo-Elternzeile nach Kindanlage nicht mehr gefunden", childIndex: null };
    }
    const allRows = Array.from(document.querySelectorAll("[data-row]"));
    const parentPosition = allRows.indexOf(parentRow);
    const followingRows = allRows.slice(parentPosition + 1, parentPosition + 4);
    const childRow = followingRows.find((row) => {
      const type = (row.getAttribute("data-position-type") || "").toLowerCase();
      const label = (row.getAttribute("data-position-label") || "").toLowerCase();
      return type === "manuell" || label.includes("manuell");
    });
    const childTitle = childRow?.querySelector('[contenteditable="true"][data-field="title"]');
    const childIndex = childRow?.getAttribute("data-row") || null;
    return childRow && childTitle
      ? { ok: true, message: "", childIndex }
      : {
          ok: false,
          message: `Keine sichtbare manuelle Kindposition direkt unter dem freien Jumbo gefunden (parent=${parentIndex})`,
          childIndex: null,
        };
  }, jumboState.rowIndex);

  if (!childState.ok || !childState.childIndex) {
    throw new Error(`document editor free jumbo child: ${childState.message}`);
  }

  await page.click(`[data-testid="button-price-${childState.childIndex}"]`);
  await page.waitForSelector('[data-testid="kalk-submit"]', { timeout: 10_000 });
  await page.click('[data-testid="kalk-mode-pauschal"]');
  await page.waitForSelector('[data-testid="kalk-pauschal-price"]', { timeout: 10_000 });
  await page.focus('[data-testid="kalk-pauschal-price"]');
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.type("123,45");
  await page.waitForFunction(
    () => {
      const input = document.querySelector('[data-testid="kalk-pauschal-price"]');
      return input instanceof HTMLInputElement && (input.value.includes("123,45") || input.value.includes("123.45"));
    },
    { timeout: 10_000 },
  );
  await page.click('[data-testid="kalk-submit"]');

  let priceState = { ok: false, message: "Preispruefung wurde nicht ausgefuehrt" };
  for (let attempt = 0; attempt < 20; attempt += 1) {
    priceState = await page.evaluate((parentIndex) => {
      const parentPrice = document.querySelector(`[data-testid="button-price-${parentIndex}"]`)?.textContent || "";
      const parentRow = document.querySelector(`[data-row="${parentIndex}"]`);
      const rowText = parentRow?.textContent || "";
      const visibleRows = Array.from(document.querySelectorAll("[data-row]")).map((row) => ({
        index: row.getAttribute("data-row"),
        type: row.getAttribute("data-position-type"),
        label: row.getAttribute("data-position-label"),
        text: (row.textContent || "").replace(/\s+/g, " ").trim(),
      }));
      return parentPrice.includes("123,45") && rowText.includes("123,45")
        ? { ok: true, message: "" }
        : {
            ok: false,
            message: `Jumbo-Preis wurde nicht aus Kindposition aktualisiert (ep=${parentPrice}, row=${rowText}, rows=${JSON.stringify(visibleRows)})`,
          };
    }, jumboState.rowIndex);
    if (priceState.ok) break;
    await sleep(500);
  }

  if (!priceState.ok) {
    throw new Error(`document editor free jumbo pricing: ${priceState.message}`);
  }

  await assertNoRuntimeOverlay(page, "free jumbo workflow");
  console.log("ok document editor free jumbo prices follow child position");
}

async function assertManualToolbarWorkflow(page) {
  const firstRow = await page.$('[data-row="0"]');
  if (!firstRow) {
    throw new Error("document editor manual toolbar: keine erste Dokumentzeile gefunden");
  }

  const rowsBefore = await page.$$eval("[data-row]", (rows) => rows.length);
  const manualRowsBefore = await page.$$eval("[data-row]", (rows) =>
    rows.filter((row) => (row.getAttribute("data-position-type") || "").toLowerCase() === "manuell").length,
  );
  await firstRow.click();
  await page.click('[data-testid="toolbar-add-manuell"]');
  await page.waitForSelector('[data-testid="toolbar-add-manuell-material"]', { timeout: 10_000 });
  await page.click('[data-testid="toolbar-add-manuell-material"]');
  await page.waitForFunction(
    (count) => document.querySelectorAll("[data-row]").length > count,
    { timeout: 10_000 },
    rowsBefore,
  );

  const manualState = await page.evaluate((manualCountBefore) => {
    const rows = Array.from(document.querySelectorAll("[data-row]"));
    const manualRows = rows.filter((row) => (row.getAttribute("data-position-type") || "").toLowerCase() === "manuell");
    const manualRow = manualRows.find((row) => {
      const type = (row.getAttribute("data-position-type") || "").toLowerCase();
      const text = row.textContent || "";
      return type === "manuell" && text.includes("Material");
    });
    return manualRows.length > manualCountBefore && manualRow
      ? { ok: true, message: "" }
      : {
          ok: false,
          message: `Keine manuelle Materialposition ueber Toolbar angelegt (manualRows=${manualRows.map((row) => row.textContent?.replace(/\s+/g, " ").trim()).join(" | ")})`,
        };
  }, manualRowsBefore);

  if (!manualState.ok) {
    throw new Error(`document editor manual toolbar: ${manualState.message}`);
  }

  await assertNoRuntimeOverlay(page, "manual toolbar workflow");
  console.log("ok document editor manual toolbar inserts typed manual positions");
}

const executablePath = findBrowserExecutable();
const pageErrors = [];

const browser = await puppeteer.launch({
  executablePath,
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--no-first-run",
  ],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 950, deviceScaleFactor: 1 });
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await gotoAndCheck(page, "/", "app shell");

  const passwordInput = await page.$('input[type="password"]');
  if (passwordInput) {
    const inputs = await page.$$("input");
    let usernameInput = null;
    for (const input of inputs) {
      const type = await input.evaluate((el) => el.getAttribute("type") || "text");
      if (type !== "password" && type !== "hidden") {
        usernameInput = input;
        break;
      }
    }
    if (!usernameInput) {
      throw new Error("Login erkannt, aber kein Benutzername-Eingabefeld gefunden");
    }
    await usernameInput.type(username);
    await passwordInput.type(password);
    const submitButton = await page.$('button[type="submit"]');
    if (submitButton) {
      await Promise.all([
        submitButton.click(),
        page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30_000 }).catch(() => null),
      ]);
    } else {
      await page.keyboard.press("Enter");
      await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30_000 }).catch(() => null);
    }
    await assertNoRuntimeOverlay(page, "login");
    console.log(`ok login ${username}`);
  }

  await gotoAndCheck(page, "/dokumente", "dokumente page");
  await assertNewDocumentTypeWorkflow(page);
  await assertNewDocumentSaveRoundtrip(page, "angebot", "Angebot");
  await assertNewDocumentSaveRoundtrip(page, "freies_dokument", "Freies Dokument");
  await assertNewDocumentSaveRoundtrip(page, "rechnung", "Rechnung");
  await assertNewDocumentSaveRoundtrip(page, "lieferschein", "Lieferschein");
  await assertDocumentConversionProjectTree(page);
  await assertExistingDocumentPdf(page);
  await assertImportedHapakDocumentVisualGuards(page);
  await assertImportedHapakInvoiceVisualGuards(page);
  await gotoAndCheck(page, "/projekte", "projekte page");
  await withTemporaryEditorDocument(page, async () => {
    await assertDisplayModeMenu(page);
    await assertEditorTextCellEditable(page);
    await assertQuantityInputAcceptsGermanDecimal(page);
    await assertFreeTextMultilineEditing(page);
    await assertFreeJumboWorkflow(page);
    await assertManualToolbarWorkflow(page);
  });

  const screenshotDir = process.env.SMOKE_SCREENSHOT_DIR || path.join(os.tmpdir(), "fristd-bau-smoke");
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({
    path: path.join(screenshotDir, "smoke-browser-document-editor.png"),
    fullPage: false,
  });

  if (pageErrors.length) {
    const uniqueErrors = [...new Set(pageErrors)]
      .filter((text) => !text.includes("favicon"))
      .slice(0, 10);
    if (uniqueErrors.length) {
      throw new Error(`Browser-Konsolenfehler:\n${uniqueErrors.join("\n")}`);
    }
  }

  console.log("Browser-Smoke-Test erfolgreich");
} finally {
  await browser.close();
}
