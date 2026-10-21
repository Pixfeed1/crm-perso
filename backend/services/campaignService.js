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
const scheduledEmailModel = require('../models/scheduledEmailModel');
const optout = require('./optout');
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
  return { campaign, items, stats: await stats(db, id) };
}

// Statistiques prioritaires : réponses, rendez-vous, contrats. Les ouvertures en dernier.
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
  const ouvertures = (await db.pool.query(
    `SELECT COUNT(DISTINCT t.id)::int AS n FROM email_tracking t
     JOIN scheduled_emails s ON s.id IN (SELECT scheduled_email_id FROM campaign_items WHERE campaign_id = $1)
     WHERE t.to_email = s.to_email AND t.subject = s.subject AND COALESCE(t.opens, t.open_count, 0) > 0`, [id]
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
    ouvertures,
    note: 'Réponses, rebonds et oppositions différés ne sont pas détectés automatiquement : à marquer à la main sur la ligne.'
  };
}

// ─── Création ───────────────────────────────────────────────────────────────
const MODES = ['preuve', 'maintenance', 'modele'];
async function createCampaign(db, { nom, mode = 'preuve', from_account = 'pro', par_jour = 15, heure_debut = 9, heure_fin = 18, espacement_min = 20, jours_ouvres = true, template_id = null, signature_id = null, bcc = null, relance_jours = null, relance_canal = 'email' } = {}) {
  const n = String(nom || '').trim() || `Campagne du ${new Date().toLocaleDateString('fr-FR')}`;
  const m = MODES.includes(mode) ? mode : 'preuve';
  if (m === 'modele' && !template_id) throw Object.assign(new Error('Mode modèle : choisissez un modèle du menu.'), { status: 400 });
  const r = await db.pool.query(
    `INSERT INTO campaigns (nom, mode, from_account, par_jour, heure_debut, heure_fin, espacement_min, jours_ouvres, template_id, signature_id, bcc, relance_jours, relance_canal)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    [n, m, from_account === 'gmail' ? 'gmail' : 'pro', Math.max(1, Math.min(100, par_jour | 0 || 15)), heure_debut | 0, heure_fin | 0, Math.max(1, espacement_min | 0 || 20), !!jours_ouvres,
     template_id || null, signature_id || null, (bcc || '').trim() || null, relance_jours ? Math.max(1, relance_jours | 0) : null, ['email', 'appel', 'sms', 'autre'].includes(relance_canal) ? relance_canal : 'email']
  );
  return r.rows[0];
}

async function updateCampaign(db, id, fields) {
  const allowed = ['nom', 'mode', 'from_account', 'par_jour', 'heure_debut', 'heure_fin', 'espacement_min', 'jours_ouvres', 'test_mode', 'test_emails', 'template_id', 'signature_id', 'bcc', 'relance_jours', 'relance_canal'];
  if (fields && fields.relance_jours === '' ) fields.relance_jours = null;
  const keys = Object.keys(fields || {}).filter((k) => allowed.includes(k));
  if (!keys.length) return getCampaign(db, id);
  const set = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  await db.pool.query(`UPDATE campaigns SET ${set}, updated_at = NOW() WHERE id = $${keys.length + 1}`, [...keys.map((k) => fields[k]), id]);
  return getCampaign(db, id);
}

// ─── Contrôles d'exclusion (préparation ET envoi) ───────────────────────────
async function controles(db, lead, campaignId, { ignoreSelf = null } = {}) {
  const email = String(lead.email || '').trim();
  const out = { optout: false, dejaSollicite: null, autreCampagne: false, dejaEnvoyeCampagne: false };
  if (email) out.optout = await optout.isOptedOut(db, email);
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
// {plateforme}, {constat} (la preuve retenue, sinon vide), {expediteur}, {entreprise}.
function remplirModele(texte, row, lead) {
  const r = row || {};
  const salut = proof.salutation(r, lead).replace(/,$/, ''); // « Bonjour Franck Savary » ou « Bonjour »
  const site = (r.domain || lead.company || '').replace(/^www\./, '');
  const plateforme = (r.platform && r.platform !== 'Inconnu') ? r.platform : '';
  const d = row ? proof.buildProofEmail(row, lead) : { ok: false };
  const constat = d.ok ? proof.CATALOGUE[d.preuve](row).preuve : '';
  return String(texte || '')
    .replace(/\{prenom\}/g, salut).replace(/\{site\}/g, site).replace(/\{plateforme\}/g, plateforme)
    .replace(/\{constat\}/g, constat)
    .replace(/\{expediteur\}/g, (process.env.OUTREACH_SENDER_NAME || '').trim())
    .replace(/\{entreprise\}/g, (process.env.OUTREACH_SENDER_COMPANY || 'PixFeed').trim())
    .replace(/[ \t]+\n/g, '\n');
}

function generer(campaign, row, lead, template = null) {
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
    const email = generer(campaign, row, lead, template);
    const cls = classifyItem({ lead, row, controles: ctl, email });
    const detail = email.ok ? email.detail : null;
    await db.pool.query(
      `INSERT INTO campaign_items (campaign_id, lead_id, crawl_result_id, domain, to_email, statut, raison, mode, subject, body, preuve_signal, preuve_brut, preuve_url, preuve_date, identite)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [campaignId, lead.id, lead.crawl_result_id || null, normalizeDomain(lead.website || lead.company) || null, (lead.email || '').trim() || null,
       cls.statut, cls.raison, email.ok ? email.mode : null, email.ok ? email.subject : null, email.ok ? email.body : null,
       detail ? detail.signal : null, detail ? detail.brut : null, detail ? detail.url_controlee : null, detail && detail.analyse_le ? detail.analyse_le : null, detail ? detail.identite : null]
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

async function updateItem(db, campaignId, itemId, { subject, body, statut, raison, mode } = {}) {
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
      email = generer({ ...campaign, mode }, row, lead, await templateFor(db, { ...campaign, mode }));
    }
    if (!email.ok) throw Object.assign(new Error(email.raison || 'génération impossible dans ce mode'), { status: 422 });
    Object.assign(fields, { mode: email.mode, subject: email.subject, body: email.body, preuve_signal: email.detail ? email.detail.signal : null, preuve_brut: email.detail ? email.detail.brut : null });
    if (item.statut === 'valide') fields.statut = 'pret'; // un texte régénéré se relit avant d'être validé
  }
  if (statut) {
    if (!TRANSITIONS[statut] || !TRANSITIONS[statut].includes(item.statut)) throw Object.assign(new Error(`Passage ${item.statut} → ${statut} non permis`), { status: 409 });
    fields.statut = statut;
    if (raison !== undefined) fields.raison = String(raison || '').slice(0, 300) || null;
    if (statut === 'valide' && !item.body) throw Object.assign(new Error('Aucun email à valider sur cette ligne'), { status: 422 });
    // Blocages associés aux marquages manuels.
    if (statut === 'oppose' && item.to_email) await optout.addOptout(db, item.to_email, 'opposition');
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
  const email = generer(campaign, row, lead, await templateFor(db, campaign));
  const ctl = await controles(db, lead, campaignId, { ignoreSelf: item.id });
  const cls = classifyItem({ lead, row, controles: ctl, email });
  const detail = email.ok ? email.detail : null;
  await db.pool.query(
    `UPDATE campaign_items SET crawl_result_id = $2, to_email = COALESCE($3, to_email), statut = $4, raison = $5, mode = $6, subject = $7, body = $8,
       preuve_signal = $9, preuve_brut = $10, preuve_url = $11, preuve_date = $12, identite = $13, updated_at = NOW() WHERE id = $1`,
    [item.id, lead.crawl_result_id || item.crawl_result_id, (lead.email || '').trim() || null, cls.statut, cls.raison, email.ok ? email.mode : null, email.ok ? email.subject : null, email.ok ? email.body : null,
     detail ? detail.signal : null, detail ? detail.brut : null, detail ? detail.url_controlee : null, detail && detail.analyse_le ? detail.analyse_le : null, detail ? detail.identite : null]
  );
  return { item: (await db.pool.query('SELECT * FROM campaign_items WHERE id = $1', [item.id])).rows[0], analyse: out };
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
  const tests = String(test_emails || campaign.test_emails || '').split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
  if (test && tests.length === 0) throw Object.assign(new Error('Mode test : indiquez au moins une adresse de test.'), { status: 400 });
  const { rows: items } = await db.pool.query("SELECT * FROM campaign_items WHERE campaign_id = $1 AND statut = 'valide' ORDER BY id", [campaignId]);
  if (!items.length) return { programmes: 0, ignores: [], premier: null, dernier: null };
  const signature = await signaturePour(db, campaign);
  const slots = planSlots(items.length * (test ? tests.length : 1), campaign, depart);
  let k = 0; let programmes = 0; const ignores = [];
  for (const item of items) {
    // Recontrôle au moment de programmer (la préparation peut dater).
    const lead = (await db.pool.query('SELECT * FROM leads WHERE id = $1', [item.lead_id])).rows[0];
    if (!lead) { ignores.push({ id: item.id, raison: 'fiche supprimée' }); continue; }
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
    if (item && item.lead_id) {
      const lead = (await db.pool.query('SELECT relation_status FROM leads WHERE id = $1', [item.lead_id])).rows[0];
      if (lead && ['gagne', 'perdu', 'pas_business', 'en_discussion'].includes(lead.relation_status)) return { action: 'cancel', raison: `fiche ${lead.relation_status} : le prospect a répondu ou est fermé` };
    }
  }
  return { action: 'send' };
}

async function afterSent(db, email) {
  if (!email.campaign_id) return;
  if (email.campaign_item_id) await db.pool.query("UPDATE campaign_items SET statut = 'envoye', sent_at = NOW(), updated_at = NOW() WHERE id = $1 AND statut = 'programme'", [email.campaign_item_id]);
  // Relance : seulement si la campagne le demande (désactivé par défaut). Relance MANUELLE
  // (relance_step NULL : hors cascade automatique), visible dans le Suivi, fermée par une réponse.
  const c = (await db.pool.query('SELECT relance_jours, relance_canal, test_mode FROM campaigns WHERE id = $1', [email.campaign_id])).rows[0];
  if (c && c.relance_jours && !c.test_mode && email.related_type === 'lead' && email.related_id) {
    await db.pool.query(
      `INSERT INTO interactions (contact_type, contact_id, type, date, notes, next_followup_date, next_followup_channel, followup_done)
       VALUES ('lead', $1, 'note', NOW(), $2, CURRENT_DATE + $3::int, $4, FALSE)`,
      [email.related_id, `Relance prévue par la campagne #${email.campaign_id} (J+${c.relance_jours}).`, c.relance_jours, c.relance_canal || 'email']
    ).catch((e) => console.error('[Campagnes] relance :', e.message));
  }
  await db.pool.query('UPDATE campaigns SET echecs_consecutifs = 0, updated_at = NOW() WHERE id = $1', [email.campaign_id]);
  // Plus rien en attente : campagne terminée.
  const rest = await db.pool.query("SELECT COUNT(*)::int AS n FROM scheduled_emails WHERE campaign_id = $1 AND status = 'pending'", [email.campaign_id]);
  if (rest.rows[0].n === 0) await db.pool.query("UPDATE campaigns SET statut = 'terminee', updated_at = NOW() WHERE id = $1 AND statut = 'en_cours'", [email.campaign_id]);
}

async function afterFailed(db, email, erreur, definitif) {
  if (!email.campaign_id) return;
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
  listCampaigns, getCampaign, getCampaignFull, stats, createCampaign, updateCampaign, addLeads, addFromCrawl,
  updateItem, reanalyzeItem, validateMany, schedule, pause, resume, stop, removeCampaign, remplirModele,
  beforeSend, afterSent, afterFailed, afterCancelled, checkSender, controles, generer, ECHECS_PAUSE
};
