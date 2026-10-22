// backend/utils/smtpErrors.js
// Lecture d'une erreur d'envoi SMTP (nodemailer) : permanente ou passagère, et adresse inexistante.
//  - Permanente (5xx) : le serveur distant refuse définitivement ce message. Réessayer une minute
//    plus tard ne change rien et pèse sur la réputation de l'expéditeur -> pas de nouvelle tentative.
//  - Passagère (4xx, réseau, délai) : la reprise du worker reste utile.
//  - Adresse inexistante (550 5.1.1 « User unknown », « Recipient address rejected »…) : c'est un
//    rebond ; en campagne la ligne passe en « rebond » et l'adresse est bloquée, comme un marquage à la main.

const RECIPIENT_UNKNOWN = /\b5\.1\.\d+\b|user unknown|recipient not found|unknown user|recipient address rejected|does not exist|no such user|no such recipient|mailbox (?:unavailable|not found|does not exist)|invalid recipient|unknown recipient|address rejected|unrouteable address|no mailbox/i;

// Code SMTP : d'abord responseCode (nodemailer), sinon le début de la réponse du serveur
// (« 550 5.1.1 … »). Jamais le message libre : « port 587 » ne doit pas passer pour un 5xx.
function smtpCode(err) {
  if (!err) return null;
  if (Number.isInteger(err.responseCode)) return err.responseCode;
  const m = /^\s*(\d{3})[\s-]/.exec(String(err.response || ''));
  return m ? parseInt(m[1], 10) : null;
}

function isPermanentSmtpError(err) {
  const code = smtpCode(err);
  return code !== null && code >= 500 && code < 600;
}

function isRecipientUnknown(errOrText) {
  const t = typeof errOrText === 'string' ? errOrText : `${(errOrText && errOrText.response) || ''} ${(errOrText && errOrText.message) || ''}`;
  return RECIPIENT_UNKNOWN.test(t);
}

// Texte à journaliser : la réponse du serveur si elle existe (plus précise), sinon le message.
function smtpErrorText(err) {
  if (!err) return '';
  return String(err.response || err.message || err).slice(0, 500);
}

module.exports = { smtpCode, isPermanentSmtpError, isRecipientUnknown, smtpErrorText };
