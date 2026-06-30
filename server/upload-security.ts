import path from "node:path";

const IMAGE_MIME_EXTENSIONS: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
};

const UPLOAD_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export function isSafeUploadFileName(filename: string): boolean {
  if (!filename || filename !== path.basename(filename)) return false;
  if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) return false;
  return /^[A-Za-z0-9_.-]+$/.test(filename);
}

export function isAllowedSafeImageUpload(mimetype: string, originalName: string): boolean {
  const ext = path.extname(originalName).toLowerCase();
  return IMAGE_MIME_EXTENSIONS[mimetype]?.includes(ext) === true;
}

export function resolveUploadPath(uploadsDir: string, filename: string): string | null {
  if (!isSafeUploadFileName(filename)) return null;
  const root = path.resolve(uploadsDir);
  const resolved = path.resolve(root, filename);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return resolved;
}

export function getUploadMimeType(filename: string): string | null {
  const ext = path.extname(filename).toLowerCase();
  return UPLOAD_MIME_TYPES[ext] || null;
}
