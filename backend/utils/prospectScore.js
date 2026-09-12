// backend/utils/prospectScore.js
//
// Qualification d'un résultat de crawl, CÔTÉ SERVEUR (source de vérité, persistée) :
//  - auditFlags : problèmes détectés gratuitement (clé courte + poids) ;
//  - prospectScore : priorité 0-100 (joignable, angle de vente, budget) ;
//  - disqualifyReason : structures hors cible (parké, no-code, hors FR, asso, agence,
//    antibot) — règle d'or : en cas de doute, on garde.
// Le panneau Crawl (frontend/src/components/crawl/CrawlPanel.jsx) garde une copie
// d'affichage ; ici vit la version enregistrée dans crawl_results.score et leads.score.

const { isObsoleteVersion } = require('./crawlAngles');

const NOCODE_NAMES = ['Wix', 'Squarespace', 'Webador', 'Jimdo', 'Weebly', 'e-monsite',
  'SiteW', 'Site123', 'Strikingly', 'Webflow', 'Google Sites', 'Systeme.io', 'GoDaddy Website Builder'];

const ASSO_RE = /(association|loi 1901|but non lucratif|non[- ]?profit|refuge|sanctuary|sanctuaire|fondation|foundation|b[ée]n[ée]vol|paroisse|[ée]glise|dioc[èe]se|\bmairie\b|commune de|coll[èe]ge|lyc[ée]e|club sportif|amicale|faire un don|faites un don|helloasso)/i;
const COLLECTIVITE_RE = /(\bmairie\b|commune de|conseil municipal|ville de |communaut[ée] de communes|\.gouv\.fr|mairie-|-mairie|ville-)/i;
const AGENCE_RE = /(agence web|agence digitale|agence de communication|cr[ée]ation de sites?|web agency|studio (web|digital)|nos r[ée]alisations|webmaster freelance|d[ée]veloppeur web freelance|agence seo|acheter du seo|r[ée]f[ée]rencement (naturel|internet|google)|netlinking|backlinks|consultant seo)/i;

// Problèmes d'audit : clé stable (persistée dans leads.angles), libellé court, poids.
function auditFlags(r) {
  const f = [];
  if (r.mentions_legales === false) f.push({ key: 'mentions_legales', label: 'sans mentions légales', poids: 15 });
  if (r.mobile_ok === false) f.push({ key: 'mobile', label: 'non responsive', poids: 15 });
  if (r.ssl_expire_jours != null && r.ssl_expire_jours < 30) {
    f.push({ key: r.ssl_expire_jours < 0 ? 'ssl_expire' : 'ssl_bientot', label: r.ssl_expire_jours < 0 ? 'SSL expiré' : `SSL expire ${r.ssl_expire_jours} j`, poids: 15 });
  } else if (r.ssl_ok === false) {
    f.push({ key: 'ssl_invalide', label: 'SSL invalide', poids: 15 });
  }
  // Certificat présent mais site servi en HTTP : le visiteur voit « Non sécurisé ».
  if (r.https_final === false) f.push({ key: 'http_non_securise', label: 'servi en HTTP', poids: 15 });
  if (isObsoleteVersion(r.platform, r.platform_version)) f.push({ key: 'version_obsolete', label: 'version obsolète', poids: 15 });
  if (r.spf === false) f.push({ key: 'spf', label: 'sans SPF', poids: 8 });
  if (r.dmarc === false) f.push({ key: 'dmarc', label: 'sans DMARC', poids: 5 });
  if (r.rgpd_confidentialite === false) f.push({ key: 'rgpd', label: 'sans confidentialité', poids: 5 });
  if (r.cookie_banner === false) f.push({ key: 'cookies', label: 'sans bandeau cookies', poids: 3 });
  if (r.meta_desc === false) f.push({ key: 'meta_desc', label: 'SEO : meta description', poids: 3 });
  if (r.h1_present === false) f.push({ key: 'h1', label: 'SEO : H1', poids: 3 });
  if (r.analytics === false) f.push({ key: 'analytics', label: 'sans audience', poids: 3 });
  if (r.serveur_php) f.push({ key: 'serveur_expose', label: `serveur exposé (${r.serveur_php})`, poids: 5 });
  const annee = new Date().getFullYear();
  if (r.copyright_annee && r.copyright_annee < annee - 1) f.push({ key: 'copyright_fige', label: `copyright ${r.copyright_annee}`, poids: 3 });
  return f;
}

// Score de priorité 0-100. Joignabilité + angles de vente + budget probable.
function prospectScore(r) {
  let s = 0;
  if (r.email) s += 35;
  if (r.facebook_url || r.instagram_url) s += 10;
  if (r.ssl_ok === false) s += 5; // le reste du poids SSL vient de auditFlags
  if (['WooCommerce', 'PrestaShop'].includes(r.platform)) s += 10;
  if (r.ecommerce_actif) s += 15;
  if (r.gerant) s += 5;
  for (const flag of auditFlags(r)) s += flag.poids;
  if (r.parked) s -= 50;
  if (r.protected) s -= 30; // audit faussé derrière un antibot : on ne sait rien de fiable
  return Math.max(0, Math.min(100, s));
}

// Raison d'écartement (string) ou null. Même logique que le panneau Crawl, plus l'antibot.
function disqualifyReason(r) {
  if (r.parked) return 'parké / vide';
  if (r.is_nocode) return 'no-code (fermé)';
  if (NOCODE_NAMES.includes(r.platform)) return `no-code (${r.platform})`;
  if (r.lang && r.lang !== 'fr') return `hors FR (${r.lang})`;
  const p = r.platform || '';
  if (p === 'Magento') return 'Magento (grosse structure)';
  if (p === 'Shopify') return 'Shopify (hors techno)';
  if (r.site_type === 'collectivite') return null;
  if (r.site_type === 'asso') return 'association / sans budget';
  if (r.site_type === 'agence') return 'agence (concurrent)';
  const dom = r.domain || '';
  const hay = `${r.title || ''} ${dom}`;
  if (COLLECTIVITE_RE.test(hay)) return null;
  if (/\.org(\/|$|\b)/i.test(dom) || /\.asso\.fr/i.test(dom)) return 'association / sans budget';
  if (ASSO_RE.test(hay)) return 'association / sans budget';
  if (AGENCE_RE.test(hay)) return 'agence (concurrent)';
  return null;
}

// Bloquants à la promotion en prospect (au-delà du simple masquage) : on ne prospecte pas
// un concurrent, un domaine parké, un no-code fermé, ni un site dont l'audit est faux.
function promotionBlocker(r) {
  const reason = disqualifyReason(r);
  if (reason && /agence|park|no-code/.test(reason)) return reason;
  if (r.protected) return 'antibot (audit non fiable)';
  return null;
}

// Département depuis un code postal français (2 chiffres, Corse 2A/2B, DOM 3 chiffres).
function departmentFromPostalCode(cp) {
  const s = String(cp || '').replace(/\D/g, '');
  if (s.length !== 5) return null;
  if (s.startsWith('97') || s.startsWith('98')) return s.slice(0, 3);
  if (s.startsWith('20')) return parseInt(s, 10) < 20200 ? '2A' : '2B';
  return s.slice(0, 2);
}

module.exports = { auditFlags, prospectScore, disqualifyReason, promotionBlocker, departmentFromPostalCode, NOCODE_NAMES };
