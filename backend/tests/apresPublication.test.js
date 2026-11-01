// Étape 4 (backend) : repointer_liens, poser_etiquettes, modifier_media contre une fausse instance WordPress
// (API REST + routes outils-site/v1 + pages publiques). Base jetable au schéma SEO réel. Aucun appel extérieur.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { hasDb, withSchema } = require('./helpers/db');
const { ensureSeoTables } = require('../scripts/autoInitDatabase');

const opts = { skip: !hasDb() && 'TEST_DATABASE_URL absent' };
process.env.WP_API_USER_15 = 'lecture-seo';
process.env.WP_API_PASSWORD_15 = 'abcd efgh ijkl mnop qrst uvwx';
const AUTH = 'Basic ' + Buffer.from('lecture-seo:abcdefghijklmnopqrstuvwx').toString('base64');
const ap = require('../services/wpBrouillon/apresPublication');

const ANC = '/motion-capture-pour-blender-les-meilleurs-outils-et-addons/';
const NOUV = '/motion-capture-blender/';
let srv, base, W;

function etatInitial() {
  const h = () => base;
  return {
    ecritures: 0,
    nouvelleExiste: true,
    tags: new Map([[1343, 'mocap'], [7, 'Blender']]),
    posts: new Map([
      [10, { id: 10, type: 'post', status: 'publish', slug: 'test-neuron', titre: 'Test Perception Neuron', modifie: '2026-01-01T10:00:00', tags: [7],
        contenu: `<!-- wp:paragraph --><p>Voir <a href="${h()}${ANC}">ce guide <strong>Blender</strong></a> et <a href="${ANC.slice(0, -1)}#addons">les addons</a>.</p><!-- /wp:paragraph -->\n<!-- wp:button {"url":"${h().replace(/\//g, '\\/')}${ANC.replace(/\//g, '\\/')}"} /-->` }],
      [11, { id: 11, type: 'guide', status: 'publish', slug: 'comparatif', titre: 'Comparatif combinaisons', modifie: '2026-02-01T10:00:00', tags: [],
        contenu: `<p>Lire <a class="x" href='${h().replace('http://', '//')}${ANC}'>ici</a>. À ne pas toucher : <a href="${ANC.slice(0, -1)}-2/">suite</a>, <a href="/autre${ANC}">autre</a>, <a href="https://ailleurs.example${ANC}">ailleurs</a>.</p>` }],
      [12, { id: 12, type: 'page', status: 'publish', slug: 'sans-lien', titre: 'Sans lien', modifie: '2026-03-01T10:00:00', tags: [], contenu: '<p>Rien.</p>' }],
      [14, { id: 14, type: 'post', status: 'publish', slug: 'brouteurs', titre: 'Les brouteurs', modifie: '2026-04-01T10:00:00', tags: [],
        contenu: '<!-- wp:heading --><h2 class="wp-block-heading">Sur un site de rencontre</h2><!-- /wp:heading -->\n<!-- wp:paragraph --><p>Le brouteur vous aborde sur un site de rencontre, puis passe sur WhatsApp.</p><!-- /wp:paragraph -->\n<!-- wp:paragraph --><p>Voir <a href="/guide/">un site de rencontre sûr</a> et les sites de rencontres.</p><!-- /wp:paragraph -->' }],
      [15, { id: 15, type: 'post', status: 'publish', slug: 'badoo', titre: 'Badoo', modifie: '2026-04-02T10:00:00', tags: [], contenu: '<p>Badoo.</p>' }],
      [13, { id: 13, type: 'post', status: 'publish', slug: 'avec-image', titre: 'Avec image', modifie: '2026-03-02T10:00:00', tags: [],
        contenu: `<!-- wp:image {"id":500} --><figure class="wp-block-image"><img src="${h()}/wp-content/uploads/2026/01/capture-blender-1024x576.jpg" alt="Ancien alt" class="wp-image-500"/></figure><!-- /wp:image -->` }],
    ]),
    media: new Map([[500, { id: 500, alt_text: 'Ancien alt', caption: { raw: '' }, title: { raw: 'capture-blender' }, description: { raw: '' }, source_url: `${h()}/wp-content/uploads/2026/01/capture-blender.jpg`, mime_type: 'image/jpeg' }]]),
  };
}
const TYPES = { post: 'posts', page: 'pages', guide: 'guides' };
const lien = (p) => `${base}/${p.type === 'guide' ? 'guide-achat/' : ''}${p.slug}/`;

