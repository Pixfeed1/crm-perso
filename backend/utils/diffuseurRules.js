// backend/utils/diffuseurRules.js
// Diffuseur : règles pures, sans base ni réseau, testées à part.
//  - planCalendar : une image par jour, scènes alternées, jamais deux jours de suite la même scène
//  - focalCrop    : cadre de recadrage autour d'un point d'intérêt (recadrage 4:5 Instagram)
//  - controlerTexte : règles de ton (aucune émoticône, aucune liste, identité MVaertan, pas de tiret cadratin)
//  - composer     : texte final publié par plateforme et par langue, mention « lien affilié », hashtags, limites
//  - lienParDefaut : lien affilié (Pinterest) ou article jurojin (images principales)
//  - csvExport    : colonnes calées sur la ligne d'en-tête du modèle d'import (Pinterest, Meta Business Suite)

// ─── Plateformes ─────────────────────────────────────────────────────────────
// limite : longueur maximale du texte publié ; urlCompte : longueur comptée pour un lien (X : 23).
// lien : le texte publié porte-t-il le lien cliquable ? (Instagram : non, les liens n'y sont pas cliquables)
const PLATEFORMES = {
  instagram: { label: 'Instagram', limite: 2200, hashtags: 5, lien: false, langue: 'fr_en' },
  facebook: { label: 'Facebook', limite: 5000, hashtags: 3, lien: true, langue: 'fr_en' },
  pinterest: { label: 'Pinterest', limite: 500, titre: 100, hashtags: 0, lien: true, langue: 'fr_en' },
  x: { label: 'X', limite: 280, urlCompte: 23, hashtags: 2, lien: true, langue: 'fr' },
  bluesky: { label: 'Bluesky', limite: 300, hashtags: 2, lien: true, langue: 'fr' }
};
// Une scène sensible ne part que là où l'auteur publie à la main et peut marquer le contenu (X).
const PLATEFORMES_SENSIBLE = ['x'];
const LANGUES = ['fr', 'en', 'fr_en'];

// ─── Dates (chaînes AAAA-MM-JJ, calcul en UTC pour éviter les décalages d'heure d'été) ───
function ajouterJours(dateStr, n) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

// « 2026-11-03 » + « 18:00 » heure de Paris -> instant UTC (ISO). Deux passes : l'écart
// Paris/UTC dépend de la date (heure d'été).
function parisVersUtc(dateStr, hhmm = '12:00') {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const [hh, mi] = String(hhmm || '12:00').split(':').map((x) => parseInt(x, 10) || 0);
  const ecart = (t) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - t;
  };
  const local = Date.UTC(y, m - 1, d, hh, mi);
  let t = local - ecart(local);
  t = local - ecart(t);
  return new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Calendrier : une image par jour à partir de `debut`, sur `jours` jours au plus.
 * Chaque jour, on prend la scène qui a le plus d'images restantes parmi celles qui n'ont pas
 * publié la veille (glouton classique : il évite de finir avec une seule scène qui se répète).
 * Si seule la scène de la veille a encore des images, ces images restent non planifiées :
 * la règle « pas deux jours de suite la même scène » n'est jamais violée.
 * @param {{id:number, scene_id:number, ordre?:number, principale?:boolean}[]} images
 * @param {{debut:string, jours?:number, ordreScenes?:number[]}} opts
 * @returns {{ planning: {image_id:number, scene_id:number, date:string}[], non_planifiees: number[] }}
 */
function planCalendar(images, { debut, jours = 30, ordreScenes = null } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(debut || ''))) throw new Error('Date de début invalide (AAAA-MM-JJ)');
  const files = new Map();
  for (const im of images) {
    if (!files.has(im.scene_id)) files.set(im.scene_id, []);
    files.get(im.scene_id).push(im);
  }
  // Dans une scène : images principales d'abord (elles portent l'article), puis l'ordre d'envoi.
  for (const f of files.values()) f.sort((a, b) => (b.principale ? 1 : 0) - (a.principale ? 1 : 0) || (a.ordre || 0) - (b.ordre || 0) || a.id - b.id);
  const rang = (sid) => {
    const i = ordreScenes ? ordreScenes.indexOf(sid) : -1;
    return i >= 0 ? i : [...files.keys()].indexOf(sid) + 1000;
  };
  const planning = [];
  let veille = null;
  for (let j = 0; j < jours; j++) {
    const candidates = [...files.entries()].filter(([sid, f]) => f.length && sid !== veille);
    if (!candidates.length) break;
    candidates.sort((a, b) => b[1].length - a[1].length || rang(a[0]) - rang(b[0]));
    const [sid, f] = candidates[0];
    const im = f.shift();
    planning.push({ image_id: im.id, scene_id: sid, date: ajouterJours(debut, j) });
    veille = sid;
  }
  const non_planifiees = [...files.values()].flat().map((im) => im.id);
  return { planning, non_planifiees };
}

/**
 * Cadre de recadrage au format `ratio` (largeur / hauteur), le plus grand possible, centré au
 * mieux sur le point d'intérêt (fx, fy entre 0 et 1), sans sortir de l'image.
 */
