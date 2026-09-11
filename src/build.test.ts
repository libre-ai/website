import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  buildProductionSite,
  buildStaticBrandSite,
  loadProductionSiteInput,
  writeStaticSite,
} from "./build";
import { validProjection } from "./test-fixtures";

const status = {
  rows: [
    {
      repository: "libre-ai/notebook",
      project: "notebook",
      kind: "product",
      layer: "couche-1",
      summary: "Espace de connaissances local.",
      display: "20 % du périmètre actuellement déclaré",
      maturity: "usable",
      last_verified_on: "2026-07-30",
    },
  ],
};

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "libre-ai-website-"));
  temporaryRoots.push(root);
  return root;
}

async function writeFixture(root: string, relativePath: string, value: string): Promise<void> {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, "utf8");
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function listRelativeFiles(root: string, relativeDirectory = ""): Promise<string[]> {
  const entries = await readdir(join(root, relativeDirectory), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = join(relativeDirectory, entry.name);
    if (entry.isDirectory()) files.push(...(await listRelativeFiles(root, relativePath)));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
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
    expect(files.get("index.html")).toContain("Content-Security-Policy");
    expect(
      buildStaticBrandSite({
        brandProjection: validProjection,
        fleetStatus: status,
        uiStyles: '@import "./tokens.css"; body { color: var(--lai-color-ink); }',
        uiTokens: ":root { --lai-color-ink: CanvasText; }",
        figurativeAssetsApproved: false,
        brandMark: null,
      }),
    ).toEqual(files);
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

    expect(() =>
      buildStaticBrandSite({
        ...base,
        uiStyles: '.x { background: url("//tracker.invalid/x.png"); }',
      }),
    ).toThrow("brand.output_remote_asset");
  });

  test("publishes an approved passive mark and rejects missing or executable marks", () => {
    const base = {
      brandProjection: validProjection,
      fleetStatus: status,
      uiStyles: "body { color: var(--lai-color-ink); }",
      uiTokens: ":root { --lai-color-ink: CanvasText; }",
      figurativeAssetsApproved: true,
    } as const;

    expect(() => buildStaticBrandSite({ ...base, brandMark: null })).toThrow(
      "brand.approved_mark_missing",
    );
    expect(
      buildStaticBrandSite({
        ...base,
        brandMark: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>',
      }).has("assets/libre-ai-mark.svg"),
    ).toBe(true);
    expect(() =>
      buildStaticBrandSite({
        ...base,
        brandMark: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      }),
    ).toThrow("brand.output_executable_markup:assets/libre-ai-mark.svg");
  });
});

describe("production input", () => {
  test("loads reviewed Governance and UI projections while withholding the mark", async () => {
    const root = await temporaryRoot();
    await writeFixture(
      root,
      "node_modules/@libre-ai/governance/brand/projections/public-brand.v1.json",
      JSON.stringify(validProjection),
    );
    await writeFixture(
      root,
      "node_modules/@libre-ai/governance/ecosystem/projections/fleet-status.v1.json",
      JSON.stringify(status),
    );
    await writeFixture(root, "node_modules/@libre-ai/ui/src/styles.css", "ui-styles");
    await writeFixture(root, "node_modules/@libre-ai/ui/src/tokens.css", "ui-tokens");

    await expect(loadProductionSiteInput(root)).resolves.toEqual({
      brandProjection: validProjection,
      fleetStatus: status,
      uiStyles: "ui-styles",
      uiTokens: "ui-tokens",
      figurativeAssetsApproved: false,
      brandMark: null,
    });
  });

  test("keeps the versioned Clever deployment artifact equal to generated production output", async () => {
    const root = process.cwd();
    const expected = await buildProductionSite(root);
    const artifactRoot = join(root, "site");
    const actualPaths = (await listRelativeFiles(artifactRoot)).sort();

    expect(actualPaths).toEqual([...expected.keys()].sort());
    for (const [path, contents] of expected) {
      expect(await readFile(join(artifactRoot, path), "utf8")).toBe(contents);
    }
  });
});

describe("static artifact replacement", () => {
  test("refuses an empty artifact", async () => {
    const root = await temporaryRoot();
    await expect(writeStaticSite(join(root, "dist"), new Map())).rejects.toThrow(
      "brand.output_root_invalid",
    );
  });

  test("recovers an interrupted previous artifact before replacement", async () => {
    const root = await temporaryRoot();
    const outputRoot = join(root, "dist");
    await writeFixture(root, ".dist.previous/index.html", "previous");

    await writeStaticSite(outputRoot, new Map([["index.html", "new"]]));

    expect(await Bun.file(join(outputRoot, "index.html")).text()).toBe("new");
    expect(await exists(join(root, ".dist.previous"))).toBe(false);
  });

  test("replaces the complete output and removes a stale figurative asset", async () => {
    const root = await temporaryRoot();
    const outputRoot = join(root, "dist");
    await writeFixture(root, "dist/index.html", "old");
    await writeFixture(root, "dist/assets/libre-ai-mark.svg", "stale-mark");

    await writeStaticSite(
      outputRoot,
      new Map([
        ["index.html", "new"],
        ["assets/styles.css", "styles"],
      ]),
    );

    expect(await Bun.file(join(outputRoot, "index.html")).text()).toBe("new");
    expect(await exists(join(outputRoot, "assets/libre-ai-mark.svg"))).toBe(false);
  });

  test("refuses traversal without mutating the previous artifact", async () => {
    const root = await temporaryRoot();
    const outputRoot = join(root, "dist");
    await writeFixture(root, "dist/index.html", "old");

    await expect(
      writeStaticSite(outputRoot, new Map([["../escape.html", "hostile"]])),
    ).rejects.toThrow("brand.output_path_invalid");
    expect(await Bun.file(join(outputRoot, "index.html")).text()).toBe("old");
    expect(await exists(join(root, "escape.html"))).toBe(false);
  });

  test("keeps the previous artifact when staging fails", async () => {
    const root = await temporaryRoot();
    const outputRoot = join(root, "dist");
    await writeFixture(root, "dist/index.html", "old");

    await expect(
      writeStaticSite(
        outputRoot,
        new Map([
          ["conflict", "file"],
          ["conflict/nested.html", "cannot-be-written"],
        ]),
      ),
    ).rejects.toThrow();
    expect(await Bun.file(join(outputRoot, "index.html")).text()).toBe("old");
  });
});
