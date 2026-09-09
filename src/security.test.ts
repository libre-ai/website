import { describe, expect, test } from "bun:test";

import {
  escapeHtml,
  findExecutableMarkup,
  findRemoteAssetReferences,
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
  });

  test("reports executable and embedding surfaces", () => {
    for (const markup of [
      "<script></script>",
      "<iframe></iframe>",
      "<form></form>",
      "<foreignObject></foreignObject>",
      '<div onclick="run()"></div>',
    ]) {
      expect(findExecutableMarkup(markup)).not.toEqual([]);
    }
  });

  test("escapes every markup-significant character", () => {
    expect(escapeHtml(`<a href='x'>&`)).toBe("&lt;a href=&#39;x&#39;&gt;&amp;");
  });
});
