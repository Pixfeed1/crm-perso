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
const ANS_COPYRIGHT = 2;                    // copyright de N ans ou plus : site à l'abandon (indice)
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
}

// ---------- inventaire : les prestataires crédités dans les crawls et les fiches ----------
async function inventaire(db) {
  await assurerTables(db.pool);
  const { rows } = await db.pool.query(
    `SELECT DISTINCT LOWER(prestataire) AS p FROM crawl_results WHERE prestataire IS NOT NULL AND prestataire <> ''
     UNION SELECT DISTINCT LOWER(prestataire) FROM leads WHERE prestataire IS NOT NULL AND prestataire <> ''`);
  const domaines = [...new Set(rows.map((r) => hote(r.p)).filter(Boolean))];
  let nouveaux = 0;
  for (const d of domaines) {
    const r = await db.pool.query('INSERT INTO prestataires (domaine) VALUES ($1) ON CONFLICT (domaine) DO NOTHING RETURNING domaine', [d]);
    nouveaux += r.rowCount;
  }
  return { prestataires: domaines.length, nouveaux };
}

// Sites clients d'un prestataire : résultats de crawl et fiches qui le créditent.
const SQL_CLIENTS = `
  SELECT r.id AS result_id, r.domain, r.platform, r.email, r.http_status, l.id AS lead_id, l.relation_status,
         EXISTS (SELECT 1 FROM email_optout o WHERE o.email = LOWER(COALESCE(l.email, r.email))) AS desinscrit
    FROM crawl_results r LEFT JOIN leads l ON l.crawl_result_id = r.id
   WHERE LOWER(REGEXP_REPLACE(r.prestataire, '^www\\.', '')) = $1
  UNION ALL
  SELECT NULL, l.company, l.platform, l.email, NULL, l.id, l.relation_status,
         EXISTS (SELECT 1 FROM email_optout o WHERE o.email = LOWER(l.email))
    FROM leads l WHERE l.crawl_result_id IS NULL AND LOWER(REGEXP_REPLACE(l.prestataire, '^www\\.', '')) = $1`;
