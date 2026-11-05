// Qualification d'un résultat de crawl : drapeaux, preuves, score, écartements.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const p = require('../utils/prospectScore');

test('les preuves visibles sont détectées et classées preuve', () => {
  const r = { domain: 'www.equiptout.fr', title: 'Equit Tout', raison_sociale: "EQUIP'TOUT", sirene_match: 'certain',
    platform: 'PrestaShop', platform_version: 'PrestaShop 1.5 (déduit)', https_final: true, ssl_ok: true, mobile_ok: true,
    meta_desc_txt: 'ZI de la Fontaine 59310 ORCHIES Fax 03 20 71 00 00', urls_reecrites: false, sitemap: 'vide', http_status: 200 };
  const keys = p.auditFlags(r).map((f) => f.key);
  for (const k of ['nom_mal_orthographie', 'meta_desc_absurde', 'urls_non_reecrites', 'sitemap_vide', 'version_obsolete']) {
    assert.ok(keys.includes(k), `drapeau attendu : ${k}`);
  }
  assert.equal(p.niveauFlag('nom_mal_orthographie'), 'preuve');
  assert.equal(p.niveauFlag('version_obsolete'), 'indice');
  assert.deepEqual(p.nomMalOrthographie(r).mot_titre, 'equit');
});

test('pas de faux positif sur un nom correct ni sur une description saine', () => {
  assert.equal(p.nomMalOrthographie({ domain: 'lorchidee.fr', title: 'lorchidee.fr', raison_sociale: 'L ORCHIDEE SARL', sirene_match: 'certain' }), null);
  assert.equal(p.nomMalOrthographie({ domain: 'marchal-bodin.fr', title: 'Marchal Bodin quincaillerie' }), null);
  assert.equal(p.descriptionAbsurde({ meta_desc_txt: 'Quincaillerie professionnelle à Bordeaux, livraison en 48 h, plus de 20 000 références.' }), false);
  assert.equal(p.descriptionAbsurde({ meta_desc_txt: 'contact@x.fr' }), true);
});

test('PHP en fin de support daté, servi en HTTP, site en erreur', () => {
  assert.deepEqual(p.phpEol('PHP 7.0.33'), { branch: '7.0', eol: '2019-01' });
  assert.equal(p.phpEol('PHP 8.4.19'), null);
  const keys = p.auditFlags({ https_final: false, http_status: 503, panne_confirmee: true, serveur_php: 'PHP 5.6' }).map((f) => f.key);
  assert.ok(keys.includes('http_non_securise') && keys.includes('erreur_serveur') && keys.includes('php_obsolete'));
});

test('score : joignable + angles + budget, plafonné à 100, pénalisé si antibot', () => {
  const chaud = { email: 'a@b.fr', platform: 'PrestaShop', platform_version: 'PrestaShop 1.6 (déduit)', ssl_ok: false, ecommerce_actif: true, mentions_legales: false };
  assert.equal(p.prospectScore(chaud), 100);
  assert.ok(p.prospectScore({ ...chaud, protected: true }) < p.prospectScore(chaud));
  assert.equal(p.prospectScore({ parked: true }), 0);
});

test('écartement : agence, parké, antibot bloquent la promotion ; asso et collectivité non', () => {
  assert.match(p.promotionBlocker({ site_type: 'agence' }), /agence/);
  assert.match(p.promotionBlocker({ protected: true }), /antibot/);
  assert.equal(p.promotionBlocker({ site_type: 'asso' }), null);
  assert.equal(p.disqualifyReason({ site_type: 'collectivite' }), null);
  assert.match(p.disqualifyReason({ title: 'Acheter du SEO, référencement naturel', domain: 'x.fr' }), /agence/);
});

test('département depuis le code postal (Corse, DOM)', () => {
  assert.equal(p.departmentFromPostalCode('75011'), '75');
  assert.equal(p.departmentFromPostalCode('20100'), '2A');
  assert.equal(p.departmentFromPostalCode('20600'), '2B');
  assert.equal(p.departmentFromPostalCode('97400'), '974');
  assert.equal(p.departmentFromPostalCode('abc'), null);
});

