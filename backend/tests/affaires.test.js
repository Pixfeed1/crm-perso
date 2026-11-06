// Lot 5 : affaires (plusieurs par entreprise), prochaine action obligatoire, motifs, devis.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hasDb, withSchema } = require('./helpers/db');

test('affaires : règles, relance du Suivi, statut de la fiche qui avance, motifs, devis, refus total', { skip: !hasDb() }, async () => {
  await withSchema('affaires', async ({ pool }) => {
    const db = { pool };
    const S = require('../services/affaireService');
    await pool.query(`CREATE TABLE leads (id SERIAL PRIMARY KEY, name TEXT, company TEXT, website TEXT, email TEXT, relation_status TEXT DEFAULT 'nouveau', crawl_result_id INT, updated_at TIMESTAMP)`);
    await pool.query('CREATE TABLE crm_clients (id SERIAL PRIMARY KEY, name TEXT, lead_id INT)');
    await pool.query('CREATE TABLE contacts (id SERIAL PRIMARY KEY, lead_id INT, email TEXT)');
    await pool.query('CREATE TABLE crawl_results (id SERIAL PRIMARY KEY, domain TEXT)');
    await pool.query('CREATE TABLE campaigns (id SERIAL PRIMARY KEY, nom TEXT)');
    await pool.query('CREATE TABLE campaign_items (id SERIAL PRIMARY KEY, campaign_id INT, lead_id INT, statut TEXT, sent_at TIMESTAMPTZ)');
    await pool.query(`CREATE TABLE interactions (id SERIAL PRIMARY KEY, contact_type VARCHAR(10), contact_id INT, type TEXT, reached TEXT, date TIMESTAMP DEFAULT NOW(), notes TEXT, next_followup_date DATE, next_followup_channel TEXT, followup_done BOOLEAN DEFAULT FALSE, affaire_id INT)`);
    await pool.query('CREATE TABLE quotes (id SERIAL PRIMARY KEY, quote_number TEXT, title TEXT, client_id INT, client_name TEXT, status TEXT, total_ht NUMERIC, total_ttc NUMERIC, created_at TIMESTAMPTZ DEFAULT NOW(), affaire_id INT)');
    await pool.query('CREATE TABLE email_optout (email TEXT PRIMARY KEY, source TEXT, created_at TIMESTAMPTZ DEFAULT NOW())');
    await pool.query(`CREATE TABLE prospect_refus (id SERIAL PRIMARY KEY, lead_id INTEGER, domaine TEXT, canal VARCHAR(10) NOT NULL, motif TEXT, source VARCHAR(30) DEFAULT 'fiche', created_at TIMESTAMPTZ DEFAULT NOW(), retire_le TIMESTAMPTZ, retire_motif TEXT)`);
    const src = require('fs').readFileSync(require.resolve('../scripts/autoInitDatabase'), 'utf8');
    const ddl = src.slice(src.indexOf('CREATE TABLE IF NOT EXISTS affaires ('), src.indexOf(');', src.indexOf('CREATE TABLE IF NOT EXISTS affaires (')) + 2);
    await pool.query(ddl);

    const lead = (await pool.query("INSERT INTO leads (name, company, email, relation_status) VALUES ('1000 Hz', '1000hz.fr', 'contact@1000hz.fr', 'contacte') RETURNING id")).rows[0].id;
    const camp = (await pool.query("INSERT INTO campaigns (nom) VALUES ('Première Campagne') RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO campaign_items (campaign_id, lead_id, statut, sent_at) VALUES ($1, $2, 'envoye', NOW())", [camp, lead]);

    // Prochaine action obligatoire tant que l'affaire est ouverte.
    await assert.rejects(S.creer(db, { lead_id: lead, titre: 'Maintenance', type_besoin: 'maintenance', etape: 'decouverte' }), /prochaine action/);
    await assert.rejects(S.creer(db, { lead_id: lead, titre: '', prochaine_action_date: '2026-11-20', prochaine_action_canal: 'appel' }), /intitulé/);

    // Deux affaires pour la même entreprise.
    const maint = await S.creer(db, { lead_id: lead, titre: 'Maintenance', type_besoin: 'maintenance', montant_mensuel: '50', prochaine_action_date: '2026-11-20', prochaine_action_canal: 'appel', prochaine_action_note: 'présenter la formule' });
    assert.equal(maint.campagne_id, camp, 'campagne d\'origine automatique');
    assert.equal(maint.campagne_nom, 'Première Campagne');
    let rel = (await pool.query('SELECT * FROM interactions WHERE id = $1', [maint.relance_interaction_id])).rows[0];
    assert.equal(String(rel.next_followup_date.toISOString()).slice(0, 10) <= '2026-11-20', true);
    assert.equal(rel.next_followup_channel, 'appel'); assert.match(rel.notes, /Affaire « Maintenance » \(Découverte\) : présenter la formule/);
    assert.equal((await pool.query('SELECT relation_status FROM leads WHERE id = $1', [lead])).rows[0].relation_status, 'en_discussion', 'la fiche avance');

    const dev = await S.creer(db, { lead_id: lead, titre: 'Outil de stock (codes-barres)', type_besoin: 'developpement', prochaine_action_date: '2026-11-25', prochaine_action_canal: 'email' });
    // Devis rattaché : montant repris, étape Découverte -> Devis envoyé quand il est envoyé.
    const q = (await pool.query("INSERT INTO quotes (quote_number, status, total_ht) VALUES ('D-2026-031', 'sent', 1800) RETURNING id")).rows[0].id;
    const avecDevis = await S.rattacherDevis(db, dev.id, q);
    assert.equal(avecDevis.etape, 'devis_envoye'); assert.equal(Number(avecDevis.montant_ponctuel), 1800); assert.equal(avecDevis.devis.length, 1);
    assert.equal((await pool.query('SELECT relation_status FROM leads WHERE id = $1', [lead])).rows[0].relation_status, 'devis_envoye');
    assert.match((await pool.query('SELECT notes FROM interactions WHERE affaire_id = $1 AND followup_done = TRUE ORDER BY id DESC', [dev.id])).rows[0].notes, /Découverte → Devis envoyé/);

    // Maintenance perdue : motif obligatoire ; la relance liée est fermée ; la fiche ne recule pas.
    await assert.rejects(S.modifier(db, maint.id, { etape: 'perdue' }), /motif/);
    const perdue = await S.modifier(db, maint.id, { etape: 'perdue', motif: 'maintenance_interne' });
    assert.equal(perdue.ouverte, false); assert.ok(perdue.cloturee_le);
    rel = (await pool.query('SELECT followup_done FROM interactions WHERE id = $1', [maint.relance_interaction_id])).rows[0];
    assert.equal(rel.followup_done, true);
    assert.equal((await pool.query('SELECT relation_status FROM leads WHERE id = $1', [lead])).rows[0].relation_status, 'devis_envoye');

    // Reportée : date pour en reparler, relance posée à cette date.
    await assert.rejects(S.modifier(db, maint.id, { etape: 'reportee', motif: 'projet_reporte' }), /quand en reparler/);
    const rep = await S.modifier(db, maint.id, { etape: 'reportee', motif: 'projet_reporte', recontacter_le: '2027-01-15' });
    const r2 = (await pool.query('SELECT * FROM interactions WHERE id = $1', [rep.relance_interaction_id])).rows[0];
    assert.equal(r2.followup_done, false); assert.equal(r2.next_followup_channel, 'appel');

    // Relance faite dans le Suivi : l'affaire en cours signale qu'une nouvelle action est à poser.
    await pool.query('UPDATE interactions SET followup_done = TRUE WHERE id = $1', [avecDevis.relance_interaction_id]);
    assert.equal((await S.lister(db, { lead_id: lead })).find((a) => a.id === dev.id).action_a_replanifier, true);
    const replan = await S.modifier(db, dev.id, { prochaine_action_date: '2026-12-02', prochaine_action_canal: 'appel', accord: 'incertain' });
    assert.equal(replan.action_a_replanifier, false); assert.notEqual(replan.relance_interaction_id, avecDevis.relance_interaction_id);
    assert.equal(replan.accord, 'incertain');

    // Gagnée : accord ferme, fiche gagnée.
    const gagnee = await S.modifier(db, dev.id, { etape: 'gagnee' });
    assert.equal(gagnee.accord, 'ferme');
    assert.equal((await pool.query('SELECT relation_status FROM leads WHERE id = $1', [lead])).rows[0].relation_status, 'gagne');

    // Un client voit les affaires de son ancien prospect.
    const cl = (await pool.query('INSERT INTO crm_clients (name, lead_id) VALUES ($1, $2) RETURNING id', ['1000 Hz', lead])).rows[0].id;
    assert.equal((await S.lister(db, { client_id: cl })).length, 2);

    // Motif « refus de toute sollicitation » : refus de prospection enregistré, plus de relance possible.
    const autre = (await pool.query("INSERT INTO leads (name, company, email) VALUES ('B', 'b.fr', 'x@b.fr') RETURNING id")).rows[0].id;
    const a3 = await S.creer(db, { lead_id: autre, titre: 'Dépannage', type_besoin: 'depannage', prochaine_action_date: '2026-11-21', prochaine_action_canal: 'appel' });
    await S.modifier(db, a3.id, { etape: 'perdue', motif: 'refus_total', motif_detail: 'ne veut plus être sollicité' });
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM prospect_refus WHERE lead_id = $1 AND canal = 'tout' AND source = 'affaire'", [autre])).rows[0].n, 1);
    assert.equal((await pool.query('SELECT relation_status FROM leads WHERE id = $1', [autre])).rows[0].relation_status, 'pas_business');
    await assert.rejects(S.creer(db, { lead_id: autre, titre: 'Relancer', prochaine_action_date: '2026-11-30', prochaine_action_canal: 'email' }), /refus de prospection/);

    // Suppression : devis détaché, relance fermée.
    await S.supprimer(db, dev.id);
    assert.equal((await pool.query('SELECT affaire_id FROM quotes WHERE id = $1', [q])).rows[0].affaire_id, null);
    assert.deepEqual(Object.keys(S.referentiel().motifs).length, 8);
  });
});
