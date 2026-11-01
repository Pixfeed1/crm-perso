// get_live_page contre une fausse instance WordPress locale (aucun appel réseau extérieur).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const USER = 'editeur-crm', PASS = 'abcd efgh ijkl mnop';
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS.replace(/\s+/g, '')}`).toString('base64');
let srv, base, vus = [];

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
    if (u.pathname.startsWith('/wp-json/')) {
      if (req.headers.authorization !== AUTH) return json(401, { code: 'rest_not_logged_in', message: 'Vous n&rsquo;êtes pas connecté.' });
      const p = u.pathname.replace('/wp-json/wp/v2/', '');
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
        <section class="jn-similaires"><h3>Articles similaires</h3><a href="/akeytsu/">Akeytsu</a><a href="/cascadeur/"><img alt="Cascadeur"></a><a href="/akeytsu/">doublon</a></section></main></body></html>
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
  assert.match(p.articles_similaires.detecte_par, /Articles similaires/);
  assert.deepEqual(p.articles_similaires.items.map((x) => x.ancre), ['Akeytsu', 'Cascadeur']);
  // liens entrants : le bon article, pas le faux positif ni elle-même ; l'erreur d'un type est signalée
  assert.equal(o.liens_entrants.total, 1);
  assert.deepEqual(o.liens_entrants.items[0].ancres, ['notre guide mocap', 'encore']);
  assert.ok(o.liens_entrants.erreurs.some((e) => e.code === 500 && /glossaire-3d/.test(e.source)));
  assert.match(o.liens_entrants.non_couvert, /menus, widgets/);
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
  assert.equal(o.wordpress.erreur.code, 401);
  assert.match(o.wordpress.erreur.message, /rest_not_logged_in : Vous n’êtes pas connecté/);
  assert.equal(o.page_publique.code_http, 200, 'la page publique reste lue');
  assert.ok(!JSON.stringify(o).includes('mauvais'));
  delete process.env.WP_API_USER_2; delete process.env.WP_API_PASSWORD_2;
  process.env.MCP_BACKEND_ENV = '/nonexistent';
  o = await getLivePage(pool(), 2, `${base}/article/`);
  assert.match(o.wordpress.erreur.message, /WP_API_USER_2 et WP_API_PASSWORD_2 absents/);
  o = await getLivePage(pool(), 2, 'https://exemple.com/article/');
  assert.match(o.erreur, /n'appartient pas au site 2/);
  process.env.WP_API_USER_2 = USER; process.env.WP_API_PASSWORD_2 = PASS;
});
