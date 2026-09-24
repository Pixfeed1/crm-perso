// Email par la preuve : une seule affirmation vérifiable, refus sans preuve.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildProofEmail, PREUVES_ORDRE } = require('../services/proofEmailService');

test('Equip\'Tout : la preuve retenue est le nom mal orthographié, avec le nom en casse lisible', () => {
  const r = { domain: 'www.equiptout.fr', title: 'Equit Tout', raison_sociale: "EQUIP'TOUT", sirene_match: 'sur', gerant: 'Maxime Lambin',
    platform: 'PrestaShop', platform_version: 'PrestaShop 1.5 (déduit)', urls_reecrites: false, sitemap: 'vide', http_status: 200 };
  const d = buildProofEmail(r, {});
  assert.equal(d.ok, true);
  assert.equal(d.preuve, 'nom_mal_orthographie');
  assert.match(d.subject, /mal orthographié/);
  assert.match(d.body, /Bonjour Maxime Lambin,/);
  assert.match(d.body, /« Equit Tout »\. Votre société s'appelle Equip'Tout\./);
  assert.match(d.body, /Equip'Tout en cherchant/);
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
    platform: 'PrestaShop', platform_version: 'PrestaShop 1.6 (déduit)', gerant: 'X Y', sirene_match: 'douteux', http_status: 200 };
  const d = buildProofEmail(r, {});
  assert.equal(d.preuve, 'http_non_securise');
  assert.match(d.body, /^Bonjour,\n/);
  assert.match(d.body, /Gourmands d'Antan en cherchant/);
  assert.equal((d.body.match(/Pour être complet/g) || []).length, 1);
  assert.match(d.body, /PHP 5\.4, qui ne reçoit plus de correctifs/);
});

test('ordre des preuves : la panne passe avant tout le reste', () => {
  const d = buildProofEmail({ domain: 'x.fr', http_status: 503, title: 'PrestaShop', https_final: false }, {});
  assert.equal(d.preuve, 'erreur_serveur');
  assert.equal(PREUVES_ORDRE[0], 'accueil_404');
});
