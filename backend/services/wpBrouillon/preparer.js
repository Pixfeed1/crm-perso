// prepare_draft : prépare un brouillon WordPress complet à partir d'un dépôt (manifeste-wp.json + contenu
// en blocs + fichiers). Ne publie jamais. simulation=true : tous les contrôles, aucune écriture.
// Relecture complète d'abord (relecture.js) : faits vérifiés sur le web, langue, cohérence ; corrections sûres
// appliquées au texte, le reste signalé (rapport « relecture »). relecture=false pour s'en passer explicitement.
// Seul ce module (backend) écrit dans WordPress, avec l'utilisateur dédié du site (rôle Éditeur).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const depots = require('./depot');
const { client } = require('./wp');
const { relire } = require('./relecture');

const LIMITE_TITRE_SEO = 60;
const LIMITE_META = 135;
const CHAMPS_GERES = ['title', 'content', 'slug', 'author', 'featured_media', 'meta', 'acf', 'outils_yoast'];
const HORS_PORTEE = ['status', 'date', 'date_gmt', 'modified', 'modified_gmt', 'id', 'link', 'guid', 'type', 'generated_slug', 'permalink_template', 'password'];
const YOAST = ['titre', 'meta', 'phrase_cle', 'canonique', 'noindex', 'og_titre', 'og_description', 'og_image', 'x_titre', 'x_description', 'x_image', 'schema_page', 'schema_article', 'fil_ariane', 'pilier'];
const RE_MARQUEUR = /\{\{media:([^{}:]+):(id|url)(?::([a-z0-9_-]+))?\}\}/gi;
const longueur = (s) => Array.from(String(s || '')).length;
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
// nom de fichier transmis à WordPress : ASCII sans accents ni espaces (le titre du média garde les accents)
const nomAscii = (f) => path.basename(f).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+\./g, '.').replace(/^-+|-+$/g, '') || 'fichier';
const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/^\.\/+/, '');

/** Type MIME d'après l'extension, selon la liste des types acceptés par le site (clés « jpg|jpeg|jpe »). */
function mimeDe(nom, types) {
  const ext = path.extname(nom).slice(1).toLowerCase();
  for (const [exts, mime] of Object.entries(types || {})) if (exts.split('|').includes(ext)) return mime;
  return null;
}

