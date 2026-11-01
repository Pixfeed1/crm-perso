// mcp_seo/ressources.js
// get_site_resources : ce qu'il faut connaître d'un site pour écrire. LECTURE SEULE.
// Catégories, étiquettes et glossaire par l'API REST WordPress ; shortcodes déclarés et icônes de
// [spec] par la route de lecture « outils-site/v1/ressources » (mu-plugin, voir wordpress/ressources-site.php).
import { plafonne, compact, decode, txt, requete, erreurHttp, accesWordPress, clientWp, typesWp } from './live.js';

const MAX = { termes: 1000, glossaire: 2000 };
const SRC = {
  termes: 'API REST WordPress (en direct)',
  route: 'route REST de lecture outils-site/v1/ressources (mu-plugin ressources-site.php)',
};

/** Toutes les pages d'une collection REST (100 par page), jusqu'à `max` éléments. */
async function toutes(wp, chemin, params, max) {
  const out = [];
  for (let page = 1; out.length < max; page++) {
    const r = await wp(chemin, { ...params, per_page: 100, page });
    if (r.status === 400 && page > 1) break;                     // au-delà de la dernière page
    if (!r.ok) throw await erreurHttp(r, `${SRC.termes} /${chemin}`);
    const j = await r.json();
    if (!Array.isArray(j) || !j.length) break;
    out.push(...j);
    if (page >= Number(r.headers.get('x-wp-totalpages') || 1)) break;
  }
  return out;
}

async function bloc(source, fn) {
  try { return { source, releve_le: new Date().toISOString(), ...(await fn()) }; }
  catch (e) { return { source, erreur: e && e.source ? e : { source, code: (e && e.code) || 'erreur', message: txt(e && e.message) } }; }
}

export async function getSiteResources(pool, siteId) {
  const sortie = { fetched_at: new Date().toISOString(), site_id: siteId };
  const { rows } = await pool.query('SELECT domain, wp_base_url FROM seo_sites WHERE id = $1', [siteId]);
  if (!rows[0]) return { ...sortie, erreur: `site ${siteId} inconnu du CRM (voir list_sites)` };
  const base = String(rows[0].wp_base_url || `https://${rows[0].domain}`).replace(/\/+$/, '');
  const acces = accesWordPress(siteId);
  const wp = clientWp(base, acces.erreur ? null : acces.auth);       // catégories, étiquettes, glossaire : publics

  const termes = (taxo) => bloc(SRC.termes, async () => {
    const liste = await toutes(wp, taxo, { _fields: 'id,name,slug,parent,count', orderby: 'count', order: 'desc', hide_empty: false }, MAX.termes);
    return plafonne(liste.map((t) => ({ id: t.id, nom: decode(t.name), slug: t.slug, parent: t.parent || undefined, contenus: t.count })), MAX.termes);
  });

  const [categories, etiquettes, glossaire, route] = await Promise.all([
    termes('categories'),
    termes('tags'),
    bloc(SRC.termes, async () => {
      const types = await typesWp(wp);
      const t = types.find((x) => x.slug === 'glossaire') || types.find((x) => /glossaire/.test(x.rest_base));
      if (!t) return { note: 'pas de type de contenu « glossaire » sur ce site' };
      const liste = await toutes(wp, t.rest_base, { _fields: 'slug,title,link', orderby: 'title', order: 'asc' }, MAX.glossaire);
      return { type: t.slug, ...plafonne(liste.map((x) => ({ slug: x.slug, titre: decode(x.title && x.title.rendered), lien: x.link })), MAX.glossaire) };
    }),
    (async () => {
      if (acces.erreur) return { source: SRC.route, erreur: { source: SRC.route, code: 'config', message: acces.erreur } };
      try {
        const r = await requete(`${base}/wp-json/outils-site/v1/ressources`, { headers: { Authorization: acces.auth, Accept: 'application/json' } });
        if (r.status === 404) return { source: SRC.route, erreur: { source: SRC.route, code: 404, message: 'route non installée sur ce site : node scripts/installer-ressources.js <site_id> <dossier> (dans mcp_seo/)' } };
        if (!r.ok) return { source: SRC.route, erreur: await erreurHttp(r, SRC.route) };
        return { source: SRC.route, ...(await r.json()) };
      } catch (e) { return { source: SRC.route, erreur: { source: SRC.route, code: 'réseau', message: txt(e.message) } }; }
    })(),
  ]);

  const shortcodes = route.erreur ? route : {
    source: route.source, releve_le: route.releve_le, theme: route.theme,
    ...plafonne((route.shortcodes || []).map((s) => ({ tag: s.tag, origine: s.nom ? `${s.origine} ${s.nom}` : s.origine, fichier: s.fichier, ligne: s.ligne })), 500),
  };
  const icones = route.erreur ? undefined : { source: route.source, releve_le: route.releve_le, ...(route.icones || {}) };
  return compact({ ...sortie, categories, etiquettes, glossaire, shortcodes, icones_spec: icones });
}
