// backend/services/domainSignalWorker.js
//
// Chaque matin (06:15, Europe/Paris) : contrôles à échéance des domaines suivis (J+7, 15, 30,
// 60, 90). L'import du fichier AFNIC reste un geste manuel, sauf AFNIC_AUTO_IMPORT=1 (à activer
// seulement une fois les volumes réels observés).
const cron = require('node-cron');
const service = require('./domainSignalService');

let db = null;
let cronJob = null;

const initialize = (database) => { db = database; service.markInterrupted(db).catch(() => {}); };

const tick = async () => {
  if (!db) return;
  try {
    if (process.env.AFNIC_AUTO_IMPORT === '1') {
      const jour = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const done = await db.pool.query("SELECT 1 FROM domain_signal_imports WHERE jour = $1 AND statut = 'done' LIMIT 1", [jour]);
      if (!done.rows.length) {
        const id = await service.startImport(db, { jour });
        console.log(`[Signaux] Import AFNIC du ${jour} lancé (#${id})`);
        return; // les contrôles passeront demain : un seul traitement lourd à la fois
      }
    }
    const r = await service.recheckDue(db);
    if (r.checked) console.log(`[Signaux] ${r.checked} domaine(s) recontrôlé(s)`);
  } catch (e) {
    console.error('[Signaux] Worker :', e.message);
  }
};

const start = (schedule = '15 6 * * *') => {
  if (!db) { console.error('[Signaux] DB non initialisée — worker NON démarré'); return; }
  if (cronJob) cronJob.stop();
  cronJob = cron.schedule(schedule, tick, { timezone: 'Europe/Paris' });
  console.log(`[Signaux] Worker démarré (${schedule} Europe/Paris)`);
};

const stop = () => { if (cronJob) { cronJob.stop(); cronJob = null; } };

module.exports = { initialize, start, stop, tick };
