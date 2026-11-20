/* Veille Reddit : passage réel maintenant (lecture seule sur Reddit), puis ce qu'il a trouvé.
     node scripts/essai-veille-reddit.js              passage normal (mail des nouvelles annonces)
     node scripts/essai-veille-reddit.js --sans-mail  même passage, sans aucun mail
   Montre : chaque source (lue ou code d'erreur), les annonces gardées dont « Hiring » n'est que dans l'étiquette
   (cas r/HungryArtists), et les raisons d'écart. */
require('dotenv').config();
const { Pool } = require('pg');
const V = require('../services/veilleReddit');

const pool = new Pool({ user: process.env.DB_USER || 'postgres', host: process.env.DB_HOST || 'localhost', database: process.env.DB_NAME || 'mcrm_dev', password: process.env.DB_PASSWORD || 'postgres', port: process.env.DB_PORT || 5432 });
const db = { pool };

(async () => {
  if (V.enPause()) { console.log('Veille Reddit en pause : REDDIT_CLIENT_ID et REDDIT_CLIENT_SECRET absents de backend/.env. Aucun passage lancé.'); return; }
  const t0 = Date.now();
  const deps = process.argv.includes('--sans-mail') ? { mail: async () => {} } : {};
  console.log(`Accès : ${process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET ? 'OAuth' : 'public'} · User-Agent pixfeed-crm/1.0 (by u/${process.env.REDDIT_USERNAME || 'pixfeed'})`);
  const r = await V.passage(db, deps);
  if (r.deja_en_cours) { console.log('Un passage est déjà en cours, réessayer dans une minute.'); return; }
  console.log(`Passage en ${Math.round((Date.now() - t0) / 1000)} s : ${r.lus} annonce(s) lue(s), ${r.nouveaux.length} nouvelle(s), ${r.ecartes} écartée(s), ${r.deja_vus} déjà connue(s) · sources lues ${r.sources_ok}, en erreur ${r.sources_ko}${r.panne ? ` · ${r.panne}` : ''}`);
  for (const e of r.erreurs) console.log(`  ERREUR ${e.source} : ${e.code}`);
  const flair = (await pool.query(`SELECT subreddit, flair, titre FROM veille_reddit WHERE statut = 'nouveau' AND flair ILIKE '%hiring%' AND titre NOT ILIKE '%hiring%' ORDER BY id DESC LIMIT 5`)).rows;
  console.log(`\nGardées avec « Hiring » dans l'étiquette seulement (${flair.length}) :`);
  for (const x of flair) console.log(`  r/${x.subreddit} [${x.flair}] ${x.titre.slice(0, 90)}`);
  const nouv = (await pool.query(`SELECT etiquette, subreddit, titre, budget_texte, mot_cle FROM veille_reddit WHERE id = ANY($1::int[]) ORDER BY publie_le DESC LIMIT 15`, [r.nouveaux])).rows;
  console.log(`\nNouvelles annonces (15 au plus) :`);
  for (const x of nouv) console.log(`  [${x.etiquette}] r/${x.subreddit} · ${x.titre.slice(0, 80)} · ${x.budget_texte || 'sans budget'} · « ${x.mot_cle} »`);
  const raisons = (await pool.query(`SELECT raison_ecart, COUNT(*)::int AS n FROM veille_reddit WHERE statut = 'ecarte_auto' AND cree_le > NOW() - INTERVAL '1 day' GROUP BY 1 ORDER BY 2 DESC LIMIT 10`)).rows;
  console.log('\nRaisons d\'écart (24 h) :');
  for (const x of raisons) console.log(`  ${x.n} × ${x.raison_ecart}`);
})().catch((e) => { console.error('Erreur :', e.message); process.exitCode = 1; })
  .finally(async () => { await pool.end().catch(() => {}); process.exit(process.exitCode || 0); });
