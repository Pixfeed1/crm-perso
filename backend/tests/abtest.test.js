// Test A/B de la question finale : formulations, répartition, remplacement, verrouillage, verdict.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hasDb, withSchema } = require('./helpers/db');
const { DATABASE_SCHEMA } = require('../scripts/autoInitDatabase');
const abq = require('../utils/abQuestion');
const { FORMULES_INTERDITES } = require('../services/proofEmailService');

async function createFromSchema(pool, name) {
  const cols = Object.entries(DATABASE_SCHEMA[name].columns).map(([c, d]) => `${c} ${d.replace(/REFERENCES users\(id\)/, '')}`).join(', ');
  await pool.query(`CREATE TABLE ${name} (${cols})`);
}

test('formulations B : une seule question, aucune annonce d\'appel, aucune formule interdite ; remplacement de la seule question', () => {
  for (const [f, liste] of Object.entries(abq.catalogue())) {
    for (const p of liste) for (const t of [p.texte, p.texte_boutique]) {
      assert.equal((t.match(/\?/g) || []).length, 1, t);
      assert.doesNotMatch(t, FORMULES_INTERDITES, t);
      assert.doesNotMatch(t, /appel|téléphon|rappeler/i, `${f} : ${t}`);
    }
  }
  const body = "Bonjour,\n\nEn ouvrant x.fr, le navigateur affiche « Non sécurisé ».\n\nC'est gênant.\n\nEst-ce un point que vous aviez déjà repéré ?\n\nBonne journée,";
  const r = abq.remplacerQuestion(body, 'Est-ce utile que je vous en dise plus ?');
  assert.equal(r.ancienne, 'Est-ce un point que vous aviez déjà repéré ?');
  assert.equal(r.body, body.replace('Est-ce un point que vous aviez déjà repéré ?', 'Est-ce utile que je vous en dise plus ?'));
  assert.throws(() => abq.valider({ preuve: 'inconnue' }), /inconnue/);
  assert.throws(() => abq.valider({}), /au moins une/);
  assert.deepEqual(abq.valider({ preuve: 'p_plus', maintenance: null }), { preuve: 'p_plus' });
  assert.equal(abq.choisir(3, 4), 'A'); assert.equal(abq.choisir(5, 4), 'B');
});

test('verdict : écart net, pas concluant, trop tôt, garde-fou refus', () => {
  const { verdict, fisher } = require('../services/entonnoirService');
  assert.ok(Math.abs(fisher(2, 98, 8, 92) - 0.1005) < 0.001);
  assert.equal(verdict({ A: { delivres: 100, reponses: 2, refus: 0 }, B: { delivres: 100, reponses: 10, refus: 0 } }).conclusion, 'B');
  const nc = verdict({ A: { delivres: 100, reponses: 3, refus: 0 }, B: { delivres: 100, reponses: 4, refus: 3 } });
  assert.equal(nc.conclusion, 'non_concluant'); assert.match(nc.texte, /peut venir du hasard/); assert.match(nc.attention, /plus de refus/);
  assert.equal(verdict({ A: { delivres: 12, reponses: 1, refus: 0 }, B: { delivres: 14, reponses: 0, refus: 0 } }).conclusion, 'trop_tot');
});

