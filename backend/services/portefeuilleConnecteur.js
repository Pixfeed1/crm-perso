// Connecteur Claude.ai : portefeuille (crawl, prospects, clients, signaux). Les actions passent par le MÊME
// code que les boutons de l'interface (handlers appelés en interne) : mêmes contrôles, mêmes verrous.
// Aucun appel à l'API Claude : crawler, SIRENE et AFNIC tournent sur le serveur.
// Jamais : envoi d'email, suppression, modification d'une fiche client, d'une facture ou d'un devis.
const crawlCtrl = require('../controllers/crawlController');
const interactionCtrl = require('../controllers/interactionController');
const signalCtrl = require('../controllers/domainSignalController');
const reanalyse = require('./leadReanalyzeService');
const { auditFlags, PREUVE_KEYS } = require('../utils/prospectScore');

const err = (status, message) => Object.assign(new Error(message), { status });
const num = (v, quoi = 'id') => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw err(400, `${quoi} : numéro attendu`); return n; };
const nums = (l) => [...new Set((Array.isArray(l) ? l : [l]).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
const sansVide = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)));
const court = (s, n = 300) => (s ? (String(s).length > n ? `${String(s).slice(0, n)}…` : String(s)) : undefined);

// Appelle un handler Express de l'interface avec une requête interne ; erreur HTTP → exception.
function appel(handler, db, { params = {}, body = {}, query = {} } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(d) { resolve({ status: this.statusCode, data: d }); return this; },
      send(d) { resolve({ status: this.statusCode, data: d }); return this; },
      set() { return this; }, setHeader() {}, end() { resolve({ status: this.statusCode }); },
    };
    Promise.resolve(handler({ app: { locals: { db } }, params, body, query, user: {} }, res)).catch(reject);
  }).then((r) => {
    if (r.status >= 400) throw err(r.status, (r.data && r.data.message) || `erreur ${r.status}`);
    return r.data;
  });
}

