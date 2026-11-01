/* poser_lien en SIMULATION seulement (rien n'est écrit), par le même chemin que Claude (outil MCP -> backend).
   Usage, depuis backend/ : node scripts/essai-poser-lien.js <site_id> <adresse de la page> "<texte>" <cible> */
require('dotenv').config();

const [siteId, url, texte, cible] = [Number(process.argv[2]), process.argv[3], process.argv[4], process.argv[5]];
if (!siteId || !url || !texte || !cible) { console.error('Usage : node scripts/essai-poser-lien.js <site_id> <page> "<texte>" <cible>'); process.exit(1); }

(async () => {
  const mcp = await import('../../mcp_seo/brouillon.js');
  const r = await mcp.poserLien(siteId, url, texte, cible, true);
  console.log(`statut : ${r.statut || 'ERREUR'}${r.erreur ? ` ; ${r.erreur.source} : ${r.erreur.message}` : ''}`);
  if (r.page) console.log(`page : #${r.page.id} ${r.page.type} « ${r.page.titre} »`);
  if (r.etat_cible) console.log(`cible : ${r.cible} -> HTTP ${r.etat_cible.code || r.etat_cible.erreur}${r.etat_cible.vers ? ` vers ${r.etat_cible.vers}` : ''}`);
  for (const e of r.erreurs || []) console.log(`ERREUR ${e.source} : ${e.message}`);
  for (const a of r.avertissements || []) console.log(`avertissement ${a.source} : ${a.message}`);
  console.log(`occurrences de « ${texte} » : ${(r.occurrences || []).length}`);
  for (const o of r.occurrences || []) console.log(`  ${o.retenue ? 'RETENUE ' : 'écartée '} [${o.bloc}]${o.ecartee ? ` (${o.ecartee})` : ''} : …${o.extrait}…`);
  if (r.extrait) { console.log(`\navant : …${r.extrait.avant}…`); console.log(`après : …${r.extrait.apres}…`); }
  if (r.date_modification) console.log(`\ndate de modification : WordPress ${r.date_modification.wordpress} ; page : ${r.date_modification.page}`);
  console.log('\n(simulation : rien écrit)');
})().catch((e) => { console.error('Erreur :', e.message); process.exit(1); });
