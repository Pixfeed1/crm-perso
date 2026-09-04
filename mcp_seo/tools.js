// mcp_seo/tools.js
// Les 4 outils MCP : UNIQUEMENT des SELECT paramétrés prédéfinis sur les tables SEO.
// Aucun SQL ne vient de Claude (seuls des arguments typés). Aucune écriture, jamais.

// CPT de contenu pouvant servir de cibles de maillage (piliers + types éditoriaux).
const TARGET_TYPES = ['glossaire', 'guide', 'anime', 'film', 'logiciel', 'serie', 'acteur', 'post', 'page'];

// Pages légales/utilitaires : exclues des donneurs de liens (footer capte du jus, hors-sujet).
const LEGAL_DONOR_REGEX = '(^|/)(mentions-legales|mentions|politique-de-confidentialite|confidentialite|privacy|nous-contacter|contact|cgu|cgv|legal)(/|$)';

const isHomeUrl = (url) => /^https?:\/\/[^/]+\/?$/.test(url || '');
const rtrimSlash = (u) => (u || '').replace(/\/+$/, '');
const slugOf = (url) => {
  try {
    const p = new URL(url).pathname.replace(/\/+$/, '');
    return p.split('/').filter(Boolean).pop() || '';
  } catch { return ''; }
};

// ---- get_opportunities : rejoue le calcul de /api/seo/opportunites (SELECT only) ----
export async function getOpportunities(pool, siteId, minImpr = 20) {
  const maxRes = await pool.query(
    `SELECT COALESCE(MAX(gsc_impressions),0)::float AS max_impr,
            COALESCE(MAX(internal_pagerank),0)::float AS max_pr
     FROM seo_pages WHERE site_id = $1`, [siteId]
  );
  const maxImpr = Number(maxRes.rows[0].max_impr) || 0;
  const maxPr = Number(maxRes.rows[0].max_pr) || 0;

  const cand = await pool.query(
    `SELECT id, url, title, category, tags, health,
            internal_pagerank::float AS internal_pagerank, inlinks_count,
            value_score::float AS value_score,
            gsc_impressions, gsc_clicks, gsc_position::float AS gsc_position
     FROM seo_pages
     WHERE site_id = $1 AND COALESCE(gsc_impressions,0) >= $2::int
       AND (
         (gsc_position IS NOT NULL AND gsc_position BETWEEN 11 AND 50)
         OR COALESCE(inlinks_count,0) <= 2
         OR health IN ('orpheline','affamee')
         OR (internal_pagerank IS NOT NULL AND $3::float > 0 AND internal_pagerank / $3::float < 0.6)
       )`, [siteId, minImpr, maxPr]
  );

  const donors = await pool.query(
    `SELECT url, title, category, tags, health, internal_pagerank::float AS internal_pagerank FROM seo_pages
     WHERE site_id = $1 AND internal_pagerank IS NOT NULL AND health IN ('reservoir','saine')
       AND url !~* $2
     ORDER BY internal_pagerank DESC LIMIT 200`, [siteId, LEGAL_DONOR_REGEX]
  );
  const donorRows = donors.rows;
  const topReservoirs = donorRows.filter((d) => d.health === 'reservoir').slice(0, 10);
  const norm = (c) => (c || '').toLowerCase().trim();

  // 1) Score de chaque candidate (aucune requête ici).
  const scored = cand.rows.map((p) => {
    const impr = Number(p.gsc_impressions) || 0;
    const imprF = maxImpr > 0 ? Math.log1p(impr) / Math.log1p(maxImpr) : 0;
    const pos = p.gsc_position == null ? null : Number(p.gsc_position);
    const posF = pos == null ? 0.5 : pos <= 10 ? 0.2 : pos <= 20 ? 1.0 : pos <= 50 ? 0.6 : 0.25;
    const prRatio = maxPr > 0 ? (Number(p.internal_pagerank) || 0) / maxPr : 0;
    const inl = Number(p.inlinks_count) || 0;
    const inlF = inl <= 2 ? 1 : inl <= 5 ? 0.5 : 0.1;
    const deficit = Math.min(Math.max(0.6 * (1 - prRatio) + 0.4 * inlF, 0), 1);
    const score = Math.round(100 * imprF * (0.4 + 0.6 * posF) * (0.4 + 0.6 * deficit));
    return { p, pos, score };
  });

  // 2) On ne garde que le top 50 AVANT de chercher les suggestions (évite le N+1 inutile).
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 50);

  // 3) UNE seule requête pour les liens entrants des 50 pages retenues -> Map(to_url -> Set(from_url)).
  const topUrls = top.map((s) => s.p.url);
  const linkedBy = new Map();
  if (topUrls.length) {
    const links = await pool.query(
      'SELECT from_url, to_url FROM seo_links WHERE site_id = $1 AND to_url = ANY($2)', [siteId, topUrls]
    );
    for (const r of links.rows) {
      if (!linkedBy.has(r.to_url)) linkedBy.set(r.to_url, new Set());
      linkedBy.get(r.to_url).add(r.from_url);
    }
  }

  // 3bis) Chevauchement de requêtes GSC (une requête groupée) : donneurs captant des
  // impressions sur les MÊMES requêtes Google que la cible -> relation prouvée par Google.
  // Les requêtes partagées servent d'idées d'ancre. Map(cible -> Map(donneur -> {shared, queries})).
  const overlapMap = new Map();
  if (topUrls.length && donorRows.length) {
    const ov = await pool.query(
      `WITH bounds AS (SELECT MAX(date) AS maxd FROM seo_gsc_daily WHERE site_id = $1),
       t AS (
         SELECT rtrim(page_url, '/') AS url, query, SUM(impressions) AS impr
         FROM seo_gsc_daily, bounds
         WHERE site_id = $1 AND date > bounds.maxd - 28 AND rtrim(page_url, '/') = ANY($2)
         GROUP BY 1, 2
       ),
       d AS (
         SELECT rtrim(page_url, '/') AS url, query, SUM(impressions) AS impr
         FROM seo_gsc_daily, bounds
         WHERE site_id = $1 AND date > bounds.maxd - 28 AND rtrim(page_url, '/') = ANY($3)
         GROUP BY 1, 2
       )
       SELECT t.url AS target_url, d.url AS donor_url, COUNT(*)::int AS shared,
              (ARRAY_AGG(t.query ORDER BY LEAST(t.impr, d.impr) DESC))[1:3] AS queries
       FROM t JOIN d ON d.query = t.query AND d.url <> t.url
       GROUP BY t.url, d.url`,
      [siteId, [...new Set(topUrls.map(rtrimSlash))], [...new Set(donorRows.map((d) => rtrimSlash(d.url)))]]
    );
    for (const r of ov.rows) {
      if (!overlapMap.has(r.target_url)) overlapMap.set(r.target_url, new Map());
      overlapMap.get(r.target_url).set(r.donor_url, { shared: r.shared, queries: r.queries || [] });
    }
  }

  // 3ter) Similarité de contenu (TF-IDF calculée par le worker, table seo_similar_pages) :
  // Map(cible -> Map(page similaire -> score)). Une seule requête groupée.
  const simMap = new Map();
  if (topUrls.length) {
    const sim = await pool.query(
      `SELECT rtrim(url, '/') AS url, rtrim(similar_url, '/') AS similar_url, score::float AS score
       FROM seo_similar_pages WHERE site_id = $1 AND rtrim(url, '/') = ANY($2)`,
      [siteId, [...new Set(topUrls.map(rtrimSlash))]]
    );
    for (const r of sim.rows) {
      if (!simMap.has(r.url)) simMap.set(r.url, new Map());
      simMap.get(r.url).set(r.similar_url, r.score);
    }
  }

  // 4) Suggestions : requêtes Google partagées > tags communs > même catégorie > accueil >
  //    réservoirs > saines, hors pages déjà liées (même logique que /api/seo/opportunites).
  return top.map(({ p, pos, score }) => {
    const linking = linkedBy.get(p.url) || new Set();
    const cat = norm(p.category);
    const eligible = (d) => d.url !== p.url && !linking.has(d.url);
    const pageOverlap = overlapMap.get(rtrimSlash(p.url)) || new Map();
    const sharedQueries = (d) => (pageOverlap.get(rtrimSlash(d.url)) || { shared: 0 }).shared;
    const byQueries = pageOverlap.size
      ? donorRows.filter((d) => eligible(d) && sharedQueries(d) > 0).sort((a, b) => sharedQueries(b) - sharedQueries(a))
      : [];
    const pageTags = new Set((Array.isArray(p.tags) ? p.tags : []).map(norm).filter(Boolean));
    const sharedTags = (d) => {
      if (!pageTags.size || !Array.isArray(d.tags)) return 0;
      let n = 0;
      for (const t of d.tags) if (pageTags.has(norm(t))) n++;
      return n;
    };
    const byTags = pageTags.size
      ? donorRows.filter((d) => eligible(d) && sharedTags(d) > 0).sort((a, b) => sharedTags(b) - sharedTags(a))
      : [];
    const pageSim = simMap.get(rtrimSlash(p.url)) || new Map();
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
      const parts = [];
      if (nQ > 0) parts.push(`${nQ} requête${nQ > 1 ? 's' : ''} Google partagée${nQ > 1 ? 's' : ''}`);
      if (nTags > 0) parts.push(`${nTags} tag${nTags > 1 ? 's' : ''} en commun`);
      if (sim > 0) parts.push(`contenu similaire (${Math.round(sim * 100)} %)`);
      if (cat && norm(d.category) === cat) parts.push('même catégorie');
      const anchors = nQ > 0 ? (pageOverlap.get(rtrimSlash(d.url)).queries || []) : [];
      suggestions.push({
        url: d.url, title: d.title,
        reason: parts.length ? parts.join(' · ')
          : isHomeUrl(d.url) ? "page d'accueil"
          : d.health === 'reservoir' ? 'réservoir' : 'page saine',
        ...(anchors.length ? { anchors } : {})
      });
      if (suggestions.length >= 5) break;
    }
    return {
      url: p.url, title: p.title, category: p.category, tags: p.tags || [], score,
      gsc_impressions: p.gsc_impressions, gsc_clicks: p.gsc_clicks, gsc_position: pos,
      internal_pagerank: p.internal_pagerank, inlinks_count: p.inlinks_count, suggestions
    };
  });
}

