import { requireAllowedPublicHttpsUrl } from "./security";

export interface PublicBrandCopy {
  readonly tension: string;
  readonly promise: string;
  readonly explanation: string;
  readonly qualification: string;
  readonly reasonToBelieve: string;
  readonly primaryCta: string;
  readonly secondaryCta: string;
}

export interface PublicProof {
  readonly claim: string;
  readonly mechanism: string;
  readonly source: string;
  readonly verifiedOn: string;
  readonly limitation: string;
}

export interface PublicProductName {
  readonly repository: string;
  readonly publicName: string;
}

export interface PublicBrandProjection {
  readonly schema_version: "libre-ai.public-brand.v1";
  readonly generated_from: readonly [
    "brand/README.md",
    "brand/README.en.md",
    "brand/proof-matrix.md",
  ];
  readonly copy: { readonly fr: PublicBrandCopy; readonly en: PublicBrandCopy };
  readonly products: readonly PublicProductName[];
  readonly proofs: readonly PublicProof[];
}

export interface Evidence {
  readonly claim: string;
  readonly mechanism: string;
  readonly source: URL;
  readonly verifiedOn: string;
  readonly limitation: string;
}

export interface FleetRow {
  readonly repository: string;
  readonly project: string;
  readonly publicName: string;
  readonly kind: string;
  readonly layer: string;
  readonly summary: string;
  readonly display: string;
  readonly maturity: string;
  readonly last_verified_on: string;
}

const canonicalLayers = [
  "couche-1",
  "couche-2",
  "couche-3",
  "couche-4",
  "transverse",
  "moyeu",
] as const;

const PUBLIC_BRAND_SOURCE_HOSTS = new Set(["github.com"]);

const canonicalFrenchCopy: PublicBrandCopy = {
  tension: "Les plateformes propriétaires vous louent le produit.",
  promise: "Possédez la fabrique.",
  explanation:
    "Libre AI réunit les logiciels, la méthode et les preuves pour construire des outils d'IA que vous pouvez vérifier, modifier et déployer où vous le décidez.",
  qualification: "Ouverts, souverains et explicables.",
  reasonToBelieve: "Conçus dans une fabrique ouverte où la preuve fait partie du produit.",
  primaryCta: "Prenez les clés.",
  secondaryCta: "Voir les preuves.",
};

function record(value: unknown, error: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(error);
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, error: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(error);
  return value;
}

function isoDate(value: unknown, error: string): string {
  const date = nonEmptyString(value, error);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(error);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(error);
  }
  return date;
}

function parseCopy(value: unknown, language: "fr" | "en"): PublicBrandCopy {
  const input = record(value, `brand.copy_invalid:${language}`);
  return {
    tension: nonEmptyString(input.tension, `brand.copy_invalid:${language}:tension`),
    promise: nonEmptyString(input.promise, `brand.copy_invalid:${language}:promise`),
    explanation: nonEmptyString(input.explanation, `brand.copy_invalid:${language}:explanation`),
    qualification: nonEmptyString(
      input.qualification,
      `brand.copy_invalid:${language}:qualification`,
    ),
    reasonToBelieve: nonEmptyString(
      input.reasonToBelieve,
      `brand.copy_invalid:${language}:reasonToBelieve`,
    ),
    primaryCta: nonEmptyString(input.primaryCta, `brand.copy_invalid:${language}:primaryCta`),
    secondaryCta: nonEmptyString(input.secondaryCta, `brand.copy_invalid:${language}:secondaryCta`),
  };
}

