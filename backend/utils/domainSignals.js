// backend/utils/domainSignals.js
//
// Signaux d'intention : fonctions PURES (sans base ni réseau) du pipeline « nouveaux .fr ».
//  - parseAfnicList : lecture du fichier quotidien AFNIC (domaines créés la veille) ;
//  - filterDomain   : rejet sur le nom seul (chiffres, sigles, marques, aléatoire) ;
//  - metierHint     : mot de métier reconnu dans le nom (plomberie, coiffure…) ;
//  - websiteStatus  : que répond le domaine ? (sans DNS, parking, vide, actif…) ;
//  - intentScore    : 0-100, fondé sur l'âge de l'ENTREPRISE, jamais sur celui du domaine
//                     (tout le fichier AFNIC a moins de sept jours : ça ne trie rien) ;
//  - qualify        : statut + raison + prochain contrôle.
// Testé dans tests/domainSignals.test.js.

const { GRANDES_MARQUES } = require('./prospectScore');

// ─── Lecture du fichier AFNIC ─────────────────────────────────────────────────
// Format observé : lignes d'en-tête commençant par « # », puis un domaine par ligne ;
// on tolère aussi un CSV « domaine;bureau d'enregistrement;date » (premier champ).
function parseAfnicList(text) {
  const out = new Set();
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const first = line.split(/[;,\t ]+/)[0].toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
    if (/^[a-z0-9-]+\.fr$/.test(first)) out.add(first);
  }
  return [...out];
}

// ─── Filtre sur le nom ───────────────────────────────────────────────────────
// Marques nationales et grands groupes : un dépôt défensif ou une variante typographique
// n'est jamais un prospect. Complète la liste de domaines du crawl par les racines seules.
const MARQUES_RACINES = new Set([
  'google', 'facebook', 'instagram', 'amazon', 'apple', 'microsoft', 'netflix', 'paypal', 'orange', 'sfr',
  'bouygues', 'free', 'carrefour', 'leclerc', 'auchan', 'lidl', 'aldi', 'decathlon', 'renault', 'peugeot',
  'citroen', 'airbus', 'total', 'totalenergies', 'edf', 'engie', 'sncf', 'laposte', 'bnp', 'bnpparibas',
  'societegenerale', 'creditagricole', 'axa', 'macif', 'maif', 'groupama', 'allianz', 'chanel', 'dior',
  'louisvuitton', 'hermes', 'loreal', 'danone', 'michelin', 'vinci', 'safran', 'thales', 'dassault',
  'veolia', 'suez', 'accor', 'sodexo', 'capgemini', 'atos', 'ubisoft', 'tesla', 'samsung', 'huawei',
  'nike', 'adidas', 'zara', 'ikea', 'leroymerlin', 'castorama', 'fnac', 'darty', 'boulanger', 'cdiscount',
  'leboncoin', 'vinted', 'uber', 'airbnb', 'booking', 'tiktok', 'whatsapp', 'youtube', 'chatgpt', 'openai'
]);
for (const d of GRANDES_MARQUES) { const r = d.split('.')[0].replace(/-/g, ''); if (r.length >= 4) MARQUES_RACINES.add(r); }

const VOYELLES = /[aeiouy]/g;

/**
 * @returns {{ ok: boolean, raison?: string, root: string }}
 */
function filterDomain(domain) {
  const d = String(domain || '').toLowerCase().replace(/^www\./, '');
  const root = d.replace(/\.fr$/, '');
  if (!/^[a-z0-9-]+\.fr$/.test(d)) return { ok: false, raison: 'hors .fr', root };
  if (root.startsWith('xn--')) return { ok: false, raison: 'nom internationalisé (IDN)', root };
  const compact = root.replace(/-/g, '');
  if (compact.length < 3) return { ok: false, raison: 'trop court', root };
  if (compact.length > 40) return { ok: false, raison: 'trop long', root };
  const digits = (compact.match(/\d/g) || []).length;
  if (digits >= compact.length / 2) return { ok: false, raison: 'surtout des chiffres', root };
  const letters = compact.replace(/\d/g, '');
  const voyelles = (letters.match(VOYELLES) || []).length;
  if (letters.length >= 4 && voyelles === 0) return { ok: false, raison: 'sigle sans voyelle', root };
  // Chaîne aléatoire : longue, sans tiret, presque sans voyelle.
  if (!root.includes('-') && letters.length >= 10 && voyelles / letters.length < 0.2) return { ok: false, raison: 'suite de lettres aléatoire', root };
  for (const part of root.split('-')) {
    if (part.length >= 4 && MARQUES_RACINES.has(part)) return { ok: false, raison: `marque nationale (${part})`, root };
  }
  for (const m of MARQUES_RACINES) {
    if (m.length >= 6 && compact.includes(m)) return { ok: false, raison: `marque nationale (${m})`, root };
  }
  return { ok: true, root };
}

