// backend/controllers/seoIndexationController.js
//
// Onglet « Indexation » : les rapports d'indexation Google, sitemap, redirections et
// focus keywords, regroupes en UNE reponse pour l'UI.
//
// Les requetes SQL vivent dans mcp_seo/tools.js : ce sont exactement celles que Claude
// utilise via le connecteur MCP. Les reecrire ici aurait donne deux versions qui
// divergent avec le temps (un seuil corrige d'un cote, pas de l'autre). On importe donc
// le module ESM du MCP depuis ce backend CommonJS (import() dynamique, Node >= 18), et on
// n'ajoute ici que ce qui manque a l'UI : le lien d'EDITION WordPress de chaque page a
// corriger, pour passer du constat a l'action en un clic.
const path = require('path');
const { pathToFileURL } = require('url');

let toolsPromise = null;
function loadTools() {
  if (!toolsPromise) {
    const file = path.join(__dirname, '..', '..', 'mcp_seo', 'tools.js');
    toolsPromise = import(pathToFileURL(file).href).catch((e) => {
      toolsPromise = null; // permet de reessayer au prochain appel (deploiement partiel)
      throw new Error(`mcp_seo/tools.js introuvable ou invalide : ${e.message}`);
    });
  }
  return toolsPromise;
}

const rtrim = (u) => (u || '').replace(/\/+$/, '');

// Index des pages du site (url normalisee -> titre, wp_id, type) : UNE requete, puis
// enrichissement en memoire de toutes les sections. ~1 200 lignes par site, negligeable.
async function pageIndex(pool, siteId) {
  const { rows } = await pool.query(
    'SELECT url, title, wp_id, type FROM seo_pages WHERE site_id = $1', [siteId]
  );
  const m = new Map();
  for (const r of rows) m.set(rtrim(r.url), r);
  return m;
}

// Lien d'edition WordPress : l'action concrete derriere chaque constat.
// wp_id vient du REST WordPress au crawl ; sans lui (page hors WP, archive), pas de lien.
function editUrl(site, page) {
  if (!site || !site.wp_base_url || !page || page.wp_id == null) return null;
  return `${rtrim(site.wp_base_url)}/wp-admin/post.php?post=${page.wp_id}&action=edit`;
}

function describe(site, index, url) {
  const p = index.get(rtrim(url));
  return {
    url,
    title: p ? p.title : null,
    type: p ? p.type : null,
    edit_url: editUrl(site, p),
  };
}

const clampInt = (v, def, min, max) => Math.min(Math.max(parseInt(v, 10) || def, min), max);

const seoIndexationController = {
  // GET /api/seo/indexation?site_id=&stale_days=90&changes_days=30
  // Toutes les sections d'un coup (8 requetes en parallele cote serveur, 1 aller-retour
  // cote client). Chaque section garde la forme renvoyee au MCP, plus les liens d'edition.
  getReport: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt(req.query.site_id, 10);
    if (!siteId) return res.status(400).json({ message: 'site_id requis' });
    const staleDays = clampInt(req.query.stale_days, 90, 7, 730);
    const changesDays = clampInt(req.query.changes_days, 30, 1, 365);
    try {
      const siteRow = await db.pool.query('SELECT id, domain, wp_base_url FROM seo_sites WHERE id = $1', [siteId]);
      const site = siteRow.rows[0];
      if (!site) return res.status(404).json({ message: 'Site introuvable' });

      const tools = await loadTools();
      const pool = db.pool;
      const [index, summary, g404, canonical, stale, changes, sitemap, redirects, focus] = await Promise.all([
        pageIndex(pool, siteId),
        tools.getIndexationSummary(pool, siteId),
        tools.getGoogle404s(pool, siteId, 200),
        tools.getCanonicalMismatches(pool, siteId, 200),
        tools.getStaleCrawls(pool, siteId, staleDays, 200),
        tools.getIndexationChanges(pool, siteId, changesDays, 300),
        tools.getSitemapGaps(pool, siteId, 300),
        tools.getRedirects(pool, siteId, 300),
        tools.getFocusKeywordConflicts(pool, siteId),
      ]);

      // 404 : la page a corriger n'est pas la 404 elle-meme (elle n'existe plus) mais
      // chaque page qui pointe encore vers elle. referring_urls (Google) le dit.
      const pages404 = g404.pages.map((r) => ({
        ...r,
        referring: (r.referring_urls || []).map((u) => describe(site, index, u)),
      }));

      // Redirections : quelles pages du site lient encore l'ancienne URL ? Tant qu'un
      // lien interne vise une redirection, chaque visite paie un saut inutile, et une
      // redirection vers l'accueil est une soft 404 aux yeux de Google.
      const fromUrls = redirects.redirections.map((r) => r.from_url);
      const linkedFrom = new Map();
      if (fromUrls.length) {
        const { rows } = await pool.query(
          `SELECT DISTINCT from_url, to_url FROM seo_links
            WHERE site_id = $1 AND rtrim(to_url,'/') = ANY($2)`,
          [siteId, [...new Set(fromUrls.map(rtrim))]]
        );
        for (const l of rows) {
          const k = rtrim(l.to_url);
          if (!linkedFrom.has(k)) linkedFrom.set(k, []);
          linkedFrom.get(k).push(l.from_url);
        }
      }
      const redirectRows = redirects.redirections.map((r) => {
        const from = linkedFrom.get(rtrim(r.from_url)) || [];
        return {
          ...r,
          linked_from_count: from.length,
          linked_from: from.slice(0, 10).map((u) => describe(site, index, u)),
        };
      });

      const withEdit = (rows) => rows.map((r) => ({ ...r, edit_url: editUrl(site, index.get(rtrim(r.url))) }));

      res.json({
        site: { id: site.id, domain: site.domain, wp_base_url: site.wp_base_url },
        params: { stale_days: staleDays, changes_days: changesDays },
        summary,
        google_404s: { ...g404, pages: pages404 },
        canonical: { ...canonical, pages: withEdit(canonical.pages) },
        stale: { ...stale, pages: withEdit(stale.pages) },
        changes: { ...changes, changements: withEdit(changes.changements) },
        sitemap: {
          ...sitemap,
          absentes: withEdit(sitemap.absentes),
        },
        redirects: { ...redirects, redirections: redirectRows },
        focus_conflicts: {
          ...focus,
          details: focus.details.map((c) => ({
            ...c,
            pages: (c.pages || []).map((p) => ({ ...p, edit_url: editUrl(site, index.get(rtrim(p.url))) })),
          })),
        },
      });
    } catch (e) {
      console.error('[SEO] indexation report:', e.message);
      res.status(500).json({ message: e.message.startsWith('mcp_seo/') ? e.message : 'Erreur serveur' });
    }
  },

  // GET /api/seo/indexation/sitemap-check?site_id=&url=
  checkSitemap: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt(req.query.site_id, 10);
    const url = (req.query.url || '').trim();
    if (!siteId || !url) return res.status(400).json({ message: 'site_id et url requis' });
    try {
      const tools = await loadTools();
      res.json(await tools.checkSitemap(db.pool, siteId, url));
    } catch (e) {
      console.error('[SEO] sitemap check:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },
};

module.exports = seoIndexationController;
