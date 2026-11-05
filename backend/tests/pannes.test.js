// Lot 2.3 — pannes : une erreur vue une fois n'est qu'un indice ; revue à au moins une heure d'écart,
// elle devient une preuve ; un site rétabli remet tout à zéro.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hasDb, withSchema } = require('./helpers/db');
const { DATABASE_SCHEMA } = require('../scripts/autoInitDatabase');

const opts = { skip: !hasDb() && 'TEST_DATABASE_URL absent' };

test('suivi des pannes : première mesure, confirmation après une heure, retour à la normale', opts, async () => {
  await withSchema('pannes', async ({ pool }) => {
    const cols = (n) => Object.entries(DATABASE_SCHEMA[n].columns).map(([c, d]) => `${c} ${d.replace(/REFERENCES users\(id\)/, '')}`).join(', ');
    for (const t of ['crawl_jobs', 'crawl_results']) await pool.query(`CREATE TABLE ${t} (${cols(t)})`);
    await pool.query('CREATE TABLE crawl_seen_domains (domain TEXT PRIMARY KEY, source VARCHAR(20), first_seen TIMESTAMP DEFAULT NOW())');
    const db = { pool };
    const { typedResult, insertCrawlResult, updateCrawlResult } = require('../controllers/crawlController');
    const job = (await pool.query("INSERT INTO crawl_jobs (techno, nb_sites, statut) VALUES ('prestashop', 1, 'done') RETURNING id")).rows[0].id;
    const t0 = new Date('2026-11-05T09:00:00Z');
    const mesure = (status, d) => typedResult({ domain: 'ilovemykids.fr', platform: 'PrestaShop', http_status: String(status), final_url: 'https://ilovemykids.fr/', title: 'Erreur', analyse_le: d.toISOString() });
    const lire = async (id) => (await pool.query('SELECT panne_vue_le, panne_confirmee FROM crawl_results WHERE id = $1', [id])).rows[0];
    const id = await insertCrawlResult(db, job, mesure(500, t0));
    let r = await lire(id);
    assert.equal(r.panne_confirmee, false); assert.ok(r.panne_vue_le);
    await updateCrawlResult(db, id, mesure(500, new Date(t0.getTime() + 20 * 60000)));
    assert.equal((await lire(id)).panne_confirmee, false, '20 minutes plus tard : pas encore confirmée');
    await updateCrawlResult(db, id, mesure(503, new Date(t0.getTime() + 90 * 60000)));
    r = await lire(id);
    assert.equal(r.panne_confirmee, true, '1 h 30 après la première mesure : confirmée');
    assert.equal(new Date(r.panne_vue_le).toISOString(), t0.toISOString(), 'la panne date de la première mesure');
    await updateCrawlResult(db, id, mesure(200, new Date(t0.getTime() + 3 * 3600000)));
    r = await lire(id);
    assert.equal(r.panne_confirmee, false); assert.equal(r.panne_vue_le, null);
    // refus au robot (403) : jamais une panne
    await updateCrawlResult(db, id, mesure(403, new Date(t0.getTime() + 5 * 3600000)));
    assert.equal((await lire(id)).panne_vue_le, null);
  });
});
