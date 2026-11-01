// Lance get_live_page sur de vraies adresses, comme le ferait Claude, sans passer par le MCP.
// Usage, depuis mcp_seo/ :  node scripts/tester-live.js 2 https://jurojin.net/... [15 https://pixfeed.net/... | 15 auto]
// Écrit chaque sortie complète dans /tmp/live-<n>.json et affiche un résumé à comparer avec la page
// ouverte dans un navigateur, plus la taille de la sortie en Ko. N'affiche aucun accès.
import 'dotenv/config';
import fs from 'node:fs';
import { pool } from '../db.js';
import { getLivePage } from '../live.js';

const args = process.argv.slice(2);
if (args.length < 2 || args.length % 2) { console.error('Usage : node scripts/tester-live.js <site_id> <url> [<site_id> <url> …]'); process.exit(1); }
const premiers = (l, n = 3) => (l || []).slice(0, n).join(' | ');

for (let i = 0; i < args.length; i += 2) {
  const siteId = Number(args[i]);
  let url = args[i + 1];
  if (url === 'auto') {   // l'article du site le plus vu dans Search Console (selon le dernier crawl)
    const { rows } = await pool.query(
      `SELECT url FROM seo_pages WHERE site_id = $1 AND type = 'post' ORDER BY COALESCE(gsc_impressions, 0) DESC, url LIMIT 1`, [siteId]);
    if (!rows[0]) { console.log(`\n=== site ${siteId} : aucun article connu du CRM`); continue; }
    url = rows[0].url;
  }
  const t0 = Date.now();
  const o = await getLivePage(pool, siteId, url);
  const json = JSON.stringify(o);
  const fichier = `/tmp/live-${i / 2 + 1}.json`;
  fs.writeFileSync(fichier, json);
  const w = o.wordpress || {}, y = w.yoast || {}, c = o.contenu || {}, p = o.page_publique || {}, e = o.liens_entrants || {};
  console.log(`\n=== ${url}`);
  console.log(`sortie : ${(Buffer.byteLength(json) / 1024).toFixed(1)} Ko, ${((Date.now() - t0) / 1000).toFixed(1)} s, complète dans ${fichier}`);
  if (o.erreur) { console.log(`ERREUR : ${o.erreur}`); continue; }
  if (w.erreur) console.log(`WordPress : ERREUR ${w.erreur.code} ${w.erreur.message}`);
  else {
    console.log(`WordPress : #${w.id} ${w.type} (${w.type_nom}) ${w.statut}, trouvé par ${w.trouve_par}`);
    console.log(`  titre : ${w.titre}`);
    console.log(`  publié ${w.publie_le}, modifié ${w.modifie_le}`);
    console.log(`  catégories : ${(w.categories || []).map((x) => x.nom || x.id).join(', ') || '-'} ; étiquettes : ${(w.etiquettes || []).map((x) => x.nom || x.id).join(', ') || '-'}${w.taxonomies ? ' ; autres : ' + Object.keys(w.taxonomies).join(', ') : ''}`);
    console.log(`  image à la une : ${w.image_a_la_une ? `${w.image_a_la_une.url} (alt : ${w.image_a_la_une.alt})` : '-'}`);
    console.log(`  Yoast : phrase-clé « ${y.phrase_cle ?? '?'} », titre SEO « ${y.titre_seo ?? '?'} »`);
    console.log(`          titre calculé « ${y.titre_seo_calcule ?? '-'} », canonique ${y.canonique ?? '-'}, robots ${y.robots ?? '-'}${y.note ? '\n          NOTE : ' + y.note : ''}`);
    console.log(`  méta : ${y.meta_description ?? '-'}`);
    console.log(`Contenu brut : ${c.mots} mots ; ${c.titres?.total ?? 0} titres ; ${c.paragraphes?.total ?? 0} paragraphes ; liens ${c.liens?.internes ?? 0} internes / ${c.liens?.externes ?? 0} externes ; ${c.images?.total ?? 0} images`);
    console.log(`  titres : ${premiers((c.titres?.items || []).map((h) => `H${h.n} ${h.t}`), 5)}`);
    console.log(`  shortcodes : ${(c.shortcodes || []).map((s) => `${s.nom}×${s.nb}`).join(', ') || 'aucun'}`);
    console.log(`Liens entrants (contenu) : ${e.total ?? 0}${e.items ? ' — ' + premiers(e.items.map((x) => `${x.titre} [${x.ancres.join(' / ')}]`)) : ''}${(e.erreurs || []).length ? `\n  ERREURS : ${e.erreurs.map((x) => `${x.source} ${x.code} ${x.message}`).join(' ; ')}` : ''}`);
  }
  if (p.erreur) console.log(`Page publique : ERREUR ${p.erreur.code} ${p.erreur.message}`);
  else {
    console.log(`Page publique : HTTP ${p.code_http}, finale ${p.adresse_finale}${(p.redirections || []).length ? ` (${p.redirections.length} redirection(s))` : ''}, cache : ${p.cache.servi_par_le_cache}${p.cache.indices?.length ? ' [' + p.cache.indices.join(' ; ') + ']' : ''}`);
    console.log(`  title : ${p.title}`);
    console.log(`  méta : ${p.meta_description}`);
    console.log(`  canonique : ${p.canonique} ; robots : ${p.meta_robots}${p.x_robots_tag ? ' ; X-Robots-Tag : ' + p.x_robots_tag : ''}`);
    console.log(`  H1 : ${JSON.stringify(p.h1)}`);
    const s = p.articles_similaires || {};
    console.log(`  Articles similaires : ${s.total ?? 0} lien(s), ${s.detecte_par}${s.items ? '\n    ' + premiers(s.items.map((x) => `${x.ancre} (${x.href})`), 4) : ''}`);
  }
}
await pool.end();
