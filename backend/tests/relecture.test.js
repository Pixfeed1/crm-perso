// Relecture de prepare_draft sans dépense inutile : jamais deux fois la même relecture, relecture incrémentale,
// recherches plafonnées, partie fixe en cache une heure, compteur (jetons, recherches, coût) et alerte du jour.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hasDb, withSchema } = require('./helpers/db');
const R = require('../services/wpBrouillon/relecture');

const opts = { skip: !hasDb() && 'TEST_DATABASE_URL absent' };
const P = (t) => `<!-- wp:paragraph -->\n<p>${t}</p>\n<!-- /wp:paragraph -->`;
const ARTICLE = [P('Le Mac Studio M4 Max coûte 2 499 € en France.'), '<!-- wp:heading -->\n<h2>Pour qui ?</h2>\n<!-- /wp:heading -->',
  P('Il vise les monteurs vidéo et les graphistes 3D.'), P('Sa mémoire unifiée monte à 128 Go.'), P('Le silence en charge reste son meilleur argument.')].join('\n\n');
const champs = (contenu = ARTICLE) => ({ titre: 'Mac Studio M4 Max : pour qui ?', titre_seo: 'Mac Studio M4 Max', meta: 'Notre avis.', contenu });
const conso = (entree, sortie, cache_lu, recherches, c1h = 0) => ({ entree, sortie, cache_lu, cache_ecrit_5m: 0, cache_ecrit_1h: c1h, recherches_api: recherches, recherches });

test('coût : prix publics d\'Opus 5.5 (entrée, sortie, cache, recherches)', () => {
  // 100 000 entrée × 4 $ + 10 000 sortie × 20 $ + 50 000 lus × 0,20 $ + 20 000 écrits 1 h × 8 $ (par million) + 7 recherches × 0,01 $
  assert.equal(R.cout(conso(100000, 10000, 50000, 7, 20000), 'claude-opus-5-5'), 0.84);
  const s = R.segments(champs());
  assert.deepEqual(s.map((x) => x.champ), ['titre', 'titre_seo', 'meta', 'contenu', 'contenu', 'contenu', 'contenu', 'contenu']);
  assert.equal(new Set(s.map((x) => x.h)).size, s.length);
});

test('requête : partie fixe en cache une heure, article ensuite, recherches plafonnées, usage cumulé sur les reprises', async () => {
  const requetes = [];
  let n = 0;
  R.definirClient({ beta: { messages: { create: async (p) => {
    requetes.push(JSON.parse(JSON.stringify(p)));
    n++;
    const usage = { input_tokens: 1000 * n, output_tokens: 100, cache_read_input_tokens: 8000, cache_creation_input_tokens: 9000, cache_creation: { ephemeral_1h_input_tokens: 9000, ephemeral_5m_input_tokens: 0 }, server_tool_use: { web_search_requests: 2 } };
    if (n === 1) return { stop_reason: 'pause_turn', model: 'claude-opus-5-5', usage, content: [{ type: 'server_tool_use', name: 'web_search', id: 's1', input: {} }] };
    return { stop_reason: 'end_turn', model: 'claude-opus-5-5', usage, content: [{ type: 'text', text: '{"corrections":[],"verifiees":[{"affirmation":"prix 2 499 €","source":"https://www.apple.com/fr/"}],"resume":"ok"}' }] };
  } } } });
  process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'cle-de-test';
  try {
    const r = await R.appelReel({ domaine: 'jurojin.net', charte: null, message: 'BUDGET : au plus 10 recherche(s) web.\n\nTITRE…', recherches_max: 10 });
    assert.equal(requetes.length, 2, 'reprise après pause_turn');
    const q = requetes[0];
    assert.equal(q.model, 'claude-opus-5-5');
    assert.deepEqual(q.tools, [{ type: 'web_search_20260209', name: 'web_search', max_uses: 10 }]);
    assert.deepEqual(q.system[0].cache_control, { type: 'ephemeral', ttl: '1h' }, 'consignes, charte et identité en cache une heure');
    assert.match(q.system[0].text, /RECHERCHE WEB : elle sert UNIQUEMENT à ces faits/);
    assert.doesNotMatch(q.system[0].text, /BUDGET|au plus 10/, 'rien de variable dans la partie fixe');
    assert.deepEqual(q.cache_control, { type: 'ephemeral' }, 'fin de conversation en cache pour les reprises');
    assert.equal(q.messages[0].content.slice(0, 7), 'BUDGET ');
    assert.equal(requetes[1].system[0].text, q.system[0].text, 'même partie fixe d\'une reprise à l\'autre');
    assert.deepEqual(r.conso, { entree: 3000, sortie: 200, cache_lu: 16000, cache_ecrit_5m: 0, cache_ecrit_1h: 18000, recherches_api: 4, recherches: 4 });
    assert.equal(r.verifiees[0].source, 'https://www.apple.com/fr/');
  } finally { R.definirClient(null); }
});

