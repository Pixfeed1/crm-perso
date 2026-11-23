// Signal « prestataire en difficulté ou disparu » (Portefeuille > Signaux > Prestataires).
//
// Les crawls relèvent l'agence ou le freelance crédité en pied de page de chaque site (« Réalisé par »…,
// colonne prestataire). Ce service en fait une liste de prestataires, cherche leur SIREN (mentions légales de leur
// site, sinon rapprochement sûr par le nom), puis vérifie chaque semaine trois niveaux de preuve :
//   3  procédure collective publiée au BODACC (sauvegarde, redressement, liquidation…) : fait daté, avec le lien ;
//   2  entreprise fermée : radiation publiée au BODACC, ou unité cessée dans SIRENE (freelances en micro-entreprise,
//      que le BODACC ne voit presque jamais) ;
//   1  site du prestataire à l'abandon (ne répond plus, parqué, copyright de deux ans ou plus) : INDICE seulement,
//      jamais cité dans un email.
// Sans SIREN sûr, seul le niveau 1 est vérifié : jamais de BODACC sur un homonyme.
// Les sites clients deviennent des prospects (ou entrent dans une campagne, préparée seulement) ; l'email par la
// preuve en tire l'angle « prestataire » (niveaux 2 et 3 seulement). Rien n'est jamais envoyé sans Marc.
const axios = require('axios');
const sirene = require('./sireneEnrich');

const BODACC_URL = () => process.env.BODACC_API_URL || 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records';
const MOIS_BODACC = 36;                     // annonces prises en compte
const ANS_COPYRIGHT = 2;                    // copyright de N ans ou plus : indice FAIBLE (jamais seul)
const ECHECS_SITE = 2;                      // site injoignable ou en erreur : compte après N vérifications de suite

// Faux prestataires : liens de pied de page qui ne désignent pas une agence (hébergeurs, CMS, réseaux sociaux,
// outils, raccourcisseurs). Écartés avant toute vérification ; ceux déjà en base sont retirés à la suivante.
// MARQUES : un niveau du domaine égal au nom, quel que soit le suffixe (« ovh » écarte ovh.com, ovh.net,
// ftp.ovh.fr ; pas agence-ovh.fr) ; DOMAINES : ce domaine exact et ses sous-domaines. À compléter au besoin.
const PRESTATAIRES_EXCLUS = {
  marques: ['hostinger', 'ovh', 'ovhcloud', 'o2switch', 'ionos', '1and1', 'gandi', 'wix', 'wixsite', 'squarespace', 'wordpress', 'shopify',
    'myshopify', 'prestashop', 'google', 'facebook', 'instagram', 'linkedin', 'youtube', 'tiktok', 'twitter', 'pinterest', 'cloudflare'],
  domaines: ['maps.app.goo.gl', 'goo.gl', 'g.page', 'g.co', 'youtu.be', 'fb.me', 'x.com', 't.co', 'bit.ly', 'linktr.ee', 'lnkd.in'],
};
function estExclu(domaine) {
  const d = hote(domaine);
  if (!d) return true;
  if (PRESTATAIRES_EXCLUS.domaines.some((x) => d === x || d.endsWith(`.${x}`))) return true;
  return d.split('.').slice(0, -1).some((niveau) => PRESTATAIRES_EXCLUS.marques.includes(niveau));
}
async function retirerExclus(db) {
  const { rows } = await db.pool.query('SELECT domaine FROM prestataires');
  const exclus = rows.map((r) => r.domaine).filter(estExclu);
  if (exclus.length) await db.pool.query('DELETE FROM prestataires WHERE domaine = ANY($1::text[])', [exclus]);
  return exclus;
}
const err = (status, message) => Object.assign(new Error(message), { status });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hote = (x) => String(x || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0] || null;

