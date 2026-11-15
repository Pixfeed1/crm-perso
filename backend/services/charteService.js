// Charte de rédaction et identité de chaque site (jurojin.net : 2, pixfeed.net : 15). Elle n'existe qu'ici,
// en base : les contrôles de style et la relecture de prepare_draft la relisent à chaque dépôt.
//
// Une ligne de charte_versions = l'état COMPLET de la fiche d'un site à une version donnée :
//   commun : { regles: [{ cle, section, section_titre, texte }], controles: { listes, motif date_isolee, seuils } }
//            — la charte commune aux deux sites : toute modification crée une nouvelle version sur CHAQUE site ;
//   site   : { nom, registre, identite, passages: [{ id, texte, date, statut, … }], controles: { effets, autre_site, mots_signales } }.
// Rien n'est jamais effacé : chaque modification ajoute une version (date, auteur, motif, changements avec l'ancien
// texte) ; revenir en arrière ajoute une version qui reprend l'ancienne.
// Passages de référence : seul Marc, dans l'interface, en ajoute, en valide ou en retire. Ceux proposés par le
// connecteur (origine « mcp ») restent « proposé » et n'entrent pas dans la relecture.
const { cleDomaine } = require('../utils/domaineCourt');

const err = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const copie = (x) => JSON.parse(JSON.stringify(x));

const LISTES_COMMUNES = ['liste_noire', 'intertitres_images', 'connecteurs', 'mots_vides', 'ia_motifs'];
const LISTES_SITE = ['autre_site', 'mots_signales'];
const LISTES_REGEX = ['liste_noire', 'intertitres_images', 'connecteurs'];
const EFFETS = ['bloquant', 'avertissement', 'inactif'];
const REGISTRES = ['tutoiement', 'vouvoiement'];
const LIBELLES_LISTES = {
  liste_noire: 'Liste noire (expressions toutes faites)', intertitres_images: 'Intertitres imagés', connecteurs: 'Connecteurs mécaniques en tête de paragraphe',
  mots_vides: "Mots ignorés pour l'écho du titre", ia_motifs: 'Noms à ne jamais créditer (IA)', autre_site: "Noms et domaines de l'autre site", mots_signales: 'Noms signalés (avertissement)',
};
const LIBELLES_EFFETS = {
  blancs_source: 'Blanc avant la ponctuation, texte déposé', blancs_rendu: 'Blanc avant la ponctuation, aperçu rendu', cadratin: 'Tiret cadratin',
  demi_cadratin_incise: "Demi-cadratin entouré d'espaces (incise)", ia_credits: 'Claude ou Anthropic dans les crédits et métadonnées des images',
  ia_texte: 'Claude ou Anthropic mentionné dans le texte', autre_site: "Mention de l'autre site (nom ou lien)", mots_signales: 'Noms signalés', markdown: 'Markdown brut (hors blocs de code)',
};

// ---- lecture ----
async function sitesAvecCharte(db) {
  return (await db.pool.query(
    `SELECT DISTINCT ON (v.site_id) v.site_id, v.version, v.created_at, v.auteur, s.domain
       FROM charte_versions v LEFT JOIN seo_sites s ON s.id = v.site_id ORDER BY v.site_id, v.version DESC`)).rows;
}
async function courante(db, siteId, q = db.pool) {
  const r = (await q.query(
    `SELECT v.site_id, v.version, v.contenu, v.auteur, v.origine, v.motif, v.created_at, s.domain
       FROM charte_versions v LEFT JOIN seo_sites s ON s.id = v.site_id WHERE v.site_id = $1 ORDER BY v.version DESC LIMIT 1`, [Number(siteId)])).rows[0];
  return r || null;
}
async function exiger(db, siteId, q) {
  const c = await courante(db, siteId, q);
  if (!c) throw err(404, `aucune charte pour le site ${siteId} (remplissage initial : node scripts/charte-initiale.js --ecrire)`);
  return c;
}
async function versions(db, siteId) {
  return (await db.pool.query(
    'SELECT version, auteur, origine, motif, changements, retour_de, created_at FROM charte_versions WHERE site_id = $1 ORDER BY version DESC', [Number(siteId)])).rows;
}
async function version(db, siteId, n) {
  const r = (await db.pool.query('SELECT site_id, version, contenu, auteur, origine, motif, changements, retour_de, created_at FROM charte_versions WHERE site_id = $1 AND version = $2', [Number(siteId), Number(n)])).rows[0];
  if (!r) throw err(404, `version ${n} introuvable pour le site ${siteId}`);
  return r;
}

