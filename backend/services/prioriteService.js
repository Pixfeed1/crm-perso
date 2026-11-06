// backend/services/prioriteService.js
//
// « À traiter en priorité » (lot 6) : les prospects qui ont montré un intérêt réel récemment, classés par
// la force du signal, avec la raison écrite en clair (pas de note chiffrée). Sur les 30 derniers jours :
//   1. une réponse (ligne de campagne marquée « a répondu ») ;
//   2. un clic humain sur une page de vos prestations ;
//   3. des clics humains sur plusieurs jours différents ;
//   4. un autre clic humain (votre site, vos réseaux, autre lien).
// Les clics automatiques et la désinscription ne comptent jamais. Jamais affichés : fiches gagnées,
// perdues ou « pas de business », refus de prospection actif, adresse désinscrite ou en rebond.
// Un prospect sort de la liste dès que vous avez eu un échange réel avec lui après son dernier signal
// (appel, email, SMS, rendez-vous, LinkedIn, ou échange noté avec un résultat).

const { libelle } = require('../utils/liensEmail');

const JOURS = 30;
const FORCES = { reponse: 1, prestations: 2, plusieurs_jours: 3, autre: 4 };
const fmt = (d) => new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(' ', ' à ').replace(':', ' h ');
const jour = (d) => new Date(d).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });

async function lister(db, { jours = JOURS } = {}) {
  const depuis = `NOW() - make_interval(days => ${Number(jours) | 0 || JOURS})`;
  const [clics, reponses] = await Promise.all([
    db.pool.query(
      `SELECT t.contact_id AS lead_id, c.url, c.categorie, c.clique_le, t.subject
         FROM email_clics c JOIN email_tracking t ON t.id = c.tracking_id
        WHERE t.contact_type = 'lead' AND t.contact_id IS NOT NULL AND c.automatique = FALSE
          AND c.categorie <> 'desinscription' AND c.clique_le > ${depuis}
        ORDER BY c.clique_le DESC`).then((r) => r.rows).catch(() => []),
    db.pool.query(
      `SELECT ci.lead_id, ci.updated_at AS le, ci.subject, cp.nom AS campagne
         FROM campaign_items ci LEFT JOIN campaigns cp ON cp.id = ci.campaign_id
        WHERE ci.statut = 'repondu' AND ci.lead_id IS NOT NULL AND ci.updated_at > ${depuis}`).then((r) => r.rows).catch(() => [])
  ]);
  const parLead = new Map();
  const fiche = (id) => { if (!parLead.has(id)) parLead.set(id, { lead_id: id, signaux: [], clics: [] }); return parLead.get(id); };
  for (const r of reponses) fiche(r.lead_id).signaux.push({ force: FORCES.reponse, date: r.le, texte: `a répondu le ${jour(r.le)}${r.subject ? ` à l'email « ${r.subject} »` : ''}${r.campagne ? ` (campagne « ${r.campagne} »)` : ''}` });
  for (const c of clics) fiche(c.lead_id).clics.push(c);
  for (const f of parLead.values()) {
    const presta = f.clics.filter((c) => c.categorie === 'prestations');
    if (presta.length) f.signaux.push({ force: FORCES.prestations, date: presta[0].clique_le, texte: `a cliqué sur ${libelle(presta[0].url, 'prestations')} le ${fmt(presta[0].clique_le)}${presta.length > 1 ? ` (${presta.length} clics sur vos pages)` : ''}` });
    const jours_ = [...new Set(f.clics.map((c) => jour(c.clique_le)))];
    if (jours_.length >= 2) f.signaux.push({ force: FORCES.plusieurs_jours, date: f.clics[0].clique_le, texte: `a cliqué sur vos liens ${jours_.length} jours différents (${jours_.slice(0, 4).reverse().join(', ')})` });
    if (!presta.length && f.clics.length) f.signaux.push({ force: FORCES.autre, date: f.clics[0].clique_le, texte: `a cliqué sur ${libelle(f.clics[0].url, f.clics[0].categorie)} le ${fmt(f.clics[0].clique_le)}` });
  }
  const ids = [...parLead.keys()].filter((id) => parLead.get(id).signaux.length);
  if (!ids.length) return { jours, items: [] };

  const leads = (await db.pool.query(
    `SELECT l.id, l.name, l.company, l.email, l.phone, COALESCE(l.relation_status, 'nouveau') AS relation_status,
            (SELECT MAX(i.date) FROM interactions i WHERE i.contact_type = 'lead' AND i.contact_id = l.id
               AND (i.type IN ('appel', 'sms', 'rdv', 'rendez-vous', 'reunion', 'linkedin') OR i.reached IS NOT NULL
                    OR (i.type = 'email' AND COALESCE(i.notes, '') NOT LIKE '📧%'))) AS dernier_echange,
            (SELECT MIN(i.next_followup_date) FROM interactions i WHERE i.contact_type = 'lead' AND i.contact_id = l.id
               AND i.followup_done = FALSE AND i.next_followup_date IS NOT NULL) AS prochaine_relance,
            EXISTS (SELECT 1 FROM email_optout o WHERE o.email = LOWER(l.email)) AS bloque_email
       FROM leads l WHERE l.id = ANY($1::int[])`, [ids])).rows;
  const refus = new Set((await db.pool.query('SELECT DISTINCT lead_id FROM prospect_refus WHERE retire_le IS NULL AND lead_id = ANY($1::int[])', [ids]).catch(() => ({ rows: [] }))).rows.map((r) => r.lead_id));
  const { bloque } = require('./refusService');

  const items = [];
  for (const l of leads) {
    if (['gagne', 'perdu', 'pas_business'].includes(l.relation_status)) continue;
    if (l.bloque_email || refus.has(l.id) || await bloque(db, l, 'email').catch(() => false)) continue;
    const f = parLead.get(l.id);
    const dernierSignal = f.signaux.reduce((m, s) => (new Date(s.date) > m ? new Date(s.date) : m), new Date(0));
    if (l.dernier_echange && new Date(l.dernier_echange) > dernierSignal) continue; // déjà traité
    const signaux = f.signaux.sort((a, b) => a.force - b.force || new Date(b.date) - new Date(a.date));
    items.push({
      lead_id: l.id, nom: l.company || l.name, contact: l.name, email: l.email, telephone: l.phone, relation_status: l.relation_status,
      force: signaux[0].force, raisons: signaux.map((s) => s.texte), dernier_signal: dernierSignal.toISOString(),
      prochaine_relance: l.prochaine_relance, dernier_echange: l.dernier_echange
    });
  }
  items.sort((a, b) => a.force - b.force || new Date(b.dernier_signal) - new Date(a.dernier_signal));
  return { jours, items };
}

// Journal des clics d'une fiche (pour la fiche prospect), robots compris et marqués.
async function journalFiche(db, leadId) {
  const { rows } = await db.pool.query(
    `SELECT c.id, c.url, c.categorie, c.clique_le, c.delai_s, c.automatique, c.raison, t.subject
       FROM email_clics c JOIN email_tracking t ON t.id = c.tracking_id
      WHERE t.contact_type = 'lead' AND t.contact_id = $1 ORDER BY c.clique_le DESC LIMIT 100`, [leadId]).catch(() => ({ rows: [] }));
  return rows.map((r) => ({ ...r, libelle: libelle(r.url, r.categorie) }));
}

module.exports = { lister, journalFiche, FORCES, JOURS };
