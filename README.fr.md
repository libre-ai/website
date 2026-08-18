[English](README.md) · **Français**

> [!NOTE]
> **Application active, régularisée par signature propriétaire.** Ce dépôt s'est activé de fait — sept pull requests mergées avant tout acte propriétaire — et [ADR-0020](https://github.com/libre-ai/governance/blob/main/docs/adr/0020-general-activation-and-hub-dismantling.md) §2.4 régularise cette activation nominativement : la signature de l'ADR _est_ l'acte. Le publieur statique construit déjà la page d'accueil et les huit comparaisons datées à partir du code de ce dépôt, chaîne verte en CI (voir `project.v1.yaml`). Il n'est pas encore déployé sur une URL publique, et le CDC complet (`docs/apps/website.md`) — les parcours lecteurs restants — reste à servir.

# Website

**Projection publique, citable, du savoir, des produits et des preuves de Libre AI, tous examinés.** Un site statique, sans suivi, qui n'accepte que des entrées canoniques examinées. Les lecteurs suivent des URL stables vers l'état actuel du produit et les dates de source ; les contributeurs proposent des améliorations via GitHub ; les crawlers reçoivent des métadonnées lisibles par machine pour l'indexation sans empreinte digitale.

Le cas canonique auquel il répond : _« donner au public un accès en lecture seule à la vérité produit actuelle, complète avec sources, dates d'examen et liens de preuve, sans analytique ni données personnelles. »_

## Ce qui le distingue

- **Déterministe et statique.** Les sorties de construction sont adressées par contenu ; des entrées identiques produisent toujours des versions identiques. Les lecteurs ne frappent jamais un runtime changeant — toute la surface statique est reproductible et auditable, jamais l'opinion d'un modèle.
- **Examiné seulement.** Seul le contenu sélectionné et approuvé de Git atteint la publication. Aucun brouillon non examiné sur les origines publiques ; aucune vérité rédigée par un CMS.
- **Sans suivi et souverain.** Aucune analytique, empreinte digitale ni cookie de suivi comportemental. La recherche est auto-hébergée (Pagefind). Aucune dépendance externe dans le HTML rendu.
- **Citable et sourcé.** Chaque affirmation porte son auteur, son assistance, ses sources, sa date d'examen et son historique de corrections. Les lecteurs exportent, citent et vérifient avant utilisation.
- **Accessible par conception.** Le HTML sémantique fonctionne sans JavaScript. Clavier, zoom 200/400 %, mouvement réduit, contraste élevé et trois moteurs de navigateur sont testés. L'échec de la recherche laisse un plan du site navigable.

## État — spécifié, première projection construite et chaîne verte en CI

La phase de première projection de Website (γ 3.6) est **acceptée** : le tableau de la page d'accueil (généré depuis la projection fleet-status épinglée, jamais déclaré à la main) et les huit comparaisons datées se construisent et passent en CI dans ce dépôt — voir `project.v1.yaml` et la preuve d'exécution qu'elle cite. Le CDC complet (parcours comprendre, vérifier, contribuer, découvrir) reste en attente, et rien n'est encore déployé sur une URL publique :

