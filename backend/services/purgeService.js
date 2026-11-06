// backend/services/purgeService.js
//
// Liste mensuelle « à supprimer » (lot 4) : les prospects sans contact depuis 3 ans (durée de
// conservation recommandée par la CNIL pour la prospection). Rien n'est supprimé sans la validation
// de Marc : chaque mois une proposition est préparée, il coche ce qui part et ce qui reste.
//
// Jamais concernés : clients (fiche convertie, statut client, contact rattaché à un client), fiches
// gagnées, fiches liées à un projet ou à un revenu, fiches avec une relance prévue, fiches que Marc a
// choisi de garder (pendant un an). Les listes d'opposition (email_optout, prospect_refus) sont
// toujours conservées : elles servent justement à ne plus jamais recontacter.
//
// « Contact » = un échange réel (email, appel, SMS, rendez-vous, LinkedIn, échange noté avec un
// résultat), un email de campagne parti, ou un clic du prospect. Les notes internes ne comptent pas.
// Sans aucun échange, la date de création de la fiche fait foi.

const ANS = 3;
const GARDER_MOIS = 12;

const moisCourant = (d = new Date()) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' }).format(d).slice(0, 7);

async function existe(q, table) {
  return (await q.query('SELECT to_regclass($1) AS r', [table])).rows[0].r !== null;
}

// Prospects à proposer (re-vérifié au moment de la validation).
async function candidats(db, { ans = ANS, ids = null } = {}) {
  const q = db.pool;
  const opt = async (t, sql) => ((await existe(q, t)) ? sql : 'NULL::timestamp');
  const sansLien = async (t, sql) => ((await existe(q, t)) ? `AND NOT EXISTS (${sql})` : '');
  const { rows } = await q.query(
    `WITH dernier AS (
       SELECT l.id, GREATEST(
         l.created_at,
         (SELECT MAX(i.date) FROM interactions i WHERE i.contact_type = 'lead' AND i.contact_id = l.id
            AND (i.type IN ('email', 'appel', 'sms', 'rdv', 'rendez-vous', 'reunion', 'linkedin') OR i.reached IS NOT NULL)),
         ${await opt('campaign_items', '(SELECT MAX(ci.sent_at) FROM campaign_items ci WHERE ci.lead_id = l.id)')},
         ${await opt('email_tracking', "(SELECT MAX(t.last_click_at) FROM email_tracking t WHERE t.contact_type = 'lead' AND t.contact_id = l.id)")}
       ) AS d
       FROM leads l
     )
     SELECT l.id AS lead_id, l.name, l.company, l.email, l.website, d.d AS dernier_contact
       FROM leads l JOIN dernier d ON d.id = l.id
      WHERE d.d < NOW() - make_interval(years => $1::int)
        AND ($2::int[] IS NULL OR l.id = ANY($2::int[]))
        AND COALESCE(l.status, '') NOT IN ('client', 'won')
        AND COALESCE(l.relation_status, '') <> 'gagne'
        AND (l.purge_garder_jusqu_au IS NULL OR l.purge_garder_jusqu_au < CURRENT_DATE)
        ${await sansLien('contacts', 'SELECT 1 FROM contacts c WHERE c.lead_id = l.id AND c.client_id IS NOT NULL')}
        ${await sansLien('projects', 'SELECT 1 FROM projects p WHERE p.lead_id = l.id')}
        ${await sansLien('revenues', 'SELECT 1 FROM revenues r WHERE r.lead_id = l.id')}
        AND NOT EXISTS (SELECT 1 FROM interactions i WHERE i.contact_type = 'lead' AND i.contact_id = l.id AND i.followup_done = FALSE AND i.next_followup_date >= CURRENT_DATE)
      ORDER BY d.d ASC`, [ans, ids]
  );
  return rows;
}

const domaineDe = (l) => {
  const { domaineEntreprise } = require('./refusService');
  return domaineEntreprise(l.website) || domaineEntreprise(l.company) || domaineEntreprise(l.email) || null;
};

// Prépare la proposition du mois (une seule par mois ; recalculer remplace les lignes non décidées).
async function proposer(db, { mois = moisCourant(), recalculer = false } = {}) {
  let p = (await db.pool.query('SELECT * FROM purge_propositions WHERE mois = $1', [mois])).rows[0];
  if (p && p.statut === 'traitee') return courante(db, p.id);
  if (p && !recalculer) return courante(db, p.id);
  const liste = await candidats(db);
  if (!p) p = (await db.pool.query("INSERT INTO purge_propositions (mois, statut) VALUES ($1, 'a_valider') RETURNING *", [mois])).rows[0];
  await db.pool.query('DELETE FROM purge_lignes WHERE proposition_id = $1 AND decision IS NULL', [p.id]);
  for (const l of liste) {
    await db.pool.query(
      `INSERT INTO purge_lignes (proposition_id, lead_id, nom, domaine, email, dernier_contact) VALUES ($1, $2, $3, $4, $5, $6)`,
      [p.id, l.lead_id, l.name || l.company || null, domaineDe(l), l.email || null, l.dernier_contact]
    );
  }
  await db.pool.query("UPDATE purge_propositions SET statut = $2, calculee_le = NOW() WHERE id = $1", [p.id, liste.length ? 'a_valider' : 'vide']);
  return courante(db, p.id);
}

