// « Claude libre » encadré : le modèle n'écrit que le constat et la question ; présentation,
// proposition et fin viennent du code ; son texte est vérifié et rejeté s'il dérive. Sans réseau
// (modèle simulé). Et le test de validation : dix prospects différents, dix emails corrects, dans
// les deux modes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const cold = require('../services/coldEmailService');
const { buildProofEmail, FORMULES_INTERDITES } = require('../services/proofEmailService');

const PRESENTATION = /Je suis Marc, développeur web indépendant et je dirige PixFeed, spécialisé dans la maintenance et le dépannage de sites professionnels\./;
const fake = (reponses) => { let i = 0; return async () => JSON.stringify(reponses[Math.min(i++, reponses.length - 1)]); };
const mots = (t) => t.split(/\s+/).filter(Boolean).length;

test('la présentation vient du code, jamais du modèle : une paraphrase du modèle est ignorée', async () => {
  process.env.OUTREACH_SENDER_NAME = 'Marc'; process.env.OUTREACH_SENDER_COMPANY = 'PixFeed';
  const row = { domain: 'agrigom.fr', title: 'Accueil - AGRIGOM SAS', https_final: false, ssl_ok: true, final_url: 'http://www.agrigom.fr/', http_status: 200, platform: 'PrestaShop' };
  const d = await cold.draftColdEmail({ row, lead: {} }, {
    callModel: fake([{ subject: 'Votre boutique en ligne', motif: "Je dirige une structure spécialisée. En ouvrant agrigom.fr, on arrive sur la version http du site, sans cadenas.", question: 'Un prestataire assure-t-il déjà le suivi technique de votre boutique ?' }])
  }).catch((e) => e);
  // « une structure » dans le motif -> rejeté au premier essai ; le second (même réponse) aussi -> refus.
  assert.ok(d instanceof Error); assert.equal(d.status, 422); assert.match(d.message, /présentation paraphrasée/);
  const ok = await cold.draftColdEmail({ row, lead: {} }, {
    callModel: fake([{ subject: 'Votre boutique en ligne', motif: "En ouvrant agrigom.fr, on arrive sur la version http du site, sans cadenas.", question: 'Un prestataire assure-t-il déjà le suivi technique de votre boutique ?' }])
  });
  assert.match(ok.body, PRESENTATION);
  assert.match(ok.body, /^Bonjour,\n\nJe suis Marc/);
  assert.match(ok.body, /pixfeed\.net\/maintenance/);
  assert.match(ok.body, /Si vous ne souhaitez plus être contacté/);
  assert.match(ok.body, /Bonne journée à vous,$/);
  assert.doesNotMatch(ok.body, FORMULES_INTERDITES);
  assert.doesNotMatch(ok.body, /structure/);
});

test('sans preuve : le modèle ne reçoit aucun indice, et tout sujet technique est rejeté puis réessayé', async () => {
  const row = { domain: 'auterroirdanneflo.fr', title: "Au Terroir d'Anne Flo", ssl_ok: true, ssl_expire_jours: 21, https_final: true, serveur_php: 'PHP 5.6', platform: 'PrestaShop', platform_version: 'PrestaShop 1.6 (déduit)', http_status: 200 };
  const prompt = cold.buildUserPrompt(row, {});
  assert.match(prompt, /PREUVES VÉRIFIÉES : aucune/);
  assert.doesNotMatch(prompt, /PHP|21|1\.6|certificat/);
  let appels = 0;
  const d = await cold.draftColdEmail({ row, lead: {} }, {
    callModel: async () => {
      appels++;
      return JSON.stringify(appels === 1
        ? { subject: 'Sécurité', motif: 'Votre certificat de sécurité expire dans 21 jours, ce qui affichera une alerte, et votre PHP est obsolète.', question: 'Aviez-vous envisagé une maintenance ?' }
        : { subject: "Votre boutique Au Terroir d'Anne Flo", motif: "J'ai découvert Au Terroir d'Anne Flo et votre service de commande de produits locaux en ligne.", question: 'Un prestataire assure-t-il déjà le suivi technique de votre boutique ?' });
    }
  });
  assert.equal(appels, 2);
  assert.doesNotMatch(d.body, /21|PHP|certificat|alerte|obsol/i);
  assert.match(d.body, PRESENTATION);
  assert.equal(cold.validerTexte('Votre certificat expire dans 21 jours.', false), 'sujet technique sans preuve');
  assert.equal(cold.validerTexte('Je ne vous relancerai pas dix fois.', true), 'formule interdite');
  assert.equal(cold.validerTexte("J'ai découvert votre boutique de produits locaux.", false), null);
});

