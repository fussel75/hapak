export function getSafeTemplateImageUrl(imageUrl?: string | null): string {
  const url = String(imageUrl || "").trim();
  if (!url) return "";
  if (!/\.(png|jpe?g|webp|gif)(?:[?#].*)?$/i.test(url)) return "";
  return url;
}
