// backend/services/boiteService.js
//
// Lecture de la boîte d'envoi (lot 7), en LECTURE SEULE : la boîte est ouverte en lecture seule (aucun
// message marqué lu, déplacé ni supprimé). Accès dans backend/.env uniquement :
//   IMAP_HOST, IMAP_PORT (993), IMAP_USER, IMAP_PASSWORD, IMAP_SECURE (true), IMAP_DOSSIER (INBOX).
// Chaque message nouveau (depuis le dernier relevé, au premier passage : 30 derniers jours) est trié
// (utils/boiteClassement.js) puis rattaché à un prospect contacté :
//   - rebond définitif : appliqué (ligne de campagne « rebond », adresse bloquée), comme un rebond immédiat ;
//   - réponse : appliquée (ligne « a répondu », relances fermées, fiche « en discussion ») ;
//   - refus probable : compté comme une réponse (relances fermées) ET soumis à Marc, qui choisit
//     « refus de toute sollicitation », « ne plus écrire » ou « ce n'est pas un refus » ;
//   - réponse automatique, rebond temporaire : notés, rien d'autre.
// Un message d'un expéditeur inconnu (pas un prospect contacté) est ignoré et n'est pas conservé.
// On ne garde du message que l'expéditeur, l'objet, la date et un extrait de la partie nouvelle.

const { classer } = require('../utils/boiteClassement');
const optout = require('./optout');

const configuree = () => !!(process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_PASSWORD);

// Prospect contacté correspondant à une adresse : la ligne de campagne envoyée la plus récente, sinon
// une fiche (email de la fiche ou d'un contact) qui a reçu un email de prospection.
async function rattacher(db, adresse) {
  if (!adresse) return { lead_id: null, item: null };
  const item = (await db.pool.query(
    `SELECT ci.* FROM campaign_items ci JOIN campaigns c ON c.id = ci.campaign_id
      WHERE LOWER(ci.to_email) = $1 AND ci.statut IN ('envoye', 'repondu', 'programme') AND c.test_mode IS NOT TRUE
      ORDER BY ci.sent_at DESC NULLS LAST LIMIT 1`, [adresse]).catch(() => ({ rows: [] }))).rows[0] || null;
  if (item && item.lead_id) return { lead_id: item.lead_id, item };
  const l = (await db.pool.query(
    `SELECT l.id FROM leads l WHERE LOWER(l.email) = $1
     UNION SELECT c.lead_id FROM contacts c WHERE LOWER(c.email) = $1 AND c.lead_id IS NOT NULL LIMIT 1`, [adresse]).catch(() => ({ rows: [] }))).rows[0];
  if (!l) return { lead_id: null, item };
  const contacte = (await db.pool.query(
    `SELECT 1 FROM email_tracking WHERE contact_type = 'lead' AND contact_id = $1 LIMIT 1`, [l.id]).catch(() => ({ rows: [] }))).rows.length;
  return { lead_id: contacte ? l.id : null, item };
}

async function noter(db, leadId, texte) {
  if (!leadId) return;
  await db.pool.query(`INSERT INTO interactions (contact_type, contact_id, type, date, notes, followup_done) VALUES ('lead', $1, 'note', NOW(), $2, TRUE)`, [leadId, texte]).catch(() => {});
}

// Effet d'une réponse : comme « A répondu » sur la ligne de campagne.
async function appliquerReponse(db, { lead_id: leadId, item }, m) {
  if (item && ['envoye', 'programme'].includes(item.statut)) {
    await db.pool.query("UPDATE campaign_items SET statut = 'repondu', raison = $2, updated_at = NOW() WHERE id = $1", [item.id, `Réponse reçue le ${new Date(m.recu_le).toLocaleDateString('fr-FR')} (lue dans la boîte d'envoi)`]);
  }
  if (!leadId) return;
  await db.pool.query(`UPDATE interactions SET followup_done = TRUE WHERE contact_type = 'lead' AND contact_id = $1 AND followup_done = FALSE AND next_followup_date IS NOT NULL`, [leadId]).catch(() => {});
  await db.pool.query("UPDATE leads SET relation_status = 'en_discussion', updated_at = NOW() WHERE id = $1 AND COALESCE(relation_status, 'nouveau') IN ('nouveau', 'a_contacter', 'contacte')", [leadId]).catch(() => {});
  await db.pool.query(
    `INSERT INTO interactions (contact_type, contact_id, type, reached, date, notes, followup_done) VALUES ('lead', $1, 'email', 'joint', $2, $3, TRUE)`,
    [leadId, m.recu_le, `Réponse reçue par email${m.sujet ? ` (« ${m.sujet} »)` : ''}, lue dans la boîte d'envoi : ${m.extrait ? m.extrait.slice(0, 200) : ''}`]).catch(() => {});
}

