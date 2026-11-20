// Veille Reddit : annonces qui me concernent (3D pour l'activité d'artiste, web pour PixFeed), repérées toutes les
// 10 minutes, triées EN CODE (aucune API d'IA), signalées par mail et lisibles par Claude via le connecteur MCP.
// Lecture seule sur Reddit : le module ne poste, ne commente et n'envoie jamais rien sur Reddit.
//
// - Sources (veille_reddit_sources) : forums (r/{sub}/new) et recherches globales (search, tri « new », 24 h),
//   chacune étiquetée 3D ou PixFeed ; l'étiquette est recopiée sur l'annonce.
// - Accès : public avec User-Agent « pixfeed-crm/1.0 (by u/REDDIT_USERNAME) » ; OAuth d'application si
//   REDDIT_CLIENT_ID et REDDIT_CLIENT_SECRET sont dans backend/.env. Une requête toutes les 2 s au plus, sources
//   l'une après l'autre ; 403 / 429 / 5xx : erreur notée, source suivante, aucune nouvelle tentative.
// - Tri (veille_reddit_regles) : a. type d'annonce (étiquette du post OU titre) ; b. exclusions ; c. mots-clés
//   de l'étiquette (mots entiers, insensible à la casse). Rejetée : enregistrée « ecarte_auto » avec la raison,
//   sans mail, supprimée au bout de 14 jours.
// - Mails : récapitulatif des nouvelles annonces ; panne (toutes les sources en erreur 3 passages de suite) et
//   rétablissement ; bilan le lundi matin.
const axios = require('axios');

const err = (status, message) => Object.assign(new Error(message), { status });
const ETIQUETTES = ['3D', 'PixFeed'];
const STATUTS = ['nouveau', 'vu', 'repondu', 'ecarte', 'ecarte_auto'];
const TYPES_REGLE = ['garder_type', 'rejeter_type', 'exclusion', 'mot_cle'];
const INTERVALLE_MS = 2000;
const PASSAGES_AVANT_PANNE = 3;
const JOURS_ECARTEES = 14;

// ---------- valeurs de départ ----------
const SOURCES_DEPART = [
  ...['HungryArtists', 'artistforhire', 'HireanArtistHub', 'commissions', 'gameDevClassifieds', 'starvingartists', 'DnDcommissions', 'VTuberRequests'].map((v) => ({ type: 'forum', valeur: v, etiquette: '3D', actif: true })),
  { type: 'forum', valeur: 'forhire', etiquette: 'PixFeed', actif: true },
  { type: 'forum', valeur: 'freelance_forhire', etiquette: 'PixFeed', actif: true },
  { type: 'forum', valeur: 'slavelabour', etiquette: 'PixFeed', actif: false },
  ...['"hiring" 3D model', '"hiring" blender', '"looking for" 3D artist', '"paid" 3D printing model'].map((v) => ({ type: 'recherche', valeur: v, etiquette: '3D', actif: true })),
  ...['"hiring" wordpress', '"hiring" web developer'].map((v) => ({ type: 'recherche', valeur: v, etiquette: 'PixFeed', actif: true })),
];
const REGLES_DEPART = [
  ...['Hiring', 'Paid', 'Task', 'Looking for', '[H]'].map((v) => ({ type: 'garder_type', valeur: v })),
  ...['For Hire', '[FH]', 'Offering', 'Portfolio'].map((v) => ({ type: 'rejeter_type', valeur: v })),
  ...['NSFW', '18+', 'unpaid', 'for exposure', 'free', 'collab only', 'revenue share', 'rev share', 'AI art', 'AI generated'].map((v) => ({ type: 'exclusion', valeur: v })),
  ...['3D', 'blender', 'model', 'modeling', 'modeller', 'render', 'environment', 'sculpt', 'sculpting', 'zbrush', 'figure', 'figurine', 'miniature', 'STL', 'print', 'printable', '3D printing', 'character model', 'rig', 'rigging', 'animation', 'low poly', 'asset', 'game asset', 'prop', 'VTuber model', 'VRChat', 'avatar', 'turnaround', 'product render', 'architectural visualization', 'archviz', 'interior'].map((v) => ({ type: 'mot_cle', etiquette: '3D', valeur: v })),
  ...['website', 'wordpress', 'web developer', 'web design', 'landing page', 'SEO', 'shopify', 'woocommerce', 'PHP', 'React', 'site'].map((v) => ({ type: 'mot_cle', etiquette: 'PixFeed', valeur: v })),
];

