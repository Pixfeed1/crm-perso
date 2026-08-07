// backend/controllers/crawlController.js
//
// Pilote l'outil externe cc_prospector : lance un crawl en arrière-plan, parse sa
// sortie (stdout+stderr) pour suivre phase/progression, ingère le CSV dans crawl_results,
// exporte un CSV nettoyé, et transforme des résultats en prospects (réutilise leadModel).

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { detectNoCode } = require('../utils/nocodePlatforms');
const { decodeHtml } = require('../utils/decodeHtml');
const { isAntibotTitle } = require('../utils/antibotTitle');
const sireneEnrich = require('../services/sireneEnrich');
const { problemesLisibles } = require('../utils/crawlAngles');

// Constantes faciles à mettre à jour (override possible par variables d'env).
// L'interpréteur reste hors dépôt : un venv ne se versionne pas (il contient des
// binaires compilés). Le SCRIPT, lui, est celui du dépôt : un `git pull` suffit
// donc à mettre le crawler à jour, sans copie manuelle vers un dossier externe.
const PYTHON_BIN = process.env.CC_PROSPECTOR_PYTHON || '/home/jurojinn/tools/cc_prospector/venv/bin/python';
const SCRIPT = process.env.CC_PROSPECTOR_SCRIPT
  || path.join(__dirname, '..', '..', 'tools', 'cc_prospector', 'cc_prospector.py');
const COMMON_CRAWL_ID = process.env.COMMON_CRAWL_ID || 'CC-MAIN-2026-21';

// `spip` / `drupal` / `cms` cherchent TOUS les sites du CMS concerné (tous secteurs) :
// la découverte e-commerce ne les trouvait jamais, faute d'URL de type panier/produit.
const VALID_TECHNO = ['ecommerce', 'woocommerce', 'prestashop', 'spip', 'drupal', 'cms'];

// Un seul job en cours à la fois (verrou en mémoire процессus).
let runningJobId = null;

