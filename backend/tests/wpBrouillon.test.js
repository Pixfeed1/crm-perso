// prepare_draft (backend) : dépôts (lien unique, zip piégé refusé) et préparation d'un brouillon contre une
// fausse instance WordPress. Base jetable au schéma SEO réel (ensureSeoTables). Aucun appel extérieur.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { hasDb, withSchema } = require('./helpers/db');
const { ensureSeoTables } = require('../scripts/autoInitDatabase');

const opts = { skip: !hasDb() && 'TEST_DATABASE_URL absent' };
const ESSAI = path.join(__dirname, '..', '..', 'mcp_seo', 'test', 'brouillon-essai');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wpb-'));
process.env.WP_DEPOTS_DIR = path.join(TMP, 'depots');
process.env.WP_API_USER_15 = 'lecture-seo';
process.env.WP_API_PASSWORD_15 = 'abcd efgh ijkl mnop qrst uvwx';
const AUTH = 'Basic ' + Buffer.from('lecture-seo:abcdefghijklmnopqrstuvwx').toString('base64');

const depots = require('../services/wpBrouillon/depot');
const { preparer } = require('../services/wpBrouillon/preparer');
const relecture = require('../services/wpBrouillon/relecture');
// relecteur factice par défaut : aucune correction (les tests de la relecture le remplacent)
let appelsRelecture = 0;
const relecteurVide = async () => { appelsRelecture++; return { corrections: [], signalements: [], affirmations: { relevees: 0 }, resume: 'rien à corriger' }; };
relecture.definirAppel(relecteurVide);

