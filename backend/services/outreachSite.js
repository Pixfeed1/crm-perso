// Expéditeur des mails de netlinking, par site (jurojin.net : site 2). Tout vient de backend/.env :
//   OUTREACH_SMTP_HOST_<site>, OUTREACH_SMTP_PORT_<site> (465 par défaut), OUTREACH_SMTP_USER_<site>,
//   OUTREACH_SMTP_PASSWORD_<site>, OUTREACH_FROM_<site> (ex. « Jurojin <contact@jurojin.net> »),
//   OUTREACH_REPLY_TO_<site> (facultatif, sinon l'expéditeur), OUTREACH_PLAFOND_<site> (15 par jour par défaut),
//   OUTREACH_SIGNATURE_<site> (facultatif : chemin du HTML de signature, sinon config/signatures/site-<site>.html).
// Les identifiants ne sont jamais en base ni renvoyés. Un site sans ces réglages n'envoie rien par ce module
// (pixfeed.net garde son envoi actuel, onglet Backlinks).
// Aucun suivi : ni redirection de clic, ni pixel, ni lien de désinscription vers le CRM ; Message-ID au nom
// du domaine de l'expéditeur. Rien dans le mail ne mène au CRM.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const env = (k, site) => (process.env[`${k}_${site}`] || '').trim();

function config(siteId) {
  const s = Number(siteId);
  const host = env('OUTREACH_SMTP_HOST', s), user = env('OUTREACH_SMTP_USER', s), pass = env('OUTREACH_SMTP_PASSWORD', s), from = env('OUTREACH_FROM', s);
  if (!host || !user || !pass || !from) return null;
  const adresse = (/<([^>]+)>/.exec(from) || [null, from])[1].trim().toLowerCase();
  const port = Number(env('OUTREACH_SMTP_PORT', s) || 465);
  const fichierSignature = env('OUTREACH_SIGNATURE', s) || path.join(__dirname, '..', 'config', 'signatures', `site-${s}.html`);
  return {
    site_id: s, host, port, user, pass, from, adresse, domaine: adresse.split('@')[1],
    reply_to: env('OUTREACH_REPLY_TO', s) || from,
    plafond: Math.max(1, Number(env('OUTREACH_PLAFOND', s) || 15)),
    fichierSignature
  };
}

// Sites qui ont un expéditeur réglé (pour l'écran : quels sites passent par ce module).
function sitesConfigures() {
  const ids = new Set();
  for (const k of Object.keys(process.env)) { const m = /^OUTREACH_SMTP_HOST_(\d+)$/.exec(k); if (m) ids.add(Number(m[1])); }
  return [...ids].filter((id) => config(id)).map((id) => { const c = config(id); return { site_id: id, expediteur: c.adresse, plafond: c.plafond, signature: fs.existsSync(c.fichierSignature) }; });
}

function signature(c) {
  try { const h = fs.readFileSync(c.fichierSignature, 'utf8').trim(); return h || null; } catch { return null; }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const texteDe = (html) => String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim();

// Message prêt à partir : corps (texte fourni à l'appel) + signature du site ; en réponse au fil si relance.
function composer(c, { destinataire, objet, corps, en_reponse_a = null }) {
  const sig = signature(c);
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222;"><div style="white-space:pre-wrap;">${esc(corps)}</div>${sig ? `<div style="margin-top:18px;">${sig}</div>` : ''}</div>`;
  const messageId = `<${crypto.randomUUID()}@${c.domaine}>`;
  return {
    from: c.from, to: destinataire, replyTo: c.reply_to, subject: objet, html,
    text: `${corps}${sig ? `\n\n-- \n${texteDe(sig)}` : ''}`,
    messageId,
    ...(en_reponse_a ? { inReplyTo: en_reponse_a, references: [en_reponse_a] } : {})
  };
}

// Transport injectable pour les tests.
let transportTest = null;
function definirTransport(t) { transportTest = t; }

async function envoyer(c, message) {
  const t = transportTest || nodemailer.createTransport({ host: c.host, port: c.port, secure: c.port === 465, auth: { user: c.user, pass: c.pass } });
  const info = await t.sendMail(message);
  return { message_id: info.messageId || message.messageId, accepte: info.accepted, refuse: info.rejected };
}

module.exports = { config, sitesConfigures, signature, composer, envoyer, definirTransport };
