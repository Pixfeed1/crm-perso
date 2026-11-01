// Essais réels des outils get_page_dossier, check_urls et get_site_resources (comme Claude les appelle).
// Résumé court + tailles en Ko ; sorties complètes dans /tmp/etape2-*.json. N'affiche aucun accès.
// Usage, depuis mcp_seo/ : node scripts/essais-etape2.js
import 'dotenv/config';
import fs from 'node:fs';
import { pool } from '../db.js';
import * as tools from '../tools.js';
import { getPageDossier } from '../dossier.js';
import { checkUrls } from '../checks.js';
import { getSiteResources } from '../ressources.js';

const ko = (x, indent) => (Buffer.byteLength(JSON.stringify(x, null, indent ? 2 : 0)) / 1024).toFixed(1);
const ecrire = (nom, x) => fs.writeFileSync(`/tmp/etape2-${nom}.json`, JSON.stringify(x));
const U = 'https://jurojin.net/motion-capture-pour-blender-les-meilleurs-outils-et-addons/';

console.log('== 1. get_page_dossier (article Blender)');
const d = await getPageDossier(pool, 2, U, 90); ecrire('dossier', d);
for (const k of ['indexation', 'sitemap', 'search_console', 'mots_cles', 'cannibalisation', 'liens_entrants_crawl', 'backlinks', 'redirections']) {
  const b = d[k] || {};
  const date = b.releve_le || b.date_du_crawl || (b.periode && `${b.periode.debut} → ${b.periode.fin}`) || '';
  const resume = b.erreur ? `ERREUR ${b.erreur.code} ${b.erreur.message}` : ({
    indexation: `${b.verdict || b.note || '?'} ${b.couverture ? '(' + b.couverture + ')' : ''}`,
    sitemap: b.present ? `présente (${b.fichier}, lastmod ${b.lastmod})` : 'absente',
    search_console: b.total_web ? `${b.total_web.impressions} impressions, ${b.total_web.clics} clics, position ${b.total_web.position} ; ${b.requetes ? b.requetes.total : 0} requêtes` : 'aucune donnée',
    mots_cles: b.items ? b.items.map((m) => `${m.requete} = ${m.impressions_bing ?? '?'}`).slice(0, 3).join(' ; ') : b.note || '',
    cannibalisation: `${b.requetes_partagees ? b.requetes_partagees.total : 0} requête(s) partagée(s) ; phrase-clé « ${b.phrase_cle} »${b.phrase_cle_partagee_avec ? ' partagée avec ' + b.phrase_cle_partagee_avec.length + ' page(s)' : ''}`,
    liens_entrants_crawl: `${b.entrants ? b.entrants.total : 0} lien(s) entrant(s) au crawl`,
    backlinks: `${b.actifs || 0} actif(s), ${b.domaines || 0} domaine(s), ${b.dofollow || 0} dofollow`,
    redirections: b.items ? `${b.items.length} redirection(s)` : b.note || '',
  })[k];
  console.log(`   ${k.padEnd(22)} ${resume}${date ? '   [' + String(date).slice(0, 25) + ']' : ''}`);
}
const unParUn = [
  ['get_page_keywords', await tools.getPageKeywords(pool, 2, U, 90)], ['get_position_context', await tools.getPositionContext(pool, 2, U, 90)],
  ['get_page_links', await tools.getPageLinks(pool, 2, U)], ['get_cannibalisation', await tools.getCannibalisation(pool, 2, 90, 5)],
  ['get_focus_keyword_conflicts', await tools.getFocusKeywordConflicts(pool, 2)], ['check_sitemap', await tools.checkSitemap(pool, 2, U)],
  ['get_redirects', await tools.getRedirects(pool, 2, 200)],
];
const total = unParUn.reduce((n, [, x]) => n + Number(ko(x, true)), 0);
console.log(`   taille : dossier ${ko(d)} Ko, contre ${total.toFixed(1)} Ko pour les ${unParUn.length} outils existants appelés un par un (${unParUn.map(([n, x]) => `${n} ${ko(x, true)}`).join(', ')})`);

console.log('\n== 2. check_urls (10 adresses mêlées)');
const urls = [
  U, 'https://jurojin.net/logiciels/akeytsu/', 'https://jurojin.net/glossaire-3d/add-on/',
  'https://jurojin.net/cette-page-n-existe-pas-verification/', 'https://jurojin.net/logiciels/akeytsu',
  'https://www.blender.org/', 'https://www.rokoko.com/', 'https://www.blender.org/cette-page-n-existe-pas/',
  'http://blender.org/', 'https://pixfeed.net/',
];
const c = await checkUrls(pool, 2, urls); ecrire('check', c);
for (const a of (c.adresses && c.adresses.items) || []) {
  const w = a.wordpress || {};
  console.log(`   ${String(a.code || a.erreur?.code).padEnd(7)} ${a.url.replace(/^https?:\/\//, '').slice(0, 52).padEnd(52)} ${a.adresse_finale ? '-> ' + a.adresse_finale.replace(/^https?:\/\//, '').slice(0, 40) + ' ' : ''}${a.interne ? `| ${w.id ? '#' + w.id + ' ' + (w.type || '?') + ' ' + (w.statut || '?') : w.note || ''}${a.noindex ? ' NOINDEX' : ''}${a.indexation ? ' | index : ' + (a.indexation.verdict || a.indexation.note) : ''}` : ''}`);
}
console.log(`   taille : ${ko(c)} Ko ; résumé ${JSON.stringify(c.resume)}`);

for (const id of [2, 15]) {
  console.log(`\n== 3. get_site_resources (site ${id})`);
  const r = await getSiteResources(pool, id, ['puzzle', 'lock', 'clock']); ecrire(`ressources-${id}`, r);
  const n = (b) => (b && b.erreur ? `ERREUR ${b.erreur.code} ${b.erreur.message}` : b ? `${b.total ?? (b.note || 0)}` : '-');
  console.log(`   catégories ${n(r.categories)} ; étiquettes ${n(r.etiquettes)} ; glossaire ${n(r.glossaire)} ; shortcodes ${n(r.shortcodes)}`);
  const i = r.icones_spec || {};
  if (i.rendu) {
    console.log(`   icônes [spec] : rendu par ${i.rendu.fonction} (${i.rendu.fichier} l. ${i.rendu.ligne}) ; ${Object.keys(i.correspondances || {}).length} noms dans la table ; nom inconnu : ${i.nom_inconnu}`);
    if (i.sprite) console.log(`   sprite : ${i.sprite.fichier}, ${i.sprite.symboles} symboles`);
    for (const v of i.verification || []) console.log(`   ${v.icon.padEnd(7)} -> ${v.etat}${v.symbole ? ' (symbole « ' + v.symbole + ' »)' : ''}`);
  } else console.log(`   icônes [spec] : ${i.note || (r.shortcodes && r.shortcodes.erreur ? 'route en erreur' : '-')}`);
  console.log(`   taille : ${ko(r)} Ko`);
}
await pool.end();
