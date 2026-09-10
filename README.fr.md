[English](README.md) · **Français**

> [!NOTE]
> **Application active, régularisée par signature propriétaire.** Ce dépôt s'est activé de fait — sept pull requests mergées avant tout acte propriétaire — et [ADR-0020](https://github.com/libre-ai/governance/blob/main/docs/adr/0020-general-activation-and-hub-dismantling.md) §2.4 régularise cette activation nominativement : la signature de l'ADR _est_ l'acte. Le build de production rend désormais la marque examinée, ses preuves, la flotte complète, les comparaisons datées et un lien immuable vers le starter exécutable. Il n'est pas encore déployé sur une URL publique, et le CDC complet (`docs/apps/website.md`) reste en attente.

# Website

**Projection publique, citable, du savoir, des produits et des preuves de Libre AI, tous examinés.** Un site statique, sans suivi, qui n'accepte que des entrées canoniques examinées. Les lecteurs suivent des URL stables vers l'état actuel du produit et les dates de source ; les contributeurs proposent des améliorations via GitHub ; les crawlers reçoivent des métadonnées lisibles par machine pour l'indexation sans empreinte digitale.

Le cas canonique auquel il répond : _« donner au public un accès en lecture seule à la vérité produit actuelle, complète avec sources, dates d'examen et liens de preuve, sans analytique ni données personnelles. »_

## Ce qui le distingue

- **Déterministe et statique.** Des entrées épinglées par SHA produisent un artefact complet de cinq fichiers. Les lecteurs ne frappent aucun runtime applicatif — la surface est reproductible et auditable, jamais l'opinion d'un modèle.
- **Examiné seulement.** Seul le contenu sélectionné et approuvé de Git atteint la publication. Aucun brouillon non examiné sur les origines publiques ; aucune vérité rédigée par un CMS.
- **Sans suivi et souverain.** Aucune analytique, empreinte digitale, cookie comportemental, police distante ou JavaScript client. La recherche n'est pas encore livrée plutôt que déléguée à un service externe.
- **Citable et sourcé.** Les preuves de marque exposent leur source, leur date de vérification et leur limite ; l'état de la flotte vient de la projection Governance épinglée.
- **Accessible par conception.** Le HTML sémantique fonctionne sans JavaScript. Navigation clavier, reflow étroit, mouvement réduit, couleurs forcées et trois moteurs de navigateur sont testés.

## État — spécifié, première projection construite et chaîne verte en CI

La phase de première projection de Website (γ 3.6) est **acceptée** : le tableau de la page d'accueil (généré depuis la projection fleet-status épinglée, jamais déclaré à la main) et les huit comparaisons datées se construisent et passent en CI dans ce dépôt — voir `project.v1.yaml` et la preuve d'exécution qu'elle cite. Le CDC complet (parcours comprendre, vérifier, contribuer, découvrir) reste en attente, et rien n'est encore déployé sur une URL publique :

