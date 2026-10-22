// Non-régression sur les cas réellement rencontrés (relecture de 14 prospects) : AGRIGOM,
// Atelier du Sucre, Au Pied Relax, faux sitemap vide. Et règles de ton sur tout le catalogue.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildProofEmail, PREUVES_ORDRE, FORMULES_INTERDITES } = require('../services/proofEmailService');
const { buildCreationEmail } = require('../services/creationEmailService');
const { buildSystemPrompt } = require('../services/coldEmailService');
const { PREUVE_KEYS, auditFlags } = require('../utils/prospectScore');
const { typedResult } = require('../controllers/crawlController');
const { EMAIL_TEMPLATE_SEED } = require('../scripts/autoInitDatabase');

const mots = (t) => t.split(/\s+/).filter(Boolean).length;

test('AGRIGOM : certificat valide mais site renvoyé en http -> preuve exacte, dirigeant en casse, ville non citée sans code postal du site', () => {
  const r = { domain: 'agrigom.fr', title: 'Accueil - AGRIGOM SAS', https_final: false, ssl_ok: true, final_url: 'http://www.agrigom.fr/', http_status: 200,
    platform: 'PrestaShop', platform_version: 'PrestaShop 1.6 (déduit)', sirene_match: 'sur', raison_sociale: 'AGRIGOM (AGRIGOM)', gerant: 'FRANCK SAVARY',
    gerant_nom: 'SAVARY', gerant_prenom: 'FRANCK', ville: "CREVECŒUR-SUR-L'ESCAUT", code_postal: '59258', code_postal_site: null,
    serveur_php: 'PHP 5.6', php_source: 'X-Powered-By', mobile_ok: false, analyse_le: '2026-10-21T14:21:31Z' };
  const d = buildProofEmail(r, {});
  assert.equal(d.preuve, 'http_non_securise');
  assert.match(d.body, /^Bonjour Franck Savary,/);
  assert.match(d.body, /En consultant Agrigom, j'ai relevé/);
  assert.doesNotMatch(d.body, /21\/10\/2026/); // la date reste dans la trace, pas dans l'email
  assert.equal(d.detail.analyse_le, '2026-10-21T14:21:31Z');
  assert.match(d.body, /renvoyé vers http:\/\/www\.agrigom\.fr/);
  assert.doesNotMatch(d.body, /CREVEC|Crevec|PHP/);           // ville non confirmée, PHP hors du corps
  assert.match(d.detail.contexte, /PHP déclaré par l'entête X-Powered-By/); // mais tracé pour la relecture
  assert.match(d.detail.identite, /non confirmée par le site/);
});

test('Atelier du Sucre : deux candidats SIRENE à égalité -> aucune personnalisation', () => {
  const r = { domain: 'atelierdusucre.fr', title: 'Atelier du sucre, la boutique en ligne', https_final: false, ssl_ok: true, final_url: 'http://www.atelierdusucre.fr/fr/',
    http_status: 200, platform: 'PrestaShop', sirene_match: 'probable', raison_sociale: "L'ATELIER SUCRE", gerant: 'X Y', ville: 'MANOSQUE', code_postal: '04100', analyse_le: '2026-10-21T15:03:02Z' };
  const d = buildProofEmail(r, {});
  assert.match(d.body, /^Bonjour,\n/);
  assert.match(d.body, /En consultant Atelier du sucre,/);
  assert.doesNotMatch(d.body, /Manosque|MANOSQUE|X Y|ATELIER SUCRE/);
});

test('Au Pied Relax : copyright 2024 + PHP 5.6 + pas d\'audience -> AUCUN email', () => {
  const r = { domain: 'aupiedrelax.fr', title: 'Au pied relax', copyright_annee: 2024, serveur_php: 'PHP 5.6', php_source: 'X-Powered-By', analytics: false,
    http_status: 200, platform: 'PrestaShop', ssl_ok: true, https_final: true, mentions_legales: true, mobile_ok: true };
  const d = buildProofEmail(r, {});
  assert.equal(d.ok, false);
  assert.match(d.raison, /Aucun email généré/);
  assert.ok(d.indices.some((x) => /copyright 2024/.test(x)));
  // Et aucun de ces signaux n'est une preuve, quelle que soit la combinaison.
  for (const k of ['copyright_fige', 'php_obsolete', 'analytics', 'meta_desc_absurde', 'urls_non_reecrites', 'sitemap_vide', 'spf', 'dmarc', 'version_obsolete']) {
    assert.equal(PREUVE_KEYS.has(k), false, k);
  }
});

test('faux sitemap vide : une page HTML en 200 est « absent » côté crawler ; même un vrai « vide » n\'ouvre pas d\'email', () => {
  // Ligne CSV telle que produite par le crawler corrigé (classify_sitemap_response -> absent).
  const r = typedResult({ domain: 'decodesign.fr', title: 'Deco Nature Design', http_status: '200', final_url: 'https://www.decodesign.fr/', ssl_ok: 'oui', https_final: 'oui',
    sitemap: 'absent', sitemap_detail: 'https://www.decodesign.fr/sitemap.xml -> 200 text/html (page HTML, pas un sitemap)', platform: 'PrestaShop' });
  assert.equal(auditFlags(r).some((f) => f.key === 'sitemap_vide'), false);
  assert.equal(buildProofEmail(r, {}).ok, false);
  const vide = buildProofEmail({ domain: 'x.fr', title: 'X', http_status: 200, sitemap: 'vide', ssl_ok: true, https_final: true, platform: 'PrestaShop' }, {});
  assert.equal(vide.ok, false);
  assert.ok(vide.indices.includes('sitemap vide'));
});

test('ton : aucune formule interdite, 90 à 150 mots, structure présentation / motif / proposition / question / refus, sur TOUTES les preuves', () => {
  const base = { domain: 'exemple.fr', title: 'Boutique Exemple', http_status: 200, platform: 'PrestaShop', ssl_ok: true, https_final: true, analyse_le: '2026-10-21T10:00:00Z' };
  const cas = {
    accueil_404: { http_status: 404 },
    erreur_serveur: { http_status: 503 },
    invisible_google: { noindex: true },
    nom_mal_orthographie: { title: 'Exemle Boutique', sirene_match: 'sur', raison_sociale: 'EXEMPLE BOUTIQUE', gerant_nom: 'DURAND', gerant_prenom: 'PAUL', ville: 'LYON', code_postal: '69001', code_postal_site: '69001' },
    http_non_securise: { https_final: false, final_url: 'http://exemple.fr/' },
    ssl_expire: { ssl_expire_jours: -12 },
    ssl_invalide: { ssl_ok: false, ssl_erreur: 'certificat valable pour un autre nom' },
    titre_defaut: { title: 'PrestaShop' },
    mentions_404: { mentions_404: true },
    mobile: { mobile_ok: false }
  };
  assert.deepEqual([...PREUVES_ORDRE].sort(), Object.keys(cas).sort(), 'chaque preuve du catalogue a son cas');
  for (const [key, extra] of Object.entries(cas)) {
    const d = buildProofEmail({ ...base, ...extra }, {});
    assert.equal(d.ok, true, key);
    assert.equal(d.preuve, key);
    assert.doesNotMatch(d.body, FORMULES_INTERDITES, key);
    assert.doesNotMatch(d.subject, FORMULES_INTERDITES, key);
    const n = mots(d.body);
    assert.ok(n >= 90 && n <= 150, `${key} : ${n} mots`);
    assert.match(d.body, /développeur web indépendant et je dirige PixFeed, spécialisé dans la maintenance et le dépannage de sites professionnels\./);
    assert.match(d.body, /maintenance/);
    assert.match(d.body, /disposez déjà d'un prestataire pour assurer ce suivi/);
    assert.doesNotMatch(d.body, /Si personne n'assure|en parcourant|\d{2}\/\d{2}\/\d{4}/);
    assert.doesNotMatch(d.body, /Si vous ne souhaitez plus être contacté/);
    assert.match(d.body, /Bonne journée à vous,$/);
    assert.doesNotMatch(d.body, /\btu\b|\bton\b|\btes\b/i);
  }
  const lyon = buildProofEmail({ ...base, ...cas.nom_mal_orthographie }, {});
  assert.match(lyon.body, /^Bonjour Paul Durand,/);
  // Certificat bientôt expiré : plus un motif d'email (renouvellement souvent automatique).
  assert.equal(buildProofEmail({ ...base, ssl_expire_jours: 18 }, {}).ok, false);
  assert.equal(PREUVE_KEYS.has('ssl_bientot'), false);
});

test('email création (signaux) et consigne Claude libre : mêmes règles de ton', () => {
  const c = buildCreationEmail({ domain: 'dupont-plomberie.fr', match_confidence: 'sur', company_name: 'DUPONT PLOMBERIE', dirigeant: 'JEAN DUPONT', city: 'Bourg-en-Bresse', website_status: 'parking', company_created_at: new Date(Date.now() - 12 * 86400000) }, { company: 'dupont-plomberie.fr' });
  assert.doesNotMatch(c.body, FORMULES_INTERDITES);
  assert.match(c.body, /développeur web indépendant/);
  assert.doesNotMatch(c.body, /Si vous ne souhaitez plus être contacté/);
  assert.ok(mots(c.body) <= 125, String(mots(c.body)));
  const prompt = buildSystemPrompt('humain');
  for (const phrase of ['je ne vous relancerai pas', 'un simple oui suffit', "sauté aux yeux", "de l'intérieur", 'rien de grave', 'à mon compte']) {
    assert.ok(prompt.toLowerCase().includes(phrase.toLowerCase()), `interdit listé dans la consigne : ${phrase}`);
  }
  // Le modèle n'écrit plus l'email entier : présentation, proposition, refus discret et fin sont
  // assemblés par le code (assembleColdEmail), donc présents quoi qu'il réponde.
  const { assembleColdEmail } = require('../services/coldEmailService');
  const corps = assembleColdEmail({ row: { domain: 'x.fr', platform: 'PrestaShop' }, lead: {}, motif: 'Constat.', question: 'Question ?' });
  assert.match(corps, /développeur web indépendant et je dirige PixFeed, spécialisé dans la maintenance et le dépannage de sites professionnels\./);
  assert.doesNotMatch(corps, /Si vous ne souhaitez plus être contacté/);
  assert.match(corps, /pixfeed\.net\/maintenance/);
  assert.match(corps, /Bonne journée à vous,$/);
});

test('modèles d\'email du menu « Modèle » : même présentation, aucune formule interdite', () => {
  for (const [name, , subject, body] of EMAIL_TEMPLATE_SEED) {
    assert.doesNotMatch(body, FORMULES_INTERDITES, name);
    assert.doesNotMatch(subject, FORMULES_INTERDITES, name);
    assert.doesNotMatch(body, /n'insiste pas|faire fuir|perdre quelques visiteurs|failles de sécurité/i, name);
  }
  const premier = EMAIL_TEMPLATE_SEED.find(([n]) => n === 'Premier contact')[3];
  assert.match(premier, /développeur web indépendant et je dirige \{entreprise\}, spécialisé dans la maintenance et le dépannage de sites professionnels\./);
  assert.doesNotMatch(premier, /Si vous ne souhaitez plus être contacté/);
});

test('Batterie4moto : mesure HTTPS de l\'ancien crawl non confirmée -> pas d\'alerte, email de maintenance sobre ; crawl frais sur www -> rien à signaler', () => {
  const { buildMaintenanceEmail } = require('../services/proofEmailService');
  // Ancien crawl (sans analyse_le) : « servi en HTTP » n'est pas une preuve.
  const ancien = { domain: 'batterie4moto.fr', title: 'Batterie4moto', https_final: false, ssl_ok: false, final_url: 'http://batterie4moto.fr/', http_status: 200, platform: 'PrestaShop' };
  const d = buildProofEmail(ancien, {});
  assert.equal(d.ok, false);
  assert.match(d.raison, /ancien crawl, non confirmé/);
  assert.ok(d.maintenance && d.maintenance.ok);
  assert.doesNotMatch(d.maintenance.body, /HTTP|cadenas|certificat|imposer|Non sécurisé/);
  assert.match(d.maintenance.body, /développeur web indépendant et je dirige PixFeed/);
  assert.match(d.maintenance.body, /J'ai découvert votre boutique Batterie4moto\./);
  assert.match(d.maintenance.body, /disposez déjà d'un prestataire/);
  assert.doesNotMatch(d.maintenance.body, /en parcourant|\d{2}\/\d{2}\/\d{4}/);
  assert.doesNotMatch(d.maintenance.body, FORMULES_INTERDITES);
  // Crawl frais : https://www a répondu en strict -> aucune preuve HTTPS, boutique saine.
  const frais = typedResult({ domain: 'batterie4moto.fr', title: 'Batterie4moto', http_status: '200', final_url: 'https://www.batterie4moto.fr/', https_final: 'oui', ssl_ok: 'oui', platform: 'PrestaShop', analyse_le: '2026-10-21T16:00:00+00:00',
    https_variantes: 'https://batterie4moto.fr -> TLS: certificat valable pour un autre nom | https://www.batterie4moto.fr -> 200 https://www.batterie4moto.fr/' });
  assert.equal(auditFlags(frais).some((f) => ['http_non_securise', 'ssl_invalide'].includes(f.key)), false);
  const m = buildProofEmail(frais, {});
  assert.equal(m.ok, false); assert.ok(m.maintenance.ok);
  // Même mesure, mais le crawl frais confirme le HTTP (AGRIGOM) : la preuve passe, avec les variantes dans la trace.
  const agrigom = typedResult({ domain: 'agrigom.fr', title: 'Accueil - AGRIGOM SAS', http_status: '200', final_url: 'http://www.agrigom.fr/', https_final: 'non', ssl_ok: 'oui', platform: 'PrestaShop', analyse_le: '2026-10-21T16:00:00+00:00',
    https_variantes: 'https://agrigom.fr -> 200 http://www.agrigom.fr/' });
  const a = buildProofEmail(agrigom, {});
  assert.equal(a.preuve, 'http_non_securise');
  assert.match(a.detail.brut, /variantes : https:\/\/agrigom\.fr -> 200 http:\/\/www\.agrigom\.fr\//);
  assert.doesNotMatch(a.body, /imposer/);
  // Atelier du Sucre : idem, servi en HTTP confirmé par le crawl frais.
  const atelier = typedResult({ domain: 'atelierdusucre.fr', title: 'Atelier du sucre, la boutique en ligne', http_status: '200', final_url: 'http://www.atelierdusucre.fr/fr/', https_final: 'non', ssl_ok: 'oui', platform: 'PrestaShop', analyse_le: '2026-10-21T16:00:00+00:00' });
  assert.equal(buildProofEmail(atelier, {}).preuve, 'http_non_securise');
  // Sans technologie identifiée : pas de bascule maintenance, refus simple.
  assert.equal(buildMaintenanceEmail({ domain: 'x.fr', http_status: 200, platform: 'Inconnu' }, {}).ok, false);
});

test('Batterie4moto (crawl frais) : certificat d\'hébergeur présenté sur les deux variantes https -> preuve nommant le certificat, pas de « il suffit »', () => {
  const r = typedResult({ domain: 'batterie4moto.fr', title: 'Batterie4moto', http_status: '200', final_url: 'http://www.batterie4moto.fr', https_final: 'non', ssl_ok: 'non',
    ssl_erreur: 'certificat valable pour un autre nom', ssl_sujet: 'preview.infomaniak.website', ssl_hote: 'www.batterie4moto.fr', platform: 'PrestaShop', analyse_le: '2026-10-21T16:03:09+00:00',
    https_variantes: 'https://batterie4moto.fr -> erreur: ConnectError: | https://www.batterie4moto.fr -> TLS: certificat valable pour un autre nom | http://batterie4moto.fr -> 200 http://www.batterie4moto.fr' });
  const d = buildProofEmail(r, {});
  assert.equal(d.ok, true);
  assert.equal(d.preuve, 'http_non_securise');
  assert.match(d.body, /certificat présenté est au nom de « preview\.infomaniak\.website », celui de l'hébergeur/);
  // L'adresse citée est celle où le certificat a été refusé (www), pas le domaine nu qui ne répond pas.
  assert.match(d.body, /En tapant https:\/\/www\.batterie4moto\.fr, le navigateur/);
  // Sans colonne ssl_hote (ancienne ligne), l'adresse est lue dans la trace des variantes.
  const sansHote = buildProofEmail({ ...r, ssl_hote: null }, {});
  assert.match(sansHote.body, /En tapant https:\/\/www\.batterie4moto\.fr/);
  assert.match(d.body, /ne s'ouvre donc qu'en HTTP, sans cadenas/);
  assert.doesNotMatch(d.body, /imposer|Dans la plupart des cas/);
  assert.match(d.detail.brut, /variantes : https:\/\/batterie4moto\.fr -> erreur: ConnectError: \| https:\/\/www\.batterie4moto\.fr -> TLS/);
  assert.ok(mots(d.body) <= 155, String(mots(d.body)));
});
