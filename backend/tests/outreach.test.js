// Netlinking multi-site : endpoint unique, contrôles bloquants, relances, cadence, MCP et écran passent par là.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { hasDb, withSchema } = require('./helpers/db');
const { DATABASE_SCHEMA, ensureOutreachTables } = require('../scripts/autoInitDatabase');
const { domaineCourt } = require('../utils/domaineCourt');

async function createFromSchema(pool, name) {
  const cols = Object.entries(DATABASE_SCHEMA[name].columns).map(([c, d]) => `${c} ${d.replace(/REFERENCES users\(id\)/, '')}`).join(', ');
  await pool.query(`CREATE TABLE ${name} (${cols})`);
  for (const i of DATABASE_SCHEMA[name].indexes || []) await pool.query(i);
}

test('domaine court : sous-domaines, adresses, suffixes doubles', () => {
  assert.equal(domaineCourt('https://www.blog.exemple.fr/page'), 'exemple.fr');
  assert.equal(domaineCourt('contact@news.exemple.co.uk'), 'exemple.co.uk');
  assert.equal(domaineCourt('pas un domaine'), null);
});

test('envoi : un seul endpoint, toutes les règles, relances encadrées, cadence, réponses, cibles', { skip: !hasDb() }, async () => {
  await withSchema('outreach', async ({ pool }) => {
    const db = { pool };
    await pool.query('CREATE TABLE seo_sites (id INT PRIMARY KEY, domain TEXT)');
    await pool.query("INSERT INTO seo_sites VALUES (2, 'jurojin.net'), (15, 'pixfeed.net')");
    for (const t of ['seo_niches', 'seo_link_targets', 'seo_link_outreach']) await createFromSchema(pool, t);
    await pool.query('CREATE TABLE email_optout (email TEXT PRIMARY KEY, source TEXT, created_at TIMESTAMPTZ DEFAULT NOW())');
    await pool.query(`CREATE TABLE prospect_refus (id SERIAL PRIMARY KEY, lead_id INTEGER, domaine TEXT, canal VARCHAR(10), motif TEXT, source TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), retire_le TIMESTAMPTZ, retire_motif TEXT)`);
    const c = await pool.connect(); try { await ensureOutreachTables(c); } finally { c.release(); }
    await pool.query("INSERT INTO seo_niches (id, name, site_cible, site_id) VALUES (1, 'Mocap', 'jurojin.net', 2), (2, 'Agences', 'pixfeed.net', 15)");
    const cible = async (nicheId, domain) => (await pool.query('INSERT INTO seo_link_targets (niche_id, domain) VALUES ($1, $2) RETURNING id', [nicheId, domain])).rows[0].id;
    const a = await cible(1, 'www.blog-mocap.fr'), b = await cible(1, 'tuto3d.fr'), x = await cible(1, 'deja-pixfeed.fr'), y = await cible(2, 'deja-pixfeed.fr'), z = await cible(1, 'oppose.fr');
    // Ancien envoi de pixfeed.net (Gmail) : lu par le contrôle.
    await pool.query("INSERT INTO seo_link_outreach (target_id, subject, body, sent_at) VALUES ($1, 'Partenariat', 'x', '2026-10-01')", [y]);
    await pool.query("INSERT INTO email_optout (email, source) VALUES ('webmaster@oppose.fr', 'lien')");

    // Expéditeur jurojin.net, signature serveur, transport de test.
    const sig = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sig-')), 'site-2.html');
    fs.writeFileSync(sig, '<p>Marc<br>Jurojin.net</p>');
    Object.assign(process.env, { OUTREACH_SMTP_HOST_2: 'smtp.test', OUTREACH_SMTP_USER_2: 'contact@jurojin.net', OUTREACH_SMTP_PASSWORD_2: 'x', OUTREACH_FROM_2: 'Jurojin <contact@jurojin.net>', OUTREACH_SIGNATURE_2: sig, OUTREACH_PLAFOND_2: '3' });
    const envoyes = [];
    require('../services/outreachSite').definirTransport({ sendMail: async (m) => { envoyes.push(m); return { messageId: m.messageId, accepted: [m.to], rejected: [] }; } });
    const S = require('../services/outreachService');
    const libre = () => pool.query('UPDATE outreach_etat SET prochain_envoi_le = NOW() - interval \'1 minute\'');
    const refus = async (b, re) => { await assert.rejects(S.envoyerMail(db, b), re); };
    const base = { site_id: 2, target_id: a, destinataire: 'contact@blog-mocap.fr', objet: 'Votre tuto sur Rokoko', corps: 'Bonjour,\n\nJ\'ai lu votre tuto sur la combinaison Rokoko.' };

    // Site sans expéditeur, champ de fusion, plusieurs destinataires, opposition, cible d'un autre site.
    await refus({ ...base, site_id: 15 }, /aucun expéditeur de netlinking réglé/);
    await refus({ ...base, corps: 'Bonjour {{prenom}},' }, /champ de fusion interdit/);
    await refus({ ...base, destinataire: 'a@x.fr, b@x.fr' }, /un seul destinataire/);
    await refus({ ...base, target_id: z, destinataire: 'webmaster@oppose.fr' }, /en opposition/);
    await refus({ ...base, target_id: y }, /n'est pas rattachée à ce site/);

    // Simulation : contrôles, rien envoyé.
    let r = await S.envoyerMail(db, base);
    assert.equal(r.statut, 'simulation : rien envoyé'); assert.equal(envoyes.length, 0);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM outreach_mails')).rows[0].n, 0);

    // Envoi réel.
    r = await S.envoyerMail(db, { ...base, simulation: false });
    assert.equal(r.statut, 'envoyé');
    const m1 = r.mail;
    assert.equal(m1.domaine, 'blog-mocap.fr'); assert.equal(m1.statut, 'envoye'); assert.match(m1.message_id, /@jurojin\.net>$/);
    const j10 = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    assert.equal(new Date(m1.relance_prevue_le).toISOString().slice(0, 10) <= j10, true);
    const e1 = envoyes[0];
    assert.equal(e1.from, 'Jurojin <contact@jurojin.net>'); assert.equal(e1.replyTo, 'Jurojin <contact@jurojin.net>');
    assert.match(e1.html, /Jurojin\.net<\/p>/, 'signature du site ajoutée');
    assert.doesNotMatch(e1.html + e1.text, /pixfeed|crm\.|\/api\/track/i, 'aucun lien vers le CRM');
    assert.equal((await pool.query('SELECT statut, contact_email FROM seo_link_targets WHERE id = $1', [a])).rows[0].statut, 'contacte');

    // Délai aléatoire : trop tôt.
    await refus({ ...base, target_id: b, destinataire: 'hello@tuto3d.fr', simulation: false }, /prochain envoi possible à/);
    await libre();
    // Domaine déjà contacté : par ce module (autre sous-domaine), puis par l'ancien envoi de pixfeed.net.
    const t2 = await cible(1, 'news.blog-mocap.fr');
    await assert.rejects(S.envoyerMail(db, { ...base, target_id: t2, destinataire: 'news@blog-mocap.fr' }), (e) => /déjà reçu un mail/.test(e.message) && e.precedents.length === 1);
    await refus({ ...base, target_id: x, destinataire: 'contact@deja-pixfeed.fr' }, /ancien envoi \(Gmail/);

    // Relance : trop tôt, puis à J+8 (même fil), puis plafond de relances.
    await refus({ ...base, relance_de: m1.id, simulation: false }, /relance trop tôt/);
    await pool.query("UPDATE outreach_mails SET envoye_le = NOW() - interval '8 days' WHERE id = $1", [m1.id]);
    r = await S.envoyerMail(db, { ...base, objet: 'Re: Votre tuto sur Rokoko', corps: 'Je me permets de revenir vers vous.', relance_de: m1.id, simulation: false });
    assert.equal(r.relance.rang, 1);
    assert.equal(envoyes[1].inReplyTo, m1.message_id, 'relance dans le même fil');
    assert.equal((await pool.query('SELECT statut, relance_prevue_le FROM outreach_mails WHERE id = $1', [m1.id])).rows[0].statut, 'relance');
    await libre(); await pool.query("UPDATE outreach_mails SET envoye_le = NOW() - interval '9 days'");
    r = await S.envoyerMail(db, { ...base, objet: 'Re: Votre tuto', corps: 'Dernière relance.', relance_de: r.mail.id, simulation: false });
    assert.equal(r.relance.rang, 2);
    await libre(); await pool.query("UPDATE outreach_mails SET envoye_le = NOW() - interval '9 days'");
    await refus({ ...base, corps: 'Encore.', relance_de: m1.id, simulation: false }, /déjà 2 relance\(s\).*2 au plus/);

    // Plafond du jour (3 pour ce test) : 3 envois aujourd'hui.
    await pool.query("UPDATE outreach_mails SET envoye_le = NOW()");
    await libre();
    await refus({ ...base, target_id: b, destinataire: 'hello@tuto3d.fr', simulation: false }, /plafond du jour atteint pour ce site : 3 \/ 3/);
    await pool.query("UPDATE outreach_mails SET envoye_le = NOW() - interval '9 days'");

    // Réponse : fin des relances ; listes.
    await S.marquerReponse(db, { target_id: a, nature: 'positif' });
    await refus({ ...base, corps: 'x', relance_de: m1.id, simulation: false }, /pas de relance : le mail #\d+ est « repondu »/);
    await assert.rejects(S.marquerReponse(db, { target_id: a, nature: 'peut-etre' }), /nature/);
    await libre();
    r = await S.envoyerMail(db, { ...base, target_id: b, destinataire: 'hello@tuto3d.fr', objet: 'Votre article 3D', corps: 'Bonjour, votre article…', simulation: false });
    await pool.query("UPDATE outreach_mails SET relance_prevue_le = CURRENT_DATE - 1 WHERE id = $1", [r.mail.id]);
    const dues = await S.lister(db, { site: 2, relances_dues: true });
    assert.deepEqual(dues.mails.map((x) => x.domaine), ['tuto3d.fr']);
    assert.deepEqual((await S.sansReponse(db, { site: 2 })).map((x) => x.domaine), ['tuto3d.fr']);
    const v = await S.dejaContacte(db, { adresse: 'hello@tuto3d.fr' });
    assert.equal(v.contacts.length, 1);

    // Ajout de cibles (remplace l'import CSV) : simulation, puis écriture ; domaines déjà présents ignorés.
    const liste = [{ domaine: 'nouveau3d.fr', url: 'https://nouveau3d.fr/contact', rel: 'dofollow', porte: 'formulaire', statut: 'a_contacter', terrain: 'blog', note: 'vu sur Reddit' }, { domaine: 'www.tuto3d.fr' }, { domaine: 'deja-pixfeed.fr' }];
    let ac = await S.ajouterCibles(db, { site: 2, niche_id: 1, cibles: liste });
    assert.equal(ac.statut, 'simulation : rien créé'); assert.equal(ac.creees.length, 1);
    assert.deepEqual(ac.ignorees.map((i) => i.domaine), ['tuto3d.fr', 'deja-pixfeed.fr']);
    ac = await S.ajouterCibles(db, { site: 2, niche_id: 1, cibles: liste, simulation: false });
    const n = (await pool.query("SELECT statut, dofollow, porte_type, notes FROM seo_link_targets WHERE domain = 'nouveau3d.fr'")).rows[0];
    assert.deepEqual([n.statut, n.dofollow, n.porte_type], ['a_contacter', true, 'formulaire']); assert.match(n.notes, /terrain : blog/);
    await assert.rejects(S.ajouterCibles(db, { site: 2, niche_id: 2, cibles: liste }), /n'est pas rattachée au site 2/);
  });
});

test('route : le serveur MCP (secret partagé) et une session passent ; un appel anonyme est refusé', async () => {
  const express = require('express');
  const http = require('http');
  process.env.OUTILS_MCP_SECRET = 's'.repeat(40);
  const app = express(); app.use(express.json()); app.locals.db = { pool: null };
  app.use('/api/seo/outreach', require('../routes/seoOutreachRoutes'));
  const srv = http.createServer(app); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}/api/seo/outreach/config`;
  try {
    assert.equal((await fetch(url, { headers: { 'X-Outils-Secret': 's'.repeat(40) } })).status, 200);
    assert.equal((await fetch(url, { headers: { 'X-Outils-Secret': 'mauvais'.repeat(6) } })).status, 401);
    assert.equal((await fetch(url)).status, 401);
  } finally { srv.close(); }
});
