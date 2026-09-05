// backend/controllers/seoAuthorityController.js
//
// Autorite du domaine et liens entrants — LECTURE SEULE de seo_authority_daily et
// seo_backlinks, tables remplies par le worker (job 'authority', seo_worker/authority.py).
//
// Ce que montre le tableau de bord Semrush (Authority Score, Backlinks, Domaines referents,
// gagnes/perdus), avec des sources gratuites et nommees : Open PageRank pour l'autorite
// (proxy 0..10, pas la formule Semrush), Bing Webmaster Tools pour la liste des liens.

const clampInt = (v, def, min, max) => Math.min(Math.max(parseInt(v, 10) || def, min), max);

// ---- Import CSV de liens entrants -------------------------------------------------------
// L'API Bing repond souvent « zero lien » meme pour un site verifie. La source la plus
// complete et gratuite est le rapport Liens de Search Console, sans API mais exportable :
// « Liens externes > Derniers liens externes » (une ligne par page qui nous lie). On accepte
// aussi l'export Bing Webmaster Tools. Le worker verifie ensuite chaque lien a la source
// (rel, type, ancre, presence), enrichit les domaines et calcule la toxicite : l'import ne
// fait qu'amorcer. Ecriture Node sur seo_backlinks : exception assumee, comme la watchlist.

// Parseur CSV minimal mais complet : guillemets, guillemets doubles, delimiteur , ; ou tab.
function parseCsv(text) {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].map((d) => [d, (firstLine.match(new RegExp(d === '\t' ? '\t' : `\\${d}`, 'g')) || []).length])
    .sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v && v.trim() !== ''));
}

