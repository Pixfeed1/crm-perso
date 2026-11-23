// Agences et prestataires web en difficulté, repérés DIRECTEMENT au BODACC (et plus seulement parmi les prestataires
// crédités sur les sites déjà crawlés), puis leurs clients retrouvés dans leurs pages de références.
//
// - Chaque jour (6 h 37) : annonces BODACC parues depuis le dernier relevé, procédures collectives et radiations.
//   Pour chaque SIREN, le code NAF (annuaire des entreprises, gratuit, mis en cache) : seules les entreprises du web
//   sont gardées (programmation, conseil informatique, portails, agences de communication, design, édition de
//   logiciels). Le liquidateur ou le mandataire est relevé quand l'annonce le donne.
// - Site de l'entreprise : déjà connu (prestataire au même SIREN), sinon cherché d'après son nom (nom.fr, nom.com…)
//   et gardé seulement si son SIREN figure sur le site (certain) ou si le titre reprend le nom (probable).
// - Clients : pages « Références », « Réalisations », « Portfolio »… du site de l'agence ; chaque site client cité
//   est analysé par le crawler et rattaché au prestataire (source « références du prestataire »). Les signaux,
//   prospects, campagnes et l'angle d'email « prestataire » s'appliquent ensuite comme aux autres.
// - Mail récapitulatif des nouvelles entreprises du web repérées (avec leurs clients).
// Aucune API d'IA. Les freelances en micro-entreprise ne passent presque jamais au BODACC : ils restent couverts par la
// vérification SIRENE des prestataires crédités sur les sites crawlés.
const axios = require('axios');

const err = (status, message) => Object.assign(new Error(message), { status });
const BODACC_URL = () => process.env.BODACC_API_URL || 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records';
// Codes NAF des métiers du web : un prestataire web y est presque toujours.
const NAF_WEB = {
  '62.01Z': 'programmation informatique', '62.02A': 'conseil en systèmes et logiciels', '62.09Z': 'autres activités informatiques',
  '63.11Z': 'traitement de données, hébergement', '63.12Z': 'portails internet', '73.11Z': 'agences de publicité', '73.12Z': 'régie publicitaire',
  '74.10Z': 'design', '58.29C': 'édition de logiciels applicatifs', '70.21Z': 'conseil en relations publiques et communication',
};
const JOURS_MAX = 7;              // rattrapage au plus sur une semaine
const CLIENTS_MAX = 80;           // sites clients analysés par prestataire
const PAGES_MAX = 5;              // pages de références lues par prestataire

// ---------- tables ----------
const prets = new WeakSet();
async function assurerTables(q) {
  if (prets.has(q)) return;
  await require('./prestataireService').assurerTables(q);   // table prestataires d'abord
  await q.query(`
    CREATE TABLE IF NOT EXISTS prestataires_bodacc (
      siren TEXT PRIMARY KEY, nom TEXT, naf TEXT, naf_libelle TEXT, forme TEXT, dirigeant TEXT, ville TEXT, code_postal TEXT,
      famille TEXT, nature TEXT, date_parution DATE, date_jugement DATE, tribunal TEXT, liquidateur TEXT, url TEXT,
      domaine TEXT, domaine_source TEXT, nb_clients INTEGER DEFAULT 0, statut TEXT DEFAULT 'sans_site', erreur TEXT,
      cree_le TIMESTAMPTZ DEFAULT NOW(), maj_le TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS bodacc_jours (jour DATE PRIMARY KEY, annonces INTEGER, web INTEGER, traite_le TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS siren_naf (siren TEXT PRIMARY KEY, naf TEXT, nom TEXT, maj_le TIMESTAMPTZ DEFAULT NOW());
    ALTER TABLE crawl_results ADD COLUMN IF NOT EXISTS prestataire_source TEXT;
    ALTER TABLE crawl_results ADD COLUMN IF NOT EXISTS prestataire_preuve_url TEXT;
    ALTER TABLE prestataires ADD COLUMN IF NOT EXISTS portefeuille_le TIMESTAMPTZ;
    ALTER TABLE prestataires ADD COLUMN IF NOT EXISTS identite_indices TEXT;`);
  prets.add(q);
}

