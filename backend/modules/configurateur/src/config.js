/* Réglages de l'agent du configurateur.
   Tout ce qui est secret vient de l'environnement (backend/.env du CRM), jamais du code. */
const path = require("path");

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== "" ? process.env[k] : d);

module.exports = {
  // Secrets et chemins (backend/.env)
  anthropicKey: env("CONFIGURATEUR_ANTHROPIC_API_KEY"),
  awinFeedListUrl: env("AWIN_FEEDLIST_URL"),               // l'adresse « …/feedList » du compte 614905
  amazonTag: env("AMAZON_PARTNER_TAG"),                    // identifiant partenaire, ex. « xxxx-21 »
  dossierPublication: env("CONFIGURATEUR_DOSSIER", path.join(process.env.HOME || "", "public_html/wp-content/uploads/configurateur")),
  cheminWordPress: env("CONFIGURATEUR_WP_PATH", path.join(process.env.HOME || "", "public_html")),
  idPageWordPress: env("CONFIGURATEUR_WP_PAGE_ID"),         // facultatif : sans lui, les pages au modèle « Configurateur PC » sont retrouvées seules
  mailValidation: env("CONFIGURATEUR_MAIL_VALIDATION"),     // adresse où partent la proposition mensuelle et les alertes
  urlEcranValidation: env("CONFIGURATEUR_URL_VALIDATION", "https://crm.pixfeed.net/configurateur"),

  // Modèles d'IA : léger pour les petits textes hebdomadaires, plus fort pour la sélection mensuelle
  modeleHebdo: env("CONFIGURATEUR_MODELE_HEBDO", "claude-haiku-5-5"),
  modeleMensuel: env("CONFIGURATEUR_MODELE_MENSUEL", "claude-sonnet-5-5"),
  // Sites que la recherche web de l'agent a le droit de consulter (restriction par appel, pas pour toute l'organisation)
  domainesRecherche: ["opendata.blender.org", "pugetsystems.com", "nvidia.com", "amd.com", "intel.com", "techpowerup.com",
    "materiel.net", "grosbill.com", "alternate.fr", "rueducommerce.fr", "cybertek.fr", "cdiscount.com", "fnac.com", "amazon.fr"],

  // Flux Awin retenus (numéros de flux de la liste feedList). On ajoute les spécialistes quand ils acceptent.
  fluxAwin: [
    { id: "44863", marchand: "cdiscount", nom: "Cdiscount", note: "Offre Propre : vendu par Cdiscount" },
    { id: "88636", marchand: "cdiscount", nom: "Cdiscount", note: "Flux High-Tech" },
    { id: "116908", marchand: "fnac", nom: "Fnac", note: "Autres catégories, vendu par la Fnac" }
  ],

  // Blender Open Data
  blender: {
    base: "https://opendata.blender.org/benchmarks/query/",
    version: env("CONFIGURATEUR_BLENDER_VERSION", "4.5.0"),
    typesCalcul: ["CPU", "OPTIX", "HIP", "ONEAPI"],
    minTests: 20 // en dessous, un score médian n'est pas fiable : il est ignoré
  },

  // Règles validées par Marc (29/10/2026)
  budget: { min: 500, max: 5000, pas: 100 },
  alternative: { economieMinPct: 10, economieMinEuros: 100, perteMaxPct: 5 },
  suivant: { gainMinPct: 5, fenetreEuros: 600 },
  budgetsConseilles: { coude: 0.8, ecartMinPlafond: 300 },
  alimentation: { marge: 1.1, resteDuPc: 100 },
  controles: { variationPrixMaxPct: 30, tailleMaxKo: 400, prixPlancherPct: 40 },   // offre sous 40 % du prix habituel : produit mal reconnu, écartée
  publicationsGardees: 30,   // fichiers exacts gardés en base, pour restaurer sans recalculer
  fraicheurFluxHeures: 48,   // un flux marchand plus ancien est écarté (Awin met à jour une fois par jour)

  systeme: { nom: "Windows 11 Famille", prix: 145, source: "Microsoft Store", releve_le: "2026-10-29", gratuit_suffit: ["figma", "courant"] },

  // Calendrier (heure de Paris)
  cron: {
    nuit: "30 3 * * *",       // relevé des prix des composants affichés, republication si besoin
    lundi: "0 6 * * 1",       // relevé complet, recalcul, textes « pourquoi » si un modèle a changé
    mois: "0 7 1 * *"         // nouvelles mesures et proposition de sélection à valider
  },
  fuseau: "Europe/Paris"
};
