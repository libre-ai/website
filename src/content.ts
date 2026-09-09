import {
  type FleetRow,
  groupFleetRows,
  type PublicBrandProjection,
  parseBrandProjection,
} from "./domain";

export interface WebsiteContent {
  readonly brand: PublicBrandProjection;
  readonly fleetRows: readonly FleetRow[];
}

function record(value: unknown, error: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(error);
  return value as Record<string, unknown>;
}

function string(value: unknown, error: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(error);
  return value;
}

function date(value: unknown, error: string): string {
  const candidate = string(value, error);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) throw new Error(error);
  const parsed = new Date(`${candidate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== candidate) {
    throw new Error(error);
  }
  return candidate;
}

function parseFleetStatus(value: unknown): readonly FleetRow[] {
  const input = record(value, "brand.fleet_status_invalid");
  if (!Array.isArray(input.rows)) throw new Error("brand.fleet_rows_invalid");
  const rows = input.rows.map((value, index): FleetRow => {
    const row = record(value, `brand.fleet_row_invalid:${index}`);
    const repository = string(row.repository, `brand.fleet_row_invalid:${index}:repository`);
    if (!/^libre-ai\/[a-z0-9-]+$/.test(repository)) {
      throw new Error(`brand.fleet_row_invalid:${index}:repository`);
    }
    return {
      repository,
      project: string(row.project, `brand.fleet_row_invalid:${index}:project`),
      layer: string(row.layer, `brand.fleet_row_invalid:${index}:layer`),
      summary: string(row.summary, `brand.fleet_row_invalid:${index}:summary`),
      display: string(row.display, `brand.fleet_row_invalid:${index}:display`),
      maturity: string(row.maturity, `brand.fleet_row_invalid:${index}:maturity`),
      last_verified_on: date(
        row.last_verified_on,
        `brand.fleet_row_invalid:${index}:last_verified_on`,
      ),
    };
  });
  groupFleetRows(rows);
  return rows;
}

export function parseWebsiteContent(brand: unknown, fleetStatus: unknown): WebsiteContent {
  return { brand: parseBrandProjection(brand), fleetRows: parseFleetStatus(fleetStatus) };
}
