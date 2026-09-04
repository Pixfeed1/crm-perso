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
// Chevauchement de requêtes GSC : pour chaque page cible, les donneurs qui captent des
// impressions sur les MÊMES requêtes Google (fenêtre 28j) = relation sémantique prouvée
// par Google. UNE seule requête groupée pour toutes les cibles (pas de N+1). Renvoie
// Map(cible -> Map(donneur -> { shared, queries[] })), URLs normalisées sans slash final.
// Les requêtes partagées servent aussi d'idées d'ANCRE pour le lien.
const rtrimSlash = (u) => (u || '').replace(/\/+$/, '');
async function buildQueryOverlap(db, siteId, targetUrls, donorUrls, days = 28) {
  const targets = [...new Set(targetUrls.map(rtrimSlash))];
  const donors = [...new Set(donorUrls.map(rtrimSlash))];
  const overlap = new Map();
  if (!targets.length || !donors.length) return overlap;
  const { rows } = await db.pool.query(
    `WITH bounds AS (SELECT MAX(date) AS maxd FROM seo_gsc_daily WHERE site_id = $1),
     t AS (
       SELECT rtrim(page_url, '/') AS url, query, SUM(impressions) AS impr
       FROM seo_gsc_daily, bounds
       WHERE site_id = $1 AND date > bounds.maxd - $2::int AND rtrim(page_url, '/') = ANY($3)
       GROUP BY 1, 2
     ),
     d AS (
       SELECT rtrim(page_url, '/') AS url, query, SUM(impressions) AS impr
       FROM seo_gsc_daily, bounds
       WHERE site_id = $1 AND date > bounds.maxd - $2::int AND rtrim(page_url, '/') = ANY($4)
       GROUP BY 1, 2
     )
     SELECT t.url AS target_url, d.url AS donor_url, COUNT(*)::int AS shared,
            (ARRAY_AGG(t.query ORDER BY LEAST(t.impr, d.impr) DESC))[1:3] AS queries
     FROM t JOIN d ON d.query = t.query AND d.url <> t.url
     GROUP BY t.url, d.url`,
    [siteId, days, targets, donors]
  );
  for (const r of rows) {
    if (!overlap.has(r.target_url)) overlap.set(r.target_url, new Map());
    overlap.get(r.target_url).set(r.donor_url, { shared: r.shared, queries: r.queries || [] });
  }
  return overlap;
}

// Similarité de contenu (TF-IDF calculée par le worker, table seo_similar_pages) :
// Map(cible -> Map(page similaire -> score)), une seule requête pour toutes les cibles.
async function buildSimilarityMap(db, siteId, targetUrls) {
  const targets = [...new Set(targetUrls.map(rtrimSlash))];
  const map = new Map();
  if (!targets.length) return map;
  const { rows } = await db.pool.query(
    `SELECT rtrim(url, '/') AS url, rtrim(similar_url, '/') AS similar_url, score::float AS score
     FROM seo_similar_pages WHERE site_id = $1 AND rtrim(url, '/') = ANY($2)`,
    [siteId, targets]
  );
  for (const r of rows) {
    if (!map.has(r.url)) map.set(r.url, new Map());
    map.get(r.url).set(r.similar_url, r.score);
  }
  return map;
}

// `donorRows` EXCLUT déjà les pages légales (filtrées dans la requête SQL).
// `overlapMap` (optionnel) : résultat de buildQueryOverlap pour le palier "requêtes partagées".
// `simMap` (optionnel) : résultat de buildSimilarityMap pour le palier "contenu similaire".
async function buildLinkSuggestions(db, siteId, page, donorRows, topReservoirs, overlapMap, simMap) {
  const existing = await db.pool.query(
    'SELECT from_url FROM seo_links WHERE site_id = $1 AND to_url = $2',
    [siteId, page.url]
  );
  const linking = new Set(existing.rows.map((r) => r.from_url));
  const norm = (c) => (c || '').toLowerCase().trim();
  const cat = norm(page.category);
  const eligible = (d) => d.url !== page.url && !linking.has(d.url);

  // Requêtes GSC partagées = signal le plus fiable (Google lui-même relie les deux pages) ->
  // palier n°1, trié par nombre de requêtes communes. Les requêtes servent d'idées d'ancre.
  const pageOverlap = (overlapMap && overlapMap.get(rtrimSlash(page.url))) || new Map();
  const sharedQueries = (d) => (pageOverlap.get(rtrimSlash(d.url)) || { shared: 0 }).shared;
  const byQueries = pageOverlap.size
    ? donorRows.filter((d) => eligible(d) && sharedQueries(d) > 0).sort((a, b) => sharedQueries(b) - sharedQueries(a))
    : [];

  // Tags communs = signal sémantique éditorial (plus fin que la catégorie) -> palier n°2.
  const pageTags = new Set((Array.isArray(page.tags) ? page.tags : []).map(norm).filter(Boolean));
  const sharedTags = (d) => {
    if (!pageTags.size || !Array.isArray(d.tags)) return 0;
    let n = 0;
    for (const t of d.tags) if (pageTags.has(norm(t))) n++;
    return n;
  };
  const byTags = pageTags.size
    ? donorRows.filter((d) => eligible(d) && sharedTags(d) > 0).sort((a, b) => sharedTags(b) - sharedTags(a))
    : [];

  // Contenu similaire (TF-IDF worker) = palier n°3 : relie les pages qui parlent du même
  // sujet même sans tag ni historique GSC commun (pages récentes notamment).
  const pageSim = (simMap && simMap.get(rtrimSlash(page.url))) || new Map();
  const simScore = (d) => pageSim.get(rtrimSlash(d.url)) || 0;
  const bySim = pageSim.size
    ? donorRows.filter((d) => eligible(d) && simScore(d) > 0).sort((a, b) => simScore(b) - simScore(a))
    : [];

  const sameCat = cat ? donorRows.filter((d) => eligible(d) && norm(d.category) === cat) : [];
  const home = donorRows.filter((d) => eligible(d) && isHomeUrl(d.url));
  const others = [...topReservoirs, ...donorRows].filter(eligible);

  const seen = new Set();
  const suggestions = [];
  for (const d of [...byQueries, ...byTags, ...bySim, ...sameCat, ...home, ...others]) {
    if (seen.has(d.url)) continue;
    seen.add(d.url);
    const nQ = sharedQueries(d);
    const nTags = sharedTags(d);
    const sim = simScore(d);
    // Raison composée : on empile les signaux présents (requêtes > tags > similarité > catégorie).
    const parts = [];
    if (nQ > 0) parts.push(`${nQ} requête${nQ > 1 ? 's' : ''} Google partagée${nQ > 1 ? 's' : ''}`);
    if (nTags > 0) parts.push(`${nTags} tag${nTags > 1 ? 's' : ''} en commun`);
    if (sim > 0) parts.push(`contenu similaire (${Math.round(sim * 100)} %)`);
    if (cat && norm(d.category) === cat) parts.push('même catégorie');
    const reason = parts.length ? parts.join(' · ')
      : isHomeUrl(d.url) ? "page d'accueil"
      : d.health === 'reservoir' ? 'réservoir (fort jus)'
      : 'page saine';
    const anchors = nQ > 0 ? (pageOverlap.get(rtrimSlash(d.url)).queries || []) : [];
    suggestions.push({
      url: d.url,
      title: d.title,
      internal_pagerank: d.internal_pagerank,
      reason,
      ...(anchors.length ? { anchors } : {})
    });
    if (suggestions.length >= 5) break;
  }
  return suggestions;
}

