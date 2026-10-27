// backend/services/diffuseurImages.js
// Diffuseur : traitement des rendus avec sharp.
//  - l'original est conservé tel quel, hors du dossier public ;
//  - copie de diffusion : JPEG sRGB, 2 400 px de haut au plus, SANS AUCUNE métadonnée (sharp
//    n'écrit ni EXIF, ni XMP, ni ICC tant qu'on n'appelle pas withMetadata : le logiciel de
//    rendu n'apparaît nulle part) ;
//  - recadrage 4:5 pour Instagram autour du point d'intérêt (déplaçable depuis le CRM) ;
//  - copie Bluesky : moins de 950 ko (limite de la plateforme : environ 1 Mo par image).
// Les copies publiques vont dans DIFFUSEUR_MEDIA_DIR (servi par media.jurojin.net) sous des noms
// neutres : nom de la scène + numéro + suffixe aléatoire, aucune mention de PixFeed.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { focalCrop } = require('../utils/diffuseurRules');

const RATIO_INSTAGRAM = 4 / 5;
const BLUESKY_MAX_OCTETS = 950 * 1024;

function dossiers() {
  const media = process.env.DIFFUSEUR_MEDIA_DIR || '/home/jurojinn/media.jurojin.net';
  return {
    originaux: process.env.DIFFUSEUR_ORIGINALS_DIR || path.join(__dirname, '..', 'uploads', 'diffuseur', 'originaux'),
    media: path.join(media, 'r'),
    url: `${(process.env.DIFFUSEUR_MEDIA_URL || 'https://media.jurojin.net').replace(/\/+$/, '')}/r`
  };
}

function slug(s) {
  return String(s || 'scene').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'scene';
}

function urlPublique(nom) { return nom ? `${dossiers().url}/${nom}` : null; }
function cheminPublic(nom) { return path.join(dossiers().media, nom); }

// Point d'intérêt par défaut : stratégie « attention » de sharp (zones contrastées, peau, couleurs
// saturées) appliquée au recadrage 4:5 ; on en déduit le centre du cadre retenu.
async function pointInteret(src, largeur, hauteur) {
  const cadre = focalCrop(largeur, hauteur, RATIO_INSTAGRAM);
  if (cadre.width === largeur && cadre.height === hauteur) return { x: 0.5, y: 0.5 };
  const petit = 400 / Math.max(largeur, hauteur);
  const w = Math.max(1, Math.round(cadre.width * petit)); const h = Math.max(1, Math.round(cadre.height * petit));
  const { info } = await sharp(src).resize(Math.round(largeur * petit), Math.round(hauteur * petit))
    .resize(w, h, { fit: 'cover', position: sharp.strategy.attention }).raw().toBuffer({ resolveWithObject: true });
  // cropOffsetLeft/Top : décalage du cadre retenu (valeurs négatives dans sharp) à l'échelle réduite.
  const ox = Math.abs(info.cropOffsetLeft || 0) / petit; const oy = Math.abs(info.cropOffsetTop || 0) / petit;
  return {
    x: Math.min(1, Math.max(0, (ox + cadre.width / 2) / largeur)),
    y: Math.min(1, Math.max(0, (oy + cadre.height / 2) / hauteur))
  };
}

async function jpeg(pipeline, qualite) {
  return pipeline.toColourspace('srgb').jpeg({ quality: qualite, mozjpeg: true, chromaSubsampling: '4:2:0' }).toBuffer();
}

async function ecrire(nom, buffer) {
  await fs.promises.mkdir(dossiers().media, { recursive: true });
  const tmp = cheminPublic(`${nom}.tmp`);
  await fs.promises.writeFile(tmp, buffer, { mode: 0o644 });
  await fs.promises.rename(tmp, cheminPublic(nom));
}

// Recadrage Instagram 4:5 (1 080 × 1 350) autour du point d'intérêt.
async function genererInstagram(original, base, focal, meta) {
  const cadre = focalCrop(meta.width, meta.height, RATIO_INSTAGRAM, focal);
  const buf = await jpeg(sharp(original).rotate().extract(cadre).resize(1080, 1350, { fit: 'cover' }), 85);
  const nom = `${base}-ig.jpg`;
  await ecrire(nom, buf);
  return nom;
}