// ---------- tables ----------
const prets = new WeakSet();
async function assurerTables(q) {
  if (prets.has(q)) return;
  await q.query(`
    CREATE TABLE IF NOT EXISTS veille_reddit_sources (
      id SERIAL PRIMARY KEY, type TEXT NOT NULL, valeur TEXT NOT NULL, etiquette TEXT NOT NULL, actif BOOLEAN DEFAULT TRUE,
      derniere_lecture TIMESTAMPTZ, derniere_erreur TEXT, cree_le TIMESTAMPTZ DEFAULT NOW(), UNIQUE (type, valeur)
    );
    CREATE TABLE IF NOT EXISTS veille_reddit_regles (
      id SERIAL PRIMARY KEY, type TEXT NOT NULL, etiquette TEXT, valeur TEXT NOT NULL, actif BOOLEAN DEFAULT TRUE,
      cree_le TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_veille_reddit_regles ON veille_reddit_regles (type, COALESCE(etiquette, ''), LOWER(valeur));
    CREATE TABLE IF NOT EXISTS veille_reddit (
      id SERIAL PRIMARY KEY, reddit_id TEXT UNIQUE NOT NULL, source_id INTEGER, etiquette TEXT, subreddit TEXT, auteur TEXT,
      titre TEXT, texte TEXT, flair TEXT, url TEXT, publie_le TIMESTAMPTZ, nb_commentaires INTEGER DEFAULT 0,
      budget_texte TEXT, budget_min NUMERIC, devise TEXT, mot_cle TEXT, statut TEXT NOT NULL DEFAULT 'nouveau',
      raison_ecart TEXT, note TEXT, cree_le TIMESTAMPTZ DEFAULT NOW(), maj_le TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_veille_reddit_statut ON veille_reddit (statut, publie_le DESC);
    CREATE TABLE IF NOT EXISTS veille_reddit_passages (
      id SERIAL PRIMARY KEY, debut TIMESTAMPTZ, fin TIMESTAMPTZ, lus INTEGER DEFAULT 0, nouveaux INTEGER DEFAULT 0,
      ecartes INTEGER DEFAULT 0, deja_vus INTEGER DEFAULT 0, sources_ok INTEGER DEFAULT 0, sources_ko INTEGER DEFAULT 0, erreurs JSONB
    );
    CREATE TABLE IF NOT EXISTS veille_reddit_etat (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), echecs_consecutifs INTEGER DEFAULT 0, panne_signalee BOOLEAN DEFAULT FALSE
    );
    INSERT INTO veille_reddit_etat (id) VALUES (1) ON CONFLICT (id) DO NOTHING;`);
  // Valeurs de départ, une seule fois (tables vides).
  if (!(await q.query('SELECT 1 FROM veille_reddit_sources LIMIT 1')).rowCount) {
    for (const s of SOURCES_DEPART) await q.query('INSERT INTO veille_reddit_sources (type, valeur, etiquette, actif) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', [s.type, s.valeur, s.etiquette, s.actif]);
  }
  if (!(await q.query('SELECT 1 FROM veille_reddit_regles LIMIT 1')).rowCount) {
    for (const r of REGLES_DEPART) await q.query('INSERT INTO veille_reddit_regles (type, etiquette, valeur) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [r.type, r.etiquette || null, r.valeur]);
  }
  prets.add(q);
}

// ---------- tri, sans IA ----------
const bas = (s) => String(s || '').toLowerCase();
const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Terme cherché en mot entier (pas « site » dans « website ») ; avec pluriel pour les mots-clés (models, assets).
function motif(terme, { pluriel = false } = {}) {
  const t = bas(terme).trim();
  const debut = /^[a-z0-9]/.test(t) ? '(?<![a-z0-9])' : '';
  const fin = /[a-z0-9]$/.test(t) ? `${pluriel && /[a-z]$/.test(t) ? '(?:e?s)?' : ''}(?![a-z0-9])` : '';
  return new RegExp(debut + echapper(t).replace(/\s+/g, '\\s+') + fin, 'i');
}
const premier = (texte, termes, opts) => termes.find((t) => motif(t, opts).test(texte)) || null;
// « free » vise le travail gratuit : « feel free to DM » ou « free to message » ne comptent pas.
const sansFormules = (s) => s.replace(/feel\s+free|free\s+to\s+(?:dm|message|reach|contact|ask|send|pm)|free\s+time/gi, ' ');
const FAIBLES = ['portfolio'];   // rejet seulement sans « Hiring »… (un employeur écrit souvent « send your portfolio »)

function regleListes(regles) {
  const actives = regles.filter((r) => r.actif !== false);
  const de = (type, etiquette) => actives.filter((r) => r.type === type && (etiquette === undefined || r.etiquette === etiquette)).map((r) => r.valeur);
  return { garder: de('garder_type'), rejeter: de('rejeter_type'), exclusions: de('exclusion'), motsCles: Object.fromEntries(ETIQUETTES.map((e) => [e, de('mot_cle', e)])) };
}

/** Classe une annonce : { statut: 'nouveau' | 'ecarte_auto', raison, mot_cle }. */
function classer(post, etiquette, listes) {
  const flair = bas(post.link_flair_text), titre = bas(post.title), texte = bas(post.selftext);
  // a. Type d'annonce : l'étiquette du post d'abord (sur r/HungryArtists, « Hiring » n'est souvent que là), puis le titre.
  const forts = listes.rejeter.filter((t) => !FAIBLES.includes(bas(t)));
  const faibles = listes.rejeter.filter((t) => FAIBLES.includes(bas(t)));
  const gF = premier(flair, listes.garder), rF = premier(flair, listes.rejeter);
  if (!(gF && !rF)) {
    if (rF) return { statut: 'ecarte_auto', raison: `type : ${rF} (étiquette)` };
    const rT = premier(titre, forts);
    if (rT) return { statut: 'ecarte_auto', raison: `type : ${rT}` };
    const gT = premier(titre, listes.garder);
    const fT = premier(titre, faibles);
    if (!gT) return { statut: 'ecarte_auto', raison: fT ? `type : ${fT}` : 'type : pas une annonce (ni Hiring, Paid, Task, Looking for, [H])' };
  }
  // b. Exclusions.
  if (post.over_18) return { statut: 'ecarte_auto', raison: 'exclusion : NSFW (contenu adulte)' };
  const ex = premier(sansFormules(`${titre}\n${texte}`), listes.exclusions);
  if (ex) return { statut: 'ecarte_auto', raison: `exclusion : ${ex}` };
  // c. Mots-clés de l'étiquette de la source.
  const mc = premier(`${titre}\n${texte}`, listes.motsCles[etiquette] || [], { pluriel: true });
  if (!mc) return { statut: 'ecarte_auto', raison: 'pas de mot-clé' };
  return { statut: 'nouveau', raison: null, mot_cle: mc };
}

// ---------- budget (regex, sans IA) ----------
const NB = String.raw`\d{1,3}(?:[,. ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?`;
const UNITE = String.raw`(?:\s?(?:\/\s?(?:hr|hour|h|hrs)\b|per\s+hour|an\s+hour|\/\s?(?:day|week|month)))?`;
const AVANT = new RegExp(String.raw`([$€£])\s?(${NB})\s?(k)?(?:\s?(?:-|–|to)\s?[$€£]?\s?(${NB})\s?(k)?)?${UNITE}`, 'i');
const APRES = new RegExp(String.raw`(?<![\w$€£])(${NB})\s?(k)?(?:\s?(?:-|–|to)\s?(${NB})\s?(k)?)?\s?(\$|€|£|usd|eur|euros?|dollars?|gbp)(?![a-z])${UNITE}`, 'i');
const DEVISES = { $: 'USD', '€': 'EUR', '£': 'GBP', usd: 'USD', dollar: 'USD', dollars: 'USD', eur: 'EUR', euro: 'EUR', euros: 'EUR', gbp: 'GBP' };
function nombre(s, k) {
  let t = String(s).trim();
  if (/[,. ]\d{3}(?!\d)/.test(t) && !/[.,]\d{1,2}$/.test(t)) t = t.replace(/[,. ]/g, '');   // 1,500 / 1 500 / 1.500
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? (k ? n * 1000 : n) : null;
}
function budget(...textes) {
  for (const t of textes) {
    const s = String(t || '');
    const a = AVANT.exec(s), b = APRES.exec(s);
    const m = a && (!b || a.index <= b.index) ? { m: a, devise: a[1], n: a[2], k: a[3] } : b ? { m: b, devise: b[5], n: b[1], k: b[2] } : null;
    if (m) return { budget_texte: m.m[0].trim(), budget_min: nombre(m.n, m.k), devise: DEVISES[bas(m.devise)] || null };
  }
  return { budget_texte: null, budget_min: null, devise: null };
}

// ---------- accès à Reddit ----------
const userAgent = () => `pixfeed-crm/1.0 (by u/${process.env.REDDIT_USERNAME || 'pixfeed'})`;
const oauthActif = () => !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
let jeton = null;          // { valeur, expire }
let derniereRequete = 0;

async function httpDefaut(url, { method = 'GET', headers = {}, data } = {}) {
  const r = await axios({ url, method, headers, data, timeout: 20000, validateStatus: () => true });
  return { status: r.status, json: r.data };
}
// Une requête toutes les 2 s au plus ; aucune nouvelle tentative.
async function requete(url, opts, x) {
  const attente = derniereRequete + INTERVALLE_MS - x.maintenant();
  if (attente > 0) await x.sleep(attente);
  derniereRequete = x.maintenant();
  try { return await x.http(url, opts); }
  catch (e) { return { status: 0, erreur: e.code || e.message }; }
}
async function jetonOAuth(x) {
  if (jeton && jeton.expire > x.maintenant() + 60000) return jeton.valeur;
  const basic = Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString('base64');
  const r = await requete('https://www.reddit.com/api/v1/access_token', { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'User-Agent': userAgent(), 'Content-Type': 'application/x-www-form-urlencoded' }, data: 'grant_type=client_credentials' }, x);
  if (r.status !== 200 || !r.json || !r.json.access_token) throw Object.assign(new Error(`jeton OAuth refusé (${r.status || r.erreur})`), { code: r.status || 'oauth' });
  jeton = { valeur: r.json.access_token, expire: x.maintenant() + (Number(r.json.expires_in) || 3600) * 1000 };
  return jeton.valeur;
}
// Chemin Reddit (« /r/sub/new », « /search ») → JSON ; erreur → { code }.
async function lire(chemin, params, x) {
  const qs = new URLSearchParams({ ...params, raw_json: '1' }).toString();
  let url, headers = { 'User-Agent': userAgent() };
  if (oauthActif()) {
    try { headers = { ...headers, Authorization: `Bearer ${await jetonOAuth(x)}` }; }
    catch (e) { return { code: e.code || 'oauth' }; }
    url = `https://oauth.reddit.com${chemin}?${qs}`;
  } else url = `https://www.reddit.com${chemin}.json?${qs}`;
  const r = await requete(url, { headers }, x);
  if (r.status === 401 && oauthActif()) jeton = null;   // jeton expiré : renouvelé au prochain passage
  if (r.status !== 200) return { code: r.status || r.erreur || 'réseau' };
  return { json: r.json };
}
const cheminSource = (s) => (s.type === 'forum' ? [`/r/${encodeURIComponent(s.valeur.replace(/^r\//i, ''))}/new`, { limit: '100' }] : ['/search', { q: s.valeur, sort: 'new', t: 'day', limit: '100' }]);
const posts = (json) => ((json && json.data && json.data.children) || []).filter((c) => c && c.kind === 't3' && c.data).map((c) => c.data);