test('mémoire : même contenu jamais relu deux fois, appels simultanés, relecture incrémentale, compteur et alerte', opts, async () => {
  await withSchema('relectures', async ({ pool }) => {
    const db = { pool };
    const appels = [];
    const mails = [];
    R.definirMail(async (sujet, texte) => { mails.push({ sujet, texte }); });
    R.definirAppel(async (x) => {
      appels.push(x);
      await new Promise((ok) => setTimeout(ok, 30));
      if (x.mode === 'complete') return { corrections: [{ type: 'langue', champ: 'contenu', avant: 'graphistes 3D', apres: 'graphistes 3D (modélisation, rendu)' }],
        non_verifiees: [{ extrait: 'Sa mémoire unifiée monte à 128 Go.', raison: 'quota' }], verifiees: [{ affirmation: 'Mac Studio M4 Max à 2 499 €', source: 'https://www.apple.com/fr/shop/buy-mac/mac-studio' }],
        affirmations: { relevees: 3, confirmees: 1 }, resume: 'relu', modele: 'claude-opus-5-5', conso: conso(120000, 6000, 0, 9, 15000) };
      return { corrections: [{ type: 'fait', champ: 'contenu', avant: '3 999 €', apres: '4 199 €', source: 'https://www.apple.com/fr/' }], verifiees: [], affirmations: { relevees: 1 }, resume: 'un passage relu', modele: 'claude-opus-5-5', conso: conso(9000, 1500, 14000, 1) };
    });
    try {
      const base = { db, domaine: 'jurojin.net', site_id: 2, repere: 'url:https://jurojin.net/mac-studio', manifeste: { mode: 'mise_a_jour', url_origine: 'https://jurojin.net/mac-studio', titre: 'Mac Studio' } };
      // 1. Première relecture : complète, 10 recherches au plus, coût en tête du rapport.
      const r1 = await R.relire({ ...base, depot_id: 201, champs: champs() });
      assert.equal(appels.length, 1);
      assert.equal(appels[0].recherches_max, 10);
      assert.match(appels[0].message, /^BUDGET : au plus 10 recherche\(s\) web/);
      assert.equal(Object.keys(r1.rapport)[0], 'cout', 'le coût en tête du rapport');
      assert.match(r1.rapport.cout, /^Relecture complète : 0,81 \$ \(120 000 jetons d'entrée, 6 000 en sortie, 0 lus en cache, 15 000 écrits en cache, 9 recherche\(s\) web\)$/);
      assert.deepEqual([r1.rapport.consommation.depot, r1.rapport.consommation.cout_usd, r1.rapport.complete], [201, 0.81, false]);
      assert.match(r1.champs.contenu, /graphistes 3D \(modélisation, rendu\)/);

      // 2. Même dépôt rappelé (timeout côté client) et autre dépôt au contenu identique : aucun appel, 0 $.
      const [r2, r2b] = await Promise.all([R.relire({ ...base, depot_id: 201, champs: champs() }), R.relire({ ...base, depot_id: 202, champs: champs() })]);
      assert.equal(appels.length, 1, 'jamais deux fois la même relecture');
      assert.match(r2.rapport.cout, /^Relecture déjà faite : 0,00 \$ \(aucun appel à l'API : même contenu relu le .* \(dépôt 201\), rapport enregistré renvoyé\)$/);
      assert.equal(r2b.champs.contenu, r1.champs.contenu, 'mêmes corrections');
      assert.deepEqual(r2.rapport.non_verifiees, r1.rapport.non_verifiees);

      // Deux appels simultanés sur un contenu neuf : un seul appel à l'API.
      const autre = { ...base, repere: 'url:https://jurojin.net/autre' };
      await Promise.all([R.relire({ ...autre, depot_id: 300, champs: champs(ARTICLE.replace('Mac Studio', 'Mac Mini')) }), R.relire({ ...autre, depot_id: 300, champs: champs(ARTICLE.replace('Mac Studio', 'Mac Mini')) })]);
      assert.equal(appels.length, 2, 'le second appel attend le premier');

      // 3. Même article, une phrase modifiée : relecture incrémentale (1 paragraphe sur 8), 5 recherches au plus,
      //    affirmations déjà vérifiées transmises avec leurs sources ; les verdicts des paragraphes inchangés restent.
      const modifie = ARTICLE.replace('coûte 2 499 € en France.', 'coûte 3 999 € en France avec 128 Go.');
      const r3 = await R.relire({ ...base, depot_id: 203, champs: champs(modifie) });
      assert.equal(appels.length, 3);
      const x = appels[2];
      assert.deepEqual([x.mode, x.recherches_max, x.a_relire.length], ['incrementale', 5, 1]);
      assert.match(x.a_relire[0], /3 999 €/);
      assert.match(x.message, /DÉJÀ VÉRIFIÉES[\s\S]*- Mac Studio M4 Max à 2 499 € \(source : https:\/\/www\.apple\.com\/fr\/shop\/buy-mac\/mac-studio\)/);
      assert.match(x.message, /RELECTURE PARTIELLE[\s\S]*PLAN DE L'ARTICLE : Mac Studio M4 Max : pour qui \?\n- Pour qui \?[\s\S]*PASSAGES MODIFIÉS :/);
      assert.doesNotMatch(x.message, /Le silence en charge/, 'paragraphes inchangés non envoyés');
      assert.match(r3.rapport.cout, /^Relecture incrémentale : 0,08 \$ \(9 000 jetons d'entrée, 1 500 en sortie, 14 000 lus en cache, 0 écrits en cache, 1 recherche\(s\) web, 1 paragraphe\(s\) sur 8 relu\(s\)\)$/);
      assert.match(r3.champs.contenu, /4 199 €/, 'correction nouvelle appliquée');
      assert.match(r3.champs.contenu, /graphistes 3D \(modélisation, rendu\)/, 'correction du paragraphe inchangé gardée');
      assert.equal(r3.rapport.non_verifiees.length, 1, 'non vérifiée d\'un paragraphe inchangé : toujours signalée');

      // Texte corrigé redéposé tel quel (seul le manifeste change) : aucun paragraphe nouveau, aucun appel.
      const r4 = await R.relire({ ...base, manifeste: { ...base.manifeste, categories: ['Mac'] }, depot_id: 204, champs: r3.champs });
      assert.equal(appels.length, 3);
      assert.match(r4.rapport.cout, /^Relecture reprise \(aucun paragraphe modifié\) : 0,00 \$/);

      // Plus de la moitié de l'article réécrit : relecture complète.
      await R.relire({ ...base, depot_id: 205, champs: { ...champs(ARTICLE.replace(/<p>([^<]*)<\/p>/g, '<p>$1 Réécrit.</p>')), titre: 'Autre titre', meta: 'Autre méta.' } });
      assert.equal(appels[3].mode, 'complete');

      // Compteur en base : dépôt, jetons, recherches, coût ; total du jour et seuil.
      const b = await R.bilan(db);
      assert.deepEqual(b.lignes.slice().reverse().map((l) => [l.depot_id, l.mode, Number(l.cout)]), [[201, 'complete', 0.81], [201, 'reprise', 0], [202, 'reprise', 0], [300, 'complete', 0.81], [300, 'reprise', 0], [203, 'incrementale', 0.0788], [204, 'sans_changement', 0], [205, 'complete', 0.81]]);
      assert.equal(Number(b.lignes[b.lignes.length - 1].entree), 120000);
      assert.equal(b.alerte_jour_usd, 20);
      assert.equal(mails.length, 0, 'sous le seuil : pas de mail');
      // Seuil réglé à 1 $ : un mail, une seule fois dans la journée.
      await R.reglerAlerte(db, '1');
      await R.relire({ ...base, depot_id: 206, champs: champs(ARTICLE.replace(/<p>([^<]*)<\/p>/g, '<p>$1 Encore.</p>')) });
      await R.relire({ ...base, depot_id: 207, champs: champs(ARTICLE.replace(/<p>([^<]*)<\/p>/g, '<p>$1 Toujours.</p>')) });
      assert.equal(mails.length, 1);
      assert.match(mails[0].sujet, /^Relectures : 3,\d\d \$ aujourd'hui, seuil de 1,00 \$ dépassé$/);
      // Échec après consommation : la dépense est comptée quand même.
      R.definirAppel(async () => { throw Object.assign(new Error('réponse du relecteur sans JSON'), { conso: conso(50000, 0, 0, 3), modele: 'claude-opus-5-5' }); });
      await assert.rejects(R.relire({ ...base, depot_id: 208, champs: champs('<p>Tout autre texte.</p>') }), /sans JSON/);
      const der = (await R.bilan(db)).lignes[0];
      assert.deepEqual([der.depot_id, Number(der.cout), der.erreur], [208, 0.23, 'réponse du relecteur sans JSON']);
    } finally { R.definirAppel(null); R.definirMail(async () => {}); }
  });
});
