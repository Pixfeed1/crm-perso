// Veille des marchés publics (BOAMP, données ouvertes de la DILA) : tous les marchés web accessibles à une petite
// structure (création et refonte de sites, e-commerce, maintenance et hébergement, référencement et marketing
// numérique, applications web, accessibilité, design web), avec la maintenance visible à part quand il le faut.
//
// - Relevé deux fois par jour (7 h 47 et 13 h 47, le BOAMP publie deux fois par jour) : annonces parues depuis le
//   dernier relevé, date limite non passée, avis d'attribution et résultats écartés.
// - Chaque annonce est classée : thèmes reconnus (objet, descripteurs, texte de l'avis, codes CPV), score de
//   pertinence, montant estimé quand l'avis le donne (au-delà du montant maximal réglé : « hors cible »).
// - Mail récapitulatif quand de nouveaux marchés pertinents arrivent (réglable). Rien n'est jamais déposé :
//   répondre reste une décision de Marc ; le CRM suit le statut (à étudier, je réponds, répondu, gagné, perdu).
// Les noms de champs de l'API sont lus sans tenir compte de la casse (idweb / idWeb…) : diagnostic sur le
// serveur avec node scripts/diag-marches.js.
const axios = require('axios');

const API = () => process.env.BOAMP_API_URL || 'https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records';
const err = (status, message) => Object.assign(new Error(message), { status });
const sans = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ');

