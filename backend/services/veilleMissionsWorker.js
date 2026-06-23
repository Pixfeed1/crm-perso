// backend/services/veilleMissionsWorker.js
//
// Planifie le run quotidien de la veille missions à l'heure définie dans
// veille_criteres.heure_run (format "HH:MM", timezone Europe/Paris).
const cron = require('node-cron');
const { runVeille, getCriteres } = require('./veilleMissions');

let db = null;
let cronJob = null;

// "07:30" -> "30 7 * * *" (cron). Repli sur 07:30 si invalide.
function toCron(heure) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((heure || '').trim());
  const h = m ? Math.min(23, parseInt(m[1], 10)) : 7;
  const min = m ? Math.min(59, parseInt(m[2], 10)) : 30;
  return `${min} ${h} * * *`;
}

const initialize = (database) => {
  db = database;
  console.log('[Veille] Worker initialisé');
};

const start = async () => {
  console.log('[Veille] Démarrage du worker…');
  if (!db) { console.error('[Veille] DB non initialisée — worker NON démarré'); return; }
  if (cronJob) { cronJob.stop(); cronJob = null; }

  // Lecture de l'heure (repli 07:30 si table absente / colonne vide / erreur).
  let schedule = '30 7 * * *';
  try {
    const c = await getCriteres(db);
    if (c && c.heure_run) schedule = toCron(c.heure_run);
    else console.warn('[Veille] veille_criteres/heure_run introuvable — planning par défaut 07:30');
  } catch (e) {
    console.error('[Veille] Lecture heure_run échouée (planning par défaut 07:30):', e.message);
  }

  // Programmation du cron (toute erreur est loguée clairement, jamais silencieuse).
  try {
    cronJob = cron.schedule(schedule, async () => {
      console.log('[Veille] Run quotidien automatique...');
      try { await runVeille(db); } catch (e) { console.error('[Veille] Run auto:', e.message); }
    }, { scheduled: true, timezone: 'Europe/Paris' });
    console.log(`[Veille] Cron démarré (schedule: ${schedule})`);
  } catch (e) {
    console.error('[Veille] Échec de la programmation du cron:', e.message);
  }
};

// Reprogramme le cron (appelé après modification de l'heure dans /criteres).
const reschedule = async () => { await start(); };

const stop = () => {
  if (cronJob) { cronJob.stop(); cronJob = null; console.log('[Veille] Cron arrêté'); }
};

module.exports = { initialize, start, reschedule, stop };
