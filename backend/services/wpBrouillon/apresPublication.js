// Étape 4 : retouches après publication (outils MCP repointer_liens, poser_etiquettes, modifier_media). Mêmes règles que prepare_draft : simulation=true par défaut (tous les contrôles, aucune
// écriture), rapport { actions, avertissements, erreurs }, journal seo_wp_journal pour chaque écriture (avec
// l'état d'avant), compte API dédié du site (rôle Éditeur). Jamais de suppression ni de publication.
// Routes WordPress utilisées : API REST standard et routes outils-site/v1 du mu-plugin publication-site.php.
// Les 301 restent à l'extension Redirection (surveillance des permaliens quand un slug change).
const crypto = require('crypto');
const { client } = require('./wp');

const UA = 'Mozilla/5.0 (compatible; SEO-LinkCheck/1.0; lecture seule, une requete par adresse)';
const DELAI_MS = 15000;
const MU = 'publication-site.php';
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const echapperRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const echapperHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sansWww = (h) => String(h || '').toLowerCase().replace(/^www\./, '');

// ---------------------------------------------------------------------------------------------- communs

function nouveauRapport(outil, siteId, simulation) {
  const r = { fetched_at: new Date().toISOString(), outil, site_id: siteId, simulation, actions: [], avertissements: [], erreurs: [] };
  return {
    r,
    bloque: (source, message, code = 'bloquant') => r.erreurs.push({ source, code, message }),
    avert: (source, message) => r.avertissements.push({ source, message }),
    action: (x) => r.actions.push(x),
    fin: (extra = {}) => ({ ...r, ...extra, statut: r.erreurs.length ? (r.ecrit ? 'écrit en partie' : 'bloqué') : simulation ? 'simulation : rien écrit' : 'écrit' }),
  };
}

async function contexte(db, siteId) {
  const { rows } = await db.pool.query('SELECT id, domain, wp_base_url FROM seo_sites WHERE id = $1', [siteId]);
  if (!rows[0]) throw Object.assign(new Error(`site ${siteId} inconnu du CRM`), { code: 'site' });
  const base = String(rows[0].wp_base_url || `https://${rows[0].domain}`).replace(/\/+$/, '');
  const wp = client(siteId, base);
  return { base, wp, hote: sansWww(new URL(base).hostname) };
}

/** Message clair quand une route du mu-plugin manque. */
const routeAbsente = (e, siteId) => (e && e.code === 404 && /rest_no_route/.test(e.message)
  ? `route absente : poser le mu-plugin ${MU} (node scripts/installer-mu.js ${siteId} <dossier du site> ${MU}, dans mcp_seo/)`
  : e.message);

/** Adresse absolue d'une adresse du site (relative acceptée), ou null si elle est ailleurs. */
function adresseDuSite(u, ctx) {
  try {
    const x = new URL(String(u).trim(), `${ctx.base}/`);
    if (!/^https?:$/.test(x.protocol) || sansWww(x.hostname) !== ctx.hote) return null;
    x.hash = '';
    return x;
  } catch { return null; }
}

/** Clé de comparaison : hôte sans www + chemin décodé, sans barre finale, en minuscules (+ requête). */
function cle(u, base) {
  try {
    const x = new URL(String(u), `${base}/`);
    let chemin = x.pathname;
    try { chemin = decodeURIComponent(chemin); } catch { /* chemin mal encodé : tel quel */ }
    return `${sansWww(x.hostname)}${chemin.replace(/\/+$/, '').toLowerCase()}${x.search}`;
  } catch { return String(u); }
}
const estAccueil = (x) => x.pathname.replace(/\/+$/, '') === '';

/** Requête publique sans suivre les redirections : { code, vers } ou { erreur }. */
async function sonder(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), DELAI_MS);
  try {
    const r = await fetch(url, { redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'text/html,*/*;q=0.5' } });
    r.body && r.body.cancel().catch(() => {});
    const loc = r.headers.get('location');
    return { code: r.status, vers: loc ? new URL(loc, url).toString() : undefined };
  } catch (e) {
    return { erreur: e.name === 'AbortError' ? `pas de réponse en ${DELAI_MS / 1000} s` : e.message };
  } finally { clearTimeout(t); }
}