// ---------- tables ----------
async function assurerTables(q) {
  await q.query(`
    CREATE TABLE IF NOT EXISTS prestataires (
      domaine        TEXT PRIMARY KEY,
      nom            TEXT,
      siren          TEXT,
      siren_source   TEXT,
      statut         TEXT DEFAULT 'a_verifier',   -- procedure | ferme | abandon | actif | a_verifier
      gravite        INTEGER DEFAULT 0,            -- 3 procédure, 2 fermé, 1 indice, 0 rien
      preuves        JSONB DEFAULT '[]',
      site           JSONB,
      contact        JSONB,
      verifie_le     TIMESTAMPTZ,
      erreur         TEXT,
      ignore_le      TIMESTAMPTZ,
      ignore_raison  TEXT,
      fiche_lead_id  INTEGER,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    );`);
  await q.query('CREATE INDEX IF NOT EXISTS idx_prestataires_gravite ON prestataires (gravite DESC, verifie_le)');
  await q.query('ALTER TABLE prestataires ADD COLUMN IF NOT EXISTS echecs_site INTEGER DEFAULT 0');   // vérifications de suite en échec
}

// ---------- inventaire : les prestataires crédités dans les crawls et les fiches ----------
async function inventaire(db) {
  await assurerTables(db.pool);
  const { rows } = await db.pool.query(
    `SELECT DISTINCT ${NORM('prestataire')} AS p FROM crawl_results WHERE prestataire IS NOT NULL AND prestataire <> ''
     UNION SELECT DISTINCT ${NORM('prestataire')} FROM leads WHERE prestataire IS NOT NULL AND prestataire <> ''`);
  const domaines = [...new Set(rows.map((r) => hote(r.p)).filter(Boolean))].filter((d) => !estExclu(d));
  const retires = await retirerExclus(db);
  let nouveaux = 0;
  for (const d of domaines) {
    const r = await db.pool.query('INSERT INTO prestataires (domaine) VALUES ($1) ON CONFLICT (domaine) DO NOTHING RETURNING domaine', [d]);
    nouveaux += r.rowCount;
  }
  return { prestataires: domaines.length, nouveaux, retires };
}

// Prestataire tel qu'enregistré (« https://www.agence.fr/ », « www.agence.fr »…) ramené au domaine nu, comme hote().
const NORM = (col) => `LOWER(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(TRIM(${col}), '^https?://', '', 'i'), '^www\\.', '', 'i'), '[/?#].*$', ''))`;
// Sites clients d'un prestataire : résultats de crawl qui le créditent, et fiches qui le créditent (avec ou sans
// résultat de crawl rattaché) ; un même site n'est compté qu'une fois.
const SQL_CLIENTS_BASE = `
  SELECT r.id AS result_id, r.domain AS domain, r.platform, r.http_status, l.id AS lead_id, l.relation_status, COALESCE(l.email, r.email) AS email
    FROM crawl_results r LEFT JOIN leads l ON l.crawl_result_id = r.id
   WHERE ${NORM('r.prestataire')} = $1
  UNION ALL
  SELECT r.id, COALESCE(r.domain, ${NORM('l.website')}, l.company), COALESCE(r.platform, l.platform), r.http_status, l.id, l.relation_status, COALESCE(l.email, r.email)
    FROM leads l LEFT JOIN crawl_results r ON r.id = l.crawl_result_id
   WHERE ${NORM('l.prestataire')} = $1`;
const SQL_CLIENTS = `SELECT c.*, EXISTS (SELECT 1 FROM email_optout o WHERE o.email = LOWER(c.email)) AS desinscrit FROM (${SQL_CLIENTS_BASE}) c ORDER BY c.lead_id NULLS LAST`;
async function clients(db, domaine) {
  const { rows } = await db.pool.query(SQL_CLIENTS, [hote(domaine)]);
  const vus = new Set();
  return rows.filter((r) => { const k = String(r.domain || '').toLowerCase().replace(/^www\./, ''); if (vus.has(k)) return false; vus.add(k); return true; });
}

