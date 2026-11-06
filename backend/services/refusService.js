// backend/services/refusService.js
//
// Refus de prospection par canal (lot 4) :
//   - « email » : ne plus écrire ;
//   - « appel » : ne plus appeler (couvre aussi les SMS : même numéro) ;
//   - « tout »  : refus de toute sollicitation (email, téléphone, LinkedIn, tout).
// Un refus vise une fiche, et en option toute l'entreprise (son domaine) : les autres fiches du
// même domaine, les adresses @domaine et les fiches créées plus tard pour ce domaine sont bloquées.
// Les webmails (gmail.com, orange.fr…) ne sont jamais bloqués en entier : seule l'adresse l'est.
//
// Ces refus sont vérifiés à l'envoi (optout.isOptedOut), à la préparation des campagnes, à la
// création des relances (campagne, rattrapage, saisie à la main) et affichés sur la fiche et le Suivi.
// Retirer un refus n'est possible qu'à la main, avec une raison, et reste tracé (retire_le).

const optout = require('./optout');

const CANAUX = ['email', 'appel', 'tout'];
const LIBELLES = { email: 'ne plus écrire', appel: 'ne plus appeler', tout: 'refus de toute sollicitation' };

const WEBMAIL = /^(gmail|googlemail|orange|wanadoo|free|hotmail|outlook|live|msn|yahoo|laposte|sfr|neuf|bbox|icloud|me|protonmail|proton|gmx|aol|numericable|club-internet|aliceadsl)\./;
const estWebmail = (d) => WEBMAIL.test(String(d || ''));

function domaine(x) {
  const s = String(x || '').trim().toLowerCase();
  const d = (s.includes('@') && !s.includes('/') ? s.split('@').pop() : s)
    .replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#:]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(d) ? d : null;
}
const domaineEntreprise = (x) => { const d = domaine(x); return d && !estWebmail(d) ? d : null; };

// Canal d'une relance ou d'un envoi -> canal de refus qui le bloque.
function familles(canal) {
  if (canal === 'email') return ['email', 'tout'];
  if (canal === 'appel' || canal === 'sms') return ['appel', 'tout'];
  return ['tout']; // linkedin, autre
}

async function chargerLead(db, leadOrId) {
  if (leadOrId && typeof leadOrId === 'object' && leadOrId.id) return leadOrId;
  return (await db.pool.query('SELECT * FROM leads WHERE id = $1', [leadOrId])).rows[0] || null;
}

// Adresses et domaines d'entreprise connus d'une fiche (fiche, contacts, site analysé).
async function coordonnees(db, lead) {
  const adresses = new Set();
  const domaines = new Set();
  const add = (e) => { const x = String(e || '').trim().toLowerCase(); if (x.includes('@')) { adresses.add(x); const d = domaineEntreprise(x); if (d) domaines.add(d); } };
  add(lead.email);
  for (const v of [lead.website, lead.company]) { const d = domaineEntreprise(v); if (d) domaines.add(d); }
  const contacts = await db.pool.query('SELECT email FROM contacts WHERE lead_id = $1', [lead.id]).catch(() => ({ rows: [] }));
  contacts.rows.forEach((c) => add(c.email));
  if (lead.crawl_result_id) {
    const cr = (await db.pool.query('SELECT domain FROM crawl_results WHERE id = $1', [lead.crawl_result_id]).catch(() => ({ rows: [] }))).rows[0];
    const d = cr && domaineEntreprise(cr.domain);
    if (d) domaines.add(d);
  }
  return { adresses: [...adresses], domaines: [...domaines] };
}

// Refus actifs qui visent la fiche (par la fiche ou par son domaine).
async function refusActifs(db, lead, coords = null) {
  const c = coords || await coordonnees(db, lead);
  const { rows } = await db.pool.query(
    `SELECT * FROM prospect_refus WHERE retire_le IS NULL AND (lead_id = $1 OR domaine = ANY($2::text[])) ORDER BY created_at`,
    [lead.id, c.domaines]
  ).catch(() => ({ rows: [] }));
  return rows;
}

