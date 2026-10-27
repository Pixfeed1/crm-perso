// backend/services/diffuseurService.js
// Diffuseur : préparation de la diffusion des créations 3D (phase 1).
// Scène -> rendus (copies et recadrage) -> textes par Claude -> calendrier -> validation -> exports.
// Rien n'est publié automatiquement, sauf Bluesky : une publication VALIDÉE et datée est déposée
// dans le dossier d'échange de JurojinReposter, qui la publie à l'heure prévue avec son module
// Bluesky existant (compte jurojinet.bsky.social). Tant qu'elle n'est pas partie, la dévalider,
// la rejeter ou la modifier retire ou remplace le dépôt.
const fs = require('fs');
const path = require('path');
const R = require('../utils/diffuseurRules');
const images = require('./diffuseurImages');
const textes = require('./diffuseurTextes');

const PLATEFORMES = Object.keys(R.PLATEFORMES);
const HEURES_DEFAUT = { instagram: '18:00', facebook: '18:00', pinterest: '20:00', x: '12:30', bluesky: '12:30' };
const HASHTAGS_DEFAUT = { fr: 'art3D, rendu3D', en: '3dart, daz3d, digitalart' };

const erreur = (status, message) => Object.assign(new Error(message), { status });
const liste = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const jour = (d) => (d instanceof Date ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : (d ? String(d).slice(0, 10) : null));
const httpsOuRien = (u) => {
  const s = String(u || '').trim();
  if (!s) return null;
  if (!/^https?:\/\/\S+$/i.test(s)) throw erreur(422, `Adresse invalide : ${s.slice(0, 80)}`);
  return s;
};

function plateformesPermises(scene) {
  return scene && scene.sensible ? R.PLATEFORMES_SENSIBLE : PLATEFORMES;
}

// ─── Réglages ───────────────────────────────────────────────────────────────
async function getReglages(db) {
  let r = (await db.pool.query('SELECT * FROM diffuseur_reglages ORDER BY id LIMIT 1')).rows[0];
  if (!r) {
    r = (await db.pool.query(
      'INSERT INTO diffuseur_reglages (hashtags_fr, hashtags_en, heures, entetes) VALUES ($1, $2, $3, $4) RETURNING *',
      [HASHTAGS_DEFAUT.fr, HASHTAGS_DEFAUT.en, JSON.stringify(HEURES_DEFAUT), JSON.stringify(R.ENTETES_DEFAUT)]
    )).rows[0];
  }
  return {
    ...r,
    heures: { ...HEURES_DEFAUT, ...(r.heures || {}) },
    entetes: { ...R.ENTETES_DEFAUT, ...(r.entetes || {}) }
  };
}

async function updateReglages(db, b = {}) {
  const cur = await getReglages(db);
  const heures = { ...cur.heures };
  for (const p of PLATEFORMES) if (b.heures && /^\d{2}:\d{2}$/.test(String(b.heures[p] || ''))) heures[p] = b.heures[p];
  const entetes = { ...cur.entetes };
  // En-têtes : on accepte la ligne collée telle quelle depuis le modèle téléchargé.
  for (const k of Object.keys(R.ENTETES_DEFAUT)) {
    if (b.entetes && b.entetes[k] !== undefined) {
      const cols = Array.isArray(b.entetes[k]) ? b.entetes[k].map(String) : R.lireEntetes(b.entetes[k]);
      entetes[k] = cols.length ? cols : R.ENTETES_DEFAUT[k];
    }
  }
  await db.pool.query(
    'UPDATE diffuseur_reglages SET hashtags_fr = $2, hashtags_en = $3, tableau_pinterest = $4, heures = $5, entetes = $6, updated_at = NOW() WHERE id = $1',
    [cur.id, b.hashtags_fr !== undefined ? String(b.hashtags_fr) : cur.hashtags_fr, b.hashtags_en !== undefined ? String(b.hashtags_en) : cur.hashtags_en,
      b.tableau_pinterest !== undefined ? String(b.tableau_pinterest || '').trim() || null : cur.tableau_pinterest, JSON.stringify(heures), JSON.stringify(entetes)]
  );
  return getReglages(db);
}

