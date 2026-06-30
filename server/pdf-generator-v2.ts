import puppeteer from "puppeteer-core";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Document, Customer, DocumentItem, CompanySettings, FormTemplate, Project } from "@shared/schema";

const printTokens = new Map<string, { data: any; expires: number }>();
const printAssetTokens = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of printTokens) {
    if (val.expires < now) printTokens.delete(key);
  }
  for (const [key, expires] of printAssetTokens) {
    if (expires < now) printAssetTokens.delete(key);
  }
}, 30_000);

export function createPrintToken(bundle: {
  document: Document;
  items: DocumentItem[];
  customer: Customer | null;
  company: CompanySettings | null;
  template: FormTemplate | null;
  project: Project | null;
  abschlagChain: any[];
  editorSettings?: any;
  displayMode?: string;
  mode?: "invoice" | "arbeitszeitliste";
}): string {
  const token = crypto.randomUUID();
  printTokens.set(token, {
    data: bundle,
    expires: Date.now() + 120_000,
  });
  return token;
}

export function consumePrintToken(token: string): any | null {
  const entry = printTokens.get(token);
  if (!entry || entry.expires < Date.now()) {
    printTokens.delete(token);
    return null;
  }
  printTokens.delete(token);
  return entry.data;
}

function createPrintAssetToken(): string {
  const token = crypto.randomUUID();
  printAssetTokens.set(token, Date.now() + 120_000);
  return token;
}

export function isPrintAssetTokenValid(token: unknown): boolean {
  if (typeof token !== "string" || !token) return false;
  const expires = printAssetTokens.get(token);
  if (!expires || expires < Date.now()) {
    printAssetTokens.delete(token);
    return false;
  }
  return true;
}

const browserCandidates = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.BROWSER_EXECUTABLE_PATH,
  process.env.CHROMIUM_PATH,
  "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean) as string[];

function findBrowserExecutable(): string {
  const executable = browserCandidates.find((candidate) => fs.existsSync(candidate));
  if (executable) return executable;
  throw new Error(
    `Kein Chromium/Edge/Chrome fuer PDF-Export gefunden. Setze PUPPETEER_EXECUTABLE_PATH oder BROWSER_EXECUTABLE_PATH. Geprueft: ${browserCandidates.join(", ")}`,
  );
}

function ensureFontsInstalled() {
  const home = process.env.HOME || "/home/runner";
  const fontsDir = path.join(home, ".fonts");
  const fontconfigDir = path.join(home, ".config", "fontconfig");
  const fontsConf = path.join(fontconfigDir, "fonts.conf");
  const srcFontsDir = path.resolve(process.cwd(), "public", "fonts");

  if (!fs.existsSync(srcFontsDir)) return;

  if (!fs.existsSync(fontsDir)) {
    fs.mkdirSync(fontsDir, { recursive: true });
  }
  for (const f of fs.readdirSync(srcFontsDir)) {
    if (f.endsWith(".ttf") || f.endsWith(".otf")) {
      const dest = path.join(fontsDir, f);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(srcFontsDir, f), dest);
      }
    }
  }

  if (!fs.existsSync(fontsConf)) {
    fs.mkdirSync(fontconfigDir, { recursive: true });
    fs.writeFileSync(fontsConf, `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${fontsDir}</dir>
  <match target="pattern">
    <test name="family" qual="any"><string>Swis721 Lt BT</string></test>
    <edit name="family" mode="prepend" binding="strong"><string>Nimbus Sans</string></edit>
  </match>
  <match target="pattern">
    <test name="family" qual="any"><string>Swis721 BT</string></test>
    <edit name="family" mode="prepend" binding="strong"><string>Nimbus Sans</string></edit>
  </match>
  <match target="pattern">
    <test name="family" qual="any"><string>Arial</string></test>
    <edit name="family" mode="prepend" binding="strong"><string>Nimbus Sans</string></edit>
  </match>
  <match target="pattern">
    <test name="family" qual="any"><string>Helvetica</string></test>
    <edit name="family" mode="prepend" binding="strong"><string>Nimbus Sans</string></edit>
  </match>
  <match target="pattern">
    <test name="family" qual="any"><string>Helvetica Neue</string></test>
    <edit name="family" mode="prepend" binding="strong"><string>Nimbus Sans</string></edit>
  </match>
  <match target="pattern">
    <test name="family" qual="any"><string>sans-serif</string></test>
    <edit name="family" mode="prepend" binding="strong"><string>Nimbus Sans</string></edit>
  </match>
</fontconfig>`);
  }

  process.env.FONTCONFIG_FILE = fontsConf;
}

ensureFontsInstalled();

let browserInstance: any = null;
let browserLaunchPromise: Promise<any> | null = null;

async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }
  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }
  browserLaunchPromise = puppeteer.launch({
    executablePath: findBrowserExecutable(),
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--disable-extensions",
      "--font-render-hinting=none",
    ],
  }).then((browser) => {
    browserInstance = browser;
    browserLaunchPromise = null;
    return browser;
  }).catch((err) => {
    browserLaunchPromise = null;
    throw err;
  });
  return browserLaunchPromise;
}

export async function generatePdfFromHtml(
  bundle: {
    document: Document;
    items: DocumentItem[];
    customer: Customer | null;
    company: CompanySettings | null;
    template: FormTemplate | null;
  project: Project | null;
  abschlagChain: any[];
  editorSettings?: any;
  displayMode?: string;
  mode?: "invoice" | "arbeitszeitliste";
  },
  port: number = 5000,
): Promise<Buffer> {
  const token = createPrintToken(bundle);
  const assetToken = createPrintAssetToken();
  const url = `http://localhost:${port}/print?token=${token}`;

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 794, height: 1123 });

    await page.setRequestInterception(true);
    page.on("request", (req: any) => {
      const reqUrl: string = req.url();
      if (reqUrl.startsWith(`http://localhost:${port}`)) {
        if (reqUrl.includes("/api/uploads/") && !reqUrl.includes("printAssetToken=")) {
          const urlWithToken = new URL(reqUrl);
          urlWithToken.searchParams.set("printAssetToken", assetToken);
          req.continue({ url: urlWithToken.toString() });
        } else {
          req.continue();
        }
      } else if (reqUrl.startsWith("data:") || reqUrl.startsWith("blob:")) {
        req.continue();
      } else {
        req.abort("blockedbyclient");
      }
    });

    const consoleErrors: string[] = [];
    page.on("console", (msg: any) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err: any) => {
      consoleErrors.push(`PageError: ${err.message}`);
    });

    await page.emulateMediaType("screen");

    await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    try {
      await page.waitForFunction(
        () => (window as any).__PRINT_READY === true,
        { timeout: 15000 },
      );
    } catch (waitErr: any) {
      const errorDetail = consoleErrors.length > 0
        ? `Browser errors: ${consoleErrors.join("; ")}`
        : "No browser console errors captured";
      throw new Error(`Print page did not signal ready. ${errorDetail}`);
    }

    await new Promise((r) => setTimeout(r, 300));

    const pdfBuffer = await page.pdf({
      width: "209.9mm",
      height: "297.04mm",
      printBackground: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
      preferCSSPageSize: false,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await page.close().catch(() => {});
  }
}

export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}
