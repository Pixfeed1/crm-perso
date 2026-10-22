// Campagnes : règles pures (classement, créneaux) et parcours complet en base jetable
// (préparer depuis des prospects, relire, programmer, hooks du worker, pause après échecs,
// arrêt, marquages manuels). Aucun envoi réel : le worker n'est pas exécuté, ses hooks le sont.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hasDb, withSchema } = require('./helpers/db');
const R = require('../utils/campaignRules');
const { DATABASE_SCHEMA } = require('../scripts/autoInitDatabase');

const parisHour = (d) => parseInt(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false }).format(d), 10) % 24;

test('classement : exclusions dures, puis « à vérifier », puis prêt', () => {
  const lead = { id: 1, email: 'contact@agrigom.fr', relation_status: 'nouveau', company: 'agrigom.fr' };
  const row = { domain: 'agrigom.fr', analyse_le: '2026-10-21T10:00:00Z', sirene_match: 'sur', http_status: 200 };
  const ok = { ok: true, mode: 'preuve' };
  assert.deepEqual(R.classifyItem({ lead, row, controles: {}, email: ok }), { statut: 'pret', raison: null });
  assert.equal(R.classifyItem({ lead: { ...lead, email: '' }, row, controles: {}, email: ok }).statut, 'exclu');
  assert.match(R.classifyItem({ lead, row, controles: { optout: true }, email: ok }).raison, /définitivement/);
  assert.match(R.classifyItem({ lead, row, controles: { dejaSollicite: 45 }, email: ok }).raison, /45 jours/);
  assert.equal(R.classifyItem({ lead, row, controles: { dejaSollicite: 120 }, email: ok }).statut, 'pret', '90 jours passés : on peut réécrire');
  assert.match(R.classifyItem({ lead, row, controles: { autreCampagne: true }, email: ok }).raison, /autre campagne/);
  assert.match(R.classifyItem({ lead: { ...lead, relation_status: 'gagne' }, row, controles: {}, email: ok }).raison, /gagne/);
  assert.match(R.classifyItem({ lead, row: { ...row, parked: true }, controles: {}, email: ok }).raison, /park/);
  assert.match(R.classifyItem({ lead, row, controles: {}, email: { ok: false, raison: 'aucune preuve' } }).raison, /aucune preuve/);
  // À vérifier : ancien crawl, pas de mesures, adresse d'un autre domaine, SIRENE probable.
  assert.match(R.classifyItem({ lead, row: { ...row, analyse_le: null }, controles: {}, email: ok }).raison, /ancien crawl/);
  assert.match(R.classifyItem({ lead, row: null, controles: {}, email: ok }).raison, /aucune mesure/);
  assert.match(R.classifyItem({ lead: { ...lead, email: 'x@autresociete.com' }, row, controles: {}, email: ok }).raison, /autre domaine/);
  assert.equal(R.classifyItem({ lead: { ...lead, email: 'agrigom@gmail.com' }, row, controles: {}, email: ok }).statut, 'pret', 'webmail accepté');
  assert.match(R.classifyItem({ lead, row: { ...row, sirene_match: 'probable' }, controles: {}, email: ok }).raison, /SIRENE probable/);
  assert.match(R.classifyItem({ lead, row, controles: {}, email: { ok: true, mode: 'maintenance' } }).raison, /sans alerte/);
});

