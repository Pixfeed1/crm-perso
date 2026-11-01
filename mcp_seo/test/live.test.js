// get_live_page contre une fausse instance WordPress locale (aucun appel réseau extérieur).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const USER = 'editeur-crm', PASS = 'abcd efgh ijkl mnop';
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS.replace(/\s+/g, '')}`).toString('base64');
let srv, base, vus = [], retireAuth = false, appPasswordsActifs = true;

const RAW = `<!-- wp:heading --><h2>Les meilleurs outils</h2><!-- /wp:heading -->
<!-- wp:paragraph --><p>Pour la <a href="/glossaire-3d/motion-capture/">motion capture</a> dans Blender, voir <a href="https://rokoko.com/" rel="nofollow noopener">Rokoko</a>.</p><!-- /wp:paragraph -->
[jn_table_products ids="12,13"]
<!-- wp:image --><figure class="wp-block-image"><img src="/wp-content/uploads/a.jpg" alt="Combinaison mocap" width="800" height="450"/><figcaption>Une combinaison</figcaption></figure><!-- /wp:image -->
<!-- wp:list --><ul><li>Point un</li><li>Point deux</li></ul><!-- /wp:list -->
<h3>Addons</h3><p>Texte [jn_faq] fin.</p><img src="/x.png">`;

function wpItem(over = {}) {
  return { id: 42, status: 'publish', slug: 'article', link: `${base}/article/`, type: 'post', date_gmt: '2026-01-02T10:00:00', modified_gmt: '2026-10-30T08:00:00',
    title: { raw: 'Motion capture pour Blender' }, content: { raw: RAW }, categories: [3], tags: [7], featured_media: 9,
    focus_keyword: 'motion capture blender', seo_title: '', meta_description: 'Les outils de mocap.', robots_noindex: '',
    _embedded: { 'wp:term': [[{ id: 3, taxonomy: 'category', name: 'Logiciels &amp; outils' }], [{ id: 7, taxonomy: 'post_tag', name: 'Blender' }]], 'wp:featuredmedia': [{ source_url: `${base}/une.jpg`, alt_text: 'Une' }] }, ...over };
}

before(async () => {
  srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    vus.push({ path: u.pathname, auth: req.headers.authorization || null, q: Object.fromEntries(u.searchParams) });
    const json = (code, body, h = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...h }); res.end(JSON.stringify(body)); };
    if (u.pathname === '/wp-json/') return json(200, { authentication: appPasswordsActifs ? { 'application-passwords': { endpoints: {} } } : [] });
    if (u.pathname.startsWith('/wp-json/')) {
      const auth = retireAuth ? undefined : req.headers.authorization;      // serveur web qui retire l'en-tête
      const p = u.pathname.replace('/wp-json/wp/v2/', '');
      if (!auth && u.searchParams.get('context') === 'edit') return json(401, { code: 'rest_not_logged_in', message: 'Vous n&rsquo;êtes pas connecté.' });
      if (auth && auth !== AUTH) return json(401, { code: 'incorrect_password', message: 'Le mot de passe fourni est incorrect.' });
      if (p === 'users/me') return json(200, { id: 5, roles: ['editor'] });
      if (p === 'types' && u.searchParams.get('context') === 'edit') return json(403, { code: 'rest_cannot_view', message: 'Pas le droit de modifier les modèles.' });
      // le glossaire a des droits à part : l'Éditeur ne peut pas le modifier, seulement le lire
      if (p.startsWith('glossaire-3d') && u.searchParams.get('context') === 'edit') return json(403, { code: 'rest_forbidden_context', message: 'Pas le droit de modifier.' });
      if (p === 'glossaire-3d' && u.searchParams.get('slug') === 'add-on') return json(200, [{ id: 77, status: 'publish', slug: 'add-on', link: `${base}/glossaire-3d/add-on/`, type: 'glossaire', title: { rendered: 'Add-on' }, content: { rendered: '<p>Un add-on étend un logiciel. <a href="/article/">Exemple</a></p>' } }]);
      if (p === 'types') return json(200, { post: { slug: 'post', rest_base: 'posts', name: 'Articles' }, page: { slug: 'page', rest_base: 'pages', name: 'Pages' }, attachment: { slug: 'attachment', rest_base: 'media' }, glossaire: { slug: 'glossaire', rest_base: 'glossaire-3d', name: 'Glossaire' } });
      if (p === 'posts' && u.searchParams.get('slug') === 'article') return json(200, [wpItem()]);
      if (p === 'posts/42' && u.searchParams.get('_fields') === 'yoast_head_json') return json(200, { yoast_head_json: { title: 'Motion capture pour Blender - JurojiNet', canonical: `${base}/article/`, robots: { index: 'index', follow: 'follow' } } });
      if (u.searchParams.get('search')) {
        if (p === 'posts') return json(200, [
          { id: 50, link: `${base}/autre/`, title: { raw: 'Autre article' }, content: { raw: `Voir <a href="${base}/article/">notre guide mocap</a> et <a href="/article">encore</a>.` } },
          { id: 51, link: `${base}/faux/`, title: { raw: 'Faux positif' }, content: { raw: `<a href="${base}/article-bis/">pas lui</a>` } },
          { id: 42, link: `${base}/article/`, title: { raw: 'Lui-même' }, content: { raw: `<a href="${base}/article/">soi</a>` } },
        ], { 'X-WP-TotalPages': '1' });
        if (p === 'glossaire-3d') return json(500, { code: 'erreur_test', message: 'Base indisponible' });
        return json(200, [], { 'X-WP-TotalPages': '1' });
      }
      return json(200, []);
    }
    if (u.pathname === '/ancienne/') { res.writeHead(301, { Location: `/article/?${u.searchParams}` }); return res.end(); }
    if (u.pathname === '/article/') {
      res.writeHead(200, { 'Content-Type': 'text/html', 'X-Litespeed-Cache': 'hit', 'X-Robots-Tag': 'max-image-preview:large' });
      return res.end(`<html><head><title>Motion capture pour Blender - JurojiNet</title><meta name="description" content="Les outils de mocap."><link rel="canonical" href="${base}/article/"><meta name="robots" content="index, follow"></head><body><nav><a href="/">Accueil</a><a href="/blog/">Blog</a></nav><main><h1>Motion capture pour Blender</h1><p>…</p>
        <div class="article-body"><p><strong>À lire aussi</strong> <a href="/rigging/">Introduction au Rigging</a></p><p>Voir <a href="/a/">a</a>, <a href="/b/">b</a>, <a href="/c/">c</a>.</p></div>
        <article class="post category-arts-numerique"><section class="pf-related term-sidebar__block"><h2>Articles similaires</h2><div class="term-sidebar__list">
          <div class="card"><a href="/zbrush/"><noscript><img src="z.jpg" alt=""></noscript></a><a href="/arts-numerique/" class="post-cat">Arts Numérique</a><h3><a href="/zbrush/">ZBrush, un pilier</a></h3></div>
          <a href="/akeytsu/" class="card"><time>14.03.2025</time> <span class="cat">3D</span><h3>Akeytsu</h3><span class="cta">Lire ↗︎</span></a>
          <a href="/cascadeur/"><img alt="Cascadeur"></a><a href="/akeytsu/">doublon</a></div></section></article></main></body></html>
        <!-- This website is like a Rocket, isn't it? Performance optimized by WP Rocket. Debug: cached@1761900000 -->`);
    }
    res.writeHead(404); res.end('nope');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}`;
  process.env.WP_API_USER_2 = USER; process.env.WP_API_PASSWORD_2 = PASS;
});
after(() => srv.close());

const pool = (wpId = null) => ({ query: async (sql) => /FROM seo_sites/.test(sql) ? { rows: [{ domain: '127.0.0.1', wp_base_url: base }] } : { rows: wpId ? [{ wp_id: wpId, type: 'post' }] : [] } });

test('sortie complète : WordPress, Yoast, contenu brut structuré, page publique hors cache, liens entrants', async () => {
  const { getLivePage } = await import('../live.js');
  vus = [];
  const o = await getLivePage(pool(), 2, `${base}/ancienne/`.replace('/ancienne/', '/article/'));
  const s = JSON.stringify(o);
  assert.ok(o.fetched_at.endsWith('Z'));
  assert.ok(!s.includes(PASS) && !s.includes(PASS.replace(/\s/g, '')) && !s.includes(AUTH), 'aucun accès dans la sortie');
  // WordPress
  assert.equal(o.wordpress.id, 42); assert.equal(o.wordpress.type, 'post'); assert.equal(o.wordpress.titre, 'Motion capture pour Blender');
  assert.deepEqual(o.wordpress.categories, [{ id: 3, nom: 'Logiciels & outils' }]);
  assert.deepEqual(o.wordpress.image_a_la_une, { url: `${base}/une.jpg`, alt: 'Une' });
  assert.equal(o.wordpress.yoast.phrase_cle, 'motion capture blender');
  assert.match(o.wordpress.yoast.titre_seo, /vide/);
  assert.equal(o.wordpress.yoast.canonique, `${base}/article/`);
  assert.equal(o.wordpress.yoast.robots, 'index, follow');
  // contenu
  const c = o.contenu;
  assert.deepEqual(c.titres.items, [{ n: 2, t: 'Les meilleurs outils' }, { n: 3, t: 'Addons' }]);
  assert.ok(c.paragraphes.items.includes('• Point un'));
  assert.ok(c.paragraphes.items.includes('Texte fin.'), 'shortcode retiré du texte');
  assert.deepEqual(c.shortcodes, [{ nom: 'jn_table_products', nb: 1 }, { nom: 'jn_faq', nb: 1 }]);
  assert.equal(c.liens.internes, 1); assert.equal(c.liens.externes, 1);
  assert.deepEqual(c.liens.items[1], { href: 'https://rokoko.com/', ancre: 'Rokoko', interne: false, rel: 'nofollow noopener' });
  assert.deepEqual(c.images.items[0], { src: '/wp-content/uploads/a.jpg', alt: 'Combinaison mocap', legende: 'Une combinaison', largeur: 800, hauteur: 450 });
  assert.equal(c.images.items[1].alt, '(attribut alt absent)');
  assert.equal(c.mots, 20, "3 + 8 + 2 + 4 + 1 + 2 mots");
  assert.ok(!/<p>|<a /.test(JSON.stringify(c)), 'pas de HTML brut');
  // page publique
  const p = o.page_publique;
  assert.equal(p.code_http, 200);
  assert.match(p.cache.servi_par_le_cache, /^oui/);
  assert.ok(p.cache.indices.some((x) => /WP Rocket/.test(x)));
  assert.equal(p.x_robots_tag, 'max-image-preview:large');
  assert.deepEqual(p.h1, ['Motion capture pour Blender']);
  assert.match(p.articles_similaires.detecte_par, /titre « Articles similaires » \(section\.pf-related[.\w-]*\)/, 'pas l\'encadré du corps de l\'article');
  assert.deepEqual(p.articles_similaires.items.map((x) => x.ancre), ['ZBrush, un pilier', 'Akeytsu', 'Cascadeur'], 'titre de la carte, sans date, catégorie ni « Lire »');
  // liens entrants : le bon article, pas le faux positif ni elle-même ; l'erreur d'un type est signalée
  assert.equal(o.liens_entrants.total, 1);
  assert.deepEqual(o.liens_entrants.items[0].ancres, ['notre guide mocap', 'encore']);
  assert.ok(o.liens_entrants.erreurs.some((e) => e.code === 500 && /glossaire-3d/.test(e.source)));
  assert.match(o.liens_entrants.non_couvert, /menus, widgets/);
  assert.deepEqual(o.wordpress.utilisateur_api, { id: 5, roles: ['editor'] });
  assert.ok(!vus.some((v) => v.path.endsWith('/types') && v.q.context === 'edit'), 'liste des types sans context=edit');
  // l'accès ne part que vers l'API, jamais vers la page publique
  assert.ok(vus.filter((v) => !v.path.startsWith('/wp-json/')).every((v) => v.auth === null));
  assert.ok(vus.filter((v) => !v.path.startsWith('/wp-json/')).every((v) => /^crm_live$/.test(Object.keys(v.q)[0])), 'paramètre anti-cache unique');
});

test('redirection suivie et adresse finale sans le paramètre anti-cache', async () => {
  const { getLivePage } = await import('../live.js');
  const o = await getLivePage(pool(42), 2, `${base}/ancienne/`);
  assert.equal(o.page_publique.redirections[0].code, 301);
  assert.equal(o.page_publique.adresse_finale, `${base}/article/`);
  assert.equal(o.wordpress.erreur.code, 404, 'ancienne adresse : aucun contenu WordPress, dit clairement');
});

test('erreurs claires : accès refusé, accès absent, adresse hors du site', async () => {
  const { getLivePage } = await import('../live.js');
  process.env.WP_API_PASSWORD_2 = 'mauvais';
  let o = await getLivePage(pool(), 2, `${base}/article/`);
  assert.equal(o.wordpress.acces.erreur.code, 401);
  assert.match(o.wordpress.acces.erreur.message, /mot de passe d'application refusé.*incorrect_password/);
  // accès refusé : la lecture continue en public, et la sortie le dit en tête du bloc
  assert.equal(Object.keys(o.wordpress)[0], 'acces');
  assert.match(o.wordpress.acces.mode, /lecture publique/);
  assert.equal(o.wordpress.id, 42);
  assert.match(o.wordpress.source, /lecture publique/);
  process.env.WP_API_PASSWORD_2 = PASS;
  retireAuth = true;
  o = await getLivePage(pool(), 2, `${base}/article/`);
  assert.match(o.wordpress.acces.erreur.message, /ne reconnaît pas l'utilisateur dédié.*diag-wp-auth/);
  appPasswordsActifs = false;
  o = await getLivePage(pool(), 2, `${base}/article/`);
  assert.match(o.wordpress.acces.erreur.message, /DÉSACTIVÉS.*Wordfence/);
  appPasswordsActifs = true;
  retireAuth = false;
  process.env.WP_API_PASSWORD_2 = 'mauvais';
  assert.equal(o.page_publique.code_http, 200, 'la page publique reste lue');
  assert.ok(!JSON.stringify(o).includes('mauvais'));
  delete process.env.WP_API_USER_2; delete process.env.WP_API_PASSWORD_2;
  process.env.MCP_BACKEND_ENV = '/nonexistent';
  o = await getLivePage(pool(), 2, `${base}/article/`);
  assert.match(o.wordpress.acces.erreur.message, /WP_API_USER_2 et WP_API_PASSWORD_2 absents/);
  assert.equal(o.wordpress.id, 42, 'sans accès configuré : lecture publique quand même');
  o = await getLivePage(pool(), 2, 'https://exemple.com/article/');
  assert.match(o.erreur, /n'appartient pas au site 2/);
  process.env.WP_API_USER_2 = USER; process.env.WP_API_PASSWORD_2 = PASS;
});

test('type que l\'Éditeur ne peut pas modifier : lu en lecture publique, et la sortie le dit', async () => {
  const { getLivePage } = await import('../live.js');
  const o = await getLivePage(pool(), 2, `${base}/glossaire-3d/add-on/`);
  assert.equal(o.wordpress.id, 77);
  assert.equal(o.wordpress.type, 'glossaire');
  assert.match(o.wordpress.note, /lecture publique/);
  assert.match(o.contenu.source, /contenu RENDU/);
  assert.equal(o.contenu.liens.internes, 1);
});