// Sans accents ni ponctuation : « Dernière exploration » -> « derniere exploration ».
const norm = (h) => (h || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// En-tetes reconnus (Search Console FR/EN, Bing WMT). Le premier qui matche gagne.
const COLS = {
  source: ['page de liaison', 'linking page', 'page source', 'source url', 'url source', 'url de la page d origine', 'lien', 'page', 'url'],
  target: ['page cible', 'target page', 'target url', 'url cible', 'cible'],
  anchor: ['texte d ancrage', 'anchor text', 'ancre', 'anchor'],
  date: ['derniere exploration', 'last crawled', 'date de derniere exploration', 'date', 'first seen', 'premiere vue'],
  site: ['site', 'sites d origine', 'linking site', 'domaine'],
};
const findCol = (headers, names) => { for (const n of names) { const i = headers.indexOf(n); if (i >= 0) return i; } return -1; };
const isUrl = (v) => /^https?:\/\/\S+/i.test((v || '').trim());
const hostOf = (u) => { try { const h = new URL(u).hostname.toLowerCase(); return h.startsWith('www.') ? h.slice(4) : h; } catch { return ''; } };
const parseDate = (v) => {
  if (!v) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s); return isNaN(d) ? null : d.toISOString().slice(0, 10);
};

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
        `WITH d AS (
           SELECT source_domain, COUNT(*)::int AS links, COUNT(DISTINCT target_url)::int AS targets,
                  COUNT(*) FILTER (WHERE status = 'active' AND rel = 'follow')::int AS follow_links,
                  COUNT(*) FILTER (WHERE status = 'active' AND rel IS NOT NULL AND rel <> 'follow')::int AS nofollow_links,
                  MIN(first_seen) AS first_seen, MAX(last_seen) AS last_seen,
                  (ARRAY_AGG(anchor ORDER BY last_seen DESC, id DESC))[1] AS anchor,
                  (ARRAY_AGG(source_url ORDER BY last_seen DESC, id DESC))[1] AS source_url,
                  (ARRAY_AGG(target_url ORDER BY last_seen DESC, id DESC))[1] AS target_url,
                  BOOL_AND(status = 'lost') AS lost
             FROM seo_backlinks WHERE site_id = $1 GROUP BY source_domain)
         SELECT d.*, r.opr_score::float AS opr_score, r.country, r.tld, r.toxicity, r.toxicity_reasons
           FROM d LEFT JOIN seo_ref_domains r ON r.site_id = $1 AND r.domain = d.source_domain
          ORDER BY d.lost, d.links DESC, d.first_seen DESC
          LIMIT 500`,
        [siteId]
      );
      // Ce que Semrush appelle attributs, types, TLD, pays, autorite des referents, ancres,
      // toxicite : tout est constate a la source par le worker, ou calcule ici.
      const { rows: attrs } = await db.pool.query(
        `SELECT COALESCE(rel, 'unknown') AS rel, COUNT(*)::int AS n FROM seo_backlinks WHERE site_id = $1 AND status = 'active' GROUP BY 1`, [siteId]);
      const { rows: types } = await db.pool.query(
        `SELECT COALESCE(link_type, 'unknown') AS link_type, COUNT(*)::int AS n FROM seo_backlinks WHERE site_id = $1 AND status = 'active' GROUP BY 1`, [siteId]);
      const { rows: verif } = await db.pool.query(
        `SELECT COUNT(*) FILTER (WHERE verified_at IS NOT NULL)::int AS verified, COUNT(*)::int AS total
           FROM seo_backlinks WHERE site_id = $1 AND status = 'active'`, [siteId]);
      const { rows: tlds } = await db.pool.query(
        `SELECT COALESCE(r.tld, split_part(b.source_domain, '.', array_length(string_to_array(b.source_domain, '.'), 1))) AS tld, COUNT(DISTINCT b.source_domain)::int AS n
           FROM seo_backlinks b LEFT JOIN seo_ref_domains r ON r.site_id = $1 AND r.domain = b.source_domain
          WHERE b.site_id = $1 AND b.status = 'active' GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, [siteId]);
      const { rows: countries } = await db.pool.query(
        `SELECT COALESCE(r.country, '??') AS country, COUNT(DISTINCT b.source_domain)::int AS n
           FROM seo_backlinks b LEFT JOIN seo_ref_domains r ON r.site_id = $1 AND r.domain = b.source_domain
          WHERE b.site_id = $1 AND b.status = 'active' GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, [siteId]);
      const { rows: oprBuckets } = await db.pool.query(
        `SELECT CASE WHEN r.opr_score IS NULL THEN 'inconnu' WHEN r.opr_score >= 5 THEN '5-10' WHEN r.opr_score >= 3 THEN '3-5'
                     WHEN r.opr_score >= 2 THEN '2-3' WHEN r.opr_score >= 1 THEN '1-2' ELSE '0-1' END AS bucket,
                COUNT(DISTINCT b.source_domain)::int AS n
           FROM seo_backlinks b LEFT JOIN seo_ref_domains r ON r.site_id = $1 AND r.domain = b.source_domain
          WHERE b.site_id = $1 AND b.status = 'active' GROUP BY 1`, [siteId]);
      const { rows: anchors } = await db.pool.query(
        `SELECT anchor, COUNT(*)::int AS n, COUNT(DISTINCT source_domain)::int AS domains
           FROM seo_backlinks WHERE site_id = $1 AND status = 'active' AND COALESCE(anchor,'') <> ''
          GROUP BY anchor ORDER BY 3 DESC, 2 DESC LIMIT 15`, [siteId]);
      const { rows: toxRows } = await db.pool.query(
        `SELECT r.domain, r.toxicity, r.toxicity_reasons, r.opr_score::float AS opr_score, COUNT(b.id)::int AS links
           FROM seo_ref_domains r JOIN seo_backlinks b ON b.site_id = r.site_id AND b.source_domain = r.domain AND b.status = 'active'
          WHERE r.site_id = $1 AND r.toxicity IS NOT NULL
          GROUP BY r.domain, r.toxicity, r.toxicity_reasons, r.opr_score ORDER BY r.toxicity DESC, links DESC`, [siteId]);
      const toxDomains = toxRows.length;
      const toxLinks = toxRows.reduce((a, r) => a + r.links, 0);
      const toxicLinks = toxRows.filter((r) => r.toxicity >= 60).reduce((a, r) => a + r.links, 0);
      const toxicity = {
        // Score global = part des liens actifs venant de domaines juges toxiques (>= 60), en %.
        score: toxLinks ? Math.round((100 * toxicLinks) / toxLinks) : null,
        domains_evaluated: toxDomains,
        buckets: {
          sain: toxRows.filter((r) => r.toxicity < 30).length,
          douteux: toxRows.filter((r) => r.toxicity >= 30 && r.toxicity < 60).length,
          toxique: toxRows.filter((r) => r.toxicity >= 60).length,
        },
        worst: toxRows.filter((r) => r.toxicity >= 30).slice(0, 30),
        method: 'Indicateur maison 0-100 par domaine : autorité nulle (+30), ancre suspecte (+30), lien répété sur des dizaines de pages (+15), extension à risque (+15), nom généré (+10). Toxique à partir de 60, douteux à partir de 30. Le score global est la part des liens actifs venant de domaines toxiques.',
      };
      const { rows: weekly } = await db.pool.query(
        `WITH w AS (SELECT generate_series(date_trunc('week', $2::date - 84), date_trunc('week', $2::date), '1 week')::date AS week)
         SELECT w.week,
                (SELECT COUNT(*) FROM seo_backlinks b WHERE b.site_id = $1 AND date_trunc('week', b.first_seen)::date = w.week)::int AS gained,
                (SELECT COUNT(*) FROM seo_backlinks b WHERE b.site_id = $1 AND b.lost_at IS NOT NULL AND date_trunc('week', b.lost_at)::date = w.week)::int AS lost,
                (SELECT COUNT(DISTINCT source_domain) FROM seo_backlinks b WHERE b.site_id = $1 AND date_trunc('week', b.first_seen)::date = w.week)::int AS gained_domains,
                (SELECT COUNT(DISTINCT source_domain) FROM seo_backlinks b WHERE b.site_id = $1 AND b.lost_at IS NOT NULL AND date_trunc('week', b.lost_at)::date = w.week)::int AS lost_domains
           FROM w ORDER BY w.week`, [siteId, cur.date]);
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
        weekly,
        attributes: { rel: attrs, types, verified: verif[0].verified, total_active: verif[0].total },
        tlds, countries, opr_buckets: oprBuckets, anchors, toxicity,
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

  // POST /api/seo/authority/import  (multipart : site_id, file=CSV)
  importBacklinks: async (req, res) => {
    const db = req.app.locals.db;
    const siteId = parseInt((req.body || {}).site_id, 10);
    if (!siteId) return res.status(400).json({ message: 'site_id requis' });
    if (!req.file || !req.file.buffer) return res.status(400).json({ message: 'Fichier CSV requis' });
    try {
      const site = await db.pool.query('SELECT id, domain, wp_base_url FROM seo_sites WHERE id = $1', [siteId]);
      if (!site.rows[0]) return res.status(404).json({ message: 'Site introuvable' });
      const domain = site.rows[0].domain;
      const home = (site.rows[0].wp_base_url || `https://${domain}`).replace(/\/+$/, '') + '/';
      const origin = /bing/i.test(req.file.originalname || '') ? 'bing_export' : 'gsc_export';

      const rows = parseCsv(req.file.buffer.toString('utf8'));
      if (rows.length < 2) return res.status(400).json({ message: 'CSV vide ou illisible' });
      const headers = rows[0].map(norm);
      const iSrc = findCol(headers, COLS.source), iTgt = findCol(headers, COLS.target);
      const iAnc = findCol(headers, COLS.anchor), iDate = findCol(headers, COLS.date), iSite = findCol(headers, COLS.site);
      // Fichier « Sites d'origine des liens principaux » : des domaines sans page -> inutilisable
      // pour la verification a la source (on ne saurait pas quelle page lire).
      const sample = rows.slice(1, 6).map((r) => (r[iSrc >= 0 ? iSrc : 0] || '').trim());
      if (iSrc < 0 || (!sample.some(isUrl) && (iSite >= 0 || sample.every((v) => v && !v.includes('/'))))) {
        return res.status(400).json({
          message: "Ce fichier ne contient que des noms de domaine, pas les pages qui vous lient. Dans Search Console : Liens > Liens externes > Exporter > « Derniers liens externes » (ou le détail d'un site : « Pages contenant des liens »).",
          headers: rows[0],
        });
      }

      let inserted = 0, updated = 0, skipped = 0, internal = 0;
      const seen = new Set();
      for (const r of rows.slice(1)) {
        const src = (r[iSrc] || '').trim();
        if (!isUrl(src)) { skipped++; continue; }
        const sd = hostOf(src);
        if (!sd || sd === domain || sd.endsWith('.' + domain)) { internal++; continue; }
        let tgt = iTgt >= 0 ? (r[iTgt] || '').trim() : '';
        if (!isUrl(tgt)) tgt = home; // cible inconnue : la verification a la source la retrouvera
        const key = `${src}|${tgt}`;
        if (seen.has(key)) continue; seen.add(key);
        const anchor = iAnc >= 0 ? (r[iAnc] || '').trim().slice(0, 300) : null;
        const seenAt = iDate >= 0 ? parseDate(r[iDate]) : null;
        const q = await db.pool.query(
          `INSERT INTO seo_backlinks (site_id, source_url, source_domain, target_url, anchor, first_seen, last_seen, status, origin, verified_at)
           VALUES ($1, $2, $3, $4, NULLIF($5,''), COALESCE($6::date, CURRENT_DATE), COALESCE($6::date, CURRENT_DATE), 'active', $7, NULL)
           ON CONFLICT (site_id, source_url, target_url) DO UPDATE
             SET last_seen = GREATEST(seo_backlinks.last_seen, EXCLUDED.last_seen),
                 anchor = COALESCE(seo_backlinks.anchor, EXCLUDED.anchor),
                 verified_at = NULL
           RETURNING (xmax = 0) AS inserted`,
          [siteId, src.slice(0, 2000), sd, tgt.slice(0, 2000), anchor, seenAt, origin]
        );
        if (q.rows[0] && q.rows[0].inserted) inserted++; else updated++;
      }
      // Lance l'analyse d'autorite tout de suite (verification a la source, enrichissement,
      // toxicite) si aucun job n'est actif sur le site ; sinon la nuit s'en chargera.
      let job = null;
      if (inserted + updated > 0) {
        try {
          const j = await db.pool.query(
            "INSERT INTO seo_jobs (site_id, job_type, status, source) VALUES ($1, 'authority', 'pending', 'ui') RETURNING id", [siteId]);
          job = j.rows[0].id;
        } catch (e) { if (e.code !== '23505') throw e; }
      }
      res.json({ inserted, updated, skipped, internal, total_rows: rows.length - 1, origin, job_started: job != null,
        columns: { source: rows[0][iSrc], target: iTgt >= 0 ? rows[0][iTgt] : null, anchor: iAnc >= 0 ? rows[0][iAnc] : null, date: iDate >= 0 ? rows[0][iDate] : null } });
    } catch (e) {
      console.error('[SEO] import backlinks:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },
};

module.exports = seoAuthorityController;
