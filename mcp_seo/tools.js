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