test('créneaux : 15 par jour, 9 h à 18 h Paris, espacés, jamais le week-end, jamais tout de suite', () => {
  const vendredi17h30 = new Date('2026-10-23T15:30:00Z'); // 17 h 30 Paris (été)
  const slots = R.planSlots(20, { par_jour: 15, heure_debut: 9, heure_fin: 18, espacement_min: 20, jours_ouvres: true }, vendredi17h30);
  assert.equal(slots.length, 20);
  assert.ok(slots[0] > vendredi17h30);
  for (let i = 1; i < slots.length; i++) {
    assert.ok(slots[i] - slots[i - 1] >= 20 * 60000, 'espacement minimal');
    assert.ok(!R.isWeekend(slots[i]), 'pas de week-end');
    const h = parisHour(slots[i]);
    assert.ok(h >= 9 && h < 18, `heure ${h}`);
  }
  // Au plus 15 par jour civil (Paris).
  const parJour = {};
  for (const d of slots) { const j = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(d); parJour[j] = (parJour[j] || 0) + 1; }
  assert.ok(Object.values(parJour).every((n) => n <= 15));
  // Un dimanche à 14 h : tout part lundi à partir de 9 h.
  const dimanche = new Date('2026-10-25T13:00:00Z');
  const lundi = R.planSlots(2, { par_jour: 15, heure_debut: 9, heure_fin: 18, espacement_min: 20 }, dimanche);
  assert.equal(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long' }).format(lundi[0]), 'lundi');
  assert.equal(parisHour(lundi[0]), 9);
});

async function createFromSchema(pool, name) {
  const cols = Object.entries(DATABASE_SCHEMA[name].columns).map(([c, d]) => `${c} ${d.replace(/REFERENCES users\(id\)/, '')}`).join(', ');
  await pool.query(`CREATE TABLE ${name} (${cols})`);
}

test('parcours complet : préparer, relire, programmer, hooks du worker, pause après échecs, arrêt, marquages', { skip: !hasDb() && 'TEST_DATABASE_URL absent' }, async () => {
  await withSchema('campagne', async ({ pool }) => {
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
    await pool.query("INSERT INTO email_signatures (content, is_default) VALUES ('<p>Marc, PixFeed</p>', TRUE)");
    await pool.query('CREATE TABLE email_tracking (id SERIAL PRIMARY KEY, token TEXT, contact_type TEXT, contact_id INT, to_email TEXT, subject TEXT, opens INT DEFAULT 0)');
    process.env.OUTREACH_SENDER_NAME = 'Marc';

    // Quatre prospects : preuve fraîche, ancien crawl, désinscrit, déjà sollicité récemment.
    const job = await pool.query("INSERT INTO crawl_jobs (techno, nb_sites, statut) VALUES ('prestashop', 4, 'done') RETURNING id");
    const frais = await insertCrawlResult(db, job.rows[0].id, typedResult({ domain: 'agrigom.fr', platform: 'PrestaShop', http_status: '200', final_url: 'http://www.agrigom.fr/', https_final: 'non', ssl_ok: 'oui', title: 'Accueil - AGRIGOM SAS', email: 'contact@agrigom.fr', analyse_le: '2026-10-21T14:21:31+00:00' }));
    const ancien = await insertCrawlResult(db, job.rows[0].id, typedResult({ domain: 'batterie4moto.fr', platform: 'PrestaShop', http_status: '200', final_url: 'http://batterie4moto.fr/', https_final: 'non', ssl_ok: 'non', title: 'Batterie4moto', email: 'contact@batterie4moto.fr' }));
    const l1 = (await pool.query("INSERT INTO leads (name, company, email, crawl_result_id) VALUES ('AGRIGOM', 'agrigom.fr', 'contact@agrigom.fr', $1) RETURNING id", [frais])).rows[0].id;
    const l2 = (await pool.query("INSERT INTO leads (name, company, email, crawl_result_id) VALUES ('Batterie4moto', 'batterie4moto.fr', 'contact@batterie4moto.fr', $1) RETURNING id", [ancien])).rows[0].id;
    const l3 = (await pool.query("INSERT INTO leads (name, company, email) VALUES ('Désinscrit', 'x.fr', 'stop@x.fr') RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO email_optout (email, source) VALUES ('stop@x.fr', 'lien')");
    const l4 = (await pool.query("INSERT INTO leads (name, company, email, crawl_result_id) VALUES ('Récent', 'recent.fr', 'c@recent.fr', $1) RETURNING id", [frais])).rows[0].id;
    await pool.query("INSERT INTO interactions (contact_type, contact_id, type, date) VALUES ('lead', $1, 'email', NOW() - INTERVAL '20 days')", [l4]);

    const c = await S.createCampaign(db, { nom: 'Test', mode: 'preuve', par_jour: 15 });
    assert.equal(c.statut, 'brouillon');
    const prep = await S.addLeads(db, c.id, [l1, l2, l3, l4]);
    assert.equal(prep.ajoutes, 4); assert.equal(prep.pret, 1); assert.equal(prep.a_verifier, 1); assert.equal(prep.exclu, 2);
    const full = await S.getCampaignFull(db, c.id);
    const byLead = Object.fromEntries(full.items.map((i) => [i.lead_id, i]));
    assert.equal(byLead[l1].statut, 'pret'); assert.equal(byLead[l1].mode, 'preuve'); assert.match(byLead[l1].body, /développeur web indépendant et je dirige PixFeed/); assert.equal(byLead[l1].preuve_signal, 'http_non_securise');
    assert.equal(byLead[l2].statut, 'a_verifier'); assert.match(byLead[l2].raison, /ancien crawl/); assert.equal(byLead[l2].mode, 'maintenance'); // repli sans alerte
    assert.match(byLead[l3].raison, /définitivement/);
    assert.match(byLead[l4].raison, /20 jours/);

    // Relire : modifier, formule interdite refusée, valider ; rien n'est programmé tant qu'on ne le demande pas.
    await assert.rejects(S.updateItem(db, c.id, byLead[l1].id, { body: 'Un simple oui suffit.' }), /interdite/);
    const edited = await S.updateItem(db, c.id, byLead[l1].id, { body: byLead[l1].body + '\nPS : relu.' });
    assert.match(edited.body, /PS : relu/);
    await S.updateItem(db, c.id, byLead[l1].id, { statut: 'valide' });
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM scheduled_emails')).rows[0].n, 0, 'aucun envoi programmé avant la demande explicite');

    // Mode test : part vers l'adresse de test, objet préfixé, sans rattacher le prospect.
    const t = await S.schedule(db, c.id, { test: true, test_emails: 'moi@pixfeed.net' });
    assert.equal(t.programmes, 1);
    const se = (await pool.query('SELECT * FROM scheduled_emails')).rows[0];
    assert.equal(se.to_email, 'moi@pixfeed.net'); assert.match(se.subject, /^\[TEST contact@agrigom\.fr\]/); assert.equal(se.related_id, null);
    assert.equal(se.campaign_id, c.id); assert.match(se.body_html, /Marc, PixFeed/);
    // Hook : la campagne est en cours -> envoi ; après envoi la ligne passe « envoyé », puis la campagne « terminée ».
    assert.equal((await S.beforeSend(db, se)).action, 'send');
    await pool.query("UPDATE scheduled_emails SET status = 'sent', sent_at = NOW() WHERE id = $1", [se.id]);
    await S.afterSent(db, se);
    assert.equal((await pool.query('SELECT statut FROM campaign_items WHERE id = $1', [byLead[l1].id])).rows[0].statut, 'envoye');
    assert.equal((await S.getCampaign(db, c.id)).statut, 'terminee');

    // Deuxième campagne réelle : le prospect l1 vient d'être sollicité (test ne compte pas : related_id null,
    // mais l'envoi réel compte) ; on simule un envoi réel puis on vérifie l'exclusion 90 jours.
    await pool.query("INSERT INTO interactions (contact_type, contact_id, type, date) VALUES ('lead', $1, 'email', NOW())", [l1]);
    const c2 = await S.createCampaign(db, { nom: 'Réelle' });
    const prep2 = await S.addLeads(db, c2.id, [l1, l2]);
    const items2 = (await S.getCampaignFull(db, c2.id)).items;
    assert.equal(items2.find((i) => i.lead_id === l1).statut, 'exclu');
    assert.match(items2.find((i) => i.lead_id === l1).raison, /0 jour/);
    assert.equal(prep2.a_verifier, 1);
    // Validation en lot d'une ligne « à vérifier » (décision humaine), programmation réelle.
    const it2 = items2.find((i) => i.lead_id === l2);
    await S.validateMany(db, c2.id, [it2.id]);
    const sch = await S.schedule(db, c2.id, {});
    assert.equal(sch.programmes, 1);
    const se2 = (await pool.query('SELECT * FROM scheduled_emails WHERE campaign_id = $1', [c2.id])).rows[0];
    assert.equal(se2.to_email, 'contact@batterie4moto.fr'); assert.equal(se2.related_id, l2); assert.equal(se2.email_type, 'prospect');
    assert.ok(new Date(se2.scheduled_at) > new Date(), 'jamais tout de suite');
    // Pause : l'envoi attend. Reprise : il part. Opposition marquée : annulé, adresse bloquée, fiche fermée.
    await S.pause(db, c2.id);
    assert.equal((await S.beforeSend(db, se2)).action, 'skip');
    await S.resume(db, c2.id);
    assert.equal((await S.beforeSend(db, se2)).action, 'send');
    await S.updateItem(db, c2.id, it2.id, { statut: 'oppose' });
    assert.equal((await pool.query('SELECT status FROM scheduled_emails WHERE id = $1', [se2.id])).rows[0].status, 'cancelled');
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM email_optout WHERE email = 'contact@batterie4moto.fr'")).rows[0].n, 1);
    assert.equal((await pool.query('SELECT relation_status FROM leads WHERE id = $1', [l2])).rows[0].relation_status, 'pas_business');
    assert.equal((await S.beforeSend(db, se2)).action, 'cancel');

    // Échecs consécutifs -> pause automatique ; arrêt -> tout ce qui reste est annulé.
    const c3 = await S.createCampaign(db, { nom: 'Échecs' });
    const l5 = (await pool.query("INSERT INTO leads (name, company, email, crawl_result_id) VALUES ('Cinq', 'cinq.fr', 'c@cinq.fr', $1) RETURNING id", [frais])).rows[0].id;
    const l6 = (await pool.query("INSERT INTO leads (name, company, email, crawl_result_id) VALUES ('Six', 'six.fr', 'c@six.fr', $1) RETURNING id", [frais])).rows[0].id;
    await S.addLeads(db, c3.id, [l5, l6]);
    const its3 = (await S.getCampaignFull(db, c3.id)).items;
    await S.validateMany(db, c3.id, its3.map((i) => i.id));
    await S.schedule(db, c3.id, {});
    const ses3 = (await pool.query('SELECT * FROM scheduled_emails WHERE campaign_id = $1 ORDER BY id', [c3.id])).rows;
    assert.equal(ses3.length, 2);
    for (let i = 0; i < 3; i++) await S.afterFailed(db, ses3[0], 'SMTP 550', i === 2);
    assert.equal((await S.getCampaign(db, c3.id)).statut, 'pause');
    assert.equal((await pool.query('SELECT statut FROM campaign_items WHERE id = $1', [ses3[0].campaign_item_id])).rows[0].statut, 'echec');
    await S.resume(db, c3.id);
    // Adresse inexistante : rebond (pas échec), adresse bloquée, et pas de pause pour autant.
    await S.afterFailed(db, ses3[1], `550 5.1.1 <${ses3[1].to_email}>: Recipient address rejected: User unknown`, true);
    const it6 = (await pool.query('SELECT statut, raison FROM campaign_items WHERE id = $1', [ses3[1].campaign_item_id])).rows[0];
    assert.equal(it6.statut, 'rebond'); assert.match(it6.raison, /Adresse inexistante/);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM email_optout WHERE email = $1', [ses3[1].to_email])).rows[0].n, 1, 'adresse rebondie bloquée');
    assert.equal((await S.getCampaign(db, c3.id)).statut, 'en_cours', 'un rebond ne compte pas dans les échecs consécutifs');
    const stopped = await S.stop(db, c3.id);
    assert.equal(stopped.annules, 2);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM scheduled_emails WHERE campaign_id = $1 AND status = 'cancelled'", [c3.id])).rows[0].n, 2);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM campaign_items WHERE campaign_id = $1 AND statut = 'arrete'", [c3.id])).rows[0].n, 0, 'échec et rebond ne sont pas touchés par l\'arrêt');
    await assert.rejects(S.addLeads(db, c3.id, [l5]), /arrêtée/);
    // « Commencer le » : les créneaux partent de la date choisie, pas de maintenant.
    const c4 = await S.createCampaign(db, { nom: 'Différée' });
    const l7 = (await pool.query("INSERT INTO leads (name, company, email, crawl_result_id) VALUES ('Sept', 'sept.fr', 'c@sept.fr', $1) RETURNING id", [frais])).rows[0].id;
    await S.addLeads(db, c4.id, [l7]);
    await S.validateMany(db, c4.id, (await S.getCampaignFull(db, c4.id)).items.map((i) => i.id));
    const dansDixJours = new Date(Date.now() + 10 * 86400000);
    const sch4 = await S.schedule(db, c4.id, { debut: dansDixJours.toISOString() });
    assert.ok(new Date(sch4.premier) >= new Date(dansDixJours.getTime() - 3 * 60000), 'premier créneau à la date choisie');
    await assert.rejects(S.schedule(db, c4.id, { debut: 'pas une date' }), /invalide/);
    // Statistiques : réponses et contrats avant les ouvertures.
    const st = await S.stats(db, c.id);
    assert.equal(st.envoyes, 1); assert.match(st.note, /pas détectés automatiquement/);
  });
});

