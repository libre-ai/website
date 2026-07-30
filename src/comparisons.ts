/**
 * Dated comparisons (design §6.7): factual, sourced, no caricature. Each
 * `what` restates what the compared project announces on its own site (the
 * linked source); `difference` states the Libre AI approach without claiming
 * superiority. Update VERIFIED_ON whenever a row is re-checked.
 */
export const VERIFIED_ON = "2026-07-30";

export interface Comparison {
  readonly name: string;
  readonly url: string;
  readonly what: string;
  readonly difference: string;
}

export const COMPARISONS: readonly Comparison[] = [
  {
    name: "pi.dev",
    url: "https://pi.dev",
    what: "Un agent de code et un harnais d'ingénierie pilotés par IA.",
    difference:
      "Polaris gouverne des flottes d'agents sous portes de contrôle humaines, avec preuves datées versionnées dans la forge.",
  },
  {
    name: "OpenCode",
    url: "https://opencode.ai",
    what: "Un agent de code open source utilisable dans le terminal.",
    difference:
      "La méthode Libre AI publie ses plans, refus et verdicts de gates — la fabrique elle-même est le premier produit documenté.",
  },
  {
    name: "Dust",
    url: "https://dust.tt",
    what: "Une plateforme SaaS pour construire des assistants IA d'entreprise connectés aux données internes.",
    difference:
      "Libre AI vise des produits souverains auto-hébergeables, sans dépendance à un hyperscaler américain pour l'exécution ou les données.",
  },
  {
    name: "Onyx",
    url: "https://onyx.app",
    what: "Une recherche d'entreprise et un chat IA open source connectés aux outils internes.",
    difference:
      "Notebook garde le savoir local par défaut et rend chaque export de contexte explicite et choisi.",
  },
  {
    name: "Dify",
    url: "https://dify.ai",
    what: "Une plateforme open source pour développer et opérer des applications LLM.",
    difference:
      "Libre AI livre des produits finis dont l'état est calculé depuis des fiches versionnées, pas une plateforme générique.",
  },
  {
    name: "Flowise / Langflow",
    url: "https://flowiseai.com",
    what: "Des constructeurs visuels open source de flux d'agents et d'applications LLM.",
    difference:
      "L'orchestration Libre AI est du code revu sous protocole K4, avec worktrees auto-nettoyés et preuves rejouables — pas de flux dessinés.",
  },
  {
    name: "Temporal",
    url: "https://temporal.io",
    what: "Un moteur d'exécution durable pour orchestrer des workflows fiables.",
    difference:
      "Polaris orchestre des agents et leurs preuves de revue ; la durabilité vient de git et des gates, pas d'un moteur d'exécution dédié.",
  },
  {
    name: "Langfuse",
    url: "https://langfuse.com",
    what: "Une plateforme open source d'observabilité et d'évaluation pour applications LLM.",
    difference:
      "L'observabilité Libre AI est l'évidence versionnée : gate-acceptance-log, index de migration et fiches d'état — lisibles sans plateforme.",
  },
];
