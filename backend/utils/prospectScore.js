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

// Grandes entreprises : hors cible d'un indépendant (décision par comité, agence en place, appels
// d'offres). Deux signaux : la tranche d'effectif SIRENE, et une liste de marques nationales que
// le crawl ramène parfois parce qu'une de leurs pages ressemble à une fiche produit.
const GRANDS_EFFECTIFS = new Set(['50-99', '100-199', '200-249', '250-499', '500-999', '1000-1999', '2000-4999', '5000+']);
const GRANDES_MARQUES = new Set(['free.fr', 'orange.fr', 'sfr.fr', 'bouyguestelecom.fr', 'laposte.fr', 'fnac.com', 'darty.com',
  'cdiscount.com', 'leclerc', 'e.leclerc', 'carrefour.fr', 'auchan.fr', 'amazon.fr', 'decathlon.fr', 'leroymerlin.fr',
  'boulanger.com', 'but.fr', 'conforama.fr', 'ikea.com', 'castorama.fr', 'brico-depot.fr', 'intermarche.com',
  'systeme-u.fr', 'lidl.fr', 'aldi.fr', 'sncf.com', 'sncf-connect.com', 'airfrance.fr', 'edf.fr', 'engie.fr',
  'total.fr', 'totalenergies.fr', 'renault.fr', 'peugeot.fr', 'citroen.fr', 'bnpparibas', 'societegenerale.fr',
  'creditagricole.fr', 'caisse-epargne.fr', 'lcl.fr', 'boursorama.com', 'ameli.fr', 'service-public.fr', 'impots.gouv.fr',
  'leboncoin.fr', 'vinted.fr', 'zalando.fr', 'sephora.fr', 'yves-rocher.fr', 'nocibe.fr', 'marionnaud.fr', 'kiabi.com',
  'celio.com', 'jules.com', 'camaieu.fr', 'lacoste.com', 'galerieslafayette.com', 'printemps.com', 'bhv.fr']);
function grandeEntreprise(r) {
  const d = String(r.domain || '').toLowerCase().replace(/^www\./, '');
  if (GRANDES_MARQUES.has(d) || [...GRANDES_MARQUES].some((m) => d.endsWith('.' + m))) return 'grande marque nationale';
  if (r.effectif && GRANDS_EFFECTIFS.has(String(r.effectif))) return `grande entreprise (${r.effectif} salariés)`;
  return null;
}

// Titres d'installation jamais changés (SEO nul, et signe que personne ne suit le site).
const DEFAULT_TITLE_RE = /^(prestashop|wordpress|woocommerce|accueil|home|bienvenue|welcome|untitled|sans titre|mon site|my site|site en construction|coming soon|index|boutique en ligne|ma boutique|shop)$/i;

// Fin du support de sécurité PHP (php.net/supported-versions). Une version passée n'a plus
// aucun correctif : ce n'est pas un détail technique, c'est un site qu'on ne peut plus réparer.
const PHP_EOL = { '5.6': '2018-12', '7.0': '2019-01', '7.1': '2019-12', '7.2': '2020-11', '7.3': '2021-12', '7.4': '2022-11', '8.0': '2023-11', '8.1': '2025-12', '8.2': '2026-12', '8.3': '2027-12', '8.4': '2028-12' };
function phpEol(serveurPhp) {
  const m = /PHP\s*(\d+\.\d+)/i.exec(String(serveurPhp || ''));
  if (!m) return null;
  const branch = m[1];
  const eol = PHP_EOL[branch] || (parseFloat(branch) < 5.6 ? '2018-12' : null);
  if (!eol) return null;
  const now = new Date().toISOString().slice(0, 7);
  return eol < now ? { branch, eol } : null;
}

const isShop = (r) => r.site_type === 'commerce' || r.ecommerce_actif === true || ['PrestaShop', 'WooCommerce', 'Shopify'].includes(r.platform);

