import { describe, expect, test } from "bun:test";

import { escapeHtml, renderComparisons, renderHome } from "./build";
import { COMPARISONS, VERIFIED_ON } from "./comparisons";

const status = {
  rows: [
    {
      repository: "libre-ai/notebook",
      project: "notebook",
      layer: "couche-1",
      summary: "Espace de connaissances local.",
      display: "20 % du périmètre actuellement déclaré",
      maturity: "usable",
      last_verified_on: "2026-07-30",
    },
  ],
};

describe("renderHome", () => {
  test("renders the computed display and ships no script tag", () => {
    const html = renderHome(status, "fleet-status.v1.json (governance)");
    expect(html).toContain("20 % du périmètre actuellement déclaré");
    expect(html).toContain('lang="fr"');
    expect(html).not.toContain("<script");
  });
});

describe("renderComparisons", () => {
  test("carries the eight sourced rows and the verification date", () => {
    const html = renderComparisons();
    expect(COMPARISONS.length).toBe(8);
    expect(html).toContain(VERIFIED_ON);
    for (const c of COMPARISONS) expect(html).toContain(c.url);
    expect(html).not.toContain("<script");
  });
});

describe("escapeHtml", () => {
  test("escapes markup-significant characters", () => {
    expect(escapeHtml('<a href="x">&')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;");
  });
});
