// Lot 5 : statut unique (relation_status), fusion de l'ancien statut Kanban sans rien perdre.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hasDb, withSchema } = require('./helpers/db');
const { fusion } = require('../utils/leadStatusSync');

test('fusion : le plus avancé gagne, un refus prime, « Client » l\'emporte, « Perdu » ne recule pas un prospect actif', () => {
  assert.equal(fusion('contacte', 'qualifié'), 'en_discussion');
  assert.equal(fusion('en_discussion', 'contacte'), 'en_discussion');
  assert.equal(fusion('nouveau', 'négociation'), 'devis_envoye');
  assert.equal(fusion('pas_business', 'négociation'), 'pas_business');
  assert.equal(fusion('perdu', 'client'), 'gagne');
  assert.equal(fusion('en_discussion', 'perdu'), 'en_discussion');
  assert.equal(fusion('nouveau', 'perdu'), 'perdu');
  assert.equal(fusion('gagne', 'perdu'), 'gagne');
  assert.equal(fusion(null, 'won'), 'gagne');
  assert.equal(fusion('a_contacter', null), 'a_contacter');
  assert.equal(fusion('contacte', 'contacte'), 'contacte');
});

test('migration : simulation sans écriture, application tracée, ancien statut archivé ; trigger de synchro', { skip: !hasDb() }, async () => {
  await withSchema('statut', async ({ pool }) => {
    const db = { pool };
    await pool.query(`CREATE TABLE leads (id SERIAL PRIMARY KEY, name TEXT, company TEXT, status TEXT, relation_status TEXT, ancien_statut_kanban VARCHAR(50), statuts_fusionnes_le TIMESTAMPTZ, updated_at TIMESTAMP)`);
    await pool.query(`CREATE TABLE interactions (id SERIAL PRIMARY KEY, contact_type VARCHAR(10), contact_id INT, type TEXT, date TIMESTAMP DEFAULT NOW(), notes TEXT, followup_done BOOLEAN DEFAULT FALSE)`);
    // Le trigger de autoInitDatabase (même code).
    const src = require('fs').readFileSync(require.resolve('../scripts/autoInitDatabase'), 'utf8');
    const fn = src.slice(src.indexOf('CREATE OR REPLACE FUNCTION leads_status_depuis_relation'), src.indexOf('$$ LANGUAGE plpgsql;') + '$$ LANGUAGE plpgsql;'.length);
    await pool.query(fn);
    await pool.query('CREATE TRIGGER trg_leads_status_depuis_relation BEFORE INSERT OR UPDATE OF relation_status ON leads FOR EACH ROW EXECUTE FUNCTION leads_status_depuis_relation();');
    await pool.query("ALTER TABLE leads DISABLE TRIGGER trg_leads_status_depuis_relation");
    await pool.query(`INSERT INTO leads (name, status, relation_status, ancien_statut_kanban) VALUES
      ('A', 'qualifié', 'contacte', 'qualifié'), ('B', 'contacte', 'en_discussion', 'contacte'), ('C', 'négociation', 'pas_business', 'négociation'), ('D', 'client', 'perdu', 'client')`);
    await pool.query("ALTER TABLE leads ENABLE TRIGGER trg_leads_status_depuis_relation");
    const S = require('../services/statutUnique');
    const plan = await S.planifier(db);
    assert.equal(plan.total, 4);
    assert.deepEqual(plan.changements.map((c) => [c.fiche, c.apres]), [['A', 'en_discussion'], ['D', 'gagne']]);
    assert.equal(plan.conflits.length, 2);
    assert.equal((await pool.query("SELECT relation_status FROM leads WHERE name = 'A'")).rows[0].relation_status, 'contacte', 'simulation : rien écrit');
    const r = await S.appliquer(db, plan);
    assert.equal(r.ecrits, 2);
    const rows = Object.fromEntries((await pool.query('SELECT name, status, relation_status, ancien_statut_kanban, statuts_fusionnes_le FROM leads')).rows.map((x) => [x.name, x]));
    assert.equal(rows.A.relation_status, 'en_discussion'); assert.equal(rows.A.status, 'contacte', 'status suit relation_status'); assert.equal(rows.A.ancien_statut_kanban, 'qualifié');
    assert.equal(rows.D.relation_status, 'gagne'); assert.equal(rows.D.status, 'client');
    assert.equal(rows.C.relation_status, 'pas_business');
    assert.ok(Object.values(rows).every((x) => x.statuts_fusionnes_le), 'toutes vues');
    assert.equal((await S.planifier(db)).total, 0, 'deuxième passage : plus rien');
    assert.match((await pool.query("SELECT notes FROM interactions WHERE contact_id = $1", [1])).rows[0].notes, /Kanban « Qualifié » et Suivi « Contacté » → « En discussion »/);
  });
});
