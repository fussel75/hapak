export type HapakFibuAttachmentCandidate = {
  reId: number;
  idx?: number | null;
  rnr?: string | null;
  adrNr?: string | null;
  adrSuch?: string | null;
  belegdat?: string | null;
  betrag?: number | string | null;
  ktr?: string | null;
};

export type HapakAttachmentFileCandidate = {
  relativePath: string;
  filename?: string | null;
  rnr?: string | null;
  adrNr?: string | null;
  adrSuch?: string | null;
  belegdat?: string | null;
  betrag?: number | string | null;
  sha256?: string | null;
  size?: number | null;
};

export type HapakAttachmentMatch = {
  confidence: "exact" | "strong" | "weak";
  score: number;
  fibuReId: number;
  fibuIdx: number;
  importSource: "hapak";
  importSourceKey: string;
  originalFilename: string;
  filePath: string;
  sha256?: string | null;
  fileSize?: number | null;
  projectKey?: string | null;
  evidence: string[];
};

function normalizeText(value: unknown): string {
  return value == null ? "" : String(value).trim().toUpperCase();
}

function normalizeDate(value: unknown): string {
  const raw = normalizeText(value);
  if (!raw || raw === "0000-00-00") return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return raw;
}

function normalizeMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  const parsed = Number(String(value).trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function basename(relativePath: string): string {
  return relativePath.replace(/\\/g, "/").split("/").filter(Boolean).pop() || relativePath;
}

function fileContainsToken(file: HapakAttachmentFileCandidate, token: string): boolean {
  if (!token) return false;
  const haystack = normalizeText(`${file.relativePath} ${file.filename || ""}`);
  return haystack.includes(token);
}

export function planHapakAttachmentMatch(
  fibuRow: HapakFibuAttachmentCandidate,
  file: HapakAttachmentFileCandidate,
): HapakAttachmentMatch | null {
  const evidence: string[] = [];
  let score = 0;

  const rnr = normalizeText(fibuRow.rnr);
  const fileRnr = normalizeText(file.rnr);
  if (rnr && (fileRnr === rnr || fileContainsToken(file, rnr))) {
    score += 50;
    evidence.push("rnr");
  }

  const adrNr = normalizeText(fibuRow.adrNr);
  const fileAdrNr = normalizeText(file.adrNr);
  if (adrNr && (fileAdrNr === adrNr || fileContainsToken(file, adrNr))) {
    score += 20;
    evidence.push("adrNr");
  }

  const adrSuch = normalizeText(fibuRow.adrSuch);
  const fileAdrSuch = normalizeText(file.adrSuch);
  if (adrSuch && (fileAdrSuch === adrSuch || fileContainsToken(file, adrSuch))) {
    score += 15;
    evidence.push("adrSuch");
  }

  const belegdat = normalizeDate(fibuRow.belegdat);
  const fileDate = normalizeDate(file.belegdat);
  if (belegdat && fileDate === belegdat) {
    score += 15;
    evidence.push("belegdat");
  }

  const betrag = normalizeMoney(fibuRow.betrag);
  const fileBetrag = normalizeMoney(file.betrag);
  if (betrag != null && fileBetrag != null && Math.abs(betrag - fileBetrag) < 0.01) {
    score += 20;
    evidence.push("betrag");
  }

  if (score < 50) return null;

  const confidence: HapakAttachmentMatch["confidence"] =
    score >= 100 ? "exact" : score >= 70 ? "strong" : "weak";
  const originalFilename = file.filename || basename(file.relativePath);

  return {
    confidence,
    score,
    fibuReId: fibuRow.reId,
    fibuIdx: fibuRow.idx ?? 0,
    importSource: "hapak",
    importSourceKey: `hapak:fibu:${fibuRow.reId}:${fibuRow.idx ?? 0}:${file.relativePath}`,
    originalFilename,
    filePath: file.relativePath,
    sha256: file.sha256 || null,
    fileSize: file.size ?? null,
    projectKey: fibuRow.ktr || null,
    evidence,
  };
}
