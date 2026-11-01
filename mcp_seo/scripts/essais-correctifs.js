// Essais réels des correctifs : tailles de get_site_resources, recherche d'étiquettes, check_urls sur un
// guide d'achat (type personnalisé), couverture Search Console et redirections du dossier.
// Usage, depuis mcp_seo/ : node scripts/essais-correctifs.js
import 'dotenv/config';
import { pool } from '../db.js';
import { getSiteResources } from '../ressources.js';
import { checkUrls } from '../checks.js';
import { getPageDossier } from '../dossier.js';

const ko = (x) => `${(Buffer.byteLength(JSON.stringify(x)) / 1024).toFixed(1)} Ko (${JSON.stringify(x).length} caractères)`;
const U = 'https://jurojin.net/motion-capture-pour-blender-les-meilleurs-outils-et-addons/';

console.log('== get_site_resources, jurojin.net');
console.log(`   par défaut (sans étiquettes, blocs en noms seuls) : ${ko(await getSiteResources(pool, 2, {}))}`);
console.log(`   complet (toutes sections)                        : ${ko(await getSiteResources(pool, 2, { sections: ['categories', 'etiquettes', 'glossaire', 'shortcodes', 'icones', 'redaction'] }))}`);
const et = await getSiteResources(pool, 2, { sections: ['categories'], etiquettes_recherche: 'blender' });
console.log(`   étiquettes « blender » : ${et.etiquettes.total} trouvée(s) : ${et.etiquettes.items.slice(0, 6).map((t) => `${t.nom} (#${t.id}, ${t.contenus})`).join(', ')} ; ${ko(et)}`);
const bl = await getSiteResources(pool, 2, { sections: ['redaction'], blocs: ['core/image', 'core/gallery'] });
console.log(`   blocs demandés : ${(bl.redaction.blocs_detail.items || []).map((b) => `${b.nom} (${b.attributs.length} attributs)`).join(', ')} ; ${ko(bl)}`);

console.log('\n== check_urls sur des types personnalisés (guide, logiciel, glossaire)');
const { rows } = await pool.query(`SELECT DISTINCT ON (type) url, type FROM seo_pages WHERE site_id = 2 AND type IN ('guide','logiciel','glossaire') ORDER BY type, gsc_impressions DESC NULLS LAST`);
const c = await checkUrls(pool, 2, rows.map((r) => r.url));
for (const a of c.adresses.items) console.log(`   ${a.code} ${a.url.replace('https://jurojin.net', '')} -> ${a.wordpress ? `#${a.wordpress.id} ${a.wordpress.type} ${a.wordpress.statut || ''} via ${a.wordpress.route || '?'}${a.wordpress.erreur ? ' ERREUR ' + a.wordpress.erreur.message : ''}` : '-'}`);

console.log('\n== get_page_dossier, article Blender');
const d = await getPageDossier(pool, 2, U, 90);
const sc = d.search_console || {};
for (const k of ['total_web_requetes', 'total_web_page']) if (sc[k]) console.log(`   ${k} : ${sc[k].impressions} impressions, ${sc[k].clics} clics — ${sc[k].couverture}`);
for (const k of ['pays', 'appareils', 'requetes']) if (sc[k]) console.log(`   ${k} : ${sc[k].couverture}`);
for (const r of (d.redirections && d.redirections.items) || []) console.log(`   redirection : ${r.de} -> ${r.vers}${r.nature ? ' (' + r.nature + ')' : ''}`);
await pool.end();