function wpFaux(req, res, corps) {
  const u = new URL(req.url, 'http://x');
  const json = (code, b) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)); };
  // pages publiques
  if (!u.pathname.startsWith('/wp-json/')) {
    if (u.pathname === NOUV && !W.nouvelleExiste) { res.writeHead(404); return res.end('introuvable'); }
    if (u.pathname === NOUV || u.pathname === ANC) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<html><body>page</body></html>'); }
    const p = [...W.posts.values()].find((x) => new URL(lien(x)).pathname === u.pathname);
    if (!p) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(`<html><head><meta property="article:modified_time" content="x"></head><body><p>${p.id === 10 ? 'Mis à jour le 12 janvier 2026' : 'texte'}</p></body></html>`);
  }
  if (req.headers.authorization !== AUTH) return json(401, { code: 'rest_not_logged_in', message: 'non' });
  const p = u.pathname.replace('/wp-json/', '');
  const b = corps ? JSON.parse(corps) : {};
  if (p === 'outils-site/v1/chercher') {
    const motifs = b.motifs || [];
    const contenus = [...W.posts.values()].filter((x) => x.status === 'publish' && motifs.some((m) => x.contenu.includes(m)))
      .map((x) => ({ id: x.id, type: x.type, rest_base: TYPES[x.type], titre: x.titre, lien: lien(x), modifie: x.modifie, contenu: x.contenu }));
    const metas = motifs.some((m) => m.includes('motion-capture-pour-blender')) ? [{ post_id: 99, type: 'post', statut: 'publish', cle: '_wp_old_slug', extrait: 'motion-capture-pour-blender-les-meilleurs-outils-et-addons' }, { post_id: 77, type: 'nav_menu_item', statut: 'publish', cle: '_menu_item_url', extrait: `${base}${ANC}` }] : [];
    return json(200, { motifs, contenus, tronque: false, metas, reglages: metas.length ? ['widget_block'] : [], descriptions_de_termes: [] });
  }
  if (p === 'outils-site/v1/resoudre') {
    const contenus = (b.urls || []).map((url) => {
      const x = [...W.posts.values()].find((y) => lien(y) === url);
      if (!x) return { url, id: null };
      return { url, id: x.id, type: x.type, statut: x.status, titre: x.titre, lien: lien(x), modifie: x.modifie, accepte_etiquettes: x.type !== 'page', etiquettes: x.tags, modifiable: true, rest_base: TYPES[x.type] };
    });
    const medias = (b.medias || []).map((m) => {
      const id = /^\d+$/.test(m) ? Number(m) : /capture-blender/.test(m) ? 500 : null;
      return id && W.media.has(id) ? { media: m, id, url: W.media.get(id).source_url, fichier: '2026/01/capture-blender.jpg', base: 'capture-blender', modifiable: true } : { media: m, id: null };
    });
    return json(200, { contenus, medias });
  }
  if (p === 'outils-site/v1/etiquettes') {
    W.ecritures++;
    const x = W.posts.get(b.id); const avant = [...x.tags];
    x.tags = [...new Set([...x.tags, ...b.ajouter])].filter((t) => !b.retirer.includes(t));
    return json(200, { id: x.id, avant, apres: x.tags, modifie: x.modifie });
  }
  if (p === 'outils-site/v1/verifier') {
    const utilises = {}; for (const x of b.contenu.matchAll(/<!-- wp:([a-z0-9/-]+)/g)) { const n = x[1].includes('/') ? x[1] : `core/${x[1]}`; utilises[n] = (utilises[n] || 0) + 1; }
    return json(200, { blocs: { utilises, inconnus: [] }, shortcodes: { utilises: [], inconnus: [] }, embeds: [], images: [] });
  }
  if (p === 'wp/v2/tags') { const ids = String(u.searchParams.get('include') || '').split(',').map(Number); return json(200, ids.filter((i) => W.tags.has(i)).map((i) => ({ id: i, name: W.tags.get(i), count: 1 }))); }
  let m = /^wp\/v2\/(posts|pages|guides)\/(\d+)$/.exec(p);
  if (m) {
    const x = W.posts.get(Number(m[2]));
    if (req.method === 'POST') { W.ecritures++; x.contenu = b.content; x.modifie = '2026-11-01T12:00:00'; }
    return json(200, { id: x.id, status: x.status, content: { raw: x.contenu }, modified_gmt: x.modifie });
  }
  m = /^wp\/v2\/media\/(\d+)$/.exec(p);
  if (m) {
    const x = W.media.get(Number(m[1]));
    if (req.method === 'POST') { W.ecritures++; if (b.alt_text !== undefined) x.alt_text = b.alt_text; if (b.caption !== undefined) x.caption = { raw: b.caption }; if (b.title !== undefined) x.title = { raw: b.title }; }
    return json(200, x);
  }
  return json(404, { code: 'rest_no_route', message: `route inconnue ${req.method} ${p}` });
}

