/* Lot 5 : statut unique. Fusionne l'ancien statut Kanban de chaque fiche dans le statut du Suivi.
   SIMULATION par défaut (rien n'est écrit). L'ancien statut reste dans leads.ancien_statut_kanban.
   Usage, depuis backend/ :
     node scripts/migrer-statuts.js              simulation : passages, désaccords à vérifier
     node scripts/migrer-statuts.js --detail     + la liste de toutes les fiches modifiées
     node scripts/migrer-statuts.js --appliquer  écrit exactement ce que montre la simulation */
require('dotenv').config();
const { Pool } = require('pg');
const { planifier, appliquer, lib } = require('../services/statutUnique');

const pool = new Pool({ user: process.env.DB_USER || 'postgres', host: process.env.DB_HOST || 'localhost', database: process.env.DB_NAME || 'mcrm_dev', password: process.env.DB_PASSWORD || 'postgres', port: process.env.DB_PORT || 5432 });
const db = { pool };

(async () => {
  const plan = await planifier(db);
  console.log(`Fiches à examiner : ${plan.total}`);
  console.log(`Inchangées : ${plan.inchanges}`);
  console.log(`Statut modifié : ${plan.changements.length}`);
  for (const [k, n] of Object.entries(plan.par_passage).sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(4)}  ${k}`);
  if (plan.conflits.length) {
    console.log(`\nDésaccords entre Kanban et Suivi (règle appliquée entre parenthèses) : ${plan.conflits.length}`);
    for (const c of plan.conflits.slice(0, 30)) console.log(`   #${c.id} ${c.fiche} : Kanban ${lib(c.kanban)}, Suivi ${lib(c.suivi)} (${c.note})`);
  }
  if (process.argv.includes('--detail')) {
    console.log('\nFiches modifiées :');
    for (const c of plan.changements) console.log(`   #${c.id} ${c.fiche} : ${lib(c.kanban)} + ${lib(c.suivi)} → ${lib(c.apres)}`);
  }
  if (!process.argv.includes('--appliquer')) {
    console.log('\nSIMULATION : rien n\'a été écrit. Pour appliquer : node scripts/migrer-statuts.js --appliquer');
  } else {
    const r = await appliquer(db, plan);
    console.log(`\nÉCRIT : ${r.ecrits} fiche(s) mises à jour, une note dans l'historique de chacune. L'ancien statut Kanban reste archivé.`);
  }
  await pool.end();
})().catch(async (e) => { console.error('Erreur :', e.message); await pool.end().catch(() => {}); process.exit(1); });
