// Campagnes de prospection par le connecteur MCP : tout lire et tout préparer, jamais valider, programmer,
// relancer ni supprimer (réservé à Marc, dans l'interface). Passe par la vraie route (secret partagé).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const { hasDb, withSchema } = require('./helpers/db');
const { DATABASE_SCHEMA } = require('../scripts/autoInitDatabase');

async function createFromSchema(pool, name) {
  const cols = Object.entries(DATABASE_SCHEMA[name].columns).map(([c, d]) => `${c} ${d.replace(/REFERENCES users\(id\)/, '')}`).join(', ');
  await pool.query(`CREATE TABLE ${name} (${cols})`);
}

test('connecteur : lire et préparer une campagne ; validation, programmation, reprise et suppression refusées', { skip: !hasDb() && 'TEST_DATABASE_URL absent' }, async () => {
  await withSchema('campagne_mcp', async ({ pool }) => {
    const db = { pool };
    const S = require('../services/campaignService');
    const { typedResult, insertCrawlResult } = require('../controllers/crawlController');
    for (const t of ['crawl_jobs', 'crawl_results', 'campaigns', 'campaign_items', 'scheduled_emails']) await createFromSchema(pool, t);
    await pool.query('CREATE TABLE crawl_seen_domains (domain TEXT PRIMARY KEY, source VARCHAR(20), first_seen TIMESTAMP DEFAULT NOW())');
    await pool.query(`CREATE TABLE leads (id SERIAL PRIMARY KEY, name TEXT, company TEXT, website TEXT, email TEXT, relation_status TEXT DEFAULT 'nouveau', status TEXT, crawl_result_id INTEGER, platform TEXT, angles TEXT, score INTEGER, notes TEXT, source TEXT, type TEXT, phone TEXT, facebook_url TEXT, instagram_url TEXT, site_type TEXT, siren TEXT, sector TEXT, naf TEXT, effectif TEXT, city TEXT, postal_code TEXT, department TEXT, prestataire TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP)`);
    await pool.query(`CREATE TABLE interactions (id SERIAL PRIMARY KEY, contact_type VARCHAR(10), contact_id INT, type TEXT, reached TEXT, date TIMESTAMP DEFAULT NOW(), notes TEXT, result TEXT, relation_status TEXT, next_followup_date DATE, next_followup_channel TEXT, followup_done BOOLEAN DEFAULT FALSE, relance_step INT, created_at TIMESTAMP DEFAULT NOW())`);
    await pool.query('CREATE TABLE email_optout (email TEXT PRIMARY KEY, source TEXT, created_at TIMESTAMP DEFAULT NOW())');
    await pool.query('CREATE TABLE email_log (id SERIAL PRIMARY KEY, to_email TEXT, source VARCHAR(40), created_at TIMESTAMP DEFAULT NOW())');
    await pool.query('CREATE TABLE email_signatures (id SERIAL PRIMARY KEY, content TEXT, is_default BOOLEAN DEFAULT FALSE)');
    await pool.query('CREATE TABLE email_tracking (id SERIAL PRIMARY KEY, token TEXT, contact_type TEXT, contact_id INT, to_email TEXT, subject TEXT, opens INT DEFAULT 0)');
    await pool.query(`CREATE TABLE prospect_refus (id SERIAL PRIMARY KEY, lead_id INTEGER, domaine TEXT, canal VARCHAR(10) NOT NULL, motif TEXT, source VARCHAR(30) DEFAULT 'fiche', created_at TIMESTAMPTZ DEFAULT NOW(), retire_le TIMESTAMPTZ, retire_motif TEXT)`);
    process.env.OUTREACH_SENDER_NAME = 'Marc';
    const job = (await pool.query("INSERT INTO crawl_jobs (techno, nb_sites, statut) VALUES ('prestashop', 2, 'done') RETURNING id")).rows[0].id;
    const maintenant = new Date().toISOString();
    const r1 = await insertCrawlResult(db, job, typedResult({ domain: 'agrigom.fr', platform: 'PrestaShop', http_status: '200', final_url: 'http://www.agrigom.fr/', https_final: 'non', ssl_ok: 'oui', title: 'AGRIGOM', email: 'contact@agrigom.fr', analyse_le: maintenant }));
    const r2 = await insertCrawlResult(db, job, typedResult({ domain: 'velo-pieces.fr', platform: 'PrestaShop', http_status: '200', final_url: 'https://velo-pieces.fr/', https_final: 'oui', ssl_ok: 'oui', title: 'Vélo pièces', email: 'contact@velo-pieces.fr', analyse_le: maintenant }));
    const l1 = (await pool.query("INSERT INTO leads (name, company, email, website, crawl_result_id) VALUES ('AGRIGOM', 'agrigom.fr', 'contact@agrigom.fr', 'agrigom.fr', $1) RETURNING id", [r1])).rows[0].id;
    const l2 = (await pool.query("INSERT INTO leads (name, company, email, website) VALUES ('Désinscrit', 'x.fr', 'stop@x.fr', 'x.fr') RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO email_optout (email, source) VALUES ('stop@x.fr', 'lien')");
    S.lancerReanalyse = () => {};                                   // pas de réanalyse réelle des sites pendant le test

    process.env.OUTILS_MCP_SECRET = 'c'.repeat(40);
    const app = express(); app.use(express.json()); app.locals.db = db;
    app.use('/api/campagnes-connecteur', require('../routes/campagneConnecteurRoutes'));
    const srv = http.createServer(app); await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
    const appel = async (action, corps = {}, secret = 'c'.repeat(40)) => {
      const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/campagnes-connecteur/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Outils-Secret': secret }, body: JSON.stringify(corps) });
      const t = await r.text();
      return { code: r.status, j: (() => { try { return JSON.parse(t); } catch { return {}; } })() };
    };
    try {
      assert.equal((await appel('lister', {}, 'mauvais'.repeat(6))).code, 401, 'secret du connecteur requis');
      // Prospects : drapeaux de blocage.
      let r = await appel('prospects', { recherche: 'x.fr' });
      assert.deepEqual(r.j.prospects.map((p) => [p.id, p.desinscrit]), [[l2, true]]);
      // Créer, ajouter des fiches puis des sites d'un crawl.
      r = await appel('creer', { nom: 'Boutiques PrestaShop', mode: 'preuve', par_jour: 10 });
      const cid = r.j.campagne.id;
      assert.equal(r.j.campagne.statut, 'brouillon');
      r = await appel('ajouter', { id: cid, lead_ids: [l1, l2] });
      assert.deepEqual([r.code, r.j.ajoutes, r.j.exclu], [200, 2, 1], JSON.stringify(r.j));
      r = await appel('crawls', { job_id: job });
      assert.equal(r.j.resultats.length, 2);
      r = await appel('ajouter', { id: cid, job_id: job, result_ids: [r2] });
      assert.equal(r.j.ajoutes, 1, JSON.stringify(r.j));
      // Lire : réglages, lignes par statut, lignes sans texte complet par défaut.
      r = await appel('lire', { id: cid });
      assert.equal(r.j.campagne.cadence.par_jour, 10);
      const pret = r.j.lignes.find((x) => x.statut === 'pret');
      assert.ok(pret && pret.debut && !pret.texte, 'début du texte seulement');
      assert.equal(r.j.lignes_par_statut.exclu, 1);
      assert.match(r.j.lignes.find((x) => x.statut === 'exclu').raison, /définitivement/);
      r = await appel('lire', { id: cid, statut: ['pret'], textes: true });
      assert.ok(r.j.lignes.every((x) => x.statut === 'pret' && x.texte));
      r = await appel('ligne', { id: cid, ligne: pret.id });
      assert.match(r.j.texte, /Bonne journée/); assert.equal(r.j.prospect.lead_id, l1);
      // Modifier une ligne : texte, formulation interdite refusée, exclure / remettre.
      r = await appel('modifier-ligne', { id: cid, ligne: pret.id, texte: `${r.j.texte}\nPS : relu par Claude.` });
      assert.match(r.j.ligne.texte, /PS : relu par Claude/);
      r = await appel('modifier-ligne', { id: cid, ligne: pret.id, texte: 'Un simple oui suffit.' });
      assert.deepEqual([r.code, /interdite/.test(r.j.message)], [422, true]);
      // Réservé à Marc : valider, programmer, relancer, supprimer, écarter un refus.
      r = await appel('modifier-ligne', { id: cid, ligne: pret.id, statut: 'valide' });
      assert.deepEqual([r.code, /réservé à Marc/.test(r.j.message)], [403, true]);
      for (const action of ['reprendre', 'programmer', 'supprimer']) {
        r = await appel('piloter', { id: cid, action });
        assert.equal(r.code, 403, action);
      }
      assert.equal((await appel('valider', { id: cid })).code, 404, 'aucune route de validation');
      assert.equal((await appel('boite', { action: 'confirmer', message: 1, decision: 'pas_refus' })).code, 403);
      assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM scheduled_emails')).rows[0].n, 0, 'rien de programmé');
      assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM campaign_items WHERE statut = 'valide'")).rows[0].n, 0, 'rien de validé');
      // Réécriture en lot sur le serveur (mode maintenance : sans appel au modèle) ; une ligne validée par Marc repasse « prêt ».
      await S.updateItem(db, cid, pret.id, { statut: 'valide' });                     // Marc valide, dans l'interface
      r = await appel('regenerer', { id: cid, mode: 'maintenance', statuts: ['pret', 'a_verifier', 'valide'] });
      assert.ok(r.j.regenerees >= 1 && r.j.demandees === r.j.regenerees, JSON.stringify(r.j));
      assert.equal((await pool.query('SELECT statut, mode FROM campaign_items WHERE id = $1', [pret.id])).rows[0].statut, 'pret');
      // Test A/B : propositions sans ab.
      r = await appel('test-ab', { id: cid });
      assert.ok(r.j.propositions, JSON.stringify(r.j));
      // Réglages ; pause ; arrêt seulement avec confirmer.
      r = await appel('modifier', { id: cid, par_jour: 12, nom: 'Boutiques PrestaShop (relues)' });
      assert.deepEqual([r.j.campagne.par_jour, r.j.campagne.nom], [12, 'Boutiques PrestaShop (relues)']);
      r = await appel('piloter', { id: cid, action: 'arreter' });
      assert.deepEqual([r.code, /confirmer=true/.test(r.j.message)], [400, true]);
      r = await appel('piloter', { id: cid, action: 'arreter', confirmer: true });
      assert.equal(r.j.campaign.statut, 'arretee');
    } finally { srv.close(); }
  });
});
