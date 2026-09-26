// backend/services/domainSignalService.js
//
// Pipeline des signaux d'intention « nouveaux domaines .fr » (AFNIC) :
//   fichier du jour -> filtre sur le nom -> déjà connu ? -> analyse du site (cc_prospector detect)
//   -> entreprise correspondante (recherche-entreprises, avec date de création) -> score -> statut.
// Puis SURVEILLANCE à échéances (J+7, 15, 30, 60, 90) : re-analyse, re-match SIRENE, et quand un
// site apparaît sur un domaine suivi, il rejoint le crawl classique (crawl_results) pour l'email
// par la preuve. La promotion en prospect est un geste manuel (promote).
//
// Tout est en db.pool.query. Les fonctions pures sont dans utils/domainSignals.js.
const axios = require('axios');
const sireneEnrich = require('./sireneEnrich');
const { runDetect } = require('./ccProspectorRunner');
const crawl = require('../controllers/crawlController');
const S = require('../utils/domainSignals');
const { normalizeDomain } = require('../utils/csvParse');
const { departmentFromPostalCode } = require('../utils/prospectScore');

// Fichier quotidien AFNIC des domaines créés (open data, gratuit, disponible sept jours).
// {date} = AAAAMMJJ. Surcharge possible par AFNIC_CREA_URL si l'AFNIC déplace le fichier.
const AFNIC_URL = process.env.AFNIC_CREA_URL || 'https://www.afnic.fr/wp-media/ftp/domaineTLD_Afnic/{date}_CREA_fr.txt';
const SIRENE_DELAY_MS = parseInt(process.env.SIGNAL_SIRENE_DELAY_MS || '250', 10); // l'API publique tolère ~7 req/s
const RECHECK_BATCH = parseInt(process.env.SIGNAL_RECHECK_BATCH || '800', 10);

let busy = null; // 'import' | 'recheck' | null : un seul traitement lourd à la fois

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isoDay = (d) => { const x = d instanceof Date ? d : new Date(d); return Number.isNaN(x.getTime()) ? null : x.toISOString().slice(0, 10); };

function afnicUrl(jour) {
  return AFNIC_URL.replace('{date}', String(jour).replace(/-/g, ''));
}

async function fetchAfnic(jour) {
  const url = afnicUrl(jour);
  const res = await axios.get(url, { timeout: 30000, responseType: 'text', headers: { 'User-Agent': 'CRM-PixFeed/1.0 (+https://pixfeed.net)' }, validateStatus: () => true });
  if (res.status === 404) throw new Error(`Aucun fichier AFNIC pour le ${jour} (les fichiers restent sept jours en ligne).`);
  if (res.status >= 400) throw new Error(`AFNIC a répondu ${res.status} pour ${url}`);
  return typeof res.data === 'string' ? res.data : String(res.data || '');
}

async function updateImport(db, id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  await db.pool.query(`UPDATE domain_signal_imports SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${keys.length + 1}`, [...keys.map((k) => fields[k]), id]);
}

async function updateSignal(db, id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  await db.pool.query(`UPDATE domain_signals SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = NOW() WHERE id = $${keys.length + 1}`, [...keys.map((k) => fields[k]), id]);
}

// Tous les domaines déjà connus du CRM : crawl, prospects, signaux. Un domaine n'entre qu'une fois.
async function knownDomains(db) {
  const set = new Set();
  const add = (v) => { const d = normalizeDomain(v); if (d && d.includes('.')) set.add(d); };
  const q = async (sql) => { try { (await db.pool.query(sql)).rows.forEach((r) => add(r.d)); } catch { /* table absente */ } };
  await q('SELECT domain AS d FROM crawl_seen_domains');
  await q('SELECT DISTINCT domain AS d FROM crawl_results WHERE domain IS NOT NULL');
  await q("SELECT company AS d FROM leads WHERE company IS NOT NULL AND company <> ''");
  await q("SELECT website AS d FROM leads WHERE website IS NOT NULL AND website <> ''");
  await q('SELECT domain AS d FROM domain_signals');
  return set;
}

