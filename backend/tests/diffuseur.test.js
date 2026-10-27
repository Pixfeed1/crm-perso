// Diffuseur : parcours complet en base jetable avec une scène fictive et un Claude simulé.
// Scène + assets CJ -> rendus -> textes (une réponse fautive puis corrigée) -> calendrier ->
// validation -> dépôt Bluesky pour JurojinReposter -> résultat relu -> exports CSV.
// Aucun appel réseau : le modèle est injecté, les fichiers vont dans un dossier temporaire.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { hasDb, withSchema } = require('./helpers/db');
const { DATABASE_SCHEMA } = require('../scripts/autoInitDatabase');

async function createFromSchema(pool, name) {
  const cols = Object.entries(DATABASE_SCHEMA[name].columns).map(([c, d]) => `${c} ${d}`).join(', ');
  await pool.query(`CREATE TABLE ${name} (${cols})`);
  for (const ix of DATABASE_SCHEMA[name].indexes || []) await pool.query(ix);
}

async function rendu(dir, nom, teinte) {
  const f = path.join(dir, nom);
  await sharp({ create: { width: 800, height: 1200, channels: 3, background: { r: teinte, g: 40, b: 90 } } })
    .composite([{ input: { create: { width: 200, height: 200, channels: 3, background: { r: 240, g: 230, b: 200 } } }, left: 300, top: 200 }])
    .png().toFile(f);
  return { path: f, originalname: nom };
}

const reponse = (o = {}) => ({
  description: 'Une ruelle pavée sous la pluie, éclairée par une enseigne rouge.',
  alt: { fr: 'Ruelle pavée sous la pluie la nuit.', en: 'Cobbled alley in the rain at night.' },
  instagram: { fr: 'Une ruelle sous la pluie. La lumière de l\'enseigne glisse sur les pavés.', en: 'A rainy alley. The sign light slides across the cobbles.' },
  pinterest: { titre_fr: 'Ruelle sous la pluie, rendu 3D nocturne', titre_en: 'Rainy alley at night, 3D render', description_fr: 'Rendu 3D d\'une ruelle pavée sous la pluie, ambiance nocturne.', description_en: 'Night 3D render of a rainy cobbled alley.' },
  court: { fr: 'Une ruelle sous la pluie, une seule enseigne allumée.', en: 'A rainy alley, a single sign lit.' },
  hashtags_fr: ['ruelle', 'pluie'], hashtags_en: ['rain', 'alley'], mots_cles: ['ruelle', 'pluie', 'rendu 3D'],
  ...o
});

