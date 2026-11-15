// Sauvegarde de la base hors du serveur, sur Google Drive, CHIFFRÉE, sans aucune commande à taper.
//
// - Connexion : un bouton dans Paramètres > Sauvegardes ouvre Google (même client OAuth et même adresse de retour
//   que la connexion Search Console du CRM) avec le seul scope drive.file : le CRM ne voit que les fichiers qu'il
//   dépose, pas le reste du Drive. Jeton gardé dans sauvegarde_drive (une seule ligne).
// - Clé : 32 octets aléatoires créés à la connexion, dans backend/config/sauvegarde-drive.key (lisible par le seul
//   compte du CRM, hors du dépôt et hors des sauvegardes de la base). Elle s'affiche UNE fois dans l'interface,
//   pour que Marc la range dans son gestionnaire de mots de passe : sans elle, une copie est illisible.
// - Chaque nuit (3 h 41) : pg_dump → chiffrement AES-256-GCM → dossier Drive « crm-sauvegardes » ; les copies de
//   plus de garder_jours (30 par défaut) déposées par le CRM sont retirées de ce dossier.
// - Chaque semaine (dimanche 5 h 23) : la dernière copie est redescendue, déchiffrée et relue (pg_restore --list,
//   tables présentes, charte comprise). Un échec, de l'envoi comme du test, part par mail (ALERT_EMAIL).
// Format d'une copie : « CRMSAUV1 » (8 octets) | vecteur d'initialisation (12) | données chiffrées | étiquette (16).
// Relire une copie sans le CRM : node backend/scripts/dechiffrer-sauvegarde.js <copie> (la clé est demandée).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { pipeline } = require('stream/promises');

const DOSSIER = 'crm-sauvegardes';
const MAGIQUE = Buffer.from('CRMSAUV1');
const RE_COPIE = /^crm-\d{8}-\d{4}\.dump\.chiffre$/;
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const err = (status, message) => Object.assign(new Error(message), { status });
const fichierCle = () => process.env.SAUVEGARDE_CLE_FICHIER || path.join(__dirname, '..', 'config', 'sauvegarde-drive.key');

