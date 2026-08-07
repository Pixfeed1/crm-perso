// backend/services/optout.js
//
// Désabonnement / opposition (RGPD, art. L.34-5 CPCE) : tout email de PROSPECTION doit
// porter un moyen simple et gratuit de se désinscrire, et on ne doit jamais réécrire à
// quelqu'un qui s'est opposé. Ce module gère :
//   - la blocklist (table email_optout),
//   - un lien de désinscription SIGNÉ (HMAC, pas de token à stocker),
//   - le pied de page d'identification + désinscription à coller dans les emails.

const crypto = require('crypto');

function baseUrl() {
  return (process.env.APP_BASE_URL || 'https://crm.pixfeed.net').replace(/\/+$/, '');
}
function secret() {
  return process.env.JWT_SECRET || process.env.UNSUBSCRIBE_SECRET || 'pixfeed-unsub';
}
const norm = (e) => String(e || '').trim().toLowerCase();

// Jeton signé lié à l'email (empêche de désinscrire une adresse arbitraire en masse).
function token(email) {
  return crypto.createHmac('sha256', secret()).update(norm(email)).digest('hex').slice(0, 24);
}
function verify(email, t) {
  const good = token(email);
  const a = Buffer.from(good), b = Buffer.from(String(t || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function unsubUrl(email) {
  return `${baseUrl()}/api/track/u?e=${encodeURIComponent(norm(email))}&t=${token(email)}`;
}

// Vrai si l'adresse s'est désinscrite (à vérifier AVANT tout envoi de prospection).
async function isOptedOut(db, email) {
  try {
    const r = await db.pool.query('SELECT 1 FROM email_optout WHERE email = $1 LIMIT 1', [norm(email)]);
    return r.rows.length > 0;
  } catch { return false; }
}

async function addOptout(db, email, source = 'lien') {
  await db.pool.query(
    `INSERT INTO email_optout (email, source) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING`,
    [norm(email), source]
  );
}

// Pied de page RGPD : identification de l'expéditeur + lien de désinscription.
function footerHtml(email) {
  const nom = process.env.OUTREACH_SENDER_NAME || '';
  const soc = process.env.OUTREACH_SENDER_COMPANY || 'PixFeed';
  const who = [nom, soc].filter(Boolean).join(', ');
  return `<div style="margin-top:22px;padding-top:12px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;line-height:1.5;">`
    + `Cet email vous est adressé par ${who} dans un cadre professionnel. `
    + `Si vous ne souhaitez plus être contacté, <a href="${unsubUrl(email)}" style="color:#6b7280;">cliquez ici pour vous désinscrire</a>.`
    + `</div>`;
}

// En-tête List-Unsubscribe (Gmail/Outlook affichent un bouton natif -> meilleure délivrabilité).
function listUnsubHeader(email) {
  return { 'List-Unsubscribe': `<${unsubUrl(email)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
}

module.exports = { isOptedOut, addOptout, unsubUrl, footerHtml, listUnsubHeader, verify, addOptoutByLink: addOptout, token };