test('options de la fiche reprises en campagne : modèle du menu rempli, relance optionnelle, réanalyse de ligne', { skip: !hasDb() && 'TEST_DATABASE_URL absent' }, async () => {
  await withSchema('campagne2', async ({ pool }) => {
    const db = { pool };
    const S = require('../services/campaignService');
    const { typedResult, insertCrawlResult } = require('../controllers/crawlController');
    for (const t of ['crawl_jobs', 'crawl_results', 'campaigns', 'campaign_items', 'scheduled_emails', 'email_templates']) await createFromSchema(pool, t);
    await pool.query('CREATE TABLE crawl_seen_domains (domain TEXT PRIMARY KEY, source VARCHAR(20), first_seen TIMESTAMP DEFAULT NOW())');
    await pool.query(`CREATE TABLE leads (id SERIAL PRIMARY KEY, name TEXT, company TEXT, website TEXT, email TEXT, relation_status TEXT DEFAULT 'nouveau', status TEXT, crawl_result_id INTEGER, platform TEXT, angles TEXT, score INTEGER, notes TEXT, updated_at TIMESTAMP)`);
    await pool.query(`CREATE TABLE interactions (id SERIAL PRIMARY KEY, contact_type VARCHAR(10), contact_id INT, type TEXT, reached TEXT, date TIMESTAMP DEFAULT NOW(), notes TEXT, next_followup_date DATE, next_followup_channel TEXT, followup_done BOOLEAN DEFAULT FALSE, relance_step INT)`);
    await pool.query('CREATE TABLE email_optout (email TEXT PRIMARY KEY, source TEXT)');
    await pool.query('CREATE TABLE email_log (id SERIAL PRIMARY KEY, to_email TEXT, source VARCHAR(40), created_at TIMESTAMP DEFAULT NOW())');
    await pool.query('CREATE TABLE email_signatures (id SERIAL PRIMARY KEY, content TEXT, is_default BOOLEAN DEFAULT FALSE)');
    await pool.query("INSERT INTO email_signatures (content, is_default) VALUES ('<p>défaut</p>', TRUE), ('<p>campagne</p>', FALSE)");
    process.env.OUTREACH_SENDER_NAME = 'Marc';
    const tpl = (await pool.query("INSERT INTO email_templates (name, category, subject, body) VALUES ('Perso', 'contact', 'Un mot sur {site}', '{prenom},\n\nJe suis {expediteur} et je dirige {entreprise}.\n\n{constat}\n\nÀ bientôt,') RETURNING id")).rows[0].id;
    const job = await pool.query("INSERT INTO crawl_jobs (techno, nb_sites, statut) VALUES ('prestashop', 1, 'done') RETURNING id");
    const rid = await insertCrawlResult(db, job.rows[0].id, typedResult({ domain: 'agrigom.fr', platform: 'PrestaShop', http_status: '200', final_url: 'http://www.agrigom.fr/', https_final: 'non', ssl_ok: 'oui', title: 'Accueil - AGRIGOM SAS', email: 'contact@agrigom.fr', analyse_le: '2026-10-21T14:21:31+00:00' }));
    await pool.query("UPDATE crawl_results SET sirene_match = 'sur', raison_sociale = 'AGRIGOM', gerant_nom = 'SAVARY', gerant_prenom = 'FRANCK' WHERE id = $1", [rid]);
    const lead = (await pool.query("INSERT INTO leads (name, company, email, crawl_result_id) VALUES ('AGRIGOM', 'agrigom.fr', 'contact@agrigom.fr', $1) RETURNING id", [rid])).rows[0].id;

    // Mode modèle : variables remplies, civilité sûre, constat = preuve retenue.
    const c = await S.createCampaign(db, { nom: 'Modèle', mode: 'modele', template_id: tpl, signature_id: 2, bcc: 'copie@pixfeed.net', relance_jours: 7, relance_canal: 'appel' });
    await S.addLeads(db, c.id, [lead]);
    const it = (await S.getCampaignFull(db, c.id)).items[0];
    assert.equal(it.mode, 'modele');
    assert.equal(it.subject, 'Un mot sur agrigom.fr');
    assert.match(it.body, /^Bonjour Franck Savary,\n/);
    assert.match(it.body, /Je suis Marc et je dirige PixFeed\./);
    assert.match(it.body, /renvoyé vers http:\/\/www\.agrigom\.fr/);
    await assert.rejects(S.createCampaign(db, { nom: 'Sans modèle', mode: 'modele' }), /modèle/);

    // Programmation : signature choisie et copie cachée appliquées.
    await S.validateMany(db, c.id, [it.id]);
    await S.schedule(db, c.id, {});
    const se = (await pool.query('SELECT * FROM scheduled_emails WHERE campaign_id = $1', [c.id])).rows[0];
    assert.match(se.body_html, /<p>campagne<\/p>/); assert.equal(se.bcc_email, 'copie@pixfeed.net');
    // Relance J+7 (appel) créée APRÈS l'envoi seulement, et seulement parce que la campagne le demande.
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM interactions')).rows[0].n, 0);
    await pool.query("UPDATE scheduled_emails SET status = 'sent', sent_at = NOW() WHERE id = $1", [se.id]);
    await S.afterSent(db, se);
    const rel = (await pool.query('SELECT * FROM interactions WHERE contact_id = $1', [lead])).rows;
    assert.equal(rel.length, 1); assert.equal(rel[0].next_followup_channel, 'appel'); assert.equal(rel[0].relance_step, null);
    assert.equal(Math.round((new Date(rel[0].next_followup_date) - new Date(new Date().toISOString().slice(0, 10))) / 86400000), 7);

    // Réanalyse d'une ligne « ancien crawl » : mesures fraîches injectées -> preuve confirmée -> ligne prête.
    const vieux = await insertCrawlResult(db, job.rows[0].id, typedResult({ domain: 'vieux.fr', platform: 'PrestaShop', http_status: '200', final_url: 'http://vieux.fr/', https_final: 'non', ssl_ok: 'non', title: 'Vieux', email: 'c@vieux.fr' }));
    const l2 = (await pool.query("INSERT INTO leads (name, company, email, crawl_result_id) VALUES ('Vieux', 'vieux.fr', 'c@vieux.fr', $1) RETURNING id", [vieux])).rows[0].id;
    const c2 = await S.createCampaign(db, { nom: 'Réanalyse' });
    await S.addLeads(db, c2.id, [l2]);
    let it2 = (await S.getCampaignFull(db, c2.id)).items[0];
    assert.equal(it2.statut, 'a_verifier'); assert.match(it2.raison, /ancien crawl/);
    const detect = async () => [{ domain: 'vieux.fr', platform: 'PrestaShop', http_status: '200', final_url: 'http://www.vieux.fr/', https_final: 'non', ssl_ok: 'oui', title: 'Vieux', email: 'c@vieux.fr', analyse_le: '2026-10-21T16:00:00+00:00' }];
    const r = await S.reanalyzeItem(db, c2.id, it2.id, { detect, sirene: async () => ({ found: false }) });
    assert.equal(r.item.statut, 'pret'); assert.equal(r.item.preuve_signal, 'http_non_securise'); assert.ok(r.item.preuve_date);
    // Régénération « maintenance » d'une ligne validée : elle repasse en prêt à valider.
    await S.updateItem(db, c2.id, it2.id, { statut: 'valide' });
    const regen = await S.updateItem(db, c2.id, it2.id, { mode: 'maintenance' });
    assert.equal(regen.mode, 'maintenance'); assert.equal(regen.statut, 'pret');
  });
});

