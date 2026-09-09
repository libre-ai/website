import { COMPARISONS } from "./comparisons";
import { type FleetRow, groupFleetRows, type PublicBrandProjection, toEvidence } from "./domain";
import { escapeHtml, requirePublicHttpsUrl } from "./security";

const layerLabels: Readonly<Record<string, string>> = {
  "couche-1": "Produits",
  "couche-2": "Orchestration",
  "couche-3": "Briques structurantes",
  "couche-4": "Atelier",
  transverse: "Transverse",
  moyeu: "Moyeu",
};

export interface HomePageInput {
  readonly brand: PublicBrandProjection;
  readonly fleetRows: readonly FleetRow[];
  readonly figurativeAssetsApproved: boolean;
}

export interface ComparisonsPageInput {
  readonly verifiedOn: string;
}

export interface BrandGuidePageInput {
  readonly brand: PublicBrandProjection;
  readonly figurativeAssetsApproved: boolean;
}

function page(title: string, content: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'none'; connect-src 'none'; font-src 'self'; form-action 'none'; frame-src 'none'; img-src 'self'; manifest-src 'none'; media-src 'none'; object-src 'none'; script-src 'none'; style-src 'self'; worker-src 'none'">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="./assets/styles.css">
</head>
<body>
<a class="lai-skip-link" href="#contenu">Aller au contenu</a>
<header class="site-header lai-page">
  <a class="wordmark" href="./index.html">Libre AI</a>
  <nav aria-label="Navigation principale"><a href="./index.html#preuves">Preuves</a> <a href="./index.html#produits">Produits</a> <a href="./comparaisons.html">Comparaisons</a> <a href="./marque.html">Marque</a></nav>
</header>
<main id="contenu">${content}</main>
<footer class="site-footer lai-page">Sources, états et limites sont publiés. <a href="https://github.com/libre-ai">Code source Libre AI</a>.</footer>
</body>
</html>
`;
}

function renderProofs(brand: PublicBrandProjection): string {
  return brand.proofs
    .map((proof) => {
      const evidence = toEvidence(proof);
      return `<article class="evidence lai-open-frame">
  <h3>${escapeHtml(evidence.claim)}</h3>
  <p>${escapeHtml(evidence.mechanism)}</p>
  <dl>
    <div><dt>SOURCE</dt><dd><a href="${escapeHtml(evidence.source.href)}">Consulter la source</a></dd></div>
    <div><dt>VÉRIFIÉ LE</dt><dd><time datetime="${escapeHtml(evidence.verifiedOn)}">${escapeHtml(evidence.verifiedOn)}</time></dd></div>
    <div><dt>LIMITE</dt><dd>${escapeHtml(evidence.limitation)}</dd></div>
  </dl>
</article>`;
    })
    .join("\n");
}

function renderProductCards(rows: readonly FleetRow[]): string {
  return [...groupFleetRows(rows)]
    .map(
      ([
        layer,
        group,
      ]) => `<section class="product-group" aria-labelledby="group-${escapeHtml(layer)}">
  <h3 id="group-${escapeHtml(layer)}">${escapeHtml(layerLabels[layer] ?? layer)}</h3>
  <div class="card-grid">${group
    .map((row) => {
      const source = requirePublicHttpsUrl(`https://github.com/${row.repository}`);
      return `<article class="product-card lai-open-frame"><h4><a href="${escapeHtml(source.href)}">${escapeHtml(row.publicName)}</a></h4><p>${escapeHtml(row.summary)}</p><p><strong>${escapeHtml(row.maturity)}</strong> — ${escapeHtml(row.display)}</p></article>`;
    })
    .join("")}</div>
</section>`,
    )
    .join("\n");
}

function renderFleetTable(rows: readonly FleetRow[]): string {
  const body = rows
    .map((row) => {
      const source = requirePublicHttpsUrl(`https://github.com/${row.repository}`);
      return `<tr><th scope="row"><a href="${escapeHtml(source.href)}">${escapeHtml(row.publicName)}</a></th><td>${escapeHtml(layerLabels[row.layer] ?? row.layer)}</td><td>${escapeHtml(row.summary)}</td><td>${escapeHtml(row.display)}</td><td>${escapeHtml(row.maturity)}</td><td><time datetime="${escapeHtml(row.last_verified_on)}">${escapeHtml(row.last_verified_on)}</time></td></tr>`;
    })
    .join("\n");
  return `<div class="table-scroll" tabindex="0"><table><thead><tr><th>Projet</th><th>Couche</th><th>Résumé</th><th>Avancement</th><th>Maturité</th><th>Vérifié le</th></tr></thead><tbody id="fleet-rows">${body}</tbody></table></div>`;
}