before(async () => {
  srv = http.createServer((req, res) => { const parts = []; req.on('data', (c) => parts.push(c)); req.on('end', () => wpFaux(req, res, Buffer.concat(parts).toString())); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => srv.close());

async function avecBase(fn) {
  W = etatInitial();
  await withSchema('apres', async ({ pool }) => {
    const c = await pool.connect(); try { await ensureSeoTables(c); } finally { c.release(); }
    await pool.query("INSERT INTO seo_sites (id, domain, wp_base_url) VALUES (15, '127.0.0.1', $1)", [base]);
    await fn({ pool });
  });
}

test('motif d\'adresse : toutes les formes, et rien d\'autre', () => {
  const re = ap.motifAdresse(ANC, 'jurojin.net');
  const ok = [`"https://jurojin.net${ANC}"`, `"https://www.jurojin.net${ANC.slice(0, -1)}"`, `"http://jurojin.net${ANC}#x"`, `'//jurojin.net${ANC}'`, `"${ANC}"`, `"${ANC.slice(0, -1)}?a=1"`, `"https:\\/\\/jurojin.net\\/motion-capture-pour-blender-les-meilleurs-outils-et-addons\\/"`, ` https://jurojin.net${ANC} `];
  const non = [`"${ANC.slice(0, -1)}-2/"`, `"/autre${ANC}"`, `"https://ailleurs.example${ANC}"`, `"https://jurojin.net${ANC}sous-page/"`, `"https://jurojin.net.evil${ANC}"`];
  for (const s of ok) { re.lastIndex = 0; assert.ok(re.test(s), `doit trouver ${s}`); }
  for (const s of non) { re.lastIndex = 0; assert.ok(!re.test(s), `ne doit pas trouver ${s}`); }
  const r = ap.remplacerAdresses(`a "https://www.jurojin.net${ANC}#s" b "${ANC.slice(0, -1)}" c "https:\\/\\/jurojin.net\\/motion-capture-pour-blender-les-meilleurs-outils-et-addons\\/"`, ap.motifAdresse(ANC, 'jurojin.net'), `https://jurojin.net${NOUV}`);
  assert.equal(r.n, 3);
  assert.equal(r.sortie, `a "https://jurojin.net${NOUV}#s" b "${NOUV}" c "https:\\/\\/jurojin.net\\/motion-capture-blender\\/"`);
});

test('repointer_liens : simulation détaillée, ancres, métadonnées signalées, puis écriture et journal', opts, async () => {
  await avecBase(async (db) => {
    const ancres = { [`${base}/test-neuron/`]: 'motion capture dans Blender', [`${base}/guide-achat/comparatif/`]: 'Motion capture dans Blender : importer, retargeter et nettoyer sans patiner' };
    const args = { site_id: 15, ancienne_url: `${base}${ANC}`, nouvelle_url: `${base}${NOUV}`, ancres };
    const sim = await ap.repointerLiens(db, args);
    assert.equal(sim.statut, 'simulation : rien écrit', JSON.stringify(sim.erreurs));
    assert.equal(W.ecritures, 0);
    assert.deepEqual(sim.pages.map((p) => p.id).sort(), [10, 11]);
    const p10 = sim.pages.find((p) => p.id === 10), p11 = sim.pages.find((p) => p.id === 11);
    assert.equal(p10.occurrences, 3, 'absolue, relative sans barre (avec #), JSON échappée');
    assert.equal(p11.occurrences, 1, 'seule //hôte ; -2/, /autre/ et un autre domaine ignorés');
    assert.equal(p10.ancres.length, 2); assert.equal(p10.ancres[0].avant, 'ce guide Blender');
    assert.ok(p10.extraits[0].avant.includes(ANC) && p10.extraits[0].apres.includes(NOUV));
    assert.match(p10.date_modification.page, /visible.*Mis à jour le 12/);
    assert.match(p11.date_modification.page, /pas de date de mise à jour visible.*article:modified_time/);
    assert.ok(sim.metadonnees.some((x) => x.cle === '_wp_old_slug' && /attendue/.test(x.note)));
    assert.ok(sim.metadonnees.some((x) => x.cle === '_menu_item_url'));
    assert.ok(sim.avertissements.some((a) => a.source === 'réglages'));
    // nouvelle adresse absente : bloqué, rapport complet quand même
    W.nouvelleExiste = false;
    const bloque = await ap.repointerLiens(db, args);
    assert.equal(bloque.statut, 'bloqué'); assert.ok(bloque.erreurs.some((e) => /n'existe pas encore/.test(e.message)));
    assert.equal(bloque.pages.length, 2);
    W.nouvelleExiste = true;
    // ancre demandée sur une page sans lien vers l'ancienne adresse
    const mauvaise = await ap.repointerLiens(db, { ...args, ancres: { [`${base}/sans-lien/`]: 'x' } });
    assert.ok(mauvaise.erreurs.some((e) => e.source === 'ancres'));
    // écriture
    const ec = await ap.repointerLiens(db, { ...args, simulation: false });
    assert.equal(ec.statut, 'écrit', JSON.stringify(ec.erreurs));
    assert.ok(!W.posts.get(10).contenu.includes('motion-capture-pour-blender'));
    assert.ok(W.posts.get(10).contenu.includes(`<a href="${base}${NOUV}">motion capture dans Blender</a>`));
    assert.ok(W.posts.get(10).contenu.includes(`${NOUV.slice(0, -1)}/#addons`) || W.posts.get(10).contenu.includes(`${NOUV}#addons`));
    assert.ok(W.posts.get(11).contenu.includes(`>Motion capture dans Blender : importer, retargeter et nettoyer sans patiner</a>`));
    assert.ok(W.posts.get(11).contenu.includes(`${ANC.slice(0, -1)}-2/`), 'adresse voisine intacte');
    const { rows } = await db.pool.query("SELECT post_id, avant->>'content' AS avant FROM seo_wp_journal WHERE mode = 'liens' ORDER BY post_id");
    assert.deepEqual(rows.map((r) => Number(r.post_id)), [10, 11]);
    assert.ok(rows[0].avant.includes(ANC), "l'état d'avant est gardé");
    // second appel : plus rien à faire
    const re2 = await ap.repointerLiens(db, { ...args, ancres: {}, simulation: false });
    assert.equal(re2.pages.length, 0);
  });
});

test('poser_etiquettes : étiquettes existantes seulement, type contrôlé, sans réenregistrer', opts, async () => {
  await avecBase(async (db) => {
    const urls = [`${base}/test-neuron/`, `${base}/guide-achat/comparatif/`];
    const sim = await ap.poserEtiquettes(db, { site_id: 15, urls, ajouter: [1343] });
    assert.equal(sim.statut, 'simulation : rien écrit', JSON.stringify(sim.erreurs));
    assert.deepEqual(sim.contenus.map((c) => c.changement), ['+ mocap', '+ mocap']);
    assert.deepEqual(sim.contenus[0].avant, ['Blender']); assert.deepEqual(sim.contenus[0].apres, ['Blender', 'mocap']);
    assert.equal(W.ecritures, 0);
    const inexistante = await ap.poserEtiquettes(db, { site_id: 15, urls, ajouter: [9999] });
    assert.ok(inexistante.erreurs.some((e) => /n'existe pas/.test(e.message)));
    const page = await ap.poserEtiquettes(db, { site_id: 15, urls: [`${base}/sans-lien/`], ajouter: [1343] });
    assert.ok(page.erreurs.some((e) => /n'accepte pas les étiquettes/.test(e.message)));
    const inconnue = await ap.poserEtiquettes(db, { site_id: 15, urls: [`${base}/nulle-part/`], ajouter: [1343] });
    assert.ok(inconnue.erreurs.some((e) => /aucun contenu/.test(e.message)));
    const ec = await ap.poserEtiquettes(db, { site_id: 15, urls, ajouter: [1343], retirer: [7], simulation: false });
    assert.equal(ec.statut, 'écrit', JSON.stringify(ec.erreurs));
    assert.deepEqual(W.posts.get(10).tags, [1343]); assert.deepEqual(W.posts.get(11).tags, [1343]);
    assert.equal(ec.contenus[0].date_modification, 'inchangée');
    const again = await ap.poserEtiquettes(db, { site_id: 15, urls, ajouter: [1343] });
    assert.deepEqual(again.contenus.map((c) => c.changement), ['déjà en place', 'déjà en place']);
  });
});

test('modifier_media : par adresse d\'une taille générée, alt en dur signalé, écriture vérifiée', opts, async () => {
  await avecBase(async (db) => {
    const sim = await ap.modifierMedia(db, { site_id: 15, media: `${base}/wp-content/uploads/2026/01/capture-blender-1024x576.jpg`, alt: 'Nouvel alt', legende: 'Une légende' });
    assert.equal(sim.statut, 'simulation : rien écrit', JSON.stringify(sim.erreurs));
    assert.equal(sim.media.id, 500);
    assert.deepEqual(sim.champs.alt, { avant: 'Ancien alt', apres: 'Nouvel alt', change: true });
    assert.equal(sim.insertions.length, 1); assert.equal(sim.insertions[0].id, 13); assert.equal(sim.insertions[0].ancien_alt_en_dur, true);
    assert.ok(sim.avertissements.some((a) => a.source === 'alt'));
    assert.equal(W.ecritures, 0);
    const vide = await ap.modifierMedia(db, { site_id: 15, media: 500 });
    assert.ok(vide.erreurs.some((e) => e.source === 'champs'));
    const ailleurs = await ap.modifierMedia(db, { site_id: 15, media: 'https://ailleurs.example/x.jpg', alt: 'x' });
    assert.ok(ailleurs.erreurs.some((e) => e.source === 'media'));
    const ec = await ap.modifierMedia(db, { site_id: 15, media: 500, alt: 'Nouvel alt', simulation: false });
    assert.equal(ec.statut, 'écrit', JSON.stringify(ec.erreurs));
    assert.equal(W.media.get(500).alt_text, 'Nouvel alt');
    assert.ok(W.posts.get(13).contenu.includes('alt="Ancien alt"'), 'le contenu n\'est jamais modifié');
    const { rows } = await db.pool.query("SELECT avant, apres FROM seo_wp_journal WHERE mode = 'media'");
    assert.deepEqual(rows[0].avant, { alt: 'Ancien alt' }); assert.deepEqual(rows[0].apres, { alt: 'Nouvel alt' });
  });
});

test('poser_lien : passage unique du texte visible, refus motivés, écriture limitée au passage', opts, async () => {
  await avecBase(async (db) => {
    const page = `${base}/brouteurs/`, cible = `${base}/badoo/`;
    const sim = await ap.poserLien(db, { site_id: 15, url: page, texte: 'un site de rencontre', cible });
    assert.equal(sim.statut, 'simulation : rien écrit', JSON.stringify(sim.erreurs));
    assert.equal(W.ecritures, 0);
    assert.deepEqual(sim.occurrences.map((o) => o.ecartee || 'retenue'), ['dans un titre', 'retenue', 'dans un lien existant']);
    assert.ok(sim.extrait.apres.includes(`<a href="${cible}">un site de rencontre</a>, puis`));
    assert.equal(sim.extrait.bloc, 'core/paragraph');
    assert.match(sim.date_modification.wordpress, /2026-04-01/);
    // refus : texte en double, cible absente, cible déjà liée, texte introuvable
    const double = await ap.poserLien(db, { site_id: 15, url: page, texte: 'sur', cible });
    assert.ok(double.erreurs.some((e) => /2 fois dans le texte visible/.test(e.message)), JSON.stringify(double.erreurs));
    const absente = await ap.poserLien(db, { site_id: 15, url: page, texte: 'un site de rencontre', cible: `${base}/nulle-part/` });
    assert.ok(absente.erreurs.some((e) => /n'existe pas/.test(e.message)));
    const deja = await ap.poserLien(db, { site_id: 15, url: page, texte: 'un site de rencontre', cible: `${base}/guide/` });
    assert.ok(deja.erreurs.some((e) => /pointe déjà/.test(e.message)));
    const rien = await ap.poserLien(db, { site_id: 15, url: page, texte: 'Un Site', cible });
    assert.ok(rien.erreurs.some((e) => /introuvable tel quel/.test(e.message)));
    assert.equal(W.ecritures, 0);
    // écriture : seul le passage change ; second appel refusé (la page pointe déjà vers la cible)
    const avant = W.posts.get(14).contenu;
    const ec = await ap.poserLien(db, { site_id: 15, url: page, texte: 'un site de rencontre', cible, simulation: false });
    assert.equal(ec.statut, 'écrit', JSON.stringify(ec.erreurs));
    assert.equal(W.posts.get(14).contenu, avant.replace('aborde sur un site de rencontre,', `aborde sur <a href="${cible}">un site de rencontre</a>,`));
    const { rows } = await db.pool.query("SELECT post_id FROM seo_wp_journal WHERE mode = 'lien'");
    assert.deepEqual(rows.map((x) => Number(x.post_id)), [14]);
    const encore = await ap.poserLien(db, { site_id: 15, url: page, texte: 'un site de rencontre', cible, simulation: false });
    assert.ok(encore.erreurs.some((e) => /pointe déjà/.test(e.message)));
  });
});
