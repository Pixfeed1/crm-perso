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

// Catalogue : pour chaque preuve, l'objet, la phrase de preuve (un fait, vérifiable par le
// gérant), la portée (ce que ça change, sans rien affirmer qu'on ne peut pas démontrer : pas de
// perte de clients chiffrée, pas de délai Google inventé, pas d'écran rouge si on ne l'a pas vu)
// et le signal brut (traçabilité : ce que le crawler a mesuré).
const quand = (r) => (r.analyse_le ? ` (constaté le ${new Date(r.analyse_le).toLocaleDateString('fr-FR')})` : '');
const CATALOGUE = {
  accueil_404: (r) => ({
    sujet: `votre page d'accueil renvoie une erreur 404`,
    preuve: `En ouvrant ${site(r)}${quand(r)}, la page d'accueil renvoie une erreur 404 : le domaine répond, mais aucun site ne s'affiche.`,
    consequence: `Pour quelqu'un qui tape votre adresse, le site paraît fermé. Si c'est volontaire ou déjà en cours de votre côté, ce message est sans objet.`,
    brut: `HTTP ${r.http_status}`
  }),
  erreur_serveur: (r) => ({
    sujet: `votre site affiche une erreur ${r.http_status}`,
    preuve: `En ouvrant ${site(r)}${quand(r)}, le serveur renvoie une erreur ${r.http_status} au lieu de la boutique.`,
    consequence: `C'est peut-être passager et déjà en cours de votre côté. Si ce n'est pas le cas, je préférais vous le signaler : tant que l'erreur est là, la boutique n'est pas consultable.`,
    brut: `HTTP ${r.http_status}`
  }),
  invisible_google: (r) => ({
    sujet: `votre site demande à Google de ne pas l'indexer`,
    preuve: r.noindex
      ? `La page d'accueil de ${site(r)} contient une balise « noindex »${quand(r)} : elle demande explicitement à Google de ne pas l'indexer.`
      : `Le fichier robots.txt de ${site(r)} interdit à Google de parcourir le site (Disallow: /)${quand(r)}.`,
    consequence: `C'est un réglage de site en construction qui reste souvent coché après la mise en ligne. Tant qu'il est là, les pages concernées ne peuvent pas apparaître dans Google, et personne ne s'en rend compte de l'intérieur.`,
    brut: r.noindex ? 'meta robots noindex sur la page d\'accueil' : 'robots.txt : Disallow: / pour tous les robots ou Googlebot'
  }),
  http_non_securise: (r) => ({
    sujet: `« Non sécurisé » s'affiche sur ${site(r)}`,
    preuve: `${site(r)} s'ouvre en HTTP, sans cadenas${quand(r)} : le navigateur affiche « Non sécurisé » à côté de l'adresse, dès la page d'accueil.`,
    consequence: `Ce n'est pas une faille en soi, mais c'est la mention que tous les navigateurs affichent, et certains clients s'arrêtent dessus avant de commander. En général, le certificat existe déjà et il suffit de l'imposer.`,
    brut: `URL finale ${r.final_url || 'http://' + site(r)} servie en HTTP`
  }),
  ssl_expire: (r) => ({
    sujet: `le certificat de ${site(r)} a expiré`,
    preuve: `Le certificat de sécurité de ${site(r)} est expiré${r.ssl_expire_jours != null ? ` depuis ${Math.abs(r.ssl_expire_jours)} jour${Math.abs(r.ssl_expire_jours) > 1 ? 's' : ''}` : ''}${quand(r)} : le navigateur affiche un avertissement avant d'atteindre le site.`,
    consequence: `Tant qu'il n'est pas renouvelé, cet avertissement s'affiche à chaque visite. Si le renouvellement est déjà programmé, ce message est sans objet ; sinon, c'est une heure de travail.`,
    brut: `certificat : ${r.ssl_expire_jours} jour(s) (négatif = expiré)`
  }),
  ssl_invalide: (r) => ({
    sujet: `avertissement de sécurité sur ${site(r)}`,
    preuve: `En ouvrant https://${site(r)}${quand(r)}, le navigateur affiche un avertissement de sécurité : ${r.ssl_erreur ? r.ssl_erreur : 'le certificat n\'est pas valide pour cette adresse'}.`,
    consequence: `Le site reste accessible, mais tout visiteur qui arrive par cette adresse voit l'avertissement avant la boutique. Souvent, seule l'adresse sans « www » est concernée, et ça se règle côté hébergement.`,
    brut: r.ssl_erreur || 'erreur TLS à la connexion'
  }),
  ssl_bientot: (r) => ({
    sujet: `votre certificat expire dans ${r.ssl_expire_jours} jours`,
    preuve: `Le certificat de sécurité de ${site(r)} expire dans ${r.ssl_expire_jours} jour${r.ssl_expire_jours > 1 ? 's' : ''}${quand(r)} (visible en cliquant sur le cadenas du navigateur).`,
    consequence: `Dans la plupart des cas, le renouvellement est automatique et il n'y a rien à faire. Je vous le signale au cas où il ne le serait pas : passé cette date, les navigateurs affichent un avertissement à l'ouverture du site.`,
    brut: `certificat : ${r.ssl_expire_jours} jour(s) restants`
  }),
  titre_defaut: (r) => ({
    sujet: `votre site s'appelle « ${String(r.title || '').trim()} » dans Google`,
    preuve: `Le titre de la page d'accueil de ${site(r)}, celui qui s'affiche dans Google et dans l'onglet du navigateur, est « ${String(r.title || '').trim()} »${quand(r)} : le titre d'installation, jamais remplacé.`,
    consequence: `Dans les résultats de recherche, votre boutique apparaît donc sous ce nom, sans ce que vous vendez ni où. C'est un réglage, pas une refonte.`,
    brut: `<title> = « ${String(r.title || '').trim()} »`
  }),
  mentions_404: (r) => ({
    sujet: `le lien « mentions légales » de ${site(r)} ne mène nulle part`,
    preuve: `Le lien « mentions légales » en pied de page de ${site(r)} mène à une page en erreur${quand(r)} : la mention existe dans le menu, la page n'existe plus.`,
    consequence: `Ça arrive souvent après une mise à jour. Comme ces mentions sont obligatoires sur un site marchand, c'est à remettre en place, et c'est rapide.`,
    brut: 'lien mentions légales -> réponse 4xx/5xx'
  }),
  mobile: (r) => ({
    sujet: `${site(r)} sur téléphone`,
    preuve: `Ouvert sur un téléphone, ${site(r)} s'affiche comme sur un écran d'ordinateur, en petit, à agrandir au doigt${quand(r)} : la page n'a pas de réglage d'affichage mobile.`,
    consequence: `Une bonne partie des visites se fait aujourd'hui sur téléphone, et sur cet écran-là la lecture demande un effort. Je me suis dit que vous préféreriez le savoir.`,
    brut: 'aucune balise meta viewport sur la page d\'accueil'
  }),
  nom_mal_orthographie: (r) => {
    const n0 = nomMalOrthographie(r) || { titre: r.title, attendu: r.raison_sociale || site(r) };
    const n = { ...n0, attendu: joliNom(n0.attendu) };
    return {
      sujet: `le nom de votre société est mal orthographié sur votre site`,
      preuve: `Le titre de vos pages, celui qui s'affiche dans Google et dans l'onglet du navigateur, indique « ${n.titre} »${quand(r)}. Votre société s'appelle ${n.attendu}.`,
      consequence: `C'est la première chose qu'un client voit de vous dans Google. Ça se corrige en cinq minutes, mais il faut savoir que c'est là.`,
      brut: `titre « ${n.titre} » / nom de référence « ${n0.attendu} »`
    };
  },
  meta_desc_absurde: (r) => ({
    sujet: `ce que Google affiche sous ${site(r)}`,
    preuve: `Dans Google, le texte qui s'affiche sous le nom de votre site est « ${String(r.meta_desc_txt || '').slice(0, 120)} »${quand(r)}.`,
    consequence: `C'est la phrase censée dire ce que vous vendez et donner envie de cliquer. Là, c'est un bout d'adresse ou de fiche technique. Ça se change en quelques minutes dans la boutique.`,
    brut: `meta description : « ${String(r.meta_desc_txt || '').slice(0, 160)} »`
  }),
  urls_non_reecrites: (r) => ({
    sujet: `les adresses de vos pages`,
    preuve: `Les adresses de vos pages de catégories sont du type « index.php?id_category=102&controller=category »${quand(r)} : aucun mot dedans, ni le produit, ni la ville.`,
    consequence: `C'est un réglage de la boutique (les « URL simplifiées »), pas une refonte. Avec des adresses lisibles, Google et vos clients voient de quoi parle chaque page avant de l'ouvrir.`,
    brut: 'liens internes en index.php?id_category= / controller='
  }),
  sitemap_vide: (r) => ({
    sujet: `votre plan de site est vide`,
    preuve: `Le fichier sitemap.xml de ${site(r)}, la liste de pages que votre boutique fournit à Google, répond bien mais ne contient aucune adresse${quand(r)}.`,
    consequence: `Google a d'autres moyens de trouver vos pages, ce n'est donc pas bloquant. Mais ce fichier est fait pour lui signaler vos nouveautés, et vide, il ne lui sert à rien. C'est en général un module à réactiver.`,
    brut: r.sitemap_detail || 'sitemap.xml : 200, aucune balise <loc>'
  }),
  copyright_fige: (r) => ({
    sujet: `© ${r.copyright_annee} en bas de ${site(r)}`,
    preuve: `Le pied de page de ${site(r)} affiche encore « © ${r.copyright_annee} »${quand(r)}.`,
    consequence: `Ce n'est qu'un détail, mais il est visible sur chaque page et il date votre site d'une année qui n'est pas la bonne.`,
    brut: `copyright © ${r.copyright_annee}`
  })
};

