/* Rattrapage des relances des campagnes déjà envoyées : une tâche « appel » par prospect sans suite,
   étalée sur 10 par jour ouvré. SIMULATION par défaut (rien n'est écrit).
   Usage, depuis backend/ :
     node scripts/rattrapage-relances.js                       simulation, toutes campagnes
     node scripts/rattrapage-relances.js --campagne 3          une seule campagne
     node scripts/rattrapage-relances.js --par-jour 8 --debut 2026-11-09
     node scripts/rattrapage-relances.js --appliquer           crée les tâches (même calcul que la simulation) */
require('dotenv').config();
const { Pool } = require('pg');
const { planifier, appliquer } = require('../services/relanceRattrapage');

const arg = (n, def = null) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : def; };
const pool = new Pool({ user: process.env.DB_USER || 'postgres', host: process.env.DB_HOST || 'localhost', database: process.env.DB_NAME || 'mcrm_dev', password: process.env.DB_PASSWORD || 'postgres', port: process.env.DB_PORT || 5432 });
const db = { pool };
const jj = (iso) => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : '?');

(async () => {
  const plan = await planifier(db, { campagne: arg('campagne') ? Number(arg('campagne')) : null, par_jour: Number(arg('par-jour', 10)), debut: arg('debut'), canal: arg('canal', 'appel') });
  console.log(`Emails de campagne partis (un par prospect) : ${plan.envoyes}`);
  console.log(`Tâches à créer : ${plan.retenus.length} (canal ${plan.canal}, ${plan.par_jour} par jour ouvré)`);
  console.log(`Exclus : ${plan.exclus.length}`);
  for (const [r, n] of Object.entries(plan.raisons_exclusion)) console.log(`   ${String(n).padStart(4)}  ${r}`);
  console.log('\nPlanning :');
  for (const [d, n] of Object.entries(plan.par_date)) console.log(`   ${jj(d)} : ${n}`);
  console.log('\nLes 12 premières tâches :');
  for (const x of plan.retenus.slice(0, 12)) console.log(`   ${jj(x.echeance)}  ${x.entreprise}  (email du ${jj(x.envoye_le)})`);
  if (!process.argv.includes('--appliquer')) {
    console.log('\nSIMULATION : rien n\'a été écrit. Pour créer ces tâches : node scripts/rattrapage-relances.js --appliquer');
  } else {
    const r = await appliquer(db, plan);
    console.log(`\nÉCRIT : ${r.crees} tâche(s) de relance créée(s)${r.ignores ? `, ${r.ignores} ignorée(s) (relance ouverte entre-temps)` : ''}. Elles sont dans Portefeuille → Suivi.`);
  }
  await pool.end();
})().catch(async (e) => { console.error('Erreur :', e.message); await pool.end().catch(() => {}); process.exit(1); });