// ---------- sources ----------
// BODACC (open data DILA) : annonces d'un SIREN. registre = ["123 456 789", "123456789"] selon les annonces.
async function annoncesBodacc(siren) {
  const s = String(siren).replace(/\D/g, '');
  const espace = `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6)}`;
  const res = await axios.get(BODACC_URL(), {
    params: { where: `registre="${s}" OR registre="${espace}"`, order_by: 'dateparution desc', limit: 50 },
    timeout: 20000, headers: { 'User-Agent': 'CRM-PixFeed/1.0' }, validateStatus: () => true,
  });
  if (res.status >= 400) throw new Error(`BODACC a répondu ${res.status}${res.data && res.data.message ? ` : ${res.data.message}` : ''}`);
  const recs = (res.data && (res.data.results || res.data.records)) || [];
  return recs.map((x) => x.fields || x).filter((x) => [].concat(x.registre || []).some((v) => String(v).replace(/\D/g, '') === s));
}
const json = (v) => { if (!v) return null; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return null; } };

// Une annonce → preuve normalisée (null si sans intérêt : immatriculation, modification, dépôt des comptes…).
function preuveBodacc(a) {
  const famille = String(a.familleavis || '').toLowerCase();
  const libelle = String(a.familleavis_lib || '');
  const j = json(a.jugement) || {};
  const base = { source: 'BODACC', date: a.dateparution || null, tribunal: a.tribunal || null, url: a.url_complete || (a.id ? `https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=id:${a.id}` : null), commercant: a.commercant || null };
  if (famille === 'collective' || /proc[ée]dures? collectives?/i.test(libelle)) {
    const nature = j.nature || a.typeavis_lib || 'procédure collective';
    return { ...base, type: 'procedure', niveau: 3, nature, date_jugement: j.date || null };
  }
  if (famille === 'radiation' || /radiation/i.test(libelle)) return { ...base, type: 'radiation', niveau: 2, nature: 'radiation du registre du commerce' };
  // vente du fonds : la clientèle a sans doute un repreneur ; information seulement (jamais dans un email)
  if (famille === 'vente' || /ventes? et cessions?/i.test(libelle)) return { ...base, type: 'cession', niveau: 1, nature: 'vente ou cession du fonds publiée' };
  return null;
}

// Site du prestataire : indices (jamais une preuve citable). source « vérification du site ».
//   - injoignable ou en erreur : compte seulement après ECHECS_SITE vérifications de suite en échec ;
//   - domaine parqué : compte tout de suite ;
//   - copyright ancien : indice FAIBLE (niveau 0), affiché seulement s'il s'ajoute à un autre signal.
// echecsAvant : échecs consécutifs déjà comptés ; detectOk=false (analyse du lot en panne) : rien ne change.
function signauxSite(row, { maintenant = new Date(), echecsAvant = 0, detectOk = true } = {}) {
  const date = maintenant.toISOString().slice(0, 10);
  const indice = (niveau, nature, extra = {}) => ({ source: 'vérification du site', type: 'site', niveau, nature, date, ...extra });
  if (!detectOk) return { echecs: echecsAvant, preuves: [], faible: null };
  const code = row ? Number(row.http_status) || 0 : 0;
  if (!row || !code || code >= 400) {
    const echecs = echecsAvant + 1;
    const nature = !code ? 'site du prestataire injoignable' : `site du prestataire en erreur (${code})`;
    return { echecs, preuves: echecs >= ECHECS_SITE ? [indice(1, `${nature} lors de ${echecs} vérifications de suite`)] : [], faible: null };
  }
  const parque = row.parked === true || row.parked === 'oui' || row.parked === 'true';
  const annee = Number(row.copyright_annee) || null;
  return {
    echecs: 0,
    // En ligne, pas parqué, pied de page de cette année ou de l'an dernier : le prestataire travaille encore.
    a_jour: !parque && code < 400 && !!annee && annee >= maintenant.getFullYear() - 1 ? annee : null,
    preuves: parque ? [indice(1, 'domaine du prestataire parqué (page de parking)')] : [],
    faible: annee && annee <= maintenant.getFullYear() - ANS_COPYRIGHT ? indice(0, `pied de page du prestataire non mis à jour (copyright ${annee})`, { faible: true }) : null,
  };
}

