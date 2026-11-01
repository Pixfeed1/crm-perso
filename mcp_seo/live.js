// mcp_seo/live.js
// get_live_page : lecture EN DIRECT d'une page WordPress, au moment de l'appel. LECTURE SEULE.
//  - API REST WordPress (utilisateur dédié + mot de passe d'application, context=edit) : fiche,
//    champs Yoast, contenu brut (shortcodes compris) structuré, liens internes entrants.
//  - Page publique, demandée avec un paramètre unique pour passer le cache : ce que voit Google.
// Accès : WP_API_USER_<site_id> / WP_API_PASSWORD_<site_id> (backend/.env, ou l'environnement).
// Ils ne sortent jamais : ni dans la réponse, ni dans un journal, ni dans un message d'erreur.
// Les requêtes authentifiées ne partent QUE vers l'adresse WordPress du site (seo_sites).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { parse as parseHtml } from 'node-html-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ENV = process.env.MCP_BACKEND_ENV || path.join(__dirname, '..', 'backend', '.env');
const UA = 'Mozilla/5.0 (compatible; CRM-PixFeed-SEO/1.0; lecture en direct)';
const TIMEOUT_MS = 20000;
const MAX = { headings: 80, paragraphs: 150, links: 120, images: 60, related: 20, inbound: 50, redirects: 10 };
const SRC = {
  wp: 'API REST WordPress (context=edit)',
  yoast: 'API REST WordPress : champs Yoast exposés par functions.php + yoast_head_json',
  content: 'API REST WordPress : contenu brut (content.raw, shortcodes compris)',
  public: 'page publique (paramètre unique anti-cache)',
  inbound: 'API REST WordPress : recherche dans le contenu brut des contenus publiés',
  base: 'base du CRM (seo_pages)',
};
// types techniques de WordPress, jamais des pages
const TYPES_EXCLUS = new Set(['attachment', 'nav_menu_item', 'wp_block', 'wp_template', 'wp_template_part', 'wp_navigation', 'wp_global_styles', 'wp_font_family', 'wp_font_face']);

// ---------- utilitaires ----------
const plafonne = (arr, n) => (arr.length > n ? { total: arr.length, affiches: n, items: arr.slice(0, n) } : { total: arr.length, items: arr });
const txt = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const decode = (s) => txt(parseHtml(`<p>${String(s ?? '')}</p>`).text);
// retire null, '', [], {} (récursif) : sortie compacte
function compact(v) {
  if (Array.isArray(v)) return v.map(compact).filter((x) => !vide(x));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) { const c = compact(x); if (!vide(c)) o[k] = c; }
    return o;
  }
  return v;
}
const vide = (x) => x === null || x === undefined || x === '' || (Array.isArray(x) && !x.length) || (x && typeof x === 'object' && !Array.isArray(x) && !Object.keys(x).length);

function hoteNu(h) { return String(h || '').toLowerCase().replace(/^www\./, ''); }
/** Adresse comparable : https, hôte sans www, sans paramètres ni ancre, sans / final. */
export function normaliser(u, base) {
  try {
    const x = new URL(u, base);
    if (!/^https?:$/.test(x.protocol)) return null;
    return `${hoteNu(x.hostname)}${decodeURI(x.pathname).replace(/\/+$/, '') || '/'}`.toLowerCase();
  } catch { return null; }
}

async function requete(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try { return await fetch(url, { ...opts, signal: ctrl.signal, headers: { 'User-Agent': UA, ...(opts.headers || {}) } }); }
  finally { clearTimeout(t); }
}

/** Erreur lisible d'une source : code HTTP + message WordPress, jamais l'en-tête d'accès. */
async function erreurHttp(r, source) {
  let message = r.statusText || 'erreur';
  try { const j = await r.json(); if (j && j.message) message = `${j.code ? j.code + ' : ' : ''}${txt(decode(j.message))}`; } catch { /* corps non JSON */ }
  return { source, code: r.status, message };
}
const erreurReseau = (e, source) => ({ source, code: e.name === 'AbortError' ? 'timeout' : (e.cause && e.cause.code) || 'réseau', message: e.name === 'AbortError' ? `pas de réponse en ${TIMEOUT_MS / 1000} s` : txt(e.message) });

