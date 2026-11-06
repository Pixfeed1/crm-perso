// Lot 4 : liste mensuelle « à supprimer » (sans contact depuis 3 ans), validée à la main.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hasDb, withSchema } = require('./helpers/db');
const P = require('../services/purgeService');

test('purge : candidats, exclusions, validation, oppositions conservées, trace sans donnée personnelle', { skip: !hasDb() }, async () => {
  await withSchema('purge', async ({ pool }) => {
    const db = { pool };
    await pool.query(`CREATE TABLE leads (id SERIAL PRIMARY KEY, name TEXT, company TEXT, website TEXT, email TEXT, status TEXT, relation_status TEXT DEFAULT 'nouveau', created_at TIMESTAMP DEFAULT NOW(), purge_garder_jusqu_au DATE)`);
    await pool.query('CREATE TABLE contacts (id SERIAL PRIMARY KEY, lead_id INT, client_id INT, email TEXT)');
    await pool.query('CREATE TABLE projects (id SERIAL PRIMARY KEY, lead_id INT)');
    await pool.query(`CREATE TABLE interactions (id SERIAL PRIMARY KEY, contact_type VARCHAR(10), contact_id INT, type TEXT, reached TEXT, date TIMESTAMP DEFAULT NOW(), notes TEXT, next_followup_date DATE, followup_done BOOLEAN DEFAULT FALSE)`);
    await pool.query('CREATE TABLE campaign_items (id SERIAL PRIMARY KEY, lead_id INT, sent_at TIMESTAMPTZ)');
    await pool.query('CREATE TABLE email_tracking (id SERIAL PRIMARY KEY, contact_type TEXT, contact_id INT, last_click_at TIMESTAMPTZ)');
    await pool.query('CREATE TABLE email_log (id SERIAL PRIMARY KEY, to_email TEXT, source TEXT)');
    await pool.query('CREATE TABLE email_optout (email TEXT PRIMARY KEY, source TEXT)');
    await pool.query("CREATE TABLE purge_propositions (id SERIAL PRIMARY KEY, mois CHAR(7) UNIQUE NOT NULL, statut VARCHAR(20) DEFAULT 'a_valider', created_at TIMESTAMPTZ DEFAULT NOW(), calculee_le TIMESTAMPTZ, traitee_le TIMESTAMPTZ, supprimes INTEGER DEFAULT 0, gardes INTEGER DEFAULT 0)");
    await pool.query('CREATE TABLE purge_lignes (id SERIAL PRIMARY KEY, proposition_id INTEGER REFERENCES purge_propositions(id) ON DELETE CASCADE, lead_id INTEGER, nom TEXT, domaine TEXT, email TEXT, dernier_contact TIMESTAMPTZ, decision VARCHAR(20), decide_le TIMESTAMPTZ)');
    const vieux = "NOW() - interval '4 years'";
    const ins = async (name, email, extra = {}) => (await pool.query(
      `INSERT INTO leads (name, company, email, status, relation_status, created_at) VALUES ($1, $1, $2, $3, $4, ${extra.recent ? 'NOW()' : vieux}) RETURNING id`,
      [name, email, extra.status || 'nouveau', extra.relation || 'nouveau'])).rows[0].id;
    const ancien = await ins('ancien.fr', 'contact@ancien.fr');
    const garde = await ins('garde.fr', 'contact@garde.fr');
    const recent = await ins('recent.fr', 'contact@recent.fr', { recent: true });
    const client = await ins('client.fr', 'a@client.fr', { status: 'client' });
    const gagne = await ins('gagne.fr', 'a@gagne.fr', { relation: 'gagne' });
    const projet = await ins('projet.fr', 'a@projet.fr');
    const appele = await ins('appele.fr', 'a@appele.fr');
    const notesSeules = await ins('notes.fr', 'a@notes.fr');
    const relancePrevue = await ins('relance.fr', 'a@relance.fr');
    const clique = await ins('clique.fr', 'a@clique.fr');
    await pool.query('INSERT INTO projects (lead_id) VALUES ($1)', [projet]);
    await pool.query("INSERT INTO interactions (contact_type, contact_id, type, date) VALUES ('lead', $1, 'appel', NOW() - interval '1 year')", [appele]);
    await pool.query("INSERT INTO interactions (contact_type, contact_id, type, date, notes) VALUES ('lead', $1, 'note', NOW(), 'note interne')", [notesSeules]);
    await pool.query("INSERT INTO interactions (contact_type, contact_id, type, next_followup_date) VALUES ('lead', $1, 'note', CURRENT_DATE + 10)", [relancePrevue]);
    await pool.query("INSERT INTO email_tracking (contact_type, contact_id, last_click_at) VALUES ('lead', $1, NOW() - interval '2 months')", [clique]);
    await pool.query("INSERT INTO interactions (contact_type, contact_id, type, date) VALUES ('lead', $1, 'email', NOW() - interval '4 years')", [ancien]);
    await pool.query("INSERT INTO email_log (to_email, source) VALUES ('contact@ancien.fr', 'prospect')");
    await pool.query("INSERT INTO email_optout (email, source) VALUES ('contact@ancien.fr', 'lien')");

    const p = await P.proposer(db, { mois: '2026-11' });
    assert.deepEqual(p.lignes.map((l) => l.lead_id).sort(), [ancien, garde, notesSeules].sort(), 'seuls les prospects sans vrai contact depuis 3 ans');
    assert.equal(p.lignes.find((l) => l.lead_id === ancien).domaine, 'ancien.fr');
    assert.equal((await P.proposer(db, { mois: '2026-11' })).id, p.id, 'une seule liste par mois');

    // Entre-temps, notes.fr est recontacté : il sort de la liste à la validation, même coché.
    await pool.query("INSERT INTO interactions (contact_type, contact_id, type, date) VALUES ('lead', $1, 'appel', NOW())", [notesSeules]);
    const r = await P.valider(db, p.id, { supprimer: [ancien, notesSeules] });
    assert.deepEqual(r, { supprimes: 1, gardes: 1, plus_concernes: 1 });
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM leads WHERE id = $1', [ancien])).rows[0].n, 0);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM interactions WHERE contact_id = $1", [ancien])).rows[0].n, 0);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM email_log WHERE to_email = 'contact@ancien.fr'")).rows[0].n, 0);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM email_optout WHERE email = 'contact@ancien.fr'")).rows[0].n, 1, 'la désinscription reste');
    const trace = (await pool.query('SELECT * FROM purge_lignes WHERE lead_id = $1', [ancien])).rows[0];
    assert.equal(trace.decision, 'supprimer'); assert.equal(trace.nom, null); assert.equal(trace.email, null); assert.equal(trace.domaine, 'ancien.fr');
    assert.ok((await pool.query('SELECT purge_garder_jusqu_au FROM leads WHERE id = $1', [garde])).rows[0].purge_garder_jusqu_au, 'gardé un an');
    await assert.rejects(P.valider(db, p.id, {}), /déjà traitée/);
    // Le mois suivant : la fiche gardée n'est pas reproposée.
    const p2 = await P.proposer(db, { mois: '2026-12' });
    assert.equal(p2.statut, 'vide');
    assert.equal(p2.lignes.length, 0);
    for (const id of [recent, client, gagne, projet, appele, relancePrevue, clique]) assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM leads WHERE id = $1', [id])).rows[0].n, 1);
  });
});
