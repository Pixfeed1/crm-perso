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
  if (p === 'wp/v2/categories') { const ids = String(u.searchParams.get('include') || '').split(',').map(Number); return json(200, ids.filter((i) => [1, 5].includes(i)).map((i) => ({ id: i, name: `Cat ${i}` }))); }
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
