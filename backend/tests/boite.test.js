// Lot 7 : lecture de la boîte d'envoi (tri, rattachement, effets, refus à confirmer) et entonnoir.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { simpleParser } = require('mailparser');
const { hasDb, withSchema } = require('./helpers/db');
const { classer } = require('../utils/boiteClassement');

const brut = (entetes, corps) => `${Object.entries(entetes).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n${corps}`;
const DSN = brut({ From: 'Mail Delivery System <MAILER-DAEMON@mail.pixfeed.net>', To: 'contact@pixfeed.net', Subject: 'Undelivered Mail Returned to Sender', 'Message-ID': '<dsn1@x>', Date: 'Wed, 05 Nov 2026 10:00:00 +0100', 'MIME-Version': '1.0', 'Content-Type': 'multipart/report; report-type=delivery-status; boundary="B"' },
  '--B\r\nContent-Type: text/plain\r\n\r\nThis is the mail system. Your message could not be delivered.\r\n\r\n--B\r\nContent-Type: message/delivery-status\r\n\r\nReporting-MTA: dns; mail.pixfeed.net\r\n\r\nFinal-Recipient: rfc822; contact@batterie4moto.fr\r\nAction: failed\r\nStatus: 5.1.1\r\nDiagnostic-Code: smtp; 550 5.1.1 User unknown\r\n\r\n--B--\r\n');
const PLEINE = brut({ From: 'postmaster@orange.fr', Subject: 'Delivery Status Notification (Delay)', 'Message-ID': '<dsn2@x>', Date: 'Wed, 05 Nov 2026 10:00:00 +0100' }, 'Status: 4.2.2 mailbox full\r\nFinal-Recipient: rfc822; jean@orange.fr\r\n');
const ABSENT = brut({ From: 'Claire <claire@atelier-martin.fr>', Subject: 'Absence du bureau', 'Auto-Submitted': 'auto-replied', 'Message-ID': '<a1@x>', Date: 'Wed, 05 Nov 2026 10:00:00 +0100' }, 'Je suis absente jusqu\'au 12 novembre.');
const REFUS = brut({ From: 'Paul <contact@agrigom.fr>', Subject: 'Re: Le cadenas de votre boutique', 'Message-ID': '<r1@x>', Date: 'Wed, 05 Nov 2026 11:00:00 +0100' }, 'Bonjour,\r\nMerci de ne plus nous contacter.\r\n\r\nLe 04/11/2026 à 09:00, Marc <contact@pixfeed.net> a écrit :\r\n> Bonjour, en ouvrant agrigom.fr...');
const REPONSE = brut({ From: 'Paul <contact@agrigom.fr>', Subject: 'Re: Le cadenas de votre boutique', 'Message-ID': '<r2@x>', Date: 'Wed, 05 Nov 2026 12:00:00 +0100' }, 'Bonjour, oui ça m\'intéresse, appelez-moi demain.\r\n\r\nLe 04/11/2026 à 09:00, Marc a écrit :\r\n> pas intéressé ? stop');

test('tri : rebond définitif / temporaire, absence, refus probable, réponse (la citation ne compte pas)', async () => {
  let c = classer(await simpleParser(DSN));
  assert.equal(c.type, 'rebond'); assert.equal(c.adresse, 'contact@batterie4moto.fr'); assert.match(c.raison, /5\.1\.1/);
  c = classer(await simpleParser(PLEINE));
  assert.equal(c.type, 'rebond_temporaire'); assert.equal(c.adresse, 'jean@orange.fr');
  assert.equal(classer(await simpleParser(ABSENT)).type, 'auto');
  c = classer(await simpleParser(REFUS));
  assert.equal(c.type, 'refus_probable'); assert.match(c.raison, /ne plus nous contacter|merci de ne plus/i); assert.doesNotMatch(c.extrait, /a écrit/);
  c = classer(await simpleParser(REPONSE));
  assert.equal(c.type, 'reponse', 'les mots « pas intéressé » et « stop » de la citation sont ignorés');
});

