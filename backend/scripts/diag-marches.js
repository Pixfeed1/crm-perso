/* Marchés publics (BOAMP) : vérifier l'accès à l'API et les noms de champs, puis relever.
     node scripts/diag-marches.js                 accès, champs d'une annonce, classement des 100 dernières (lecture)
     node scripts/diag-marches.js --relever       relevé complet maintenant (comme le bouton), puis le compteur
     node scripts/diag-marches.js --relever --jours 30   relevé sur 30 jours */
require('dotenv').config();
const { Pool } = require('pg');
const M = require('../services/marchesService');

const pool = new Pool({ user: process.env.DB_USER || 'postgres', host: process.env.DB_HOST || 'localhost', database: process.env.DB_NAME || 'mcrm_dev', password: process.env.DB_PASSWORD || 'postgres', port: process.env.DB_PORT || 5432 });
const db = { pool };
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };

(async () => {
  const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const p = await M.pageApi(hier, 0);
  console.log(`API BOAMP : OK, ${p.total ?? '?'} annonce(s) parue(s) le ${hier}`);
  const ex = p.records[0];
  if (!ex) { console.log('Aucune annonce dans la page.'); return; }
  console.log('\nChamps d\'une annonce :');
  for (const [k, v] of Object.entries(ex)) {
    const t = v === null ? 'vide' : Array.isArray(v) ? `liste (${v.length})` : typeof v;
    const apercu = typeof v === 'string' && v.length <= 60 ? ` = ${v}` : Array.isArray(v) && v.length && String(v[0]).length <= 40 ? ` = ${v.slice(0, 3).join(' | ')}` : '';
    console.log(`  ${k} : ${t}${apercu}`);
  }
  const r = await M.reglages(db);
  const a = p.records.map((x) => M.analyser(x, r)).filter(Boolean);
  const par = (c) => a.filter((x) => x.cible === c);
  console.log(`\nClassement des ${p.records.length} dernières : ${par('pertinent').length} pertinent(s), ${par('hors_cible').length} hors cible, ${par('non_pertinent').length} sans rapport, ${p.records.length - a.length} écartée(s) (attribution, résultat, date passée)`);
  for (const x of [...par('pertinent'), ...par('hors_cible')].slice(0, 15)) console.log(`  [${x.score}] ${x.objet.slice(0, 90)} · ${x.themes.join(', ')} · ${x.raisons.join(' ; ')}`);
  if (process.argv.includes('--relever')) {
    console.log('\nRelevé :');
    const surJour = (x) => console.log(`  ${new Date(x.jour).toLocaleDateString('fr-FR')} : ${x.lues} annonce(s) lue(s), ${x.nouveaux} marché(s) web retenu(s)`);
    const out = await M.relever(db, { jours: arg('--jours') ? Number(arg('--jours')) : null, surJour });
    console.log(`  ${out.detail}`);
    const l = await M.lister(db);
    const t = l.totaux;
    console.log(`\n${t.ouverts} marché(s) web ouverts · ${t.nouveaux} nouveau(x) · ${t.maintenance} en maintenance · ${t.en_reponse} en réponse · ${t.hors_cible} hors cible (montant)`);
  }
})().catch((e) => { console.error('Erreur :', e.message); process.exitCode = 1; })
  .finally(async () => { await pool.end().catch(() => {}); process.exit(process.exitCode || 0); });
