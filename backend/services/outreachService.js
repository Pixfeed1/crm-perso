// Netlinking multi-site : TOUTES les règles d'envoi vivent ici, derrière un seul endpoint
// (POST /api/seo/outreach/send), appelé par l'onglet SEO comme par le serveur MCP. Rien côté interface.
//
// Contrôles, tous bloquants :
//   - site avec un expéditeur réglé (services/outreachSite.js), cible rattachée à une niche de ce site ;
//   - un seul destinataire, une adresse valide ; objet et corps fournis à l'appel, sans champ de fusion ;
//   - domaine (forme courte) jamais contacté, toutes campagnes et tous sites confondus, y compris par
//     l'ancien envoi de pixfeed.net (lecture seule de seo_link_outreach) ; sinon refus avec date, objet et
//     statut du précédent. Passage outre seulement pour une relance (relance_de), encadrée : même domaine,
//     pas après une réponse ou un abandon, 2 relances au plus, 7 jours au moins après le dernier mail ;
//   - adresse ou domaine en opposition (désinscription, refus de prospection), cible refusée ou écartée ;
//   - plafond quotidien par site (15 par défaut) et délai aléatoire entre deux envois (4 à 12 min par défaut :
//     OUTREACH_DELAI_MIN / OUTREACH_DELAI_MAX) : refus avec l'heure du prochain envoi possible.
// À l'envoi réussi : ligne écrite, message_id gardé, relance prévue à J+10, cible « contacte ».
// simulation=true par défaut : tous les contrôles, rien envoyé ni écrit.
const site = require('./outreachSite');
const optout = require('./optout');
const { domaineCourt } = require('../utils/domaineCourt');

const RELANCES_MAX = 2;
const RELANCE_DELAI_JOURS = 7;
const RELANCE_PREVUE_JOURS = 10;
const RE_EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i;
const RE_FUSION = /\{\{[^}]*\}\}|\{[a-z_]+\}|%%\w+%%|\[\[[^\]]*\]\]|\[(prenom|nom|site|domaine|entreprise)\]/i;
const NATURES = ['positif', 'negatif', 'payant', 'refus', 'abandon'];

const err = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const delais = () => {
  const min = Math.max(0, Number(process.env.OUTREACH_DELAI_MIN || 4));
  const max = Math.max(min, Number(process.env.OUTREACH_DELAI_MAX || 12));
  return { min, max };
};
const heure = (d) => new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const jourParis = (d = new Date()) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(d);

// Contacts déjà faits pour un domaine (forme courte) ou une adresse, tous sites : nouveau module + ancien envoi.
async function dejaContacte(db, { domaine = null, adresse = null } = {}) {
  const d = domaineCourt(domaine || adresse);
  const a = adresse ? String(adresse).trim().toLowerCase() : null;
  if (!d && !a) throw err(400, 'indiquer un domaine ou une adresse');
  const nouveaux = (await db.pool.query(
    `SELECT m.id, m.site, s.domain AS site_domaine, m.campaign_id, m.target_id, m.domaine, m.destinataire, m.objet, m.envoye_le, m.statut, m.relance_de, m.reponse_le, m.reponse_nature
       FROM outreach_mails m LEFT JOIN seo_sites s ON s.id = m.site
      WHERE m.statut <> 'envoi' AND (($1::text IS NOT NULL AND m.domaine = $1) OR ($2::text IS NOT NULL AND LOWER(m.destinataire) = $2))
      ORDER BY m.envoye_le`, [d, a])).rows;
  // Ancien envoi (Gmail perso, pixfeed.net) : lu seulement.
  const anciens = (await db.pool.query(
    `SELECT o.id, o.target_id, t.niche_id AS campaign_id, t.domain, t.contact_email, o.subject AS objet, o.sent_at AS envoye_le, o.reponse
       FROM seo_link_outreach o JOIN seo_link_targets t ON t.id = o.target_id ORDER BY o.sent_at`).catch(() => ({ rows: [] }))).rows
    .filter((o) => (d && domaineCourt(o.domain) === d) || (a && String(o.contact_email || '').toLowerCase() === a))
    .map((o) => ({ origine: 'ancien envoi (Gmail, onglet Backlinks)', id: o.id, target_id: o.target_id, campaign_id: o.campaign_id, domaine: domaineCourt(o.domain), destinataire: o.contact_email, objet: o.objet, envoye_le: o.envoye_le, statut: o.reponse ? `repondu (${o.reponse})` : 'envoye' }));
  return { domaine: d, adresse: a, contacts: [...nouveaux.map((x) => ({ origine: `outreach ${x.site_domaine || `site ${x.site}`}`, ...x })), ...anciens].sort((x, y) => new Date(x.envoye_le) - new Date(y.envoye_le)) };
}

