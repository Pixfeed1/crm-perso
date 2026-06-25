// backend/controllers/seoController.js
//
// Module SEO — LECTURE SEULE STRICTE. Aucune écriture : toutes les données SEO sont
// produites par le worker Python (seo_worker). Ce contrôleur ne fait que des SELECT.

const seoController = {
  // GET /api/seo/sites -> liste des sites (sélecteur).
  getSites: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const { rows } = await db.pool.query(
        'SELECT id, domain, wp_base_url, gsc_property, created_at, updated_at FROM seo_sites ORDER BY domain ASC'
      );
      res.json(rows);
    } catch (e) {
      console.error('[SEO] getSites:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // GET /api/seo/overview?site_id= -> compteurs santé + volumétrie + dernier crawl.
  getOverview: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt(req.query.site_id, 10);
    if (!siteId) return res.status(400).json({ message: 'site_id requis' });
    try {
      const pages = await db.pool.query(
        `SELECT
           COUNT(*)::int AS total_pages,
           COUNT(*) FILTER (WHERE health = 'orpheline')::int AS orphelines,
           COUNT(*) FILTER (WHERE health = 'reservoir')::int AS reservoirs,
           COUNT(*) FILTER (WHERE health = 'affamee')::int  AS affamees,
           COUNT(*) FILTER (WHERE health = 'saine')::int     AS saines,
           COUNT(*) FILTER (WHERE health IS NULL)::int       AS non_calcule,
           COUNT(*) FILTER (WHERE indexation_status IS NOT NULL AND indexation_status <> 'indexed')::int AS non_indexees,
           MAX(last_crawl) AS last_crawl
         FROM seo_pages WHERE site_id = $1`,
        [siteId]
      );
      const links = await db.pool.query('SELECT COUNT(*)::int AS total_links FROM seo_links WHERE site_id = $1', [siteId]);
      res.json({ ...pages.rows[0], total_links: links.rows[0].total_links });
    } catch (e) {
      console.error('[SEO] getOverview:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // GET /api/seo/pages?site_id=&sort=pagerank|value&health=&limit= -> liste triée.
  getPages: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt(req.query.site_id, 10);
    if (!siteId) return res.status(400).json({ message: 'site_id requis' });
    const sortCol = req.query.sort === 'value' ? 'value_score' : 'internal_pagerank';
    const limit = Math.min(parseInt(req.query.limit, 10) || 500, 2000);
    const conds = ['site_id = $1'];
    const params = [siteId];
    if (req.query.health) { conds.push(`health = $${params.length + 1}`); params.push(req.query.health); }
    try {
      const { rows } = await db.pool.query(
        `SELECT id, wp_id, url, title, type, category,
                internal_pagerank::float AS internal_pagerank, inlinks_count,
                value_score::float AS value_score, health, indexation_status, wp_modified_at, last_crawl
         FROM seo_pages WHERE ${conds.join(' AND ')}
         ORDER BY ${sortCol} DESC NULLS LAST, url ASC
         LIMIT ${limit}`,
        params
      );
      res.json(rows);
    } catch (e) {
      console.error('[SEO] getPages:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // GET /api/seo/graph?site_id=&limit= -> nœuds (pages + pagerank) + arêtes (liens).
  getGraph: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt(req.query.site_id, 10);
    if (!siteId) return res.status(400).json({ message: 'site_id requis' });
    const limit = Math.min(parseInt(req.query.limit, 10) || 80, 300); // top N pages par jus
    try {
      const nodes = await db.pool.query(
        `SELECT url, title, internal_pagerank::float AS internal_pagerank, inlinks_count,
                health, value_score::float AS value_score
         FROM seo_pages WHERE site_id = $1
         ORDER BY internal_pagerank DESC NULLS LAST LIMIT ${limit}`,
        [siteId]
      );
      const urls = nodes.rows.map((n) => n.url);
      let edges = [];
      if (urls.length) {
        const e = await db.pool.query(
          `SELECT from_url, to_url FROM seo_links
           WHERE site_id = $1 AND from_url = ANY($2) AND to_url = ANY($2)`,
          [siteId, urls]
        );
        edges = e.rows;
      }
      res.json({ nodes: nodes.rows, edges });
    } catch (e) {
      console.error('[SEO] getGraph:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // GET /api/seo/affamees?site_id= -> pages affamées + liens internes suggérés
  // (réservoirs : fort pagerank, qui ne pointent PAS encore vers la page affamée).
  getAffamees: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt(req.query.site_id, 10);
    if (!siteId) return res.status(400).json({ message: 'site_id requis' });
    try {
      const affamees = await db.pool.query(
        `SELECT id, url, title, category, internal_pagerank::float AS internal_pagerank,
                inlinks_count, value_score::float AS value_score
         FROM seo_pages WHERE site_id = $1 AND health = 'affamee'
         ORDER BY value_score DESC NULLS LAST, internal_pagerank ASC NULLS FIRST
         LIMIT 50`,
        [siteId]
      );

      // Donneurs de liens candidats : pages à fort jus (réservoirs + saines), avec leur
      // catégorie -> on privilégiera la MÊME catégorie que l'affamée (lien contextuel),
      // avec repli sur les meilleurs réservoirs globaux.
      const donors = await db.pool.query(
        `SELECT url, title, category, health, internal_pagerank::float AS internal_pagerank FROM seo_pages
         WHERE site_id = $1 AND internal_pagerank IS NOT NULL
           AND health IN ('reservoir', 'saine')
         ORDER BY internal_pagerank DESC
         LIMIT 200`,
        [siteId]
      );
      const donorRows = donors.rows;
      const topReservoirs = donorRows.filter((d) => d.health === 'reservoir').slice(0, 10);

      const norm = (c) => (c || '').toLowerCase().trim();
      const result = [];
      for (const page of affamees.rows) {
        // Pages qui pointent DÉJÀ vers l'affamée -> à ne pas resuggérer.
        const existing = await db.pool.query(
          'SELECT from_url FROM seo_links WHERE site_id = $1 AND to_url = $2',
          [siteId, page.url]
        );
        const linking = new Set(existing.rows.map((r) => r.from_url));
        const cat = norm(page.category);

        const eligible = (d) => d.url !== page.url && !linking.has(d.url);
        // 1) Priorité : même catégorie (lien le plus pertinent).
        const sameCat = cat ? donorRows.filter((d) => eligible(d) && norm(d.category) === cat) : [];
        // 2) Repli : meilleurs réservoirs globaux (fort jus), puis autres donneurs.
        const fallback = [...topReservoirs, ...donorRows].filter(eligible);

        const seen = new Set();
        const suggestions = [];
        for (const d of [...sameCat, ...fallback]) {
          if (seen.has(d.url)) continue;
          seen.add(d.url);
          suggestions.push({
            url: d.url,
            title: d.title,
            internal_pagerank: d.internal_pagerank,
            reason: cat && norm(d.category) === cat ? 'même catégorie' : (d.health === 'reservoir' ? 'réservoir (fort jus)' : 'page saine'),
          });
          if (suggestions.length >= 5) break;
        }
        result.push({ ...page, suggestions });
      }
      res.json(result);
    } catch (e) {
      console.error('[SEO] getAffamees:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
};

module.exports = seoController;
