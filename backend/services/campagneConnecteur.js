// Campagnes de prospection par email, côté connecteur MCP (Claude dans Cowork) : tout lire et tout préparer,
// mais la validation des lignes, la programmation des envois, la reprise d'une campagne en pause et la
// suppression restent à Marc, dans l'interface (règle : aucun envoi réel sans validation explicite).
// Mêmes fonctions que l'interface (services/campaignService.js), donc mêmes contrôles : désinscriptions, refus
// de prospection, déjà-sollicités, formulations interdites, régénération encadrée.
// Les gros travaux (réécriture de nombreuses lignes, réanalyse des sites) tournent sur le serveur du CRM, avec la
// clé API du CRM (ANTHROPIC_API_KEY), et renvoient un résumé court : ils ne consomment pas Claude.ai.
const S = require('./campaignService');
const boite = require('./boiteService');

const err = (status, message) => Object.assign(new Error(message), { status });
const id = (v, quoi = 'id') => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw err(400, `${quoi} : numéro attendu`); return n; };
const ids = (l) => [...new Set((Array.isArray(l) ? l : [l]).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
const RESERVE = "réservé à Marc, dans l'interface du CRM (aucun envoi sans sa validation)";
const MODES = ['preuve', 'maintenance', 'modele', 'claude'];
const extrait = (s, n = 160) => (s ? (String(s).length > n ? `${String(s).slice(0, n)}…` : String(s)) : undefined);

// ---------- lecture ----------
async function lister(db) {
  const l = await S.listCampaigns(db);
  return { campagnes: l.map((c) => ({ id: c.id, nom: c.nom, statut: c.statut, mode: c.mode, cree_le: c.created_at, par_jour: c.par_jour, lignes: c.nb_items, ...Object.fromEntries(Object.entries(c).filter(([k]) => k.startsWith('nb_'))), message: c.message || undefined })) };
}

// Une campagne : réglages, statistiques, entonnoir, test A/B, et ses lignes (sans les textes par défaut, pour
// rester court ; textes=true ou ligne pour les lire).
async function lire(db, { id: cid, statut = null, textes = false, limite = 50, apres = 0 } = {}) {
  const f = await S.getCampaignFull(db, id(cid));
  const statuts = statut ? (Array.isArray(statut) ? statut : [statut]) : null;
  const toutes = f.items.filter((i) => !statuts || statuts.includes(i.statut));
  const page = toutes.slice(Number(apres) || 0, (Number(apres) || 0) + Math.min(200, Number(limite) || 50));
  const parStatut = {};
  for (const i of f.items) parStatut[i.statut] = (parStatut[i.statut] || 0) + 1;
  const c = f.campaign;
  return {
    campagne: {
      id: c.id, nom: c.nom, statut: c.statut, mode: c.mode, message: c.message || undefined, expediteur: c.from_account,
      cadence: { par_jour: c.par_jour, heure_debut: c.heure_debut, heure_fin: c.heure_fin, espacement_min: c.espacement_min, jours_ouvres: c.jours_ouvres },
      modele_id: c.template_id || undefined, signature_id: c.signature_id || undefined, relance: { jours: c.relance_jours, canal: c.relance_canal },
      test_ab: c.ab_question || undefined, cree_le: c.created_at,
    },
    lignes_par_statut: parStatut, stats: f.stats, entonnoir: f.entonnoir || undefined, ab: f.ab || undefined,
    lignes: page.map((i) => ({
      id: i.id, statut: i.statut, raison: i.raison || undefined, prospect: i.lead_name || i.lead_company || undefined, lead_id: i.lead_id || undefined,
      domaine: i.domain || undefined, adresse: i.to_email || undefined, mode: i.mode || undefined, variante: i.variante || undefined,
      objet: i.subject || undefined, ...(textes ? { texte: i.body || undefined } : { debut: extrait(i.body) }),
      preuve: i.preuve_signal || undefined, programme_le: i.scheduled_at || undefined, envoye_le: i.sent_at || undefined,
    })),
    pagination: { total: toutes.length, apres: Number(apres) || 0, suivante: (Number(apres) || 0) + page.length < toutes.length ? (Number(apres) || 0) + page.length : undefined },
    usage: 'validation et programmation des envois : Marc, dans l\'interface',
  };
}

async function ligne(db, { id: cid, ligne: lid }) {
  const it = (await db.pool.query(
    `SELECT i.*, l.name AS lead_name, l.company AS lead_company, l.website, l.relation_status
       FROM campaign_items i LEFT JOIN leads l ON l.id = i.lead_id WHERE i.campaign_id = $1 AND i.id = $2`, [id(cid), id(lid, 'ligne')])).rows[0];
  if (!it) throw err(404, `ligne ${lid} introuvable dans la campagne ${cid}`);
  return {
    id: it.id, campagne: it.campaign_id, statut: it.statut, raison: it.raison || undefined, mode: it.mode, variante: it.variante || undefined,
    prospect: { lead_id: it.lead_id || undefined, nom: it.lead_name || undefined, entreprise: it.lead_company || undefined, site: it.website || it.domain || undefined, relation: it.relation_status || undefined },
    adresse: it.to_email || undefined, objet: it.subject || undefined, texte: it.body || undefined,
    preuve: it.preuve_signal ? { signal: it.preuve_signal, brut: it.preuve_brut || undefined, url: it.preuve_url || undefined, date: it.preuve_date || undefined } : undefined,
    identite: it.identite || undefined, programme_le: it.scheduled_at || undefined, envoye_le: it.sent_at || undefined,
  };
}

// Prospects à ajouter : recherche dans les fiches, avec ce qui les bloque (désinscription, refus, campagne en cours).
async function prospects(db, { recherche = '', relation = null, limite = 30 } = {}) {
  const q = String(recherche || '').trim();
  const { rows } = await db.pool.query(
    `SELECT l.id, l.name, l.company, l.email, l.website, COALESCE(l.relation_status, 'nouveau') AS relation,
            EXISTS (SELECT 1 FROM email_optout o WHERE o.email = LOWER(l.email)) AS desinscrit,
            EXISTS (SELECT 1 FROM prospect_refus r WHERE r.lead_id = l.id AND r.retire_le IS NULL) AS refus,
            (SELECT c.nom FROM campaign_items i JOIN campaigns c ON c.id = i.campaign_id
              WHERE i.lead_id = l.id AND c.statut IN ('brouillon', 'en_cours', 'pause') AND i.statut NOT IN ('exclu', 'arrete') LIMIT 1) AS en_campagne
       FROM leads l
      WHERE ($1 = '' OR l.name ILIKE $2 OR l.company ILIKE $2 OR l.email ILIKE $2 OR l.website ILIKE $2)
        AND ($3::text IS NULL OR COALESCE(l.relation_status, 'nouveau') = $3)
      ORDER BY l.id DESC LIMIT $4`, [q, `%${q}%`, relation, Math.min(200, Number(limite) || 30)]);
  return { prospects: rows.map((r) => ({ id: r.id, nom: r.name, entreprise: r.company || undefined, email: r.email || undefined, site: r.website || undefined, relation: r.relation, ...(r.desinscrit ? { desinscrit: true } : {}), ...(r.refus ? { refus_prospection: true } : {}), ...(r.en_campagne ? { en_campagne: r.en_campagne } : {}) })) };
}

// Crawls de prospection : la liste, ou les résultats d'un crawl (à ajouter par result_ids).
async function crawls(db, { job_id: jobId = null, limite = 50, apres = 0 } = {}) {
  if (!jobId) {
    const { rows } = await db.pool.query(
      `SELECT j.id, j.techno, j.statut, j.phase, j.created_at, COUNT(r.id)::int AS resultats
         FROM crawl_jobs j LEFT JOIN crawl_results r ON r.job_id = j.id GROUP BY j.id ORDER BY j.id DESC LIMIT 30`);
    return { crawls: rows };
  }
  const { rows } = await db.pool.query(
    `SELECT id, domain, platform, platform_version, site_type, email, ville, score, added_as_prospect, error
       FROM crawl_results WHERE job_id = $1 ORDER BY score DESC NULLS LAST, id LIMIT $2 OFFSET $3`, [id(jobId, 'job_id'), Math.min(200, Number(limite) || 50), Number(apres) || 0]);
  return { job_id: Number(jobId), resultats: rows.map((r) => ({ id: r.id, domaine: r.domain, plateforme: [r.platform, r.platform_version].filter(Boolean).join(' ') || undefined, type: r.site_type || undefined, email: r.email || undefined, ville: r.ville || undefined, score: r.score, ...(r.added_as_prospect ? { deja_prospect: true } : {}), ...(r.error ? { erreur: r.error } : {}) })) };
}

// ---------- écriture (préparation seulement) ----------
async function creer(db, b) {
  const c = await S.createCampaign(db, b || {});
  return { campagne: { id: c.id, nom: c.nom, statut: c.statut, mode: c.mode }, suite: 'ajouter_a_campagne pour y mettre des prospects' };
}
async function modifier(db, { id: cid, ...champs }) {
  const c = await S.getCampaign(db, id(cid));                                   // mêmes réglages que l'interface, à tout moment
  const r = await S.updateCampaign(db, c.id, champs);
  return { campagne: { id: r.id, nom: r.nom, statut: r.statut, mode: r.mode, par_jour: r.par_jour, heure_debut: r.heure_debut, heure_fin: r.heure_fin, espacement_min: r.espacement_min, jours_ouvres: r.jours_ouvres, relance_jours: r.relance_jours, relance_canal: r.relance_canal, template_id: r.template_id, signature_id: r.signature_id } };
}
async function ajouter(db, { id: cid, lead_ids: leadIds, job_id: jobId, result_ids: resultIds }) {
  const campagne = id(cid);
  let out;
  if (leadIds && ids(leadIds).length) out = await S.addLeads(db, campagne, ids(leadIds));
  else if (jobId && ids(resultIds).length) out = await S.addFromCrawl(db, campagne, id(jobId, 'job_id'), ids(resultIds));
  else throw err(400, 'lead_ids, ou job_id et result_ids');
  if (out.ajoutes) S.lancerReanalyse(db, campagne);
  return { ...out, reanalyse: out.ajoutes ? 'lancée en arrière-plan sur le serveur' : undefined };
}
async function modifierLigne(db, { id: cid, ligne: lid, objet, texte, statut, raison, regenerer, entreprise }) {
  if (statut === 'valide') throw err(403, `valider une ligne : ${RESERVE}`);
  if (regenerer !== undefined && !MODES.includes(regenerer)) throw err(400, `regenerer : ${MODES.join(', ')}`);
  const it = await S.updateItem(db, id(cid), id(lid, 'ligne'), { subject: objet, body: texte, statut, raison, mode: regenerer, entreprise });
  return { ligne: await ligne(db, { id: cid, ligne: it.id }) };
}
// Réécriture de plusieurs lignes, sur le serveur (mode claude : clé API du CRM) ; résumé seulement.
async function regenerer(db, { id: cid, mode, ligne_ids: lignes = null, statuts = ['pret', 'a_verifier'] }) {
  if (!MODES.includes(mode)) throw err(400, `mode : ${MODES.join(', ')}`);
  const campagne = id(cid);
  const voulus = (Array.isArray(statuts) ? statuts : [statuts]).filter((x) => ['pret', 'a_verifier', 'valide'].includes(x));
  const { rows } = await db.pool.query(
    `SELECT id FROM campaign_items WHERE campaign_id = $1 AND statut = ANY($2::text[]) AND ($3::int[] IS NULL OR id = ANY($3::int[])) ORDER BY id LIMIT 200`,
    [campagne, voulus, lignes ? ids(lignes) : null]);
  const out = { mode, demandees: rows.length, regenerees: 0, echecs: [] };
  for (const r of rows) {
    try { await S.updateItem(db, campagne, r.id, { mode }); out.regenerees++; } catch (e) { out.echecs.push({ ligne: r.id, raison: e.message }); }
  }
  if (!out.echecs.length) delete out.echecs;
  out.note = 'une ligne validée dont le texte change repasse « prêt » : Marc la relit avant de valider';
  return out;
}
async function reanalyser(db, { id: cid, ligne: lid = null }) {
  if (lid) return { ligne: await S.reanalyzeItem(db, id(cid), id(lid, 'ligne')).then(() => ligne(db, { id: cid, ligne: lid })) };
  S.lancerReanalyse(db, id(cid));
  return { reanalyse: 'lancée en arrière-plan sur le serveur (lignes prêtes, à vérifier et validées)', suite: 'lire_campagne dans quelques minutes' };
}
async function reprendre(db, { id: cid, ligne: lid = null, adresse = null, quoi = 'sans_email' }) {
  if (lid) return { ligne: await S.reprendreItem(db, id(cid), id(lid, 'ligne'), { to_email: adresse || undefined }).then(() => ligne(db, { id: cid, ligne: lid })) };
  return S.reprendreMany(db, id(cid), quoi === 'echecs' ? 'echecs' : 'sans_email');
}
async function testAb(db, { id: cid, ab }) {
  if (ab === undefined) return { propositions: require('../utils/abQuestion').catalogue(), usage: 'ab = { preuve: cle, maintenance: cle }, ou null pour arrêter' };
  return S.setAbTest(db, id(cid), ab);
}
async function piloter(db, { id: cid, action, confirmer = false }) {
  if (action === 'pause') return { campagne: await S.pause(db, id(cid), 'Mise en pause par Claude (connecteur)') };
  if (action === 'arreter') {
    if (confirmer !== true) throw err(400, "arrêter annule définitivement tous les envois programmés de la campagne : confirmer=true pour le faire");
    return S.stop(db, id(cid));
  }
  if (['reprendre', 'programmer', 'lancer', 'valider', 'supprimer'].includes(action)) throw err(403, `${action} : ${RESERVE}`);
  throw err(400, 'action : pause ou arreter');
}
async function boiteReception(db, { action = 'lister', message = null, decision = null }) {
  if (action === 'lister') return boite.lister(db);
  if (action === 'relever') return boite.relever(db);
  if (action === 'confirmer') {
    if (decision === 'pas_refus') throw err(403, `écarter un refus de prospection : ${RESERVE}`);
    if (!['tout', 'email'].includes(decision)) throw err(400, 'decision : tout (refus de toute sollicitation) ou email (ne plus écrire)');
    return boite.confirmer(db, id(message, 'message'), decision);
  }
  throw err(400, 'action : lister, relever ou confirmer');
}

// Signal « prestataire en difficulté ou disparu » : lire, et préparer (prospects, campagne). Jamais d'envoi.
const P = () => require('./prestataireService');
async function prestataires(db, { domaine = null, gravite_min = 1, statut = null } = {}) {
  if (domaine) {
    const d = await P().detail(db, domaine);
    return { ...d, citable_dans_un_email: d.siren_source === 'mentions légales du site' && d.gravite >= 2, clients: d.clients.slice(0, 200) };
  }
  const l = await P().lister(db, { gravite_min, statut });
  return { totaux: l.totaux, prestataires: l.prestataires.map((p) => ({ domaine: p.domaine, nom: p.nom || undefined, siren: p.siren || undefined, identite: p.siren_source || undefined, statut: p.statut, gravite: p.gravite, preuve: (p.preuves || [])[0], sites_clients: p.nb_clients, verifie_le: p.verifie_le })) };
}
const prestataireProspects = (db, { domaine }) => P().promouvoir(db, domaine);
const prestataireCampagne = (db, { domaine, id: cid }) => P().versCampagne(db, domaine, id(cid));

module.exports = { prestataires, prestataireProspects, prestataireCampagne, lister, lire, ligne, prospects, crawls, creer, modifier, ajouter, modifierLigne, regenerer, reanalyser, reprendre, testAb, piloter, boiteReception };
