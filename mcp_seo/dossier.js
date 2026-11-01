// mcp_seo/dossier.js
// get_page_dossier : en un appel, ce que le CRM SAIT d'une page (base du CRM, pas de lecture du site),
// chaque bloc avec sa source et sa date. LECTURE SEULE.
// Réutilise les fonctions des outils existants (tools.js, bing.js) sans les modifier. Deux requêtes
// seulement sont propres à ce fichier, faute de fonction existante à l'échelle d'UNE page :
// l'état d'inspection d'une URL (gsc_index_status) et les backlinks d'une page avec ancre et rel
// (seo_backlinks), plus les bornes de dates de Search Console.
import * as tools from './tools.js';
import * as bing from './bing.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { plafonne, compact, txt } from './live.js';

// Filtre pays du relevé des requêtes (réglage GSC_COUNTRY du worker, « fra » par défaut, vide = monde).
function paysRequetes() {
  try {
    const env = dotenv.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'seo_worker', '.env')));
    if ('GSC_COUNTRY' in env) return String(env.GSC_COUNTRY).trim().toLowerCase();
  } catch { /* pas de .env : valeur par défaut du worker */ }
  return 'fra';
}

const MAX = { requetes: 50, autres_pages: 5, liens: 100, backlinks: 15, volumes: 8 };
const jour = (d) => (d ? new Date(d).toISOString().slice(0, 10) : undefined);
const arrondi = (x, n = 1) => (x == null ? undefined : Math.round(x * 10 ** n) / 10 ** n);
const memePage = (a, b) => String(a || '').replace(/\/+$/, '') === String(b || '').replace(/\/+$/, '');

/** Un bloc qui échoue le dit (source, code, message) sans faire tomber les autres. */
async function bloc(source, fn) {
  try { return { source, ...(await fn()) }; }
  catch (e) { return { source, erreur: { source, code: e.code || 'erreur', message: txt(e.message) } }; }
}

