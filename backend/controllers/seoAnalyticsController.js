// backend/controllers/seoAnalyticsController.js
//
// Google Analytics 4 — LECTURE SEULE de seo_ga_daily / seo_ga_channels_daily, tables
// remplies par le worker (job 'ga_sync', seo_worker/ga.py), propriete GA4 PAR SITE.
//
// Ce que Search Console ne dit pas : la visite reelle toutes sources, et ce que le
// visiteur en fait. Le rapprochement clics GSC / sessions organiques par page est le
// signal utile : une page classee qui ne retient pas.

const clampInt = (v, def, min, max) => Math.min(Math.max(parseInt(v, 10) || def, min), max);
const pct = (num, den) => (den > 0 ? Math.round((1000 * num) / den) / 10 : null);
const delta = (cur, prev) => (prev > 0 ? Math.round((1000 * (cur - prev)) / prev) / 10 : null);

const seoAnalyticsController = {
  // GET /api/seo/analytics?site_id=&days=28
  // Une reponse : etat de la connexion, synthese (avec variation vs periode precedente),
  // serie quotidienne, canaux, pages (avec clics Search Console en regard).
  getOverview: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt(req.query.site_id, 10);
    if (!siteId) return res.status(400).json({ message: 'site_id requis' });
    const days = clampInt(req.query.days, 28, 7, 365);
    try {
      const siteRow = await db.pool.query('SELECT id, domain, wp_base_url, ga_property_id FROM seo_sites WHERE id = $1', [siteId]);
      const site = siteRow.rows[0];
      if (!site) return res.status(404).json({ message: 'Site introuvable' });
      const tok = await db.pool.query("SELECT scope FROM seo_oauth_tokens WHERE provider = 'google' ORDER BY updated_at DESC LIMIT 1");
      const status = {
        google_connected: tok.rows.length > 0,
        analytics_scope: tok.rows.length > 0 && (tok.rows[0].scope || '').includes('analytics.readonly'),
        property_id: site.ga_property_id || null,
      };

      const bounds = await db.pool.query(
        'SELECT MIN(date) AS mind, MAX(date) AS maxd, COUNT(*)::int AS n FROM seo_ga_daily WHERE site_id = $1', [siteId]
      );
      const { maxd, mind, n } = bounds.rows[0];
      if (!n) {
        return res.json({ status, site: { id: site.id, domain: site.domain }, days, has_data: false });
      }

      // Fenetres : courante = (maxd - days, maxd], precedente = (maxd - 2*days, maxd - days].
      const totals = await db.pool.query(
        `SELECT
           CASE WHEN date > $2::date - $3::int THEN 'cur' ELSE 'prev' END AS win,
           SUM(sessions)::int AS sessions, SUM(organic_sessions)::int AS organic,
           SUM(users)::int AS users, SUM(pageviews)::int AS pageviews,
           CASE WHEN SUM(sessions) > 0 THEN SUM(COALESCE(engagement_rate,0) * sessions) / SUM(sessions) END::float AS engagement_rate,
           CASE WHEN SUM(sessions) > 0 THEN SUM(COALESCE(engagement_seconds,0)) / SUM(sessions) END::float AS avg_engagement_s
         FROM seo_ga_daily
         WHERE site_id = $1 AND date > $2::date - 2 * $3::int
         GROUP BY 1`,
        [siteId, maxd, days]
      );
      const w = { cur: {}, prev: {} };
      for (const r of totals.rows) w[r.win] = r;
      const cur = w.cur, prev = w.prev;

      const series = await db.pool.query(
        `SELECT date, SUM(sessions)::int AS sessions, SUM(organic_sessions)::int AS organic, SUM(users)::int AS users
           FROM seo_ga_daily WHERE site_id = $1 AND date > $2::date - $3::int
          GROUP BY date ORDER BY date`,
        [siteId, maxd, days]
      );

      const channels = await db.pool.query(
        `WITH c AS (
           SELECT channel, SUM(sessions)::int AS sessions, SUM(users)::int AS users, SUM(engaged_sessions)::int AS engaged
             FROM seo_ga_channels_daily WHERE site_id = $1 AND date > $2::date - $3::int GROUP BY channel),
         p AS (
           SELECT channel, SUM(sessions)::int AS sessions
             FROM seo_ga_channels_daily WHERE site_id = $1 AND date <= $2::date - $3::int AND date > $2::date - 2 * $3::int GROUP BY channel)
         SELECT c.channel, c.sessions, c.users, c.engaged, p.sessions AS prev_sessions
           FROM c LEFT JOIN p ON p.channel = c.channel ORDER BY c.sessions DESC`,
        [siteId, maxd, days]
      );
      const chTotal = channels.rows.reduce((a, r) => a + r.sessions, 0);

      // Pages : sessions GA + clics GSC sur la meme fenetre (seo_gsc_daily), par URL.
      const base = (site.wp_base_url || '').replace(/\/+$/, '');
      const pages = await db.pool.query(
        `WITH g AS (
           SELECT page_path, SUM(sessions)::int AS sessions, SUM(organic_sessions)::int AS organic,
                  SUM(pageviews)::int AS pageviews,
                  CASE WHEN SUM(sessions) > 0 THEN SUM(COALESCE(engagement_rate,0) * sessions) / SUM(sessions) END::float AS engagement_rate,
                  CASE WHEN SUM(sessions) > 0 THEN SUM(COALESCE(bounce_rate,0) * sessions) / SUM(sessions) END::float AS bounce_rate
             FROM seo_ga_daily WHERE site_id = $1 AND date > $2::date - $3::int GROUP BY page_path),
         k AS (
           SELECT rtrim(regexp_replace(page_url, '^https?://[^/]+', ''), '/') AS path, SUM(clicks)::int AS clicks, SUM(impressions)::int AS impressions
             FROM seo_gsc_daily WHERE site_id = $1 AND date > $2::date - $3::int GROUP BY 1)
         SELECT g.*, p.title, p.wp_id, p.url,
                k.clicks AS gsc_clicks, k.impressions AS gsc_impressions
           FROM g
           LEFT JOIN seo_pages p ON p.site_id = $1 AND rtrim(regexp_replace(p.url, '^https?://[^/]+', ''), '/') = CASE WHEN g.page_path = '/' THEN '' ELSE g.page_path END
           LEFT JOIN k ON k.path = CASE WHEN g.page_path = '/' THEN '' ELSE g.page_path END
          ORDER BY g.sessions DESC LIMIT 150`,
        [siteId, maxd, days]
      );

      res.json({
        status,
        site: { id: site.id, domain: site.domain },
        days,
        has_data: true,
        range: { from: mind, to: maxd },
        summary: {
          sessions: cur.sessions || 0, users: cur.users || 0, pageviews: cur.pageviews || 0,
          organic_sessions: cur.organic || 0,
          organic_share: pct(cur.organic || 0, cur.sessions || 0),
          engagement_rate: cur.engagement_rate == null ? null : Math.round(cur.engagement_rate * 1000) / 10,
          avg_engagement_s: cur.avg_engagement_s == null ? null : Math.round(cur.avg_engagement_s),
          delta: {
            sessions: delta(cur.sessions || 0, prev.sessions || 0),
            users: delta(cur.users || 0, prev.users || 0),
            organic_sessions: delta(cur.organic || 0, prev.organic || 0),
            pageviews: delta(cur.pageviews || 0, prev.pageviews || 0),
          },
        },
        series: series.rows,
        channels: channels.rows.map((r) => ({
          ...r, share: pct(r.sessions, chTotal), delta: delta(r.sessions, r.prev_sessions || 0),
          engagement_rate: pct(r.engaged, r.sessions),
        })),
        pages: pages.rows.map((r) => ({
          ...r,
          url: r.url || (base ? base + r.page_path : r.page_path),
          edit_url: base && r.wp_id != null ? `${base}/wp-admin/post.php?post=${r.wp_id}&action=edit` : null,
          engagement_rate: r.engagement_rate == null ? null : Math.round(r.engagement_rate * 1000) / 10,
          bounce_rate: r.bounce_rate == null ? null : Math.round(r.bounce_rate * 1000) / 10,
        })),
      });
    } catch (e) {
      console.error('[SEO] analytics:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },
};

module.exports = seoAnalyticsController;
