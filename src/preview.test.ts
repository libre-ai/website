import { describe, expect, test } from "bun:test";

import { parsePreviewArguments } from "./preview";

describe("local brand preview arguments", () => {
  test("requires explicit upstream roots and fixes the output boundary", () => {
    expect(
      parsePreviewArguments([
        "--governance-root",
        "/workspace/governance",
        "--ui-root",
        "/workspace/ui",
      ]),
    ).toEqual({
      governanceRoot: "/workspace/governance",
      uiRoot: "/workspace/ui",
      outputRoot: ".preview",
    });
    expect(() => parsePreviewArguments([])).toThrow("brand.preview_argument_missing");
  });
});