// Contexte technique : une phrase, seulement à partir d'une mesure.
function contexteTechnique(r, flags) {
  const keys = new Set(flags.map((f) => f.key));
  const eol = phpEol(r.serveur_php);
  // La version PHP vient d'une entête envoyée par le serveur (X-Powered-By) : une déclaration,
  // pas une mesure. On la rapporte comme telle, jamais comme une faille certaine.
  if (eol) return `D'après l'entête que renvoie votre serveur, le site tournerait sur PHP ${eol.branch} ; si c'est bien la version en place, elle ne reçoit plus de correctifs de sécurité depuis ${eol.eol.slice(0, 4)}, ce que votre hébergeur pourra confirmer.`;
  if (keys.has('version_obsolete') && r.platform_version) {
    const v = String(r.platform_version).replace(/\s*\(déduit\)/i, '');
    const fin = /prestashop 1\.[56]/i.test(v) ? ' (plus maintenu depuis 2019)' : /drupal 7/i.test(v) ? ' (fin de vie en janvier 2025)' : '';
    return `Le site tourne sur ${v}${fin}, une version qui n'est plus mise à jour par son éditeur.`;
  }
  if (keys.has('contenu_mixte')) return `Certaines images ou scripts du site sont encore chargés en HTTP, ce qui fait disparaître le cadenas sur les pages concernées.`;
  if (keys.has('spf') && keys.has('dmarc')) return `Le domaine n'a ni SPF ni DMARC : les emails envoyés depuis votre adresse ont plus de chances de finir en spam.`;
  return '';
}

