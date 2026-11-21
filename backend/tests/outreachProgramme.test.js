// Netlinking : envois programmés (envoyer_le). Mêmes contrôles à la création et à l'expédition, cadence appliquée à
// l'expédition, annulation, réponse qui annule une relance programmée, essais sur erreur du serveur de mail.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hasDb, withSchema } = require('./helpers/db');
const { DATABASE_SCHEMA, ensureOutreachTables } = require('../scripts/autoInitDatabase');

async function createFromSchema(pool, name) {
  const cols = Object.entries(DATABASE_SCHEMA[name].columns).map(([c, d]) => `${c} ${d.replace(/REFERENCES users\(id\)/, '')}`).join(', ');
  await pool.query(`CREATE TABLE ${name} (${cols})`);
  for (const i of DATABASE_SCHEMA[name].indexes || []) await pool.query(i);
}
const dans = (min) => new Date(Date.now() + min * 60000).toISOString();

test('envois programmés : création, expédition à l\'heure, cadence, contrôles refaits, annulation, réponse, erreurs', { skip: !hasDb() && 'TEST_DATABASE_URL absent' }, async () => {
  await withSchema('outreach_prog', async ({ pool }) => {
    const db = { pool };
    await pool.query('CREATE TABLE seo_sites (id INT PRIMARY KEY, domain TEXT)');
    await pool.query("INSERT INTO seo_sites VALUES (2, 'jurojin.net')");
    for (const t of ['seo_niches', 'seo_link_targets', 'seo_link_outreach']) await createFromSchema(pool, t);
    await pool.query('CREATE TABLE email_optout (email TEXT PRIMARY KEY, source TEXT, created_at TIMESTAMPTZ DEFAULT NOW())');
    await pool.query(`CREATE TABLE prospect_refus (id SERIAL PRIMARY KEY, lead_id INTEGER, domaine TEXT, canal VARCHAR(10), motif TEXT, source TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), retire_le TIMESTAMPTZ, retire_motif TEXT)`);
    const c = await pool.connect(); try { await ensureOutreachTables(c); } finally { c.release(); }
    await pool.query("INSERT INTO seo_niches (id, name, site_cible, site_id) VALUES (1, 'Mocap', 'jurojin.net', 2)");
    await pool.query("SELECT setval(pg_get_serial_sequence('seo_niches', 'id'), 1)");
    const cible = async (domain) => (await pool.query('INSERT INTO seo_link_targets (niche_id, domain) VALUES (1, $1) RETURNING id', [domain])).rows[0].id;
    const a = await cible('blog-mocap.fr'), b = await cible('tuto3d.fr'), d = await cible('anim3d.fr');
    const sig = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sig-')), 'site-2.html');
    fs.writeFileSync(sig, '<p>Marc<br>Jurojin.net</p>');
    Object.assign(process.env, { OUTREACH_SMTP_HOST_2: 'smtp.test', OUTREACH_SMTP_USER_2: 'contact@jurojin.net', OUTREACH_SMTP_PASSWORD_2: 'x', OUTREACH_FROM_2: 'Jurojin <contact@jurojin.net>', OUTREACH_SIGNATURE_2: sig, OUTREACH_PLAFOND_2: '15', OUTREACH_DELAI_MIN: '9.5', OUTREACH_DELAI_MAX: '9.5' });
    const envoyes = [];
    let panne = false;
    require('../services/outreachSite').definirTransport({ sendMail: async (m) => { if (panne) throw new Error('451 serveur indisponible'); envoyes.push(m); return { messageId: m.messageId, accepted: [m.to], rejected: [] }; } });
    const S = require('../services/outreachService');
    const libre = () => pool.query("UPDATE outreach_etat SET prochain_envoi_le = NOW() - interval '1 minute'");
    const echu = (id) => pool.query("UPDATE outreach_mails SET envoyer_le = NOW() - interval '1 minute' WHERE id = $1", [id]);
    const mail = async (id) => (await pool.query('SELECT * FROM outreach_mails WHERE id = $1', [id])).rows[0];
    const base = { site_id: 2, target_id: a, destinataire: 'contact@blog-mocap.fr', objet: 'Votre tuto sur Rokoko', corps: 'Bonjour,\n\nJ\'ai lu votre tuto.' };

    // Date : illisible, passée, trop lointaine.
    await assert.rejects(S.envoyerMail(db, { ...base, envoyer_le: 'mardi matin' }), /envoyer_le illisible/);
    await assert.rejects(S.envoyerMail(db, { ...base, envoyer_le: dans(-5) }), /déjà passé/);
    await assert.rejects(S.envoyerMail(db, { ...base, envoyer_le: dans(61 * 1440) }), /60 jours au plus/);

    // Simulation : contrôles et aperçu, rien enregistré.
    let r = await S.envoyerMail(db, { ...base, envoyer_le: dans(60) });
    assert.equal(r.statut, 'simulation : rien programmé');
    assert.ok(r.controles.some((x) => /programmé pour le .* contrôles refaits à l'expédition/.test(x.texte)));
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM outreach_mails')).rows[0].n, 0);

    // Programmé : ligne « programme », rien envoyé, envoyer_le renvoyé au lieu de envoye_le ; cadence ignorée à la création.
    await pool.query("INSERT INTO outreach_etat (site, prochain_envoi_le) VALUES (2, NOW() + interval '1 hour') ON CONFLICT (site) DO UPDATE SET prochain_envoi_le = EXCLUDED.prochain_envoi_le");
    r = await S.envoyerMail(db, { ...base, envoyer_le: dans(60), simulation: false });
    assert.equal(r.statut, 'programmé');
    assert.ok(r.envoyer_le && r.envoye_le === undefined);
    const m1 = r.mail;
    assert.deepEqual([m1.statut, m1.envoye_le], ['programme', null]);
    assert.equal(envoyes.length, 0);
    // Domaine seul : fiche créée dès la programmation.
    r = await S.envoyerMail(db, { site_id: 2, domaine: 'nouveau-studio.fr', destinataire: 'hello@nouveau-studio.fr', objet: 'Votre studio', corps: 'Bonjour.', envoyer_le: dans(30), simulation: false });
    assert.equal(r.statut, 'programmé');
    assert.ok(r.cible.id);
    const m2 = r.mail;
    // Un domaine déjà programmé compte comme contacté.
    await assert.rejects(S.envoyerMail(db, { ...base, simulation: false }), /a déjà un mail programmé pour le/);
    await assert.rejects(S.envoyerMail(db, { ...base, envoyer_le: dans(90), simulation: false }), /a déjà un mail programmé/);

    // Liste : statut programme, par heure d'envoi.
    let l = await S.lister(db, { statut: 'programme' });
    assert.deepEqual(l.mails.map((x) => x.id), [m2.id, m1.id]);

    // Avant l'heure : rien ne part.
    await libre();
    let e = await S.expedierProgrammes(db);
    assert.deepEqual([e.envoyes, envoyes.length], [[], 0]);

    // À l'heure : parti, statut « envoye », envoye_le = maintenant ; un seul par passage et par site (cadence).
    await echu(m1.id); await echu(m2.id);
    e = await S.expedierProgrammes(db);
    assert.equal(e.envoyes.length, 1);
    assert.equal(e.reportes.length, 1);
    assert.equal(envoyes.length, 1);
    const parti = await mail(e.envoyes[0]);
    assert.equal(parti.statut, 'envoye');
    assert.ok(Math.abs(new Date(parti.envoye_le) - Date.now()) < 60000);
    assert.ok(parti.relance_prevue_le);
    const reste = await mail(e.reportes[0]);
    assert.equal(reste.statut, 'programme', 'créneau pas libre : reste programmé');
    // Créneau pas libre au passage suivant (9 min 30 pas écoulées) : toujours programmé.
    e = await S.expedierProgrammes(db);
    assert.deepEqual([e.envoyes.length, e.reportes], [0, [reste.id]]);
    await libre();
    e = await S.expedierProgrammes(db);
    assert.deepEqual(e.envoyes, [reste.id]);
    assert.equal((await pool.query("SELECT statut FROM seo_link_targets WHERE id = $1", [a])).rows[0].statut, 'contacte');

    // Contrôles refaits à l'expédition : une opposition arrivée entre-temps annule l'envoi, avec la raison.
    r = await S.envoyerMail(db, { ...base, target_id: b, destinataire: 'hello@tuto3d.fr', envoyer_le: dans(10), simulation: false });
    await pool.query("INSERT INTO email_optout (email, source) VALUES ('hello@tuto3d.fr', 'lien')");
    await echu(r.mail.id); await libre();
    e = await S.expedierProgrammes(db);
    assert.equal(e.annules[0].id, r.mail.id);
    const ann = await mail(r.mail.id);
    assert.equal(ann.statut, 'annule');
    assert.match(ann.erreur, /^annulé à l'expédition : hello@tuto3d\.fr est en opposition/);
    // Un mail annulé ne compte plus comme contact.
    assert.equal((await S.dejaContacte(db, { domaine: 'tuto3d.fr' })).contacts.length, 0);

    // Plafond du jour atteint à l'expédition : reste programmé.
    process.env.OUTREACH_PLAFOND_2 = '2';
    r = await S.envoyerMail(db, { ...base, target_id: d, destinataire: 'contact@anim3d.fr', envoyer_le: dans(10), simulation: false });
    assert.ok(r.avertissements === undefined || r.avertissements.every((x) => /créneau libre/.test(x)));
    await echu(r.mail.id); await libre();
    e = await S.expedierProgrammes(db);
    assert.deepEqual([e.envoyes.length, (await mail(r.mail.id)).statut], [0, 'programme']);
    process.env.OUTREACH_PLAFOND_2 = '15';

    // Annulation : seulement un mail programmé, pas encore parti.
    let x = await S.annulerProgramme(db, { id: r.mail.id });
    assert.equal(x.statut, 'annulé');
    await assert.rejects(S.annulerProgramme(db, { id: r.mail.id }), /statut « annule »/);
    await assert.rejects(S.annulerProgramme(db, { id: parti.id }), /parti le .* seul un mail programmé s'annule/);
    await assert.rejects(S.annulerProgramme(db, { id: 99999 }), /introuvable/);

    // Relance programmée à J+8 du premier mail ; une réponse notée l'annule.
    await pool.query("UPDATE outreach_mails SET envoye_le = NOW() - interval '1 day' WHERE id = $1", [parti.id]);
    await assert.rejects(S.envoyerMail(db, { ...base, objet: 'Re: tuto', corps: 'Je reviens vers vous.', relance_de: parti.id, envoyer_le: dans(60 * 24 * 3), simulation: false }), /relance trop tôt/);
    r = await S.envoyerMail(db, { ...base, objet: 'Re: tuto', corps: 'Je reviens vers vous.', relance_de: parti.id, envoyer_le: dans(60 * 24 * 7), simulation: false });
    assert.equal(r.statut, 'programmé');
    await assert.rejects(S.envoyerMail(db, { ...base, objet: 'Re: tuto', corps: 'Encore.', relance_de: parti.id, envoyer_le: dans(60 * 24 * 8), simulation: false }), /une relance est déjà programmée/);
    const rep = await S.marquerReponse(db, { target_id: parti.target_id, nature: 'positif' });
    assert.equal(rep.mail.id, parti.id, 'la réponse porte sur le mail parti, pas sur la relance programmée');
    assert.deepEqual(rep.programmes_annules, [r.mail.id]);
    assert.match((await mail(r.mail.id)).erreur, /annulé : réponse notée/);

    // Serveur de mail en panne à l'expédition : reste programmé, 3 essais au plus, puis « echec ».
    const t4 = await cible('rig3d.fr');
    r = await S.envoyerMail(db, { ...base, target_id: t4, destinataire: 'contact@rig3d.fr', envoyer_le: dans(10), simulation: false });
    panne = true;
    for (let i = 1; i <= 3; i++) {
      await echu(r.mail.id); await libre();
      e = await S.expedierProgrammes(db);
      assert.match(e.erreurs[0].message, i < 3 ? /nouvel essai au passage suivant/ : /abandonné après 3 essais/);
      assert.equal((await mail(r.mail.id)).statut, i < 3 ? 'programme' : 'echec');
    }
    panne = false;
    // Envoi immédiat inchangé (sans envoyer_le).
    await libre();
    const t5 = await cible('cgi-blog.fr');
    r = await S.envoyerMail(db, { ...base, target_id: t5, destinataire: 'contact@cgi-blog.fr', simulation: false });
    assert.equal(r.statut, 'envoyé');
    assert.ok(r.envoye_le);
  });
});
