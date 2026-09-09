export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function requirePublicHttpsUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("brand.public_https_url_required");
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    throw new Error("brand.public_https_url_required");
  }
  return url;
}

export function findRemoteAssetReferences(htmlOrCss: string): readonly string[] {
  const matches: string[] = [];
  for (const match of htmlOrCss.matchAll(/\bsrc\s*=\s*["'](https?:\/\/[^"']+)["']/gi)) {
    const value = match[1];
    if (value !== undefined) matches.push(value);
  }
  for (const match of htmlOrCss.matchAll(
    /<link\b[^>]*\bhref\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>/gi,
  )) {
    const value = match[1];
    if (value !== undefined) matches.push(value);
  }
  for (const match of htmlOrCss.matchAll(/url\s*\(\s*["']?(https?:\/\/[^)'"\s]+)["']?\s*\)/gi)) {
    const value = match[1];
    if (value !== undefined) matches.push(value);
  }
  return [...new Set(matches)];
}

export function findExecutableMarkup(html: string): readonly string[] {
  const checks = [
    ["script", /<script\b/i],
    ["iframe", /<iframe\b/i],
    ["form", /<form\b/i],
    ["foreignObject", /<foreignObject\b/i],
    ["event-handler", /\son[a-z]+\s*=/i],
  ] as const;
  return checks.filter(([, pattern]) => pattern.test(html)).map(([label]) => label);
}
