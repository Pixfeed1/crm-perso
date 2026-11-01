/* Provenance du trafic GA4 (lecture seule), par le même chemin que Claude (outil MCP -> backend -> GA4 en direct).
   Usage, depuis backend/ : node scripts/essai-provenance.js <site_id> [jours=7] [canal, ex. Direct] */
require('dotenv').config();

const [siteId, jours, canal] = [Number(process.argv[2]), Number(process.argv[3]) || 7, process.argv[4]];
if (!siteId) { console.error('Usage : node scripts/essai-provenance.js <site_id> [jours] [canal]'); process.exit(1); }

const n = (x) => (x === undefined || x === null ? '-' : x);
function tableau(titre, s, cols) {
  if (!s) return;
  console.log(`\n== ${titre} (${s.affichees} sur ${s.total_valeurs}${s.total ? ` ; total ${s.total.sessions ?? s.total.pages_vues} ${s.total.sessions !== undefined ? 'sessions' : 'pages vues'}` : ''})`);
  for (const i of s.items) console.log(`   ${cols.map((c) => String(n(i[c]))).join(' | ')}${i.sessions !== undefined ? ` | ${i.sessions} sess. | ${n(i.utilisateurs)} util. | eng. ${n(i.taux_engagement_pct)} % | ${n(i.duree_moyenne_engagement_s)} s` : ` | ${i.pages_vues} vues`}${i.statut ? ` | ${i.statut}` : ''}`);
}

(async () => {
  const mcp = await import('../../mcp_seo/brouillon.js');
  const r = await mcp.provenanceGa4(siteId, jours, canal, 15);
  if (r.erreur) { console.log(`ERREUR ${r.erreur.source} : ${r.erreur.message}`); process.exit(1); }
  console.log(`${r.source} ; ${r.periode.jours} jours jusqu'à hier${r.canal ? ` ; canal : ${r.canal}` : ''}`);
  tableau('Canaux', r.canaux, ['canal']);
  tableau('Source / support', r.sources, ['source', 'support']);
  tableau('Sites référents -> page d\'arrivée', r.referents, ['source', 'page_arrivee']);
  tableau('Pages référentes -> page vue', r.pages_referentes, ['page_referente', 'page_vue']);
  tableau('Pays', r.pays, ['pays']);
  tableau('Appareils', r.appareils, ['appareil']);
  tableau('Canal Direct : navigateur / système / appareil', r.direct_navigateurs, ['navigateur', 'systeme', 'appareil']);
  tableau('Pages d\'arrivée', r.pages_arrivee, ['page_arrivee']);
  tableau('Noms d\'hôte', r.hotes, ['hote']);
  console.log(`\nTrafic parasite : ${typeof r.trafic_parasite === 'string' ? r.trafic_parasite : `${r.trafic_parasite.sessions} sessions sur ${r.trafic_parasite.hotes.join(', ')}`}`);
  if (r.note_direct) console.log(`\n${r.note_direct}`);
})().catch((e) => { console.error('Erreur :', e.message); process.exit(1); });