// ---------- tables ----------
async function assurerTable(q) {
  await q.query(`
    CREATE TABLE IF NOT EXISTS sauvegarde_drive (
      id                 INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      compte_email       TEXT,
      refresh_token      TEXT,
      scope              TEXT,
      dossier_id         TEXT,
      connecte_le        TIMESTAMPTZ,
      cle_empreinte      TEXT,
      cle_affichee_le    TIMESTAMPTZ,
      garder_jours       INTEGER DEFAULT 30,
      envoi_le           TIMESTAMPTZ,
      envoi_fichier      TEXT,
      envoi_octets       BIGINT,
      envoi_statut       TEXT,
      envoi_detail       TEXT,
      test_le            TIMESTAMPTZ,
      test_fichier       TEXT,
      test_statut        TEXT,
      test_detail        TEXT
    );`);
}
const ligne = async (db) => (await db.pool.query('SELECT * FROM sauvegarde_drive WHERE id = 1')).rows[0] || null;
async function maj(db, champs) {
  const k = Object.keys(champs);
  await db.pool.query(`INSERT INTO sauvegarde_drive (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  await db.pool.query(`UPDATE sauvegarde_drive SET ${k.map((x, i) => `${x} = $${i + 1}`).join(', ')} WHERE id = 1`, k.map((x) => champs[x]));
}

// ---------- clé et chiffrement ----------
const empreinte = (cle) => crypto.createHash('sha256').update(cle).digest('hex').slice(0, 16);
function lireCle() {
  try { const c = Buffer.from(fs.readFileSync(fichierCle(), 'utf8').trim(), 'base64'); return c.length === 32 ? c : null; } catch { return null; }
}
function creerCleSiAbsente() {
  const deja = lireCle();
  if (deja) return { cle: deja, creee: false };
  const cle = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(fichierCle()), { recursive: true });
  fs.writeFileSync(fichierCle(), `${cle.toString('base64')}\n`, { mode: 0o600 });
  return { cle, creee: true };
}
// Clé au format lisible pour un gestionnaire de mots de passe (base64, par groupes de 4).
const cleLisible = (cle) => cle.toString('base64').match(/.{1,4}/g).join(' ');
const cleDepuisTexte = (t) => { const c = Buffer.from(String(t || '').replace(/\s+/g, ''), 'base64'); if (c.length !== 32) throw err(400, 'clé invalide : 44 caractères base64 attendus (32 octets)'); return c; };

async function chiffrer(source, cible, cle) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cle, iv);
  const out = fs.createWriteStream(cible, { mode: 0o600 });
  out.write(Buffer.concat([MAGIQUE, iv]));
  await pipeline(fs.createReadStream(source), c, out, { end: false }).catch(async (e) => { out.destroy(); throw e; });
  await new Promise((ok, ko) => out.end(c.getAuthTag(), (e) => (e ? ko(e) : ok())));
}
async function dechiffrer(source, cible, cle) {
  const taille = fs.statSync(source).size;
  if (taille < MAGIQUE.length + 12 + 16) throw err(422, 'copie trop courte : fichier tronqué');
  const fd = fs.openSync(source, 'r');
  const tete = Buffer.alloc(MAGIQUE.length + 12); fs.readSync(fd, tete, 0, tete.length, 0);
  const tag = Buffer.alloc(16); fs.readSync(fd, tag, 0, 16, taille - 16);
  fs.closeSync(fd);
  if (!tete.subarray(0, MAGIQUE.length).equals(MAGIQUE)) throw err(422, 'ce fichier n\'est pas une copie chiffrée du CRM');
  const d = crypto.createDecipheriv('aes-256-gcm', cle, tete.subarray(MAGIQUE.length));
  d.setAuthTag(tag);
  try {
    await pipeline(fs.createReadStream(source, { start: tete.length, end: taille - 17 }), d, fs.createWriteStream(cible, { mode: 0o600 }));
  } catch (e) {
    fs.rmSync(cible, { force: true });
    throw err(422, /auth|unable to authenticate/i.test(e.message) ? 'déchiffrement refusé : mauvaise clé, ou copie abîmée' : `déchiffrement impossible : ${e.message}`);
  }
}

// ---------- PostgreSQL (mêmes réglages que le backend) ----------
const executer = (cmd, args, env = {}) => new Promise((ok, ko) => execFile(cmd, args, { env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 }, (e, stdout, stderr) => (e ? ko(Object.assign(e, { message: String(stderr || e.message).trim() })) : ok(stdout))));
async function pgDump(cible) {
  await executer('pg_dump', ['-h', process.env.DB_HOST || 'localhost', '-p', String(process.env.DB_PORT || 5432), '-U', process.env.DB_USER || 'postgres', '-Fc', '-f', cible, process.env.DB_NAME || 'mcrm_dev'], { PGPASSWORD: process.env.DB_PASSWORD || '' });
}
async function relireDump(fichier) {
  const liste = await executer('pg_restore', ['--list', fichier]);
  const tables = (liste.match(/ TABLE DATA /g) || []).length;
  return { tables, charte: / TABLE DATA \S+ charte_versions /.test(liste) };
}

// ---------- Google Drive ----------
function oauthClient() {
  const { google } = require('googleapis');
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
}
function driveDe(refreshToken) {
  const { google } = require('googleapis');
  const auth = oauthClient();
  auth.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth });
}
const messageGoogle = (e) => {
  const m = (e && e.response && e.response.data && e.response.data.error && (e.response.data.error.message || e.response.data.error_description || e.response.data.error)) || (e && e.message) || String(e);
  if (/has not been used|is disabled/i.test(m)) return `l'API Google Drive n'est pas activée dans le projet Google du CRM : l'activer une fois (Google Cloud > API et services > Google Drive API > Activer), puis réessayer. Détail : ${m}`;
  if (/invalid_grant/i.test(m)) return 'autorisation Google retirée ou expirée : reconnecter Google Drive dans Paramètres > Sauvegardes';
  return m;
};

// deps (tests) : { drive, pgDump, relireDump, mail, maintenant }
const D = (deps = {}) => ({ pgDump, relireDump, mail: alerter, maintenant: () => new Date(), ...deps });

async function dossierDrive(db, drive, r) {
  if (r.dossier_id) {
    try { const f = await drive.files.get({ fileId: r.dossier_id, fields: 'id, trashed' }); if (f.data && !f.data.trashed) return r.dossier_id; } catch { /* recréé ci-dessous */ }
  }
  const l = await drive.files.list({ q: `name = '${DOSSIER}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`, fields: 'files(id, name)', spaces: 'drive' });
  let id = l.data.files && l.data.files[0] && l.data.files[0].id;
  if (!id) id = (await drive.files.create({ requestBody: { name: DOSSIER, mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' })).data.id;
  await maj(db, { dossier_id: id });
  return id;
}
async function copiesDrive(drive, dossier) {
  const l = await drive.files.list({ q: `'${dossier}' in parents and trashed = false`, orderBy: 'createdTime desc', fields: 'files(id, name, size, createdTime)', pageSize: 200, spaces: 'drive' });
  return (l.data.files || []).filter((f) => RE_COPIE.test(f.name));
}
const stamp = (d) => d.toLocaleString('sv-SE', { timeZone: 'Europe/Paris' }).replace(/[-:]/g, '').replace(' ', '-').slice(0, 13);

// ---------- connexion (appelée par le retour Google) ----------
async function enregistrerConnexion(db, { refresh_token: rt, scope, email }) {
  await assurerTable(db.pool);
  if (!rt) throw err(400, 'Google n\'a pas renvoyé de jeton durable : relancer la connexion');
  if (!String(scope || '').includes(SCOPE)) throw err(400, 'autorisation Google Drive (drive.file) non accordée : relancer la connexion et accepter l\'accès');
  const { cle } = creerCleSiAbsente();
  await maj(db, { compte_email: email || null, refresh_token: rt, scope, connecte_le: new Date(), cle_empreinte: empreinte(cle), envoi_statut: null, envoi_detail: null });
}

// ---------- envoi de la nuit ----------
async function envoyer(db, deps = {}) {
  const x = D(deps);
  await assurerTable(db.pool);
  const r = await ligne(db);
  if (!r || !r.refresh_token) throw err(409, 'Google Drive n\'est pas connecté : Paramètres > Sauvegardes');
  const cle = lireCle();
  if (!cle) throw err(500, `clé de chiffrement absente (${fichierCle()}) : reconnecter Google Drive pour en créer une`);
  if (r.cle_empreinte && r.cle_empreinte !== empreinte(cle)) throw err(500, 'la clé de chiffrement du serveur ne correspond pas à celle affichée à la connexion : rien envoyé');
  // jamais de copie que Marc ne pourrait pas relire : la clé doit avoir été affichée et rangée
  if (!r.cle_affichee_le) throw err(409, 'clé de chiffrement pas encore rangée : Paramètres > Sauvegardes, « Afficher la clé » puis « C\'est rangé »');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-sauv-'));
  const nom = `crm-${stamp(x.maintenant())}.dump.chiffre`;
  try {
    const dump = path.join(tmp, 'base.dump'), chiffre = path.join(tmp, nom);
    await x.pgDump(dump);
    const lu = await x.relireDump(dump);
    if (!lu.tables) throw new Error('pg_dump a produit une sauvegarde vide');
    await chiffrer(dump, chiffre, cle);
    fs.rmSync(dump, { force: true });
    const drive = x.drive || driveDe(r.refresh_token);
    const dossier = await dossierDrive(db, drive, r);
    const octets = fs.statSync(chiffre).size;
    await drive.files.create({ requestBody: { name: nom, parents: [dossier] }, media: { mimeType: 'application/octet-stream', body: fs.createReadStream(chiffre) }, fields: 'id, name, size' });
    // rotation : seulement les copies déposées par le CRM dans son dossier
    const limite = x.maintenant().getTime() - (Number(r.garder_jours) || 30) * 86400000;
    const retirees = [];
    for (const f of await copiesDrive(drive, dossier)) {
      if (f.name !== nom && new Date(f.createdTime).getTime() < limite) { await drive.files.delete({ fileId: f.id }); retirees.push(f.name); }
    }
    const detail = `${lu.tables} tables, ${(octets / 1048576).toFixed(1)} Mo chiffrés${retirees.length ? `, ${retirees.length} copie(s) de plus de ${r.garder_jours || 30} jours retirée(s)` : ''}`;
    await maj(db, { envoi_le: x.maintenant(), envoi_fichier: nom, envoi_octets: octets, envoi_statut: 'OK', envoi_detail: detail });
    return { statut: 'OK', fichier: nom, octets, tables: lu.tables, retirees };
  } catch (e) {
    const m = messageGoogle(e);
    await maj(db, { envoi_le: x.maintenant(), envoi_fichier: nom, envoi_statut: 'ÉCHEC', envoi_detail: m }).catch(() => {});
    await x.mail('Sauvegarde de la base : envoi sur Google Drive en échec', `La copie chiffrée de cette nuit n'a pas pu être envoyée sur Google Drive.\n\nRaison : ${m}\n\nLes sauvegardes locales du serveur continuent. À vérifier dans le CRM : Paramètres > Sauvegardes.`).catch(() => {});
    throw Object.assign(new Error(m), { status: e.status || 502 });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ---------- test de la semaine : redescendre, déchiffrer, relire ----------
async function tester(db, deps = {}) {
  const x = D(deps);
  await assurerTable(db.pool);
  const r = await ligne(db);
  if (!r || !r.refresh_token) throw err(409, 'Google Drive n\'est pas connecté : Paramètres > Sauvegardes');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-test-'));
  let nom = null;
  try {
    const cle = lireCle();
    if (!cle) throw new Error(`clé de chiffrement absente du serveur (${fichierCle()})`);
    const drive = x.drive || driveDe(r.refresh_token);
    const dossier = await dossierDrive(db, drive, r);
    const derniere = (await copiesDrive(drive, dossier))[0];
    if (!derniere) throw new Error(`aucune copie dans le dossier Drive « ${DOSSIER} »`);
    nom = derniere.name;
    const age = (x.maintenant().getTime() - new Date(derniere.createdTime).getTime()) / 86400000;
    const local = path.join(tmp, nom), dump = path.join(tmp, 'relu.dump');
    const flux = await drive.files.get({ fileId: derniere.id, alt: 'media' }, { responseType: 'stream' });
    await pipeline(flux.data, fs.createWriteStream(local));
    await dechiffrer(local, dump, cle);
    const lu = await x.relireDump(dump);
    if (!lu.tables) throw new Error('la copie déchiffrée ne contient aucune table');
    if (!lu.charte) throw new Error('la copie déchiffrée ne contient pas la charte de rédaction (charte_versions)');
    const detail = `${nom} : déchiffrée et relue, ${lu.tables} tables, charte comprise${age > 2 ? ` ; ATTENTION, copie vieille de ${Math.floor(age)} jours` : ''}`;
    await maj(db, { test_le: x.maintenant(), test_fichier: nom, test_statut: age > 2 ? 'ANCIENNE' : 'OK', test_detail: detail });
    if (age > 2) await x.mail('Sauvegarde de la base : la dernière copie sur Google Drive est ancienne', `${detail}.\n\nLes envois de la nuit ne passent sans doute plus : voir Paramètres > Sauvegardes dans le CRM.`).catch(() => {});
    return { statut: age > 2 ? 'ANCIENNE' : 'OK', fichier: nom, tables: lu.tables, age_jours: Math.floor(age) };
  } catch (e) {
    const m = messageGoogle(e);
    await maj(db, { test_le: x.maintenant(), test_fichier: nom, test_statut: 'ÉCHEC', test_detail: m }).catch(() => {});
    await x.mail('Sauvegarde de la base : le test de relecture a échoué', `Le test de la semaine n'a pas pu relire la dernière copie chiffrée sur Google Drive${nom ? ` (${nom})` : ''}.\n\nRaison : ${m}\n\nÀ vérifier dans le CRM : Paramètres > Sauvegardes.`).catch(() => {});
    throw Object.assign(new Error(m), { status: e.status || 502 });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

async function alerter(sujet, texte) {
  const mail = require('./emailService');
  const to = process.env.ALERT_EMAIL || process.env.REPORT_REPLY_TO || process.env.EMAIL_USER;
  if (!to) return;
  await mail.sendEmail({ to, subject: sujet, text: texte, html: `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;white-space:pre-line">${texte.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</div>` });
}

// ---------- interface ----------
async function etat(db) {
  await assurerTable(db.pool);
  const r = await ligne(db);
  const cle = lireCle();
  return {
    connecte: !!(r && r.refresh_token), compte: r && r.compte_email, connecte_le: r && r.connecte_le, dossier: DOSSIER, garder_jours: (r && r.garder_jours) || 30,
    cle: { presente: !!cle, a_afficher: !!(cle && r && r.refresh_token && !r.cle_affichee_le), affichee_le: r && r.cle_affichee_le, coherente: !!(cle && r && (!r.cle_empreinte || r.cle_empreinte === empreinte(cle))) },
    envoi: r && r.envoi_le ? { le: r.envoi_le, fichier: r.envoi_fichier, octets: r.envoi_octets, statut: r.envoi_statut, detail: r.envoi_detail } : null,
    test: r && r.test_le ? { le: r.test_le, fichier: r.test_fichier, statut: r.test_statut, detail: r.test_detail } : null,
    planning: 'envoi chaque nuit à 3 h 41 ; test de relecture le dimanche à 5 h 23',
  };
}
// La clé ne se montre qu'une fois : tant que Marc n'a pas confirmé l'avoir rangée.
async function cleAAfficher(db) {
  const r = await ligne(db);
  const cle = lireCle();
  if (!r || !r.refresh_token || !cle) throw err(409, 'Google Drive n\'est pas connecté');
  if (r.cle_affichee_le) throw err(410, `la clé a déjà été affichée le ${new Date(r.cle_affichee_le).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} : elle ne se montre qu'une fois`);
  return { cle: cleLisible(cle), empreinte: empreinte(cle) };
}
async function cleRangee(db) {
  await maj(db, { cle_affichee_le: new Date() });
  return etat(db);
}
async function reglages(db, { garder_jours: j }) {
  const n = Number(j);
  if (!Number.isInteger(n) || n < 7 || n > 365) throw err(400, 'garder_jours : entre 7 et 365');
  await maj(db, { garder_jours: n });
  return etat(db);
}

let jobs = [];
function start(db) {
  const cron = require('node-cron');
  assurerTable(db.pool).catch((e) => console.error('[Sauvegarde Drive] table :', e.message));
  const si = (fn, quoi) => async () => {
    const r = await ligne(db).catch(() => null);
    if (!r || !r.refresh_token) return;
    try { const x = await fn(db); console.log(`[Sauvegarde Drive] ${quoi} : ${x.statut} ${x.fichier || ''}`); } catch (e) { console.error(`[Sauvegarde Drive] ${quoi} en échec :`, e.message); }
  };
  jobs.push(cron.schedule('41 3 * * *', si(envoyer, 'envoi'), { timezone: 'Europe/Paris' }));
  jobs.push(cron.schedule('23 5 * * 0', si(tester, 'test de relecture'), { timezone: 'Europe/Paris' }));
}

module.exports = { SCOPE, DOSSIER, assurerTable, enregistrerConnexion, envoyer, tester, etat, cleAAfficher, cleRangee, reglages, start, chiffrer, dechiffrer, cleDepuisTexte, cleLisible, lireCle, creerCleSiAbsente };