// ─── Scènes ────────────────────────────────────────────────────────────────
async function listScenes(db) {
  const r = await db.pool.query(`
    SELECT s.*,
      (SELECT COUNT(*)::int FROM diffuseur_images i WHERE i.scene_id = s.id) AS nb_images,
      (SELECT COUNT(*)::int FROM diffuseur_images i WHERE i.scene_id = s.id AND i.textes_le IS NOT NULL) AS nb_textes,
      (SELECT COUNT(*)::int FROM diffuseur_posts p WHERE p.scene_id = s.id AND p.statut = 'a_valider') AS nb_a_valider,
      (SELECT COUNT(*)::int FROM diffuseur_posts p WHERE p.scene_id = s.id AND p.statut = 'valide') AS nb_valides,
      (SELECT COUNT(*)::int FROM diffuseur_posts p WHERE p.scene_id = s.id AND p.date_prevue IS NOT NULL) AS nb_planifies,
      (SELECT jpeg_nom FROM diffuseur_images i WHERE i.scene_id = s.id ORDER BY principale DESC, ordre, id LIMIT 1) AS vignette
    FROM diffuseur_scenes s ORDER BY s.created_at DESC, s.id DESC`);
  return r.rows.map((s) => ({ ...s, vignette_url: images.urlPublique(s.vignette) }));
}

function imagePublique(im) {
  return {
    ...im,
    fichier_original: undefined,
    url: images.urlPublique(im.jpeg_nom),
    url_instagram: images.urlPublique(im.ig_nom),
    url_bluesky: images.urlPublique(im.bs_nom)
  };
}

async function getScene(db, id) {
  const s = (await db.pool.query('SELECT * FROM diffuseur_scenes WHERE id = $1', [id])).rows[0];
  if (!s) throw erreur(404, 'Scène introuvable');
  const assets = (await db.pool.query('SELECT * FROM diffuseur_assets WHERE scene_id = $1 ORDER BY ordre, id', [id])).rows;
  const ims = (await db.pool.query('SELECT * FROM diffuseur_images WHERE scene_id = $1 ORDER BY ordre, id', [id])).rows;
  return { scene: s, assets, images: ims.map(imagePublique), plateformes: plateformesPermises(s) };
}

async function remplacerAssets(db, sceneId, assets) {
  if (!Array.isArray(assets)) return;
  const propres = assets.map((a) => ({ id: parseInt(a.id, 10) || null, nom: String(a.nom || '').trim(), url: httpsOuRien(a.url_affilie) })).filter((a) => a.nom);
  const garder = propres.map((a) => a.id).filter(Boolean);
  await db.pool.query('DELETE FROM diffuseur_assets WHERE scene_id = $1 AND NOT (id = ANY($2::int[]))', [sceneId, garder]);
  // Une image qui pointait vers un asset supprimé perd son asset principal.
  await db.pool.query('UPDATE diffuseur_images SET asset_id = NULL WHERE scene_id = $1 AND asset_id IS NOT NULL AND NOT (asset_id = ANY($2::int[]))', [sceneId, garder]);
  let ordre = 0;
  for (const a of propres) {
    if (a.id) await db.pool.query('UPDATE diffuseur_assets SET nom = $3, url_affilie = $4, ordre = $5 WHERE id = $1 AND scene_id = $2', [a.id, sceneId, a.nom, a.url, ordre]);
    else await db.pool.query('INSERT INTO diffuseur_assets (scene_id, nom, url_affilie, ordre) VALUES ($1, $2, $3, $4)', [sceneId, a.nom, a.url, ordre]);
    ordre++;
  }
}

async function createScene(db, b = {}) {
  const nom = String(b.nom || '').trim();
  if (!nom) throw erreur(400, 'Nom de la scène requis');
  const s = (await db.pool.query(
    'INSERT INTO diffuseur_scenes (nom, article_url, sensible, tableau_pinterest, notes) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [nom, httpsOuRien(b.article_url), !!b.sensible, String(b.tableau_pinterest || '').trim() || null, String(b.notes || '').trim() || null]
  )).rows[0];
  await remplacerAssets(db, s.id, b.assets || []);
  return getScene(db, s.id);
}