// ---------- passage ----------
const D = (deps = {}) => ({ http: httpDefaut, sleep: (ms) => new Promise((ok) => setTimeout(ok, ms)), maintenant: () => Date.now(), mail: envoyerMail, ...deps });
let enCours = null;

async function passage(db, deps = {}) {
  if (enCours) return { deja_en_cours: true, depuis: enCours };
  enCours = new Date();
  const x = D(deps);
  try {
    await assurerTables(db.pool);
    const debut = new Date(x.maintenant());
    const sources = (await db.pool.query('SELECT * FROM veille_reddit_sources WHERE actif ORDER BY id')).rows;
    const listes = regleListes((await db.pool.query('SELECT * FROM veille_reddit_regles')).rows);
    const out = { lus: 0, nouveaux: [], ecartes: 0, deja_vus: 0, sources_ok: 0, sources_ko: 0, erreurs: [], commentaires_maj: 0 };
    const vusCePassage = new Set();
    for (const s of sources) {
      const [chemin, params] = cheminSource(s);
      const r = await lire(chemin, params, x);
      if (r.code) {
        out.sources_ko++; out.erreurs.push({ source: `${s.type === 'forum' ? 'r/' : 'recherche '}${s.valeur}`, code: String(r.code) });
        await db.pool.query('UPDATE veille_reddit_sources SET derniere_erreur = $2 WHERE id = $1', [s.id, `${new Date(x.maintenant()).toISOString()} : ${r.code}`]);
        continue;
      }
      out.sources_ok++;
      await db.pool.query('UPDATE veille_reddit_sources SET derniere_lecture = $2, derniere_erreur = NULL WHERE id = $1', [s.id, new Date(x.maintenant())]);
      const liste = posts(r.json);
      out.lus += liste.length;
      const ids = liste.map((p) => p.name).filter(Boolean);
      const connus = new Map((await db.pool.query('SELECT reddit_id, statut, publie_le FROM veille_reddit WHERE reddit_id = ANY($1::text[])', [ids])).rows.map((e) => [e.reddit_id, e]));
      for (const p of liste) {
        if (!p.name || vusCePassage.has(p.name)) continue;
        vusCePassage.add(p.name);
        const e = connus.get(p.name);
        if (e) {   // jamais recréée ; nombre de commentaires suivi pendant 48 h
          out.deja_vus++;
          if (['nouveau', 'vu'].includes(e.statut) && e.publie_le && x.maintenant() - new Date(e.publie_le).getTime() < 48 * 3600000) {
            await db.pool.query('UPDATE veille_reddit SET nb_commentaires = $2, maj_le = NOW() WHERE reddit_id = $1 AND nb_commentaires IS DISTINCT FROM $2', [p.name, Number(p.num_comments) || 0]);
          }
          continue;
        }
        const c = classer(p, s.etiquette, listes);
        const b = budget(p.title, p.selftext);
        const ins = await db.pool.query(
          `INSERT INTO veille_reddit (reddit_id, source_id, etiquette, subreddit, auteur, titre, texte, flair, url, publie_le, nb_commentaires, budget_texte, budget_min, devise, mot_cle, statut, raison_ecart)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT (reddit_id) DO NOTHING RETURNING *`,
          [p.name, s.id, s.etiquette, p.subreddit || null, p.author || null, p.title || null, p.selftext || null, p.link_flair_text || null,
            p.permalink ? `https://www.reddit.com${p.permalink}` : p.url || null, p.created_utc ? new Date(p.created_utc * 1000) : null, Number(p.num_comments) || 0,
            b.budget_texte, b.budget_min, b.devise, c.mot_cle || null, c.statut, c.raison]);
        if (!ins.rowCount) { out.deja_vus++; continue; }
        if (c.statut === 'nouveau') out.nouveaux.push(ins.rows[0]); else out.ecartes++;
      }
    }
    // Annonces de moins de 48 h (nouveau, vu) que ce passage n'a pas revues : commentaires relus en une requête.
    if (out.sources_ok) {
      const suivies = (await db.pool.query("SELECT reddit_id FROM veille_reddit WHERE statut IN ('nouveau', 'vu') AND publie_le > $1 ORDER BY publie_le DESC LIMIT 100", [new Date(x.maintenant() - 48 * 3600000)])).rows.map((r) => r.reddit_id).filter((id) => !vusCePassage.has(id));
      if (suivies.length) {
        const r = await lire(`/by_id/${suivies.join(',')}`, {}, x);
        for (const p of r.code ? [] : posts(r.json)) {
          const u = await db.pool.query('UPDATE veille_reddit SET nb_commentaires = $2, maj_le = NOW() WHERE reddit_id = $1 AND nb_commentaires IS DISTINCT FROM $2', [p.name, Number(p.num_comments) || 0]);
          out.commentaires_maj += u.rowCount;
        }
      }
    }
    await db.pool.query(`DELETE FROM veille_reddit WHERE statut = 'ecarte_auto' AND cree_le < NOW() - INTERVAL '${JOURS_ECARTEES} days'`);
    await db.pool.query('INSERT INTO veille_reddit_passages (debut, fin, lus, nouveaux, ecartes, deja_vus, sources_ok, sources_ko, erreurs) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [debut, new Date(x.maintenant()), out.lus, out.nouveaux.length, out.ecartes, out.deja_vus, out.sources_ok, out.sources_ko, JSON.stringify(out.erreurs)]);
    await db.pool.query("DELETE FROM veille_reddit_passages WHERE debut < NOW() - INTERVAL '60 days'");
    out.panne = await suivrePanne(db, out, x);
    if (out.nouveaux.length) await x.mail(`Reddit : ${out.nouveaux.length} nouvelle(s) annonce(s)`, texteNouvelles(out.nouveaux, x.maintenant())).catch((e) => console.error('[Veille Reddit] mail :', e.message));
    return { ...out, nouveaux: out.nouveaux.map((a) => a.id) };
  } finally { enCours = null; }
}

// Panne : toutes les sources en erreur 3 passages de suite → un mail ; rétablie → un mail.
async function suivrePanne(db, out, x) {
  const e = (await db.pool.query('SELECT * FROM veille_reddit_etat WHERE id = 1')).rows[0];
  const toutKo = out.sources_ok === 0 && out.sources_ko > 0;
  if (toutKo) {
    const n = (e.echecs_consecutifs || 0) + 1;
    await db.pool.query('UPDATE veille_reddit_etat SET echecs_consecutifs = $1 WHERE id = 1', [n]);
    if (n >= PASSAGES_AVANT_PANNE && !e.panne_signalee) {
      await db.pool.query('UPDATE veille_reddit_etat SET panne_signalee = TRUE WHERE id = 1');
      const codes = [...new Set(out.erreurs.map((r) => r.code))].join(', ');
      await x.mail('Veille Reddit en panne', `Reddit renvoie des erreurs sur toutes les sources depuis ${n} passages de suite (${n * 10} minutes environ).\n\nCodes d'erreur : ${codes}\n\nDétail du dernier passage :\n${out.erreurs.map((r) => `- ${r.source} : ${r.code}`).join('\n')}\n\n403 : accès refusé (adresse du serveur bloquée : régler REDDIT_CLIENT_ID et REDDIT_CLIENT_SECRET dans backend/.env pour l'accès OAuth) ; 429 : trop de requêtes ; 5xx : Reddit en difficulté.\nUn mail suivra quand la veille repartira.`).catch((er) => console.error('[Veille Reddit] mail panne :', er.message));
      return 'panne signalée';
    }
    return `échec ${n}/${PASSAGES_AVANT_PANNE}`;
  }
  if (out.sources_ok > 0) {
    if (e.panne_signalee) await x.mail('Veille Reddit rétablie', `La veille Reddit lit de nouveau ses sources (${out.sources_ok} source(s) lue(s) au dernier passage, ${out.nouveaux.length} nouvelle(s) annonce(s)).`).catch((er) => console.error('[Veille Reddit] mail rétablie :', er.message));
    if (e.panne_signalee || e.echecs_consecutifs) await db.pool.query('UPDATE veille_reddit_etat SET echecs_consecutifs = 0, panne_signalee = FALSE WHERE id = 1');
    return e.panne_signalee ? 'rétablie' : null;
  }
  return null;
}

// ---------- mails ----------
const anciennete = (d, maintenant) => {
  if (!d) return 'date inconnue';
  const min = Math.max(0, Math.round((maintenant - new Date(d).getTime()) / 60000));
  return min < 60 ? `il y a ${min} min` : min < 48 * 60 ? `il y a ${Math.round(min / 60)} h` : `il y a ${Math.round(min / 1440)} j`;
};
const extrait = (s, n = 300) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };
const MAIL_MAX = 30;   // au premier passage, des dizaines d'annonces arrivent d'un coup : les 30 plus récentes
function texteNouvelles(toutes, maintenant) {
  const annonces = [...toutes].sort((a, b) => new Date(b.publie_le || 0) - new Date(a.publie_le || 0)).slice(0, MAIL_MAX);
  const reste = toutes.length - annonces.length;
  return annonces.map((a) => [
    `[${a.etiquette}] r/${a.subreddit} : ${a.titre}`,
    `Budget : ${a.budget_texte || 'non indiqué'} · ${a.nb_commentaires || 0} commentaire(s) · publiée ${anciennete(a.publie_le, maintenant)}`,
    extrait(a.texte) || '(pas de texte)',
    a.url,
  ].join('\n')).join('\n\n') + `${reste > 0 ? `\n\n… et ${reste} autre(s), plus ancienne(s), dans le CRM.` : ''}\n\nÀ suivre dans le CRM : Prospects > Découverte > Veille Reddit.`;
}
async function envoyerMail(sujet, texte) {
  const mail = require('./emailService');
  const to = process.env.ALERT_EMAIL || process.env.REPORT_REPLY_TO || process.env.EMAIL_USER;
  if (!to) return;
  const html = `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;white-space:pre-line">${texte.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])).replace(/(https:\/\/www\.reddit\.com\/\S+)/g, '<a href="$1">$1</a>')}</div>`;
  await mail.sendEmail({ to, subject: sujet, text: texte, html });
}