test('boîte en base : rattachement, effets, refus soumis, relevé en lecture seule, entonnoir', { skip: !hasDb() }, async () => {
  await withSchema('boite', async ({ pool }) => {
    const db = { pool };
    await pool.query(`CREATE TABLE leads (id SERIAL PRIMARY KEY, name TEXT, company TEXT, website TEXT, email TEXT, relation_status TEXT DEFAULT 'contacte', crawl_result_id INT, updated_at TIMESTAMP)`);
    await pool.query('CREATE TABLE contacts (id SERIAL PRIMARY KEY, lead_id INT, email TEXT)');
    await pool.query('CREATE TABLE crawl_results (id SERIAL PRIMARY KEY, domain TEXT)');
    await pool.query(`CREATE TABLE interactions (id SERIAL PRIMARY KEY, contact_type VARCHAR(10), contact_id INT, type TEXT, reached TEXT, date TIMESTAMP DEFAULT NOW(), notes TEXT, next_followup_date DATE, next_followup_channel TEXT, followup_done BOOLEAN DEFAULT FALSE)`);
    await pool.query('CREATE TABLE email_optout (email TEXT PRIMARY KEY, source TEXT, created_at TIMESTAMPTZ DEFAULT NOW())');
    await pool.query(`CREATE TABLE prospect_refus (id SERIAL PRIMARY KEY, lead_id INTEGER, domaine TEXT, canal VARCHAR(10) NOT NULL, motif TEXT, source VARCHAR(30), created_at TIMESTAMPTZ DEFAULT NOW(), retire_le TIMESTAMPTZ, retire_motif TEXT)`);
    await pool.query('CREATE TABLE campaigns (id SERIAL PRIMARY KEY, nom TEXT, test_mode BOOLEAN DEFAULT FALSE)');
    await pool.query('CREATE TABLE campaign_items (id SERIAL PRIMARY KEY, campaign_id INT, lead_id INT, to_email TEXT, subject TEXT, statut TEXT, raison TEXT, sent_at TIMESTAMPTZ, updated_at TIMESTAMPTZ DEFAULT NOW())');
    await pool.query('CREATE TABLE email_tracking (id SERIAL PRIMARY KEY, token TEXT, contact_type TEXT, contact_id INT, to_email TEXT, subject TEXT, click_count INT DEFAULT 0, campaign_id INT)');
    await pool.query('CREATE TABLE quotes (id SERIAL PRIMARY KEY, affaire_id INT)');
    const src = require('fs').readFileSync(require.resolve('../scripts/autoInitDatabase'), 'utf8');
    for (const t of ['boite_messages', 'boite_etat', 'affaires']) { const i = src.indexOf(`CREATE TABLE IF NOT EXISTS ${t} (`); await pool.query(src.slice(i, src.indexOf(');', i) + 2)); }

    const B = require('../services/boiteService');
    await pool.query("INSERT INTO campaigns (nom) VALUES ('Première Campagne')");
    const a = (await pool.query("INSERT INTO leads (name, company, email) VALUES ('Agrigom', 'agrigom.fr', 'contact@agrigom.fr') RETURNING id")).rows[0].id;
    const b = (await pool.query("INSERT INTO leads (name, company, email) VALUES ('B4M', 'batterie4moto.fr', 'contact@batterie4moto.fr') RETURNING id")).rows[0].id;
    const ia = (await pool.query("INSERT INTO campaign_items (campaign_id, lead_id, to_email, subject, statut, sent_at) VALUES (1, $1, 'contact@agrigom.fr', 'Le cadenas de votre boutique', 'envoye', NOW() - interval '1 day') RETURNING id", [a])).rows[0].id;
    const ib = (await pool.query("INSERT INTO campaign_items (campaign_id, lead_id, to_email, subject, statut, sent_at) VALUES (1, $1, 'contact@batterie4moto.fr', 'Votre boutique', 'envoye', NOW() - interval '1 day') RETURNING id", [b])).rows[0].id;
    // Relance posée par la campagne le 4/11, avant la réponse du 5/11 : elle sera fermée par la réponse.
    await pool.query("INSERT INTO interactions (contact_type, contact_id, type, date, notes, next_followup_date, next_followup_channel) VALUES ('lead', $1, 'note', '2026-11-04T10:00:00+01:00', 'relance', CURRENT_DATE + 5, 'appel')", [a]);

    // Fausse boîte IMAP : vérifie qu'on l'ouvre en lecture seule.
    const msgs = [DSN, PLEINE, ABSENT, REFUS, brut({ From: 'inconnu@ailleurs.fr', Subject: 'Pub', 'Message-ID': '<p@x>', Date: 'Wed, 05 Nov 2026 10:00:00 +0100' }, 'Achetez')].map((s, i) => ({ uid: i + 1, source: Buffer.from(s) }));
    let lectureSeule = null;
    const faux = (liste) => ({
      mailbox: { uidValidity: 42n }, connect: async () => {}, logout: async () => {},
      getMailboxLock: async (d, o) => { lectureSeule = o && o.readOnly; return { release: () => {} }; },
      fetch: async function* (critere) { const depuis = critere.uid ? Number(String(critere.uid).split(':')[0]) : 0; for (const m of liste) if (m.uid >= depuis) yield m; }
    });
    let r = await B.relever(db, { client: faux(msgs) });
    assert.equal(lectureSeule, true, 'boîte ouverte en lecture seule');
    assert.equal(r.lus, 5);
    assert.deepEqual(r.par_type, { rebond: 1, refus_probable: 1 }, 'non-remise temporaire et absence : expéditeurs non contactés ; publicité : ignorée');
    // Rebond appliqué ; refus probable : relances fermées, ligne « a répondu », rien bloqué tant que Marc n'a pas décidé.
    assert.equal((await pool.query('SELECT statut FROM campaign_items WHERE id = $1', [ib])).rows[0].statut, 'rebond');
    assert.equal((await pool.query("SELECT source FROM email_optout WHERE email = 'contact@batterie4moto.fr'")).rows[0].source, 'rebond');
    assert.equal((await pool.query('SELECT statut FROM campaign_items WHERE id = $1', [ia])).rows[0].statut, 'repondu');
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM interactions WHERE contact_id = $1 AND followup_done = FALSE AND next_followup_date IS NOT NULL", [a])).rows[0].n, 0);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM email_optout WHERE email = 'contact@agrigom.fr'")).rows[0].n, 0);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM boite_messages')).rows[0].n, 2, 'messages étrangers non conservés');
    // Second relevé : reprend après le dernier UID, rien en double.
    // Relance posée APRÈS la date de la réponse (5/11 12 h) : elle doit rester ouverte.
    await pool.query("INSERT INTO interactions (contact_type, contact_id, type, date, notes, next_followup_date, next_followup_channel) VALUES ('lead', $1, 'note', '2026-11-06T09:00:00+01:00', 'rappel après appel', CURRENT_DATE + 3, 'appel')", [a]);
    r = await B.relever(db, { client: faux([...msgs, { uid: 6, source: Buffer.from(REPONSE) }]) });
    assert.equal((await pool.query("SELECT followup_done FROM interactions WHERE notes = 'rappel après appel'")).rows[0].followup_done, false, 'relance postérieure à la réponse gardée');
    assert.equal(r.lus, 1); assert.deepEqual(r.par_type, { reponse: 1 });
    // Décision de Marc sur le refus.
    const l = await B.lister(db);
    assert.equal(l.a_confirmer, 1);
    const refus = l.messages.find((m) => m.statut === 'a_confirmer');
    await assert.rejects(B.confirmer(db, refus.id, 'peut-etre'), /Décision/);
    await B.confirmer(db, refus.id, 'tout');
    assert.equal((await pool.query("SELECT canal, source FROM prospect_refus WHERE lead_id = $1", [a])).rows[0].canal, 'tout');
    assert.equal((await pool.query('SELECT statut FROM campaign_items WHERE id = $1', [ia])).rows[0].statut, 'oppose');
    await assert.rejects(B.confirmer(db, refus.id, 'tout'), /déjà traité/);

    // Entonnoir : 2 envoyés, 1 rebond, 1 réponse (refus compris), 1 refus ; affaire gagnée avec montants.
    await pool.query("INSERT INTO affaires (lead_id, titre, etape, montant_mensuel, montant_ponctuel, campagne_id) VALUES ($1, 'Maintenance', 'gagnee', 50, 200, 1)", [a]);
    const E = await require('../services/entonnoirService').entonnoir(db, 1);
    const v = Object.fromEntries(E.etapes.map((x) => [x.cle, x.valeur]));
    assert.deepEqual([v.envoyes, v.delivres, v.reponses, v.refus, v.affaires, v.gagnees], [2, 1, 1, 1, 1, 1]);
    assert.equal(E.etapes.find((x) => x.cle === 'reponses').taux, 100);
    assert.equal(E.montants.mensuel_signe, 50);
    assert.ok(E.etapes.every((x) => x.definition && x.definition.length > 20), 'chaque étape a sa définition');
  });
});