test('validation : dix prospects différents, dix emails corrects dans les deux modes', async () => {
  const base = { http_status: 200, platform: 'PrestaShop', ssl_ok: true, https_final: true, analyse_le: '2026-10-21T10:00:00Z' };
  const prospects = [
    { domain: 'agrigom.fr', title: 'Accueil - AGRIGOM SAS', https_final: false, final_url: 'http://www.agrigom.fr/', sirene_match: 'sur', raison_sociale: 'AGRIGOM', gerant_nom: 'SAVARY', gerant_prenom: 'FRANCK' },
    { domain: 'atelierdusucre.fr', title: 'Atelier du sucre, la boutique en ligne', https_final: false, final_url: 'http://www.atelierdusucre.fr/fr/', sirene_match: 'probable', gerant: 'X Y', ville: 'MANOSQUE' },
    { domain: 'equiptout.fr', title: 'Equit Tout', sirene_match: 'sur', raison_sociale: "EQUIP'TOUT", gerant: 'Maxime Lambin' },
    { domain: 'a.fr', title: 'PrestaShop' },
    { domain: 'b.fr', title: 'Boutique B', noindex: true },
    { domain: 'c.fr', title: 'Boutique C', http_status: 503 },
    { domain: 'd.fr', title: 'Boutique D', mentions_404: true },
    { domain: 'e.fr', title: 'Boutique E', mobile_ok: false },
    { domain: 'f.fr', title: 'Boutique F', ssl_ok: false, ssl_erreur: 'certificat expiré' },
    { domain: 'g.fr', title: 'Boutique G', ssl_expire_jours: -3 }
  ].map((p) => ({ ...base, ...p }));
  for (const r of prospects) {
    const d = buildProofEmail(r, {});
    assert.equal(d.ok, true, r.domain);
    assert.match(d.body, PRESENTATION, r.domain);
    assert.doesNotMatch(d.body, FORMULES_INTERDITES, r.domain);
    assert.doesNotMatch(d.body, /PHP|structure/, r.domain);
    assert.ok(mots(d.body) <= 130, `${r.domain} : ${mots(d.body)} mots`);
    const c = await cold.draftColdEmail({ row: r, lead: {} }, { callModel: fake([{ subject: 'Votre boutique', motif: 'En consultant votre boutique, j\'ai relevé le point suivant, que vous connaissez peut-être déjà.', question: 'Un prestataire assure-t-il déjà le suivi technique de votre boutique ?' }]) });
    assert.match(c.body, PRESENTATION, r.domain);
    assert.doesNotMatch(c.body, FORMULES_INTERDITES, r.domain);
  }
  // Et les cas sans preuve refusent (mode preuve) ou restent neutres (Claude libre).
  for (const r of [{ ...base, domain: 'aupiedrelax.fr', title: 'Au pied relax', copyright_annee: 2024, serveur_php: 'PHP 5.6' }, { ...base, domain: 'augardenia.fr', title: 'Au Gardenia', ssl_expire_jours: 18 }]) {
    assert.equal(buildProofEmail(r, {}).ok, false, r.domain);
    assert.match(cold.buildUserPrompt(r, {}), /aucune/);
  }
});
