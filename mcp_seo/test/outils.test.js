// get_page_dossier, check_urls, get_site_resources : base PostgreSQL jetable au schéma RÉEL du CRM
// (ensureSeoTables du backend) et fausse instance WordPress locale. Aucun appel extérieur.
// Lancer avec MCP_PGTEST=postgres://postgres@127.0.0.1:55432 (sinon ignoré).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import pg from 'pg';

const URL_PG = process.env.MCP_PGTEST;
const opts = { skip: !URL_PG && 'MCP_PGTEST absent' };
const require = createRequire(import.meta.url);
const USER = 'lecture-seo', PASS = 'abcd efgh ijkl mnop qrst uvwx';
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS.replace(/\s+/g, '')}`).toString('base64');
let srv, base, ext, pool, admin;

before(async () => {
  if (!URL_PG) return;
  srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const json = (code, body, h = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...h }); res.end(JSON.stringify(body)); };
    const html = (code, body, h = {}) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', ...h }); res.end(body); };
    const auth = req.headers.authorization === AUTH;
    // route de lecture (mu-plugin)
    if (u.pathname === '/wp-json/outils-site/v1/inventaire') {
      if (!auth) return json(401, { code: 'rest_forbidden', message: 'non' });
      return json(200, { releve_le: 'x', types: [], taxonomies: [], blocs: [{ nom: 'core/image', titre: 'Image', attributs: ['id', 'url', 'alt'] }, { nom: 'core/gallery', titre: 'Galerie', attributs: ['images'] }], compositions: [{ nom: 'theme/hero', titre: 'Hero' }], reutilisables: [], types_fichiers: { 'jpg|jpeg': 'image/jpeg' }, limite_envoi: 1048576 });
    }
    if (u.pathname === '/wp-json/outils-site/v1/ressources') {
      if (!auth) return json(401, { code: 'rest_forbidden', message: 'Désolé…' });
      return json(200, { releve_le: '2026-11-01T12:00:00+00:00', theme: { actif: 'jurojinet', parent: 'generatepress' },
        shortcodes: [{ tag: 'spec', origine: 'theme', nom: 'jurojinet', fichier: 'jurojinet/inc/spec.php', ligne: 7 }, { tag: 'jn_table_products', origine: 'theme', nom: 'jurojinet', fichier: 'jurojinet/inc/tables.php', ligne: 3 }],
        icones: { shortcode_spec: { origine: 'theme', fichier: 'jurojinet/inc/spec.php', ligne: 7 }, rendu: { fonction: 'jn_spec_icon' }, nom_inconnu: "remplacé par l'icône par défaut « info »", correspondances: { default: 'info', lock: 'lock' },
          verification: (u.searchParams.get('icones') || '').split(',').filter(Boolean).map((n) => ({ icon: n, symbole: n === 'lock' ? 'lock' : 'info', etat: n === 'lock' ? 'affichée' : "inconnu de [spec] : remplacé par l'icône par défaut" })) } });
    }
    if (u.pathname.startsWith('/wp-json/wp/v2/')) {
      const p = u.pathname.slice('/wp-json/wp/v2/'.length);
      if (p === 'types') return json(200, { post: { slug: 'post', rest_base: 'posts', name: 'Articles' }, logiciel: { slug: 'logiciel', rest_base: 'logiciels', name: 'Logiciels' }, glossaire: { slug: 'glossaire', rest_base: 'glossaire-3d', name: 'Glossaire' }, guide: { slug: 'guide', rest_base: 'guides', name: "Guides d'achat" } });
      if (p === 'guides/88') return auth ? json(200, { id: 88, status: 'publish', type: 'guide' }) : json(401, { code: 'rest_forbidden_context', message: 'non' });
      if (p === 'posts/88' || p === 'posts/99' || p === 'logiciels/99' || p === 'glossaire-3d/99') return json(404, { code: 'rest_post_invalid_id', message: 'Identifiant invalide' });
      if (p === 'guides/99') return json(200, { id: 99, status: 'publish', type: 'guide' });
      if (p === 'logiciels/77') return auth ? json(200, { id: 77, status: 'publish', type: 'logiciel' }) : json(401, { code: 'rest_forbidden_context', message: 'non' });
      if (p === 'posts/5') return json(200, { id: 5, status: 'publish', type: 'post' });
      if (p === 'categories') {
        const page = Number(u.searchParams.get('page'));
        return json(200, page === 1 ? [{ id: 3, name: 'Logiciels &amp; outils', slug: 'logiciels', parent: 0, count: 40 }] : [{ id: 4, name: 'Blender', slug: 'blender', parent: 3, count: 12 }], { 'X-WP-TotalPages': '2' });
      }
      if (p === 'tags') { const q = (u.searchParams.get('search') || '').toLowerCase(); return json(200, [{ id: 9, name: 'Mocap', slug: 'mocap', parent: 0, count: 5 }, { id: 10, name: 'Blender', slug: 'blender', parent: 0, count: 40 }].filter((t) => !q || t.name.toLowerCase().includes(q)), { 'X-WP-TotalPages': '1' }); }
      if (p === 'glossaire-3d') return json(200, [{ slug: 'add-on', title: { rendered: 'Add-on' }, link: `${base}/glossaire-3d/add-on/` }, { slug: 'rig', title: { rendered: 'Rig' }, link: `${base}/glossaire-3d/rig/` }], { 'X-WP-TotalPages': '1' });
      return json(404, { code: 'rest_no_route', message: 'Aucune route' });
    }
    // pages publiques
    if (u.pathname === '/guide-casque-vr/') return html(200, '<html><head><title>Guide</title></head><body class="guide-template-default single single-guide postid-88">x</body></html>');
    if (u.pathname === '/guide-sans-classe/') return html(200, '<html><head><title>Guide</title></head><body class="postid-99 theme-x">x</body></html>');
    if (u.pathname === '/logiciels/akeytsu/') return html(200, '<html><head><title>Akeytsu - Jurojin.net</title><link rel="canonical" href="' + base + '/logiciels/akeytsu/"><meta name="robots" content="index, follow"></head><body class="logiciel-template-default single single-logiciel postid-77">x</body></html>');
    if (u.pathname === '/article/') return html(200, '<html><head><title>Article</title><link rel="canonical" href="' + base + '/article/"><meta name="robots" content="noindex, follow"></head><body class="post-template-default single single-post postid-5 single-format-standard">x</body></html>');
    if (u.pathname === '/ancienne/') { res.writeHead(301, { Location: '/article/' }); return res.end(); }
    if (u.pathname === '/lent/') return;                                   // ne répond jamais : délai dépassé
    if (u.pathname === '/') return html(200, '<html><head><title>Accueil</title></head><body class="home blog">x</body></html>');
    return html(404, '<html><head><title>Page introuvable</title></head><body class="error404">x</body></html>');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}`;
  ext = `http://localhost:${srv.address().port}`;                         // même serveur, autre hôte = « externe »
  process.env.WP_API_USER_2 = USER; process.env.WP_API_PASSWORD_2 = PASS;

  admin = new pg.Client({ connectionString: `${URL_PG}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS mcp_outils_test');
  await admin.query('CREATE DATABASE mcp_outils_test');
  pool = new pg.Pool({ connectionString: `${URL_PG}/mcp_outils_test` });
  const { ensureSeoTables } = require('../../backend/scripts/autoInitDatabase.js');
  const c = await pool.connect();
  try { await ensureSeoTables(c); } finally { c.release(); }

  const U = `${base}/motion-capture-blender/`;
  await pool.query("INSERT INTO seo_sites (id, domain, wp_base_url) VALUES (2, '127.0.0.1', $1)", [base]);
  await pool.query(`INSERT INTO seo_pages (site_id, url, title, type, focus_keyword, last_crawl) VALUES
    (2, $1, 'Motion capture pour Blender', 'post', 'motion capture blender', '2026-10-30'),
    (2, $2, 'Comparatif mocap', 'post', 'Motion capture Blender', '2026-10-30'),
    (2, $3, 'Rokoko', 'post', NULL, '2026-10-30')`, [U, `${base}/comparatif-mocap/`, `${base}/rokoko/`]);
  for (let d = 0; d < 10; d++) {
    await pool.query(`INSERT INTO seo_gsc_daily (site_id, date, page_url, query, clicks, impressions, position, search_type) VALUES
      (2, '2026-10-31'::date - $1::int, $2, 'motion capture blender', 2, 40, 6.5, 'web'),
      (2, '2026-10-31'::date - $1::int, $2, 'mocap blender addon', 0, 12, 14, 'web'),
      (2, '2026-10-31'::date - $1::int, $3, 'motion capture blender', 1, 20, 9, 'web')`, [d, U, `${base}/comparatif-mocap/`]);
  }
  await pool.query("INSERT INTO seo_gsc_breakdown (site_id, date, page_url, dim, value, clicks, impressions, position) VALUES (2, '2026-10-30', $1, 'country', 'fra', 15, 400, 7)", [U]);
  await pool.query(`INSERT INTO gsc_index_status (site_id, url, verdict, coverage_state, google_canonical, user_canonical, referring_urls, checked_at)
    VALUES (2, $1, 'PASS', 'Envoyée et indexée', $1, $1, '["https://exemple.fr/x"]', '2026-10-29T08:00:00Z')`, [U]);
  await pool.query("INSERT INTO seo_sitemap_urls (site_id, url, sitemap_file, lastmod, seen_at) VALUES (2, $1, 'post-sitemap.xml', '2026-10-20', '2026-10-30')", [U]);
  await pool.query("INSERT INTO seo_links (site_id, from_url, to_url, anchor) VALUES (2, $1, $2, 'guide mocap Blender'), (2, $3, $2, '')", [`${base}/comparatif-mocap/`, U, `${base}/rokoko/`]);
  await pool.query("INSERT INTO seo_ref_domains (site_id, domain, opr_score) VALUES (2, 'blender.fr', 4.5), (2, 'forum.fr', 1.2)");
  await pool.query(`INSERT INTO seo_backlinks (site_id, source_url, source_domain, target_url, anchor, rel, status, last_seen, verified_at) VALUES
    (2, 'https://blender.fr/a', 'blender.fr', $1, 'mocap Blender', 'follow', 'active', '2026-10-28', '2026-10-28'),
    (2, 'https://forum.fr/b', 'forum.fr', $1, '', 'nofollow', 'active', '2026-10-27', '2026-10-27'),
    (2, 'https://vieux.fr/c', 'vieux.fr', $1, 'x', 'follow', 'lost', '2026-05-01', NULL)`, [U]);
  await pool.query("INSERT INTO seo_redirects (site_id, from_url, final_url, final_status, hops, updated_at) VALUES (2, $1, $2, 200, 1, '2026-10-30')", [`${base}/mocap-blender-vieux/`, U]);
  await pool.query("INSERT INTO seo_redirects (site_id, from_url, final_url, final_status, hops, chain, updated_at) VALUES (2, $1, $1, 200, 1, $2, '2026-10-30')", [`${base}/motion-capture-blender`, JSON.stringify([{ url: `${base}/motion-capture-blender`, status: 301 }])]);
});
after(async () => {
  if (!URL_PG) return;
  srv.close(); await pool.end();
  await admin.query('DROP DATABASE IF EXISTS mcp_outils_test').catch(() => {}); await admin.end();
});

test('list_link_campaigns : site de chaque campagne, filtre par site', opts, async () => {
  const { DATABASE_SCHEMA } = require('../../backend/scripts/autoInitDatabase.js');
  for (const name of ['seo_niches', 'seo_link_targets']) {
    const cols = Object.entries(DATABASE_SCHEMA[name].columns).map(([c, d]) => `${c} ${d}`).join(', ');
    await pool.query(`CREATE TABLE IF NOT EXISTS ${name} (${cols})`);
  }
  await pool.query('ALTER TABLE seo_niches ADD COLUMN IF NOT EXISTS site_id INTEGER');
  await pool.query("INSERT INTO seo_sites (id, domain) VALUES (15, 'pixfeed.net') ON CONFLICT DO NOTHING");
  const n = (await pool.query("INSERT INTO seo_niches (name, site_cible, site_id) VALUES ('Mocap', 'jurojin.net', 2), ('Agences', 'pixfeed.net', 15) RETURNING id")).rows;
  await pool.query("INSERT INTO seo_link_targets (niche_id, domain, statut) VALUES ($1, 'a.fr', 'contacte'), ($1, 'b.fr', 'nouveau')", [n[0].id]);
  const tools = await import('../tools.js');
  const tous = await tools.listLinkCampaigns(pool);
  assert.deepEqual(tous.map((c) => [c.name, c.site_id, c.site]).sort(), [['Agences', 15, 'pixfeed.net'], ['Mocap', 2, '127.0.0.1']]);
  const j = await tools.listLinkCampaigns(pool, 2);
  assert.deepEqual(j.map((c) => [c.name, c.nb_cibles, c.contactees]), [['Mocap', 2, 1]]);
});

test('get_page_dossier : chaque bloc sourcé et daté, réutilise les outils existants', opts, async () => {
  const { getPageDossier } = await import('../dossier.js');
  delete process.env.BING_WMT_API_KEY;
  const o = await getPageDossier(pool, 2, `${base}/motion-capture-blender/`, 90);
  assert.ok(o.fetched_at.endsWith('Z'));
  for (const k of ['indexation', 'sitemap', 'search_console', 'mots_cles', 'cannibalisation', 'liens_entrants_crawl', 'backlinks', 'redirections']) assert.ok(o[k] && o[k].source, `bloc ${k} sourcé`);
  assert.equal(o.indexation.verdict, 'PASS');
  assert.ok(o.indexation.releve_le);
  assert.equal(o.sitemap.present, true); assert.equal(o.sitemap.lastmod, '2026-10-20');
  assert.deepEqual(o.search_console.periode, { debut: '2026-08-03', fin: '2026-10-31', jours: 90, donnees_depuis: '2026-10-22' });
  assert.equal(o.search_console.total_web_requetes.impressions, 520);
  assert.match(o.search_console.total_web_requetes.couverture, /recherche web, pays fra seulement.*requêtes visibles seulement/);
  assert.match(o.search_console.pays.couverture, /tous pays, toutes requêtes/);
  assert.match(o.search_console.requetes.couverture, /recherche web/);
  assert.match(o.cannibalisation.couverture, /recherche web/);
  assert.equal(o.search_console.requetes.total, 2);
  assert.equal(o.search_console.pays.items[0].valeur, 'fra');
  assert.equal(o.mots_cles.erreur.code, 'config', 'Bing non configuré : dit clairement');
  assert.equal(o.cannibalisation.requetes_partagees.items[0].requete, 'motion capture blender');
  assert.equal(o.cannibalisation.requetes_partagees.items[0].autres_pages[0].url, `${base}/comparatif-mocap/`);
  assert.equal(o.cannibalisation.phrase_cle_partagee_avec[0].url, `${base}/comparatif-mocap/`);
  assert.equal(o.liens_entrants_crawl.entrants.total, 2);
  assert.ok(o.liens_entrants_crawl.entrants.items.some((l) => l.ancre === '(sans texte)'));
  assert.ok(o.liens_entrants_crawl.date_du_crawl);
  assert.equal(o.backlinks.actifs, 2); assert.equal(o.backlinks.perdus, 1); assert.equal(o.backlinks.dofollow, 1); assert.equal(o.backlinks.nofollow, 1);
  assert.equal(o.backlinks.plus_forts.items[0].domaine, 'blender.fr', 'le plus fort en tête');
  assert.ok(o.redirections.items.some((r) => r.sens === 'redirige vers cette adresse'));
  const barre = o.redirections.items.find((r) => r.nature);
  assert.deepEqual([barre.de, barre.vers, barre.nature], [`${base}/motion-capture-blender`, `${base}/motion-capture-blender/`, 'même page : ajout de la barre finale']);
  // comparaison de taille : le dossier compact contre les outils existants appelés un par un (sortie MCP indentée)
  const tools = await import('../tools.js');
  const U = `${base}/motion-capture-blender/`;
  const unParUn = [
    await tools.getPageKeywords(pool, 2, U, 90), await tools.getPositionContext(pool, 2, U, 90), await tools.getPageLinks(pool, 2, U),
    await tools.getCannibalisation(pool, 2, 90, 5), await tools.getFocusKeywordConflicts(pool, 2), await tools.checkSitemap(pool, 2, U), await tools.getRedirects(pool, 2, 200),
  ].reduce((n, x) => n + Buffer.byteLength(JSON.stringify(x, null, 2)), 0);
  console.log(`   taille : dossier ${(Buffer.byteLength(JSON.stringify(o)) / 1024).toFixed(1)} Ko, outils un par un ${(unParUn / 1024).toFixed(1)} Ko`);
});

test('check_urls : internes, externes, redirection, 404, délai dépassé, plafond de 50', opts, async () => {
  const { checkUrls } = await import('../checks.js');
  const o = await checkUrls(pool, 2, [`${base}/logiciels/akeytsu/`, `${base}/article/`, `${base}/ancienne/`, `${base}/n-existe-pas/`, `${ext}/`, `${ext}/introuvable/`, 'ftp://x']);
  const par = Object.fromEntries(o.adresses.items.map((a) => [a.url, a]));
  const ak = par[`${base}/logiciels/akeytsu/`];
  assert.equal(ak.code, 200); assert.equal(ak.title, 'Akeytsu - Jurojin.net');
  assert.deepEqual(ak.wordpress, { id: 77, type: 'logiciel', statut: 'publish', route: 'wp/v2/logiciels' });
  assert.equal(par[`${base}/article/`].noindex, true);
  assert.equal(par[`${base}/ancienne/`].adresse_finale, `${base}/article/`);
  assert.deepEqual(par[`${base}/ancienne/`].redirections, [301]);
  assert.equal(par[`${base}/n-existe-pas/`].code, 404);
  assert.match(par[`${base}/n-existe-pas/`].wordpress.note, /aucun contenu publié/);
  assert.equal(par[`${ext}/introuvable/`].code, 404);
  assert.ok(!par[`${ext}/`].wordpress && !par[`${ext}/`].interne, 'externe : pas de données WordPress');
  assert.equal(par['ftp://x'].erreur.code, 'invalide');
  assert.equal(o.resume.redirigees, 1);
  const trop = await checkUrls(pool, 2, Array.from({ length: 51 }, (_, i) => `${base}/p${i}/`));
  assert.match(trop.erreur, /50 au maximum/);
  console.log(`   taille : ${(Buffer.byteLength(JSON.stringify(o)) / 1024).toFixed(1)} Ko pour 7 adresses`);
});

test('check_urls : une adresse qui ne répond pas est coupée après le délai', { ...opts, timeout: 20000 }, async () => {
  const { checkUrls } = await import('../checks.js');
  const t0 = Date.now();
  const o = await checkUrls(pool, 2, [`${base}/lent/`, `${base}/logiciels/akeytsu/`]);
  assert.equal(o.adresses.items[0].erreur.code, 'timeout');
  assert.equal(o.adresses.items[1].code, 200, "les autres adresses ne l'attendent pas");
  assert.ok(Date.now() - t0 < 12000);
});

test('get_site_resources : catégories (paginées), étiquettes, glossaire, shortcodes, icônes', opts, async () => {
  const { getSiteResources } = await import('../ressources.js');
  const o = await getSiteResources(pool, 2, { icones: ['puzzle', 'lock', 'clock'], sections: ['categories', 'glossaire', 'shortcodes', 'icones', 'etiquettes'] });
  assert.deepEqual(o.categories.items.map((c) => c.nom), ['Logiciels & outils', 'Blender']);
  assert.equal(o.categories.items[1].parent, 3);
  assert.equal(o.etiquettes.items[0].slug, 'mocap');
  assert.deepEqual(o.glossaire.items.map((g) => g.slug), ['add-on', 'rig']);
  assert.equal(o.shortcodes.items.find((s) => s.tag === 'spec').origine, 'theme jurojinet');
  assert.deepEqual(o.icones_spec.verification.map((v) => [v.icon, v.etat === 'affichée']), [['puzzle', false], ['lock', true], ['clock', false]], 'la vérification demandée est transmise et renvoyée');
  delete process.env.WP_API_PASSWORD_2; process.env.MCP_BACKEND_ENV = '/nonexistent';
  const sans = await getSiteResources(pool, 2);
  assert.equal(sans.shortcodes.erreur.code, 'config', 'sans accès : la route est signalée en erreur');
  assert.equal(sans.categories.items.length, 2, 'les données publiques restent lues');
  process.env.WP_API_PASSWORD_2 = PASS;
  console.log(`   taille : ${(Buffer.byteLength(JSON.stringify(o)) / 1024).toFixed(1)} Ko`);
});

test('check_urls : type personnalisé lu dans les classes du <body>, sinon trouvé en essayant les types', opts, async () => {
  const { checkUrls } = await import('../checks.js');
  const o = await checkUrls(pool, 2, [`${base}/guide-casque-vr/`, `${base}/guide-sans-classe/`]);
  const [g, h] = o.adresses.items;
  assert.deepEqual([g.wordpress.id, g.wordpress.type, g.wordpress.statut, g.wordpress.route], [88, 'guide', 'publish', 'wp/v2/guides']);
  assert.ok(!g.wordpress.erreur, 'plus de rest_post_invalid_id sur la route des articles');
  assert.deepEqual([h.wordpress.type, h.wordpress.statut, h.wordpress.route], ['guide', 'publish', 'wp/v2/guides']);
  assert.match(h.wordpress.note, /trouvé en interrogeant les types/);
});

test('get_site_resources : sections, étiquettes sur demande ou par recherche, blocs en noms seuls', opts, async () => {
  const { getSiteResources } = await import('../ressources.js');
  const d = await getSiteResources(pool, 2, {});
  assert.ok(!d.etiquettes, 'pas d\'étiquettes par défaut');
  assert.ok(d.autres_sections.includes('etiquettes'));
  assert.deepEqual(d.redaction.blocs.items, ['core/image', 'core/gallery'], 'noms seuls');
  assert.deepEqual(d.redaction.compositions.items, ['theme/hero']);
  const r = await getSiteResources(pool, 2, { sections: ['categories'], etiquettes_recherche: 'blend' });
  assert.deepEqual(r.etiquettes.items.map((t) => t.nom), ['Blender']);
  assert.ok(!r.glossaire && !r.shortcodes && !r.redaction, 'seules les sections demandées');
  const b = await getSiteResources(pool, 2, { sections: ['redaction'], blocs: ['core/image', 'acme/inconnu'] });
  assert.deepEqual(b.redaction.blocs_detail.items, [{ nom: 'core/image', titre: 'Image', attributs: ['id', 'url', 'alt'] }]);
  assert.deepEqual(b.redaction.blocs_detail.absents, ['acme/inconnu']);
});