// ─── Mot de métier ───────────────────────────────────────────────────────────
// Racines (sans accent) de métiers qui ont besoin d'un site vitrine ou d'une boutique.
// Volontairement large : c'est un bonus au score, pas un filtre.
const METIERS = [
  'plomb', 'electric', 'elec', 'couvreur', 'couverture', 'menuis', 'macon', 'maconnerie', 'peintur', 'peintre', 'jardin', 'paysag',
  'coiff', 'esthet', 'beaute', 'boulang', 'patiss', 'boucher', 'charcut', 'traiteur', 'restaurant', 'resto', 'pizz', 'brasserie',
  'bistro', 'cafe', 'bar-', '-bar', 'burger', 'sushi', 'kebab', 'tacos', 'glacier', 'chocolat', 'confis', 'creperie', 'foodtruck',
  'garage', 'auto', 'carross', 'pneu', 'taxi', 'vtc', 'ambulan', 'immo', 'immobilier', 'conseil', 'avocat', 'notaire', 'expert',
  'comptab', 'kine', 'osteo', 'dentist', 'veto', 'veterinaire', 'infirm', 'pharma', 'optique', 'opticien', 'audio', 'podolog',
  'psy', 'sophro', 'naturo', 'dietet', 'nutrition', 'photo', 'video', 'film', 'graphis', 'design', 'imprim', 'fleur', 'fleuriste',
  'bijou', 'boutique', 'shop', 'store', 'cave', 'vins', 'vigne', 'domaine', 'brasseur', 'biere', 'hotel', 'gite', 'chambre',
  'camping', 'nettoyage', 'proprete', 'demenag', 'transport', 'logisti', 'chauffag', 'clim', 'renov', 'batiment', 'btp',
  'carrel', 'platr', 'isolation', 'toiture', 'serrur', 'vitr', 'piscin', 'elagage', 'terrass', 'charpent', 'ebenist', 'tapiss',
  'coutur', 'retouche', 'pressing', 'creche', 'nounou', 'ecole', 'formation', 'coach', 'sport', 'fitness', 'yoga', 'pilates',
  'massage', 'spa-', 'tatou', 'tattoo', 'barber', 'ongle', 'nail', 'epicerie', 'primeur', 'fromag', 'poisson', 'marche', 'bio',
  'vrac', 'brocante', 'antiquit', 'deco', 'meuble', 'cuisin', 'literie', 'luminaire', 'informati', 'depann', 'telephon',
  'reparation', 'evenement', 'event', 'mariage', 'wedding', 'animation', 'location', 'materiel', 'outillage', 'ferronn',
  'metall', 'soud', 'usinage', 'mecani', 'agri', 'ferme', 'elevage', 'viticult', 'horticult', 'pepini', 'toilettage', 'pension',
  'dressage', 'educateur', 'velo', 'cycle', 'moto', 'bateau', 'nautique', 'pecheur', 'securite', 'alarme', 'gardien', 'menuiserie',
  'stores', 'volet', 'portail', 'cloture', 'fenetre', 'facade', 'ravalement', 'diagnostic', 'geometre', 'architect', 'archi',
  'ingenierie', 'bureau', 'etude', 'conciergerie', 'menage', 'aide', 'domicile', 'senior', 'services', 'artisan', 'atelier',
  'creation', 'ceramique', 'poterie', 'savon', 'cosmet', 'bougie', 'textile', 'mode', 'vetement', 'chaussure', 'maroquin',
  'lunette', 'montre', 'jouet', 'librairie', 'papeterie', 'musique', 'guitare', 'piano', 'danse', 'theatre', 'studio', 'traduc',
  'redac', 'web', 'digital', 'marketing', 'commun', 'agence', 'consult', 'rh-', 'recrut', 'interim', 'assur', 'courtier',
  'credit', 'patrimoine', 'gestion', 'syndic', 'copro', 'promot', 'construct', 'maison', 'habitat', 'energie', 'solaire',
  'photovolt', 'pompe', 'chaleur', 'eau', 'assainiss', 'forage', 'puits', 'bois', 'granul', 'pellet', 'ramon', 'chemine',
  'poele', 'fumist'
];
function metierHint(root) {
  const r = String(root || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const m of METIERS) {
    if (m.startsWith('-') ? r.endsWith(m.slice(1)) || r.includes(m) : m.endsWith('-') ? r.startsWith(m.slice(0, -1)) || r.includes(m) : r.includes(m)) {
      return m.replace(/-/g, '');
    }
  }
  return null;
}