| Fondation                                                                   | État                             | Preuve                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Suite de contrats** — Knowledge Object, Public Projection, Feeds          | ✅ verrouillé                    | CDC approuvé et fusionné ; schémas canoniques sous `contracts/schemas/` dans [`libre-ai/contracts`](https://github.com/libre-ai/contracts) ([PR #209 du hub](https://github.com/libre-ai/libre-ai/pull/209), historique) |
| **Tableau de la page d'accueil** — généré depuis la projection fleet-status | ✅ construit, chaîne verte en CI | `src/build.ts` ; `project.v1.yaml` phase première projection, critère `homepage-table`, accepté                                                                                                                          |
| **Huit comparaisons datées** — sourcées et datées                           | ✅ construit, chaîne verte en CI | `src/comparisons.ts` ; `project.v1.yaml` phase première projection, critère `dated-comparisons`, accepté                                                                                                                 |
| **Parcours CDC complets** — comprendre, vérifier, contribuer, découvrir     | ⏳ en attente                    | [`docs/apps/website.md`](docs/apps/website.md) ; `project.v1.yaml` phase CDC, critère `cdc-journeys`, en attente                                                                                                         |
| **Déploiement public** — une URL vivante accessible aux lecteurs            | ⏳ en attente                    | `dist/` se construit et est vérifié en CI ; pas encore publié nulle part                                                                                                                                                 |
| **Gates navigateur et accessibilité** — Chromium/Firefox/WebKit             | ⏳ en attente                    | CSP, budget de requête distante zéro, clavier sans JS, tests de zoom et contraste                                                                                                                                        |

Ce dépôt est actif (ADR-0020 §2.4), ni réservé ni archivé ; le README est tenu à jour, et les pull requests atterrissent directement ici (les issues sont désactivées). **Aucune cible de référence** — ceci est la projection publique propre de l'organisation, non un objectif de parité contre le site d'un autre fournisseur. La mesure du succès est la projection complète, honnête et sans suivi du savoir examiné.

## Ce qu'il projette

Website consomme :

- **Corpus de la flotte** — objets de savoir examinés sous `ecosystem/` dans [`libre-ai/governance`](https://github.com/libre-ai/governance) et `contracts/` dans [`libre-ai/contracts`](https://github.com/libre-ai/contracts).
- **Projections de produit** — capacité et état pour chaque produit de l'inventaire (`docs/apps/*.md`).
- **Preuve de forge** — auteur, dates d'examen, états d'approbation et enregistrements de corrections de Git.

Et publie :

- **Routes statiques** — pages de produit, intégration, FAQ, URL canoniques avec dates de source et liens de preuve.
- **Métadonnées lisibles par machine** — feeds Atom/RSS, sitemap avec dates de modification, projections schéma JSON pour crawlers.
- **Index de recherche** — Pagefind auto-hébergé, aucune API de recherche externe.
- **Historique de corrections** — version et audit pour chaque affirmation corrigée.

## Comment ça fonctionne

1. **Compiler** — sélectionner les objets canoniques de Git (docs, contrats, inventaire), valider la complétude et la provenance, et figer un instantané adressé par contenu.
2. **Rendre** — instancier l'instantané en routes HTML, feeds Atom, sitemaps et métadonnées de recherche en utilisant des composants déterministes, sans capacité.
3. **Vérifier-fumée** — tester tous les liens internes, URL canoniques, redirections, gates d'accessibilité (clavier, zoom, contraste élevé) et CSP, puis exiger l'approbation humaine avant la version.
4. **Publier** — remplacer de manière atomique l'artefact statique complet. Les lecteurs obtiennent la nouvelle version ou la version antérieure — jamais un état partiel ou intermédiaire.
5. **Corriger** — accepter les propositions via issue/PR GitHub. Les corrections approuvées sont une nouvelle rendre, re-vérifiée et republié ; la preuve passée reste auditable.

## Architecture — projection à partir de contrats interopérables

Website est une couche de projection transversale, non un moteur de domaine. Elle consomme les contrats et produit les surfaces publiques à partir de sélections examinées.

| Composant                                         | Rôle                                             | Interface exposée / consommée                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Suite de contrats** (schémas verrouillés)       | Surface d'interopérabilité                       | Knowledge Object v1, Public Projection v1, Correction Record v1                                                                       |
| **Compilateur de corpus** (validation, sélection) | Pipeline source-vers-instantané                  | Lit les objets Git, valide contre le schéma, émet un instantané adressé par contenu                                                   |
| **Modèle statique Bun** (React 19 SSR)            | Coque HTML accessible, génération de métadonnées | Rend les instantanés en HTML statique déterministe, feeds Atom, sitemaps, JSON de recherche                                           |
| **Indexeur Pagefind** (auto-hébergé hors ligne)   | Surface de recherche                             | Construit l'index de recherche à partir du HTML rendu sans appels réseau ; émet search.json avec moteur WASM                          |
| **Gate de publication** (intégrité + approbation) | Transition candidat → version                    | Valide les constructions identiques, tous les liens internes résolus, gates d'accessibilité passées, puis exige l'approbation humaine |

L'hôte qui autorise passe les octets d'instantané canoniques au moteur de rendu ; le moteur de rendu ne détient aucun jeton et n'atteint aucun réseau externe. Tout consommateur qui parle les mêmes contrats peut projeter le même instantané.

## Où se déroule le travail

Le développement actif est dans ce dépôt :

- `src/build.ts`, `src/comparisons.ts` — le modèle statique et le compilateur de comparaisons.
- `dist/` — la sortie construite en CI, adressée par contenu (`index.html`, `comparaisons.html`).
- `docs/apps/website.md` — le cahier des charges complet du produit, migré du hub (désormais archivé).
- `project.v1.yaml` — la fiche d'état qui fait autorité ; la section générée ci-dessous n'en diverge jamais.

Les contrats restent canoniques dans [`libre-ai/contracts`](https://github.com/libre-ai/contracts) (Knowledge Object, Public Projection, Correction Record), et la projection fleet-status est épinglée depuis [`libre-ai/governance`](https://github.com/libre-ai/governance) — ce dépôt consomme les deux, il ne les duplique pas.

Pour suivre l'avancement ou contribuer, ouvrez des pull requests directement dans `libre-ai/website` (les issues sont désactivées).

## Non-objectifs et refus

Website refuse délibérément de :

- Rédiger la vérité produit dans l'interface utilisateur (seulement à partir de Git examiné).
- Proxifier les applications produit ou affirmer qu'elles sont disponibles en se basant sur l'existence du dépôt.
- Accepter les mutations de contenu anonymes ou non examinées.
- Collecter des analytiques, des empreintes digitales, du suivi comportemental ou des données personnelles.
- Utiliser des CDN externes, des polices distantes ou du JavaScript tiers non contrôlé.
- Prévisualiser les brouillons non examinés sur les origines publiques.

N'importe lequel de ces refus empêche une construction candidate de se publier. La matrice de refus est complète et testable.

## Contrats

- Knowledge Object v1 — `ecosystem/schemas/knowledge-object.schema.json`
- Public Projection v1 — `contracts/schemas/public-projection.v1.schema.json`
- Correction Record v1 — `contracts/schemas/correction-record.v1.schema.json`
- API de lecture publique — `contracts/openapi/website.v1.yaml`

## Licence

Les licences sont déclarées par chemin via [`REUSE.toml`](REUSE.toml) :

- CC-BY-4.0 — la documentation (READMEs)
- EUPL-1.2 — les workflows sous `.github/` et la configuration du dépôt

Textes complets dans [`LICENSES/`](LICENSES). Copyright (c) 2026 Libre AI contributors. La politique de licence canonique est [libre-ai/libre-ai/LICENSING.md](https://github.com/libre-ai/libre-ai/blob/main/LICENSING.md).
