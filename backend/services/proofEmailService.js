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

const { auditFlags, phpEol, nomMalOrthographie } = require('../utils/prospectScore');

// Ordre de conviction des preuves : ce qui coûte des ventes ou fait honte d'abord.
const PREUVES_ORDRE = [
  'accueil_404', 'erreur_serveur', 'invisible_google', 'nom_mal_orthographie', 'http_non_securise', 'ssl_expire',
  'ssl_invalide', 'ssl_bientot', 'titre_defaut', 'meta_desc_absurde', 'urls_non_reecrites', 'sitemap_vide',
  'mentions_404', 'mobile', 'copyright_fige'
];
const PREUVES = new Set(PREUVES_ORDRE);

const site = (r) => (r.domain || '').replace(/^www\./, '');

// « EQUIP'TOUT » -> « Equip'Tout », « MARCHAL BODIN SAS » -> « Marchal Bodin » : une raison
// sociale en capitales fait administratif dans un email, on la remet en casse de nom.
function joliNom(raw) {
  let n = String(raw || '').trim().replace(/\b(SARL|SAS|SASU|EURL|SA|SCI|SNC|EI)\b/g, '').replace(/\s+/g, ' ').trim();
  if (n && n === n.toUpperCase()) {
    n = n.toLowerCase().replace(/(^|[\s'’-])([a-zà-ÿ])/g, (m, sep, c) => sep + c.toUpperCase());
  }
  return n;
}

// Catalogue : pour chaque preuve, l'objet, la phrase de preuve (un fait, vérifiable) et la
// conséquence métier (ce que ça lui coûte, pas ce que c'est techniquement).
const CATALOGUE = {
  accueil_404: (r) => ({
    sujet: `votre page d'accueil renvoie une erreur 404`,
    preuve: `En ouvrant ${site(r)} aujourd'hui, la page d'accueil renvoie une erreur 404 : le domaine répond, mais aucun site ne s'affiche.`,
    consequence: `Je vous le dis parce que c'est le genre de chose qu'on ne voit pas depuis l'intérieur : un client qui tape votre adresse tombe sur une page vide et pense que vous avez fermé, et Google finit par retirer le site de ses résultats.`
  }),
  erreur_serveur: (r) => ({
    sujet: `votre site affiche une erreur ${r.http_status}`,
    preuve: `En ouvrant ${site(r)} aujourd'hui, le serveur renvoie une erreur ${r.http_status} au lieu de la boutique.`,
    consequence: `Peut-être que c'est passager et que vous êtes déjà dessus. Si ce n'est pas le cas, je préférais vous prévenir : pendant ce temps chaque visiteur repart sans rien voir, et Google note un site en panne.`
  }),
  invisible_google: (r) => ({
    sujet: `votre site demande à Google de ne pas l'indexer`,
    preuve: r.noindex
      ? `La page d'accueil de ${site(r)} contient une balise « noindex » : elle demande explicitement à Google de ne pas l'indexer.`
      : `Le fichier robots.txt de ${site(r)} interdit à Google de parcourir le site (Disallow: /).`,
    consequence: `C'est un réglage de site en construction qui reste souvent coché après une mise en ligne, et personne ne s'en rend compte. Concrètement, quelqu'un qui cherche ce que vous vendez ne peut pas tomber sur vous, quel que soit le mot tapé.`
  }),
  http_non_securise: (r) => ({
    sujet: `« Non sécurisé » s'affiche sur ${site(r)}`,
    preuve: `${site(r)} s'ouvre en HTTP, sans cadenas : le navigateur affiche « Non sécurisé » à côté de l'adresse, dès la page d'accueil.`,
    consequence: `Je me mets à la place d'un client qui s'apprête à sortir sa carte : ce petit mot, c'est souvent ce qui le fait hésiter, alors que le reste de votre boutique lui plaisait.`
  }),
  ssl_expire: (r) => ({
    sujet: `le certificat de ${site(r)} a expiré`,
    preuve: `Le certificat de sécurité de ${site(r)} est expiré${r.ssl_expire_jours != null ? ` depuis ${Math.abs(r.ssl_expire_jours)} jour${Math.abs(r.ssl_expire_jours) > 1 ? 's' : ''}` : ''} : les visiteurs voient un avertissement plein écran avant d'atteindre le site.`,
    consequence: `La plupart des gens cliquent sur « Retour » devant cet écran, sans même savoir ce que c'est. Ça se corrige en une heure, mais il faut le voir.`
  }),
  ssl_invalide: (r) => ({
    sujet: `avertissement de sécurité sur ${site(r)}`,
    preuve: `En ouvrant ${site(r)} en HTTPS, le navigateur affiche un avertissement de sécurité : le certificat n'est pas valide pour ce domaine.`,
    consequence: `Devant cet écran rouge, un visiteur ne va pas plus loin, et encore moins jusqu'au paiement. Ça se corrige vite, mais il faut le savoir.`
  }),
  ssl_bientot: (r) => ({
    sujet: `votre certificat expire dans ${r.ssl_expire_jours} jours`,
    preuve: `Le certificat de sécurité de ${site(r)} expire dans ${r.ssl_expire_jours} jour${r.ssl_expire_jours > 1 ? 's' : ''} (visible en cliquant sur le cadenas du navigateur).`,
    consequence: `Je vous préviens maintenant parce que passé cette date, chaque visiteur verra un avertissement de sécurité plein écran avant d'atteindre votre site, et on l'apprend en général par un client mécontent.`
  }),
  titre_defaut: (r) => ({
    sujet: `votre site s'appelle « ${String(r.title || '').trim()} » dans Google`,
    preuve: `Le titre de la page d'accueil de ${site(r)}, celui qui s'affiche dans Google et dans l'onglet du navigateur, est « ${String(r.title || '').trim()} » : le titre d'installation, jamais remplacé.`,
    consequence: `Dans les résultats de recherche, votre boutique apparaît donc sous ce nom, sans rien qui dise ce que vous vendez ni où. C'est dommage, parce que le travail derrière mérite mieux qu'un titre d'installation.`
  }),
  mentions_404: (r) => ({
    sujet: `le lien « mentions légales » de ${site(r)} ne mène nulle part`,
    preuve: `Le lien « mentions légales » en pied de page de ${site(r)} mène à une page en erreur : la mention existe dans le menu, la page n'existe plus.`,
    consequence: `Ça arrive souvent après une mise à jour, et ça passe inaperçu. Mais c'est une obligation légale, et c'est aussi ce qu'un client prudent va vérifier avant de commander.`
  }),
  mobile: (r) => ({
    sujet: `${site(r)} sur téléphone`,
    preuve: `Ouvert sur un téléphone, ${site(r)} s'affiche comme sur un écran d'ordinateur, en tout petit, à agrandir au doigt : la page n'a pas de réglage d'affichage mobile.`,
    consequence: `Aujourd'hui plus de la moitié des visites se font sur téléphone. Je me suis dit que vous préféreriez le savoir : sur cet écran-là, beaucoup ferment avant d'avoir lu.`
  }),
  nom_mal_orthographie: (r) => {
    const n0 = nomMalOrthographie(r) || { titre: r.title, attendu: r.raison_sociale || site(r) };
    const n = { ...n0, attendu: joliNom(n0.attendu) };
    return {
      sujet: `le nom de votre société est mal orthographié sur votre site`,
      preuve: `Le titre de vos pages, celui qui s'affiche dans Google et dans l'onglet du navigateur, indique « ${n.titre} ». Votre société s'appelle ${n.attendu}.`,
      consequence: `Je vous le dis comme je l'aurais voulu pour moi : c'est la première chose qu'un client voit de vous dans Google, et ça donne l'impression d'un site que personne ne relit. Ça se corrige en cinq minutes, mais il faut savoir que c'est là.`
    };
  },
  meta_desc_absurde: (r) => ({
    sujet: `ce que Google affiche sous ${site(r)}`,
    preuve: `Dans Google, le texte qui s'affiche sous le nom de votre site est « ${String(r.meta_desc_txt || '').slice(0, 120)} ».`,
    consequence: `C'est la phrase censée donner envie de cliquer, et là c'est un bout d'adresse ou de fiche technique. Face à un concurrent qui écrit « livraison en 48 h, fabrication française », le vôtre passe derrière sans que personne ne sache pourquoi.`
  }),
  urls_non_reecrites: (r) => ({
    sujet: `les adresses de vos pages`,
    preuve: `Les adresses de vos pages de catégories sont du type « index.php?id_category=102&controller=category » : aucun mot dedans, ni le produit, ni la ville.`,
    consequence: `Pour quelqu'un qui cherche ce que vous vendez près de chez lui, Google n'a rien à quoi se raccrocher. C'est un réglage, pas une refonte, mais tant qu'il est comme ça vos pages ne sortent pas sur ces recherches.`
  }),
  sitemap_vide: (r) => ({
    sujet: `votre plan de site est vide`,
    preuve: `Le fichier sitemap.xml de ${site(r)}, celui que Google lit pour connaître vos pages, répond bien mais il est vide : zéro adresse dedans.`,
    consequence: `Concrètement, vos nouveautés mettent des semaines à apparaître dans Google, quand elles apparaissent. Ce n'est pas visible depuis l'intérieur, et c'est souvent un réglage oublié.`
  }),
  copyright_fige: (r) => ({
    sujet: `© ${r.copyright_annee} en bas de ${site(r)}`,
    preuve: `Le pied de page de ${site(r)} affiche encore « © ${r.copyright_annee} ».`,
    consequence: `Ce n'est qu'un détail, mais pour quelqu'un qui découvre votre site, c'est le signe d'une boutique que personne ne suit, et il se demande si vous êtes encore ouvert.`
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

// Nom de la boutique tel qu'elle se présente : début du titre, avant le séparateur.
function nomBoutique(r) {
  // Raison sociale sûre d'abord (SIRENE), sinon le segment du titre qui ressemble le plus à un
  // nom : le plus court (« Gourmands d'Antan » plutôt que « Epicerie fine gourmande en ligne »).
  if (r.sirene_match && r.sirene_match !== 'douteux' && r.raison_sociale) {
    const rs = String(r.raison_sociale).trim();
    if (rs.length <= 40) return joliNom(rs);
  }
  const segs = String(r.title || '').split(/\s+[-|–—:]\s+/).map((x) => x.trim())
    .filter((x) => x && x.length <= 40 && !/^(prestashop|wordpress|accueil|home|bienvenue|boutique|shop)$/i.test(x));
  if (segs.length === 0) return '';
  // Le segment qui ressemble au domaine gagne (« Gourmands d'Antan » pour gourmandsdantan.fr),
  // sinon le plus court en mots, puis en lettres.
  const compact = (x) => String(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const root = compact(site(r).split('.')[0]);
  const like = (x) => { const c = compact(x); return c.length >= 4 && (root.includes(c) || c.includes(root)) ? 0 : 1; };
  segs.sort((a, b) => like(a) - like(b) || a.split(/\s+/).length - b.split(/\s+/).length || a.length - b.length);
  return segs[0];
}

// Qui écrit, en une phrase, avant de parler du site de l'autre. Sans prénom configuré
// (OUTREACH_SENDER_NAME), on se présente par le métier.
function presentation(r) {
  const prenom = (process.env.OUTREACH_SENDER_NAME || '').trim();
  const entreprise = (process.env.OUTREACH_SENDER_COMPANY || 'PixFeed').trim();
  const activite = r.naf_label ? String(r.naf_label).toLowerCase() : '';
  const ville = r.ville ? String(r.ville).trim() : '';
  const contexte = activite && ville ? `des ${activite} comme la vôtre, à ${ville}` : ville ? `des commerces comme le vôtre, à ${ville}` : `des commerçants et artisans`;
  const qui = prenom
    ? `Je m'appelle ${prenom}, je m'occupe de sites web à mon compte (${entreprise}) pour ${contexte}.`
    : `Je fais des sites web à mon compte (${entreprise}) pour ${contexte}.`;
  return qui;
}

function accroche(r) {
  const nom = nomBoutique(r);
  return nom
    ? `Je suis tombé sur ${nom} en cherchant des boutiques de votre secteur, et j'ai pris le temps de regarder votre site. Une chose m'a sauté aux yeux, que vous n'avez peut-être pas vue de l'intérieur :`
    : `Je suis tombé sur ${site(r)} en cherchant des boutiques de votre secteur, et j'ai pris le temps de le regarder. Une chose m'a sauté aux yeux, que vous n'avez peut-être pas vue de l'intérieur :`;
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
    presentation(r),
    '',
    accroche(r),
    '',
    c.preuve,
    '',
    c.consequence,
    contexte ? '' : null,
    contexte ? `Pour être complet : ${contexte.charAt(0).toLowerCase()}${contexte.slice(1)}` : null,
    '',
    "Si vous voulez, je vous envoie ce que j'ai noté, avec les captures d'écran, pour que vous puissiez le montrer à qui s'occupe de votre site. Un simple « oui » en réponse suffit, et je ne vous relancerai pas dix fois.",
    '',
    'Bonne journée à vous,'
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
