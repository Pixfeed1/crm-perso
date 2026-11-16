/* Signal « prestataire en difficulté ou disparu » : compteur et indices restants.
     node scripts/etat-prestataires.js              lecture seule
     node scripts/etat-prestataires.js --verifier   vérification complète d'abord (comme « Vérifier maintenant »)
   N'affiche aucun accès. */
require('dotenv').config();
const { Pool } = require('pg');
const P = require('../services/prestataireService');

const pool = new Pool({ user: process.env.DB_USER || 'postgres', host: process.env.DB_HOST || 'localhost', database: process.env.DB_NAME || 'mcrm_dev', password: process.env.DB_PASSWORD || 'postgres', port: process.env.DB_PORT || 5432 });
const db = { pool };
const fmt = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');

(async () => {
  if (process.argv.includes('--verifier')) {
    const inv = await P.inventaire(db);
    console.log(`Inventaire : ${inv.prestataires} prestataire(s), ${inv.nouveaux} nouveau(x), ${inv.retires.length} faux prestataire(s) retiré(s)${inv.retires.length ? ` (${inv.retires.join(', ')})` : ''}`);
    const debut = new Date();
    let n = 0;
    const surAvancee = (x) => { n += 1; console.log(`${String(n).padStart(4)}. ${x.domaine} : ${x.statut}${x.erreur ? ` (${x.erreur})` : ''}`); };
    for (;;) { const r = await P.verifier(db, { limite: 100, pas_depuis: debut, surAvancee }); if (r.verifies < 100) break; }
    console.log(`Vérification terminée : ${n} prestataire(s).`);
  }
  const l = await P.lister(db, { gravite_min: 0 });
  const t = l.totaux;
  console.log(`\n${t.procedure || 0} en procédure · ${t.ferme || 0} fermés · ${t.abandon || 0} indices · ${t.actif || 0} sans problème · ${t.a_verifier || 0} à vérifier`);
  const indices = l.prestataires.filter((p) => p.statut === 'abandon');
  console.log(`\nIndices restants (${indices.length}) :`);
  for (const p of indices) {
    console.log(`- ${p.domaine}${p.nom ? ` (${p.nom})` : ''} · ${p.nb_clients} site(s) client(s)`);
    for (const x of p.preuves || []) console.log(`    ${x.niveau === 0 ? 'faible' : 'indice'} : ${x.nature} (${x.source || 'vérification du site'} du ${fmt(x.date)})`);
  }
  for (const s of ['procedure', 'ferme', 'a_verifier']) {
    const liste = l.prestataires.filter((p) => p.statut === s && (s !== 'a_verifier' || p.verifie_le));
    if (liste.length) console.log(`\n${{ procedure: 'En procédure', ferme: 'Fermés', a_verifier: 'À vérifier (fermés selon les registres, site actif)' }[s]} : ${liste.map((p) => `${p.domaine} (${p.nb_clients})`).join(', ')}`);
  }
})().catch((e) => { console.error('Erreur :', e.message); process.exitCode = 1; })
  // Fin nette : des connexions HTTP gardées ouvertes (keep-alive) ne doivent pas retenir le script.
  .finally(async () => { await pool.end().catch(() => {}); process.exit(process.exitCode || 0); });