// Statut d'ensemble à partir des preuves.
function conclure(preuves) {
  const g = preuves.reduce((m, p) => Math.max(m, p.niveau || 0), 0);
  const statut = g === 3 ? 'procedure' : g === 2 ? 'ferme' : g === 1 ? 'abandon' : 'actif';
  return { gravite: g, statut };
}

// deps (tests) : { detect(domaines) → lignes cc_prospector, parSiren, enrichMatch, bodacc(siren), maintenant }
const D = (deps = {}) => ({
  detect: (l) => require('./ccProspectorRunner').runDetect(l, { concurrency: 6, timeout: 12 }),
  parSiren: sirene.parSiren, enrichMatch: sirene.enrichMatch, bodacc: annoncesBodacc, maintenant: () => new Date(), pause: 200, ...deps,
});

// Vérifie un lot de prestataires (les plus anciennement vérifiés d'abord, ceux qui ont des clients).
async function verifier(db, { domaines = null, limite = 200, pas_depuis: depuis = null, surAvancee = null } = {}, deps = {}) {
  const x = D(deps);
  await assurerTables(db.pool);
  await retirerExclus(db);
  const liste = domaines && domaines.length
    ? (await db.pool.query('SELECT * FROM prestataires WHERE domaine = ANY($1::text[])', [domaines.map(hote)])).rows
    : (await db.pool.query('SELECT * FROM prestataires WHERE ignore_le IS NULL AND ($2::timestamptz IS NULL OR verifie_le IS NULL OR verifie_le < $2) ORDER BY verifie_le NULLS FIRST LIMIT $1', [limite, depuis])).rows;
  if (!liste.length) return { verifies: 0, resultats: [] };
  let detectOk = true;
  const lignes = await x.detect(liste.map((p) => p.domaine)).catch(() => { detectOk = false; return []; });
  const parDomaine = new Map(lignes.map((r) => [hote(r.domain), r]));
  const resultats = [];
  for (const p of liste) {
    const maintenant = x.maintenant();
    const preuves = [];
    const erreurs = [];
    const row = parDomaine.get(p.domaine) || null;
    // SIREN : lu dans les mentions légales du site du prestataire, sinon rapprochement SÛR par le nom.
    let siren = p.siren, source = p.siren_source, nom = p.nom, entreprise = null;
    const sirenSite = row && sirene.sirenValide(row.siren_site) ? String(row.siren_site) : null;
    try {
      if (sirenSite) { entreprise = await x.parSiren(sirenSite); if (entreprise.found) { siren = sirenSite; source = 'mentions légales du site'; } }
      else if (siren) entreprise = await x.parSiren(siren);
      else if (row && row.title) {
        const m = await x.enrichMatch({ query: row.title, domain: p.domaine, title: row.title, code_postal_site: row.code_postal_site || '' });
        if (m.found && ['sur', 'certain'].includes(m.match)) { entreprise = m; siren = m.siren; source = 'rapprochement sûr par le nom'; }
      }
    } catch (e) { erreurs.push(`annuaire des entreprises : ${e.message}`); }
    if (entreprise && entreprise.found) {
      nom = entreprise.raison_sociale || nom;
      if (entreprise.etat === 'C') preuves.push({ source: 'SIRENE', type: 'cessee', niveau: 2, nature: 'entreprise cessée dans le répertoire SIRENE', date: entreprise.date_fermeture || null, url: `https://annuaire-entreprises.data.gouv.fr/entreprise/${siren}` });
    }
    if (siren) {
      try {
        const limiteDate = new Date(maintenant.getTime() - MOIS_BODACC * 30.5 * 86400000).toISOString().slice(0, 10);
        for (const a of await x.bodacc(siren)) {
          const pr = preuveBodacc(a);
          if (pr && (!pr.date || pr.date >= limiteDate)) preuves.push(pr);
        }
      } catch (e) { erreurs.push(`BODACC : ${e.message}`); }
    }
    const site = signauxSite(row, { maintenant, echecsAvant: Number(p.echecs_site) || 0, detectOk });
    preuves.push(...site.preuves);
    if (site.faible && preuves.length) preuves.push(site.faible);   // copyright ancien : jamais seul
    preuves.sort((a, b) => (b.niveau - a.niveau) || String(b.date || '').localeCompare(String(a.date || '')));
    let { gravite, statut } = conclure(preuves);
    // Fermé selon les registres, mais site en ligne et à jour : les deux sources se contredisent (activité reprise
    // sous un autre numéro, homonyme…). « À vérifier », jamais cité dans un email. Une procédure collective n'est
    // pas concernée : l'entreprise continue souvent son activité pendant un redressement.
    if (statut === 'ferme' && site.a_jour) {
      statut = 'a_verifier'; gravite = 1;
      preuves.push({ source: 'vérification du site', type: 'contradiction', niveau: 1, date: maintenant.toISOString().slice(0, 10), nature: `fermé selon les registres, mais son site est toujours en ligne et à jour (copyright ${site.a_jour}) : activité peut-être reprise sous un autre numéro, à vérifier` });
    }
    const contact = row ? { email: row.email || null, telephone: row.phone || null, titre: row.title || null } : p.contact;
    await db.pool.query(
      `UPDATE prestataires SET nom = $2, siren = $3, siren_source = $4, statut = $5, gravite = $6, preuves = $7, site = $8, contact = $9, verifie_le = $10, erreur = $11, echecs_site = $12 WHERE domaine = $1`,
      [p.domaine, nom || null, siren || null, source || null, statut, gravite, JSON.stringify(preuves),
        JSON.stringify(row ? { http_status: row.http_status || null, parked: row.parked || null, copyright_annee: row.copyright_annee || null, title: row.title || null } : null),
        JSON.stringify(contact || null), maintenant, [erreurs.join(' ; ') || null, detectOk ? null : 'analyse des sites indisponible : site non vérifié cette fois'].filter(Boolean).join(' ; ') || null, site.echecs]);
    resultats.push({ domaine: p.domaine, statut, gravite, avant: p.statut, nom: nom || null, preuve: preuves[0] || null, siren: siren || null, erreur: erreurs.join(' ; ') || undefined });
    if (surAvancee) surAvancee(resultats[resultats.length - 1], resultats.length, liste.length);
    if (x.pause) await sleep(x.pause);
  }
  return { verifies: resultats.length, resultats };
}