// Chaîne d'une relance : le premier mail et toutes ses relances.
async function chaine(db, mailId) {
  let m = (await db.pool.query('SELECT * FROM outreach_mails WHERE id = $1', [mailId])).rows[0];
  if (!m) return null;
  while (m.relance_de) m = (await db.pool.query('SELECT * FROM outreach_mails WHERE id = $1', [m.relance_de])).rows[0];
  const tous = [m];
  for (let i = 0; i < tous.length; i++) tous.push(...(await db.pool.query("SELECT * FROM outreach_mails WHERE relance_de = $1 AND statut <> 'envoi' ORDER BY envoye_le", [tous[i].id])).rows);
  return { premier: m, mails: tous };
}

async function envoyerMail(db, b = {}) {
  const simulation = b.simulation !== false;
  const out = { simulation, controles: [], fetched_at: new Date().toISOString() };
  const ok = (texte) => out.controles.push({ ok: true, texte });
  const siteId = Number(b.site_id || b.site);
  const c = site.config(siteId);
  if (!c) throw err(400, `site ${siteId || '?'} : aucun expéditeur de netlinking réglé (OUTREACH_SMTP_*_${siteId || '<site>'} dans backend/.env). pixfeed.net garde son envoi actuel (onglet Backlinks).`);
  if (!site.signature(c)) throw err(400, `signature de ${c.adresse} absente : déposer son HTML dans ${c.fichierSignature} (copié depuis Roundcube)`);
  ok(`expéditeur ${c.adresse}, signature du site ajoutée à l'envoi, aucun suivi de clic`);

  // Un envoi, un destinataire, un texte écrit pour la cible.
  const destinataire = String(b.destinataire || '').trim();
  const objet = String(b.objet || '').trim();
  const corps = String(b.corps || '').replace(/\r\n/g, '\n').trim();
  if (Array.isArray(b.destinataire) || /[,;]/.test(destinataire) || !RE_EMAIL.test(destinataire)) throw err(400, 'un seul destinataire, une adresse email valide');
  if (!objet || !corps) throw err(400, 'objet et corps obligatoires, écrits pour cette cible');
  if (RE_FUSION.test(objet) || RE_FUSION.test(corps)) throw err(400, `champ de fusion interdit (${(RE_FUSION.exec(objet) || RE_FUSION.exec(corps))[0]}) : le texte est écrit pour la cible`);
  ok('un seul destinataire, texte sans champ de fusion');

  // La cible : niche rattachée à ce site.
  const t = (await db.pool.query('SELECT t.*, n.site_id AS niche_site, n.name AS niche FROM seo_link_targets t JOIN seo_niches n ON n.id = t.niche_id WHERE t.id = $1', [b.target_id])).rows[0];
  if (!t) throw err(404, `cible ${b.target_id} introuvable`);
  if (Number(t.niche_site) !== siteId) throw err(409, `la cible ${t.domain} appartient à la niche « ${t.niche} », qui n'est pas rattachée à ce site`);
  if (['refus', 'ecarte'].includes(t.statut)) throw err(409, `cible ${t.domain} au statut « ${t.statut} » : pas d'envoi`);
  const domaine = domaineCourt(t.domain);
  if (!domaine) throw err(400, `domaine de la cible illisible (${t.domain})`);
  out.cible = { id: t.id, domaine, niche: t.niche, campaign_id: t.niche_id };
  ok(`cible ${domaine} (niche « ${t.niche} »)`);

  // Oppositions.
  if (await optout.isOptedOut(db, destinataire)) throw err(409, `${destinataire} est en opposition (désinscription ou refus de prospection) : pas d'envoi`);
  ok('adresse et domaine sans opposition');

  // Déjà contacté ? Passage outre seulement pour une relance encadrée.
  const deja = await dejaContacte(db, { domaine, adresse: destinataire });
  let relance = null;
  if (b.relance_de) {
    const ch = await chaine(db, Number(b.relance_de));
    if (!ch) throw err(404, `mail ${b.relance_de} (relance_de) introuvable`);
    const parent = ch.mails.find((m) => m.id === Number(b.relance_de));
    if (ch.premier.domaine !== domaine) throw err(409, `relance_de #${b.relance_de} concerne ${ch.premier.domaine}, pas ${domaine}`);
    if (ch.premier.site !== siteId) throw err(409, `relance_de #${b.relance_de} a été envoyé par un autre site`);
    const fin = ch.mails.find((m) => ['repondu', 'abandonne'].includes(m.statut));
    if (fin) throw err(409, `pas de relance : le mail #${fin.id} est « ${fin.statut} »${fin.reponse_le ? ` (réponse du ${heure(fin.reponse_le)})` : ''}`);
    const nbRelances = ch.mails.length - 1;
    if (nbRelances >= RELANCES_MAX) throw err(409, `déjà ${nbRelances} relance(s) pour ${domaine} : ${RELANCES_MAX} au plus`);
    const dernier = ch.mails.reduce((x, y) => (new Date(y.envoye_le) > new Date(x.envoye_le) ? y : x));
    const ecart = (Date.now() - new Date(dernier.envoye_le).getTime()) / 86400000;
    if (ecart < RELANCE_DELAI_JOURS) throw err(409, `relance trop tôt : dernier mail le ${heure(dernier.envoye_le)}, relance possible à partir du ${heure(new Date(dernier.envoye_le).getTime() + RELANCE_DELAI_JOURS * 86400000)}`);
    relance = { parent, premier: ch.premier, dernier, rang: nbRelances + 1 };
    out.relance = { de: parent.id, rang: relance.rang, en_reponse_a: dernier.message_id };
    ok(`relance n° ${relance.rang} de #${ch.premier.id} (${RELANCES_MAX} au plus, ${Math.floor(ecart)} jours après le dernier mail)`);
  } else if (deja.contacts.length) {
    const p = deja.contacts[deja.contacts.length - 1];
    throw err(409, `${domaine} a déjà reçu un mail le ${heure(p.envoye_le)} (« ${p.objet} », statut ${p.statut}, ${p.origine}). Seule une relance (relance_de) est possible.`, { precedents: deja.contacts });
  } else ok(`${domaine} jamais contacté (tous sites, toutes campagnes)`);

  // Cadence : plafond du jour et délai aléatoire, sous verrou par site.
  const cl = await db.pool.connect();
  let ligne;
  try {
    await cl.query('BEGIN');
    await cl.query('SELECT pg_advisory_xact_lock($1)', [910000 + siteId]);
    const n = (await cl.query(`SELECT COUNT(*)::int AS n FROM outreach_mails WHERE site = $1 AND statut <> 'envoi' AND (envoye_le AT TIME ZONE 'Europe/Paris')::date = $2::date`, [siteId, jourParis()])).rows[0].n;
    if (n >= c.plafond) throw err(429, `plafond du jour atteint pour ce site : ${n} / ${c.plafond} envois. Prochain envoi possible demain.`);
    const etat = (await cl.query('SELECT prochain_envoi_le FROM outreach_etat WHERE site = $1', [siteId])).rows[0];
    if (etat && etat.prochain_envoi_le && new Date(etat.prochain_envoi_le) > new Date()) throw err(429, `trop tôt après le dernier envoi : prochain envoi possible à ${heure(etat.prochain_envoi_le)}`, { prochain_envoi_le: etat.prochain_envoi_le });
    ok(`cadence : ${n} / ${c.plafond} aujourd'hui, délai depuis le dernier envoi respecté`);
    if (simulation) {
      await cl.query('ROLLBACK');
      return { ...out, statut: 'simulation : rien envoyé', apercu: { de: c.from, a: destinataire, repondre_a: c.reply_to, objet, corps, signature: 'ajoutée à l\'envoi' } };
    }
    // Réservation : la ligne et le prochain créneau, avant l'envoi (deux appels simultanés ne passent pas).
    ligne = (await cl.query(
      `INSERT INTO outreach_mails (site, campaign_id, target_id, domaine, destinataire, objet, corps, statut, relance_de) VALUES ($1, $2, $3, $4, $5, $6, $7, 'envoi', $8) RETURNING id`,
      [siteId, t.niche_id, t.id, domaine, destinataire, objet, corps, relance ? relance.parent.id : null])).rows[0];
    const { min, max } = delais();
    const attente = (min + Math.random() * (max - min)) * 60000;
    out.etat_precedent = etat ? etat.prochain_envoi_le : null;
    await cl.query(`INSERT INTO outreach_etat (site, prochain_envoi_le) VALUES ($1, $2) ON CONFLICT (site) DO UPDATE SET prochain_envoi_le = $2`, [siteId, new Date(Date.now() + attente)]);
    await cl.query('COMMIT');
  } catch (e) {
    await cl.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { cl.release(); }

  // Envoi.
  let res;
  try {
    res = await site.envoyer(c, site.composer(c, { destinataire, objet, corps, en_reponse_a: relance ? relance.dernier.message_id : null }));
  } catch (e) {
    await db.pool.query('DELETE FROM outreach_mails WHERE id = $1', [ligne.id]).catch(() => {});
    await db.pool.query('UPDATE outreach_etat SET prochain_envoi_le = $2 WHERE site = $1', [siteId, out.etat_precedent]).catch(() => {});
    throw err(502, `envoi refusé par le serveur de mail : ${e.message}`);
  }
  const prevue = new Date(Date.now() + RELANCE_PREVUE_JOURS * 86400000);
  await db.pool.query(`UPDATE outreach_mails SET statut = 'envoye', envoye_le = NOW(), message_id = $2, relance_prevue_le = $3::date WHERE id = $1`, [ligne.id, res.message_id, jourParis(prevue)]);
  if (relance) await db.pool.query(`UPDATE outreach_mails SET statut = 'relance', relance_prevue_le = NULL WHERE id = ANY($1::int[]) AND statut = 'envoye'`, [[relance.premier.id, relance.parent.id, relance.dernier.id]]);
  await db.pool.query(`UPDATE seo_link_targets SET statut = 'contacte', contact_email = COALESCE(contact_email, $2) WHERE id = $1 AND statut IN ('nouveau', 'a_contacter', 'contacte')`, [t.id, destinataire]);
  const m = (await db.pool.query('SELECT * FROM outreach_mails WHERE id = $1', [ligne.id])).rows[0];
  delete out.etat_precedent;
  return { ...out, statut: 'envoyé', mail: m, relance_prevue_le: m.relance_prevue_le };
}

// Liste : filtres site, campagne (niche), statut, relances dues (date passée, pas de suite).
async function lister(db, { site: s = null, campagne = null, statut = null, relances_dues = false, target_id = null, limite = 200 } = {}) {
  const { rows } = await db.pool.query(
    `SELECT m.*, t.domain AS cible_domaine, t.statut AS cible_statut, n.name AS niche
       FROM outreach_mails m LEFT JOIN seo_link_targets t ON t.id = m.target_id LEFT JOIN seo_niches n ON n.id = m.campaign_id
      WHERE m.statut <> 'envoi'
        AND ($1::int IS NULL OR m.site = $1) AND ($2::int IS NULL OR m.campaign_id = $2) AND ($3::text IS NULL OR m.statut = $3)
        AND ($4::int IS NULL OR m.target_id = $4)
        AND (NOT $5::boolean OR (m.statut = 'envoye' AND m.relance_prevue_le <= $6::date))
      ORDER BY ${relances_dues ? 'm.relance_prevue_le ASC' : 'm.envoye_le DESC'} LIMIT $7`,
    [s ? Number(s) : null, campagne ? Number(campagne) : null, statut || null, target_id ? Number(target_id) : null, !!relances_dues, jourParis(), Math.min(1000, Number(limite) || 200)]);
  return { fetched_at: new Date().toISOString(), total: rows.length, mails: rows };
}

// Cibles d'un site sans réponse : dernier mail envoyé (ou relancé), aucune réponse, pas abandonné.
async function sansReponse(db, { site: s }) {
  const { rows } = await db.pool.query(
    `SELECT DISTINCT ON (m.target_id) m.target_id, m.domaine, m.destinataire, m.objet, m.envoye_le, m.statut, m.relance_prevue_le, n.name AS niche
       FROM outreach_mails m LEFT JOIN seo_niches n ON n.id = m.campaign_id
      WHERE m.site = $1 AND m.statut IN ('envoye', 'relance')
        AND NOT EXISTS (SELECT 1 FROM outreach_mails x WHERE x.target_id = m.target_id AND x.statut IN ('repondu', 'abandonne'))
      ORDER BY m.target_id, m.envoye_le DESC`, [Number(s)]);
  return rows.sort((a, b) => new Date(a.envoye_le) - new Date(b.envoye_le));
}

// Réponse (ou abandon) sur la cible : le dernier mail de son fil prend le statut, les relances s'arrêtent.
async function marquerReponse(db, { target_id: targetId, date = null, nature }) {
  if (!NATURES.includes(nature)) throw err(400, `nature : ${NATURES.join(', ')}`);
  const fil = (await db.pool.query("SELECT * FROM outreach_mails WHERE target_id = $1 AND statut <> 'envoi' ORDER BY envoye_le DESC", [targetId])).rows;
  if (!fil.length) throw err(404, `aucun mail envoyé à la cible ${targetId}`);
  const quand = date ? new Date(date) : new Date();
  if (isNaN(quand.getTime())) throw err(400, 'date invalide');
  const statut = nature === 'abandon' ? 'abandonne' : 'repondu';
  await db.pool.query('UPDATE outreach_mails SET statut = $2, reponse_le = $3, reponse_nature = $4, relance_prevue_le = NULL WHERE id = $1', [fil[0].id, statut, nature === 'abandon' ? null : quand, nature === 'abandon' ? null : nature]);
  await db.pool.query("UPDATE outreach_mails SET relance_prevue_le = NULL WHERE target_id = $1", [targetId]);
  const statutCible = { refus: 'refus', negatif: 'refus' }[nature];
  if (statutCible) await db.pool.query('UPDATE seo_link_targets SET statut = $2 WHERE id = $1', [targetId, statutCible]);
  return { target_id: Number(targetId), mail: (await db.pool.query('SELECT * FROM outreach_mails WHERE id = $1', [fil[0].id])).rows[0] };
}

// Ajout de cibles dans une niche du site (remplace l'import CSV) : crée les manquantes, ignore les domaines
// déjà présents dans les niches du site ; signale ceux déjà connus ailleurs. simulation=true par défaut.
const STATUTS_CIBLE = ['nouveau', 'a_contacter', 'contacte', 'lien_obtenu', 'refus', 'ecarte'];
async function ajouterCibles(db, { site: s, niche_id: nicheId, cibles = [], simulation = true }) {
  const niche = (await db.pool.query('SELECT id, name, site_id FROM seo_niches WHERE id = $1', [nicheId])).rows[0];
  if (!niche) throw err(404, `niche ${nicheId} introuvable`);
  if (Number(niche.site_id) !== Number(s)) throw err(409, `la niche « ${niche.name} » n'est pas rattachée au site ${s}`);
  if (!Array.isArray(cibles) || !cibles.length) throw err(400, 'cibles : liste non vide attendue');
  if (cibles.length > 500) throw err(400, '500 cibles au plus par appel');
  const existants = (await db.pool.query('SELECT t.domain, n.site_id, n.name FROM seo_link_targets t JOIN seo_niches n ON n.id = t.niche_id')).rows;
  const out = { niche: niche.name, simulation, creees: [], ignorees: [] };
  const vus = new Set();
  for (const x of cibles) {
    const d = domaineCourt(x && (x.domaine || x.url));
    if (!d) { out.ignorees.push({ domaine: x && x.domaine, raison: 'domaine illisible' }); continue; }
    if (vus.has(d)) { out.ignorees.push({ domaine: d, raison: 'en double dans la liste' }); continue; }
    vus.add(d);
    const ici = existants.find((e) => domaineCourt(e.domain) === d && Number(e.site_id) === Number(s));
    if (ici) { out.ignorees.push({ domaine: d, raison: `déjà présent (niche « ${ici.name} »)` }); continue; }
    const ailleurs = existants.find((e) => domaineCourt(e.domain) === d);
    const rel = String(x.rel || '').toLowerCase();
    const dofollow = x.rel === undefined || x.rel === null || x.rel === '' ? null : !/nofollow|ugc|sponsored/.test(rel);
    const statut = STATUTS_CIBLE.includes(x.statut) ? x.statut : 'nouveau';
    const notes = [x.terrain && `terrain : ${x.terrain}`, x.rel && `rel lu : ${x.rel}`, x.note].filter(Boolean).join(' · ') || null;
    const c = { domaine: d, url: x.url || null, porte: x.porte || null, statut, dofollow, notes, ...(ailleurs ? { note_crm: `aussi présent dans une niche d'un autre site (« ${ailleurs.name} »)` } : {}) };
    if (!simulation) {
      const r = await db.pool.query(
        `INSERT INTO seo_link_targets (niche_id, domain, via, statut, dofollow, porte_type, porte_url, notes) VALUES ($1, $2, 'manuel', $3, $4, $5, $6, $7)
         ON CONFLICT (niche_id, domain) DO NOTHING RETURNING id`, [niche.id, d, statut, dofollow, c.porte, c.url, notes]);
      if (!r.rows[0]) { out.ignorees.push({ domaine: d, raison: 'déjà présent' }); continue; }
      c.id = r.rows[0].id;
    }
    out.creees.push(c);
  }
  out.statut = simulation ? 'simulation : rien créé' : 'écrit';
  return out;
}

module.exports = { envoyerMail, dejaContacte, lister, sansReponse, marquerReponse, ajouterCibles, NATURES, RELANCES_MAX };
