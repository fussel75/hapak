export function textToSafeHtml(text: string | null | undefined): string {
  if (!text) return "";

  return String(text)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/?(b|strong|i|em|u|s|span|font|p|div|ul|ol|li|table|thead|tbody|tr|td|th)[^>]*>/gi, "")
    .replace(/&nbsp;/g, "\x00NBSP\x00")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\x00NBSP\x00/g, "&nbsp;")
    .replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;")
    .replace(/  /g, " &nbsp;")
    .replace(/\n/g, "<br>");
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function readAttr(tag: string, name: string): string {
  const quoted = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(tag);
  if (quoted) return quoted[1];
  const bare = new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, "i").exec(tag);
  return bare?.[1] || "";
}

function isSafeImageSrc(src: string): boolean {
  if (/^\/api\/uploads\/[A-Za-z0-9_.-]+$/.test(src)) return true;
  return /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(src);
}

export function sanitizeImageTag(tag: string): string {
  const src = readAttr(tag, "src").trim();
  if (!src || !isSafeImageSrc(src)) return "";

  const rawWidth = readAttr(tag, "data-img-width").trim();
  const parsedWidth = Number.parseInt(rawWidth, 10);
  const width = Number.isFinite(parsedWidth)
    ? Math.min(100, Math.max(10, parsedWidth))
    : 100;

  return `<img src="${escapeAttr(src)}" data-img-width="${width}">`;
}

export function sanitizeRichHtmlWithImages(html: string | null | undefined): string {
  if (!html) return "";

  const imgs: string[] = [];
  const withImageTokens = String(html).replace(/<img\s[^>]*>/gi, (match) => {
    const img = sanitizeImageTag(match);
    if (!img) return "";
    imgs.push(img);
    return `\x00IMG${imgs.length - 1}\x00`;
  });

  const safeText = textToSafeHtml(withImageTokens);
  return safeText.replace(/\x00IMG(\d+)\x00/g, (_match, idx) => imgs[Number.parseInt(idx, 10)] || "");
}