// ---------- lecture ----------
async function lister(db, { gravite_min = 1, statut = null, avec_ignores = false, limite = 200 } = {}) {
  await assurerTables(db.pool);
  const { rows } = await db.pool.query(
    `SELECT p.*, (SELECT COUNT(DISTINCT LOWER(REGEXP_REPLACE(c.domain, '^www\\.', '')))::int FROM (${SQL_CLIENTS_BASE.replace(/\$1/g, 'p.domaine')}) c) AS nb_clients
       FROM prestataires p
      WHERE p.gravite >= $1 AND ($2::text IS NULL OR p.statut = $2) AND ($3 OR p.ignore_le IS NULL)
      ORDER BY p.gravite DESC, nb_clients DESC, p.domaine LIMIT $4`,
    [Number(gravite_min) || 0, statut, !!avec_ignores, Math.min(500, Number(limite) || 200)]);
  const totaux = (await db.pool.query(`SELECT statut, COUNT(*)::int AS n FROM prestataires WHERE ignore_le IS NULL GROUP BY statut`)).rows;
  return { prestataires: rows, totaux: Object.fromEntries(totaux.map((t) => [t.statut, t.n])) };
}
async function detail(db, domaine) {
  const p = (await db.pool.query('SELECT * FROM prestataires WHERE domaine = $1', [hote(domaine)])).rows[0];
  if (!p) throw err(404, `prestataire ${domaine} inconnu`);
  return { ...p, clients: await clients(db, p.domaine) };
}

