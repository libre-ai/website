/**
 * Static publisher — first public projection (γ 3.6, CDC docs/apps/website.md).
 *
 * Renders dist/index.html (fleet-status table, computed displays only) and
 * dist/comparaisons.html (dated, sourced comparisons) from the governance
 * fleet-status projection consumed as a pinned git-dep. Static output, no
 * JavaScript shipped, no external request, no tracking — the CDC non-goals
 * hold by construction.
 */
import { COMPARISONS, VERIFIED_ON } from "./comparisons";

interface FleetRow {
  readonly repository: string;
  readonly project: string;
  readonly layer: string;
  readonly summary: string;
  readonly display: string;
  readonly maturity: string;
  readonly last_verified_on: string;
}

interface FleetStatus {
  readonly rows: readonly FleetRow[];
}

const CSS = `body{font-family:system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#1a1a1a}
table{border-collapse:collapse;width:100%;margin:1rem 0}
th,td{border:1px solid #ccc;padding:.4rem .6rem;text-align:left;vertical-align:top}
th{background:#f2f2f2}
footer{margin-top:2rem;font-size:.85rem;color:#555}`;

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const LAYER_LABEL: Record<string, string> = {
  "couche-1": "Produits",
  "couche-2": "Orchestration",
  "couche-3": "Briques structurantes",
  "couche-4": "Atelier",
  transverse: "Transverse",
  moyeu: "Moyeu",
};

export function renderHome(status: FleetStatus, generatedFrom: string): string {
  const groups = new Map<string, FleetRow[]>();
  for (const row of status.rows) {
    const bucket = groups.get(row.layer) ?? [];
    bucket.push(row);
    groups.set(row.layer, bucket);
  }
  const sections: string[] = [];
  for (const [layer, rows] of groups) {
    const body = rows
      .map(
        (r) =>
          `<tr><td><a href="https://github.com/${escapeHtml(r.repository)}">${escapeHtml(r.project)}</a></td><td>${escapeHtml(r.summary)}</td><td>${escapeHtml(r.display)}</td><td>${escapeHtml(r.maturity)}</td><td>${escapeHtml(r.last_verified_on)}</td></tr>`,
      )
      .join("\n");
    sections.push(
      `<h2>${escapeHtml(LAYER_LABEL[layer] ?? layer)}</h2>\n<table><thead><tr><th>Projet</th><th>Résumé</th><th>Avancement</th><th>Maturité</th><th>Vérifié le</th></tr></thead><tbody>\n${body}\n</tbody></table>`,
    );
  }
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Libre AI — état des projets</title>
<style>${CSS}</style>
</head>
<body>
<h1>Libre AI</h1>
<p>Pour les personnes qui veulent des outils d'IA qui leur appartiennent, qui rencontrent des logiciels opaques et invérifiables, Libre AI construit en public une gamme de produits souverains et explicables — en produisant du code ouvert, des états calculés et des preuves datées, sans dépendre d'un fournisseur fermé.</p>
<p>Chaque avancement ci-dessous est calculé depuis la fiche d'état versionnée du projet — jamais déclaré. <a href="./comparaisons.html">Comparaisons datées</a>.</p>
${sections.join("\n")}
<footer>Généré depuis ${escapeHtml(generatedFrom)} — aucun script, aucun tracking. Source : <a href="https://github.com/libre-ai">github.com/libre-ai</a>.</footer>
</body>
</html>
`;
}

export function renderComparisons(): string {
  const rows = COMPARISONS.map(
    (c) =>
      `<tr><td><a href="${escapeHtml(c.url)}">${escapeHtml(c.name)}</a></td><td>${escapeHtml(c.what)}</td><td>${escapeHtml(c.difference)}</td></tr>`,
  ).join("\n");
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Libre AI — comparaisons datées</title>
<style>${CSS}</style>
</head>
<body>
<h1>Comparaisons datées</h1>
<p>Chaque ligne décrit ce que le projet comparé annonce sur son propre site (source liée), et ce qui distingue l'approche Libre AI — factuel, sans caricature. Vérifié le ${escapeHtml(VERIFIED_ON)} ; toute erreur signalée est corrigée par pull request.</p>
<table><thead><tr><th>Projet</th><th>Ce qu'il annonce</th><th>Ce qui nous distingue</th></tr></thead><tbody>
${rows}
</tbody></table>
<footer><a href="./index.html">← état des projets</a></footer>
</body>
</html>
`;
}

if (import.meta.main) {
  const status = (await Bun.file(
    "node_modules/@libre-ai/governance/ecosystem/projections/fleet-status.v1.json",
  ).json()) as FleetStatus;
  await Bun.write("dist/index.html", renderHome(status, "fleet-status.v1.json (governance)"));
  await Bun.write("dist/comparaisons.html", renderComparisons());
  console.log(`wrote dist/index.html (${status.rows.length} rows) and dist/comparaisons.html`);
}