// ---------- crawl ----------
async function lancerCrawl(db, { techno, nb_sites: nb } = {}) {
  const r = await appel(crawlCtrl.start, db, { body: { techno, nb_sites: nb } });
  return { job_id: r.id, lance: true, suivi: 'etat_crawl avec ce job_id (recherche dans Common Crawl, puis analyse de chaque site)' };
}
async function etatCrawl(db, { job_id: jobId = null } = {}) {
  const j = jobId ? (await db.pool.query('SELECT * FROM crawl_jobs WHERE id = $1', [num(jobId, 'job_id')])).rows[0]
    : (await db.pool.query("SELECT * FROM crawl_jobs WHERE techno <> 'reanalyse' ORDER BY id DESC LIMIT 1")).rows[0];
  if (!j) throw err(404, jobId ? `crawl ${jobId} introuvable` : 'aucun crawl');
  const c = (await db.pool.query('SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE added_as_prospect)::int AS prospects, COUNT(*) FILTER (WHERE error IS NOT NULL AND error <> \'\')::int AS erreurs FROM crawl_results WHERE job_id = $1', [j.id])).rows[0];
  return sansVide({ job_id: j.id, techno: j.techno, sites_demandes: j.nb_sites, statut: j.statut, phase: j.phase, avancement: j.progress_total ? `${j.progress_done || 0}/${j.progress_total}` : undefined, message: court(j.message, 500), lance_le: j.created_at, resultats: c.n, deja_prospects: c.prospects, en_erreur: c.erreurs });
}
const CHAMPS_RESULTAT = ['id', 'job_id', 'domain', 'final_url', 'http_status', 'title', 'platform', 'platform_version', 'site_type', 'email', 'phone', 'ville', 'code_postal_site', 'raison_sociale', 'siren', 'identite_source', 'gerant', 'prestataire', 'score', 'analyse_le', 'panne_confirmee', 'parked', 'protected', 'error', 'added_as_prospect', 'facebook_url', 'instagram_url'];
async function lireResultat(db, { id } = {}) {
  const r = (await db.pool.query('SELECT * FROM crawl_results WHERE id = $1', [num(id)])).rows[0];
  if (!r) throw err(404, `résultat de crawl ${id} introuvable`);
  const flags = auditFlags(r);
  const lead = (await db.pool.query('SELECT id, relation_status FROM leads WHERE crawl_result_id = $1 ORDER BY id LIMIT 1', [r.id])).rows[0];
  const base = Object.fromEntries(CHAMPS_RESULTAT.filter((k) => k in r).map((k) => [k, r[k]]));
  return sansVide({ ...base, preuves: flags.filter((f) => PREUVE_KEYS.has(f.key)).map((f) => f.label), indices: flags.filter((f) => !PREUVE_KEYS.has(f.key)).map((f) => f.label), prospect: lead ? { lead_id: lead.id, relation: lead.relation_status || 'nouveau' } : undefined });
}
async function convertir(db, { result_ids: ids = [], pas_business: pb = false, note = '' } = {}) {
  const liste = nums(ids);
  if (!liste.length) throw err(400, 'result_ids : au moins un résultat de crawl');
  const { rows } = await db.pool.query('SELECT id, job_id FROM crawl_results WHERE id = ANY($1::int[])', [liste]);
  const inconnus = liste.filter((x) => !rows.some((r) => r.id === x));
  const parJob = {};
  for (const r of rows) (parJob[r.job_id] = parJob[r.job_id] || []).push(r.id);
  const out = { crees: 0, lead_ids: [], ignores: inconnus.map((x) => ({ result_id: x, raison: 'introuvable' })) };
  for (const [job, l] of Object.entries(parJob)) {
    const r = await appel(crawlCtrl.toProspect, db, { params: { id: job }, body: { result_ids: l, relation_status: pb ? 'pas_business' : 'nouveau', note } });
    out.crees += r.created || 0;
    out.lead_ids.push(...(r.lead_ids || r.leadIds || []));
    for (const s of r.skipped || []) out.ignores.push(s);
  }
  return sansVide({ ...out, statut: pb ? 'pas_business' : 'nouveau' });
}
async function reanalyser(db, { lead_id: leadId = null, result_id: resultId = null } = {}) {
  if (!leadId && !resultId) throw err(400, 'lead_id (fiche prospect) ou result_id (résultat de crawl)');
  const r = leadId ? { lead_id: num(leadId, 'lead_id'), ...(await reanalyse.reanalyzeLead(db, num(leadId, 'lead_id'))) } : await reanalyse.reanalyzeResult(db, num(resultId, 'result_id'));
  delete r.crawl_audit;
  return sansVide(r);
}

// ---------- prospects ----------
async function lireProspect(db, { id } = {}) {
  const l = (await db.pool.query('SELECT * FROM leads WHERE id = $1', [num(id)])).rows[0];
  if (!l) throw err(404, `prospect ${id} introuvable`);
  const res = l.crawl_result_id ? await lireResultat(db, { id: l.crawl_result_id }).catch(() => null) : null;
  const q = (sql, p) => db.pool.query(sql, p).then((x) => x.rows).catch(() => []);
  const [inter, affaires, campagnes, refus, contacts] = await Promise.all([
    q("SELECT id, type, reached, date, notes, result, relation_status, next_followup_date, next_followup_channel, followup_done FROM interactions WHERE contact_type = 'lead' AND contact_id = $1 ORDER BY date DESC, id DESC LIMIT 20", [l.id]),
    q('SELECT id, titre, type_besoin, etape, montant_ponctuel, montant_mensuel, prochaine_action_date, prochaine_action_canal, prochaine_action_note, motif FROM affaires WHERE lead_id = $1 ORDER BY id DESC', [l.id]),
    q('SELECT c.id, c.nom, i.statut, i.sent_at FROM campaign_items i JOIN campaigns c ON c.id = i.campaign_id WHERE i.lead_id = $1 ORDER BY i.id DESC LIMIT 10', [l.id]),
    q('SELECT canal, motif, created_at FROM prospect_refus WHERE lead_id = $1 AND retire_le IS NULL', [l.id]),
    q('SELECT * FROM contacts WHERE lead_id = $1 ORDER BY name', [l.id]).then((l2) => l2.map((x) => sansVide({ id: x.id, nom: x.name, fonction: x.position || x.role || x.title, email: x.email, telephone: x.phone }))),
  ]);
  return sansVide({
    id: l.id, nom: l.name, entreprise: l.company, email: l.email, telephone: l.phone, site: l.website, ville: l.city, departement: l.department,
    relation: l.relation_status || 'nouveau', plateforme: l.platform, score: l.score, siren: l.siren, secteur: l.sector, source: l.source, notes: court(l.notes, 2000), cree_le: l.created_at,
    analyse_du_site: res ? sansVide({ result_id: res.id, analyse_le: res.analyse_le, http_status: res.http_status, preuves: res.preuves, indices: res.indices, identite: res.raison_sociale ? `${res.raison_sociale}${res.identite_source ? ` (${res.identite_source})` : ''}` : undefined, prestataire: res.prestataire }) : undefined,
    contacts, interactions: inter, affaires, campagnes, refus_prospection: refus,
  });
}