// ---------- accès WordPress ----------
export function accesWordPress(siteId) {
  const cle = (n) => `WP_API_${n}_${siteId}`;
  let user = process.env[cle('USER')];
  let pass = process.env[cle('PASSWORD')];
  if (!user || !pass) {
    try {
      const env = dotenv.parse(fs.readFileSync(BACKEND_ENV));   // seules ces deux clés sont gardées
      user = user || env[cle('USER')];
      pass = pass || env[cle('PASSWORD')];
    } catch { /* fichier absent : signalé plus bas */ }
  }
  if (!user || !pass) return { erreur: `accès WordPress non configuré pour le site ${siteId} : ${cle('USER')} et ${cle('PASSWORD')} absents de backend/.env` };
  return { auth: 'Basic ' + Buffer.from(`${user}:${String(pass).replace(/\s+/g, '')}`).toString('base64') };
}

function clientWp(base, auth) {
  return async (chemin, params = {}) => {
    const u = new URL(`${base}/wp-json/wp/v2/${chemin}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return requete(u, { headers: { Authorization: auth, Accept: 'application/json' } });
  };
}

// ---------- contenu brut structuré ----------
const RE_SC = /\[(\/?)([a-zA-Z][\w-]*)((?:\s[^\]]*)?)\]/g;
function autop(raw) {
  // contenu de l'éditeur classique : WordPress ajoute les <p> à l'affichage, pas en base
  if (/<p[\s>]/i.test(raw) || /<!--\s*wp:/.test(raw)) return raw;
  return raw.split(/\n\s*\n/).map((b) => (/^\s*<(h[1-6]|ul|ol|table|div|figure|blockquote|pre|\[)/i.test(b) ? b : `<p>${b.trim().replace(/\n/g, '<br>')}</p>`)).join('\n');
}

export function structurerContenu(raw, baseSite) {
  const shortcodes = new Map();
  for (const m of String(raw || '').matchAll(RE_SC)) if (!m[1]) shortcodes.set(m[2], (shortcodes.get(m[2]) || 0) + 1);

  // légendes de l'éditeur classique : [caption ...]<img ...> Légende[/caption]
  const legendes = new Map();
  for (const m of String(raw || '').matchAll(/\[caption[^\]]*\]([\s\S]*?)\[\/caption\]/g)) {
    const img = /<img[^>]+src=["']([^"']+)/i.exec(m[1]);
    if (img) legendes.set(img[1], txt(decode(m[1].replace(/<a[^>]*>|<\/a>|<img[^>]*>/gi, ''))));
  }
  const html = autop(String(raw || '').replace(/\[caption[^\]]*\]|\[\/caption\]/g, ''));
  const doc = parseHtml(html, { comment: false });
  const sansSc = (s) => txt(String(s).replace(RE_SC, ' '));

  const headings = doc.querySelectorAll('h1,h2,h3,h4').map((h) => ({ n: Number(h.tagName[1]), t: sansSc(h.text) })).filter((h) => h.t);
  const paragraphs = [];
  for (const el of doc.querySelectorAll('p,li')) {
    if (el.tagName === 'P' && el.closest('li')) continue;
    const t = sansSc(el.text);
    if (t) paragraphs.push(el.tagName === 'LI' ? `• ${t}` : t);
  }
  const hoteSite = hoteNu(new URL(baseSite).hostname);
  const links = doc.querySelectorAll('a[href]').map((a) => {
    const href = a.getAttribute('href').trim();
    let interne = false;
    try { const x = new URL(href, baseSite); interne = /^https?:$/.test(x.protocol) && hoteNu(x.hostname) === hoteSite; } catch { /* mailto:, ancre… */ }
    const img = a.querySelector('img');
    return { href, ancre: sansSc(a.text) || (img ? `[image] ${img.getAttribute('alt') || ''}`.trim() : ''), interne, rel: a.getAttribute('rel') || undefined };
  });
  const images = doc.querySelectorAll('img').map((i) => {
    const src = i.getAttribute('src') || '';
    const fig = i.closest('figure');
    const cap = fig && fig.querySelector('figcaption');
    return {
      src, alt: i.getAttribute('alt') === undefined ? '(attribut alt absent)' : (txt(i.getAttribute('alt')) || '(alt vide)'),
      legende: cap ? sansSc(cap.text) : legendes.get(src),
      largeur: i.getAttribute('width') ? Number(i.getAttribute('width')) : undefined,
      hauteur: i.getAttribute('height') ? Number(i.getAttribute('height')) : undefined,
    };
  });
  const texte = sansSc(doc.structuredText);   // blocs séparés : « un</li><li>deux » ne fusionne pas
  const mots = (texte.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
  return {
    mots,
    titres: plafonne(headings, MAX.headings),
    paragraphes: plafonne(paragraphs, MAX.paragraphs),
    liens: { internes: links.filter((l) => l.interne).length, externes: links.filter((l) => !l.interne).length, ...plafonne(links, MAX.links) },
    images: plafonne(images, MAX.images),
    shortcodes: [...shortcodes].map(([nom, nb]) => ({ nom, nb })).sort((a, b) => b.nb - a.nb),
  };
}

// ---------- page publique ----------
// titre EXACT d'un bloc de suggestions (un encadré « À lire aussi : X » dans le texte ne compte pas)
const RE_SIMILAIRES = /^(articles?|contenus?|guides?)\s+(similaires|li[ée]s|connexes|associ[ée]s)\s*:?$|^[àa]\s+lire\s+aussi\s*:?$|^vous\s+aimerez\s+aussi\s*:?$|^sur\s+le\s+m[êe]me\s+(th[èe]me|sujet)\s*:?$|^dans\s+la\s+m[êe]me\s+cat[ée]gorie\s*:?$|^pour\s+aller\s+plus\s+loin\s*:?$/i;
// le corps de l'article : ses encadrés et liens ne sont pas le bloc du thème
const CORPS = '.entry-content,.article-body,.post-content,.wp-block-post-content,.single-content';
const dansCorps = (n) => !!(n && n.closest && n.closest(CORPS));   // closest inclut l'élément lui-même
const decrire = (n) => `${n.tagName.toLowerCase()}${n.getAttribute('class') ? '.' + n.getAttribute('class').trim().split(/\s+/).join('.') : ''}`;

/** Ancre d'une carte : son titre s'il y en a un, sinon le texte sans date, catégorie ni « Lire ». */
function ancreDe(a) {
  const titre = a.querySelector('h2,h3,h4,h5,h6,[class*="title"],[class*="titre"]');
  if (titre && txt(titre.text)) return txt(titre.text);
  let t = txt(a.text);
  for (const el of a.querySelectorAll('time,[class*="date"],[class*="meta"],[class*="cat"],[class*="cta"],[class*="more"],[class*="read"]')) {
    const x = txt(el.text);
    if (x) t = txt(t.replace(x, ' '));
  }
  t = t.replace(/\s*(Lire( la suite)?|En savoir plus)\s*[↗→›»]*\s*︎?$/i, '').trim();
  const img = a.querySelector('img');
  return t || a.getAttribute('title') || (img && img.getAttribute('alt')) || '';
}

export function blocSimilaires(doc, baseUrl) {
  const liensDe = (node) => {
    const vus = new Set(); const out = [];
    for (const a of node.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href');
      const n = normaliser(href, baseUrl);
      if (!n || vus.has(n) || href.startsWith('#')) continue;
      vus.add(n);
      out.push({ href, ancre: ancreDe(a) });
    }
    return out;
  };
  // 1. un titre de bloc exact (« Articles similaires », « Articles liés », « À lire aussi »…), hors du corps de l'article
  for (const h of doc.querySelectorAll('h2,h3,h4,h5,h6,.widget-title,[class*="title"],[class*="titre"],strong,span,p,div')) {
    const t = txt(h.text);
    if (t.length > 40 || !RE_SIMILAIRES.test(t) || h.querySelector('a') || dansCorps(h)) continue;
    let node = h.parentNode;
    for (let i = 0; node && i < 4; i++, node = node.parentNode) {
      if (!node.tagName || /^(BODY|MAIN|HTML|ARTICLE)$/.test(node.tagName) || dansCorps(node)) break;
      const l = liensDe(node);
      if (l.length >= 2) return { detecte_par: `titre « ${t} » (${decrire(node)})`, ...plafonne(l, MAX.related) };
    }
  }
  // 2. un bloc dont la classe ou l'id le désigne, hors du corps de l'article
  for (const sel of ['[class*="related"]', '[id*="related"]', '[class*="similaire"]', '[class*="similar"]']) {
    for (const node of doc.querySelectorAll(sel)) {
      if (dansCorps(node)) continue;
      const l = liensDe(node);
      if (l.length >= 2) return { detecte_par: `sélecteur ${sel} (${decrire(node)})`, ...plafonne(l, MAX.related) };
    }
  }
  return { detecte_par: "aucun bloc « Articles similaires » trouvé hors du corps de l'article", total: 0 };
}

async function lirePublique(url) {
  const marque = `crm_live=${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const depart = new URL(url);
  depart.searchParams.set(...marque.split('='));
  const sauts = [];
  let courant = depart.toString();
  let r;
  for (let i = 0; i <= MAX.redirects; i++) {
    r = await requete(courant, { redirect: 'manual', headers: { Accept: 'text/html', 'Cache-Control': 'no-cache', Pragma: 'no-cache' } });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      const suivant = new URL(r.headers.get('location'), courant).toString();
      sauts.push({ code: r.status, vers: suivant.replace(/[?&]crm_live=[^&]*/, '').replace(/\?$/, '') });
      courant = suivant;
      continue;
    }
    break;
  }
  const html = await r.text();
  const doc = parseHtml(html, { comment: true });
  const meta = (sel, attr = 'content') => { const el = doc.querySelector(sel); return el ? txt(el.getAttribute(attr)) : null; };

  // le cache a-t-il quand même servi la page ?
  const h = (k) => r.headers.get(k);
  const indices = [];
  if (h('x-litespeed-cache')) indices.push(`x-litespeed-cache: ${h('x-litespeed-cache')}`);
  if (h('cf-cache-status')) indices.push(`cf-cache-status: ${h('cf-cache-status')}`);
  if (h('x-cache')) indices.push(`x-cache: ${h('x-cache')}`);
  if (h('x-rocket-nginx-serving-static')) indices.push(`x-rocket-nginx-serving-static: ${h('x-rocket-nginx-serving-static')}`);
  if (h('age') && Number(h('age')) > 0) indices.push(`age: ${h('age')} s`);
  const rocket = /<!--\s*This website is like a Rocket[\s\S]*?-->/i.exec(html);
  const rocketDate = rocket && /cached@(\d+)/.exec(rocket[0]);
  if (rocket) indices.push(rocketDate ? `commentaire WP Rocket : copie en cache du ${new Date(Number(rocketDate[1]) * 1000).toISOString()}` : 'commentaire WP Rocket présent');
  const hit = indices.some((s) => /\bhit\b|cached@|serving-static: hit|copie en cache/i.test(s)) || (h('age') && Number(h('age')) > 0);

  const xr = h('x-robots-tag');
  return {
    source: SRC.public,
    code_http: r.status,
    adresse_finale: courant.replace(/[?&]crm_live=[^&]*/, '').replace(/\?$/, ''),
    redirections: sauts,
    cache: { servi_par_le_cache: hit ? 'oui, malgré le paramètre unique' : 'non', indices },
    title: doc.querySelector('title') ? txt(doc.querySelector('title').text) : null,
    meta_description: meta('meta[name="description"]'),
    canonique: meta('link[rel="canonical"]', 'href'),
    meta_robots: meta('meta[name="robots"]'),
    x_robots_tag: xr || undefined,
    h1: doc.querySelectorAll('h1').map((x) => txt(x.text)).filter(Boolean),
    articles_similaires: r.status === 200 ? blocSimilaires(doc, courant) : undefined,
  };
}

// ---------- identité : WordPress reconnaît-il l'utilisateur dédié ? ----------
const HTACCESS = "RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]";
async function verifierAcces(wp) {
  const r = await wp('users/me', { context: 'edit', _fields: 'id,roles' });
  if (r.ok) {
    const me = await r.json();
    return { utilisateur: { id: me.id, roles: me.roles } };
  }
  const e = await erreurHttp(r, SRC.wp + ' /users/me');
  if (/^rest_not_logged_in/.test(e.message)) {
    e.message = "WordPress n'a reçu aucun identifiant : l'en-tête Authorization est retiré avant WordPress (cas courant avec LiteSpeed/Apache). "
      + `Ajouter dans le .htaccess du site, juste avant « # BEGIN WordPress » : RewriteEngine On puis ${HTACCESS}`;
  } else if (/incorrect_password|invalid_username|invalid_email|application_password/.test(e.message)) {
    e.message = `identifiant ou mot de passe d'application refusé par WordPress (${e.message})`;
  }
  throw e;
}

// ---------- résolution de l'adresse vers le contenu WordPress ----------
async function typesWp(wp) {
  // pas de context=edit : WordPress l'exige pour TOUS les types (modèles du thème compris), ce qu'un Éditeur n'a pas
  const r = await wp('types');
  if (!r.ok) throw await erreurHttp(r, SRC.wp + ' /types');
  const j = await r.json();
  return Object.values(j).filter((t) => t.rest_base && !TYPES_EXCLUS.has(t.slug)).map((t) => ({ slug: t.slug, rest_base: t.rest_base, nom: t.name }));
}

async function trouverContenu(pool, wp, types, siteId, url) {
  const cible = normaliser(url);
  // 1. la base du CRM connaît déjà l'identifiant WordPress de l'adresse (dernier crawl)
  try {
    const { rows } = await pool.query(
      `SELECT wp_id, type FROM seo_pages WHERE site_id = $1 AND wp_id IS NOT NULL
         AND lower(rtrim(regexp_replace(url, '^https?://(www\\.)?', ''), '/')) = $2 LIMIT 1`, [siteId, cible.replace(/\/$/, '')]);
    const t = rows[0] && types.find((x) => x.slug === rows[0].type || x.rest_base === rows[0].type);
    if (t) {
      for (const context of ['edit', 'view']) {
        const r = await wp(`${t.rest_base}/${rows[0].wp_id}`, { context, _embed: 'wp:term,wp:featuredmedia' });
        if (r.ok) { const it = await r.json(); if (normaliser(it.link) === cible) return { it, type: t, context, trouve_par: `${SRC.base} puis API REST` }; break; }
        if (r.status !== 401 && r.status !== 403) break;
      }
    }
  } catch { /* base indisponible : on cherche directement dans WordPress */ }
  // 2. par le slug, dans tous les types de contenu, tous statuts
  const slug = decodeURI(new URL(url).pathname).replace(/\/+$/, '').split('/').pop();
  if (!slug) return null;
  const essais = await Promise.all(types.map(async (t) => {
    // tous statuts en édition ; si l'Éditeur n'a pas les droits sur ce type, contenus publiés en lecture publique
    for (const [context, status] of [['edit', 'any'], ['view', 'publish']]) {
      const r = await wp(t.rest_base, { slug, status, context, _embed: 'wp:term,wp:featuredmedia', per_page: 20 });
      if (r.status === 401 || r.status === 403) continue;
      if (!r.ok) return null;
      const liste = await r.json();
      const it = Array.isArray(liste) && liste.find((x) => normaliser(x.link) === cible);
      return it ? { it, type: t, context, trouve_par: 'API REST (slug)' } : null;
    }
    return null;
  }));
  return essais.find(Boolean) || null;
}

function ficheWordPress(it, type, trouvePar) {
  const termes = ((it._embedded && it._embedded['wp:term']) || []).flat().filter(Boolean);
  const parTaxo = {};
  for (const t of termes) (parTaxo[t.taxonomy] = parTaxo[t.taxonomy] || []).push({ id: t.id, nom: decode(t.name) });
  const media = it._embedded && it._embedded['wp:featuredmedia'] && it._embedded['wp:featuredmedia'][0];
  const autres = Object.fromEntries(Object.entries(parTaxo).filter(([k]) => k !== 'category' && k !== 'post_tag'));
  return {
    source: SRC.wp,
    trouve_par: trouvePar,
    id: it.id,
    type: type.slug,
    type_nom: type.nom,
    statut: it.status,
    slug: it.slug,
    lien: it.link,
    titre: decode((it.title && (it.title.raw ?? it.title.rendered)) || ''),
    publie_le: it.date_gmt ? `${it.date_gmt}Z` : it.date,
    modifie_le: it.modified_gmt ? `${it.modified_gmt}Z` : it.modified,
    categories: parTaxo.category || (it.categories || []).map((id) => ({ id })),
    etiquettes: parTaxo.post_tag || (it.tags || []).map((id) => ({ id })),
    taxonomies: autres,
    image_a_la_une: it.featured_media
      ? (media && media.source_url ? { url: media.source_url, alt: media.alt_text || '(alt vide)' } : { id: it.featured_media, note: 'média non lisible' })
      : undefined,
  };
}

async function champsYoast(wp, type, it) {
  let head = it.yoast_head_json;
  const erreurs = [];
  if (!head) {
    // yoast_head_json n'est pas toujours servi en context=edit : on le lit en lecture publique
    const r = await wp(`${type.rest_base}/${it.id}`, { _fields: 'yoast_head_json' });
    if (r.ok) head = (await r.json()).yoast_head_json;
    else erreurs.push(await erreurHttp(r, SRC.yoast));
  }
  const snippet = ['focus_keyword', 'seo_title', 'meta_description', 'robots_noindex'].some((k) => k in it);
  const robots = head && head.robots ? Object.values(head.robots).filter(Boolean).join(', ') : undefined;
  return {
    source: SRC.yoast,
    phrase_cle: snippet ? (it.focus_keyword || '(vide)') : undefined,
    titre_seo: snippet ? (it.seo_title || '(vide : modèle Yoast par défaut)') : undefined,
    titre_seo_calcule: head && head.title,
    meta_description: snippet ? (it.meta_description || '(vide)') : (head && head.description),
    canonique: head && head.canonical,
    robots,
    noindex_coche: snippet ? String(it.robots_noindex || '') === '1' : undefined,
    note: snippet ? undefined : "champs Yoast saisis non exposés : snippet register_rest_field absent de functions.php pour ce type (voir seo_worker/README.md)",
    erreurs,
  };
}

// ---------- liens internes entrants ----------
async function liensEntrants(wp, types, it, base) {
  const cible = normaliser(it.link);
  const chemin = decodeURI(new URL(it.link).pathname).replace(/\/+$/, '');
  const trouves = [];
  const erreurs = [];
  await Promise.all(types.map(async (t) => {
    for (let page = 1; page <= 3; page++) {
      let r;
      try {
        const q = { search: chemin, search_columns: 'post_content', status: 'publish', per_page: 100, page, _fields: 'id,link,title,content' };
        r = await wp(t.rest_base, { ...q, context: 'edit' });
        if (r.status === 401 || r.status === 403) r = await wp(t.rest_base, q);   // type non modifiable : contenu rendu
      } catch (e) { erreurs.push(erreurReseau(e, `${SRC.inbound} (${t.rest_base})`)); return; }
      if (r.status === 400) return;                          // au-delà de la dernière page
      if (!r.ok) { erreurs.push(await erreurHttp(r, `${SRC.inbound} (${t.rest_base})`)); return; }
      const liste = await r.json();
      for (const p of liste) {
        if (p.id === it.id) continue;
        const ancres = [];
        for (const a of parseHtml(autop((p.content && (p.content.raw ?? p.content.rendered)) || '')).querySelectorAll('a[href]')) {
          if (normaliser(a.getAttribute('href'), base) === cible) ancres.push(txt(a.text) || '(lien sans texte)');
        }
        if (ancres.length) trouves.push({ url: p.link, titre: decode((p.title && (p.title.raw ?? p.title.rendered)) || ''), type: t.slug, ancres });
      }
      if (page >= Number(r.headers.get('x-wp-totalpages') || 1)) return;
    }
  }));
  trouves.sort((a, b) => a.url.localeCompare(b.url));
  return {
    source: SRC.inbound,
    ...plafonne(trouves, MAX.inbound),
    non_couvert: 'menus, widgets, blocs du thème (dont « Articles similaires ») et liens générés par des shortcodes : non comptés ici',
    erreurs,
  };
}

// ---------- outil ----------
export async function getLivePage(pool, siteId, url) {
  const sortie = { fetched_at: new Date().toISOString(), site_id: siteId, url };
  const { rows } = await pool.query('SELECT domain, wp_base_url FROM seo_sites WHERE id = $1', [siteId]);
  if (!rows[0]) return { ...sortie, erreur: `site ${siteId} inconnu du CRM (voir list_sites)` };
  const base = String(rows[0].wp_base_url || `https://${rows[0].domain}`).replace(/\/+$/, '');
  let u;
  try { u = new URL(url); } catch { return { ...sortie, erreur: 'adresse invalide' }; }
  if (!/^https?:$/.test(u.protocol) || hoteNu(u.hostname) !== hoteNu(new URL(base).hostname)) {
    return { ...sortie, erreur: `l'adresse n'appartient pas au site ${siteId} (${new URL(base).hostname})` };
  }

  // la page publique se lit pendant que WordPress répond
  const publique = lirePublique(url).catch((e) => ({ source: SRC.public, erreur: erreurReseau(e, SRC.public) }));

  const acces = accesWordPress(siteId);
  if (acces.erreur) {
    sortie.wordpress = { source: SRC.wp, erreur: { source: SRC.wp, code: 'config', message: acces.erreur } };
  } else {
    const wp = clientWp(base, acces.auth);
    try {
      const ident = await verifierAcces(wp);
      const types = await typesWp(wp);
      const trouve = await trouverContenu(pool, wp, types, siteId, url);
      if (!trouve) {
        sortie.wordpress = { source: SRC.wp, erreur: { source: SRC.wp, code: 404, message: "aucun contenu WordPress (tous types, tous statuts) n'a cette adresse" } };
      } else {
        const { it, type, trouve_par, context } = trouve;
        const [yoast, entrants] = await Promise.all([champsYoast(wp, type, it), liensEntrants(wp, types, it, base)]);
        sortie.wordpress = { ...ficheWordPress(it, type, trouve_par), utilisateur_api: ident.utilisateur, yoast };
        const brut = it.content && typeof it.content.raw === 'string';
        sortie.contenu = {
          source: brut ? SRC.content : "API REST WordPress : contenu RENDU (context=view), l'utilisateur dédié n'a pas le droit de modifier ce type : shortcodes déjà exécutés, absents de la liste",
          ...structurerContenu(brut ? it.content.raw : ((it.content && it.content.rendered) || ''), base),
        };
        if (context === 'view') sortie.wordpress.note = "lu en lecture publique : l'utilisateur dédié n'a pas le droit de modifier ce type de contenu";
        sortie.liens_entrants = entrants;
      }
    } catch (e) {
      sortie.wordpress = { source: SRC.wp, erreur: e && e.code !== undefined && e.source ? e : erreurReseau(e, SRC.wp) };
    }
  }
  sortie.page_publique = await publique;

  const out = compact(sortie);
  // une absence est une information : ces champs restent visibles même vides
  if (out.page_publique && !out.page_publique.erreur) {
    for (const k of ['title', 'meta_description', 'canonique', 'meta_robots', 'h1']) if (!(k in out.page_publique)) out.page_publique[k] = null;
  }
  return out;
}
