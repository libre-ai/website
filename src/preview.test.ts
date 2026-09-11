import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parsePreviewArguments, writeBrandPreview } from "./preview";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => rm(directory, { recursive: true })),
  );
});

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

  test("writes the complete guarded preview into the fixed local boundary", async () => {
    const root = await mkdtemp(join(tmpdir(), "libre-ai-preview-"));
    temporaryDirectories.push(root);
    const repositoryRoot = process.cwd();
    const args = parsePreviewArguments([
      "--governance-root",
      join(repositoryRoot, "node_modules/@libre-ai/governance"),
      "--ui-root",
      join(repositoryRoot, "node_modules/@libre-ai/ui"),
    ]);

    await mkdir(join(root, ".preview/assets"), { recursive: true });
    await Bun.write(join(root, ".preview/assets/libre-ai-mark.svg"), "stale");
    expect(await writeBrandPreview(args, root)).toBe(5);
    expect(await Bun.file(join(root, ".preview/index.html")).text()).toContain("Libre AI");
    expect(await Bun.file(join(root, ".preview/marque.html")).text()).toContain(
      "Possédez la fabrique.",
    );
    expect(await Bun.file(join(root, ".preview/assets/libre-ai-mark.svg")).exists()).toBe(false);
  });
});
