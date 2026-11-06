// backend/services/affaireService.js
//
// Affaires (lot 5) : plusieurs par entreprise, rattachées à un prospect et/ou à un client.
// - type de besoin, montant ponctuel et montant mensuel ;
// - étape : Découverte → Devis envoyé → Négociation → Gagnée / Perdue / Reportée ;
// - prochaine action (date + canal) OBLIGATOIRE tant que l'affaire est ouverte. Elle est posée comme
//   une relance du Suivi (interactions.affaire_id), donc visible avec les autres relances ;
// - accord ferme ou incertain ; motif en liste si perdue ou reportée ; campagne d'origine ;
// - devis rattachables (quotes.affaire_id).
// Le motif « refus de toute sollicitation » enregistre un refus de prospection (lot 4).
// Le statut de relation de la fiche ne fait qu'avancer avec ses affaires, jamais reculer.

const refus = require('./refusService');

const TYPES = {
  maintenance: 'Maintenance', developpement: 'Développement', reprise: 'Reprise de projet', depannage: 'Dépannage', autre: 'Autre'
};
const ETAPES = {
  decouverte: 'Découverte', devis_envoye: 'Devis envoyé', negociation: 'Négociation', gagnee: 'Gagnée', perdue: 'Perdue', reportee: 'Reportée'
};
const OUVERTES = ['decouverte', 'devis_envoye', 'negociation'];
const MOTIFS = {
  pas_interesse: 'Pas intéressé',
  pas_de_besoin: 'Pas de besoin actuellement',
  maintenance_interne: 'Maintenance gérée en interne',
  prestataire_en_place: 'Prestataire déjà en place',
  budget_insuffisant: 'Budget insuffisant',
  projet_reporte: 'Projet reporté',
  recontacter_date: 'À recontacter à une date convenue',
  refus_total: 'Refus de toute sollicitation'
};
const CANAUX = ['appel', 'email', 'sms', 'linkedin', 'rdv', 'autre'];
const ACCORDS = ['ferme', 'incertain'];
const RANG = { nouveau: 0, a_contacter: 1, contacte: 2, en_discussion: 3, devis_envoye: 4, gagne: 5 };

const err = (status, message) => Object.assign(new Error(message), { status });
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')));
const jour = (v) => (v ? String(v).slice(0, 10) : null);

// Contact du Suivi qui porte la relance : le prospect s'il existe, sinon le client.
const porteur = (a) => (a.lead_id ? { type: 'lead', id: a.lead_id } : a.client_id ? { type: 'client', id: a.client_id } : null);

async function lire(db, id) {
  const a = (await db.pool.query('SELECT * FROM affaires WHERE id = $1', [id])).rows[0];
  if (!a) throw err(404, 'Affaire introuvable');
  return a;
}

// Liste d'une fiche prospect ou client (un client voit aussi les affaires de son ancien prospect).
async function lister(db, { lead_id = null, client_id = null } = {}) {
  let leadId = lead_id ? Number(lead_id) : null;
  if (client_id && !leadId) {
    const c = (await db.pool.query('SELECT lead_id FROM crm_clients WHERE id = $1', [client_id]).catch(() => ({ rows: [] }))).rows[0];
    leadId = c && c.lead_id ? c.lead_id : null;
  }
  const { rows } = await db.pool.query(
    `SELECT a.*, c.nom AS campagne_nom,
            i.followup_done AS action_faite, i.next_followup_date AS action_date_suivi
       FROM affaires a
       LEFT JOIN campaigns c ON c.id = a.campagne_id
       LEFT JOIN interactions i ON i.id = a.relance_interaction_id
      WHERE ($1::int IS NOT NULL AND a.lead_id = $1) OR ($2::int IS NOT NULL AND a.client_id = $2)
      ORDER BY (a.etape = ANY($3::text[])) DESC, a.prochaine_action_date ASC NULLS LAST, a.updated_at DESC`,
    [leadId, client_id ? Number(client_id) : null, OUVERTES]
  );
  const ids = rows.map((r) => r.id);
  const devis = ids.length
    ? (await db.pool.query('SELECT id, affaire_id, quote_number, title, status, total_ht, total_ttc, created_at FROM quotes WHERE affaire_id = ANY($1::int[]) ORDER BY created_at', [ids]).catch(() => ({ rows: [] }))).rows
    : [];
  return rows.map((a) => ({
    ...a,
    ouverte: OUVERTES.includes(a.etape),
    // La relance de l'affaire a été faite (ou fermée par un échange) : une nouvelle action est à poser.
    action_a_replanifier: OUVERTES.includes(a.etape) && (a.action_faite === true || !a.relance_interaction_id),
    devis: devis.filter((d) => d.affaire_id === a.id)
  }));
}

