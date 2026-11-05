// backend/services/proofEmailService.js
//
// Email de prospection « par la preuve » : une seule affirmation, vérifiable par le gérant
// en dix secondes sur son propre site, une conséquence dans SON activité, au plus un élément
// de contexte technique mesuré. Rien d'autre.
//
// Structure (lot 3, validée par Marc) : centré sur le prospect, pas sur Pixfeed.
//   Bonjour[ Prénom Nom], / constat (son site, ce qu'on y voit) / pourquoi ça le concerne, en une
//   phrase / UNE question adaptée à la situation / Bonne journée,
// Pas de présentation de l'expéditeur ni de liste de prestations : Pixfeed apparaît dans la
// signature (Paramètres), ajoutée à l'envoi. L'email n'annonce jamais d'appel. 60 à 90 mots.
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

const { niveauPlateforme, versionPlateforme } = require('../utils/plateforme');
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
const quand = () => ''; // la date de constat reste dans la traçabilité (detail), pas dans l'email
const deuxMesures = (r) => (r.panne_vue_le ? ' ; je l\'ai constatée à deux reprises, à plus d\'une heure d\'intervalle' : '');
const tracePanne = (r) => `HTTP ${r.http_status}${r.panne_vue_le ? ` · panne vue le ${new Date(r.panne_vue_le).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}, toujours là le ${new Date(r.analyse_le || Date.now()).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}` : ''}`;
const DEJA_REPERE = 'Est-ce un point que vous aviez déjà repéré ?';
// Pour chaque preuve : objet (court, sur le prospect), constat (un fait que le gérant vérifie en
// ouvrant son site), portée (pourquoi ça le concerne, rien qu'on ne puisse démontrer), question.
const CATALOGUE = {
  accueil_404: (r) => ({
    sujet: `Votre page d'accueil`,
    preuve: `En ouvrant ${site(r)}, la page d'accueil affiche une erreur 404 : le domaine répond, mais aucune page ne s'affiche${deuxMesures(r)}.`,
    consequence: `Tant qu'elle dure, les visiteurs qui arrivent sur votre adresse ne voient rien.`,
    question: `Êtes-vous déjà au courant de ce problème ?`,
    brut: tracePanne(r)
  }),
  erreur_serveur: (r) => ({
    sujet: `Erreur sur votre site`,
    preuve: `En ouvrant ${site(r)}, une erreur serveur (${r.http_status}) s'affiche au lieu de la page d'accueil${deuxMesures(r)}.`,
    consequence: `Tant qu'elle dure, les visiteurs ne voient aucune page.`,
    question: `Êtes-vous déjà au courant de ce problème ?`,
    brut: tracePanne(r)
  }),
  invisible_google: (r) => ({
    sujet: `Votre site et Google`,
    preuve: r.noindex
      ? `La page d'accueil de ${site(r)} contient une balise « noindex », qui demande à Google de ne pas l'afficher dans ses résultats.`
      : `Le fichier robots.txt de ${site(r)} demande à Google de ne parcourir aucune page du site.`,
    consequence: `C'est un réglage de mise en construction souvent oublié : tant qu'il reste en place, ces pages ne peuvent pas apparaître dans Google.`,
    question: `Est-ce un réglage voulu de votre côté ?`,
    brut: r.noindex ? 'meta robots noindex sur la page d\'accueil' : 'robots.txt : Disallow: / pour tous les robots ou Googlebot'
  }),
  http_non_securise: (r) => {
    const redirige = r.ssl_ok === true && r.final_url && /^http:/i.test(r.final_url);
    const finale = redirige ? String(r.final_url).replace(/\/$/, '') : '';
    // Certificat refusé : on dit lequel est présenté quand on le sait (certificat d'hébergeur
    // par défaut, type « preview.infomaniak.website »). Vérifiable en cliquant sur le cadenas.
    const mauvaisCert = r.ssl_ok === false;
    const hoteTls = r.ssl_hote || ((String(r.https_variantes || '').match(/https:\/\/([^\s]+?) -> TLS/) || [])[1]) || site(r);
    const sujetCert = mauvaisCert && r.ssl_sujet ? ` : le certificat présenté est au nom de « ${r.ssl_sujet} », celui de l'hébergeur` : (mauvaisCert && r.ssl_erreur ? ` (${r.ssl_erreur})` : '');
    const typeS = typeSite(r);
    return {
      sujet: `Le cadenas de votre ${typeS}`,
      preuve: redirige
        ? `En tapant https://${site(r)}, on est renvoyé vers ${finale} : le certificat existe mais n'est pas utilisé, et le navigateur affiche « Non sécurisé ».`
        : mauvaisCert
          ? `En tapant https://${hoteTls}, le navigateur affiche un avertissement${sujetCert}. Votre ${typeS} ne s'ouvre donc qu'en HTTP, sans le cadenas.`
          : `En ouvrant ${site(r)}, le navigateur affiche « Non sécurisé » à côté de l'adresse : votre ${typeS} s'ouvre en HTTP, sans le cadenas.`,
      consequence: typeS === 'boutique'
        ? `Sur une page où vos clients saisissent leur adresse et paient, ce message suffit à en faire repartir certains.`
        : `C'est le premier message que voient vos visiteurs en arrivant sur le site.`,
      question: DEJA_REPERE,
      brut: `${redirige ? `https accepté puis redirigé vers ${r.final_url} (servi en HTTP)` : `URL finale ${r.final_url || 'http://' + site(r)} servie en HTTP`}${r.https_variantes ? ` · variantes : ${r.https_variantes}` : ''}`
    };
  },
  ssl_expire: (r) => ({
    sujet: `Le certificat de ${site(r)}`,
    preuve: `Le certificat de sécurité de ${site(r)} a expiré${r.ssl_expire_jours != null ? ` depuis ${Math.abs(r.ssl_expire_jours)} jour${Math.abs(r.ssl_expire_jours) > 1 ? 's' : ''}` : ''} : le navigateur affiche un avertissement avant d'ouvrir le site.`,
    consequence: `Vos visiteurs doivent passer cet avertissement pour atteindre vos pages.`,
    question: `Le renouvellement est-il déjà prévu de votre côté ?`,
    brut: `certificat : ${r.ssl_expire_jours} jour(s) (négatif = expiré)`
  }),
  ssl_invalide: (r) => ({
    sujet: `Avertissement de sécurité sur ${site(r)}`,
    preuve: `En ouvrant https://${r.ssl_hote || site(r)}, le navigateur affiche un avertissement de sécurité : ${r.ssl_sujet ? `le certificat présenté est au nom de « ${r.ssl_sujet} », pas de votre site` : (r.ssl_erreur ? r.ssl_erreur : 'le certificat n\'est pas valide pour cette adresse')}.`,
    consequence: `Souvent, une seule des deux adresses (avec ou sans « www ») est concernée.`,
    question: DEJA_REPERE,
    brut: `${r.ssl_erreur || 'erreur TLS à la connexion'}${r.https_variantes ? ` · variantes : ${r.https_variantes}` : ''}`
  }),
  titre_defaut: (r) => ({
    sujet: `Votre ${typeSite(r)} dans Google`,
    preuve: `Le titre de la page d'accueil de ${site(r)}, celui qui s'affiche dans Google et dans l'onglet du navigateur, est encore « ${String(r.title || '').trim()} ».`,
    consequence: `C'est le nom sous lequel votre ${typeSite(r)} apparaît dans les résultats de recherche.`,
    question: `Est-ce que vous saviez que c'était ce nom qui apparaissait ?`,
    brut: `<title> = « ${String(r.title || '').trim()} »`
  }),
  mentions_404: (r) => ({
    sujet: `Le lien « mentions légales » de ${site(r)}`,
    preuve: `Le lien « mentions légales » en bas des pages de ${site(r)} mène à une page en erreur.`,
    consequence: `Ces mentions sont obligatoires sur un site professionnel.`,
    question: DEJA_REPERE,
    brut: 'lien mentions légales -> réponse 4xx/5xx'
  }),
  mobile: (r) => ({
    sujet: `${site(r).charAt(0).toUpperCase() + site(r).slice(1)} sur téléphone`,
    preuve: `Ouvert sur un téléphone, ${site(r)} s'affiche comme sur un écran d'ordinateur, en tout petit : la page n'a pas de réglage d'affichage mobile.`,
    consequence: `Une bonne partie des visites se fait aujourd'hui depuis un téléphone.`,
    question: `Est-ce que vous aviez remarqué l'affichage sur téléphone ?`,
    brut: 'aucune balise meta viewport sur la page d\'accueil'
  }),
  nom_mal_orthographie: (r) => {
    const n0 = nomMalOrthographie(r) || { titre: r.title, attendu: r.raison_sociale || site(r) };
    const n = { ...n0, attendu: joliNom(n0.attendu) };
    return {
      sujet: `Le nom de ${n.attendu} dans Google`,
      preuve: `Le titre de vos pages, dans Google et dans l'onglet du navigateur, indique « ${n.titre} », alors que votre société s'appelle ${n.attendu}.`,
      consequence: `C'est souvent la première chose qu'un client lit de vous.`,
      question: `Est-ce que vous l'aviez remarqué ?`,
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
  // Une version DÉDUITE (fichiers du site) n'est qu'un indice : jamais affirmée dans un email.
  if (keys.has('version_obsolete') && r.platform_version && versionPlateforme(r).niveau === 'confirmée') {
    const v = versionPlateforme(r).version;
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
// Identité CERTAINE seulement (SIREN lu sur le site ou saisi à la main) pour nommer qui que ce soit dans
// un email : dirigeant, raison sociale, ville. Un rapprochement par le nom, même « sûr », peut désigner
// une autre entreprise au nom voisin (cas WEB-TENNIS) : il ne sert qu'au tri, jamais au texte.
const matchSur = (r) => !!(r && r.sirene_match === 'certain');

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

// « PERNET AMANDINE » ou « AMANDINE PERNET » = le dirigeant SIRENE ? (nom et prénom tous deux présents)
function estLaPersonne(nom, r) {
  const fold = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);
  const mots = new Set(fold(nom));
  const n = fold(r.gerant_nom), p = fold(r.gerant_prenom);
  if (!n.length || !mots.size) return false;
  return n.every((x) => mots.has(x)) && (!p.length || p.some((x) => mots.has(x)));
}

// Nom de la boutique tel qu'elle se présente : début du titre, avant le séparateur.
function nomBoutique(r) {
  // Raison sociale SÛRE d'abord (SIRENE), sinon le segment du titre qui ressemble le plus à un
  // nom : le plus court (« Gourmands d'Antan » plutôt que « Epicerie fine gourmande en ligne »).
  if (matchSur(r) && r.raison_sociale) {
    const rs = String(r.raison_sociale).trim();
    // Entreprise individuelle : l'annuaire donne « AMANDINE PERNET (CREASENCE) », le nom de la
    // personne puis l'enseigne. La boutique, c'est l'enseigne ; un nom de personne n'est jamais
    // un nom de boutique (on passe alors au titre du site).
    const m = rs.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    const base = (m ? m[1] : rs).trim();
    if (!estLaPersonne(base, r)) { if (rs.length <= 40) return joliNom(rs); }
    else if (m && m[2].trim().length >= 2 && m[2].trim().length <= 40) return joliNom(m[2].trim());
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

const typeSite = (r) => {
  const p = String(r.platform || '').toLowerCase();
  // « Boutique » seulement si le site vend vraiment (prix et panier visibles) : un PrestaShop qui
  // présente des prestations (cas 1000 Hz) est un site, pas une boutique. Dans le doute : « site ».
  void p;
  return r.ecommerce_actif === true ? 'boutique' : 'site';
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
// Email SANS défaut constaté (toujours un premier email, règle validée) : son site d'abord, pourquoi
// le suivi technique le concerne, une question. Aucune alerte, aucun défaut évoqué.
function ouverture(r) {
  const nom = nomBoutique(r) || site(r);
  const p = String(r.platform || '');
  const plateforme = /prestashop|woocommerce|wordpress/i.test(p) && niveauPlateforme(r) === 'confirmée' ? p : '';
  return typeSite(r) === 'boutique'
    ? `J'ai découvert votre boutique en ligne ${nom}${plateforme ? `, qui fonctionne sous ${plateforme}` : ''}.`
    : `J'ai découvert le site de ${nom}.`;
}
function portee(r) {
  const p = String(r.platform || '');
  const plateforme = /prestashop|woocommerce|wordpress/i.test(p) && niveauPlateforme(r) === 'confirmée';
  return typeSite(r) === 'boutique'
    ? `${plateforme ? 'Sur ce type de site' : 'Sur une boutique en ligne'}, les mises à jour et les évolutions techniques demandent un suivi régulier, surtout quand il faut aussi gérer les commandes et les produits.`
    : `Un site comme le vôtre sert souvent de première impression pour vos clients : il vaut mieux qu'il reste à jour et qu'il fonctionne sans accroc.`;
}
function questionSuivi(r) {
  return typeSite(r) === 'boutique'
    ? `Est-ce que vous gérez cette partie technique vous-même, ou est-ce que vous vous faites accompagner ?`
    : `Qui s'occupe aujourd'hui de son suivi technique : vous-même, ou un prestataire ?`;
}
const FIN = 'Bonne journée,';
const assembler = (lignes) => lignes.filter((x) => x !== null && x !== undefined).join('\n\n').replace(/\n\n(Bonne journée,)$/, '\n\n$1');

/**
 * Email sans défaut constaté : site en ligne (pas parqué, pas derrière un antirobot).
 * @returns {{ ok: boolean, subject?, body?, raison? }}
 */
function buildMaintenanceEmail(r, lead) {
  const enLigne = Number(r.http_status) >= 200 && Number(r.http_status) < 400 && !r.parked && !r.protected;
  if (!enLigne) return { ok: false, raison: 'site pas en ligne au moment de l\'analyse' };
  const nom = nomBoutique(r) || site(r);
  const p = String(r.platform || '');
  const plateforme = /prestashop|woocommerce|wordpress/i.test(p) && niveauPlateforme(r) === 'confirmée' ? p : '';
  const body = assembler([salutation(r, lead), ouverture(r), portee(r), questionSuivi(r), FIN]);
  const subject = typeSite(r) === 'boutique' ? (plateforme ? `Votre boutique ${plateforme}` : `Votre boutique ${nom}`) : `Le site de ${nom}`;
  return { ok: true, subject, body, mode: 'maintenance' };
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
  const body = assembler([salutation(r, lead), c.preuve, c.consequence, c.question, FIN]);
  // Traçabilité : ce qui a été mesuré, où, quand, avec quel degré de confiance. Affiché sous
  // l'email pour que la relecture humaine puisse vérifier avant d'envoyer.
  const detail = {
    signal: key,
    brut: c.brut,
    url_controlee: r.final_url || `https://${site(r)}`,
    analyse_le: r.analyse_le || null,
    confiance: 'constatée par le crawler',
    identite: matchSur(r) ? `Identité certaine (${r.identite_source || 'SIREN lu sur le site'}) : ${joliNom(r.raison_sociale || '')}${r.ville ? ` (${joliVille(r.ville)}${villeConfirmee(r) ? ', confirmée par le code postal du site' : ', ville non confirmée par le site : non citée'})` : ''}` : (r.sirene_match ? `identité ${r.sirene_match === 'sur' ? 'rapprochée par le nom seulement' : r.sirene_match} : aucun nom dans l'email (« Bonjour, »)` : 'aucune identité : aucun nom dans l\'email (« Bonjour, »)'),
    contexte: contexte ? (phpEol(r.serveur_php) ? `PHP déclaré par l'entête ${r.php_source || 'X-Powered-By'} : ${r.serveur_php}` : contexte) : null
  };
  return {
    ok: true,
    subject: c.sujet,
    body,
    preuve: key,
    preuves: preuvesTrouvees,
    indices,
    detail
  };
}

module.exports = { buildProofEmail, buildMaintenanceEmail, PREUVES_ORDRE, PREUVES_HTTPS, CATALOGUE, ouverture, portee, questionSuivi, assembler, nomBoutique, typeSite, joliNom, joliVille, nomCourt, salutation, FORMULES_INTERDITES };
