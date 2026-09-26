// Crawl : ligne CSV brute -> résultat typé -> crawl_results -> prospect ; et promotion d'un
// signal AFNIC sans site en prospect « création de site ». Nécessite TEST_DATABASE_URL (sinon skip).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hasDb, withSchema } = require('./helpers/db');
const crawl = require('../controllers/crawlController');
const { DATABASE_SCHEMA } = require('../scripts/autoInitDatabase');
const signalService = require('../services/domainSignalService');

// Crée une table du schéma déclaratif dans le schéma de test (les REFERENCES se résolvent via search_path).
async function createFromSchema(pool, name) {
  const cols = Object.entries(DATABASE_SCHEMA[name].columns).map(([c, d]) => `${c} ${d}`).join(', ');
  await pool.query(`CREATE TABLE ${name} (${cols})`);
}

test('ligne CSV brute -> typée : booléens, entiers, https déduit, titre antibot jeté', () => {
  const r = crawl.typedResult({ domain: 'a.fr', platform: 'PrestaShop', http_status: '200', final_url: 'http://a.fr/', title: 'Just a moment...', ssl_ok: 'non', poids_ko: 'abc', copyright_annee: '2019', cgv: 'non', sitemap: 'vide' });
  assert.equal(r.title, null);
  assert.equal(r.ssl_ok, false);
  assert.equal(r.https_final, false);         // déduit de l'URL finale (CSV sans la colonne)
  assert.equal(r.poids_ko, null);
  assert.equal(r.copyright_annee, 2019);
  assert.equal(r.cgv, false);
  assert.equal(r.sitemap, 'vide');
  assert.equal(r.parked, false);
  const r2 = crawl.typedResult({ domain: 'b.fr', https_final: 'oui', final_url: 'http://b.fr/' });
  assert.equal(r2.https_final, true);         // colonne présente : elle prime
});

test('insertion + prospect depuis un résultat, promotion d\'un signal sans site', { skip: !hasDb() && 'TEST_DATABASE_URL absent' }, async () => {
  await withSchema('ingest', async ({ pool }) => {
    const db = { pool };
    await createFromSchema(pool, 'crawl_jobs');
    await createFromSchema(pool, 'crawl_results');
    await pool.query('CREATE TABLE crawl_seen_domains (domain TEXT PRIMARY KEY, source VARCHAR(20), first_seen TIMESTAMP DEFAULT NOW())');
    await pool.query(`CREATE TABLE leads (id SERIAL PRIMARY KEY, name TEXT, company TEXT, type TEXT, status TEXT, source TEXT, notes TEXT, email TEXT, phone TEXT,
      facebook_url TEXT, instagram_url TEXT, relation_status TEXT, crawl_result_id INTEGER, platform TEXT, website TEXT, site_type TEXT, siren TEXT, sector TEXT,
      naf TEXT, effectif TEXT, city TEXT, postal_code TEXT, department TEXT, angles TEXT, score INTEGER, prestataire TEXT, created_at TIMESTAMP, updated_at TIMESTAMP)`);
    await createFromSchema(pool, 'domain_signal_imports');
    await createFromSchema(pool, 'domain_signals');
    const job = await pool.query("INSERT INTO crawl_jobs (techno, nb_sites, statut) VALUES ('prestashop', 1, 'done') RETURNING id");

    const typed = crawl.typedResult({ domain: 'equiptout.fr', platform: 'PrestaShop', platform_version: '1.6.1', http_status: '200', final_url: 'https://www.equiptout.fr/', title: 'Equit Tout', email: 'contact@equiptout.fr', ssl_ok: 'oui', https_final: 'oui', mentions_legales: 'oui', sitemap: 'vide', site_type: 'commerce', ecommerce_actif: 'oui' });
    const rid = await crawl.insertCrawlResult(db, job.rows[0].id, typed);
    const row = (await pool.query('SELECT * FROM crawl_results WHERE id = $1', [rid])).rows[0];
    assert.equal(row.sitemap, 'vide'); assert.equal(row.ecommerce_actif, true);
    assert.equal((await pool.query('SELECT domain FROM crawl_seen_domains')).rows[0].domain, 'equiptout.fr');

    const leadId = await crawl.createLeadFromResult(db, row, { source: 'AFNIC', sourceLine: 'Signal AFNIC', extraNotes: ['Signaux détectés :\n✓ test'] });
    const lead = (await pool.query('SELECT * FROM leads WHERE id = $1', [leadId])).rows[0];
    assert.equal(lead.source, 'AFNIC'); assert.equal(lead.company, 'equiptout.fr'); assert.equal(lead.email, 'contact@equiptout.fr');
    assert.match(lead.notes, /Signaux détectés/); assert.match(lead.notes, /Source : Signal AFNIC/);
    assert.match(lead.angles || '', /sitemap_vide/);
    assert.equal((await pool.query('SELECT added_as_prospect FROM crawl_results WHERE id = $1', [rid])).rows[0].added_as_prospect, true);

    // Signal sans site (parking) identifié SIRENE -> prospect « création de site », puis dédup.
    await pool.query(`INSERT INTO domain_signals (domain, registered_at, statut, metier, company_name, siren, naf_label, city, postal_code, department, company_created_at, match_confidence, website_status, intent_score, signaux)
      VALUES ('dupont-plomberie.fr', CURRENT_DATE - 1, 'qualifie', 'plomb', 'DUPONT PLOMBERIE', '123456789', 'Travaux de plomberie', 'Bourg-en-Bresse', '01000', '01', CURRENT_DATE - 12, 'sur', 'parking', 95, '["Entreprise identifiée : DUPONT PLOMBERIE"]')`);
    const sid = (await pool.query('SELECT id FROM domain_signals')).rows[0].id;
    const res = await signalService.promote(db, [sid]);
    assert.equal(res.created, 1);
    const l2 = (await pool.query('SELECT * FROM leads WHERE id = $1', [res.lead_ids[0]])).rows[0];
    assert.equal(l2.name, 'DUPONT PLOMBERIE'); assert.equal(l2.company, 'dupont-plomberie.fr'); assert.equal(l2.angles, 'creation_site');
    assert.equal(l2.department, '01'); assert.equal(l2.score, 95); assert.match(l2.notes, /Signaux détectés/);
    const sig = (await pool.query('SELECT statut, prospect_id FROM domain_signals WHERE id = $1', [sid])).rows[0];
    assert.equal(sig.statut, 'promu'); assert.equal(sig.prospect_id, l2.id);
    assert.equal((await pool.query("SELECT 1 FROM crawl_seen_domains WHERE domain = 'dupont-plomberie.fr'")).rowCount, 1);
    // Re-promotion : déjà promu, rien de créé.
    assert.equal((await signalService.promote(db, [sid])).created, 0);
  });
});
