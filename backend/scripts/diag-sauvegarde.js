/* Sauvegardes Google Drive : état, et au besoin envoi ou test lancés ici avec chaque étape affichée.
     node scripts/diag-sauvegarde.js             état seulement (lecture)
     node scripts/diag-sauvegarde.js --tester    redescendre la dernière copie, la déchiffrer, la relire
     node scripts/diag-sauvegarde.js --envoyer   envoyer une copie maintenant
   N'affiche ni le jeton Google ni la clé de chiffrement. */
require('dotenv').config();
const { Pool } = require('pg');
const S = require('../services/sauvegardeDrive');

const pool = new Pool({ user: process.env.DB_USER || 'postgres', host: process.env.DB_HOST || 'localhost', database: process.env.DB_NAME || 'mcrm_dev', password: process.env.DB_PASSWORD || 'postgres', port: process.env.DB_PORT || 5432 });
const db = { pool };
const fmt = (d) => (d ? new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : 'pas encore');
const debut = Date.now();
const surEtape = (t) => console.log(`  [${String(Math.round((Date.now() - debut) / 1000)).padStart(4)} s] ${t}`);

(async () => {
  const e = await S.etat(db);
  console.log(`Google Drive : ${e.connecte ? `connecté (${e.compte || 'compte inconnu'})` : 'pas connecté'}`);
  console.log(`Clé : ${e.cle.presente ? 'présente sur le serveur' : 'ABSENTE'}${e.cle.a_afficher ? ', pas encore rangée (aucun envoi avant)' : ''}${e.cle.coherente ? '' : ', NE CORRESPOND PAS'}`);
  console.log(`Dernier envoi : ${e.envoi ? `${e.envoi.statut} · ${fmt(e.envoi.le)} · ${e.envoi.detail || ''}` : 'pas encore'}`);
  console.log(`Dernier test  : ${e.test ? `${e.test.statut} · ${fmt(e.test.le)} · ${e.test.detail || ''}` : 'pas encore'}`);
  const quoi = process.argv.includes('--tester') ? 'tester' : process.argv.includes('--envoyer') ? 'envoyer' : null;
  if (!quoi) return;
  console.log(`\n${quoi === 'tester' ? 'Test de relecture' : 'Envoi'} :`);
  const r = await (quoi === 'tester' ? S.tester : S.envoyer)(db, { surEtape, mail: async () => {} });
  console.log(`\nOK en ${Math.round((Date.now() - debut) / 1000)} s : ${r.fichier}, ${r.tables} tables`);
})().catch((e) => { console.error(`\nÉCHEC après ${Math.round((Date.now() - debut) / 1000)} s : ${e.message}`); process.exitCode = 1; })
  .finally(async () => { await pool.end().catch(() => {}); process.exit(process.exitCode || 0); });
