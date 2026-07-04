// Backfill unique : décode les entités HTML déjà stockées dans les libellés scrapés
// (crawl_results.title et leads.name issus du crawl). Idempotent — relançable sans risque
// (ne retouche que les lignes contenant encore un '&', et n'écrit que si la valeur change).
//
//   node backend/scripts/decodeExistingEntities.js
//
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { decodeHtml } = require('../utils/decodeHtml');

async function run() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'crm_db',
  });
  const client = await pool.connect();
  try {
    // On ne cible que les lignes suspectes (avec '&') pour limiter le travail.
    for (const [table, col] of [['crawl_results', 'title'], ['leads', 'name']]) {
      const { rows } = await client.query(
        `SELECT id, ${col} AS val FROM ${table} WHERE ${col} LIKE '%&%'`
      );
      let changed = 0;
      for (const r of rows) {
        const decoded = decodeHtml(r.val);
        if (decoded !== r.val) {
          await client.query(`UPDATE ${table} SET ${col} = $1 WHERE id = $2`, [decoded, r.id]);
          changed++;
        }
      }
      console.log(`  ${table}.${col} : ${changed} ligne(s) décodée(s) sur ${rows.length} candidate(s)`);
    }
    console.log('✓ Backfill terminé.');
  } catch (e) {
    console.error('✗ Backfill échoué :', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
