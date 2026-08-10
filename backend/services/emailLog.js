// backend/services/emailLog.js
//
// Journal CENTRAL des emails sortants.
//
// Pourquoi : jusqu'ici, seuls les emails de prospection laissaient une trace
// (email_tracking), et uniquement s'ils étaient rattachés à un prospect. Un envoi
// rapide programmé, une fois parti, n'apparaissait donc nulle part : ni dans les
// programmés (passés en 'sent'), ni dans le suivi d'ouverture (jamais créé).
//
// Principe : les envois passent tous par emailService.sendEmail ou
// seoOutreachService.sendViaGmail. On enregistre à ces deux endroits, ce qui
// garantit la couverture sans avoir à modifier chaque appelant.
//
// L'enregistrement est TOUJOURS best-effort : un échec d'écriture du journal ne
// doit jamais empêcher un email de partir.

// La connexion est injectée au démarrage (les services n'ont pas accès à app.locals).
let pool = null;

function init(dbPool) {
  pool = dbPool || null;
}

// Normalise une liste d'adresses (chaîne ou tableau) en texte lisible.
function asText(v) {
  if (!v) return null;
  const list = Array.isArray(v) ? v : String(v).split(/[,;]/);
  const clean = list.map((s) => String(s).trim()).filter(Boolean);
  return clean.length ? clean.join(', ') : null;
}

/**
 * Enregistre un envoi. Ne lève jamais : en cas de problème on trace en console
 * et on laisse l'envoi suivre son cours.
 */
async function record(entry = {}) {
  if (!pool) return null;
  try {
    const r = await pool.query(
      `INSERT INTO email_log
         (to_email, cc_email, bcc_email, subject, body_html, source, from_account,
          from_email, related_type, related_id, tracking_token, attachments_count,
          status, error_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        asText(entry.to), asText(entry.cc), asText(entry.bcc),
        entry.subject || null, entry.html || null,
        entry.source || 'autre',
        entry.from_account === 'gmail' ? 'gmail' : 'pro',
        entry.from_email || null,
        entry.related_type || null, entry.related_id || null,
        entry.tracking_token || null,
        Number(entry.attachments_count) || 0,
        entry.status === 'failed' ? 'failed' : 'sent',
        entry.error_message || null
      ]
    );
    return r.rows[0] ? r.rows[0].id : null;
  } catch (e) {
    console.error('[EmailLog] enregistrement impossible:', e.message);
    return null;
  }
}

module.exports = { init, record };
