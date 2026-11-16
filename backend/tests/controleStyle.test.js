// Contrôles de style de prepare_draft : parité avec controle_style.py (verdicts du script sur les quatre textes
// d'essai de Marc, tests/fixtures/charte/attendus-python.json), puis réglages de la charte et contrôles ajoutés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const S = require('../services/wpBrouillon/controleStyle');

const FIX = path.join(__dirname, 'fixtures', 'charte');
const cas = JSON.parse(fs.readFileSync(path.join(FIX, 'attendus-python.json'), 'utf8'));
const donnees = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'charte', 'charte-test.json'), 'utf8'));
const AJOUTS_12 = ['blendérien', "dont personne n'a jamais entendu parler"];
const lire = (f) => fs.readFileSync(path.join(FIX, f), 'utf8');

test('parité avec controle_style.py : statuts, points bloquants, avertissements et mesures identiques (seuil 2,5 du script)', () => {
  const c = donnees.commun.controles;
  const script = { ...c, liste_noire: c.liste_noire.filter((x) => !AJOUTS_12.includes(x)), seuils: { ...c.seuils, phrases_par_paragraphe_min: 2.5 } };
  for (const x of cas) {
    const r = S.analyserScript(lire(x.fichier), { titre: x.titre, cle: x.cle, controles: script });
    assert.equal(r.statut, x.attendu.statut, x.fichier);
    assert.deepEqual(r.bloquant.map((p) => p.texte), x.attendu.bloquant, `${x.fichier} : bloquants`);
    assert.deepEqual(r.avertissement.map((p) => p.texte), x.attendu.avertissement, `${x.fichier} : avertissements`);
    assert.deepEqual(r.mesures, x.attendu.mesures, `${x.fichier} : mesures`);
  }
  assert.deepEqual(cas.map((x) => [x.attendu.statut, x.attendu.bloquant.length]), [['ÉCHEC', 8], ['OK', 0], ['ÉCHEC', 4], ['OK', 0]]);
});

test('réglages de la charte (seuil 3, ajouts de la section 12) : seuls les écarts attendus', () => {
  const r = cas.map((x) => S.analyserScript(lire(x.fichier), { titre: x.titre, cle: x.cle, controles: donnees.commun.controles }));
  assert.deepEqual(r.map((x) => x.statut), ['ÉCHEC', 'OK', 'ÉCHEC', 'ÉCHEC']);
  assert.match(r[0].avertissement.find((p) => p.code === 'paragraphes_courts').texte, /moins de 3 phrases/);
  assert.ok(!r[2].avertissement.some((p) => p.code === 'paragraphes_courts'), 'pixfeed : 3 phrases en moyenne, pas sous 3');
  assert.deepEqual(r[3].bloquant.map((p) => p.texte), [`expressions toutes faites : ['blendérien', "dont personne n'a jamais entendu parler"]`]);
  for (const i of [0, 1, 2]) assert.deepEqual(r[i].bloquant.map((p) => p.texte), cas[i].attendu.bloquant);
});