test('campagne : moitié-moitié par famille, seule la question change, relire si validé, figé après envoi, résultats', { skip: !hasDb() }, async () => {
  await withSchema('abtest', async ({ pool }) => {
    const db = { pool };
    const S = require('../services/campaignService');
    const { typedResult, insertCrawlResult } = require('../controllers/crawlController');
    for (const t of ['crawl_jobs', 'crawl_results', 'campaigns', 'campaign_items', 'scheduled_emails']) await createFromSchema(pool, t);
    await pool.query('CREATE TABLE crawl_seen_domains (domain TEXT PRIMARY KEY, source VARCHAR(20), first_seen TIMESTAMP DEFAULT NOW())');
    await pool.query(`CREATE TABLE leads (id SERIAL PRIMARY KEY, name TEXT, company TEXT, website TEXT, email TEXT, relation_status TEXT DEFAULT 'nouveau', status TEXT, crawl_result_id INTEGER, platform TEXT, angles TEXT, score INTEGER, notes TEXT, source TEXT, type TEXT, phone TEXT, facebook_url TEXT, instagram_url TEXT, site_type TEXT, siren TEXT, sector TEXT, naf TEXT, effectif TEXT, city TEXT, postal_code TEXT, department TEXT, prestataire TEXT, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP)`);
    await pool.query(`CREATE TABLE interactions (id SERIAL PRIMARY KEY, contact_type VARCHAR(10), contact_id INT, type TEXT, reached TEXT, date TIMESTAMP DEFAULT NOW(), notes TEXT, result TEXT, relation_status TEXT, next_followup_date DATE, next_followup_channel TEXT, followup_done BOOLEAN DEFAULT FALSE, relance_step INT, created_at TIMESTAMP DEFAULT NOW())`);
    await pool.query('CREATE TABLE email_optout (email TEXT PRIMARY KEY, source TEXT, created_at TIMESTAMPTZ DEFAULT NOW())');
    await pool.query('CREATE TABLE email_log (id SERIAL PRIMARY KEY, to_email TEXT, source VARCHAR(40), created_at TIMESTAMP DEFAULT NOW())');
    await pool.query(`CREATE TABLE prospect_refus (id SERIAL PRIMARY KEY, lead_id INTEGER, domaine TEXT, canal VARCHAR(10) NOT NULL, motif TEXT, source VARCHAR(30), created_at TIMESTAMPTZ DEFAULT NOW(), retire_le TIMESTAMPTZ, retire_motif TEXT)`);
    const job = (await pool.query("INSERT INTO crawl_jobs (techno, nb_sites, statut) VALUES ('prestashop', 1, 'done') RETURNING id")).rows[0].id;
    const leads = [];
    for (let i = 0; i < 8; i++) {
      // 4 preuves (HTTP non sécurisé) et 4 premiers contacts (rien à signaler).
      const preuve = i < 4;
      const rid = await insertCrawlResult(db, job, typedResult({ domain: `site${i}.fr`, platform: 'PrestaShop', http_status: '200', final_url: preuve ? `http://site${i}.fr/` : `https://site${i}.fr/`, https_final: preuve ? 'non' : 'oui', ssl_ok: 'oui', title: `Boutique ${i}`, email: `contact@site${i}.fr`, analyse_le: new Date().toISOString(), ecommerce_actif: 'oui' }));
      leads.push((await pool.query('INSERT INTO leads (name, company, email, crawl_result_id) VALUES ($1, $2, $3, $4) RETURNING id', [`B${i}`, `site${i}.fr`, `contact@site${i}.fr`, rid])).rows[0].id);
    }
    const c = await S.createCampaign(db, { nom: 'Test question' });
    await S.addLeads(db, c.id, leads.slice(0, 6));
    const avant = Object.fromEntries((await pool.query('SELECT id, body, mode FROM campaign_items WHERE campaign_id = $1', [c.id])).rows.map((x) => [x.id, x]));
    // Une ligne validée avant le lancement du test.
    const unePreuve = Object.values(avant).find((x) => x.mode === 'preuve');
    await S.validateMany(db, c.id, [unePreuve.id]);
    const r = await S.setAbTest(db, c.id, { preuve: 'p_plus', maintenance: 'm_souci' });
    assert.equal(r.A + r.B, 6);
    let its = (await pool.query('SELECT * FROM campaign_items WHERE campaign_id = $1 ORDER BY id', [c.id])).rows;
    for (const mode of ['preuve', 'maintenance']) {
      const m = its.filter((x) => x.mode === mode);
      assert.ok(Math.abs(m.filter((x) => x.variante === 'A').length - m.filter((x) => x.variante === 'B').length) <= 1, `${mode} équilibré`);
    }
    for (const it of its) {
      const a = avant[it.id];
      if (it.variante === 'A') assert.equal(it.body, a.body, 'A : texte inchangé');
      else {
        const attendu = it.mode === 'preuve' ? 'Est-ce utile que je vous en dise plus ?' : 'Si un souci technique arrivait demain, sauriez-vous à qui vous adresser ?';
        assert.equal(it.body, abq.remplacerQuestion(a.body, attendu).body, 'B : seule la question change');
        assert.equal(it.question_a, abq.questionDe(a.body));
      }
    }
    const v = its.find((x) => x.id === unePreuve.id);
    if (v.variante === 'B') { assert.equal(v.statut, 'pret'); assert.match(v.raison, /test A\/B : à relire/); } else assert.equal(v.statut, 'valide');
    // Nouvelles lignes : version tirée à l'arrivée, équilibrée.
    await S.addLeads(db, c.id, leads.slice(6));
    its = (await pool.query("SELECT variante, mode FROM campaign_items WHERE campaign_id = $1 AND mode = 'maintenance'", [c.id])).rows;
    assert.equal(its.filter((x) => x.variante === 'A').length, its.filter((x) => x.variante === 'B').length);
    // Arrêt : tout revient à la question d'origine.
    await S.setAbTest(db, c.id, null);
    for (const it of (await pool.query('SELECT * FROM campaign_items WHERE campaign_id = $1', [c.id])).rows) {
      assert.equal(it.variante, null);
      if (avant[it.id]) assert.equal(it.body, avant[it.id].body);
    }
    // Relancé puis un email part : le test est figé.
    await S.setAbTest(db, c.id, { preuve: 'p_origine' });
    await pool.query("UPDATE campaign_items SET statut = 'envoye', sent_at = NOW() WHERE id = (SELECT MIN(id) FROM campaign_items WHERE campaign_id = $1)", [c.id]);
    await assert.rejects(S.setAbTest(db, c.id, { preuve: 'p_plus' }), /figé/);
    const ab = await require('../services/entonnoirService').abResultats(db, c.id);
    assert.equal(ab.formulations.preuve, "Voulez-vous que je vous indique d'où ça vient ?");
    assert.equal(ab.campagne.verdict.conclusion, 'trop_tot');
  });
});