// ─── Entreprise correspondante ───────────────────────────────────────────────
// À J+0 il n'y a que le nom du domaine : on interroge l'annuaire avec ses mots. Un nom
// générique (« plomberie-lyon ») peut coller à n'importe quelle entreprise du métier : on
// dégrade alors la confiance à « probable ». Sans correspondance, rien n'est écrit (et on
// réessaie à chaque contrôle : beaucoup réservent le domaine avant l'immatriculation).
async function matchCompany(signal) {
  const root = String(signal.domain || '').replace(/\.fr$/, '');
  const query = root.replace(/-/g, ' ').trim();
  if (query.length < 3) return { match_confidence: 'aucun' };
  const data = await sireneEnrich.enrichMatch({ query, domain: signal.domain, title: signal.title || '' });
  if (!data.found) return { match_confidence: 'aucun' };
  let conf = data.match; // sur | probable | douteux
  const compactRoot = root.replace(/-/g, '');
  if (conf === 'sur' && signal.metier && compactRoot.length < 8) conf = 'probable';
  if (data.etat === 'C') return { match_confidence: 'aucun' }; // entreprise cessée : pas elle
  if (conf === 'douteux') return { match_confidence: 'douteux', match_score: data.match_score };
  return {
    match_confidence: conf,
    match_score: data.match_score,
    company_name: data.raison_sociale,
    siren: data.siren,
    naf: data.naf,
    naf_label: data.naf_label,
    dirigeant: data.dirigeant,
    effectif: data.effectif,
    city: data.ville,
    postal_code: data.code_postal,
    department: departmentFromPostalCode(data.code_postal),
    company_created_at: data.date_creation || null,
    nature_juridique: data.nature_juridique || null
  };
}

// ─── Analyse d'une ligne detect -> champs « site » du signal ─────────────────
function siteFields(rawRow, domain) {
  const typed = crawl.typedResult(rawRow);
  const website_status = S.websiteStatus(rawRow, domain);
  return {
    website_status,
    platform: typed.platform,
    title: typed.title,
    http_status: typed.http_status,
    final_url: typed.final_url,
    email: typed.email,
    phone: typed.phone,
    audit: JSON.stringify(typed)
  };
}

// Score + statut + prochain contrôle, écrits en base. Renvoie le signal mis à jour.
async function scoreAndQualify(db, signal, now = new Date(), { compteControle = true } = {}) {
  const { score, signaux } = S.intentScore(signal, now);
  const q = S.qualify({ ...signal, intent_score: score }, now);
  const fields = { intent_score: score, signaux: JSON.stringify(signaux), statut: q.statut, raison_rejet: q.raison_rejet, next_check_at: q.next_check_at };
  if (compteControle) { fields.last_checked_at = now; fields.checks = (signal.checks || 0) + 1; }
  await updateSignal(db, signal.id, fields);
  return { ...signal, ...fields, signaux };
}

// Job de crawl « signaux » : reçoit les sites apparus sur des domaines suivis, pour que l'email
// par la preuve et le panneau Crawl les traitent comme n'importe quel résultat.
async function ensureSignalJob(db) {
  const r = await db.pool.query("SELECT id FROM crawl_jobs WHERE techno = 'signaux' ORDER BY id LIMIT 1");
  if (r.rows[0]) return r.rows[0].id;
  const ins = await db.pool.query(
    "INSERT INTO crawl_jobs (techno, nb_sites, statut, phase, message) VALUES ('signaux', 0, 'done', 'done', 'Sites apparus sur des domaines suivis (signaux AFNIC)') RETURNING id"
  );
  return ins.rows[0].id;
}

