// backend/services/proofEmailService.js
//
// Email de prospection « par la preuve » : une seule affirmation, vérifiable par le gérant
// en dix secondes sur son propre site, une conséquence dans SON activité, au plus un élément
// de contexte technique mesuré. Rien d'autre.
//
// Règle absolue : sans preuve, pas d'email. Un prospect grillé par un message générique ne
// se rattrape pas. Les signaux du crawler sont donc classés :
//   - PREUVE : constaté et visible (site en erreur, servi en HTTP, titre par défaut, robots
//     qui bloque Google, certificat expiré, lien mentions légales cassé, copyright figé…) ;
//   - INDICE : vrai mais déduit ou invisible pour lui (version CMS déduite, PHP, SPF, DMARC,
//     CGV, rétractation, contenu mixte…). Un indice n'ouvre jamais un email, il le complète.
//
// Aucun appel à un modèle : le texte est assemblé à partir des mesures, mot pour mot.
// L'humain relit et modifie avant l'envoi ; la signature (Paramètres) est ajoutée à l'envoi.

const { auditFlags, phpEol } = require('../utils/prospectScore');

// Ordre de conviction des preuves : ce qui coûte des ventes ou fait honte d'abord.
const PREUVES_ORDRE = [
  'accueil_404', 'erreur_serveur', 'invisible_google', 'http_non_securise', 'ssl_expire',
  'ssl_invalide', 'ssl_bientot', 'titre_defaut', 'mentions_404', 'mobile', 'copyright_fige'
];
const PREUVES = new Set(PREUVES_ORDRE);

const site = (r) => (r.domain || '').replace(/^www\./, '');

// Catalogue : pour chaque preuve, l'objet, la phrase de preuve (un fait, vérifiable) et la
// conséquence métier (ce que ça lui coûte, pas ce que c'est techniquement).
const CATALOGUE = {
  accueil_404: (r) => ({
    sujet: `votre page d'accueil renvoie une erreur 404`,
    preuve: `En ouvrant ${site(r)} aujourd'hui, la page d'accueil renvoie une erreur 404 : le domaine répond, mais aucun site ne s'affiche.`,
    consequence: `Un client qui tape votre adresse ou vous trouve sur Google tombe sur une page vide et repart. Google finit par retirer le site de ses résultats.`
  }),
  erreur_serveur: (r) => ({
    sujet: `votre site affiche une erreur ${r.http_status}`,
    preuve: `En ouvrant ${site(r)} aujourd'hui, le serveur renvoie une erreur ${r.http_status} au lieu de la boutique.`,
    consequence: `Pendant ce temps, chaque visiteur repart sans rien voir, et Google enregistre un site en panne.`
  }),
  invisible_google: (r) => ({
    sujet: `votre site demande à Google de ne pas l'indexer`,
    preuve: r.noindex
      ? `La page d'accueil de ${site(r)} contient une balise « noindex » : elle demande explicitement à Google de ne pas l'indexer.`
      : `Le fichier robots.txt de ${site(r)} interdit à Google de parcourir le site (Disallow: /).`,
    consequence: `Concrètement, quelqu'un qui cherche ce que vous vendez ne peut pas tomber sur vous, quel que soit le mot tapé. C'est le réglage d'un site en construction, pas d'une boutique ouverte.`
  }),
  http_non_securise: (r) => ({
    sujet: `« Non sécurisé » s'affiche sur ${site(r)}`,
    preuve: `${site(r)} s'ouvre en HTTP, sans cadenas : le navigateur affiche « Non sécurisé » à côté de l'adresse, dès la page d'accueil.`,
    consequence: `Sur une boutique, c'est la première chose qu'un client voit avant de sortir sa carte, et beaucoup s'arrêtent là.`
  }),
  ssl_expire: (r) => ({
    sujet: `le certificat de ${site(r)} a expiré`,
    preuve: `Le certificat de sécurité de ${site(r)} est expiré${r.ssl_expire_jours != null ? ` depuis ${Math.abs(r.ssl_expire_jours)} jour${Math.abs(r.ssl_expire_jours) > 1 ? 's' : ''}` : ''} : les visiteurs voient un avertissement plein écran avant d'atteindre le site.`,
    consequence: `La plupart cliquent sur « Retour ». Ceux qui passent outre arrivent sur une boutique marquée dangereuse par leur navigateur.`
  }),
  ssl_invalide: (r) => ({
    sujet: `avertissement de sécurité sur ${site(r)}`,
    preuve: `En ouvrant ${site(r)} en HTTPS, le navigateur affiche un avertissement de sécurité : le certificat n'est pas valide pour ce domaine.`,
    consequence: `Un visiteur qui voit cet écran rouge ne va pas plus loin, et encore moins jusqu'au paiement.`
  }),
  ssl_bientot: (r) => ({
    sujet: `votre certificat expire dans ${r.ssl_expire_jours} jours`,
    preuve: `Le certificat de sécurité de ${site(r)} expire dans ${r.ssl_expire_jours} jour${r.ssl_expire_jours > 1 ? 's' : ''} (visible en cliquant sur le cadenas du navigateur).`,
    consequence: `Passé cette date, chaque visiteur verra un avertissement de sécurité plein écran avant d'atteindre votre site, souvent sans que vous le sachiez tout de suite.`
  }),
  titre_defaut: (r) => ({
    sujet: `votre site s'appelle « ${String(r.title || '').trim()} » dans Google`,
    preuve: `Le titre de la page d'accueil de ${site(r)}, celui qui s'affiche dans Google et dans l'onglet du navigateur, est « ${String(r.title || '').trim()} » : le titre d'installation, jamais remplacé.`,
    consequence: `Dans les résultats de recherche, votre boutique apparaît sous ce nom, sans rien qui dise ce que vous vendez ni où. Personne ne clique sur « ${String(r.title || '').trim()} ».`
  }),
  mentions_404: (r) => ({
    sujet: `le lien « mentions légales » de ${site(r)} ne mène nulle part`,
    preuve: `Le lien « mentions légales » en pied de page de ${site(r)} mène à une page en erreur : la mention existe dans le menu, la page n'existe plus.`,
    consequence: `C'est une obligation légale en France, et c'est aussi ce qu'un client méfiant va vérifier avant de commander.`
  }),
  mobile: (r) => ({
    sujet: `${site(r)} sur téléphone`,
    preuve: `Ouvert sur un téléphone, ${site(r)} s'affiche comme sur un écran d'ordinateur, en tout petit, à agrandir au doigt : la page n'a pas de réglage d'affichage mobile.`,
    consequence: `Plus de la moitié des visites se font sur téléphone. Sur cet écran-là, la plupart des gens ferment avant d'avoir lu.`
  }),
  copyright_fige: (r) => ({
    sujet: `© ${r.copyright_annee} en bas de ${site(r)}`,
    preuve: `Le pied de page de ${site(r)} affiche encore « © ${r.copyright_annee} ».`,
    consequence: `Pour un visiteur, c'est le signe d'un site que personne ne suit, et il se demande si la boutique est encore ouverte.`
  })
};

