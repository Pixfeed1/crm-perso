// Netlinking multi-site : TOUTES les règles d'envoi vivent ici, derrière un seul endpoint
// (POST /api/seo/outreach/send), appelé par l'onglet SEO comme par le serveur MCP. Rien côté interface.
//
// Contrôles, tous bloquants :
//   - site avec un expéditeur réglé (services/outreachSite.js), cible rattachée à une niche de ce site ;
//     sans target_id, un domaine seul suffit : la fiche cible est reprise si le domaine (forme courte) est
//     déjà dans une niche du site, sinon créée à l'envoi réel dans la niche niche_nom du site (nom sans
//     casse ni accents ; niche inconnue refusée, sauf creer_si_absente=true), ou à défaut « Hors campagne »
//     (créée si besoin) ; en simulation, rien n'est créé ;
//   - un seul destinataire, une adresse valide ; objet et corps fournis à l'appel, sans champ de fusion ;
//   - domaine complet (sous-domaine compris, « www. » ignoré : blog.exemple.fr ≠ exemple.fr) et adresse
//     jamais contactés, toutes campagnes et tous sites confondus, y compris par
//     l'ancien envoi de pixfeed.net (lecture seule de seo_link_outreach) ; sinon refus avec date, objet et
//     statut du précédent ; un autre sous-domaine du même domaine racine déjà contacté est signalé
//     (avertissements), sans bloquer. Passage outre seulement pour une relance (relance_de), encadrée : même domaine,
//     pas après une réponse ou un abandon, 2 relances au plus, 7 jours au moins après le dernier mail ;
//   - adresse ou domaine en opposition (désinscription, refus de prospection), cible refusée ou écartée ;
//   - plafond quotidien par site (15 par défaut) et délai aléatoire entre deux envois (4 à 12 min par défaut :
//     OUTREACH_DELAI_MIN / OUTREACH_DELAI_MAX) : refus avec l'heure du prochain envoi possible.
// À l'envoi réussi : ligne écrite, message_id gardé, relance prévue à J+10, cible « contacte ».
// simulation=true par défaut : tous les contrôles, rien envoyé ni écrit.
const site = require('./outreachSite');
const optout = require('./optout');
const { domaineCourt, hoteSaisi, cleDomaine } = require('../utils/domaineCourt');
const { dofollowDuRel } = require('../utils/relLien');

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

// Contacts déjà faits pour un domaine (complet, « www. » ignoré) ou une adresse, tous sites : nouveau module
// + ancien envoi. meme_racine : autres sous-domaines du même domaine racine déjà contactés (pour information).
async function dejaContacte(db, { domaine = null, adresse = null } = {}) {
  const d = cleDomaine(domaine || adresse);
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
    .map((o) => ({ origine: 'ancien envoi (Gmail, onglet Backlinks)', id: o.id, target_id: o.target_id, campaign_id: o.campaign_id, domaine: cleDomaine(o.domain), destinataire: o.contact_email, objet: o.objet, envoye_le: o.envoye_le, statut: o.reponse ? `repondu (${o.reponse})` : 'envoye' }));
  const parDate = (x, y) => new Date(x.envoye_le) - new Date(y.envoye_le);
  const contacts = [...nouveaux.map((x) => ({ origine: `outreach ${x.site_domaine || `site ${x.site}`}`, ...x })),
    ...anciens.filter((o) => (d && o.domaine === d) || (a && String(o.destinataire || '').toLowerCase() === a))].sort(parDate);
  // Même domaine racine, autre sous-domaine : signalé, jamais bloquant.
  const racine = domaine ? domaineCourt(domaine) : null;
  let memeRacine = [];
  if (racine && d) {
    const tous = (await db.pool.query(
      `SELECT m.id, m.site, s.domain AS site_domaine, m.domaine, m.destinataire, m.objet, m.envoye_le, m.statut
         FROM outreach_mails m LEFT JOIN seo_sites s ON s.id = m.site WHERE m.statut <> 'envoi' AND m.domaine LIKE $1`, [`%${racine}`])).rows
      .map((x) => ({ origine: `outreach ${x.site_domaine || `site ${x.site}`}`, ...x }));
    const deja = new Set(contacts.map((x) => `${x.origine}#${x.id}`));
    memeRacine = [...tous, ...anciens].filter((x) => x.domaine && x.domaine !== d && domaineCourt(x.domaine) === racine && !deja.has(`${x.origine}#${x.id}`)).sort(parDate);
  }
  return { domaine: d, adresse: a, contacts, ...(memeRacine.length ? { meme_racine: memeRacine } : {}) };
}

