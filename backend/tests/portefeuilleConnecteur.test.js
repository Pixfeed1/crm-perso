// Connecteur Claude.ai, portefeuille : crawl (lancer, suivre, lire, convertir, réanalyser), prospects, clients,
// échanges notés (journal seulement), signaux AFNIC. Passe par la vraie route (secret partagé) et par le même
// code que les boutons de l'interface.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const { hasDb, withSchema } = require('./helpers/db');
const { DATABASE_SCHEMA } = require('../scripts/autoInitDatabase');

async function createFromSchema(pool, name) {
  const cols = Object.entries(DATABASE_SCHEMA[name].columns).map(([c, d]) => `${c} ${d.replace(/REFERENCES [a-z_]+\(id\)( ON DELETE [A-Z ]+)?/g, '')}`).join(', ');
  await pool.query(`CREATE TABLE ${name} (${cols})`);
}

test('portefeuille par le connecteur : crawl, prospects, clients, échanges, signaux', { skip: !hasDb() && 'TEST_DATABASE_URL absent' }, async () => {
  await withSchema('portefeuille_mcp', async ({ pool }) => {
    const db = { pool };
    const { typedResult, insertCrawlResult } = require('../controllers/crawlController');
    for (const t of ['crawl_jobs', 'crawl_results', 'campaigns', 'campaign_items', 'crm_clients', 'maintenance_contracts', 'invoices', 'quotes', 'projects', 'domain_signals']) await createFromSchema(pool, t);
    await pool.query("ALTER TABLE crm_clients ADD COLUMN IF NOT EXISTS relation_status VARCHAR(20) DEFAULT 'nouveau'");
    await pool.query('CREATE TABLE crawl_seen_domains (domain TEXT PRIMARY KEY, source VARCHAR(20), first_seen TIMESTAMP DEFAULT NOW())');
    await pool.query(`CREATE TABLE leads (id SERIAL PRIMARY KEY, name TEXT, company TEXT, website TEXT, email TEXT, relation_status TEXT DEFAULT 'nouveau', status TEXT, crawl_result_id INTEGER, platform TEXT, angles TEXT, score INTEGER, notes TEXT, source TEXT, type TEXT, phone TEXT, facebook_url TEXT, instagram_url TEXT, site_type TEXT, siren TEXT, sector TEXT, naf TEXT, effectif TEXT, city TEXT, postal_code TEXT, department TEXT, prestataire TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP)`);
    await pool.query(`CREATE TABLE interactions (id SERIAL PRIMARY KEY, contact_type VARCHAR(10), contact_id INT, type TEXT, reached TEXT, date TIMESTAMP DEFAULT NOW(), notes TEXT, result TEXT, relation_status TEXT, next_followup_date DATE, next_followup_channel TEXT, followup_done BOOLEAN DEFAULT FALSE, relance_step INT, created_at TIMESTAMP DEFAULT NOW())`);
    await pool.query('CREATE TABLE email_optout (email TEXT PRIMARY KEY, source TEXT, created_at TIMESTAMP DEFAULT NOW())');
    await pool.query(`CREATE TABLE prospect_refus (id SERIAL PRIMARY KEY, lead_id INTEGER, domaine TEXT, canal VARCHAR(10) NOT NULL, motif TEXT, source VARCHAR(30) DEFAULT 'fiche', created_at TIMESTAMPTZ DEFAULT NOW(), retire_le TIMESTAMPTZ, retire_motif TEXT)`);
    await pool.query('CREATE TABLE contacts (id SERIAL PRIMARY KEY, lead_id INTEGER, client_id INTEGER, name TEXT, email TEXT, phone TEXT, position TEXT)');
    await pool.query('CREATE TABLE affaires (id SERIAL PRIMARY KEY, lead_id INTEGER, client_id INTEGER, titre TEXT, type_besoin TEXT, etape TEXT, montant_ponctuel NUMERIC, montant_mensuel NUMERIC, motif TEXT, prochaine_action_date DATE, prochaine_action_canal TEXT, prochaine_action_note TEXT)');
    await pool.query('CREATE TABLE subscriptions (id SERIAL PRIMARY KEY, client_id INTEGER, label TEXT, amount_eur NUMERIC, billing_interval TEXT, billing_status TEXT)');

    const job = (await pool.query("INSERT INTO crawl_jobs (techno, nb_sites, statut, phase, progress_done, progress_total) VALUES ('prestashop', 3, 'done', 'done', 3, 3) RETURNING id")).rows[0].id;
    const maintenant = new Date().toISOString();
    const site = (domain, extra = {}) => insertCrawlResult(db, job, typedResult({ domain, platform: 'PrestaShop', http_status: '200', final_url: `https://${domain}/`, https_final: 'oui', ssl_ok: 'oui', title: domain, email: `contact@${domain}`, analyse_le: maintenant, ...extra }));
    const r1 = await site('agrigom.fr', { https_final: 'non', final_url: 'http://agrigom.fr/', ville: 'Pontoise' });
    const r2 = await site('velo-pieces.fr');
    const r3 = await site('autre-agence.fr', { parked: 'oui' });

    process.env.OUTILS_MCP_SECRET = 'p'.repeat(40);
    const app = express(); app.use(express.json()); app.locals.db = db;
    app.use('/api/campagnes-connecteur', require('../routes/campagneConnecteurRoutes'));
    const srv = http.createServer(app); await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
    const appel = async (action, corps = {}) => {
      const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/campagnes-connecteur/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Outils-Secret': 'p'.repeat(40) }, body: JSON.stringify(corps) });
      return { status: r.status, corps: await r.json() };
    };
    try {
      // Crawl : techno contrôlée par le même code que le bouton (aucun crawl réel lancé dans ce test).
      let r = await appel('crawl-lancer', { techno: 'tout', nb_sites: 10 });
      assert.equal(r.status, 400); assert.match(r.corps.message, /Techno invalide/);
      r = await appel('crawl-etat', {});
      assert.deepEqual([r.corps.job_id, r.corps.statut, r.corps.avancement, r.corps.resultats], [job, 'done', '3/3', 3]);
      r = await appel('crawl-resultat', { id: r1 });
      assert.equal(r.corps.domain, 'agrigom.fr');
      assert.ok(r.corps.preuves.some((p) => /HTTP/i.test(p)), JSON.stringify(r.corps.preuves));
      assert.equal(r.corps.prospect, undefined);

      // Convertir : mêmes contrôles que le bouton (domaine parqué ignoré, avec la raison).
      r = await appel('crawl-convertir', { result_ids: [r1, r3, 9999] });
      assert.equal(r.status, 200, JSON.stringify(r.corps));
      assert.equal(r.corps.crees, 1);
      assert.ok(r.corps.ignores.some((x) => x.domain === 'autre-agence.fr'));
      assert.ok(r.corps.ignores.some((x) => x.result_id === 9999 && x.raison === 'introuvable'));
      const lead = r.corps.lead_ids[0];
      assert.equal((await appel('crawl-resultat', { id: r1 })).corps.prospect.lead_id, lead);
      r = await appel('crawl-convertir', { result_ids: [r2], pas_business: true, note: 'boutique fermée' });
      assert.equal((await pool.query('SELECT relation_status FROM leads WHERE id = $1', [r.corps.lead_ids[0]])).rows[0].relation_status, 'pas_business');

      // Réanalyse d'un résultat pas encore converti (crawler et SIRENE factices).
      const R = require('../services/leadReanalyzeService');
      const r4 = await site('nouveau-site.fr');
      const ra = await R.reanalyzeResult(db, r4, { detect: async () => [{ domain: 'nouveau-site.fr', platform: 'PrestaShop', http_status: '200', final_url: 'http://nouveau-site.fr/', https_final: 'non', ssl_ok: 'oui', title: 'Nouveau', analyse_le: new Date().toISOString() }], sirene: async () => ({ found: false }) });
      assert.equal(ra.crawl_result_id, r4);
      assert.ok(ra.preuves.some((p) => /HTTP/i.test(p)));
      assert.equal((await pool.query('SELECT https_final FROM crawl_results WHERE id = $1', [r4])).rows[0].https_final, false);
      assert.equal((await appel('reanalyser-site', {})).status, 400);

      // Prospects : recherche filtrée, fiche complète.
      await pool.query("UPDATE leads SET city = 'Pontoise', department = '95' WHERE id = $1", [lead]);
      r = await appel('prospects', { ville: 'Pontoise' });
      assert.deepEqual(r.corps.prospects.map((p) => p.id), [lead]);
      r = await appel('prospects', { ville: '95', plateforme: 'presta', score_min: 0 });
      assert.deepEqual(r.corps.prospects.map((p) => p.id), [lead]);
      await pool.query("INSERT INTO contacts (lead_id, name, email, position) VALUES ($1, 'Jean Agri', 'jean@agrigom.fr', 'gérant')", [lead]);
      r = await appel('prospect-lire', { id: lead });
      assert.deepEqual([r.corps.site, r.corps.relation, r.corps.contacts[0].fonction], ['http://agrigom.fr/', 'nouveau', 'gérant']);
      assert.ok(r.corps.analyse_du_site.preuves.length);

      // Échanges notés : prospect et client ; aucun envoi ; refus de prospection respecté.
      r = await appel('interagir', { contact_type: 'lead', contact_id: lead, type: 'appel', reached: 'joint', notes: 'Intéressé, rappeler après les fêtes', relation_status: 'en_discussion', relance_le: '2027-01-05', relance_canal: 'appel' });
      assert.equal(r.status, 200, JSON.stringify(r.corps));
      assert.deepEqual([r.corps.relation_status, r.corps.relance_canal], ['en_discussion', 'appel']);
      assert.match(r.corps.note, /aucun message envoyé/);
      assert.equal((await pool.query('SELECT relation_status FROM leads WHERE id = $1', [lead])).rows[0].relation_status, 'en_discussion');
      await pool.query("INSERT INTO prospect_refus (lead_id, canal) VALUES ($1, 'appel')", [lead]);
      r = await appel('interagir', { contact_type: 'lead', contact_id: lead, notes: 'relancer', relance_le: '2027-02-01', relance_canal: 'appel' });
      assert.equal(r.status, 409); assert.match(r.corps.message, /refus de prospection/);
      assert.equal((await appel('interagir', { contact_type: 'lead', contact_id: 9999, notes: 'x' })).status, 404);
      assert.equal((await appel('interagir', { contact_type: 'lead', contact_id: lead })).status, 400);

      const client = (await pool.query("INSERT INTO crm_clients (name, email, status) VALUES ('Boulangerie Martin', 'contact@martin.fr', 'active') RETURNING id")).rows[0].id;
      await pool.query("INSERT INTO maintenance_contracts (client_id, site_name, plan, monthly_amount, status) VALUES ($1, 'martin.fr', 'essentiel', 49, 'active')", [client]);
      await pool.query("INSERT INTO invoices (invoice_number, client_id, title, status, payment_status, total_ttc, amount_remaining, issue_date, due_date) VALUES ('F-2026-01', $1, 'Solde site', 'sent', 'unpaid', 708, 708, '2026-11-18', '2026-11-18')", [client]);
      r = await appel('clients-lister', { recherche: 'martin' });
      assert.deepEqual(r.corps.clients.map((c) => [c.nom, c.contrats_actifs, c.reste_a_payer]), [['Boulangerie Martin', 1, 708]]);
      r = await appel('interagir', { contact_type: 'client', contact_id: client, type: 'appel', notes: 'Relance du solde : virement promis aujourd\'hui', relance_le: '2026-11-21', relance_canal: 'appel' });
      assert.equal(r.status, 200, JSON.stringify(r.corps));
      r = await appel('client-lire', { id: client });
      assert.deepEqual([r.corps.contrats_maintenance[0].site_name, r.corps.factures[0].invoice_number, r.corps.interactions[0].notes], ['martin.fr', 'F-2026-01', 'Relance du solde : virement promis aujourd\'hui']);

      // Signaux AFNIC : lecture, promotion en prospect par le même code que le bouton.
      const sig = (await pool.query("INSERT INTO domain_signals (domain, source, statut, company_name, siren, city, website_status, intent_score) VALUES ('plombier-osny.fr', 'afnic', 'qualifie', 'PLOMBERIE OSNY', '123456789', 'Osny', 'absent', 70) RETURNING id")).rows[0].id;
      r = await appel('signaux-domaines', { statut: 'qualifie' });
      assert.equal(r.status, 200, JSON.stringify(r.corps));
      assert.deepEqual(r.corps.signaux.map((s) => [s.domaine, s.entreprise, s.score_intention]), [['plombier-osny.fr', 'PLOMBERIE OSNY', 70]]);
      r = await appel('signaux-promouvoir', { ids: [sig] });
      assert.equal(r.status, 200, JSON.stringify(r.corps));
      assert.equal((await pool.query('SELECT statut, prospect_id FROM domain_signals WHERE id = $1', [sig])).rows[0].statut, 'promu');
      assert.equal((await appel('signaux-promouvoir', { ids: [] })).status, 400);
    } finally { srv.close(); }
  });
});