// ---- get_page_content : métadonnées + extrait de texte (pour le maillage sémantique) ----
export async function getPageContent(pool, siteId, url) {
  const { rows } = await pool.query(
    `SELECT p.url, p.title, p.type, p.category, p.tags, p.focus_keyword, p.seo_meta, i.data AS audit
     FROM seo_pages p LEFT JOIN seo_onpage_issues i ON i.site_id = p.site_id AND i.url = p.url
     WHERE p.site_id = $1 AND (p.url = $2 OR rtrim(p.url,'/') = rtrim($2,'/'))
     LIMIT 1`, [siteId, url]
  );
  if (!rows.length) return null;
  const p = rows[0];
  const meta = p.seo_meta || {};
  const audit = p.audit || {};
  return {
    url: p.url,
    title: p.title,
    type: p.type,
    category: p.category,
    tags: p.tags || [],
    focus_keyword: p.focus_keyword || null,
    meta_description: meta.description || audit.description || null,
    word_count: audit.word_count ?? null,
    h1_count: audit.h1_count ?? null,
    excerpt: audit.excerpt || null
  };
}

// ---- list_link_targets : cibles de maillage candidates (CPT de contenu) ----
export async function listLinkTargets(pool, siteId, category = null) {
  const { rows } = await pool.query(
    `SELECT url, title, category, tags, type, internal_pagerank::float AS internal_pagerank
     FROM seo_pages
     WHERE site_id = $1 AND type = ANY($2)
       AND ($3::text IS NULL OR lower(category) = lower($3))
     ORDER BY internal_pagerank DESC NULLS LAST
     LIMIT 500`, [siteId, TARGET_TYPES, category]
  );
  return rows.map((r) => ({ url: r.url, title: r.title, slug: slugOf(r.url), category: r.category, tags: r.tags || [], type: r.type }));
}