// Proposition à afficher : celle demandée, sinon la plus récente encore à valider.
async function courante(db, id = null) {
  const p = id
    ? (await db.pool.query('SELECT * FROM purge_propositions WHERE id = $1', [id])).rows[0]
    : (await db.pool.query("SELECT * FROM purge_propositions WHERE statut = 'a_valider' ORDER BY mois DESC LIMIT 1")).rows[0];
  if (!p) return null;
  const lignes = (await db.pool.query('SELECT * FROM purge_lignes WHERE proposition_id = $1 ORDER BY dernier_contact ASC, id', [p.id])).rows;
  return { ...p, ans: ANS, lignes };
}

// Suppression d'une fiche et de ses données de prospection. Les listes d'opposition restent.
async function supprimerFiche(c, leadId) {
  const lead = (await c.query('SELECT * FROM leads WHERE id = $1', [leadId])).rows[0];
  if (!lead) return false;
  const adresses = new Set([String(lead.email || '').trim().toLowerCase()].filter((x) => x.includes('@')));
  if (await existe(c, 'contacts')) {
    (await c.query('SELECT email FROM contacts WHERE lead_id = $1', [leadId])).rows.forEach((x) => { const e = String(x.email || '').trim().toLowerCase(); if (e.includes('@')) adresses.add(e); });
    await c.query('DELETE FROM contacts WHERE lead_id = $1 AND client_id IS NULL', [leadId]);
  }
  await c.query("DELETE FROM interactions WHERE contact_type = 'lead' AND contact_id = $1", [leadId]);
  if (await existe(c, 'email_tracking')) await c.query("DELETE FROM email_tracking WHERE contact_type = 'lead' AND contact_id = $1", [leadId]);
  if (await existe(c, 'campaign_items')) await c.query('DELETE FROM campaign_items WHERE lead_id = $1', [leadId]);
  if (await existe(c, 'scheduled_emails')) await c.query("DELETE FROM scheduled_emails WHERE related_type = 'lead' AND related_id = $1", [leadId]);
  if (adresses.size && await existe(c, 'email_log')) await c.query("DELETE FROM email_log WHERE source = 'prospect' AND LOWER(to_email) = ANY($1::text[])", [[...adresses]]);
  if (await existe(c, 'lead_interactions')) await c.query('DELETE FROM lead_interactions WHERE lead_id = $1', [leadId]);
  if (await existe(c, 'veille_annonces')) await c.query('UPDATE veille_annonces SET lead_id = NULL WHERE lead_id = $1', [leadId]);
  await c.query('DELETE FROM leads WHERE id = $1', [leadId]);
  return true;
}

// Validation par Marc : supprimer = liste d'ids à supprimer ; toutes les autres lignes sont gardées
// (pendant GARDER_MOIS mois). Chaque fiche est re-vérifiée : un contact repris entre-temps la garde.
async function valider(db, propositionId, { supprimer = [] } = {}) {
  const p = (await db.pool.query('SELECT * FROM purge_propositions WHERE id = $1', [propositionId])).rows[0];
  if (!p) { const e = new Error('Liste introuvable'); e.status = 404; throw e; }
  if (p.statut !== 'a_valider') { const e = new Error('Cette liste est déjà traitée'); e.status = 409; throw e; }
  const lignes = (await db.pool.query('SELECT * FROM purge_lignes WHERE proposition_id = $1 AND decision IS NULL', [p.id])).rows;
  const voulus = new Set((supprimer || []).map(Number));
  const encore = new Set((await candidats(db, { ids: lignes.map((l) => l.lead_id) })).map((x) => x.lead_id));
  const out = { supprimes: 0, gardes: 0, plus_concernes: 0 };
  const c = await db.pool.connect();
  try {
    await c.query('BEGIN');
    for (const l of lignes) {
      if (!encore.has(l.lead_id)) {
        await c.query("UPDATE purge_lignes SET decision = 'plus_concerne', decide_le = NOW() WHERE id = $1", [l.id]);
        out.plus_concernes++;
      } else if (voulus.has(l.lead_id)) {
        await supprimerFiche(c, l.lead_id);
        // Trace de la purge sans donnée personnelle : on garde le domaine et les dates.
        await c.query("UPDATE purge_lignes SET decision = 'supprimer', decide_le = NOW(), nom = NULL, email = NULL WHERE id = $1", [l.id]);
        out.supprimes++;
      } else {
        await c.query(`UPDATE leads SET purge_garder_jusqu_au = CURRENT_DATE + make_interval(months => ${GARDER_MOIS}) WHERE id = $1`, [l.lead_id]);
        await c.query("UPDATE purge_lignes SET decision = 'garder', decide_le = NOW() WHERE id = $1", [l.id]);
        out.gardes++;
      }
    }
    await c.query("UPDATE purge_propositions SET statut = 'traitee', traitee_le = NOW(), supprimes = $2, gardes = $3 WHERE id = $1", [p.id, out.supprimes, out.gardes]);
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
  return out;
}

// Tâche mensuelle : le 1er du mois à 7 h 17 (Paris), et au démarrage si le mois n'a pas encore sa liste.
let job = null;
function start(db) {
  const cron = require('node-cron');
  const lancer = () => proposer(db).then((p) => {
    if (p && p.lignes.length) console.log(`[Purge] Liste ${p.mois} : ${p.lignes.length} prospect(s) sans contact depuis ${ANS} ans, à valider dans Leads.`);
  }).catch((e) => console.error('[Purge] proposition :', e.message));
  if (job) job.stop();
  job = cron.schedule('17 7 1 * *', lancer, { timezone: 'Europe/Paris' });
  setTimeout(lancer, 60 * 1000);
}

module.exports = { ANS, GARDER_MOIS, moisCourant, candidats, proposer, courante, valider, supprimerFiche, start };
