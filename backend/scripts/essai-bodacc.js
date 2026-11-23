/* Agences web au BODACC : relevé maintenant (comme celui de 6 h 37), puis ce qu'il a trouvé.
     node scripts/essai-bodacc.js              jours pas encore relevés (une semaine au plus)
     node scripts/essai-bodacc.js --jours 3    les 3 derniers jours
     node scripts/essai-bodacc.js --sans-mail  sans le mail récapitulatif
   Aucune API d'IA : BODACC, annuaire des entreprises et crawler, gratuits. */
require('dotenv').config();
const { Pool } = require('pg');
const B = require('../services/prestatairesBodacc');

const pool = new Pool({ user: process.env.DB_USER || 'postgres', host: process.env.DB_HOST || 'localhost', database: process.env.DB_NAME || 'mcrm_dev', password: process.env.DB_PASSWORD || 'postgres', port: process.env.DB_PORT || 5432 });
const db = { pool };
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };

(async () => {
  const t0 = Date.now();
  const deps = process.argv.includes('--sans-mail') ? { mail: async () => {} } : {};
  // Progression : une ligne toutes les 100 annonces, et chaque entreprise du web dès qu'elle est trouvée.
  deps.surProgression = ({ jour, fait, total, web, trouve }) => {
    const j = new Date(jour).toLocaleDateString('fr-FR');
    if (trouve) console.log(`  ${j} · ${fait}/${total} · WEB : ${trouve.nom || trouve.siren} (${trouve.ville || '?'}) · ${trouve.nature}${trouve.domaine ? ` · site ${trouve.domaine}, ${trouve.nb_clients} client(s)` : ' · site non trouvé'}`);
    else console.log(`  ${j} · ${fait}/${total} annonce(s) vérifiée(s), ${web} du web`);
  };
  const jours = arg('--jours') ? Number(arg('--jours')) : null;
  if (jours) await pool.query("DELETE FROM bodacc_jours WHERE jour >= CURRENT_DATE - $1::int", [jours]).catch(() => {});   // relire ces jours
  const r = await B.relever(db, deps, { jours });
  if (r.deja_en_cours) { console.log('Un relevé est déjà en cours.'); return; }
  for (const j of r.jours) console.log(`${new Date(j.jour).toLocaleDateString('fr-FR')} : ${j.annonces} annonce(s) (procédures et radiations), ${j.web} entreprise(s) du web`);
  if (!r.jours.length) console.log('Aucun jour à relever (déjà faits) : --jours 3 pour relire les 3 derniers.');
  console.log(`\n${r.nouveaux.length} nouvelle(s) entreprise(s) du web en ${Math.round((Date.now() - t0) / 1000)} s :`);
  for (const f of r.nouveaux) console.log(`  ${f.nom || f.siren} (${f.ville || '?'}) · ${f.naf_libelle} · ${f.nature} · ${f.domaine ? `site ${f.domaine} (${f.domaine_source}), ${f.nb_clients} client(s)` : 'site non trouvé'}${f.liquidateur ? ` · ${f.liquidateur}` : ''}`);
  const pf = await B.portefeuillesEnAttente(db, deps);
  if (pf.length) console.log(`\nRéférences lues pour ${pf.length} prestataire(s) déjà connu(s) : ${pf.map((x) => `${x.domaine} (${x.rattaches ?? 0} client(s)${x.erreur ? `, ${x.erreur}` : ''})`).join(', ')}`);
})().catch((e) => { console.error('Erreur :', e.message); process.exitCode = 1; })
  .finally(async () => { await pool.end().catch(() => {}); process.exit(process.exitCode || 0); });
