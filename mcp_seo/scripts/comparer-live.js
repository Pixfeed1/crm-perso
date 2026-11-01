// Compare deux séries de sorties get_live_page (avant / après un changement d'accès) sur ce qui compte :
// fiche, Yoast, contenu brut, liens. Sortie 0 si tout est identique, 1 sinon (différences affichées).
// Usage : node scripts/comparer-live.js /tmp/x/avant /tmp/x/apres
import fs from 'node:fs';
import path from 'node:path';

const [avant, apres] = process.argv.slice(2);
const pick = (o) => {
  const w = o.wordpress || {}, y = w.yoast || {}, c = o.contenu || {}, e = o.liens_entrants || {};
  return {
    'accès refusé': w.acces ? w.acces.erreur.code : null, 'note WordPress': w.note || null,
    id: w.id, type: w.type, statut: w.statut, slug: w.slug, titre: w.titre,
    'catégories': JSON.stringify(w.categories || []), 'étiquettes': JSON.stringify(w.etiquettes || []),
    'image à la une': JSON.stringify(w.image_a_la_une || null),
    'phrase-clé': y.phrase_cle ?? null, 'méta Yoast': y.meta_description ?? null, 'titre SEO': y.titre_seo ?? null,
    'source du contenu': c.source || null, mots: c.mots ?? null, shortcodes: JSON.stringify(c.shortcodes || []),
    titres: c.titres?.total ?? null, liens: c.liens?.total ?? null, images: c.images?.total ?? null,
    'liens entrants': e.total ?? null,
  };
};
let diff = 0;
for (const f of fs.readdirSync(avant).filter((x) => x.endsWith('.json')).sort()) {
  const a = JSON.parse(fs.readFileSync(path.join(avant, f))), b = JSON.parse(fs.readFileSync(path.join(apres, f)));
  const pa = pick(a), pb = pick(b);
  const ecarts = Object.keys(pa).filter((k) => String(pa[k]) !== String(pb[k]));
  console.log(`${ecarts.length ? 'DIFFÉRENT' : 'identique'}  ${a.url}`);
  for (const k of ecarts) console.log(`   ${k} : ${String(pa[k]).slice(0, 90)}  ->  ${String(pb[k]).slice(0, 90)}`);
  diff += ecarts.length;
}
process.exit(diff ? 1 : 0);