async function preparer(db, { depot, simulation = true, creer_etiquettes = false, relecture = true } = {}) {
  const r = { fetched_at: new Date().toISOString(), depot, simulation, actions: [], avertissements: [], erreurs: [] };
  const bloque = (source, message, code = 'bloquant') => r.erreurs.push({ source, code, message });
  const avert = (source, message) => r.avertissements.push({ source, message });
  const action = (x) => r.actions.push(x);
  const fin = () => ({ ...r, statut: r.erreurs.length ? 'bloqué' : simulation ? 'simulation : rien écrit' : 'écrit' });

  // ---- dépôt et manifeste ----
  let d, m;
  try { d = await depots.ouvrir(db, depot); } catch (e) { bloque('dépôt', e.message, e.status || 'depot'); return fin(); }
  r.site_id = d.site_id;
  try { m = JSON.parse(fs.readFileSync(d.manifeste, 'utf8')); } catch (e) { bloque('manifeste', `manifeste-wp.json illisible : ${e.message}`); return fin(); }
  const fichierDepot = (rel) => depots.resoudre(d.dossier, path.posix.join(d.base, norm(rel)));
  if (m.site_id && Number(m.site_id) !== d.site_id) bloque('manifeste', `site_id ${m.site_id} ≠ site du dépôt (${d.site_id})`);
  const mode = m.mode || 'nouveau';
  if (!['nouveau', 'mise_a_jour'].includes(mode)) bloque('manifeste', `mode « ${m.mode} » : nouveau ou mise_a_jour attendu`);
  if (mode === 'mise_a_jour' && !m.url_origine) bloque('manifeste', 'url_origine obligatoire en mise à jour');
  if (!m.titre) bloque('manifeste', 'titre manquant');
  if (!m.contenu) bloque('manifeste', 'contenu manquant (fichier HTML en blocs)');
  if (m.statut || m.status || m.date) bloque('manifeste', 'statut et date de publication hors de portée : toujours un brouillon');
  r.mode = mode; r.titre = m.titre;

  // ---- site, accès, inventaire ----
  const { rows: s } = await db.pool.query('SELECT domain, wp_base_url, wp_auteur FROM seo_sites WHERE id = $1', [d.site_id]);
  if (!s[0]) { bloque('site', `site ${d.site_id} inconnu du CRM`); return fin(); }
  const base = String(s[0].wp_base_url || `https://${s[0].domain}`).replace(/\/+$/, '');
  let wp, inv;
  try { wp = client(d.site_id, base); } catch (e) { bloque('accès WordPress', e.message, 'config'); return fin(); }
  try { inv = await wp('outils-site/v1/inventaire'); } catch (e) {
    bloque('route de rédaction', e.code === 404 ? 'route outils-site/v1/inventaire absente : poser le mu-plugin (node scripts/installer-redaction.js <site_id> <dossier>, dans mcp_seo/)' : e.message, e.code);
    return fin();
  }

  // ---- type de contenu et schéma REST ----
  const t = (inv.types || []).find((x) => x.type === m.type || x.rest_base === m.type);
  if (!t) { bloque('type', `type « ${m.type} » inconnu (types : ${(inv.types || []).map((x) => x.type).join(', ')})`); return fin(); }
  r.type = t.type;
  const rb = t.rest_base;
  let schema = {};
  try {
    const rs = await wp(`wp/v2/${rb}`, { methode: 'OPTIONS', brut: true });
    schema = ((await rs.json()).schema || {}).properties || {};
  } catch (e) { bloque('schéma REST', e.message); return fin(); }

  // ---- auteur : le compte qui signe les articles, jamais l'utilisateur d'accès ----
  const login = s[0].wp_auteur;
  const auteur = login && (inv.auteurs || []).find((a) => a.identifiant === login);
  if (!login) bloque('auteur', "auteur des articles non réglé pour ce site dans le CRM (SEO > sites > Auteur)");
  else if (!auteur) bloque('auteur', `auteur « ${login} » introuvable parmi les comptes qui peuvent rédiger`);
  else if (login === process.env[`WP_API_USER_${d.site_id}`]) bloque('auteur', "l'auteur ne peut pas être le compte d'accès API");

  // ---- champs, taxonomies, métadonnées, ACF ----
  const charge = {};
  for (const [k, v] of Object.entries(m.champs || {})) {
    if (HORS_PORTEE.includes(k)) bloque('champs', `« ${k} » est hors de portée (brouillon, date décidée par vous)`);
    else if (CHAMPS_GERES.includes(k)) bloque('champs', `« ${k} » se règle par sa clé dédiée du manifeste, pas dans champs`);
    else if (!schema[k]) bloque('champs', `« ${k} » n'est pas accepté par l'API pour le type ${t.type}`);
    else charge[k] = v;
  }
  const taxos = Object.fromEntries((inv.taxonomies || []).map((x) => [x.taxonomie, x]));
  for (const [nom, ids] of Object.entries(m.taxonomies || {})) {
    const tx = taxos[nom] || (inv.taxonomies || []).find((x) => x.rest_base === nom);
    if (!tx || !t.taxonomies.includes(tx.taxonomie)) { bloque('taxonomies', `taxonomie « ${nom} » absente du type ${t.type} (${t.taxonomies.join(', ') || 'aucune'})`); continue; }
    const voulus = [...new Set((Array.isArray(ids) ? ids : [ids]).map(Number))];
    if (voulus.some((x) => !Number.isInteger(x) || x <= 0)) { bloque('taxonomies', `${nom} : identifiants numériques existants attendus`); continue; }
    try {
      const trouves = await wp(`wp/v2/${tx.rest_base}`, { params: { include: voulus, per_page: 100, _fields: 'id,name' } });
      const absents = voulus.filter((x) => !trouves.some((y) => y.id === x));
      if (absents.length) bloque('taxonomies', `${nom} : identifiant(s) inexistant(s) ${absents.join(', ')}`);
      charge[tx.rest_base] = voulus;
      action({ quoi: 'taxonomie', taxonomie: tx.taxonomie, termes: trouves.map((y) => y.name) });
    } catch (e) { bloque('taxonomies', `${nom} : ${e.message}`); }
  }
  const aCreer = [];
  if ((m.etiquettes_a_creer || []).length) {
    const txTag = (inv.taxonomies || []).find((x) => x.taxonomie === 'post_tag');
    if (!txTag || !t.taxonomies.includes('post_tag')) bloque('étiquettes', `le type ${t.type} n'a pas d'étiquettes`);
    else for (const nom of m.etiquettes_a_creer) {
      const ex = await wp(`wp/v2/${txTag.rest_base}`, { params: { search: nom, per_page: 20, _fields: 'id,name' } }).catch(() => []);
      const meme = ex.find((y) => String(y.name).toLowerCase() === String(nom).toLowerCase());
      if (meme) { charge[txTag.rest_base] = [...new Set([...(charge[txTag.rest_base] || []), meme.id])]; avert('étiquettes', `« ${nom} » existe déjà (#${meme.id}) : réutilisée`); }
      else if (!creer_etiquettes) avert('étiquettes', `« ${nom} » non créée : creer_etiquettes=false`);
      else { aCreer.push(nom); action({ quoi: 'créer étiquette', nom }); }
    }
  }
  if (m.meta && Object.keys(m.meta).length) {
    const props = (schema.meta && schema.meta.properties) || {};
    for (const k of Object.keys(m.meta)) if (!props[k]) bloque('métadonnées', `« ${k} » n'est pas une métadonnée exposée à l'API pour ${t.type}`);
    charge.meta = m.meta;
  }
  if (m.acf && Object.keys(m.acf).length) {
    if (!schema.acf) bloque('ACF', inv.acf_actif ? `champs ACF non exposés à l'API pour ${t.type} (réglage « Show in REST API » du groupe)` : 'ACF n\'est pas actif sur ce site');
    else {
      const props = schema.acf.properties || {};
      for (const k of Object.keys(m.acf)) if (Object.keys(props).length && !props[k]) bloque('ACF', `champ ACF « ${k} » inconnu pour ${t.type}`);
      charge.acf = m.acf;
    }
  }

  // ---- relecture complète (un Claude indépendant) : avant tous les contrôles, qui portent sur le texte corrigé ----
  let contenuRelu = null;
  const titreDepose = m.titre;                                                   // repère stable du brouillon, avant relecture
  if (!relecture) avert('relecture', 'relecture désactivée pour cet appel (relecture=false) : faits et langue non vérifiés');
  else if (r.erreurs.length) avert('relecture', 'relecture non lancée tant que les erreurs ci-dessous ne sont pas corrigées');
  else if (m.contenu) {
    try {
      const y = m.yoast || {};
      const res = await relire({ domaine: s[0].domain, dossier: d.dossier, champs: { titre: m.titre, titre_seo: y.titre, meta: y.meta, contenu: fs.readFileSync(fichierDepot(m.contenu), 'utf8') } });
      contenuRelu = res.champs.contenu;
      m.titre = res.champs.titre; r.titre = m.titre;
      if (m.yoast && y.titre !== undefined) m.yoast.titre = res.champs.titre_seo;
      if (m.yoast && y.meta !== undefined) m.yoast.meta = res.champs.meta;
      r.relecture = res.rapport;
      action({ quoi: 'relecture', corrections: res.rapport.corrections_appliquees.length, signalements: (res.rapport.signalements || []).length });
      if (res.rapport.signalements) avert('relecture', `${res.rapport.signalements.length} point(s) signalé(s) sans correction (style, structure, cohérence…) : voir relecture.signalements`);
      if (res.rapport.corrections_non_appliquees) avert('relecture', `${res.rapport.corrections_non_appliquees.length} correction(s) proposée(s) mais non appliquée(s) : voir relecture.corrections_non_appliquees`);
    } catch (e) { bloque('relecture', `relecture impossible : ${e.message} (relancer, ou relecture=false pour préparer sans relecture)`, e.code || 'relecture'); }
  }

  // ---- Yoast ----
  const yoast = {};
  for (const [k, v] of Object.entries(m.yoast || {})) {
    if (!YOAST.includes(k)) bloque('Yoast', `champ « ${k} » inconnu (${YOAST.join(', ')})`);
    else yoast[k] = v;
  }
  if (yoast.titre && longueur(yoast.titre) > LIMITE_TITRE_SEO) bloque('Yoast', `titre SEO de ${longueur(yoast.titre)} caractères (${LIMITE_TITRE_SEO} au plus)`);
  if (yoast.meta && longueur(yoast.meta) > LIMITE_META) bloque('Yoast', `méta de ${longueur(yoast.meta)} caractères (${LIMITE_META} au plus)`);
  if (Object.keys(m.yoast || {}).length && !inv.yoast_actif) avert('Yoast', "Yoast n'est pas actif : les champs seront enregistrés mais sans effet");

  // ---- fichiers ----
  const fichiers = new Map();                                                     // chemin relatif -> infos
  const declarer = (f) => {
    const rel = norm(f.fichier);
    if (fichiers.has(rel)) return fichiers.get(rel);
    const x = { fichier: rel, alt: f.alt, legende: f.legende, titre: f.titre, description: f.description };
    fichiers.set(rel, x);
    return x;
  };
  for (const f of m.fichiers || []) { if (!f || !f.fichier) bloque('fichiers', 'entrée sans « fichier »'); else declarer(f); }
  if (m.image_a_la_une) declarer({ fichier: m.image_a_la_une });
  for (const k of ['og_image', 'x_image']) if (yoast[k] && !/^https?:\/\//.test(yoast[k])) declarer({ fichier: yoast[k] });
  const limite = Number(inv.limite_envoi) || 0;
  for (const x of fichiers.values()) {
    try {
      const abs = fichierDepot(x.fichier);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) { bloque('fichiers', `${x.fichier} absent du dépôt`); continue; }
      x.abs = abs; x.octets = fs.statSync(abs).size;
      x.mime = mimeDe(x.fichier, inv.types_fichiers);
      if (!x.mime) bloque('fichiers', `${x.fichier} : type de fichier non accepté par le site`);
      if (limite && x.octets > limite) bloque('fichiers', `${x.fichier} : ${(x.octets / 1048576).toFixed(1)} Mo, plus que la limite d'envoi du serveur (${(limite / 1048576).toFixed(1)} Mo)`);
      if (x.mime && x.mime.startsWith('image/')) {
        if (!x.alt || !String(x.alt).trim()) bloque('fichiers', `${x.fichier} : texte alternatif (alt) manquant`);
        if (!x.legende) avert('fichiers', `${x.fichier} : pas de légende`);
      }
      x.sha = sha256(fs.readFileSync(abs));
      const ex = await wp('outils-site/v1/media-empreinte', { params: { sha: x.sha } });
      if (ex && ex.id) { x.id = ex.id; x.url = ex.url; x.reutilise = true; }
      action({ quoi: x.reutilise ? 'réutiliser le média' : 'téléverser', fichier: x.fichier, ...(x.reutilise ? { id: x.id } : { octets: x.octets, type: x.mime }) });
    } catch (e) { bloque('fichiers', `${x.fichier} : ${e.message}`); }
  }
  if (m.image_a_la_une) action({ quoi: 'image à la une', fichier: norm(m.image_a_la_une) });

  // ---- contenu : marqueurs, puis vérification par le site (blocs, shortcodes, intégrations, images) ----
  let contenu = '';
  try { contenu = contenuRelu !== null ? contenuRelu : fs.readFileSync(fichierDepot(m.contenu), 'utf8'); } catch (e) { bloque('contenu', `${m.contenu} : ${e.message}`); }
  const marqueurs = [...contenu.matchAll(RE_MARQUEUR)];
  for (const mk of marqueurs) if (!fichiers.has(norm(mk[1]))) bloque('marqueurs', `${mk[0]} : fichier non déclaré dans « fichiers »`);
  const restes = (contenu.replace(RE_MARQUEUR, '').match(/\{\{media:[^}]*\}\}/g) || []);
  for (const x of restes) bloque('marqueurs', `${x} : forme attendue {{media:chemin:id}}, {{media:chemin:url}} ou {{media:chemin:url:taille}}`);
  const remplacer = (texte, provisoire) => texte.replace(RE_MARQUEUR, (tout, f, quoi, taille) => {
    const x = fichiers.get(norm(f));
    if (!x) return tout;
    if (quoi === 'id') return String(x.id || 0);
    if (provisoire && !x.url) return `https://exemple.invalid/media/${encodeURI(x.fichier)}`;
    if (taille) {
      const t2 = x.tailles && x.tailles[taille];
      if (!t2 && !provisoire) avert('marqueurs', `${f} : taille « ${taille} » non générée par le site, adresse du fichier d'origine utilisée`);
      return t2 || x.url;
    }
    return x.url;
  });
  if (contenu) {
    try {
      const v = await wp('outils-site/v1/verifier', { methode: 'POST', corps: { contenu: remplacer(contenu, true) } });
      for (const b of v.blocs.inconnus || []) bloque('blocs', `bloc « ${b} » non enregistré sur le site`);
      for (const sc of v.shortcodes.inconnus || []) bloque('shortcodes', `shortcode [${sc}] inconnu du site`);
      for (const e of v.embeds || []) if (!e.fournisseur) avert('intégrations', `${e.url} : WordPress ne sait pas l'intégrer (affichée comme simple lien)`);
      (v.images || []).forEach((im, i) => {
        if (!im.alt) bloque('images', `image n° ${i + 1} du contenu sans texte alternatif (alt)`);
        if (!im.legende) avert('images', `image n° ${i + 1} du contenu sans légende`);
      });
      r.blocs = v.blocs.utilises;
      r.integrations = (v.embeds || []).map((e) => ({ url: e.url, fournisseur: e.fournisseur || 'aucun' }));
    } catch (e) { bloque('vérification du contenu', e.message); }
  }

  // ---- cible : même brouillon d'un appel à l'autre ; slug libre ----
  const repere = mode === 'mise_a_jour' ? String(m.url_origine).replace(/[?#].*$/, '').replace(/\/+$/, '') : (m.slug || titreDepose);
  const cle = sha256(`${d.site_id}|${t.type}|${mode}|${repere}`);
  let cibleId = null, original = null;
  const { rows: j } = await db.pool.query(
    'SELECT post_id FROM seo_wp_journal WHERE site_id = $1 AND cle = $2 AND simulation = false AND post_id IS NOT NULL ORDER BY cree_le DESC LIMIT 1', [d.site_id, cle]);
  if (j[0]) {
    const p = await wp(`wp/v2/${rb}/${j[0].post_id}`, { params: { context: 'edit', _fields: 'id,status' } }).catch(() => null);
    if (p && ['draft', 'pending', 'dp-rewrite-republish'].includes(p.status)) cibleId = p.id;
  }
  if (mode === 'mise_a_jour' && m.url_origine) {
    const slugOrig = decodeURI(new URL(m.url_origine).pathname).replace(/\/+$/, '').split('/').pop();
    const liste = await wp(`wp/v2/${rb}`, { params: { slug: slugOrig, status: 'publish', context: 'edit', _fields: 'id,slug,link,title,content,outils_yoast' } }).catch((e) => { bloque('original', e.message); return []; });
    original = liste.find((p) => p.link.replace(/\/+$/, '') === String(m.url_origine).replace(/\/+$/, ''));
    if (!original) bloque('original', `aucun contenu publié de type ${t.type} à l'adresse ${m.url_origine}`);
  }
  const slugVoulu = m.slug ? String(m.slug).toLowerCase() : null;
  if (slugVoulu && (mode === 'nouveau' || (original && slugVoulu !== original.slug))) {
    const pris = await wp(`wp/v2/${rb}`, { params: { slug: slugVoulu, status: 'any', context: 'edit', _fields: 'id' } }).catch(() => []);
    const autres = pris.filter((p) => p.id !== cibleId && (!original || p.id !== original.id));
    if (autres.length) bloque('slug', `« ${slugVoulu} » déjà pris par le contenu #${autres[0].id}`);
  }
  if (mode === 'nouveau') action({ quoi: cibleId ? `mettre à jour le brouillon #${cibleId}` : 'créer un brouillon', type: t.type, slug: slugVoulu || '(tiré du titre)' });
  else if (original) action({ quoi: cibleId ? `mettre à jour la copie de travail #${cibleId}` : `créer une copie de travail de #${original.id}`, methode: inv.rewrite_republish ? 'Rewrite & Republish (Yoast Duplicate Post)' : "copie de travail + bouton « Remplacer l'original »", nouvelle_adresse: slugVoulu && slugVoulu !== original.slug ? `${slugVoulu} (appliquée à la validation)` : undefined });
  if (Object.keys(yoast).length) action({ quoi: 'champs Yoast', champs: Object.keys(yoast) });

  r.cle = cle;
  if (r.erreurs.length || simulation) return fin();

  // ================= écriture =================
  try {
    // étiquettes demandées
    if (aCreer.length) {
      const txTag = (inv.taxonomies || []).find((x) => x.taxonomie === 'post_tag');
      for (const nom of aCreer) {
        const e = await wp(`wp/v2/${txTag.rest_base}`, { methode: 'POST', corps: { name: nom } });
        charge[txTag.rest_base] = [...new Set([...(charge[txTag.rest_base] || []), e.id])];
      }
    }
    // médias : téléversés une seule fois (empreinte gardée en métadonnée)
    for (const x of fichiers.values()) {
      if (!x.reutilise) {
        const media = await wp('wp/v2/media', { methode: 'POST', corps: fs.readFileSync(x.abs), entetes: { 'Content-Type': x.mime, 'Content-Disposition': `attachment; filename="${nomAscii(x.fichier)}"` } });
        x.id = media.id;
      }
      const maj = { meta: { outils_sha256: x.sha } };
      if (x.alt !== undefined) maj.alt_text = String(x.alt);
      if (x.legende !== undefined) maj.caption = String(x.legende);
      if (x.titre !== undefined) maj.title = String(x.titre);
      if (x.description !== undefined) maj.description = String(x.description);
      const media = await wp(`wp/v2/media/${x.id}`, { methode: 'POST', corps: maj });
      x.url = media.source_url;
      x.tailles = Object.fromEntries(Object.entries((media.media_details && media.media_details.sizes) || {}).map(([k, v]) => [k, v.source_url]));
    }
    const contenuFinal = remplacer(contenu, false);
    if (m.image_a_la_une) charge.featured_media = fichiers.get(norm(m.image_a_la_une)).id;
    for (const k of ['og_image', 'x_image']) {
      const x = yoast[k] && fichiers.get(norm(yoast[k]));
      if (x) { yoast[k] = x.url; yoast[`${k}_id`] = x.id; }
    }
    const corps = { ...charge, title: m.titre, content: contenuFinal, author: auteur.id, ...(Object.keys(yoast).length ? { outils_yoast: yoast } : {}) };

    let id, methode, avant = null;
    if (mode === 'nouveau') {
      if (cibleId) avant = await wp(`wp/v2/${rb}/${cibleId}`, { params: { context: 'edit', _fields: 'id,slug,title,content,outils_yoast,featured_media' } });
      const post = await wp(`wp/v2/${rb}${cibleId ? '/' + cibleId : ''}`, { methode: 'POST', corps: { ...corps, status: 'draft', ...(slugVoulu ? { slug: slugVoulu } : {}) } });
      id = post.id; methode = 'brouillon';
    } else {
      avant = { id: original.id, slug: original.slug, title: original.title, content: { raw: original.content && original.content.raw }, outils_yoast: original.outils_yoast };
      let copie = cibleId;
      if (!copie) {
        const c = await wp('outils-site/v1/copie-de-travail', { methode: 'POST', corps: { original: original.id, ...(slugVoulu ? { slug: slugVoulu } : {}) } });
        copie = c.id; methode = c.methode;
      } else {
        methode = 'copie existante';
        if (slugVoulu) await wp('outils-site/v1/copie-de-travail', { methode: 'POST', corps: { original: original.id, slug: slugVoulu } });
      }
      await wp(`wp/v2/${rb}/${copie}`, { methode: 'POST', corps });
      id = copie;
    }
    const apres = await wp(`wp/v2/${rb}/${id}`, { params: { context: 'edit', _fields: 'id,status,slug,link,title,outils_yoast,featured_media' } });
    const sortieFichiers = [...fichiers.values()].map((x) => ({ fichier: x.fichier, id: x.id, url: x.url, reutilise: x.reutilise || undefined }));
    const apercu = `${base}/?${t.type === 'page' ? 'page_id' : 'p'}=${id}${['post', 'page'].includes(t.type) ? '' : `&post_type=${t.type}`}&preview=true`;
    await db.pool.query(
      `INSERT INTO seo_wp_journal (site_id, depot_id, cle, mode, simulation, post_id, original_id, type, titre, fichiers, avant, apres, rapport)
       VALUES ($1, $2, $3, $4, false, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [d.site_id, d.id, cle, mode, id, original ? original.id : null, t.type, m.titre, JSON.stringify(sortieFichiers),
        avant ? JSON.stringify(avant) : null, JSON.stringify(apres), JSON.stringify({ actions: r.actions, avertissements: r.avertissements })]);
    return {
      ...fin(), id, statut_wordpress: apres.status, methode, original_id: original ? original.id : undefined,
      lien_apercu: apercu, lien_edition: `${base}/wp-admin/post.php?post=${id}&action=edit`, fichiers: sortieFichiers,
    };
  } catch (e) {
    bloque('écriture', `${e.message} (rien n'est publié ; relancer le même manifeste reprend le même brouillon)`, e.code || 'ecriture');
    return { ...fin(), fichiers: [...fichiers.values()].filter((x) => x.id).map((x) => ({ fichier: x.fichier, id: x.id, url: x.url })) };
  }
}

module.exports = { preparer, LIMITE_TITRE_SEO, LIMITE_META };
