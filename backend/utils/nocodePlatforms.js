// backend/utils/nocodePlatforms.js
//
// Plateformes no-code / SaaS fermées (sites clé-en-main) sans intérêt commercial pour la
// prospection : rien à développer dessus. Détectées à l'ingestion des résultats de crawl
// et marquées is_nocode=TRUE (masquées par défaut dans l'onglet Crawl).
//
// ÉDITABLE : ajoute/retire une plateforme ici (label + patterns). Les "patterns" sont des
// sous-chaînes (insensibles à la casse) recherchées dans : platform + signals + final_url
// + title + domain. Vise des tokens spécifiques (domaines, CDN) pour éviter les faux positifs.
const NOCODE_PLATFORMS = [
  { label: 'Wix', patterns: ['wix.com', 'wixsite', 'wixstatic', 'parastorage'] },
  { label: 'Squarespace', patterns: ['squarespace', 'sqsp.net'] },
  { label: 'Webador', patterns: ['webador'] },
  { label: 'Jimdo', patterns: ['jimdo'] },
  { label: 'Weebly', patterns: ['weebly'] },
  { label: 'e-monsite', patterns: ['e-monsite', 'emonsite'] },
  { label: 'SiteW', patterns: ['sitew.com', 'sitew.fr'] },
  { label: 'Site123', patterns: ['site123'] },
  { label: 'Strikingly', patterns: ['strikingly'] },
  { label: 'Google Sites', patterns: ['sites.google.com'] },
  { label: 'Webflow', patterns: ['webflow.io', 'webflow.com'] }
];

// Détecte si un résultat de crawl est une plateforme no-code.
// Renvoie { isNoCode, label, matched }.
function detectNoCode(fields = {}) {
  const { platform, signals, final_url, title, domain } = fields;
  const hay = [platform, signals, final_url, title, domain]
    .map((x) => (x || '').toString().toLowerCase())
    .join(' | ');
  for (const p of NOCODE_PLATFORMS) {
    const matched = p.patterns.find((pat) => hay.includes(pat));
    if (matched) return { isNoCode: true, label: p.label, matched };
  }
  return { isNoCode: false, label: null, matched: null };
}

// Tous les patterns à plat (pour un backfill SQL ILIKE des résultats déjà en base).
function allPatterns() {
  return NOCODE_PLATFORMS.flatMap((p) => p.patterns);
}

module.exports = { NOCODE_PLATFORMS, detectNoCode, allPatterns };
