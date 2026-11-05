// backend/services/leadReanalyzeService.js
//
// « Réanalyser le site » depuis la fiche prospect : relance le crawler sur CE domaine, met à jour
// la ligne crawl_results liée (ou en crée une), refait la correspondance SIRENE avec le code
// postal lu sur le site, recalcule le score. L'email par la preuve repart alors de mesures du
// jour, datées et tracées, au lieu de celles de l'ancien crawl.
//
// Ne touche ni aux notes du prospect, ni à ses interactions, ni à l'envoi.
const { runDetect } = require('./ccProspectorRunner');
const sireneEnrich = require('./sireneEnrich');
const identiteService = require('./identiteService');
const crawl = require('../controllers/crawlController');
const { normalizeDomain } = require('../utils/csvParse');
const { auditFlags, prospectScore, PREUVE_KEYS } = require('../utils/prospectScore');
const { decodeHtml } = require('../utils/decodeHtml');

// Job de crawl « réanalyse » : accueille les lignes créées pour des prospects qui n'en avaient pas.
async function ensureReanalyseJob(db) {
  const r = await db.pool.query("SELECT id FROM crawl_jobs WHERE techno = 'reanalyse' ORDER BY id LIMIT 1");
  if (r.rows[0]) return r.rows[0].id;
  const ins = await db.pool.query(
    "INSERT INTO crawl_jobs (techno, nb_sites, statut, phase, message) VALUES ('reanalyse', 0, 'done', 'done', 'Prospects réanalysés depuis leur fiche') RETURNING id"
  );
  return ins.rows[0].id;
}

/**
 * @param {object} db
 * @param {number|string} leadId
 * @param {{ detect?: Function, sirene?: Function }} deps  injection pour les tests (pas de réseau)
 * @returns {{ domain, crawl_result_id, analyse_le, preuves: string[], indices: string[], sirene: object|null }}
 */
async function reanalyzeLead(db, leadId, deps = {}) {
  const detect = deps.detect || runDetect;
  const sirene = deps.sirene || sireneEnrich.enrichMatch;

  const lr = await db.pool.query('SELECT * FROM leads WHERE id = $1', [leadId]);
  const lead = lr.rows[0];
  if (!lead) throw Object.assign(new Error('Prospect introuvable'), { status: 404 });
  const domain = normalizeDomain(lead.website || lead.company);
  if (!domain || !domain.includes('.')) throw Object.assign(new Error('Ce prospect n\'a pas de domaine (champ site web ou entreprise).'), { status: 400 });

  const rows = await detect([domain], { concurrency: 2, timeout: 10 });
  const raw = rows.find((r) => normalizeDomain(r.domain) === domain) || rows[0];
  if (!raw) throw Object.assign(new Error('Le crawler n\'a rien renvoyé pour ce domaine.'), { status: 502 });
  const typed = crawl.typedResult(raw);
  if (!typed.analyse_le) typed.analyse_le = new Date().toISOString();

  // Ligne crawl_results : mise à jour si le prospect en a une, création sinon.
  let resultId = lead.crawl_result_id || null;
  if (resultId) {
    const exists = await db.pool.query('SELECT id FROM crawl_results WHERE id = $1', [resultId]);
    if (!exists.rows[0]) resultId = null;
  }
  if (resultId) {
    await crawl.updateCrawlResult(db, resultId, typed);
  } else {
    const jobId = await ensureReanalyseJob(db);
    resultId = await crawl.insertCrawlResult(db, jobId, typed);
    await db.pool.query('UPDATE crawl_results SET added_as_prospect = TRUE WHERE id = $1', [resultId]);
    await db.pool.query('UPDATE leads SET crawl_result_id = $1 WHERE id = $2', [resultId, leadId]);
  }

  // Identité : SIREN lu sur le site d'abord (certaine), sinon rapprochement par le nom (avec le code
  // postal du site) ; une identité corrigée à la main n'est jamais écrasée.
  let sireneInfo = null;
  try {
    sireneInfo = await identiteService.identifier(db, resultId, { sirene });
  } catch (e) {
    console.error('[Réanalyse] SIRENE', domain, e.message);
    sireneInfo = { match: 'erreur', erreur: e.message };
  }

  // Score et angles recalculés sur la ligne fraîche ; reportés sur le prospect (champs de ciblage).
  const fresh = (await db.pool.query('SELECT * FROM crawl_results WHERE id = $1', [resultId])).rows[0];
  const flags = auditFlags(fresh);
  const score = prospectScore(fresh);
  await db.pool.query('UPDATE crawl_results SET score = $1 WHERE id = $2', [score, resultId]);
  await db.pool.query(
    'UPDATE leads SET score = $1, angles = $2, platform = COALESCE($3, platform), updated_at = NOW() WHERE id = $4',
    [score, flags.map((f) => f.key).join(' | ') || null, fresh.platform || null, leadId]
  );

  return {
    domain,
    crawl_result_id: resultId,
    analyse_le: fresh.analyse_le,
    http_status: fresh.http_status,
    final_url: fresh.final_url,
    preuves: flags.filter((f) => PREUVE_KEYS.has(f.key)).map((f) => f.label),
    indices: flags.filter((f) => !PREUVE_KEYS.has(f.key)).map((f) => f.label),
    sirene: sireneInfo,
    crawl_audit: require('../utils/plateforme').annoter(fresh) // la fiche se met à jour sans rechargement
  };
}

module.exports = { reanalyzeLead, ensureReanalyseJob };