// --- Petit parseur CSV (gère les champs entre guillemets et les virgules internes) ---
function parseCsv(content) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else { field += c; }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && content[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else { field += c; }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function updateJob(db, id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  await db.pool.query(`UPDATE crawl_jobs SET ${set} WHERE id = $${keys.length + 1}`, [...keys.map((k) => fields[k]), id]);
}

// Normalise un domaine/url pour comparaison (minuscule, sans schéma ni www, sans chemin).
function normalizeDomain(value) {
  if (!value) return '';
  let s = String(value).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  s = s.split('/')[0].split('?')[0];
  return s.trim();
}

// Construit le fichier d'exclusion (un domaine par ligne) = domaines déjà connus :
// crawl_results (tous jobs) UNION domaines/sites des leads. Renvoie le nb de lignes.
async function buildExcludeFile(db, filePath) {
  const set = new Set();
  try {
    const cr = await db.pool.query('SELECT DISTINCT domain FROM crawl_results WHERE domain IS NOT NULL');
    cr.rows.forEach((r) => { const d = normalizeDomain(r.domain); if (d) set.add(d); });
    // Domaines/sites des leads (le crawl stocke le domaine dans company).
    const ld = await db.pool.query("SELECT company FROM leads WHERE company IS NOT NULL AND company <> ''");
    ld.rows.forEach((r) => { const d = normalizeDomain(r.company); if (d && d.includes('.')) set.add(d); });
  } catch (e) {
    console.error('[Crawl] Erreur construction liste exclusion:', e.message);
  }
  if (set.size === 0) return 0;
  fs.writeFileSync(filePath, Array.from(set).join('\n') + '\n', 'utf8');
  return set.size;
}

// Lance le process Python et suit sa progression.
async function runCrawl(db, jobId, techno, nbSites) {
  const jobDir = path.join(os.tmpdir(), `crawl-${jobId}`);
  const csvPath = path.join(jobDir, 'results.csv');
  fs.mkdirSync(jobDir, { recursive: true });

  // Liste d'exclusion : on ne ramène que des domaines jamais vus.
  const excludePath = path.join(jobDir, 'exclude.txt');
  const excludeCount = await buildExcludeFile(db, excludePath);

  const args = ['run', '--crawl', COMMON_CRAWL_ID, '--mode', techno, '--max-domains', String(nbSites), '--output', csvPath];
  if (excludeCount > 0) args.push('--exclude', excludePath);
  const child = spawn(PYTHON_BIN, [SCRIPT, ...args], { cwd: jobDir });

  let stderrTail = [];
  let phase = 'recherche';
  let total = 0;
  let done = 0;

  const pushTail = (line) => { stderrTail.push(line); if (stderrTail.length > 12) stderrTail.shift(); };

  const handleLine = (line, isErr) => {
    if (isErr) pushTail(line);
    // Phase recherche (stderr)
    if (/Listage des fichiers|fichiers Parquet trouvés|Lecture de l'index/i.test(line)) {
      if (phase !== 'detection') { phase = 'recherche'; updateJob(db, jobId, { phase }).catch(() => {}); }
    }
    // Phase détection (stdout) : "Détection sur N domaines"
    const det = line.match(/Détection sur (\d+) domaines/);
    if (det) {
      phase = 'detection'; total = parseInt(det[1], 10) || 0;
      updateJob(db, jobId, { phase, progress_total: total }).catch(() => {});
    }
    // Progression : "  ... X/N traités"
    const prog = line.match(/(\d+)\/(\d+)\s+traités/);
    if (prog) {
      done = parseInt(prog[1], 10) || 0; total = parseInt(prog[2], 10) || total;
      if (phase !== 'detection') phase = 'detection';
      updateJob(db, jobId, { phase, progress_done: done, progress_total: total }).catch(() => {});
    }
  };

  let bufOut = '';
  let bufErr = '';
  child.stdout.on('data', (d) => {
    bufOut += d.toString();
    const lines = bufOut.split('\n'); bufOut = lines.pop();
    lines.forEach((l) => handleLine(l, false));
  });
  child.stderr.on('data', (d) => {
    bufErr += d.toString();
    const lines = bufErr.split('\n'); bufErr = lines.pop();
    lines.forEach((l) => handleLine(l, true));
  });

  const cleanup = () => { try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch (e) { /* ignore */ } };

  child.on('error', async (err) => {
    runningJobId = null;
    await updateJob(db, jobId, { statut: 'error', message: `Lancement impossible : ${err.message}` }).catch(() => {});
    cleanup();
  });

  child.on('close', async (code) => {
    try {
      if (code === 0 && fs.existsSync(csvPath)) {
        await ingestCsv(db, jobId, csvPath);
        await updateJob(db, jobId, { statut: 'done', phase: 'done', progress_done: total || done, progress_total: total || done });
      } else {
        await updateJob(db, jobId, { statut: 'error', message: (stderrTail.join('\n') || `Le crawl a échoué (code ${code}).`).slice(0, 2000) });
      }
    } catch (e) {
      await updateJob(db, jobId, { statut: 'error', message: `Erreur d'ingestion : ${e.message}` }).catch(() => {});
    } finally {
      runningJobId = null;
      cleanup();
    }
  });
}

// Ingestion du CSV de l'outil (colonnes : domain, platform, signals, http_status, final_url, title, error)
async function ingestCsv(db, jobId, csvPath) {
  const content = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(content);
  if (rows.length === 0) return;
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  const di = idx('domain'), pi = idx('platform'), si = idx('signals'),
    hi = idx('http_status'), fi = idx('final_url'), ti = idx('title'), ei = idx('error');
  // Colonnes d'enrichissement (cc_prospector) — absentes des anciens CSV : idx = -1 -> null.
  const emi = idx('email'), phi = idx('phone'), fbi = idx('facebook_url'), igi = idx('instagram_url'),
    pvi = idx('platform_version'), sli = idx('ssl_ok'), pri = idx('protected'),
    lgi = idx('lang'), pki = idx('parked');
  // Colonnes d'audit gratuit (ajoutées ensuite) — idx = -1 -> null (rétro-compatible).
  const moi = idx('mobile_ok'), mdi = idx('meta_desc'), h1i = idx('h1_present'),
    mli = idx('mentions_legales'), rgi = idx('rgpd_confidentialite'), cbi = idx('cookie_banner'),
    ani = idx('analytics'), poi = idx('poids_ko'), coi = idx('copyright_annee'),
    spi = idx('serveur_php'), sfi = idx('spf'), dmi = idx('dmarc'), sei = idx('ssl_expire_jours'),
    sti = idx('site_type'), eci = idx('ecommerce_actif');
  const cell = (row, i) => (i >= 0 ? ((row[i] || '').trim() || null) : null);
  const boolCell = (row, i) => { const v = cell(row, i); return v == null ? null : /^(oui|true|1|yes)$/i.test(v); };
  // Entier ou null (jamais NaN) — pour poids_ko / copyright_annee / ssl_expire_jours.
  const intCell = (row, i) => { const v = cell(row, i); if (v == null) return null; const n = parseInt(v, 10); return Number.isNaN(n) ? null : n; };

  // Dédoublonnage de sécurité : domaines déjà présents en base (tous jobs) + intra-CSV.
  const seen = new Set();
  try {
    const ex = await db.pool.query('SELECT DISTINCT domain FROM crawl_results WHERE domain IS NOT NULL');
    ex.rows.forEach((r) => { const d = normalizeDomain(r.domain); if (d) seen.add(d); });
  } catch (e) {
    console.error('[Crawl] Erreur préchargement dédoublonnage:', e.message);
  }

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const domain = di >= 0 ? (row[di] || '').trim() : '';
    if (!domain) continue;
    const norm = normalizeDomain(domain);
    if (seen.has(norm)) continue; // déjà connu : on ignore silencieusement
    seen.add(norm);
    const httpRaw = hi >= 0 ? parseInt(row[hi], 10) : null;
    const platform = pi >= 0 ? (row[pi] || null) : null;
    const signals = si >= 0 ? (row[si] || null) : null;
    const finalUrl = fi >= 0 ? (row[fi] || null) : null;
    // Le <title> scrapé est encodé en HTML (&#039; &eacute; ...) -> on le décode à l'ingestion.
    // Et si c'est un titre de page anti-bot (Cloudflare "Just a moment..." etc.), on le jette :
    // le domaine servira de nom à la promotion en prospect.
    let title = ti >= 0 ? (decodeHtml(row[ti]) || null) : null;
    if (isAntibotTitle(title)) title = null;
    // Filtre no-code/SaaS fermé (Wix, Squarespace, Webador...) : marqué -> masqué par défaut.
    const { isNoCode } = detectNoCode({ platform, signals, final_url: finalUrl, title, domain });
    await db.pool.query(
      `INSERT INTO crawl_results
         (job_id, domain, platform, signals, http_status, final_url, title, error, is_nocode,
          email, phone, facebook_url, instagram_url, platform_version, ssl_ok, protected, lang, parked,
          mobile_ok, meta_desc, h1_present, mentions_legales, rgpd_confidentialite, cookie_banner,
          analytics, poids_ko, copyright_annee, serveur_php, spf, dmarc, ssl_expire_jours,
          site_type, ecommerce_actif)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
               $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33)`,
      [
        jobId, domain, platform, signals,
        Number.isNaN(httpRaw) ? null : httpRaw,
        finalUrl, title,
        ei >= 0 ? (row[ei] || null) : null,
        isNoCode,
        cell(row, emi), cell(row, phi), cell(row, fbi), cell(row, igi),
        cell(row, pvi), boolCell(row, sli), boolCell(row, pri) || false,
        cell(row, lgi), boolCell(row, pki) || false,
        boolCell(row, moi), boolCell(row, mdi), boolCell(row, h1i), boolCell(row, mli),
        boolCell(row, rgi), boolCell(row, cbi), boolCell(row, ani),
        intCell(row, poi), intCell(row, coi), cell(row, spi),
        boolCell(row, sfi), boolCell(row, dmi), intCell(row, sei),
        cell(row, sti), boolCell(row, eci)
      ]
    );
  }
}