// ---- get_page_keywords : requêtes GSC d'une page (fenêtre glissante) ----
export async function getPageKeywords(pool, siteId, url, days = 28) {
  const { rows } = await pool.query(
    `SELECT query,
            SUM(impressions)::int AS impressions, SUM(clicks)::int AS clicks,
            CASE WHEN SUM(impressions) > 0 THEN (SUM(impressions*position)/SUM(impressions))::float END AS position
     FROM seo_gsc_daily
     WHERE site_id = $1 AND rtrim(page_url,'/') = rtrim($2,'/')
       AND date > (SELECT MAX(date) FROM seo_gsc_daily WHERE site_id = $1) - $3::int
     GROUP BY query ORDER BY impressions DESC LIMIT 100`, [siteId, url, days]
  );
  return rows.map((r) => ({
    query: r.query, position: r.position, impressions: r.impressions, clicks: r.clicks,
    ctr: r.impressions > 0 ? r.clicks / r.impressions : 0
  }));
}

// ---- get_site_overview : vue d'ensemble du site (santé, maillage, GSC 28j) ----
export async function getSiteOverview(pool, siteId) {
  const [pages, links, gsc] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total_pages,
              COUNT(*) FILTER (WHERE health = 'orpheline')::int AS orphelines,
              COUNT(*) FILTER (WHERE health = 'reservoir')::int AS reservoirs,
              COUNT(*) FILTER (WHERE health = 'affamee')::int  AS affamees,
              COUNT(*) FILTER (WHERE health = 'saine')::int    AS saines,
              COUNT(*) FILTER (
                WHERE indexation_status IS NOT NULL
                  AND NOT (indexation_status ILIKE '%indexed%' AND indexation_status NOT ILIKE '%not indexed%')
              )::int AS non_indexees,
              MAX(last_crawl) AS last_crawl
       FROM seo_pages WHERE site_id = $1`, [siteId]
    ),
    pool.query('SELECT COUNT(*)::int AS total_links FROM seo_links WHERE site_id = $1', [siteId]),
    pool.query(
      `SELECT COALESCE(SUM(gsc_clicks), 0)::int AS gsc_clicks_28j,
              COALESCE(SUM(gsc_impressions), 0)::int AS gsc_impressions_28j,
              MAX(gsc_synced_at) AS gsc_synced_at,
              COUNT(*) FILTER (WHERE gsc_position IS NOT NULL AND gsc_position BETWEEN 11 AND 20)::int AS quasi_victoires
       FROM seo_pages WHERE site_id = $1`, [siteId]
    )
  ]);
  return { ...pages.rows[0], total_links: links.rows[0].total_links, ...gsc.rows[0] };
}

// ---- get_audit : audit technique agrégé (sitemap + compteurs de problèmes on-page) ----
export async function getAudit(pool, siteId) {
  const [site, issues] = await Promise.all([
    pool.query(
      `SELECT sitemap_url, sitemap_fetched, sitemap_count,
              jsonb_array_length(COALESCE(orphans_404, '[]'::jsonb))::int AS urls_sitemap_en_404,
              updated_at
       FROM seo_audit WHERE site_id = $1`, [siteId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS pages_auditees,
              COUNT(*) FILTER (WHERE (data->>'desc_present') = 'false')::int AS meta_description_absente,
              COUNT(*) FILTER (WHERE (data->>'desc_len')::int > 160)::int AS meta_description_trop_longue,
              COUNT(*) FILTER (WHERE (data->>'title_len')::int > 60)::int AS title_trop_long,
              COUNT(*) FILTER (WHERE (data->>'h1_count')::int <> 1)::int AS h1_absent_ou_multiple,
              COUNT(*) FILTER (WHERE (data->>'is_noindex') = 'true')::int AS pages_noindex,
              COUNT(*) FILTER (WHERE (data->>'canonical_other') = 'true')::int AS canonical_vers_autre_url,
              COUNT(*) FILTER (WHERE COALESCE(data->>'heading_gap', '') NOT IN ('', '0', 'false', 'null'))::int AS saut_de_niveau_hn,
              COUNT(*) FILTER (WHERE jsonb_array_length(COALESCE(data->'mixed_content', '[]'::jsonb)) > 0)::int AS pages_avec_mixed_content,
              COUNT(*) FILTER (WHERE (data->>'http_status')::int >= 400)::int AS pages_en_erreur_http,
              COUNT(*) FILTER (WHERE (data->>'word_count')::int < 300)::int AS contenu_court_moins_300_mots,
              COALESCE(SUM((data->>'images_without_alt')::int), 0)::int AS images_sans_alt
       FROM seo_onpage_issues WHERE site_id = $1`, [siteId]
    )
  ]);
  return { sitemap: site.rows[0] || null, ...issues.rows[0] };
}

