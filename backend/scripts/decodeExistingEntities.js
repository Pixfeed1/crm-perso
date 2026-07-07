// Backfill unique : nettoie les libellés scrapés déjà en base. Idempotent — relançable
// sans risque (n'écrit que si la valeur change). Deux passes :
//   1. décode les entités HTML (crawl_results.title + leads.name) ;
//   2. remplace les titres de pages anti-bot ("Just a moment...", "Checking your browser...")
//      par le domaine (leads) ou NULL (crawl_results).
//
//   node backend/scripts/decodeExistingEntities.js
//
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { decodeHtml } = require('../utils/decodeHtml');
const { isAntibotTitle } = require('../utils/antibotTitle');

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

    // 2) Titres anti-bot : leads renommés avec leur société (= domaine à la promotion),
    //    crawl_results.title remis à NULL (le domaine servira au prochain passage).
    const leadRows = await client.query('SELECT id, name, company FROM leads WHERE name IS NOT NULL');
    let renamed = 0;
    for (const r of leadRows.rows) {
      if (isAntibotTitle(r.name)) {
        await client.query('UPDATE leads SET name = $1 WHERE id = $2', [r.company || r.name, r.id]);
        if (r.company) renamed++;
      }
    }
    console.log(`  leads anti-bot ("Just a moment"...) : ${renamed} renommé(s) avec leur domaine`);

    const crawlRows = await client.query('SELECT id, title FROM crawl_results WHERE title IS NOT NULL');
    let cleared = 0;
    for (const r of crawlRows.rows) {
      if (isAntibotTitle(r.title)) {
        await client.query('UPDATE crawl_results SET title = NULL WHERE id = $1', [r.id]);
        cleared++;
      }
    }
    console.log(`  crawl_results anti-bot : ${cleared} titre(s) effacé(s)`);

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
