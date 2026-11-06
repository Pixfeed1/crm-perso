// mcp_seo/contenu.js
// get_contenu_brut : la page telle que WordPress la STOCKE (API REST, context=edit), au caractère près.
// LECTURE SEULE. title.raw, excerpt.raw, content.raw : commentaires de blocs Gutenberg, codes courts et
// HTML compris, sans rendu ni nettoyage. Longueur, nombre de blocs et empreinte sha256 de content.raw
// (celle qu'attend prepare_draft dans base_sha256 pour remplacer des passages). Découpage en morceaux
// (debut, longueur, en caractères) quand le contenu dépasse la taille d'une réponse.
// Mêmes identifiants que get_live_page (WP_API_USER_<site> / WP_API_PASSWORD_<site>), jamais renvoyés.
import crypto from 'node:crypto';
import { accesWordPress, clientWp, typesWp, verifierAcces, trouverContenu, erreurHttp, erreurReseau, hoteNu } from './live.js';

const SRC = 'API REST WordPress (context=edit) : contenu brut tel que stocké';
const MORCEAU_MAX = 60000;                      // caractères par réponse

const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
// Compte en caractères (points de code) : un emoji ou un caractère accentué composé ne se coupe jamais en deux.
const caracteres = (s) => Array.from(String(s || ''));

function analyse(raw) {
  const blocs = (raw.match(/<!--\s*wp:[a-z0-9_/-]+/gi) || []).length;
  const codes = {};
  for (const m of raw.matchAll(/\[(\/?)([a-zA-Z][\w-]*)(?=[\s\]\/])/g)) if (!m[1]) codes[m[2]] = (codes[m[2]] || 0) + 1;
  return { blocs, codes_courts: codes };
}

// Contenu par identifiant : dans le type indiqué, sinon dans tous les types de contenu (édition seulement).
async function parIdentifiant(wp, types, id, type) {
  const liste = type ? types.filter((t) => t.slug === type || t.rest_base === type) : types;
  if (type && !liste.length) throw { source: SRC, code: 400, message: `type « ${type} » inconnu (types : ${types.map((t) => t.slug).join(', ')})` };
  const essais = await Promise.all(liste.map(async (t) => {
    const r = await wp(`${t.rest_base}/${id}`, { context: 'edit' });
    if (r.ok) return { it: await r.json(), type: t, context: 'edit' };
    return null;
  }));
  return essais.find(Boolean) || null;
}

export async function getContenuBrut(pool, siteId, { url = null, id = null, type = null, debut = 0, longueur = null } = {}) {
  const sortie = { fetched_at: new Date().toISOString(), site_id: siteId, source: SRC };
  const { rows } = await pool.query('SELECT domain, wp_base_url FROM seo_sites WHERE id = $1', [siteId]);
  if (!rows[0]) return { ...sortie, erreur: `site ${siteId} inconnu du CRM (voir list_sites)` };
  const base = String(rows[0].wp_base_url || `https://${rows[0].domain}`).replace(/\/+$/, '');
  if (!url && !id) return { ...sortie, erreur: 'indiquer url ou id' };
  if (url) {
    let u;
    try { u = new URL(url); } catch { return { ...sortie, erreur: 'adresse invalide' }; }
    if (hoteNu(u.hostname) !== hoteNu(new URL(base).hostname)) return { ...sortie, erreur: `l'adresse n'appartient pas au site ${siteId} (${new URL(base).hostname})` };
  }
  const acces = accesWordPress(siteId);
  if (acces.erreur) return { ...sortie, erreur: { source: SRC, code: 'config', message: acces.erreur } };
  const wp = clientWp(base, acces.auth);
  try {
    await verifierAcces(wp, base);
    const types = await typesWp(wp);
    let trouve = id ? await parIdentifiant(wp, types, Number(id), type) : await trouverContenu(pool, wp, types, siteId, url);
    if (!trouve) return { ...sortie, erreur: { source: SRC, code: 404, message: id ? `aucun contenu n° ${id}${type ? ` de type ${type}` : ''} lisible en édition` : "aucun contenu WordPress (tous types, tous statuts) n'a cette adresse" } };
    // Lu par l'adresse en lecture publique (droits insuffisants) : on redemande en édition, sinon pas de brut.
    if (trouve.context !== 'edit') {
      const r = await wp(`${trouve.type.rest_base}/${trouve.it.id}`, { context: 'edit' });
      if (!r.ok) return { ...sortie, erreur: { source: SRC, code: r.status, message: "pas de contenu brut : l'utilisateur dédié n'a pas le droit de modifier ce type de contenu (seul le rendu est lisible, voir get_live_page)" } };
      trouve = { ...trouve, it: await r.json(), context: 'edit' };
    }
    const it = trouve.it;
    const raw = it.content && typeof it.content.raw === 'string' ? it.content.raw : null;
    if (raw === null) return { ...sortie, erreur: { source: SRC, code: 'brut', message: 'WordPress ne renvoie pas content.raw pour ce contenu' } };
    const tout = caracteres(raw);
    const d = Math.max(0, Math.min(tout.length, Number(debut) || 0));
    const l = Math.max(1, Math.min(MORCEAU_MAX, Number(longueur) || MORCEAU_MAX));
    const fin = Math.min(tout.length, d + l);
    const a = analyse(raw);
    return {
      ...sortie,
      id: it.id, type: trouve.type.slug, statut: it.status, slug: it.slug, lien: it.link, modifie_gmt: it.modified_gmt,
      title_raw: it.title && typeof it.title.raw === 'string' ? it.title.raw : null,
      excerpt_raw: it.excerpt && typeof it.excerpt.raw === 'string' ? it.excerpt.raw : null,
      content: {
        longueur: tout.length, octets: Buffer.byteLength(raw, 'utf8'), sha256: sha256(raw), blocs: a.blocs, codes_courts: a.codes_courts,
        morceau: { debut: d, fin, longueur: fin - d, complet: d === 0 && fin === tout.length, suite: fin < tout.length ? { debut: fin, longueur: l } : null },
        raw: tout.slice(d, fin).join('')
      },
      note: 'sha256 = empreinte du content.raw ENTIER (UTF-8), à reprendre telle quelle dans base_sha256 de prepare_draft (remplacements). Rien n\'est écrit.'
    };
  } catch (e) {
    return { ...sortie, erreur: e && e.source ? e : erreurReseau(e, SRC) };
  }
}

export { sha256 as empreinte, analyse };