async function updateScene(db, id, b = {}) {
  const cur = (await getScene(db, id)).scene;
  const champs = {
    nom: b.nom !== undefined ? (String(b.nom).trim() || cur.nom) : cur.nom,
    article_url: b.article_url !== undefined ? httpsOuRien(b.article_url) : cur.article_url,
    sensible: b.sensible !== undefined ? !!b.sensible : cur.sensible,
    tableau_pinterest: b.tableau_pinterest !== undefined ? (String(b.tableau_pinterest || '').trim() || null) : cur.tableau_pinterest,
    notes: b.notes !== undefined ? (String(b.notes || '').trim() || null) : cur.notes
  };
  await db.pool.query('UPDATE diffuseur_scenes SET nom = $2, article_url = $3, sensible = $4, tableau_pinterest = $5, notes = $6, updated_at = NOW() WHERE id = $1',
    [id, champs.nom, champs.article_url, champs.sensible, champs.tableau_pinterest, champs.notes]);
  await remplacerAssets(db, id, b.assets);
  // Scène devenue sensible : ses publications sur les plateformes exclues sont supprimées
  // (et retirées de la file Bluesky si elles n'étaient pas parties).
  if (champs.sensible) {
    const exclus = (await db.pool.query('SELECT * FROM diffuseur_posts WHERE scene_id = $1 AND NOT (plateforme = ANY($2::text[]))', [id, R.PLATEFORMES_SENSIBLE])).rows;
    for (const p of exclus) await retirerBluesky(p);
    await db.pool.query("DELETE FROM diffuseur_posts WHERE scene_id = $1 AND NOT (plateforme = ANY($2::text[])) AND COALESCE(bluesky_etat, '') <> 'publie'", [id, R.PLATEFORMES_SENSIBLE]);
  }
  await recalculerLiens(db, id);
  return getScene(db, id);
}

async function deleteScene(db, id) {
  const { images: ims } = await getScene(db, id);
  const posts = (await db.pool.query('SELECT * FROM diffuseur_posts WHERE scene_id = $1', [id])).rows;
  for (const p of posts) await retirerBluesky(p);
  const fichiers = (await db.pool.query('SELECT * FROM diffuseur_images WHERE scene_id = $1', [id])).rows;
  for (const im of fichiers) await images.supprimer(im);
  await db.pool.query('DELETE FROM diffuseur_scenes WHERE id = $1', [id]);
  return { supprimee: true, images: ims.length };
}

