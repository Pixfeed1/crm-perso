// Lot 6 : journal des clics, tri des liens, filtre anti-robots, redirection protégée, priorités.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hasDb, withSchema } = require('./helpers/db');
const L = require('../utils/liensEmail');

test('liens : catégories et libellés, robots reconnus', () => {
  assert.equal(L.categorie('https://www.pixfeed.net/maintenance-prestashop/'), 'prestations');
  assert.equal(L.categorie('https://pixfeed.net/'), 'signature');
  assert.equal(L.categorie('https://www.linkedin.com/in/marc'), 'reseaux');
  assert.equal(L.categorie('https://crm.pixfeed.net/api/track/u?e=a@b.fr&t=x'), 'desinscription');
  assert.equal(L.categorie('https://agrigom.fr/'), 'autre');
  assert.equal(L.libelle('https://www.pixfeed.net/maintenance-prestashop/'), 'votre page /maintenance-prestashop');
  assert.equal(L.libelle('https://www.linkedin.com/in/marc'), 'votre LinkedIn');
  const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
  assert.equal(L.raisonAutomatique({ ua: chrome, delaiS: 3600, methode: 'GET' }), null);
  assert.match(L.raisonAutomatique({ ua: chrome, delaiS: 8, methode: 'GET' }), /8 s après l'envoi/);
  assert.match(L.raisonAutomatique({ ua: 'Mozilla/5.0 (compatible; Barracuda Sentinel)', delaiS: 3600 }), /service automatique/);
  assert.match(L.raisonAutomatique({ ua: '', delaiS: 3600 }), /aucun navigateur/);
  assert.match(L.raisonAutomatique({ ua: chrome, delaiS: 3600, methode: 'HEAD' }), /HEAD/);
  assert.deepEqual(L.liensDe('<a href="https://pixfeed.net/a?x=1&amp;y=2">a</a> <a href="mailto:x@y.fr">m</a> <a href=\'https://linkedin.com/in/m\'>l</a>'), ['https://pixfeed.net/a?x=1&y=2', 'https://linkedin.com/in/m']);
});

test('clics en base : journal, robots non comptés, rafale, redirection limitée aux liens de l\'email, priorités', { skip: !hasDb() }, async () => {
  await withSchema('signaux', async ({ pool }) => {
    const db = { pool };
    const express = require('express');
    const http = require('http');
    await pool.query(`CREATE TABLE leads (id SERIAL PRIMARY KEY, name TEXT, company TEXT, website TEXT, email TEXT, phone TEXT, relation_status TEXT DEFAULT 'contacte', crawl_result_id INT)`);
    await pool.query('CREATE TABLE contacts (id SERIAL PRIMARY KEY, lead_id INT, email TEXT)');
    await pool.query(`CREATE TABLE interactions (id SERIAL PRIMARY KEY, contact_type VARCHAR(10), contact_id INT, type TEXT, reached TEXT, date TIMESTAMP DEFAULT NOW(), notes TEXT, next_followup_date DATE, next_followup_channel TEXT, followup_done BOOLEAN DEFAULT FALSE)`);
    await pool.query('CREATE TABLE email_optout (email TEXT PRIMARY KEY, source TEXT, created_at TIMESTAMPTZ DEFAULT NOW())');
    await pool.query(`CREATE TABLE prospect_refus (id SERIAL PRIMARY KEY, lead_id INTEGER, domaine TEXT, canal VARCHAR(10) NOT NULL, motif TEXT, source VARCHAR(30), created_at TIMESTAMPTZ DEFAULT NOW(), retire_le TIMESTAMPTZ, retire_motif TEXT)`);
    await pool.query('CREATE TABLE campaigns (id SERIAL PRIMARY KEY, nom TEXT)');
    await pool.query('CREATE TABLE campaign_items (id SERIAL PRIMARY KEY, campaign_id INT, lead_id INT, statut TEXT, subject TEXT, updated_at TIMESTAMPTZ DEFAULT NOW())');
    await pool.query(`CREATE TABLE email_tracking (id SERIAL PRIMARY KEY, token VARCHAR(64) UNIQUE NOT NULL, contact_type VARCHAR(10) DEFAULT 'lead', contact_id INTEGER, to_email TEXT, subject TEXT, sent_at TIMESTAMPTZ DEFAULT NOW(), open_count INTEGER DEFAULT 0, first_open_at TIMESTAMPTZ, last_open_at TIMESTAMPTZ, click_count INTEGER DEFAULT 0, last_click_at TIMESTAMPTZ, last_click_url TEXT, liens JSONB, clics_avant_journal INTEGER DEFAULT 0)`);
    const src = require('fs').readFileSync(require.resolve('../scripts/autoInitDatabase'), 'utf8');
    const i0 = src.indexOf('CREATE TABLE IF NOT EXISTS email_clics (');
    await pool.query(src.slice(i0, src.indexOf(');', i0) + 2));

    const T = require('../services/emailTracking');
    const lead = (await pool.query("INSERT INTO leads (name, company, email) VALUES ('Agrigom', 'agrigom.fr', 'contact@agrigom.fr') RETURNING id")).rows[0].id;
    const tok = await T.createTracking(db, { contact_id: lead, to_email: 'contact@agrigom.fr', subject: 'Le cadenas de votre boutique' });
    const html = await T.tracer(db, '<p>x</p><a href="https://www.pixfeed.net/maintenance/">m</a><a href="https://pixfeed.net/">s</a><a href="https://www.linkedin.com/in/marc">l</a>', tok);
    assert.match(html, /\/api\/track\/c\//);
    // Envoyé il y a 2 heures (un clic dans la minute serait automatique).
    await pool.query("UPDATE email_tracking SET sent_at = NOW() - interval '2 hours' WHERE token = $1", [tok]);

    const app = express(); app.locals.db = db; app.use('/api/track', require('../routes/trackRoutes'));
    const srv = http.createServer(app); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${srv.address().port}`;
    const chrome = 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
    const clic = (t, url, ua = chrome, method = 'GET') => fetch(`${base}/api/track/c/${t}?u=${encodeURIComponent(url)}`, { redirect: 'manual', method, headers: { 'User-Agent': ua } });
    try {
      // Redirection : seulement vers un lien de l'email, et seulement avec un vrai jeton.
      assert.equal((await clic(tok, 'https://evil.example/')).status, 404);
      assert.equal((await clic('jeton-invente', 'https://www.pixfeed.net/maintenance/')).status, 404);
      // Robot (service de sécurité) : redirigé, journalisé, pas compté.
      let r = await clic(tok, 'https://www.pixfeed.net/maintenance/', 'Mozilla/5.0 (compatible; Proofpoint URL Defense)');
      assert.equal(r.status, 302); assert.equal(r.headers.get('location'), 'https://www.pixfeed.net/maintenance/');
      let t = (await pool.query('SELECT click_count FROM email_tracking WHERE token = $1', [tok])).rows[0];
      assert.equal(t.click_count, 0);
      // Clic humain sur la page de prestations : compté, noté dans l'historique.
      await pool.query("UPDATE email_clics SET clique_le = NOW() - interval '1 hour'");
      r = await clic(tok, 'https://www.pixfeed.net/maintenance/');
      assert.equal(r.status, 302);
      t = (await pool.query('SELECT click_count, last_click_url FROM email_tracking WHERE token = $1', [tok])).rows[0];
      assert.equal(t.click_count, 1); assert.equal(t.last_click_url, 'https://www.pixfeed.net/maintenance/');
      assert.match((await pool.query('SELECT notes FROM interactions WHERE contact_id = $1', [lead])).rows[0].notes, /Lien cliqué : votre page \/maintenance \(email « Le cadenas de votre boutique » \)|Lien cliqué : votre page \/maintenance \(email « Le cadenas de votre boutique »\)/);
      // Rafale : un deuxième lien différent dans les 10 s -> les deux deviennent automatiques.
      await clic(tok, 'https://www.linkedin.com/in/marc');
      t = (await pool.query('SELECT click_count FROM email_tracking WHERE token = $1', [tok])).rows[0];
      assert.equal(t.click_count, 0, 'rafale : plus aucun clic humain');
      const j = (await pool.query('SELECT categorie, automatique, raison FROM email_clics ORDER BY id')).rows;
      assert.deepEqual(j.map((x) => [x.categorie, x.automatique]), [['prestations', true], ['prestations', true], ['reseaux', true]]);
      // Ancien email (avant le lot 6, pas de liste) : redirection permise si le jeton existe.
      await pool.query("INSERT INTO email_tracking (token, contact_id, subject, sent_at, click_count, clics_avant_journal) VALUES ('ancien', $1, 'Ancien', NOW() - interval '20 days', 2, 2)", [lead]);
      assert.equal((await clic('ancien', 'https://pixfeed.net/')).status, 302);
      assert.equal((await pool.query("SELECT click_count FROM email_tracking WHERE token = 'ancien'")).rows[0].click_count, 3, 'anciens clics gardés + nouveau');
    } finally { srv.close(); }

    // Priorités : la réponse avant le clic, raisons en clair, les refus et les fiches traitées exclus.
    const P = require('../services/prioriteService');
    const b = (await pool.query("INSERT INTO leads (name, company, email) VALUES ('B', 'b.fr', 'x@b.fr') RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO campaigns (nom) VALUES ('Première Campagne')");
    await pool.query("INSERT INTO campaign_items (campaign_id, lead_id, statut, subject) VALUES (1, $1, 'repondu', 'Votre site et Google')", [b]);
    const tokC = await T.createTracking(db, { contact_id: lead, subject: 'Relance' });
    await pool.query("UPDATE email_tracking SET liens = '[\"https://www.pixfeed.net/depannage/\"]' WHERE token = $1", [tokC]);
    const tid = (await pool.query('SELECT id FROM email_tracking WHERE token = $1', [tokC])).rows[0].id;
    await pool.query("INSERT INTO email_clics (tracking_id, url, categorie, clique_le, automatique) VALUES ($1, 'https://www.pixfeed.net/depannage/', 'prestations', '2026-11-04T13:12:00Z', FALSE), ($1, 'https://pixfeed.net/', 'signature', NOW() - interval '1 day', FALSE)", [tid]);
    await pool.query("UPDATE email_clics SET clique_le = NOW() - interval '2 days' WHERE url LIKE '%depannage%'");
    let p = await P.lister(db);
    assert.deepEqual(p.items.map((x) => x.lead_id), [b, lead]);
    assert.match(p.items[0].raisons[0], /^a répondu le \d\d\/\d\d à l'email « Votre site et Google » \(campagne « Première Campagne »\)/);
    assert.match(p.items[1].raisons[0], /^a cliqué sur votre page \/depannage le \d\d\/\d\d à \d\d h \d\d/);
    assert.ok(p.items[1].raisons.some((x) => /jours différents/.test(x)));
    // Échange noté après le dernier signal : sort de la liste. Refus : sort aussi.
    await pool.query("INSERT INTO interactions (contact_type, contact_id, type, reached, date) VALUES ('lead', $1, 'appel', 'joint', NOW())", [lead]);
    await pool.query("INSERT INTO prospect_refus (lead_id, canal) VALUES ($1, 'email')", [b]);
    p = await P.lister(db);
    assert.equal(p.items.length, 0);
    const jf = await P.journalFiche(db, lead);
    assert.ok(jf.some((x) => x.libelle === 'votre page /depannage'));
  });
});
