// Sauvegarde chiffrée sur Google Drive : chiffrement, clé affichée une fois, envoi de la nuit (vrai pg_dump), rotation,
// test de relecture de la semaine, alertes par mail ; faux Drive en mémoire (mêmes appels que googleapis).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const { execFileSync } = require('child_process');
const { hasDb, withSchema } = require('./helpers/db');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sauv-test-'));
process.env.SAUVEGARDE_CLE_FICHIER = path.join(TMP, 'cle', 'sauvegarde-drive.key');
const S = require('../services/sauvegardeDrive');

test('chiffrement AES-256-GCM : aller-retour, mauvaise clé et copie abîmée refusées, relecture sans le CRM', async () => {
  const crypto = require('crypto');
  const src = path.join(TMP, 'clair.bin'); fs.writeFileSync(src, crypto.randomBytes(300000));
  const cle = crypto.randomBytes(32);
  await S.chiffrer(src, path.join(TMP, 'c.chiffre'), cle);
  const c = fs.readFileSync(path.join(TMP, 'c.chiffre'));
  assert.equal(c.subarray(0, 8).toString(), 'CRMSAUV1');
  assert.equal(c.length, 300000 + 8 + 12 + 16);
  await S.dechiffrer(path.join(TMP, 'c.chiffre'), path.join(TMP, 'r.bin'), cle);
  assert.ok(fs.readFileSync(path.join(TMP, 'r.bin')).equals(fs.readFileSync(src)));
  await assert.rejects(S.dechiffrer(path.join(TMP, 'c.chiffre'), path.join(TMP, 'x.bin'), crypto.randomBytes(32)), /mauvaise clé, ou copie abîmée/);
  const abime = Buffer.from(c); abime[5000] ^= 1; fs.writeFileSync(path.join(TMP, 'abime.chiffre'), abime);
  await assert.rejects(S.dechiffrer(path.join(TMP, 'abime.chiffre'), path.join(TMP, 'x.bin'), cle), /mauvaise clé, ou copie abîmée/);
  assert.ok(!fs.existsSync(path.join(TMP, 'x.bin')), 'rien de partiel laissé');
  // Script de secours : clé au format affiché (groupes de 4 séparés par des espaces).
  const sortie = execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'dechiffrer-sauvegarde.js'), path.join(TMP, 'c.chiffre')], { env: { ...process.env, CLE_SAUVEGARDE: S.cleLisible(cle) } }).toString();
  assert.match(sortie, /Déchiffrée/);
  assert.ok(fs.readFileSync(path.join(TMP, 'c')).equals(fs.readFileSync(src)), 'le script redonne le fichier d\'origine');
  assert.throws(() => S.cleDepuisTexte('trop courte'), /44 caractères/);
});

test('état Google : but « drive » signé, ancien format toujours « seo », état falsifié refusé', () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'secret-de-test';
  const G = require('../services/seoGoogleAuth');
  assert.equal(G.verifyState(G.buildState('drive')), 'drive');
  assert.equal(G.verifyState(G.buildState()), 'seo');
  const crypto = require('crypto');
  const ts = String(Date.now());
  assert.equal(G.verifyState(`${ts}.${crypto.createHmac('sha256', process.env.JWT_SECRET).update(ts).digest('hex')}`), 'seo', 'ancien format');
  const [t, , sig] = G.buildState('seo').split('.');
  assert.equal(G.verifyState(`${t}.drive.${sig}`), false, 'but changé : signature invalide');
  assert.deepEqual(G.SCOPES_DRIVE, ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/userinfo.email']);
});

// Faux Drive : un dossier et des fichiers en mémoire, comme l'API v3 (list / create / get / delete).
function fauxDrive() {
  const fichiers = new Map();
  let n = 0;
  const drive = {
    fichiers,
    files: {
      list: async ({ q }) => {
        let l = [...fichiers.values()].filter((f) => !f.trashed);
        const dossier = /^'([^']+)' in parents/.exec(q);
        if (dossier) l = l.filter((f) => (f.parents || []).includes(dossier[1]));
        if (/mimeType = 'application\/vnd\.google-apps\.folder'/.test(q)) l = l.filter((f) => f.mimeType === 'application/vnd.google-apps.folder' && q.includes(`name = '${f.name}'`));
        return { data: { files: l.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime)).map(({ id, name, size, createdTime }) => ({ id, name, size, createdTime })) } };
      },
      create: async ({ requestBody, media }) => {
        const id = `f${++n}`;
        const parts = [];
        if (media) for await (const c of media.body) parts.push(c);
        fichiers.set(id, { id, ...requestBody, createdTime: new Date().toISOString(), contenu: Buffer.concat(parts), size: String(Buffer.concat(parts).length) });
        return { data: { id, name: requestBody.name } };
      },
      get: async ({ fileId, alt }) => {
        const f = fichiers.get(fileId);
        if (!f) throw Object.assign(new Error('File not found'), { code: 404 });
        return alt === 'media' ? { data: Readable.from([f.contenu]) } : { data: { id: f.id, trashed: !!f.trashed } };
      },
      delete: async ({ fileId }) => { fichiers.delete(fileId); },
    },
  };
  return drive;
}