export async function getPageDossier(pool, siteId, url, days = 90) {
  const sortie = { fetched_at: new Date().toISOString(), site_id: siteId, url };
  const { rows: s } = await pool.query('SELECT domain, wp_base_url FROM seo_sites WHERE id = $1', [siteId]);
  if (!s[0]) return { ...sortie, erreur: `site ${siteId} inconnu du CRM (voir list_sites)` };
  const siteUrl = `${String(s[0].wp_base_url || `https://${s[0].domain}`).replace(/\/+$/, '')}/`;

  // bornes de la fenêtre Search Console (dernière date connue du CRM)
  const { rows: b } = await pool.query(
    `SELECT MAX(date) AS fin, MIN(date) FILTER (WHERE rtrim(page_url,'/') = rtrim($2,'/')) AS premier_jour_page
       FROM seo_gsc_daily WHERE site_id = $1`, [siteId, url]).catch(() => ({ rows: [{}] }));
  const fin = b[0] && b[0].fin ? new Date(b[0].fin) : null;
  const debut = fin ? new Date(fin.getTime() - (days - 1) * 86400000) : null;
  const periode = fin ? { debut: jour(debut), fin: jour(fin), jours: days } : undefined;

  const page = await tools.getPageContent(pool, siteId, url).catch(() => null);   // titre, phrase-clé (dernier crawl)

  const [indexation, sitemap, gsc, cannib, liens, backlinks, redirections, crawl] = await Promise.all([
    bloc("Search Console, inspection d'URL (relevé du CRM)", async () => {
      const { rows } = await pool.query(
        `SELECT verdict, coverage_state, indexing_state, robots_txt_state, page_fetch_state, last_crawl_time,
                google_canonical, user_canonical, referring_urls, checked_at
           FROM gsc_index_status WHERE site_id = $1 AND rtrim(url,'/') = rtrim($2,'/')
          ORDER BY checked_at DESC LIMIT 1`, [siteId, url]);
      const r = rows[0];
      if (!r) return { note: "jamais inspectée par le CRM" };
      return {
        releve_le: r.checked_at, verdict: r.verdict, couverture: r.coverage_state, indexation: r.indexing_state,
        robots_txt: r.robots_txt_state, recuperation: r.page_fetch_state, derniere_exploration_google: r.last_crawl_time,
        canonique_google: r.google_canonical, canonique_declaree: r.user_canonical,
        canonique_differente: r.google_canonical && r.user_canonical && !memePage(r.google_canonical, r.user_canonical) ? true : undefined,
        decouverte_via: plafonne(Array.isArray(r.referring_urls) ? r.referring_urls : [], 10),
      };
    }),
    bloc('sitemap du site (lu au dernier crawl du CRM)', async () => {
      const r = await tools.checkSitemap(pool, siteId, url);                        // check_sitemap
      return { releve_le: r.seen_at, present: r.in_sitemap, fichier: r.sitemap_file, lastmod: r.lastmod, note: r.note };
    }),
    bloc('Google Search Console (base du CRM)', async () => {
      const ctx = await tools.getPositionContext(pool, siteId, url, days);           // get_position_context
      const kw = await tools.getPageKeywords(pool, siteId, url, days, 'web');       // get_page_keywords
      const web = (ctx.par_type_de_recherche || []).find((t) => t.search_type === 'web');
      const pays = paysRequetes();
      const filtre = pays ? `pays ${pays} seulement (réglage GSC_COUNTRY du worker)` : 'tous pays';
      // total de la page : la ventilation par appareil couvre tout le trafic web de la page (tous pays, requêtes masquées comprises)
      const app = ctx.appareil || [];
      const totPage = app.length ? app.reduce((a, x) => ({ impressions: a.impressions + x.impressions, clics: a.clics + x.clics, pond: a.pond + (x.position || 0) * x.impressions }), { impressions: 0, clics: 0, pond: 0 }) : null;
      return {
        periode: periode && { ...periode, donnees_depuis: jour(b[0].premier_jour_page) },
        total_web_requetes: web && { impressions: web.impressions, clics: web.clicks, position: arrondi(web.position),
          couverture: `recherche web, ${filtre}, requêtes visibles seulement (Google masque les requêtes rares)` },
        total_web_page: totPage && { impressions: totPage.impressions, clics: totPage.clics, position: totPage.impressions ? arrondi(totPage.pond / totPage.impressions) : undefined,
          couverture: 'recherche web, tous pays, toutes requêtes (masquées comprises) : somme des appareils' },
        par_type_de_recherche: { couverture: `images et Discover, ${filtre}`, items: (ctx.par_type_de_recherche || []).filter((t) => t.search_type !== 'web')
          .map((t) => ({ type: t.search_type, impressions: t.impressions, clics: t.clicks, position: arrondi(t.position) })) },
        pays: { couverture: 'recherche web, tous pays, toutes requêtes', ...plafonne(ctx.pays || [], 8) },
        appareils: { couverture: 'recherche web, tous pays, toutes requêtes', items: app },
        requetes: { couverture: `recherche web, ${filtre}`, ...plafonne(kw.map((k) => ({
          requete: k.query, impressions: k.impressions, clics: k.clicks, position: arrondi(k.position),
          ...(k.representative ? {} : { position_non_representative: true }),
        })), MAX.requetes) },
        note: 'total_web_requetes et total_web_page diffèrent normalement : filtre pays et requêtes masquées',
      };
    }),
    bloc('Search Console (requêtes partagées) et Yoast (phrase-clé au dernier crawl)', async () => {
      const [parRequete, conflits] = await Promise.all([
        tools.getCannibalisation(pool, siteId, Math.min(days, 90), 5),              // get_cannibalisation
        tools.getFocusKeywordConflicts(pool, siteId),                               // get_focus_keyword_conflicts
      ]);
      const requetes = parRequete.filter((q) => q.pages.some((p) => memePage(p.url, url))).map((q) => {
        const moi = q.pages.find((p) => memePage(p.url, url));
        return {
          requete: q.query,
          cette_page: { impressions: moi.impressions, clics: moi.clicks, position: arrondi(moi.position) },
          autres_pages: q.pages.filter((p) => !memePage(p.url, url)).slice(0, MAX.autres_pages)
            .map((p) => ({ url: p.url, titre: p.title, impressions: p.impressions, clics: p.clicks, position: arrondi(p.position) })),
        };
      });
      const kw = page && page.focus_keyword;
      const conflit = kw && (conflits.details || []).find((c) => c.kw === String(kw).trim().toLowerCase());
      return {
        periode: periode && { debut: jour(new Date(fin.getTime() - (Math.min(days, 90) - 1) * 86400000)), fin: periode.fin },
        couverture: `recherche web, ${paysRequetes() ? 'pays ' + paysRequetes() + ' seulement' : 'tous pays'}, requêtes d'au moins 5 impressions par page`,
        requetes_partagees: plafonne(requetes, 30),
        phrase_cle: kw || '(vide au dernier crawl)',
        phrase_cle_partagee_avec: conflit ? conflit.pages.filter((p) => !memePage(p.url, url)).map((p) => ({ url: p.url, titre: p.title, type: p.type })) : undefined,
      };
    }),
    bloc('crawl du CRM (liens internes relevés dans les pages)', async () => {
      const r = await tools.getPageLinks(pool, siteId, url);                        // get_page_links
      return {
        entrants: plafonne(r.inbound.map((l) => ({ depuis: l.url, titre: l.title, ancre: l.anchor || '(sans texte)' })), MAX.liens),
        sortants: r.outbound_count,
        note: 'à comparer avec liens_entrants de get_live_page (calcul en direct, contenu seulement)',
      };
    }),
    bloc('Bing Webmaster Tools, liens vérifiés à la source par le worker du CRM', async () => {
      const { rows } = await pool.query(
        `SELECT b.source_url, b.source_domain, b.source_title, b.anchor, b.rel, b.link_type, b.status,
                b.first_seen, b.last_seen, b.verified_at, r.opr_score::float AS autorite
           FROM seo_backlinks b LEFT JOIN seo_ref_domains r ON r.site_id = b.site_id AND r.domain = b.source_domain
          WHERE b.site_id = $1 AND rtrim(b.target_url,'/') = rtrim($2,'/')
          ORDER BY (b.status = 'active') DESC, r.opr_score DESC NULLS LAST, b.last_seen DESC`, [siteId, url]);
      const actifs = rows.filter((r) => r.status === 'active');
      const releve = rows.reduce((m, r) => (r.verified_at && (!m || r.verified_at > m) ? r.verified_at : m), null)
        || rows.reduce((m, r) => (!m || r.last_seen > m ? r.last_seen : m), null);
      return {
        releve_le: jour(releve),
        actifs: actifs.length,
        perdus: rows.length - actifs.length || undefined,
        domaines: new Set(actifs.map((r) => r.source_domain)).size,
        dofollow: actifs.filter((r) => r.rel === 'follow').length,
        nofollow: actifs.filter((r) => r.rel && r.rel !== 'follow').length,
        non_verifies: actifs.filter((r) => !r.rel).length || undefined,
        plus_forts: plafonne(actifs.map((r) => ({
          domaine: r.source_domain, autorite_opr: r.autorite ?? undefined, depuis: r.source_url, titre: r.source_title,
          ancre: r.anchor || '(sans texte)', rel: r.rel || 'non vérifié', type: r.link_type, vu_le: jour(r.last_seen),
        })), MAX.backlinks),
      };
    }),
    bloc('relevé des redirections du CRM (crawl)', async () => {
      const r = await tools.getRedirects(pool, siteId, 5000);                       // get_redirects
      const lies = r.redirections.filter((x) => memePage(x.from_url, url) || memePage(x.final_url, url)
        || (Array.isArray(x.chain) && x.chain.some((c) => memePage(c.url, url))));
      return {
        // le CRM enregistre les adresses sans barre finale : l'adresse brute est reprise de la chaîne de sauts
        items: lies.map((x) => {
          const chaine = Array.isArray(x.chain) ? x.chain : [];
          const de = (chaine[0] && chaine[0].url) || x.from_url;
          let vers = x.final_url, nature;
          if (vers && memePage(de, vers)) {
            const avecBarre = /\/$/.test(new URL(de).pathname);
            vers = avecBarre ? de.replace(/\/+$/, '') : `${de.replace(/[?#].*$/, '')}/`;
            nature = avecBarre ? 'même page : retrait de la barre finale' : 'même page : ajout de la barre finale';
          } else if (vers && de.replace(/^https?:\/\/(www\.)?/, '') === vers.replace(/^https?:\/\/(www\.)?/, '')) nature = 'même page : changement de protocole ou de www';
          return {
            de, vers, nature, code_final: x.final_status, sauts: x.hops,
            chaine: chaine.length > 1 ? chaine.map((c) => `${c.status} ${c.url}`) : undefined,
            vers_accueil: x.to_home || undefined, releve_le: jour(x.updated_at),
            sens: memePage(x.from_url, url) ? 'cette adresse redirige' : 'redirige vers cette adresse',
          };
        }),
        note: lies.length ? undefined : 'aucune redirection connue du CRM pour cette adresse',
      };
    }),
    tools.listSites(pool).then((l) => l.find((x) => x.site_id === siteId)).catch(() => null),  // date du dernier crawl
  ]);

  // volumes de recherche : phrase-clé + principales requêtes de la page (Bing, mis en cache 3 mois glissants)
  const mots = [...new Set([page && page.focus_keyword, ...((gsc.requetes && gsc.requetes.items) || []).map((q) => q.requete)]
    .filter(Boolean).map((q) => String(q).trim().toLowerCase()))].slice(0, MAX.volumes);
  const volumes = await bloc("Bing Webmaster Tools (impressions Bing sur 3 mois glissants ; Google ne publie pas de volumes)", async () => {
    if (!process.env.BING_WMT_API_KEY) throw Object.assign(new Error('BING_WMT_API_KEY absente de mcp_seo/.env'), { code: 'config' });
    if (!mots.length) return { note: 'aucune requête ni phrase-clé connue pour cette page' };
    const res = [];
    for (let i = 0; i < mots.length; i += 4) {
      res.push(...await Promise.all(mots.slice(i, i + 4).map((q) => bing.getKeywordVolume(q).catch((e) => ({ query: q, erreur: txt(e.message) })))));
    }
    const p = res.find((r) => r.period);
    return {
      periode: p && { debut: p.period.start, fin: p.period.end },
      releve_le: new Date().toISOString().slice(0, 10),
      items: res.map((r) => (r.erreur ? { requete: r.query, erreur: r.erreur }
        : { requete: r.query, impressions_bing: r.impressions_3m, elargies_bing: r.broad_impressions_3m, ...(r.known ? {} : { inconnu_de_bing: true }) })),
    };
  });

  if (liens && !liens.erreur && crawl) liens.date_du_crawl = crawl.last_crawl;
  return compact({
    ...sortie,
    page: page ? { titre: page.title, type: page.type, categorie: page.category, source: 'dernier crawl du CRM', crawl_le: crawl && crawl.last_crawl } : undefined,
    indexation, sitemap, search_console: gsc, mots_cles: volumes, cannibalisation: cannib,
    liens_entrants_crawl: liens, backlinks, redirections,
  });
}