// Contrôles métier communs à la création et à la modification.
function valider(a) {
  if (!String(a.titre || '').trim()) throw err(400, "Donnez un intitulé à l'affaire (ex. « Maintenance mensuelle », « Outil de stock »)");
  if (!a.lead_id && !a.client_id) throw err(400, 'Une affaire est rattachée à un prospect ou à un client');
  if (!TYPES[a.type_besoin]) throw err(400, `Type de besoin inconnu (${Object.keys(TYPES).join(', ')})`);
  if (!ETAPES[a.etape]) throw err(400, `Étape inconnue (${Object.keys(ETAPES).join(', ')})`);
  if (a.accord && !ACCORDS.includes(a.accord)) throw err(400, 'Accord : ferme ou incertain');
  for (const k of ['montant_ponctuel', 'montant_mensuel']) if (a[k] !== null && (Number.isNaN(a[k]) || a[k] < 0)) throw err(400, `Montant invalide (${k === 'montant_ponctuel' ? 'ponctuel' : 'mensuel'})`);
  if (OUVERTES.includes(a.etape)) {
    if (!a.prochaine_action_date || !a.prochaine_action_canal) throw err(400, 'Une affaire en cours doit avoir une prochaine action : date et canal');
    if (!CANAUX.includes(a.prochaine_action_canal)) throw err(400, `Canal inconnu (${CANAUX.join(', ')})`);
  }
  if (['perdue', 'reportee'].includes(a.etape)) {
    if (!MOTIFS[a.motif]) throw err(400, `Indiquez le motif (${Object.values(MOTIFS).join(', ')})`);
  } else if (a.motif && !MOTIFS[a.motif]) throw err(400, 'Motif inconnu');
  if (a.motif === 'recontacter_date' && !a.recontacter_le) throw err(400, 'À recontacter : indiquez la date convenue');
  if (a.etape === 'reportee' && !a.recontacter_le) throw err(400, 'Affaire reportée : indiquez quand en reparler');
}

// Normalise les champs reçus de l'écran.
function champs(b, base = {}) {
  const pick = (k, f = (x) => x) => (b[k] !== undefined ? f(b[k]) : base[k]);
  const a = {
    lead_id: pick('lead_id', (x) => (x ? Number(x) : null)),
    client_id: pick('client_id', (x) => (x ? Number(x) : null)),
    titre: pick('titre', (x) => String(x || '').trim().slice(0, 200)),
    type_besoin: pick('type_besoin') || 'maintenance',
    montant_ponctuel: pick('montant_ponctuel', num),
    montant_mensuel: pick('montant_mensuel', num),
    etape: pick('etape') || 'decouverte',
    accord: pick('accord', (x) => x || null),
    motif: pick('motif', (x) => x || null),
    motif_detail: pick('motif_detail', (x) => (x ? String(x).slice(0, 500) : null)),
    recontacter_le: pick('recontacter_le', jour),
    prochaine_action_date: pick('prochaine_action_date', jour),
    prochaine_action_canal: pick('prochaine_action_canal', (x) => x || null),
    prochaine_action_note: pick('prochaine_action_note', (x) => (x ? String(x).slice(0, 300) : null)),
    campagne_id: pick('campagne_id', (x) => (x ? Number(x) : null))
  };
  if (a.etape === 'gagnee') a.accord = 'ferme';
  if (!OUVERTES.includes(a.etape)) { a.prochaine_action_date = null; a.prochaine_action_canal = null; a.prochaine_action_note = null; }
  if (OUVERTES.includes(a.etape) || a.etape === 'gagnee') { if (b.motif === undefined) a.motif = null; }
  return a;
}

