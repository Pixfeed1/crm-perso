// backend/utils/crawlAngles.js
//
// Traduit les signaux d'audit d'un résultat de crawl (booléens/int en base) en
// phrases CLAIRES orientées bénéfice client — la matière première que Claude
// choisira pour rédiger l'email de prospection. Partagé entre le crawl (promotion
// en prospect) et l'endpoint de rédaction côté fiche prospect.

// Version obsolète (plus maintenue) — même logique que le frontend.
function isObsoleteVersion(platform, version) {
  if (!version) return false;
  const m = String(version).match(/(\d+)(?:\.(\d+))?/); // majeure seule acceptée (« Drupal 7 »)
  if (!m) return false;
  const major = parseInt(m[1], 10), minor = parseInt(m[2] || '0', 10);
  const p = (platform || '').toLowerCase();
  if (p.includes('prestashop')) return major < 1 || (major === 1 && minor < 7);
  if (p.includes('woocommerce')) return major < 7;
  if (p.includes('wordpress')) return major < 6;
  if (p.includes('drupal')) return major <= 9;   // Drupal 7 (janv. 2025), 8 (2021), 9 (2023) : plus maintenus
  if (p.includes('spip')) return major < 4;      // SPIP 3.x : fin de maintenance 2023
  return false;
}