// ---- fausse instance WordPress ----
const W = { posts: new Map(), media: new Map(), sha: new Map(), tags: new Map([[7, 'Blender']]), ecritures: 0, prochain: 100, limite: 2 * 1024 * 1024 };
let srv, base;
const ENREGISTRES = new Set(['core/paragraph', 'core/heading', 'core/gallery', 'core/image', 'core/columns', 'core/column', 'core/buttons', 'core/button', 'core/video', 'core/audio', 'core/file', 'core/embed']);
function wpFaux(req, res, corps) {
  const u = new URL(req.url, 'http://x');
  const json = (code, b) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)); };
  if (req.headers.authorization !== AUTH) return json(401, { code: 'rest_not_logged_in', message: 'non' });
  const p = u.pathname.replace('/wp-json/', '');
  const ecrit = () => { W.ecritures++; };
  if (p === 'outils-site/v1/inventaire') return json(200, {
    releve_le: 'x', types: [{ type: 'post', rest_base: 'posts', nom: 'Articles', taxonomies: ['category', 'post_tag'], supports: ['title'], modeles: [], acf: [] }],
    taxonomies: [{ taxonomie: 'category', rest_base: 'categories' }, { taxonomie: 'post_tag', rest_base: 'tags' }],
    auteurs: [{ id: 1, identifiant: 'marc', nom: 'Marc' }, { id: 9, identifiant: 'lecture-seo', nom: 'Lecture SEO' }],
    types_fichiers: { 'jpg|jpeg|jpe': 'image/jpeg', 'mp4|m4v': 'video/mp4', 'mp3|m4a|m4b': 'audio/mpeg', pdf: 'application/pdf' },
    limite_envoi: W.limite, yoast_actif: true, rewrite_republish: false,
  });
  if (p === 'wp/v2/posts' && req.method === 'OPTIONS') return json(200, { schema: { properties: { title: {}, content: {}, slug: {}, status: {}, author: {}, excerpt: {}, comment_status: {}, categories: {}, tags: {}, featured_media: {}, meta: { properties: {} }, outils_yoast: {} } } });
  // Comme WordPress : « include » vide = filtre ignoré, tous les termes reviennent.
  if (p === 'wp/v2/categories') { const inc = String(u.searchParams.get('include') || ''); const ids = inc ? inc.split(',').map(Number) : [1, 5]; return json(200, ids.filter((i) => [1, 5].includes(i)).map((i) => ({ id: i, name: `Cat ${i}` }))); }
  if (p === 'wp/v2/tags' && req.method === 'GET') { const q = String(u.searchParams.get('search') || '').toLowerCase(); return json(200, [...W.tags].filter(([, n]) => n.toLowerCase().includes(q)).map(([id, name]) => ({ id, name }))); }
  if (p === 'wp/v2/tags' && req.method === 'POST') { ecrit(); const id = W.prochain++; W.tags.set(id, JSON.parse(corps).name); return json(201, { id }); }
  if (p === 'outils-site/v1/media-empreinte') { const id = W.sha.get(u.searchParams.get('sha')); return json(200, id ? { id, url: W.media.get(id).source_url } : { id: null }); }
  if (p === 'outils-site/v1/verifier') {
    const c = JSON.parse(corps).contenu;
    const noms = [...c.matchAll(/<!-- wp:([a-z0-9/-]+)/g)].map((x) => (x[1].includes('/') ? x[1] : `core/${x[1]}`));
    const utilises = {}; for (const n of noms) utilises[n] = (utilises[n] || 0) + 1;
    const images = [...c.matchAll(/<!-- wp:image[^>]*-->\s*<figure[^>]*>([\s\S]*?)<\/figure>/g)].map((x) => ({ alt: /alt="[^"]+"/.test(x[1]), legende: /<figcaption/.test(x[1]) }));
    const embeds = [...c.matchAll(/<!-- wp:embed \{"url":"([^"]+)"/g)].map((x) => ({ url: x[1], fournisseur: /youtube|vimeo/.test(x[1]) ? 'ok' : null }));
    return json(200, { blocs: { utilises, inconnus: Object.keys(utilises).filter((n) => !ENREGISTRES.has(n)) }, shortcodes: { utilises: [], inconnus: [...c.matchAll(/\[([a-z_]+)\]/g)].map((x) => x[1]) }, embeds, images });
  }
  if (p === 'wp/v2/media' && req.method === 'POST') {
    ecrit(); const id = W.prochain++; const nom = decodeURIComponent(/filename="([^"]+)"/.exec(req.headers['content-disposition'])[1]);
    const image = /^image\//.test(req.headers['content-type']);
    W.media.set(id, { id, source_url: `${base}/wp-content/uploads/${nom}`, octets: corps.length, media_details: image ? { sizes: { large: { source_url: `${base}/wp-content/uploads/large-${nom}` } } } : {} });
    return json(201, W.media.get(id));
  }
  let m = /^wp\/v2\/media\/(\d+)$/.exec(p);
  if (m) { const x = W.media.get(Number(m[1])); if (req.method === 'POST') { ecrit(); const b = JSON.parse(corps); Object.assign(x, b); if (b.meta && b.meta.outils_sha256) W.sha.set(b.meta.outils_sha256, x.id); } return json(200, x); }
  if (p === 'wp/v2/posts' && req.method === 'GET') {
    const slug = u.searchParams.get('slug');
    return json(200, [...W.posts.values()].filter((x) => x.slug === slug && (u.searchParams.get('status') !== 'publish' || x.status === 'publish')));
  }
  m = /^wp\/v2\/posts(?:\/(\d+))?$/.exec(p);
  if (m && req.method === 'POST') {
    ecrit(); const b = JSON.parse(corps); const id = m[1] ? Number(m[1]) : W.prochain++;
    const x = { ...(W.posts.get(id) || { id, status: 'draft' }), ...b, id };
    x.link = `${base}/${x.slug || '?p=' + id}/`; W.posts.set(id, x); return json(m[1] ? 200 : 201, x);
  }
  if (m && req.method === 'GET') { const x = W.posts.get(Number(m[1])); return x ? json(200, x) : json(404, { code: 'rest_post_invalid_id', message: 'non' }); }
  if (p === 'outils-site/v1/copie-de-travail') { ecrit(); const b = JSON.parse(corps); const id = W.prochain++; W.posts.set(id, { id, status: 'draft', copie_de: b.original, slug_voulu: b.slug }); return json(200, { id, original: b.original, methode: 'copie_outils' }); }
  return json(404, { code: 'rest_no_route', message: `route inconnue ${req.method} ${p}` });
}

before(async () => {
  srv = http.createServer((req, res) => { const parts = []; req.on('data', (c) => parts.push(c)); req.on('end', () => { const b = Buffer.concat(parts); wpFaux(req, res, /json/.test(req.headers['content-type'] || '') ? b.toString() : b); }); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(() => { srv.close(); fs.rmSync(TMP, { recursive: true, force: true }); });

/** Zip du dossier d'essai, éventuellement modifié (fichiers remplacés ou ajoutés). */
function zipEssai(modifs = {}) {
  const dir = fs.mkdtempSync(path.join(TMP, 'lot-'));
  fs.cpSync(ESSAI, dir, { recursive: true });
  for (const [f, contenu] of Object.entries(modifs)) fs.writeFileSync(path.join(dir, f), typeof contenu === 'string' ? contenu : JSON.stringify(contenu));
  const zip = path.join(TMP, `${path.basename(dir)}.zip`);
  execFileSync('zip', ['-qr', '-X', zip, '.'], { cwd: dir });
  return zip;
}
const multerFichier = (zip) => [{ fieldname: 'lot', originalname: 'lot.zip', path: zip, size: fs.statSync(zip).size }];
const manifeste = () => JSON.parse(fs.readFileSync(path.join(ESSAI, 'manifeste-wp.json'), 'utf8'));
async function nouveauDepot(db, modifs) {
  const d = await depots.creer(db, 15);
  await depots.recevoir(db, d.jeton, multerFichier(zipEssai(modifs)));
  return d;
}

async function avecBase(fn) {
  await withSchema('wpbrouillon', async ({ pool }) => {
    const c = await pool.connect(); try { await ensureSeoTables(c); } finally { c.release(); }
    await pool.query("INSERT INTO seo_sites (id, domain, wp_base_url, wp_auteur) VALUES (15, '127.0.0.1', $1, 'marc')", [base]);
    await fn({ pool });
  });
}

test('dépôt : zip reçu, lien à usage unique, lien expiré, zip piégé et lien symbolique refusés', opts, async () => {
  await avecBase(async (db) => {
    const d = await depots.creer(db, 15);
    assert.match(d.jeton, /^[A-Za-z0-9_-]{40,}$/);
    const r = await depots.recevoir(db, d.jeton, multerFichier(zipEssai()));
    assert.equal(r.manifeste, true); assert.equal(r.fichiers, 8);
    await assert.rejects(depots.recevoir(db, d.jeton, multerFichier(zipEssai())), (e) => e.status === 410, 'un seul envoi par lien');
    const { rows } = await db.pool.query('SELECT jeton_hash FROM seo_wp_depots WHERE id = $1', [d.depot]);
    assert.notEqual(rows[0].jeton_hash, d.jeton, 'le jeton n\'est jamais stocké en clair');
    // expiré
    const d2 = await depots.creer(db, 15);
    await db.pool.query("UPDATE seo_wp_depots SET expire_le = NOW() - interval '1 minute' WHERE id = $1", [d2.depot]);
    await assert.rejects(depots.recevoir(db, d2.jeton, multerFichier(zipEssai())), (e) => e.status === 410);
    // zip piégé (../) et lien symbolique : refusés, dossier vidé
    for (const [nom, script] of [['remonte', "z.writestr('../../evil.txt','x')"], ['lien', "i=zipfile.ZipInfo('lien');i.external_attr=(0o120777<<16);z.writestr(i,'/etc/passwd')"]]) {
      const zp = path.join(TMP, `${nom}.zip`);
      execFileSync('python3', ['-I', '-c', `import zipfile\nz=zipfile.ZipFile('${zp}','w')\nz.writestr('manifeste-wp.json','{}')\n${script.replace(/;/g, '\n')}\nz.close()`]);
      const d3 = await depots.creer(db, 15);
      await assert.rejects(depots.recevoir(db, d3.jeton, multerFichier(zp)), /refusé/);
      assert.ok(!fs.existsSync(depots.dossierDe(d3.depot)), 'dossier du dépôt raté supprimé');
    }
    assert.ok(!fs.existsSync(path.join(TMP, 'evil.txt')) && !fs.existsSync(path.join(process.env.WP_DEPOTS_DIR, 'evil.txt')));
  });
});

test('simulation : plan complet, aucune écriture dans WordPress', opts, async () => {
  await avecBase(async (db) => {
    const d = await nouveauDepot(db);
    const avant = W.ecritures;
    const r = await preparer(db, { depot: d.depot, simulation: true });
    assert.deepEqual(r.erreurs, []);
    assert.equal(r.statut, 'simulation : rien écrit');
    assert.equal(W.ecritures, avant, 'aucune écriture');
    assert.equal(r.actions.filter((a) => a.quoi === 'téléverser').length, 6);
    assert.ok(r.actions.some((a) => a.quoi === 'créer un brouillon'));
    assert.ok(r.blocs['core/gallery'] && r.blocs['core/embed'] === 2);
    assert.ok(r.integrations.every((i) => i.fournisseur !== 'aucun'));
  });
});

test('taxonomie vide : les cases sont décochées, aucun terme posé (bug « 34 plateformes »)', opts, async () => {
  await avecBase(async (db) => {
    const m = manifeste();
    m.taxonomies = { category: [] };
    const d = await nouveauDepot(db, { 'manifeste-wp.json': m });
    const r = await preparer(db, { depot: d.depot, simulation: true });
    assert.deepEqual(r.erreurs, []);
    const a = r.actions.find((x) => x.quoi === 'taxonomie' && x.taxonomie === 'category');
    assert.deepEqual(a.termes, []); assert.equal(a.vider, true);
  });
});

test('erreurs bloquantes : bloc, alt, Yoast, taxonomie, marqueur, poids, statut, auteur', opts, async () => {
  await avecBase(async (db) => {
    const m = manifeste();
    m.fichiers[1].alt = '';
    m.yoast.titre = 'x'.repeat(61); m.yoast.meta = 'y'.repeat(136);
    m.taxonomies = { category: [5, 999] };
    m.champs.status = 'publish';
    m.fichiers.push({ fichier: 'media/lourd.mp4', titre: 'trop lourd' });
    const contenu = fs.readFileSync(path.join(ESSAI, 'contenu.html'), 'utf8') + '\n<!-- wp:inexistant/bloc /-->\n<p>{{media:images/absente.jpg:url}}</p>';
    const d = await depots.creer(db, 15);
    const dir = fs.mkdtempSync(path.join(TMP, 'err-')); fs.cpSync(ESSAI, dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'manifeste-wp.json'), JSON.stringify(m)); fs.writeFileSync(path.join(dir, 'contenu.html'), contenu);
    fs.writeFileSync(path.join(dir, 'media', 'lourd.mp4'), Buffer.alloc(W.limite + 1));
    const zip = path.join(TMP, 'err.zip'); execFileSync('zip', ['-qr', zip, '.'], { cwd: dir });
    await depots.recevoir(db, d.jeton, multerFichier(zip));
    const r = await preparer(db, { depot: d.depot, simulation: false });
    const msgs = r.erreurs.map((e) => `${e.source} : ${e.message}`).join('\n');
    for (const attendu of [/inexistant\/bloc/, /vue-2\.jpg : texte alternatif/, /titre SEO de 61/, /méta de 136/, /inexistant\(s\) 999/, /images\/absente\.jpg.*non déclaré/, /lourd\.mp4 : .*limite d'envoi du serveur \(2\.0 Mo\)/, /« status » est hors de portée/]) assert.match(msgs, attendu);
    assert.equal(r.statut, 'bloqué');
    await db.pool.query('UPDATE seo_sites SET wp_auteur = NULL WHERE id = 15');
    const r2 = await preparer(db, { depot: d.depot });
    assert.ok(r2.erreurs.some((e) => e.source === 'auteur'));
  });
});

test('écriture, puis second appel identique : même brouillon, aucun fichier en double, journal', opts, async () => {
  await avecBase(async (db) => {
    const d = await nouveauDepot(db);
    const r = await preparer(db, { depot: d.depot, simulation: false });
    assert.deepEqual(r.erreurs, [], JSON.stringify(r.erreurs));
    const post = W.posts.get(r.id);
    assert.equal(post.status, 'draft'); assert.equal(post.author, 1, "signé par l'auteur du site, pas par lecture-seo");
    assert.ok(!post.content.includes('{{media:'), 'tous les marqueurs remplacés');
    assert.match(post.content, /wp-content\/uploads\/large-vue-1\.jpg/);
    assert.equal(post.featured_media, r.fichiers.find((f) => f.fichier === 'images/vue-1.jpg').id);
    assert.equal(post.outils_yoast.og_image_id, post.featured_media);
    assert.equal(r.fichiers.length, 6);
    assert.ok(r.lien_apercu.includes(`p=${r.id}`) && r.lien_edition.includes(`post=${r.id}`));
    const nbMedias = W.media.size;
    const r2 = await preparer(db, { depot: d.depot, simulation: false });
    assert.equal(r2.id, r.id, 'même brouillon');
    assert.equal(W.media.size, nbMedias, 'aucun fichier en double');
    assert.ok(r2.fichiers.every((f) => f.reutilise));
    const { rows } = await db.pool.query('SELECT post_id FROM seo_wp_journal WHERE site_id = 15 AND simulation = false');
    assert.equal(rows.length, 2);
  });
});

test('mise à jour en simulation : copie de travail prévue, rien écrit', opts, async () => {
  await avecBase(async (db) => {
    W.posts.set(50, { id: 50, status: 'publish', slug: 'motion-capture-blender', link: `${base}/motion-capture-blender/`, title: { raw: 'Mocap' }, content: { raw: '<p>ancien</p>' } });
    const m = manifeste(); m.mode = 'mise_a_jour'; m.url_origine = `${base}/motion-capture-blender/`; m.slug = 'motion-capture-blender';
    const d = await nouveauDepot(db, { 'manifeste-wp.json': m });
    const avant = W.ecritures;
    const r = await preparer(db, { depot: d.depot, simulation: true });
    assert.deepEqual(r.erreurs, [], JSON.stringify(r.erreurs));
    assert.ok(r.actions.some((a) => /copie de travail de #50/.test(a.quoi)));
    assert.equal(W.ecritures, avant);
    assert.equal(W.posts.get(50).content.raw, '<p>ancien</p>');
  });
});

test('relecture : règles d\'application (unique, hors balises, source exigée pour un fait, champ présent)', () => {
  const champs = { titre: 'Le guide 2025', titre_seo: undefined, meta: 'Une méta.', contenu: '<!-- wp:paragraph --><p>Blender 3.6 gère le mocap. Le guide 2025 est complet.</p><!-- /wp:paragraph --><p class="guide">x</p>' };
  const { champs: c, appliquees, non_appliquees: non } = relecture.appliquer(champs, [
    { type: 'fait', champ: 'contenu', avant: 'Blender 3.6', apres: 'Blender 4.2', source: 'https://www.blender.org/download/releases/4-2/' },
    { type: 'fait', champ: 'contenu', avant: 'gère le mocap', apres: 'gère tout', source: '' },
    { type: 'langue', champ: 'titre', avant: '2025', apres: '2026' },
    { type: 'langue', champ: 'contenu', avant: 'guide', apres: 'Guide' },
    { type: 'langue', champ: 'contenu', avant: 'wp:paragraph', apres: 'wp:heading' },
    { type: 'langue', champ: 'titre_seo', avant: 'x', apres: 'y' },
    { type: 'retrait', champ: 'contenu', avant: 'complet.</p>', apres: 'complet.' },
    { type: 'langue', champ: 'meta', avant: 'Une méta.', apres: 'Une méta corrigée.' },
  ]);
  assert.deepEqual(appliquees.map((x) => x.avant), ['Blender 3.6', '2025', 'Une méta.']);
  assert.equal(c.contenu.includes('Blender 4.2 gère le mocap'), true);
  assert.equal(c.titre, 'Le guide 2026'); assert.equal(c.meta, 'Une méta corrigée.');
  const pourquoi = Object.fromEntries(non.map((x) => [x.avant, x.pourquoi]));
  assert.match(pourquoi['gère le mocap'], /sans source/);
  assert.match(pourquoi.guide, /2 fois/);
  assert.match(pourquoi['wp:paragraph'], /balise|présent/);
  assert.match(pourquoi.x, /champ absent/);
  assert.match(pourquoi['complet.</p>'], /balise/);
});

test('relecture dans prepare_draft : corrections appliquées au brouillon, une seule relecture, échec bloquant, désactivable', opts, async () => {
  await avecBase(async (db) => {
    let appels = 0;
    relecture.definirAppel(async ({ champs }) => {
      appels++;
      assert.ok(champs.contenu.includes('prepare_draft') && champs.titre_seo === 'Essai de brouillon préparé par Claude');
      return {
        corrections: [
          { type: 'langue', champ: 'contenu', avant: 'il sera supprimé après vérification', apres: 'il sera supprimé après la vérification' },
          { type: 'retrait', champ: 'contenu', avant: 'Il montre chaque type de bloc demandé ; ', apres: '', raison: 'invérifiable' },
          { type: 'coherence', champ: 'titre_seo', avant: 'Essai de brouillon', apres: 'Essai du brouillon' },
          { type: 'fait', champ: 'meta', avant: 'galerie', apres: 'galerie photo', source: 'https://exemple.org/source' },
        ],
        signalements: [{ type: 'style', extrait: 'Galerie', remarque: 'titre court' }],
        affirmations: { relevees: 3, confirmees: 1, corrigees: 1, retirees: 1 }, resume: 'deux corrections', modele: 'faux',
      };
    });
    try {
      const d = await nouveauDepot(db, { 'manifeste-wp.json': { ...manifeste(), slug: 'essai-relecture' } });
      const sim = await preparer(db, { depot: d.depot, simulation: true });
      assert.deepEqual(sim.erreurs, [], JSON.stringify(sim.erreurs));
      assert.equal(sim.relecture.corrections_appliquees.length, 4);
      assert.equal(sim.relecture.signalements.length, 1);
      assert.ok(sim.avertissements.some((a) => a.source === 'relecture'));
      const ec = await preparer(db, { depot: d.depot, simulation: false });
      assert.equal(appels, 1, 'la simulation et l\'écriture partagent la même relecture');
      assert.equal(ec.relecture.reprise_du_resultat_precedent, true);
      const post = W.posts.get(ec.id);
      assert.ok(post.content.includes('il sera supprimé après la vérification'));
      assert.ok(!post.content.includes('Il montre chaque type de bloc demandé'));
      assert.equal(post.outils_yoast.titre, 'Essai du brouillon préparé par Claude');
      assert.match(post.outils_yoast.meta, /galerie photo/);
      // échec du relecteur : bloqué, rien écrit ; relecture=false : préparé avec un avertissement
      relecture.definirAppel(async () => { throw new Error('API indisponible'); });
      const d2 = await nouveauDepot(db, { 'manifeste-wp.json': { ...manifeste(), slug: 'essai-relecture-2' }, 'contenu.html': fs.readFileSync(path.join(ESSAI, 'contenu.html'), 'utf8') + '\n<!-- wp:paragraph --><p>Autre.</p><!-- /wp:paragraph -->' });
      const avant = W.ecritures;
      const ko = await preparer(db, { depot: d2.depot, simulation: false });
      assert.equal(ko.statut, 'bloqué'); assert.match(ko.erreurs[0].message, /relecture impossible : API indisponible/);
      assert.equal(W.ecritures, avant);
      const sans = await preparer(db, { depot: d2.depot, simulation: true, relecture: false });
      assert.deepEqual(sans.erreurs, []); assert.ok(sans.avertissements.some((a) => /relecture désactivée/.test(a.message)));
    } finally { relecture.definirAppel(relecteurVide); }
  });
});