const crawlController = {
  /**
   * GET /api/portefeuille/crawl -> historique des jobs (récent -> ancien) + nb de résultats.
   */
  list: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const { rows } = await db.pool.query(
        `SELECT j.id, j.techno, j.nb_sites, j.statut, j.phase,
                j.progress_done, j.progress_total, j.message, j.created_at,
                COUNT(r.id)::int AS nb_results
         FROM crawl_jobs j
         LEFT JOIN crawl_results r ON r.job_id = j.id
         GROUP BY j.id
         ORDER BY j.created_at DESC, j.id DESC`
      );
      res.json(rows);
    } catch (error) {
      console.error('[Crawl] Erreur historique:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * DELETE /api/portefeuille/crawl/:id -> supprime le job + ses résultats (cascade).
   */
  remove: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    try {
      const r = await db.pool.query('DELETE FROM crawl_jobs WHERE id = $1 RETURNING id', [id]);
      if (r.rowCount === 0) return res.status(404).json({ message: 'Job introuvable' });
      res.json({ success: true });
    } catch (error) {
      console.error('[Crawl] Erreur suppression:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * POST /api/portefeuille/crawl { techno, nb_sites }
   */
  start: async (req, res) => {
    const db = req.app.locals.db;
    const { techno, nb_sites } = req.body || {};
    if (!VALID_TECHNO.includes(techno)) {
      return res.status(400).json({ message: `Techno invalide (${VALID_TECHNO.join(', ')})` });
    }
    const nb = Math.min(Math.max(parseInt(nb_sites, 10) || 0, 1), 5000);
    if (runningJobId) {
      return res.status(409).json({ message: 'Un crawl est déjà en cours. Patientez la fin.' });
    }
    try {
      const { rows } = await db.pool.query(
        `INSERT INTO crawl_jobs (techno, nb_sites, statut, phase) VALUES ($1, $2, 'running', 'recherche') RETURNING id`,
        [techno, nb]
      );
      const jobId = rows[0].id;
      runningJobId = jobId;
      // async, non bloquant : en cas d'échec avant le spawn, on libère le verrou et on marque l'erreur.
      runCrawl(db, jobId, techno, nb).catch(async (err) => {
        runningJobId = null;
        console.error('[Crawl] Erreur runCrawl:', err);
        await updateJob(db, jobId, { statut: 'error', message: `Erreur de lancement : ${err.message}` }).catch(() => {});
      });
      res.status(201).json({ id: jobId });
    } catch (error) {
      console.error('[Crawl] Erreur démarrage:', error);
      res.status(500).json({ message: 'Erreur lors du démarrage du crawl' });
    }
  },

  /**
   * GET /api/portefeuille/crawl/:id -> statut + phase + progress + message + résultats
   */
  get: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    try {
      const jr = await db.pool.query('SELECT * FROM crawl_jobs WHERE id = $1', [id]);
      if (jr.rows.length === 0) return res.status(404).json({ message: 'Job introuvable' });
      const rr = await db.pool.query(
        'SELECT * FROM crawl_results WHERE job_id = $1 ORDER BY platform ASC, domain ASC',
        [id]
      );
      res.json({ job: jr.rows[0], results: rr.rows });
    } catch (error) {
      console.error('[Crawl] Erreur lecture:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * GET /api/portefeuille/crawl/:id/export.csv -> CSV nettoyé (UTF-8 BOM, Excel)
   */
  exportCsv: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    try {
      const jr = await db.pool.query('SELECT techno FROM crawl_jobs WHERE id = $1', [id]);
      if (jr.rows.length === 0) return res.status(404).json({ message: 'Job introuvable' });
      // Dédoublonné par domaine, trié par plateforme puis domaine
      const { rows } = await db.pool.query(
        `SELECT DISTINCT ON (domain) domain, platform, platform_version, title, http_status, final_url,
                email, phone, facebook_url, instagram_url, ssl_ok,
                mobile_ok, mentions_legales, rgpd_confidentialite, spf, dmarc,
                ssl_expire_jours, serveur_php, copyright_annee
         FROM crawl_results WHERE job_id = $1
         ORDER BY domain, platform`,
        [id]
      );
      rows.sort((a, b) => (a.platform || '').localeCompare(b.platform || '') || (a.domain || '').localeCompare(b.domain || ''));

      const oui = (v) => v === true ? 'oui' : v === false ? 'non' : '';
      const header = ['Domaine', 'Plateforme', 'Version', 'Email', 'Téléphone', 'Facebook', 'Instagram',
        'SSL', 'Mobile OK', 'Mentions légales', 'Confidentialité', 'SPF', 'DMARC',
        'SSL expire (j)', 'Serveur/PHP', 'Copyright', 'Titre', 'Statut HTTP', 'URL finale'];
      const lines = [header.join(',')];
      for (const r of rows) {
        lines.push([r.domain, r.platform, r.platform_version, r.email, r.phone, r.facebook_url, r.instagram_url,
          oui(r.ssl_ok), oui(r.mobile_ok), oui(r.mentions_legales), oui(r.rgpd_confidentialite),
          oui(r.spf), oui(r.dmarc), r.ssl_expire_jours ?? '', r.serveur_php, r.copyright_annee ?? '',
          r.title, r.http_status, r.final_url].map(csvEscape).join(','));
      }
      const csv = '﻿' + lines.join('\r\n'); // BOM UTF-8

      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      const fileName = `crawl-${jr.rows[0].techno}-${stamp}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(csv);
    } catch (error) {
      console.error('[Crawl] Erreur export:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  /**
   * POST /api/portefeuille/crawl/:id/to-prospect { result_ids: [] }
   * Crée des prospects (leads standard) à partir des résultats sélectionnés.
   * INSERT natif dans la table leads (mêmes colonnes que la création standard),
   * pour fiabilité : le prospect créé est un lead normal (statut 'nouveau').
   */
  toProspect: async (req, res) => {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { result_ids, relation_status = 'nouveau', note = '' } = req.body || {};
    const ids = Array.isArray(result_ids) ? result_ids.map((v) => parseInt(v, 10)).filter((v) => !Number.isNaN(v)) : [];
    if (ids.length === 0) {
      return res.status(400).json({ message: 'Aucun résultat sélectionné' });
    }
    // Seuls 'nouveau' (prospect actif) et 'pas_business' (écarté) sont acceptés ici.
    const statusVal = relation_status === 'pas_business' ? 'pas_business' : 'nouveau';
    const userNote = (note || '').toString().trim();
    try {
      const { rows } = await db.pool.query(
        `SELECT * FROM crawl_results WHERE job_id = $1 AND id = ANY($2::int[]) AND added_as_prospect = FALSE`,
        [parseInt(id, 10), ids]
      );
      let created = 0;
      let lastError = null;
      const leadIds = []; // IDs des leads créés (pour le raccourci « Prospecter » -> fiche)
      const anneeCourante = new Date().getFullYear();
      for (const r of rows) {
        // Angles d'approche détectés gratuitement (audit) -> arguments concrets pour l'email.
        const angles = [
          r.mentions_legales === false ? '• Pas de mentions légales (obligation légale LCEN)' : null,
          r.mobile_ok === false ? '• Site non responsive (mauvais affichage mobile)' : null,
          (r.ssl_expire_jours != null && r.ssl_expire_jours < 30)
            ? `• Certificat SSL expire dans ${r.ssl_expire_jours} j` : null,
          r.ssl_ok === false ? '• Certificat SSL invalide/absent' : null,
          r.spf === false ? '• Pas de SPF (emails à risque de finir en spam)' : null,
          r.dmarc === false ? '• Pas de DMARC (domaine usurpable)' : null,
          r.rgpd_confidentialite === false ? '• Pas de politique de confidentialité (RGPD)' : null,
          r.cookie_banner === false ? '• Pas de bandeau cookies (CNIL)' : null,
          r.meta_desc === false ? '• Meta description manquante (SEO)' : null,
          r.h1_present === false ? '• Pas de balise H1 (SEO)' : null,
          r.analytics === false ? "• Aucune mesure d'audience installée" : null,
          r.serveur_php ? `• Version serveur exposée : ${r.serveur_php}` : null,
          (r.copyright_annee && r.copyright_annee < anneeCourante - 1)
            ? `• Copyright figé à ${r.copyright_annee} (site qui semble peu maintenu)` : null
        ].filter(Boolean);
        const notes = [
          userNote || null,
          r.raison_sociale ? `Raison sociale : ${r.raison_sociale}${r.siren ? ` (SIREN ${r.siren})` : ''}` : null,
          r.gerant ? `Dirigeant : ${r.gerant}` : null,
          r.platform ? `Plateforme : ${r.platform}${r.platform_version ? ` (${r.platform_version})` : ''}` : null,
          angles.length ? `Angles d'approche détectés :\n${angles.join('\n')}` : null,
          r.final_url ? `URL : ${r.final_url}` : null,
          'Source : Crawl Common Crawl'
        ].filter(Boolean).join('\n');
        try {
          // Colonnes standard + enrichissement cc_prospector (email/tel/réseaux) -> le lead
          // arrive directement exploitable dans l'Outreach multi-canal.
          const ins = await db.pool.query(
            `INSERT INTO leads (name, company, type, status, source, notes, email, phone, facebook_url, instagram_url, relation_status, crawl_result_id, created_at, updated_at)
             VALUES ($1, $2, 'company', 'nouveau', 'Crawl', $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()) RETURNING id`,
            [(isAntibotTitle(r.title) ? null : decodeHtml(r.title)) || r.domain, r.domain, notes,
             r.email || null, r.phone || null, r.facebook_url || null, r.instagram_url || null, statusVal, r.id]
          );
          await db.pool.query('UPDATE crawl_results SET added_as_prospect = TRUE WHERE id = $1', [r.id]);
          if (ins.rows[0]) leadIds.push(ins.rows[0].id);
          created++;
        } catch (e) {
          lastError = e.message;
          console.error('[Crawl] Échec création prospect pour', r.domain, e.message);
        }
      }
      if (created === 0 && lastError) {
        return res.status(500).json({ message: `Création impossible : ${lastError}` });
      }
      res.json({ created, lead_ids: leadIds });
    } catch (error) {
      console.error('[Crawl] Erreur to-prospect:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
};

// POST /api/portefeuille/crawl/:id/enrich { result_ids } -> enrichissement SIRENE (raison
// sociale + dirigeant) des résultats sélectionnés. Gratuit (API publique), best-effort.
crawlController.enrichResults = async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const ids = Array.isArray(req.body?.result_ids)
    ? req.body.result_ids.map((v) => parseInt(v, 10)).filter((v) => !Number.isNaN(v)) : [];
  if (ids.length === 0) return res.status(400).json({ message: 'Aucun résultat sélectionné' });
  try {
    const { rows } = await db.pool.query(
      'SELECT id, domain, title FROM crawl_results WHERE job_id = $1 AND id = ANY($2::int[])',
      [parseInt(id, 10), ids]
    );
    let enriched = 0;
    for (const r of rows) {
      // Requête : le titre de la home (souvent la vraie enseigne), repli sur la racine du domaine.
      const query = (decodeHtml(r.title) || '').trim() || normalizeDomain(r.domain).split('.')[0];
      const data = await sireneEnrich.enrich(query);
      if (data.found) {
        await db.pool.query(
          'UPDATE crawl_results SET raison_sociale = $1, gerant = $2, siren = $3 WHERE id = $4',
          [data.raison_sociale, data.dirigeant, data.siren, r.id]
        );
        enriched++;
      }
    }
    res.json({ enriched, total: rows.length });
  } catch (e) {
    console.error('[Crawl] enrichResults:', e.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/portefeuille/crawl/exclude.txt -> liste des domaines déjà connus (un par ligne),
// pour alimenter cc_prospector --exclude et ne jamais re-prospecter un domaine déjà traité.
crawlController.exportExclude = async (req, res) => {
  const db = req.app.locals.db;
  try {
    const { rows } = await db.pool.query(
      `SELECT domain FROM crawl_results WHERE domain IS NOT NULL
       UNION
       SELECT company FROM leads WHERE company IS NOT NULL AND company <> ''`
    );
    const domains = [...new Set(
      rows.map((r) => normalizeDomain(r.domain)).filter(Boolean)
    )].sort();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="exclude.txt"');
    res.send(domains.join('\n') + '\n');
  } catch (e) {
    console.error('[Crawl] exportExclude:', e.message);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = crawlController;