// ---- différences entre deux états (historique et aperçu des modifications) ----
function diff(a, b) {
  const out = [];
  const add = (objet, cle, avant, apres) => out.push({ objet, cle, avant: avant === undefined ? null : avant, apres: apres === undefined ? null : apres });
  const ra = new Map((a.commun.regles || []).map((r) => [r.cle, r]));
  const rb = new Map((b.commun.regles || []).map((r) => [r.cle, r]));
  for (const [k, r] of ra) if (!rb.has(k)) add('règle', k, r.texte, null);
  for (const [k, r] of rb) {
    const x = ra.get(k);
    if (!x) add('règle', k, null, r.texte);
    else if (x.texte !== r.texte || x.section_titre !== r.section_titre || x.section !== r.section) add('règle', k, x.texte, r.texte);
  }
  const ca = a.commun.controles || {}, cb = b.commun.controles || {};
  for (const l of LISTES_COMMUNES) {
    const la = ca[l] || [], lb = cb[l] || [];
    for (const v of la) if (!lb.includes(v)) add(LIBELLES_LISTES[l], l, v, null);
    for (const v of lb) if (!la.includes(v)) add(LIBELLES_LISTES[l], l, null, v);
  }
  if (ca.date_isolee !== cb.date_isolee) add('motif', 'date_isolee', ca.date_isolee, cb.date_isolee);
  const sa = ca.seuils || {}, sb = cb.seuils || {};
  for (const k of new Set([...Object.keys(sa), ...Object.keys(sb)])) if (sa[k] !== sb[k]) add('seuil', k, sa[k], sb[k]);
  const A = a.site, B = b.site;
  if (A.registre !== B.registre) add('registre', 'registre', A.registre, B.registre);
  if (A.identite !== B.identite) add('identité', 'identite', A.identite, B.identite);
  const pa = new Map((A.passages || []).map((p) => [p.id, p]));
  const pb = new Map((B.passages || []).map((p) => [p.id, p]));
  for (const [k, p] of pa) if (!pb.has(k)) add('passage', k, `${p.texte} (${p.statut})`, null);
  for (const [k, p] of pb) {
    const x = pa.get(k);
    if (!x) add('passage', k, null, `${p.texte} (${p.statut})`);
    else if (x.texte !== p.texte || x.statut !== p.statut) add('passage', k, `${x.texte} (${x.statut})`, `${p.texte} (${p.statut})`);
  }
  const ea = (A.controles || {}).effets || {}, eb = (B.controles || {}).effets || {};
  for (const k of new Set([...Object.keys(ea), ...Object.keys(eb)])) if (ea[k] !== eb[k]) add('effet', k, ea[k], eb[k]);
  for (const l of LISTES_SITE) {
    const la = (A.controles || {})[l] || [], lb = (B.controles || {})[l] || [];
    for (const v of la) if (!lb.includes(v)) add(LIBELLES_LISTES[l], l, v, null);
    for (const v of lb) if (!la.includes(v)) add(LIBELLES_LISTES[l], l, null, v);
  }
  return out;
}

// ---- une opération sur l'état d'un site ----
const echapper = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function motifValide(p) {
  try { new RegExp(p, 'iu'); return true; } catch { return false; }
}
function texteRequis(v, quoi) {
  const t = String(v === undefined || v === null ? '' : v).trim();
  if (!t) throw err(400, `${quoi} : texte vide`);
  if (t.length > 20000) throw err(400, `${quoi} : 20 000 caractères au plus`);
  return t;
}