// ---------- thèmes ----------
// fort : suffit seul ; contexte : ne compte que si l'annonce parle aussi du web (une « maintenance » d'ascenseur
// ou un « hébergement » de personnes ne sont pas des marchés web).
const WEB = /\b(site|sites) (internet|web)\b|\bsite web\b|\bweb\b|\binternet\b|\bportail\b|\bintranet\b|\bextranet\b|\bcms\b|wordpress|drupal|joomla|typo3|prestashop|woocommerce|magento|\bapplication(s)? (web|en ligne|mobile)\b|\ben ligne\b|numerique/;
const THEMES = {
  site: { libelle: 'Site internet', fort: /\b(site|sites) (internet|web|vitrine|institutionnel)\b|\bsite web\b|\brefonte (du |de son |de |des )?(site|portail)|\bcreation (d'un |du |de )?(site|portail)|\bportail (web|internet|citoyen|famille|usagers?)\b|\bintranet\b|\bextranet\b|wordpress|drupal|joomla|typo3|\bweb ?design/ },
  ecommerce: { libelle: 'E-commerce', fort: /e-?commerce|boutique en ligne|vente en ligne|prestashop|woocommerce|magento|shopify|billetterie en ligne|paiement en ligne|place de marche (en ligne|numerique)/ },
  maintenance: { libelle: 'Maintenance et hébergement', fort: /tierce maintenance applicative|\btma\b|maintenance (corrective|evolutive|applicative)? ?(du |des |de |d'un |de son )?(site|sites|portail|cms|wordpress|application web)|hebergement (du |des |de |d'un )?(site|sites|portail|application web)|infogerance (du |des |de )?(site|portail)/, contexte: /maintenance|maintien en condition|\bmco\b|hebergement|infogerance|mises? a jour|supervision|support (technique|applicatif)/ },
  referencement: { libelle: 'Référencement et marketing numérique', fort: /referencement|\bseo\b|\bsea\b|google ads|marketing (digital|numerique)|communication (digitale|numerique)|strategie (digitale|numerique)|community manage|reseaux sociaux|campagnes? (digitales?|en ligne)|newsletter/ },
  appli: { libelle: 'Application web', fort: /application(s)? (web|en ligne)|plateforme (web|numerique|en ligne|collaborative)|teleservices?|developpement (web|d'une application web|d'une plateforme)|formulaires? en ligne|espace (usagers?|client|famille) en ligne|prise de rendez-vous en ligne/, contexte: /developpement (d'un logiciel|logiciel|informatique|specifique)|\bapi\b|application/ },
  accessibilite: { libelle: 'Accessibilité numérique', fort: /accessibilite numerique|\brgaa\b|audit d'accessibilite (du |des |de )?(site|numerique)|declaration d'accessibilite/ },
  design: { libelle: 'Design web', contexte: /charte graphique|identite visuelle|\bux\b|\bui\b|ergonomie|maquettes?|webdesign/ },
};
// Codes CPV du web (8 chiffres, sans le chiffre de contrôle).
const CPV_WEB = {
  72413000: 'site', 72212224: 'site', 72420000: 'appli', 72421000: 'appli', 72422000: 'appli', 72415000: 'maintenance',
  72416000: 'maintenance', 72267000: 'maintenance', 72267100: 'maintenance', 72400000: 'site', 72410000: 'site',
  79342000: 'referencement', 79341400: 'referencement', 72212000: 'appli', 72212100: 'appli', 72000000: null, 72200000: null,
};
// Hors de portée d'une agence web : un de ces mots dans l'objet, sans thème web dans l'objet, et l'annonce baisse.
const EXCLUSIONS = /\btravaux\b|\bbtp\b|batiment|voirie|nettoyage|restauration|fourniture (de |d')?(materiel|mobilier|vehicule|ordinateurs?|postes?)|videoprotection|videosurveillance|telephonie|cablage|fibre optique|\bimpression\b|imprimerie|signaletique|assurances?|\btransport\b|ascenseurs?|chauffage|electricite|espaces verts|gardiennage|denrees|\bsirh\b|logiciel de paie|progiciel|licences?|infrastructure (reseau|serveurs?)|\bmateriel informatique\b/;
const ECARTES_NATURE = /attribution|resultat|annulation|infructueux|sans suite/;

const champs = (rec) => { const o = {}; for (const [k, v] of Object.entries(rec || {})) o[k.toLowerCase().replace(/_/g, '')] = v; return o; };
const lire = (o, ...noms) => { for (const n of noms) { const v = o[n.toLowerCase().replace(/_/g, '')]; if (v !== undefined && v !== null && v !== '') return v; } return null; };
const liste = (v) => (v === null || v === undefined ? [] : Array.isArray(v) ? v.map(String) : String(v).split(/[;,|]/).map((x) => x.trim()).filter(Boolean));
const json = (v) => { if (!v) return null; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return null; } };

// Texte, codes CPV et montant estimé, tirés de l'avis complet (« donnees », JSON en texte, format eForms ou ancien).
function lireDonnees(brut) {
  const d = json(brut);
  const textes = []; const cpv = new Set(); const montants = [];
  const visiter = (x, cle = '', prof = 0) => {
    if (prof > 25 || x === null || x === undefined) return;
    if (Array.isArray(x)) { x.forEach((y) => visiter(y, cle, prof + 1)); return; }
    if (typeof x === 'object') { for (const [k, v] of Object.entries(x)) visiter(v, k, prof + 1); return; }
    const s = String(x);
    if (/cpv|classification/i.test(cle)) for (const m of s.matchAll(/\b(\d{8})(?:-\d)?\b/g)) cpv.add(m[1]);
    if (/montant|valeur|value|estim|amount|budget/i.test(cle) && !/devise|currency|unit/i.test(cle)) {
      const n = Number(s.replace(/\s/g, '').replace(',', '.'));
      if (Number.isFinite(n) && n >= 1000) montants.push(n);
    }
    if (/url|adresse|address|courriel|email|mail|profil|website|endpoint/i.test(cle)) return;   // adresses : pas du sujet
    const t = s.replace(/https?:\/\/\S+|www\.\S+|\S+@\S+/gi, ' ');
    if (t.trim().length > 2 && textes.join(' ').length < 20000) textes.push(t);
  };
  if (d) visiter(d);
  else if (brut) textes.push(String(brut).slice(0, 20000));
  const texte = textes.join(' ');
  if (!cpv.size) for (const m of texte.matchAll(/cpv[^0-9]{0,30}(\d{8})/gi)) cpv.add(m[1]);
  return { texte, cpv: [...cpv], montant: montants.length ? Math.max(...montants) : null };
}

// Une annonce de l'API → fiche normalisée, avec thèmes, score et cible ; null si à écarter d'office.
function analyser(rec, reglages = {}, maintenant = new Date()) {
  const o = champs(rec);
  const idweb = lire(o, 'idweb', 'id');
  if (!idweb) return null;
  const objet = String(lire(o, 'objet', 'titre') || '').trim();
  const nature = String([lire(o, 'nature_categorise_libelle', 'naturecategoriselibelle'), lire(o, 'nature_libelle'), lire(o, 'type_avis', 'typeavis'), lire(o, 'nature')].filter(Boolean).join(' · '));
  if (ECARTES_NATURE.test(sans(nature))) return null;
  const limite = lire(o, 'datelimitereponse', 'date_limite_reponse');
  if (limite && new Date(limite).getTime() < maintenant.getTime()) return null;
  const descripteurs = liste(lire(o, 'descripteur_libelle', 'descripteurlibelle', 'descripteurs'));
  const typesMarche = liste(lire(o, 'type_marche', 'typemarche', 'type_marche_facette'));
  const don = lireDonnees(lire(o, 'donnees'));
  const tObjet = sans(objet), tDesc = sans(descripteurs.join(' ')), tTout = sans(`${objet} ${descripteurs.join(' ')} ${don.texte}`);
  // Le web se lit dans l'objet, les descripteurs ou les codes CPV : le texte complet d'un avis parle presque
  // toujours d'« adresse internet », de « site internet de l'acheteur » ou de « plateforme en ligne » de dépôt.
  const tPrincipal = `${tObjet} ${tDesc}`;
  const cpvWeb = don.cpv.filter((c) => c in CPV_WEB);
  const web = WEB.test(tPrincipal) || cpvWeb.some((c) => CPV_WEB[c]);
  let principal = cpvWeb.some((c) => CPV_WEB[c]);
  const themes = new Set(); let score = 0; const raisons = [];
  for (const [k, t] of Object.entries(THEMES)) {
    const fortO = t.fort && t.fort.test(tObjet), fortD = t.fort && t.fort.test(tDesc), fortT = t.fort && t.fort.test(tTout);
    const ctx = t.contexte && web && t.contexte.test(tPrincipal);
    if (fortO) { themes.add(k); score += 3; principal = true; raisons.push(`${t.libelle} (objet)`); }
    else if (fortD) { themes.add(k); score += 2; principal = true; raisons.push(`${t.libelle} (descripteurs)`); }
    else if (ctx) { themes.add(k); score += t.contexte.test(tObjet) ? 2 : 1; principal = true; raisons.push(`${t.libelle} (avec le web)`); }
    else if (fortT && web) { themes.add(k); score += 1; raisons.push(`${t.libelle} (texte de l'avis)`); }
  }
  for (const c of cpvWeb) if (CPV_WEB[c]) themes.add(CPV_WEB[c]);
  if (cpvWeb.length) { score += 2; raisons.push(`CPV ${cpvWeb.join(', ')}`); }
  const exclusions = new RegExp([EXCLUSIONS.source, ...(reglages.exclusions || []).map((m) => sans(m).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))].filter(Boolean).join('|'));
  const themeDansObjet = Object.values(THEMES).some((t) => (t.fort && t.fort.test(tObjet)) || (t.contexte && WEB.test(tObjet) && t.contexte.test(tObjet)));
  if (exclusions.test(tObjet) && !themeDansObjet) { score -= 4; raisons.push('hors métier dans l\'objet'); }
  if (typesMarche.length && !typesMarche.some((x) => /service/i.test(x))) { score -= 2; raisons.push(`marché de ${typesMarche.join(', ').toLowerCase()}`); }
  const departements = liste(lire(o, 'code_departement', 'codedepartement', 'code_departement_prestation'));
  if ((reglages.departements || []).length && departements.some((d) => reglages.departements.includes(d))) { score += 1; raisons.push('département suivi'); }
  const montant = don.montant;
  const max = Number(reglages.montant_max) || 200000;
  // Jamais retenu sur le seul texte de l'avis : il faut le web dans l'objet, les descripteurs ou les CPV.
  const cible = !principal || score < 3 ? 'non_pertinent' : montant && montant > max ? 'hors_cible' : 'pertinent';
  return {
    idweb: String(idweb), objet: objet.slice(0, 1000), acheteur: String(lire(o, 'nomacheteur', 'nom_acheteur', 'acheteur') || '').slice(0, 300) || null,
    departements, date_parution: lire(o, 'dateparution', 'date_parution'), date_limite: limite || null,
    procedure: String(lire(o, 'procedure_libelle', 'procedurelibelle', 'type_procedure', 'procedure') || '').slice(0, 200) || null,
    tranche: String(lire(o, 'famille_libelle', 'famillelibelle') || '').slice(0, 200) || null,   // ex. « Marchés entre 90 k€ et seuils européens »
    nature: nature.slice(0, 200) || null, type_marche: typesMarche, descripteurs, cpv: don.cpv.slice(0, 20), montant,
    url: lire(o, 'url_avis', 'urlavis', 'url') || `https://www.boamp.fr/pages/avis/?q=idweb:%22${encodeURIComponent(idweb)}%22`,
    themes: [...themes], score, raisons, cible, rectificatif: /rectificati/.test(sans(nature)),
  };
}

// ---------- tables ----------
const prets = new WeakSet();
async function assurerTables(q) {
  if (prets.has(q)) return;
  await q.query(`
    CREATE TABLE IF NOT EXISTS marches_publics (
      idweb         TEXT PRIMARY KEY,
      objet         TEXT,
      acheteur      TEXT,
      departements  TEXT[],
      date_parution DATE,
      date_limite   TIMESTAMPTZ,
      procedure     TEXT,
      nature        TEXT,
      type_marche   TEXT[],
      descripteurs  TEXT[],
      cpv           TEXT[],
      montant       NUMERIC,
      url           TEXT,
      themes        TEXT[],
      score         INTEGER,
      raisons       TEXT[],
      cible         TEXT,
      rectificatif  BOOLEAN DEFAULT FALSE,
      statut        TEXT DEFAULT 'nouveau',
      note          TEXT,
      statut_le     TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_marches_limite ON marches_publics (cible, date_limite);
    ALTER TABLE marches_publics ADD COLUMN IF NOT EXISTS tranche TEXT;
    CREATE TABLE IF NOT EXISTS marches_reglages (
      id            INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      montant_max   INTEGER DEFAULT 200000,
      departements  TEXT[] DEFAULT '{}',
      exclusions    TEXT[] DEFAULT '{}',
      alerte_mail   BOOLEAN DEFAULT TRUE,
      releve_le     TIMESTAMPTZ,
      releve_statut TEXT,
      releve_detail TEXT
    );
    INSERT INTO marches_reglages (id) VALUES (1) ON CONFLICT (id) DO NOTHING;`);
  prets.add(q);
}
async function reglages(db) {
  await assurerTables(db.pool);
  return (await db.pool.query('SELECT * FROM marches_reglages WHERE id = 1')).rows[0];
}
async function regler(db, { montant_max: m, departements: d, exclusions: x, alerte_mail: a } = {}) {
  const r = await reglages(db);
  const n = { montant_max: r.montant_max, departements: r.departements || [], exclusions: r.exclusions || [], alerte_mail: r.alerte_mail };
  if (m !== undefined) { const v = Number(m); if (!Number.isInteger(v) || v < 1000) throw err(400, 'montant maximal : un nombre entier d\'euros HT, au moins 1 000'); n.montant_max = v; }
  if (d !== undefined) {
    const l = liste(d).map((s) => s.toUpperCase());
    if (l.some((s) => !/^(\d{2,3}|2A|2B)$/.test(s))) throw err(400, 'départements : des numéros (95, 75, 2A, 971…)');
    n.departements = [...new Set(l)];
  }
  if (x !== undefined) n.exclusions = [...new Set(liste(x).map((s) => s.trim()).filter((s) => s.length >= 3))].slice(0, 50);
  if (a !== undefined) n.alerte_mail = !!a;
  await db.pool.query('UPDATE marches_reglages SET montant_max = $1, departements = $2, exclusions = $3, alerte_mail = $4 WHERE id = 1', [n.montant_max, n.departements, n.exclusions, n.alerte_mail]);
  return reglages(db);
}

// ---------- relevé ----------
// Une page des annonces parues un jour donné (l'API plafonne une recherche à 10 000 résultats : on lit jour par jour).
async function pageApi(jour, offset) {
  const res = await axios.get(API(), {
    params: { where: `dateparution = date'${jour}'`, order_by: 'idweb', limit: 100, offset },
    timeout: 30000, headers: { 'User-Agent': 'CRM-PixFeed/1.0' }, validateStatus: () => true,
  });
  if (res.status >= 400) throw new Error(`BOAMP a répondu ${res.status}${res.data && res.data.message ? ` : ${res.data.message}` : ''}`);
  return { total: res.data && res.data.total_count, records: (res.data && (res.data.results || res.data.records)) || [] };
}
const jourIso = (d) => new Date(d).toISOString().slice(0, 10);

let enCours = null;
async function relever(db, { jours = null, surJour = null } = {}, deps = {}) {
  if (enCours) throw err(409, `relevé déjà en cours depuis ${enCours.toLocaleTimeString('fr-FR')}`);
  enCours = new Date();
  const page = deps.page || pageApi;
  const maintenant = deps.maintenant ? deps.maintenant() : new Date();
  try {
    const r = await reglages(db);
    // Depuis le dernier relevé réussi (un jour de marge), 7 jours au premier.
    const depuis = jours ? jourIso(maintenant.getTime() - jours * 86400000)
      : r.releve_le && r.releve_statut === 'OK' ? jourIso(new Date(r.releve_le).getTime() - 86400000) : jourIso(maintenant.getTime() - 7 * 86400000);
    let lus = 0;
    const out = { lues: 0, nouveaux: 0, pertinents_nouveaux: [], mis_a_jour: 0, ecartes: 0, declasses: 0, jours: 0 };
    const aujourdhui = jourIso(maintenant);
    for (let jour = depuis; jour <= aujourdhui; jour = jourIso(new Date(`${jour}T12:00:00Z`).getTime() + 86400000)) {
     const avantJour = { lus, nouveaux: out.nouveaux };
     for (let offset = 0; ; offset += 100) {
      const p = await page(jour, offset);
      lus += p.records.length;
      for (const rec of p.records) {
        const a = analyser(rec, r, maintenant);
        if (!a || a.cible === 'non_pertinent') {
          out.ecartes++;
          // Retenu par un tri précédent et pas encore suivi : déclassé (rien n'est supprimé).
          if (a) {
            const d = await db.pool.query("UPDATE marches_publics SET cible = 'non_pertinent', themes = $2, score = $3, raisons = $4, updated_at = NOW() WHERE idweb = $1 AND statut = 'nouveau' AND cible <> 'non_pertinent'", [a.idweb, a.themes, a.score, a.raisons]);
            out.declasses += d.rowCount;
          }
          continue;
        }
        const ins = await db.pool.query(
          `INSERT INTO marches_publics (idweb, objet, acheteur, departements, date_parution, date_limite, procedure, nature, type_marche, descripteurs, cpv, montant, url, themes, score, raisons, cible, rectificatif, tranche)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
           ON CONFLICT (idweb) DO UPDATE SET objet = EXCLUDED.objet, acheteur = EXCLUDED.acheteur, departements = EXCLUDED.departements, date_limite = EXCLUDED.date_limite,
             procedure = EXCLUDED.procedure, nature = EXCLUDED.nature, type_marche = EXCLUDED.type_marche, descripteurs = EXCLUDED.descripteurs, cpv = EXCLUDED.cpv,
             montant = EXCLUDED.montant, url = EXCLUDED.url, themes = EXCLUDED.themes, score = EXCLUDED.score, raisons = EXCLUDED.raisons, cible = EXCLUDED.cible,
             rectificatif = EXCLUDED.rectificatif, tranche = EXCLUDED.tranche, updated_at = NOW()
           RETURNING (xmax = 0) AS nouveau`,
          [a.idweb, a.objet, a.acheteur, a.departements, a.date_parution, a.date_limite, a.procedure, a.nature, a.type_marche, a.descripteurs, a.cpv, a.montant, a.url, a.themes, a.score, a.raisons, a.cible, a.rectificatif, a.tranche]);
        if (ins.rows[0].nouveau) { out.nouveaux++; if (a.cible === 'pertinent') out.pertinents_nouveaux.push(a); } else out.mis_a_jour++;
      }
      if (p.records.length < 100 || offset >= 9900) break;
     }
     out.jours++;
     if (surJour) surJour({ jour, lues: lus - avantJour.lus, nouveaux: out.nouveaux - avantJour.nouveaux });
    }
    out.lues = lus;
    const detail = `${lus} annonce(s) lue(s) depuis le ${new Date(depuis).toLocaleDateString('fr-FR')}, ${out.nouveaux} nouveau(x) marché(s) web dont ${out.pertinents_nouveaux.length} pertinent(s)${out.declasses ? `, ${out.declasses} déclassé(s) par le nouveau tri` : ''}`;
    await db.pool.query('UPDATE marches_reglages SET releve_le = $1, releve_statut = $2, releve_detail = $3 WHERE id = 1', [maintenant, 'OK', detail]);
    if (out.pertinents_nouveaux.length && r.alerte_mail) await (deps.mail || alerter)(out.pertinents_nouveaux).catch((e) => console.error('[Marchés] mail :', e.message));
    return { statut: 'OK', detail, ...out, pertinents_nouveaux: out.pertinents_nouveaux.map((x) => x.idweb) };
  } catch (e) {
    await db.pool.query('UPDATE marches_reglages SET releve_le = $1, releve_statut = $2, releve_detail = $3 WHERE id = 1', [maintenant, 'ÉCHEC', e.message]).catch(() => {});
    throw e;
  } finally { enCours = null; }
}

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) : 'non précisée');
async function alerter(marches) {
  const mail = require('./emailService');
  const to = process.env.ALERT_EMAIL || process.env.REPORT_REPLY_TO || process.env.EMAIL_USER;
  if (!to) return;
  const lignes = marches.map((m) => `• ${m.objet}\n  ${m.acheteur || 'acheteur non précisé'}${m.departements.length ? ` (${m.departements.join(', ')})` : ''} · réponse avant le ${fmtDate(m.date_limite)}${m.montant ? ` · environ ${Math.round(m.montant).toLocaleString('fr-FR')} € HT` : m.tranche ? ` · ${m.tranche}` : ''}\n  ${m.themes.map((t) => (THEMES[t] || {}).libelle || t).join(', ')}\n  ${m.url}`);
  const texte = `${marches.length} nouveau(x) marché(s) public(s) web pour vous :\n\n${lignes.join('\n\n')}\n\nÀ suivre dans le CRM : Portefeuille > Signaux > Marchés publics.`;
  await mail.sendEmail({ to, subject: `Marchés publics : ${marches.length} nouveau(x) marché(s) web`, text: texte, html: `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;white-space:pre-line">${texte.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</div>` });
}

// ---------- lecture et suivi ----------
const STATUTS = ['nouveau', 'a_etudier', 'je_reponds', 'repondu', 'gagne', 'perdu', 'ecarte'];
async function lister(db, { theme = null, statut = null, cible = 'pertinent', ouverts = true, departement = null, limite = 200 } = {}) {
  await assurerTables(db.pool);
  if (theme && !THEMES[theme]) throw err(400, `thème inconnu : ${theme} (${Object.keys(THEMES).join(', ')})`);
  if (statut && !STATUTS.includes(statut)) throw err(400, `statut inconnu : ${statut}`);
  const { rows } = await db.pool.query(
    `SELECT * FROM marches_publics
      WHERE ($1::text IS NULL OR $1 = ANY(themes)) AND ($2::text IS NULL OR statut = $2) AND ($3::text IS NULL OR cible = $3)
        AND (NOT $4 OR date_limite IS NULL OR date_limite >= NOW() OR statut IN ('je_reponds', 'repondu'))
        AND ($5::text IS NULL OR $5 = ANY(departements))
      ORDER BY (statut = 'ecarte'), date_limite NULLS LAST, score DESC LIMIT $6`,
    [theme, statut, cible === 'tous' ? null : cible, !!ouverts, departement, Math.min(500, Number(limite) || 200)]);
  const totaux = (await db.pool.query(
    `SELECT COUNT(*) FILTER (WHERE cible = 'pertinent' AND statut <> 'ecarte' AND (date_limite IS NULL OR date_limite >= NOW()))::int AS ouverts,
            COUNT(*) FILTER (WHERE cible = 'pertinent' AND statut = 'nouveau' AND (date_limite IS NULL OR date_limite >= NOW()))::int AS nouveaux,
            COUNT(*) FILTER (WHERE cible = 'pertinent' AND 'maintenance' = ANY(themes) AND statut <> 'ecarte' AND (date_limite IS NULL OR date_limite >= NOW()))::int AS maintenance,
            COUNT(*) FILTER (WHERE statut IN ('je_reponds', 'repondu'))::int AS en_reponse,
            COUNT(*) FILTER (WHERE cible = 'hors_cible' AND (date_limite IS NULL OR date_limite >= NOW()))::int AS hors_cible
       FROM marches_publics`)).rows[0];
  const r = await reglages(db);
  return {
    marches: rows, totaux, themes: Object.fromEntries(Object.entries(THEMES).map(([k, t]) => [k, t.libelle])), statuts: STATUTS,
    releve: { le: r.releve_le, statut: r.releve_statut, detail: r.releve_detail, en_cours: enCours }, reglages: { montant_max: r.montant_max, departements: r.departements || [], exclusions: r.exclusions || [], alerte_mail: r.alerte_mail },
  };
}
async function suivre(db, idweb, { statut, note } = {}) {
  await assurerTables(db.pool);
  if (statut !== undefined && !STATUTS.includes(statut)) throw err(400, `statut : ${STATUTS.join(', ')}`);
  const r = await db.pool.query(
    `UPDATE marches_publics SET statut = COALESCE($2, statut), statut_le = CASE WHEN $2::text IS NULL THEN statut_le ELSE NOW() END,
       note = CASE WHEN $3::boolean THEN $4 ELSE note END, updated_at = NOW() WHERE idweb = $1 RETURNING *`,
    [String(idweb), statut === undefined ? null : statut, note !== undefined, note === undefined ? null : String(note || '').slice(0, 4000) || null]);
  if (!r.rowCount) throw err(404, `marché ${idweb} inconnu`);
  return r.rows[0];
}

function lancer(db) {
  if (enCours) return { en_cours: enCours };
  relever(db).catch((e) => console.error('[Marchés] relevé en échec :', e.message));
  return { lance: true };
}
function start(db) {
  const cron = require('node-cron');
  assurerTables(db.pool).catch((e) => console.error('[Marchés] tables :', e.message));
  for (const h of ['47 7 * * *', '47 13 * * *']) cron.schedule(h, () => { relever(db).then((x) => console.log(`[Marchés] ${x.detail}`)).catch((e) => console.error('[Marchés] relevé en échec :', e.message)); }, { timezone: 'Europe/Paris' });
}

module.exports = { THEMES, STATUTS, analyser, lireDonnees, assurerTables, reglages, regler, relever, lister, suivre, lancer, start, pageApi };
