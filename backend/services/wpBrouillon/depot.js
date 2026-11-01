// Dépôts : dossier dédié sur le serveur, rempli par Claude lui-même via un lien d'envoi à usage unique.
// Le jeton n'est jamais stocké (seulement son SHA-256) ; le lien expire vite et ne sert qu'une fois.
// Réception : un zip (champ « lot ») ou des fichiers séparés (champ « fichiers », nom = chemin relatif).
// Chaque chemin est confiné au dossier du dépôt : absolu, « .. », lien symbolique refusés.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RACINE = process.env.WP_DEPOTS_DIR || path.join(__dirname, '..', '..', 'uploads', 'wp-depots');
const DUREE_MIN = 30;
const MAX_FICHIERS = 300;
const MAX_TOTAL = 1024 * 1024 * 1024;        // 1 Go par dépôt
const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');

/** Chemin relatif sûr (« images/a.jpg ») ou erreur. */
function cheminSur(brut) {
  const p = String(brut || '').replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (!p || p.startsWith('/') || /^[a-z]:/i.test(p) || p.includes('\0')) throw Object.assign(new Error(`chemin refusé : ${brut}`), { code: 'chemin' });
  const parts = p.split('/').filter((x) => x !== '' && x !== '.');
  if (!parts.length || parts.some((x) => x === '..') || parts.length > 8) throw Object.assign(new Error(`chemin refusé : ${brut}`), { code: 'chemin' });
  if (parts[0] === '__MACOSX' || parts[parts.length - 1].startsWith('._')) return null;   // déchets d'archive macOS
  return parts.join('/');
}

/** Résout un chemin du dépôt en chemin disque, sans jamais sortir du dossier ni suivre de lien. */
function resoudre(dossier, relatif) {
  const rel = cheminSur(relatif);
  if (!rel) throw Object.assign(new Error(`chemin refusé : ${relatif}`), { code: 'chemin' });
  const abs = path.resolve(dossier, rel);
  if (!abs.startsWith(path.resolve(dossier) + path.sep)) throw Object.assign(new Error(`chemin hors du dépôt : ${relatif}`), { code: 'chemin' });
  let courant = path.resolve(dossier);
  for (const part of rel.split('/')) {
    courant = path.join(courant, part);
    if (fs.existsSync(courant) && fs.lstatSync(courant).isSymbolicLink()) throw Object.assign(new Error(`lien symbolique refusé : ${relatif}`), { code: 'chemin' });
  }
  return abs;
}

const dossierDe = (id) => path.join(RACINE, String(id));

async function creer(db, siteId) {
  const { rows: s } = await db.pool.query('SELECT id FROM seo_sites WHERE id = $1', [siteId]);
  if (!s[0]) throw Object.assign(new Error(`site ${siteId} inconnu du CRM`), { status: 404 });
  const jeton = crypto.randomBytes(32).toString('base64url');
  const { rows } = await db.pool.query(
    `INSERT INTO seo_wp_depots (site_id, jeton_hash, expire_le) VALUES ($1, $2, NOW() + $3::int * interval '1 minute') RETURNING id, expire_le`,
    [siteId, sha(jeton), DUREE_MIN]);
  return { depot: rows[0].id, jeton, expire_le: rows[0].expire_le };
}

/** Extrait un zip dans le dossier du dépôt, entrée par entrée, sans jamais faire confiance aux noms. */
function extraireZip(zipChemin, dossier) {
  const yauzl = require('yauzl');
  return new Promise((ok, ko) => {
    yauzl.open(zipChemin, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: false }, (err, zip) => {
      // la bibliothèque refuse elle-même les chemins absolus ou qui remontent (« .. ») : message en clair
      const traduire = (x) => (/invalid relative path|absolute path|invalid characters/i.test(x.message)
        ? Object.assign(new Error(`chemin refusé dans le zip (${x.message.replace(/^.*?: /, '')})`), { code: 'chemin' })
        : Object.assign(new Error(`zip illisible : ${x.message}`), { code: 'zip' }));
      if (err) return ko(traduire(err));
      const fichiers = []; let total = 0;
      zip.on('error', (e) => ko(traduire(e)));
      zip.on('end', () => ok(fichiers));
      zip.on('entry', (e) => {
        try {
          if (/\/$/.test(e.fileName)) return zip.readEntry();                       // dossier
          const mode = (e.externalFileAttributes >>> 16) & 0o170000;
          if (mode === 0o120000) throw Object.assign(new Error(`lien symbolique refusé dans le zip : ${e.fileName}`), { code: 'chemin' });
          const rel = cheminSur(e.fileName);
          if (!rel) return zip.readEntry();
          if (fichiers.length >= MAX_FICHIERS) throw Object.assign(new Error(`plus de ${MAX_FICHIERS} fichiers`), { code: 'taille' });
          total += e.uncompressedSize;
          if (total > MAX_TOTAL) throw Object.assign(new Error('dépôt de plus de 1 Go'), { code: 'taille' });
          const cible = resoudre(dossier, rel);
          fs.mkdirSync(path.dirname(cible), { recursive: true });
          zip.openReadStream(e, (err2, flux) => {
            if (err2) return ko(err2);
            const out = fs.createWriteStream(cible, { flags: 'wx' });
            flux.on('error', ko); out.on('error', ko);
            out.on('finish', () => { fichiers.push({ chemin: rel, octets: e.uncompressedSize }); zip.readEntry(); });
            flux.pipe(out);
          });
        } catch (x) { zip.close(); ko(x); }
      });
      zip.readEntry();
    });
  });
}

