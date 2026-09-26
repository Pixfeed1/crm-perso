// backend/services/creationEmailService.js
//
// Email court « création de site » pour un prospect issu d'un signal AFNIC SANS site en ligne :
// domaine réservé il y a quelques jours, entreprise souvent toute récente. Il n'y a rien à
// prouver (pas de site), donc pas de leçon : une observation vraie, une question, une sortie
// facile. Assemblé sans LLM, comme l'email par la preuve.
const { joliNom } = require('./proofEmailService');

// Qui écrit, en une phrase. Le métier du destinataire n'est pas repris ici : à ce stade on ne sait
// pas toujours ce qu'il fait, et « des travaux de plomberie comme la vôtre » sonnerait faux.
function presentation(s) {
  const prenom = (process.env.OUTREACH_SENDER_NAME || '').trim();
  const entreprise = (process.env.OUTREACH_SENDER_COMPANY || 'PixFeed').trim();
  const ou = s.city ? `, autour de ${String(s.city).trim()}` : '';
  return prenom
    ? `Je m'appelle ${prenom}, je fais des sites web à mon compte (${entreprise}) pour des artisans, commerçants et petites entreprises${ou}.`
    : `Je fais des sites web à mon compte (${entreprise}) pour des artisans, commerçants et petites entreprises${ou}.`;
}

function nomEntreprise(signal, lead) {
  const raw = (signal && (signal.match_confidence === 'sur' || signal.match_confidence === 'probable') && signal.company_name)
    || (lead && lead.name && lead.name !== lead.company ? lead.name : '');
  return raw ? joliNom(raw) : '';
}

function salutation(signal) {
  const sur = signal && signal.match_confidence === 'sur' && signal.dirigeant;
  return sur ? `Bonjour ${String(signal.dirigeant).trim()},` : 'Bonjour,';
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
    presentation(s),
    '',
    contexte,
    '',
    "C'est en général le moment où l'on se demande par où commencer : faire soi-même, prendre un modèle tout fait, ou confier ça à quelqu'un. Je ne sais pas où vous en êtes, et c'est justement ma question.",
    '',
    "Si un site est déjà prévu avec quelqu'un, tant mieux, et je ne vous relancerai pas. Sinon, je peux vous dire en dix minutes de téléphone ce qu'il faudrait pour une première version simple, propre et trouvable sur Google, et ce que ça coûterait. Un simple « oui » en réponse suffit.",
    '',
    'Bonne journée à vous,'
  ].join('\n');
  const subject = nom ? `Le site de ${nom}` : `Votre site sur ${domaine}`;
  return { ok: true, subject, body, mode: 'creation' };
}

module.exports = { buildCreationEmail };
