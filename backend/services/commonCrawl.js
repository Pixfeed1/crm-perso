// Crawl Common Crawl à utiliser : le plus récent dont l'index en colonnes (cc-index-table) est publié.
// COMMON_CRAWL_ID dans backend/.env force un crawl précis. Liste des crawls : index.commoncrawl.org/collinfo.json.
const axios = require('axios');

const REPLI = 'CC-MAIN-2026-43';            // dernier crawl connu, si Common Crawl ne répond pas
const DUREE_CACHE = 12 * 3600 * 1000;
let cache = null;                            // { id, le }

const getDefaut = (url, opts) => axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'CRM-PixFeed/1.0' }, validateStatus: () => true, ...opts });

async function crawlCourant({ get = getDefaut, maintenant = Date.now } = {}) {
  if (process.env.COMMON_CRAWL_ID) return { id: process.env.COMMON_CRAWL_ID, source: 'COMMON_CRAWL_ID (backend/.env)' };
  if (cache && maintenant() - cache.le < DUREE_CACHE) return { id: cache.id, source: 'dernier crawl publié' };
  try {
    const r = await get('https://index.commoncrawl.org/collinfo.json');
    const ids = (Array.isArray(r.data) ? r.data : []).map((c) => c && c.id).filter((id) => /^CC-MAIN-\d{4}-\d{2}$/.test(id || '')).sort().reverse();
    // Le plus récent dont l'index en colonnes est déjà en ligne (il arrive quelques jours après le crawl).
    for (const id of ids.slice(0, 3)) {
      const m = await get(`https://data.commoncrawl.org/crawl-data/${id}/cc-index-table.paths.gz`, { responseType: 'arraybuffer', maxContentLength: 5 * 1024 * 1024 });
      if (m.status === 200) { cache = { id, le: maintenant() }; return { id, source: 'dernier crawl publié' }; }
    }
  } catch (e) { /* Common Crawl injoignable : repli */ }
  return { id: (cache && cache.id) || REPLI, source: 'repli (liste des crawls indisponible)' };
}
const viderCache = () => { cache = null; };

module.exports = { crawlCourant, viderCache, REPLI };