/**
 * Réception par le lien d'envoi. fichiersRecus : fichiers multer ({ fieldname, originalname, path, size }).
 * Un dépôt ne reçoit qu'un envoi ; le lien est ensuite inutilisable.
 */
async function recevoir(db, jeton, fichiersRecus) {
  const { rows } = await db.pool.query(
    `UPDATE seo_wp_depots SET statut = 'reception' WHERE jeton_hash = $1 AND statut = 'attente' AND expire_le > NOW() RETURNING id, site_id`,
    [sha(String(jeton || ''))]);
  if (!rows[0]) throw Object.assign(new Error('lien d\'envoi inconnu, expiré ou déjà utilisé'), { status: 410 });
  const id = rows[0].id;
  const dossier = dossierDe(id);
  fs.rmSync(dossier, { recursive: true, force: true });                         // dossier neuf pour chaque réception
  fs.mkdirSync(dossier, { recursive: true });
  try {
    let fichiers = [];
    const lots = fichiersRecus.filter((f) => f.fieldname === 'lot');
    const separes = fichiersRecus.filter((f) => f.fieldname === 'fichiers');
    if (!lots.length && !separes.length) throw Object.assign(new Error('rien reçu : envoyer un zip (champ « lot ») ou des fichiers (champ « fichiers »)'), { status: 400 });
    for (const z of lots) fichiers.push(...await extraireZip(z.path, dossier));
    for (const f of separes) {
      const rel = cheminSur(f.originalname);
      if (!rel) continue;
      const cible = resoudre(dossier, rel);
      fs.mkdirSync(path.dirname(cible), { recursive: true });
      fs.copyFileSync(f.path, cible, fs.constants.COPYFILE_EXCL);
      fichiers.push({ chemin: rel, octets: f.size });
    }
    if (fichiers.length > MAX_FICHIERS) throw Object.assign(new Error(`plus de ${MAX_FICHIERS} fichiers`), { status: 413 });
    await db.pool.query(`UPDATE seo_wp_depots SET statut = 'recu', fichiers = $2, recu_le = NOW() WHERE id = $1`, [id, JSON.stringify(fichiers)]);
    return { depot: id, fichiers: fichiers.length, octets: fichiers.reduce((n, f) => n + f.octets, 0), manifeste: fichiers.some((f) => /(^|\/)manifeste-wp\.json$/.test(f.chemin)) };
  } catch (e) {
    fs.rmSync(dossier, { recursive: true, force: true });                     // envoi raté : dossier vidé, lien inutilisable
    await db.pool.query(`UPDATE seo_wp_depots SET statut = 'echec' WHERE id = $1`, [id]);
    throw Object.assign(e, { status: e.status || 400 });
  } finally {
    for (const f of fichiersRecus) fs.rm(f.path, { force: true }, () => {});
  }
}

/** Dépôt reçu : dossier et chemin du manifeste (manifeste-wp.json, à la racine ou dans un seul sous-dossier). */
async function ouvrir(db, depotId) {
  const { rows } = await db.pool.query('SELECT id, site_id, statut, fichiers FROM seo_wp_depots WHERE id = $1', [depotId]);
  const d = rows[0];
  if (!d) throw Object.assign(new Error(`dépôt ${depotId} inconnu`), { status: 404 });
  if (d.statut !== 'recu') throw Object.assign(new Error(`dépôt ${depotId} : ${d.statut === 'attente' ? 'rien reçu pour l\'instant (envoyer le zip au lien d\'envoi)' : d.statut}`), { status: 409 });
  const mans = (d.fichiers || []).map((f) => f.chemin).filter((c) => /(^|\/)manifeste-wp\.json$/.test(c));
  if (mans.length !== 1) throw Object.assign(new Error(mans.length ? 'plusieurs manifeste-wp.json dans le dépôt' : 'manifeste-wp.json absent du dépôt'), { status: 400 });
  const dossier = dossierDe(d.id);
  const base = path.posix.dirname(mans[0]) === '.' ? '' : path.posix.dirname(mans[0]);
  return { id: d.id, site_id: d.site_id, dossier, base, manifeste: resoudre(dossier, mans[0]), fichiers: d.fichiers };
}

module.exports = { creer, recevoir, ouvrir, resoudre, cheminSur, dossierDe, RACINE, DUREE_MIN };