async function clients(db, domaine) {
  const { rows } = await db.pool.query(SQL_CLIENTS, [hote(domaine)]);
  const vus = new Set();
  return rows.filter((r) => { const k = String(r.domain || '').toLowerCase(); if (vus.has(k)) return false; vus.add(k); return true; });
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

// Site du prestataire : indice d'abandon (jamais une preuve citable).
function indiceSite(row, maintenant = new Date()) {
  if (!row) return { type: 'site', niveau: 1, nature: 'site du prestataire injoignable', date: maintenant.toISOString().slice(0, 10) };
  const code = Number(row.http_status) || 0;
  const annee = Number(row.copyright_annee) || null;
  const parque = row.parked === true || row.parked === 'oui' || row.parked === 'true';
  let nature = null;
  if (!code) nature = 'site du prestataire injoignable';
  else if (code >= 400) nature = `site du prestataire en erreur (${code})`;
  else if (parque) nature = 'domaine du prestataire parqué (page de parking)';
  else if (annee && annee <= maintenant.getFullYear() - ANS_COPYRIGHT) nature = `site du prestataire figé (copyright ${annee})`;
  return nature ? { type: 'site', niveau: 1, nature, date: maintenant.toISOString().slice(0, 10) } : null;
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
async function verifier(db, { domaines = null, limite = 200, pas_depuis: depuis = null } = {}, deps = {}) {
  const x = D(deps);
  await assurerTables(db.pool);
  const liste = domaines && domaines.length
    ? (await db.pool.query('SELECT * FROM prestataires WHERE domaine = ANY($1::text[])', [domaines.map(hote)])).rows
    : (await db.pool.query('SELECT * FROM prestataires WHERE ignore_le IS NULL AND ($2::timestamptz IS NULL OR verifie_le IS NULL OR verifie_le < $2) ORDER BY verifie_le NULLS FIRST LIMIT $1', [limite, depuis])).rows;
  if (!liste.length) return { verifies: 0, resultats: [] };
  const lignes = await x.detect(liste.map((p) => p.domaine)).catch(() => []);
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
    const indice = indiceSite(row, maintenant);
    if (indice) preuves.push(indice);
    preuves.sort((a, b) => (b.niveau - a.niveau) || String(b.date || '').localeCompare(String(a.date || '')));
    const { gravite, statut } = conclure(preuves);
    const contact = row ? { email: row.email || null, telephone: row.phone || null, titre: row.title || null } : p.contact;
    await db.pool.query(
      `UPDATE prestataires SET nom = $2, siren = $3, siren_source = $4, statut = $5, gravite = $6, preuves = $7, site = $8, contact = $9, verifie_le = $10, erreur = $11 WHERE domaine = $1`,
      [p.domaine, nom || null, siren || null, source || null, statut, gravite, JSON.stringify(preuves),
        JSON.stringify(row ? { http_status: row.http_status || null, parked: row.parked || null, copyright_annee: row.copyright_annee || null, title: row.title || null } : null),
        JSON.stringify(contact || null), maintenant, erreurs.join(' ; ') || null]);
    resultats.push({ domaine: p.domaine, statut, gravite, siren: siren || null, erreur: erreurs.join(' ; ') || undefined });
    if (x.pause) await sleep(x.pause);
  }
  return { verifies: resultats.length, resultats };
}

// ---------- lecture ----------
async function lister(db, { gravite_min = 1, statut = null, avec_ignores = false, limite = 200 } = {}) {
  await assurerTables(db.pool);
  const { rows } = await db.pool.query(
    `SELECT p.*, (SELECT COUNT(*)::int FROM crawl_results r WHERE LOWER(REGEXP_REPLACE(r.prestataire, '^www\\.', '')) = p.domaine)
              + (SELECT COUNT(*)::int FROM leads l WHERE l.crawl_result_id IS NULL AND LOWER(REGEXP_REPLACE(l.prestataire, '^www\\.', '')) = p.domaine) AS nb_clients
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
  const ligne = preuve ? `Prestataire crédité : ${p.nom || p.domaine} (${p.domaine}) : ${preuve.nature}${preuve.date ? ` (${preuve.source}, ${new Date(preuve.date).toLocaleDateString('fr-FR')})` : ''}${preuve.niveau === 1 ? ', indice à vérifier, ne pas le citer' : ''}` : `Prestataire crédité : ${p.domaine}`;
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
    ...(p.preuves || []).map((x) => `• ${x.nature}${x.date ? ` (${x.source}, ${new Date(x.date).toLocaleDateString('fr-FR')})` : ''}${x.url ? ` : ${x.url}` : ''}${x.niveau === 1 ? ' [indice]' : ''}`),
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
    try { await inventaire(db); const debut = new Date(enCours); let n = 0; for (;;) { const r = await verifier(db, { limite: 100, pas_depuis: debut }); n += r.verifies; if (r.verifies < 100 || n >= 3000) break; } console.log(`[Prestataires] ${n} vérifié(s)`); }
    catch (e) { console.error('[Prestataires] vérification :', e.message); }
    finally { enCours = null; }
  })();
  return { lancee: true };
}
function etat() { return { en_cours: enCours }; }
function start(db) {
  const cron = require('node-cron');
  assurerTables(db.pool).catch((e) => console.error('[Prestataires] table :', e.message));
  cron.schedule('7 6 * * 1', () => lancer(db), { timezone: 'Europe/Paris' });
}

module.exports = { assurerTables, inventaire, verifier, lister, detail, clients, signalPourSite, promouvoir, versCampagne, ficheDuPrestataire, ignorer, lancer, etat, start, preuveBodacc, indiceSite, conclure, annoncesBodacc };
