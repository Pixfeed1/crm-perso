/* Lot 7 : relevé de la boîte d'envoi MAINTENANT, exactement comme le relevé automatique (toutes les
   15 min) : la boîte est ouverte en lecture seule, les réponses et rebonds des prospects sont appliqués
   dans le CRM, les refus probables mis en attente de votre décision. Affiche le résultat ou l'erreur.
   Pour un essai qui n'écrit rien : node scripts/tester-boite.js
   Usage, depuis backend/ :  node scripts/relever-boite.js */
require('dotenv').config();
const { Pool } = require('pg');
const { relever, configuree, acces } = require('../services/boiteService');

const pool = new Pool({ user: process.env.DB_USER || 'postgres', host: process.env.DB_HOST || 'localhost', database: process.env.DB_NAME || 'mcrm_dev', password: process.env.DB_PASSWORD || 'postgres', port: process.env.DB_PORT || 5432 });
const db = { pool };

(async () => {
  const a = acces();
  console.log(`IMAP_HOST : ${a.host || '(absent)'} · identifiant : ${a.auth.user ? 'trouvé' : 'absent'} · mot de passe : ${a.auth.pass ? 'trouvé' : 'absent'}`);
  if (!configuree()) { console.log('Lecture non configurée : le relevé automatique ne démarre pas non plus.'); await pool.end(); process.exit(1); }
  const r = await relever(db);
  console.log(`Relevé terminé : ${r.lus} message(s) lu(s), ${r.retenus} de prospects ${JSON.stringify(r.par_type)}.`);
  if (r.erreurs.length) console.log(`Messages illisibles : ${r.erreurs.length}\n  ${r.erreurs.slice(0, 5).join('\n  ')}`);
  const e = (await pool.query('SELECT releve_le, dernier_uid FROM boite_etat ORDER BY releve_le DESC LIMIT 1')).rows[0];
  console.log(e ? `Dernier relevé enregistré : ${new Date(e.releve_le).toLocaleString('fr-FR')} (jusqu'au message n° ${e.dernier_uid}).` : 'Aucun relevé enregistré.');
  await pool.end();
})().catch(async (e) => { console.error(`Erreur : ${e.message}${e.authenticationFailed ? ' (identifiant ou mot de passe refusé)' : ''}${e.code ? ` [${e.code}]` : ''}`); await pool.end().catch(() => {}); process.exit(1); });