// Bilan de la semaine (lundi matin) : lues, gardées, écartées automatiquement, raisons d'écart les plus fréquentes.
async function bilan(db, deps = {}) {
  const x = D(deps);
  await assurerTables(db.pool);
  const t = (await db.pool.query(`SELECT COUNT(*)::int AS lues, COUNT(*) FILTER (WHERE statut <> 'ecarte_auto')::int AS gardees, COUNT(*) FILTER (WHERE statut = 'ecarte_auto')::int AS ecartees,
      COUNT(*) FILTER (WHERE statut = 'repondu')::int AS repondues FROM veille_reddit WHERE cree_le > NOW() - INTERVAL '7 days'`)).rows[0];
  const raisons = (await db.pool.query(`SELECT raison_ecart AS raison, COUNT(*)::int AS n FROM veille_reddit WHERE statut = 'ecarte_auto' AND cree_le > NOW() - INTERVAL '7 days' GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 10`)).rows;
  const p = (await db.pool.query(`SELECT COUNT(*)::int AS passages, COUNT(*) FILTER (WHERE sources_ko > 0)::int AS avec_erreurs FROM veille_reddit_passages WHERE debut > NOW() - INTERVAL '7 days'`)).rows[0];
  const texte = [`Veille Reddit, 7 derniers jours :`, `- annonces lues (une fois chacune) : ${t.lues}`, `- gardées : ${t.gardees} (dont ${t.repondues} répondue(s))`, `- écartées automatiquement : ${t.ecartees}`, `- passages : ${p.passages}, dont ${p.avec_erreurs} avec au moins une source en erreur`,
    '', 'Raisons d\'écart les plus fréquentes :', ...(raisons.length ? raisons.map((r) => `- ${r.raison} : ${r.n}`) : ['- aucune']), '', 'Si une raison écarte trop d\'annonces utiles, ajuster les listes : Veille Reddit > Réglages.'].join('\n');
  await x.mail('Veille Reddit : bilan de la semaine', texte);
  return { ...t, ...p, raisons };
}