// ---- get_cannibalisation : requêtes où PLUSIEURS pages du site captent des impressions ----
// (même logique que /api/seo/cannibalisation : Google hésite -> positions/CTR dilués)
export async function getCannibalisation(pool, siteId, days = 28, minImpr = 10) {
  const { rows } = await pool.query(
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
            q.tot_impr::int AS total_impressions, q.tot_clicks::int AS total_clicks, p.title
     FROM comp c
     JOIN q ON q.query = c.query
     LEFT JOIN seo_pages p ON p.site_id = $1 AND rtrim(p.url, '/') = rtrim(c.page_url, '/')
     ORDER BY q.tot_impr DESC, c.query, c.impr DESC
     LIMIT 500`,
    [siteId, days, minImpr]
  );
  const byQuery = new Map();
  for (const r of rows) {
    if (!byQuery.has(r.query)) {
      byQuery.set(r.query, {
        query: r.query, pages_count: r.pages_count,
        total_impressions: r.total_impressions, total_clicks: r.total_clicks, pages: []
      });
    }
    byQuery.get(r.query).pages.push({
      url: r.page_url, title: r.title, impressions: r.impressions, clicks: r.clicks, position: r.position
    });
  }
  return Array.from(byQuery.values());
}

// ---- get_ctr_anomalies : bien positionné mais peu cliqué -> title/meta à réécrire ----
// (même logique que /api/seo/ctr-anomalies, trié par clics potentiels récupérables)
export async function getCtrAnomalies(pool, siteId, days = 28, minImpr = 30) {
  const { rows } = await pool.query(
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
     LIMIT 500`,
    [siteId, days, minImpr]
  );
  const expectedCtr = (pos) => {
    const table = { 1: 0.28, 2: 0.15, 3: 0.11, 4: 0.08, 5: 0.06, 6: 0.05, 7: 0.04, 8: 0.032, 9: 0.028, 10: 0.025 };
    const r = Math.round(pos);
    if (r <= 10) return table[Math.max(1, r)] || 0.025;
    if (r <= 15) return 0.015;
    return 0.01;
  };
  return rows.map((r) => {
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
    .filter((r) => r.ctr < r.expected_ctr * 0.6 && r.missed_clicks >= 5)
    .sort((a, b) => b.missed_clicks - a.missed_clicks)
    .slice(0, 50);
}

// ---- get_page_links : liens internes entrants et sortants d'une page (avec ancres) ----
export async function getPageLinks(pool, siteId, url) {
  const [inbound, outbound] = await Promise.all([
    pool.query(
      `SELECT l.from_url AS url, l.anchor, p.title, p.health, p.internal_pagerank::float AS internal_pagerank
       FROM seo_links l
       LEFT JOIN seo_pages p ON p.site_id = l.site_id AND rtrim(p.url, '/') = rtrim(l.from_url, '/')
       WHERE l.site_id = $1 AND rtrim(l.to_url, '/') = rtrim($2, '/')
       ORDER BY p.internal_pagerank DESC NULLS LAST LIMIT 200`, [siteId, url]
    ),
    pool.query(
      `SELECT l.to_url AS url, l.anchor, p.title, p.health, p.internal_pagerank::float AS internal_pagerank
       FROM seo_links l
       LEFT JOIN seo_pages p ON p.site_id = l.site_id AND rtrim(p.url, '/') = rtrim(l.to_url, '/')
       WHERE l.site_id = $1 AND rtrim(l.from_url, '/') = rtrim($2, '/')
       ORDER BY p.internal_pagerank DESC NULLS LAST LIMIT 200`, [siteId, url]
    )
  ]);
  return {
    url,
    inbound_count: inbound.rows.length,
    outbound_count: outbound.rows.length,
    inbound: inbound.rows,
    outbound: outbound.rows
  };
}

// ---- list_sites : sites suivis dans le CRM (à appeler en premier pour trouver le site_id) ----
export async function listSites(pool) {
  const { rows } = await pool.query(
    `SELECT s.id AS site_id, s.domain,
            (SELECT COUNT(*)::int FROM seo_pages p WHERE p.site_id = s.id) AS pages,
            (SELECT MAX(p.last_crawl) FROM seo_pages p WHERE p.site_id = s.id) AS last_crawl,
            (SELECT MAX(p.gsc_synced_at) FROM seo_pages p WHERE p.site_id = s.id) AS gsc_synced_at
     FROM seo_sites s ORDER BY s.id`
  );
  return rows;
}

// ---- search_pages : chercher des pages par mot-clé/sujet (URL, titre, focus keyword, tags) ----
// Évite le jeu de devinettes sur les slugs : renvoie les pages qui matchent + leurs métriques.
export async function searchPages(pool, siteId, q, limit = 20) {
  const pattern = `%${(q || '').trim()}%`;
  const { rows } = await pool.query(
    `SELECT url, title, type, category, health, inlinks_count,
            internal_pagerank::float AS internal_pagerank,
            gsc_impressions, gsc_clicks, gsc_position::float AS gsc_position
     FROM seo_pages
     WHERE site_id = $1
       AND (url ILIKE $2 OR title ILIKE $2 OR focus_keyword ILIKE $2 OR tags::text ILIKE $2)
     ORDER BY gsc_impressions DESC NULLS LAST, internal_pagerank DESC NULLS LAST
     LIMIT $3`,
    [siteId, pattern, Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100)]
  );
  return rows;
}

// ---- Backlinks (module campagnes de netlinking, LECTURE SEULE) ----

// list_link_campaigns : les niches/campagnes backlinks + compteurs.
export async function listLinkCampaigns(pool) {
  const { rows } = await pool.query(
    `SELECT n.id, n.name, n.site_cible, n.hubs, n.statut, n.discovery_phase, n.discovery_message,
            n.created_at,
            COUNT(t.id)::int AS nb_cibles,
            COUNT(t.id) FILTER (WHERE t.statut = 'contacte')::int AS contactees,
            COUNT(t.id) FILTER (WHERE t.statut = 'lien_obtenu')::int AS liens_obtenus
     FROM seo_niches n LEFT JOIN seo_link_targets t ON t.niche_id = n.id
     GROUP BY n.id ORDER BY n.created_at DESC`
  );
  return rows;
}

// get_link_targets : cibles d'une campagne (score, autorité, trafic réel, statut).
export async function getLinkTargets(pool, nicheId, statut = null, limit = 50) {
  const params = [nicheId];
  let where = 'niche_id = $1';
  if (statut) { params.push(statut); where += ` AND statut = $${params.length}`; }
  params.push(Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200));
  const { rows } = await pool.query(
    `SELECT domain, title, via, lang, alive, contact_email,
            opr::float AS open_pagerank, crux AS trafic_reel_crux,
            referring_edges, score, statut, raison_ecarte, notes, last_checked_at
     FROM seo_link_targets WHERE ${where}
     ORDER BY score DESC NULLS LAST, referring_edges DESC NULLS LAST
     LIMIT $${params.length}`,
    params
  );
  return rows;
}