// Correspondance SIRENE jugée sûre : seule base pour personnaliser (nom, dirigeant, ville).
// « probable » ou « douteux » -> aucune personnalisation : un prénom ou une ville faux, et le
// destinataire sait immédiatement que c'est automatique.
const matchSur = (r) => !!(r && r.sirene_match === 'sur');

// Civilité : on ne devine jamais le genre. Premier prénom + nom en casse de nom si la
// correspondance est sûre, sinon « Bonjour, ». Jamais l'état civil complet en capitales.
function nomCourt(r) {
  if (r.gerant_nom) return joliNom(`${r.gerant_prenom || ''} ${r.gerant_nom}`.trim());
  const g = String(r.gerant || '').trim();
  if (!g) return '';
  // Chaîne SIRENE « PRENOMS NOM » : premier et dernier mot (repli pour les lignes anciennes).
  const parts = g.split(/\s+/);
  const court = parts.length >= 2 ? `${parts[0]} ${parts[parts.length - 1]}` : g;
  return joliNom(court);
}
function salutation(r, lead) {
  const nom = matchSur(r) ? nomCourt(r) : '';
  return nom ? `Bonjour ${nom},` : 'Bonjour,';
}

// Nom de la boutique tel qu'elle se présente : début du titre, avant le séparateur.
function nomBoutique(r) {
  // Raison sociale SÛRE d'abord (SIRENE), sinon le segment du titre qui ressemble le plus à un
  // nom : le plus court (« Gourmands d'Antan » plutôt que « Epicerie fine gourmande en ligne »).
  if (matchSur(r) && r.raison_sociale) {
    const rs = String(r.raison_sociale).trim();
    if (rs.length <= 40) return joliNom(rs);
  }
  // Segments du titre : séparateurs « - | – — : », puis coupe à la virgule (« Atelier du sucre,
  // la boutique en ligne » -> « Atelier du sucre ») et forme juridique retirée (« AGRIGOM SAS »).
  const segs = String(r.title || '').split(/\s+[-|–—:]\s+/)
    .map((x) => x.split(/,\s/)[0].replace(/\b(SARL|SAS|SASU|EURL|SA|SCI|SNC|EI)\b\.?/g, '').replace(/\s+/g, ' ').trim())
    .filter((x) => x && x.length >= 3 && x.length <= 40 && !/^(prestashop|wordpress|accueil|home|bienvenue|boutique|shop)$/i.test(x));
  if (segs.length === 0) return '';
  // Le segment qui ressemble au domaine gagne (« Gourmands d'Antan » pour gourmandsdantan.fr),
  // sinon le plus court en mots, puis en lettres.
  const compact = (x) => String(x).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const root = compact(site(r).split('.')[0]);
  const like = (x) => { const c = compact(x); return c.length >= 4 && (root.includes(c) || c.includes(root)) ? 0 : 1; };
  segs.sort((a, b) => like(a) - like(b) || a.split(/\s+/).length - b.split(/\s+/).length || a.length - b.length);
  return segs[0];
}

