// backend/services/linkSpotService.js
//
// Vérification du « rel » des cibles de netlinking, EMPLACEMENT PAR EMPLACEMENT.
// Le rel varie à l'intérieur d'un même site (corps d'article, bloc sources, blogroll,
// commentaires, messages de forum) : un booléen unique par domaine serait faux.
//
//  - detectPlatform : reconnaît la plateforme (Forumactif, Invision, FluxBB, Shaarli,
//    WordPress, phpBB…) à partir de signatures HTML simples ;
//  - extractSpots : lit les liens EXTERNES d'une page et les regroupe par emplacement,
//    avec le rel dominant et la présence d'au moins un lien dofollow ;
//  - autoVerifyTarget : page d'accueil + quelques pages d'article, applique la règle
//    de plateforme (seo_link_platform_rules) et enregistre les emplacements ;
//  - upsertSpot / recomputeDofollow : mêmes primitives pour la saisie manuelle et le MCP.
//
// Aucune dépendance : parseur de balises minimal (pile des conteneurs ouverts), suffisant
// pour classer un lien par son conteneur le plus proche.

const USER_AGENT = 'Mozilla/5.0 (compatible; PixfeedLinkCheck/1.0; +https://pixfeed.net)';
const FETCH_TIMEOUT_MS = 12000;
const MAX_BYTES = 1500000;
const MAX_ARTICLE_PAGES = 3;

const EMPLACEMENTS = ['article', 'sources', 'blogroll', 'commentaire', 'forum_message', 'partenaires', 'profil', 'pied', 'autre'];

// rel « bloquant » : nofollow, ugc, sponsored. noopener/noreferrer ne bloquent rien.
function relIsDofollow(rel) {
  const r = String(rel || '').toLowerCase();
  return !/\b(nofollow|ugc|sponsored)\b/.test(r);
}

function normalizeRel(rel) {
  return String(rel || '').toLowerCase().trim().split(/\s+/).filter(Boolean).sort().join(' ');
}