// ── Description Google absurde : adresse postale, fax, téléphone, email, texte trop court,
//    copie du titre ou texte d'exemple. C'est ce que le prospect lit sous son nom dans Google.
function descriptionAbsurde(r) {
  const d = String(r.meta_desc_txt || '').trim();
  if (!d) return false;
  if (d.length < 25) return true;
  if (/\b(fax|t[ée]l(?:[ée]phone)?\.?|siret|siren|tva intracom)\b/i.test(d)) return true;
  if (/\b\d{5}\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ' -]{2,}\b/.test(d) && /\b(rue|avenue|av\.|bd|boulevard|route|zi|za|zac|chemin|impasse|place|all[ée]e)\b/i.test(d)) return true;
  if (/(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}/.test(d) && d.length < 90) return true;
  if (/[\w.-]+@[\w.-]+\.[a-z]{2,}/i.test(d)) return true;
  if (/lorem ipsum|description de (?:votre|la) (?:boutique|site)|default description|mettre ici|ma description/i.test(d)) return true;
  const t = String(r.title || '').trim().toLowerCase();
  if (t && d.toLowerCase() === t) return true;
  return false;
}

// ── Nom de l'entreprise mal orthographié dans le titre (« Equit Tout » pour Equip'Tout) :
//    un mot du nom légal (SIRENE sûr) ou de la racine du domaine, absent du titre mais présent
//    à une ou deux lettres près. Rien n'est jamais déduit sans nom de référence.
const fold = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set(['sarl', 'sas', 'sasu', 'eurl', 'sci', 'snc', 'sa', 'ei', 'societe', 'les', 'des', 'and', 'the', 'boutique', 'shop', 'store', 'france', 'com', 'net', 'org', 'www', 'site', 'officiel']);
function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return dp[m][n];
}
function nomMalOrthographie(r) {
  const title = fold(r.title);
  if (!title) return null;
  const sources = [];
  if (r.sirene_match && r.sirene_match !== 'douteux' && r.raison_sociale) sources.push(String(r.raison_sociale));
  const root = String(r.domain || '').toLowerCase().replace(/^www\./, '').split('.')[0];
  if (root && root.includes('-')) sources.push(root.replace(/-/g, ' '));
  const titleTokens = title.split(' ').filter((w) => w.length >= 4);
  for (const src of sources) {
    const tokens = fold(src).split(' ').filter((w) => w.length >= 5 && !STOP.has(w));
    for (const tok of tokens) {
      if (title.includes(tok)) continue;
      for (const tt of titleTokens) {
        if (STOP.has(tt)) continue;
        const d = editDistance(tok, tt);
        if (d >= 1 && d <= (tok.length >= 8 ? 2 : 1)) return { attendu: src.trim(), titre: String(r.title).trim(), mot_attendu: tok, mot_titre: tt };
      }
    }
  }
  return null;
}

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
  // Arguments forts : chiffre d'affaires (invisible sur Google), loi (CGV, rétractation), panne.
  if (r.noindex === true || r.robots_bloque === true) f.push({ key: 'invisible_google', label: 'invisible sur Google', poids: 25 });
  if (r.cgv === false && isShop(r)) f.push({ key: 'cgv_absente', label: 'sans CGV', poids: 15 });
  if (r.retractation === false && isShop(r)) f.push({ key: 'retractation_absente', label: 'sans rétractation', poids: 8 });
  if (r.contenu_mixte === true) f.push({ key: 'contenu_mixte', label: 'contenu mixte', poids: 8 });
  if (r.mentions_404 === true) f.push({ key: 'mentions_404', label: 'mentions légales cassées', poids: 10 });
  // Preuves visibles dans Google ou dans la barre d'adresse.
  if (nomMalOrthographie(r)) f.push({ key: 'nom_mal_orthographie', label: 'nom mal écrit dans le titre', poids: 15 });
  if (r.sitemap === 'vide') f.push({ key: 'sitemap_vide', label: 'sitemap vide', poids: 12 });
  else if (r.sitemap === 'absent' && isShop(r)) f.push({ key: 'sitemap_absent', label: 'sans sitemap', poids: 4 });
  if (r.urls_reecrites === false) f.push({ key: 'urls_non_reecrites', label: 'adresses non réécrites', poids: 12 });
  if (descriptionAbsurde(r)) f.push({ key: 'meta_desc_absurde', label: 'description Google absurde', poids: 10 });
  const eol = phpEol(r.serveur_php);
  if (eol) f.push({ key: 'php_obsolete', label: `PHP ${eol.branch} sans correctifs depuis ${eol.eol.slice(0, 4)}`, poids: 12 });
  else if (r.serveur_php) f.push({ key: 'serveur_expose', label: `serveur exposé (${r.serveur_php})`, poids: 5 });
  // Site en panne (erreur serveur 5xx) : le problème le plus visible qui soit.
  if (Number(r.http_status) >= 500) f.push({ key: 'erreur_serveur', label: `site en erreur (${r.http_status})`, poids: 15 });
  if ([404, 410].includes(Number(r.http_status))) f.push({ key: 'accueil_404', label: 'accueil introuvable (404)', poids: 15 });
  // Titre jamais personnalisé (« PrestaShop », « WordPress », « Accueil ») : site laissé tel quel.
  if (DEFAULT_TITLE_RE.test(String(r.title || '').trim())) f.push({ key: 'titre_defaut', label: 'titre par défaut', poids: 5 });
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
  const ge = grandeEntreprise(r);
  if (ge) return ge;
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
  if (reason && /agence|park|no-code|grande/.test(reason)) return reason;
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

// Preuve = vérifiable par le gérant en dix secondes sur son propre site ; indice = vrai mais
// déduit ou invisible pour lui. Seule une preuve peut ouvrir un email (proofEmailService).
const PREUVE_KEYS = new Set(['accueil_404', 'erreur_serveur', 'invisible_google', 'http_non_securise', 'ssl_expire',
  'ssl_invalide', 'ssl_bientot', 'nom_mal_orthographie', 'titre_defaut', 'meta_desc_absurde', 'urls_non_reecrites',
  'sitemap_vide', 'mentions_404', 'mobile', 'copyright_fige']);
const niveauFlag = (key) => (PREUVE_KEYS.has(key) ? 'preuve' : 'indice');

module.exports = { auditFlags, prospectScore, disqualifyReason, promotionBlocker, departmentFromPostalCode, phpEol, niveauFlag, PREUVE_KEYS, NOCODE_NAMES, descriptionAbsurde, nomMalOrthographie, grandeEntreprise, GRANDES_MARQUES };
