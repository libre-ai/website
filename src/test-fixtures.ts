export const validProjection = {
  schema_version: "libre-ai.public-brand.v1",
  generated_from: ["brand/README.md", "brand/README.en.md", "brand/proof-matrix.md"],
  copy: {
    fr: {
      tension: "Les plateformes propriétaires vous louent le produit.",
      promise: "Possédez la fabrique.",
      explanation:
        "Libre AI réunit les logiciels, la méthode et les preuves pour construire des outils d'IA que vous pouvez vérifier, modifier et déployer où vous le décidez.",
      qualification: "Ouverts, souverains et explicables.",
      reasonToBelieve: "Conçus dans une fabrique ouverte où la preuve fait partie du produit.",
      primaryCta: "Prenez les clés.",
      secondaryCta: "Voir les preuves.",
    },
    en: {
      tension: "Proprietary platforms rent you the product.",
      promise: "Own the factory.",
      explanation:
        "Libre AI brings together the software, method, and evidence to build AI tools you can inspect, modify, and deploy where you choose.",
      qualification: "Open, sovereign, and explainable.",
      reasonToBelieve: "Built in an open factory where evidence is part of the product.",
      primaryCta: "Take the keys.",
      secondaryCta: "See the evidence.",
    },
  },
  products: [
    {
      repository: "libre-ai/notebook",
      publicName: "Libre AI Notebook",
    },
  ],
  proofs: [
    {
      claim: "Logiciels ouverts",
      mechanism: "Code et licences publics.",
      source: "https://github.com/libre-ai",
      verifiedOn: "2026-09-09",
      limitation: "Un dépôt public ne prouve pas la disponibilité.",
    },
    {
      claim: "Souveraineté",
      mechanism: "Choix d'hébergement et mécanismes de réversibilité publiés.",
      source: "https://github.com/libre-ai/governance",
      verifiedOn: "2026-09-09",
      limitation: "Aucun déploiement non prouvé n'est présenté comme actif.",
    },
    {
      claim: "Explicabilité",
      mechanism: "Décisions, états et limites reliés à des sources versionnées.",
      source: "https://github.com/libre-ai/governance",
      verifiedOn: "2026-09-09",
      limitation: "Toute sortie de modèle n'est pas causalement explicable.",
    },
  ],
};