// Spécialité annoncée, selon la technologie du site : c'est ce qui rend la présentation crédible.
function specialite(r) {
  const p = String(r.platform || '').toLowerCase();
  if (p.includes('prestashop')) return 'la maintenance de boutiques PrestaShop';
  if (p.includes('woocommerce') || p.includes('wordpress')) return 'la maintenance de sites WordPress et WooCommerce';
  return 'la maintenance de sites et de boutiques en ligne';
}
const typeSite = (r) => {
  const p = String(r.platform || '').toLowerCase();
  if (p.includes('prestashop') || p.includes('woocommerce') || r.site_type === 'commerce' || r.ecommerce_actif) return 'boutique';
  return 'site';
};

// Qui écrit, en une phrase. Ville seulement si la correspondance SIRENE est sûre.
function presentation(r) {
  const prenom = (process.env.OUTREACH_SENDER_NAME || '').trim();
  const entreprise = (process.env.OUTREACH_SENDER_COMPANY || 'PixFeed').trim();
  const ville = matchSur(r) && r.ville ? String(r.ville).trim() : '';
  const ou = ville ? `, notamment pour des commerçants et artisans autour de ${ville}` : '';
  return prenom
    ? `Je m'appelle ${prenom}, développeur web indépendant (${entreprise}), spécialisé dans ${specialite(r)}${ou}.`
    : `Je suis développeur web indépendant (${entreprise}), spécialisé dans ${specialite(r)}${ou}.`;
}

function accroche(r) {
  const nom = nomBoutique(r);
  const p = String(r.platform || '');
  const quoi = /prestashop|woocommerce/i.test(p) ? `des boutiques ${p} de votre secteur` : 'des sites de votre secteur';
  const decouverte = nom ? `après avoir découvert ${nom} en parcourant ${quoi}` : `après avoir découvert ${site(r)} en parcourant ${quoi}`;
  return `Je me permets de vous écrire ${decouverte}. En regardant votre ${typeSite(r)}, j'ai relevé une chose que vous n'avez peut-être pas vue de l'intérieur :`;
}

// Fin : une question, une sortie facile, le lien vers l'offre. Pas de pression.
function conclusion(r) {
  const url = (process.env.OUTREACH_OFFER_URL || 'https://pixfeed.net/maintenance/').trim();
  return `Je souhaitais aussi savoir si quelqu'un assure déjà les mises à jour, les sauvegardes et le suivi technique de votre ${typeSite(r)}. Si c'est le cas, tant mieux, et je ne vous relancerai pas. Sinon, voici ce que je propose : ${url}. Un simple « oui » en réponse suffit pour qu'on en parle.`;
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
    conclusion(r),
    '',
    'Bonne journée à vous,'
  ].filter((l) => l !== null).join('\n');
  // Traçabilité : ce qui a été mesuré, où, quand, avec quel degré de confiance. Affiché sous
  // l'email pour que la relecture humaine puisse vérifier avant d'envoyer.
  const detail = {
    signal: key,
    brut: c.brut,
    url_controlee: r.final_url || `https://${site(r)}`,
    analyse_le: r.analyse_le || null,
    confiance: 'constatée par le crawler',
    identite: matchSur(r) ? `SIRENE sûre : ${r.raison_sociale || ''}${r.ville ? ` (${r.ville})` : ''}` : (r.sirene_match ? `SIRENE ${r.sirene_match} : pas de personnalisation` : 'pas de correspondance SIRENE : pas de personnalisation'),
    contexte: contexte ? (phpEol(r.serveur_php) ? `PHP déclaré par l'entête ${r.php_source || 'X-Powered-By'} : ${r.serveur_php}` : contexte) : null
  };
  return {
    ok: true,
    subject: c.sujet.charAt(0).toUpperCase() + c.sujet.slice(1),
    body,
    preuve: key,
    preuves: preuvesTrouvees,
    indices,
    detail
  };
}

module.exports = { buildProofEmail, PREUVES_ORDRE, CATALOGUE, presentation, joliNom, nomCourt, salutation };
