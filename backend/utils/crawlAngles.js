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
  const shop = r.site_type === 'commerce' || r.ecommerce_actif === true || ['PrestaShop', 'WooCommerce', 'Shopify'].includes(r.platform);
  // Les arguments les plus forts d'abord : ce qui coûte des ventes ou expose à une sanction.
  if (r.noindex === true) out.push("La page d'accueil demande à Google de ne PAS l'indexer (balise noindex) : la boutique est invisible dans les résultats de recherche, personne ne peut la trouver.");
  else if (r.robots_bloque === true) out.push("Le fichier robots.txt interdit à Google de parcourir le site : la boutique n'apparaît pas dans les résultats de recherche.");
  if (Number(r.http_status) >= 500) out.push(`Le site renvoie une erreur serveur (${r.http_status}) : les visiteurs tombent sur une page d'erreur au lieu de la boutique.`);
  if (r.cgv === false && shop) out.push("Aucune condition générale de vente n'est proposée, alors qu'elles sont obligatoires pour vendre en ligne (Code de la consommation) : en cas de litige ou de contrôle, la boutique est en faute.");
  if (r.retractation === false && shop) out.push("Le droit de rétractation de 14 jours n'est pas mentionné : c'est une obligation d'information, et son absence prolonge le délai de rétractation à 12 mois.");
  if (r.contenu_mixte === true) out.push("Des images ou scripts sont chargés en HTTP sur une page HTTPS : le cadenas disparaît et le navigateur bloque une partie de la page.");
  if (r.mentions_404 === true) out.push("Le lien « mentions légales » mène à une page en erreur : la mention existe dans le menu mais pas la page.");
  if (r.mentions_legales === false) out.push("Le site n'a pas de page de mentions légales, alors que c'est une obligation légale en France.");
  if (r.mobile_ok === false) out.push("Le site n'est pas adapté aux mobiles : il s'affiche mal sur téléphone (la majorité des visiteurs aujourd'hui).");
  if (r.ssl_expire_jours != null && r.ssl_expire_jours < 30) {
    out.push(r.ssl_expire_jours < 0
      ? "Le certificat de sécurité (HTTPS) a expiré : les visiteurs voient une alerte rouge en arrivant sur le site."
      : `Le certificat de sécurité (HTTPS) expire dans ${r.ssl_expire_jours} jours ; ensuite les visiteurs verront une alerte de sécurité.`);
  } else if (r.ssl_ok === false) {
    out.push("Le site n'a pas de certificat de sécurité valide (le cadenas HTTPS), ce qui fait fuir les visiteurs et pénalise le référencement Google.");
  }
  if (r.https_final === false) out.push("Le site s'affiche en HTTP, sans le cadenas : le navigateur indique « Non sécurisé » aux visiteurs, ce qui fait fuir sur une boutique.");
  if (r.spf === false) out.push("Le domaine n'a pas de configuration SPF : les emails envoyés depuis cette adresse risquent d'atterrir dans les spams des clients.");
  if (r.dmarc === false) out.push("Le domaine n'est pas protégé par DMARC : il peut être usurpé pour envoyer de faux emails en son nom.");
  if (r.rgpd_confidentialite === false) out.push("Il manque une politique de confidentialité, obligatoire avec le RGPD.");
  if (r.cookie_banner === false) out.push("Il n'y a pas de bandeau de consentement aux cookies (demandé par la CNIL).");
  if (isObsoleteVersion(r.platform, r.platform_version)) out.push(`Le site tourne sur une version de ${r.platform} qui n'est plus maintenue : c'est un risque de sécurité et de bugs.`);
  if (r.meta_desc === false || r.h1_present === false) out.push("Des éléments SEO de base manquent (description ou titre principal), ce qui limite la visibilité sur Google.");
  if (r.analytics === false) out.push("Aucun outil de mesure d'audience n'est installé : impossible de savoir combien de visiteurs viennent, ni d'où.");
  const eolMatch = /PHP\s*(\d+\.\d+)/i.exec(String(r.serveur_php || ''));
  const PHP_EOL = { '5.6': '2018', '7.0': '2019', '7.1': '2019', '7.2': '2020', '7.3': '2021', '7.4': '2022', '8.0': '2023', '8.1': '2025' };
  if (eolMatch && (PHP_EOL[eolMatch[1]] || parseFloat(eolMatch[1]) < 5.6)) out.push(`Le site tourne sur PHP ${eolMatch[1]}, qui ne reçoit plus aucun correctif de sécurité depuis ${PHP_EOL[eolMatch[1]] || '2018'} : une faille découverte aujourd'hui ne sera jamais corrigée.`);
  else if (r.serveur_php) out.push(`La version du serveur (${r.serveur_php}) est visible publiquement et n'est plus à jour (surface d'attaque connue).`);
  if (Number(r.http_status) >= 500) out.push(`Le site renvoie une erreur serveur (${r.http_status}) : les visiteurs tombent sur une page d'erreur au lieu de la boutique.`);
  if (/^(prestashop|wordpress|woocommerce|accueil|home|bienvenue|welcome|untitled|sans titre|mon site|my site|site en construction|coming soon|index|boutique en ligne|ma boutique|shop)$/i.test(String(r.title || '').trim())) out.push("Le titre de la page d'accueil est resté celui de l'installation (« " + String(r.title).trim() + " ») : invisible sur Google et peu rassurant pour un client.");
  if (r.copyright_annee && r.copyright_annee < annee - 1) out.push(`Le pied de page affiche encore © ${r.copyright_annee}, ce qui donne l'impression d'un site peu suivi.`);
  return out;
}

module.exports = { isObsoleteVersion, problemesLisibles };