test('envoi de la nuit et test de la semaine : vrai pg_dump, chiffré, rotation, relecture, alertes', { skip: !hasDb() && 'TEST_DATABASE_URL absent' }, async () => {
  await withSchema('sauv_drive', async ({ pool }) => {
    const db = { pool };
    const u = new URL(process.env.TEST_DATABASE_URL);
    Object.assign(process.env, { DB_HOST: u.hostname, DB_PORT: u.port || '5432', DB_USER: decodeURIComponent(u.username) || 'postgres', DB_PASSWORD: decodeURIComponent(u.password), DB_NAME: u.pathname.slice(1) || 'postgres' });
    await pool.query('CREATE TABLE charte_versions (id SERIAL PRIMARY KEY, contenu JSONB)');
    await pool.query("INSERT INTO charte_versions (contenu) VALUES ('{\"v\":1}')");
    const mails = [];
    const drive = fauxDrive();
    const deps = { drive, mail: async (sujet, texte) => { mails.push({ sujet, texte }); } };

    await assert.rejects(S.envoyer(db, deps), /n'est pas connecté/);
    await assert.rejects(S.enregistrerConnexion(db, { refresh_token: 'rt', scope: 'https://www.googleapis.com/auth/webmasters', email: 'marc@x.fr' }), /drive\.file\) non accordée/);
    await S.enregistrerConnexion(db, { refresh_token: 'rt', scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email', email: 'marc@x.fr' });
    assert.equal((fs.statSync(process.env.SAUVEGARDE_CLE_FICHIER).mode & 0o777).toString(8), '600', 'clé lisible par le seul compte du CRM');
    let e = await S.etat(db);
    assert.deepEqual([e.connecte, e.compte, e.cle.a_afficher, e.envoi], [true, 'marc@x.fr', true, null]);

    // Pas d'envoi tant que la clé n'est pas rangée ; affichée une seule fois.
    await assert.rejects(S.envoyer(db, deps), /clé de chiffrement pas encore rangée/);
    const cle = await S.cleAAfficher(db);
    assert.match(cle.cle, /^(\S{4} ){10}\S{4}$/);
    await S.cleRangee(db);
    await assert.rejects(S.cleAAfficher(db), (x) => x.status === 410 && /ne se montre qu'une fois/.test(x.message));
    assert.equal((await S.etat(db)).cle.a_afficher, false);

    // Une vieille copie du CRM (40 jours) et un autre fichier du dossier : seule la vieille copie est retirée.
    let r = await S.envoyer(db, deps);
    const dossier = (await pool.query('SELECT dossier_id FROM sauvegarde_drive')).rows[0].dossier_id;
    assert.ok(dossier && drive.fichiers.get(dossier).name === 'crm-sauvegardes');
    drive.fichiers.set('vieux', { id: 'vieux', name: 'crm-20261001-0341.dump.chiffre', parents: [dossier], createdTime: new Date(Date.now() - 40 * 86400000).toISOString(), contenu: Buffer.from('x') });
    drive.fichiers.set('autre', { id: 'autre', name: 'notes.txt', parents: [dossier], createdTime: new Date(Date.now() - 40 * 86400000).toISOString(), contenu: Buffer.from('x') });
    r = await S.envoyer(db, { ...deps, maintenant: () => new Date(Date.now() + 61000) });
    assert.equal(r.statut, 'OK'); assert.match(r.fichier, /^crm-\d{8}-\d{4}\.dump\.chiffre$/);
    assert.ok(r.tables >= 2);
    assert.deepEqual(r.retirees, ['crm-20261001-0341.dump.chiffre']);
    assert.ok(drive.fichiers.has('autre'), 'un fichier qui n\'est pas une copie du CRM n\'est jamais touché');
    const envoye = [...drive.fichiers.values()].find((f) => f.name === r.fichier);
    assert.equal(envoye.contenu.subarray(0, 8).toString(), 'CRMSAUV1');
    assert.ok(!envoye.contenu.includes(Buffer.from('PGDMP')), 'rien de lisible sur Drive');

    // Test de la semaine : redescendue, déchiffrée, relue, charte comprise.
    r = await S.tester(db, deps);
    assert.deepEqual([r.statut, r.fichier], ['OK', envoye.name]);
    e = await S.etat(db);
    assert.match(e.test.detail, /déchiffrée et relue, \d+ tables, charte comprise/);
    assert.equal(mails.length, 0);

    // Copie abîmée sur Drive : test en échec, mail envoyé.
    envoye.contenu[envoye.contenu.length - 30] ^= 1;
    await assert.rejects(S.tester(db, deps), /mauvaise clé, ou copie abîmée/);
    assert.equal((await S.etat(db)).test.statut, 'ÉCHEC');
    assert.match(mails[0].sujet, /test de relecture a échoué/); assert.match(mails[0].texte, /mauvaise clé, ou copie abîmée/);

    // API Drive non activée : message clair, mail d'échec de l'envoi.
    const refuse = { ...drive, files: { ...drive.files, create: async () => { throw Object.assign(new Error('x'), { response: { data: { error: { message: 'Google Drive API has not been used in project 123 before or it is disabled.' } } } }); } } };
    await assert.rejects(S.envoyer(db, { ...deps, drive: refuse, maintenant: () => new Date(Date.now() + 122000) }), /l'API Google Drive n'est pas activée/);
    assert.match(mails[1].sujet, /envoi sur Google Drive en échec/);
    assert.equal((await S.etat(db)).envoi.statut, 'ÉCHEC');
    await assert.rejects(S.reglages(db, { garder_jours: 3 }), /entre 7 et 365/);
    assert.equal((await S.reglages(db, { garder_jours: 60 })).garder_jours, 60);
  });
});
