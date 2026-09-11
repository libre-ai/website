import { join } from "node:path";

import { buildProductionSite, writeStaticSite } from "../../src/build";

const root = process.cwd();
const files = await buildProductionSite(root);
await writeStaticSite(join(root, "site"), files);
console.log(`Synchronized ${files.size} guarded deployment files.`);
