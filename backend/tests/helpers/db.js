// Aide aux tests : base PostgreSQL jetable.
//
// Les tests qui touchent la base ne tournent que si TEST_DATABASE_URL est défini
// (ex. postgres://postgres@127.0.0.1:55432/postgres). Sans lui, ils sont marqués « skip » :
// on ne veut jamais qu'un `npm test` touche la base de production par accident.
//
// Chaque test crée ses tables dans un schéma dédié puis le supprime : pas de résidu.
const { Pool } = require('pg');

const url = process.env.TEST_DATABASE_URL || '';

function hasDb() { return !!url; }

async function withSchema(name, fn) {
  const pool = new Pool({ connectionString: url });
  const schema = `test_${name}_${process.pid}`;
  try {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`SET search_path TO ${schema}, public`);
    // Le pool ouvre plusieurs connexions : on force le search_path à chaque connexion.
    pool.on('connect', (c) => c.query(`SET search_path TO ${schema}, public`));
    await fn({ pool });
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await pool.end();
  }
}

// Réponse Express factice : capture status + JSON.
function fakeRes() {
  const r = { code: 200, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (j) => { r.body = j; return r; };
  return r;
}

function fakeReq(db, { body = {}, params = {}, query = {} } = {}) {
  return { app: { locals: { db } }, body, params, query };
}

module.exports = { hasDb, withSchema, fakeRes, fakeReq };
