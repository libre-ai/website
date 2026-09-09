import { describe, expect, test } from "bun:test";

import { parseWebsiteContent } from "./content";
import { validProjection } from "./test-fixtures";

describe("website content boundary", () => {
  test("validates brand and fleet documents together", () => {
    const content = parseWebsiteContent(validProjection, {
      rows: [
        {
          repository: "libre-ai/notebook",
          project: "notebook",
          kind: "product",
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
    expect(content.fleetRows[0]?.publicName).toBe("Libre AI Notebook");
  });

  test("rejects malformed fleet rows before rendering", () => {
    expect(() => parseWebsiteContent(validProjection, { rows: [{ layer: "couche-1" }] })).toThrow(
      "brand.fleet_row_invalid:0:repository",
    );
  });

  test("fails closed when a product has no governed public name", () => {
    expect(() =>
      parseWebsiteContent(validProjection, {
        rows: [
          {
            repository: "libre-ai/unknown",
            project: "unknown",
            kind: "product",
            layer: "couche-1",
            summary: "Unknown.",
            display: "0 %",
            maturity: "idea",
            last_verified_on: "2026-09-09",
          },
        ],
      }),
    ).toThrow("brand.product_name_missing:libre-ai/unknown");
  });
});