// Normalise et valide la saisie d'un site. Le domaine est la cle (UNIQUE) ; l'URL WordPress
// et la propriete Search Console se deduisent du domaine quand elles sont omises.
function normalizeSiteInput(body) {
  let domain = String(body.domain || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
  if (!domain) return { error: 'Domaine requis' };
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    return { error: 'Domaine invalide (attendu : exemple.fr)' };
  }
  let wp = String(body.wp_base_url || '').trim().replace(/\/+$/, '') || `https://${domain}`;
  if (!/^https?:\/\/[^\s/]+(\/[^\s]*)?$/.test(wp)) return { error: 'URL WordPress invalide (attendu : https://exemple.fr)' };
  let gsc = String(body.gsc_property || '').trim() || `sc-domain:${domain}`;
  if (!/^(sc-domain:[a-z0-9.-]+|https?:\/\/[^\s]+)$/.test(gsc)) {
    return { error: 'Propriété Search Console invalide (sc-domain:exemple.fr ou https://exemple.fr/)' };
  }
  // Propriete Google Analytics 4 : identifiant NUMERIQUE (Admin > Parametres de la
  // propriete > ID). On accepte aussi la forme "properties/123" et on ne garde que les chiffres.
  let ga = String(body.ga_property_id || '').trim().replace(/^properties\//, '');
  if (ga && !/^\d{5,16}$/.test(ga)) return { error: 'ID de propriété GA4 invalide (attendu : chiffres uniquement, ex. 123456789)' };
  return { domain, wp_base_url: wp, gsc_property: gsc, ga_property_id: ga || null };
}

const seoController = {
  // GET /api/seo/sites -> liste des sites (sélecteur).
  getSites: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const { rows } = await db.pool.query(
        'SELECT id, domain, wp_base_url, gsc_property, ga_property_id, created_at, updated_at FROM seo_sites ORDER BY domain ASC'
      );
      res.json(rows);
    } catch (e) {
      console.error('[SEO] getSites:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // ----- Gestion des sites (config UTILISATEUR : Node PEUT ecrire seo_sites, comme la
  // watchlist et seo_jobs). Avant, ajouter un site = editer config.py du worker + redeployer.
  // Le worker lit desormais seo_sites au demarrage de chaque job : l'UI suffit.
  // Les DONNEES (pages, liens, GSC) restent ecrites par le worker uniquement.

  // POST /api/seo/sites { domain, wp_base_url?, gsc_property? }
  createSite: async (req, res) => {
    const db = req.app.locals.db;
    const v = normalizeSiteInput(req.body || {});
    if (v.error) return res.status(400).json({ message: v.error });
    try {
      const r = await db.pool.query(
        `INSERT INTO seo_sites (domain, wp_base_url, gsc_property, ga_property_id) VALUES ($1, $2, $3, $4)
         RETURNING id, domain, wp_base_url, gsc_property, ga_property_id, created_at, updated_at`,
        [v.domain, v.wp_base_url, v.gsc_property, v.ga_property_id]
      );
      res.status(201).json(r.rows[0]);
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ message: 'Ce domaine est déjà suivi' });
      console.error('[SEO] createSite:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // PUT /api/seo/sites/:id { domain, wp_base_url, gsc_property }
  updateSite: async (req, res) => {
    const db = req.app.locals.db;
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ message: 'id requis' });
    const v = normalizeSiteInput(req.body || {});
    if (v.error) return res.status(400).json({ message: v.error });
    try {
      const r = await db.pool.query(
        `UPDATE seo_sites SET domain = $1, wp_base_url = $2, gsc_property = $3, ga_property_id = $4, updated_at = NOW()
          WHERE id = $5 RETURNING id, domain, wp_base_url, gsc_property, ga_property_id, created_at, updated_at`,
        [v.domain, v.wp_base_url, v.gsc_property, v.ga_property_id, id]
      );
      if (r.rows.length === 0) return res.status(404).json({ message: 'Site introuvable' });
      res.json(r.rows[0]);
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ message: 'Ce domaine est déjà suivi' });
      console.error('[SEO] updateSite:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // DELETE /api/seo/sites/:id -> supprime le site ET toutes ses donnees (FK ON DELETE
  // CASCADE : pages, liens, GSC, audits, indexation, PageSpeed). Irreversible, d'ou la
  // confirmation par saisie du domaine cote UI ; refuse si un job est en cours.
  deleteSite: async (req, res) => {
    const db = req.app.locals.db;
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ message: 'id requis' });
    try {
      const active = await db.pool.query(
        "SELECT 1 FROM seo_jobs WHERE site_id = $1 AND status IN ('pending','running','cancel_requested') LIMIT 1",
        [id]
      );
      if (active.rows.length) return res.status(409).json({ message: 'Une tâche est en cours sur ce site : attendre sa fin ou l’annuler' });
      const r = await db.pool.query('DELETE FROM seo_sites WHERE id = $1 RETURNING domain', [id]);
      if (r.rows.length === 0) return res.status(404).json({ message: 'Site introuvable' });
      res.json({ deleted: r.rows[0].domain });
    } catch (e) {
      console.error('[SEO] deleteSite:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // GET /api/seo/schedule?site_id= -> planification nocturne du worker : reglages (memes
  // variables d'environnement que le worker, .env partage) + derniere chaine planifiee.
  getSchedule: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt(req.query.site_id, 10);
    if (!siteId) return res.status(400).json({ message: 'site_id requis' });
    const enabled = !['0', 'false', 'non', ''].includes(String(process.env.SEO_SCHEDULE ?? '1').trim());
    const hour = parseInt(process.env.SEO_SCHEDULE_HOUR, 10);
    const fullWeekday = parseInt(process.env.SEO_SCHEDULE_FULL_WEEKDAY, 10);
    try {
      const last = await db.pool.query(
        `SELECT job_type, status, scheduled_for, created_at, finished_at, error
           FROM seo_jobs WHERE site_id = $1 AND source = 'schedule'
          ORDER BY created_at DESC LIMIT 6`,
        [siteId]
      );
      res.json({
        enabled,
        hour: Number.isFinite(hour) ? hour : 4,
        tz: process.env.SEO_SCHEDULE_TZ || 'Europe/Paris',
        full_weekday: Number.isFinite(fullWeekday) ? fullWeekday : 6,
        pagespeed: !!(process.env.PAGESPEED_API_KEY || process.env.CRUX_API_KEY),
        last_day: last.rows[0] ? last.rows[0].scheduled_for : null,
        last_jobs: last.rows.filter((r) => !last.rows[0] || String(r.scheduled_for) === String(last.rows[0].scheduled_for)).reverse(),
      });
    } catch (e) {
      console.error('[SEO] getSchedule:', e.message);
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
           COUNT(*) FILTER (
             WHERE indexation_status IS NOT NULL
               AND NOT (indexation_status ILIKE '%indexed%' AND indexation_status NOT ILIKE '%not indexed%')
           )::int AS non_indexees,
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
        `SELECT id, url, title, category, tags, internal_pagerank::float AS internal_pagerank,
                inlinks_count, value_score::float AS value_score
         FROM seo_pages WHERE site_id = $1 AND health = 'affamee'
         ORDER BY value_score DESC NULLS LAST, internal_pagerank ASC NULLS FIRST
         LIMIT 50`,
        [siteId]
      );

      // Donneurs de liens candidats : pages de CONTENU à fort jus (réservoirs + saines),
      // en EXCLUANT les pages légales/utilitaires (cf. LEGAL_DONOR_REGEX).
      const donors = await db.pool.query(
        `SELECT url, title, category, tags, health, internal_pagerank::float AS internal_pagerank FROM seo_pages
         WHERE site_id = $1 AND internal_pagerank IS NOT NULL
           AND health IN ('reservoir', 'saine')
           AND url !~* $2
         ORDER BY internal_pagerank DESC
         LIMIT 200`,
        [siteId, LEGAL_DONOR_REGEX]
      );
      const donorRows = donors.rows;
      const topReservoirs = donorRows.filter((d) => d.health === 'reservoir').slice(0, 10);
      // Chevauchement de requêtes GSC + similarité de contenu : UNE fois pour toutes les affamées.
      const affameeUrls = affamees.rows.map((p) => p.url);
      const [overlapMap, simMap] = await Promise.all([
        buildQueryOverlap(db, siteId, affameeUrls, donorRows.map((d) => d.url)),
        buildSimilarityMap(db, siteId, affameeUrls)
      ]);

      const result = [];
      for (const page of affamees.rows) {
        const suggestions = await buildLinkSuggestions(db, siteId, page, donorRows, topReservoirs, overlapMap, simMap);
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
      res.json({
        connected: true, account_email: row.account_email, scope: row.scope, updated_at: row.updated_at,
        // Analytics exige un scope de plus : un consentement anterieur ne le couvre pas.
        analytics: (row.scope || '').includes('analytics.readonly')
      });
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

  // GET /api/seo/cannibalisation?site_id=&days=&min_impressions= -> requêtes où PLUSIEURS pages
  // du site captent des impressions (Google hésite -> positions/CTR diluées). LECTURE SEULE.
  getCannibalisation: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt(req.query.site_id, 10);
    if (!siteId) return res.status(400).json({ message: 'site_id requis' });
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 28, 1), 365);
    const minImpr = Math.max(parseInt(req.query.min_impressions, 10) || 10, 1);
    try {
      const { rows } = await db.pool.query(
        `WITH bounds AS (SELECT MAX(date) AS maxd FROM seo_gsc_daily WHERE site_id = $1),
         per AS (
           SELECT query, page_url, SUM(clicks) AS clicks, SUM(impressions) AS impr,
                  CASE WHEN SUM(impressions) > 0 THEN SUM(impressions * position) / SUM(impressions) END AS pos
           FROM seo_gsc_daily, bounds
           WHERE site_id = $1 AND date > bounds.maxd - $2::int AND date <= bounds.maxd
           GROUP BY query, page_url
         ),
         comp AS (SELECT * FROM per WHERE impr >= $3::int),
         q AS (
           SELECT query, COUNT(*) AS n, SUM(impr) AS tot_impr, SUM(clicks) AS tot_clicks
           FROM comp GROUP BY query HAVING COUNT(*) >= 2
         )
         SELECT c.query, c.page_url, c.clicks::int AS clicks, c.impr::int AS impressions,
                c.pos::float AS position, q.n::int AS pages_count,
                q.tot_impr::int AS total_impressions, q.tot_clicks::int AS total_clicks,
                p.title, p.category
         FROM comp c
         JOIN q ON q.query = c.query
         LEFT JOIN seo_pages p ON p.site_id = $1 AND rtrim(p.url, '/') = rtrim(c.page_url, '/')
         ORDER BY q.tot_impr DESC, c.query, c.impr DESC
         LIMIT 1000`,
        [siteId, days, minImpr]
      );
      // Regroupement par requête -> { query, pages_count, total_*, pages: [...] }.
      const byQuery = new Map();
      for (const r of rows) {
        if (!byQuery.has(r.query)) {
          byQuery.set(r.query, {
            query: r.query, pages_count: r.pages_count,
            total_impressions: r.total_impressions, total_clicks: r.total_clicks, pages: []
          });
        }
        byQuery.get(r.query).pages.push({
          url: r.page_url, title: r.title, category: r.category,
          impressions: r.impressions, clicks: r.clicks, position: r.position
        });
      }
      res.json(Array.from(byQuery.values()));
    } catch (e) {
      console.error('[SEO] getCannibalisation:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // GET /api/seo/ctr-anomalies?site_id=&days=&min_impressions= -> requêtes bien positionnées
  // mais au CTR très en dessous de l'attendu pour leur position -> title/meta à réécrire.
  getCtrAnomalies: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt(req.query.site_id, 10);
    if (!siteId) return res.status(400).json({ message: 'site_id requis' });
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 28, 1), 365);
    const minImpr = Math.max(parseInt(req.query.min_impressions, 10) || 30, 1);
    try {
      const { rows } = await db.pool.query(
        `WITH bounds AS (SELECT MAX(date) AS maxd FROM seo_gsc_daily WHERE site_id = $1),
         cur AS (
           SELECT query, SUM(clicks) AS clicks, SUM(impressions) AS impr,
                  CASE WHEN SUM(impressions) > 0 THEN SUM(impressions * position) / SUM(impressions) END AS pos
           FROM seo_gsc_daily, bounds
           WHERE site_id = $1 AND date > bounds.maxd - $2::int AND date <= bounds.maxd
           GROUP BY query
         ),
         bestpage AS (
           SELECT DISTINCT ON (query) query, page_url FROM (
             SELECT query, page_url, SUM(impressions) AS imp
             FROM seo_gsc_daily, bounds
             WHERE site_id = $1 AND date > bounds.maxd - $2::int AND date <= bounds.maxd
             GROUP BY query, page_url
           ) z ORDER BY query, imp DESC
         )
         SELECT c.query, c.clicks::int AS clicks, c.impr::int AS impressions, c.pos::float AS position,
                bp.page_url, p.title,
                (i.data->>'desc_present')::boolean AS desc_present,
                (i.data->>'desc_len')::int AS desc_len,
                (i.data->>'title_len')::int AS title_len
         FROM cur c
         LEFT JOIN bestpage bp ON bp.query = c.query
         LEFT JOIN seo_pages p ON p.site_id = $1 AND rtrim(p.url, '/') = rtrim(bp.page_url, '/')
         LEFT JOIN seo_onpage_issues i ON i.site_id = $1 AND rtrim(i.url, '/') = rtrim(bp.page_url, '/')
         WHERE c.impr >= $3::int AND c.pos IS NOT NULL AND c.pos <= 20
         ORDER BY c.impr DESC
         LIMIT 1000`,
        [siteId, days, minImpr]
      );
      // CTR attendu moyen par position (courbe organique approx.) -> clics manqués = impr × écart.
      const expectedCtr = (pos) => {
        const table = { 1: 0.28, 2: 0.15, 3: 0.11, 4: 0.08, 5: 0.06, 6: 0.05, 7: 0.04, 8: 0.032, 9: 0.028, 10: 0.025 };
        const r = Math.round(pos);
        if (r <= 10) return table[Math.max(1, r)] || 0.025;
        if (r <= 15) return 0.015;
        return 0.01;
      };
      const out = rows.map((r) => {
        const ctr = r.impressions > 0 ? r.clicks / r.impressions : 0;
        const exp = expectedCtr(r.position);
        const missed = Math.max(0, Math.round(r.impressions * (exp - ctr)));
        return {
          query: r.query, url: r.page_url, title: r.title,
          impressions: r.impressions, clicks: r.clicks, position: r.position,
          ctr, expected_ctr: exp, missed_clicks: missed,
          desc_present: r.desc_present, desc_len: r.desc_len, title_len: r.title_len
        };
      })
        // On ne garde que les anomalies réelles : CTR < 60% de l'attendu ET gain potentiel net.
        .filter((r) => r.ctr < r.expected_ctr * 0.6 && r.missed_clicks >= 5)
        .sort((a, b) => b.missed_clicks - a.missed_clicks)
        .slice(0, 100);
      res.json(out);
    } catch (e) {
      console.error('[SEO] getCtrAnomalies:', e.message);
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
        `SELECT id, url, title, category, tags, health,
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
        `SELECT url, title, category, tags, health, internal_pagerank::float AS internal_pagerank FROM seo_pages
         WHERE site_id = $1 AND internal_pagerank IS NOT NULL AND health IN ('reservoir', 'saine')
           AND url !~* $2
         ORDER BY internal_pagerank DESC LIMIT 200`,
        [siteId, LEGAL_DONOR_REGEX]
      );
      const donorRows = donors.rows;
      const topReservoirs = donorRows.filter((d) => d.health === 'reservoir').slice(0, 10);
      // Chevauchement de requêtes GSC + similarité de contenu : UNE fois pour toutes les candidates.
      const candUrls = cand.rows.map((p) => p.url);
      const [overlapMap, simMap] = await Promise.all([
        buildQueryOverlap(db, siteId, candUrls, donorRows.map((d) => d.url)),
        buildSimilarityMap(db, siteId, candUrls)
      ]);

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
        const suggestions = await buildLinkSuggestions(db, siteId, p, donorRows, topReservoirs, overlapMap, simMap);
        result.push({ ...p, score, reason: bits.join(' · '), suggestions });
      }
      result.sort((a, b) => b.score - a.score);
      res.json(result.slice(0, 50));
    } catch (e) {
      console.error('[SEO] getOpportunites:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // GET /api/seo/audit?site_id= -> audit technique on-page agrégé (vue d'ensemble du site).
  // LECTURE SEULE : agrège seo_onpage_issues (écrit par le worker) + seo_audit (sitemap) +
  // doublons calculés ici. Renvoie catégories triées par gravité + score /100.
  getAudit: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt(req.query.site_id, 10);
    if (!siteId) return res.status(400).json({ message: 'site_id requis' });
    // Seuils (miroir de config.py côté worker — ajustables).
    const T = { titleMin: 30, titleMax: 60, descMin: 70, descMax: 160, thin: 300, depth: 4 };
    const MAX_PAGES_PER_CAT = 300;
    try {
      const { rows } = await db.pool.query(
        `SELECT p.url, p.title, p.value_score::float AS value_score,
                p.internal_pagerank::float AS internal_pagerank, i.data AS audit
         FROM seo_pages p
         LEFT JOIN seo_onpage_issues i ON i.site_id = p.site_id AND i.url = p.url
         WHERE p.site_id = $1`,
        [siteId]
      );
      const siteRow = await db.pool.query(
        'SELECT sitemap_url, sitemap_fetched, sitemap_count, orphans_404 FROM seo_audit WHERE site_id = $1',
        [siteId]
      );
      const siteAudit = siteRow.rows[0] || null;
      const total = rows.length;

      // Doublons title / meta description.
      const titleCount = new Map();
      const descCount = new Map();
      for (const r of rows) {
        const t = (r.title || '').trim().toLowerCase();
        if (t) titleCount.set(t, (titleCount.get(t) || 0) + 1);
        const d = ((r.audit && r.audit.description) || '').trim().toLowerCase();
        if (d) descCount.set(d, (descCount.get(d) || 0) + 1);
      }
      const hasDepth = rows.some((r) => r.audit && r.audit.crawl_depth != null);

      // Spécification des catégories : {key,label,severity,test,detail}.
      const A = (r) => r.audit || {};
      const specs = [
        { key: 'broken', label: 'Pages cassées (HTTP ≥ 400 / erreur)', severity: 'critical',
          test: (r) => { const a = A(r); return (a.http_status && a.http_status >= 400) || (a.fetch_error && a.fetch_error !== 'redirect_loop'); },
          detail: (r) => { const a = A(r); return a.http_status ? `HTTP ${a.http_status}` : (a.fetch_error || 'erreur'); } },
        { key: 'redirect_loop', label: 'Boucles de redirection', severity: 'critical',
          test: (r) => A(r).redirect_loop === true, detail: () => 'boucle de redirection (fuit le PageRank)' },
        { key: 'noindex', label: 'Pages en noindex', severity: 'critical',
          test: (r) => A(r).is_noindex === true, detail: () => 'meta robots noindex (désindexation)' },

        { key: 'redirect_chain', label: 'Redirections en chaîne', severity: 'warning',
          test: (r) => (A(r).redirect_chain || []).length >= 2,
          detail: (r) => `${(A(r).redirect_chain || []).length} sauts` },
        { key: 'mixed_content', label: 'Mixed content (ressources http://)', severity: 'warning',
          test: (r) => (A(r).mixed_content || []).length > 0,
          detail: (r) => `${(A(r).mixed_content || []).length} ressource(s) http://` },
        { key: 'h1', label: 'H1 absent ou multiple', severity: 'warning',
          test: (r) => { const a = A(r); return a.audited && (a.h1_count === 0 || a.h1_count > 1); },
          detail: (r) => `${A(r).h1_count} H1` },
        { key: 'title_missing', label: 'Title manquant', severity: 'warning',
          test: (r) => { const a = A(r); return a.audited && a.title_len === 0; }, detail: () => 'aucun title' },
        { key: 'desc_missing', label: 'Meta description manquante', severity: 'warning',
          test: (r) => { const a = A(r); return a.audited && a.desc_present === false; }, detail: () => 'aucune meta description' },
        { key: 'thin', label: 'Contenu mince (< ' + T.thin + ' mots)', severity: 'warning',
          test: (r) => { const a = A(r); return a.word_count != null && a.word_count < T.thin; },
          detail: (r) => `${A(r).word_count} mots` },
        { key: 'depth', label: 'Profondeur de crawl élevée (≥ ' + T.depth + ')', severity: 'warning',
          test: (r) => { const a = A(r); return (a.crawl_depth != null && a.crawl_depth >= T.depth) || (hasDepth && a.crawl_depth == null); },
          detail: (r) => { const a = A(r); return a.crawl_depth == null ? 'non atteignable depuis l’accueil' : `${a.crawl_depth} clics`; } },
        { key: 'canonical_other', label: 'Canonical pointant ailleurs', severity: 'warning',
          test: (r) => A(r).canonical_other === true, detail: () => 'canonical ≠ URL de la page' },
        { key: 'dup_title', label: 'Titres dupliqués', severity: 'warning',
          test: (r) => { const t = (r.title || '').trim().toLowerCase(); return t && titleCount.get(t) > 1; },
          detail: () => 'title identique à d’autres pages' },
        { key: 'dup_desc', label: 'Meta descriptions dupliquées', severity: 'warning',
          test: (r) => { const d = ((A(r).description) || '').trim().toLowerCase(); return d && descCount.get(d) > 1; },
          detail: () => 'description identique à d’autres pages' },
        { key: 'missing_sitemap', label: 'Pages importantes absentes du sitemap', severity: 'warning',
          test: (r) => A(r).in_sitemap === false && (Number(r.value_score) || 0) >= 60,
          detail: (r) => `valeur ${r.value_score ?? '—'}, hors sitemap` },

        { key: 'title_len', label: 'Title trop court / trop long', severity: 'notice',
          test: (r) => { const a = A(r); return a.audited && a.title_len > 0 && (a.title_len < T.titleMin || a.title_len > T.titleMax); },
          detail: (r) => `${A(r).title_len} car.` },
        { key: 'desc_len', label: 'Meta description trop courte / trop longue', severity: 'notice',
          test: (r) => { const a = A(r); return a.desc_present && (a.desc_len < T.descMin || a.desc_len > T.descMax); },
          detail: (r) => `${A(r).desc_len} car.` },
        { key: 'h1_equals_title', label: 'H1 identique au title', severity: 'notice',
          test: (r) => A(r).h1_equals_title === true, detail: () => 'H1 = title' },
        { key: 'heading_gap', label: 'Saut de niveau de titres (Hn)', severity: 'notice',
          test: (r) => A(r).heading_gap === true, detail: () => 'hiérarchie Hn incohérente' },
        { key: 'images_alt', label: 'Images sans attribut alt', severity: 'notice',
          test: (r) => (A(r).images_without_alt || 0) > 0,
          detail: (r) => `${A(r).images_without_alt}/${A(r).images_total || 0} sans alt` }
      ];

      const categories = [];
      for (const s of specs) {
        const pages = [];
        for (const r of rows) {
          if (s.test(r)) {
            if (pages.length < MAX_PAGES_PER_CAT) pages.push({ url: r.url, title: r.title, detail: s.detail(r) });
            else pages.push(null); // garde le compte exact sans gonfler le payload
          }
        }
        const count = pages.length;
        if (count > 0) categories.push({ key: s.key, label: s.label, severity: s.severity, count, pages: pages.filter(Boolean) });
      }

      // Orphelins sitemap 404 (niveau site).
      const orphans = Array.isArray(siteAudit && siteAudit.orphans_404) ? siteAudit.orphans_404 : [];
      if (orphans.length) {
        categories.push({
          key: 'sitemap_404', label: 'URLs du sitemap en 404', severity: 'notice', count: orphans.length,
          pages: orphans.slice(0, MAX_PAGES_PER_CAT).map((u) => ({ url: u, title: '', detail: 'présente au sitemap mais 404' }))
        });
      }

      // Tri par gravité puis par nombre décroissant.
      const order = { critical: 0, warning: 1, notice: 2 };
      categories.sort((a, b) => (order[a.severity] - order[b.severity]) || (b.count - a.count));

      // Score /100 : pénalité pondérée par gravité, normalisée au nombre de pages.
      const w = { critical: 3, warning: 1, notice: 0.3 };
      let penalty = 0;
      for (const c of categories) penalty += c.count * w[c.severity];
      const score = total > 0 ? Math.max(0, Math.round(100 - (penalty / total) * (100 / 3))) : 100;

      res.json({
        score,
        total_pages: total,
        categories,
        sitemap: siteAudit
          ? { fetched: siteAudit.sitemap_fetched, url: siteAudit.sitemap_url, count: siteAudit.sitemap_count, orphans_404: orphans.length }
          : { fetched: false, url: null, count: 0, orphans_404: 0 }
      });
    } catch (e) {
      console.error('[SEO] getAudit:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // ===== SUIVI DE POSITIONS (rank tracker, 100% GSC) — endpoints LECTURE SEULE =====
  // Position d'un mot-clé = SUM(impressions*position)/SUM(impressions) (MÊME formule que le
  // cache gsc_position du module Opportunités). Fenêtre glissante `days` (défaut 28, = cache).

  // GET /api/seo/positions/summary?site_id=&days= -> cartes de synthèse + distribution.
  getPositionsSummary: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt(req.query.site_id, 10);
    if (!siteId) return res.status(400).json({ message: 'site_id requis' });
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 28, 1), 365);
    try {
      const { rows } = await db.pool.query(
        `WITH bounds AS (SELECT MAX(date) AS maxd FROM seo_gsc_daily WHERE site_id = $1),
         cur AS (
           SELECT query, SUM(clicks) AS clicks, SUM(impressions) AS impr,
                  CASE WHEN SUM(impressions) > 0 THEN SUM(impressions * position) / SUM(impressions) END AS pos
           FROM seo_gsc_daily, bounds
           WHERE site_id = $1 AND date > bounds.maxd - $2::int AND date <= bounds.maxd
           GROUP BY query
         )
         SELECT COUNT(*)::int AS total_keywords,
                COUNT(*) FILTER (WHERE pos <= 3)::int  AS top3,
                COUNT(*) FILTER (WHERE pos <= 10)::int AS top10,
                COUNT(*) FILTER (WHERE pos <= 50)::int AS top50,
                COUNT(*) FILTER (WHERE pos > 3  AND pos <= 10)::int AS b_4_10,
                COUNT(*) FILTER (WHERE pos > 10 AND pos <= 20)::int AS b_11_20,
                COUNT(*) FILTER (WHERE pos > 20 AND pos <= 50)::int AS b_21_50,
                COUNT(*) FILTER (WHERE pos > 50)::int AS b_50p,
                COALESCE(SUM(impr), 0)::int AS impressions,
                COALESCE(SUM(clicks), 0)::int AS clicks,
                CASE WHEN SUM(impr) > 0 THEN (SUM(impr * pos) / SUM(impr))::float END AS avg_position
         FROM cur`,
        [siteId, days]
      );
      const r = rows[0] || {};
      const impressions = Number(r.impressions) || 0;
      res.json({
        days,
        total_keywords: r.total_keywords || 0,
        top3: r.top3 || 0, top10: r.top10 || 0, top50: r.top50 || 0,
        avg_position: r.avg_position,
        impressions, clicks: Number(r.clicks) || 0,
        ctr: impressions > 0 ? (Number(r.clicks) || 0) / impressions : 0,
        distribution: [
          { bucket: 'Top 3', count: r.top3 || 0 },
          { bucket: '4-10', count: r.b_4_10 || 0 },
          { bucket: '11-20', count: r.b_11_20 || 0 },
          { bucket: '21-50', count: r.b_21_50 || 0 },
          { bucket: '50+', count: r.b_50p || 0 }
        ]
      });
    } catch (e) {
      console.error('[SEO] getPositionsSummary:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // GET /api/seo/positions/keywords?site_id=&days=&search=&tracked=0|1 -> liste mots-clés + delta.
  getPositionsKeywords: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt(req.query.site_id, 10);
    if (!siteId) return res.status(400).json({ message: 'site_id requis' });
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 28, 1), 365);
    const search = (req.query.search || '').trim();
    const tracked = req.query.tracked === '1' ? 1 : 0;
    try {
      const { rows } = await db.pool.query(
        `WITH bounds AS (SELECT MAX(date) AS maxd FROM seo_gsc_daily WHERE site_id = $1),
         cur AS (
           SELECT query, SUM(clicks) AS clicks, SUM(impressions) AS impr,
                  CASE WHEN SUM(impressions) > 0 THEN SUM(impressions * position) / SUM(impressions) END AS pos
           FROM seo_gsc_daily, bounds
           WHERE site_id = $1 AND date > bounds.maxd - $2::int AND date <= bounds.maxd
           GROUP BY query
         ),
         prev AS (
           SELECT query,
                  CASE WHEN SUM(impressions) > 0 THEN SUM(impressions * position) / SUM(impressions) END AS pos
           FROM seo_gsc_daily, bounds
           WHERE site_id = $1 AND date > bounds.maxd - ($2::int * 2) AND date <= bounds.maxd - $2::int
           GROUP BY query
         ),
         bestpage AS (
           SELECT DISTINCT ON (query) query, page_url FROM (
             SELECT query, page_url, SUM(impressions) AS imp
             FROM seo_gsc_daily, bounds
             WHERE site_id = $1 AND date > bounds.maxd - $2::int AND date <= bounds.maxd
             GROUP BY query, page_url
           ) z ORDER BY query, imp DESC
         )
         SELECT c.query, c.clicks::int AS clicks, c.impr::int AS impressions,
                c.pos::float AS position, p.pos::float AS prev_position,
                (p.pos - c.pos)::float AS delta,
                CASE WHEN c.impr > 0 THEN (c.clicks::float / c.impr) ELSE 0 END AS ctr,
                bp.page_url, (t.keyword IS NOT NULL) AS tracked
         FROM cur c
         LEFT JOIN prev p ON p.query = c.query
         LEFT JOIN bestpage bp ON bp.query = c.query
         LEFT JOIN seo_tracked_keywords t ON t.site_id = $1 AND t.keyword = c.query
         WHERE ($3 = '' OR c.query ILIKE '%' || $3 || '%')
           AND ($4 = 0 OR t.keyword IS NOT NULL)
         ORDER BY c.impr DESC
         LIMIT 500`,
        [siteId, days, search, tracked]
      );
      res.json(rows);
    } catch (e) {
      console.error('[SEO] getPositionsKeywords:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // GET /api/seo/positions/keyword?site_id=&keyword=&days= -> série temporelle d'un mot-clé.
  getPositionKeywordSeries: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt(req.query.site_id, 10);
    const keyword = (req.query.keyword || '').trim();
    if (!siteId || !keyword) return res.status(400).json({ message: 'site_id et keyword requis' });
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 28, 1), 365);
    try {
      const { rows } = await db.pool.query(
        `SELECT date,
                CASE WHEN SUM(impressions) > 0 THEN (SUM(impressions * position) / SUM(impressions))::float END AS position,
                SUM(impressions)::int AS impressions, SUM(clicks)::int AS clicks
         FROM seo_gsc_daily
         WHERE site_id = $1 AND query = $2
           AND date > (SELECT MAX(date) FROM seo_gsc_daily WHERE site_id = $1) - $3::int
         GROUP BY date ORDER BY date`,
        [siteId, keyword, days]
      );
      res.json(rows);
    } catch (e) {
      console.error('[SEO] getPositionKeywordSeries:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // GET /api/seo/positions/pages?site_id=&days= -> pages ayant des requêtes (sélecteur vue 2).
  getPositionsPages: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt(req.query.site_id, 10);
    if (!siteId) return res.status(400).json({ message: 'site_id requis' });
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 28, 1), 365);
    try {
      const { rows } = await db.pool.query(
        `SELECT g.page_url, SUM(g.impressions)::int AS impressions, SUM(g.clicks)::int AS clicks,
                CASE WHEN SUM(g.impressions) > 0 THEN (SUM(g.impressions * g.position) / SUM(g.impressions))::float END AS position,
                COUNT(DISTINCT g.query)::int AS keywords, sp.title
         FROM seo_gsc_daily g
         LEFT JOIN seo_pages sp ON sp.site_id = $1 AND sp.url = rtrim(g.page_url, '/')
         WHERE g.site_id = $1
           AND g.date > (SELECT MAX(date) FROM seo_gsc_daily WHERE site_id = $1) - $2::int
         GROUP BY g.page_url, sp.title
         ORDER BY impressions DESC LIMIT 500`,
        [siteId, days]
      );
      res.json(rows);
    } catch (e) {
      console.error('[SEO] getPositionsPages:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // GET /api/seo/positions/page?site_id=&url=&days= -> mots-clés de la page + série de la page.
  getPositionsPage: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt(req.query.site_id, 10);
    const pageUrl = (req.query.url || '').trim();
    if (!siteId || !pageUrl) return res.status(400).json({ message: 'site_id et url requis' });
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 28, 1), 365);
    try {
      const kw = await db.pool.query(
        `WITH bounds AS (SELECT MAX(date) AS maxd FROM seo_gsc_daily WHERE site_id = $1),
         cur AS (
           SELECT query, SUM(clicks) AS clicks, SUM(impressions) AS impr,
                  CASE WHEN SUM(impressions) > 0 THEN SUM(impressions * position) / SUM(impressions) END AS pos
           FROM seo_gsc_daily, bounds
           WHERE site_id = $1 AND page_url = $2 AND date > bounds.maxd - $3::int AND date <= bounds.maxd
           GROUP BY query
         ),
         prev AS (
           SELECT query, CASE WHEN SUM(impressions) > 0 THEN SUM(impressions * position) / SUM(impressions) END AS pos
           FROM seo_gsc_daily, bounds
           WHERE site_id = $1 AND page_url = $2 AND date > bounds.maxd - ($3::int * 2) AND date <= bounds.maxd - $3::int
           GROUP BY query
         )
         SELECT c.query, c.clicks::int AS clicks, c.impr::int AS impressions,
                c.pos::float AS position, (p.pos - c.pos)::float AS delta,
                CASE WHEN c.impr > 0 THEN (c.clicks::float / c.impr) ELSE 0 END AS ctr
         FROM cur c LEFT JOIN prev p ON p.query = c.query
         ORDER BY c.impr DESC LIMIT 500`,
        [siteId, pageUrl, days]
      );
      const series = await db.pool.query(
        `SELECT date,
                CASE WHEN SUM(impressions) > 0 THEN (SUM(impressions * position) / SUM(impressions))::float END AS position,
                SUM(impressions)::int AS impressions, SUM(clicks)::int AS clicks
         FROM seo_gsc_daily
         WHERE site_id = $1 AND page_url = $2
           AND date > (SELECT MAX(date) FROM seo_gsc_daily WHERE site_id = $1) - $3::int
         GROUP BY date ORDER BY date`,
        [siteId, pageUrl, days]
      );
      res.json({ keywords: kw.rows, series: series.rows });
    } catch (e) {
      console.error('[SEO] getPositionsPage:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // GET /api/seo/positions/yoast?site_id=&days= -> focus keyword visé vs position réelle GSC.
  getPositionsYoast: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt(req.query.site_id, 10);
    if (!siteId) return res.status(400).json({ message: 'site_id requis' });
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 28, 1), 365);
    try {
      const { rows } = await db.pool.query(
        `WITH bounds AS (SELECT MAX(date) AS maxd FROM seo_gsc_daily WHERE site_id = $1)
         SELECT sp.url, sp.title, sp.focus_keyword,
                fk.pos::float AS focus_position, fk.impr::int AS focus_impressions,
                best.query AS top_query, best.pos::float AS top_position, best.impr::int AS top_impressions
         FROM seo_pages sp
         LEFT JOIN LATERAL (
           SELECT CASE WHEN SUM(impressions) > 0 THEN SUM(impressions * position) / SUM(impressions) END AS pos,
                  SUM(impressions) AS impr
           FROM seo_gsc_daily g, bounds
           WHERE g.site_id = sp.site_id AND rtrim(g.page_url, '/') = sp.url
             AND lower(g.query) = lower(sp.focus_keyword)
             AND g.date > bounds.maxd - $2::int
         ) fk ON true
         LEFT JOIN LATERAL (
           SELECT query, SUM(impressions) AS impr,
                  CASE WHEN SUM(impressions) > 0 THEN SUM(impressions * position) / SUM(impressions) END AS pos
           FROM seo_gsc_daily g, bounds
           WHERE g.site_id = sp.site_id AND rtrim(g.page_url, '/') = sp.url AND g.date > bounds.maxd - $2::int
           GROUP BY query ORDER BY impr DESC LIMIT 1
         ) best ON true
         WHERE sp.site_id = $1 AND sp.focus_keyword IS NOT NULL AND sp.focus_keyword <> ''
         ORDER BY sp.value_score DESC NULLS LAST
         LIMIT 300`,
        [siteId, days]
      );
      res.json(rows);
    } catch (e) {
      console.error('[SEO] getPositionsYoast:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // ----- Watchlist : Node ÉCRIT seo_tracked_keywords (config utilisateur, exception) -----
  getTrackedKeywords: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt(req.query.site_id, 10);
    if (!siteId) return res.status(400).json({ message: 'site_id requis' });
    try {
      const { rows } = await db.pool.query(
        'SELECT id, keyword FROM seo_tracked_keywords WHERE site_id = $1 ORDER BY keyword ASC',
        [siteId]
      );
      res.json(rows);
    } catch (e) {
      console.error('[SEO] getTrackedKeywords:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  addTrackedKeyword: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt((req.body || {}).site_id, 10);
    const keyword = ((req.body || {}).keyword || '').trim();
    if (!siteId || !keyword) return res.status(400).json({ message: 'site_id et keyword requis' });
    try {
      const r = await db.pool.query(
        `INSERT INTO seo_tracked_keywords (site_id, keyword) VALUES ($1, $2)
         ON CONFLICT (site_id, keyword) DO NOTHING RETURNING id, keyword`,
        [siteId, keyword]
      );
      if (r.rows.length === 0) {
        const ex = await db.pool.query('SELECT id, keyword FROM seo_tracked_keywords WHERE site_id = $1 AND keyword = $2', [siteId, keyword]);
        return res.status(200).json(ex.rows[0] || null);
      }
      res.status(201).json(r.rows[0]);
    } catch (e) {
      console.error('[SEO] addTrackedKeyword:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  deleteTrackedKeyword: async (req, res) => {
    const db = req.app.locals.db;
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ message: 'id requis' });
    try {
      await db.pool.query('DELETE FROM seo_tracked_keywords WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (e) {
      console.error('[SEO] deleteTrackedKeyword:', e.message);
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
    if (!['crawl_full', 'crawl_incremental', 'gsc_sync', 'gsc_test', 'pagespeed', 'ga_sync'].includes(jobType)) {
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
