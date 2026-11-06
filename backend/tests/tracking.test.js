// Lot 4 : plus de pixel d'ouverture, seuls les clics sont suivis.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { wrapHtml } = require('../services/emailTracking');

test('wrapHtml : liens réécrits vers la redirection de clic, aucun pixel ni image ajoutés', () => {
  const html = wrapHtml('<html><body><p><a href="https://pixfeed.net/maintenance">voir</a> <a href="mailto:a@b.fr">m</a></p></body></html>', 'tok123');
  assert.match(html, /href="https:\/\/crm\.pixfeed\.net\/api\/track\/c\/tok123\?u=https%3A%2F%2Fpixfeed\.net%2Fmaintenance"/);
  assert.match(html, /href="mailto:a@b\.fr"/);
  assert.doesNotMatch(html, /<img|\/track\/o\//);
  assert.equal(wrapHtml('<p>x</p>', null), '<p>x</p>');
});
