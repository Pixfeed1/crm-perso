// backend/services/campaignService.js
//
// Campagnes de prospection : PRÉPARER (prospects depuis le Crawl ou la liste, contrôles
// d'exclusion, génération, classement), RELIRE (modifier, valider), PROGRAMMER (créneaux lents
// via scheduled_emails et le worker existant), PAUSE / ARRÊT, marquages manuels (réponse,
// rebond, opposition), statistiques orientées réponses et contrats.
//
// Garde-fous : aucun envoi sans validation ligne par ligne ; exclusions revérifiées au moment
// de chaque envoi (hook du worker) ; pas de relance automatique ; opposition définitive ; mode
// test vers des adresses à soi. Tout en db.pool.query.
const { aujourdhuiParis, ajouterJoursOuvres } = require('../utils/joursOuvres');
const scheduledEmailModel = require('../models/scheduledEmailModel');
const optout = require('./optout');
const refus = require('./refusService');
const abq = require('../utils/abQuestion');
const smtpErrors = require('../utils/smtpErrors');
const proof = require('./proofEmailService');
const crawl = require('../controllers/crawlController');
const { classifyItem, planSlots } = require('../utils/campaignRules');
const { normalizeDomain } = require('../utils/csvParse');
const coldEmail = require('./coldEmailService');
const reanalyse = require('./leadReanalyzeService');

const ECHECS_PAUSE = 3; // échecs d'envoi consécutifs -> pause automatique de la campagne

// ─── Lecture ─────────────────────────────────────────────────────────────────
async function getCampaign(db, id) {
  const r = await db.pool.query('SELECT * FROM campaigns WHERE id = $1', [id]);
  if (!r.rows[0]) throw Object.assign(new Error('Campagne introuvable'), { status: 404 });
  return r.rows[0];
}

async function listCampaigns(db) {
  const { rows } = await db.pool.query(
    `SELECT c.*,
            COUNT(i.id)::int AS nb_items,
            COUNT(i.id) FILTER (WHERE i.statut = 'pret')::int AS nb_pret,
            COUNT(i.id) FILTER (WHERE i.statut = 'a_verifier')::int AS nb_a_verifier,
            COUNT(i.id) FILTER (WHERE i.statut = 'valide')::int AS nb_valide,
            COUNT(i.id) FILTER (WHERE i.statut = 'programme')::int AS nb_programme,
            COUNT(i.id) FILTER (WHERE i.statut = 'envoye')::int AS nb_envoye,
            COUNT(i.id) FILTER (WHERE i.statut = 'repondu')::int AS nb_repondu,
            COUNT(i.id) FILTER (WHERE i.statut IN ('echec', 'rebond'))::int AS nb_echec
     FROM campaigns c LEFT JOIN campaign_items i ON i.campaign_id = c.id
     GROUP BY c.id ORDER BY c.created_at DESC, c.id DESC`
  );
  return rows;
}

async function getCampaignFull(db, id) {
  const campaign = await getCampaign(db, id);
  const { rows: items } = await db.pool.query(
    `SELECT i.*, l.name AS lead_name, l.relation_status, l.company AS lead_company
     FROM campaign_items i LEFT JOIN leads l ON l.id = i.lead_id
     WHERE i.campaign_id = $1
     ORDER BY CASE i.statut WHEN 'pret' THEN 0 WHEN 'a_verifier' THEN 1 WHEN 'valide' THEN 2 WHEN 'programme' THEN 3 WHEN 'envoye' THEN 4 ELSE 5 END, i.id`,
    [id]
  );
  const entonnoir = await require('./entonnoirService').entonnoir(db, id).catch((e) => { console.error('[Campagnes] entonnoir :', e.message); return null; });
  const ab = await require('./entonnoirService').abResultats(db, id).catch((e) => { console.error('[Campagnes] A/B :', e.message); return null; });
  return { campaign, items, stats: await stats(db, id), entonnoir, ab };
}