test('contrôles de la charte : section 12 et interdits de la section 11.5, avec les effets du site', () => {
  const charte2 = { commun: donnees.commun, site: donnees.sites['2'] };
  const charte15 = { commun: donnees.commun, site: donnees.sites['15'] };
  const p = (t) => `<!-- wp:paragraph -->\n<p>${t}</p>\n<!-- /wp:paragraph -->`;
  const long = 'La lecture d\'une scène lourde dans le viewport dépend surtout de la fréquence du processeur, et pas du nombre de cœurs disponibles sur la machine.';
  const base = [p(`${long} Le rendu final, lui, profite de tous les cœurs.`), p(`${long} Une scène de 2 millions de polygones reste fluide sur un M5 Max.`)];
  const ctl = (html, charte = charte2, extra = {}) => S.controler(html, { titre: 'Choisir un Mac pour Blender', cle: 'mac blender', charte, ...extra });
  const codes = (r, niveau) => r[niveau].map((x) => x.code);

  let r = ctl(base.join('\n'));
  assert.deepEqual(codes(r, 'bloquant'), []);
  // Tiret cadratin : bloquant ; demi-cadratin d'incise : avertissement ; aussi dans le titre SEO.
  r = ctl([p(`${long} Le rendu — lui — profite de tous les cœurs.`), base[1]].join('\n'));
  assert.ok(codes(r, 'bloquant').includes('cadratin'));
  r = ctl([p(`${long} Le rendu – en pratique – profite de tous les cœurs.`), base[1]].join('\n'), charte2, { champs: { titre_seo: 'Mac — Blender' } });
  assert.ok(codes(r, 'avertissement').includes('demi_cadratin_incise'));
  assert.match(r.bloquant.find((x) => x.code === 'cadratin').texte, /titre_seo/);
  // Claude / Anthropic : crédit dans une légende bloquant, simple mention avertissement (Claude Chabrol).
  const fig = (leg) => `<!-- wp:image --><figure class="wp-block-image"><img src="x.webp" alt="Graphique"/><figcaption>${leg}</figcaption></figure><!-- /wp:image -->`;
  r = ctl([...base, fig('Rendu de la scène. Image générée avec Claude.')].join('\n'));
  assert.ok(codes(r, 'bloquant').includes('ia_credits'));
  r = ctl([...base, fig('Graphique Anthropic pour Jurojin.net.')].join('\n'));
  assert.ok(codes(r, 'bloquant').includes('ia_credits'), 'Anthropic crédité');
  r = ctl([p(`${long} Anthropic a présenté son modèle le 12 novembre.`), base[1], fig("Le siège d'Anthropic à San Francisco.")].join('\n'));
  assert.deepEqual([codes(r, 'bloquant').includes('ia_credits'), codes(r, 'bloquant').includes('ia_texte'), codes(r, 'avertissement').includes('ia_texte')], [false, false, true], 'article d\'actualité sur Anthropic : avertissement');
  r = ctl([p(`${long} Claude Chabrol filmait ses scènes en deux prises au plus.`), base[1]].join('\n'));
  assert.deepEqual([codes(r, 'bloquant').includes('ia_texte'), codes(r, 'avertissement').includes('ia_texte')], [false, true]);
  // L'autre site : nom ou lien, bloquant ; nom signalé sur PixFeed : avertissement.
  r = ctl([p(`${long} Voir aussi <a href="https://pixfeed.net/maintenance/">notre maintenance</a>.`), base[1]].join('\n'));
  assert.ok(codes(r, 'bloquant').includes('autre_site'));
  r = ctl([p(`${long} Un article de Jurojin en parle.`), p(`${long} Michael Vaertan a suivi le chantier.`)].join('\n'), charte15);
  assert.ok(codes(r, 'bloquant').includes('autre_site'));
  assert.ok(codes(r, 'avertissement').includes('mots_signales'));
  // Markdown brut sur Jurojin : bloquant, sauf dans les blocs de code ; inactif sur PixFeed.
  const md = [p(`${long} Le **gras** se règle dans le thème.`), base[1]].join('\n');
  assert.ok(codes(ctl(md), 'bloquant').includes('markdown'));
  assert.ok(!codes(ctl(md, charte15), 'bloquant').includes('markdown') && !codes(ctl(md, charte15), 'avertissement').includes('markdown'));
  const code = [...base, '<!-- wp:code --><pre class="wp-block-code"><code># réglages\nbpy.context.scene.render.engine = "CYCLES"  # **important**</code></pre><!-- /wp:code -->', '[pf_code lang="python"]# titre\n**x** = 1[/pf_code]'].join('\n');
  assert.ok(!codes(ctl(code), 'bloquant').includes('markdown'), 'blocs de code exclus');
  // Section 12 : comparaison en fin de paragraphe, symétrie, première phrase courte (avertissements).
  r = ctl([p('Un site piraté ne prévient pas. Le code malveillant se loge dans la base, et il revient comme un ancien locataire.'), p(`${long} Contents pour le patron, moins pour leur place au comptoir.`)].join('\n'));
  assert.deepEqual(['comparaison_fin', 'symetrie', 'premiere_phrase'].map((c) => codes(r, 'avertissement').includes(c)), [true, true, true]);
  // Effet réglé par le site : inactif retire le contrôle, avertissement le rend non bloquant.
  const inactif = { commun: donnees.commun, site: { ...donnees.sites['2'], controles: { ...donnees.sites['2'].controles, effets: { ...donnees.sites['2'].controles.effets, cadratin: 'inactif', blancs_source: 'avertissement' } } } };
  r = ctl([p(`${long} Le rendu — lui — profite de tous les cœurs, comme avec un <a href="/x">lien</a> .`), base[1]].join('\n'), inactif);
  assert.ok(!codes(r, 'bloquant').includes('cadratin') && !codes(r, 'avertissement').includes('cadratin'));
  assert.ok(codes(r, 'avertissement').includes('blancs_source') && !codes(r, 'bloquant').includes('blancs_source'));
});

test('métadonnées des images, parties écrites d\'une mise à jour, blancs du rendu', () => {
  assert.equal(S.iaDansFichier(Buffer.from('JFIF....<x:xmpmeta><dc:creator>Anthropic Claude</dc:creator></x:xmpmeta>', 'latin1'), ['Claude', 'Anthropic']), 'Claude');
  assert.equal(S.iaDansFichier(Buffer.from('JFIF....Claudette'), ['Claude']), null);
  const ancien = '<p>Un.</p>\n<p>Deux.</p>\n<h2>Titre</h2>\n<p>Deux.</p>';
  assert.deepEqual(S.partiesEcrites(ancien, '<p>Un.</p>\n<p>Deux bis.</p>\n<h2>Titre</h2>\n<p>Deux.</p>\n<p>Neuf.</p>'), ['<p>Deux bis.</p>', '<p>Neuf.</p>']);
  const rendu = '<p>comme avec un <span class="term-tooltip">\n anti-aliasing <span>bulle</span>\n</span>\n . Fin.</p><p>Il faut qu\' OptiX tourne.</p><p>Aucun souci&nbsp;: ici.</p>';
  assert.deepEqual(S.blancsRendu(rendu).length, 2);
  assert.deepEqual(S.blancsRendu('<p>Propre, net. Et « ceci » : bien.</p>'), []);
});