// Le signal à joindre à un site client pour l'email par la preuve : niveaux 2 et 3 seulement (faits datés), et
// seulement si l'identité du prestataire est CERTAINE (SIREN lu dans ses mentions légales) : un rapprochement par
// le nom pourrait attribuer la procédure d'un homonyme.
async function signalPourSite(db, prestataire) {
  const d = hote(prestataire);
  if (!d) return null;
  const p = (await db.pool.query("SELECT * FROM prestataires WHERE domaine = $1 AND gravite >= 2 AND ignore_le IS NULL AND siren_source = 'mentions légales du site'", [d]).catch(() => ({ rows: [] }))).rows[0];
  if (!p) return null;
  const preuve = (p.preuves || []).find((x) => x.niveau >= 2 && ['procedure', 'radiation', 'cessee'].includes(x.type));
  return preuve ? { domaine: p.domaine, nom: p.nom || null, siren: p.siren, ...preuve } : null;
}

// ---------- actions ----------
// Les sites clients deviennent des prospects (ceux qui n'ont pas encore de fiche). Renvoie toutes les fiches.
async function promouvoir(db, domaine, { result_ids: ids = null } = {}) {
  const p = await detail(db, domaine);
  const crawl = require('../controllers/crawlController');
  const preuve = (p.preuves || [])[0];
  const ligne = preuve ? `Prestataire crédité : ${p.nom || p.domaine} (${p.domaine}) : ${preuve.nature}${preuve.date ? ` (${preuve.source || 'vérification du site'}, ${new Date(preuve.date).toLocaleDateString('fr-FR')})` : ''}${preuve.niveau < 2 ? ', indice à vérifier, ne pas le citer' : ''}` : `Prestataire crédité : ${p.domaine}`;
  const out = { creees: 0, deja: 0, lead_ids: [] };
  for (const c of p.clients) {
    if (ids && c.result_id && !ids.includes(Number(c.result_id))) continue;
    if (c.lead_id) { out.deja++; out.lead_ids.push(c.lead_id); continue; }
    if (!c.result_id) continue;
    const r = (await db.pool.query('SELECT * FROM crawl_results WHERE id = $1', [c.result_id])).rows[0];
    if (!r) continue;
    const id = await crawl.createLeadFromResult(db, r, { source: 'Signal prestataire', sourceLine: 'Signal « prestataire en difficulté ou disparu »', extraNotes: [ligne] });
    out.creees++; out.lead_ids.push(id);
  }
  return out;
}
async function versCampagne(db, domaine, campagneId) {
  const S = require('./campaignService');
  const pr = await promouvoir(db, domaine);
  if (!pr.lead_ids.length) throw err(400, 'aucun site client à ajouter');
  const out = await S.addLeads(db, Number(campagneId), pr.lead_ids);
  if (out.ajoutes) S.lancerReanalyse(db, Number(campagneId));
  return { ...out, fiches_creees: pr.creees, note: 'campagne préparée seulement : la validation et l\'envoi restent à Marc' };
}
// Fiche du prestataire lui-même (piste du rachat de portefeuille), à la demande.
async function ficheDuPrestataire(db, domaine) {
  const p = await detail(db, domaine);
  if (p.fiche_lead_id) {
    const ex = (await db.pool.query('SELECT id FROM leads WHERE id = $1', [p.fiche_lead_id])).rows[0];
    if (ex) return { lead_id: ex.id, deja: true };
  }
  const c = p.contact || {};
  const notes = [
    `Prestataire web crédité en pied de page de ${p.clients.length} site(s) de la base (piste : reprise de portefeuille).`,
    ...(p.preuves || []).map((x) => `• ${x.nature}${x.date ? ` (${x.source || 'vérification du site'}, ${new Date(x.date).toLocaleDateString('fr-FR')})` : ''}${x.url ? ` : ${x.url}` : ''}${x.niveau < 2 ? ' [indice]' : ''}`),
    `Sites clients : ${p.clients.slice(0, 30).map((x) => x.domain).join(', ')}${p.clients.length > 30 ? '…' : ''}`,
    'Approche : en message privé, jamais en public. Côté clients, PixFeed assure la suite, jamais « reprend les dossiers abandonnés ».',
  ].join('\n');
  const r = await db.pool.query(
    `INSERT INTO leads (name, company, type, status, source, notes, email, phone, relation_status, website, siren, created_at, updated_at)
     VALUES ($1, $2, 'company', 'nouveau', 'Signal prestataire', $3, $4, $5, 'nouveau', $6, $7, NOW(), NOW()) RETURNING id`,
    [p.nom || p.domaine, p.domaine, notes, c.email || null, c.telephone || null, `https://${p.domaine}`, p.siren || null]);
  await db.pool.query('UPDATE prestataires SET fiche_lead_id = $2 WHERE domaine = $1', [p.domaine, r.rows[0].id]);
  return { lead_id: r.rows[0].id, deja: false };
}
async function ignorer(db, domaine, { raison = null, retablir = false } = {}) {
  const r = await db.pool.query(`UPDATE prestataires SET ignore_le = ${retablir ? 'NULL' : 'NOW()'}, ignore_raison = $2 WHERE domaine = $1 RETURNING domaine`, [hote(domaine), retablir ? null : (raison || null)]);
  if (!r.rowCount) throw err(404, `prestataire ${domaine} inconnu`);
  return { domaine: r.rows[0].domaine, ignore: !retablir };
}

