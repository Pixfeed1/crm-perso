// get_contenu_brut : contenu stocké au caractère près, empreinte, découpage. Fausse instance WordPress, aucune écriture.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { getContenuBrut } from '../contenu.js';

const USER = 'lecture-seo', PASS = 'abcd efgh ijkl mnop qrst uvwx';
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS.replace(/\s+/g, '')}`).toString('base64');
const RAW = '<!-- wp:paragraph -->\n<p>Intro « été » 🚀</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:shortcode -->\n[pf_encart type="info"]Texte [pf_lien url="https://pixfeed.net/x/"] fin[/pf_encart]\n<!-- /wp:shortcode -->\n\n<!-- wp:separator /-->\n';
let srv, base, ecritures = 0;
const pool = { query: async (sql) => ({ rows: /seo_sites/.test(sql) ? [{ domain: '127.0.0.1', wp_base_url: base }] : [] }) };

before(async () => {
  srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const json = (c, b) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)); };
    if (req.method !== 'GET') { ecritures++; return json(405, {}); }
    if (req.headers.authorization !== AUTH) return json(401, { code: 'rest_not_logged_in', message: 'non' });
    const p = u.pathname.replace('/wp-json/wp/v2/', '');
    if (p === 'users/me') return json(200, { id: 9, roles: ['editor'] });
    if (p === 'types') return json(200, { post: { slug: 'post', rest_base: 'posts', name: 'Articles' }, film: { slug: 'film', rest_base: 'films', name: 'Films' } });
    const article = { id: 131854, status: 'publish', slug: 'maintenance-wordpress', link: `${base}/maintenance-wordpress/`, modified_gmt: '2026-11-01T10:00:00', title: { raw: 'Maintenance &amp; suivi', rendered: 'Maintenance &#038; suivi' }, excerpt: { raw: '', rendered: '' }, content: { raw: RAW, rendered: '<p>rendu</p>' } };
    if (p === 'posts/131854') return u.searchParams.get('context') === 'edit' ? json(200, article) : json(200, { ...article, content: { rendered: '<p>rendu</p>' } });
    if (p === 'posts') return json(200, u.searchParams.get('slug') === 'maintenance-wordpress' ? [article] : []);
    if (p === 'films' || /^films\//.test(p)) return json(u.searchParams.get('slug') ? 200 : 404, u.searchParams.get('slug') ? [] : { code: 'rest_post_invalid_id' });
    return json(404, { code: 'rest_no_route', message: 'Aucune route' });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}`;
  process.env.WP_API_USER_15 = USER; process.env.WP_API_PASSWORD_15 = PASS;
});
after(() => srv.close());

test('par id : contenu stocké intact (codes courts pf_, blocs, accents, emoji), empreinte et comptes', async () => {
  const r = await getContenuBrut(pool, 15, { id: 131854 });
  assert.equal(r.id, 131854); assert.equal(r.type, 'post'); assert.equal(r.statut, 'publish');
  assert.equal(r.content.raw, RAW, 'au caractère près');
  assert.equal(r.title_raw, 'Maintenance &amp; suivi');
  assert.equal(r.content.sha256, crypto.createHash('sha256').update(RAW, 'utf8').digest('hex'));
  assert.equal(r.content.blocs, 3);
  assert.deepEqual(r.content.codes_courts, { pf_encart: 1, pf_lien: 1 });
  assert.equal(r.content.longueur, Array.from(RAW).length);
  assert.equal(r.content.morceau.complet, true);
  assert.equal(ecritures, 0, 'aucune écriture');
});

test('par url, et découpage en morceaux sans couper un caractère', async () => {
  const r = await getContenuBrut(pool, 15, { url: `${base}/maintenance-wordpress/`, debut: 0, longueur: 40 });
  assert.equal(r.id, 131854);
  assert.equal(r.content.morceau.complet, false);
  let morceaux = r.content.raw, suite = r.content.morceau.suite;
  while (suite) { const x = await getContenuBrut(pool, 15, { id: 131854, debut: suite.debut, longueur: suite.longueur }); morceaux += x.content.raw; suite = x.content.morceau.suite; }
  assert.equal(morceaux, RAW, 'les morceaux recollés redonnent le contenu exact');
  assert.match((await getContenuBrut(pool, 15, { url: 'https://ailleurs.fr/x/' })).erreur, /n'appartient pas/);
  assert.equal((await getContenuBrut(pool, 15, { id: 5 })).erreur.code, 404);
});