// Niche d'un site par son nom : sans tenir compte de la casse, des accents ni des espaces, parmi les
// niches RATTACHÉES à ce site seulement. Créée si absente et creer=true (rattachée au site à la création).
const HORS_CAMPAGNE = 'Hors campagne';
const cleNom = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
async function nichesDuSite(q, siteId) {
  return (await q.query('SELECT id, name, site_id FROM seo_niches WHERE site_id = $1 ORDER BY id', [siteId])).rows;
}
async function nicheParNom(q, siteId, nom, { creer = false, siteCible = null, pageCible = null, hubs = null } = {}) {
  const n = (await nichesDuSite(q, siteId)).find((x) => cleNom(x.name) === cleNom(nom));
  if (n || !creer) return n ? { ...n, creee: false } : null;
  const h = hubs ? String(hubs).trim() : null;
  const cree = (await q.query(
    'INSERT INTO seo_niches (name, site_cible, site_id, page_cible, hubs, seeds, statut) VALUES ($1, $2, $3, $4, $5, $5, $6) RETURNING id, name, site_id, site_cible, page_cible, hubs, statut',
    [String(nom).trim().replace(/\s+/g, ' '), siteCible, siteId, pageCible, h || null, h ? 'nouvelle' : 'prete'])).rows[0];
  return { ...cree, creee: true };
}
// Niche inconnue : refus avec la liste des niches du site.
async function nicheInconnue(q, siteId, nom) {
  const liste = (await nichesDuSite(q, siteId)).map((x) => `« ${x.name} » (${x.id})`).join(', ') || 'aucune';
  return err(404, `aucune niche « ${nom} » rattachée au site ${siteId} (niches du site : ${liste}). Pour la créer : creer_si_absente=true, ou creer_niche.`);
}

// Création explicite d'une niche (outil creer_niche) : rattachée au site dès la création, nom unique sur le
// site (casse et accents ignorés). simulation=true par défaut.
async function creerNiche(db, { site: s, nom, page_cible: pageCible = null, hubs = null, simulation = true }) {
  const siteId = Number(s);
  const site = (await db.pool.query('SELECT id, domain FROM seo_sites WHERE id = $1', [siteId])).rows[0];
  if (!site) throw err(404, `site ${s} introuvable`);
  const n = String(nom || '').trim();
  if (!n || n.length > 120) throw err(400, 'nom : 1 à 120 caractères');
  const page = pageCible ? String(pageCible).trim() : null;
  if (page && !/^https?:\/\/[^\s]+$/i.test(page)) throw err(400, `page_cible : adresse complète attendue (https://…), reçu « ${page} »`);
  if (page && cleDomaine(page) !== cleDomaine(site.domain)) throw err(400, `page_cible ${page} n'est pas sur ${site.domain}`);
  const h = Array.isArray(hubs) ? hubs.join(', ') : (hubs ? String(hubs) : null);
  const deja = await nicheParNom(db.pool, siteId, n);
  if (deja) throw err(409, `la niche « ${deja.name} » (${deja.id}) existe déjà sur ce site : l'utiliser par son niche_id`, { niche_id: deja.id });
  if (simulation) return { simulation, statut: 'simulation : rien créé', niche: { nom: n, site_id: siteId, site: site.domain, page_cible: page, hubs: h } };
  const cree = await nicheParNom(db.pool, siteId, n, { creer: true, siteCible: site.domain, pageCible: page, hubs: h });
  return { simulation, statut: 'créée', niche: { id: cree.id, nom: cree.name, site_id: siteId, site: site.domain, page_cible: cree.page_cible, hubs: cree.hubs, statut: cree.statut } };
}