export function renderHome(input: HomePageInput): string {
  const copy = input.brand.copy.fr;
  const latestVerification = input.fleetRows
    .map((row) => row.last_verified_on)
    .sort()
    .at(-1);
  if (latestVerification === undefined) throw new Error("brand.fleet_rows_empty");
  const mark = input.figurativeAssetsApproved
    ? '<img class="brand-mark" src="./assets/libre-ai-mark.svg" alt="">'
    : "";
  const content = `
<section class="hero lai-page">${mark}<p class="eyebrow">Fabrique ouverte de logiciels d’IA</p><p class="tension">${escapeHtml(copy.tension)}</p><h1>${escapeHtml(copy.promise)}</h1><p class="lede">${escapeHtml(copy.explanation)}</p><p class="qualification">${escapeHtml(copy.qualification)} ${escapeHtml(copy.reasonToBelieve)}</p><p class="actions"><a class="primary-action" href="#methode">${escapeHtml(copy.primaryCta)}</a> <a href="#preuves">${escapeHtml(copy.secondaryCta)}</a></p></section>
<aside class="provenance lai-page" aria-label="Provenance">État généré depuis <code>fleet-status.v1.json</code> · vérification la plus récente : <time datetime="${escapeHtml(latestVerification)}">${escapeHtml(latestVerification)}</time> · Aucun tracking.</aside>
<section class="section lai-page" id="preuves"><p class="section-index">01 / PREUVES</p><h2>Ne nous croyez pas. Vérifiez.</h2><div class="card-grid">${renderProofs(input.brand)}</div></section>
<section class="section lai-page" id="produits"><p class="section-index">02 / PRODUITS</p><h2>Une gamme, pas une boîte noire.</h2>${renderProductCards(input.fleetRows)}</section>
<section class="section lai-page" id="methode"><p class="section-index">03 / FABRIQUE</p><h2>Prenez les clés.</h2><ol class="factory"><li><strong>Décider</strong><span>Rendre les arbitrages explicites.</span></li><li><strong>Construire</strong><span>Composer des briques ouvertes.</span></li><li><strong>Vérifier</strong><span>Tester les affirmations et publier les limites.</span></li><li><strong>Publier</strong><span>Versionner les preuves avec le produit.</span></li></ol></section>
<section class="section lai-page" id="etat-complet"><p class="section-index">04 / ÉTAT COMPLET</p><h2>Tout l'atelier, sans sélection marketing.</h2>${renderFleetTable(input.fleetRows)}</section>
<section class="section contribution"><div class="lai-page"><p class="section-index">05 / CONTRIBUTION</p><h2>La fabrique est ouverte.</h2><p>Inspectez les décisions, testez les preuves et proposez des changements traçables.</p><a class="primary-action" href="https://github.com/libre-ai">Ouvrir les dépôts</a></div></section>`;
  return page("Libre AI — Possédez la fabrique", content);
}

export function renderComparisons(input: ComparisonsPageInput): string {
  const rows = COMPARISONS.map((comparison) => {
    const source = requirePublicHttpsUrl(comparison.url);
    return `<tr><th scope="row"><a href="${escapeHtml(source.href)}">${escapeHtml(comparison.name)}</a></th><td>${escapeHtml(comparison.what)}</td><td>${escapeHtml(comparison.difference)}</td></tr>`;
  }).join("\n");
  return page(
    "Libre AI — Comparaisons datées",
    `<section class="section lai-page"><p class="section-index">COMPARAISONS / ${escapeHtml(input.verifiedOn)}</p><h1>Comparaisons datées</h1><p>Des différences factuelles, reliées aux sources des projets comparés. Pas de caricature.</p><div class="table-scroll" tabindex="0"><table><thead><tr><th>Projet</th><th>Ce qu'il annonce</th><th>Ce qui nous distingue</th></tr></thead><tbody>${rows}</tbody></table></div></section>`,
  );
}

export function renderBrandGuide(input: BrandGuidePageInput): string {
  const copy = input.brand.copy.fr;
  const assets = input.figurativeAssetsApproved
    ? '<h2>Portique d’atelier</h2><img class="brand-mark brand-mark--guide" src="./assets/libre-ai-mark.svg" alt="Libre AI"><p><a download href="./assets/libre-ai-mark.svg">Télécharger le SVG approuvé</a></p><p>Zone de protection : une largeur de montant du portique autour du signe. Ne pas fermer ou déformer le portique. Dans une déclinaison colorée, réserver le jade au bloc de contrôle. Ne jamais combiner jade et iris en dégradé.</p>'
    : '<h2>Actifs figuratifs</h2><p class="pending">Les actifs figuratifs ne sont pas encore publiés.</p><p>Le mot-symbole textuel « Libre AI » reste la seule identité publiable tant que la licence exacte et le dossier de similarité ne sont pas acceptés.</p>';
  return page(
    "Libre AI — Guide de marque",
    `<section class="section lai-page"><p class="section-index">GUIDE DE MARQUE</p><h1>${escapeHtml(copy.promise)}</h1><p>${escapeHtml(copy.tension)}</p><p>${escapeHtml(copy.explanation)}</p><h2>Architecture de gamme</h2><p>Chaque produit se nomme « Libre AI &lt;Produit&gt; ». Le nom du produit reste du texte, jamais un dessin.</p><h2>Couleurs</h2><p>Jade porte l'action et l'ouverture ; iris structure l'information secondaire. Ils ne forment jamais un dégradé.</p>${assets}<h2>Usage des noms</h2><p>Une référence nominative exacte ne doit jamais suggérer certification, partenariat ou approbation. Les forks utilisent un nom et une identité distincts.</p><p><a href="https://github.com/libre-ai/governance/blob/main/TRADEMARKS.md">Politique de marques</a></p></section>`,
  );
}
