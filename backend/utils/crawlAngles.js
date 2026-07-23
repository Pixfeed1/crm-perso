// backend/utils/crawlAngles.js
//
// Traduit les signaux d'audit d'un résultat de crawl (booléens/int en base) en
// phrases CLAIRES orientées bénéfice client — la matière première que Claude
// choisira pour rédiger l'email de prospection. Partagé entre le crawl (promotion
// en prospect) et l'endpoint de rédaction côté fiche prospect.

// Version obsolète (plus maintenue) — même logique que le frontend.
function isObsoleteVersion(platform, version) {
  if (!version) return false;
  const m = String(version).match(/(\d+)\.(\d+)/);
  if (!m) return false;
  const major = parseInt(m[1], 10), minor = parseInt(m[2], 10);
  const p = (platform || '').toLowerCase();
  if (p.includes('prestashop')) return major < 1 || (major === 1 && minor < 7);
  if (p.includes('woocommerce')) return major < 7;
  if (p.includes('wordpress')) return major < 6;
  return false;
}

// Phrases lisibles à partir d'une ligne crawl_results.
function problemesLisibles(r) {
  const annee = new Date().getFullYear();
  const out = [];
  if (r.mentions_legales === false) out.push("Le site n'a pas de page de mentions légales, alors que c'est une obligation légale en France.");
  if (r.mobile_ok === false) out.push("Le site n'est pas adapté aux mobiles : il s'affiche mal sur téléphone (la majorité des visiteurs aujourd'hui).");
  if (r.ssl_expire_jours != null && r.ssl_expire_jours < 30) {
    out.push(r.ssl_expire_jours < 0
      ? "Le certificat de sécurité (HTTPS) a expiré : les visiteurs voient une alerte rouge en arrivant sur le site."
      : `Le certificat de sécurité (HTTPS) expire dans ${r.ssl_expire_jours} jours ; ensuite les visiteurs verront une alerte de sécurité.`);
  } else if (r.ssl_ok === false) {
    out.push("Le site n'a pas de certificat de sécurité valide (le cadenas HTTPS), ce qui fait fuir les visiteurs et pénalise le référencement Google.");
  }
  if (r.spf === false) out.push("Le domaine n'a pas de configuration SPF : les emails envoyés depuis cette adresse risquent d'atterrir dans les spams des clients.");
  if (r.dmarc === false) out.push("Le domaine n'est pas protégé par DMARC : il peut être usurpé pour envoyer de faux emails en son nom.");
  if (r.rgpd_confidentialite === false) out.push("Il manque une politique de confidentialité, obligatoire avec le RGPD.");
  if (r.cookie_banner === false) out.push("Il n'y a pas de bandeau de consentement aux cookies (demandé par la CNIL).");
  if (isObsoleteVersion(r.platform, r.platform_version)) out.push(`Le site tourne sur une version de ${r.platform} qui n'est plus maintenue : c'est un risque de sécurité et de bugs.`);
  if (r.meta_desc === false || r.h1_present === false) out.push("Des éléments SEO de base manquent (description ou titre principal), ce qui limite la visibilité sur Google.");
  if (r.analytics === false) out.push("Aucun outil de mesure d'audience n'est installé : impossible de savoir combien de visiteurs viennent, ni d'où.");
  if (r.serveur_php) out.push(`La version du serveur (${r.serveur_php}) est visible publiquement et n'est plus à jour (surface d'attaque connue).`);
  if (r.copyright_annee && r.copyright_annee < annee - 1) out.push(`Le pied de page affiche encore © ${r.copyright_annee}, ce qui donne l'impression d'un site peu suivi.`);
  return out;
}

module.exports = { isObsoleteVersion, problemesLisibles };