// Relance du Suivi liée à l'affaire : créée, déplacée ou fermée selon l'étape.
async function synchroniserRelance(db, a) {
  const p = porteur(a);
  if (!p) return null;
  const lien = a.relance_interaction_id
    ? (await db.pool.query('SELECT * FROM interactions WHERE id = $1', [a.relance_interaction_id]).catch(() => ({ rows: [] }))).rows[0]
    : null;
  let date = null, canal = null, note = null;
  if (OUVERTES.includes(a.etape)) { date = a.prochaine_action_date; canal = a.prochaine_action_canal; note = a.prochaine_action_note; }
  else if (a.etape === 'reportee' || a.motif === 'recontacter_date') { date = a.recontacter_le; canal = 'appel'; note = `reprendre contact (${MOTIFS[a.motif] || 'reportée'})`; }
  if (!date) {
    if (lien && !lien.followup_done) await db.pool.query('UPDATE interactions SET followup_done = TRUE WHERE id = $1', [lien.id]);
    return null;
  }
  const canalSuivi = canal === 'rdv' ? 'autre' : canal;
  if (p.type === 'lead' && await refus.bloque(db, p.id, canalSuivi)) throw err(409, `Prochaine action par ${canal} impossible : refus de prospection enregistré sur la fiche`);
  const notes = `Affaire « ${a.titre} » (${ETAPES[a.etape]}) : ${note || 'prochaine action'}`;
  if (lien && !lien.followup_done) {
    await db.pool.query('UPDATE interactions SET next_followup_date = $2::date, next_followup_channel = $3, notes = $4 WHERE id = $1', [lien.id, date, canalSuivi, notes]);
    return lien.id;
  }
  const r = await db.pool.query(
    `INSERT INTO interactions (contact_type, contact_id, type, date, notes, next_followup_date, next_followup_channel, followup_done, affaire_id)
     VALUES ($1, $2, 'note', NOW(), $3, $4::date, $5, FALSE, $6) RETURNING id`, [p.type, p.id, notes, date, canalSuivi, a.id]);
  return r.rows[0].id;
}

// Le statut de relation de la fiche avance avec ses affaires (jamais de recul automatique).
async function avancerFiche(db, a) {
  if (!a.lead_id) return;
  const l = (await db.pool.query('SELECT relation_status FROM leads WHERE id = $1', [a.lead_id])).rows[0];
  if (!l) return;
  const actuel = l.relation_status || 'nouveau';
  if (actuel === 'pas_business' || actuel === 'gagne') return;
  const toutes = (await db.pool.query('SELECT etape FROM affaires WHERE lead_id = $1', [a.lead_id])).rows.map((r) => r.etape);
  let cible = null;
  if (toutes.includes('gagnee')) cible = 'gagne';
  else if (toutes.some((e) => e === 'devis_envoye' || e === 'negociation')) cible = 'devis_envoye';
  else if (toutes.includes('decouverte')) cible = 'en_discussion';
  if (!cible) return;
  if (actuel === 'perdu' || (RANG[cible] || 0) > (RANG[actuel] || 0)) {
    await db.pool.query('UPDATE leads SET relation_status = $2, updated_at = NOW() WHERE id = $1', [a.lead_id, cible]);
  }
}

async function apresEcriture(db, a, avant = null) {
  const relanceId = await synchroniserRelance(db, a);
  if (relanceId !== a.relance_interaction_id) await db.pool.query('UPDATE affaires SET relance_interaction_id = $2 WHERE id = $1', [a.id, relanceId]);
  await avancerFiche(db, a);
  if (a.motif === 'refus_total' && (!avant || avant.motif !== 'refus_total') && a.lead_id) {
    await refus.enregistrer(db, a.lead_id, { canal: 'tout', motif: `Affaire « ${a.titre} » : ${a.motif_detail || MOTIFS.refus_total}`, source: 'affaire' });
  }
  const p = porteur(a);
  if (p && avant && avant.etape !== a.etape) {
    await db.pool.query(
      `INSERT INTO interactions (contact_type, contact_id, type, date, notes, followup_done, affaire_id) VALUES ($1, $2, 'note', NOW(), $3, TRUE, $4)`,
      [p.type, p.id, `Affaire « ${a.titre} » : ${ETAPES[avant.etape]} → ${ETAPES[a.etape]}${a.motif ? ` (${MOTIFS[a.motif]})` : ''}.`, a.id]
    ).catch(() => {});
  }
  return (await lister(db, { lead_id: a.lead_id, client_id: a.client_id })).find((x) => x.id === a.id);
}

// Campagne d'origine par défaut : la dernière campagne partie vers la fiche.
async function campagneDuProspect(db, leadId) {
  if (!leadId) return null;
  const r = (await db.pool.query(
    `SELECT campaign_id FROM campaign_items WHERE lead_id = $1 AND statut IN ('envoye', 'repondu') ORDER BY sent_at DESC NULLS LAST LIMIT 1`, [leadId]
  ).catch(() => ({ rows: [] }))).rows[0];
  return r ? r.campaign_id : null;
}