// origine : 'interface' (Marc, connecté) ou 'mcp' (connecteur). auteur : qui modifie.
function appliquer(etat, op, { origine, auteur, maintenant }) {
  const o = op || {};
  const action = o.action;
  const portee = ['regle', 'motif', 'seuil'].includes(o.objet) || (o.objet === 'liste' && LISTES_COMMUNES.includes(o.liste)) ? 'commun' : 'site';
  const C = etat.commun, S = etat.site;
  switch (o.objet) {
    case 'regle': {
      const i = C.regles.findIndex((r) => r.cle === String(o.cle || ''));
      if (!o.cle) throw err(400, 'règle : cle obligatoire (ex. 5.1, 7.12, 11.2.3)');
      if (action === 'ajouter') {
        if (i >= 0) throw err(409, `la règle ${o.cle} existe déjà : action modifier`);
        const section = String(o.section || String(o.cle).split('.').slice(0, -1).join('.') || o.cle);
        const voisine = C.regles.filter((r) => r.section === section);
        const r = { cle: String(o.cle), section, section_titre: String(o.section_titre || (voisine[0] && voisine[0].section_titre) || ''), texte: texteRequis(o.texte, `règle ${o.cle}`) };
        const apres = voisine.length ? C.regles.indexOf(voisine[voisine.length - 1]) + 1 : C.regles.length;
        C.regles.splice(apres, 0, r);
      } else if (action === 'modifier') {
        if (i < 0) throw err(404, `règle ${o.cle} introuvable`);
        if (o.texte !== undefined) C.regles[i].texte = texteRequis(o.texte, `règle ${o.cle}`);
        if (o.section_titre !== undefined) C.regles[i].section_titre = String(o.section_titre);
      } else if (action === 'retirer') {
        if (i < 0) throw err(404, `règle ${o.cle} introuvable`);
        C.regles.splice(i, 1);
      } else throw err(400, 'règle : action ajouter, modifier ou retirer');
      return portee;
    }
    case 'liste': {
      const nom = o.liste;
      if (![...LISTES_COMMUNES, ...LISTES_SITE].includes(nom)) throw err(400, `liste inconnue « ${nom} » (${[...LISTES_COMMUNES, ...LISTES_SITE].join(', ')})`);
      const ctl = portee === 'commun' ? C.controles : (S.controles = S.controles || {});
      const liste = ctl[nom] = ctl[nom] || [];
      const brut = (v) => {
        const t = texteRequis(v, LIBELLES_LISTES[nom]);
        if (!LISTES_REGEX.includes(nom)) return t;
        const p = o.texte_simple ? echapper(t) : t;
        if (!motifValide(p)) throw err(400, `motif invalide « ${t} » : expression régulière incorrecte (ou texte_simple=true pour une expression telle quelle)`);
        return p;
      };
      if (action === 'ajouter') {
        const v = brut(o.valeur);
        if (liste.includes(v)) throw err(409, `« ${v} » figure déjà dans ${LIBELLES_LISTES[nom]}`);
        liste.push(v);
      } else if (action === 'retirer') {
        const i = liste.indexOf(String(o.valeur));
        if (i < 0) throw err(404, `« ${o.valeur} » absent de ${LIBELLES_LISTES[nom]}`);
        liste.splice(i, 1);
      } else if (action === 'modifier') {
        const i = liste.indexOf(String(o.valeur));
        if (i < 0) throw err(404, `« ${o.valeur} » absent de ${LIBELLES_LISTES[nom]}`);
        liste[i] = brut(o.nouvelle_valeur);
      } else throw err(400, 'liste : action ajouter, modifier ou retirer');
      return portee;
    }
    case 'motif': {
      if (o.cle !== 'date_isolee' || action !== 'modifier') throw err(400, 'motif : seul date_isolee se modifie');
      const p = texteRequis(o.valeur, 'motif date_isolee');
      if (!motifValide(p)) throw err(400, 'motif date_isolee : expression régulière incorrecte');
      C.controles.date_isolee = p;
      return portee;
    }
    case 'seuil': {
      const s = C.controles.seuils || {};
      if (!(o.cle in s)) throw err(404, `seuil inconnu « ${o.cle} » (${Object.keys(s).join(', ')})`);
      const n = Number(o.valeur);
      if (action !== 'modifier' || !Number.isFinite(n) || n < 0) throw err(400, `seuil ${o.cle} : action modifier et un nombre positif`);
      s[o.cle] = n;
      return portee;
    }
    case 'effet': {
      const e = (S.controles = S.controles || {}).effets = (S.controles.effets || {});
      if (!(o.cle in e)) throw err(404, `effet inconnu « ${o.cle} » (${Object.keys(e).join(', ')})`);
      if (action !== 'modifier' || !EFFETS.includes(o.valeur)) throw err(400, `effet ${o.cle} : ${EFFETS.join(', ')}`);
      e[o.cle] = o.valeur;
      return portee;
    }
    case 'identite':
      if (action !== 'modifier') throw err(400, 'identité : action modifier');
      S.identite = texteRequis(o.texte, 'identité');
      return portee;
    case 'registre':
      if (action !== 'modifier' || !REGISTRES.includes(o.valeur)) throw err(400, `registre : ${REGISTRES.join(' ou ')}`);
      S.registre = o.valeur;
      return portee;
    case 'passage': {
      const P = S.passages = S.passages || [];
      const i = o.id ? P.findIndex((p) => p.id === String(o.id)) : -1;
      const parMarc = origine === 'interface';
      if (action === 'ajouter') {
        const n = 1 + P.reduce((m, p) => Math.max(m, Number(String(p.id).replace(/\D/g, '')) || 0), 0);
        const p = { id: `p${n}`, texte: texteRequis(o.texte, 'passage'), date: String(o.date || maintenant.slice(0, 10)), ...(o.source_url ? { source_url: String(o.source_url) } : {}) };
        if (parMarc) Object.assign(p, { statut: 'valide', valide_par: auteur, valide_le: maintenant.slice(0, 10) });
        else Object.assign(p, { statut: 'propose', propose_par: auteur, propose_le: maintenant.slice(0, 10) });
        P.push(p);
        return portee;
      }
      if (i < 0) throw err(404, `passage ${o.id || '?'} introuvable`);
      if (action === 'valider') {
        if (!parMarc) throw err(403, 'un passage ne se valide que par Marc, dans l\'interface du CRM');
        if (P[i].statut === 'valide') throw err(409, `passage ${o.id} déjà validé`);
        Object.assign(P[i], { statut: 'valide', valide_par: auteur, valide_le: maintenant.slice(0, 10) });
      } else if (action === 'retirer') {
        if (!parMarc && P[i].statut !== 'propose') throw err(403, 'un passage validé ne se retire que par Marc, dans l\'interface du CRM');
        P.splice(i, 1);
      } else if (action === 'modifier') {
        if (!parMarc && P[i].statut !== 'propose') throw err(403, 'un passage validé ne se modifie que par Marc, dans l\'interface du CRM');
        P[i].texte = texteRequis(o.texte, 'passage');
        if (!parMarc) Object.assign(P[i], { statut: 'propose', propose_par: auteur, propose_le: maintenant.slice(0, 10) });
      } else throw err(400, 'passage : action ajouter, modifier, valider ou retirer');
      return portee;
    }
    default:
      throw err(400, `objet inconnu « ${o.objet} » : regle, liste, motif, seuil, effet, identite, registre ou passage`);
  }
}

