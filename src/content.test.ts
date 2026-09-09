import { describe, expect, test } from "bun:test";

import { parseWebsiteContent } from "./content";
import { validProjection } from "./test-fixtures";

describe("website content boundary", () => {
  test("validates brand and fleet documents together", () => {
    const content = parseWebsiteContent(validProjection, {
      rows: [
        {
          repository: "libre-ai/notebook",
          project: "Libre AI Notebook",
          layer: "couche-1",
          summary: "Espace de connaissances local.",
          display: "20 % du périmètre actuellement déclaré",
          maturity: "usable",
          last_verified_on: "2026-09-09",
        },
      ],
    });

    expect(content.brand.copy.fr.promise).toBe("Possédez la fabrique.");
    expect(content.fleetRows).toHaveLength(1);
  });

  test("rejects malformed fleet rows before rendering", () => {
    expect(() => parseWebsiteContent(validProjection, { rows: [{ layer: "couche-1" }] })).toThrow(
      "brand.fleet_row_invalid:0:repository",
    );
  });
});
