// Liens des emails de prospection (lot 6) : à quoi sert le lien cliqué, et le clic vient-il d'un humain ?
//
// Catégories :
//   - prestations   : une page de vos services sur votre site (signal commercial fort) ;
//   - signature     : l'accueil de votre site (lien de la signature) ;
//   - reseaux       : LinkedIn, Facebook, Instagram, Malt… (signal faible) ;
//   - desinscription: le lien de désinscription (jamais un signal d'intérêt) ;
//   - autre         : tout le reste (le site du prospect, une source…).
// Vos domaines : OUTREACH_SITE_DOMAINS (séparés par des virgules), pixfeed.net par défaut.
//
// Clic « probablement automatique » (ne compte pas) : moins d'une minute après l'envoi, requête HEAD,
// navigateur absent ou service de sécurité connu (antivirus, filtres de messagerie qui ouvrent tous
// les liens pour les vérifier), ou rafale de liens différents en quelques secondes.

const RESEAUX = /(^|\.)(linkedin\.com|lnkd\.in|facebook\.com|fb\.me|instagram\.com|twitter\.com|x\.com|youtube\.com|youtu\.be|tiktok\.com|malt\.fr|malt\.com|pinterest\.[a-z.]+|github\.com|bsky\.app|threads\.net)$/i;
const DELAI_HUMAIN_S = 60;
const RAFALE_S = 10;
const UA_ROBOT = /bot|crawl|spider|slurp|preview|scan|python|curl|wget|go-http|java\/|okhttp|axios|node-fetch|headless|phantom|barracuda|proofpoint|mimecast|symantec|messagelabs|trend ?micro|forcepoint|sophos|fortinet|fortiguard|cisco|ironport|safelinks|microsoft office existence|ms-office|skypeuripreview|google-safety|apple-mail-link-check|linkchecker|seo-linkcheck/i;

const domainesMaison = () => String(process.env.OUTREACH_SITE_DOMAINS || 'pixfeed.net').split(',').map((d) => d.trim().toLowerCase().replace(/^www\./, '')).filter(Boolean);
const hote = (u) => u.hostname.toLowerCase().replace(/^www\./, '');

function categorie(url) {
  let u;
  try { u = new URL(url); } catch { return 'autre'; }
  if (/\/api\/track\/u\b/.test(u.pathname) || /d[ée]sinscri|unsubscribe|optout/i.test(u.pathname + u.search)) return 'desinscription';
  const h = hote(u);
  if (RESEAUX.test(h)) return 'reseaux';
  if (domainesMaison().some((d) => h === d || h.endsWith(`.${d}`))) {
    return u.pathname.replace(/\/+$/, '') === '' ? 'signature' : 'prestations';
  }
  return 'autre';
}

// Texte lisible : « votre page /maintenance », « votre site », « votre LinkedIn »…
function libelle(url, cat = categorie(url)) {
  let u;
  try { u = new URL(url); } catch { return 'un lien'; }
  if (cat === 'prestations') return `votre page ${decodeURI(u.pathname).replace(/\/+$/, '')}`;
  if (cat === 'signature') return 'votre site (lien de la signature)';
  if (cat === 'reseaux') {
    const n = hote(u).split('.')[0];
    const NOMS = { linkedin: 'LinkedIn', lnkd: 'LinkedIn', facebook: 'Facebook', fb: 'Facebook', instagram: 'Instagram', twitter: 'X', x: 'X', youtube: 'YouTube', youtu: 'YouTube', tiktok: 'TikTok', malt: 'Malt', github: 'GitHub', bsky: 'Bluesky', threads: 'Threads' };
    return `votre ${NOMS[n] || n.charAt(0).toUpperCase() + n.slice(1)}`;
  }
  if (cat === 'desinscription') return 'le lien de désinscription';
  return `le lien ${hote(u)}${u.pathname.length > 1 ? decodeURI(u.pathname).slice(0, 40) : ''}`;
}

// Raison pour laquelle un clic est jugé automatique, ou null s'il a l'air humain.
function raisonAutomatique({ ua, delaiS, methode }) {
  if (methode === 'HEAD') return 'requête de vérification (HEAD)';
  if (delaiS !== null && delaiS !== undefined && delaiS < DELAI_HUMAIN_S) return `clic ${Math.max(0, Math.round(delaiS))} s après l'envoi (vérification automatique probable)`;
  const s = String(ua || '').trim();
  if (!s) return 'aucun navigateur annoncé';
  if (UA_ROBOT.test(s)) return `service automatique (${s.slice(0, 60)})`;
  return null;
}

// Liens http(s) d'un email (avant réécriture), pour n'autoriser la redirection que vers eux.
function liensDe(html) {
  const out = [];
  for (const m of String(html || '').matchAll(/<a\b[^>]*\bhref=(["'])(https?:\/\/[^"']+)\1/gi)) {
    const url = m[2].replace(/&amp;/g, '&');
    if (!out.includes(url)) out.push(url);
  }
  return out;
}

module.exports = { categorie, libelle, raisonAutomatique, liensDe, domainesMaison, DELAI_HUMAIN_S, RAFALE_S };