export function parseBrandProjection(value: unknown): PublicBrandProjection {
  const input = record(value, "brand.projection_invalid");
  if (input.schema_version !== "libre-ai.public-brand.v1") {
    throw new Error("brand.projection_schema_unknown");
  }
  const generatedFrom = input.generated_from;
  if (
    !Array.isArray(generatedFrom) ||
    generatedFrom.length !== 3 ||
    generatedFrom[0] !== "brand/README.md" ||
    generatedFrom[1] !== "brand/README.en.md" ||
    generatedFrom[2] !== "brand/proof-matrix.md"
  ) {
    throw new Error("brand.projection_authority_invalid");
  }
  const copy = record(input.copy, "brand.copy_invalid");
  if (!Array.isArray(input.products) || input.products.length === 0) {
    throw new Error("brand.products_invalid");
  }
  if (!Array.isArray(input.proofs) || input.proofs.length !== 3) {
    throw new Error("brand.proofs_invalid");
  }
  const frenchCopy = parseCopy(copy.fr, "fr");
  for (const key of Object.keys(canonicalFrenchCopy) as (keyof PublicBrandCopy)[]) {
    if (frenchCopy[key] !== canonicalFrenchCopy[key]) {
      throw new Error(`brand.copy_canonical_drift:fr:${key}`);
    }
  }
  const productRepositories = new Set<string>();
  const products = input.products.map((value, index): PublicProductName => {
    const product = record(value, `brand.product_invalid:${index}`);
    const repository = nonEmptyString(
      product.repository,
      `brand.product_invalid:${index}:repository`,
    );
    if (!/^libre-ai\/[a-z0-9-]+$/.test(repository)) {
      throw new Error(`brand.product_invalid:${index}:repository`);
    }
    if (productRepositories.has(repository)) {
      throw new Error(`brand.product_duplicate:${repository}`);
    }
    productRepositories.add(repository);
    const publicName = nonEmptyString(
      product.publicName,
      `brand.product_invalid:${index}:publicName`,
    );
    if (!publicName.startsWith("Libre AI ")) {
      throw new Error(`brand.product_invalid:${index}:publicName`);
    }
    return { repository, publicName };
  });
  const claims = new Set<string>();
  const proofs = input.proofs.map((value, index): PublicProof => {
    const proof = record(value, `brand.proof_invalid:${index}`);
    const claim = nonEmptyString(proof.claim, `brand.proof_invalid:${index}:claim`);
    if (claims.has(claim)) throw new Error(`brand.proof_duplicate:${claim}`);
    claims.add(claim);
    const source = nonEmptyString(proof.source, `brand.proof_invalid:${index}:source`);
    requireAllowedPublicHttpsUrl(source, PUBLIC_BRAND_SOURCE_HOSTS);
    return {
      claim,
      mechanism: nonEmptyString(proof.mechanism, `brand.proof_invalid:${index}:mechanism`),
      source,
      verifiedOn: isoDate(proof.verifiedOn, `brand.proof_invalid:${index}:verifiedOn`),
      limitation: nonEmptyString(proof.limitation, `brand.proof_invalid:${index}:limitation`),
    };
  });

  return {
    schema_version: "libre-ai.public-brand.v1",
    generated_from: ["brand/README.md", "brand/README.en.md", "brand/proof-matrix.md"],
    copy: { fr: frenchCopy, en: parseCopy(copy.en, "en") },
    products,
    proofs,
  };
}

export function groupFleetRows(
  rows: readonly FleetRow[],
): ReadonlyMap<string, readonly FleetRow[]> {
  const buckets = new Map<string, FleetRow[]>();
  for (const row of rows) {
    if (!canonicalLayers.includes(row.layer as (typeof canonicalLayers)[number])) {
      throw new Error(`brand.fleet_layer_unknown:${row.layer}`);
    }
    const bucket = buckets.get(row.layer) ?? [];
    bucket.push(row);
    buckets.set(row.layer, bucket);
  }
  return new Map(
    canonicalLayers.flatMap((layer) => {
      const rows = buckets.get(layer);
      return rows === undefined ? [] : [[layer, rows] as const];
    }),
  );
}

export function toEvidence(proof: PublicProof): Evidence {
  return {
    ...proof,
    source: requireAllowedPublicHttpsUrl(proof.source, PUBLIC_BRAND_SOURCE_HOSTS),
  };
}
