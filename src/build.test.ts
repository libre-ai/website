import { describe, expect, test } from "bun:test";

import { buildStaticBrandSite, escapeHtml, renderComparisons, renderHome } from "./build";
import { COMPARISONS, VERIFIED_ON } from "./comparisons";
import { validProjection } from "./test-fixtures";

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

describe("buildStaticBrandSite", () => {
  test("produces guarded static pages and withholds pending figurative assets", () => {
    const files = buildStaticBrandSite({
      brandProjection: validProjection,
      fleetStatus: status,
      uiStyles: '@import "./tokens.css"; body { color: var(--lai-color-ink); }',
      uiTokens: ":root { --lai-color-ink: CanvasText; }",
      figurativeAssetsApproved: false,
      brandMark: null,
    });

    expect(files.get("index.html")).toContain("Possédez la fabrique.");
    expect(files.get("comparaisons.html")).toContain("Comparaisons datées");
    expect(files.get("marque.html")).toContain("Les actifs figuratifs ne sont pas encore publiés.");
    expect(files.get("assets/styles.css")).toContain("var(--lai-color-accent)");
    expect(files.has("assets/libre-ai-mark.svg")).toBe(false);
  });

  test("rejects remote or executable upstream assets", () => {
    const base = {
      brandProjection: validProjection,
      fleetStatus: status,
      uiTokens: ":root { --lai-color-ink: CanvasText; }",
      figurativeAssetsApproved: false,
      brandMark: null,
    } as const;

    expect(() =>
      buildStaticBrandSite({
        ...base,
        uiStyles: '.x { background: url("https://tracker.invalid/x.png"); }',
      }),
    ).toThrow("brand.output_remote_asset");
  });
});