// Un site actif est copié dans crawl_results (une fois), avec l'entreprise déjà identifiée.
async function attachCrawlResult(db, signal, typed) {
  if (signal.crawl_result_id) return signal.crawl_result_id;
  const jobId = await ensureSignalJob(db);
  const id = await crawl.insertCrawlResult(db, jobId, typed);
  if (signal.match_confidence === 'sur' || signal.match_confidence === 'probable') {
    await db.pool.query(
      `UPDATE crawl_results SET sirene_match = $1, raison_sociale = $2, gerant = $3, siren = $4, naf = $5, naf_label = $6,
              effectif = $7, code_postal = $8, ville = $9 WHERE id = $10`,
      [signal.match_confidence, signal.company_name, signal.dirigeant, signal.siren, signal.naf, signal.naf_label, signal.effectif, signal.postal_code, signal.city, id]
    );
  }
  await crawl.rescoreJob(db, jobId, [id]);
  await updateSignal(db, signal.id, { crawl_result_id: id });
  return id;
}

// ─── Import d'un fichier AFNIC ───────────────────────────────────────────────
/**
 * Démarre un import (asynchrone). `jour` = 'AAAA-MM-JJ' du fichier ; `texte` = contenu collé à
 * la main (repli quand le téléchargement est impossible). Renvoie l'id de l'import.
 */
async function startImport(db, { jour, texte } = {}) {
  if (busy) throw Object.assign(new Error(busy === 'import' ? 'Un import est déjà en cours.' : 'Une revérification est en cours, réessayez dans quelques minutes.'), { status: 409 });
  const day = isoDay(jour || new Date(Date.now() - 86400000));
  if (!day) throw Object.assign(new Error('Date invalide'), { status: 400 });
  const ins = await db.pool.query(
    "INSERT INTO domain_signal_imports (source, jour, statut, phase) VALUES ('afnic', $1, 'running', 'telechargement') RETURNING id",
    [day]
  );
  const importId = ins.rows[0].id;
  busy = 'import';
  runImport(db, importId, day, texte).catch(async (e) => {
    console.error('[Signaux] Import échoué:', e.message);
    await updateImport(db, importId, { statut: 'error', message: String(e.message).slice(0, 2000), finished_at: new Date() }).catch(() => {});
  }).finally(() => { busy = null; });
  return importId;
}

async function runImport(db, importId, day, texte) {
  const text = texte && String(texte).trim() ? String(texte) : await fetchAfnic(day);
  const domains = S.parseAfnicList(text);
  await updateImport(db, importId, { nb_lus: domains.length, phase: 'filtrage' });
  if (domains.length === 0) {
    await updateImport(db, importId, { statut: 'done', phase: 'done', message: 'Aucun domaine .fr lisible dans ce fichier.', finished_at: new Date() });
    return;
  }

  // Filtre sur le nom, puis déjà connus.
  const known = await knownDomains(db);
  let nbFiltres = 0; let nbConnus = 0;
  const candidates = [];
  for (const d of domains) {
    const f = S.filterDomain(d);
    if (!f.ok) { nbFiltres++; continue; }
    if (known.has(d)) { nbConnus++; continue; }
    candidates.push({ domain: d, metier: S.metierHint(f.root) });
  }
  await updateImport(db, importId, { nb_filtres: nbFiltres, nb_connus: nbConnus, nb_nouveaux: candidates.length, phase: 'analyse', progress_total: candidates.length, progress_done: 0 });

  const signals = [];
  for (const c of candidates) {
    const r = await db.pool.query(
      `INSERT INTO domain_signals (domain, source, import_id, registered_at, statut, metier)
       VALUES ($1, 'afnic', $2, $3, 'nouveau', $4) ON CONFLICT (domain) DO NOTHING RETURNING *`,
      [c.domain, importId, day, c.metier]
    );
    if (r.rows[0]) signals.push(r.rows[0]);
  }
  if (signals.length === 0) {
    await updateImport(db, importId, { statut: 'done', phase: 'done', finished_at: new Date() });
    return;
  }

  await analyzeAndQualify(db, signals, { onProgress: (done, total) => updateImport(db, importId, { progress_done: done, progress_total: total }).catch(() => {}), onPhase: (phase) => updateImport(db, importId, { phase }).catch(() => {}) });

  const q = await db.pool.query("SELECT COUNT(*)::int AS n FROM domain_signals WHERE import_id = $1 AND statut = 'qualifie'", [importId]);
  await updateImport(db, importId, { statut: 'done', phase: 'done', nb_qualifies: q.rows[0].n, progress_done: signals.length, progress_total: signals.length, finished_at: new Date() });
}

