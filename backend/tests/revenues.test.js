// Revenus : le statut (payé / en attente / planifié) est enregistré à la création et à la
// modification. Contrôleur testé avec une base factice (style db.run / db.get).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ctrl = require('../controllers/revenueController');
const { fakeRes } = require('./helpers/db');

function fakeDb() {
  const calls = [];
  return {
    calls,
    run(q, p, cb) { calls.push({ q: q.replace(/\s+/g, ' ').trim(), p }); cb.call({ lastID: 9 }, null); },
    get(q, p, cb) { if (/FROM revenues WHERE id = \?$/.test(q.trim()) && !/JOIN/.test(q)) return cb(null, { id: 1 }); cb(null, { id: 9, status: p[0] }); }
  };
}
const req = (db, body, params = {}) => ({ app: { locals: { db } }, body, params });

test('création : statut fourni enregistré, statut invalide refusé, défaut en attente', () => {
  const db = fakeDb(); let r = fakeRes();
  ctrl.createRevenue(req(db, { amount: 225, date: '2026-09-07', type: 'ponctuel', status: 'paid' }), r);
  assert.equal(r.code, 201); assert.match(db.calls[0].q, /status/); assert.equal(db.calls[0].p[5], 'paid');
  r = fakeRes(); ctrl.createRevenue(req(db, { amount: 1, date: '2026-01-01', type: 'ponctuel', status: 'bidon' }), r);
  assert.equal(r.code, 400);
  r = fakeRes(); ctrl.createRevenue(req(db, { amount: 1, date: '2026-01-01', type: 'ponctuel' }), r);
  assert.equal(db.calls.at(-1).p[5], 'pending');
});

test('modification : le statut seul suffit, rien à modifier est refusé', () => {
  const db = fakeDb(); let r = fakeRes();
  ctrl.updateRevenue(req(db, { status: 'paid' }, { id: '5' }), r);
  assert.equal(r.code, 200); assert.deepEqual(db.calls.at(-1).p, ['paid', '5']);
  r = fakeRes(); ctrl.updateRevenue(req(db, {}, { id: '5' }), r);
  assert.equal(r.code, 400);
});
