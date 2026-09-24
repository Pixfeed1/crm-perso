// Relances du Suivi : un échange loggé ferme les relances échues ; gagné / perdu / pas de
// business ferment tout ; le widget ignore fiches supprimées et « pas de business ».
// Nécessite TEST_DATABASE_URL (sinon skip).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hasDb, withSchema, fakeReq, fakeRes } = require('./helpers/db');
const ctrl = require('../controllers/interactionController');

const pending = async (pool, id) => (await pool.query(
  `SELECT id, next_followup_date::text AS d, relance_step FROM interactions
   WHERE contact_type = 'lead' AND contact_id = $1 AND followup_done = FALSE AND next_followup_date IS NOT NULL ORDER BY id`, [id])).rows;

test('relances : fermeture par échange, par statut, filtrage du widget', { skip: !hasDb() && 'TEST_DATABASE_URL absent' }, async () => {
  await withSchema('followups', async ({ pool }) => {
    const db = { pool };
    await pool.query(`CREATE TABLE leads (id SERIAL PRIMARY KEY, name TEXT, email TEXT, phone TEXT, relation_status TEXT, status TEXT)`);
    await pool.query(`CREATE TABLE crm_clients (id SERIAL PRIMARY KEY, name TEXT, email TEXT, phone TEXT, relation_status TEXT)`);
    await pool.query(`CREATE TABLE interactions (id SERIAL PRIMARY KEY, contact_type VARCHAR(10), contact_id INT, type TEXT, reached TEXT,
      date TIMESTAMP DEFAULT NOW(), notes TEXT, result TEXT, relation_status TEXT, next_followup_date DATE, next_followup_channel TEXT,
      followup_done BOOLEAN DEFAULT FALSE, relance_step INT, created_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`INSERT INTO leads (name, relation_status) VALUES ('A', 'contacte'), ('B', 'contacte')`);
    await pool.query(`INSERT INTO interactions (contact_type, contact_id, type, date, next_followup_date, created_at) VALUES
      ('lead', 1, 'email', NOW() - INTERVAL '50 days', CURRENT_DATE - 42, NOW() - INTERVAL '50 days'),
      ('lead', 2, 'email', NOW() - INTERVAL '50 days', CURRENT_DATE - 42, NOW() - INTERVAL '50 days')`);
    await pool.query(`INSERT INTO interactions (contact_type, contact_id, type, next_followup_date, relance_step) VALUES ('lead', 1, 'note', CURRENT_DATE + 5, 2)`);

    // Un échange loggé ferme la relance échue, garde la cascade auto future.
    let r = fakeRes();
    await ctrl.create(fakeReq(db, { body: { contact_type: 'lead', contact_id: 1, type: 'appel', reached: 'pas_reponse' } }), r);
    assert.equal(r.code, 201);
    let p = await pending(pool, 1);
    assert.equal(p.length, 1); assert.equal(p[0].relance_step, 2);

    // Une nouvelle relance programmée remplace la manuelle en attente.
    r = fakeRes();
    await ctrl.create(fakeReq(db, { body: { contact_type: 'lead', contact_id: 2, type: 'appel', next_followup_date: '2030-01-10', next_followup_channel: 'appel' } }), r);
    p = await pending(pool, 2);
    assert.equal(p.length, 1); assert.equal(p[0].d, '2030-01-10');

    // Pas de business : tout est clos, cascade comprise.
    r = fakeRes();
    await ctrl.setContactStatus(fakeReq(db, { body: { contact_type: 'lead', contact_id: 1, relation_status: 'pas_business' } }), r);
    assert.equal((await pending(pool, 1)).length, 0);

    // Widget : fiche supprimée et pas de business exclus.
    await pool.query(`UPDATE interactions SET followup_done = FALSE WHERE contact_id = 1`);
    await pool.query(`INSERT INTO interactions (contact_type, contact_id, type, next_followup_date) VALUES ('lead', 99, 'email', CURRENT_DATE - 3)`);
    r = fakeRes();
    await ctrl.getFollowups(fakeReq(db), r);
    assert.ok(r.body.every((f) => f.contact_id !== 1 && f.contact_id !== 99));
  });
});
