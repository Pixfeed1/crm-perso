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
  'ssl_invalide', 'titre_defaut', 'mentions_404', 'mobile'
];
const PREUVES = new Set(PREUVES_ORDRE);
// Preuves qui dépendent du test HTTPS du crawler (quatre variantes, strict d'abord) : exigent une
// analyse datée par le crawler corrigé.
const PREUVES_HTTPS = new Set(['http_non_securise', 'ssl_invalide', 'ssl_expire']);

const site = (r) => (r.domain || '').replace(/^www\./, '');

// « EQUIP'TOUT » -> « Equip'Tout », « MARCHAL BODIN SAS » -> « Marchal Bodin » : une raison
// sociale en capitales fait administratif dans un email, on la remet en casse de nom.
function joliNom(raw) {
  let n = String(raw || '').trim().replace(/\b(SARL|SAS|SASU|EURL|SA|SCI|SNC|EI)\b/g, '').replace(/\s+/g, ' ').trim();
  // « AGRIGOM (AGRIGOM) » : l'annuaire répète le sigle entre parenthèses quand il égale le nom.
  n = n.replace(/\s*\(([^)]+)\)\s*$/, (m, inner) => (inner.trim().toLowerCase() === n.replace(m, '').trim().toLowerCase() ? '' : m)).trim();
  if (n && n === n.toUpperCase()) {
    n = n.toLowerCase().replace(/(^|[\s'’(-])([a-zà-ÿ])/g, (m, sep, c) => sep + c.toUpperCase());
  }
  return n;
}

// Catalogue : pour chaque preuve, l'objet, le constat (un fait, vérifiable par le gérant en
// ouvrant son site), la portée (ce que ça change, une phrase, rien qu'on ne puisse démontrer)
// et le signal brut (traçabilité). Pas d'alarme, pas de leçon : un prestataire qui a vu quelque
// chose et le dit simplement.
const quand = () => ''; // la date de constat est portée par l'intro du motif (motif()), une seule fois
const CATALOGUE = {
  accueil_404: (r) => ({
    sujet: `votre page d'accueil renvoie une erreur 404`,
    preuve: `En ouvrant ${site(r)}${quand(r)}, la page d'accueil renvoie une erreur 404 : le domaine répond, mais aucun site ne s'affiche.`,
    consequence: `Si c'est volontaire ou déjà en cours de votre côté, ce message est sans objet.`,
    brut: `HTTP ${r.http_status}`
  }),
  erreur_serveur: (r) => ({
    sujet: `votre site affiche une erreur ${r.http_status}`,
    preuve: `En ouvrant ${site(r)}${quand(r)}, le serveur renvoie une erreur ${r.http_status} au lieu de la boutique.`,
    consequence: `C'est peut-être passager et déjà traité ; si ce n'est pas le cas, je préférais vous le signaler.`,
    brut: `HTTP ${r.http_status}`
  }),
  invisible_google: (r) => ({
    sujet: `votre site demande à Google de ne pas l'indexer`,
    preuve: r.noindex
      ? `La page d'accueil de ${site(r)} porte une balise « noindex », qui demande à Google de ne pas l'indexer.`
      : `Le fichier robots.txt de ${site(r)} interdit à Google de parcourir le site (Disallow: /).`,
    consequence: `C'est un réglage de mise en construction souvent oublié ; tant qu'il est là, ces pages restent hors de Google.`,
    brut: r.noindex ? 'meta robots noindex sur la page d\'accueil' : 'robots.txt : Disallow: / pour tous les robots ou Googlebot'
  }),
  http_non_securise: (r) => {
    const redirige = r.ssl_ok === true && r.final_url && /^http:/i.test(r.final_url);
    const finale = redirige ? String(r.final_url).replace(/\/$/, '') : '';
    // Certificat refusé : on dit lequel est présenté quand on le sait (certificat d'hébergeur
    // par défaut, type « preview.infomaniak.website »). Vérifiable en cliquant sur le cadenas.
    const mauvaisCert = r.ssl_ok === false;
    // Adresse où le certificat a été refusé : celle qu'on donne au gérant à taper. Colonne
    // ssl_hote, sinon la première variante « TLS » de la trace, sinon le domaine nu.
    const hoteTls = r.ssl_hote || ((String(r.https_variantes || '').match(/https:\/\/([^\s]+?) -> TLS/) || [])[1]) || site(r);
    const sujetCert = mauvaisCert && r.ssl_sujet ? ` : le certificat présenté est au nom de « ${r.ssl_sujet} », celui de l'hébergeur, pas de votre boutique` : (mauvaisCert && r.ssl_erreur ? ` (${r.ssl_erreur})` : '');
    const typeS = typeSite(r);
    return {
      sujet: `« Non sécurisé » s'affiche sur ${site(r)}`,
      preuve: redirige
        ? `En tapant https://${site(r)}, on est renvoyé vers ${finale} : le certificat existe mais n'est pas utilisé, et le navigateur affiche « Non sécurisé ».`
        : mauvaisCert
          ? `En tapant https://${hoteTls}, le navigateur affiche un avertissement${sujetCert}. La ${typeS} ne s'ouvre donc qu'en HTTP, sans cadenas.`
          : `${site(r)} s'ouvre en HTTP, sans cadenas${quand(r)} : le navigateur affiche « Non sécurisé » à côté de l'adresse.`,
      consequence: redirige
        ? `Le certificat étant en place, c'est un réglage de redirection, pas une refonte.`
        : mauvaisCert
          ? `Un certificat à votre nom règle les deux points ; je peux le voir avec votre hébergeur.`
          : `La correction dépend de votre hébergement et de votre certificat ; je peux la regarder avec vous.`,
      brut: `${redirige ? `https accepté puis redirigé vers ${r.final_url} (servi en HTTP)` : `URL finale ${r.final_url || 'http://' + site(r)} servie en HTTP`}${r.https_variantes ? ` · variantes : ${r.https_variantes}` : ''}`
    };
  },
  ssl_expire: (r) => ({
    sujet: `le certificat de ${site(r)} a expiré`,
    preuve: `Le certificat de sécurité de ${site(r)} est expiré${r.ssl_expire_jours != null ? ` depuis ${Math.abs(r.ssl_expire_jours)} jour${Math.abs(r.ssl_expire_jours) > 1 ? 's' : ''}` : ''}${quand(r)} : le navigateur affiche un avertissement avant d'atteindre le site.`,
    consequence: `Si le renouvellement est déjà programmé, ce message est sans objet ; sinon, c'est une intervention courte.`,
    brut: `certificat : ${r.ssl_expire_jours} jour(s) (négatif = expiré)`
  }),
  ssl_invalide: (r) => ({
    sujet: `avertissement de sécurité sur ${site(r)}`,
    preuve: `En ouvrant https://${r.ssl_hote || site(r)}${quand(r)}, le navigateur affiche un avertissement de sécurité : ${r.ssl_sujet ? `le certificat présenté est au nom de « ${r.ssl_sujet} », pas de votre boutique` : (r.ssl_erreur ? r.ssl_erreur : 'le certificat n\'est pas valide pour cette adresse')}.`,
    consequence: `Souvent, seule l'adresse sans « www » est concernée, et cela se règle côté hébergement.`,
    brut: `${r.ssl_erreur || 'erreur TLS à la connexion'}${r.https_variantes ? ` · variantes : ${r.https_variantes}` : ''}`
  }),
  titre_defaut: (r) => ({
    sujet: `votre site s'appelle « ${String(r.title || '').trim()} » dans Google`,
    preuve: `Le titre de la page d'accueil de ${site(r)}, celui qui s'affiche dans Google et dans l'onglet du navigateur, est encore « ${String(r.title || '').trim()} ».`,
    consequence: `Votre ${typeSite(r)} apparaît donc sous ce nom dans Google, sans ce que vous proposez ; c'est un réglage rapide.`,
    brut: `<title> = « ${String(r.title || '').trim()} »`
  }),
  mentions_404: (r) => ({
    sujet: `le lien « mentions légales » de ${site(r)} ne mène nulle part`,
    preuve: `Le lien « mentions légales » en pied de page de ${site(r)} mène à une page en erreur${quand(r)}.`,
    consequence: `Ces mentions étant obligatoires sur un site marchand, c'est à remettre en place, et c'est rapide.`,
    brut: 'lien mentions légales -> réponse 4xx/5xx'
  }),
  mobile: (r) => ({
    sujet: `${site(r)} sur téléphone`,
    preuve: `Ouvert sur un téléphone${quand(r)}, ${site(r)} s'affiche comme sur un écran d'ordinateur, en petit : la page n'a pas de réglage d'affichage mobile.`,
    consequence: `Une bonne partie des visites se fait aujourd'hui sur téléphone ; c'est en général un réglage du thème.`,
    brut: 'aucune balise meta viewport sur la page d\'accueil'
  }),
  nom_mal_orthographie: (r) => {
    const n0 = nomMalOrthographie(r) || { titre: r.title, attendu: r.raison_sociale || site(r) };
    const n = { ...n0, attendu: joliNom(n0.attendu) };
    return {
      sujet: `le nom de votre société est mal orthographié sur votre site`,
      preuve: `Le titre de vos pages, dans Google et dans l'onglet du navigateur, indique « ${n.titre} », alors que votre société s'appelle ${n.attendu}.`,
      consequence: `C'est la première chose qu'un client voit de vous ; la correction prend quelques minutes.`,
      brut: `titre « ${n.titre} » / nom de référence « ${n0.attendu} »`
    };
  }
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

// Ce qu'on ne dit JAMAIS à un prospect (familier, culpabilisant, alarmiste ou donneur de leçon).
// Vérifié par les tests sur tout le catalogue.
const FORMULES_INTERDITES = /relancerai pas|un simple « ?oui ?»|simple oui|sauté aux yeux|de l'intérieur|personne ne suit|semaines à apparaître|écran rouge|plein écran|encore ouvert|à mon compte|je fais des sites|rien de grave|si je ne dis pas de bêtise|vous perdez|perte de clients|faire fuir|client mécontent|grosse agence/i;

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

// « CREVECŒUR-SUR-L'ESCAUT » -> « Crèvecœur-sur-l'Escaut » : casse d'un nom de commune
// (particules en minuscules). Les accents absents de l'annuaire ne sont pas inventés.
const PARTICULES = new Set(['sur', 'sous', 'la', 'le', 'les', 'de', 'du', 'des', 'en', 'aux', 'au', 'et', 'lès', 'l', 'd']); // l / d : « l'Escaut », « d'Or »
function joliVille(raw) {
  const v = String(raw || '').trim();
  if (!v || v !== v.toUpperCase()) return v;
  return v.toLowerCase().replace(/(^|[\s'’-])([a-zà-ÿœ]+)/g, (m, sep, w) => sep + (PARTICULES.has(w) && sep !== '' ? w : w.charAt(0).toUpperCase() + w.slice(1)));
}

// Qui écrit, en une phrase. Ville seulement si la correspondance SIRENE est sûre ET que le code
// postal lu sur le site confirme le siège : une ville fausse signe un email automatique.
function villeConfirmee(r) {
  if (!matchSur(r) || !r.ville) return '';
  const cpSite = String(r.code_postal_site || '').trim();
  const cpSiege = String(r.code_postal || '').trim();
  return cpSite && cpSiege && cpSite === cpSiege ? joliVille(r.ville) : '';
}
// Présentation unique, validée, identique dans tous les modes (preuve, création, Claude libre).
// Partagée via module.exports pour qu'aucun générateur n'en dérive.
function presentation() {
  const prenom = (process.env.OUTREACH_SENDER_NAME || '').trim();
  const entreprise = (process.env.OUTREACH_SENDER_COMPANY || 'PixFeed').trim();
  return `Je suis ${prenom ? `${prenom}, ` : ''}développeur web indépendant et je dirige ${entreprise}, spécialisé dans la maintenance et le dépannage de sites professionnels.`;
}

// Motif de contact : factuel, sans formule qui juge ou qui flatte.
function motif(r, c) {
  const nom = nomBoutique(r) || site(r);
  const date = r.analyse_le ? ` le ${new Date(r.analyse_le).toLocaleDateString('fr-FR')}` : '';
  return `En consultant ${nom}${date}, j'ai relevé un point à vous signaler. ${c.preuve} ${c.consequence}`;
}

// Proposition + question + refus discret. Pas de pression, pas de « simple oui ».
function conclusion(r) {
  const url = (process.env.OUTREACH_OFFER_URL || 'https://pixfeed.net/maintenance/').trim();
  return [
    `Si personne n'assure le suivi technique de votre ${typeSite(r)} ${String(r.platform || '').match(/prestashop|woocommerce|wordpress/i) ? `${r.platform} ` : ''}(mises à jour, sauvegardes), je peux m'en charger ; mon offre de maintenance est détaillée ici : ${url}`,
    '',
    'Est-ce un sujet pour vous en ce moment ?',
    '',
    "Si vous ne souhaitez plus être contacté, n'hésitez pas à me le signaler."
  ].join('\n');
}

/**
 * Email de maintenance sobre : aucune alerte technique. Utilisé quand aucune preuve n'est
 * confirmée mais que la boutique est identifiée (PrestaShop, WooCommerce, WordPress) et en ligne.
 * @returns {{ ok: boolean, subject?, body?, raison? }}
 */
function buildMaintenanceEmail(r, lead) {
  const p = String(r.platform || '');
  const identifiee = /prestashop|woocommerce|wordpress/i.test(p);
  const enLigne = Number(r.http_status) >= 200 && Number(r.http_status) < 400 && !r.parked && !r.protected;
  if (!identifiee || !enLigne) return { ok: false, raison: identifiee ? 'site pas en ligne au moment de l\'analyse' : 'technologie non identifiée' };
  const nom = nomBoutique(r) || site(r);
  const date = r.analyse_le ? ` le ${new Date(r.analyse_le).toLocaleDateString('fr-FR')}` : '';
  const body = [
    salutation(r, lead),
    '',
    presentation(),
    '',
    `J'ai découvert ${nom}${date}, une ${typeSite(r)} ${p}, en parcourant des ${typeSite(r)}s de votre secteur.`,
    '',
    conclusion(r).split('\n')[0],
    '',
    `Un prestataire assure-t-il déjà ce suivi pour votre ${typeSite(r)} ?`,
    '',
    "Si vous ne souhaitez plus être contacté, n'hésitez pas à me le signaler.",
    '',
    'Bonne journée à vous,'
  ].join('\n');
  return { ok: true, subject: `Suivi technique de ${nom}`, body, mode: 'maintenance' };
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
  // Les mesures HTTPS de l'ancien crawler (sans date d'analyse) ne testaient pas la variante
  // « www » avant de conclure : « servi en HTTP » ou « certificat invalide » n'y sont pas des
  // preuves. Elles deviennent « non confirmées », à réanalyser depuis la fiche.
  const ancienCrawl = !r.analyse_le;
  const nonConfirmees = ancienCrawl ? flags.filter((f) => PREUVES_HTTPS.has(f.key)).map((f) => `${f.label} (ancien crawl, non confirmé : réanalyser)`) : [];
  const preuvesTrouvees = PREUVES_ORDRE.filter((k) => flags.some((f) => f.key === k) && !(ancienCrawl && PREUVES_HTTPS.has(k)));
  const indices = [...flags.filter((f) => !PREUVES.has(f.key)).map((f) => f.label), ...nonConfirmees];
  if (preuvesTrouvees.length === 0) {
    // Boutique identifiée et en ligne, sans preuve confirmée : email de maintenance sobre, sans
    // alerte technique, plutôt que rien ou qu'une alerte fabriquée.
    const maintenance = buildMaintenanceEmail(r, lead);
    return {
      ok: false,
      raison: nonConfirmees.length
        ? `Mesure HTTPS de l'ancien crawl non confirmée (${nonConfirmees.join(', ')}). Réanalysez le site avant toute affirmation.`
        : indices.length
          ? `Aucune preuve solide sur ce site, seulement des indices (${indices.join(', ')}). Aucun email généré : on ne contacte pas un prospect sur un détail ou une supposition.`
          : 'Aucun défaut visible sur ce site. Aucun email généré : rien de vérifié à signaler.',
      indices,
      maintenance
    };
  }
  const key = preuvesTrouvees[0];
  const c = CATALOGUE[key](r);
  // Le contexte technique (PHP déclaré, version CMS déduite) ne va PLUS dans l'email : ce sont
  // des indices, ils restent dans le bloc de traçabilité pour la relecture.
  const contexte = contexteTechnique(r, flags);
  const body = [
    salutation(r, lead),
    '',
    presentation(r),
    '',
    motif(r, c),
    '',
    conclusion(r),
    '',
    'Bonne journée à vous,'
  ].join('\n');
  // Traçabilité : ce qui a été mesuré, où, quand, avec quel degré de confiance. Affiché sous
  // l'email pour que la relecture humaine puisse vérifier avant d'envoyer.
  const detail = {
    signal: key,
    brut: c.brut,
    url_controlee: r.final_url || `https://${site(r)}`,
    analyse_le: r.analyse_le || null,
    confiance: 'constatée par le crawler',
    identite: matchSur(r) ? `SIRENE sûre : ${joliNom(r.raison_sociale || '')}${r.ville ? ` (${joliVille(r.ville)}${villeConfirmee(r) ? ', confirmée par le code postal du site' : ', ville non confirmée par le site : non citée'})` : ''}` : (r.sirene_match ? `SIRENE ${r.sirene_match} : pas de personnalisation` : 'pas de correspondance SIRENE : pas de personnalisation'),
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

module.exports = { buildProofEmail, buildMaintenanceEmail, PREUVES_ORDRE, PREUVES_HTTPS, CATALOGUE, presentation, conclusion, nomBoutique, typeSite, joliNom, joliVille, nomCourt, salutation, FORMULES_INTERDITES };
