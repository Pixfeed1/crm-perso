// mcp_seo/checks.js
// check_urls : vérifie jusqu'à 50 adresses (internes ou externes) en direct. LECTURE SEULE.
// Toutes : code HTTP, adresse finale, title. Internes en plus : id/type/statut WordPress, canonique,
// noindex, état d'indexation connu du CRM. Délai court, requêtes simultanées limitées.
import { parse as parseHtml } from 'node-html-parser';
import { plafonne, compact, txt, decode, hoteNu, accesWordPress, clientWp, typesWp, erreurHttp } from './live.js';

export const MAX_URLS = 50;
const DELAI_MS = 8000;
const SIMULTANEES = 5;
const MAX_SAUTS = 8;
const MAX_OCTETS = 600 * 1024;       // assez pour le <head> et les classes du <body>
// Annonce une vérification de liens en lecture seule, sans nommer d'outil ni de domaine.
const UA = 'Mozilla/5.0 (compatible; SEO-LinkCheck/1.0; lecture seule, une requete par adresse)';

async function lireDebut(r) {
  if (!r.body) return '';
  const reader = r.body.getReader();
  const morceaux = []; let n = 0;
  try {
    while (n < MAX_OCTETS) {
      const { done, value } = await reader.read();
      if (done) break;
      morceaux.push(value); n += value.length;
    }
  } finally { reader.cancel().catch(() => {}); }
  return Buffer.concat(morceaux.map((m) => Buffer.from(m))).toString('utf8');
}

async function verifierUne(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), DELAI_MS);
  const sauts = [];
  try {
    let courant = url, r;
    for (let i = 0; i <= MAX_SAUTS; i++) {
      r = await fetch(courant, { redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'text/html,*/*;q=0.5' } });
      const loc = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && loc) {
        r.body && r.body.cancel().catch(() => {});
        courant = new URL(loc, courant).toString();
        sauts.push(r.status);
        continue;
      }
      break;
    }
    const html = /html/i.test(r.headers.get('content-type') || '') ? await lireDebut(r) : (r.body && r.body.cancel().catch(() => {}), '');
    const doc = html ? parseHtml(html.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '')) : null;
    const attr = (sel, a) => { const el = doc && doc.querySelector(sel); return el ? txt(el.getAttribute(a)) : undefined; };
    const robots = [attr('meta[name="robots"]', 'content'), r.headers.get('x-robots-tag')].filter(Boolean).join(', ');
    const classes = ((doc && doc.querySelector('body') && doc.querySelector('body').getAttribute('class')) || '').split(/\s+/);
    return {
      code: r.status, adresse_finale: courant !== url ? courant : undefined,
      redirections: sauts.length ? sauts : undefined,
      title: doc && doc.querySelector('title') ? decode(doc.querySelector('title').text) : undefined,
      canonique: attr('link[rel="canonical"]', 'href'),
      noindex: /noindex/i.test(robots) ? true : undefined,
      _classes: classes, _shortlink: attr('link[rel="shortlink"]', 'href'),
    };
  } catch (e) {
    return { erreur: { source: 'requête directe', code: e.name === 'AbortError' ? 'timeout' : (e.cause && e.cause.code) || 'réseau', message: e.name === 'AbortError' ? `pas de réponse en ${DELAI_MS / 1000} s` : txt(e.message) }, redirections: sauts.length ? sauts : undefined };
  } finally { clearTimeout(t); }
}

/** id et type WordPress d'après les classes du <body> (postid-123 single-logiciel, page-id-45) ou le shortlink. */
function idTypeDepuisPage(v) {
  const c = v._classes || [];
  let id = null, type = null;
  for (const k of c) {
    let m;
    if ((m = /^postid-(\d+)$/.exec(k))) id = Number(m[1]);
    else if ((m = /^page-id-(\d+)$/.exec(k))) { id = Number(m[1]); type = 'page'; }
  }
  if (!type) {
    const single = c.find((k) => /^single-[a-z0-9_-]+$/.test(k) && !/^single-(format|template|post-template|sidebar)/.test(k));
    if (single && c.includes('single')) type = single.slice(7);
  }
  if (!id && v._shortlink) { const m = /[?&]p=(\d+)/.exec(v._shortlink); if (m) id = Number(m[1]); }
  return { id, type };
}

