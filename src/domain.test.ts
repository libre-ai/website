import { describe, expect, test } from "bun:test";

import { type FleetRow, groupFleetRows, parseBrandProjection, toEvidence } from "./domain";
import { validProjection } from "./test-fixtures";

describe("parseBrandProjection", () => {
  test("accepts the canonical projection and produces URL evidence", () => {
    const projection = parseBrandProjection(validProjection);
    const [proof] = projection.proofs;
    if (proof === undefined) throw new Error("test.fixture_proof_missing");
    const evidence = toEvidence(proof);

    expect(projection.copy.fr.promise).toBe("Possédez la fabrique.");
    expect(evidence.source).toBeInstanceOf(URL);
    expect(evidence.source.protocol).toBe("https:");
  });

  test("fails closed on schema, copy, date, source, limitation and duplicates", () => {
    const mutations: unknown[] = [
      { ...validProjection, schema_version: "unknown" },
      { ...validProjection, copy: { ...validProjection.copy, fr: {} } },
      {
        ...validProjection,
        copy: {
          ...validProjection.copy,
          fr: { ...validProjection.copy.fr, promise: "Une promesse modifiée." },
        },
      },
      { ...validProjection, proofs: [{ ...validProjection.proofs[0], verifiedOn: "09/09/2026" }] },
      {
        ...validProjection,
        proofs: [{ ...validProjection.proofs[0], source: "http://example.com" }],
      },
      { ...validProjection, proofs: [{ ...validProjection.proofs[0], limitation: "" }] },
      {
        ...validProjection,
        proofs: [validProjection.proofs[0], validProjection.proofs[0], validProjection.proofs[2]],
      },
    ];

    for (const mutation of mutations) expect(() => parseBrandProjection(mutation)).toThrow();
  });
});

describe("groupFleetRows", () => {
  test("uses canonical group order and preserves row order inside groups", () => {
    const rows: FleetRow[] = [
      fleetRow("libre-ai/two", "Two", "couche-2"),
      fleetRow("libre-ai/one-b", "One B", "couche-1"),
      fleetRow("libre-ai/one-a", "One A", "couche-1"),
    ];
    const groups = groupFleetRows(rows);

    expect([...groups.keys()]).toEqual(["couche-1", "couche-2"]);
    expect(groups.get("couche-1")?.map((row) => row.project)).toEqual(["One B", "One A"]);
  });

  test("rejects an unknown layer", () => {
    expect(() => groupFleetRows([fleetRow("libre-ai/x", "X", "unknown")])).toThrow(
      "brand.fleet_layer_unknown:unknown",
    );
  });
});

function fleetRow(repository: string, project: string, layer: string): FleetRow {
  return {
    repository,
    project,
    publicName: project,
    kind: "satellite",
    layer,
    summary: `${project} summary`,
    display: "20 % du périmètre actuellement déclaré",
    maturity: "usable",
    last_verified_on: "2026-09-09",
  };
}