// ─── Statut du site ──────────────────────────────────────────────────────────
const DNS_ERR_RE = /Errno -[235]\b|Name or service not known|nodename nor servname|No address associated|getaddrinfo|Temporary failure in name resolution|NXDOMAIN/i;
const DEFAULT_TITLE_RE = /^(wordpress|accueil|home|bienvenue|welcome|untitled|sans titre|mon site|my site|index|page d'accueil|nouveau site|new site|joomla!?|drupal|prestashop|site web|hello world!?|just another wordpress site)$/i;

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

/**
 * @param {object} row ligne d'analyse typée (booléens/entiers) ou brute (« oui »/« non »)
 * @returns {string} inconnu | sans_dns | injoignable | parking | vide | redirection | protege | erreur | actif
 */
function websiteStatus(row, domain) {
  if (!row) return 'inconnu';
  const oui = (v) => v === true || /^(oui|true|1|yes)$/i.test(String(v ?? ''));
  const status = parseInt(row.http_status, 10);
  if (!status || Number.isNaN(status)) {
    const err = String(row.error || '');
    if (DNS_ERR_RE.test(err)) return 'sans_dns';
    return err ? 'injoignable' : 'inconnu';
  }
  if (oui(row.protected)) return 'protege';
  const finalHost = hostOf(row.final_url);
  const dom = String(domain || row.domain || '').toLowerCase().replace(/^www\./, '');
  if (finalHost && dom && finalHost !== dom && !finalHost.endsWith('.' + dom)) return 'redirection';
  if (oui(row.parked)) return 'parking';
  if (status >= 400) return 'erreur';
  const title = String(row.title || '').trim();
  const poids = parseInt(row.poids_ko, 10);
  const platform = String(row.platform || '');
  const platformKnown = platform && platform !== 'Inconnu';
  if (!title && !platformKnown && (!Number.isNaN(poids) ? poids < 5 : true)) return 'vide';
  if (title && DEFAULT_TITLE_RE.test(title)) return 'vide';
  return 'actif';
}

// ─── Score d'intention ───────────────────────────────────────────────────────
const SANS_SITE = new Set(['sans_dns', 'parking', 'vide', 'injoignable']);

function daysBetween(a, b) {
  const da = a instanceof Date ? a : new Date(a);
  const dbb = b instanceof Date ? b : new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(dbb.getTime())) return null;
  return Math.round((dbb - da) / 86400000);
}

function targetDepartments() {
  const raw = (process.env.SIGNAL_DEPARTEMENTS || '01,69,38,71,39,74,73').split(',').map((s) => s.trim()).filter(Boolean);
  return new Set(raw);
}

/**
 * Score 0-100 et liste des signaux retenus (libellés lisibles, réutilisés dans la fiche prospect).
 * @param {object} s signal { match_confidence, company_created_at, metier, department, website_status, email, audit }
 * @param {Date} now
 */
