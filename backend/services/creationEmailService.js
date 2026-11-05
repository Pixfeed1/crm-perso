// backend/services/creationEmailService.js
//
// Email court « création de site » pour un prospect issu d'un signal AFNIC SANS site en ligne :
// domaine réservé il y a quelques jours, entreprise souvent toute récente. Il n'y a rien à
// prouver (pas de site), donc pas de leçon : une observation vraie, une question, une sortie
// facile. Assemblé sans LLM, comme l'email par la preuve.
const { joliNom } = require('./proofEmailService');

// Même structure que les autres emails (lot 3) : constat, pourquoi ça le concerne, une question.
const { assembler } = require('./proofEmailService');

function nomEntreprise(signal, lead) {
  // Nom de l'entreprise seulement si le rapprochement est sûr (« probable » peut désigner une autre société).
  const raw = (signal && signal.match_confidence === 'sur' && signal.company_name)
    || (lead && lead.name && lead.name !== lead.company ? lead.name : '');
  return raw ? joliNom(raw) : '';
}

// Jamais de nom de personne : l'identité d'un nouveau domaine vient d'un rapprochement par le nom, pas
// d'un SIREN lu sur le site. Sans certitude, « Bonjour, » tout court (règle validée par Marc).
function salutation() {
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
  // Même structure que les autres emails : constat, pourquoi ça le concerne, une question.
  const body = assembler([
    salutation(s),
    contexte,
    "Tant que le site n'est pas en ligne, ceux qui tapent cette adresse ne trouvent rien.",
    'Avez-vous déjà prévu quelqu\'un pour réaliser le site ?',
    'Bonne journée,'
  ]);
  const subject = nom ? `Le site de ${nom}` : `Votre site sur ${domaine}`;
  return { ok: true, subject, body, mode: 'creation' };
}

module.exports = { buildCreationEmail };