// ---------- lecture et suivi ----------
async function lister(db, { statut = 'nouveau', etiquette = null, subreddit = null, mot_cle: mc = null, budget: avecBudget = null, depuis_heures: h = 48, inclure_ecartees: inclure = false, limite = 30, apres = 0 } = {}) {
  await assurerTables(db.pool);
  if (statut && statut !== 'tous' && !STATUTS.includes(statut)) throw err(400, `statut : ${STATUTS.join(', ')} ou tous`);
  if (etiquette && !ETIQUETTES.includes(etiquette)) throw err(400, 'etiquette : 3D ou PixFeed');
  const heures = Number(h) > 0 ? Number(h) : null;
  const { rows } = await db.pool.query(
    `SELECT * FROM veille_reddit
      WHERE ($1::text IS NULL OR statut = $1) AND ($2 OR $1 = 'ecarte_auto' OR statut <> 'ecarte_auto')
        AND ($3::text IS NULL OR etiquette = $3) AND ($4::text IS NULL OR LOWER(subreddit) = LOWER($4))
        AND ($5::text IS NULL OR mot_cle ILIKE $5) AND ($6::boolean IS NULL OR (budget_texte IS NOT NULL) = $6)
        AND ($7::numeric IS NULL OR COALESCE(publie_le, cree_le) > NOW() - ($7 || ' hours')::interval)
      ORDER BY COALESCE(publie_le, cree_le) DESC LIMIT $8 OFFSET $9`,
    [statut && statut !== 'tous' ? statut : null, !!inclure, etiquette, subreddit ? String(subreddit).replace(/^r\//i, '') : null, mc ? `%${mc}%` : null,
      avecBudget === null || avecBudget === undefined || avecBudget === '' ? null : avecBudget === true || avecBudget === 'oui' || avecBudget === 'true', heures, Math.min(200, Number(limite) || 30), Number(apres) || 0]);
  const compteurs = Object.fromEntries((await db.pool.query('SELECT statut, COUNT(*)::int AS n FROM veille_reddit GROUP BY statut')).rows.map((r) => [r.statut, r.n]));
  return { annonces: rows, compteurs };
}
async function marquer(db, id, { statut, note } = {}) {
  await assurerTables(db.pool);
  if (statut !== undefined && !['nouveau', 'vu', 'repondu', 'ecarte'].includes(statut)) throw err(400, 'statut : vu, repondu, ecarte (ou nouveau pour récupérer)');
  const r = await db.pool.query(`UPDATE veille_reddit SET statut = COALESCE($2, statut), raison_ecart = CASE WHEN $2::text IS NULL THEN raison_ecart WHEN $2 = 'nouveau' THEN NULL ELSE raison_ecart END,
      note = CASE WHEN $3::boolean THEN $4 ELSE note END, maj_le = NOW() WHERE id = $1 RETURNING *`,
  [Number(id), statut || null, note !== undefined, note === undefined ? null : String(note || '').slice(0, 4000) || null]);
  if (!r.rowCount) throw err(404, `annonce ${id} introuvable`);
  return r.rows[0];
}
async function regles(db) {
  await assurerTables(db.pool);
  const sources = (await db.pool.query('SELECT * FROM veille_reddit_sources ORDER BY etiquette, type, id')).rows;
  const liste = (await db.pool.query('SELECT * FROM veille_reddit_regles ORDER BY type, etiquette NULLS FIRST, id')).rows;
  const dernier = (await db.pool.query('SELECT * FROM veille_reddit_passages ORDER BY id DESC LIMIT 1')).rows[0] || null;
  const etat = (await db.pool.query('SELECT * FROM veille_reddit_etat WHERE id = 1')).rows[0];
  return { sources, regles: liste, dernier_passage: dernier, panne: etat, en_cours: enCours, en_pause: enPause() ? PAUSE : undefined, acces: oauthActif() ? 'OAuth (application)' : 'aucun (clés OAuth absentes)', frequence: enPause() ? 'en pause' : 'toutes les 10 minutes' };
}
// Réglages depuis l'interface : sources et règles (ajouter, désactiver, supprimer).
async function ajouterSource(db, { type, valeur, etiquette, actif = true } = {}) {
  await assurerTables(db.pool);
  if (!['forum', 'recherche'].includes(type)) throw err(400, 'type : forum ou recherche');
  if (!ETIQUETTES.includes(etiquette)) throw err(400, 'etiquette : 3D ou PixFeed');
  const v = String(valeur || '').trim().replace(type === 'forum' ? /^\/?r\// : /^$/, '');
  if (!v || (type === 'forum' && !/^[A-Za-z0-9_]{2,30}$/.test(v))) throw err(400, type === 'forum' ? 'nom de forum attendu (lettres, chiffres, _)' : 'requête vide');
  const r = await db.pool.query('INSERT INTO veille_reddit_sources (type, valeur, etiquette, actif) VALUES ($1, $2, $3, $4) ON CONFLICT (type, valeur) DO UPDATE SET etiquette = EXCLUDED.etiquette, actif = EXCLUDED.actif RETURNING *', [type, v, etiquette, actif !== false]);
  return r.rows[0];
}
async function modifierSource(db, id, { actif, etiquette } = {}) {
  if (etiquette !== undefined && !ETIQUETTES.includes(etiquette)) throw err(400, 'etiquette : 3D ou PixFeed');
  const r = await db.pool.query('UPDATE veille_reddit_sources SET actif = COALESCE($2, actif), etiquette = COALESCE($3, etiquette) WHERE id = $1 RETURNING *', [Number(id), actif === undefined ? null : !!actif, etiquette || null]);
  if (!r.rowCount) throw err(404, 'source introuvable');
  return r.rows[0];
}
async function supprimerSource(db, id) {
  const r = await db.pool.query('DELETE FROM veille_reddit_sources WHERE id = $1 RETURNING id', [Number(id)]);
  if (!r.rowCount) throw err(404, 'source introuvable');
  return { supprimee: Number(id) };
}
async function ajouterRegle(db, { type, valeur, etiquette = null } = {}) {
  await assurerTables(db.pool);
  if (!TYPES_REGLE.includes(type)) throw err(400, `type : ${TYPES_REGLE.join(', ')}`);
  if (type === 'mot_cle' && !ETIQUETTES.includes(etiquette)) throw err(400, 'mot-clé : etiquette 3D ou PixFeed');
  const v = String(valeur || '').trim();
  if (!v || v.length > 80) throw err(400, 'valeur : 1 à 80 caractères');
  const r = await db.pool.query('INSERT INTO veille_reddit_regles (type, etiquette, valeur) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING *', [type, type === 'mot_cle' ? etiquette : null, v]);
  if (!r.rowCount) throw err(409, 'déjà dans la liste');
  return r.rows[0];
}
async function modifierRegle(db, id, { actif } = {}) {
  const r = await db.pool.query('UPDATE veille_reddit_regles SET actif = $2 WHERE id = $1 RETURNING *', [Number(id), !!actif]);
  if (!r.rowCount) throw err(404, 'règle introuvable');
  return r.rows[0];
}
async function supprimerRegle(db, id) {
  const r = await db.pool.query('DELETE FROM veille_reddit_regles WHERE id = $1 RETURNING id', [Number(id)]);
  if (!r.rowCount) throw err(404, 'règle introuvable');
  return { supprimee: Number(id) };
}

// En pause tant que REDDIT_CLIENT_ID et REDDIT_CLIENT_SECRET manquent dans backend/.env : Reddit refuse l'accès
// public depuis le serveur (403). En pause : aucun passage (planifié ou manuel), aucun mail (panne, bilan).
const enPause = () => !oauthActif();
const PAUSE = 'Veille Reddit en pause : ajouter REDDIT_CLIENT_ID et REDDIT_CLIENT_SECRET dans backend/.env (application Reddit de type « script »), puis redémarrer le CRM.';
// Une tâche planifiée : rien du tout tant que la veille est en pause.
async function tick(db, quoi = 'passage', deps = {}) {
  if (enPause()) return { en_pause: true };
  return quoi === 'bilan' ? bilan(db, deps) : passage(db, deps);
}

function lancer(db) {
  if (enPause()) throw err(409, PAUSE);
  if (enCours) return { deja_en_cours: true, depuis: enCours };
  passage(db).then((r) => console.log(`[Veille Reddit] passage manuel : ${r.lus} lue(s), ${r.nouveaux.length} nouvelle(s), ${r.sources_ko} source(s) en erreur`)).catch((e) => console.error('[Veille Reddit] passage :', e.message));
  return { lance: true };
}
function start(db) {
  const cron = require('node-cron');
  assurerTables(db.pool).catch((e) => console.error('[Veille Reddit] tables :', e.message));
  if (enPause()) console.log('[Veille Reddit] en pause : REDDIT_CLIENT_ID et REDDIT_CLIENT_SECRET absents de backend/.env');
  cron.schedule('*/10 * * * *', () => { tick(db, 'passage').catch((e) => console.error('[Veille Reddit] passage :', e.message)); }, { timezone: 'Europe/Paris' });
  cron.schedule('13 8 * * 1', () => { tick(db, 'bilan').catch((e) => console.error('[Veille Reddit] bilan :', e.message)); }, { timezone: 'Europe/Paris' });
}
const _reinitialiser = () => { jeton = null; derniereRequete = 0; enCours = null; };

module.exports = { tick, enPause, ETIQUETTES, STATUTS, SOURCES_DEPART, REGLES_DEPART, assurerTables, classer, regleListes, budget, motif, passage, bilan, lister, marquer, regles, ajouterSource, modifierSource, supprimerSource, ajouterRegle, modifierRegle, supprimerRegle, lancer, start, texteNouvelles, _reinitialiser };
