// backend/services/creationEmailService.js
//
// Email court « création de site » pour un prospect issu d'un signal AFNIC SANS site en ligne :
// domaine réservé il y a quelques jours, entreprise souvent toute récente. Il n'y a rien à
// prouver (pas de site), donc pas de leçon : une observation vraie, une question, une sortie
// facile. Assemblé sans LLM, comme l'email par la preuve.
const { joliNom, nomCourt } = require('./proofEmailService');

// Présentation : la même phrase que l'email par la preuve (une seule source).
const { presentation } = require('./proofEmailService');

function nomEntreprise(signal, lead) {
  const raw = (signal && (signal.match_confidence === 'sur' || signal.match_confidence === 'probable') && signal.company_name)
    || (lead && lead.name && lead.name !== lead.company ? lead.name : '');
  return raw ? joliNom(raw) : '';
}

function salutation(signal) {
  const sur = signal && signal.match_confidence === 'sur' && signal.dirigeant;
  if (sur) {
    const court = nomCourt({ gerant: signal.dirigeant, gerant_nom: signal.dirigeant_nom, gerant_prenom: signal.dirigeant_prenom });
    return court ? `Bonjour ${court},` : 'Bonjour,';
  }
  return 'Bonjour,';
}

/**
 * @param {object} signal ligne domain_signals (match_confidence, company_name, dirigeant, naf_label, city, website_status, company_created_at, registered_at)
 * @param {object} lead   fiche prospect
 * @returns {{ ok: true, subject: string, body: string, mode: 'creation' }}
 */
function buildCreationEmail(signal, lead) {
  const s = signal || {};
  const domaine = (lead && lead.company) || s.domain || '';
  const nom = nomEntreprise(s, lead);
  const ws = s.website_status || 'inconnu';
  const constat = ws === 'parking'
    ? "pour l'instant, il affiche la page d'attente de l'hébergeur"
    : ws === 'vide'
      ? "pour l'instant, le site est installé mais encore vide"
      : "pour l'instant, il ne mène à aucun site";
  const recente = s.company_created_at && (Date.now() - new Date(s.company_created_at).getTime()) < 120 * 86400000;
  const contexte = recente
    ? `Je vois que ${nom || 'votre entreprise'} vient de se lancer, et que le nom de domaine a été réservé il y a quelques jours : ${constat}.`
    : `Je vois que le nom de domaine ${domaine} vient d'être réservé${nom ? ` pour ${nom}` : ''} : ${constat}.`;
  const body = [
    salutation(s),
    '',
    presentation(),
    '',
    contexte,
    '',
    "Si le site n'est pas encore confié à quelqu'un, je peux vous proposer une première version simple, propre et trouvable sur Google, avec un devis clair.",
    '',
    'Avez-vous déjà prévu quelque chose pour ce site ?',
    '',
    'Bonne journée à vous,'
  ].join('\n');
  const subject = nom ? `Le site de ${nom}` : `Votre site sur ${domaine}`;
  return { ok: true, subject, body, mode: 'creation' };
}

module.exports = { buildCreationEmail };