test('reprise : adresse saisie sur une ligne exclue, exclus repris en lot, échec réessayé, désinscrit toujours bloqué', { skip: !hasDb() && 'TEST_DATABASE_URL absent' }, async () => {
  await withSchema('campagne3', async ({ pool }) => {
    const db = { pool };
    const S = require('../services/campaignService');
    const { typedResult, insertCrawlResult } = require('../controllers/crawlController');
    for (const t of ['crawl_jobs', 'crawl_results', 'campaigns', 'campaign_items', 'scheduled_emails']) await createFromSchema(pool, t);
    await pool.query('CREATE TABLE crawl_seen_domains (domain TEXT PRIMARY KEY, source VARCHAR(20), first_seen TIMESTAMP DEFAULT NOW())');
    await pool.query(`CREATE TABLE leads (id SERIAL PRIMARY KEY, name TEXT, company TEXT, website TEXT, email TEXT, relation_status TEXT DEFAULT 'nouveau', status TEXT, crawl_result_id INTEGER, platform TEXT, angles TEXT, score INTEGER, notes TEXT, updated_at TIMESTAMP)`);
    await pool.query(`CREATE TABLE interactions (id SERIAL PRIMARY KEY, contact_type VARCHAR(10), contact_id INT, type TEXT, reached TEXT, date TIMESTAMP DEFAULT NOW(), notes TEXT, next_followup_date DATE, next_followup_channel TEXT, followup_done BOOLEAN DEFAULT FALSE, relance_step INT)`);
    await pool.query('CREATE TABLE email_optout (email TEXT PRIMARY KEY, source TEXT)');
    await pool.query('CREATE TABLE email_log (id SERIAL PRIMARY KEY, to_email TEXT, source VARCHAR(40), created_at TIMESTAMP DEFAULT NOW())');
    await pool.query('CREATE TABLE email_signatures (id SERIAL PRIMARY KEY, content TEXT, is_default BOOLEAN DEFAULT FALSE)');
    await pool.query("INSERT INTO email_signatures (content, is_default) VALUES ('<p>Marc</p>', TRUE)");
    process.env.OUTREACH_SENDER_NAME = 'Marc';
    const job = await pool.query("INSERT INTO crawl_jobs (techno, nb_sites, statut) VALUES ('prestashop', 3, 'done') RETURNING id");
    const mk = (domain) => insertCrawlResult(db, job.rows[0].id, typedResult({ domain, platform: 'PrestaShop', http_status: '200', final_url: `http://www.${domain}/`, https_final: 'non', ssl_ok: 'oui', title: domain, analyse_le: '2026-10-21T14:21:31+00:00' }));
    const r1 = await mk('sansmail.fr'); const r2 = await mk('plustard.fr'); const r3 = await mk('echec.fr');
    const l1 = (await pool.query("INSERT INTO leads (name, company, crawl_result_id) VALUES ('Sans mail', 'sansmail.fr', $1) RETURNING id", [r1])).rows[0].id;
    const l2 = (await pool.query("INSERT INTO leads (name, company, crawl_result_id) VALUES ('Plus tard', 'plustard.fr', $1) RETURNING id", [r2])).rows[0].id;
    const l3 = (await pool.query("INSERT INTO leads (name, company, email, crawl_result_id) VALUES ('Echec', 'echec.fr', 'contact@echec.fr', $1) RETURNING id", [r3])).rows[0].id;
    const c = await S.createCampaign(db, { nom: 'Reprise', mode: 'preuve' });
    const prep = await S.addLeads(db, c.id, [l1, l2, l3]);
    assert.equal(prep.exclu, 2); assert.equal(prep.pret, 1);
    const items = Object.fromEntries((await S.getCampaignFull(db, c.id)).items.map((i) => [i.lead_id, i]));
    assert.match(items[l1].raison, /aucune adresse/);

    // 1. Adresse saisie sur la ligne : enregistrée sur la fiche, ligne reclassée « prêt » sans recrawl, email présent.
    await assert.rejects(S.reprendreItem(db, c.id, items[l1].id, { to_email: 'pas une adresse' }), /invalide/);
    const rep1 = await S.reprendreItem(db, c.id, items[l1].id, { to_email: 'Contact@SansMail.fr' });
    assert.equal(rep1.statut, 'pret'); assert.equal(rep1.to_email, 'contact@sansmail.fr'); assert.ok(rep1.body);
    assert.equal((await pool.query('SELECT email FROM leads WHERE id = $1', [l1])).rows[0].email, 'contact@sansmail.fr');
    // Une ligne « prêt » ne se reprend pas (elle se relit).
    await assert.rejects(S.reprendreItem(db, c.id, items[l1].id, {}), /exclues, en échec ou arrêtées/);

    // 2. En lot : seule la fiche qui a reçu une adresse depuis est reprise ; un désinscrit reste exclu.
    let lot = await S.reprendreMany(db, c.id, 'sans_email');
    assert.equal(lot.repris, 0, 'rien tant que la fiche n\'a pas d\'adresse');
    await pool.query("UPDATE leads SET email = 'stop@plustard.fr' WHERE id = $1", [l2]);
    await pool.query("INSERT INTO email_optout (email, source) VALUES ('stop@plustard.fr', 'lien')");
    lot = await S.reprendreMany(db, c.id, 'sans_email');
    assert.equal(lot.repris, 1); assert.equal(lot.exclu, 1);
    assert.match((await pool.query('SELECT raison FROM campaign_items WHERE id = $1', [items[l2].id])).rows[0].raison, /définitivement/);

    // 3. Échec réessayé : contrôles rejoués, ligne remise en « validé », ancien envoi délié ; elle repart au prochain « Programmer ».
    await S.updateItem(db, c.id, items[l3].id, { statut: 'valide' });
    await S.schedule(db, c.id, {});
    const se = (await pool.query('SELECT * FROM scheduled_emails WHERE campaign_item_id = $1', [items[l3].id])).rows[0];
    await S.afterFailed(db, se, 'SMTP 550', true);
    assert.equal((await pool.query('SELECT statut FROM campaign_items WHERE id = $1', [items[l3].id])).rows[0].statut, 'echec');
    const rep3 = await S.reprendreItem(db, c.id, items[l3].id, {});
    assert.equal(rep3.statut, 'valide'); assert.equal(rep3.raison, null); assert.equal(rep3.scheduled_email_id, null);
    const again = await S.schedule(db, c.id, {});
    assert.equal(again.programmes, 1);
    // Réessayer en lot sur une campagne sans échec : rien à faire.
    assert.equal((await S.reprendreMany(db, c.id, 'echecs')).repris, 0);
  });
});
