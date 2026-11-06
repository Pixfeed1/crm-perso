// Lot 4 : refus de prospection par canal, pour une fiche ou toute l'entreprise.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hasDb, withSchema } = require('./helpers/db');
const R = require('../services/refusService');
const optout = require('../services/optout');

test('domaines : webmail jamais bloqué en entier, familles de canaux', () => {
  assert.equal(R.domaineEntreprise('contact@Agrigom.fr'), 'agrigom.fr');
  assert.equal(R.domaineEntreprise('https://www.agrigom.fr/contact'), 'agrigom.fr');
  assert.equal(R.domaineEntreprise('jean.dupont@gmail.com'), null);
  assert.equal(R.domaineEntreprise('x@orange.fr'), null);
  assert.equal(R.domaineEntreprise('AGRIGOM'), null);
  assert.deepEqual(R.familles('sms'), ['appel', 'tout']);
  assert.deepEqual(R.familles('linkedin'), ['tout']);
});

test('refus en base : par canal, toute l\'entreprise, relances fermées, envoi bloqué, retrait tracé', { skip: !hasDb() }, async () => {
  await withSchema('refus', async ({ pool }) => {
    const db = { pool };
    await pool.query(`CREATE TABLE leads (id SERIAL PRIMARY KEY, name TEXT, company TEXT, website TEXT, email TEXT, relation_status TEXT DEFAULT 'nouveau', crawl_result_id INTEGER, updated_at TIMESTAMP)`);
    await pool.query('CREATE TABLE contacts (id SERIAL PRIMARY KEY, lead_id INT, email TEXT)');
    await pool.query('CREATE TABLE crawl_results (id SERIAL PRIMARY KEY, domain TEXT)');
    await pool.query(`CREATE TABLE interactions (id SERIAL PRIMARY KEY, contact_type VARCHAR(10), contact_id INT, type TEXT, reached TEXT, date TIMESTAMP DEFAULT NOW(), notes TEXT, next_followup_date DATE, next_followup_channel TEXT, followup_done BOOLEAN DEFAULT FALSE)`);
    await pool.query('CREATE TABLE email_optout (email TEXT PRIMARY KEY, source TEXT, created_at TIMESTAMPTZ DEFAULT NOW())');
    await pool.query(`CREATE TABLE prospect_refus (id SERIAL PRIMARY KEY, lead_id INTEGER, domaine TEXT, canal VARCHAR(10) NOT NULL CHECK (canal IN ('email', 'appel', 'tout')), motif TEXT, source VARCHAR(30) DEFAULT 'fiche', created_at TIMESTAMPTZ DEFAULT NOW(), retire_le TIMESTAMPTZ, retire_motif TEXT)`);
    const ins = async (company, email, website = null) => (await pool.query('INSERT INTO leads (name, company, email, website) VALUES ($1, $1, $2, $3) RETURNING id', [company, email, website])).rows[0].id;
    const a = await ins('agrigom.fr', 'contact@agrigom.fr');
    const b = await ins('Agrigom (commandes)', 'commandes@agrigom.fr');
    const c = await ins('Autre', 'jean@gmail.com', 'https://autre-site.fr');
    await pool.query('INSERT INTO contacts (lead_id, email) VALUES ($1, $2)', [a, 'gerant@agrigom.fr']);
    const relance = (id, canal) => pool.query("INSERT INTO interactions (contact_type, contact_id, type, notes, next_followup_date, next_followup_channel) VALUES ('lead', $1, 'note', 'relance', CURRENT_DATE + 3, $2)", [id, canal]);
    await relance(a, 'appel'); await relance(a, 'email'); await relance(b, 'appel');
    const ouvertes = async (id) => (await pool.query("SELECT next_followup_channel AS c FROM interactions WHERE contact_id = $1 AND followup_done = FALSE AND next_followup_date IS NOT NULL ORDER BY c", [id])).rows.map((r) => r.c);

    // 1. Ne plus appeler, cette fiche : les emails restent possibles, les appels non.
    let e = await R.enregistrer(db, a, { canal: 'appel', motif: 'demandé au téléphone' });
    assert.ok(e.appel && !e.email);
    assert.equal(await R.bloque(db, a, 'appel'), true);
    assert.equal(await R.bloque(db, a, 'sms'), true);
    assert.equal(await R.bloque(db, a, 'email'), false);
    assert.equal(await R.bloque(db, b, 'appel'), false, 'autre fiche de la même entreprise non concernée');
    assert.deepEqual(await ouvertes(a), ['email']);
    assert.equal(await optout.isOptedOut(db, 'contact@agrigom.fr'), false);

    // 2. Ne plus écrire, toute l'entreprise : toutes les adresses du domaine, même inconnues.
    e = await R.enregistrer(db, a, { canal: 'email', entreprise: true });
    assert.equal(e.fiches_concernees, 2);
    assert.deepEqual(e.domaines, ['agrigom.fr']);
    for (const adr of ['contact@agrigom.fr', 'gerant@agrigom.fr', 'commandes@agrigom.fr', 'nouvelle@agrigom.fr']) assert.equal(await optout.isOptedOut(db, adr), true, adr);
    assert.equal(await R.bloque(db, b, 'email'), true);
    assert.equal(await R.bloque(db, b, 'appel'), false);
    assert.deepEqual(await ouvertes(a), []);
    assert.deepEqual(await ouvertes(b), ['appel']);
    // Une fiche créée plus tard pour le même domaine est couverte.
    const d = await ins('agrigom.fr', 'compta@agrigom.fr');
    assert.equal(await R.bloque(db, d, 'email'), true);

    // 3. Webmail : « toute l'entreprise » ne bloque jamais gmail.com, mais bloque le domaine du site.
    e = await R.enregistrer(db, c, { canal: 'tout', entreprise: true });
    assert.deepEqual(e.domaines, ['autre-site.fr']);
    assert.equal(await optout.isOptedOut(db, 'quelquun@gmail.com'), false);
    assert.equal(await optout.isOptedOut(db, 'jean@gmail.com'), true);
    assert.equal(await R.bloque(db, c, 'linkedin'), true);
    assert.equal((await pool.query('SELECT relation_status FROM leads WHERE id = $1', [c])).rows[0].relation_status, 'pas_business');

    // 4. Retrait : raison obligatoire, tracé ; les adresses bloquées par ce refus seul ressortent.
    const ligne = e.lignes.find((x) => x.canal === 'tout' && !x.domaine);
    await assert.rejects(R.retirer(db, ligne.id, { raison: ' ' }), /pourquoi/);
    const apres = await R.retirer(db, ligne.id, { raison: 'erreur de saisie' });
    assert.equal(apres.lignes.length, 0, 'les deux lignes (fiche + domaine) sont retirées');
    assert.equal(await optout.isOptedOut(db, 'jean@gmail.com'), false);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM prospect_refus WHERE retire_le IS NOT NULL')).rows[0].n, 2);
    // Une désinscription par le lien n'est jamais levée par un retrait.
    await optout.addOptout(db, 'lien@autre-site.fr', 'lien');
    assert.equal(await optout.isOptedOut(db, 'lien@autre-site.fr'), true);

    await assert.rejects(R.enregistrer(db, a, { canal: 'fax' }), /Canal de refus inconnu/);
    const notes = (await pool.query("SELECT notes FROM interactions WHERE contact_id = $1 AND notes LIKE 'Refus%' ORDER BY id", [b])).rows;
    assert.match(notes[0].notes, /ne plus écrire \(toute l'entreprise : agrigom\.fr\) \(saisi sur la fiche « agrigom\.fr »\)/);
  });
});
