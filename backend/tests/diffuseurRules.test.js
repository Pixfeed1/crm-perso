// Diffuseur : règles pures (calendrier, recadrage, contrôle et composition des textes, liens, exports).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../utils/diffuseurRules');

const imgs = (sceneId, n, base = sceneId * 100) => Array.from({ length: n }, (_, i) => ({ id: base + i, scene_id: sceneId, ordre: i + 1, principale: false }));

test('calendrier : une image par jour, scènes alternées, jamais deux jours de suite la même scène', () => {
  const all = [...imgs(1, 8), ...imgs(2, 7), ...imgs(3, 8), ...imgs(4, 7)]; // 4 scènes, 30 images
  const { planning, non_planifiees } = R.planCalendar(all, { debut: '2026-11-01', jours: 30 });
  assert.equal(planning.length, 30); assert.equal(non_planifiees.length, 0);
  for (let i = 1; i < planning.length; i++) assert.notEqual(planning[i].scene_id, planning[i - 1].scene_id, `jour ${i}`);
  assert.equal(planning[0].date, '2026-11-01'); assert.equal(planning[29].date, '2026-11-30');
  assert.equal(new Set(planning.map((p) => p.image_id)).size, 30, 'chaque image une seule fois');
  assert.equal(new Set(planning.map((p) => p.date)).size, 30, 'une seule image par jour');
});

test('calendrier : plafond de jours, et une scène seule n\'enchaîne jamais deux jours', () => {
  const a = R.planCalendar([...imgs(1, 20), ...imgs(2, 20)], { debut: '2026-12-30', jours: 30 });
  assert.equal(a.planning.length, 30); assert.equal(a.non_planifiees.length, 10);
  assert.equal(a.planning[2].date, '2027-01-01', 'passage d\'année');
  const b = R.planCalendar([...imgs(1, 5), ...imgs(2, 1)], { debut: '2026-11-01' });
  assert.deepEqual(b.planning.map((p) => p.scene_id), [1, 2, 1]);
  assert.equal(b.non_planifiees.length, 3, 'le reste de la scène 1 attend une autre scène');
  assert.throws(() => R.planCalendar([], { debut: '01/11/2026' }), /Date de début invalide/);
});

test('calendrier : les images principales passent en premier dans leur scène', () => {
  const s1 = imgs(1, 3); s1[2].principale = true;
  const { planning } = R.planCalendar([...s1, ...imgs(2, 3)], { debut: '2026-11-01', ordreScenes: [1, 2] });
  assert.equal(planning[0].image_id, s1[2].id);
});

test('recadrage 4:5 : le plus grand cadre possible, centré sur le point d\'intérêt, sans sortir de l\'image', () => {
  const c = R.focalCrop(1600, 2400, 4 / 5, { x: 0.5, y: 0.5 });
  assert.deepEqual(c, { left: 0, top: 200, width: 1600, height: 2000 });
  assert.equal(R.focalCrop(1600, 2400, 4 / 5, { x: 0.5, y: 0.05 }).top, 0, 'bloqué en haut');
  assert.equal(R.focalCrop(1600, 2400, 4 / 5, { x: 0.5, y: 0.99 }).top, 400, 'bloqué en bas');
  const paysage = R.focalCrop(3000, 2000, 4 / 5, { x: 0.9, y: 0.5 });
  assert.equal(paysage.height, 2000); assert.equal(paysage.width, 1600); assert.equal(paysage.left, 1400);
});

test('contrôle des textes : émoticônes, coches, listes, PixFeed, tirets cadratins, hashtags', () => {
  assert.deepEqual(R.controlerTexte('Une scène calme, éclairée à la bougie.'), []);
  assert.ok(R.controlerTexte('Superbe rendu 🔥').includes('émoticône ou pictogramme'));
  assert.ok(R.controlerTexte('Rendu terminé ✓').includes('émoticône ou pictogramme'));
  assert.ok(R.controlerTexte('Au programme :\n- lumière\n- matières').includes('liste à puces ou à coches'));
  assert.ok(R.controlerTexte('1. lumière\n2. matières').includes('liste à puces ou à coches'));
  assert.ok(R.controlerTexte('Rendu par Pixfeed').includes('mention de PixFeed'));
  assert.ok(R.controlerTexte('Une lumière — douce').includes('tiret cadratin'));
  assert.ok(R.controlerTexte('Une lumière #douce').length);
  assert.equal(R.nettoyer('Une lumière — douce,  calme'), 'Une lumière, douce, calme');
});

test('hashtags : mots en tags, doublons retirés, plafond respecté', () => {
  assert.equal(R.hashtag('Vue de nuit'), '#VueDeNuit');
  assert.equal(R.hashtag('#3dart'), '#3dart');
  assert.equal(R.hashtag('Art numérique'), '#ArtNumérique');
  assert.deepEqual(R.listeHashtags(['3dart', '#3DArt', 'daz3d', 'render', 'x', 'y'], 3), ['#3dart', '#daz3d', '#render']);
});

const post = (o) => ({
  plateforme: 'x', langue: 'fr', texte_fr: 'Une ruelle sous la pluie, éclairée par une seule enseigne.', texte_en: 'A rainy alley lit by a single sign.',
  titre_fr: 'Ruelle sous la pluie, rendu 3D', titre_en: 'Rainy alley, 3D render', lien_type: 'affilie', lien_url: 'https://www.anrdoezrs.net/click-123-456?url=https%3A%2F%2Fwww.daz3d.com%2Fruelle',
  hashtags_fr: ['ruelle', 'pluie'], hashtags_en: ['rain'], ...o
});

