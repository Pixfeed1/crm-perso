// Lot 1 — relances : jours ouvrés français, tâche par défaut après un envoi de campagne (J+5 ouvrés,
// appel, sans doublon), rattrapage des campagnes déjà parties (exclusions, 10 par jour ouvré).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hasDb, withSchema } = require('./helpers/db');
const J = require('../utils/joursOuvres');

const opts = { skip: !hasDb() && 'TEST_DATABASE_URL absent' };

test('jours ouvrés : week-ends et fériés français exclus', () => {
  assert.equal(J.paques(2026), '2026-04-05');
  assert.equal(J.paques(2027), '2027-03-28');
  assert.equal(J.ajouterJoursOuvres('2026-11-06', 5), '2026-11-16', 'vendredi + 5 : le 11 novembre est sauté');
  assert.equal(J.ajouterJoursOuvres('2026-12-24', 1), '2026-12-28', 'Noël puis le week-end');
  assert.equal(J.ajouterJoursOuvres('2026-05-13', 1), '2026-05-15', 'Ascension');
  assert.equal(J.premierOuvre('2026-11-07'), '2026-11-09');
  assert.equal(J.premierOuvre('2026-11-10'), '2026-11-10');
});

async function tables(pool) {
  await pool.query(`CREATE TABLE leads (id SERIAL PRIMARY KEY, company TEXT, email TEXT, relation_status TEXT DEFAULT 'contacte')`);
  await pool.query(`CREATE TABLE campaigns (id SERIAL PRIMARY KEY, nom TEXT, relance_jours INT, relance_canal TEXT, test_mode BOOLEAN DEFAULT FALSE, statut TEXT DEFAULT 'en_cours', echecs_consecutifs INT DEFAULT 0, updated_at TIMESTAMP)`);
  await pool.query(`CREATE TABLE campaign_items (id SERIAL PRIMARY KEY, campaign_id INT, lead_id INT, domain TEXT, to_email TEXT, statut TEXT, sent_at TIMESTAMP, updated_at TIMESTAMP)`);
  await pool.query(`CREATE TABLE scheduled_emails (id SERIAL PRIMARY KEY, campaign_id INT, status TEXT)`);
  await pool.query(`CREATE TABLE interactions (id SERIAL PRIMARY KEY, contact_type VARCHAR(10), contact_id INT, type TEXT, reached TEXT, date TIMESTAMP DEFAULT NOW(), notes TEXT, next_followup_date DATE, next_followup_channel TEXT, followup_done BOOLEAN DEFAULT FALSE, relance_step INT)`);
  await pool.query(`CREATE TABLE email_optout (email TEXT PRIMARY KEY, source TEXT, created_at TIMESTAMP DEFAULT NOW())`);
}

test('après un envoi de campagne : tâche J+5 jours ouvrés (appel) par défaut, sans doublon, rien en mode test', opts, async () => {
  await withSchema('relances1', async ({ pool }) => {
    await tables(pool);
    const db = { pool };
    const S = require('../services/campaignService');
    assert.deepEqual(S.RELANCE_DEFAUT, { jours: 5, canal: 'appel' });
    const l1 = (await pool.query("INSERT INTO leads (company) VALUES ('A') RETURNING id")).rows[0].id;
    const l2 = (await pool.query("INSERT INTO leads (company) VALUES ('B') RETURNING id")).rows[0].id;
    const c = (await pool.query("INSERT INTO campaigns (nom, relance_jours, relance_canal) VALUES ('Novembre', 5, 'appel') RETURNING id")).rows[0].id;
    const envoi = async (lead) => S.afterSent(db, { campaign_id: c, campaign_item_id: null, related_type: 'lead', related_id: lead });
    await envoi(l1);
    const t = (await pool.query('SELECT * FROM interactions WHERE contact_id = $1', [l1])).rows;
    assert.equal(t.length, 1);
    assert.equal(t[0].next_followup_channel, 'appel');
    assert.equal(t[0].next_followup_date.toISOString().slice(0, 10) === J.ajouterJoursOuvres(J.aujourdhuiParis(), 5) || new Date(t[0].next_followup_date).toLocaleDateString('en-CA') === J.ajouterJoursOuvres(J.aujourdhuiParis(), 5), true);
    assert.match(t[0].notes, /J\+5 jours ouvrés/);
    // second envoi au même prospect (autre campagne, relance) : pas de seconde tâche
    await envoi(l1);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM interactions WHERE contact_id = $1', [l1])).rows[0].n, 1, 'pas de doublon');
    // campagne sans relance, et mode test : aucune tâche
    await pool.query('UPDATE campaigns SET relance_jours = NULL WHERE id = $1', [c]);
    await envoi(l2);
    await pool.query('UPDATE campaigns SET relance_jours = 5, test_mode = TRUE WHERE id = $1', [c]);
    await envoi(l2);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM interactions WHERE contact_id = $1', [l2])).rows[0].n, 0);
  });
});