// Contexte technique : une phrase, seulement à partir d'une mesure.
function contexteTechnique(r, flags) {
  const keys = new Set(flags.map((f) => f.key));
  const eol = phpEol(r.serveur_php);
  if (eol) return `Le site tourne sur PHP ${eol.branch}, qui ne reçoit plus de correctifs de sécurité depuis ${eol.eol.slice(0, 4)}.`;
  if (keys.has('version_obsolete') && r.platform_version) {
    const v = String(r.platform_version).replace(/\s*\(déduit\)/i, '');
    const fin = /prestashop 1\.[56]/i.test(v) ? ' (plus maintenu depuis 2019)' : /drupal 7/i.test(v) ? ' (fin de vie en janvier 2025)' : '';
    return `Le site tourne sur ${v}${fin}, une version qui n'est plus mise à jour par son éditeur.`;
  }
  if (keys.has('contenu_mixte')) return `Certaines images ou scripts du site sont encore chargés en HTTP, ce qui fait disparaître le cadenas sur les pages concernées.`;
  if (keys.has('spf') && keys.has('dmarc')) return `Le domaine n'a ni SPF ni DMARC : les emails envoyés depuis votre adresse ont plus de chances de finir en spam.`;
  return '';
}

// Civilité : on ne devine jamais le genre. Prénom Nom si connu et sûr, sinon rien.
function salutation(r, lead) {
  const sur = r && r.sirene_match && r.sirene_match !== 'douteux';
  const nom = sur && r.gerant ? String(r.gerant).trim() : '';
  return nom ? `Bonjour ${nom},` : 'Bonjour,';
}

/**
 * Construit l'email par la preuve.
 * @param {object} r     ligne crawl_results (peut être null)
 * @param {object} lead  fiche prospect
 * @returns {{ ok: boolean, subject?, body?, preuve?, indices: string[], raison? }}
 */
function buildProofEmail(r, lead) {
  if (!r) {
    return { ok: false, raison: "Aucune donnée d'audit pour ce prospect (pas issu du crawl) : impossible de citer une preuve.", indices: [] };
  }
  const flags = auditFlags(r);
  const preuvesTrouvees = PREUVES_ORDRE.filter((k) => flags.some((f) => f.key === k));
  const indices = flags.filter((f) => !PREUVES.has(f.key)).map((f) => f.label);
  if (preuvesTrouvees.length === 0) {
    return {
      ok: false,
      raison: indices.length
        ? `Aucune preuve vérifiable en dix secondes sur ce site. Seulement des indices (${indices.join(', ')}) : un email générique grillerait le prospect.`
        : 'Aucun défaut visible détecté sur ce site : pas de matière pour un email honnête.',
      indices
    };
  }
  const key = preuvesTrouvees[0];
  const c = CATALOGUE[key](r);
  const contexte = contexteTechnique(r, flags);
  const body = [
    salutation(r, lead),
    '',
    c.preuve,
    '',
    c.consequence,
    contexte ? '' : null,
    contexte || null,
    '',
    "J'ai relevé le reste, captures à l'appui. Je vous envoie le document si vous voulez le lire, répondez-moi simplement oui."
  ].filter((l) => l !== null).join('\n');
  return {
    ok: true,
    subject: c.sujet.charAt(0).toUpperCase() + c.sujet.slice(1),
    body,
    preuve: key,
    preuves: preuvesTrouvees,
    indices
  };
}

module.exports = { buildProofEmail, PREUVES_ORDRE, CATALOGUE };