// ---------- clients ----------
async function listerClients(db, { recherche = '', relation = null, limite = 30, apres = 0 } = {}) {
  const t = String(recherche || '').trim();
  const { rows } = await db.pool.query(
    `SELECT c.id, c.name, c.email, c.phone, c.status, COALESCE(c.relation_status, 'nouveau') AS relation, c.category,
            (SELECT COUNT(*) FROM maintenance_contracts m WHERE m.client_id = c.id AND m.status = 'active')::int AS contrats_actifs,
            (SELECT COALESCE(SUM(amount_remaining), 0) FROM invoices f WHERE f.client_id = c.id AND f.payment_status IS DISTINCT FROM 'paid' AND f.status IS DISTINCT FROM 'cancelled')::float AS reste_a_payer,
            (SELECT MAX(date) FROM interactions i WHERE i.contact_type = 'client' AND i.contact_id = c.id) AS dernier_echange
       FROM crm_clients c
      WHERE ($1 = '' OR c.name ILIKE $2 OR c.email ILIKE $2 OR c.phone ILIKE $2) AND ($3::text IS NULL OR COALESCE(c.relation_status, 'nouveau') = $3)
      ORDER BY c.name LIMIT $4 OFFSET $5`, [t, `%${t}%`, relation, Math.min(200, Number(limite) || 30), Number(apres) || 0]);
  return { clients: rows.map((r) => sansVide({ id: r.id, nom: r.name, email: r.email, telephone: r.phone, statut: r.status, relation: r.relation, categorie: r.category, contrats_actifs: r.contrats_actifs || undefined, reste_a_payer: r.reste_a_payer || undefined, dernier_echange: r.dernier_echange })) };
}
async function lireClient(db, { id } = {}) {
  const c = (await db.pool.query('SELECT * FROM crm_clients WHERE id = $1', [num(id)])).rows[0];
  if (!c) throw err(404, `client ${id} introuvable`);
  const q = (sql) => db.pool.query(sql, [c.id]).then((x) => x.rows).catch(() => []);
  const [inter, contrats, abonnements, factures, devis, projets, affaires] = await Promise.all([
    q("SELECT id, type, reached, date, notes, result, relation_status, next_followup_date, next_followup_channel, followup_done FROM interactions WHERE contact_type = 'client' AND contact_id = $1 ORDER BY date DESC, id DESC LIMIT 20"),
    q('SELECT id, site_name, site_url, plan, monthly_amount, status, billing_status, contract_start_date, last_backup_date, last_update_date, next_report_due FROM maintenance_contracts WHERE client_id = $1 ORDER BY id DESC'),
    q('SELECT id, label, amount_eur, billing_interval, billing_status FROM subscriptions WHERE client_id = $1 ORDER BY id DESC'),
    q('SELECT id, invoice_number, title, status, payment_status, total_ttc, amount_remaining, issue_date, due_date FROM invoices WHERE client_id = $1 ORDER BY issue_date DESC NULLS LAST, id DESC LIMIT 15'),
    q('SELECT id, quote_number, title, status, total_ttc, issue_date, signed_at FROM quotes WHERE client_id = $1 ORDER BY id DESC LIMIT 10'),
    q('SELECT id, name, status, start_date, end_date, budget FROM projects WHERE client_id = $1 ORDER BY id DESC LIMIT 10'),
    q('SELECT id, titre, type_besoin, etape, montant_ponctuel, montant_mensuel, prochaine_action_date, prochaine_action_note FROM affaires WHERE client_id = $1 ORDER BY id DESC'),
  ]);
  return sansVide({
    id: c.id, nom: c.name, email: c.email, telephone: c.phone, adresse: c.address, siret: c.siret, statut: c.status, relation: c.relation_status || 'nouveau', categorie: c.category, notes: court(c.notes, 2000), cree_le: c.created_at,
    interactions: inter, contrats_maintenance: contrats, abonnements, factures, devis, projets, affaires,
  });
}

