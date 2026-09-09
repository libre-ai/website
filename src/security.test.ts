import { describe, expect, test } from "bun:test";

import {
  escapeHtml,
  findExecutableMarkup,
  findRemoteAssetReferences,
  requireAllowedPublicHttpsUrl,
  requirePublicHttpsUrl,
} from "./security";

describe("public URL boundary", () => {
  test("accepts public HTTPS navigation and rejects ambiguous or active schemes", () => {
    expect(requirePublicHttpsUrl("https://github.com/libre-ai").hostname).toBe("github.com");
    for (const value of [
      "http://example.com",
      "javascript:alert(1)",
      "data:text/html,x",
      "//example.com",
      ["https://", "user", ":", "credential", "@example.com"].join(""),
    ]) {
      expect(() => requirePublicHttpsUrl(value)).toThrow("brand.public_https_url_required");
    }
  });

  test("restricts governed proof links to the declared authority hosts", () => {
    const allowed = new Set(["github.com"]);
    expect(requireAllowedPublicHttpsUrl("https://github.com/libre-ai", allowed).hostname).toBe(
      "github.com",
    );
    expect(() => requireAllowedPublicHttpsUrl("https://tracker.invalid/libre-ai", allowed)).toThrow(
      "brand.public_host_not_allowed",
    );
  });
});

describe("static output guards", () => {
  test("permits navigation but reports remote assets", () => {
    const html =
      '<a href="https://github.com/libre-ai">Source</a><img src="https://tracker.invalid/x.png"><link href="./assets/styles.css" rel="stylesheet">';
    const css = '.hero{background:url("https://tracker.invalid/x.png")}';
    const importedCss = '@import "https://tracker.invalid/theme.css";';

    expect(findRemoteAssetReferences(html)).toEqual(["https://tracker.invalid/x.png"]);
    expect(findRemoteAssetReferences(css)).toEqual(["https://tracker.invalid/x.png"]);
    expect(findRemoteAssetReferences(importedCss)).toEqual(["https://tracker.invalid/theme.css"]);
    expect(findRemoteAssetReferences('<img src="//tracker.invalid/x.png">')).toEqual([
      "//tracker.invalid/x.png",
    ]);
    expect(findRemoteAssetReferences('.hero{background:url("//tracker.invalid/x.png")}')).toEqual([
      "//tracker.invalid/x.png",
    ]);
  });

  test("reports executable and embedding surfaces", () => {
    for (const markup of [
      "<script></script>",
      "<iframe></iframe>",
      "<form></form>",
      "<foreignObject></foreignObject>",
      "<object></object>",
      "<embed>",
      '<div onclick="run()"></div>',
    ]) {
      expect(findExecutableMarkup(markup)).not.toEqual([]);
    }
  });

  test("escapes every markup-significant character", () => {
    expect(escapeHtml(`<a href='x'>&`)).toBe("&lt;a href=&#39;x&#39;&gt;&amp;");
  });
});