async function creer(db, body = {}) {
  const a = champs(body);
  if (a.lead_id && !a.client_id) {
    const c = (await db.pool.query('SELECT id FROM crm_clients WHERE lead_id = $1 LIMIT 1', [a.lead_id]).catch(() => ({ rows: [] }))).rows[0];
    if (c) a.client_id = c.id;
  }
  if (a.client_id && !a.lead_id) {
    const c = (await db.pool.query('SELECT lead_id FROM crm_clients WHERE id = $1', [a.client_id]).catch(() => ({ rows: [] }))).rows[0];
    if (c && c.lead_id) a.lead_id = c.lead_id;
  }
  if (body.campagne_id === undefined) a.campagne_id = await campagneDuProspect(db, a.lead_id);
  valider(a);
  const cols = Object.keys(a);
  const r = await db.pool.query(
    `INSERT INTO affaires (${cols.join(', ')}, cloturee_le) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}, ${OUVERTES.includes(a.etape) ? 'NULL' : 'NOW()'}) RETURNING *`,
    cols.map((k) => a[k])
  );
  return apresEcriture(db, r.rows[0]);
}

async function modifier(db, id, body = {}) {
  const avant = await lire(db, id);
  const a = champs(body, avant);
  valider(a);
  const cols = Object.keys(a);
  const ferme = !OUVERTES.includes(a.etape);
  const r = await db.pool.query(
    `UPDATE affaires SET ${cols.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW(),
            cloturee_le = ${ferme ? 'COALESCE(cloturee_le, NOW())' : 'NULL'}
      WHERE id = $1 RETURNING *`, [id, ...cols.map((k) => a[k])]
  );
  return apresEcriture(db, r.rows[0], avant);
}

async function supprimer(db, id) {
  const a = await lire(db, id);
  if (a.relance_interaction_id) await db.pool.query('UPDATE interactions SET followup_done = TRUE WHERE id = $1 AND followup_done = FALSE', [a.relance_interaction_id]).catch(() => {});
  await db.pool.query('UPDATE quotes SET affaire_id = NULL WHERE affaire_id = $1', [id]).catch(() => {});
  await db.pool.query('UPDATE interactions SET affaire_id = NULL WHERE affaire_id = $1', [id]).catch(() => {});
  await db.pool.query('DELETE FROM affaires WHERE id = $1', [id]);
  return { supprime: id };
}

// Devis : rattacher / détacher. Un devis rattaché à une affaire en Découverte la fait passer en
// « Devis envoyé » quand il est envoyé ou signé ; le montant ponctuel vide reprend son total HT.
async function devisDisponibles(db, id) {
  const a = await lire(db, id);
  const { rows } = await db.pool.query(
    `SELECT id, quote_number, title, client_name, status, total_ht, created_at, affaire_id FROM quotes
      WHERE (affaire_id IS NULL OR affaire_id = $1) AND ($2::int IS NULL OR client_id = $2 OR client_id IS NULL)
      ORDER BY (client_id = $2) DESC NULLS LAST, created_at DESC LIMIT 50`, [a.id, a.client_id]
  ).catch(() => ({ rows: [] }));
  return rows;
}

async function rattacherDevis(db, id, quoteId) {
  const a = await lire(db, id);
  const q = (await db.pool.query('SELECT * FROM quotes WHERE id = $1', [quoteId])).rows[0];
  if (!q) throw err(404, 'Devis introuvable');
  if (q.affaire_id && q.affaire_id !== a.id) throw err(409, `Ce devis est déjà rattaché à une autre affaire (#${q.affaire_id})`);
  await db.pool.query('UPDATE quotes SET affaire_id = $2 WHERE id = $1', [q.id, a.id]);
  const maj = {};
  if (a.montant_ponctuel === null && q.total_ht !== null) maj.montant_ponctuel = Number(q.total_ht);
  if (a.etape === 'decouverte' && ['sent', 'signed', 'accepted', 'envoye', 'signe'].includes(String(q.status || '').toLowerCase())) maj.etape = 'devis_envoye';
  if (Object.keys(maj).length) return modifier(db, a.id, maj);
  return (await lister(db, { lead_id: a.lead_id, client_id: a.client_id })).find((x) => x.id === a.id);
}

async function detacherDevis(db, id, quoteId) {
  const a = await lire(db, id);
  await db.pool.query('UPDATE quotes SET affaire_id = NULL WHERE id = $1 AND affaire_id = $2', [quoteId, a.id]);
  return (await lister(db, { lead_id: a.lead_id, client_id: a.client_id })).find((x) => x.id === a.id);
}

const referentiel = () => ({ types: TYPES, etapes: ETAPES, ouvertes: OUVERTES, motifs: MOTIFS, canaux: CANAUX, accords: ACCORDS });

module.exports = { TYPES, ETAPES, OUVERTES, MOTIFS, CANAUX, referentiel, lister, creer, modifier, supprimer, devisDisponibles, rattacherDevis, detacherDevis };