// Vérification de toute la liste en arrière-plan (bouton, et chaque lundi).
let enCours = null;
function lancer(db) {
  if (enCours) return { deja: true, depuis: enCours };
  enCours = new Date().toISOString();
  (async () => {
    try {
      await inventaire(db); const debut = new Date(enCours); let n = 0; const graves = [];
      for (;;) { const r = await verifier(db, { limite: 100, pas_depuis: debut }); n += r.verifies; graves.push(...r.resultats.filter((x) => ['procedure', 'ferme'].includes(x.statut) && !['procedure', 'ferme'].includes(x.avant))); if (r.verifies < 100 || n >= 3000) break; }
      console.log(`[Prestataires] ${n} vérifié(s), ${graves.length} nouveau(x) en difficulté`);
      if (graves.length) await alerterNouveaux(db, graves).catch((e) => console.error('[Prestataires] mail :', e.message));
      // Leurs clients, d'après leurs pages de références.
      await require('./prestatairesBodacc').portefeuillesEnAttente(db).catch((e) => console.error('[Prestataires] références :', e.message));
    }
    catch (e) { console.error('[Prestataires] vérification :', e.message); }
    finally { enCours = null; }
  })();
  return { lancee: true };
}
function etat() { return { en_cours: enCours }; }
// Mail : prestataires déjà connus passés en procédure collective ou fermés à cette vérification.
async function alerterNouveaux(db, liste) {
  const lignes = [];
  for (const x of liste) {
    const n = (await clients(db, x.domaine)).length;
    lignes.push(`• ${x.nom || x.domaine} (${x.domaine}) : ${x.preuve ? x.preuve.nature : x.statut}${x.preuve && x.preuve.date ? ` (${x.preuve.source}, ${new Date(x.preuve.date).toLocaleDateString('fr-FR')})` : ''} · ${n} site(s) client(s)`);
  }
  const mail = require('./emailService');
  const to = process.env.ALERT_EMAIL || process.env.REPORT_REPLY_TO || process.env.EMAIL_USER;
  if (!to) return;
  const texte = `${liste.length} prestataire(s) crédité(s) sur vos sites crawlés vien(nen)t de passer en difficulté :\n\n${lignes.join('\n')}\n\nÀ suivre dans le CRM : Portefeuille > Signaux > Prestataires en difficulté.`;
  await mail.sendEmail({ to, subject: `Prestataires en difficulté : ${liste.length} nouveau(x)`, text: texte, html: `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;white-space:pre-line">${texte.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</div>` });
}
function start(db) {
  const cron = require('node-cron');
  assurerTables(db.pool).catch((e) => console.error('[Prestataires] table :', e.message));
  cron.schedule('7 6 * * 1', () => lancer(db), { timezone: 'Europe/Paris' });
}

module.exports = { assurerTables, inventaire, verifier, lister, detail, clients, signalPourSite, promouvoir, versCampagne, ficheDuPrestataire, ignorer, lancer, etat, start, preuveBodacc, signauxSite, conclure, annoncesBodacc, estExclu, PRESTATAIRES_EXCLUS };