// Analyse (site) + entreprise + score pour une liste de signaux (import ou contrôle).
async function analyzeAndQualify(db, signals, { onProgress, onPhase, mode = 'import' } = {}) {
  // Contrôle à échéance : l'annuaire d'abord (une entreprise est-elle apparue ?), puis le site
  // seulement pour les domaines qui ont un indice. Sinon 3 000 domaines sans rien sont
  // re-analysés cinq fois pour rien.
  if (mode === 'recheck') await matchUnmatched(db, signals);
  const aAnalyser = mode === 'recheck'
    ? signals.filter((s) => s.match_confidence === 'sur' || s.match_confidence === 'probable' || s.metier)
    : signals;
  const byDomain = new Map(aAnalyser.map((s) => [s.domain, s]));
  let rows = [];
  try {
    // Domaines neufs : la plupart ne répondent pas ou affichent une page d'attente. Plus de
    // connexions en parallèle et un délai plus court qu'au crawl, sinon 3 000 domaines = une heure.
    rows = await runDetect([...byDomain.keys()], { onProgress, concurrency: parseInt(process.env.SIGNAL_DETECT_CONCURRENCY || '25', 10), timeout: parseInt(process.env.SIGNAL_DETECT_TIMEOUT || '7', 10) });
  } catch (e) {
    // Analyseur indisponible : on qualifie quand même sur l'entreprise, le site reste « inconnu ».
    console.error('[Signaux] Analyse des sites impossible :', e.message);
  }
  const now = new Date();
  for (const row of rows) {
    const s = byDomain.get(normalizeDomain(row.domain));
    if (!s) continue;
    const f = siteFields(row, s.domain);
    const avantSansSite = S.SANS_SITE.has(s.website_status) || s.website_status === 'erreur' || s.website_status === 'protege';
    // Bascule : le domaine suivi porte maintenant un vrai site -> il rejoint le crawl classique.
    if ((s.checks || 0) > 0 && avantSansSite && f.website_status === 'actif') f.site_apparu_le = now;
    await updateSignal(db, s.id, f);
    Object.assign(s, f, { audit: JSON.parse(f.audit) });
  }

  if (onPhase) await onPhase('sirene');
  if (mode !== 'recheck') await matchUnmatched(db, signals);

  if (onPhase) await onPhase('qualification');
  for (const s of signals) {
    const q = await scoreAndQualify(db, s, now);
    // Site en ligne et signal retenu : il rejoint le crawl classique (audit, angles, preuves).
    if (q.website_status === 'actif' && q.statut !== 'rejete' && !q.crawl_result_id && s.audit && typeof s.audit === 'object') {
      s.crawl_result_id = await attachCrawlResult(db, q, s.audit).catch((e) => { console.error('[Signaux] crawl_results:', e.message); return null; });
    }
  }
}

// Recherche de l'entreprise pour les signaux pas encore identifiés (un appel par domaine, espacé).
async function matchUnmatched(db, signals) {
  for (const s of signals) {
    if (s.website_status === 'redirection') continue; // alias : rejeté sans appel réseau
    if (s.match_confidence === 'sur' || s.match_confidence === 'probable') continue; // déjà identifiée
    try {
      const m = await matchCompany(s);
      await updateSignal(db, s.id, m);
      Object.assign(s, m);
      if (s.crawl_result_id && (m.match_confidence === 'sur' || m.match_confidence === 'probable')) {
        await db.pool.query(
          `UPDATE crawl_results SET sirene_match = $1, raison_sociale = $2, gerant = $3, siren = $4, naf = $5, naf_label = $6, effectif = $7, code_postal = $8, ville = $9 WHERE id = $10`,
          [m.match_confidence, m.company_name, m.dirigeant, m.siren, m.naf, m.naf_label, m.effectif, m.postal_code, m.city, s.crawl_result_id]
        ).catch(() => {});
      }
    } catch (e) {
      console.error('[Signaux] SIRENE', s.domain, e.message);
    }
    await sleep(SIRENE_DELAY_MS);
  }
}

