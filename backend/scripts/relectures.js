/* Relectures de prepare_draft : ce qu'elles ont coûté, et le seuil d'alerte du jour.
     node scripts/relectures.js              30 dernières relectures, coût par jour, seuil
     node scripts/relectures.js --alerte 30  seuil d'alerte quotidien à 30 $ (mail au-delà, une fois par jour) */
require('dotenv').config();
const { Pool } = require('pg');
const R = require('../services/wpBrouillon/relecture');

const pool = new Pool({ user: process.env.DB_USER || 'postgres', host: process.env.DB_HOST || 'localhost', database: process.env.DB_NAME || 'mcrm_dev', password: process.env.DB_PASSWORD || 'postgres', port: process.env.DB_PORT || 5432 });
const db = { pool };
const n = (x) => Number(x || 0).toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ');
const usd = (x) => `${Number(x || 0).toFixed(2).replace('.', ',')} $`;

(async () => {
  const i = process.argv.indexOf('--alerte');
  if (i > 0) { const v = await R.reglerAlerte(db, process.argv[i + 1]); console.log(`Seuil d'alerte : ${usd(v)} par jour.`); }
  const b = await R.bilan(db);
  console.log('Coût par jour (heure de Paris) :');
  for (const j of b.jours) console.log(`  ${new Date(j.jour).toLocaleDateString('fr-FR')} : ${usd(j.cout)} · ${j.facturees} relecture(s) facturée(s), ${j.sans_appel} sans appel`);
  console.log(`Seuil d'alerte : ${usd(b.alerte_jour_usd)} par jour\n\nDernières relectures :`);
  for (const l of b.lignes) {
    console.log(`  ${new Date(l.created_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} · dépôt ${l.depot_id || '?'} · ${l.mode} · ${usd(l.cout)} · entrée ${n(l.entree)}, sortie ${n(l.sortie)}, cache lu ${n(l.cache_lu)}, cache écrit ${n(l.cache_ecrit)}, ${l.recherches} recherche(s)${l.erreur ? ` · ÉCHEC : ${l.erreur}` : ''} · ${l.repere || ''}`);
  }
})().catch((e) => { console.error('Erreur :', e.message); process.exitCode = 1; })
  .finally(async () => { await pool.end().catch(() => {}); process.exit(process.exitCode || 0); });
