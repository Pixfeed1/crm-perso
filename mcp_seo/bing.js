// mcp_seo/bing.js
// Volumes de recherche via l'API Bing Webmaster Tools (le "Keyword Research" de l'interface).
// GRATUIT : clé à générer dans Bing WMT -> Paramètres (roue crantée) -> API access, puis
// BING_WMT_API_KEY dans le .env de ce service. Endpoints REST GetKeyword / GetRelatedKeywords.
//
// Cache EN MÉMOIRE (TTL 24h) et pas en base : le rôle SQL du connecteur est strictement
// LECTURE SEULE et on ne casse pas cette garantie pour un cache. Les volumes bougent peu,
// le quota Bing est généreux -> un cache par process suffit largement.

const API_BASE = 'https://ssl.bing.com/webmaster/api.svc/json';
const TTL_MS = 24 * 3600 * 1000;
const cache = new Map(); // clé -> { at, data }

function cacheGet(key) {
  const e = cache.get(key);
  if (e && Date.now() - e.at < TTL_MS) return e.data;
  cache.delete(key);
  return null;
}
function cacheSet(key, data) {
  if (cache.size > 2000) cache.clear(); // borne mémoire simple
  cache.set(key, { at: Date.now(), data });
}

// Fenêtre par défaut : 3 mois glissants (comme l'écran Keyword Research).
function period(days = 90) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

async function callBing(endpoint, params) {
  const key = (process.env.BING_WMT_API_KEY || '').trim();
  if (!key) {
    throw new Error("BING_WMT_API_KEY absent du .env du serveur MCP. Génère la clé dans Bing Webmaster Tools -> Paramètres -> API access, ajoute-la au .env puis redémarre crm-mcp-seo.");
  }
  const qs = new URLSearchParams({ ...params, apikey: key });
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${API_BASE}/${endpoint}?${qs}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Bing WMT ${endpoint} : HTTP ${res.status}`);
    const json = await res.json();
    // L'API .svc historique enveloppe la réponse dans { d: ... }.
    return json && json.d !== undefined ? json.d : json;
  } finally {
    clearTimeout(to);
  }
}

// Volume d'un mot-clé (impressions Bing sur la fenêtre). `known: false` = inconnu de Bing,
// ce qui est DÉJÀ une réponse : volume quasi nul de ce côté-là.
export async function getKeywordVolume(q, country = 'fr', language = 'fr-FR') {
  const query = (q || '').trim();
  const { startDate, endDate } = period();
  const ck = `kw:${country}:${language}:${query.toLowerCase()}`;
  const hit = cacheGet(ck);
  if (hit) return { ...hit, cached: true };

  const d = await callBing('GetKeyword', { q: query, country, language, startDate, endDate });
  const known = d != null && typeof d === 'object';
  const out = {
    query,
    country,
    language,
    // Impressions = requête exacte ; BroadImpressions = requête élargie (variantes incluses).
    impressions_3m: known ? Number(d.Impressions ?? d.impressions ?? 0) : 0,
    broad_impressions_3m: known ? Number(d.BroadImpressions ?? d.broadImpressions ?? 0) : 0,
    known,
    period: { start: startDate, end: endDate },
    source: 'bing_webmaster_tools'
  };
  cacheSet(ck, out);
  return { ...out, cached: false };
}

// Mots-clés associés + volumes (le "détecteur de Mixamo" : variantes auxquelles on ne pense pas).
export async function getRelatedKeywords(q, country = 'fr', language = 'fr-FR', limit = 25) {
  const query = (q || '').trim();
  const cap = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);
  const { startDate, endDate } = period();
  const ck = `rel:${country}:${language}:${query.toLowerCase()}`;
  const hit = cacheGet(ck);
  if (hit) return { ...hit, related: hit.related.slice(0, cap), cached: true };

  const d = await callBing('GetRelatedKeywords', { q: query, country, language, startDate, endDate });
  const arr = Array.isArray(d) ? d : [];
  const related = arr
    .map((r) => ({ query: r.Query ?? r.query ?? null, impressions_3m: Number(r.Impressions ?? r.impressions ?? 0) }))
    .filter((r) => r.query)
    .sort((a, b) => b.impressions_3m - a.impressions_3m);
  const out = { query, country, language, period: { start: startDate, end: endDate }, related, source: 'bing_webmaster_tools' };
  cacheSet(ck, out);
  return { ...out, related: related.slice(0, cap), cached: false };
}

// ---- Backlinks via Bing WMT (GetLinkCounts / GetUrlLinks) : données GRATUITES là où
// Ahrefs/Majestic facturent. siteUrl = la propriété validée dans Bing WMT.

// Nombre de backlinks par page du site (quelles pages attirent des liens).
export async function getBacklinkCounts(siteUrl, limit = 50) {
  const cap = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const ck = `blc:${siteUrl}`;
  const hit = cacheGet(ck);
  if (hit) return { ...hit, counts: hit.counts.slice(0, cap), cached: true };

  const d = await callBing('GetLinkCounts', { siteUrl, page: 0 });
  const rows = Array.isArray(d) ? d : (Array.isArray(d?.Links) ? d.Links : []);
  const counts = rows
    .map((r) => ({ url: r.Url ?? r.url ?? null, backlinks: Number(r.Count ?? r.count ?? 0) }))
    .filter((r) => r.url)
    .sort((a, b) => b.backlinks - a.backlinks);
  const out = { site: siteUrl, total_pages_listed: counts.length, counts, source: 'bing_webmaster_tools' };
  cacheSet(ck, out);
  return { ...out, counts: counts.slice(0, cap), cached: false };
}

// Les backlinks d'une page précise : qui pointe vers elle (URL source + titre).
export async function getPageBacklinks(siteUrl, pageUrl, limit = 100) {
  const cap = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  const ck = `bl:${siteUrl}:${pageUrl}`;
  const hit = cacheGet(ck);
  if (hit) return { ...hit, links: hit.links.slice(0, cap), cached: true };

  const d = await callBing('GetUrlLinks', { siteUrl, link: pageUrl, page: 0 });
  const rows = Array.isArray(d) ? d : (Array.isArray(d?.Links) ? d.Links : []);
  const links = rows
    .map((r) => ({ source_url: r.Url ?? r.url ?? null, title: r.Title ?? r.title ?? null }))
    .filter((r) => r.source_url);
  const out = { site: siteUrl, page: pageUrl, backlinks_count: links.length, links, source: 'bing_webmaster_tools' };
  cacheSet(ck, out);
  return { ...out, links: links.slice(0, cap), cached: false };
}