test('rattrapage : exclusions motivées, plus ancien d\'abord, N par jour ouvré, idempotent', opts, async () => {
  await withSchema('relances2', async ({ pool }) => {
    await tables(pool);
    const db = { pool };
    const R = require('../services/relanceRattrapage');
    const c = (await pool.query("INSERT INTO campaigns (nom) VALUES ('Première Campagne') RETURNING id")).rows[0].id;
    const ajout = async (company, statutFiche, sent, statutLigne = 'envoye', email = null) => {
      const id = (await pool.query('INSERT INTO leads (company, relation_status) VALUES ($1, $2) RETURNING id', [company, statutFiche])).rows[0].id;
      await pool.query('INSERT INTO campaign_items (campaign_id, lead_id, domain, to_email, statut, sent_at) VALUES ($1, $2, $3, $4, $5, $6)', [c, id, `${company.toLowerCase()}.fr`, email || `contact@${company.toLowerCase()}.fr`, statutLigne, sent]);
      return id;
    };
    const a = await ajout('Ancien', 'contacte', '2026-10-21 10:00');
    const b = await ajout('Recent', 'contacte', '2026-11-03 10:00');
    await ajout('Discute', 'en_discussion', '2026-10-22 10:00');
    await ajout('Rebond', 'contacte', '2026-10-22 11:00', 'rebond');
    await ajout('Oppose', 'contacte', '2026-10-22 12:00', 'envoye', 'stop@oppose.fr');
    await pool.query("INSERT INTO email_optout (email) VALUES ('stop@oppose.fr')");
    const dejaPrevu = await ajout('Prevu', 'contacte', '2026-10-23 10:00');
    await pool.query("INSERT INTO interactions (contact_type, contact_id, type, next_followup_date, followup_done) VALUES ('lead', $1, 'note', '2026-12-01', FALSE)", [dejaPrevu]);
    const appele = await ajout('Appele', 'contacte', '2026-10-23 11:00');
    await pool.query("INSERT INTO interactions (contact_type, contact_id, type, reached, date, followup_done) VALUES ('lead', $1, 'appel', 'pas_reponse', '2026-11-05 09:00', TRUE)", [appele]);
    const ouvert = await ajout('Ouvert', 'contacte', '2026-10-24 10:00');
    await pool.query("INSERT INTO interactions (contact_type, contact_id, type, date, notes, followup_done) VALUES ('lead', $1, 'email', '2026-10-24 10:00:05', 'À : x', FALSE), ('lead', $1, 'email', '2026-10-25 08:00', '📧 Email ouvert : objet', TRUE)", [ouvert]);
    for (let i = 0; i < 10; i++) await ajout(`Lot${i}`, 'nouveau', `2026-10-${25 + (i % 3)} 1${i}:00`);

    const plan = await R.planifier(db, { par_jour: 10, debut: '2026-11-07' });
    const noms = plan.retenus.map((x) => x.entreprise);
    assert.equal(noms[0], 'Ancien', 'le plus ancien envoi d\'abord');
    assert.ok(noms.includes('Ouvert'), 'une simple ouverture n\'est pas un recontact');
    assert.ok(!noms.includes('Discute') && !noms.includes('Rebond') && !noms.includes('Oppose') && !noms.includes('Prevu') && !noms.includes('Appele'));
    assert.equal(plan.retenus.length, 13);
    assert.deepEqual(plan.par_date, { '2026-11-09': 10, '2026-11-10': 3 }, 'samedi -> lundi, 10 par jour ouvré');
    assert.deepEqual(Object.keys(plan.raisons_exclusion).sort(), ['adresse désinscrite ou opposée', 'déjà recontacté', 'fiche « en_discussion »', 'relance déjà prévue'].sort());
    const r = await R.appliquer(db, { ...plan, canal: 'appel' });
    assert.equal(r.crees, 13);
    const t = (await pool.query('SELECT next_followup_channel, notes FROM interactions WHERE contact_id = $1 AND followup_done = FALSE', [a])).rows[0];
    assert.equal(t.next_followup_channel, 'appel'); assert.match(t.notes, /Première Campagne.*21\/10\/2026/);
    // relancé : plus rien à créer
    const plan2 = await R.planifier(db, {});
    assert.equal(plan2.retenus.length, 0);
    assert.ok(b);
  });
});
