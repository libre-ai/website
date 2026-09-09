import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { buildStaticBrandSite } from "./build";

export interface PreviewArguments {
  readonly governanceRoot: string;
  readonly uiRoot: string;
  readonly outputRoot: ".preview";
}

function flagValue(args: readonly string[], flag: string): string {
  const index = args.indexOf(flag);
  const value = index === -1 ? undefined : args[index + 1];
  if (value === undefined || value.trim() === "") {
    throw new Error(`brand.preview_argument_missing:${flag}`);
  }
  return value;
}

export function parsePreviewArguments(args: readonly string[]): PreviewArguments {
  return {
    governanceRoot: flagValue(args, "--governance-root"),
    uiRoot: flagValue(args, "--ui-root"),
    outputRoot: ".preview",
  };
}

async function main(): Promise<void> {
  const args = parsePreviewArguments(process.argv.slice(2));
  const [brandProjection, fleetStatus, uiStyles, uiTokens] = await Promise.all([
    Bun.file(join(args.governanceRoot, "brand/projections/public-brand.v1.json")).json(),
    Bun.file(join(args.governanceRoot, "ecosystem/projections/fleet-status.v1.json")).json(),
    Bun.file(join(args.uiRoot, "src/styles.css")).text(),
    Bun.file(join(args.uiRoot, "src/tokens.css")).text(),
  ]);
  const files = buildStaticBrandSite({
    brandProjection,
    fleetStatus,
    uiStyles,
    uiTokens,
    figurativeAssetsApproved: false,
    brandMark: null,
  });

  await rm(join(args.outputRoot, "assets/libre-ai-mark.svg"), { force: true });
  for (const [path, value] of files) {
    const destination = join(args.outputRoot, path);
    await mkdir(join(destination, ".."), { recursive: true });
    await Bun.write(destination, value);
  }
  console.log(`Wrote ${files.size} guarded preview files to ${args.outputRoot}.`);
}

if (import.meta.main) {
  await main();
}