test('composition : mention « lien affilié » dès qu\'un lien affilié est publié, jamais sur Instagram', () => {
  const x = R.composer(post({}));
  assert.match(x.texte, /Lien affilié\nhttps:\/\/www\.anrdoezrs\.net/); assert.equal(x.mention, true);
  assert.equal(x.longueur <= 280, true);
  const ig = R.composer(post({ plateforme: 'instagram', langue: 'fr_en' }));
  assert.doesNotMatch(ig.texte, /Lien affilié|https?:/, 'lien non cliquable sur Instagram : ni lien ni mention');
  assert.match(ig.texte, /^Une ruelle[\s\S]*\n\nA rainy alley/);
  const pin = R.composer(post({ plateforme: 'pinterest', langue: 'fr_en' }));
  assert.match(pin.texte, /Lien affilié · Affiliate link/); assert.doesNotMatch(pin.texte, /https?:/, 'Pinterest : le lien va dans sa colonne');
  assert.equal(pin.titre, 'Ruelle sous la pluie, rendu 3D');
  const article = R.composer(post({ plateforme: 'bluesky', lien_type: 'article', lien_url: 'https://jurojin.net/ruelle/' }));
  assert.doesNotMatch(article.texte, /affili/i); assert.match(article.texte, /\nhttps:\/\/jurojin\.net\/ruelle\//);
  const en = R.composer(post({ plateforme: 'facebook', langue: 'en' }));
  assert.match(en.texte, /^A rainy alley[\s\S]*Affiliate link/);
});

test('composition : hashtags par plateforme, longueur X avec lien compté 23, dépassement signalé', () => {
  const x = R.composer(post({}), { hashtagsBase: { fr: ['art3D', 'rendu3D'], en: [] } });
  assert.equal((x.texte.match(/#/g) || []).length, 2, 'X : 2 hashtags au plus');
  const brut = [...x.texte].length;
  assert.equal(x.longueur, brut - [...post({}).lien_url].length + 23);
  const long = R.composer(post({ plateforme: 'bluesky', texte_fr: 'Mot '.repeat(90) }));
  assert.equal(long.depasse, true);
  assert.equal(R.composer(post({ plateforme: 'pinterest' })).texte.includes('#'), false, 'Pinterest : mots-clés, pas de hashtags');
});

test('lien par défaut : affilié sur Pinterest, article pour les images principales ailleurs', () => {
  const ctx = { articleUrl: 'https://jurojin.net/a/', affilieUrl: 'https://cj.example/x' };
  assert.equal(R.lienParDefaut({ ...ctx, plateforme: 'pinterest', principale: true }).lien_type, 'affilie');
  assert.equal(R.lienParDefaut({ ...ctx, plateforme: 'x', principale: true }).lien_type, 'article');
  assert.equal(R.lienParDefaut({ ...ctx, plateforme: 'x', principale: false }).lien_type, 'affilie');
  assert.equal(R.lienParDefaut({ plateforme: 'pinterest', articleUrl: 'https://jurojin.net/a/' }).lien_type, 'article');
  assert.deepEqual(R.lienParDefaut({ plateforme: 'bluesky' }), { lien_type: 'aucun', lien_url: null });
});

test('heure de Paris vers UTC : hiver et été', () => {
  assert.equal(R.parisVersUtc('2026-11-03', '18:00'), '2026-11-03T17:00:00Z');
  assert.equal(R.parisVersUtc('2026-07-03', '18:00'), '2026-07-03T16:00:00Z');
  assert.equal(R.parisVersUtc('2027-03-28', '12:30'), '2027-03-28T10:30:00Z', 'jour du passage à l\'heure d\'été');
});

test('export CSV : colonnes du modèle collé, rapprochement des intitulés, BOM, échappement', () => {
  assert.deepEqual(R.lireEntetes('Title;Media URL;Pinterest board;Description;Link;Publish date;Keywords\r\n'), ['Title', 'Media URL', 'Pinterest board', 'Description', 'Link', 'Publish date', 'Keywords']);
  const ligne = { titre: 'Ruelle, pluie', texte: 'Ligne 1\nLigne "2"', lien: 'https://x/', media_url: 'https://media.jurojin.net/r/a.jpg', tableau: 'Rendus 3D', date: '2026-11-03', heure: '20:00', date_iso: '2026-11-03T19:00:00', mots_cles: 'pluie, ruelle', plateforme: 'Instagram' };
  const csv = R.csvExport(R.ENTETES_DEFAUT.pinterest, [ligne]);
  assert.ok(csv.startsWith('﻿Title,Media URL,Pinterest board,Thumbnail,Description,Link,Publish date,Keywords\r\n'));
  assert.ok(csv.includes('"Ruelle, pluie",https://media.jurojin.net/r/a.jpg,Rendus 3D,,"Ligne 1\nLigne ""2""",https://x/,2026-11-03T19:00:00,"pluie, ruelle"'));
  // Modèle avec date et heure séparées.
  const meta = R.csvExport(['Date', 'Time', 'Message', 'Link', 'Image URL', 'Account'], [ligne]);
  assert.ok(meta.includes('2026-11-03,20:00,"Ligne 1\nLigne ""2""",https://x/,https://media.jurojin.net/r/a.jpg,Instagram'));
  assert.equal(R.champPourColonne('Colonne inconnue'), null);
});
