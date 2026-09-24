// Netlinking : lecture du rel par emplacement et détection de plateforme (sans réseau).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../services/linkSpotService');

const blog = `<html><head><meta name="generator" content="WordPress 6.5"></head><body>
<header><nav><a href="https://facebook.com/x">fb</a></nav></header>
<main><article class="post"><div class="entry-content"><p><a href="https://jurojin.net/tuto">lien</a> et <a href="https://autre.fr/" rel="nofollow">n</a></p>
<h2>Sources</h2><ul><li><a href="https://source1.fr/p">s1</a></li></ul></div></article>
<div id="comments"><ol class="commentlist"><li class="comment"><a href="https://spam.ru/" rel="ugc external nofollow">c</a></li></ol></div></main>
<aside class="widget-area"><ul class="blogroll"><li><a href="https://ami.fr/">ami</a></li></ul></aside>
<footer id="colophon"><a href="https://wordpress.org/">wp</a><a href="https://exemple.fr/interne">int</a></footer></body></html>`;

test('les liens externes sont regroupés par emplacement avec leur rel dominant', () => {
  const spots = Object.fromEntries(L.extractSpots(blog, 'https://exemple.fr/', 'exemple.fr').map((s) => [s.emplacement, s]));
  assert.equal(spots.article.dofollow, true);       // un lien sans rel dans le corps
  assert.equal(spots.sources.dofollow, true);
  assert.equal(spots.commentaire.dofollow, false);
  assert.equal(spots.commentaire.rel_dominant, 'external nofollow ugc');
  assert.equal(spots.blogroll.dofollow, true);
  assert.equal(spots.pied.liens, 1);                 // le lien interne n'est pas compté
  assert.equal(spots.autre.liens, 1);                // la navigation ne vaut pas emplacement éditorial
});

test('détection de plateforme stricte : une mention dans une URL ne suffit pas', () => {
  assert.equal(L.detectPlatform(blog).platform, 'wordpress');
  assert.equal(L.detectPlatform('<a href="/guide-prestashop">g</a>').platform, null);
  assert.equal(L.detectPlatform('<script>var prestashop = {};</script>').platform, 'prestashop');
  assert.equal(L.detectPlatform('<script src="https://illiweb.com/fa/x.js"></script>').platform, 'forumactif');
});

test('rel : normalisation et verdict dofollow', () => {
  assert.equal(L.normalizeRel('NOFOLLOW noopener'), 'nofollow noopener');
  assert.equal(L.relIsDofollow('noopener noreferrer'), true);
  assert.equal(L.relIsDofollow('sponsored'), false);
});

test('choix des pages d\'article depuis l\'accueil : ni tags, ni pagination, ni fichiers', () => {
  const links = L.pickArticleLinks('<a href="/tag/x">t</a><a href="/2026/09/mon-article-long/">a</a><a href="/img/a.jpg">i</a><a href="/page/2">p</a>', 'https://exemple.fr/', 'exemple.fr');
  assert.deepEqual(links, ['https://exemple.fr/2026/09/mon-article-long/']);
});