// Écrit les nouvelles versions, sous verrou, en vérifiant la version attendue du site visé.
async function ecrire(db, cibles, { siteId, versionAttendue, auteur, origine, motif, retourDe = null }) {
  const cl = await db.pool.connect();
  try {
    await cl.query('BEGIN');
    await cl.query('SELECT pg_advisory_xact_lock(920001)');
    const ecrites = [];
    for (const c of cibles) {
      const act = await exiger(db, c.site_id, cl);
      if (act.version !== c.version_actuelle) throw err(409, `la charte du site ${c.site_id} a changé entre-temps (v${act.version}) : recharger et refaire la modification`);
      if (c.site_id === siteId && versionAttendue && Number(versionAttendue) !== act.version) throw err(409, `version attendue v${versionAttendue}, version en cours v${act.version} : recharger la charte`);
      await cl.query(
        'INSERT INTO charte_versions (site_id, version, contenu, auteur, origine, motif, changements, retour_de) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [c.site_id, act.version + 1, JSON.stringify(c.contenu), auteur, origine, motif || null, JSON.stringify(c.changements), retourDe]);
      ecrites.push({ site_id: c.site_id, version: act.version + 1 });
    }
    await cl.query('COMMIT');
    return ecrites;
  } catch (e) { await cl.query('ROLLBACK').catch(() => {}); throw e; } finally { cl.release(); }
}

// Prépare les nouvelles versions : le site visé, et les autres sites si la charte commune change.
async function preparerCibles(db, siteId, nouvelEtat) {
  const sites = await sitesAvecCharte(db);
  const cibles = [];
  for (const s of sites) {
    const act = await exiger(db, s.site_id);
    const etat = s.site_id === siteId ? nouvelEtat : { commun: nouvelEtat.commun, site: act.contenu.site };
    const changements = diff(act.contenu, etat);
    if (changements.length) cibles.push({ site_id: s.site_id, domaine: s.domain, version_actuelle: act.version, version_nouvelle: act.version + 1, contenu: etat, changements });
  }
  return cibles;
}
const resume = (cibles) => cibles.map(({ contenu, ...x }) => x);

// Modification : une ou plusieurs opérations, simulation par défaut (aperçu avant → après).
async function modifier(db, { site, operations, motif = null, auteur, origine = 'interface', simulation = true, version_attendue = null }) {
  const siteId = Number(site);
  const ops = Array.isArray(operations) ? operations : operations ? [operations] : [];
  if (!ops.length) throw err(400, 'operations : au moins une opération');
  if (ops.length > 100) throw err(400, '100 opérations au plus par appel');
  if (!['interface', 'mcp'].includes(origine)) throw err(400, 'origine inconnue');
  const act = await exiger(db, siteId);
  const etat = copie(act.contenu);
  const maintenant = new Date().toISOString();
  ops.forEach((op, n) => {
    try { appliquer(etat, op, { origine, auteur, maintenant }); } catch (e) { e.message = `opération ${n + 1} : ${e.message}`; throw e; }
  });
  const cibles = await preparerCibles(db, siteId, etat);
  if (!cibles.length) throw err(400, 'aucun changement : la charte est déjà dans cet état');
  const out = { simulation, site_id: siteId, version_en_cours: act.version, sites: resume(cibles) };
  if (simulation) return { ...out, statut: 'simulation : rien écrit' };
  const ecrites = await ecrire(db, cibles, { siteId, versionAttendue: version_attendue, auteur, origine, motif });
  return { ...out, statut: 'écrit', versions: ecrites };
}

// Retour arrière : une nouvelle version qui reprend l'état de la version n (la charte commune de cette version
// s'applique aux deux sites, pour qu'elle reste commune).
async function retour(db, { site, version: n, motif = null, auteur, origine = 'interface', simulation = true }) {
  const siteId = Number(site);
  if (origine !== 'interface') throw err(403, "le retour à une version précédente se fait dans l'interface du CRM");
  const v = await version(db, siteId, n);
  const act = await exiger(db, siteId);
  if (v.version === act.version) throw err(400, `v${n} est déjà la version en cours`);
  const cibles = await preparerCibles(db, siteId, copie(v.contenu));
  if (!cibles.length) throw err(400, `la version en cours est identique à la v${n}`);
  const out = { simulation, site_id: siteId, retour_a: v.version, version_en_cours: act.version, sites: resume(cibles) };
  if (simulation) return { ...out, statut: 'simulation : rien écrit' };
  const ecrites = await ecrire(db, cibles, { siteId, auteur, origine, motif: motif || `retour à la v${v.version}`, retourDe: v.version });
  return { ...out, statut: 'écrit', versions: ecrites };
}

// « C'est nous » : un extrait d'un article publié du site devient un passage de référence validé par Marc.
const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', hellip: '…', ndash: '–', mdash: '—', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç' };
function texteVisible(html) {
  return String(html)
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, e) => ENTITES[e.toLowerCase()] || m);
}
const normaliser = (s) => String(s).normalize('NFC').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[\s  ]+/g, ' ').trim().toLowerCase();
async function passageDepuisArticle(db, { site, url, extrait, auteur, simulation = true, fetcher = fetch }) {
  const siteId = Number(site);
  const act = await exiger(db, siteId);
  const u = String(url || '').trim();
  if (!/^https?:\/\/\S+$/i.test(u)) throw err(400, "adresse de l'article : https://… attendue");
  if (cleDomaine(u) !== cleDomaine(act.domain)) throw err(400, `${u} n'est pas sur ${act.domain}`);
  const texte = texteRequis(extrait, 'extrait');
  let page;
  try {
    const r = await fetcher(u, { headers: { 'User-Agent': 'SEO-LinkCheck/1.0' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    page = await r.text();
  } catch (e) { throw err(502, `page ${u} illisible : ${e.message}`); }
  if (!normaliser(texteVisible(page)).includes(normaliser(texte))) throw err(409, "extrait introuvable tel quel sur la page publiée : le copier depuis l'article en ligne, sans le retoucher");
  return modifier(db, { site: siteId, operations: [{ objet: 'passage', action: 'ajouter', texte, source_url: u }], motif: `passage « c'est nous » depuis ${u}`, auteur, origine: 'interface', simulation });
}

// Export de la version en cours en Markdown (archives).
function exporterMarkdown(c) {
  const { commun: C, site: S } = c.contenu;
  const date = new Date(c.created_at).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
  const l = [`# Charte de rédaction et identité : ${S.nom || c.domain} (${c.domain})`, '', `Version ${c.version}, du ${date}, par ${c.auteur || '?'}${c.motif ? ` (${c.motif})` : ''}. Export du CRM : la version qui fait foi est en base.`, ''];
  l.push('## Identité', '', `Registre : ${S.registre}.`, '', S.identite, '');
  const P = S.passages || [];
  l.push('## Passages de référence', '');
  if (!P.length) l.push('Aucun.', '');
  for (const p of P) {
    l.push(p.statut === 'valide' ? `Validé par ${p.valide_par || 'Marc'} le ${p.valide_le || p.date}${p.source_url ? `, ${p.source_url}` : ''} :` : `Proposé le ${p.propose_le || p.date}${p.propose_par ? ` par ${p.propose_par}` : ''}, en attente de validation (hors relecture) :`, '');
    l.push(...String(p.texte).split('\n').map((x) => `> ${x}`), '');
  }
  l.push('## Charte commune aux deux sites', '');
  let section = null;
  for (const r of C.regles) {
    if (r.section !== section) { section = r.section; l.push(`### ${r.section}. ${r.section_titre}`, ''); }
    l.push(`- **${r.cle}** ${r.texte}`);
  }
  l.push('', '## Contrôles automatiques', '');
  for (const nom of LISTES_COMMUNES) l.push(`### ${LIBELLES_LISTES[nom]}`, '', ...(C.controles[nom] || []).map((x) => `- \`${x}\``), '');
  l.push('### Ligne datée isolée', '', `\`${C.controles.date_isolee}\``, '', '### Seuils', '', ...Object.entries(C.controles.seuils || {}).map(([k, v]) => `- ${k} : ${v}`), '');
  l.push(`### Effets propres à ${c.domain}`, '', ...Object.entries((S.controles || {}).effets || {}).map(([k, v]) => `- ${LIBELLES_EFFETS[k] || k} : ${v}`), '');
  for (const nom of LISTES_SITE) l.push(`### ${LIBELLES_LISTES[nom]}`, '', ...(((S.controles || {})[nom] || []).length ? S.controles[nom].map((x) => `- ${x}`) : ['Aucun.']), '');
  return l.join('\n');
}

// Remplissage initial (scripts/charte-initiale.js) : v1 de chaque site, refusé si une version existe déjà.
async function remplir(db, donnees, { auteur = 'Marc', simulation = true } = {}) {
  const sites = Object.keys(donnees.sites || {}).map(Number);
  if (!sites.length || !donnees.commun) throw err(400, 'données de remplissage incomplètes');
  const out = { simulation, sites: [] };
  for (const s of sites) {
    const existe = await courante(db, s);
    if (existe) throw err(409, `le site ${s} a déjà une charte (v${existe.version}) : le remplissage initial ne sert qu'une fois`);
    const site = (await db.pool.query('SELECT id, domain FROM seo_sites WHERE id = $1', [s])).rows[0];
    if (!site) throw err(404, `site ${s} inconnu du CRM`);
    const S = copie(donnees.sites[String(s)]);
    S.passages = (S.passages || []).map((p, i) => ({ id: `p${i + 1}`, ...p }));
    const contenu = { commun: copie(donnees.commun), site: S };
    for (const l of LISTES_REGEX) for (const p of contenu.commun.controles[l] || []) if (!motifValide(p)) throw err(400, `motif invalide dans ${l} : ${p}`);
    out.sites.push({ site_id: s, domaine: site.domain, regles: contenu.commun.regles.length, passages: S.passages.map((p) => `${p.id} (${p.statut})`), registre: S.registre, contenu });
  }
  if (simulation) return { ...out, sites: out.sites.map(({ contenu, ...x }) => x), statut: 'simulation : rien écrit' };
  const cl = await db.pool.connect();
  try {
    await cl.query('BEGIN');
    for (const x of out.sites) {
      await cl.query("INSERT INTO charte_versions (site_id, version, contenu, auteur, origine, motif, changements) VALUES ($1, 1, $2, $3, 'remplissage', $4, '[]')",
        [x.site_id, JSON.stringify(x.contenu), auteur, `version initiale : ${donnees.source || 'charte du 15/11/2026'}`]);
    }
    await cl.query('COMMIT');
  } catch (e) { await cl.query('ROLLBACK').catch(() => {}); throw e; } finally { cl.release(); }
  return { ...out, sites: out.sites.map(({ contenu, ...x }) => x), statut: 'écrit' };
}

module.exports = {
  sitesAvecCharte, courante, versions, version, modifier, retour, passageDepuisArticle, exporterMarkdown, remplir, diff,
  LISTES_COMMUNES, LISTES_SITE, LISTES_REGEX, EFFETS, LIBELLES_LISTES, LIBELLES_EFFETS,
};
