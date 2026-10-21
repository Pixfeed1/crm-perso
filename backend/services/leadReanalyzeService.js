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

  // Correspondance SIRENE, avec le code postal du site : sûre / probable / douteuse.
  let sireneInfo = null;
  try {
    const title = (decodeHtml(typed.title) || '').trim();
    const data = await sirene({ query: title || domain.split('.')[0], domain, title, code_postal_site: typed.code_postal_site || '' });
    if (data && data.found) {
      const ok = data.match !== 'douteux';
      await db.pool.query(
        `UPDATE crawl_results SET sirene_match = $1,
           raison_sociale = CASE WHEN $2 THEN $3 ELSE raison_sociale END,
           gerant = CASE WHEN $2 THEN $4 ELSE gerant END,
           gerant_nom = CASE WHEN $2 THEN $5 ELSE gerant_nom END,
           gerant_prenom = CASE WHEN $2 THEN $6 ELSE gerant_prenom END,
           siren = CASE WHEN $2 THEN $7 ELSE siren END,
           naf = CASE WHEN $2 THEN $8 ELSE naf END, naf_label = CASE WHEN $2 THEN $9 ELSE naf_label END,
           effectif = CASE WHEN $2 THEN $10 ELSE effectif END, adresse = CASE WHEN $2 THEN $11 ELSE adresse END,
           code_postal = CASE WHEN $2 THEN $12 ELSE code_postal END, ville = CASE WHEN $2 THEN $13 ELSE ville END
         WHERE id = $14`,
        [data.match, ok, data.raison_sociale, data.dirigeant, data.dirigeant_nom, data.dirigeant_prenom, data.siren, data.naf, data.naf_label,
         data.effectif, data.adresse, data.code_postal, data.ville, resultId]
      );
      sireneInfo = { match: data.match, raison_sociale: ok ? data.raison_sociale : null, ville: ok ? data.ville : null, score: data.match_score };
    } else {
      sireneInfo = { match: 'aucun' };
    }
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
    sirene: sireneInfo
  };
}

module.exports = { reanalyzeLead, ensureReanalyseJob };