// ---------- BODACC ----------
const json = (v) => { if (!v) return null; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return null; } };
const sirenDe = (a) => { const r = [].concat(a.registre || []).map((x) => String(x).replace(/\D/g, '')).find((x) => /^\d{9}$/.test(x)); return r || null; };
// Liquidateur, mandataire ou administrateur judiciaire, tel que l'annonce le donne.
function liquidateur(a) {
  const j = json(a.jugement) || {};
  const t = String(j.complementJugement || j.complement || a.jugement || '').replace(/\s+/g, ' ');
  const m = /(liquidateur(?: judiciaire)?|mandataire judiciaire|administrateur judiciaire)\s*:?\s*((?:Me|Maître|SELARL|SCP|SELAS|SAS)?[^.;]{3,160})/i.exec(t);
  return m ? `${m[1].charAt(0).toUpperCase()}${m[1].slice(1).toLowerCase()} : ${m[2].replace(/\s*,\s*$/, '').trim()}` : null;
}
async function getDefaut(url, params) {
  const r = await axios.get(url, { params, timeout: 30000, headers: { 'User-Agent': 'CRM-PixFeed/1.0' }, validateStatus: () => true });
  if (r.status >= 400) throw new Error(`BODACC a répondu ${r.status}`);
  return r.data;
}
async function annoncesDuJour(jour, get = getDefaut) {
  const out = [];
  for (let offset = 0; offset < 10000; offset += 100) {
    const d = await get(BODACC_URL(), { where: `dateparution = date'${jour}' AND (familleavis = "collective" OR familleavis = "radiation")`, order_by: 'id', limit: 100, offset });
    const recs = (d && (d.results || d.records)) || [];
    out.push(...recs.map((x) => x.fields || x));
    if (recs.length < 100) break;
  }
  return out;
}

// ---------- site de l'entreprise ----------
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const FORMES = new Set(['sarl', 'sas', 'sasu', 'eurl', 'sa', 'sci', 'scop', 'snc', 'selarl', 'ei', 'eirl', 'societe', 'ste', 'en', 'liquidation', 'judiciaire', 'the', 'et', 'de', 'la', 'le', 'les', 'du', 'des']);
const motsNom = (nom) => fold(nom).split(' ').filter((w) => w && !FORMES.has(w));
function domainesCandidats(nom) {
  const m = motsNom(nom);
  if (!m.length || m.join('').length < 3) return [];
  const colle = m.join(''), tiret = m.join('-'), sansAgence = m.filter((w) => w !== 'agence');
  const racines = [...new Set([colle, tiret, sansAgence.join(''), sansAgence.join('-'), m[0] === 'agence' ? null : `agence${colle}`].filter((x) => x && x.length >= 3))];
  return racines.flatMap((r) => [`${r}.fr`, `${r}.com`]).slice(0, 8);
}
// Le site retenu doit porter le SIREN (certain) ou un titre qui reprend le nom (probable).
function choisirSite(lignes, siren, nom) {
  const mots = motsNom(nom).filter((w) => w.length >= 4 && w !== 'agence');
  const vivants = lignes.filter((l) => Number(l.http_status) >= 200 && Number(l.http_status) < 400 && !/^(oui|true)$/i.test(String(l.parked || '')));
  const certain = vivants.find((l) => String(l.siren_site || '').replace(/\D/g, '') === siren);
  if (certain) return { domaine: String(certain.domain).toLowerCase(), source: 'SIREN lu sur le site' };
  const probable = mots.length ? vivants.find((l) => mots.every((w) => fold(l.title).includes(w))) : null;
  return probable ? { domaine: String(probable.domain).toLowerCase(), source: 'nom dans le titre du site' } : null;
}