/** Page publique (redirections suivies), pour voir comment elle affiche sa date de mise à jour. */
async function pagePublique(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), DELAI_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'text/html' } });
    return r.ok ? (await r.text()).slice(0, 1500000) : '';
  } catch { return ''; } finally { clearTimeout(t); }
}

/** Ce que la page montre de sa date de modification (lu dans le HTML public). */
function affichageDate(html) {
  if (!html) return { lu: false };
  const corps = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ');
  const texte = corps.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const date = '(?:\\d{1,2}(?:er)?\\s+[a-zéûè]+\\s+\\d{4}|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}|\\d{4}-\\d{2}-\\d{2})';
  const visible = new RegExp(`(?:(?:mis|mise)\\s+à\\s+jour|dernière\\s+(?:mise\\s+à\\s+jour|modification)|modifié|updated(?:\\s+on)?)\\s*(?:le|:)?\\s*${date}`, 'iu').exec(texte);
  return {
    lu: true,
    mention_visible: visible ? visible[0].trim() : undefined,
    balise_time_updated: /<time[^>]*class="[^"]*\bupdated\b/i.test(corps) || undefined,
    meta_article_modified_time: /property="article:modified_time"/i.test(html) || undefined,
    schema_date_modified: /"dateModified"/.test(html) || undefined,
  };
}

async function journaliser(db, j) {
  await db.pool.query(
    `INSERT INTO seo_wp_journal (site_id, cle, mode, simulation, post_id, type, titre, avant, apres, rapport)
     VALUES ($1, $2, $3, false, $4, $5, $6, $7, $8, $9)`,
    [j.site_id, j.cle, j.mode, j.post_id || null, j.type || null, j.titre || null,
      j.avant === undefined ? null : JSON.stringify(j.avant), j.apres === undefined ? null : JSON.stringify(j.apres), JSON.stringify(j.rapport || {})]);
}