// Copie Bluesky : qualité abaissée puis taille réduite jusqu'à passer sous 950 ko.
async function genererBluesky(original) {
  for (const [haut, q] of [[1800, 82], [1800, 72], [1500, 72], [1200, 70], [1000, 65]]) {
    const buf = await jpeg(sharp(original).rotate().resize({ height: haut, width: haut, fit: 'inside', withoutEnlargement: true }), q);
    if (buf.length <= BLUESKY_MAX_OCTETS) return buf;
  }
  throw new Error('Impossible de réduire l\'image sous 950 ko pour Bluesky');
}

/**
 * Traite un rendu envoyé : déplace l'original dans le dossier privé, écrit les copies publiques.
 * @param {string} fichierTmp  chemin du fichier reçu (multer)
 * @param {{ scene: string, index: number, nomOriginal: string }} o
 */
async function traiterRendu(fichierTmp, { scene, index, nomOriginal }) {
  const meta = await sharp(fichierTmp).rotate().metadata();
  if (!meta.width || !meta.height) throw new Error('Image illisible');
  // rotate() sans argument applique l'orientation EXIF : largeur/hauteur après rotation.
  const swap = meta.orientation && meta.orientation >= 5;
  const largeur = swap ? meta.height : meta.width; const hauteur = swap ? meta.width : meta.height;
  const d = dossiers();
  await fs.promises.mkdir(d.originaux, { recursive: true });
  const ext = (path.extname(nomOriginal || '') || `.${meta.format || 'png'}`).toLowerCase().replace(/[^.a-z0-9]/g, '');
  const original = path.join(d.originaux, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  await fs.promises.rename(fichierTmp, original).catch(async () => {
    await fs.promises.copyFile(fichierTmp, original); await fs.promises.unlink(fichierTmp).catch(() => {});
  });
  const base = `${slug(scene)}-${String(index).padStart(2, '0')}-${crypto.randomBytes(4).toString('hex')}`;
  const diffusion = await jpeg(sharp(original).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }), 86);
  await ecrire(`${base}.jpg`, diffusion);
  const focal = await pointInteret(original, largeur, hauteur);
  const ig = await genererInstagram(original, base, focal, { width: largeur, height: hauteur });
  await ecrire(`${base}-bs.jpg`, await genererBluesky(original));
  return {
    fichier_original: original, largeur, hauteur, focal_x: focal.x, focal_y: focal.y,
    jpeg_nom: `${base}.jpg`, ig_nom: ig, bs_nom: `${base}-bs.jpg`, base
  };
}

// Nouveau point d'intérêt : seul le recadrage Instagram est régénéré (même nom, remplacé).
async function recadrer(image, focal) {
  const base = String(image.jpeg_nom || '').replace(/\.jpg$/, '');
  if (!base || !image.fichier_original) throw new Error('Image sans original');
  return genererInstagram(image.fichier_original, base, focal, { width: image.largeur, height: image.hauteur });
}

// Copie réduite pour l'analyse par Claude (1 568 px de côté au plus : au-delà, l'API la réduit).
async function pourAnalyse(image) {
  const src = image.fichier_original && fs.existsSync(image.fichier_original) ? image.fichier_original : cheminPublic(image.jpeg_nom);
  const buf = await jpeg(sharp(src).rotate().resize({ width: 1568, height: 1568, fit: 'inside', withoutEnlargement: true }), 80);
  return buf.toString('base64');
}

async function supprimer(image) {
  for (const nom of [image.jpeg_nom, image.ig_nom, image.bs_nom]) if (nom) await fs.promises.unlink(cheminPublic(nom)).catch(() => {});
  if (image.fichier_original) await fs.promises.unlink(image.fichier_original).catch(() => {});
}

module.exports = { traiterRendu, recadrer, pourAnalyse, supprimer, urlPublique, cheminPublic, dossiers, slug, BLUESKY_MAX_OCTETS };
