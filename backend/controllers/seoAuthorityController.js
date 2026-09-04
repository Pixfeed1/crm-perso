// backend/controllers/seoAuthorityController.js
//
// Autorite du domaine et liens entrants — LECTURE SEULE de seo_authority_daily et
// seo_backlinks, tables remplies par le worker (job 'authority', seo_worker/authority.py).
//
// Ce que montre le tableau de bord Semrush (Authority Score, Backlinks, Domaines referents,
// gagnes/perdus), avec des sources gratuites et nommees : Open PageRank pour l'autorite
// (proxy 0..10, pas la formule Semrush), Bing Webmaster Tools pour la liste des liens.

const clampInt = (v, def, min, max) => Math.min(Math.max(parseInt(v, 10) || def, min), max);

const seoAuthorityController = {
  // GET /api/seo/authority?site_id=&days=30
  getOverview: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt(req.query.site_id, 10);
    if (!siteId) return res.status(400).json({ message: 'site_id requis' });
    const days = clampInt(req.query.days, 30, 7, 365);
    try {
      const site = await db.pool.query('SELECT id, domain, wp_base_url FROM seo_sites WHERE id = $1', [siteId]);
      if (!site.rows[0]) return res.status(404).json({ message: 'Site introuvable' });
      const base = (site.rows[0].wp_base_url || '').replace(/\/+$/, '');
      const status = {
        opr_configured: !!process.env.OPR_API_KEY,
        bing_configured: !!process.env.BING_WMT_API_KEY,
      };

      const { rows: snaps } = await db.pool.query(
        `SELECT date, opr_score::float AS opr_score, opr_rank::int AS opr_rank, opr_referring_domains,
                bing_backlinks, bing_referring_domains, bing_linked_pages
           FROM seo_authority_daily WHERE site_id = $1 ORDER BY date DESC LIMIT 400`,
        [siteId]
      );
      if (!snaps.length) {
        return res.json({ status, site: site.rows[0], days, has_data: false });
      }
      const cur = snaps[0];
      const ref = new Date(cur.date); ref.setDate(ref.getDate() - days);
      const prev = snaps.find((s) => new Date(s.date) <= ref) || null;
      const delta = (a, b, dec = 0) => (a == null || b == null ? null : Math.round((a - b) * Math.pow(10, dec)) / Math.pow(10, dec));

      const { rows: domains } = await db.pool.query(
        `SELECT source_domain, COUNT(*)::int AS links, COUNT(DISTINCT target_url)::int AS targets,
                MIN(first_seen) AS first_seen, MAX(last_seen) AS last_seen,
                (ARRAY_AGG(anchor ORDER BY last_seen DESC, id DESC))[1] AS anchor,
                (ARRAY_AGG(source_url ORDER BY last_seen DESC, id DESC))[1] AS source_url,
                (ARRAY_AGG(target_url ORDER BY last_seen DESC, id DESC))[1] AS target_url,
                BOOL_AND(status = 'lost') AS lost
           FROM seo_backlinks WHERE site_id = $1
          GROUP BY source_domain
          ORDER BY BOOL_AND(status = 'lost'), COUNT(*) DESC, MIN(first_seen) DESC
          LIMIT 500`,
        [siteId]
      );
      const { rows: mv } = await db.pool.query(
        `SELECT COUNT(*) FILTER (WHERE status = 'active' AND first_seen > $2::date - $3::int)::int AS gained,
                COUNT(*) FILTER (WHERE status = 'lost' AND lost_at > $2::date - $3::int)::int AS lost,
                COUNT(DISTINCT source_domain) FILTER (WHERE status = 'active' AND first_seen > $2::date - $3::int)::int AS gained_domains,
                COUNT(DISTINCT source_domain) FILTER (WHERE status = 'lost' AND lost_at > $2::date - $3::int)::int AS lost_domains,
                COUNT(*) FILTER (WHERE status = 'active')::int AS active_links
           FROM seo_backlinks WHERE site_id = $1`,
        [siteId, cur.date, days]
      );
      const { rows: targets } = await db.pool.query(
        `SELECT b.target_url, COUNT(*)::int AS links, COUNT(DISTINCT b.source_domain)::int AS domains, p.title, p.wp_id
           FROM seo_backlinks b
           LEFT JOIN seo_pages p ON p.site_id = $1 AND rtrim(p.url,'/') = rtrim(b.target_url,'/')
          WHERE b.site_id = $1 AND b.status = 'active'
          GROUP BY b.target_url, p.title, p.wp_id
          ORDER BY 3 DESC, 2 DESC LIMIT 30`,
        [siteId]
      );
      const { rows: recent } = await db.pool.query(
        `SELECT source_url, source_domain, target_url, anchor, first_seen, last_seen, status, lost_at
           FROM seo_backlinks WHERE site_id = $1
            AND ((status = 'active' AND first_seen > $2::date - $3::int) OR (status = 'lost' AND lost_at > $2::date - $3::int))
          ORDER BY COALESCE(lost_at, first_seen) DESC LIMIT 100`,
        [siteId, cur.date, days]
      );

      res.json({
        status, site: site.rows[0], days, has_data: true,
        summary: {
          date: cur.date,
          opr_score: cur.opr_score, opr_rank: cur.opr_rank, opr_referring_domains: cur.opr_referring_domains,
          bing_backlinks: cur.bing_backlinks, bing_referring_domains: cur.bing_referring_domains, bing_linked_pages: cur.bing_linked_pages,
          active_links: mv[0].active_links,
          gained: mv[0].gained, lost: mv[0].lost, gained_domains: mv[0].gained_domains, lost_domains: mv[0].lost_domains,
          delta: prev ? {
            opr_score: delta(cur.opr_score, prev.opr_score, 2),
            opr_rank: prev.opr_rank != null && cur.opr_rank != null ? prev.opr_rank - cur.opr_rank : null, // positif = on a gagne des places
            opr_referring_domains: delta(cur.opr_referring_domains, prev.opr_referring_domains),
            bing_backlinks: delta(cur.bing_backlinks, prev.bing_backlinks),
            bing_referring_domains: delta(cur.bing_referring_domains, prev.bing_referring_domains),
          } : null,
        },
        series: snaps.slice().reverse(),
        domains,
        targets: targets.map((t) => ({
          ...t, edit_url: base && t.wp_id != null ? `${base}/wp-admin/post.php?post=${t.wp_id}&action=edit` : null,
        })),
        recent,
      });
    } catch (e) {
      console.error('[SEO] authority:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },
};

module.exports = seoAuthorityController;