// ---------- clients : pages de références du prestataire ----------
const MOTS_REFERENCES = /r[ée]f[ée]rences?|r[ée]alisations?|portfolio|projets|nos[- ]travaux|travaux|clients|cas[- ]clients?|creations|cr[ée]ations|works?\b|showcase/i;
const HOTES_EXCLUS = /(^|\.)(facebook|instagram|linkedin|twitter|x|youtube|youtu|tiktok|pinterest|vimeo|behance|dribbble|google|googleapis|gstatic|googletagmanager|google-analytics|doubleclick|wordpress|wp|w3|schema|cloudflare|jsdelivr|unpkg|jquery|bootstrapcdn|fontawesome|gravatar|apple|microsoft|bing|yahoo|wa|whatsapp|t|bit|goo|maps|calendly|hubspot|mailchimp|sendinblue|brevo|matomo|hotjar|stripe|paypal|shopify|wix|squarespace|webflow|prestashop|woocommerce|elementor|divi|ovh|ovhcloud|o2switch|ionos|gandi|hostinger|github|gitlab|creativecommons|legifrance|cnil|gouv|europa|tripadvisor|pagesjaunes|societe|infogreffe|pappers|trustpilot|avis-verifies|yelp|waze|spotify|deezer|soundcloud|twitch|discord|telegram|messenger|snapchat|reddit|medium|substack|typeform|zoom|teams|skype|dropbox|drive|notion)\.[a-z.]+$/i;
const hrefs = (html) => [...String(html || '').matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({ href: m[1].trim(), texte: m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }));
const hoteNu = (h) => String(h || '').toLowerCase().replace(/^www\./, '');
async function pageDefaut(url) {
  const r = await axios.get(url, { timeout: 15000, maxContentLength: 3 * 1024 * 1024, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CRM-PixFeed/1.0)' }, validateStatus: () => true, responseType: 'text' });
  return r.status >= 200 && r.status < 400 ? String(r.data || '') : '';
}
/** Domaines clients cités par le site du prestataire (accueil et pages de références). */
async function clientsCites(domaine, { page = pageDefaut } = {}) {
  const base = `https://${domaine}/`;
  const accueil = await page(base).catch(() => '');
  if (!accueil) return { clients: [], pages: [] };
  const soi = hoteNu(domaine);
  const internes = [];
  for (const l of hrefs(accueil)) {
    let u; try { u = new URL(l.href, base); } catch { continue; }
    if (hoteNu(u.hostname) !== soi || !/^https?:$/.test(u.protocol)) continue;
    if (MOTS_REFERENCES.test(`${u.pathname} ${l.texte}`) && !internes.includes(u.href)) internes.push(u.href);
  }
  const pages = [base, ...internes.slice(0, PAGES_MAX)];
  const contenus = [accueil];
  for (const p of pages.slice(1)) contenus.push(await page(p).catch(() => ''));
  const vus = new Map();
  contenus.forEach((html, i) => {
    for (const l of hrefs(html)) {
      let u; try { u = new URL(l.href, pages[i]); } catch { continue; }
      if (!/^https?:$/.test(u.protocol)) continue;
      const h = hoteNu(u.hostname);
      if (!h.includes('.') || h === soi || h.endsWith(`.${soi}`) || horsPortefeuille(h) || /^\d+\.\d+\.\d+\.\d+$/.test(h)) continue;
      if (!vus.has(h)) vus.set(h, pages[i]);
    }
  });
  return { clients: [...vus.entries()].slice(0, CLIENTS_MAX).map(([d, source]) => ({ domaine: d, source })), pages };
}

// ---------- faux clients : institutions et plateformes ----------
// Jamais un site client : institutions (universités, .gouv, organismes de recherche) et plateformes (annuaires,
// avis, constructeurs de sites, banques d'images, thèmes…).
const PLATEFORMES = /(^|\.)(sortlist|trustindex|zyro|orcid|freepik|themeisle|themeforest|envato|codecanyon|templatemonster|elegantthemes|wpengine|wordpress|canva|unsplash|pexels|pixabay|shutterstock|adobe|figma|malt|codeur|clutch|goodfirms|designrush|awwwards|cssdesignawards|trustpilot|avis-verifies|linktr|linktree|researchgate|academia|arxiv|doi|semanticscholar|wikipedia|wikimedia|archive|issuu|slideshare|scribd|blogspot|over-blog|jimdo|weebly|webnode|site123|strikingly|godaddy|framer|carrd|airtable|jotform|tally|zapier|sumup|payplug|alma|klarna|stackoverflow|npmjs|bitbucket)\.[a-z.]+$/i;
const INSTITUTIONS = /\.gouv\.fr$|\.gov(\.[a-z]{2})?$|\.edu(\.[a-z]{2})?$|\.ac\.[a-z]{2}$|\.int$|(^|\.)(univ-[a-z0-9-]+|universite-[a-z0-9-]+|[a-z0-9-]+-univ|u-[a-z]+|unistra|sorbonne-universite|cnrs|inria|inserm|cea|ird|inrae|ifremer|cnes|onera|obspm|iap|cern|eso|nasa|esa|europa|unesco|oecd|who|insee|service-public|legifrance|ameli|caf|francetravail|pole-emploi|urssaf|impots|ademe|bpifrance|hal|theses|persee|cairn)\.[a-z.]+$|(^|\.)ac-[a-z-]+\.fr$/i;
const horsPortefeuille = (h) => PLATEFORMES.test(h) || INSTITUTIONS.test(h) || HOTES_EXCLUS.test(h);

// ---------- identité d'un site trouvé par le nom ----------
// Un nom seul fait des homonymes (un astronome, une société népalaise, un cabinet espagnol). Le site n'est retenu
// qu'avec au moins deux indices concordants parmi quatre ; sinon : « homonyme probable », gravité 0, hors liste.
const INDICES_MIN = 2;
const texteDe = (html) => String(html || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');
const MOTS_FR = /\b(le|la|les|des|et|est|pour|vous|nous|une|sur|avec|dans|qui|votre|notre|accueil|mentions)\b/gi;
const MOTS_EN = /\b(the|and|for|you|with|our|is|are|of|to|your|home|about|contact us)\b/gi;
const CP_FR = /\b(?:0[1-9]|[1-8]\d|9[0-5]|97[1-6])\d{3}\b/;
async function indicesIdentite({ domaine, siren, nom, code_postal: cp = null, ville = null, tribunal = null }, x) {
  const base = `https://${domaine}/`;
  const accueil = await x.page(base).catch(() => '');
  let mentions = '';
  for (const l of hrefs(accueil)) {
    let u; try { u = new URL(l.href, base); } catch { continue; }
    if (hoteNu(u.hostname) === hoteNu(domaine) && /mentions|legal|l[ée]gales|cgv|cgu|a-propos|qui-sommes|contact|imprint|impressum/i.test(`${u.pathname} ${l.texte}`)) { mentions = await x.page(u.href).catch(() => ''); break; }
  }
  const html = `${accueil} ${mentions}`;
  const texte = texteDe(html), t = fold(texte);
  const fr = (texte.match(MOTS_FR) || []).length, en = (texte.match(MOTS_EN) || []).length;
  const indices = [];
  // 1. Site en français : attribut lang, ou contenu.
  if (/<html[^>]*\blang\s*=\s*["']?fr/i.test(accueil) || (fr >= 15 && fr > en * 1.5)) indices.push('site en français');
  // 2. Domaine .fr, ou .com avec une adresse en France.
  const adresseFrance = CP_FR.test(texte) && /\bfrance\b|\+33|\b0[1-9](?:[ .]?\d{2}){4}\b/i.test(texte);
  if (/\.fr$/i.test(domaine)) indices.push('domaine .fr');
  else if (/\.com$/i.test(domaine) && adresseFrance) indices.push('.com avec une adresse en France');
  // 3. Ville ou code postal du siège, ou ville du greffe de l'annonce.
  const greffe = tribunal ? (/(?:de|d')\s*([A-ZÉÈÂa-zéèâêëîïôûüç' -]+)$/i.exec(String(tribunal).trim()) || [])[1] : null;
  const lieu = (cp && new RegExp(`\\b${String(cp).replace(/\D/g, '')}\\b`).test(texte)) ? `code postal du siège (${cp})`
    : (ville && fold(ville).length >= 3 && new RegExp(`\\b${fold(ville)}\\b`).test(t)) ? `ville du siège (${ville})`
      : (greffe && fold(greffe).length >= 3 && new RegExp(`\\b${fold(greffe)}\\b`).test(t)) ? `ville du greffe (${greffe.trim()})` : null;
  if (lieu) indices.push(lieu);
  // 4. SIREN, SIRET ou raison sociale exacte.
  const chiffres = texte.replace(/[\s.]/g, '');
  const nomExact = fold(nom);
  if (siren && chiffres.includes(siren)) indices.push('SIREN ou SIRET sur le site');
  else if (nomExact.length >= 4 && ` ${t} `.includes(` ${nomExact} `)) indices.push('raison sociale exacte sur le site');
  return { indices, retenu: indices.length >= INDICES_MIN, lu: !!accueil };
}
const texteIndices = (r) => `${r.indices.length} indice(s) sur 4${r.indices.length ? ` : ${r.indices.join(', ')}` : ''}${r.lu ? '' : ' (site illisible)'}`;

// Clients rattachés depuis les références d'un domaine : détachés (homonyme, ou faux client). Rien n'est supprimé.
async function detacher(db, ids) {
  if (!ids.length) return 0;
  await db.pool.query('UPDATE leads SET prestataire = NULL WHERE crawl_result_id = ANY($1::int[])', [ids]).catch(() => {});
  const r = await db.pool.query('UPDATE crawl_results SET prestataire = NULL, prestataire_source = NULL, prestataire_preuve_url = NULL WHERE id = ANY($1::int[])', [ids]);
  return r.rowCount;
}

// Homonyme probable : statut, gravité 0, raison dans les preuves, références détachées. Une identité certaine
// (SIREN lu dans les mentions légales) n'est jamais touchée.
async function marquerHomonyme(db, domaine, raison) {
  await db.pool.query(
    `UPDATE prestataires SET statut = 'homonyme', gravite = 0, identite_indices = $2,
       preuves = $3::jsonb || COALESCE((SELECT jsonb_agg(e) FROM jsonb_array_elements(COALESCE(preuves, '[]'::jsonb)) e WHERE e->>'type' <> 'homonyme'), '[]'::jsonb)
     WHERE domaine = $1 AND COALESCE(siren_source, '') <> 'mentions légales du site'`,
    [domaine, raison, JSON.stringify([{ source: 'contrôle d\'identité', type: 'homonyme', niveau: 0, date: new Date().toISOString().slice(0, 10), nature: `homonyme probable : ${raison}` }])]);
  const ids = (await db.pool.query("SELECT id FROM crawl_results WHERE LOWER(REGEXP_REPLACE(prestataire, '^www\\.', '')) = $1 AND prestataire_source = 'références du prestataire'", [domaine])).rows.map((r) => r.id);
  return detacher(db, ids);
}

/**
 * Données existantes : 1) chaque site « trouvé par le nom » est recontrôlé (deux indices au moins, sinon homonyme
 * probable) ; 2) institutions et plateformes détachées des portefeuilles. À chaque relevé, et au démarrage.
 */
async function controlerIdentites(db, deps = {}) {
  const x = D(deps);
  await assurerTables(db.pool);
  const out = { controles: [], homonymes: [], faux_clients_detaches: 0 };
  const { rows } = await db.pool.query(
    `SELECT p.domaine, p.nom, p.siren, b.nom AS nom_bodacc, b.code_postal, b.ville, b.tribunal FROM prestataires p LEFT JOIN prestataires_bodacc b ON b.siren = p.siren
      WHERE p.siren_source = 'BODACC, site trouvé par le nom' AND p.statut <> 'homonyme' AND p.identite_indices IS NULL AND p.ignore_le IS NULL`);
  for (const p of rows) {
    const r = await indicesIdentite({ domaine: p.domaine, siren: p.siren, nom: p.nom_bodacc || p.nom, code_postal: p.code_postal, ville: p.ville, tribunal: p.tribunal }, x);
    const raison = `site trouvé par le nom, ${texteIndices(r)}`;
    if (r.retenu) await db.pool.query('UPDATE prestataires SET identite_indices = $2 WHERE domaine = $1', [p.domaine, raison]);
    else { await marquerHomonyme(db, p.domaine, raison); out.homonymes.push(p.domaine); if (p.siren) await db.pool.query("UPDATE prestataires_bodacc SET statut = 'homonyme', nb_clients = 0 WHERE siren = $1", [p.siren]); }
    out.controles.push({ domaine: p.domaine, retenu: r.retenu, indices: r.indices });
  }
  const faux = (await db.pool.query("SELECT id, domain FROM crawl_results WHERE prestataire IS NOT NULL AND prestataire_source = 'références du prestataire'")).rows.filter((r) => horsPortefeuille(hoteNu(r.domain)));
  out.faux_clients_detaches = await detacher(db, faux.map((r) => r.id));
  return out;
}

// Rattache les sites clients au prestataire : analyse par le crawler, ligne de crawl créée (ou complétée).
async function rattacherClients(db, domaine, clients, x) {
  if (!clients.length) return 0;
  const crawl = require('../controllers/crawlController');
  const job = (await db.pool.query("SELECT id FROM crawl_jobs WHERE techno = 'prestataires' ORDER BY id LIMIT 1")).rows[0]
    || (await db.pool.query("INSERT INTO crawl_jobs (techno, nb_sites, statut, phase, message) VALUES ('prestataires', 0, 'done', 'done', 'Sites clients cités par des prestataires en difficulté') RETURNING id")).rows[0];
  const source = new Map(clients.map((c) => [c.domaine, c.source]));
  const lignes = await x.detect(clients.map((c) => c.domaine)).catch(() => []);
  let n = 0;
  for (const l of lignes) {
    const d = hoteNu(l.domain);
    if (!d || Number(l.http_status) === 0) continue;
    const ex = (await db.pool.query("SELECT id, prestataire FROM crawl_results WHERE LOWER(REGEXP_REPLACE(domain, '^www\\.', '')) = $1 ORDER BY id DESC LIMIT 1", [d])).rows[0];
    if (ex) {
      if (!ex.prestataire) { await db.pool.query("UPDATE crawl_results SET prestataire = $2, prestataire_source = 'références du prestataire', prestataire_preuve_url = $3 WHERE id = $1", [ex.id, domaine, source.get(d) || null]); n++; }
      continue;
    }
    const id = await crawl.insertCrawlResult(db, job.id, crawl.typedResult({ ...l, prestataire: domaine }));
    await db.pool.query("UPDATE crawl_results SET prestataire_source = 'références du prestataire', prestataire_preuve_url = $2, score = COALESCE(score, $3) WHERE id = $1", [id, source.get(d) || null, require('../utils/prospectScore').prospectScore(crawl.typedResult(l))]);
    n++;
  }
  return n;
}

/** Portefeuille d'un prestataire : ses clients cités dans ses références, rattachés. Une seule fois par prestataire. */
async function decouvrirPortefeuille(db, domaine, deps = {}) {
  const x = D(deps);
  await assurerTables(db.pool);
  const { clients, pages } = await clientsCites(domaine, { page: x.page });
  const ajoutes = await rattacherClients(db, domaine, clients, x);
  await db.pool.query('UPDATE prestataires SET portefeuille_le = NOW() WHERE domaine = $1', [domaine]);
  return { domaine, pages_lues: pages.length, sites_cites: clients.length, rattaches: ajoutes };
}

// ---------- relevé quotidien ----------
const D = (deps = {}) => ({
  get: getDefaut, page: pageDefaut, parSiren: require('./sireneEnrich').parSiren,
  detect: (l) => require('./ccProspectorRunner').runDetect(l, { concurrency: 6, timeout: 12 }),
  pause: 250, maintenant: () => new Date(), mail: envoyerMail, ...deps,
});
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const jourIso = (d) => new Date(d).toISOString().slice(0, 10);

async function nafDe(db, siren, x) {
  const c = (await db.pool.query("SELECT naf, nom FROM siren_naf WHERE siren = $1 AND maj_le > NOW() - INTERVAL '180 days'", [siren])).rows[0];
  if (c) return { naf: c.naf, cache: true };
  const e = await x.parSiren(siren);
  if (x.pause) await sleep(x.pause);
  if (!e || !e.found) return { naf: null, erreur: (e && e.error) || 'introuvable' };
  await db.pool.query('INSERT INTO siren_naf (siren, naf, nom) VALUES ($1, $2, $3) ON CONFLICT (siren) DO UPDATE SET naf = EXCLUDED.naf, nom = EXCLUDED.nom, maj_le = NOW()', [siren, e.naf || null, e.raison_sociale || null]);
  return { naf: e.naf || null, entreprise: e };
}

/** Une annonce d'une entreprise du web : fiche, site, prestataire, clients. Renvoie la fiche ou null. */
async function traiterAnnonce(db, a, x) {
  const P = require('./prestataireService');
  const siren = sirenDe(a);
  const preuve = P.preuveBodacc(a);
  if (!siren || !preuve || preuve.niveau < 2) return null;
  const n = await nafDe(db, siren, x);
  if (!n.naf || !NAF_WEB[n.naf]) return null;
  const e = n.entreprise || (await x.parSiren(siren).catch(() => null)) || {};
  const deja = (await db.pool.query('SELECT * FROM prestataires_bodacc WHERE siren = $1', [siren])).rows[0];
  const j = json(a.jugement) || {};
  const fiche = {
    siren, nom: e.raison_sociale || a.commercant || null, naf: n.naf, naf_libelle: e.naf_label || NAF_WEB[n.naf], forme: e.nature_juridique || null, dirigeant: e.dirigeant || null,
    ville: e.ville || a.ville || null, code_postal: e.code_postal || a.cp || null, famille: preuve.type, nature: preuve.nature, date_parution: preuve.date || null,
    date_jugement: preuve.date_jugement || j.date || null, tribunal: preuve.tribunal || null, liquidateur: liquidateur(a), url: preuve.url || null,
  };
  await db.pool.query(
    `INSERT INTO prestataires_bodacc (siren, nom, naf, naf_libelle, forme, dirigeant, ville, code_postal, famille, nature, date_parution, date_jugement, tribunal, liquidateur, url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (siren) DO UPDATE SET famille = EXCLUDED.famille, nature = EXCLUDED.nature, date_parution = EXCLUDED.date_parution, date_jugement = EXCLUDED.date_jugement,
       tribunal = EXCLUDED.tribunal, liquidateur = COALESCE(EXCLUDED.liquidateur, prestataires_bodacc.liquidateur), url = EXCLUDED.url, maj_le = NOW()`,
    [fiche.siren, fiche.nom, fiche.naf, fiche.naf_libelle, fiche.forme, fiche.dirigeant, fiche.ville, fiche.code_postal, fiche.famille, fiche.nature, fiche.date_parution, fiche.date_jugement, fiche.tribunal, fiche.liquidateur, fiche.url]);
  if (deja && deja.domaine) return { ...fiche, domaine: deja.domaine, nb_clients: deja.nb_clients, nouveau: false };
  // Site : prestataire déjà connu à ce SIREN, sinon d'après le nom.
  let site = (await db.pool.query('SELECT domaine FROM prestataires WHERE siren = $1 LIMIT 1', [siren])).rows[0];
  site = site ? { domaine: site.domaine, source: 'prestataire déjà connu du CRM' } : null;
  if (!site && fiche.nom) {
    const cands = domainesCandidats(fiche.nom);
    if (cands.length) site = choisirSite(await x.detect(cands).catch(() => []), siren, fiche.nom);
  }
  if (!site) { await db.pool.query("UPDATE prestataires_bodacc SET statut = 'sans_site' WHERE siren = $1", [siren]); return { ...fiche, nouveau: !deja }; }
  // Prestataire du signal : même table que ceux crédités sur les sites crawlés (vérification du lundi comprise).
  const certain = site.source === 'SIREN lu sur le site';
  const { gravite, statut } = P.conclure([preuve]);
  // Trouvé par le nom : deux indices concordants au moins, sinon homonyme probable (hors liste, jamais de références).
  let indicesTexte = null;
  if (site.source === 'nom dans le titre du site') {
    const r = await indicesIdentite({ domaine: site.domaine, siren, nom: fiche.nom, code_postal: fiche.code_postal, ville: fiche.ville, tribunal: fiche.tribunal }, x);
    indicesTexte = `site trouvé par le nom, ${texteIndices(r)}`;
    if (!r.retenu) {
      await db.pool.query(
        `INSERT INTO prestataires (domaine, nom, siren, siren_source, statut, gravite, preuves, verifie_le) VALUES ($1, $2, $3, 'BODACC, site trouvé par le nom', 'homonyme', 0, '[]'::jsonb, NOW())
         ON CONFLICT (domaine) DO NOTHING`, [site.domaine, fiche.nom, siren]);
      await marquerHomonyme(db, site.domaine, indicesTexte);
      await db.pool.query("UPDATE prestataires_bodacc SET domaine = $2, domaine_source = $3, nb_clients = 0, statut = 'homonyme', maj_le = NOW() WHERE siren = $1", [siren, site.domaine, `${site.source} ; homonyme probable (${texteIndices(r)})`]);
      return { ...fiche, domaine: site.domaine, domaine_source: `homonyme probable (${texteIndices(r)})`, nb_clients: 0, homonyme: true, nouveau: !deja };
    }
  }
  await db.pool.query(
    `INSERT INTO prestataires (domaine, nom, siren, siren_source, statut, gravite, preuves, verifie_le) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (domaine) DO UPDATE SET siren = COALESCE(prestataires.siren, EXCLUDED.siren), siren_source = COALESCE(prestataires.siren_source, EXCLUDED.siren_source),
       nom = COALESCE(prestataires.nom, EXCLUDED.nom), statut = CASE WHEN EXCLUDED.gravite > prestataires.gravite THEN EXCLUDED.statut ELSE prestataires.statut END,
       gravite = GREATEST(prestataires.gravite, EXCLUDED.gravite), preuves = CASE WHEN EXCLUDED.gravite > prestataires.gravite THEN EXCLUDED.preuves ELSE prestataires.preuves END`,
    [site.domaine, fiche.nom, siren, certain ? 'mentions légales du site' : 'BODACC, site trouvé par le nom', statut, gravite, JSON.stringify([preuve])]);
  if (indicesTexte) await db.pool.query('UPDATE prestataires SET identite_indices = $2 WHERE domaine = $1', [site.domaine, indicesTexte]);
  const pf = await decouvrirPortefeuille(db, site.domaine, x).catch((er) => ({ rattaches: 0, erreur: er.message }));
  const nb = (await db.pool.query("SELECT COUNT(*)::int AS n FROM crawl_results WHERE LOWER(REGEXP_REPLACE(prestataire, '^www\\.', '')) = $1", [site.domaine])).rows[0].n;
  await db.pool.query('UPDATE prestataires_bodacc SET domaine = $2, domaine_source = $3, nb_clients = $4, statut = $5, erreur = $6, maj_le = NOW() WHERE siren = $1',
    [siren, site.domaine, site.source, nb, nb ? 'clients_trouves' : 'site_trouve', pf.erreur || null]);
  return { ...fiche, domaine: site.domaine, domaine_source: site.source, nb_clients: nb, nouveau: !deja };
}

let enCours = null;
/** Relevé : jours non encore traités (une semaine au plus), annonces, entreprises du web, clients, mail. */
async function relever(db, deps = {}, { jours = null } = {}) {
  if (enCours) return { deja_en_cours: true, depuis: enCours };
  enCours = new Date();
  const x = D(deps);
  try {
    await assurerTables(db.pool);
    const auj = x.maintenant();
    const liste = [];
    for (let i = jours || JOURS_MAX; i >= 1; i--) liste.push(jourIso(auj.getTime() - i * 86400000));
    const faits = new Set((await db.pool.query('SELECT jour::text FROM bodacc_jours WHERE jour = ANY($1::date[])', [liste])).rows.map((r) => r.jour));
    const out = { jours: [], nouveaux: [], identites: await controlerIdentites(db, x).catch((e) => ({ erreur: e.message })) };
    for (const jour of liste.filter((j) => !faits.has(j))) {
      const annonces = await annoncesDuJour(jour, x.get);
      let web = 0;
      if (x.surProgression) x.surProgression({ jour, fait: 0, total: annonces.length, web });
      for (const [i, a] of annonces.entries()) {
        const f = await traiterAnnonce(db, a, x).catch((e) => { console.error('[Prestataires BODACC]', sirenDe(a), e.message); return null; });
        if (f) { web++; if (f.nouveau) out.nouveaux.push(f); if (x.surProgression) x.surProgression({ jour, fait: i + 1, total: annonces.length, web, trouve: f }); }
        else if (x.surProgression && (i + 1) % 100 === 0) x.surProgression({ jour, fait: i + 1, total: annonces.length, web });
      }
      await db.pool.query('INSERT INTO bodacc_jours (jour, annonces, web) VALUES ($1, $2, $3) ON CONFLICT (jour) DO UPDATE SET annonces = EXCLUDED.annonces, web = EXCLUDED.web, traite_le = NOW()', [jour, annonces.length, web]);
      out.jours.push({ jour, annonces: annonces.length, web });
    }
    out.nouveaux = out.nouveaux.filter((f) => !f.homonyme);
    if (out.nouveaux.length) await x.mail(`Prestataires web en difficulté : ${out.nouveaux.length} nouveau(x) au BODACC`, texteMail(out.nouveaux)).catch((e) => console.error('[Prestataires BODACC] mail :', e.message));
    return out;
  } finally { enCours = null; }
}

const fmt = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) : '');
function texteMail(liste) {
  const tri = [...liste].sort((a, b) => (b.nb_clients || 0) - (a.nb_clients || 0));
  return tri.map((f) => [
    `• ${f.nom || f.siren} (${f.ville || 'ville inconnue'}${f.code_postal ? `, ${String(f.code_postal).slice(0, 2)}` : ''}) · ${f.naf_libelle}`,
    `  ${f.nature} · BODACC du ${fmt(f.date_parution)}${f.tribunal ? ` · ${f.tribunal}` : ''}`,
    f.liquidateur ? `  ${f.liquidateur}` : null,
    f.domaine ? `  Site : ${f.domaine} · ${f.nb_clients || 0} site(s) client(s) retrouvé(s)` : '  Site non trouvé',
    f.url ? `  ${f.url}` : null,
  ].filter(Boolean).join('\n')).join('\n\n') + '\n\nÀ suivre dans le CRM : Portefeuille > Signaux > Prestataires en difficulté (sites clients en prospects ou en campagne).';
}
async function envoyerMail(sujet, texte) {
  const mail = require('./emailService');
  const to = process.env.ALERT_EMAIL || process.env.REPORT_REPLY_TO || process.env.EMAIL_USER;
  if (!to) return;
  await mail.sendEmail({ to, subject: sujet, text: texte, html: `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;white-space:pre-line">${texte.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</div>` });
}

// Prestataires déjà repérés (crawl ou BODACC) en difficulté dont les références n'ont pas encore été lues.
async function portefeuillesEnAttente(db, deps = {}, { limite = 20 } = {}) {
  await assurerTables(db.pool);
  const { rows } = await db.pool.query("SELECT domaine FROM prestataires WHERE statut IN ('procedure', 'ferme', 'a_verifier', 'abandon') AND portefeuille_le IS NULL AND ignore_le IS NULL ORDER BY gravite DESC, domaine LIMIT $1", [limite]);   // jamais un homonyme
  const out = [];
  for (const r of rows) out.push(await decouvrirPortefeuille(db, r.domaine, deps).catch((e) => ({ domaine: r.domaine, erreur: e.message })));
  return out;
}

async function lister(db, { statut = null, limite = 100 } = {}) {
  await assurerTables(db.pool);
  const { rows } = await db.pool.query(`SELECT * FROM prestataires_bodacc WHERE ($1::text IS NULL OR statut = $1) ORDER BY date_parution DESC NULLS LAST, nb_clients DESC LIMIT $2`, [statut, Math.min(500, Number(limite) || 100)]);
  const jours = (await db.pool.query('SELECT * FROM bodacc_jours ORDER BY jour DESC LIMIT 7')).rows;
  return { agences: rows, derniers_jours: jours, codes_naf: NAF_WEB, en_cours: enCours };
}

function start(db) {
  const cron = require('node-cron');
  assurerTables(db.pool).then(() => controlerIdentites(db)).then((r) => { if (r.homonymes.length || r.faux_clients_detaches) console.log(`[Prestataires BODACC] identités : ${r.homonymes.length} homonyme(s) probable(s) (${r.homonymes.join(', ')}), ${r.faux_clients_detaches} faux client(s) détaché(s)`); })
    .catch((e) => console.error('[Prestataires BODACC] démarrage :', e.message));
  cron.schedule('37 6 * * *', async () => {
    try {
      const r = await relever(db);
      if (r.jours) console.log(`[Prestataires BODACC] ${r.jours.map((j) => `${j.jour} : ${j.annonces} annonce(s), ${j.web} du web`).join(' ; ')} · ${r.nouveaux.length} nouveau(x)`);
      await portefeuillesEnAttente(db);
    } catch (e) { console.error('[Prestataires BODACC] relevé :', e.message); }
  }, { timezone: 'Europe/Paris' });
}
function lancer(db) {
  if (enCours) return { deja_en_cours: true, depuis: enCours };
  relever(db).then(() => portefeuillesEnAttente(db)).catch((e) => console.error('[Prestataires BODACC] relevé :', e.message));
  return { lance: true };
}
const _reinitialiser = () => { enCours = null; };

module.exports = { controlerIdentites, indicesIdentite, horsPortefeuille, NAF_WEB, assurerTables, annoncesDuJour, liquidateur, domainesCandidats, choisirSite, clientsCites, decouvrirPortefeuille, traiterAnnonce, relever, portefeuillesEnAttente, lister, lancer, start, texteMail, _reinitialiser };