function intentScore(s, now = new Date()) {
  let score = 0;
  const signaux = [];
  const conf = s.match_confidence || 'aucun';
  if (conf === 'sur') { score += 30; signaux.push(`Entreprise identifiée : ${s.company_name}`); } else if (conf === 'probable') { score += 15; signaux.push(`Entreprise probable : ${s.company_name}`); }
  if (s.company_created_at && conf !== 'aucun' && conf !== 'douteux') {
    const age = daysBetween(s.company_created_at, now);
    if (age != null && age >= 0 && age <= 90) { score += 25; signaux.push(`Société créée il y a ${age} jour${age > 1 ? 's' : ''}`); } else if (age != null && age > 90 && age <= 365) { score += 10; signaux.push(`Société créée il y a ${Math.round(age / 30)} mois`); }
  }
  if (s.metier) { score += 10; signaux.push(`Activité reconnue dans le nom : ${s.metier}`); }
  if (s.department && targetDepartments().has(String(s.department))) { score += 15; signaux.push(`Département ciblé : ${s.department}`); }
  const ws = s.website_status || 'inconnu';
  if (SANS_SITE.has(ws)) { score += 15; signaux.push(ws === 'parking' ? 'Domaine réservé, page de parking' : ws === 'vide' ? 'Installation vide, aucun contenu' : 'Domaine réservé, aucun site'); } else if (ws === 'actif') { score += 5; signaux.push(`Site en ligne${s.platform && s.platform !== 'Inconnu' ? ` (${s.platform})` : ''}`); }
  if (s.email) { score += 5; signaux.push('Email de contact trouvé'); }
  if (conf === 'aucun' && !s.metier) score -= 10;
  if (s.site_apparu_le) { score += 10; signaux.push(`Site apparu le ${new Date(s.site_apparu_le).toLocaleDateString('fr-FR')}`); }
  return { score: Math.max(0, Math.min(100, score)), signaux };
}

// ─── Statut + prochain contrôle ─────────────────────────────────────────────
// Échéances depuis la découverte : J+7, 15, 30, 60, 90. Après 90 jours sans site ni
// entreprise, le signal est classé sans suite.
const ECHEANCES = [7, 15, 30, 60, 90];

function nextCheckDate(registeredAt, now = new Date()) {
  const base = registeredAt ? new Date(registeredAt) : now;
  const start = Number.isNaN(base.getTime()) ? now : base;
  for (const j of ECHEANCES) {
    const d = new Date(start.getTime() + j * 86400000);
    if (d > now) return d;
  }
  return null;
}

/**
 * Décide du statut d'un signal analysé.
 * @returns {{ statut: string, raison_rejet: string|null, next_check_at: Date|null }}
 */
function qualify(s, now = new Date()) {
  const ws = s.website_status || 'inconnu';
  const conf = s.match_confidence || 'aucun';
  const next = nextCheckDate(s.registered_at, now);
  if (ws === 'redirection') return { statut: 'rejete', raison_rejet: 'alias : redirige vers un autre domaine', next_check_at: null };
  if (s.effectif && /^(50-99|100-199|200-249|250-499|500-999|1000-1999|2000-4999|5000\+)$/.test(String(s.effectif))) {
    return { statut: 'rejete', raison_rejet: `grande entreprise (${s.effectif} salariés)`, next_check_at: null };
  }
  const identifiee = conf === 'sur' || conf === 'probable';
  const sansIndice = !identifiee && !s.metier;
  if (sansIndice && next === null) return { statut: 'rejete', raison_rejet: 'aucune entreprise ni activité reconnue après 90 jours', next_check_at: null };
  if (ws === 'actif' && sansIndice && (s.checks || 0) >= 1) return { statut: 'rejete', raison_rejet: 'site en ligne sans entreprise ni activité reconnue', next_check_at: null };
  const score = s.intent_score != null ? s.intent_score : intentScore(s, now).score;
  if (score >= 50) return { statut: 'qualifie', raison_rejet: null, next_check_at: SANS_SITE.has(ws) || ws === 'inconnu' || ws === 'erreur' || ws === 'protege' ? next : null };
  return { statut: 'a_surveiller', raison_rejet: null, next_check_at: next };
}

module.exports = { parseAfnicList, filterDomain, metierHint, websiteStatus, intentScore, qualify, nextCheckDate, daysBetween, ECHEANCES, SANS_SITE, targetDepartments };