// Cible d'un domaine dans les niches d'un site (domaine complet, « www. » ignoré).
async function cibleDuDomaine(q, siteId, domaine) {
  const rows = (await q.query('SELECT t.*, n.site_id AS niche_site, n.name AS niche FROM seo_link_targets t JOIN seo_niches n ON n.id = t.niche_id WHERE n.site_id = $1 ORDER BY t.id', [siteId])).rows;
  return rows.find((t) => cleDomaine(t.domain) === domaine) || null;
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

  // La cible : niche rattachée à ce site. Par target_id, ou par un domaine seul (fiche reprise ou créée à l'envoi).
  let t = null;
  let aCreer = null; // { domaine, url } : fiche à créer dans « Hors campagne » à l'envoi réel
  const domaineDemande = b.domaine ? cleDomaine(b.domaine) : null;
  if (b.domaine && !domaineDemande) throw err(400, `domaine illisible (${b.domaine})`);
  const nomNiche = b.niche_nom ? String(b.niche_nom).trim() : HORS_CAMPAGNE;
  if (!nomNiche || nomNiche.length > 120) throw err(400, 'niche_nom : 1 à 120 caractères');
  if (b.target_id) {
    t = (await db.pool.query('SELECT t.*, n.site_id AS niche_site, n.name AS niche FROM seo_link_targets t JOIN seo_niches n ON n.id = t.niche_id WHERE t.id = $1', [b.target_id])).rows[0];
    if (!t) throw err(404, `cible ${b.target_id} introuvable`);
    if (domaineDemande && cleDomaine(t.domain) !== domaineDemande) throw err(409, `la cible ${b.target_id} est ${t.domain}, pas ${b.domaine} : donner l'un ou l'autre`);
  } else if (domaineDemande) {
    t = await cibleDuDomaine(db.pool, siteId, domaineDemande);
    if (!t) aCreer = { domaine: domaineDemande, hote: hoteSaisi(b.domaine), url: /^https?:\/\//i.test(String(b.domaine).trim()) ? String(b.domaine).trim() : null };
  } else throw err(400, 'indiquer la cible : target_id, ou domaine seul (fiche créée dans la campagne niche_nom, à défaut « Hors campagne »)');
  let domaine;
  if (t) {
    if (Number(t.niche_site) !== siteId) throw err(409, `la cible ${t.domain} appartient à la niche « ${t.niche} », qui n'est pas rattachée à ce site`);
    if (['refus', 'ecarte'].includes(t.statut)) throw err(409, `cible ${t.domain} au statut « ${t.statut} » : pas d'envoi`);
    domaine = cleDomaine(t.domain);
    if (!domaine) throw err(400, `domaine de la cible illisible (${t.domain})`);
    out.cible = { id: t.id, domaine, niche: t.niche, campaign_id: t.niche_id };
    const autre = b.niche_nom && cleNom(t.niche) !== cleNom(nomNiche);
    ok(`cible ${domaine} (niche « ${t.niche} »${b.target_id ? '' : ', fiche existante reprise'}${autre ? `, pas déplacée vers « ${nomNiche} »` : ''})`);
  } else {
    domaine = aCreer.domaine;
    const hc = await nicheParNom(db.pool, siteId, nomNiche);
    if (!hc && b.niche_nom && b.creer_si_absente !== true) throw await nicheInconnue(db.pool, siteId, nomNiche);
    out.cible = { id: null, domaine, niche: hc ? hc.name : nomNiche, campaign_id: hc ? hc.id : null, a_creer: true };
    ok(`cible ${domaine} : pas encore de fiche sur ce site, créée à l'envoi dans la niche « ${hc ? hc.name : nomNiche} »${hc ? '' : ' (créée elle aussi)'}`);
  }

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
  if (deja.meme_racine) {
    const p = deja.meme_racine[deja.meme_racine.length - 1];
    out.avertissements = [`même domaine racine (${domaineCourt(domaine)}) déjà contacté sur un autre sous-domaine : ${[...new Set(deja.meme_racine.map((x) => x.domaine))].join(', ')} (dernier mail le ${heure(p.envoye_le)}, « ${p.objet} », ${p.origine}). Pas bloquant : vérifier qu'il s'agit bien d'un autre site.`];
    out.meme_racine = deja.meme_racine;
  }

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
    // Fiche cible à créer (domaine seul) : dans la même transaction, sous le verrou du site.
    if (aCreer) {
      const hc = await nicheParNom(cl, siteId, nomNiche, { creer: true, siteCible: c.domaine });
      const ins = (await cl.query(
        `INSERT INTO seo_link_targets (niche_id, domain, via, statut, porte_url, contact_email, notes) VALUES ($1, $2, 'manuel', 'nouveau', $3, $4, 'créée à l''envoi (domaine seul)')
         ON CONFLICT (niche_id, domain) DO NOTHING RETURNING id`, [hc.id, aCreer.hote, aCreer.url, destinataire])).rows[0];
      const id = ins ? ins.id : (await cl.query('SELECT id FROM seo_link_targets WHERE niche_id = $1 AND domain = $2', [hc.id, aCreer.hote])).rows[0].id;
      t = { id, niche_id: hc.id, niche: hc.name, domain: aCreer.hote, creee: !!ins };
      out.cible = { id, domaine, niche: hc.name, campaign_id: hc.id, creee: !!ins, ...(hc.creee ? { niche_creee: true } : {}) };
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
    // Fiche créée pour cet envoi : retirée (la niche « Hors campagne » reste, vide ou non).
    if (t.creee) await db.pool.query('DELETE FROM seo_link_targets WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM outreach_mails WHERE target_id = $1)', [t.id]).catch(() => {});
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
// Niche : niche_id, ou niche_nom (niche du site de ce nom, casse et accents ignorés) ; niche inconnue refusée
// avec la liste des niches du site, sauf creer_si_absente=true (créée à l'écriture, rattachée au site).
const STATUTS_CIBLE = ['nouveau', 'a_contacter', 'contacte', 'lien_obtenu', 'refus', 'ecarte'];
// Porte transmise (« formulaire /nous-contacter/ », « email contact@x.fr »…) : le type reconnu va dans
// porte_type, une adresse ou un chemin dans porte_url, le reste en clair dans porte_note.
const PORTES = ['email', 'formulaire', 'compte', 'reseau', 'commentaire', 'aucune'];
function lirePorte(texte, hote) {
  const s = String(texte || '').trim();
  if (!s) return { type: null, url: null, note: null };
  const [premier, ...reste] = s.split(/\s+/);
  const type = PORTES.find((p) => p === cleNom(premier).replace(/[^a-z]/g, '')) || null;
  const suite = (type ? reste.join(' ') : s).trim();
  const lien = /^(https?:\/\/\S+|\/\S*)$/i.test(suite) ? (suite.startsWith('/') ? `https://${hote}${suite}` : suite) : null;
  return { type, url: lien, note: lien ? (type ? null : s) : (suite || null) };
}
async function ajouterCibles(db, { site: s, niche_id: nicheId = null, niche_nom: nicheNom = null, creer_si_absente: creerSiAbsente = false, cibles = [], simulation = true }) {
  const siteId = Number(s);
  const nom = nicheNom ? String(nicheNom).trim() : '';
  if (!Array.isArray(cibles) || !cibles.length) throw err(400, 'cibles : liste non vide attendue');
  if (cibles.length > 500) throw err(400, '500 cibles au plus par appel');
  let niche = nicheId ? (await db.pool.query('SELECT id, name, site_id FROM seo_niches WHERE id = $1', [nicheId])).rows[0] : null;
  if (!niche && !nom) throw err(nicheId ? 404 : 400, nicheId ? `niche ${nicheId} introuvable : donner niche_nom (et creer_si_absente=true pour la créer)` : 'indiquer niche_id, ou niche_nom');
  let nicheACreer = false;
  if (!niche) {
    const site = (await db.pool.query('SELECT id, domain FROM seo_sites WHERE id = $1', [siteId])).rows[0];
    if (!site) throw err(404, `site ${s} introuvable`);
    if (nom.length > 120) throw err(400, 'niche_nom : 120 caractères au plus');
    niche = await nicheParNom(db.pool, siteId, nom);
    if (!niche && creerSiAbsente !== true) throw await nicheInconnue(db.pool, siteId, nom);
    if (!niche) {
      nicheACreer = true;
      niche = simulation ? { id: null, name: nom, site_id: siteId } : await nicheParNom(db.pool, siteId, nom, { creer: true, siteCible: site.domain });
    }
  }
  if (Number(niche.site_id) !== siteId) throw err(409, `la niche « ${niche.name} » n'est pas rattachée au site ${s}`);
  const existants = (await db.pool.query('SELECT t.domain, n.site_id, n.name FROM seo_link_targets t JOIN seo_niches n ON n.id = t.niche_id')).rows;
  const out = { niche: niche.name, niche_id: niche.id, ...(nicheACreer ? { niche_creee: simulation ? 'créée à l\'écriture' : true } : {}), simulation, creees: [], ignorees: [] };
  const vus = new Set();
  for (const x of cibles) {
    const hote = hoteSaisi(x && (x.domaine || x.url));
    const d = cleDomaine(hote);
    if (!d) { out.ignorees.push({ domaine: x && x.domaine, raison: 'domaine illisible' }); continue; }
    if (vus.has(d)) { out.ignorees.push({ domaine: hote, raison: 'en double dans la liste' }); continue; }
    vus.add(d);
    const ici = existants.find((e) => cleDomaine(e.domain) === d && Number(e.site_id) === siteId);
    if (ici) { out.ignorees.push({ domaine: hote, raison: `déjà présent (niche « ${ici.name} »${ici.domain !== hote ? `, sous la forme ${ici.domain}` : ''})` }); continue; }
    const ailleurs = existants.find((e) => cleDomaine(e.domain) === d);
    // dofollow seulement si le rel le prouve ; « à vérifier », « ? »… : inconnu (null).
    const dofollow = dofollowDuRel(x.rel);
    const statut = STATUTS_CIBLE.includes(x.statut) ? x.statut : 'nouveau';
    const notes = [x.terrain && `terrain : ${x.terrain}`, x.rel && `rel transmis : ${x.rel}${dofollow === null ? ' (non concluant, dofollow inconnu)' : ''}`, x.note].filter(Boolean).join(' · ') || null;
    const porte = lirePorte(x.porte, hote);
    const c = { domaine: hote, url: x.url || porte.url || null, porte: porte.type, ...(porte.note ? { porte_note: porte.note } : {}), statut, dofollow, notes, ...(ailleurs ? { note_crm: `aussi présent dans une niche d'un autre site (« ${ailleurs.name} »)` } : {}) };
    if (!simulation) {
      const r = await db.pool.query(
        `INSERT INTO seo_link_targets (niche_id, domain, via, statut, dofollow, rel_verifie_le, porte_type, porte_url, porte_note, notes)
         VALUES ($1, $2, 'manuel', $3, $4, CASE WHEN $4::boolean IS NULL THEN NULL ELSE NOW() END, $5, $6, $7, $8)
         ON CONFLICT (niche_id, domain) DO NOTHING RETURNING id`, [niche.id, hote, statut, dofollow, c.porte, c.url, porte.note, notes]);
      if (!r.rows[0]) { out.ignorees.push({ domaine: hote, raison: 'déjà présent' }); continue; }
      c.id = r.rows[0].id;
    }
    out.creees.push(c);
  }
  out.statut = simulation ? 'simulation : rien créé' : 'écrit';
  return out;
}

module.exports = { envoyerMail, dejaContacte, lister, sansReponse, marquerReponse, ajouterCibles, creerNiche, NATURES, RELANCES_MAX, HORS_CAMPAGNE };
