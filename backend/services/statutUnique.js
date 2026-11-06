// Lot 5 : fusion de l'ancien statut Kanban dans le statut de relation (statut unique).
// planifier() ne lit que ; appliquer() écrit le résultat de la simulation, fiche par fiche, avec une
// note dans l'historique. L'ancien statut reste dans leads.ancien_statut_kanban.
const { fusion } = require('../utils/leadStatusSync');

const LIB = {
  nouveau: 'Nouveau', a_contacter: 'À contacter', contacte: 'Contacté', en_discussion: 'En discussion', devis_envoye: 'Devis envoyé',
  gagne: 'Gagné', perdu: 'Perdu', pas_business: 'Pas de business',
  new: 'Nouveau (ancien)', contacted: 'Contacté (ancien)', proposal: 'Proposition (ancien)', negotiation: 'Négociation (ancien)', won: 'Gagné (ancien)', lost: 'Perdu (ancien)',
  prospect: 'Prospect', 'qualifié': 'Qualifié', 'négociation': 'Négociation', client: 'Client'
};
const lib = (k) => LIB[k] || k || '(vide)';

async function planifier(db) {
  const { rows } = await db.pool.query(
    `SELECT id, name, company, relation_status, ancien_statut_kanban FROM leads
      WHERE statuts_fusionnes_le IS NULL ORDER BY id`);
  const changements = [], inchanges = [], conflits = [];
  const idsInchanges = [];
  for (const l of rows) {
    const avant = l.relation_status || 'nouveau';
    const apres = fusion(avant, l.ancien_statut_kanban);
    const ligne = { id: l.id, fiche: l.company || l.name || `#${l.id}`, kanban: l.ancien_statut_kanban, suivi: avant, apres };
    if (apres !== (l.relation_status || null)) changements.push(ligne); else { inchanges.push(ligne); idsInchanges.push(l.id); }
    // Désaccords notables, même quand le Suivi l'emporte : à vérifier à la main.
    if (avant === 'pas_business' && ['qualifié', 'négociation', 'prospect', 'client'].includes(l.ancien_statut_kanban)) conflits.push({ ...ligne, note: 'refus ou opposition au Suivi, mais avancé au Kanban : le refus est gardé' });
    if (avant === 'perdu' && ['client'].includes(l.ancien_statut_kanban)) conflits.push({ ...ligne, note: 'perdu au Suivi, client au Kanban : passé en Gagné' });
    if (l.ancien_statut_kanban === 'perdu' && apres !== 'perdu' && avant !== 'pas_business') conflits.push({ ...ligne, note: 'perdu au Kanban, avancé au Suivi : le Suivi est gardé' });
  }
  const parPassage = {};
  for (const c of changements) { const k = `${lib(c.kanban)} + ${lib(c.suivi)} → ${lib(c.apres)}`; parPassage[k] = (parPassage[k] || 0) + 1; }
  return { total: rows.length, changements, inchanges: inchanges.length, ids_inchanges: idsInchanges, conflits, par_passage: parPassage };
}

async function appliquer(db, plan) {
  let ecrits = 0;
  for (const c of plan.changements) {
    const r = await db.pool.query(
      `UPDATE leads SET relation_status = $2, statuts_fusionnes_le = NOW(), updated_at = NOW()
        WHERE id = $1 AND statuts_fusionnes_le IS NULL AND COALESCE(relation_status, 'nouveau') = $3`, [c.id, c.apres, c.suivi]);
    if (r.rowCount) {
      ecrits++;
      await db.pool.query(
        `INSERT INTO interactions (contact_type, contact_id, type, date, notes, followup_done) VALUES ('lead', $1, 'note', NOW(), $2, TRUE)`,
        [c.id, `Statut unifié : Kanban « ${lib(c.kanban)} » et Suivi « ${lib(c.suivi)} » → « ${lib(c.apres)} ».`]
      ).catch(() => {});
    }
  }
  // Fiches sans changement : marquées comme vues. Une fiche modifiée entre la simulation et l'écriture
  // n'est pas touchée et sera recalculée au prochain passage.
  await db.pool.query('UPDATE leads SET statuts_fusionnes_le = NOW() WHERE statuts_fusionnes_le IS NULL AND id = ANY($1::int[])', [plan.ids_inchanges || []]);
  return { ecrits };
}

module.exports = { planifier, appliquer, lib };
