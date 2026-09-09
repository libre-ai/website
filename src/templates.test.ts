import { describe, expect, test } from "bun:test";
import { type FleetRow, parseBrandProjection } from "./domain";
import { renderBrandGuide, renderComparisons, renderHome } from "./templates";
import { validProjection } from "./test-fixtures";

const fleetRows: FleetRow[] = [
  {
    repository: "libre-ai/notebook",
    project: "Libre AI Notebook",
    layer: "couche-1",
    summary: "Espace de connaissances local.",
    display: "20 % du périmètre actuellement déclaré",
    maturity: "usable",
    last_verified_on: "2026-09-09",
  },
];

describe("static brand templates", () => {
  test("renders the editorial sequence and complete evidence", () => {
    const html = renderHome({
      brand: parseBrandProjection(validProjection),
      fleetRows,
      figurativeAssetsApproved: false,
    });

    expect(html.indexOf("Les plateformes propriétaires vous louent le produit.")).toBeLessThan(
      html.indexOf("Possédez la fabrique."),
    );
    expect(html.indexOf("Possédez la fabrique.")).toBeLessThan(html.indexOf("Voir les preuves."));
    for (const id of ["preuves", "produits", "methode", "etat-complet"]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain("Un dépôt public ne prouve pas la disponibilité.");
    const fleetTable = html.match(/<tbody id="fleet-rows">([\s\S]*?)<\/tbody>/)?.[1] ?? "";
    expect(fleetTable.match(/Libre AI Notebook/g) ?? []).toHaveLength(1);
    expect(html).not.toContain("<script");
  });

  test("escapes projection strings instead of interpreting them as markup", () => {
    const hostile = structuredClone(validProjection);
    const [hostileProof] = hostile.proofs;
    if (hostileProof === undefined) throw new Error("test.fixture_proof_missing");
    hostileProof.mechanism = '<img src="https://tracker.invalid/a.png">';
    const html = renderHome({
      brand: parseBrandProjection(hostile),
      fleetRows,
      figurativeAssetsApproved: false,
    });

    expect(html).toContain("&lt;img");
    expect(html).not.toContain('<img src="https://tracker.invalid');
  });

  test("withholds figurative downloads until the asset controls are approved", () => {
    const brand = parseBrandProjection(validProjection);
    const pending = renderBrandGuide({ brand, figurativeAssetsApproved: false });
    const accepted = renderBrandGuide({ brand, figurativeAssetsApproved: true });

    expect(pending).toContain("Les actifs figuratifs ne sont pas encore publiés.");
    expect(pending).not.toContain("libre-ai-mark.svg");
    expect(accepted).toContain("./assets/libre-ai-mark.svg");
  });

  test("keeps comparisons sourced and static", () => {
    const html = renderComparisons({ verifiedOn: "2026-09-09" });
    expect(html).toContain("Comparaisons datées");
    expect(html).toContain("2026-09-09");
    expect(html).not.toContain("<script");
  });
});
