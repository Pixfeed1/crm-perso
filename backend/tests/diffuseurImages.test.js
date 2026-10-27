// Diffuseur : traitement d'un rendu fictif (2:3, sujet en haut, métadonnées « Daz Studio »).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

let tmp;
before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'diffuseur-img-'));
  process.env.DIFFUSEUR_MEDIA_DIR = path.join(tmp, 'media');
  process.env.DIFFUSEUR_ORIGINALS_DIR = path.join(tmp, 'originaux');
  process.env.DIFFUSEUR_MEDIA_URL = 'https://media.jurojin.net';
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// Rendu fictif 1600 × 2400 : fond bruité sombre, sujet clair et détaillé dans le quart haut.
async function renduFictif(fichier) {
  const W = 1600; const H = 2400;
  const fond = Buffer.alloc(W * H * 3);
  for (let i = 0; i < fond.length; i++) fond[i] = 20 + ((i * 7919) % 13);
  const sujet = Buffer.alloc(500 * 500 * 3);
  for (let y = 0; y < 500; y++) for (let x = 0; x < 500; x++) {
    const o = (y * 500 + x) * 3; const damier = ((x >> 4) + (y >> 4)) % 2;
    sujet[o] = damier ? 250 : 200; sujet[o + 1] = damier ? 60 : 180; sujet[o + 2] = damier ? 40 : 30;
  }
  await sharp(fond, { raw: { width: W, height: H, channels: 3 } })
    .composite([{ input: await sharp(sujet, { raw: { width: 500, height: 500, channels: 3 } }).png().toBuffer(), left: 550, top: 150 }])
    .withMetadata({ exif: { IFD0: { Software: 'DAZ Studio 4.22 Pro', Artist: 'Test' } } })
    .png().toFile(fichier);
}

test('rendu traité : original privé, copies publiques sans métadonnées, recadrage 4:5 vers le sujet, Bluesky sous 950 ko', async () => {
  const I = require('../services/diffuseurImages');
  const src = path.join(tmp, 'recu.png');
  await renduFictif(src);
  assert.match(JSON.stringify(await sharp(src).metadata().then((m) => !!m.exif)), /true/, 'le fichier d\'essai porte bien de l\'EXIF');

  const t = await I.traiterRendu(src, { scene: 'Ruelle sous la pluie', index: 1, nomOriginal: 'Rendu Final.PNG' });
  assert.equal(fs.existsSync(src), false, 'le fichier reçu a été déplacé');
  assert.ok(t.fichier_original.startsWith(path.join(tmp, 'originaux')));
  assert.equal(t.largeur, 1600); assert.equal(t.hauteur, 2400);
  assert.match(t.jpeg_nom, /^ruelle-sous-la-pluie-01-[0-9a-f]{8}\.jpg$/);
  assert.doesNotMatch(`${t.jpeg_nom}${t.ig_nom}${t.bs_nom}${I.urlPublique(t.jpeg_nom)}`, /pix\s*feed/i);
  assert.equal(I.urlPublique(t.ig_nom), `https://media.jurojin.net/r/${t.ig_nom}`);

  for (const nom of [t.jpeg_nom, t.ig_nom, t.bs_nom]) {
    const m = await sharp(I.cheminPublic(nom)).metadata();
    assert.equal(m.format, 'jpeg');
    assert.equal(m.exif, undefined, `${nom} : aucune donnée EXIF`);
    assert.equal(m.xmp, undefined, `${nom} : aucune donnée XMP`);
    assert.ok(!fs.readFileSync(I.cheminPublic(nom)).includes('DAZ Studio'), `${nom} : le logiciel de rendu n'apparaît pas`);
  }
  const ig = await sharp(I.cheminPublic(t.ig_nom)).metadata();
  assert.equal(ig.width, 1080); assert.equal(ig.height, 1350);
  assert.ok(t.focal_y < 0.5, `point d'intérêt vers le haut (y = ${t.focal_y.toFixed(2)})`);
  assert.ok(fs.statSync(I.cheminPublic(t.bs_nom)).size <= I.BLUESKY_MAX_OCTETS);

  // Nouveau point d'intérêt : le recadrage Instagram est réécrit sous le même nom.
  const avant = fs.readFileSync(I.cheminPublic(t.ig_nom));
  const nom = await I.recadrer({ ...t }, { x: 0.5, y: 0.95 });
  assert.equal(nom, t.ig_nom);
  assert.notDeepEqual(fs.readFileSync(I.cheminPublic(t.ig_nom)), avant);

  const b64 = await I.pourAnalyse(t);
  const vue = await sharp(Buffer.from(b64, 'base64')).metadata();
  assert.ok(Math.max(vue.width, vue.height) <= 1568);

  await I.supprimer(t);
  assert.equal(fs.existsSync(t.fichier_original), false);
  assert.equal(fs.existsSync(I.cheminPublic(t.jpeg_nom)), false);
});
