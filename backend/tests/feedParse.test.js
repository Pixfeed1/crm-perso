// Flux RSS / Atom de la veille : lecture sans dépendance, normalisation en annonce.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseFeed } = require('../utils/feedParse');
const { normalizeFeedItem, fluxConfigures } = require('../services/veilleMissions');

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>Alerte Google - cherche freelance prestashop</title>
<item><title>Cherche d&eacute;veloppeur PrestaShop pour ma boutique &amp; migration 1.7</title>
<link>https://www.linkedin.com/posts/jean-dupont_cherche-freelance-prestashop-activity-123</link>
<pubDate>Tue, 21 Oct 2026 08:12:00 GMT</pubDate>
<description><![CDATA[Bonjour à tous, je <b>cherche</b> un freelance PrestaShop pour corriger une erreur 500 depuis la mise à jour.]]></description></item>
<item><title>Sans lien</title><description>ignoré</description></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Forum WordPress FR</title>
<entry><title type="html">Site cass&#233; apr&#232;s mise &#224; jour WooCommerce</title>
<link rel="self" href="https://fr.wordpress.org/support/feed/x"/><link rel="alternate" href="https://fr.wordpress.org/support/topic/site-casse/"/>
<published>2026-10-20T10:00:00Z</published><author><name>boutiquelea</name></author>
<content type="html">&lt;p&gt;Depuis ce matin ma boutique affiche une page blanche.&lt;/p&gt;</content></entry></feed>`;

test('RSS 2.0 : titre décodé, lien, date, description sans HTML ; item sans lien ignoré', () => {
  const items = parseFeed(RSS);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Cherche développeur PrestaShop pour ma boutique & migration 1.7');
  assert.equal(items[0].link, 'https://www.linkedin.com/posts/jean-dupont_cherche-freelance-prestashop-activity-123');
  assert.equal(items[0].date.toISOString().slice(0, 10), '2026-10-21');
  assert.match(items[0].description, /^Bonjour à tous, je cherche un freelance PrestaShop/);
  assert.doesNotMatch(items[0].description, /<b>/);
});

test('Atom : lien alternate (pas self), entités numériques, contenu HTML aplati, auteur', () => {
  const items = parseFeed(ATOM);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Site cassé après mise à jour WooCommerce');
  assert.equal(items[0].link, 'https://fr.wordpress.org/support/topic/site-casse/');
  assert.equal(items[0].description, 'Depuis ce matin ma boutique affiche une page blanche.');
  assert.equal(items[0].author, 'boutiquelea');
});

test('une page HTML ou un texte vide ne donne aucun item', () => {
  assert.deepEqual(parseFeed('<!DOCTYPE html><html><body><item>x</item></body></html>'), []);
  assert.deepEqual(parseFeed(''), []);
});

test('normalisation : source flux, libellé du flux, uid = lien, date ; flux configurés filtrés sur URL http(s)', () => {
  const [it] = parseFeed(ATOM);
  const a = normalizeFeedItem(it, { label: 'Forum WordPress FR', url: 'https://fr.wordpress.org/support/feed/' });
  assert.equal(a.source, 'flux'); assert.equal(a.flux_label, 'Forum WordPress FR'); assert.equal(a.source_label, 'via Forum WordPress FR');
  assert.equal(a.uid, a.lien); assert.equal(a.date_annonce, '2026-10-20'); assert.equal(a.entreprise, '', 'un pseudo n\'est pas une entreprise'); assert.match(a.description, /^Auteur : boutiquelea\n/); assert.equal(a.localisation, '');
  const sans = normalizeFeedItem(parseFeed(RSS)[0], null);
  assert.equal(sans.source_label, 'via linkedin.com');
  assert.deepEqual(fluxConfigures({ flux: [{ label: 'A', url: 'https://a.fr/rss' }, { label: 'B', url: 'ftp://x' }, { url: 'https://b.fr/feed' }, null] }),
    [{ label: 'A', url: 'https://a.fr/rss' }, { label: 'b.fr', url: 'https://b.fr/feed' }]);
  assert.deepEqual(fluxConfigures({ flux: '[{"label":"C","url":"https://c.fr/x"}]' }), [{ label: 'C', url: 'https://c.fr/x' }]);
  assert.deepEqual(fluxConfigures({}), []);
});