| Fondation                                                                   | État                             | Preuve                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Suite de contrats** — Knowledge Object, Public Projection, Feeds          | ✅ verrouillé                    | CDC approuvé et fusionné ; schémas canoniques sous `contracts/schemas/` dans [`libre-ai/contracts`](https://github.com/libre-ai/contracts) ([PR #209 du hub](https://github.com/libre-ai/libre-ai/pull/209), historique) |
| **Build de production de marque** — mot-symbole, preuves, flotte, CTA       | ✅ construit, gardé             | `src/build.ts` ; entrées Governance/UI épinglées par SHA ; actif figuratif forcé à absent                                                                                                                                |
| **Comparaisons datées** — sourcées et datées                                | ✅ construites, gardées          | `src/comparisons.ts` ; incluses dans le même artefact de production complet                                                                                                                                               |
| **Parcours CDC complets** — comprendre, vérifier, contribuer, découvrir     | ⏳ en attente                    | [`docs/apps/website.md`](docs/apps/website.md) ; `project.v1.yaml` phase CDC, critère `cdc-journeys`, en attente                                                                                                         |
| **Déploiement public** — une URL vivante accessible aux lecteurs            | ⏳ en attente                    | `dist/` se construit et est vérifié en CI ; pas encore publié nulle part                                                                                                                                                 |
| **Gates navigateur et accessibilité** — Chromium/Firefox/WebKit             | ✅ gate de production            | Playwright construit et teste `dist/` dans six modes navigateur/accessibilité ; la CI bloque sur échec                                                                                                                     |

Ce dépôt est actif (ADR-0020 §2.4), ni réservé ni archivé ; le README est tenu à jour, et les pull requests atterrissent directement ici (les issues sont désactivées). **Aucune cible de référence** — ceci est la projection publique propre de l'organisation, non un objectif de parité contre le site d'un autre fournisseur. La mesure du succès est la projection complète, honnête et sans suivi du savoir examiné.

## Ce qu'il projette

Website consomme :

- **Corpus de la flotte** — objets de savoir examinés sous `ecosystem/` dans [`libre-ai/governance`](https://github.com/libre-ai/governance) et `contracts/` dans [`libre-ai/contracts`](https://github.com/libre-ai/contracts).
- **Projections de produit** — capacité et état pour chaque produit de l'inventaire (`docs/apps/*.md`).
- **Preuve de forge** — auteur, dates d'examen, états d'approbation et enregistrements de corrections de Git.

Le build de production actuel publie :

- **Trois routes statiques** — page d'accueil, comparaisons datées et guide de marque gardé.
- **Actifs de style locaux** — tokens et styles UI épinglés, plus la mise en page spécifique au site.
- **Passage à l'exécutable** — le CTA principal pointe vers un quick-start immuable et précise qu'il s'agit d'une démonstration, pas d'une application prête pour la production.

Recherche, sitemap, feeds et parcours restants comprendre/vérifier/contribuer/découvrir appartiennent au CDC complet encore en attente. Ils ne sont pas présentés comme des sorties actuelles.

## Comment ça fonctionne

1. **Charger** — lire les projections de marque/flotte Governance et les sources UI depuis des git-dépendances épinglées par SHA.
2. **Valider** — refuser les projections mal formées, actifs distants et HTML/SVG exécutable ; forcer l'actif figuratif non approuvé à absent.
3. **Rendre** — produire trois fichiers HTML et deux fichiers CSS locaux, sans JavaScript client.
4. **Remplacer** — préparer l'artefact complet à côté de `dist/`, puis le renommer atomiquement en préservant le répertoire précédent sur échec.
5. **Qualifier** — reconstruire, lancer les gates unitaires et navigateur, puis examiner le visuel généré avant publication.

## Architecture — projection à partir de contrats interopérables

Website est une couche de projection transversale, non un moteur de domaine. Elle consomme les contrats et produit les surfaces publiques à partir de sélections examinées.

| Composant                                         | Rôle                                             | Interface exposée / consommée                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Chargeur d'entrées épinglées**                  | Frontière des entrées canoniques                 | Lit les révisions exactes des git-dépendances Governance et UI                                                                         |
| **Parseurs stricts et gardes de sécurité**        | Frontière de refus                               | Valident les projections et refusent toute sortie distante ou exécutable                                                               |
| **Templates statiques Bun**                       | Surface de publication accessible                | Rendent du HTML/CSS déterministe sans runtime client                                                                                    |
| **Écrivain transactionnel**                       | Candidat → artefact local complet                | Prépare tous les fichiers, supprime les actifs périmés et restaure l'artefact antérieur sur échec                                      |
| **Gates unitaires et Playwright**                 | Preuve de release                                | Vérifient le comportement puis Chromium, Firefox, WebKit, sans JS, mouvement réduit et couleurs forcées                                |

L'hôte qui autorise passe les octets d'instantané canoniques au moteur de rendu ; le moteur de rendu ne détient aucun jeton et n'atteint aucun réseau externe. Tout consommateur qui parle les mêmes contrats peut projeter le même instantané.

## Où se déroule le travail

Le développement actif est dans ce dépôt :

- `src/build.ts`, `src/comparisons.ts` — le modèle statique et le compilateur de comparaisons.
- `dist/` — la sortie générée complète (`index.html`, `comparaisons.html`, `marque.html` et deux actifs CSS).
- `docs/apps/website.md` — le cahier des charges complet du produit, migré du hub (désormais archivé).
- `project.v1.yaml` — la fiche d'état qui fait autorité ; la section générée ci-dessous n'en diverge jamais.

Les contrats restent canoniques dans [`libre-ai/contracts`](https://github.com/libre-ai/contracts) (Knowledge Object, Public Projection, Correction Record), et la projection fleet-status est épinglée depuis [`libre-ai/governance`](https://github.com/libre-ai/governance) — ce dépôt consomme les deux, il ne les duplique pas.

Pour suivre l'avancement ou contribuer, ouvrez des pull requests directement dans `libre-ai/website` (les issues sont désactivées).

Le gate de pull request vérifie les commits auteurs, mais il ne peut pas inspecter le commit
d'intégration que la forge créera ensuite. Lorsqu'une pull request est intégrée par merge commit, le
corps du message de merge doit donc porter un trailer valide `Signed-off-by: Nom <email>` ; le gate
post-merge vérifie ce commit supplémentaire et refuse son absence.

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

- Les contrats de produit et de parcours lecteur restent spécifiés dans [`docs/apps/website.md`](docs/apps/website.md).
- Le moteur actuel consomme les projections public-brand et fleet-status épinglées depuis Governance.
- Recherche, feeds et API publique restent en attente ; ce dépôt ne les expose pas encore.

## Licence

Les licences sont déclarées par chemin via [`REUSE.toml`](REUSE.toml) :

- CC-BY-4.0 — la documentation (READMEs)
- EUPL-1.2 — les workflows sous `.github/` et la configuration du dépôt

Textes complets dans [`LICENSES/`](LICENSES). Copyright (c) 2026 Libre AI contributors. La politique de licence canonique est [libre-ai/libre-ai/LICENSING.md](https://github.com/libre-ai/libre-ai/blob/main/LICENSING.md).
