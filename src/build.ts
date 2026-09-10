/**
 * Static brand publisher.
 *
 * Production consumes only reviewed, SHA-pinned Governance and UI inputs. It
 * emits a complete static directory with no client JavaScript, remote asset or
 * figurative mark while the two publication controls remain pending.
 */
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, posix } from "node:path";

import { VERIFIED_ON } from "./comparisons";
import { parseWebsiteContent } from "./content";
import { findExecutableMarkup, findRemoteAssetReferences } from "./security";
import { renderSiteCss } from "./styles";
import {
  renderBrandGuide as renderBrandGuideTemplate,
  renderComparisons as renderComparisonsTemplate,
  renderHome as renderHomeTemplate,
} from "./templates";

export interface StaticBrandSiteInput {
  readonly brandProjection: unknown;
  readonly fleetStatus: unknown;
  readonly uiStyles: string;
  readonly uiTokens: string;
  readonly figurativeAssetsApproved: boolean;
  readonly brandMark: string | null;
}

const productionSources = {
  brandProjection: "node_modules/@libre-ai/governance/brand/projections/public-brand.v1.json",
  fleetStatus: "node_modules/@libre-ai/governance/ecosystem/projections/fleet-status.v1.json",
  uiStyles: "node_modules/@libre-ai/ui/src/styles.css",
  uiTokens: "node_modules/@libre-ai/ui/src/tokens.css",
} as const;

export function buildStaticBrandSite(input: StaticBrandSiteInput): ReadonlyMap<string, string> {
  const content = parseWebsiteContent(input.brandProjection, input.fleetStatus);
  if (input.figurativeAssetsApproved && input.brandMark === null) {
    throw new Error("brand.approved_mark_missing");
  }

  const files = new Map<string, string>([
    [
      "index.html",
      renderHomeTemplate({
        ...content,
        figurativeAssetsApproved: input.figurativeAssetsApproved,
      }),
    ],
    ["comparaisons.html", renderComparisonsTemplate({ verifiedOn: VERIFIED_ON })],
    [
      "marque.html",
      renderBrandGuideTemplate({
        brand: content.brand,
        figurativeAssetsApproved: input.figurativeAssetsApproved,
      }),
    ],
    ["assets/styles.css", `${input.uiStyles.trimEnd()}\n\n${renderSiteCss()}`],
    ["assets/tokens.css", input.uiTokens],
  ]);
  if (input.figurativeAssetsApproved && input.brandMark !== null) {
    files.set("assets/libre-ai-mark.svg", input.brandMark);
  }

  for (const [path, value] of files) {
    if (findRemoteAssetReferences(value).length > 0) {
      throw new Error(`brand.output_remote_asset:${path}`);
    }
    if (
      (path.endsWith(".html") || path.endsWith(".svg")) &&
      findExecutableMarkup(value).length > 0
    ) {
      throw new Error(`brand.output_executable_markup:${path}`);
    }
  }
  return files;
}

export async function loadProductionSiteInput(root: string): Promise<StaticBrandSiteInput> {
  const [brandProjection, fleetStatus, uiStyles, uiTokens] = await Promise.all([
    readFile(join(root, productionSources.brandProjection), "utf8").then((value) =>
      JSON.parse(value),
    ),
    readFile(join(root, productionSources.fleetStatus), "utf8").then((value) => JSON.parse(value)),
    readFile(join(root, productionSources.uiStyles), "utf8"),
    readFile(join(root, productionSources.uiTokens), "utf8"),
  ]);

  return {
    brandProjection,
    fleetStatus,
    uiStyles,
    uiTokens,
    figurativeAssetsApproved: false,
    brandMark: null,
  };
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function validateOutputPath(path: string): void {
  const segments = path.split("/");
  if (
    path.length === 0 ||
    isAbsolute(path) ||
    path.includes("\\") ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..") ||
    posix.normalize(path) !== path
  ) {
    throw new Error(`brand.output_path_invalid:${path}`);
  }
}

async function recoverInterruptedReplacement(
  outputRoot: string,
  previousRoot: string,
): Promise<void> {
  const [outputExists, previousExists] = await Promise.all([
    pathExists(outputRoot),
    pathExists(previousRoot),
  ]);
  if (!previousExists) return;
  if (!outputExists) {
    await rename(previousRoot, outputRoot);
    return;
  }
  await rm(previousRoot, { recursive: true });
}

export async function writeStaticSite(
  outputRoot: string,
  files: ReadonlyMap<string, string>,
): Promise<void> {
  const outputName = basename(outputRoot);
  if (outputName.length === 0 || outputName === "." || outputName === ".." || files.size === 0) {
    throw new Error("brand.output_root_invalid");
  }
  for (const path of files.keys()) validateOutputPath(path);

  const parent = dirname(outputRoot);
  const stagingRoot = join(parent, `.${outputName}.staging`);
  const previousRoot = join(parent, `.${outputName}.previous`);
  await mkdir(parent, { recursive: true });
  await recoverInterruptedReplacement(outputRoot, previousRoot);
  await rm(stagingRoot, { recursive: true, force: true });
  await mkdir(stagingRoot);

  try {
    for (const [path, value] of files) {
      const destination = join(stagingRoot, path);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, value, "utf8");
    }
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }

  const hadPreviousArtifact = await pathExists(outputRoot);
  if (hadPreviousArtifact) await rename(outputRoot, previousRoot);
  try {
    await rename(stagingRoot, outputRoot);
    if (hadPreviousArtifact) await rm(previousRoot, { recursive: true });
  } catch (error) {
    await rm(outputRoot, { recursive: true, force: true });
    if (hadPreviousArtifact) await rename(previousRoot, outputRoot);
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function buildProductionSite(root: string): Promise<ReadonlyMap<string, string>> {
  return buildStaticBrandSite(await loadProductionSiteInput(root));
}

if (import.meta.main) {
  const root = process.cwd();
  const files = await buildProductionSite(root);
  await writeStaticSite(join(root, "dist"), files);
  console.log(`Wrote ${files.size} guarded production files.`);
}
