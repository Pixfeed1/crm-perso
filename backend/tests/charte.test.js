// Charte de rédaction en base : v1 tirée du fichier du 15/11/2026, versions, historique, retour arrière, export.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { hasDb, withSchema } = require('./helpers/db');
const { ensureCharteTables } = require('../scripts/autoInitDatabase');
const C = require('../services/charteService');

const DONNEES = path.join(__dirname, 'fixtures', 'charte', 'charte-test.json');
const donnees = () => JSON.parse(fs.readFileSync(DONNEES, 'utf8'));

test('données de la v1 : charte (5, 7, 9, 11, 12), exemples, identités, registres, réglages choisis par Marc', () => {
  const d = donnees();
  const cles = d.commun.regles.map((r) => r.cle);
  for (const k of ['5', '5.1', '5.10', '7.11', '7.13', '7.rythme', '9.jurojin', '9.pixfeed', '11.1.1', '11.2.13', '11.5.4', '12.14', '12.20', '12.change', '12.controles']) assert.ok(cles.includes(k), k);
  assert.equal(new Set(cles).size, cles.length, 'repères uniques');
  assert.match(d.commun.regles.find((r) => r.cle === '12.20').texte, /« les blendériens »/);
  assert.deepEqual(d.commun.exemples.map((e) => [e.id, e.site_id]), [['e1', 2], ['e2', 15]]);
  assert.match(d.commun.exemples[0].texte, /^En juin 2025, Blender Artists[\s\S]*\n\nLe ton n'étonnera pas[\s\S]*pour chaque étape\.$/);
  assert.match(d.commun.exemples[1].texte, /^En septembre, un client nous a appelés[\s\S]*transmettrait aussi les nouveaux\.$/);
  assert.match(d.sites['2'].identite, /^Jurojin est un média d'artistes[\s\S]*Le sel vient de l'intérieur du milieu[\s\S]*je vais revenir »\.$/);
  assert.match(d.sites['15'].identite, /^PixFeed est une agence web[\s\S]*quand il vient du métier[\s\S]*savent de quoi ils parlent\.$/);
  assert.doesNotMatch(JSON.stringify(d), /passage de référence\*\*|validé par Marc le/i, 'plus de passages de référence');
  assert.deepEqual([d.sites['2'].registre, d.sites['15'].registre], ['tutoiement', 'vouvoiement']);
  const k = d.commun.controles;
  assert.equal(k.liste_noire.length, 85);
  assert.ok(k.liste_noire.includes('blendérien') && k.liste_noire.includes("dont personne n'a jamais entendu parler"));
  assert.equal(k.seuils.phrases_par_paragraphe_min, 3);
  assert.equal(k.seuils.premiere_phrase_mots_min, 8);
  for (const l of C.LISTES_REGEX) for (const p of k[l]) assert.doesNotThrow(() => new RegExp(p, 'iu'), p);
  const e2 = d.sites['2'].controles.effets, e15 = d.sites['15'].controles.effets;
  assert.deepEqual([e2.blancs_source, e2.blancs_rendu, e15.blancs_source, e15.blancs_rendu], ['bloquant', 'avertissement', 'bloquant', 'bloquant']);
  assert.deepEqual([e2.cadratin, e2.demi_cadratin_incise, e2.ia_credits, e2.ia_texte, e2.autre_site, e2.markdown], ['bloquant', 'avertissement', 'bloquant', 'avertissement', 'bloquant', 'bloquant']);
  assert.equal(e15.markdown, 'inactif');
  assert.deepEqual(d.sites['15'].controles.mots_signales, ['Michael Vaertan']);
  assert.ok(d.sites['2'].controles.autre_site.includes('pixfeed.net') && d.sites['15'].controles.autre_site.includes('jurojin.net'));
});

test('charte en base : v1 au démarrage, modifications versionnées, historique, retour arrière, export', { skip: !hasDb() }, async () => {
  await withSchema('charte', async ({ pool }) => {
    const db = { pool };
    await pool.query('CREATE TABLE seo_sites (id INT PRIMARY KEY, domain TEXT)');
    await pool.query("INSERT INTO seo_sites VALUES (2, 'jurojin.net'), (15, 'pixfeed.net')");
    const c = await pool.connect(); try { await ensureCharteTables(c); } finally { c.release(); }

    // Remplissage automatique : une seule fois, jamais par-dessus une charte existante.
    assert.deepEqual(await C.semerSiAbsente(pool, donnees()), [2, 15]);
    assert.deepEqual(await C.semerSiAbsente(pool, donnees()), []);
    assert.deepEqual(await C.completerReglages(pool), [], 'v1 complète : rien à ajouter');
    // Une charte d'avant un nouveau réglage (ici la production, remplie avant le 16/11) : complétée une fois.
    await pool.query("UPDATE charte_versions SET contenu = contenu #- '{commun,controles,seuils,mise_a_jour_mesures_min_paragraphes}'");
    assert.deepEqual(await C.completerReglages(pool), [{ site_id: 2, version: 2 }, { site_id: 15, version: 2 }]);
    assert.deepEqual(await C.completerReglages(pool), []);
    const v2 = await C.courante(db, 2);
    assert.deepEqual([v2.auteur, v2.origine, v2.contenu.commun.controles.seuils.mise_a_jour_mesures_min_paragraphes], ['CRM', 'reglages', 5]);
    await pool.query('DELETE FROM charte_versions WHERE version = 2');
    let j = await C.courante(db, 2);
    assert.deepEqual([j.version, j.origine, j.domain, j.contenu.site.registre, j.contenu.commun.regles.length], [1, 'remplissage', 'jurojin.net', 'tutoiement', 63]);
    assert.equal((await C.sitesAvecCharte(db)).length, 2);

    // Simulation : rien écrit ; règle commune : nouvelle version sur les deux sites, avec l'ancien texte.
    const nouveau = "**Les expressions toutes faites et les clichés.** On emploie le terme technique exact.";
    let r = await C.modifier(db, { site: 2, operations: [{ objet: 'regle', action: 'modifier', cle: '5.1', texte: nouveau }], auteur: 'Claude (connecteur)', origine: 'mcp' });
    assert.equal(r.statut, 'simulation : rien écrit');
    assert.deepEqual(r.sites.map((s) => [s.site_id, s.version_actuelle, s.version_nouvelle]), [[2, 1, 2], [15, 1, 2]]);
    assert.match(r.sites[0].changements[0].avant, /Liste noire de départ/);
    assert.equal((await C.courante(db, 2)).version, 1);
    r = await C.modifier(db, { site: 2, operations: [{ objet: 'regle', action: 'modifier', cle: '5.1', texte: nouveau }], motif: 'consigne du 16/11', auteur: 'Claude (connecteur)', origine: 'mcp', simulation: false });
    assert.deepEqual(r.versions, [{ site_id: 2, version: 2 }, { site_id: 15, version: 2 }]);
    assert.equal((await C.courante(db, 15)).contenu.commun.regles.find((x) => x.cle === '5.1').texte, nouveau);

    // Identité : propre au site ; version attendue dépassée : refus.
    await assert.rejects(C.modifier(db, { site: 15, operations: [{ objet: 'identite', action: 'modifier', texte: 'PixFeed est une agence.' }], auteur: 'marc', version_attendue: 1, simulation: false }), /version attendue v1, version en cours v2/);
    r = await C.modifier(db, { site: 15, operations: [{ objet: 'identite', action: 'modifier', texte: 'PixFeed est une agence.' }, { objet: 'effet', cle: 'markdown', action: 'modifier', valeur: 'avertissement' }], auteur: 'marc', version_attendue: 2, simulation: false });
    assert.deepEqual(r.versions, [{ site_id: 15, version: 3 }]);
    assert.equal((await C.courante(db, 2)).version, 2, 'jurojin inchangé');

    // Listes et seuils (communs) ; exemples (communs) ; erreurs.
    r = await C.modifier(db, { site: 15, operations: [
      { objet: 'liste', liste: 'liste_noire', action: 'ajouter', valeur: 'à la croisée des chemins', texte_simple: true },
      { objet: 'liste', liste: 'liste_noire', action: 'ajouter', valeur: 'blendérien(?:ne)?s?' },
      { objet: 'seuil', cle: 'phrases_par_paragraphe_min', action: 'modifier', valeur: 2.5 },
      { objet: 'exemple', action: 'ajouter', site_id: 15, texte: 'Un troisième exemple.' },
      { objet: 'liste', liste: 'mots_signales', action: 'ajouter', valeur: 'Marc G.' }], auteur: 'marc', simulation: false });
    assert.deepEqual(r.versions, [{ site_id: 2, version: 3 }, { site_id: 15, version: 4 }]);
    j = await C.courante(db, 2);
    assert.ok(j.contenu.commun.controles.liste_noire.includes('à la croisée des chemins'));
    assert.equal(j.contenu.commun.controles.seuils.phrases_par_paragraphe_min, 2.5);
    assert.deepEqual(j.contenu.commun.exemples.map((e) => e.id), ['e1', 'e2', 'e3']);
    assert.deepEqual(j.contenu.site.controles.mots_signales, [], 'liste propre à pixfeed');
    await assert.rejects(C.modifier(db, { site: 2, operations: [{ objet: 'liste', liste: 'liste_noire', action: 'ajouter', valeur: 'ouvre(' }], auteur: 'x' }), /opération 1 : motif invalide/);
    await assert.rejects(C.modifier(db, { site: 2, operations: [{ objet: 'regle', action: 'retirer', cle: '99.9' }], auteur: 'x' }), /règle 99\.9 introuvable/);
    await assert.rejects(C.modifier(db, { site: 2, operations: [{ objet: 'registre', action: 'modifier', valeur: 'tutoiement' }], auteur: 'x' }), /aucun changement/);
    await assert.rejects(C.modifier(db, { site: 2, operations: [{ objet: 'effet', cle: 'cadratin', action: 'modifier', valeur: 'parfois' }], auteur: 'x' }), /bloquant, avertissement, inactif/);
    await assert.rejects(C.modifier(db, { site: 99, operations: [{ objet: 'registre', action: 'modifier', valeur: 'vouvoiement' }], auteur: 'x' }), /aucune charte pour le site 99/);
    r = await C.modifier(db, { site: 2, operations: [{ objet: 'regle', action: 'ajouter', cle: '12.21', texte: 'Nouvelle règle.' }], auteur: 'x' });
    assert.equal(r.sites[0].changements[0].apres, 'Nouvelle règle.');

    // Historique : date, auteur, origine, motif, changements avec l'ancien texte.
    const h = await C.versions(db, 2);
    assert.deepEqual(h.map((v) => v.version), [3, 2, 1]);
    assert.deepEqual([h[1].auteur, h[1].origine, h[1].motif], ['Claude (connecteur)', 'mcp', 'consigne du 16/11']);
    assert.match(h[1].changements[0].avant, /Liste noire de départ/);

    // Retour à la v1 de jurojin : nouvelle version ; la charte commune de la v1 revient aussi sur pixfeed.
    r = await C.retour(db, { site: 2, version: 1, auteur: 'Claude (connecteur)', origine: 'mcp', simulation: false });
    assert.deepEqual(r.versions, [{ site_id: 2, version: 4 }, { site_id: 15, version: 5 }]);
    j = await C.courante(db, 2);
    assert.deepEqual([j.version, j.contenu.commun.regles.find((x) => x.cle === '5.1').texte.slice(0, 50), j.contenu.commun.controles.seuils.phrases_par_paragraphe_min], [4, '**Les expressions toutes faites et les clichés.** ', 3]);
    const p = await C.courante(db, 15);
    assert.deepEqual([p.contenu.site.identite, p.contenu.commun.exemples.length], ['PixFeed est une agence.', 2], 'identité de pixfeed gardée, charte commune revenue');
    assert.equal((await C.versions(db, 2))[0].retour_de, 1);
    await assert.rejects(C.retour(db, { site: 2, version: 4, auteur: 'x', origine: 'interface' }), /déjà la version en cours/);

    // Export Markdown de la version en cours.
    const md = C.exporterMarkdown(j);
    assert.match(md, /^# Charte de rédaction et identité : Jurojin \(jurojin\.net\)/);
    for (const x of ['## Identité', 'Registre : tutoiement.', '### 12. Ce que Google a relevé', '- **12.20**', '## Exemples (charte commune)', '> En juin 2025, Blender Artists', '### Seuils', '- phrases_par_paragraphe_min : 3', "Blanc avant la ponctuation, aperçu rendu : avertissement"]) assert.ok(md.includes(x), x);
  });
});

test('route : interface (session) et connecteur (secret) passent, avec leur origine ; un appel anonyme est refusé', { skip: !hasDb() }, async () => {
  await withSchema('charte_route', async ({ pool }) => {
    const express = require('express');
    const http = require('http');
    const jwt = require('jsonwebtoken');
    await pool.query('CREATE TABLE seo_sites (id INT PRIMARY KEY, domain TEXT)');
    await pool.query("INSERT INTO seo_sites VALUES (2, 'jurojin.net'), (15, 'pixfeed.net')");
    const c = await pool.connect(); try { await ensureCharteTables(c); } finally { c.release(); }
    await C.semerSiAbsente(pool, donnees());
    process.env.OUTILS_MCP_SECRET = 's'.repeat(40);
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'secret-de-test';
    const app = express(); app.use(express.json()); app.locals.db = { pool };
    app.use('/api/charte', require('../routes/charteRoutes'));
    const srv = http.createServer(app); await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
    const base = `http://127.0.0.1:${srv.address().port}/api/charte`;
    const mcp = { 'X-Outils-Secret': 's'.repeat(40), 'Content-Type': 'application/json' };
    const session = { Authorization: `Bearer ${jwt.sign({ id: 1, username: 'marc' }, process.env.JWT_SECRET, { expiresIn: '1h' })}`, 'Content-Type': 'application/json' };
    try {
      assert.equal((await fetch(`${base}/2`)).status, 401);
      let r = await (await fetch(`${base}/2`, { headers: mcp })).json();
      assert.deepEqual([r.version, r.libelles.effets_possibles], [1, ['bloquant', 'avertissement', 'inactif']]);
      r = await fetch(`${base}/2/modifier`, { method: 'POST', headers: mcp, body: JSON.stringify({ operations: [{ objet: 'registre', action: 'modifier', valeur: 'vouvoiement' }], simulation: false }) });
      assert.equal(r.status, 200);
      r = await fetch(`${base}/2/modifier`, { method: 'POST', headers: session, body: JSON.stringify({ operations: [{ objet: 'registre', action: 'modifier', valeur: 'tutoiement' }], simulation: false }) });
      assert.equal(r.status, 200);
      const h = (await (await fetch(`${base}/2/versions`, { headers: session })).json()).versions;
      assert.deepEqual(h.slice(0, 2).map((v) => [v.version, v.auteur, v.origine]), [[3, 'marc', 'interface'], [2, 'Claude (connecteur)', 'mcp']]);
      r = await fetch(`${base}/2/export.md`, { headers: session });
      assert.match(r.headers.get('content-disposition'), /charte-jurojin\.net-v3\.md/);
      assert.match(await r.text(), /Registre : tutoiement\./);
      r = await fetch(`${base}/2/modifier`, { method: 'POST', headers: mcp, body: JSON.stringify({ operations: [{ objet: 'inconnu' }] }) });
      assert.equal(r.status, 400);
    } finally { srv.close(); }
  });
});