// get_link_outreach_status : emails de demande de lien envoyés + tracking + relances dues.
export async function getLinkOutreachStatus(pool, nicheId) {
  const { rows } = await pool.query(
    `SELECT t.domain, o.subject, o.sent_at, o.followup_date, o.followup_done, o.reponse,
            et.open_count, et.click_count, et.last_open_at
     FROM seo_link_outreach o
     JOIN seo_link_targets t ON t.id = o.target_id
     LEFT JOIN email_tracking et ON et.token = o.tracking_token
     WHERE t.niche_id = $1
     ORDER BY o.sent_at DESC LIMIT 100`,
    [nicheId]
  );
  const relances_dues = rows.filter((r) => !r.followup_done && r.followup_date
    && new Date(r.followup_date) <= new Date()).length;
  return { relances_dues, envois: rows };
}

// ---- Indexation Google (API URL Inspection) ------------------------------------
// Le verdict réel de Google, page par page, alimenté par le worker (gsc_index_status).
// Complète les compteurs déduits, qui ne distinguaient pas « non indexée » de
// « jamais explorée » ni ne voyaient les 404 connues de Google seul.

// Répartition par état de couverture + verdicts, pour savoir où se situe le problème.
export async function getIndexationSummary(pool, siteId) {
  const { rows } = await pool.query(
    `SELECT coverage_state, verdict, COUNT(*)::int AS n
       FROM gsc_index_status
      WHERE site_id = $1
      GROUP BY coverage_state, verdict
      ORDER BY n DESC`,
    [siteId]
  );
  const { rows: tot } = await pool.query(
    `SELECT COUNT(*)::int AS inspectees,
            COUNT(*) FILTER (WHERE verdict = 'PASS')::int AS indexees,
            COUNT(*) FILTER (WHERE verdict = 'FAIL')::int AS en_echec,
            COUNT(*) FILTER (WHERE verdict = 'NEUTRAL')::int AS neutres,
            MIN(checked_at) AS plus_ancienne, MAX(checked_at) AS plus_recente
       FROM gsc_index_status WHERE site_id = $1`,
    [siteId]
  );
  const { rows: restant } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM seo_pages p
      WHERE p.site_id = $1
        AND NOT EXISTS (SELECT 1 FROM gsc_index_status s
                         WHERE s.site_id = p.site_id AND rtrim(s.url,'/') = rtrim(p.url,'/'))`,
    [siteId]
  );
  return {
    ...(tot[0] || {}),
    jamais_inspectees: restant[0] ? restant[0].n : 0,
    par_etat: rows,
    note: "L'inspection reflète l'index Google au moment de l'appel, avec un décalage possible de quelques jours.",
  };
}

// Les 404 vues par Google, AVEC leur origine : referring_urls dit quelle page contient
// le lien cassé. C'est l'information qui manquait pour pouvoir corriger.
export async function getGoogle404s(pool, siteId, limit = 100) {
  const { rows } = await pool.query(
    `SELECT s.url, s.coverage_state, s.page_fetch_state, s.last_crawl_time,
            s.referring_urls, s.checked_at,
            EXISTS (SELECT 1 FROM seo_pages p WHERE p.site_id = s.site_id
                      AND rtrim(p.url,'/') = rtrim(s.url,'/')) AS encore_au_crawl
       FROM gsc_index_status s
      WHERE s.site_id = $1
        AND (s.page_fetch_state ILIKE '%NOT_FOUND%' OR s.coverage_state ILIKE '%404%'
             OR s.coverage_state ILIKE '%introuvable%')
      ORDER BY jsonb_array_length(COALESCE(s.referring_urls,'[]'::jsonb)) DESC, s.checked_at DESC
      LIMIT $2`,
    [siteId, limit]
  );
  return {
    total: rows.length,
    // Une 404 encore liée depuis le site est prioritaire : le lien cassé est chez toi.
    a_corriger_en_priorite: rows.filter((r) => (r.referring_urls || []).length > 0).length,
    pages: rows,
  };
}

// Google a choisi une autre canonique que celle déclarée : signe de contenu dupliqué.
export async function getCanonicalMismatches(pool, siteId, limit = 100) {
  const { rows } = await pool.query(
    `SELECT url, google_canonical, user_canonical, coverage_state, verdict, checked_at
       FROM gsc_index_status
      WHERE site_id = $1
        AND google_canonical IS NOT NULL AND user_canonical IS NOT NULL
        AND rtrim(google_canonical,'/') <> rtrim(user_canonical,'/')
      ORDER BY checked_at DESC LIMIT $2`,
    [siteId, limit]
  );
  return { total: rows.length, pages: rows };
}

// Pages que Google n'a plus explorées depuis longtemps : il s'en désintéresse.
export async function getStaleCrawls(pool, siteId, days = 90, limit = 100) {
  const { rows } = await pool.query(
    `SELECT s.url, s.last_crawl_time, s.verdict, s.coverage_state,
            EXTRACT(DAY FROM NOW() - s.last_crawl_time)::int AS jours_sans_crawl,
            p.title, p.value_score
       FROM gsc_index_status s
       LEFT JOIN seo_pages p ON p.site_id = s.site_id AND rtrim(p.url,'/') = rtrim(s.url,'/')
      WHERE s.site_id = $1 AND s.last_crawl_time IS NOT NULL
        AND s.last_crawl_time < NOW() - ($2::int || ' days')::interval
      ORDER BY s.last_crawl_time ASC LIMIT $3`,
    [siteId, days, limit]
  );
  return { seuil_jours: days, total: rows.length, pages: rows };
}

// Historique des bascules indexée <-> non indexée : mesure l'effet des refontes.
export async function getIndexationChanges(pool, siteId, days = 30, limit = 200) {
  const { rows } = await pool.query(
    `SELECT h.url, h.old_verdict, h.new_verdict, h.old_coverage, h.new_coverage,
            h.changed_at, p.title
       FROM gsc_index_history h
       LEFT JOIN seo_pages p ON p.site_id = h.site_id AND rtrim(p.url,'/') = rtrim(h.url,'/')
      WHERE h.site_id = $1 AND h.changed_at > NOW() - ($2::int || ' days')::interval
      ORDER BY h.changed_at DESC LIMIT $3`,
    [siteId, days, limit]
  );
  const gagnees = rows.filter((r) => r.new_verdict === 'PASS' && r.old_verdict !== 'PASS').length;
  const perdues = rows.filter((r) => r.old_verdict === 'PASS' && r.new_verdict !== 'PASS').length;
  return { fenetre_jours: days, indexations_gagnees: gagnees, indexations_perdues: perdues, changements: rows };
}

// ---- Sitemap exploitable (module 3) --------------------------------------------
// seo_audit ne gardait que le NOMBRE d'URLs : savoir si une URL precise y figurait
// imposait un curl manuel.

export async function checkSitemap(pool, siteId, url) {
  const { rows } = await pool.query(
    `SELECT url, sitemap_file, lastmod, seen_at FROM seo_sitemap_urls
      WHERE site_id = $1 AND rtrim(url,'/') = rtrim($2,'/') LIMIT 1`,
    [siteId, url]
  );
  if (!rows[0]) {
    const { rows: any } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM seo_sitemap_urls WHERE site_id = $1', [siteId]
    );
    return {
      in_sitemap: false, url,
      // Sans cette nuance, « absente » serait indiscernable de « sitemap jamais lu ».
      note: any[0].n === 0 ? "Aucun sitemap enregistré pour ce site : relancer un crawl." : null,
    };
  }
  return { in_sitemap: true, ...rows[0] };
}

// Les deux ecarts qui comptent : publie mais absent du sitemap (Google peut le manquer),
// et declare au sitemap mais jamais vu au crawl (URL fantome ou page orpheline).
export async function getSitemapGaps(pool, siteId, limit = 200) {
  const { rows: absentes } = await pool.query(
    `SELECT p.url, p.title, p.type, p.value_score
       FROM seo_pages p
      WHERE p.site_id = $1
        AND NOT EXISTS (SELECT 1 FROM seo_sitemap_urls s
                         WHERE s.site_id = p.site_id AND rtrim(s.url,'/') = rtrim(p.url,'/'))
        -- Une page en noindex n'a rien a faire au sitemap : ce n'est pas un ecart.
        AND COALESCE((p.seo_meta->>'noindex')::boolean, false) = false
      ORDER BY p.value_score DESC NULLS LAST, p.url LIMIT $2`,
    [siteId, limit]
  );
  const { rows: fantomes } = await pool.query(
    `SELECT s.url, s.sitemap_file, s.lastmod
       FROM seo_sitemap_urls s
      WHERE s.site_id = $1
        AND NOT EXISTS (SELECT 1 FROM seo_pages p
                         WHERE p.site_id = s.site_id AND rtrim(p.url,'/') = rtrim(s.url,'/'))
      ORDER BY s.url LIMIT $2`,
    [siteId, limit]
  );
  const { rows: tot } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM seo_sitemap_urls WHERE site_id = $1', [siteId]
  );
  return {
    urls_au_sitemap: tot[0].n,
    publiees_absentes_du_sitemap: absentes.length,
    au_sitemap_jamais_crawlees: fantomes.length,
    absentes, fantomes,
  };
}

// ---- Redirections (module 4) ----------------------------------------------------
// Une 301 vers l'accueil est traitee par Google comme une soft 404 : la redirection
// parait propre, mais le contenu attendu a disparu.
export async function getRedirects(pool, siteId, limit = 200) {
  const { rows } = await pool.query(
    `SELECT from_url, final_url, final_status, hops, chain, to_home, updated_at
       FROM seo_redirects WHERE site_id = $1
      ORDER BY to_home DESC, hops DESC, from_url LIMIT $2`,
    [siteId, limit]
  );
  return {
    total: rows.length,
    vers_accueil: rows.filter((r) => r.to_home).length,
    chaines_multiples: rows.filter((r) => (r.hops || 0) > 1).length,
    redirections: rows,
  };
}

// ---- Cannibalisation par focus keyword (module 5) --------------------------------
// get_cannibalisation part des requetes GSC : il ne voit donc que ce qui a deja des
// impressions. Ici on part de l'INTENTION editoriale (le focus keyword Yoast), ce qui
// detecte le conflit AVANT qu'il ne coute des positions.
export async function getFocusKeywordConflicts(pool, siteId) {
  const { rows } = await pool.query(
    `WITH cibles AS (
       SELECT lower(btrim(focus_keyword)) AS kw, url, title, type, value_score
         FROM seo_pages
        WHERE site_id = $1 AND focus_keyword IS NOT NULL AND btrim(focus_keyword) <> ''
     )
     SELECT kw, COUNT(*)::int AS pages_count,
            json_agg(json_build_object('url', url, 'title', title, 'type', type,
                                       'value_score', value_score) ORDER BY value_score DESC NULLS LAST) AS pages
       FROM cibles GROUP BY kw HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC, kw`,
    [siteId]
  );
  return {
    conflits: rows.length,
    note: rows.length === 0
      ? "Aucun doublon de focus keyword. Si la liste paraît vide à tort, vérifier que le snippet register_rest_field est bien posé dans functions.php."
      : "Deux contenus visant la même expression se font concurrence : choisir une page cible et réorienter l'autre.",
    details: rows,
  };
}

// ---- Core Web Vitals / PageSpeed (job 'pagespeed' du worker) ----------------------
// Derniere mesure par (url, strategie). field_* = CrUX, utilisateurs reels (ce que Google
// classe) ; perf_score et lcp/cls/tbt = labo Lighthouse (diagnostic, reproductible).
export async function getPageSpeed(pool, siteId, limit = 50) {
  const { rows } = await pool.query(
    `WITH latest AS (
       SELECT DISTINCT ON (url, strategy) url, strategy, perf_score, lcp_ms, cls::float AS cls, tbt_ms,
              field_lcp_ms, field_inp_ms, field_cls::float AS field_cls, field_category,
              origin_category, opportunities, error, checked_at
         FROM seo_pagespeed WHERE site_id = $1
        ORDER BY url, strategy, checked_at DESC
     )
     SELECT l.*, p.title, p.gsc_impressions
       FROM latest l
       LEFT JOIN seo_pages p ON p.site_id = $1 AND rtrim(p.url,'/') = rtrim(l.url,'/')
      ORDER BY COALESCE(p.gsc_impressions,0) DESC, l.url, l.strategy LIMIT $2`,
    [siteId, limit]
  );
  const mobile = rows.filter((r) => r.strategy === 'mobile' && r.perf_score != null);
  const avg = mobile.length ? Math.round(mobile.reduce((a, r) => a + r.perf_score, 0) / mobile.length) : null;
  return {
    pages_mesurees: new Set(rows.map((r) => r.url)).size,
    score_mobile_moyen: avg,
    etat_origine_crux: (rows.find((r) => r.origin_category) || {}).origin_category || null,
    derniere_mesure: rows.reduce((m, r) => (!m || r.checked_at > m ? r.checked_at : m), null),
    note: rows.length === 0
      ? "Aucune mesure : lancer « Mesurer la vitesse » dans l'onglet Vitesse de la page SEO (job pagespeed)."
      : 'field_* = utilisateurs reels CrUX (p75, 28 j), seuils : LCP 2500/4000 ms, INP 200/500 ms, CLS 0.1/0.25. NULL = trafic insuffisant pour la page.',
    mesures: rows,
  };
}

// ---- Google Analytics 4 (job 'ga_sync', propriete GA4 par site) --------------------
// Sessions reelles toutes sources + engagement, a mettre en regard des clics GSC : une
// page classee qui ne retient pas (engagement bas) est un probleme de contenu, pas de SEO.
export async function getTraffic(pool, siteId, days = 28, limit = 50) {
  const b = await pool.query('SELECT MAX(date) AS maxd, COUNT(*)::int AS n FROM seo_ga_daily WHERE site_id = $1', [siteId]);
  if (!b.rows[0].n) {
    return { note: "Aucune donnée Analytics : renseigner la propriété GA4 dans la fiche du site, s'assurer que le consentement Google couvre Analytics (gsc_auth.py), puis lancer une synchro Analytics." };
  }
  const maxd = b.rows[0].maxd;
  const { rows: tot } = await pool.query(
    `SELECT SUM(sessions)::int AS sessions, SUM(organic_sessions)::int AS sessions_organiques,
            SUM(users)::int AS utilisateurs, SUM(pageviews)::int AS pages_vues,
            CASE WHEN SUM(sessions) > 0 THEN ROUND(100 * SUM(COALESCE(engagement_rate,0) * sessions) / SUM(sessions), 1) END::float AS taux_engagement_pct
       FROM seo_ga_daily WHERE site_id = $1 AND date > $2::date - $3::int`, [siteId, maxd, days]);
  const { rows: canaux } = await pool.query(
    `SELECT channel AS canal, SUM(sessions)::int AS sessions, SUM(users)::int AS utilisateurs
       FROM seo_ga_channels_daily WHERE site_id = $1 AND date > $2::date - $3::int GROUP BY channel ORDER BY 2 DESC`, [siteId, maxd, days]);
  const { rows: pages } = await pool.query(
    `SELECT g.page_path AS chemin, p.title AS titre, g.sessions, g.organiques, g.engagement_pct, p.gsc_clicks AS clics_gsc_28j, p.gsc_position::float AS position_gsc_28j
       FROM (SELECT page_path, SUM(sessions)::int AS sessions, SUM(organic_sessions)::int AS organiques,
                    CASE WHEN SUM(sessions) > 0 THEN ROUND(100 * SUM(COALESCE(engagement_rate,0) * sessions) / SUM(sessions), 1) END::float AS engagement_pct
               FROM seo_ga_daily WHERE site_id = $1 AND date > $2::date - $3::int GROUP BY page_path) g
       LEFT JOIN seo_pages p ON p.site_id = $1 AND rtrim(regexp_replace(p.url, '^https?://[^/]+', ''), '/') = CASE WHEN g.page_path = '/' THEN '' ELSE g.page_path END
      ORDER BY g.sessions DESC LIMIT $4`, [siteId, maxd, days, limit]);
  return {
    fenetre_jours: days, derniere_date: maxd, ...tot[0],
    part_organique_pct: tot[0].sessions ? Math.round(1000 * tot[0].sessions_organiques / tot[0].sessions) / 10 : null,
    canaux, pages,
    note: 'engagement_pct = sessions engagées (> 10 s, conversion ou 2 pages) / sessions. Comparer clics_gsc_28j et organiques : un écart fort signale un problème de suivi ou de canonique.',
  };
}

// ---- Autorite du domaine + liens entrants (job 'authority') ------------------------
// Open PageRank = proxy gratuit de l'Authority Score (0..10) ; Bing WMT = liens entrants
// connus de Bing (sous-ensemble du web, mais reel, avec ancres et pages cibles).
export async function getAuthority(pool, siteId, days = 30, limit = 50) {
  const { rows: snap } = await pool.query(
    `SELECT date, opr_score::float AS opr_score, opr_rank::int AS opr_rank, opr_referring_domains, bing_backlinks, bing_referring_domains, bing_linked_pages
       FROM seo_authority_daily WHERE site_id = $1 ORDER BY date DESC LIMIT 1`, [siteId]);
  if (!snap[0]) {
    return { note: "Aucun instantané d'autorité : lancer « Analyser l'autorité » dans l'onglet Autorité (job authority), ou attendre la nuit. Prérequis : OPR_API_KEY et/ou BING_WMT_API_KEY dans backend/.env." };
  }
  const cur = snap[0];
  const { rows: prev } = await pool.query(
    `SELECT opr_score::float AS opr_score, opr_referring_domains, bing_referring_domains FROM seo_authority_daily
      WHERE site_id = $1 AND date <= $2::date - $3::int ORDER BY date DESC LIMIT 1`, [siteId, cur.date, days]);
  const { rows: domains } = await pool.query(
    `SELECT source_domain AS domaine, COUNT(*)::int AS liens, COUNT(DISTINCT target_url)::int AS pages_cibles,
            MIN(first_seen) AS premiere_vue, MAX(last_seen) AS derniere_vue,
            (ARRAY_AGG(anchor ORDER BY last_seen DESC))[1] AS ancre_exemple,
            BOOL_AND(status = 'lost') AS perdu
       FROM seo_backlinks WHERE site_id = $1 GROUP BY source_domain ORDER BY perdu, liens DESC, premiere_vue DESC LIMIT $2`,
    [siteId, limit]);
  const { rows: mv } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE status = 'active' AND first_seen > $2::date - $3::int)::int AS gagnes,
            COUNT(*) FILTER (WHERE status = 'lost' AND lost_at > $2::date - $3::int)::int AS perdus
       FROM seo_backlinks WHERE site_id = $1`, [siteId, cur.date, days]);
  const { rows: cibles } = await pool.query(
    `SELECT target_url AS page, COUNT(*)::int AS liens, COUNT(DISTINCT source_domain)::int AS domaines
       FROM seo_backlinks WHERE site_id = $1 AND status = 'active' GROUP BY target_url ORDER BY 3 DESC, 2 DESC LIMIT 20`, [siteId]);
  // Constate a la source par le worker : attributs, types, ancres ; enrichi par domaine :
  // pays, autorite, toxicite maison (criteres listes).
  const { rows: attrs } = await pool.query(
    `SELECT COALESCE(rel,'non vérifié') AS rel, COUNT(*)::int AS n FROM seo_backlinks WHERE site_id = $1 AND status = 'active' GROUP BY 1 ORDER BY 2 DESC`, [siteId]);
  const { rows: types } = await pool.query(
    `SELECT COALESCE(link_type,'non vérifié') AS type, COUNT(*)::int AS n FROM seo_backlinks WHERE site_id = $1 AND status = 'active' GROUP BY 1 ORDER BY 2 DESC`, [siteId]);
  const { rows: ancres } = await pool.query(
    `SELECT anchor AS ancre, COUNT(*)::int AS liens, COUNT(DISTINCT source_domain)::int AS domaines FROM seo_backlinks
      WHERE site_id = $1 AND status = 'active' AND COALESCE(anchor,'') <> '' GROUP BY anchor ORDER BY 3 DESC, 2 DESC LIMIT 15`, [siteId]);
  const { rows: pays } = await pool.query(
    `SELECT COALESCE(r.country,'??') AS pays, COUNT(DISTINCT b.source_domain)::int AS domaines
       FROM seo_backlinks b LEFT JOIN seo_ref_domains r ON r.site_id = $1 AND r.domain = b.source_domain
      WHERE b.site_id = $1 AND b.status = 'active' GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, [siteId]);
  const { rows: tox } = await pool.query(
    `SELECT r.domain AS domaine, r.toxicity AS toxicite, r.toxicity_reasons AS raisons, r.opr_score::float AS autorite, COUNT(b.id)::int AS liens
       FROM seo_ref_domains r JOIN seo_backlinks b ON b.site_id = r.site_id AND b.source_domain = r.domain AND b.status = 'active'
      WHERE r.site_id = $1 AND r.toxicity >= 30 GROUP BY r.domain, r.toxicity, r.toxicity_reasons, r.opr_score ORDER BY r.toxicity DESC, liens DESC LIMIT 30`, [siteId]);
  const { rows: toxAll } = await pool.query(
    `SELECT SUM(CASE WHEN r.toxicity >= 60 THEN 1 ELSE 0 END)::int AS toxiques_liens, COUNT(*)::int AS liens
       FROM seo_backlinks b JOIN seo_ref_domains r ON r.site_id = b.site_id AND r.domain = b.source_domain
      WHERE b.site_id = $1 AND b.status = 'active'`, [siteId]);
  return {
    attributs: attrs, types, ancres_principales: ancres, pays_hebergement: pays,
    toxicite: {
      score_global_pct: toxAll[0] && toxAll[0].liens ? Math.round(100 * toxAll[0].toxiques_liens / toxAll[0].liens) : null,
      domaines_douteux_ou_toxiques: tox,
      methode: 'Indicateur maison 0-100 par domaine : autorité nulle +30, ancre suspecte +30, lien de gabarit répété +15, extension à risque +15, nom généré +10 ; toxique dès 60, douteux dès 30. Score global = part des liens actifs venant de domaines toxiques.',
    },
    date: cur.date,
    autorite_open_pagerank: cur.opr_score, rang_mondial: cur.opr_rank,
    domaines_referents_opr: cur.opr_referring_domains,
    liens_entrants_bing: cur.bing_backlinks, domaines_referents_bing: cur.bing_referring_domains, pages_liees_bing: cur.bing_linked_pages,
    variation_sur_jours: days,
    variation: prev[0] ? {
      opr_score: cur.opr_score != null && prev[0].opr_score != null ? Math.round((cur.opr_score - prev[0].opr_score) * 100) / 100 : null,
      domaines_referents_opr: cur.opr_referring_domains != null && prev[0].opr_referring_domains != null ? cur.opr_referring_domains - prev[0].opr_referring_domains : null,
    } : null,
    liens_gagnes: mv[0].gagnes, liens_perdus: mv[0].perdus,
    domaines_referents: domains, pages_les_plus_liees: cibles,
    note: "Open PageRank (0-10) est un proxy gratuit de l'Authority Score, pas la même formule. Les liens viennent de Bing (sous-ensemble du web) puis sont VÉRIFIÉS à la source par le worker : rel, type, présence. Un lien « perdu » a disparu de sa page source ou la page a disparu. Le pays est celui de l'hébergement (ccTLD sinon registre de l'IP), pas de l'audience.",
  };
}