// Statistiques prioritaires : réponses, rendez-vous, contrats. Les clics en dernier (plus d'ouvertures).
async function stats(db, id) {
  const counts = (await db.pool.query('SELECT statut, COUNT(*)::int AS n FROM campaign_items WHERE campaign_id = $1 GROUP BY statut', [id])).rows;
  const byStatut = Object.fromEntries(counts.map((c) => [c.statut, c.n]));
  const leads = (await db.pool.query(
    `SELECT l.relation_status, l.status FROM campaign_items i JOIN leads l ON l.id = i.lead_id WHERE i.campaign_id = $1 AND i.statut IN ('envoye', 'repondu')`, [id]
  )).rows;
  const contrats = leads.filter((l) => l.relation_status === 'gagne' || l.status === 'client' || l.status === 'won').length;
  const discussions = leads.filter((l) => l.relation_status === 'en_discussion').length;
  const rdv = (await db.pool.query(
    `SELECT COUNT(DISTINCT it.contact_id)::int AS n FROM interactions it
     JOIN campaign_items i ON i.lead_id = it.contact_id AND it.contact_type = 'lead'
     WHERE i.campaign_id = $1 AND i.statut IN ('envoye', 'repondu') AND it.type IN ('rdv', 'rendez-vous', 'reunion') AND it.date >= COALESCE(i.sent_at, i.created_at)`, [id]
  ).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n;
  const clics = (await db.pool.query(
    `SELECT COUNT(DISTINCT t.id)::int AS n FROM email_tracking t
     JOIN scheduled_emails s ON s.id IN (SELECT scheduled_email_id FROM campaign_items WHERE campaign_id = $1)
     WHERE t.to_email = s.to_email AND t.subject = s.subject AND COALESCE(t.click_count, 0) > 0`, [id]
  ).catch(() => ({ rows: [{ n: null }] }))).rows[0].n;
  return {
    total: counts.reduce((a, c) => a + c.n, 0),
    par_statut: byStatut,
    envoyes: (byStatut.envoye || 0) + (byStatut.repondu || 0),
    reponses: byStatut.repondu || 0,
    discussions,
    rendez_vous: rdv,
    contrats,
    echecs: (byStatut.echec || 0) + (byStatut.rebond || 0),
    oppositions: byStatut.oppose || 0,
    clics,
    note: "Réponses et rebonds : lus dans la boîte d'envoi si elle est configurée (IMAP), sinon à marquer à la main sur la ligne. Les refus sont toujours soumis à confirmation."
  };
}

// ─── Création ───────────────────────────────────────────────────────────────
const MODES = ['preuve', 'maintenance', 'modele'];
// Tâche de relance créée par défaut après chaque email réellement parti : un RAPPEL pour Marc dans le
// Suivi, jamais un envoi automatique. Délai en jours ouvrés (week-ends et fériés exclus). Désactivable
// par campagne (relance_jours = null).
const RELANCE_DEFAUT = { jours: 5, canal: 'appel' };
const CANAUX_RELANCE = ['appel', 'email', 'sms', 'linkedin', 'autre'];

async function createCampaign(db, { nom, mode = 'preuve', from_account = 'pro', par_jour = 15, heure_debut = 9, heure_fin = 18, espacement_min = 20, jours_ouvres = true, template_id = null, signature_id = null, bcc = null, relance_jours = RELANCE_DEFAUT.jours, relance_canal = RELANCE_DEFAUT.canal } = {}) {
  const n = String(nom || '').trim() || `Campagne du ${new Date().toLocaleDateString('fr-FR')}`;
  const m = MODES.includes(mode) ? mode : 'preuve';
  if (m === 'modele' && !template_id) throw Object.assign(new Error('Mode modèle : choisissez un modèle du menu.'), { status: 400 });
  const r = await db.pool.query(
    `INSERT INTO campaigns (nom, mode, from_account, par_jour, heure_debut, heure_fin, espacement_min, jours_ouvres, template_id, signature_id, bcc, relance_jours, relance_canal)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    [n, m, from_account === 'gmail' ? 'gmail' : 'pro', Math.max(1, Math.min(100, par_jour | 0 || 15)), heure_debut | 0, heure_fin | 0, Math.max(1, espacement_min | 0 || 20), !!jours_ouvres,
     template_id || null, signature_id || null, (bcc || '').trim() || null, relance_jours ? Math.max(1, relance_jours | 0) : null, CANAUX_RELANCE.includes(relance_canal) ? relance_canal : RELANCE_DEFAUT.canal]
  );
  return r.rows[0];
}

async function updateCampaign(db, id, fields) {
  const allowed = ['nom', 'mode', 'from_account', 'par_jour', 'heure_debut', 'heure_fin', 'espacement_min', 'jours_ouvres', 'test_mode', 'test_emails', 'template_id', 'signature_id', 'bcc', 'relance_jours', 'relance_canal'];
  if (fields && fields.relance_jours === '' ) fields.relance_jours = null;
  if (fields && fields.relance_canal !== undefined && !CANAUX_RELANCE.includes(fields.relance_canal)) delete fields.relance_canal;
  const keys = Object.keys(fields || {}).filter((k) => allowed.includes(k));
  if (!keys.length) return getCampaign(db, id);
  const set = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  await db.pool.query(`UPDATE campaigns SET ${set}, updated_at = NOW() WHERE id = $${keys.length + 1}`, [...keys.map((k) => fields[k]), id]);
  return getCampaign(db, id);
}

// ─── Test A/B de la question finale ─────────────────────────────────────────
// ab = { preuve: cle, maintenance: cle } ou null (arrêt). Réglable tant qu'aucun email n'est parti ni
// programmé : la version d'un prospect ne change jamais en cours de campagne. Les lignes en préparation
// reçoivent leur version (moitié-moitié par famille) ; un texte validé dont la question change repasse
// « prêt » pour être relu.
async function setAbTest(db, campaignId, ab) {
  const c = await getCampaign(db, campaignId);
  const config = abq.valider(ab);
  const parti = (await db.pool.query("SELECT COUNT(*)::int AS n FROM campaign_items WHERE campaign_id = $1 AND (sent_at IS NOT NULL OR statut IN ('programme', 'envoye', 'repondu', 'rebond', 'oppose'))", [campaignId])).rows[0].n;
  if (parti) throw Object.assign(new Error("Test A/B figé : des emails de cette campagne sont déjà programmés ou partis. Créez une nouvelle campagne pour un autre test."), { status: 409 });
  await db.pool.query('UPDATE campaigns SET ab_question = $2, updated_at = NOW() WHERE id = $1', [campaignId, config ? JSON.stringify(config) : null]);
  const campaign = { ...c, ab_question: config };
  const { rows } = await db.pool.query("SELECT * FROM campaign_items WHERE campaign_id = $1 AND statut IN ('pret', 'a_verifier', 'valide', 'exclu') AND body IS NOT NULL ORDER BY id", [campaignId]);
  const compte = {};
  const out = { lignes: 0, A: 0, B: 0, hors_test: 0, a_relire: 0 };
  for (const it of rows) {
    // Texte de base (version A) : la question d'origine remise si la ligne était en B.
    let body = it.question_a && it.variante === 'B' ? (abq.remplacerQuestion(it.body, it.question_a) || { body: it.body }).body : it.body;
    let variante = null, questionA = null;
    if (config && abq.texteB(config, it.mode) && abq.questionDe(body)) {
      const k = compte[it.mode] || (compte[it.mode] = { A: 0, B: 0 });
      variante = ['A', 'B'].includes(it.variante) ? it.variante : abq.choisir(k.A, k.B); // version déjà tirée : gardée
      k[variante]++;
      if (variante === 'B') {
        const lead = it.lead_id ? (await db.pool.query('SELECT * FROM leads WHERE id = $1', [it.lead_id])).rows[0] : null;
        const row = lead ? await rowForLead(db, lead) : null;
        const r = abq.remplacerQuestion(body, abq.texteB(config, it.mode, proof.typeSite(row || {}) === 'boutique'));
        if (r) { questionA = r.ancienne; body = r.body; }
      }
      out[variante]++;
    } else out.hors_test++;
    const change = body !== it.body;
    const statut = change && it.statut === 'valide' ? 'pret' : it.statut;
    if (statut !== it.statut) out.a_relire++;
    await db.pool.query(
      `UPDATE campaign_items SET variante = $2, question_a = $3, body = $4, statut = $5, raison = CASE WHEN $6 THEN $7 ELSE raison END, updated_at = NOW() WHERE id = $1`,
      [it.id, variante, questionA, body, statut, statut !== it.statut, 'question finale changée par le test A/B : à relire avant de valider']);
    out.lignes++;
  }
  return { ...out, ab_question: config };
}

// ─── Contrôles d'exclusion (préparation ET envoi) ───────────────────────────
async function controles(db, lead, campaignId, { ignoreSelf = null } = {}) {
  const email = String(lead.email || '').trim();
  const out = { optout: false, dejaSollicite: null, autreCampagne: false, dejaEnvoyeCampagne: false };
  if (email) out.optout = await optout.isOptedOut(db, email);
  // Refus de prospection « ne plus écrire » / « refus total » sur la fiche ou son entreprise.
  if (!out.optout && lead.id) out.optout = await refus.bloque(db, lead.id, 'email');
  // Déjà sollicité : dernier email de prospection vers cette fiche ou cette adresse.
  const last = await db.pool.query(
    `SELECT MAX(d) AS d FROM (
       SELECT MAX(date) AS d FROM interactions WHERE contact_type = 'lead' AND contact_id = $1 AND type = 'email'
       UNION ALL
       SELECT MAX(created_at) FROM email_log WHERE source = 'prospect' AND $2 <> '' AND LOWER(to_email) = LOWER($2)
       UNION ALL
       SELECT MAX(sent_at) FROM scheduled_emails WHERE email_type = 'prospect' AND status = 'sent' AND $2 <> '' AND LOWER(to_email) = LOWER($2)
     ) x`, [lead.id, email]
  ).catch(() => ({ rows: [{ d: null }] }));
  if (last.rows[0] && last.rows[0].d) out.dejaSollicite = Math.floor((Date.now() - new Date(last.rows[0].d).getTime()) / 86400000);
  // Déjà dans une autre campagne active, ou déjà envoyé dans celle-ci.
  const autres = await db.pool.query(
    `SELECT i.id, i.campaign_id, i.statut FROM campaign_items i JOIN campaigns c ON c.id = i.campaign_id
     WHERE i.lead_id = $1 AND i.statut IN ('pret', 'a_verifier', 'valide', 'programme', 'envoye', 'repondu') AND c.statut IN ('brouillon', 'en_cours', 'pause')
       AND ($2::int IS NULL OR i.id <> $2)`, [lead.id, ignoreSelf]
  );
  for (const a of autres.rows) {
    if (a.campaign_id === Number(campaignId)) { if (['envoye', 'repondu'].includes(a.statut)) out.dejaEnvoyeCampagne = true; } else out.autreCampagne = true;
  }
  return out;
}

// ─── Génération ─────────────────────────────────────────────────────────────
// Modèle du menu rempli pour ce prospect : {prenom} (civilité sûre ou « Bonjour »), {site},
// {plateforme}, {constat} (la preuve retenue, sinon vide), {portee} (pourquoi elle compte),
// {expediteur}, {entreprise}.
function remplirModele(texte, row, lead) {
  const r = row || {};
  const salut = proof.salutation(r, lead).replace(/,$/, ''); // « Bonjour Franck Savary » ou « Bonjour »
  const site = (r.domain || lead.company || '').replace(/^www\./, '');
  const plateforme = (r.platform && r.platform !== 'Inconnu') ? r.platform : '';
  const d = row ? proof.buildProofEmail(row, lead) : { ok: false };
  const c = d.ok ? proof.CATALOGUE[d.preuve](row) : null;
  const constat = c ? c.preuve : '';
  const portee = c ? (c.consequence || '') : '';
  return String(texte || '')
    .replace(/\{prenom\}/g, salut).replace(/\{site\}/g, site).replace(/\{plateforme\}/g, plateforme)
    .replace(/\{constat\}/g, constat).replace(/\{portee\}/g, portee)
    .replace(/\{expediteur\}/g, (process.env.OUTREACH_SENDER_NAME || '').trim())
    .replace(/\{entreprise\}/g, (process.env.OUTREACH_SENDER_COMPANY || 'PixFeed').trim())
    .replace(/[ \t]+\n/g, '\n');
}

function generer(campaign, row, lead, template = null, variante = null) {
  const email = genererA(campaign, row, lead, template);
  return varier(email, campaign, variante, row);
}

// Test A/B de la question finale : la version B remplace seulement la dernière question.
function varier(email, campaign, variante, row) {
  if (!email || !email.ok || variante !== 'B' || !campaign.ab_question) return email;
  const b = abq.texteB(campaign.ab_question, email.mode, proof.typeSite(row || {}) === 'boutique');
  const r = b && abq.remplacerQuestion(email.body, b);
  return r ? { ...email, body: r.body, question_a: r.ancienne } : email;
}

function genererA(campaign, row, lead, template = null) {
  if (campaign.mode === 'modele') {
    if (!template) return { ok: false, raison: 'modèle introuvable' };
    const body = remplirModele(template.body, row, lead);
    if (/\{constat\}/.test(template.body || '') && !/\S/.test(remplirModele('{constat}', row, lead))) {
      return { ok: false, raison: 'le modèle attend un constat ({constat}) et aucune preuve n\'est disponible' };
    }
    if (proof.FORMULES_INTERDITES.test(body)) return { ok: false, raison: 'le modèle contient une formulation interdite' };
    return { ok: true, mode: 'modele', subject: remplirModele(template.subject, row, lead), body, detail: null };
  }
  if (campaign.mode === 'maintenance') {
    const m = row ? proof.buildMaintenanceEmail(row, lead) : { ok: false, raison: 'aucune mesure du site' };
    return m.ok ? { ok: true, mode: 'maintenance', subject: m.subject, body: m.body, detail: null } : { ok: false, raison: m.raison };
  }
  const d = proof.buildProofEmail(row, lead);
  if (d.ok) return { ok: true, mode: 'preuve', subject: d.subject, body: d.body, detail: d.detail };
  if (d.maintenance && d.maintenance.ok) return { ok: true, mode: 'maintenance', subject: d.maintenance.subject, body: d.maintenance.body, detail: { signal: 'aucune preuve', brut: d.raison, url_controlee: row ? (row.final_url || `https://${row.domain}`) : null, analyse_le: row ? row.analyse_le : null, identite: null } };
  return { ok: false, raison: d.raison };
}

async function templateFor(db, campaign) {
  if (campaign.mode !== 'modele' || !campaign.template_id) return null;
  const r = await db.pool.query('SELECT * FROM email_templates WHERE id = $1', [campaign.template_id]).catch(() => ({ rows: [] }));
  return r.rows[0] || null;
}

// Modèle du menu rempli pour une fiche prospect : mêmes règles qu'en campagne (nom seulement si
// l'identité est certaine, constat et portée tirés de la preuve retenue). manque = le modèle attend
// un constat et le site n'en a aucun de vérifié : rien n'est rempli.
async function remplirPourFiche(db, leadId, templateId) {
  const lead = (await db.pool.query('SELECT * FROM leads WHERE id = $1', [leadId])).rows[0];
  if (!lead) { const e = new Error('Fiche introuvable'); e.status = 404; throw e; }
  const t = (await db.pool.query('SELECT * FROM email_templates WHERE id = $1', [templateId])).rows[0];
  if (!t) { const e = new Error('Modèle introuvable'); e.status = 404; throw e; }
  const row = await rowForLead(db, lead);
  if (/\{(constat|portee)\}/.test(`${t.subject} ${t.body}`) && !/\S/.test(remplirModele('{constat}', row, lead))) {
    return { ok: false, manque: 'constat', message: `Aucun constat vérifié sur ce site : le modèle « ${t.name} » ne peut pas être utilisé. Choisissez-en un autre, ou « Rédiger » pour un premier email adapté.` };
  }
  const body = remplirModele(t.body, row, lead).replace(/\n{3,}/g, '\n\n');
  return { ok: true, subject: remplirModele(t.subject, row, lead), body };
}

async function rowForLead(db, lead) {
  if (!lead.crawl_result_id) return null;
  const r = await db.pool.query('SELECT * FROM crawl_results WHERE id = $1', [lead.crawl_result_id]);
  return r.rows[0] || null;
}

// Ajoute des prospects existants à la campagne (depuis la liste des Prospects).
async function addLeads(db, campaignId, leadIds) {
  const campaign = await getCampaign(db, campaignId);
  if (!['brouillon', 'en_cours', 'pause'].includes(campaign.statut)) throw Object.assign(new Error('Campagne arrêtée ou terminée : créez-en une nouvelle.'), { status: 409 });
  const out = { ajoutes: 0, pret: 0, a_verifier: 0, exclu: 0, ignores: [] };
  const template = await templateFor(db, campaign);
  for (const leadId of leadIds) {
    const lr = await db.pool.query('SELECT * FROM leads WHERE id = $1', [leadId]);
    const lead = lr.rows[0];
    if (!lead) { out.ignores.push({ lead_id: leadId, raison: 'fiche introuvable' }); continue; }
    const deja = await db.pool.query('SELECT id FROM campaign_items WHERE campaign_id = $1 AND lead_id = $2', [campaignId, leadId]);
    if (deja.rows.length) { out.ignores.push({ lead_id: leadId, raison: 'déjà dans la campagne' }); continue; }
    const row = await rowForLead(db, lead);
    const ctl = await controles(db, lead, campaignId);
    let email = generer(campaign, row, lead, template);
    // Test A/B : version tirée pour la famille de l'email (preuve / premier contact), moitié-moitié.
    let variante = null;
    if (campaign.ab_question && email.ok && abq.texteB(campaign.ab_question, email.mode)) {
      const c = (await db.pool.query(`SELECT COUNT(*) FILTER (WHERE variante = 'A')::int AS a, COUNT(*) FILTER (WHERE variante = 'B')::int AS b FROM campaign_items WHERE campaign_id = $1 AND mode = $2`, [campaignId, email.mode])).rows[0];
      variante = abq.choisir(c.a, c.b);
      email = varier(email, campaign, variante, row);
    }
    const cls = classifyItem({ lead, row, controles: ctl, email });
    const detail = email.ok ? email.detail : null;
    await db.pool.query(
      `INSERT INTO campaign_items (campaign_id, lead_id, crawl_result_id, domain, to_email, statut, raison, mode, subject, body, preuve_signal, preuve_brut, preuve_url, preuve_date, identite, variante, question_a)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [campaignId, lead.id, lead.crawl_result_id || null, normalizeDomain(lead.website || lead.company) || null, (lead.email || '').trim() || null,
       cls.statut, cls.raison, email.ok ? email.mode : null, email.ok ? email.subject : null, email.ok ? email.body : null,
       detail ? detail.signal : null, detail ? detail.brut : null, detail ? detail.url_controlee : null, detail && detail.analyse_le ? detail.analyse_le : null, detail ? detail.identite : null,
       variante, email.question_a || null]
    );
    out.ajoutes++; out[cls.statut]++;
  }
  return out;
}

// Ajoute des résultats de crawl : promotion en prospect si nécessaire, puis addLeads.
async function addFromCrawl(db, campaignId, jobId, resultIds) {
  const { rows } = await db.pool.query('SELECT * FROM crawl_results WHERE job_id = $1 AND id = ANY($2::int[])', [jobId, resultIds]);
  const leadIds = []; const skipped = [];
  for (const r of rows) {
    const existing = await db.pool.query('SELECT id FROM leads WHERE crawl_result_id = $1 ORDER BY id LIMIT 1', [r.id]);
    if (existing.rows[0]) { leadIds.push(existing.rows[0].id); continue; }
    try {
      const leadId = await crawl.createLeadFromResult(db, r, { statusVal: 'nouveau', source: 'Crawl' });
      leadIds.push(leadId);
    } catch (e) { skipped.push({ domain: r.domain, raison: e.message }); }
  }
  const res = await addLeads(db, campaignId, leadIds);
  res.ignores.push(...skipped);
  return res;
}

// ─── Relecture ──────────────────────────────────────────────────────────────
const TRANSITIONS = {
  valide: ['pret', 'a_verifier'],
  pret: ['valide'],
  exclu: ['pret', 'a_verifier', 'valide'],
  repondu: ['envoye', 'programme'],
  rebond: ['envoye', 'echec', 'programme'],
  oppose: ['envoye', 'programme', 'repondu', 'valide', 'pret', 'a_verifier']
};

async function updateItem(db, campaignId, itemId, { subject, body, statut, raison, mode, entreprise } = {}) {
  const ir = await db.pool.query('SELECT * FROM campaign_items WHERE id = $1 AND campaign_id = $2', [itemId, campaignId]);
  const item = ir.rows[0];
  if (!item) throw Object.assign(new Error('Ligne introuvable'), { status: 404 });
  const fields = {};
  if (subject !== undefined && ['pret', 'a_verifier', 'valide'].includes(item.statut)) fields.subject = String(subject).slice(0, 300);
  if (body !== undefined && ['pret', 'a_verifier', 'valide'].includes(item.statut)) {
    const b = String(body);
    if (proof.FORMULES_INTERDITES.test(b)) throw Object.assign(new Error('Le texte contient une formulation interdite par les règles de ton.'), { status: 422 });
    fields.body = b.slice(0, 6000);
  }
  if (mode && ['preuve', 'maintenance', 'modele', 'claude'].includes(mode) && ['pret', 'a_verifier', 'valide'].includes(item.statut)) {
    // Régénération dans un autre mode : preuve, maintenance, modèle du menu, ou Claude libre
    // (encadré : présentation et proposition viennent du code, texte vérifié, ~0,003 € l'appel).
    const lead = (await db.pool.query('SELECT * FROM leads WHERE id = $1', [item.lead_id])).rows[0] || {};
    const row = await rowForLead(db, lead);
    const campaign = await getCampaign(db, campaignId);
    let email;
    if (mode === 'claude') {
      const d = await coldEmail.draftColdEmail({ row, lead }, {});
      email = { ok: true, mode: 'claude', subject: d.subject, body: d.body, detail: null };
    } else {
      email = generer({ ...campaign, mode }, row, lead, await templateFor(db, { ...campaign, mode }), item.variante);
    }
    if (!email.ok) throw Object.assign(new Error(email.raison || 'génération impossible dans ce mode'), { status: 422 });
    Object.assign(fields, { mode: email.mode, subject: email.subject, body: email.body, preuve_signal: email.detail ? email.detail.signal : null, preuve_brut: email.detail ? email.detail.brut : null, question_a: email.question_a || null });
    if (item.statut === 'valide') fields.statut = 'pret'; // un texte régénéré se relit avant d'être validé
  }
  if (statut) {
    if (!TRANSITIONS[statut] || !TRANSITIONS[statut].includes(item.statut)) throw Object.assign(new Error(`Passage ${item.statut} → ${statut} non permis`), { status: 409 });
    fields.statut = statut;
    if (raison !== undefined) fields.raison = String(raison || '').slice(0, 300) || null;
    if (statut === 'valide' && !item.body) throw Object.assign(new Error('Aucun email à valider sur cette ligne'), { status: 422 });
    // Blocages associés aux marquages manuels.
    if (statut === 'oppose' && item.to_email) await optout.addOptout(db, item.to_email, 'opposition');
    if (statut === 'oppose' && item.lead_id) {
      await refus.enregistrer(db, item.lead_id, { canal: 'tout', entreprise: entreprise === true, motif: raison || null, source: 'campagne' }).catch((e) => console.error('[Campagnes] refus :', e.message));
    }
    if (statut === 'rebond' && item.to_email) await optout.addOptout(db, item.to_email, 'rebond');
    if (['repondu', 'rebond', 'oppose'].includes(statut) && item.scheduled_email_id) {
      await scheduledEmailModel.cancelScheduledEmail(db, item.scheduled_email_id).catch(() => {});
    }
    if (['repondu', 'oppose'].includes(statut) && item.lead_id) {
      // Une réponse ou une opposition ferme toute relance prévue sur la fiche.
      await db.pool.query(`UPDATE interactions SET followup_done = TRUE WHERE contact_type = 'lead' AND contact_id = $1 AND followup_done = FALSE AND next_followup_date IS NOT NULL`, [item.lead_id]).catch(() => {});
      await db.pool.query(
        `INSERT INTO interactions (contact_type, contact_id, type, reached, date, notes, followup_done)
         VALUES ('lead', $1, 'email', 'joint', NOW(), $2, TRUE)`,
        [item.lead_id, statut === 'repondu' ? `Réponse reçue à l'email de campagne « ${item.subject || ''} » (marquée à la main).` : 'Opposition à la prospection reçue : adresse bloquée définitivement.']
      ).catch(() => {});
      if (statut === 'repondu') await db.pool.query("UPDATE leads SET relation_status = 'en_discussion', updated_at = NOW() WHERE id = $1 AND relation_status IN ('nouveau', 'a_contacter', 'contacte')", [item.lead_id]).catch(() => {});
      if (statut === 'oppose') await db.pool.query("UPDATE leads SET relation_status = 'pas_business', updated_at = NOW() WHERE id = $1 AND relation_status NOT IN ('gagne', 'perdu')", [item.lead_id]).catch(() => {});
    }
  }
  const keys = Object.keys(fields);
  if (keys.length) {
    await db.pool.query(`UPDATE campaign_items SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = NOW() WHERE id = $${keys.length + 1}`, [...keys.map((k) => fields[k]), itemId]);
  }
  return (await db.pool.query('SELECT * FROM campaign_items WHERE id = $1', [itemId])).rows[0];
}

// « Réanalyser » depuis la ligne : même service que la fiche (mesures du jour, SIRENE, score), puis
// email régénéré dans le mode de la ligne et ligne reclassée (une « à vérifier : ancien crawl »
// devient « prêt » si les mesures fraîches confirment une preuve). deps : injection pour les tests.
async function reanalyzeItem(db, campaignId, itemId, deps = {}) {
  const item = (await db.pool.query('SELECT * FROM campaign_items WHERE id = $1 AND campaign_id = $2', [itemId, campaignId])).rows[0];
  if (!item) throw Object.assign(new Error('Ligne introuvable'), { status: 404 });
  if (!['pret', 'a_verifier', 'valide', 'exclu'].includes(item.statut)) throw Object.assign(new Error('Ligne déjà programmée ou envoyée'), { status: 409 });
  const campaign = await getCampaign(db, campaignId);
  const out = await reanalyse.reanalyzeLead(db, item.lead_id, deps);
  const lead = (await db.pool.query('SELECT * FROM leads WHERE id = $1', [item.lead_id])).rows[0];
  const row = await rowForLead(db, lead);
  // Toujours dans le mode de la campagne : une ligne tombée en « maintenance » faute de preuve sur
  // l'ancien crawl doit pouvoir retrouver sa preuve avec les mesures fraîches.
  const email = generer(campaign, row, lead, await templateFor(db, campaign), item.variante);
  const ctl = await controles(db, lead, campaignId, { ignoreSelf: item.id });
  const cls = classifyItem({ lead, row, controles: ctl, email });
  // Une ligne déjà validée dont le texte n'a pas changé reste validée ; s'il a changé, il faut la relire.
  if (item.statut === 'valide' && cls.statut === 'pret' && email.ok && email.body === item.body && email.subject === item.subject) cls.statut = 'valide';
  else if (item.statut === 'valide' && cls.statut === 'pret') cls.raison = 'texte changé par la réanalyse du site : à relire avant de valider';
  const detail = email.ok ? email.detail : null;
  await db.pool.query(
    `UPDATE campaign_items SET crawl_result_id = $2, to_email = COALESCE($3, to_email), statut = $4, raison = $5, mode = $6, subject = $7, body = $8,
       preuve_signal = $9, preuve_brut = $10, preuve_url = $11, preuve_date = $12, identite = $13, question_a = $14, updated_at = NOW() WHERE id = $1`,
    [item.id, lead.crawl_result_id || item.crawl_result_id, (lead.email || '').trim() || null, cls.statut, cls.raison, email.ok ? email.mode : null, email.ok ? email.subject : null, email.ok ? email.body : null,
     detail ? detail.signal : null, detail ? detail.brut : null, detail ? detail.url_controlee : null, detail && detail.analyse_le ? detail.analyse_le : null, detail ? detail.identite : null, email.question_a || null]
  );
  return { item: (await db.pool.query('SELECT * FROM campaign_items WHERE id = $1', [item.id])).rows[0], analyse: out };
}

// ─── Réanalyse de la campagne à la préparation ──────────────────────────────
// Chaque site est réanalysé (mesures du jour, SIREN lu sur le site), l'email régénéré et la ligne
// reclassée : l'email ne cite que ce qui est constaté ce jour-là. En arrière-plan, quelques sites à la
// fois ; la programmation attend la fin. Au moment d'envoyer, une analyse de plus de 7 jours renvoie la
// ligne en « à vérifier ».
const AGE_MAX_JOURS = 7;
const ageJours = (d) => (d ? (Date.now() - new Date(d).getTime()) / 86400000 : Infinity);

async function reanalyserCampagne(db, campaignId, { deps = {}, concurrence = 4 } = {}) {
  const c = await getCampaign(db, campaignId);
  if (c.reanalyse_statut === 'en_cours' && ageJours(c.updated_at) < 1 / 48) return { deja: true };
  const { rows: items } = await db.pool.query(
    `SELECT i.id FROM campaign_items i LEFT JOIN crawl_results r ON r.id = i.crawl_result_id
      WHERE i.campaign_id = $1 AND i.statut IN ('pret', 'a_verifier', 'valide') AND i.lead_id IS NOT NULL
        AND (r.analyse_le IS NULL OR r.analyse_le < NOW() - interval '12 hours'
             OR (r.panne_vue_le IS NOT NULL AND r.panne_confirmee IS NOT TRUE AND r.analyse_le < NOW() - interval '1 hour'))
      ORDER BY i.id`, [campaignId]);
  await db.pool.query("UPDATE campaigns SET reanalyse_statut = 'en_cours', reanalyse_total = $2, reanalyse_faits = 0, updated_at = NOW() WHERE id = $1", [campaignId, items.length]);
  let i = 0, erreurs = 0;
  await Promise.all(Array.from({ length: Math.min(concurrence, items.length) }, async () => {
    while (i < items.length) {
      const it = items[i++];
      try { await reanalyzeItem(db, campaignId, it.id, deps); }
      catch (e) {
        erreurs++;
        await db.pool.query("UPDATE campaign_items SET statut = CASE WHEN statut IN ('pret', 'valide') THEN 'a_verifier' ELSE statut END, raison = $2, updated_at = NOW() WHERE id = $1",
          [it.id, `réanalyse du site impossible (${String(e.message).slice(0, 120)}) : vérifier le site avant d'envoyer`]).catch(() => {});
      }
      await db.pool.query('UPDATE campaigns SET reanalyse_faits = reanalyse_faits + 1, updated_at = NOW() WHERE id = $1', [campaignId]);
    }
  }));
  await db.pool.query("UPDATE campaigns SET reanalyse_statut = 'termine', reanalyse_le = NOW(), updated_at = NOW() WHERE id = $1", [campaignId]);
  return { total: items.length, erreurs };
}

/** Lance la réanalyse sans l'attendre (appelée après l'ajout de prospects). */
function lancerReanalyse(db, campaignId, opts = {}) {
  reanalyserCampagne(db, campaignId, opts).catch(async (e) => {
    console.error('[Campagnes] réanalyse :', e.message);
    await db.pool.query("UPDATE campaigns SET reanalyse_statut = 'termine', updated_at = NOW() WHERE id = $1", [campaignId]).catch(() => {});
  });
}

// ─── Reprise : exclus sans adresse, échecs, arrêts ──────────────────────────
// Reprend une ligne qui n'a pas pu partir, sans relancer le crawl : adresse saisie ici (ou ajoutée
// sur la fiche entre-temps), contrôles rejoués, email régénéré seulement s'il manque, ligne
// reclassée. Une ligne déjà relue avant son échec ou son arrêt qui revient « prêt » est remise en
// « validé » : elle part au prochain « Programmer ». Désinscrit, opposition, 90 jours : toujours bloquants.
const REPRENABLES = ['exclu', 'echec', 'arrete'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function reprendreItem(db, campaignId, itemId, { to_email } = {}) {
  const item = (await db.pool.query('SELECT * FROM campaign_items WHERE id = $1 AND campaign_id = $2', [itemId, campaignId])).rows[0];
  if (!item) throw Object.assign(new Error('Ligne introuvable'), { status: 404 });
  if (!REPRENABLES.includes(item.statut)) throw Object.assign(new Error('Seules les lignes exclues, en échec ou arrêtées se reprennent'), { status: 409 });
  const campaign = await getCampaign(db, campaignId);
  if (!['brouillon', 'en_cours', 'pause'].includes(campaign.statut)) throw Object.assign(new Error('Campagne arrêtée ou terminée'), { status: 409 });
  let lead = (await db.pool.query('SELECT * FROM leads WHERE id = $1', [item.lead_id])).rows[0];
  if (!lead) throw Object.assign(new Error('Fiche supprimée'), { status: 404 });
  const saisie = String(to_email || '').trim().toLowerCase();
  if (saisie) {
    if (!EMAIL_RE.test(saisie)) throw Object.assign(new Error('Adresse email invalide'), { status: 422 });
    await db.pool.query('UPDATE leads SET email = $2, updated_at = NOW() WHERE id = $1', [lead.id, saisie]);
    lead = { ...lead, email: saisie };
  }
  const row = await rowForLead(db, lead);
  const regenere = !item.body;
  const email = regenere ? generer(campaign, row, lead, await templateFor(db, campaign), item.variante)
    : { ok: true, mode: item.mode || campaign.mode, subject: item.subject, body: item.body, detail: null };
  const ctl = await controles(db, lead, campaignId, { ignoreSelf: item.id });
  const cls = classifyItem({ lead, row, controles: ctl, email });
  const dejaRelu = item.statut !== 'exclu';
  const statut = cls.statut === 'pret' && dejaRelu ? 'valide' : cls.statut;
  const detail = regenere && email.ok ? email.detail : null;
  const champs = regenere
    ? `, mode = $5, subject = $6, body = $7, preuve_signal = $8, preuve_brut = $9, preuve_url = $10, preuve_date = $11, identite = $12, question_a = $13`
    : '';
  const params = [item.id, (lead.email || '').trim() || null, statut, statut === 'valide' ? null : cls.raison];
  if (regenere) params.push(email.ok ? email.mode : null, email.ok ? email.subject : null, email.ok ? email.body : null,
    detail ? detail.signal : null, detail ? detail.brut : null, detail ? detail.url_controlee : null, detail && detail.analyse_le ? detail.analyse_le : null, detail ? detail.identite : null, email.question_a || null);
  await db.pool.query(
    `UPDATE campaign_items SET to_email = $2, statut = $3, raison = $4, scheduled_email_id = NULL, scheduled_at = NULL, updated_at = NOW()${champs} WHERE id = $1`, params
  );
  return (await db.pool.query('SELECT * FROM campaign_items WHERE id = $1', [item.id])).rows[0];
}

// En lot. quoi = 'sans_email' : lignes exclues faute d'adresse dont la fiche a reçu une adresse
// depuis ; quoi = 'echecs' : lignes en échec ou arrêtées. Les autres exclusions ne sont pas touchées.
async function reprendreMany(db, campaignId, quoi) {
  const r = quoi === 'echecs'
    ? await db.pool.query("SELECT id FROM campaign_items WHERE campaign_id = $1 AND statut IN ('echec', 'arrete') ORDER BY id", [campaignId])
    : await db.pool.query(
      `SELECT i.id FROM campaign_items i JOIN leads l ON l.id = i.lead_id
       WHERE i.campaign_id = $1 AND i.statut = 'exclu' AND i.raison LIKE 'aucune adresse%' AND COALESCE(l.email, '') <> '' ORDER BY i.id`, [campaignId]);
  const out = { repris: 0, valide: 0, pret: 0, a_verifier: 0, exclu: 0, ignores: 0 };
  for (const { id } of r.rows) {
    try { const it = await reprendreItem(db, campaignId, id, {}); out.repris++; out[it.statut] = (out[it.statut] || 0) + 1; } catch { out.ignores++; }
  }
  return out;
}

async function validateMany(db, campaignId, itemIds, statut = 'valide') {
  let n = 0;
  for (const id of itemIds) {
    try { await updateItem(db, campaignId, id, { statut }); n++; } catch { /* transition non permise : ignorée */ }
  }
  return { modifies: n };
}

// ─── Programmation ─────────────────────────────────────────────────────────
async function signaturePour(db, campaign) {
  try {
    if (campaign && campaign.signature_id) {
      const r = await db.pool.query('SELECT content FROM email_signatures WHERE id = $1', [campaign.signature_id]);
      if (r.rows[0]) return r.rows[0].content || '';
    }
    const r = await db.pool.query('SELECT content FROM email_signatures ORDER BY is_default DESC, id ASC LIMIT 1');
    return (r.rows[0] && r.rows[0].content) || '';
  } catch { return ''; }
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function htmlDe(body, signature) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#374151;">`
    + `<div style="white-space:pre-wrap;">${esc(body)}</div>`
    + (signature ? `<div style="margin-top:18px;">${signature}</div>` : '')
    + '</div>';
}

/**
 * Programme les lignes VALIDÉES. En mode test, chaque email part vers les adresses de test
 * (objet préfixé [TEST]) et la ligne garde une trace « test », sans toucher au prospect.
 */
async function schedule(db, campaignId, { test = false, test_emails = '', debut = null } = {}) {
  const campaign = await getCampaign(db, campaignId);
  // Date de début choisie (« Commencer le ») : les créneaux partent de là ; sinon de maintenant.
  let depart = new Date();
  if (debut) {
    const d = new Date(debut);
    if (Number.isNaN(d.getTime())) throw Object.assign(new Error('Date de début invalide'), { status: 400 });
    if (d > depart) depart = new Date(d.getTime() - 2 * 60000); // planSlots ajoute 2 min de marge
  }
  if (['arretee', 'terminee'].includes(campaign.statut)) throw Object.assign(new Error('Campagne arrêtée : créez-en une nouvelle.'), { status: 409 });
  if (campaign.reanalyse_statut === 'en_cours') throw Object.assign(new Error(`Réanalyse des sites en cours (${campaign.reanalyse_faits || 0}/${campaign.reanalyse_total || 0}) : les emails se mettent à jour, programmez à la fin.`), { status: 409 });
  const tests = String(test_emails || campaign.test_emails || '').split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
  if (test && tests.length === 0) throw Object.assign(new Error('Mode test : indiquez au moins une adresse de test.'), { status: 400 });
  // Pannes confirmées en tête de file : un site en panne perd des ventes tout de suite.
  const { rows: items } = await db.pool.query("SELECT * FROM campaign_items WHERE campaign_id = $1 AND statut = 'valide' ORDER BY CASE WHEN preuve_signal IN ('erreur_serveur', 'accueil_404') THEN 0 ELSE 1 END, id", [campaignId]);
  if (!items.length) return { programmes: 0, ignores: [], premier: null, dernier: null };
  const signature = await signaturePour(db, campaign);
  const slots = planSlots(items.length * (test ? tests.length : 1), campaign, depart);
  let k = 0; let programmes = 0; const ignores = [];
  for (const item of items) {
    // Recontrôle au moment de programmer (la préparation peut dater).
    const lead = (await db.pool.query('SELECT * FROM leads WHERE id = $1', [item.lead_id])).rows[0];
    if (!lead) { ignores.push({ id: item.id, raison: 'fiche supprimée' }); continue; }
    // Analyse du site trop ancienne : l'email pourrait citer un défaut corrigé depuis.
    if (!test && item.crawl_result_id) {
      const an = (await db.pool.query('SELECT analyse_le FROM crawl_results WHERE id = $1', [item.crawl_result_id])).rows[0];
      if (ageJours(an && an.analyse_le) > AGE_MAX_JOURS) {
        const raison = `analyse du site de plus de ${AGE_MAX_JOURS} jours : réanalyser puis relire avant d'envoyer`;
        await db.pool.query("UPDATE campaign_items SET statut = 'a_verifier', raison = $2, updated_at = NOW() WHERE id = $1", [item.id, raison]);
        ignores.push({ id: item.id, raison }); continue;
      }
    }
    const ctl = await controles(db, lead, campaignId, { ignoreSelf: item.id });
    if (!test && (ctl.optout || (ctl.dejaSollicite != null && ctl.dejaSollicite < 90) || ctl.autreCampagne)) {
      const raison = ctl.optout ? 'désinscrit ou opposition' : ctl.autreCampagne ? 'déjà dans une autre campagne active' : `déjà sollicité il y a ${ctl.dejaSollicite} jours`;
      await db.pool.query("UPDATE campaign_items SET statut = 'exclu', raison = $2, updated_at = NOW() WHERE id = $1", [item.id, raison]);
      ignores.push({ id: item.id, raison }); continue;
    }
    const destinataires = test ? tests : [item.to_email];
    let firstScheduled = null; let firstAt = null;
    for (const to of destinataires) {
      const at = slots[k++];
      const se = await scheduledEmailModel.createScheduledEmail(db, {
        to_email: to, to_name: test ? 'Test' : (lead.name || null),
        subject: test ? `[TEST ${item.to_email || item.domain}] ${item.subject}` : item.subject,
        body_html: htmlDe(item.body, signature), body_text: item.body,
        bcc_email: test ? null : ((campaign.bcc || '').trim() || null),
        scheduled_at: at, email_type: 'prospect', related_type: test ? null : 'lead', related_id: test ? null : item.lead_id,
        notes: `campagne #${campaignId}${test ? ' (test)' : ''}`, from_account: campaign.from_account
      });
      await db.pool.query('UPDATE scheduled_emails SET campaign_id = $1, campaign_item_id = $2 WHERE id = $3', [campaignId, item.id, se.id]);
      if (!firstScheduled) { firstScheduled = se.id; firstAt = at; }
    }
    await db.pool.query("UPDATE campaign_items SET statut = 'programme', scheduled_email_id = $2, scheduled_at = $3, raison = $4, updated_at = NOW() WHERE id = $1",
      [item.id, firstScheduled, firstAt, test ? `test vers ${tests.join(', ')}` : null]);
    programmes++;
  }
  await db.pool.query("UPDATE campaigns SET statut = 'en_cours', test_mode = $2, test_emails = $3, started_at = COALESCE(started_at, NOW()), echecs_consecutifs = 0, message = NULL, updated_at = NOW() WHERE id = $1", [campaignId, !!test, tests.join(', ') || null]);
  return { programmes, ignores, premier: slots[0] || null, dernier: slots[Math.max(0, k - 1)] || null };
}

async function pause(db, campaignId, message = 'Mise en pause à la main') {
  await db.pool.query("UPDATE campaigns SET statut = 'pause', message = $2, updated_at = NOW() WHERE id = $1 AND statut = 'en_cours'", [campaignId, message]);
  return getCampaign(db, campaignId);
}
async function resume(db, campaignId) {
  await db.pool.query("UPDATE campaigns SET statut = 'en_cours', message = NULL, echecs_consecutifs = 0, updated_at = NOW() WHERE id = $1 AND statut = 'pause'", [campaignId]);
  return getCampaign(db, campaignId);
}
// Arrêt immédiat : tout ce qui n'est pas parti est annulé, définitivement pour cette campagne.
async function stop(db, campaignId) {
  const r = await db.pool.query("UPDATE scheduled_emails SET status = 'cancelled', error_message = 'campagne arrêtée', updated_at = NOW() WHERE campaign_id = $1 AND status = 'pending' RETURNING id", [campaignId]);
  await db.pool.query("UPDATE campaign_items SET statut = 'arrete', updated_at = NOW() WHERE campaign_id = $1 AND statut = 'programme'", [campaignId]);
  await db.pool.query("UPDATE campaigns SET statut = 'arretee', stopped_at = NOW(), message = $2, updated_at = NOW() WHERE id = $1", [campaignId, `Arrêtée : ${r.rowCount} envoi(s) annulé(s)`]);
  return { annules: r.rowCount, campaign: await getCampaign(db, campaignId) };
}

async function removeCampaign(db, campaignId) {
  const c = await getCampaign(db, campaignId);
  if (c.statut !== 'brouillon') throw Object.assign(new Error('Seule une campagne en brouillon peut être supprimée ; arrêtez-la sinon.'), { status: 409 });
  await db.pool.query('DELETE FROM campaigns WHERE id = $1', [campaignId]);
  return { supprimee: true };
}

// ─── Hooks du worker d'envois programmés ───────────────────────────────────
/**
 * Avant chaque envoi d'un email de campagne. Renvoie { action: 'send' | 'skip' | 'cancel', raison }.
 * - pause -> skip (l'email reste en attente) ; arrêtée -> cancel ;
 * - exclusions revérifiées : désinscrit, réponse / rebond / opposition marqués, fiche fermée.
 */
async function beforeSend(db, email) {
  if (!email.campaign_id) return { action: 'send' };
  const c = (await db.pool.query('SELECT * FROM campaigns WHERE id = $1', [email.campaign_id])).rows[0];
  if (!c) return { action: 'cancel', raison: 'campagne supprimée' };
  if (c.statut === 'pause') return { action: 'skip', raison: 'campagne en pause' };
  if (c.statut !== 'en_cours') return { action: 'cancel', raison: `campagne ${c.statut}` };
  const item = email.campaign_item_id ? (await db.pool.query('SELECT * FROM campaign_items WHERE id = $1', [email.campaign_item_id])).rows[0] : null;
  if (item && item.statut !== 'programme') return { action: 'cancel', raison: `ligne ${item.statut}` };
  if (!c.test_mode) {
    if (await optout.isOptedOut(db, email.to_email)) return { action: 'cancel', raison: 'destinataire désinscrit ou opposé' };
    if (item && item.crawl_result_id) {
      const an = (await db.pool.query('SELECT analyse_le FROM crawl_results WHERE id = $1', [item.crawl_result_id])).rows[0];
      if (ageJours(an && an.analyse_le) > AGE_MAX_JOURS) {
        const raison = `au moment de l'envoi, l'analyse du site avait plus de ${AGE_MAX_JOURS} jours : réanalyser puis relire`;
        await db.pool.query("UPDATE campaign_items SET statut = 'a_verifier', raison = $2, updated_at = NOW() WHERE id = $1", [item.id, raison]);
        return { action: 'cancel', raison };
      }
    }
    if (item && item.lead_id) {
      if (await refus.bloque(db, item.lead_id, 'email')) return { action: 'cancel', raison: 'refus de prospection enregistré sur la fiche' };
      const lead = (await db.pool.query('SELECT relation_status FROM leads WHERE id = $1', [item.lead_id])).rows[0];
      if (lead && ['gagne', 'perdu', 'pas_business', 'en_discussion'].includes(lead.relation_status)) return { action: 'cancel', raison: `fiche ${lead.relation_status} : le prospect a répondu ou est fermé` };
    }
  }
  return { action: 'send' };
}

async function afterSent(db, email) {
  if (!email.campaign_id) return;
  if (email.campaign_item_id) await db.pool.query("UPDATE campaign_items SET statut = 'envoye', sent_at = NOW(), updated_at = NOW() WHERE id = $1 AND statut = 'programme'", [email.campaign_item_id]);
  // Tâche de relance (si la campagne en demande une, ce qui est le cas par défaut) : un rappel dans le
  // Suivi à J+N jours OUVRÉS, jamais un envoi. relance_step NULL : hors cascade automatique ; fermée par
  // une réponse ou une opposition. Pas de doublon : une fiche qui a déjà une relance ouverte la garde.
  const c = (await db.pool.query('SELECT nom, relance_jours, relance_canal, test_mode FROM campaigns WHERE id = $1', [email.campaign_id])).rows[0];
  if (c && c.relance_jours && !c.test_mode && email.related_type === 'lead' && email.related_id) {
    const ouverte = (await db.pool.query(
      `SELECT 1 FROM interactions WHERE contact_type = 'lead' AND contact_id = $1 AND followup_done = FALSE AND next_followup_date IS NOT NULL LIMIT 1`, [email.related_id])).rows[0];
    // Pas de tâche sur un canal que le prospect a refusé (« ne plus appeler », refus total…).
    const refuse = await refus.bloque(db, email.related_id, c.relance_canal || RELANCE_DEFAUT.canal);
    if (!ouverte && !refuse) {
      const echeance = ajouterJoursOuvres(aujourdhuiParis(), c.relance_jours);
      await db.pool.query(
        `INSERT INTO interactions (contact_type, contact_id, type, date, notes, next_followup_date, next_followup_channel, followup_done)
         VALUES ('lead', $1, 'note', NOW(), $2, $3::date, $4, FALSE)`,
        [email.related_id, `Relance prévue par la campagne « ${c.nom || '#' + email.campaign_id} » (J+${c.relance_jours} jours ouvrés après l'envoi).`, echeance, c.relance_canal || RELANCE_DEFAUT.canal]
      ).catch((e) => console.error('[Campagnes] relance :', e.message));
    }
  }
  await db.pool.query('UPDATE campaigns SET echecs_consecutifs = 0, updated_at = NOW() WHERE id = $1', [email.campaign_id]);
  // Plus rien en attente : campagne terminée.
  const rest = await db.pool.query("SELECT COUNT(*)::int AS n FROM scheduled_emails WHERE campaign_id = $1 AND status = 'pending'", [email.campaign_id]);
  if (rest.rows[0].n === 0) await db.pool.query("UPDATE campaigns SET statut = 'terminee', updated_at = NOW() WHERE id = $1 AND statut = 'en_cours'", [email.campaign_id]);
}

async function afterFailed(db, email, erreur, definitif) {
  if (!email.campaign_id) return;
  // Adresse inexistante (550 5.1.1 « User unknown »…) : c'est un rebond, pas un problème
  // d'expéditeur. Ligne en « rebond », adresse bloquée comme un marquage à la main, et ça ne
  // compte pas dans les échecs consécutifs qui mettent la campagne en pause.
  if (definitif && smtpErrors.isRecipientUnknown(erreur)) {
    if (email.campaign_item_id) await db.pool.query("UPDATE campaign_items SET statut = 'rebond', raison = $2, updated_at = NOW() WHERE id = $1", [email.campaign_item_id, `Adresse inexistante (rebond) : ${String(erreur || '').slice(0, 250)}`]);
    if (email.to_email) await optout.addOptout(db, email.to_email, 'rebond').catch(() => {});
    return;
  }
  if (definitif && email.campaign_item_id) await db.pool.query("UPDATE campaign_items SET statut = 'echec', raison = $2, updated_at = NOW() WHERE id = $1", [email.campaign_item_id, String(erreur || '').slice(0, 300)]);
  const r = await db.pool.query('UPDATE campaigns SET echecs_consecutifs = echecs_consecutifs + 1, updated_at = NOW() WHERE id = $1 RETURNING echecs_consecutifs', [email.campaign_id]);
  if (r.rows[0] && r.rows[0].echecs_consecutifs >= ECHECS_PAUSE) {
    await pause(db, email.campaign_id, `Pause automatique : ${ECHECS_PAUSE} échecs d'envoi consécutifs (${String(erreur || '').slice(0, 120)}). Vérifiez le compte expéditeur avant de reprendre.`);
  }
}

async function afterCancelled(db, email, raison) {
  if (!email.campaign_id || !email.campaign_item_id) return;
  await db.pool.query("UPDATE campaign_items SET statut = CASE WHEN statut = 'programme' THEN 'arrete' ELSE statut END, raison = COALESCE(raison, $2), updated_at = NOW() WHERE id = $1", [email.campaign_item_id, raison]);
}

// ─── Compte expéditeur : connexion et réputation du domaine ─────────────────
async function checkSender(emailService, seoOutreach) {
  const dns = require('dns').promises;
  const out = { smtp: null, gmail: null, domaine: null, spf: null, dmarc: null, dkim: null, conseils: [] };
  try { const t = await emailService.testConnection(); out.smtp = { ok: true, host: t.config && t.config.host }; } catch (e) { out.smtp = { ok: false, erreur: e.message }; }
  out.gmail = { configure: !!(seoOutreach && seoOutreach.isGmailConfigured && seoOutreach.isGmailConfigured()) };
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER || '';
  const domaine = from.includes('@') ? from.split('@')[1].toLowerCase() : '';
  out.domaine = domaine || null;
  if (domaine) {
    const txt = async (name) => { try { return (await dns.resolveTxt(name)).map((a) => a.join('')); } catch { return []; } };
    const spf = (await txt(domaine)).find((t) => /^v=spf1/i.test(t));
    out.spf = spf ? { ok: true, valeur: spf } : { ok: false };
    const dmarc = (await txt(`_dmarc.${domaine}`)).find((t) => /^v=DMARC1/i.test(t));
    out.dmarc = dmarc ? { ok: true, valeur: dmarc } : { ok: false };
    const selector = process.env.EMAIL_DKIM_SELECTOR || '';
    if (selector) {
      const dkim = (await txt(`${selector}._domainkey.${domaine}`)).find((t) => /v=DKIM1|p=/i.test(t));
      out.dkim = dkim ? { ok: true, selecteur: selector } : { ok: false, selecteur: selector };
    } else out.dkim = { ok: null, note: 'sélecteur inconnu : renseignez EMAIL_DKIM_SELECTOR dans le .env pour le vérifier' };
    if (!spf) out.conseils.push("Aucun enregistrement SPF : vos emails risquent d'être classés en spam. À ajouter chez votre registrar.");
    if (!dmarc) out.conseils.push('Aucun enregistrement DMARC : ajoutez au moins « v=DMARC1; p=none » pour la réputation du domaine.');
    if (spf && /\+all/.test(spf)) out.conseils.push('SPF en « +all » : autorise tout le monde, à corriger.');
  } else out.conseils.push('EMAIL_FROM ou EMAIL_USER absent : impossible de vérifier le domaine expéditeur.');
  out.conseils.push('La cadence lente ne protège pas seule la délivrabilité : vérifiez les adresses, évitez les contacts génériques inactifs, surveillez les rebonds.');
  return out;
}

module.exports = {
  RELANCE_DEFAUT, CANAUX_RELANCE, AGE_MAX_JOURS, reanalyserCampagne, lancerReanalyse,
  listCampaigns, getCampaign, getCampaignFull, stats, setAbTest, createCampaign, updateCampaign, addLeads, addFromCrawl,
  updateItem, reanalyzeItem, reprendreItem, reprendreMany, validateMany, schedule, pause, resume, stop, removeCampaign, remplirModele, remplirPourFiche,
  beforeSend, afterSent, afterFailed, afterCancelled, checkSender, controles, generer, ECHECS_PAUSE
};