test('panne vue une seule fois : indice « à confirmer », jamais une preuve', () => {
  const p = require('../utils/prospectScore');
  const une = p.auditFlags({ http_status: 503 }).map((f) => f.key);
  assert.ok(une.includes('panne_a_confirmer')); assert.ok(!une.includes('erreur_serveur'));
  const deux = p.auditFlags({ http_status: 503, panne_confirmee: true }).map((f) => f.key);
  assert.ok(deux.includes('erreur_serveur'));
  assert.ok(p.auditFlags({ http_status: 404 }).some((f) => f.key === 'panne_a_confirmer'));
});

test('versions : une version déduite n\'est jamais affirmée ; la plateforme n\'est nommée que confirmée', () => {
  const P = require('../utils/plateforme');
  assert.equal(P.niveauPlateforme({ platform: 'PrestaShop', signals: 'var prestashop | /modules/ps_' }), 'confirmée');
  assert.equal(P.niveauPlateforme({ platform: 'PrestaShop', signals: 'prestashop-' }), 'déduite');
  assert.equal(P.niveauPlateforme({ platform: 'WordPress', signals: 'header:link=/wp-json/' }), 'confirmée');
  assert.equal(P.versionPlateforme({ platform_version: 'PrestaShop 1.6 (déduit)' }).niveau, 'déduite');
  assert.equal(P.versionPlateforme({ platform_version: 'WordPress 6.4' }).niveau, 'confirmée');
  const { buildProofEmail } = require('../services/proofEmailService');
  const base = { domain: 'x.fr', title: 'X', platform: 'PrestaShop', http_status: 200, https_final: false, final_url: 'http://x.fr/', analyse_le: new Date().toISOString(), version_obsolete: true };
  const deduit = buildProofEmail({ ...base, platform_version: 'PrestaShop 1.6 (déduit)', signals: 'prestashop-' }, {});
  assert.doesNotMatch(deduit.body, /PrestaShop 1\.6|tourne sur/);
  const P2 = require('../services/proofEmailService');
  const mDeduit = P2.buildMaintenanceEmail({ ...base, https_final: true, ecommerce_actif: true, signals: 'prestashop-' }, {});
  assert.doesNotMatch(mDeduit.body, /PrestaShop/, 'plateforme seulement déduite : pas nommée');
  const mConf = P2.buildMaintenanceEmail({ ...base, https_final: true, ecommerce_actif: true, signals: 'var prestashop | /modules/ps_' }, {});
  assert.match(mConf.body, /qui fonctionne sous PrestaShop/);
  const declare = buildProofEmail({ ...base, platform_version: 'PrestaShop 1.6.1.24', signals: 'var static_token | themes/default-bootstrap' }, {});
  assert.doesNotMatch(declare.body, /PHP|tourne sur/, 'la version reste dans la trace, pas dans le corps');
});

test('angles : indices jamais présentés comme des faits (sitemap, version déduite, panne vue une fois, PHP déclaré)', () => {
  const { anglesClasses, problemesLisibles } = require('../utils/crawlAngles');
  const r = { platform: 'PrestaShop', platform_version: 'PrestaShop 1.6 (déduit)', sitemap: 'vide', http_status: 503, serveur_php: 'PHP/5.6.40', mentions_legales: false, analyse_le: new Date().toISOString() };
  const { verifies, indices } = anglesClasses(r);
  assert.equal(verifies.length, 0, JSON.stringify(verifies));
  assert.ok(indices.some((x) => /sitemap.*semble vide/.test(x)));
  assert.ok(indices.some((x) => /ressemblent à ceux de PrestaShop 1\.6 \(version déduite/.test(x)));
  assert.ok(indices.some((x) => /une seule mesure/.test(x)));
  assert.ok(indices.some((x) => /D'après l'entête/.test(x)));
  assert.ok(problemesLisibles(r).every((x) => /^À vérifier : /.test(x)));
  const confirme = anglesClasses({ ...r, panne_confirmee: true, platform_version: 'PrestaShop 1.6.1.24' });
  assert.ok(confirme.verifies.some((x) => /deux reprises/.test(x)));
  assert.ok(confirme.verifies.some((x) => /déclare tourner sur PrestaShop 1\.6\.1\.24/.test(x)));
});