function focalCrop(largeur, hauteur, ratio, focal = { x: 0.5, y: 0.5 }) {
  const W = Math.max(1, Math.round(largeur)); const H = Math.max(1, Math.round(hauteur));
  let w = W; let h = Math.round(W / ratio);
  if (h > H) { h = H; w = Math.round(H * ratio); }
  const fx = Math.min(1, Math.max(0, Number(focal && focal.x != null ? focal.x : 0.5)));
  const fy = Math.min(1, Math.max(0, Number(focal && focal.y != null ? focal.y : 0.5)));
  const left = Math.min(W - w, Math.max(0, Math.round(fx * W - w / 2)));
  const top = Math.min(H - h, Math.max(0, Math.round(fy * H - h / 2)));
  return { left, top, width: w, height: h };
}

// ─── Contrôle des textes générés ─────────────────────────────────────────────
// Émoticônes et pictogrammes (dont ✓ ✔ ✅ ☑ ★ ➜), puces de liste, PixFeed, tirets cadratins.
const PICTO = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}←-⇿✓✔✅☑☒✗✘➤➜▶►▪●]/u;
const PUCE = /^\s*(?:[-*•·▪►▸‣]|\d+[.)])\s+/m;

function controlerTexte(texte, { liste = true } = {}) {
  const t = String(texte || '');
  const erreurs = [];
  if (PICTO.test(t)) erreurs.push('émoticône ou pictogramme');
  if (liste && PUCE.test(t)) erreurs.push('liste à puces ou à coches');
  if (/pix\s*feed/i.test(t)) erreurs.push('mention de PixFeed');
  if (/[—–]/.test(t)) erreurs.push('tiret cadratin');
  if (/#/.test(t)) erreurs.push('hashtag dans le corps (ils sont ajoutés à la fin)');
  return erreurs;
}

// Nettoyage sûr, sans réécriture : tirets cadratins -> virgule, espaces doublés.
function nettoyer(texte) {
  return String(texte || '')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// « Vue de nuit », « 3D art » -> « #VueDeNuit », « #3DArt » ; lettres accentuées conservées.
function hashtag(mot) {
  const s = String(mot || '').replace(/^#+/, '').trim();
  if (!s) return '';
  const parts = s.split(/[^\p{L}\p{N}_]+/u).filter(Boolean);
  if (!parts.length) return '';
  const tag = parts.map((p, i) => (i === 0 && parts.length === 1 ? p : p.charAt(0).toUpperCase() + p.slice(1))).join('');
  return `#${tag}`;
}

function listeHashtags(sources, max) {
  const vus = new Set(); const out = [];
  if (!(max > 0)) return out;
  for (const m of sources) {
    const h = hashtag(m);
    if (!h || vus.has(h.toLowerCase())) continue;
    vus.add(h.toLowerCase()); out.push(h);
    if (out.length >= max) break;
  }
  return out;
}

const MENTION = { fr: 'Lien affilié', en: 'Affiliate link', fr_en: 'Lien affilié · Affiliate link' };

// Longueur comptée par la plateforme : graphèmes, et pour X un lien compte 23.
function longueur(texte, plateforme, url) {
  const segs = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(texte)].length : [...texte].length;
  const p = PLATEFORMES[plateforme];
  if (p && p.urlCompte && url && texte.includes(url)) return segs - [...url].length + p.urlCompte;
  return segs;
}

/**
 * Texte final d'une publication.
 * @param {object} post   { plateforme, langue, texte_fr, texte_en, titre_fr, titre_en, lien_type, lien_url, hashtags_fr, hashtags_en }
 * @param {object} opts   { hashtagsBase: { fr: [], en: [] } }
 * @returns {{ titre: string|null, texte: string, lien: string|null, longueur: number, limite: number, depasse: boolean, mention: boolean }}
 */
function composer(post, { hashtagsBase = { fr: [], en: [] } } = {}) {
  const p = PLATEFORMES[post.plateforme];
  if (!p) throw new Error(`Plateforme inconnue : ${post.plateforme}`);
  const langue = LANGUES.includes(post.langue) ? post.langue : p.langue;
  const fr = nettoyer(post.texte_fr); const en = nettoyer(post.texte_en);
  let corps = langue === 'fr' ? fr : langue === 'en' ? en : [fr, en].filter(Boolean).join('\n\n');
  const lien = post.lien_type && post.lien_type !== 'aucun' && post.lien_url ? post.lien_url : null;
  const affilie = !!lien && post.lien_type === 'affilie';
  // La mention n'a de sens que si le lien est publié avec le texte (pas sur Instagram).
  const mention = affilie && p.lien;
  if (mention) corps += `\n\n${MENTION[langue]}`;
  if (lien && p.lien && post.plateforme !== 'pinterest') corps += `\n${lien}`; // Pinterest : lien dans sa colonne
  const tagsSrc = [
    ...(langue !== 'en' ? (post.hashtags_fr || []) : []), ...(langue !== 'fr' ? (post.hashtags_en || []) : []),
    ...(langue !== 'en' ? (hashtagsBase.fr || []) : []), ...(langue !== 'fr' ? (hashtagsBase.en || []) : [])
  ];
  const tags = listeHashtags(tagsSrc, p.hashtags);
  if (tags.length) corps += `\n\n${tags.join(' ')}`;
  let titre = null;
  if (p.titre) {
    titre = nettoyer(langue === 'en' ? post.titre_en : (post.titre_fr || post.titre_en)) || null;
    if (titre && [...titre].length > p.titre) titre = [...titre].slice(0, p.titre - 1).join('') + '…';
  }
  const n = longueur(corps, post.plateforme, lien);
  return { titre, texte: corps, lien, longueur: n, limite: p.limite, depasse: n > p.limite, mention };
}

/**
 * Lien par défaut d'une publication.
 * Pinterest : lien affilié de l'asset principal de l'image, sinon l'article.
 * Ailleurs : image principale -> article jurojin ; sinon lien affilié ; sinon article ; sinon aucun.
 */
function lienParDefaut({ plateforme, principale, articleUrl, affilieUrl }) {
  const art = articleUrl ? { lien_type: 'article', lien_url: articleUrl } : null;
  const aff = affilieUrl ? { lien_type: 'affilie', lien_url: affilieUrl } : null;
  if (plateforme === 'pinterest') return aff || art || { lien_type: 'aucun', lien_url: null };
  if (principale && art) return art;
  return aff || art || { lien_type: 'aucun', lien_url: null };
}

// ─── Exports CSV calés sur l'en-tête du modèle d'import ─────────────────────
// En-têtes par défaut : ceux couramment attendus par l'import en masse. Aucun modèle officiel n'a
// pu être confirmé : collez la ligne d'en-tête du modèle téléchargé depuis votre compte dans les
// réglages, et l'export suivra ces colonnes exactement (rapprochement par mots-clés).
const ENTETES_DEFAUT = {
  pinterest: ['Title', 'Media URL', 'Pinterest board', 'Thumbnail', 'Description', 'Link', 'Publish date', 'Keywords'],
  meta: ['Date', 'Heure', 'Plateforme', 'Texte', 'Lien', 'Media URL'],
  x: ['Date', 'Heure', 'Texte', 'Image']
};

// Champ de la ligne correspondant à un intitulé de colonne.
function champPourColonne(col) {
  const c = String(col || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/thumbnail|miniature|vignette/.test(c)) return 'vignette';
  if (/alt/.test(c) && /text|texte/.test(c)) return 'alt';
  if (/media|image|photo|visuel/.test(c)) return 'media_url';
  if (/board|tableau/.test(c)) return 'tableau';
  if (/keyword|mots?.?cles?/.test(c)) return 'mots_cles';
  if (/title|titre/.test(c)) return 'titre';
  if (/platform|plateforme|network|reseau|channel|compte|account/.test(c)) return 'plateforme';
  if (/^(time|heure|hour)$|\b(time|heure)\b/.test(c) && !/date/.test(c)) return 'heure';
  if (/date|publish|schedul|programm|when/.test(c)) return 'date';
  if (/link|lien|url|destination/.test(c)) return 'lien';
  if (/descr|text|texte|message|content|contenu|body|caption|legende|post/.test(c)) return 'texte';
  return null;
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * @param {string[]} entetes  colonnes du modèle
 * @param {object[]} lignes   { titre, texte, lien, media_url, tableau, date, heure, date_iso, mots_cles, plateforme, alt }
 * @returns {string} CSV (UTF-8 avec BOM pour Excel, séparateur virgule, fin de ligne CRLF)
 */
function csvExport(entetes, lignes) {
  const cols = (entetes && entetes.length ? entetes : []).map((c) => String(c).trim()).filter(Boolean);
  const champs = cols.map(champPourColonne);
  // Une seule colonne de date (pas de colonne heure) : on y met la date et l'heure ensemble.
  const dateSeule = champs.includes('date') && !champs.includes('heure');
  const val = (l, champ) => {
    if (!champ) return '';
    if (champ === 'date') return dateSeule ? (l.date_iso || `${l.date} ${l.heure || ''}`.trim()) : l.date;
    return l[champ];
  };
  const out = [cols.map(csvEscape).join(',')];
  for (const l of lignes) out.push(champs.map((ch) => csvEscape(val(l, ch))).join(','));
  return `﻿${out.join('\r\n')}\r\n`;
}

// « Title, Media URL ; Description » collé depuis un modèle -> liste de colonnes.
function lireEntetes(texte) {
  const ligne = String(texte || '').replace(/^﻿/, '').split(/\r?\n/).find((l) => l.trim()) || '';
  const sep = (ligne.match(/;/g) || []).length > (ligne.match(/,/g) || []).length ? ';' : ligne.includes('\t') ? '\t' : ',';
  return ligne.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1').trim()).filter(Boolean);
}

module.exports = {
  PLATEFORMES, PLATEFORMES_SENSIBLE, LANGUES, ENTETES_DEFAUT,
  ajouterJours, parisVersUtc, planCalendar, focalCrop,
  controlerTexte, nettoyer, hashtag, listeHashtags, longueur, composer, lienParDefaut,
  champPourColonne, csvExport, lireEntetes
};
