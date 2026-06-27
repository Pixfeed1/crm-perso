// backend/controllers/seoController.js
//
// Module SEO — LECTURE SEULE STRICTE. Aucune écriture : toutes les données SEO sont
// produites par le worker Python (seo_worker). Ce contrôleur ne fait que des SELECT.

// Pages légales / utilitaires : fort jus via le footer, mais AUCUN lien éditorial possible
// ni pertinence thématique -> on ne les propose JAMAIS comme donneuses de liens.
// Regex (insensible à la casse) sur un segment de chemin de l'URL.
const LEGAL_DONOR_REGEX = '(^|/)(mentions-legales|mentions|politique-de-confidentialite|confidentialite|privacy|nous-contacter|contact|cgu|cgv|legal)(/|$)';

// Vrai si l'URL est la page d'accueil (racine du domaine, sans chemin).
const isHomeUrl = (url) => /^https?:\/\/[^/]+\/?$/.test(url || '');

// Construit jusqu'à 5 suggestions de liens internes vers `page`.
// Ordre de préférence : même catégorie > accueil > réservoirs (fort jus) > autres pages saines.
// `donorRows` EXCLUT déjà les pages légales (filtrées dans la requête SQL).
async function buildLinkSuggestions(db, siteId, page, donorRows, topReservoirs) {
  const existing = await db.pool.query(
    'SELECT from_url FROM seo_links WHERE site_id = $1 AND to_url = $2',
    [siteId, page.url]
  );
  const linking = new Set(existing.rows.map((r) => r.from_url));
  const norm = (c) => (c || '').toLowerCase().trim();
  const cat = norm(page.category);
  const eligible = (d) => d.url !== page.url && !linking.has(d.url);

  const sameCat = cat ? donorRows.filter((d) => eligible(d) && norm(d.category) === cat) : [];
  const home = donorRows.filter((d) => eligible(d) && isHomeUrl(d.url));
  const others = [...topReservoirs, ...donorRows].filter(eligible);

  const seen = new Set();
  const suggestions = [];
  for (const d of [...sameCat, ...home, ...others]) {
    if (seen.has(d.url)) continue;
    seen.add(d.url);
    suggestions.push({
      url: d.url,
      title: d.title,
      internal_pagerank: d.internal_pagerank,
      reason: cat && norm(d.category) === cat ? 'même catégorie'
        : isHomeUrl(d.url) ? "page d'accueil"
        : d.health === 'reservoir' ? 'réservoir (fort jus)'
        : 'page saine'
    });
    if (suggestions.length >= 5) break;
  }
  return suggestions;
}

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
      // Totaux GSC sur 28 jours (depuis le cache des pages, écrit par le worker au gsc_sync).
      const gsc = await db.pool.query(
        `SELECT COALESCE(SUM(gsc_clicks), 0)::int AS gsc_clicks,
                COALESCE(SUM(gsc_impressions), 0)::int AS gsc_impressions,
                COUNT(*) FILTER (WHERE gsc_synced_at IS NOT NULL)::int AS gsc_pages,
                MAX(gsc_synced_at) AS gsc_synced_at,
                COUNT(*) FILTER (WHERE gsc_position IS NOT NULL AND gsc_position BETWEEN 11 AND 20)::int AS quasi_victoires
         FROM seo_pages WHERE site_id = $1`,
        [siteId]
      );
      res.json({ ...pages.rows[0], total_links: links.rows[0].total_links, ...gsc.rows[0] });
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
                value_score::float AS value_score, health, indexation_status, wp_modified_at, last_crawl,
                gsc_clicks, gsc_impressions, gsc_position::float AS gsc_position, gsc_synced_at
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

      // Donneurs de liens candidats : pages de CONTENU à fort jus (réservoirs + saines),
      // en EXCLUANT les pages légales/utilitaires (cf. LEGAL_DONOR_REGEX).
      const donors = await db.pool.query(
        `SELECT url, title, category, health, internal_pagerank::float AS internal_pagerank FROM seo_pages
         WHERE site_id = $1 AND internal_pagerank IS NOT NULL
           AND health IN ('reservoir', 'saine')
           AND url !~* $2
         ORDER BY internal_pagerank DESC
         LIMIT 200`,
        [siteId, LEGAL_DONOR_REGEX]
      );
      const donorRows = donors.rows;
      const topReservoirs = donorRows.filter((d) => d.health === 'reservoir').slice(0, 10);

      const result = [];
      for (const page of affamees.rows) {
        const suggestions = await buildLinkSuggestions(db, siteId, page, donorRows, topReservoirs);
        result.push({ ...page, suggestions });
      }
      res.json(result);
    } catch (e) {
      console.error('[SEO] getAffamees:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // GET /api/seo/gsc/status -> état de la connexion OAuth Google Search Console.
  // NE RENVOIE JAMAIS client_secret / refresh_token (secrets) : seulement connected/email/date.
  getGscStatus: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const r = await db.pool.query(
        "SELECT account_email, scope, updated_at FROM seo_oauth_tokens WHERE provider = 'google' ORDER BY updated_at DESC LIMIT 1"
      );
      if (r.rows.length === 0) return res.json({ connected: false });
      const row = r.rows[0];
      res.json({ connected: true, account_email: row.account_email, scope: row.scope, updated_at: row.updated_at });
    } catch (e) {
      console.error('[SEO] getGscStatus:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // GET /api/seo/quasi-victoires?site_id= -> pages en position moyenne 11-20 (à pousser).
  getQuasiVictoires: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt(req.query.site_id, 10);
    if (!siteId) return res.status(400).json({ message: 'site_id requis' });
    try {
      const { rows } = await db.pool.query(
        `SELECT id, url, title, category, health,
                internal_pagerank::float AS internal_pagerank,
                value_score::float AS value_score,
                gsc_clicks, gsc_impressions, gsc_position::float AS gsc_position
         FROM seo_pages
         WHERE site_id = $1 AND gsc_position IS NOT NULL AND gsc_position BETWEEN 11 AND 20
         ORDER BY gsc_impressions DESC NULLS LAST, gsc_position ASC
         LIMIT 100`,
        [siteId]
      );
      res.json(rows);
    } catch (e) {
      console.error('[SEO] getQuasiVictoires:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // GET /api/seo/opportunites?site_id=&min_impressions= -> pages à fort potentiel sous-exploité.
  // Croise la demande Google (impressions/clics/position GSC) avec le maillage interne
  // (pagerank/inlinks/health). Score = demande × marge de progression × déficit de maillage.
  // LECTURE SEULE (cache GSC 28j déjà écrit par le worker). Suggestions de liens comme affamées.
  getOpportunites: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt(req.query.site_id, 10);
    if (!siteId) return res.status(400).json({ message: 'site_id requis' });
    const minImpr = Math.max(parseInt(req.query.min_impressions, 10) || 20, 0);
    try {
      const maxRes = await db.pool.query(
        `SELECT COALESCE(MAX(gsc_impressions), 0)::float AS max_impr,
                COALESCE(MAX(internal_pagerank), 0)::float AS max_pr
         FROM seo_pages WHERE site_id = $1`,
        [siteId]
      );
      const maxImpr = Number(maxRes.rows[0].max_impr) || 0;
      const maxPr = Number(maxRes.rows[0].max_pr) || 0;

      // Candidates : Google s'y intéresse (impressions >= plancher) ET signe d'étranglement.
      const cand = await db.pool.query(
        `SELECT id, url, title, category, health,
                internal_pagerank::float AS internal_pagerank, inlinks_count,
                value_score::float AS value_score,
                gsc_impressions, gsc_clicks, gsc_position::float AS gsc_position
         FROM seo_pages
         WHERE site_id = $1 AND COALESCE(gsc_impressions, 0) >= $2::int
           AND (
             (gsc_position IS NOT NULL AND gsc_position BETWEEN 11 AND 50)
             OR COALESCE(inlinks_count, 0) <= 2
             OR health IN ('orpheline', 'affamee')
             OR (internal_pagerank IS NOT NULL AND $3::float > 0 AND internal_pagerank / $3::float < 0.6)
           )`,
        [siteId, minImpr, maxPr]
      );

      // Donneurs de liens (mêmes règles que les pages affamées) : pages de contenu à fort jus,
      // pages légales/utilitaires EXCLUES.
      const donors = await db.pool.query(
        `SELECT url, title, category, health, internal_pagerank::float AS internal_pagerank FROM seo_pages
         WHERE site_id = $1 AND internal_pagerank IS NOT NULL AND health IN ('reservoir', 'saine')
           AND url !~* $2
         ORDER BY internal_pagerank DESC LIMIT 200`,
        [siteId, LEGAL_DONOR_REGEX]
      );
      const donorRows = donors.rows;
      const topReservoirs = donorRows.filter((d) => d.health === 'reservoir').slice(0, 10);

      const result = [];
      for (const p of cand.rows) {
        const impr = Number(p.gsc_impressions) || 0;
        const imprF = maxImpr > 0 ? Math.log1p(impr) / Math.log1p(maxImpr) : 0;
        const pos = p.gsc_position == null ? null : Number(p.gsc_position);
        const posF = pos == null ? 0.5 : pos <= 10 ? 0.2 : pos <= 20 ? 1.0 : pos <= 50 ? 0.6 : 0.25;
        const prRatio = maxPr > 0 ? (Number(p.internal_pagerank) || 0) / maxPr : 0;
        const inl = Number(p.inlinks_count) || 0;
        const inlF = inl <= 2 ? 1 : inl <= 5 ? 0.5 : 0.1;
        const maillageDeficit = Math.min(Math.max(0.6 * (1 - prRatio) + 0.4 * inlF, 0), 1);
        const score = Math.round(100 * imprF * (0.4 + 0.6 * posF) * (0.4 + 0.6 * maillageDeficit));

        // Diagnostic lisible.
        const bits = [];
        if (pos != null) {
          const page = pos > 10 && pos <= 20 ? ' (page 2)' : pos > 20 && pos <= 50 ? ' (page 3-5)' : '';
          bits.push(`position ${pos.toFixed(1)}${page}`);
        }
        bits.push(`${impr} impressions`);
        if (inl <= 2) bits.push(`${inl} lien entrant${inl > 1 ? 's' : ''}`);
        if (maxPr > 0 && prRatio < 0.6) bits.push('faible jus interne');

        // Suggestions de liens internes (même logique factorisée que getAffamees).
        const suggestions = await buildLinkSuggestions(db, siteId, p, donorRows, topReservoirs);
        result.push({ ...p, score, reason: bits.join(' · '), suggestions });
      }
      result.sort((a, b) => b.score - a.score);
      res.json(result.slice(0, 50));
    } catch (e) {
      console.error('[SEO] getOpportunites:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // POST /api/seo/jobs { site_id, job_type } -> crée un job 'pending'.
  // SEULE écriture autorisée côté Node, et UNIQUEMENT sur seo_jobs (jamais seo_pages/seo_links).
  // Le worker Python est seul à passer le job en running/done/failed et à crawler.
  createJob: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt((req.body || {}).site_id, 10);
    const jobType = (req.body || {}).job_type;
    const targetUrl = ((req.body || {}).target_url || '').trim();
    if (!siteId) return res.status(400).json({ message: 'site_id requis' });
    if (!['crawl_full', 'crawl_incremental', 'gsc_sync', 'gsc_test'].includes(jobType)) {
      return res.status(400).json({ message: 'job_type invalide' });
    }
    // Le mode test exige une URL à inspecter (1 seule inspection, aucune écriture SEO).
    if (jobType === 'gsc_test' && !targetUrl) {
      return res.status(400).json({ message: 'URL à tester requise' });
    }
    try {
      const site = await db.pool.query('SELECT id FROM seo_sites WHERE id = $1', [siteId]);
      if (site.rows.length === 0) return res.status(404).json({ message: 'Site introuvable' });
      try {
        const r = await db.pool.query(
          "INSERT INTO seo_jobs (site_id, job_type, status, target_url) VALUES ($1, $2, 'pending', $3) RETURNING *",
          [siteId, jobType, jobType === 'gsc_test' ? targetUrl : null]
        );
        return res.status(201).json({ job: r.rows[0], already_active: false });
      } catch (e) {
        // Conflit sur l'index unique partiel -> un job est déjà actif pour ce site.
        if (e.code === '23505') {
          const active = await db.pool.query(
            "SELECT * FROM seo_jobs WHERE site_id = $1 AND status IN ('pending','running') ORDER BY created_at DESC LIMIT 1",
            [siteId]
          );
          return res.status(200).json({ job: active.rows[0] || null, already_active: true });
        }
        throw e;
      }
    } catch (e) {
      console.error('[SEO] createJob:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // POST /api/seo/jobs/:id/cancel -> demande l'annulation d'un job actif.
  // Écriture sur seo_jobs UNIQUEMENT (comme createJob). Le worker arrête le crawl proprement.
  //  - job 'pending' (pas encore pris) -> 'cancelled' directement (libère la file).
  //  - job 'running'                   -> 'cancel_requested' (le worker finalise).
  cancelJob: async (req, res) => {
    const db = req.app.locals.db;
    const jobId = parseInt(req.params.id, 10);
    if (!jobId) return res.status(400).json({ message: 'id de job requis' });
    try {
      const r = await db.pool.query('SELECT id, status FROM seo_jobs WHERE id = $1', [jobId]);
      const job = r.rows[0];
      if (!job) return res.status(404).json({ message: 'Job introuvable' });
      if (job.status === 'pending') {
        const u = await db.pool.query(
          "UPDATE seo_jobs SET status = 'cancelled', finished_at = NOW(), error = 'annulé depuis l''UI' WHERE id = $1 AND status = 'pending' RETURNING *",
          [jobId]
        );
        // Course possible : le worker vient de le prendre -> il est maintenant 'running'.
        if (u.rows.length === 0) {
          const u2 = await db.pool.query(
            "UPDATE seo_jobs SET status = 'cancel_requested' WHERE id = $1 AND status = 'running' RETURNING *",
            [jobId]
          );
          return res.json({ job: u2.rows[0] || null });
        }
        return res.json({ job: u.rows[0] });
      }
      if (job.status === 'running') {
        const u = await db.pool.query(
          "UPDATE seo_jobs SET status = 'cancel_requested' WHERE id = $1 AND status = 'running' RETURNING *",
          [jobId]
        );
        return res.json({ job: u.rows[0] || null });
      }
      // cancel_requested déjà demandé, ou job terminé (done/failed/cancelled).
      if (job.status === 'cancel_requested') return res.json({ job });
      return res.status(409).json({ message: 'Aucun crawl actif à annuler' });
    } catch (e) {
      console.error('[SEO] cancelJob:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // GET /api/seo/jobs?site_id= -> dernier job du site (statut + progression).
  getJob: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt(req.query.site_id, 10);
    if (!siteId) return res.status(400).json({ message: 'site_id requis' });
    try {
      // Exclut les jobs de test (gsc_test) : ils ont leur propre suivi par id et ne doivent
      // pas polluer le badge d'état des crawls/synchros.
      const r = await db.pool.query(
        "SELECT * FROM seo_jobs WHERE site_id = $1 AND job_type <> 'gsc_test' ORDER BY created_at DESC LIMIT 1",
        [siteId]
      );
      res.json(r.rows[0] || null);
    } catch (e) {
      console.error('[SEO] getJob:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // GET /api/seo/jobs/:id -> un job précis (utilisé pour suivre un test gsc_test).
  getJobById: async (req, res) => {
    const db = req.app.locals.db;
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ message: 'id requis' });
    try {
      const r = await db.pool.query('SELECT * FROM seo_jobs WHERE id = $1', [id]);
      res.json(r.rows[0] || null);
    } catch (e) {
      console.error('[SEO] getJobById:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
};

module.exports = seoController;
