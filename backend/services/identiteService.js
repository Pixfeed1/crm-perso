// Identité de l'exploitant d'un site (ligne crawl_results), écrite à un seul endroit.
// - Le SIREN lu sur le site fait foi (« certain ») ; sinon rapprochement par le nom (sûr / probable /
//   douteux), qui ne sert jamais à nommer quelqu'un dans un email.
// - Une identité corrigée à la main (identite_manuelle) n'est jamais écrasée par une réanalyse.
const sireneEnrich = require('./sireneEnrich');
const { decodeHtml } = require('../utils/decodeHtml');

async function ecrire(db, resultId, data, { manuelle = false, source = null } = {}) {
  // Douteux : rien de commun entre l'entreprise et le site. On garde la trace (sirene_match) sans
  // écrire ni dirigeant ni SIREN.
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
       code_postal = CASE WHEN $2 THEN $12 ELSE code_postal END, ville = CASE WHEN $2 THEN $13 ELSE ville END,
       identite_source = $15, identite_manuelle = $16
     WHERE id = $14`,
    [data.match, ok, data.raison_sociale, data.dirigeant, data.dirigeant_nom, data.dirigeant_prenom, data.siren, data.naf, data.naf_label,
      data.effectif, data.adresse, data.code_postal, data.ville, resultId,
      (source || data.source || null) && `${source || data.source}${data.remarque ? ` ; ${data.remarque}` : ''}`, manuelle]
  );
  return ok;
}

/**
 * Identifie l'exploitant du site de la ligne resultId et l'écrit. Laisse intacte une identité manuelle.
 * @returns {{ match, raison_sociale?, ville?, score?, source?, manuelle? }}
 */
async function identifier(db, resultId, { sirene = sireneEnrich.enrichMatch } = {}) {
  const r = (await db.pool.query('SELECT id, domain, title, code_postal_site, siren_site, identite_manuelle, sirene_match, raison_sociale, ville FROM crawl_results WHERE id = $1', [resultId])).rows[0];
  if (!r) return { match: 'aucun' };
  if (r.identite_manuelle) return { match: r.sirene_match, raison_sociale: r.raison_sociale, ville: r.ville, manuelle: true };
  const domain = String(r.domain || '').toLowerCase().replace(/^www\./, '');
  const title = (decodeHtml(r.title) || '').trim();
  const data = await sirene({ query: title || domain.split('.')[0], domain, title, code_postal_site: r.code_postal_site || '', siren_site: r.siren_site || '' });
  if (!data || !data.found) {
    await db.pool.query('UPDATE crawl_results SET identite_source = $1 WHERE id = $2', [data && data.error ? `aucune entreprise trouvée (${data.error})` : 'aucune entreprise trouvée', resultId]);
    return { match: 'aucun', erreur: data && data.error };
  }
  const ok = await ecrire(db, resultId, data);
  return { match: data.match, raison_sociale: ok ? data.raison_sociale : null, ville: ok ? data.ville : null, score: data.match_score, source: data.source };
}

/**
 * Correction à la main depuis la fiche : un SIREN (identité certaine) ou « aucune identité » (email
 * sans nom). Protégée des réanalyses.
 */
async function corriger(db, resultId, { siren = null, aucune = false } = {}) {
  const quand = new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  if (aucune) {
    await db.pool.query(
      `UPDATE crawl_results SET sirene_match = 'aucune', raison_sociale = NULL, gerant = NULL, gerant_nom = NULL, gerant_prenom = NULL,
         siren = NULL, naf = NULL, naf_label = NULL, effectif = NULL, adresse = NULL, code_postal = NULL, ville = NULL,
         identite_source = $1, identite_manuelle = TRUE WHERE id = $2`, [`aucune identité, choisi à la main le ${quand}`, resultId]);
    return { match: 'aucune' };
  }
  const data = await sireneEnrich.parSiren(siren);
  if (!data.found) throw Object.assign(new Error(data.error || 'SIREN introuvable'), { status: 400 });
  await ecrire(db, resultId, data, { manuelle: true, source: `SIREN ${data.siren} saisi à la main le ${quand}` });
  return { match: 'certain', raison_sociale: data.raison_sociale, dirigeant: data.dirigeant, ville: data.ville, etat: data.etat };
}

module.exports = { identifier, corriger };
