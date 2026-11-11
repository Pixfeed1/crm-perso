// modifier_seo : titre SEO, méta description, phrase clé Yoast et titre WordPress d'un contenu publié (ou
// d'un brouillon), SANS toucher au contenu, au slug, au statut ni à la date de publication.
// - lit l'état actuel : titre WordPress, champs Yoast (outils_yoast du mu-plugin de rédaction), ce que
//   Yoast calcule (yoast_head_json) et ce que la page publique affiche hors cache (title, meta, og:title) ;
// - mêmes limites que prepare_draft : titre SEO 60 caractères, méta 135 ;
// - écrit par l'API REST uniquement title et outils_yoast { titre, meta, phrase_cle } ;
// - vérifie que le content.raw (sha256), le slug, le statut et la date de publication n'ont pas bougé,
//   puis que Yoast et la page publique affichent bien les nouvelles valeurs (le mu-plugin reconstruit
//   l'indexable Yoast après l'écriture) ; rapport avant / après, date de modification, journal du CRM.
// simulation=true par défaut. Refus clair si le type de contenu n'expose pas les champs Yoast.
const crypto = require('crypto');
const ap = require('./apresPublication');

const LIMITE_TITRE_SEO = 60;
const LIMITE_META = 135;
const CHAMPS = { titre_seo: 'titre', meta_description: 'meta', phrase_cle: 'phrase_cle' };   // nom de l'outil -> outils_yoast
const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const longueur = (s) => Array.from(String(s || '')).length;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/** title, meta description et og:title d'une page HTML. */
function balises(html) {
  const attr = (re) => { const m = re.exec(html); if (!m) return null; const c = /content=(["'])([\s\S]*?)\1/i.exec(m[0]); return c ? ap.decoder(c[2]).trim() : null; };
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return {
    title: t ? ap.decoder(t[1]).replace(/\s+/g, ' ').trim() : null,
    meta_description: attr(/<meta\b[^>]*\bname=["']description["'][^>]*>/i),
    og_title: attr(/<meta\b[^>]*\bproperty=["']og:title["'][^>]*>/i)
  };
}

async function lirePublique(url) {
  const sep = url.includes('?') ? '&' : '?';
  const html = await ap.pagePublique(`${url}${sep}crm_seo=${Date.now()}`);
  return html ? { lu: true, ...balises(html), html } : { lu: false };
}

const yoastCalcule = (it) => {
  const y = it && it.yoast_head_json;
  if (!y) return null;
  return { title: y.title ? ap.decoder(y.title) : null, meta_description: y.description ? ap.decoder(y.description) : null, og_title: y.og_title ? ap.decoder(y.og_title) : null };
};

async function modifierSeo(db, { site_id: siteId, url = null, id = null, titre_seo, meta_description, phrase_cle, titre, simulation = true } = {}) {
  const { r, bloque, avert, action, fin } = ap.nouveauRapport('modifier_seo', siteId, simulation);
  const demandes = Object.fromEntries(Object.entries({ titre_seo, meta_description, phrase_cle, titre }).filter(([, v]) => v !== undefined && v !== null));
  if (!Object.keys(demandes).length) { bloque('champs', 'rien à modifier : titre_seo, meta_description, phrase_cle ou titre'); return fin(); }
  for (const [k, v] of Object.entries(demandes)) if (typeof v !== 'string') bloque('champs', `${k} : texte attendu`);
  if (demandes.titre !== undefined && !demandes.titre.trim()) bloque('titre', 'le titre WordPress ne peut pas être vide');
  if (demandes.titre_seo !== undefined && longueur(demandes.titre_seo) > LIMITE_TITRE_SEO) bloque('titre_seo', `titre SEO de ${longueur(demandes.titre_seo)} caractères (${LIMITE_TITRE_SEO} au plus)`);
  if (demandes.meta_description !== undefined && longueur(demandes.meta_description) > LIMITE_META) bloque('meta_description', `méta de ${longueur(demandes.meta_description)} caractères (${LIMITE_META} au plus)`);
  if (/%%\w+%%/.test(demandes.titre_seo || '')) avert('titre_seo', 'le titre SEO contient des variables Yoast (%%…%%) : la longueur affichée sera différente');
  if (!url && !id) bloque('page', 'indiquer url ou id');
  if (r.erreurs.length) return fin();

  let ctx;
  try { ctx = await ap.contexte(db, siteId); } catch (e) { bloque('site', e.message, e.code); return fin(); }
  const { wp } = ctx;

  // ---- le contenu : par l'adresse (route du mu-plugin de publication) ou par son numéro ----
  let page = null;
  try {
    if (url) {
      const u = ap.adresseDuSite(url, ctx);
      if (!u) { bloque('url', `« ${url} » n'est pas une adresse de ${ctx.hote}`); return fin(); }
      const p = ((await wp('outils-site/v1/resoudre', { methode: 'POST', corps: { urls: [u.toString()] } })).contenus || [])[0];
      if (!p || !p.id) { bloque('page', `aucun contenu à l'adresse ${u}`); return fin(); }
      page = { id: p.id, type: p.type, rest_base: p.rest_base, modifiable: p.modifiable };
    } else {
      const inv = await wp('outils-site/v1/inventaire');
      for (const t of inv.types || []) {
        const x = await wp(`wp/v2/${t.rest_base}/${Number(id)}`, { params: { context: 'edit', _fields: 'id,type' } }).catch(() => null);
        if (x && x.id) { page = { id: x.id, type: t.type, rest_base: t.rest_base, modifiable: true }; break; }
      }
      if (!page) { bloque('page', `aucun contenu n° ${id} modifiable par le compte API`); return fin(); }
    }
  } catch (e) { bloque('page', ap.routeAbsente(e, siteId), e.code); return fin(); }
  if (!page.rest_base || page.modifiable === false) { bloque('page', page.rest_base ? 'le compte API ne peut pas modifier ce contenu' : "type non modifiable par l'API REST"); return fin(); }

  // ---- le type expose-t-il les champs ? ----
  let props = {};
  try {
    const rs = await wp(`wp/v2/${page.rest_base}`, { methode: 'OPTIONS', brut: true });
    props = ((await rs.json()).schema || {}).properties || {};
  } catch (e) { bloque('type', `schéma de ${page.type} illisible : ${e.message}`); return fin(); }
  const yoastDemande = Object.keys(CHAMPS).some((k) => demandes[k] !== undefined);
  if (yoastDemande && !props.outils_yoast) { bloque('type', `le type « ${page.type} » n'expose pas les champs Yoast à l'API (mu-plugin de rédaction absent ou trop ancien : node scripts/installer-mu.js ${siteId} <dossier du site> redaction-site.php, dans mcp_seo/)`); return fin(); }
  if (demandes.titre !== undefined && !props.title) { bloque('type', `le type « ${page.type} » n'a pas de titre modifiable`); return fin(); }

  // ---- état actuel ----
  const CHAMPS_LUS = 'id,type,status,slug,link,date_gmt,modified_gmt,title,content,outils_yoast,yoast_head_json';
  let avant;
  try { avant = await wp(`wp/v2/${page.rest_base}/${page.id}`, { params: { context: 'edit', _fields: CHAMPS_LUS } }); } catch (e) { bloque('page', e.message, e.code); return fin(); }
  if (avant.status === 'trash') { bloque('page', 'contenu à la corbeille'); return fin(); }
  const yo = avant.outils_yoast || {};
  const publie = avant.status === 'publish';
  const publique = publie ? await lirePublique(avant.link) : { lu: false, raison: `contenu ${avant.status} : pas de page publique` };
  r.page = { id: avant.id, type: page.type, statut: avant.status, lien: avant.link, slug: avant.slug };
  r.avant = {
    titre: avant.title && avant.title.raw,
    titre_seo: yo.titre || '', meta_description: yo.meta || '', phrase_cle: yo.phrase_cle || '',
    yoast_calcule: yoastCalcule(avant),
    page_publique: publique.lu ? { title: publique.title, meta_description: publique.meta_description, og_title: publique.og_title } : (publique.raison || 'page publique illisible'),
    contenu_sha256: sha256(avant.content && avant.content.raw), contenu_longueur: longueur(avant.content && avant.content.raw)
  };
  if (yo.og_titre && demandes.titre_seo !== undefined) avert('og:title', `un titre Open Graph propre est réglé (« ${yo.og_titre} ») : og:title ne suivra pas le titre SEO`);
  if (!r.avant.titre_seo && demandes.titre_seo === undefined && demandes.titre !== undefined) avert('titre', 'pas de titre SEO réglé : le titre affiché par Yoast suit le titre WordPress');

  // ---- plan ----
  const apres = {
    titre: demandes.titre !== undefined ? demandes.titre : r.avant.titre,
    titre_seo: demandes.titre_seo !== undefined ? demandes.titre_seo : r.avant.titre_seo,
    meta_description: demandes.meta_description !== undefined ? demandes.meta_description : r.avant.meta_description,
    phrase_cle: demandes.phrase_cle !== undefined ? demandes.phrase_cle : r.avant.phrase_cle
  };
  const changes = Object.keys(demandes).filter((k) => String(apres[k]).trim() !== String(r.avant[k] || '').trim());
  if (!changes.length) { bloque('champs', 'rien à changer : les valeurs demandées sont déjà en place'); return fin(); }
  r.apres_prevu = Object.fromEntries(changes.map((k) => [k, apres[k]]));
  for (const k of changes) action({ quoi: `modifier ${k}`, avant: r.avant[k] || '(vide)', apres: apres[k] || '(vide : retiré)', longueur: longueur(apres[k]) });
  for (const k of ['titre_seo', 'meta_description']) if (changes.includes(k) && !apres[k]) avert(k, `${k} vidé : Yoast reprendra sa valeur par défaut (modèle du type de contenu)`);
  r.date_modification = { wordpress: ['publish', 'future', 'private'].includes(avant.status)
    ? `passera de ${avant.modified_gmt} (GMT) à la date de l'écriture ; la date de publication (${avant.date_gmt} GMT) ne change pas`
    : `passera de ${avant.modified_gmt} (GMT) à la date de l'écriture ; contenu ${avant.status} : pas encore de date de publication fixée (WordPress la recale à chaque enregistrement)` };
  if (publique.lu) {
    const aff = ap.affichageDate(publique.html);
    r.date_modification.page = aff.mention_visible ? `date de mise à jour visible (« ${aff.mention_visible} ») : elle changera à l'écran` : 'pas de date de mise à jour visible dans le texte de la page';
  }
  r.cle = sha256(`${siteId}|seo|${page.id}|${JSON.stringify(r.apres_prevu)}`);
  if (simulation) return fin();

  // ================= écriture : uniquement title et outils_yoast =================
  try {
    const corps = {};
    const yoast = {};
    for (const [k, cle] of Object.entries(CHAMPS)) if (changes.includes(k)) yoast[cle] = apres[k];
    if (Object.keys(yoast).length) corps.outils_yoast = yoast;
    if (changes.includes('titre')) corps.title = apres.titre;
    await wp(`wp/v2/${page.rest_base}/${page.id}`, { methode: 'POST', corps });
    r.ecrit = true;
    const relu = await wp(`wp/v2/${page.rest_base}/${page.id}`, { params: { context: 'edit', _fields: CHAMPS_LUS } });
    const yr = relu.outils_yoast || {};
    // Rien d'autre n'a bougé.
    const shaApres = sha256(relu.content && relu.content.raw);
    r.contenu = { sha256_avant: r.avant.contenu_sha256, sha256_apres: shaApres, identique: shaApres === r.avant.contenu_sha256 };
    if (!r.contenu.identique) bloque('vérification', 'le contenu a changé pendant l\'écriture (empreinte différente) : vérifier la page', 'controle');
    // Un brouillon n'a pas encore de date de publication fixée : WordPress la recale à chaque enregistrement.
    const dateFixee = ['publish', 'future', 'private'].includes(avant.status);
    for (const [k, lib] of [['slug', 'slug'], ['status', 'statut'], ...(dateFixee ? [['date_gmt', 'date de publication']] : [])]) if (relu[k] !== avant[k]) bloque('vérification', `${lib} changé : ${avant[k]} -> ${relu[k]}`, 'controle');
    // Valeurs enregistrées.
    const enreg = { titre: relu.title && relu.title.raw, titre_seo: yr.titre || '', meta_description: yr.meta || '', phrase_cle: yr.phrase_cle || '' };
    for (const k of changes) if (String(enreg[k]).trim() !== String(apres[k]).trim()) bloque('vérification', `${k} enregistré « ${enreg[k]} » au lieu de « ${apres[k]} » (nettoyage du site ?)`, 'controle');
    r.modifie_le = { avant: avant.modified_gmt, apres: relu.modified_gmt };
    // Ce qu'affiche Yoast (indexable), puis la page publique hors cache (quelques essais).
    r.yoast_calcule = yoastCalcule(relu);
    const voulu = { title: changes.includes('titre_seo') && apres.titre_seo && !/%%/.test(apres.titre_seo) ? apres.titre_seo : null, meta_description: changes.includes('meta_description') && apres.meta_description ? apres.meta_description : null };
    voulu.og_title = voulu.title && !yo.og_titre ? voulu.title : null;
    const conforme = (vu) => Object.entries(voulu).filter(([, v]) => v).map(([k, v]) => ({ champ: k, attendu: v, affiche: vu ? vu[k] : null, ok: !!vu && vu[k] === v }));
    if (relu.status === 'publish') {
      let pub = null, ctl = [];
      for (let essai = 0; essai < 3; essai++) {
        if (essai) await attendre(2000);
        pub = await lirePublique(relu.link);
        ctl = conforme(pub.lu ? pub : null);
        if (ctl.every((x) => x.ok)) break;
      }
      r.page_publique = pub && pub.lu ? { title: pub.title, meta_description: pub.meta_description, og_title: pub.og_title, controle: ctl } : 'page publique illisible';
      for (const x of ctl) if (!x.ok) bloque('affichage', `la page publique affiche ${x.champ} « ${x.affiche} » au lieu de « ${x.attendu} » : indexable Yoast pas à jour ou cache de page (vider le cache, ou ré-enregistrer la page dans l'éditeur)`, 'controle');
    } else {
      const ctl = conforme(r.yoast_calcule);
      r.controle_yoast = ctl;
      for (const x of ctl) if (!x.ok) bloque('affichage', `Yoast calcule ${x.champ} « ${x.affiche} » au lieu de « ${x.attendu} » (indexable pas à jour)`, 'controle');
      avert('affichage', `contenu ${relu.status} : pas de page publique, contrôle fait sur ce que Yoast calcule (yoast_head_json)`);
    }
    await ap.journaliser(db, { site_id: siteId, cle: r.cle, mode: 'seo', post_id: page.id, type: page.type, titre: enreg.titre,
      avant: { ...Object.fromEntries(changes.map((k) => [k, r.avant[k]])), modified_gmt: avant.modified_gmt, contenu_sha256: r.avant.contenu_sha256 },
      apres: { ...Object.fromEntries(changes.map((k) => [k, enreg[k]])), modified_gmt: relu.modified_gmt, contenu_sha256: shaApres },
      rapport: { page_publique: r.page_publique, yoast_calcule: r.yoast_calcule } });
  } catch (e) { bloque('écriture', e.message, e.code || 'ecriture'); }
  return fin();
}

module.exports = { modifierSeo, balises, LIMITE_TITRE_SEO, LIMITE_META };
