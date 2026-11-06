// Rattrapage des relances : pour les emails de campagne déjà partis SANS tâche de relance (campagnes
// créées avant que la relance soit active par défaut), crée une tâche de relance par prospect, étalée sur
// N par jour ouvré. Une tâche est un rappel dans le Suivi, jamais un envoi.
// Exclus (avec la raison) : fiche en discussion, devis, gagnée, perdue ou « pas de business » ; adresse
// désinscrite ou opposée ; relance déjà ouverte ; prospect déjà recontacté depuis l'email (appel, SMS,
// rendez-vous, échange noté, email manuel). Le plus ancien envoi d'abord.
const optout = require('./optout');
const { aujourdhuiParis, ajouterJoursOuvres, premierOuvre } = require('../utils/joursOuvres');

const FERMES = ['en_discussion', 'devis_envoye', 'gagne', 'perdu', 'pas_business'];
const fmt = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/**
 * Plan du rattrapage, sans rien écrire.
 * @param {{ campagne?: number, par_jour?: number, debut?: string, canal?: string }} opts
 */
async function planifier(db, { campagne = null, par_jour = 10, debut = null, canal = 'appel' } = {}) {
  const parJour = Math.max(1, Math.min(50, par_jour | 0 || 10));
  const { rows } = await db.pool.query(
    `SELECT DISTINCT ON (ci.lead_id) ci.lead_id, ci.to_email, ci.domain, ci.sent_at, c.id AS campagne_id, c.nom AS campagne,
            l.id AS fiche, l.company, l.relation_status
       FROM campaign_items ci
       JOIN campaigns c ON c.id = ci.campaign_id
       LEFT JOIN leads l ON l.id = ci.lead_id
      WHERE ci.statut = 'envoye' AND ci.lead_id IS NOT NULL AND c.test_mode IS NOT TRUE
        AND ($1::int IS NULL OR c.id = $1::int)
      ORDER BY ci.lead_id, ci.sent_at DESC NULLS LAST`, [campagne]);
  const retenus = [], exclus = [];
  for (const r of rows.sort((a, b) => new Date(a.sent_at || 0) - new Date(b.sent_at || 0))) {
    const ligne = { lead_id: r.lead_id, entreprise: r.company || r.domain, domaine: r.domain, email: r.to_email, envoye_le: fmt(r.sent_at), campagne: r.campagne };
    const exclure = (raison) => exclus.push({ ...ligne, raison });
    if (!r.fiche) { exclure('fiche introuvable'); continue; }
    if (FERMES.includes(r.relation_status)) { exclure(`fiche « ${r.relation_status} »`); continue; }
    if (r.to_email && await optout.isOptedOut(db, r.to_email)) { exclure('adresse désinscrite ou opposée'); continue; }
    if (await require('./refusService').bloque(db, r.lead_id, canal)) { exclure(`refus de prospection (${canal})`); continue; }
    const ouverte = (await db.pool.query(
      `SELECT next_followup_date FROM interactions WHERE contact_type = 'lead' AND contact_id = $1 AND followup_done = FALSE AND next_followup_date IS NOT NULL ORDER BY next_followup_date LIMIT 1`,
      [r.lead_id])).rows[0];
    if (ouverte) { exclure(`relance déjà prévue le ${fmt(ouverte.next_followup_date)}`); continue; }
    // Recontacté depuis l'email : appel, SMS, rendez-vous, échange noté avec un résultat, email manuel
    // (le journal d'envoi de la campagne elle-même et les ouvertures ne comptent pas).
    const contact = (await db.pool.query(
      `SELECT type, date FROM interactions
        WHERE contact_type = 'lead' AND contact_id = $1 AND date > $2::timestamp
          AND (type IN ('appel', 'sms', 'rdv', 'rendez-vous', 'reunion') OR reached IS NOT NULL
               OR (type = 'email' AND date > $2::timestamp + interval '10 minutes' AND COALESCE(notes, '') NOT LIKE '📧%'))
        ORDER BY date DESC LIMIT 1`,
      [r.lead_id, r.sent_at || new Date(0)])).rows[0];
    if (contact) { exclure(`déjà recontacté (${contact.type}) le ${fmt(contact.date)}`); continue; }
    retenus.push(ligne);
  }
  // Échéances : N par jour ouvré, à partir du premier jour ouvré >= debut (aujourd'hui par défaut).
  let jour = premierOuvre(debut || aujourdhuiParis());
  retenus.forEach((x, i) => {
    if (i > 0 && i % parJour === 0) jour = ajouterJoursOuvres(jour, 1);
    x.echeance = jour;
  });
  const parDate = {};
  for (const x of retenus) parDate[x.echeance] = (parDate[x.echeance] || 0) + 1;
  const raisons = {};
  for (const x of exclus) { const k = x.raison.replace(/ le \d{4}-\d{2}-\d{2}$/, '').replace(/ \(.*\)$/, ''); raisons[k] = (raisons[k] || 0) + 1; }
  return { canal, par_jour: parJour, envoyes: rows.length, retenus, exclus, par_date: parDate, raisons_exclusion: raisons };
}

/** Crée les tâches du plan (revérifie qu'aucune relance n'a été ouverte entre-temps). */
async function appliquer(db, plan) {
  let crees = 0, ignores = 0;
  for (const x of plan.retenus) {
    const ouverte = (await db.pool.query(
      `SELECT 1 FROM interactions WHERE contact_type = 'lead' AND contact_id = $1 AND followup_done = FALSE AND next_followup_date IS NOT NULL LIMIT 1`, [x.lead_id])).rows[0];
    if (ouverte) { ignores++; continue; }
    await db.pool.query(
      `INSERT INTO interactions (contact_type, contact_id, type, date, notes, next_followup_date, next_followup_channel, followup_done)
       VALUES ('lead', $1, 'note', NOW(), $2, $3::date, $4, FALSE)`,
      [x.lead_id, `Relance de rattrapage : email de la campagne « ${x.campagne} » du ${x.envoye_le ? x.envoye_le.split('-').reverse().join('/') : '?'}, sans suite enregistrée.`, x.echeance, plan.canal]);
    crees++;
  }
  return { crees, ignores };
}

module.exports = { planifier, appliquer };
