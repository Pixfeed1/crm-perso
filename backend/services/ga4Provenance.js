// D'où vient le trafic d'un site (GA4, API Data, EN DIRECT, lecture seule) : sources et supports, sites
// référents et pages d'arrivée, pays, appareils, navigateurs du canal Direct, noms d'hôte (trafic parasite).
// Accès : la connexion Google du CRM (seo_oauth_tokens, scope analytics.readonly), propriété seo_sites.ga_property_id.
// Le jeton ne sort jamais de ce module : ni réponse, ni journal.

const API = () => (process.env.GA_DATA_API || 'https://analyticsdata.googleapis.com').replace(/\/+$/, '');
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const DELAI_MS = 30000;
let jeton = null;                                     // { valeur, expire } en mémoire seulement

async function http(url, opts) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), DELAI_MS);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  catch (e) { throw new Error(e.name === 'AbortError' ? `pas de réponse de Google en ${DELAI_MS / 1000} s` : e.message); }
  finally { clearTimeout(t); }
}

async function jetonAcces(pool) {
  if (jeton && jeton.expire > Date.now() + 60000) return jeton.valeur;
  const { rows } = await pool.query(
    "SELECT scope, client_id, client_secret, refresh_token, token_uri FROM seo_oauth_tokens WHERE provider = 'google' ORDER BY updated_at DESC LIMIT 1");
  const t = rows[0];
  if (!t) throw Object.assign(new Error('connexion Google absente (consentement à faire avec gsc_auth.py)'), { code: 'config' });
  if (t.scope && !String(t.scope).includes(SCOPE)) throw Object.assign(new Error('la connexion Google ne couvre pas Analytics : relancer gsc_auth.py'), { code: 'config' });
  const r = await http(t.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: t.client_id, client_secret: t.client_secret, refresh_token: t.refresh_token, grant_type: 'refresh_token' }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw Object.assign(new Error(`connexion Google refusée (${j.error || r.status})`), { code: 'auth' });
  jeton = { valeur: j.access_token, expire: Date.now() + (Number(j.expires_in) || 3000) * 1000 };
  return jeton.valeur;
}

const METRIQUES = ['sessions', 'totalUsers', 'activeUsers', 'engagementRate', 'userEngagementDuration'];
const filtre = (champ, valeur, type = 'EXACT') => ({ filter: { fieldName: champ, stringFilter: { matchType: type, value: valeur, caseSensitive: false } } });
const et = (...f) => { const l = f.filter(Boolean); return !l.length ? undefined : l.length === 1 ? l[0] : { andGroup: { expressions: l } }; };
const non = (f) => ({ notExpression: f });

/** Ligne GA4 -> objet lisible : dimensions nommées, sessions, utilisateurs, taux et durée moyenne d'engagement. */
function ligne(dimNoms, row, metNoms) {
  const o = {};
  const dv = row.dimensionValues || [], mv = row.metricValues || [];
  dimNoms.forEach((n, i) => { o[n] = dv[i] ? dv[i].value : undefined; });
  // une section vide (aucune ligne) peut revenir avec un total sans valeurs : on lit 0 plutôt que de planter
  const m = Object.fromEntries(metNoms.map((n, i) => [n, Number(mv[i] && mv[i].value) || 0]));
  if (m.sessions !== undefined) o.sessions = m.sessions;
  if (m.totalUsers !== undefined) o.utilisateurs = m.totalUsers;
  if (m.screenPageViews !== undefined) o.pages_vues = m.screenPageViews;
  if (m.engagementRate !== undefined) o.taux_engagement_pct = Math.round(m.engagementRate * 1000) / 10;
  if (m.userEngagementDuration !== undefined && m.activeUsers !== undefined) o.duree_moyenne_engagement_s = m.activeUsers ? Math.round(m.userEngagementDuration / m.activeUsers) : 0;
  return o;
}

function section(rep, renommer, limite) {
  if (!rep) return undefined;
  const dimNoms = (rep.dimensionHeaders || []).map((d) => renommer[d.name] || d.name);
  const metNoms = (rep.metricHeaders || []).map((m) => m.name);
  const items = (rep.rows || []).map((r) => ligne(dimNoms, r, metNoms));
  const tot = items.length && rep.totals && rep.totals[0] ? ligne([], rep.totals[0], metNoms) : undefined;
  return { total_valeurs: Number(rep.rowCount || items.length), affichees: Math.min(items.length, limite), ...(tot ? { total: tot } : {}), items: items.slice(0, limite) };
}

const NOMS = {
  sessionDefaultChannelGroup: 'canal', sessionSource: 'source', sessionMedium: 'support', landingPagePlusQueryString: 'page_arrivee',
  pageReferrer: 'page_referente', pagePath: 'page_vue', country: 'pays', deviceCategory: 'appareil', browser: 'navigateur',
  operatingSystem: 'systeme', hostName: 'hote',
};

/**
 * provenance(pool, { site_id, days, canal, limit }) : un appel = 2 requêtes groupées à l'API Data.
 * canal (Direct, Organic Search, Referral…) : tout le détail est restreint à ce canal.
 */