// ─── HTTP ────────────────────────────────────────────────────────────────────
async function fetchPage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'accept-language': 'fr,fr-FR;q=0.9,en;q=0.5' }
    });
    const ctype = res.headers.get('content-type') || '';
    if (!res.ok || !/html|xml/i.test(ctype)) return { ok: false, status: res.status, url: res.url, html: '', headers: res.headers };
    const buf = Buffer.from(await res.arrayBuffer());
    return { ok: true, status: res.status, url: res.url, html: buf.subarray(0, MAX_BYTES).toString('utf8'), headers: res.headers };
  } catch (e) {
    return { ok: false, status: 0, url, html: '', error: e.name === 'AbortError' ? 'timeout' : e.message, headers: null };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Plateforme ──────────────────────────────────────────────────────────────
const PLATFORM_SIGNATURES = [
  // Forumactif et ses marques (hébergé) : assets illiweb, liens forumactif/forumotion…
  ['forumactif', /illiweb\.com|forumactif\.(com|fr|org)|forumotion\.|forumgratuit\.|forum2x2\.|forumperso\.|forumsactifs\.|ahlamontada\./i],
  // Signatures STRICTES (meta generator, chemins d'assets, variables JS) : une simple
  // mention du nom dans un texte ou une URL d'article ne doit pas suffire.
  ['invision', /ipsSettings|data-ips[a-z-]*=|ipsLayout|ipsBox|ipsType_|\/applications\/core\/interface\//i],
  ['fluxbb', /fluxbb\.org|Powered by (<a[^>]*>)?FluxBB|punbb\.informer\.com|Powered by (<a[^>]*>)?PunBB/i],
  ['shaarli', /<meta name="generator" content="Shaarli|Powered by (<a[^>]*>)?Shaarli|class="[^"]*shaarli|shaarli\.(svg|png|css|js)/i],
  ['discourse', /<meta name="generator" content="Discourse|discourse-cdn|id="discourse/i],
  ['xenforo', /data-app="xf"|<meta name="generator" content="XenForo|xf-init|\/js\/xf\//i],
  ['phpbb', /<meta name="generator" content="phpBB|\/styles\/prosilver\/|phpbb_[a-z]+\.(js|css)|\/viewtopic\.php\?/i],
  ['dotclear', /<meta name="generator" content="Dotclear|dotclear\.(js|css)|\/themes\/[^"']+\/dotclear/i],
  ['spip', /<meta name="generator" content="SPIP|spip\.php\?|\/squelettes(-dist)?\//i],
  ['prestashop', /<meta name="generator" content="PrestaShop|var prestashop\s*=|\/modules\/ps_[a-z]|\/themes\/classic\/assets\//i],
  ['wordpress', /<meta name="generator" content="WordPress|\/wp-content\/|\/wp-includes\//i],
];

function detectPlatform(html, headers = null) {
  const h = html || '';
  const powered = headers && typeof headers.get === 'function' ? (headers.get('x-powered-by') || '') : '';
  for (const [platform, re] of PLATFORM_SIGNATURES) {
    if (re.test(h)) {
      // phpBB hébergé chez Forumactif : la signature Forumactif est testée avant, ok.
      return { platform, signal: (h.match(re) || [''])[0].slice(0, 60) };
    }
  }
  if (/Discourse/i.test(powered)) return { platform: 'discourse', signal: 'x-powered-by' };
  return { platform: null, signal: null };
}

// ─── Lecture des liens externes par emplacement ──────────────────────────────
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

// Classe un conteneur ouvert d'après sa balise, ses classes et son id.
function classifyContainer(tag, attrs) {
  const cls = ` ${(attrs.class || '').toLowerCase()} ${(attrs.id || '').toLowerCase()} `;
  if (tag === 'footer' || / (site-footer|footer|colophon) /.test(cls)) return 'pied';
  if (/ (comment|comments|commentlist|comment-list|comment-body|comment-content|respond|commentaires?) /.test(cls) || /comment/.test(cls)) return 'commentaire';
  if (/(postbody|post-body|postcontent|post_content|message-body|messagecontent|message-content|cpost|ipscomment|ipstype_normal|bbcode|forum-post)/.test(cls)) return 'forum_message';
  if (/(blogroll|linkcat|linklist|widget_links|links-widget|liens-amis|sites-amis)/.test(cls)) return 'blogroll';
  if (/(partenaires?|partners?|sponsors?)/.test(cls)) return 'partenaires';
  if (/(signature|user-signature|profile|profil|author-bio|author-box)/.test(cls)) return 'profil';
  if (tag === 'nav' || tag === 'header' || /( main-navigation|site-header|menu )/.test(cls)) return 'autre';
  if (tag === 'aside' || /( sidebar|widget|widget-area|secondary )/.test(cls)) return 'blogroll';
  if (tag === 'article' || tag === 'main' || /(entry-content|post-content|article-content|article-body|content-area|the-content|td-post-content|single-content|post-entry|entry )/.test(cls)) return 'article';
  return null;
}

function parseAttrs(raw) {
  const attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(raw))) {
    attrs[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
  }
  return attrs;
}

function hostOf(href) {
  try { return new URL(href).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }
}

function sameSite(host, targetDomain) {
  const d = String(targetDomain || '').toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '');
  return host === d || host.endsWith(`.${d}`) || d.endsWith(`.${host}`);
}

/**
 * Lit les liens externes d'une page et les regroupe par emplacement.
 * @returns {Array<{emplacement, liens, rels: Object<string,number>, rel_dominant, dofollow, exemple}>}
 */
function extractSpots(html, pageUrl, targetDomain) {
  const h = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const stack = []; // { tag, kind }
  let lastHeading = ''; // dernier titre h2/h3/h4 rencontré (bloc « Sources »)
  let inHeading = null;
  const groups = {};
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;
  let m;
  let textCursor = 0;
  while ((m = tagRe.exec(h))) {
    const isClose = m[0][1] === '/';
    const tag = m[1].toLowerCase();
    if (inHeading && isClose && tag === inHeading) {
      lastHeading = h.slice(textCursor, m.index).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
      inHeading = null;
    }
    if (isClose) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) { stack.splice(i); break; }
      }
      continue;
    }
    if (VOID_TAGS.has(tag) || m[0].endsWith('/>')) continue;
    const attrs = parseAttrs(m[2] || '');
    if (/^h[2-4]$/.test(tag)) { inHeading = tag; textCursor = m.index + m[0].length; }
    if (tag === 'a') {
      const href = attrs.href || '';
      const host = /^https?:\/\//i.test(href) ? hostOf(href) : null;
      if (host && !sameSite(host, targetDomain)) {
        let kind = 'autre';
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].kind) { kind = stack[i].kind; break; }
        }
        if (kind === 'article' && /^(sources?|r[ée]f[ée]rences?|liens? utiles?|pour aller plus loin|bibliographie|voir aussi)\b/.test(lastHeading)) kind = 'sources';
        const rel = normalizeRel(attrs.rel);
        const g = groups[kind] || (groups[kind] = { emplacement: kind, liens: 0, rels: {}, dofollow: false, exemple: null });
        g.liens++;
        g.rels[rel] = (g.rels[rel] || 0) + 1;
        if (relIsDofollow(rel)) { g.dofollow = true; if (!g.exemple) g.exemple = href.slice(0, 200); }
      }
      // <a> n'est pas un conteneur utile : ne pas l'empiler.
      continue;
    }
    stack.push({ tag, kind: classifyContainer(tag, attrs) });
  }
  return Object.values(groups).map((g) => {
    const rel_dominant = Object.entries(g.rels).sort((a, b) => b[1] - a[1])[0][0];
    return { ...g, rel_dominant, url: pageUrl };
  });
}

// Quelques liens internes « d'article » depuis l'accueil (chemin non trivial, hors
// pagination/tags/catégories/fichiers).
function pickArticleLinks(html, baseUrl, targetDomain, max = MAX_ARTICLE_PAGES) {
  const out = new Set();
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#?]+)[^"']*["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) && out.size < max * 4) {
    let abs;
    try { abs = new URL(m[1], baseUrl); } catch { continue; }
    if (!/^https?:$/.test(abs.protocol)) continue;
    const host = abs.hostname.toLowerCase().replace(/^www\./, '');
    if (!sameSite(host, targetDomain)) continue;
    const p = abs.pathname;
    if (p.length < 8) continue;
    if (/\.(jpe?g|png|gif|webp|svg|pdf|zip|mp4|css|js|xml|rss)$/i.test(p)) continue;
    if (/\/(tag|tags|category|categorie|categories|author|auteur|page|feed|wp-|login|register|inscription|connexion|contact|mentions|cgu|cgv|search|recherche|profile|profil|memberlist|ucp)\b/i.test(p)) continue;
    out.add(`${abs.origin}${p}`);
  }
  return [...out].slice(0, max);
}

// ─── Persistance ─────────────────────────────────────────────────────────────
async function upsertSpot(db, targetId, { emplacement, url = null, rel = '', source = 'manuel', note = null, liens_vus = null }) {
  const emp = EMPLACEMENTS.includes(emplacement) ? emplacement : 'autre';
  const relN = normalizeRel(rel);
  const { rows } = await db.pool.query(
    `INSERT INTO seo_link_target_spots (target_id, emplacement, url, rel, dofollow, source, liens_vus, note, verified_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (target_id, emplacement, COALESCE(url, '')) DO UPDATE SET
       rel = EXCLUDED.rel, dofollow = EXCLUDED.dofollow, source = EXCLUDED.source,
       liens_vus = COALESCE(EXCLUDED.liens_vus, seo_link_target_spots.liens_vus),
       note = COALESCE(EXCLUDED.note, seo_link_target_spots.note), verified_at = NOW()
     RETURNING *`,
    [targetId, emp, url || null, relN, relIsDofollow(relN), source, liens_vus, note]
  );
  return rows[0];
}

// dofollow de la cible = au moins un emplacement dofollow ; NULL si aucun emplacement.
async function recomputeDofollow(db, targetId) {
  const { rows } = await db.pool.query(
    `UPDATE seo_link_targets t SET
       dofollow = (SELECT CASE WHEN COUNT(*) = 0 THEN NULL ELSE bool_or(s.dofollow) END FROM seo_link_target_spots s WHERE s.target_id = t.id),
       rel_verifie_le = (SELECT MAX(verified_at) FROM seo_link_target_spots s WHERE s.target_id = t.id)
     WHERE t.id = $1 RETURNING dofollow, rel_verifie_le`,
    [targetId]
  );
  return rows[0] || null;
}

async function loadRules(db) {
  const { rows } = await db.pool.query('SELECT * FROM seo_link_platform_rules WHERE actif IS DISTINCT FROM FALSE');
  const map = {};
  for (const r of rows) map[r.platform] = r;
  return map;
}

/**
 * Vérifie automatiquement une cible : plateforme + emplacements lus sur l'accueil et
 * quelques articles, règle de plateforme appliquée, dofollow dérivé.
 * @returns {{ ok, platform, spots: number, rule: string|null, error?: string }}
 */
async function autoVerifyTarget(db, target, rules = null) {
  const rulesMap = rules || await loadRules(db);
  const domain = String(target.domain).toLowerCase();
  let page = await fetchPage(`https://${domain}/`);
  if (!page.ok) page = await fetchPage(`http://${domain}/`);
  if (!page.ok) {
    await db.pool.query('UPDATE seo_link_targets SET rel_verifie_le = NOW() WHERE id = $1', [target.id]).catch(() => {});
    return { ok: false, platform: null, spots: 0, rule: null, error: page.error || `HTTP ${page.status}` };
  }
  const { platform } = detectPlatform(page.html, page.headers);
  const pages = [page];
  for (const u of pickArticleLinks(page.html, page.url, domain)) {
    const p = await fetchPage(u);
    if (p.ok) pages.push(p);
  }
  // Fusion par emplacement : on garde l'URL du meilleur exemple (dofollow si possible).
  const merged = {};
  for (const p of pages) {
    for (const s of extractSpots(p.html, p.url, domain)) {
      const cur = merged[s.emplacement];
      if (!cur || (s.dofollow && !cur.dofollow) || (!cur.dofollow && s.liens > cur.liens)) merged[s.emplacement] = s;
      else cur.liens += s.liens;
    }
  }
  let saved = 0;
  for (const s of Object.values(merged)) {
    await upsertSpot(db, target.id, {
      emplacement: s.emplacement, url: s.url, rel: s.rel_dominant, source: 'auto', liens_vus: s.liens,
      note: `${s.liens} lien(s) externe(s) vus, rel dominant « ${s.rel_dominant || 'aucun'} »${s.dofollow ? ', au moins un dofollow' : ''}`
    });
    saved++;
  }
  // Règle de plateforme : posée comme emplacement 'regle' si rien d'observé à cet emplacement.
  let ruleNote = null;
  const rule = platform ? rulesMap[platform] : null;
  if (rule) {
    ruleNote = rule.motif;
    if (!merged[rule.emplacement]) {
      await upsertSpot(db, target.id, { emplacement: rule.emplacement, url: null, rel: rule.rel_defaut || '', source: 'regle', note: rule.motif });
      saved++;
    }
  }
  await db.pool.query(
    'UPDATE seo_link_targets SET platform = COALESCE($2, platform), platform_rule_note = $3 WHERE id = $1',
    [target.id, platform, ruleNote]
  );
  await recomputeDofollow(db, target.id);
  return { ok: true, platform, spots: saved, rule: ruleNote };
}

module.exports = {
  EMPLACEMENTS, relIsDofollow, normalizeRel,
  fetchPage, detectPlatform, extractSpots, pickArticleLinks,
  upsertSpot, recomputeDofollow, loadRules, autoVerifyTarget
};