// Recalcul sans réseau (règles de score ou de métier modifiées) : tout ce qui n'est ni promu ni
// écarté à la main est re-noté et re-classé à partir des données déjà en base.
async function requalify(db) {
  const { rows } = await db.pool.query(
    "SELECT * FROM domain_signals WHERE statut <> 'promu' AND (statut <> 'rejete' OR raison_rejet IS DISTINCT FROM 'écarté à la main')"
  );
  const now = new Date();
  let n = 0;
  for (const s of rows) {
    const metier = S.metierHint(s.domain.replace(/\.fr$/, ''));
    if (metier !== s.metier) { await updateSignal(db, s.id, { metier }); s.metier = metier; }
    await scoreAndQualify(db, s, now, { compteControle: false });
    n++;
  }
  return { requalified: n };
}

// ─── Surveillance ────────────────────────────────────────────────────────────
async function recheckSignals(db, ids) {
  if (busy) throw Object.assign(new Error(busy === 'import' ? 'Un import est en cours, réessayez ensuite.' : 'Une revérification est déjà en cours.'), { status: 409 });
  const { rows } = await db.pool.query("SELECT * FROM domain_signals WHERE id = ANY($1::int[]) AND statut <> 'promu'", [ids]);
  if (rows.length === 0) return { checked: 0 };
  busy = 'recheck';
  try {
    await analyzeAndQualify(db, rows, { mode: 'recheck' });
  } finally {
    busy = null;
  }
  return { checked: rows.length };
}

// Contrôles arrivés à échéance (appelé chaque matin par le worker).
async function recheckDue(db) {
  const { rows } = await db.pool.query(
    `SELECT id FROM domain_signals
     WHERE statut = 'nouveau' -- jamais analysés (import interrompu par un redémarrage)
        OR (statut IN ('a_surveiller', 'qualifie') AND next_check_at IS NOT NULL AND next_check_at <= NOW())
     ORDER BY next_check_at NULLS FIRST LIMIT $1`, [RECHECK_BATCH]
  );
  if (rows.length === 0) return { checked: 0 };
  return recheckSignals(db, rows.map((r) => r.id));
}

// ─── Promotion en prospect ──────────────────────────────────────────────────
function signalNotes(s) {
  const lignes = ['Signaux détectés :', ...(Array.isArray(s.signaux) ? s.signaux : []).map((x) => `✓ ${x}`)];
  if (s.registered_at) lignes.push(`✓ Domaine créé le ${new Date(s.registered_at).toLocaleDateString('fr-FR')}`);
  return lignes.join('\n');
}