async function provenance(pool, { site_id: siteId, days = 28, canal, limit = 25 } = {}) {
  days = Math.min(Math.max(Number(days) || 28, 1), 365);
  limit = Math.min(Math.max(Number(limit) || 25, 5), 100);
  const { rows } = await pool.query('SELECT domain, ga_property_id FROM seo_sites WHERE id = $1', [siteId]);
  if (!rows[0]) throw Object.assign(new Error(`site ${siteId} inconnu du CRM`), { status: 404 });
  const prop = String(rows[0].ga_property_id || '').replace(/\D/g, '');
  if (!prop) throw Object.assign(new Error('propriété GA4 non renseignée dans la fiche du site'), { status: 400 });
  const domaine = String(rows[0].domain).toLowerCase().replace(/^www\./, '');
  const periode = { startDate: `${days}daysAgo`, endDate: 'yesterday' };
  const fCanal = canal ? filtre('sessionDefaultChannelGroup', String(canal)) : undefined;
  const memeCanal = (c) => !canal || String(canal).toLowerCase() === c.toLowerCase();
  const req = (dims, f, extra = {}) => ({
    dateRanges: [periode], dimensions: dims.map((name) => ({ name })), metrics: (extra.metriques || METRIQUES).map((name) => ({ name })),
    dimensionFilter: f, orderBys: [{ metric: { metricName: extra.tri || 'sessions' }, desc: true }], limit, metricAggregations: ['TOTAL'],
  });
  const lots = [
    [
      ['canaux', req(['sessionDefaultChannelGroup'], fCanal)],
      ['sources', req(['sessionSource', 'sessionMedium'], fCanal)],
      memeCanal('Referral') && ['referents', req(['sessionSource', 'landingPagePlusQueryString'], et(fCanal, filtre('sessionDefaultChannelGroup', 'Referral')))],
      memeCanal('Referral') && ['pages_referentes', req(['pageReferrer', 'pagePath'], et(fCanal, filtre('sessionDefaultChannelGroup', 'Referral'), non(filtre('pageReferrer', domaine, 'CONTAINS')), non(filtre('pageReferrer', '(not set)'))), { metriques: ['screenPageViews'], tri: 'screenPageViews' })],
      ['pays', req(['country'], fCanal)],
    ],
    [
      ['appareils', req(['deviceCategory'], fCanal)],
      memeCanal('Direct') && ['direct_navigateurs', req(['browser', 'operatingSystem', 'deviceCategory'], et(fCanal, filtre('sessionDefaultChannelGroup', 'Direct')))],
      ['hotes', req(['hostName'], fCanal, { metriques: ['sessions', 'screenPageViews'] })],
      ['pages_arrivee', req(['landingPagePlusQueryString'], fCanal)],
    ],
  ].map((l) => l.filter(Boolean));

  const acces = await jetonAcces(pool);
  const reps = {};
  for (const lot of lots) {
    const r = await http(`${API()}/v1beta/properties/${prop}:batchRunReports`, {
      method: 'POST', headers: { Authorization: `Bearer ${acces}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: lot.map(([, x]) => x) }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(`API Data GA4 : ${(j.error && j.error.message) || `HTTP ${r.status}`}`), { status: r.status === 403 ? 403 : 502 });
    lot.forEach(([nom], i) => { reps[nom] = j.reports && j.reports[i]; });
  }

  const s = (n) => section(reps[n], NOMS, limit);
  const out = {
    source: `Google Analytics 4, API Data, en direct (propriété ${prop})`,
    periode: { jours: days, du: `il y a ${days} jours`, au: 'hier (journées complètes)' },
    canal: canal || undefined,
    canaux: s('canaux'), sources: s('sources'),
    referents: s('referents'), pages_referentes: s('pages_referentes'),
    pays: s('pays'), appareils: s('appareils'), direct_navigateurs: s('direct_navigateurs'),
    pages_arrivee: s('pages_arrivee'),
  };
  // noms d'hôte : tout autre domaine que le site est signalé
  const hotes = s('hotes');
  if (hotes) {
    for (const h of hotes.items) {
      const x = String(h.hote || '').toLowerCase();
      if (x === domaine || x === `www.${domaine}`) h.statut = 'site';
      else if (/\.translate\.goog$/.test(x)) h.statut = 'Google Traduction (légitime)';
      else if (/(^|\.)(googleusercontent\.com|bingj\.com|archive\.org)$/.test(x)) h.statut = 'cache ou archive (légitime)';
      else h.statut = x === '(not set)' ? 'hôte non renseigné : souvent du spam envoyé directement à GA (Measurement Protocol)' : 'PARASITE : visites enregistrées hors du site (copie du site, balise GA posée ailleurs ou spam)';
    }
    out.hotes = hotes;
    const parasites = hotes.items.filter((h) => /PARASITE|non renseigné/.test(h.statut));
    out.trafic_parasite = parasites.length ? { hotes: parasites.map((h) => h.hote), sessions: parasites.reduce((t, h) => t + (h.sessions || 0), 0) } : 'aucun : toutes les visites sont enregistrées sur le site (ou une traduction/cache légitime)';
  }
  if (!canal || memeCanal('Direct')) out.note_direct = "Direct = aucune source connue (favori, adresse tapée, appli, lien sans référent, mais aussi robots). Indices de robots : un même navigateur/système avec un engagement proche de 0 et une durée de 0 s, un pays inattendu, beaucoup d'arrivées sur une seule page.";
  out.notes = "taux_engagement_pct = sessions engagées (> 10 s, conversion ou 2 pages vues) / sessions ; duree_moyenne_engagement_s = durée d'engagement / utilisateurs actifs. Les lignes « (other) » ou « (not set) » viennent de GA4 (seuils, données manquantes).";
  return out;
}

module.exports = { provenance };