async function parLots(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

// ---------------------------------------------------------------------------------------------- 1. liens

/**
 * Expression qui trouve une adresse du site dans du contenu brut, sous toutes ses formes : absolue (http, https,
 * //, avec ou sans www) ou relative, avec ou sans barre finale, barres échappées en JSON (\/) comprises.
 * Groupes : 1 = préfixe hôte éventuel, 2 = barre finale éventuelle.
 */
function motifAdresse(chemin, hote) {
  const B = '\\\\?/';
  const parts = chemin.replace(/^\/+|\/+$/g, '').split('/').map(echapperRe);
  const host = `(?:www\\.)?${echapperRe(hote)}(?::\\d+)?`;
  return new RegExp(`(?<=^|["'(=\\s>\\[,])((?:https?:)?${B}${B}${host})?${B}${parts.join(B)}(${B})?(?=["'#?\\s<>)\\]\\\\,]|$)`, 'gi');
}

function remplacerAdresses(contenu, re, nouvelle, ctx) {
  const n = new URL(nouvelle);
  const extraits = [];
  let k = 0;
  const sortie = contenu.replace(re, (tout, prefixe, finale, pos) => {
    const echappe = tout.includes('\\/');
    let rep = prefixe ? `${n.origin}${n.pathname}` : n.pathname;
    if (echappe) rep = rep.replace(/\//g, '\\/');
    k++;
    extraits.push({ pos, ancien: tout, nouveau: rep });
    return rep;
  });
  return { sortie, n: k, extraits };
}

const contexteTexte = (s, pos, long, ajout = 70) => s.slice(Math.max(0, pos - ajout), pos + long + ajout).replace(/\s+/g, ' ');

/** Change le texte des liens <a href="ancienne"> d'une page. */
function changerAncres(contenu, re, ancre) {
  const changes = [];
  const sortie = contenu.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (tout, attrs, interieur) => {
    const href = /\bhref\s*=\s*(["'])(.*?)\1/i.exec(attrs);
    re.lastIndex = 0;
    if (!href || !re.test(` ${href[2]}`.replace(/^ /, '"'))) return tout;
    const nouveau = echapperHtml(ancre);
    changes.push({ avant: interieur.replace(/<[^>]+>/g, '').trim(), apres: ancre });
    return `<a${attrs}>${nouveau}</a>`;
  });
  re.lastIndex = 0;
  return { sortie, changes };
}

async function repointerLiens(db, { site_id: siteId, ancienne_url: ancienne, nouvelle_url: nouvelle, ancres = {}, simulation = true } = {}) {
  const { r, bloque, avert, action, fin } = nouveauRapport('repointer_liens', siteId, simulation);
  let ctx;
  try { ctx = await contexte(db, siteId); } catch (e) { bloque('site', e.message, e.code); return fin(); }
  const { wp, base } = ctx;
  const aU = adresseDuSite(ancienne, ctx), nU = adresseDuSite(nouvelle, ctx);
  if (!aU) bloque('ancienne_url', `« ${ancienne} » n'est pas une adresse de ${ctx.hote}`);
  if (!nU) bloque('nouvelle_url', `« ${nouvelle} » n'est pas une adresse de ${ctx.hote}`);
  if (!aU || !nU) return fin();
  r.ancienne_url = aU.toString(); r.nouvelle_url = nU.toString();
  if (cle(aU, base) === cle(nU, base)) { bloque('adresses', 'ancienne et nouvelle adresse identiques'); return fin(); }
  if (estAccueil(aU)) { bloque('ancienne_url', "l'accueil ne se repointe pas"); return fin(); }
  let chemin = aU.pathname;
  try { chemin = decodeURIComponent(chemin); } catch { /* tel quel */ }
  const chem = chemin.replace(/\/+$/, '');
  if (chem.length < 4) { bloque('ancienne_url', 'chemin trop court pour une recherche sûre'); return fin(); }

  const sn = await sonder(r.nouvelle_url);
  r.etat_nouvelle = sn;
  if (sn.code !== 200) bloque('nouvelle_url', sn.code === 404 ? "la nouvelle adresse n'existe pas encore (HTTP 404) : les liens repointés seraient cassés ; la publier d'abord" : sn.code >= 300 && sn.code < 400 ? `la nouvelle adresse redirige (HTTP ${sn.code} vers ${sn.vers}) : viser l'adresse finale` : `la nouvelle adresse répond ${sn.code || sn.erreur} (200 attendu)`);

  // recherche dans le contenu brut de tout ce qui est publié, les métadonnées et les réglages
  const slug = chem.split('/').pop();
  const motifs = [...new Set([chem, encodeURI(chem), slug].filter((x) => x.length >= 4))];
  let trouve;
  try { trouve = await wp('outils-site/v1/chercher', { methode: 'POST', corps: { motifs } }); } catch (e) { bloque('recherche', routeAbsente(e, siteId), e.code); return fin(); }
  if (trouve.tronque) avert('recherche', 'plus de 500 contenus trouvés : seuls les 500 premiers sont traités');
  const re = motifAdresse(chemin, ctx.hote);
  const ancresParCle = new Map(Object.entries(ancres || {}).map(([u, a]) => [cle(u, base), { url: u, ancre: String(a), vue: false }]));
  const pages = [];
  for (const c of trouve.contenus || []) {
    re.lastIndex = 0;
    const { sortie, n, extraits } = remplacerAdresses(c.contenu, re, r.nouvelle_url, ctx);
    if (!n) continue;
    const a = ancresParCle.get(cle(c.lien, base));
    let final = sortie, ancresChangees = [];
    if (a) {
      a.vue = true;
      const ch = changerAncres(c.contenu, motifAdresse(chemin, ctx.hote), a.ancre);
      if (!ch.changes.length) bloque('ancres', `${c.lien} : l'adresse y figure, mais pas dans un lien <a> dont changer le texte`);
      else {
        if (ch.changes.length > 1) avert('ancres', `${c.lien} : ${ch.changes.length} liens vers l'ancienne adresse, tous reçoivent la nouvelle ancre`);
        re.lastIndex = 0;
        final = remplacerAdresses(ch.sortie, re, r.nouvelle_url, ctx).sortie;
        ancresChangees = ch.changes;
      }
    }
    if (!c.rest_base) bloque('liens', `#${c.id} (${c.type}) n'est pas modifiable par l'API REST`);
    pages.push({
      id: c.id, type: c.type, rest_base: c.rest_base, titre: c.titre, lien: c.lien, modifie_le: c.modifie,
      occurrences: n,
      extraits: extraits.map((x) => ({ avant: contexteTexte(c.contenu, x.pos, x.ancien.length), apres: contexteTexte(c.contenu.slice(0, x.pos) + x.nouveau + c.contenu.slice(x.pos + x.ancien.length), x.pos, x.nouveau.length) })),
      ancres: ancresChangees.length ? ancresChangees : undefined,
      _final: final,
    });
  }
  for (const a of ancresParCle.values()) if (!a.vue) bloque('ancres', `${a.url} : aucun lien vers l'ancienne adresse dans ce contenu (ou contenu non publié)`);

  // date de modification : WordPress la met à jour à chaque enregistrement ; ce que la page en montre
  const affichages = await parLots(pages.slice(0, 30), 4, (p) => pagePublique(p.lien).then(affichageDate));
  pages.forEach((p, i) => {
    const aff = affichages[i];
    p.date_modification = {
      wordpress: `passera de ${p.modifie_le} (GMT) à la date de l'écriture`,
      ...(aff ? { page: aff.lu ? (aff.mention_visible ? `date de mise à jour visible (« ${aff.mention_visible} ») : elle changera à l'écran` : `pas de date de mise à jour visible dans le texte de la page${[aff.balise_time_updated && 'time.updated', aff.meta_article_modified_time && 'article:modified_time', aff.schema_date_modified && 'dateModified (schéma)'].filter(Boolean).length ? ` ; elle change dans le code : ${[aff.balise_time_updated && 'time.updated', aff.meta_article_modified_time && 'article:modified_time', aff.schema_date_modified && 'dateModified (schéma)'].filter(Boolean).join(', ')}` : ''}`) : 'page publique illisible' } : { page: 'non contrôlée (plus de 30 pages)' }),
    };
  });

  // métadonnées et réglages : jamais modifiés, signalés
  const reAvecSlug = new RegExp(echapperRe(slug), 'i');
  r.metadonnees = (trouve.metas || []).map((m) => ({
    post_id: m.post_id, type: m.type, statut: m.statut, cle: m.cle,
    note: m.cle === '_wp_old_slug' ? "attendue : ancien slug gardé par WordPress pour sa redirection automatique" : m.cle === '_menu_item_url' ? 'lien de menu personnalisé : à changer dans Apparence > Menus' : undefined,
    extrait: m.extrait && m.extrait.length > 160 ? `${m.extrait.slice(0, 160)}…` : m.extrait,
  })).filter((m) => reAvecSlug.test(m.extrait || ''));
  if (r.metadonnees.some((m) => m.cle !== '_wp_old_slug')) avert('métadonnées', `${r.metadonnees.filter((m) => m.cle !== '_wp_old_slug').length} métadonnée(s) contiennent l'ancienne adresse : non modifiées (voir metadonnees)`);
  if ((trouve.reglages || []).length) { r.reglages = trouve.reglages; avert('réglages', `l'ancienne adresse figure aussi dans des réglages du site (${trouve.reglages.join(', ')}) : non modifiés (widgets, menus, thème…)`); }
  if ((trouve.descriptions_de_termes || []).length) { r.descriptions_de_termes = trouve.descriptions_de_termes; avert('termes', "l'ancienne adresse figure dans des descriptions de catégories ou d'étiquettes : non modifiées"); }

  r.pages = pages.map(({ _final, rest_base, ...p }) => p);
  r.resume = { pages: pages.length, liens: pages.reduce((s, p) => s + p.occurrences, 0), ancres: pages.reduce((s, p) => s + (p.ancres ? p.ancres.length : 0), 0) };
  if (!pages.length) action({ quoi: 'rien à faire', detail: "aucun contenu publié ne contient l'ancienne adresse" });
  for (const p of pages) action({ quoi: `modifier #${p.id}`, titre: p.titre, liens: p.occurrences, ancres: p.ancres ? p.ancres.length : undefined });
  r.cle = sha256(`${siteId}|liens|${cle(aU, base)}|${cle(nU, base)}`);
  if (r.erreurs.length || simulation) return fin();

  // ================= écriture : contenu relu juste avant, remplacement refait dessus =================
  r.ecrits = [];
  for (const p of pages) {
    try {
      const frais = await wp(`wp/v2/${p.rest_base}/${p.id}`, { params: { context: 'edit', _fields: 'id,status,content,modified_gmt' } });
      if (frais.status !== 'publish') { bloque('écriture', `#${p.id} n'est plus publié (${frais.status}) : laissé tel quel`); continue; }
      const brut = frais.content.raw;
      re.lastIndex = 0;
      let nouveau = brut;
      const a = ancresParCle.get(cle(p.lien, base));
      if (a) nouveau = changerAncres(nouveau, motifAdresse(chemin, ctx.hote), a.ancre).sortie;
      re.lastIndex = 0;
      nouveau = remplacerAdresses(nouveau, re, r.nouvelle_url, ctx).sortie;
      if (nouveau === brut) { avert('écriture', `#${p.id} : déjà à jour`); continue; }
      const maj = await wp(`wp/v2/${p.rest_base}/${p.id}`, { methode: 'POST', corps: { content: nouveau } });
      const verif = await wp(`wp/v2/${p.rest_base}/${p.id}`, { params: { context: 'edit', _fields: 'content,modified_gmt,status' } });
      re.lastIndex = 0;
      const restants = (verif.content.raw.match(re) || []).length;
      if (restants) bloque('vérification', `#${p.id} : ${restants} occurrence(s) de l'ancienne adresse encore présentes`);
      r.ecrit = true;
      r.ecrits.push({ id: p.id, statut: verif.status, modifie_le: { avant: frais.modified_gmt, apres: verif.modified_gmt } });
      await journaliser(db, { site_id: siteId, cle: r.cle, mode: 'liens', post_id: p.id, type: p.type, titre: p.titre,
        avant: { content: brut, modified_gmt: frais.modified_gmt }, apres: { content: verif.content.raw, modified_gmt: (maj && maj.modified_gmt) || verif.modified_gmt },
        rapport: { ancienne_url: r.ancienne_url, nouvelle_url: r.nouvelle_url, occurrences: p.occurrences, ancres: p.ancres } });
    } catch (e) { bloque('écriture', `#${p.id} : ${e.message}`, e.code || 'ecriture'); }
  }
  return fin();
}

// ---------------------------------------------------------------------------------------------- 2. étiquettes

async function poserEtiquettes(db, { site_id: siteId, urls = [], ajouter = [], retirer = [], simulation = true } = {}) {
  const { r, bloque, avert, action, fin } = nouveauRapport('poser_etiquettes', siteId, simulation);
  let ctx;
  try { ctx = await contexte(db, siteId); } catch (e) { bloque('site', e.message, e.code); return fin(); }
  const { wp, base } = ctx;
  const aj = [...new Set((ajouter || []).map(Number))], re = [...new Set((retirer || []).map(Number))];
  const liste = [...new Set((urls || []).map((u) => String(u).trim()).filter(Boolean))];
  if (!liste.length) bloque('urls', 'aucune adresse');
  if (liste.length > 50) bloque('urls', '50 adresses au plus par appel');
  if (!aj.length && !re.length) bloque('étiquettes', 'rien à ajouter ni à retirer');
  if ([...aj, ...re].some((x) => !Number.isInteger(x) || x <= 0)) bloque('étiquettes', 'identifiants numériques attendus (aucune étiquette créée ici)');
  const deux = aj.filter((x) => re.includes(x));
  if (deux.length) bloque('étiquettes', `à la fois à ajouter et à retirer : ${deux.join(', ')}`);
  for (const u of liste) if (!adresseDuSite(u, ctx)) bloque('urls', `« ${u} » n'est pas une adresse de ${ctx.hote}`);
  if (r.erreurs.length) return fin();

  let noms = new Map();
  try {
    const t = await wp('wp/v2/tags', { params: { include: [...aj, ...re], per_page: 100, _fields: 'id,name,count', hide_empty: false } });
    noms = new Map(t.map((x) => [x.id, x.name]));
  } catch (e) { bloque('étiquettes', e.message, e.code); return fin(); }
  for (const x of [...aj, ...re]) if (!noms.has(x)) bloque('étiquettes', `l'étiquette ${x} n'existe pas (aucune création ici)`);
  r.etiquettes = { ajouter: aj.map((x) => ({ id: x, nom: noms.get(x) })), retirer: re.map((x) => ({ id: x, nom: noms.get(x) })) };

  let res;
  try { res = await wp('outils-site/v1/resoudre', { methode: 'POST', corps: { urls: liste } }); } catch (e) { bloque('contenus', routeAbsente(e, siteId), e.code); return fin(); }
  const nomsDe = async (ids) => {
    const manque = ids.filter((x) => !noms.has(x));
    if (manque.length) for (const t of await wp('wp/v2/tags', { params: { include: manque, per_page: 100, _fields: 'id,name' } }).catch(() => [])) noms.set(t.id, t.name);
    return ids.map((x) => noms.get(x) || `#${x}`);
  };
  r.contenus = [];
  for (const c of res.contenus || []) {
    const ligne = { url: c.url, id: c.id || undefined, type: c.type, titre: c.titre };
    r.contenus.push(ligne);
    if (!c.id) { bloque('contenus', `${c.url} : aucun contenu à cette adresse`); continue; }
    if (c.statut !== 'publish') { bloque('contenus', `${c.url} : contenu ${c.statut}, pas publié`); continue; }
    if (!c.accepte_etiquettes) { bloque('contenus', `${c.url} : le type ${c.type} n'accepte pas les étiquettes`); continue; }
    if (!c.modifiable) { bloque('contenus', `${c.url} : le compte API ne peut pas modifier ce contenu`); continue; }
    if (cle(c.lien, base) !== cle(c.url, base)) avert('contenus', `${c.url} : l'adresse du contenu est ${c.lien}`);
    const avant = c.etiquettes || [];
    const apres = [...new Set([...avant, ...aj])].filter((x) => !re.includes(x));
    ligne.avant = await nomsDe(avant);
    ligne.apres = await nomsDe(apres);
    ligne._c = c;
    const plus = aj.filter((x) => !avant.includes(x)), moins = re.filter((x) => avant.includes(x));
    ligne.changement = plus.length || moins.length ? [...plus.map((x) => `+ ${noms.get(x)}`), ...moins.map((x) => `− ${noms.get(x)}`)].join(', ') : 'déjà en place';
    if (plus.length || moins.length) action({ quoi: `étiquettes de #${c.id}`, titre: c.titre, changement: ligne.changement });
    else action({ quoi: 'rien à faire', id: c.id, titre: c.titre });
  }
  r.date_modification = "inchangée : les étiquettes sont posées sans réenregistrer le contenu (la date de modification affichée ne bouge pas)";
  r.cle = sha256(`${siteId}|etiquettes|${liste.map((u) => cle(u, base)).sort().join(',')}|+${aj.sort().join(',')}|-${re.sort().join(',')}`);
  const fini = () => { for (const l of r.contenus) delete l._c; return fin(); };
  if (r.erreurs.length || simulation) return fini();

  // ================= écriture =================
  for (const l of r.contenus) {
    if (!l._c || l.changement === 'déjà en place') continue;
    try {
      const j = await wp('outils-site/v1/etiquettes', { methode: 'POST', corps: { id: l._c.id, ajouter: aj, retirer: re } });
      l.apres = await nomsDe(j.apres);
      l.date_modification = j.modifie === l._c.modifie ? 'inchangée' : `changée (${l._c.modifie} → ${j.modifie})`;
      r.ecrit = true;
      await journaliser(db, { site_id: siteId, cle: r.cle, mode: 'etiquettes', post_id: l._c.id, type: l._c.type, titre: l._c.titre,
        avant: { etiquettes: j.avant }, apres: { etiquettes: j.apres, modified_gmt: j.modifie }, rapport: { ajouter: aj, retirer: re } });
    } catch (e) { bloque('écriture', `#${l._c.id} : ${routeAbsente(e, siteId)}`, e.code || 'ecriture'); }
  }
  return fini();
}

// ---------------------------------------------------------------------------------------------- 3. média

const CHAMPS_MEDIA = { alt: 'alt_text', legende: 'caption', titre: 'title', description: 'description' };
const brutDe = (v) => (v && typeof v === 'object' ? (v.raw !== undefined ? v.raw : v.rendered) : v) || '';

async function modifierMedia(db, { site_id: siteId, media, simulation = true, ...valeurs } = {}) {
  const { r, bloque, avert, action, fin } = nouveauRapport('modifier_media', siteId, simulation);
  let ctx;
  try { ctx = await contexte(db, siteId); } catch (e) { bloque('site', e.message, e.code); return fin(); }
  const { wp } = ctx;
  const voulus = Object.keys(CHAMPS_MEDIA).filter((k) => valeurs[k] !== undefined && valeurs[k] !== null);
  if (!voulus.length) bloque('champs', 'rien à modifier (alt, legende, titre ou description)');
  if (media === undefined || media === null || String(media).trim() === '') bloque('media', 'identifiant ou adresse du média attendu');
  const estId = /^\d+$/.test(String(media).trim());
  if (!estId && media && !adresseDuSite(media, ctx)) bloque('media', `« ${media} » n'est pas une adresse de ${ctx.hote}`);
  if (r.erreurs.length) return fin();

  let m;
  try { m = ((await wp('outils-site/v1/resoudre', { methode: 'POST', corps: { medias: [String(media).trim()] } })).medias || [])[0]; } catch (e) { bloque('média', routeAbsente(e, siteId), e.code); return fin(); }
  if (!m || !m.id) { bloque('média', `aucun fichier de la médiathèque ne correspond à « ${media} »`); return fin(); }
  if (!m.modifiable) { bloque('média', `le compte API ne peut pas modifier le média #${m.id}`); return fin(); }
  let avantWp;
  try { avantWp = await wp(`wp/v2/media/${m.id}`, { params: { context: 'edit', _fields: 'id,alt_text,caption,title,description,source_url,mime_type' } }); } catch (e) { bloque('média', e.message, e.code); return fin(); }
  r.media = { id: m.id, url: avantWp.source_url, type: avantWp.mime_type };
  const avant = { alt: avantWp.alt_text || '', legende: brutDe(avantWp.caption), titre: brutDe(avantWp.title), description: brutDe(avantWp.description) };
  r.champs = {};
  const corps = {};
  for (const k of voulus) {
    const v = String(valeurs[k]);
    r.champs[k] = { avant: avant[k], apres: v, change: v !== avant[k] };
    if (v !== avant[k]) corps[CHAMPS_MEDIA[k]] = v;
  }
  if (!Object.keys(corps).length) action({ quoi: 'rien à faire', detail: 'valeurs déjà en place' });
  else action({ quoi: `modifier le média #${m.id}`, champs: Object.keys(r.champs).filter((k) => r.champs[k].change) });

  // l'alt : contenus qui insèrent l'image avec un alt écrit en dur (l'image à la une, elle, suit la médiathèque)
  if (voulus.includes('alt')) {
    try {
      const motifs = [`wp-image-${m.id}`, m.base].filter((x) => x && x.length >= 4);
      const t = await wp('outils-site/v1/chercher', { methode: 'POST', corps: { motifs } });
      const reBase = m.base ? new RegExp(`/${echapperRe(m.base)}(?:-\\d+x\\d+|-scaled)?\\.[a-z0-9]+`, 'i') : null;
      r.insertions = [];
      for (const c of t.contenus || []) {
        const alts = [];
        for (const [img] of c.contenu.matchAll(/<img\b[^>]*>/gi)) {
          const cls = /\bclass\s*=\s*"([^"]*)"/i.exec(img), src = /\bsrc\s*=\s*"([^"]*)"/i.exec(img);
          const lui = (cls && new RegExp(`\\bwp-image-${m.id}\\b`).test(cls[1])) || (src && reBase && reBase.test(src[1]));
          if (!lui) continue;
          const alt = /\balt\s*=\s*"([^"]*)"/i.exec(img);
          alts.push(alt ? alt[1].replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&') : null);
        }
        if (!alts.length) continue;
        r.insertions.push({ id: c.id, type: c.type, titre: c.titre, lien: c.lien, alts_en_dur: alts, ancien_alt_en_dur: alts.some((a) => a !== null && a === avant.alt) || undefined });
      }
      const durs = r.insertions.filter((x) => x.ancien_alt_en_dur);
      if (durs.length) avert('alt', `${durs.length} contenu(s) insèrent cette image avec l'ancien alt écrit en dur : ils garderont l'ancien texte (${durs.map((x) => `#${x.id}`).join(', ')}) ; les modifier par un brouillon ou une copie de travail`);
      r.note_alt = "les images à la une et les blocs qui lisent la médiathèque prennent le nouvel alt ; un alt écrit dans le contenu ne change pas";
    } catch (e) { avert('alt', `recherche des insertions impossible : ${routeAbsente(e, siteId)}`); }
  }
  r.cle = sha256(`${siteId}|media|${m.id}`);
  if (r.erreurs.length || simulation || !Object.keys(corps).length) return fin();

  // ================= écriture =================
  try {
    await wp(`wp/v2/media/${m.id}`, { methode: 'POST', corps });
    const apresWp = await wp(`wp/v2/media/${m.id}`, { params: { context: 'edit', _fields: 'id,alt_text,caption,title,description' } });
    const apres = { alt: apresWp.alt_text || '', legende: brutDe(apresWp.caption), titre: brutDe(apresWp.title), description: brutDe(apresWp.description) };
    for (const k of voulus) if (apres[k] !== String(valeurs[k])) bloque('vérification', `${k} : « ${apres[k]} » relu au lieu de « ${valeurs[k]} »`);
    r.ecrit = true;
    await journaliser(db, { site_id: siteId, cle: r.cle, mode: 'media', post_id: m.id, type: 'attachment', titre: avant.titre || r.media.url,
      avant: Object.fromEntries(voulus.map((k) => [k, avant[k]])), apres: Object.fromEntries(voulus.map((k) => [k, apres[k]])), rapport: { insertions: r.insertions } });
    return fin({ apres: Object.fromEntries(voulus.map((k) => [k, apres[k]])) });
  } catch (e) { bloque('écriture', e.message, e.code || 'ecriture'); return fin(); }
}

module.exports = { repointerLiens, poserEtiquettes, modifierMedia, motifAdresse, remplacerAdresses, changerAncres, affichageDate, cle, sonder };