// État affiché sur la fiche : par canal, le refus qui s'applique (le plus ancien), plus les
// adresses désinscrites par le lien (ou bloquées après un rebond).
async function etat(db, leadOrId) {
  const lead = await chargerLead(db, leadOrId);
  if (!lead) return null;
  const coords = await coordonnees(db, lead);
  const lignes = await refusActifs(db, lead, coords);
  const pour = (canal) => lignes.find((r) => familles(canal).includes(r.canal)) || null;
  const desinscrites = coords.adresses.length
    ? (await db.pool.query('SELECT email, source, created_at FROM email_optout WHERE email = ANY($1::text[])', [coords.adresses]).catch(() => ({ rows: [] }))).rows
    : [];
  return {
    email: pour('email'),
    appel: pour('appel'),
    tout: lignes.find((r) => r.canal === 'tout') || null,
    lignes: lignes.map((r) => ({ ...r, libelle: LIBELLES[r.canal], entreprise: !!r.domaine })),
    desinscrites,
    domaines: coords.domaines,
    adresses: coords.adresses
  };
}

// Vrai si la fiche refuse ce canal (email, appel, sms, linkedin, autre).
async function bloque(db, leadOrId, canal) {
  const lead = await chargerLead(db, leadOrId);
  if (!lead) return false;
  const lignes = await refusActifs(db, lead);
  return lignes.some((r) => familles(canal).includes(r.canal));
}

// Adresse dont le domaine d'entreprise est bloqué pour l'email (utilisé par optout.isOptedOut).
async function domaineBloquePourEmail(db, email) {
  const d = domaineEntreprise(email);
  if (!d) return false;
  const r = await db.pool.query("SELECT 1 FROM prospect_refus WHERE retire_le IS NULL AND domaine = $1 AND canal IN ('email', 'tout') LIMIT 1", [d]).catch(() => ({ rows: [] }));
  return r.rows.length > 0;
}

// Ferme les relances prévues que le refus rend impossibles.
async function fermerRelances(db, leadId, canal) {
  const filtre = canal === 'tout' ? '' : canal === 'appel' ? "AND COALESCE(next_followup_channel, '') IN ('appel', 'sms')" : "AND next_followup_channel = 'email'";
  const r = await db.pool.query(
    `UPDATE interactions SET followup_done = TRUE WHERE contact_type = 'lead' AND contact_id = $1 AND followup_done = FALSE AND next_followup_date IS NOT NULL ${filtre}`, [leadId]
  ).catch(() => ({ rowCount: 0 }));
  return r.rowCount || 0;
}

// Fiches du même domaine d'entreprise (pour « toute l'entreprise »).
async function fichesDuDomaine(db, d) {
  const { rows } = await db.pool.query(
    `SELECT DISTINCT l.* FROM leads l LEFT JOIN crawl_results cr ON cr.id = l.crawl_result_id
      WHERE LOWER(l.email) LIKE '%@' || $1
         OR regexp_replace(regexp_replace(LOWER(COALESCE(l.website, '')), '^https?://', ''), '^www\\.', '') ~ ('^' || replace($1, '.', '\\.') || '(/|$)')
         OR regexp_replace(regexp_replace(LOWER(COALESCE(l.company, '')), '^https?://', ''), '^www\\.', '') ~ ('^' || replace($1, '.', '\\.') || '(/|$)')
         OR regexp_replace(LOWER(COALESCE(cr.domain, '')), '^www\\.', '') = $1`, [d]
  ).catch(() => ({ rows: [] }));
  return rows;
}

