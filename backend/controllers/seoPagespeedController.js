// backend/controllers/seoPagespeedController.js
//
// Core Web Vitals / PageSpeed des sites SEO — LECTURE SEULE de seo_pagespeed, table
// remplie par le worker Python (job 'pagespeed', module seo_worker/pagespeed.py).
//
// Deux jeux de chiffres coexistent volontairement :
//   - field_* : CrUX, utilisateurs reels sur 28 jours (p75). C'est CE que Google utilise
//     pour le classement. Absent sur les pages a faible trafic.
//   - le reste : labo Lighthouse, reproductible, disponible pour toute page. Sert a
//     diagnostiquer (opportunites) et a mesurer l'effet d'une optimisation le jour meme.

// Seuils officiels Core Web Vitals (bon / a ameliorer / mauvais).
const CWV = {
  lcp: [2500, 4000],
  inp: [200, 500],
  cls: [0.1, 0.25],
};
const rate = (v, [good, poor]) => (v == null ? null : v <= good ? 'good' : v <= poor ? 'needs' : 'poor');

const seoPagespeedController = {
  // GET /api/seo/pagespeed?site_id= -> derniere mesure par (url, strategy) + precedente
  // (delta) + synthese. Le worker lit le meme .env : api_key_configured dit si le quota
  // PageSpeed confortable (cle) est en place, ou si l'on est sur le quota anonyme.
  getLatest: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt(req.query.site_id, 10);
    if (!siteId) return res.status(400).json({ message: 'site_id requis' });
    try {
      const { rows } = await db.pool.query(
        `WITH latest AS (
           SELECT DISTINCT ON (url, strategy) *
             FROM seo_pagespeed WHERE site_id = $1
            ORDER BY url, strategy, checked_at DESC
         )
         SELECT l.*, p.title, p.gsc_impressions, p.wp_id,
                prev.perf_score AS prev_score, prev.checked_at AS prev_checked_at
           FROM latest l
           LEFT JOIN seo_pages p ON p.site_id = $1 AND rtrim(p.url,'/') = rtrim(l.url,'/')
           LEFT JOIN LATERAL (
             SELECT perf_score, checked_at FROM seo_pagespeed s
              WHERE s.site_id = l.site_id AND s.url = l.url AND s.strategy = l.strategy
                AND s.checked_at < l.checked_at AND s.perf_score IS NOT NULL
              ORDER BY s.checked_at DESC LIMIT 1
           ) prev ON true
          ORDER BY COALESCE(p.gsc_impressions, 0) DESC, l.url, l.strategy`,
        [siteId]
      );
      const site = await db.pool.query('SELECT wp_base_url FROM seo_sites WHERE id = $1', [siteId]);
      // Couverture de la rotation : pages mesurees au moins une fois / pages mesurables (hors noindex).
      const cov = await db.pool.query(
        `SELECT COUNT(*) FILTER (WHERE m.url IS NOT NULL)::int AS mesurees, COUNT(*)::int AS total
           FROM seo_pages p
           LEFT JOIN (SELECT DISTINCT url FROM seo_pagespeed WHERE site_id = $1) m ON m.url = p.url
          WHERE p.site_id = $1 AND COALESCE((p.seo_meta->>'noindex')::boolean, false) = false`,
        [siteId]
      );
      const rotation = Math.max(1, parseInt(process.env.PSI_ROTATION_PAGES, 10) || 30);
      const restantes = Math.max(0, cov.rows[0].total - cov.rows[0].mesurees);
      const base = ((site.rows[0] || {}).wp_base_url || '').replace(/\/+$/, '');
      const isHome = (u) => /^https?:\/\/[^/]+\/?$/.test(u || '');

      // Regroupe par URL : { url, title, mobile: {...}, desktop: {...} }.
      const byUrl = new Map();
      for (const r of rows) {
        if (!byUrl.has(r.url)) {
          byUrl.set(r.url, {
            url: r.url,
            title: r.title,
            gsc_impressions: r.gsc_impressions,
            is_home: isHome(r.url),
            edit_url: base && r.wp_id != null ? `${base}/wp-admin/post.php?post=${r.wp_id}&action=edit` : null,
            mobile: null,
            desktop: null,
          });
        }
        byUrl.get(r.url)[r.strategy] = {
          perf_score: r.perf_score,
          prev_score: r.prev_score,
          delta: r.perf_score != null && r.prev_score != null ? r.perf_score - r.prev_score : null,
          lcp_ms: r.lcp_ms, cls: r.cls == null ? null : Number(r.cls), tbt_ms: r.tbt_ms,
          fcp_ms: r.fcp_ms, si_ms: r.si_ms, ttfb_ms: r.ttfb_ms,
          field: {
            lcp_ms: r.field_lcp_ms, inp_ms: r.field_inp_ms,
            cls: r.field_cls == null ? null : Number(r.field_cls), ttfb_ms: r.field_ttfb_ms,
            category: r.field_category,
            lcp: rate(r.field_lcp_ms, CWV.lcp), inp: rate(r.field_inp_ms, CWV.inp),
            cls_rating: rate(r.field_cls == null ? null : Number(r.field_cls), CWV.cls),
          },
          origin_category: r.origin_category,
          opportunities: r.opportunities || [],
          error: r.error,
          checked_at: r.checked_at,
        };
      }
      const pages = [...byUrl.values()];

      // Synthese : accueil (la page que Google mesure en premier), moyenne mobile, part
      // des pages « bonnes » en donnees reelles, derniere mesure.
      const home = pages.find((p) => p.is_home) || null;
      const mobileScores = pages.map((p) => p.mobile && p.mobile.perf_score).filter((s) => s != null);
      const withField = pages.filter((p) => p.mobile && p.mobile.field.category);
      const goodField = withField.filter((p) => p.mobile.field.category === 'FAST').length;
      const lastChecked = rows.reduce((m, r) => (!m || r.checked_at > m ? r.checked_at : m), null);
      const originCategory = (home && home.mobile && home.mobile.origin_category)
        || (rows.find((r) => r.origin_category) || {}).origin_category || null;

      res.json({
        api_key_configured: !!(process.env.PAGESPEED_API_KEY || process.env.CRUX_API_KEY),
        summary: {
          pages_mesurees: pages.length,
          couverture_mesurees: cov.rows[0].mesurees,
          couverture_total: cov.rows[0].total,
          // Nombre de runs encore necessaires pour que chaque page ait ete mesuree une fois.
          runs_restants: Math.ceil(restantes / rotation),
          home_mobile: home && home.mobile ? home.mobile.perf_score : null,
          home_desktop: home && home.desktop ? home.desktop.perf_score : null,
          moyenne_mobile: mobileScores.length ? Math.round(mobileScores.reduce((a, b) => a + b, 0) / mobileScores.length) : null,
          cwv_bon: goodField,
          cwv_evaluees: withField.length,
          origin_category: originCategory,
          derniere_mesure: lastChecked,
        },
        thresholds: CWV,
        pages,
      });
    } catch (e) {
      console.error('[SEO] pagespeed latest:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // GET /api/seo/pagespeed/history?site_id=&url=&strategy=mobile -> serie des scores.
  getHistory: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt(req.query.site_id, 10);
    const url = (req.query.url || '').trim();
    const strategy = req.query.strategy === 'desktop' ? 'desktop' : 'mobile';
    if (!siteId || !url) return res.status(400).json({ message: 'site_id et url requis' });
    try {
      const { rows } = await db.pool.query(
        `SELECT checked_at, perf_score, lcp_ms, cls, tbt_ms, field_lcp_ms, field_inp_ms, field_cls, field_category
           FROM seo_pagespeed
          WHERE site_id = $1 AND url = $2 AND strategy = $3
          ORDER BY checked_at ASC LIMIT 200`,
        [siteId, url, strategy]
      );
      res.json(rows);
    } catch (e) {
      console.error('[SEO] pagespeed history:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },
};

module.exports = seoPagespeedController;