test('Diffuseur : scène fictive de bout en bout', { skip: !hasDb() && 'TEST_DATABASE_URL absent' }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'diffuseur-'));
  process.env.DIFFUSEUR_MEDIA_DIR = path.join(tmp, 'media');
  process.env.DIFFUSEUR_ORIGINALS_DIR = path.join(tmp, 'originaux');
  process.env.DIFFUSEUR_MEDIA_URL = 'https://media.jurojin.net';
  process.env.DIFFUSEUR_BLUESKY_INBOX = path.join(tmp, 'reposter', 'data', 'crm_inbox');
  try {
    await withSchema('diffuseur', async ({ pool }) => {
      const db = { pool };
      for (const t of ['diffuseur_scenes', 'diffuseur_assets', 'diffuseur_images', 'diffuseur_posts', 'diffuseur_reglages', 'diffuseur_connexions', 'diffuseur_file']) await createFromSchema(pool, t);
      const S = require('../services/diffuseurService');

      // Réglages par défaut créés à la première lecture.
      const reg = await S.getReglages(db);
      assert.equal(reg.heures.bluesky, '12:30'); assert.deepEqual(reg.entetes.pinterest.slice(0, 2), ['Title', 'Media URL']);
      await S.updateReglages(db, { tableau_pinterest: 'Rendus 3D', entetes: { meta: 'Date;Time;Message;Link;Image URL;Account' } });
      assert.deepEqual((await S.getReglages(db)).entetes.meta, ['Date', 'Time', 'Message', 'Link', 'Image URL', 'Account']);

      // Scène A : article + deux assets CJ ; scène B : sans article ; scène C : sensible.
      await assert.rejects(S.createScene(db, { nom: 'X', article_url: 'pas une url' }), /Adresse invalide/);
      const A = await S.createScene(db, {
        nom: 'Ruelle sous la pluie', article_url: 'https://jurojin.net/ruelle-pluie/',
        assets: [{ nom: 'Rainy Alley', url_affilie: 'https://www.anrdoezrs.net/click-1-2?url=alley' }, { nom: 'Neon Sign', url_affilie: 'https://www.anrdoezrs.net/click-1-3?url=neon' }]
      });
      const B = await S.createScene(db, { nom: 'Jardin d\'hiver', assets: [{ nom: 'Winter Garden', url_affilie: 'https://www.anrdoezrs.net/click-1-4?url=garden' }] });
      const C = await S.createScene(db, { nom: 'Étude sensible', sensible: true, assets: [] });
      assert.deepEqual(C.plateformes, ['x']);

      const upA = await S.addImages(db, A.scene.id, [await rendu(tmp, 'a1.png', 120), await rendu(tmp, 'a2.png', 130), await rendu(tmp, 'a3.png', 140)]);
      const upB = await S.addImages(db, B.scene.id, [await rendu(tmp, 'b1.png', 60), await rendu(tmp, 'b2.png', 70)]);
      const upC = await S.addImages(db, C.scene.id, [await rendu(tmp, 'c1.png', 90)]);
      assert.equal(upA.ajoutees.length, 3); assert.equal(upB.ajoutees.length, 2); assert.equal(upC.echecs.length, 0);
      const [a1, a2] = upA.ajoutees;
      assert.equal(a1.principale, true, 'première image principale quand la scène a un article');
      assert.equal(a2.principale, false);
      assert.equal(upB.ajoutees[0].principale, false, 'pas d\'article : pas d\'image principale');
      assert.equal(a1.asset_id, A.assets[0].id);
      assert.equal(a1.fichier_original, undefined, 'le chemin de l\'original ne sort pas du serveur');
      assert.match(a1.url, /^https:\/\/media\.jurojin\.net\/r\/ruelle-sous-la-pluie-01-/);

      // Textes : première réponse fautive (émoticône + PixFeed), deuxième conforme.
      const appels = [];
      const callModel = async (req) => {
        appels.push(req);
        return appels.length === 1 ? reponse({ instagram: { fr: 'Superbe 🔥 rendu PixFeed', en: 'Nice' } }) : reponse();
      };
      const g = await S.genererTextes(db, a1.id, { callModel, imageBase64: 'AAAA' });
      assert.equal(g.essais, 2); assert.equal(g.posts, 5);
      assert.match(appels[1].texte, /enfreignait ces règles[\s\S]*émoticône[\s\S]*PixFeed/);
      assert.match(appels[0].system, /MVaertan/);
      // Deux réponses fautives : refus, rien n'est écrit.
      await assert.rejects(S.genererTextes(db, a2.id, { callModel: async () => reponse({ court: { fr: '- liste\n- à puces', en: 'ok' } }), imageBase64: 'AAAA' }), /refusés après deux essais/);
      const ok = async () => reponse();
      for (const im of [a2, upA.ajoutees[2], ...upB.ajoutees, ...upC.ajoutees]) await S.genererTextes(db, im.id, { callModel: ok, imageBase64: 'AAAA' });
      const postsC = await S.listPosts(db, { scene_id: C.scene.id });
      assert.deepEqual(postsC.map((p) => p.plateforme), ['x'], 'scène sensible : seulement X');

      // Liens par défaut.
      const pa1 = await S.listPosts(db, { scene_id: A.scene.id });
      const de = (im, pl) => pa1.find((p) => p.image_id === im.id && p.plateforme === pl);
      assert.equal(de(a1, 'pinterest').lien_type, 'affilie');
      assert.equal(de(a1, 'bluesky').lien_type, 'article', 'image principale -> article');
      assert.equal(de(a2, 'bluesky').lien_type, 'affilie');
      assert.match(de(a2, 'facebook').final.texte, /Lien affilié · Affiliate link\nhttps:\/\/www\.anrdoezrs\.net/);
      assert.doesNotMatch(de(a2, 'instagram').final.texte, /affili|https?:/i);
      assert.match(de(a2, 'instagram').image_url, /-ig\.jpg$/); assert.match(de(a2, 'bluesky').image_url, /-bs\.jpg$/);
      // Changer l'asset principal d'une image met à jour le lien des publications à valider.
      await S.updateImage(db, a2.id, { asset_id: A.assets[1].id });
      assert.match((await S.listPosts(db, { scene_id: A.scene.id })).find((p) => p.image_id === a2.id && p.plateforme === 'x').lien_url, /neon/);

      // Validation impossible avant planification.
      await assert.rejects(S.updatePost(db, de(a2, 'bluesky').id, { statut: 'valide' }), /Planifiez d'abord/);

      // Calendrier : A (3 images) et B (2 images) alternées à partir du 3 novembre.
      const plan = await S.planifier(db, { scene_ids: [A.scene.id, B.scene.id], debut: '2026-11-03' });
      assert.equal(plan.planifiees, 5); assert.equal(plan.non_planifiees, 0);
      assert.deepEqual(plan.planning.map((p) => p.scene_id), [A.scene.id, B.scene.id, A.scene.id, B.scene.id, A.scene.id]);
      assert.equal(plan.planning[0].image_id, a1.id, 'image principale en premier');
      const tous = await S.listPosts(db, {});
      const jourDe = Object.fromEntries(plan.planning.map((p) => [p.image_id, p.date]));
      for (const p of tous.filter((x) => jourDe[x.image_id])) assert.equal(p.date_prevue, jourDe[p.image_id], 'toutes les plateformes d\'une image le même jour');

      // Texte non conforme : validation refusée. Texte trop long : refusée aussi.
      const bs = (await S.listPosts(db, { plateforme: 'bluesky', scene_id: A.scene.id })).find((p) => p.image_id === a2.id);
      await assert.rejects(S.updatePost(db, bs.id, { texte_fr: 'Rendu ✓ terminé', statut: 'valide' }), /Texte non conforme/);
      assert.equal((await S.getPost(db, bs.id)).statut, 'a_valider');
      await assert.rejects(S.updatePost(db, bs.id, { texte_fr: 'Une ruelle. '.repeat(30), statut: 'valide' }), /trop long pour Bluesky/);

      // Validation : dépôt Bluesky pour JurojinReposter, à l'heure de Paris convertie en UTC.
      await S.updatePost(db, bs.id, { texte_fr: 'Une ruelle sous la pluie, une seule enseigne allumée.', heure: '19:15', statut: 'valide' });
      const fichier = path.join(process.env.DIFFUSEUR_BLUESKY_INBOX, `crm-${bs.id}.json`);
      const depot = JSON.parse(fs.readFileSync(fichier, 'utf8'));
      assert.equal(depot.id, bs.id);
      assert.equal(depot.publier_a, `${jourDe[a2.id]}T18:15:00Z`);
      assert.match(depot.texte, /^Une ruelle sous la pluie, une seule enseigne allumée\.\n\nLien affilié\nhttps:\/\/www\.anrdoezrs\.net\/click-1-3/);
      assert.equal(depot.lien, 'https://www.anrdoezrs.net/click-1-3?url=neon');
      assert.ok(fs.existsSync(depot.image_path), 'image Bluesky présente sur le disque');
      assert.equal(depot.alt, 'Ruelle pavée sous la pluie la nuit.');
      assert.equal((await S.getPost(db, bs.id)).bluesky_etat, 'depose');
      // Modifiée après validation : repasse « à valider » et le dépôt est retiré.
      await S.updatePost(db, bs.id, { texte_fr: 'Une ruelle sous la pluie, la nuit.' });
      assert.equal((await S.getPost(db, bs.id)).statut, 'a_valider');
      assert.equal(fs.existsSync(fichier), false);
      // Validée de nouveau puis replanifiée : le dépôt suit la nouvelle date.
      await S.updatePost(db, bs.id, { statut: 'valide' });
      await S.planifier(db, { scene_ids: [A.scene.id, B.scene.id], debut: '2026-12-01' });
      const depot2 = JSON.parse(fs.readFileSync(fichier, 'utf8'));
      assert.ok(depot2.publier_a.startsWith('2026-12-0'), depot2.publier_a);
      // Rejetée : dépôt retiré.
      await S.updatePost(db, bs.id, { statut: 'rejete' });
      assert.equal(fs.existsSync(fichier), false);
      await S.updatePost(db, bs.id, { statut: 'valide' });
      assert.equal(fs.existsSync(fichier), true);

      // Résultat écrit par JurojinReposter : publiée, puis plus modifiable ; erreur sur une autre.
      const { outbox } = S.dossiersBluesky();
      fs.mkdirSync(outbox, { recursive: true });
      fs.unlinkSync(fichier); // JurojinReposter retire le dépôt une fois traité
      fs.writeFileSync(path.join(outbox, `crm-${bs.id}.json`), JSON.stringify({ id: bs.id, statut: 'publie', uri: 'at://did:plc:x/app.bsky.feed.post/1', publie_le: '2026-12-01T18:15:04Z' }));
      const bs2 = (await S.listPosts(db, { plateforme: 'bluesky', scene_id: B.scene.id }))[0];
      fs.writeFileSync(path.join(outbox, `crm-${bs2.id}.json`), JSON.stringify({ id: bs2.id, statut: 'erreur', erreur: 'Failed to connect to Bluesky' }));
      assert.equal((await S.lireResultatsBluesky(db)).lus, 2);
      const pub = await S.getPost(db, bs.id);
      assert.equal(pub.bluesky_etat, 'publie'); assert.equal(pub.bluesky_uri, 'at://did:plc:x/app.bsky.feed.post/1');
      assert.equal((await S.getPost(db, bs2.id)).bluesky_erreur, 'Failed to connect to Bluesky');
      await assert.rejects(S.updatePost(db, bs.id, { statut: 'rejete' }), /plus modifiable/);
      assert.equal(fs.readdirSync(outbox).filter((n) => n.endsWith('.json')).length, 0, 'résultats archivés');

      // Exports : seulement les publications validées et datées.
      const aValider = (await S.listPosts(db, { statut: 'a_valider' })).filter((p) => p.date_prevue && ['pinterest', 'instagram', 'facebook', 'x'].includes(p.plateforme));
      const r = await S.validerPlusieurs(db, aValider.map((p) => p.id));
      assert.equal(r.refusees.length, 0, JSON.stringify(r.refusees));
      const pin = await S.exporter(db, 'pinterest', {});
      assert.equal(pin.nb, 5);
      assert.ok(pin.csv.startsWith('﻿Title,Media URL,Pinterest board,Thumbnail,Description,Link,Publish date,Keywords'));
      assert.match(pin.csv, /"Ruelle sous la pluie, rendu 3D nocturne",https:\/\/media\.jurojin\.net\/r\/ruelle-sous-la-pluie-01-[0-9a-f]{8}\.jpg,Rendus 3D,,/);
      assert.match(pin.csv, /"Rendu 3D d'une ruelle pavée sous la pluie, ambiance nocturne\.\n\nRendu 3D|Lien affilié · Affiliate link/);
      const meta = await S.exporter(db, 'meta', {});
      assert.equal(meta.nb, 10, '5 images × Instagram et Facebook');
      assert.ok(meta.csv.startsWith('﻿Date,Time,Message,Link,Image URL,Account\r\n'));
      assert.match(meta.csv, /2026-12-0\d,18:00,/);
      assert.match(meta.csv, /-ig\.jpg,Instagram/);
      const x = await S.exporter(db, 'x', { from: '2026-12-01', to: '2026-12-02' });
      assert.equal(x.nb, 2);
      await assert.rejects(S.exporter(db, 'tiktok', {}), /Export inconnu/);

      // Suppression de la scène B : fichiers et publications supprimés.
      const imB = (await S.getScene(db, B.scene.id)).images[0];
      await S.deleteScene(db, B.scene.id);
      assert.equal(fs.existsSync(path.join(process.env.DIFFUSEUR_MEDIA_DIR, 'r', imB.jpeg_nom)), false);
      assert.equal((await S.listPosts(db, { scene_id: B.scene.id })).length, 0);
      assert.equal((await S.listScenes(db)).length, 2);
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
