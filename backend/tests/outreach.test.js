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
    await pool.query("SELECT setval(pg_get_serial_sequence('seo_niches', 'id'), 2)");
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

    // Domaine seul (sans target_id) : fiche reprise si connue sur le site, sinon créée à l'envoi dans « Hors campagne ».
    const passe = () => pool.query("UPDATE outreach_mails SET envoye_le = NOW() - interval '9 days'").then(libre);
    const nbHc = async () => (await pool.query("SELECT COUNT(*)::int AS n FROM seo_niches WHERE site_id = 2 AND name = 'Hors campagne'")).rows[0].n;
    const seul = { site_id: 2, destinataire: 'contact@inconnu3d.fr', objet: 'Votre galerie', corps: 'Bonjour, votre galerie de rendus…' };
    await passe();
    await refus({ ...seul }, /target_id, ou domaine seul/);
    await refus({ ...seul, target_id: b, domaine: 'autre.fr' }, /la cible \d+ est tuto3d\.fr, pas autre\.fr/);
    r = await S.envoyerMail(db, { ...seul, domaine: 'https://www.inconnu3d.fr/galerie' });
    assert.equal(r.statut, 'simulation : rien envoyé');
    assert.deepEqual([r.cible.domaine, r.cible.niche, r.cible.a_creer, r.cible.id], ['inconnu3d.fr', 'Hors campagne', true, null]);
    assert.equal(await nbHc(), 0, 'simulation : niche pas créée');
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM seo_link_targets WHERE domain = 'inconnu3d.fr'")).rows[0].n, 0, 'simulation : fiche pas créée');
    r = await S.envoyerMail(db, { ...seul, domaine: 'https://www.inconnu3d.fr/galerie', simulation: false });
    assert.equal(r.statut, 'envoyé'); assert.equal(r.cible.creee, true); assert.equal(r.cible.niche_creee, true);
    const hc = (await pool.query("SELECT id, site_id, site_cible, statut FROM seo_niches WHERE name = 'Hors campagne'")).rows;
    assert.equal(hc.length, 1); assert.deepEqual([hc[0].site_id, hc[0].site_cible], [2, 'jurojin.net']);
    const f = (await pool.query("SELECT id, niche_id, statut, contact_email, porte_url FROM seo_link_targets WHERE domain = 'inconnu3d.fr'")).rows[0];
    assert.deepEqual([f.niche_id, f.statut, f.contact_email, f.porte_url], [hc[0].id, 'contacte', 'contact@inconnu3d.fr', 'https://www.inconnu3d.fr/galerie']);
    assert.deepEqual([r.mail.target_id, r.mail.campaign_id, r.mail.domaine], [f.id, hc[0].id, 'inconnu3d.fr']);
    // Mêmes contrôles : domaine déjà contacté (autre sous-domaine), même sans fiche donnée.
    await passe();
    await refus({ ...seul, domaine: 'blog.inconnu3d.fr', destinataire: 'blog@inconnu3d.fr', simulation: false }, /inconnu3d\.fr a déjà reçu un mail/);
    // Domaine déjà dans une niche du site : sa fiche est reprise (pas de doublon dans « Hors campagne »).
    const n3d = (await pool.query("SELECT id FROM seo_link_targets WHERE domain = 'nouveau3d.fr'")).rows[0].id;
    r = await S.envoyerMail(db, { ...seul, domaine: 'nouveau3d.fr', destinataire: 'hello@nouveau3d.fr', simulation: false });
    assert.deepEqual([r.cible.id, r.cible.niche, r.mail.campaign_id], [n3d, 'Mocap', 1]);
    // Deuxième domaine inconnu : même niche « Hors campagne ».
    await passe();
    r = await S.envoyerMail(db, { ...seul, domaine: 'rendus3d.fr', destinataire: 'contact@rendus3d.fr', simulation: false });
    assert.equal(r.cible.niche_creee, undefined); assert.equal(await nbHc(), 1);
    // Campagne nommée par Claude : créée à l'envoi, puis reprise (casse ignorée) ; une fiche existante n'est pas déplacée.
    await passe();
    r = await S.envoyerMail(db, { ...seul, domaine: 'atelier3d.fr', destinataire: 'contact@atelier3d.fr', niche_nom: 'Ateliers 3D' });
    assert.deepEqual([r.cible.niche, r.cible.a_creer], ['Ateliers 3D', true]);
    assert.match(r.controles.map((x) => x.texte).join(' | '), /niche « Ateliers 3D » \(créée elle aussi\)/);
    r = await S.envoyerMail(db, { ...seul, domaine: 'atelier3d.fr', destinataire: 'contact@atelier3d.fr', niche_nom: 'Ateliers 3D', simulation: false });
    const at = (await pool.query("SELECT id, site_id FROM seo_niches WHERE name = 'Ateliers 3D'")).rows;
    assert.equal(at.length, 1); assert.equal(at[0].site_id, 2);
    assert.deepEqual([r.cible.niche, r.cible.niche_creee, r.mail.campaign_id], ['Ateliers 3D', true, at[0].id]);
    await passe();
    r = await S.envoyerMail(db, { ...seul, domaine: 'studio3d.fr', destinataire: 'contact@studio3d.fr', niche_nom: 'ateliers 3d', simulation: false });
    assert.deepEqual([r.cible.niche, r.cible.niche_creee, r.mail.campaign_id], ['Ateliers 3D', undefined, at[0].id]);
    await passe();
    const garde = await cible(1, 'garde3d.fr');
    r = await S.envoyerMail(db, { ...seul, domaine: 'garde3d.fr', destinataire: 'contact@garde3d.fr', niche_nom: 'Ateliers 3D' });
    assert.deepEqual([r.cible.id, r.cible.niche], [garde, 'Mocap']);
    assert.match(r.controles.map((x) => x.texte).join(' | '), /pas déplacée vers « Ateliers 3D »/);
    await refus({ ...seul, domaine: 'x3d.fr', niche_nom: 'x'.repeat(121) }, /niche_nom : 1 à 120 caractères/);

    // Échec du serveur de mail : la fiche créée pour l'envoi est retirée.
    await passe();
    const T = require('../services/outreachSite');
    T.definirTransport({ sendMail: async () => { throw new Error('535 refusé'); } });
    await refus({ ...seul, domaine: 'echec3d.fr', destinataire: 'contact@echec3d.fr', simulation: false }, /envoi refusé par le serveur de mail/);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM seo_link_targets WHERE domain = 'echec3d.fr'")).rows[0].n, 0);
    T.definirTransport({ sendMail: async (m) => { envoyes.push(m); return { messageId: m.messageId, accepted: [m.to], rejected: [] }; } });

    // ajouter_cibles : niche par son nom, créée si absente (aussi quand niche_id n'existe pas).
    await assert.rejects(S.ajouterCibles(db, { site: 2, cibles: liste }), /niche_id, ou niche_nom/);
    await assert.rejects(S.ajouterCibles(db, { site: 2, niche_id: 9999, cibles: liste }), /niche 9999 introuvable : donner niche_nom/);
    const forums = [{ domaine: 'forum-blender.fr' }, { domaine: 'tuto3d.fr' }];
    ac = await S.ajouterCibles(db, { site: 2, niche_nom: 'Forums 3D', cibles: forums });
    assert.deepEqual([ac.niche, ac.niche_creee, ac.creees.length], ['Forums 3D', "créée à l'écriture", 1]);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM seo_niches WHERE name = 'Forums 3D'")).rows[0].n, 0, 'simulation : niche pas créée');
    ac = await S.ajouterCibles(db, { site: 2, niche_id: 9999, niche_nom: 'Forums 3D', cibles: forums, simulation: false });
    const fn = (await pool.query("SELECT id, site_id, site_cible, statut FROM seo_niches WHERE name = 'Forums 3D'")).rows;
    assert.equal(fn.length, 1); assert.deepEqual([fn[0].site_id, fn[0].site_cible, ac.niche_id, ac.niche_creee], [2, 'jurojin.net', fn[0].id, true]);
    assert.deepEqual(ac.creees.map((x) => x.domaine), ['forum-blender.fr']);
    ac = await S.ajouterCibles(db, { site: 2, niche_nom: '  forums 3d ', cibles: [{ domaine: 'sculpt3d.fr' }], simulation: false });
    assert.equal(ac.niche_id, fn[0].id, 'même nom (casse, espaces) : niche reprise'); assert.equal(ac.niche_creee, undefined);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM seo_niches WHERE LOWER(name) = 'forums 3d'")).rows[0].n, 1);
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