// Enregistre un refus. entreprise = bloquer tout le domaine (si la fiche en a un qui n'est pas un webmail).
async function enregistrer(db, leadId, { canal, entreprise = false, motif = null, source = 'fiche' } = {}) {
  if (!CANAUX.includes(canal)) { const e = new Error(`Canal de refus inconnu (${CANAUX.join(', ')})`); e.status = 400; throw e; }
  const lead = await chargerLead(db, leadId);
  if (!lead) { const e = new Error('Fiche introuvable'); e.status = 404; throw e; }
  const motifTxt = motif ? String(motif).slice(0, 300) : null;
  const coords = await coordonnees(db, lead);
  const avertissements = [];
  await db.pool.query('INSERT INTO prospect_refus (lead_id, canal, motif, source) VALUES ($1, $2, $3, $4)', [lead.id, canal, motifTxt, source]);
  let fiches = [lead];
  const domainesBloques = [];
  if (entreprise) {
    if (!coords.domaines.length) avertissements.push("Aucun domaine d'entreprise connu (adresse webmail, pas de site) : refus enregistré pour cette fiche seulement.");
    for (const d of coords.domaines) {
      await db.pool.query('INSERT INTO prospect_refus (domaine, lead_id, canal, motif, source) VALUES ($1, $2, $3, $4, $5)', [d, lead.id, canal, motifTxt, source]);
      domainesBloques.push(d);
      for (const f of await fichesDuDomaine(db, d)) if (!fiches.some((x) => x.id === f.id)) fiches.push(f);
    }
  }
  let relancesFermees = 0;
  const portee = entreprise && domainesBloques.length ? ` (toute l'entreprise : ${domainesBloques.join(', ')})` : '';
  for (const f of fiches) {
    if (canal !== 'appel') {
      // Ne plus écrire : toutes les adresses connues de la fiche passent dans la liste noire d'envoi.
      const c = f.id === lead.id ? coords : await coordonnees(db, f);
      for (const a of c.adresses) await optout.addOptout(db, a, 'refus');
    }
    relancesFermees += await fermerRelances(db, f.id, canal);
    if (canal === 'tout') {
      await db.pool.query("UPDATE leads SET relation_status = 'pas_business', updated_at = NOW() WHERE id = $1 AND COALESCE(relation_status, '') NOT IN ('gagne', 'perdu')", [f.id]).catch(() => {});
    }
    await db.pool.query(
      `INSERT INTO interactions (contact_type, contact_id, type, date, notes, followup_done) VALUES ('lead', $1, 'note', NOW(), $2, TRUE)`,
      [f.id, `Refus de prospection : ${LIBELLES[canal]}${portee}${f.id !== lead.id ? ` (saisi sur la fiche « ${lead.company || lead.name || '#' + lead.id} »)` : ''}.${motifTxt ? ` Motif : ${motifTxt}` : ''}`]
    ).catch(() => {});
  }
  return { ...(await etat(db, lead.id)), fiches_concernees: fiches.length, relances_fermees: relancesFermees, avertissements };
}

// Retire un refus saisi par erreur (ou levé à la demande du prospect). Tracé, jamais effacé.
// Les adresses mises en liste noire par ce refus en sortent, sauf si un autre refus email actif les
// couvre encore ; une désinscription par le lien ou un rebond n'est jamais levée ici.
async function retirer(db, refusId, { raison } = {}) {
  const raisonTxt = String(raison || '').trim();
  if (!raisonTxt) { const e = new Error('Indiquez pourquoi le refus est retiré'); e.status = 400; throw e; }
  const r = (await db.pool.query('UPDATE prospect_refus SET retire_le = NOW(), retire_motif = $2 WHERE id = $1 AND retire_le IS NULL RETURNING *', [refusId, raisonTxt.slice(0, 300)])).rows[0];
  if (!r) { const e = new Error('Refus introuvable ou déjà retiré'); e.status = 404; throw e; }
  // Le refus « toute l'entreprise » a deux lignes (fiche + domaine) créées ensemble : on retire les deux.
  await db.pool.query(
    `UPDATE prospect_refus SET retire_le = NOW(), retire_motif = $2
      WHERE retire_le IS NULL AND lead_id = $1 AND canal = $3 AND ABS(EXTRACT(EPOCH FROM created_at - $4::timestamptz)) < 5`,
    [r.lead_id, raisonTxt.slice(0, 300), r.canal, r.created_at]
  ).catch(() => {});
  if (r.lead_id && r.canal !== 'appel') {
    const lead = await chargerLead(db, r.lead_id);
    if (lead && !(await bloque(db, lead, 'email'))) {
      const c = await coordonnees(db, lead);
      if (c.adresses.length) await db.pool.query("DELETE FROM email_optout WHERE source = 'refus' AND email = ANY($1::text[])", [c.adresses]).catch(() => {});
    }
  }
  if (r.lead_id) {
    await db.pool.query(
      `INSERT INTO interactions (contact_type, contact_id, type, date, notes, followup_done) VALUES ('lead', $1, 'note', NOW(), $2, TRUE)`,
      [r.lead_id, `Refus de prospection retiré (${LIBELLES[r.canal]}${r.domaine ? `, ${r.domaine}` : ''}). Raison : ${raisonTxt}`]
    ).catch(() => {});
  }
  return r.lead_id ? etat(db, r.lead_id) : { retire: r.id };
}

module.exports = { CANAUX, LIBELLES, familles, domaine, domaineEntreprise, estWebmail, coordonnees, etat, bloque, domaineBloquePourEmail, enregistrer, retirer };