// ─── Images ────────────────────────────────────────────────────────────────
async function addImages(db, sceneId, fichiers = []) {
  const { scene, assets } = await getScene(db, sceneId);
  if (!fichiers.length) throw erreur(400, 'Aucune image reçue');
  const max = (await db.pool.query('SELECT COALESCE(MAX(ordre), 0)::int AS m, COUNT(*) FILTER (WHERE principale)::int AS p FROM diffuseur_images WHERE scene_id = $1', [sceneId])).rows[0];
  let ordre = max.m; let principaleDejaLa = max.p > 0;
  const ajoutees = []; const echecs = [];
  for (const f of fichiers) {
    ordre++;
    try {
      const t = await images.traiterRendu(f.path, { scene: scene.nom, index: ordre, nomOriginal: f.originalname });
      // Par défaut : la première image est principale si un article existe ; asset = le premier.
      const principale = !principaleDejaLa && !!scene.article_url;
      if (principale) principaleDejaLa = true;
      const row = (await db.pool.query(
        `INSERT INTO diffuseur_images (scene_id, ordre, nom_original, fichier_original, largeur, hauteur, focal_x, focal_y, principale, asset_id, jpeg_nom, ig_nom, bs_nom)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
        [sceneId, ordre, f.originalname || null, t.fichier_original, t.largeur, t.hauteur, t.focal_x, t.focal_y, principale, assets[0] ? assets[0].id : null, t.jpeg_nom, t.ig_nom, t.bs_nom]
      )).rows[0];
      ajoutees.push(imagePublique(row));
    } catch (e) {
      await fs.promises.unlink(f.path).catch(() => {});
      echecs.push({ fichier: f.originalname, raison: e.message });
    }
  }
  return { ajoutees, echecs };
}

async function getImage(db, imageId) {
  const im = (await db.pool.query('SELECT * FROM diffuseur_images WHERE id = $1', [imageId])).rows[0];
  if (!im) throw erreur(404, 'Image introuvable');
  return im;
}

async function updateImage(db, imageId, b = {}) {
  const im = await getImage(db, imageId);
  const fx = b.focal_x !== undefined ? Math.min(1, Math.max(0, Number(b.focal_x))) : im.focal_x;
  const fy = b.focal_y !== undefined ? Math.min(1, Math.max(0, Number(b.focal_y))) : im.focal_y;
  if (Number.isNaN(fx) || Number.isNaN(fy)) throw erreur(422, 'Point d\'intérêt invalide');
  let assetId = im.asset_id;
  if (b.asset_id !== undefined) {
    assetId = b.asset_id ? parseInt(b.asset_id, 10) : null;
    if (assetId && !(await db.pool.query('SELECT 1 FROM diffuseur_assets WHERE id = $1 AND scene_id = $2', [assetId, im.scene_id])).rows[0]) throw erreur(422, 'Asset d\'une autre scène');
  }
  const principale = b.principale !== undefined ? !!b.principale : im.principale;
  const ordre = b.ordre !== undefined ? parseInt(b.ordre, 10) || im.ordre : im.ordre;
  if (fx !== im.focal_x || fy !== im.focal_y) await images.recadrer(im, { x: fx, y: fy });
  await db.pool.query('UPDATE diffuseur_images SET focal_x = $2, focal_y = $3, asset_id = $4, principale = $5, ordre = $6 WHERE id = $1', [imageId, fx, fy, assetId, principale, ordre]);
  await recalculerLiens(db, im.scene_id);
  return imagePublique(await getImage(db, imageId));
}

async function deleteImage(db, imageId) {
  const im = await getImage(db, imageId);
  const posts = (await db.pool.query('SELECT * FROM diffuseur_posts WHERE image_id = $1', [imageId])).rows;
  if (posts.some((p) => p.bluesky_etat === 'publie')) throw erreur(409, 'Image déjà publiée sur Bluesky : supprimez-la d\'abord sur la plateforme si besoin');
  for (const p of posts) await retirerBluesky(p);
  await images.supprimer(im);
  await db.pool.query('DELETE FROM diffuseur_images WHERE id = $1', [imageId]);
  return { supprimee: true };
}

// Liens par défaut des publications encore à valider (après changement d'asset, d'image
// principale ou d'article). Les publications validées gardent le lien choisi.
async function recalculerLiens(db, sceneId) {
  const scene = (await db.pool.query('SELECT * FROM diffuseur_scenes WHERE id = $1', [sceneId])).rows[0];
  const posts = (await db.pool.query(
    `SELECT p.id, p.plateforme, i.principale, a.url_affilie FROM diffuseur_posts p JOIN diffuseur_images i ON i.id = p.image_id
     LEFT JOIN diffuseur_assets a ON a.id = i.asset_id WHERE p.scene_id = $1 AND p.statut = 'a_valider'`, [sceneId])).rows;
  for (const p of posts) {
    const l = R.lienParDefaut({ plateforme: p.plateforme, principale: p.principale, articleUrl: scene.article_url, affilieUrl: p.url_affilie });
    await db.pool.query('UPDATE diffuseur_posts SET lien_type = $2, lien_url = $3 WHERE id = $1', [p.id, l.lien_type, l.lien_url]);
  }
}

// ─── Textes (Claude) ───────────────────────────────────────────────────────
// Une image à la fois : l'écran enchaîne les images et affiche l'avancement.
async function genererTextes(db, imageId, deps = {}) {
  const im = await getImage(db, imageId);
  const { scene, assets } = await getScene(db, im.scene_id);
  const asset = assets.find((a) => a.id === im.asset_id) || null;
  const imageBase64 = deps.imageBase64 || await images.pourAnalyse(im);
  const r = await textes.rediger({ scene, assets, image: { ...im, asset_nom: asset ? asset.nom : null }, imageBase64 }, { callModel: deps.callModel });
  await db.pool.query('UPDATE diffuseur_images SET description = $2, alt_fr = $3, alt_en = $4, mots_cles = $5, textes_le = NOW() WHERE id = $1',
    [imageId, r.description, r.alt.fr, r.alt.en, r.mots_cles.join(', ')]);
  const reglages = await getReglages(db);
  const crees = [];
  for (const plateforme of plateformesPermises(scene)) {
    const src = plateforme === 'pinterest'
      ? { titre_fr: r.pinterest.titre_fr, titre_en: r.pinterest.titre_en, texte_fr: r.pinterest.description_fr, texte_en: r.pinterest.description_en }
      : (plateforme === 'x' || plateforme === 'bluesky')
        ? { titre_fr: null, titre_en: null, texte_fr: r.court.fr, texte_en: r.court.en }
        : { titre_fr: null, titre_en: null, texte_fr: r.instagram.fr, texte_en: r.instagram.en };
    const l = R.lienParDefaut({ plateforme, principale: im.principale, articleUrl: scene.article_url, affilieUrl: asset ? asset.url_affilie : null });
    const exist = (await db.pool.query('SELECT * FROM diffuseur_posts WHERE image_id = $1 AND plateforme = $2', [imageId, plateforme])).rows[0];
    if (exist && exist.bluesky_etat === 'publie') continue; // déjà parti : on n'y touche plus
    if (exist) await retirerBluesky(exist);
    const row = (await db.pool.query(
      `INSERT INTO diffuseur_posts (scene_id, image_id, plateforme, langue, titre_fr, titre_en, texte_fr, texte_en, hashtags_fr, hashtags_en, lien_type, lien_url, heure, statut)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'a_valider')
       ON CONFLICT (image_id, plateforme) DO UPDATE SET titre_fr = EXCLUDED.titre_fr, titre_en = EXCLUDED.titre_en, texte_fr = EXCLUDED.texte_fr,
         texte_en = EXCLUDED.texte_en, hashtags_fr = EXCLUDED.hashtags_fr, hashtags_en = EXCLUDED.hashtags_en, lien_type = EXCLUDED.lien_type,
         lien_url = EXCLUDED.lien_url, statut = 'a_valider', bluesky_etat = NULL, bluesky_erreur = NULL, updated_at = NOW()
       RETURNING *`,
      [scene.id, imageId, plateforme, R.PLATEFORMES[plateforme].langue, src.titre_fr, src.titre_en, src.texte_fr, src.texte_en,
        r.hashtags_fr.join(', '), r.hashtags_en.join(', '), l.lien_type, l.lien_url, reglages.heures[plateforme]]
    )).rows[0];
    crees.push(row.id);
  }
  return { image: imagePublique(await getImage(db, imageId)), posts: crees.length, essais: r.essais };
}

// ─── Calendrier ────────────────────────────────────────────────────────────
// Une image par jour, publiée sur toutes ses plateformes ; scènes alternées. Les publications
// déjà parties sur Bluesky ne bougent pas. Les publications validées gardent leur statut et leur
// dépôt Bluesky est remplacé à la nouvelle date.
async function planifier(db, { scene_ids, debut, jours = 30 } = {}) {
  const ids = (Array.isArray(scene_ids) ? scene_ids : []).map((x) => parseInt(x, 10)).filter(Boolean);
  if (!ids.length) throw erreur(400, 'Choisissez au moins une scène');
  const ims = (await db.pool.query(
    `SELECT i.id, i.scene_id, i.ordre, i.principale FROM diffuseur_images i
     WHERE i.scene_id = ANY($1::int[]) AND EXISTS (SELECT 1 FROM diffuseur_posts p WHERE p.image_id = i.id AND p.statut <> 'rejete')
       AND NOT EXISTS (SELECT 1 FROM diffuseur_posts p WHERE p.image_id = i.id AND p.bluesky_etat = 'publie')`, [ids])).rows;
  if (!ims.length) throw erreur(422, 'Aucune image avec des textes à planifier : rédigez d\'abord les textes');
  const { planning, non_planifiees } = R.planCalendar(ims, { debut, jours: Math.min(60, Math.max(1, parseInt(jours, 10) || 30)), ordreScenes: ids });
  await db.pool.query(
    `UPDATE diffuseur_posts SET date_prevue = NULL, updated_at = NOW() WHERE image_id = ANY($1::int[]) AND COALESCE(bluesky_etat, '') <> 'publie'`,
    [non_planifiees]
  );
  for (const p of planning) {
    await db.pool.query(`UPDATE diffuseur_posts SET date_prevue = $2, updated_at = NOW() WHERE image_id = $1 AND COALESCE(bluesky_etat, '') <> 'publie'`, [p.image_id, p.date]);
  }
  await synchroniserDepots(db);
  return { planifiees: planning.length, non_planifiees: non_planifiees.length, debut, fin: planning.length ? planning[planning.length - 1].date : null, planning };
}

// ─── Publications ──────────────────────────────────────────────────────────
async function postsDetailles(db, where, params) {
  const reglages = await getReglages(db);
  const base = { fr: liste(reglages.hashtags_fr), en: liste(reglages.hashtags_en) };
  const r = await db.pool.query(
    `SELECT p.*, s.nom AS scene_nom, s.tableau_pinterest AS scene_tableau, i.jpeg_nom, i.ig_nom, i.bs_nom, i.alt_fr, i.alt_en, i.mots_cles, i.principale
     FROM diffuseur_posts p JOIN diffuseur_scenes s ON s.id = p.scene_id JOIN diffuseur_images i ON i.id = p.image_id
     ${where} ORDER BY p.date_prevue NULLS LAST, p.image_id, array_position(ARRAY['instagram','facebook','pinterest','x','bluesky']::text[], p.plateforme::text)`, params);
  return r.rows.map((p) => {
    const c = R.composer({ ...p, hashtags_fr: liste(p.hashtags_fr), hashtags_en: liste(p.hashtags_en) }, { hashtagsBase: base });
    return {
      ...p,
      date_prevue: jour(p.date_prevue),
      heure: p.heure || reglages.heures[p.plateforme],
      final: c,
      image_url: images.urlPublique(p.plateforme === 'instagram' ? p.ig_nom : p.plateforme === 'bluesky' ? p.bs_nom : p.jpeg_nom),
      tableau: p.scene_tableau || reglages.tableau_pinterest || null
    };
  });
}

async function listPosts(db, q = {}) {
  const cond = []; const params = [];
  const add = (sql, v) => { params.push(v); cond.push(sql.replace('?', `$${params.length}`)); };
  if (q.scene_id) add('p.scene_id = ?', parseInt(q.scene_id, 10));
  if (q.plateforme && PLATEFORMES.includes(q.plateforme)) add('p.plateforme = ?', q.plateforme);
  if (q.statut && ['a_valider', 'valide', 'rejete'].includes(q.statut)) add('p.statut = ?', q.statut);
  if (q.from) add('p.date_prevue >= ?', q.from);
  if (q.to) add('p.date_prevue <= ?', q.to);
  return postsDetailles(db, cond.length ? `WHERE ${cond.join(' AND ')}` : '', params);
}

async function getPost(db, id) {
  const p = (await postsDetailles(db, 'WHERE p.id = $1', [id]))[0];
  if (!p) throw erreur(404, 'Publication introuvable');
  return p;
}

// Contrôle avant validation : textes conformes aux règles de ton, longueur dans la limite, date.
function controleValidation(p) {
  if (!p.date_prevue) return 'Planifiez d\'abord la publication (calendrier)';
  if (p.final.depasse) return `Texte trop long pour ${R.PLATEFORMES[p.plateforme].label} : ${p.final.longueur} sur ${p.final.limite}`;
  const aVerifier = [p.langue !== 'en' ? p.texte_fr : null, p.langue !== 'fr' ? p.texte_en : null, p.titre_fr, p.titre_en].filter(Boolean);
  for (const t of aVerifier) {
    const e = R.controlerTexte(t).filter((x) => x !== 'tiret cadratin');
    if (e.length) return `Texte non conforme : ${e.join(', ')}`;
  }
  return null;
}

async function updatePost(db, id, b = {}) {
  const cur = await getPost(db, id);
  if (cur.bluesky_etat === 'publie') throw erreur(409, 'Déjà publiée sur Bluesky : plus modifiable');
  const champs = {};
  for (const k of ['texte_fr', 'texte_en', 'titre_fr', 'titre_en']) if (b[k] !== undefined) champs[k] = String(b[k] || '').slice(0, 5000);
  if (b.langue !== undefined) { if (!R.LANGUES.includes(b.langue)) throw erreur(422, 'Langue invalide'); champs.langue = b.langue; }
  if (b.heure !== undefined) { if (!/^\d{2}:\d{2}$/.test(String(b.heure))) throw erreur(422, 'Heure invalide (HH:MM)'); champs.heure = b.heure; }
  if (b.date_prevue !== undefined) {
    if (b.date_prevue && !/^\d{4}-\d{2}-\d{2}$/.test(String(b.date_prevue))) throw erreur(422, 'Date invalide (AAAA-MM-JJ)');
    champs.date_prevue = b.date_prevue || null;
  }
  if (b.lien_type !== undefined) {
    if (!['affilie', 'article', 'aucun'].includes(b.lien_type)) throw erreur(422, 'Type de lien invalide');
    const ctx = (await db.pool.query(
      `SELECT s.article_url, a.url_affilie FROM diffuseur_posts p JOIN diffuseur_scenes s ON s.id = p.scene_id JOIN diffuseur_images i ON i.id = p.image_id
       LEFT JOIN diffuseur_assets a ON a.id = i.asset_id WHERE p.id = $1`, [id])).rows[0] || {};
    const url = b.lien_type === 'affilie' ? (httpsOuRien(b.lien_url) || ctx.url_affilie) : b.lien_type === 'article' ? ctx.article_url : null;
    if (b.lien_type !== 'aucun' && !url) throw erreur(422, b.lien_type === 'affilie' ? 'Aucun lien affilié pour l\'asset de cette image' : 'La scène n\'a pas d\'article jurojin.net');
    champs.lien_type = b.lien_type; champs.lien_url = url;
  }
  const modifieContenu = Object.keys(champs).length > 0;
  if (b.statut !== undefined) {
    if (!['a_valider', 'valide', 'rejete'].includes(b.statut)) throw erreur(422, 'Statut invalide');
    champs.statut = b.statut;
  } else if (modifieContenu && cur.statut === 'valide') {
    // Un texte modifié après validation se relit : il repasse « à valider ».
    champs.statut = 'a_valider';
  }
  const keys = Object.keys(champs);
  if (keys.length) await db.pool.query(`UPDATE diffuseur_posts SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`, [id, ...keys.map((k) => champs[k])]);
  const apres = await getPost(db, id);
  if (apres.statut === 'valide') {
    const pb = controleValidation(apres);
    if (pb) {
      // Refus : la publication reste (ou repasse) « à valider », et son dépôt Bluesky est retiré.
      await db.pool.query("UPDATE diffuseur_posts SET statut = 'a_valider' WHERE id = $1", [id]);
      await synchroniserDepot(db, { ...apres, statut: 'a_valider' });
      throw erreur(422, pb);
    }
  }
  await synchroniserDepot(db, apres);
  return getPost(db, id);
}

async function validerPlusieurs(db, ids, statut = 'valide') {
  const out = { modifiees: 0, refusees: [] };
  for (const id of ids) {
    try { await updatePost(db, id, { statut }); out.modifiees++; } catch (e) { out.refusees.push({ id, raison: e.message }); }
  }
  return out;
}

// ─── Bluesky : dépôt dans le dossier d'échange de JurojinReposter ──────────
function dossiersBluesky() {
  const inbox = process.env.DIFFUSEUR_BLUESKY_INBOX || '/home/jurojinn/auto.spindel.fr/JurojinReposter/data/crm_inbox';
  return { inbox, outbox: path.join(path.dirname(inbox), 'crm_outbox') };
}
const fichierDepot = (id) => path.join(dossiersBluesky().inbox, `crm-${id}.json`);

async function retirerBluesky(post) {
  if (!post || post.plateforme !== 'bluesky' || post.bluesky_etat === 'publie') return false;
  try { await fs.promises.unlink(fichierDepot(post.id)); return true; } catch { return false; }
}

// Dépose (ou remplace) le fichier d'une publication Bluesky validée et datée ; sinon le retire.
async function synchroniserDepot(db, p) {
  if (p.plateforme !== 'bluesky' || p.bluesky_etat === 'publie') return;
  // En cours de publication par JurojinReposter : on ne touche pas au fichier réservé.
  if (fs.existsSync(`${fichierDepot(p.id)}.processing`)) return;
  if (p.statut !== 'valide' || !p.date_prevue || !p.bs_nom) {
    const retire = await retirerBluesky(p);
    if (retire || p.bluesky_etat === 'depose') await db.pool.query('UPDATE diffuseur_posts SET bluesky_etat = NULL WHERE id = $1', [p.id]);
    return;
  }
  const { inbox } = dossiersBluesky();
  await fs.promises.mkdir(inbox, { recursive: true });
  const langue = p.langue === 'en' ? 'en' : 'fr';
  const contenu = {
    version: 1,
    id: p.id,
    texte: p.final.texte,
    lien: p.final.lien,
    image_path: images.cheminPublic(p.bs_nom),
    image_url: images.urlPublique(p.bs_nom),
    alt: (langue === 'en' ? p.alt_en : p.alt_fr) || p.alt_fr || p.alt_en || '',
    publier_a: R.parisVersUtc(p.date_prevue, p.heure),
    depose_le: new Date().toISOString(),
    tentatives: 0
  };
  const tmp = `${fichierDepot(p.id)}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(contenu, null, 2));
  await fs.promises.rename(tmp, fichierDepot(p.id));
  await db.pool.query("UPDATE diffuseur_posts SET bluesky_etat = 'depose', bluesky_erreur = NULL WHERE id = $1", [p.id]);
}

async function synchroniserDepots(db) {
  const ps = await postsDetailles(db, "WHERE p.plateforme = 'bluesky' AND COALESCE(p.bluesky_etat, '') <> 'publie'", []);
  for (const p of ps) await synchroniserDepot(db, p);
}

// Résultats écrits par JurojinReposter : { id, statut: 'publie'|'erreur', uri, erreur, publie_le }.
async function lireResultatsBluesky(db) {
  const { outbox } = dossiersBluesky();
  let noms = [];
  try { noms = (await fs.promises.readdir(outbox)).filter((n) => /^crm-\d+\.json$/.test(n)); } catch { return { lus: 0 }; }
  let lus = 0;
  for (const n of noms) {
    const f = path.join(outbox, n);
    let r;
    try { r = JSON.parse(await fs.promises.readFile(f, 'utf8')); } catch { continue; }
    const id = parseInt(r.id, 10);
    if (!id) continue;
    if (r.statut === 'publie') {
      await db.pool.query("UPDATE diffuseur_posts SET bluesky_etat = 'publie', bluesky_uri = $2, bluesky_erreur = NULL, publie_at = COALESCE($3::timestamptz, NOW()) WHERE id = $1",
        [id, r.uri || null, r.publie_le || null]);
    } else {
      await db.pool.query("UPDATE diffuseur_posts SET bluesky_etat = 'erreur', bluesky_erreur = $2 WHERE id = $1", [id, String(r.erreur || 'erreur inconnue').slice(0, 500)]);
    }
    await fs.promises.mkdir(path.join(outbox, 'archive'), { recursive: true });
    await fs.promises.rename(f, path.join(outbox, 'archive', `${n.replace(/\.json$/, '')}-${Date.now()}.json`)).catch(() => fs.promises.unlink(f).catch(() => {}));
    lus++;
  }
  return { lus };
}

// ─── Exports ───────────────────────────────────────────────────────────────
// pinterest : épingles (image 2:3, titre, description, lien, tableau, date)
// meta      : Instagram (recadrage 4:5) et Facebook, pour l'import Meta Business Suite
// x         : texte à publier à la main, avec l'image à joindre
async function exporter(db, cible, q = {}) {
  const reglages = await getReglages(db);
  const plateformes = cible === 'pinterest' ? ['pinterest'] : cible === 'meta' ? ['instagram', 'facebook'] : cible === 'x' ? ['x'] : null;
  if (!plateformes) throw erreur(400, 'Export inconnu');
  const posts = (await listPosts(db, { statut: 'valide', from: q.from, to: q.to })).filter((p) => plateformes.includes(p.plateforme) && p.date_prevue);
  const lignes = posts.map((p) => ({
    plateforme: R.PLATEFORMES[p.plateforme].label,
    titre: p.final.titre || '',
    texte: p.final.texte,
    lien: p.final.lien || '',
    media_url: p.image_url,
    vignette: '',
    tableau: p.tableau || '',
    date: p.date_prevue,
    heure: p.heure,
    date_iso: R.parisVersUtc(p.date_prevue, p.heure).replace(/Z$/, ''),
    mots_cles: p.mots_cles || '',
    alt: (p.langue === 'en' ? p.alt_en : p.alt_fr) || ''
  }));
  return { csv: R.csvExport(reglages.entetes[cible], lignes), nb: lignes.length, fichier: `diffusion-${cible}-${q.from || 'tout'}${q.to ? `-${q.to}` : ''}.csv` };
}

module.exports = {
  getReglages, updateReglages, listScenes, getScene, createScene, updateScene, deleteScene,
  addImages, updateImage, deleteImage, genererTextes, planifier, listPosts, getPost, updatePost, validerPlusieurs,
  synchroniserDepots, lireResultatsBluesky, exporter, dossiersBluesky, PLATEFORMES
};