async function parLots(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

export async function checkUrls(pool, siteId, urls) {
  const sortie = { fetched_at: new Date().toISOString(), site_id: siteId };
  const liste = [...new Set((Array.isArray(urls) ? urls : []).map((u) => String(u).trim()).filter(Boolean))];
  if (!liste.length) return { ...sortie, erreur: 'aucune adresse fournie' };
  if (liste.length > MAX_URLS) return { ...sortie, erreur: `${liste.length} adresses : ${MAX_URLS} au maximum par appel` };
  const { rows } = await pool.query('SELECT domain, wp_base_url FROM seo_sites WHERE id = $1', [siteId]);
  if (!rows[0]) return { ...sortie, erreur: `site ${siteId} inconnu du CRM (voir list_sites)` };
  const base = String(rows[0].wp_base_url || `https://${rows[0].domain}`).replace(/\/+$/, '');
  const hote = hoteNu(new URL(base).hostname);
  const interne = (u) => { try { return hoteNu(new URL(u).hostname) === hote; } catch { return false; } };

  // 1. requêtes directes, en parallèle limité
  const verifs = await parLots(liste, SIMULTANEES, async (u) => {
    try { const x = new URL(u); if (!/^https?:$/.test(x.protocol)) throw new Error('protocole'); }
    catch { return { url: u, erreur: { source: 'adresse', code: 'invalide', message: 'adresse invalide (http ou https attendu)' } }; }
    return { url: u, interne: interne(u), ...(await verifierUne(u)) };
  });

  // 2. internes : WordPress (statut) et état d'indexation connu du CRM
  const internes = verifs.filter((v) => v.interne && !v.erreur);
  const sources = { requete: 'requête directe (code, adresse finale, title, canonique, robots)' };
  if (internes.length) {
    const { rows: idx } = await pool.query(
      `SELECT DISTINCT ON (rtrim(url,'/')) rtrim(url,'/') AS u, verdict, coverage_state, checked_at
         FROM gsc_index_status WHERE site_id = $1 AND rtrim(url,'/') = ANY($2) ORDER BY rtrim(url,'/'), checked_at DESC`,
      [siteId, internes.map((v) => String(v.adresse_finale || v.url).replace(/\/+$/, ''))]).catch(() => ({ rows: [] }));
    const parUrl = new Map(idx.map((r) => [r.u, r]));
    sources.indexation = "Search Console, inspection d'URL (relevé du CRM, date par adresse)";
    for (const v of internes) {
      const r = parUrl.get(String(v.adresse_finale || v.url).replace(/\/+$/, ''));
      v.indexation = r ? { verdict: r.verdict, couverture: r.coverage_state, releve_le: r.checked_at } : { note: 'jamais inspectée par le CRM' };
    }

    const acces = accesWordPress(siteId);
    sources.wordpress = acces.erreur ? 'classes de la page publique (accès WordPress non configuré : statut inconnu)' : 'API REST WordPress (statut) + classes de la page publique (id, type)';
    let types = [];
    const wp = acces.erreur ? null : clientWp(base, acces.auth);
    if (wp) { try { types = await typesWp(wp); } catch (e) { sortie.erreur_wordpress = e.source ? e : { source: 'API REST WordPress', code: 'réseau', message: txt(e.message) }; } }
    await parLots(internes, SIMULTANEES, async (v) => {
      const { id, type } = idTypeDepuisPage(v);
      if (!id) { v.wordpress = v.code === 404 ? { note: "aucun contenu publié à cette adresse" } : { note: "pas un contenu WordPress (archive, accueil, fichier…)" }; return; }
      v.wordpress = { id, type: type || undefined };
      const t = types.find((x) => x.slug === type) || (type ? null : types.find((x) => x.slug === 'post'));
      if (!wp || !t) return;
      try {
        let r = await wp(`${t.rest_base}/${id}`, { context: 'edit', _fields: 'id,status,type' });
        if (r.status === 401 || r.status === 403) r = await wp(`${t.rest_base}/${id}`, { _fields: 'id,status,type' });
        if (r.ok) { const j = await r.json(); v.wordpress.statut = j.status; v.wordpress.type = j.type || v.wordpress.type; }
        else v.wordpress.erreur = await erreurHttp(r, 'API REST WordPress');
      } catch (e) { v.wordpress.erreur = { source: 'API REST WordPress', code: 'réseau', message: txt(e.message) }; }
    });
  }
  for (const v of verifs) { delete v._classes; delete v._shortlink; if (!v.interne) delete v.interne; }

  const resume = {
    ok: verifs.filter((v) => v.code >= 200 && v.code < 300 && !(v.redirections || []).length).length,
    redirigees: verifs.filter((v) => (v.redirections || []).length).length,
    erreurs_http: verifs.filter((v) => v.code >= 400).length,
    injoignables: verifs.filter((v) => v.erreur).length,
    noindex: verifs.filter((v) => v.noindex).length,
  };
  return compact({ ...sortie, sources, delai_par_adresse_s: DELAI_MS / 1000, resume, adresses: plafonne(verifs, MAX_URLS) });
}