async function promote(db, ids, { relation_status = 'nouveau', note = '' } = {}) {
  const statusVal = relation_status === 'pas_business' ? 'pas_business' : 'nouveau';
  const userNote = String(note || '').trim();
  const { rows } = await db.pool.query("SELECT * FROM domain_signals WHERE id = ANY($1::int[]) AND statut <> 'promu'", [ids]);
  let created = 0; const leadIds = []; const skipped = [];
  for (const s of rows) {
    // Déjà prospect ? (company = domaine, ou site web sur ce domaine exactement — pas « plaza.fr » pour « a.fr »)
    const cand = await db.pool.query('SELECT id, company, website FROM leads WHERE LOWER(company) = LOWER($1) OR LOWER(website) LIKE $2', [s.domain, `%${s.domain}%`]).catch(() => ({ rows: [] }));
    const dup = cand.rows.find((l) => normalizeDomain(l.company) === s.domain || normalizeDomain(l.website) === s.domain);
    if (dup) { skipped.push({ domain: s.domain, raison: `déjà prospect (#${dup.id})` }); await updateSignal(db, s.id, { statut: 'promu', prospect_id: dup.id }); continue; }
    if (s.email) {
      const de = await db.pool.query('SELECT id FROM leads WHERE LOWER(email) = LOWER($1) LIMIT 1', [s.email]).catch(() => ({ rows: [] }));
      if (de.rows.length) { skipped.push({ domain: s.domain, raison: `email déjà présent (prospect #${de.rows[0].id})` }); continue; }
    }
    try {
      let leadId;
      const extraNotes = [userNote || null, signalNotes(s)].filter(Boolean);
      if (s.crawl_result_id) {
        // Site en ligne : même chemin que le crawl (angles, score, preuves).
        const cr = await db.pool.query('SELECT * FROM crawl_results WHERE id = $1', [s.crawl_result_id]);
        if (cr.rows[0]) {
          leadId = await crawl.createLeadFromResult(db, cr.rows[0], { statusVal, source: 'AFNIC', sourceLine: 'Signal AFNIC (nouveau domaine .fr, site en ligne)', extraNotes });
        }
      }
      if (!leadId) {
        // Domaine réservé sans site : prospect « création de site ».
        const notes = [
          s.company_name ? `Raison sociale : ${s.company_name}${s.siren ? ` (SIREN ${s.siren})` : ''}` : null,
          s.dirigeant ? `Dirigeant : ${s.dirigeant}` : null,
          s.company_created_at ? `Entreprise créée le ${new Date(s.company_created_at).toLocaleDateString('fr-FR')}` : null,
          `Site : ${S.SANS_SITE.has(s.website_status) ? 'aucun (' + s.website_status + ')' : s.website_status}`,
          ...extraNotes,
          'Source : Signal AFNIC (nouveau domaine .fr)'
        ].filter(Boolean).join('\n');
        const ins = await db.pool.query(
          `INSERT INTO leads (name, company, type, status, source, notes, email, phone, relation_status, website, siren, sector, naf, effectif, city, postal_code, department, angles, score, created_at, updated_at)
           VALUES ($1, $2, 'company', 'nouveau', 'AFNIC', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'creation_site', $15, NOW(), NOW()) RETURNING id`,
          [s.company_name || s.domain, s.domain, notes, s.email || null, s.phone || null, statusVal, `https://${s.domain}`, s.siren || null,
           s.naf_label || null, s.naf || null, s.effectif || null, s.city || null, s.postal_code || null, s.department || null, s.intent_score || 0]
        );
        leadId = ins.rows[0].id;
      }
      await db.pool.query('INSERT INTO crawl_seen_domains (domain, source) VALUES ($1, $2) ON CONFLICT (domain) DO NOTHING', [s.domain, 'afnic']).catch(() => {});
      await updateSignal(db, s.id, { statut: 'promu', prospect_id: leadId, next_check_at: null });
      leadIds.push(leadId); created++;
    } catch (e) {
      console.error('[Signaux] Promotion', s.domain, e.message);
      skipped.push({ domain: s.domain, raison: e.message });
    }
  }
  return { created, lead_ids: leadIds, skipped };
}

async function reject(db, id, raison) {
  await updateSignal(db, id, { statut: 'rejete', raison_rejet: String(raison || 'écarté à la main').slice(0, 200), next_check_at: null });
}

// Au démarrage du serveur : un import laissé « en cours » par un redémarrage ne finira jamais.
async function markInterrupted(db) {
  const r = await db.pool.query(
    "UPDATE domain_signal_imports SET statut = 'error', message = 'Interrompu par un redémarrage du serveur. Les domaines déjà enregistrés seront analysés au prochain contrôle (06:15) ou via « Revérifier ».', finished_at = NOW() WHERE statut = 'running'"
  ).catch(() => ({ rowCount: 0 }));
  if (r.rowCount) console.log(`[Signaux] ${r.rowCount} import(s) interrompu(s) marqué(s) en erreur`);
}

module.exports = { markInterrupted, requalify, startImport, recheckSignals, recheckDue, promote, reject, matchCompany, siteFields, afnicUrl, knownDomains, isBusy: () => busy };