// ---------- interactions (prospect ou client) : journal seulement, rien n'est envoyé ----------
async function interagir(db, { contact_type: type, contact_id: idc, type: nature, notes = null, reached = null, resultat = null, relation_status = null, relance_le = null, relance_canal = null, date = null } = {}) {
  if (!['lead', 'client'].includes(type)) throw err(400, 'contact_type : lead (prospect) ou client');
  const table = type === 'lead' ? 'leads' : 'crm_clients';
  const ex = (await db.pool.query(`SELECT id FROM ${table} WHERE id = $1`, [num(idc, 'contact_id')])).rows[0];
  if (!ex) throw err(404, `${type === 'lead' ? 'prospect' : 'client'} ${idc} introuvable`);
  if (!notes && !relation_status && !relance_le) throw err(400, 'notes, relation_status ou relance_le : au moins un');
  const r = await appel(interactionCtrl.create, db, { body: { contact_type: type, contact_id: ex.id, type: nature || 'note', notes, reached, result: resultat, relation_status, next_followup_date: relance_le, next_followup_channel: relance_canal, date } });
  return sansVide({ interaction_id: r.id, contact_type: type, contact_id: ex.id, type: r.type, relation_status: r.relation_status, relance_le: r.next_followup_date, relance_canal: r.next_followup_channel, note: 'journal du CRM seulement : aucun message envoyé' });
}

// ---------- signaux : nouveaux domaines (AFNIC) ----------
async function signauxDomaines(db, { statut = null, limite = 50 } = {}) {
  const r = await appel(signalCtrl.list, db, { query: { statut: statut || undefined, limit: String(Math.min(200, Number(limite) || 50)) } });
  return {
    compteurs: r.counts, en_cours: r.busy || undefined,
    signaux: (r.signals || []).map((s) => sansVide({ id: s.id, domaine: s.domain, statut: s.statut, metier: s.metier, entreprise: s.company_name, siren: s.siren, dirigeant: s.dirigeant, ville: s.city, departement: s.department, cree_le: s.company_created_at, site: s.website_status, plateforme: s.platform, email: s.email, telephone: s.phone, score_intention: s.intent_score, raison_rejet: s.raison_rejet, prospect_id: s.prospect_id, notes: court(s.notes) })),
  };
}
async function promouvoirSignaux(db, { ids = [], pas_business: pb = false, note = '' } = {}) {
  const l = nums(ids);
  if (!l.length) throw err(400, 'ids : au moins un signal');
  return appel(signalCtrl.promote, db, { body: { ids: l, relation_status: pb ? 'pas_business' : 'nouveau', note } });
}

module.exports = { appel, lancerCrawl, etatCrawl, lireResultat, convertir, reanalyser, lireProspect, listerClients, lireClient, interagir, signauxDomaines, promouvoirSignaux };