// Constats d'une ligne crawl_results, en deux listes :
// - verifies : mesuré sur le site (ou dans le DNS) à la date de l'analyse, citable tel quel ;
// - indices  : déduit, déclaratif ou cherché seulement sur l'accueil : à vérifier avant d'en parler,
//   formulé prudemment. Un indice n'est jamais présenté comme un fait (règle du document d'audit).
function anglesClasses(r) {
  const { descriptionAbsurde, nomMalOrthographie } = require('./prospectScore');
  const { versionPlateforme } = require('./plateforme');
  const annee = new Date().getFullYear();
  const v = [], ind = [];
  const shop = r.ecommerce_actif === true;
  const dateConnue = !!r.analyse_le;
  const status = Number(r.http_status);
  // Ce qui coûte des ventes d'abord.
  if (r.noindex === true) v.push("La page d'accueil demande à Google de ne pas l'indexer (balise noindex) : elle n'apparaît pas dans les résultats de recherche.");
  else if (r.robots_bloque === true) v.push("Le fichier robots.txt interdit à Google de parcourir le site : il n'apparaît pas dans les résultats de recherche.");
  if (status === 404 || status === 410 || status >= 500) {
    const quoi = status >= 500 ? `une erreur serveur (${status})` : 'une erreur 404 (page introuvable)';
    if (r.panne_confirmee === true) v.push(`La page d'accueil renvoie ${quoi}, constatée à deux reprises à au moins une heure d'écart.`);
    else ind.push(`La page d'accueil a renvoyé ${quoi} lors d'une seule mesure : peut-être passager, à confirmer.`);
  }
  if (r.ssl_expire_jours != null && r.ssl_expire_jours < 0) v.push("Le certificat de sécurité (HTTPS) a expiré : les visiteurs voient une alerte en arrivant sur le site.");
  else if (r.ssl_ok === false) v.push("Le site n'a pas de certificat de sécurité valide pour son adresse : le navigateur affiche un avertissement en HTTPS.");
  else if (r.ssl_expire_jours != null && r.ssl_expire_jours < 30) ind.push(`Le certificat de sécurité expire dans ${r.ssl_expire_jours} jours ; il est souvent renouvelé automatiquement.`);
  if (r.https_final === false) {
    if (dateConnue) v.push("Le site s'affiche en HTTP, sans le cadenas : le navigateur indique « Non sécurisé ».");
    else ind.push("Une ancienne analyse (sans date) a vu le site en HTTP : à réanalyser avant d'en parler.");
  }
  if (r.contenu_mixte === true) v.push("Des images ou scripts sont chargés en HTTP sur une page HTTPS : le cadenas disparaît sur ces pages.");
  if (r.mentions_404 === true) v.push("Le lien « mentions légales » mène à une page en erreur.");
  const nmo = nomMalOrthographie(r);
  if (nmo) v.push(`Le titre du site écrit « ${nmo.titre} » alors que l'entreprise s'appelle « ${nmo.attendu} » (identité certaine).`);
  if (descriptionAbsurde(r)) v.push(`Dans Google, le texte affiché sous le nom du site est « ${String(r.meta_desc_txt).slice(0, 90)} » : ce n'est pas une description.`);
  if (/^(prestashop|wordpress|woocommerce|accueil|home|bienvenue|welcome|untitled|sans titre|mon site|my site|site en construction|coming soon|index|boutique en ligne|ma boutique|shop)$/i.test(String(r.title || '').trim())) v.push(`Le titre de la page d'accueil est resté celui de l'installation (« ${String(r.title).trim()} »).`);
  if (r.mobile_ok === false) v.push("La page d'accueil n'a pas de réglage d'affichage mobile (balise viewport absente) : elle s'affiche en petit sur téléphone.");
  if (r.urls_reecrites === false) v.push("Les adresses des pages sont du type index.php?id_category=102, sans aucun mot.");
  if (r.spf === false) v.push("Le domaine n'a pas d'enregistrement SPF : les emails envoyés depuis son adresse risquent de finir en spam.");
  if (r.dmarc === false) v.push("Le domaine n'a pas d'enregistrement DMARC.");
  if (r.copyright_annee && r.copyright_annee < annee - 1) v.push(`Le pied de page affiche encore © ${r.copyright_annee}.`);
  // Indices : déduits, déclaratifs, ou cherchés sur l'accueil seulement.
  if (r.sitemap === 'vide') ind.push("Le fichier sitemap.xml lu semble vide ; un autre sitemap peut exister à une autre adresse : à vérifier.");
  if (r.mentions_legales === false) ind.push("Aucun lien vers des mentions légales n'a été trouvé sur la page d'accueil : la page peut exister ailleurs.");
  if (r.cgv === false && shop) ind.push("Aucune condition générale de vente n'a été trouvée depuis l'accueil : à vérifier dans le menu ou le tunnel de commande.");
  if (r.retractation === false && shop) ind.push("Le droit de rétractation n'a pas été trouvé (accueil et CGV) : à vérifier.");
  if (r.rgpd_confidentialite === false) ind.push("Aucune politique de confidentialité repérée sur l'accueil.");
  if (r.cookie_banner === false) ind.push("Aucun bandeau de consentement aux cookies repéré (il peut se charger après coup).");
  if (r.analytics === false) ind.push("Aucun outil de mesure d'audience repéré.");
  if (r.meta_desc === false || r.h1_present === false) ind.push("Description ou titre principal (H1) absent de la page d'accueil (SEO de base).");
  if (isObsoleteVersion(r.platform, r.platform_version)) {
    const ver = versionPlateforme(r);
    if (ver.niveau === 'confirmée') v.push(`Le site déclare tourner sur ${ver.version}, une version que son éditeur ne maintient plus.`);
    else ind.push(`Les fichiers du site ressemblent à ceux de ${ver.version || r.platform} (version déduite, pas déclarée) : à confirmer avant d'en parler.`);
  }
  const eolMatch = /PHP\s*(\d+\.\d+)/i.exec(String(r.serveur_php || ''));
  const PHP_EOL = { '5.6': '2018', '7.0': '2019', '7.1': '2019', '7.2': '2020', '7.3': '2021', '7.4': '2022', '8.0': '2023', '8.1': '2025' };
  if (eolMatch && (PHP_EOL[eolMatch[1]] || parseFloat(eolMatch[1]) < 5.6)) ind.push(`D'après l'entête que renvoie le serveur, le site tournerait sur PHP ${eolMatch[1]} (plus de correctifs depuis ${PHP_EOL[eolMatch[1]] || '2018'}) : déclaratif, à confirmer avec l'hébergeur.`);
  else if (r.serveur_php) ind.push(`Le serveur annonce sa version (${r.serveur_php}) dans ses entêtes.`);
  return { verifies: v, indices: ind };
}

// Liste unique (compatibilité) : constats vérifiés, puis indices préfixés « À vérifier : ».
function problemesLisibles(r) {
  const { verifies, indices } = anglesClasses(r);
  return [...verifies, ...indices.map((x) => `À vérifier : ${x}`)];
}

module.exports = { isObsoleteVersion, problemesLisibles, anglesClasses };
