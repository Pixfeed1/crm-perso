// Email par la preuve : une seule affirmation vérifiable, refus sans preuve.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildProofEmail, PREUVES_ORDRE, nomCourt } = require('../services/proofEmailService');

test('Equip\'Tout : la preuve retenue est le nom mal orthographié, avec le nom en casse lisible', () => {
  const r = { domain: 'www.equiptout.fr', title: 'Equit Tout', raison_sociale: "EQUIP'TOUT", sirene_match: 'sur', gerant: 'Maxime Lambin',
    platform: 'PrestaShop', platform_version: 'PrestaShop 1.5 (déduit)', urls_reecrites: false, sitemap: 'vide', http_status: 200 };
  const d = buildProofEmail(r, {});
  assert.equal(d.ok, true);
  assert.equal(d.preuve, 'nom_mal_orthographie');
  assert.match(d.subject, /mal orthographié/);
  assert.match(d.body, /Bonjour Maxime Lambin,/);
  assert.match(d.body, /« Equit Tout », alors que votre société s'appelle Equip'Tout\./);
  assert.match(d.body, /En consultant Equip'Tout,/);
  assert.match(d.body, /pixfeed\.net\/maintenance/);
  assert.equal(d.detail.signal, 'nom_mal_orthographie');
  assert.match(d.detail.identite, /SIRENE sûre/);
  assert.doesNotMatch(d.body, /rien de grave|si jamais ça vous intéresse/i);
});

test('sans preuve, pas d\'email : indices listés, raison explicite', () => {
  const d = buildProofEmail({ domain: 'x.fr', title: 'Boutique X', platform: 'PrestaShop', platform_version: 'PrestaShop 1.7+ (déduit)', spf: false, http_status: 200 }, {});
  assert.equal(d.ok, false);
  assert.match(d.raison, /Aucune preuve/);
  assert.ok(d.indices.includes('sans SPF'));
  assert.equal(buildProofEmail(null, {}).ok, false);
});

test('gérant douteux (SIRENE) : pas de nom dans la salutation ; contexte technique = une seule phrase', () => {
  const r = { domain: 'gourmandsdantan.fr', title: 'Epicerie fine - Gourmands d\'Antan', https_final: false, ssl_ok: true, serveur_php: 'PHP 5.4',
    platform: 'PrestaShop', platform_version: 'PrestaShop 1.6 (déduit)', gerant: 'X Y', sirene_match: 'douteux', http_status: 200, analyse_le: '2026-10-21T15:03:02Z' };
  const d = buildProofEmail(r, {});
  assert.equal(d.preuve, 'http_non_securise');
  assert.match(d.body, /^Bonjour,\n/);
  assert.match(d.body, /En consultant Gourmands d'Antan le 21\/10\/2026,/);
  // PHP : un indice déclaré par le serveur. Plus dans le corps de l'email, seulement dans la trace.
  assert.doesNotMatch(d.body, /PHP/);
  assert.match(d.detail.contexte, /PHP déclaré par l'entête/);
});

test('ordre des preuves : la panne passe avant tout le reste', () => {
  const d = buildProofEmail({ domain: 'x.fr', http_status: 503, title: 'PrestaShop', https_final: false }, {});
  assert.equal(d.preuve, 'erreur_serveur');
  assert.equal(PREUVES_ORDRE[0], 'accueil_404');
});

test('salutation : premier prénom + nom en casse de nom, jamais l\'état civil complet en capitales', () => {
  assert.equal(nomCourt({ gerant: 'LUDOVIC MARCEL ROBERT AUGUSTE BAUDRY' }), 'Ludovic Baudry');
  assert.equal(nomCourt({ gerant: 'LUDOVIC MARCEL BAUDRY', gerant_nom: 'DE LA CRUZ', gerant_prenom: 'MARCOS' }), 'Marcos De La Cruz');
  const r = { domain: 'a.fr', title: 'A', https_final: false, http_status: 200, analyse_le: '2026-10-21T15:03:02Z', sirene_match: 'sur', gerant: 'LUDOVIC MARCEL ROBERT AUGUSTE BAUDRY', raison_sociale: 'A SARL', ville: 'OYONNAX', code_postal: '01100', code_postal_site: '01100', platform: 'PrestaShop' };
  const d = buildProofEmail(r, {});
  assert.match(d.body, /^Bonjour Ludovic Baudry,/);
  // La ville n'est jamais dans le corps (présentation unique) ; la trace dit si elle est confirmée.
  assert.doesNotMatch(d.body, /Oyonnax/);
  assert.match(d.detail.identite, /confirmée par le code postal du site/);
  const sansCp = buildProofEmail({ ...r, code_postal_site: null }, {});
  assert.match(sansCp.detail.identite, /non confirmée/);
  const { joliVille, joliNom } = require('../services/proofEmailService');
  assert.equal(joliVille("CREVECŒUR-SUR-L'ESCAUT"), "Crevecœur-sur-l'Escaut");
  assert.equal(joliVille('BOURG-EN-BRESSE'), 'Bourg-en-Bresse');
  assert.equal(joliNom('AGRIGOM (AGRIGOM)'), 'Agrigom');
  assert.equal(joliNom('ALEX ELEC (AKPM)'), 'Alex Elec (Akpm)');
  // Certificat valide mais site qui renvoie vers http : la preuve le dit tel quel.
  const redir = buildProofEmail({ domain: 'agrigom.fr', title: 'AGRIGOM', https_final: false, ssl_ok: true, final_url: 'http://www.agrigom.fr/', http_status: 200, platform: 'PrestaShop', analyse_le: '2026-10-21T15:03:02Z' }, {});
  assert.match(redir.body, /En tapant https:\/\/agrigom\.fr.*renvoyé vers http:\/\/www\.agrigom\.fr/);
  assert.match(redir.body, /réglage de redirection/);
});

test('correspondance SIRENE probable ou douteuse : ni nom, ni ville, ni raison sociale dans l\'email', () => {
  for (const m of ['probable', 'douteux', null]) {
    const r = { domain: 'uneaffairedefilles.fr', title: 'Une Affaire de Filles - Boutique', https_final: false, http_status: 200, analyse_le: '2026-10-21T15:03:02Z', sirene_match: m, gerant: 'JEANNE DUPONT', raison_sociale: 'UNE AFFAIRE DE FILLES', ville: 'Paris', platform: 'PrestaShop' };
    const d = buildProofEmail(r, {});
    assert.match(d.body, /^Bonjour,\n/);
    assert.doesNotMatch(d.body, /Paris|Dupont/);
    assert.match(d.detail.identite, /pas de personnalisation/);
  }
});

test('portées sobres : aucune affirmation sur Google ou les clients qu\'on ne peut pas démontrer', () => {
  const cas = [
    { domain: 'b.fr', title: 'B', ssl_ok: true, ssl_expire_jours: -12, http_status: 200, analyse_le: '2026-10-20T08:00:00Z' },
    { domain: 'c.fr', title: 'C', ssl_ok: false, ssl_erreur: 'certificat valable pour un autre nom', http_status: 200, analyse_le: '2026-10-20T08:00:00Z' },
    { domain: 'd.fr', title: 'D', mobile_ok: false, http_status: 200 }
  ];
  for (const r of cas) {
    const d = buildProofEmail(r, {});
    assert.equal(d.ok, true, r.domain);
    assert.doesNotMatch(d.body, /semaines à apparaître|écran rouge|plein écran|plus de la moitié|ferment avant|encore ouvert|perd(ez|re) des clients/i, r.domain);
    assert.ok(d.detail.brut, r.domain);
  }
  const expire = buildProofEmail(cas[0], {});
  assert.match(expire.body, /En consultant b\.fr le 20\/10\/2026/);
  assert.match(expire.body, /expiré depuis 12 jours/);
  assert.match(expire.body, /Si le renouvellement est déjà programmé/);
  const inval = buildProofEmail(cas[1], {});
  assert.match(inval.body, /certificat valable pour un autre nom/);
  // Copyright ancien et sitemap vide ne sont plus des motifs d'email.
  assert.equal(buildProofEmail({ domain: 'e.fr', title: 'E', copyright_annee: 2019, http_status: 200 }, {}).ok, false);
  assert.equal(buildProofEmail({ domain: 'a.fr', title: 'A', sitemap: 'vide', http_status: 200 }, {}).ok, false);
});
