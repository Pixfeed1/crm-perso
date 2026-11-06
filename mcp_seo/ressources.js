// mcp_seo/ressources.js
// get_site_resources : ce qu'il faut connaître d'un site pour écrire. LECTURE SEULE.
// Catégories, étiquettes et glossaire par l'API REST WordPress ; shortcodes déclarés et icônes de
// [spec] par la route de lecture « outils-site/v1/ressources » (mu-plugin, voir wordpress/ressources-site.php).
import { plafonne, compact, decode, txt, requete, erreurHttp, accesWordPress, clientWp, typesWp } from './live.js';

const MAX = { termes: 1000, glossaire: 2000 };
const SRC = {
  termes: 'API REST WordPress (en direct)',
  route: 'route REST de lecture outils-site/v1/ressources (mu-plugin ressources-site.php)',
  redaction: 'route REST outils-site/v1/inventaire (mu-plugin redaction-site.php) + schéma REST de chaque type',
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

export const SECTIONS = ['categories', 'etiquettes', 'glossaire', 'shortcodes', 'icones', 'redaction'];
const PAR_DEFAUT = SECTIONS.filter((x) => x !== 'etiquettes');      // étiquettes (souvent des centaines) : sur demande

/**
 * options : sections (parmi SECTIONS ; défaut : tout sauf etiquettes), etiquettes_recherche (recherche par nom,
 * inclut la section), blocs (noms de blocs dont on veut les attributs), icones (noms à vérifier pour [spec]).
 * Compatibilité : un tableau en 3e argument = la liste d'icônes.
 */
export async function getSiteResources(pool, siteId, options = {}) {
  if (Array.isArray(options)) options = { icones: options };
  const { etiquettes_recherche: recherche, blocs: blocsDetail = [], icones = [] } = options;
  const voulues = new Set(options.sections && options.sections.length ? options.sections.filter((x) => SECTIONS.includes(x)) : PAR_DEFAUT);
  if (recherche) voulues.add('etiquettes');
  if (icones.length) voulues.add('icones');
  if (blocsDetail.length) voulues.add('redaction');
  const sortie = { fetched_at: new Date().toISOString(), site_id: siteId, sections: [...voulues], autres_sections: SECTIONS.filter((x) => !voulues.has(x)) };
  const { rows } = await pool.query('SELECT domain, wp_base_url FROM seo_sites WHERE id = $1', [siteId]);
  if (!rows[0]) return { ...sortie, erreur: `site ${siteId} inconnu du CRM (voir list_sites)` };
  const base = String(rows[0].wp_base_url || `https://${rows[0].domain}`).replace(/\/+$/, '');
  const acces = accesWordPress(siteId);
  const wp = clientWp(base, acces.erreur ? null : acces.auth);       // catégories, étiquettes, glossaire : publics

  const termes = (taxo, q) => bloc(SRC.termes, async () => {
    const liste = await toutes(wp, taxo, { _fields: 'id,name,slug,parent,count', orderby: 'count', order: 'desc', hide_empty: false, ...(q ? { search: q } : {}) }, MAX.termes);
    return { ...(q ? { recherche: q } : {}), ...plafonne(liste.map((t) => ({ id: t.id, nom: decode(t.name), slug: t.slug, parent: t.parent || undefined, contenus: t.count })), MAX.termes) };
  });
  const rien = Promise.resolve(undefined);

  const [categories, etiquettes, glossaire, route] = await Promise.all([
    voulues.has('categories') ? termes('categories') : rien,
    voulues.has('etiquettes') ? termes('tags', recherche) : rien,
    !voulues.has('glossaire') ? rien : bloc(SRC.termes, async () => {
      const types = await typesWp(wp);
      const t = types.find((x) => x.slug === 'glossaire') || types.find((x) => /glossaire/.test(x.rest_base));
      if (!t) return { note: 'pas de type de contenu « glossaire » sur ce site' };
      const liste = await toutes(wp, t.rest_base, { _fields: 'slug,title,link', orderby: 'title', order: 'asc' }, MAX.glossaire);
      return { type: t.slug, ...plafonne(liste.map((x) => ({ slug: x.slug, titre: decode(x.title && x.title.rendered), lien: x.link })), MAX.glossaire) };
    }),
    !(voulues.has('shortcodes') || voulues.has('icones')) ? Promise.resolve({ ignore: true }) : (async () => {
      if (acces.erreur) return { source: SRC.route, erreur: { source: SRC.route, code: 'config', message: acces.erreur } };
      try {
        const q = (icones || []).map((n) => String(n).trim()).filter(Boolean).slice(0, 50);
        const r = await requete(`${base}/wp-json/outils-site/v1/ressources${q.length ? `?icones=${encodeURIComponent(q.join(','))}` : ''}`, { headers: { Authorization: acces.auth, Accept: 'application/json' } });
        if (r.status === 404) return { source: SRC.route, erreur: { source: SRC.route, code: 404, message: 'route non installée sur ce site : node scripts/installer-ressources.js <site_id> <dossier> (dans mcp_seo/)' } };
        if (!r.ok) return { source: SRC.route, erreur: await erreurHttp(r, SRC.route) };
        return { source: SRC.route, ...(await r.json()) };
      } catch (e) { return { source: SRC.route, erreur: { source: SRC.route, code: 'réseau', message: txt(e.message) } }; }
    })(),
  ]);

  const shortcodes = !voulues.has('shortcodes') ? undefined : route.erreur ? route : {
    source: route.source, releve_le: route.releve_le, theme: route.theme,
    ...plafonne((route.shortcodes || []).map((s) => ({ tag: s.tag, origine: s.nom ? `${s.origine} ${s.nom}` : s.origine, fichier: s.fichier, ligne: s.ligne })), 500),
  };
  // inventaire de rédaction (mu-plugin redaction-site.php) : blocs, compositions, types et leurs champs, fichiers
  const redaction = !voulues.has('redaction') ? undefined : acces.erreur ? { source: SRC.redaction, erreur: { source: SRC.redaction, code: 'config', message: acces.erreur } } : await (async () => {
    try {
      const r = await requete(`${base}/wp-json/outils-site/v1/inventaire`, { headers: { Authorization: acces.auth, Accept: 'application/json' } });
      if (r.status === 404) return { source: SRC.redaction, erreur: { source: SRC.redaction, code: 404, message: 'route de rédaction non installée : node scripts/installer-mu.js <site_id> <dossier> redaction-site.php (dans mcp_seo/)' } };
      if (!r.ok) return { source: SRC.redaction, erreur: await erreurHttp(r, SRC.redaction) };
      const inv = await r.json();
      const STANDARD = new Set(['date', 'date_gmt', 'guid', 'id', 'link', 'modified', 'modified_gmt', 'slug', 'status', 'type', 'password', 'permalink_template', 'generated_slug', 'title', 'content', 'author', 'featured_media', 'template', 'meta', 'acf', 'outils_yoast', 'outils_plateformes', 'class_list']);
      const types = await Promise.all((inv.types || []).map(async (t) => {
        let champs = [], meta = [];
        try {
          const o = await requete(`${base}/wp-json/wp/v2/${t.rest_base}`, { method: 'OPTIONS', headers: { Authorization: acces.auth, Accept: 'application/json' } });
          const props = ((await o.json()).schema || {}).properties || {};
          champs = Object.keys(props).filter((k) => !STANDARD.has(k) && !t.taxonomies.some((x) => x === k || (inv.taxonomies || []).some((y) => y.taxonomie === x && y.rest_base === k)));
          meta = Object.keys((props.meta && props.meta.properties) || {});
        } catch { /* type sans schéma lisible */ }
        return {
          type: t.type, rest_base: t.rest_base, nom: t.nom, hierarchique: t.hierarchique || undefined, supports: t.supports,
          taxonomies: t.taxonomies.map((x) => { const y = (inv.taxonomies || []).find((z) => z.taxonomie === x); return y ? `${x} (${y.rest_base})` : x; }),
          modeles: t.modeles, champs_rest: champs, meta, acf: t.acf,
        };
      }));
      const exts = Object.keys(inv.types_fichiers || {}).flatMap((k) => k.split('|'));
      return {
        source: SRC.redaction, releve_le: inv.releve_le,
        types,
        // noms seuls ; attributs pour les blocs demandés (option blocs)
        blocs: { ...plafonne((inv.blocs || []).map((b) => b.nom), 800), note: 'attributs : get_site_resources(site_id, blocs=["core/image", …])' },
        blocs_detail: blocsDetail.length ? (() => {
          const voulus = new Set(blocsDetail);
          const trouves = (inv.blocs || []).filter((b) => voulus.has(b.nom)).map((b) => ({ nom: b.nom, titre: b.titre, attributs: b.attributs }));
          const absents = blocsDetail.filter((n) => !trouves.some((b) => b.nom === n));
          return { items: trouves, absents: absents.length ? absents : undefined };
        })() : undefined,
        compositions: plafonne((inv.compositions || []).map((c) => c.nom), 400),
        reutilisables: plafonne(inv.reutilisables || [], 200),
        fichiers: { extensions: exts, limite_envoi_mo: inv.limite_envoi ? Math.round(inv.limite_envoi / 104857.6) / 10 : undefined },
        acf_actif: inv.acf_actif, yoast_actif: inv.yoast_actif, rewrite_republish: inv.rewrite_republish,
        // « Où regarder » des films, séries, animes : cases + adresses, écrites par la clé plateformes du manifeste.
        plateformes: inv.plateformes && (inv.plateformes.types || []).length ? {
          taxonomie: inv.plateformes.taxonomie,
          types: inv.plateformes.types,
          cases: (inv.plateformes.termes || []).map((x) => x.nom),
          manifeste: 'prepare_draft : "plateformes": { "Disney+": "https://…" } remplace cases et adresses ensemble ; {} décoche tout ; ne pas utiliser taxonomies pour cette taxonomie',
        } : undefined,
      };
    } catch (e) { return { source: SRC.redaction, erreur: { source: SRC.redaction, code: 'réseau', message: txt(e.message) } }; }
  })();
  const iconesSpec = !voulues.has('icones') || route.erreur || route.ignore ? undefined : { source: route.source, releve_le: route.releve_le, ...(route.icones || {}) };
  return compact({ ...sortie, categories, etiquettes, glossaire, shortcodes, icones_spec: iconesSpec, redaction });
}