async function appliquerRebond(db, { lead_id: leadId, item }, m) {
  if (m.adresse) await optout.addOptout(db, m.adresse, 'rebond');
  if (item && ['envoye', 'programme'].includes(item.statut)) {
    await db.pool.query("UPDATE campaign_items SET statut = 'rebond', raison = $2, updated_at = NOW() WHERE id = $1", [item.id, `Avis de non-remise reçu (${m.raison || 'définitif'}) : adresse bloquée`]);
  }
  await noter(db, leadId, `Email revenu en erreur pour ${m.adresse} (${m.raison || 'non-remise définitive'}) : adresse bloquée.`);
}

// Traite un message décodé. Renvoie la ligne enregistrée, ou null si le message ne concerne aucun prospect.
async function traiter(db, parsed, { uid = null, dossier = 'INBOX' } = {}) {
  const c = classer(parsed);
  const messageId = parsed.messageId || null;
  if (messageId) {
    const deja = (await db.pool.query('SELECT id FROM boite_messages WHERE message_id = $1', [messageId])).rows[0];
    if (deja) return null;
  }
  const lien = await rattacher(db, c.adresse);
  if (!lien.lead_id && !lien.item) return null; // expéditeur inconnu : rien gardé
  const m = { ...c, recu_le: parsed.date || new Date() };
  let statut = 'note';
  if (c.type === 'rebond') { await appliquerRebond(db, lien, m); statut = 'applique'; }
  else if (c.type === 'reponse') { await appliquerReponse(db, lien, m); statut = 'applique'; }
  else if (c.type === 'refus_probable') { await appliquerReponse(db, lien, m); statut = 'a_confirmer'; }
  else if (c.type === 'auto') await noter(db, lien.lead_id, `Réponse automatique reçue (${c.sujet || 'sans objet'}) : ce n'est pas une réponse.`);
  else if (c.type === 'rebond_temporaire') await noter(db, lien.lead_id, `Non-remise temporaire pour ${c.adresse} (${c.raison}) : rien de bloqué.`);
  const r = await db.pool.query(
    `INSERT INTO boite_messages (dossier, uid, message_id, recu_le, de, adresse, sujet, extrait, type, raison, lead_id, campaign_item_id, statut)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    [dossier, uid, messageId, m.recu_le, c.de, c.adresse, c.sujet.slice(0, 300), c.extrait, c.type, c.raison, lien.lead_id, lien.item ? lien.item.id : null, statut]);
  return r.rows[0];
}

// Relevé : messages arrivés depuis le dernier UID vu (dossier ouvert en lecture seule).
async function relever(db, { client = null, jours = 30 } = {}) {
  if (!client && !configuree()) return { configuree: false, message: 'Lecture de la boîte non configurée (IMAP_HOST, IMAP_USER, IMAP_PASSWORD dans backend/.env).' };
  const dossier = process.env.IMAP_DOSSIER || 'INBOX';
  const { ImapFlow } = require('imapflow');
  const { simpleParser } = require('mailparser');
  const imap = client || new ImapFlow({
    host: process.env.IMAP_HOST, port: Number(process.env.IMAP_PORT || 993), secure: process.env.IMAP_SECURE !== 'false',
    auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD }, logger: false
  });
  const out = { configuree: true, lus: 0, retenus: 0, par_type: {}, erreurs: [] };
  await imap.connect();
  try {
    const lock = await imap.getMailboxLock(dossier, { readOnly: true });
    try {
      const etat = (await db.pool.query('SELECT * FROM boite_etat WHERE dossier = $1', [dossier])).rows[0];
      const validite = String(imap.mailbox.uidValidity);
      const reprise = etat && etat.uid_validity === validite ? Number(etat.dernier_uid) : null;
      const critere = reprise ? { uid: `${reprise + 1}:*` } : { since: new Date(Date.now() - jours * 86400000) };
      let max = reprise || 0;
      for await (const msg of imap.fetch(critere, { uid: true, source: true }, { uid: true })) {
        if (reprise && msg.uid <= reprise) continue;
        out.lus++;
        max = Math.max(max, msg.uid);
        try {
          const ligne = await traiter(db, await simpleParser(msg.source), { uid: msg.uid, dossier });
          if (ligne) { out.retenus++; out.par_type[ligne.type] = (out.par_type[ligne.type] || 0) + 1; }
        } catch (e) { out.erreurs.push(`message ${msg.uid} : ${e.message}`); }
      }
      await db.pool.query(
        `INSERT INTO boite_etat (dossier, uid_validity, dernier_uid, releve_le) VALUES ($1, $2, $3, NOW())
         ON CONFLICT (dossier) DO UPDATE SET uid_validity = $2, dernier_uid = GREATEST(CASE WHEN boite_etat.uid_validity = $2 THEN boite_etat.dernier_uid ELSE 0 END, $3), releve_le = NOW()`,
        [dossier, validite, max]);
    } finally { lock.release(); }
  } finally { await imap.logout().catch(() => {}); }
  return out;
}

// Liste pour l'écran : refus à confirmer d'abord, puis les derniers messages retenus.
async function lister(db, { limite = 50 } = {}) {
  const { rows } = await db.pool.query(
    `SELECT b.*, l.company, l.name, ci.subject AS email_envoye
       FROM boite_messages b LEFT JOIN leads l ON l.id = b.lead_id LEFT JOIN campaign_items ci ON ci.id = b.campaign_item_id
      ORDER BY (b.statut = 'a_confirmer') DESC, b.recu_le DESC LIMIT $1`, [limite]);
  const etat = (await db.pool.query('SELECT * FROM boite_etat ORDER BY releve_le DESC LIMIT 1').catch(() => ({ rows: [] }))).rows[0] || null;
  return { configuree: configuree(), dernier_releve: etat ? etat.releve_le : null, a_confirmer: rows.filter((r) => r.statut === 'a_confirmer').length, messages: rows };
}

// Décision de Marc sur un refus probable : 'tout' | 'email' | 'pas_refus'.
async function confirmer(db, id, decision) {
  const m = (await db.pool.query('SELECT * FROM boite_messages WHERE id = $1', [id])).rows[0];
  if (!m) throw Object.assign(new Error('Message introuvable'), { status: 404 });
  if (m.statut !== 'a_confirmer') throw Object.assign(new Error('Ce message est déjà traité'), { status: 409 });
  if (!['tout', 'email', 'pas_refus'].includes(decision)) throw Object.assign(new Error('Décision : tout, email ou pas_refus'), { status: 400 });
  if (decision !== 'pas_refus') {
    if (m.lead_id) {
      await require('./refusService').enregistrer(db, m.lead_id, { canal: decision, motif: `Réponse du ${new Date(m.recu_le).toLocaleDateString('fr-FR')} : ${String(m.extrait || '').slice(0, 150)}`, source: 'boite' });
    } else if (m.adresse) await optout.addOptout(db, m.adresse, 'opposition');
    if (m.campaign_item_id) await db.pool.query("UPDATE campaign_items SET statut = 'oppose', updated_at = NOW() WHERE id = $1 AND statut IN ('envoye', 'repondu')", [m.campaign_item_id]);
  }
  await db.pool.query('UPDATE boite_messages SET statut = $2, decide_le = NOW() WHERE id = $1', [id, decision === 'pas_refus' ? 'rejete' : 'confirme']);
  return (await db.pool.query('SELECT * FROM boite_messages WHERE id = $1', [id])).rows[0];
}

// Relevé automatique toutes les 15 minutes, seulement si la boîte est configurée.
let job = null;
function start(db) {
  if (!configuree()) { console.log('[Boîte] lecture non configurée (IMAP_* absents de .env) : réponses et rebonds à marquer à la main.'); return; }
  const cron = require('node-cron');
  let enCours = false;
  const tour = async () => {
    if (enCours) return; enCours = true;
    try {
      const r = await relever(db);
      if (r.retenus) console.log(`[Boîte] ${r.retenus} message(s) de prospects : ${JSON.stringify(r.par_type)}`);
      if (r.erreurs.length) console.error('[Boîte]', r.erreurs.slice(0, 3).join(' | '));
    } catch (e) { console.error('[Boîte] relevé :', e.message); } finally { enCours = false; }
  };
  if (job) job.stop();
  job = cron.schedule('*/15 * * * *', tour);
  setTimeout(tour, 90 * 1000);
}

module.exports = { configuree, rattacher, traiter, relever, lister, confirmer, start };
