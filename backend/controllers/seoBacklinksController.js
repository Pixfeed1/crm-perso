// backend/controllers/seoBacklinksController.js
//
// Module Backlinks (suite SEO) : niches saisies en texte, découverte de cibles
// (boule de neige rapide + graphe Common Crawl en batch), vérification live
// (réutilise cc_prospector detect), scoring (Open PageRank + CrUX), outreach
// depuis le GMAIL PERSO (canal séparé du pipeline client).

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const seoOutreach = require('../services/seoOutreachService');
const linkSpots = require('../services/linkSpotService');
const emailTracking = require('../services/emailTracking');

const PYTHON_BIN = process.env.CC_PROSPECTOR_PYTHON || '/home/jurojinn/tools/cc_prospector/venv/bin/python';
const LINKGRAPH_SCRIPT = process.env.LINKGRAPH_SCRIPT || '/home/jurojinn/tools/linkgraph/linkgraph.py';
const CC_PROSPECTOR_SCRIPT = process.env.CC_PROSPECTOR_SCRIPT || '/home/jurojinn/tools/cc_prospector/cc_prospector.py';
// Dossier local du graphe CC (rempli par `linkgraph.py fetch`, ~dizaines de Go).
const LINKGRAPH_DATA_DIR = process.env.LINKGRAPH_DATA_DIR || '/home/jurojinn/tools/linkgraph/data';

// Un seul job de découverte à la fois (même modèle que le crawl).
let runningNicheId = null;

// ─── Parse CSV minimal (mêmes règles que crawlController) ────────────────────
function parseCsv(content) {
  const rows = [];
  let field = ''; let row = []; let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"') { if (content[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && content[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function setPhase(db, nicheId, phase, message = null) {
  await db.pool.query(
    `UPDATE seo_niches SET discovery_phase = $1, discovery_message = $2,
       discovery_done_at = CASE WHEN $1 = 'done' THEN NOW() ELSE discovery_done_at END
     WHERE id = $3`,
    [phase, message, nicheId]
  ).catch(() => {});
}

// Recalcule score + nombre de critères mesurés d'une cible (source de vérité unique).
async function saveScore(db, t) {
  await db.pool.query('UPDATE seo_link_targets SET score = $1, score_criteres = $2 WHERE id = $3',
    [seoOutreach.computeScore(t), seoOutreach.scoreDetail(t).criteres, t.id]).catch(() => {});
}

// ─── Concurrents ─────────────────────────────────────────────────────────────
// Un site qui se positionne sur les requêtes où TON site a déjà des impressions publie
// les mêmes contenus : concurrent, pas cible. Source : requêtes GSC du site cible
// (seo_sites.domain = niche.site_cible) sur 90 jours, croisées avec les requêtes qui ont
// fait ressortir chaque domaine à la découverte mot-clé. Second signal : titre d'agence.
const normQuery = (q) => String(q || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const AGENCY_TITLE = /\b(agence|agency|consultant|freelance|expert(e)?s?)\b.*\b(seo|web|digital|r[ée]f[ée]rencement|webmarketing|prestashop|woocommerce|shopify)\b|\b(seo|r[ée]f[ée]rencement)\b.*\b(agence|consultant|freelance)\b/i;

async function flagCompetitors(db, niche) {
  const site = String(niche.site_cible || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  let gscQueries = [];
  if (site) {
    const { rows } = await db.pool.query(
      `SELECT lower(g.query) AS query, SUM(g.impressions)::int AS impressions
       FROM seo_gsc_daily_web g JOIN seo_sites s ON s.id = g.site_id
       WHERE (lower(s.domain) = $1 OR lower(s.domain) = 'www.' || $1) AND g.date >= CURRENT_DATE - 90
       GROUP BY lower(g.query) HAVING SUM(g.impressions) >= 20`,
      [site]
    ).catch(() => ({ rows: [] }));
    gscQueries = rows.map((r) => ({ q: r.query, n: normQuery(r.query), impressions: r.impressions }));
  }
  const { rows: targets } = await db.pool.query(
    `SELECT id, domain, title, found_queries, concurrent, concurrent_probable FROM seo_link_targets WHERE niche_id = $1`, [niche.id]);
  let flagged = 0;
  for (const t of targets) {
    if (t.concurrent) continue; // décision humaine déjà prise
    let motif = null;
    const found = String(t.found_queries || '').split('|').map((x) => x.trim()).filter(Boolean);
    for (const fq of found) {
      const n = normQuery(fq);
      if (!n) continue;
      const hit = gscQueries.find((g) => g.n === n || (n.length >= 12 && (g.n.includes(n) || n.includes(g.n))));
      if (hit) { motif = `se positionne sur « ${fq} », requête où ton site a ${hit.impressions} impressions (90 j)`; break; }
    }
    if (!motif && t.title && AGENCY_TITLE.test(t.title)) motif = `titre d'agence ou de consultant : « ${String(t.title).slice(0, 80)} »`;
    if (motif) {
      await db.pool.query('UPDATE seo_link_targets SET concurrent_probable = TRUE, concurrent_motif = $2 WHERE id = $1', [t.id, motif]).catch(() => {});
      flagged++;
    } else if (t.concurrent_probable) {
      await db.pool.query('UPDATE seo_link_targets SET concurrent_probable = FALSE, concurrent_motif = NULL WHERE id = $1', [t.id]).catch(() => {});
    }
  }
  return { flagged, gsc_queries: gscQueries.length, site: site || null };
}

// ─── Vérification du rel (par emplacement) en arrière-plan ───────────────────
function runRelCheck(db, niche, targets) {
  (async () => {
    let done = 0; let ok = 0; let dofollow = 0;
    try {
      const rules = await linkSpots.loadRules(db);
      for (const t of targets) {
        const r = await linkSpots.autoVerifyTarget(db, t, rules).catch((e) => ({ ok: false, error: e.message }));
        done++;
        if (r.ok) ok++;
        if (done % 5 === 0) await setPhase(db, niche.id, 'rel_running', `Vérification du rel : ${done}/${targets.length} cibles…`);
      }
      const { rows } = await db.pool.query(
        'SELECT COUNT(*)::int AS n FROM seo_link_targets WHERE niche_id = $1 AND dofollow = TRUE', [niche.id]);
      dofollow = rows[0] ? rows[0].n : 0;
      await setPhase(db, niche.id, 'done', `Rel vérifié : ${ok}/${targets.length} sites lus, ${dofollow} avec au moins un emplacement dofollow`);
    } catch (e) {
      await setPhase(db, niche.id, 'error', `Vérification du rel : ${e.message}`);
    } finally {
      runningNicheId = null;
    }
  })();
}

// Ingestion d'un CSV linkgraph (domain, via, detail) dans seo_link_targets.
async function ingestTargets(db, nicheId, csvPath) {
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  if (rows.length < 2) return 0;
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const di = header.indexOf('domain'), vi = header.indexOf('via'), dei = header.indexOf('detail');
  let added = 0;
  for (let i = 1; i < rows.length; i++) {
    const domain = (rows[i][di] || '').trim().toLowerCase();
    if (!domain || !domain.includes('.')) continue;
    const via = (rows[i][vi] || '').trim() || null;
    const detail = (rows[i][dei] || '').trim() || null;
    // Nb de liens vers les hubs si via=graph (detail "hub:count;hub2:count").
    let edges = null;
    if (via === 'graph' && detail) {
      edges = detail.split(';').reduce((s, part) => {
        const n = parseInt(part.split(':')[1], 10);
        return s + (Number.isNaN(n) ? 0 : n);
      }, 0) || null;
    }
    // Upsert : déjà vue par l'autre moteur -> via='both' (confiance renforcée).
    const r = await db.pool.query(
      `INSERT INTO seo_link_targets (niche_id, domain, via, detail, referring_edges)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (niche_id, domain) DO UPDATE SET
         via = CASE WHEN seo_link_targets.via IS DISTINCT FROM EXCLUDED.via THEN 'both' ELSE seo_link_targets.via END,
         detail = COALESCE(seo_link_targets.detail, '') || CASE WHEN EXCLUDED.detail IS NOT NULL THEN ' | ' || EXCLUDED.detail ELSE '' END,
         referring_edges = COALESCE(EXCLUDED.referring_edges, seo_link_targets.referring_edges)
       RETURNING (xmax = 0) AS inserted`,
      [nicheId, domain, via, detail, edges]
    );
    if (r.rows[0] && r.rows[0].inserted) added++;
  }
  return added;
}

// Insertion/upsert d'une liste de domaines découverts (partagé mot-clé/manuel).
// foundQueries : { domaine: [requêtes] } (découverte mot-clé) pour le marquage concurrent.
async function ingestDomains(db, nicheId, domains, via, detail, foundQueries = {}) {
  let added = 0;
  for (const raw of domains) {
    const domain = String(raw || '').toLowerCase().trim();
    if (!domain || !domain.includes('.')) continue;
    const fq = (foundQueries[domain] || []).join(' | ') || null;
    const r = await db.pool.query(
      `INSERT INTO seo_link_targets (niche_id, domain, via, detail, found_queries)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (niche_id, domain) DO UPDATE SET
         via = CASE WHEN seo_link_targets.via IS DISTINCT FROM EXCLUDED.via THEN 'both' ELSE seo_link_targets.via END,
         found_queries = COALESCE(seo_link_targets.found_queries, EXCLUDED.found_queries)
       RETURNING (xmax = 0) AS inserted`,
      [nicheId, domain, via, detail, fq]
    ).catch(() => null);
    if (r && r.rows[0] && r.rows[0].inserted) added++;
  }
  return added;
}

// Découverte par MOT-CLÉ : Claude + recherche web (budget plafonné en dur à 25
// recherches ≈ 0,40 $ pire cas). Pas de process externe : appel API en arrière-plan.
function runKeywordDiscovery(db, niche) {
  (async () => {
    try {
      const { domains, found_queries, searches_used } = await seoOutreach.discoverByKeyword({
        niche: niche.name, hubs: niche.hubs || '', site_cible: niche.site_cible || ''
      });
      const added = await ingestDomains(db, niche.id, domains, 'keyword', 'recherche mot-clé (Claude)', found_queries || {});
      // La recherche par mot-clé remonte mécaniquement les concurrents : on les marque tout de suite.
      const comp = await flagCompetitors(db, niche).catch(() => ({ flagged: 0 }));
      await setPhase(db, niche.id, 'done',
        `mot-clé : ${added} nouvelle(s) cible(s) sur ${domains.length} trouvée(s)` +
        (searches_used ? ` (${searches_used} recherches)` : '') +
        (comp.flagged ? `, ${comp.flagged} concurrent(s) probable(s)` : ''));
      await db.pool.query("UPDATE seo_niches SET statut = 'decouverte' WHERE id = $1 AND statut = 'nouvelle'", [niche.id]).catch(() => {});
    } catch (e) {
      console.error('[SEO Backlinks] keyword discovery:', e.message);
      await setPhase(db, niche.id, 'error', `Recherche mot-clé : ${e.message}`);
    } finally {
      runningNicheId = null;
    }
  })();
}

// Lance un process de découverte en arrière-plan et ingère son CSV à la fin.
// seedsOverride : seeds explicites (mode « étendre » : les cibles FR déjà découvertes).
function runDiscovery(db, niche, mode, seedsOverride = null) {
  const jobDir = path.join(os.tmpdir(), `linkgraph-${niche.id}-${mode}`);
  fs.mkdirSync(jobDir, { recursive: true });
  const outCsv = path.join(jobDir, 'out.csv');

  let args;
  if (mode === 'snowball') {
    const seeds = (seedsOverride || niche.seeds || niche.hubs || '').trim();
    args = [LINKGRAPH_SCRIPT, 'snowball', '--seeds', seeds, '--depth', '2', '--output', outCsv];
  } else {
    args = [LINKGRAPH_SCRIPT, 'linkers', '--dir', LINKGRAPH_DATA_DIR, '--hubs', niche.hubs || '', '--output', outCsv];
  }
  const child = spawn(PYTHON_BIN, args, { cwd: jobDir });
  let tail = [];
  const push = (d) => { tail.push(d.toString()); if (tail.length > 20) tail.shift(); };
  child.stdout.on('data', push);
  child.stderr.on('data', push);

  child.on('error', async (err) => {
    runningNicheId = null;
    await setPhase(db, niche.id, 'error', `Lancement impossible : ${err.message}`);
  });
  child.on('close', async (code) => {
    try {
      if (code === 0 && fs.existsSync(outCsv)) {
        const added = await ingestTargets(db, niche.id, outCsv);
        await setPhase(db, niche.id, 'done', `${mode} : ${added} nouvelle(s) cible(s)`);
        await db.pool.query("UPDATE seo_niches SET statut = 'decouverte' WHERE id = $1 AND statut = 'nouvelle'", [niche.id]).catch(() => {});
      } else {
        await setPhase(db, niche.id, 'error', tail.join('').slice(-1500) || `Échec (code ${code})`);
      }
    } catch (e) {
      await setPhase(db, niche.id, 'error', `Ingestion : ${e.message}`);
    } finally {
      runningNicheId = null;
      try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
}

// Vérification live d'un lot de cibles via cc_prospector detect (langue, vivant,
// email de contact, titre) puis recalcul du score.
function runVerify(db, nicheId, domains) {
  const jobDir = path.join(os.tmpdir(), `linkverify-${nicheId}`);
  fs.mkdirSync(jobDir, { recursive: true });
  const inTxt = path.join(jobDir, 'domains.txt');
  const outCsv = path.join(jobDir, 'detect.csv');
  fs.writeFileSync(inTxt, domains.join('\n') + '\n', 'utf8');

  const child = spawn(PYTHON_BIN, [CC_PROSPECTOR_SCRIPT, 'detect', '--input', inTxt, '--output', outCsv, '--concurrency', '8'], { cwd: jobDir });
  let tail = [];
  child.stderr.on('data', (d) => { tail.push(d.toString()); if (tail.length > 10) tail.shift(); });
  child.on('close', async (code) => {
    try {
      if (code === 0 && fs.existsSync(outCsv)) {
        const rows = parseCsv(fs.readFileSync(outCsv, 'utf8'));
        const header = rows[0].map((h) => h.trim().toLowerCase());
        const idx = (n) => header.indexOf(n);
        const di = idx('domain'), li = idx('lang'), ei = idx('email'), ti = idx('title'),
          hi = idx('http_status'), si = idx('site_type');
        for (let i = 1; i < rows.length; i++) {
          const dom = (rows[i][di] || '').trim().toLowerCase();
          if (!dom) continue;
          const alive = !!(rows[i][hi] && parseInt(rows[i][hi], 10) < 500);
          const siteType = si >= 0 ? (rows[i][si] || '').trim() : '';
          const lang = (rows[i][li] || '').trim();
          // Auto-écartement : agence (concurrent) OU langue détectée non-FR (les campagnes
          // backlinks sont francophones par définition). Règle d'or conservée : langue
          // inconnue ('') -> on GARDE. On ne touche qu'aux cibles encore 'nouveau'.
          const ecarteRaison = siteType === 'agence' ? 'agence (concurrent)'
            : (lang && lang !== 'fr') ? `hors FR (${lang})` : null;
          await db.pool.query(
            `UPDATE seo_link_targets SET
               lang = NULLIF($2, ''), alive = $3, contact_email = COALESCE(NULLIF($4, ''), contact_email),
               title = COALESCE(NULLIF($5, ''), title), last_checked_at = NOW(),
               statut = CASE WHEN $6::text IS NOT NULL AND statut = 'nouveau' THEN 'ecarte' ELSE statut END,
               raison_ecarte = COALESCE($6, raison_ecarte),
               concurrent = CASE WHEN $8 THEN TRUE ELSE concurrent END,
               concurrent_motif = CASE WHEN $8 THEN COALESCE(concurrent_motif, 'agence détectée à la vérification live') ELSE concurrent_motif END,
               porte_type = CASE WHEN porte_type IS NULL AND NULLIF($4, '') IS NOT NULL THEN 'email' ELSE porte_type END
             WHERE niche_id = $1 AND domain = $7`,
            [nicheId, lang, alive, (rows[i][ei] || '').trim(),
             (rows[i][ti] || '').trim(), ecarteRaison, dom, siteType === 'agence']
          ).catch(() => {});
        }
        // Recalcule les scores après vérif, puis les concurrents probables (titres d'agence).
        const { rows: targets } = await db.pool.query('SELECT * FROM seo_link_targets WHERE niche_id = $1', [nicheId]);
        for (const t of targets) await saveScore(db, t);
        const { rows: nr } = await db.pool.query('SELECT * FROM seo_niches WHERE id = $1', [nicheId]);
        if (nr[0]) await flagCompetitors(db, nr[0]).catch(() => {});
        await setPhase(db, nicheId, 'done', `Vérification live : ${rows.length - 1} cibles re-vérifiées`);
      } else {
        await setPhase(db, nicheId, 'error', `Vérif live : échec (code ${code}) ${tail.join('').slice(-300)}`);
      }
    } catch (e) {
      await setPhase(db, nicheId, 'error', `Vérif live : ${e.message}`);
    } finally {
      runningNicheId = null;
      try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
  child.on('error', async (err) => {
    runningNicheId = null;
    await setPhase(db, nicheId, 'error', `Vérif live : ${err.message}`);
  });
}

const ctrl = {
  // GET /api/seo/backlinks/niches
  listNiches: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const { rows } = await db.pool.query(
        `SELECT n.*, COUNT(t.id)::int AS nb_cibles,
                COUNT(t.id) FILTER (WHERE t.statut = 'lien_obtenu')::int AS liens_obtenus,
                COUNT(t.id) FILTER (WHERE t.statut IN ('contacte', 'lien_obtenu', 'refus'))::int AS contactees,
                COUNT(t.id) FILTER (WHERE t.dofollow = TRUE)::int AS dofollow_ok,
                COUNT(t.id) FILTER (WHERE t.concurrent OR t.concurrent_probable)::int AS concurrents,
                COUNT(t.id) FILTER (WHERE t.rel_verifie_le IS NOT NULL)::int AS rel_verifies,
                EXTRACT(DAY FROM NOW() - COALESCE(n.discovery_done_at, n.created_at))::int AS jours_depuis_decouverte
         FROM seo_niches n LEFT JOIN seo_link_targets t ON t.niche_id = n.id
         GROUP BY n.id ORDER BY n.created_at DESC`
      );
      // « À travailler » : découverte finie, des cibles, personne contacté depuis 7 jours.
      res.json(rows.map((n) => ({
        ...n,
        a_travailler: n.discovery_phase === 'done' && n.nb_cibles > 0 && n.contactees === 0 && n.jours_depuis_decouverte >= 7
      })));
    } catch (e) {
      console.error('[SEO Backlinks] listNiches:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // POST /api/seo/backlinks/niches { name, site_cible, hubs, seeds? } — niche 100% texte.
  createNiche: async (req, res) => {
    const db = req.app.locals.db;
    const { name, site_cible, hubs, seeds } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ message: 'Nom de niche requis' });
    if (!hubs || !hubs.trim()) return res.status(400).json({ message: 'Au moins un site hub requis (séparés par des virgules)' });
    try {
      const { rows } = await db.pool.query(
        `INSERT INTO seo_niches (name, site_cible, hubs, seeds) VALUES ($1, $2, $3, $4) RETURNING *`,
        [name.trim(), (site_cible || '').trim() || null, hubs.trim(), (seeds || '').trim() || null]
      );
      res.status(201).json(rows[0]);
    } catch (e) {
      console.error('[SEO Backlinks] createNiche:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // DELETE /api/seo/backlinks/niches/:id (cascade sur cibles + outreach)
  deleteNiche: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const r = await db.pool.query('DELETE FROM seo_niches WHERE id = $1 RETURNING id', [req.params.id]);
      if (r.rowCount === 0) return res.status(404).json({ message: 'Niche introuvable' });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // POST /api/seo/backlinks/niches/:id/discover { mode: 'snowball' | 'graph' | 'keyword' | 'expand' }
  // 'expand' : re-boule-de-neige AUTOMATIQUE depuis les cibles FRANCOPHONES déjà découvertes
  // (déplie la niche de proche en proche depuis les sites locaux, sans ressaisie).
  discover: async (req, res) => {
    const db = req.app.locals.db;
    const mode = ['graph', 'keyword', 'expand'].includes(req.body?.mode) ? req.body.mode : 'snowball';
    if (runningNicheId) return res.status(409).json({ message: 'Une découverte est déjà en cours' });
    try {
      const { rows } = await db.pool.query('SELECT * FROM seo_niches WHERE id = $1', [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ message: 'Niche introuvable' });
      const niche = rows[0];
      if (mode === 'graph' && !fs.existsSync(path.join(LINKGRAPH_DATA_DIR, 'manifest.json'))) {
        return res.status(400).json({
          message: `Graphe CC absent de ${LINKGRAPH_DATA_DIR}. Lance d'abord (une fois, en SSH) : ` +
            `linkgraph.py fetch --release cc-main-2026-apr-may-jun --dir ${LINKGRAPH_DATA_DIR}`
        });
      }
      if (mode === 'keyword' && !process.env.ANTHROPIC_API_KEY) {
        return res.status(400).json({ message: 'Clé Anthropic non configurée (ANTHROPIC_API_KEY).' });
      }
      // Mode étendre : seeds = les meilleures cibles FR vérifiées de la niche.
      let seedsOverride = null;
      if (mode === 'expand') {
        const fr = await db.pool.query(
          `SELECT domain FROM seo_link_targets
           WHERE niche_id = $1 AND lang = 'fr' AND statut <> 'ecarte' AND (alive IS DISTINCT FROM FALSE)
           ORDER BY score DESC NULLS LAST LIMIT 15`,
          [niche.id]
        );
        if (fr.rows.length === 0) {
          return res.status(400).json({ message: 'Aucune cible francophone vérifiée — lance d\'abord une découverte puis la Vérif live.' });
        }
        seedsOverride = fr.rows.map((r) => r.domain).join(',');
      }
      runningNicheId = niche.id; // verrou posé AVANT tout autre await (pas de course)
      const phaseMsg = {
        graph: 'Scan du graphe Common Crawl (peut durer des heures)…',
        snowball: 'Boule de neige en cours (quelques minutes)…',
        keyword: 'Claude cherche sur le web (max 25 recherches ≈ 0,40 $)…',
        expand: `Extension depuis ${seedsOverride ? seedsOverride.split(',').length : 0} cibles FR découvertes…`
      };
      await setPhase(db, niche.id, `${mode}_running`, phaseMsg[mode]);
      if (mode === 'keyword') runKeywordDiscovery(db, niche);
      else runDiscovery(db, niche, mode === 'expand' ? 'snowball' : mode, seedsOverride);
      res.status(202).json({ started: true, mode });
    } catch (e) {
      runningNicheId = null;
      console.error('[SEO Backlinks] discover:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // POST /api/seo/backlinks/niches/:id/verify — vérif live (langue/vivant/contact) + score.
  verify: async (req, res) => {
    const db = req.app.locals.db;
    if (runningNicheId) return res.status(409).json({ message: 'Un job est déjà en cours' });
    try {
      const nicheId = parseInt(req.params.id, 10);
      const { rows } = await db.pool.query(
        `SELECT domain FROM seo_link_targets WHERE niche_id = $1 AND statut NOT IN ('ecarte') ORDER BY referring_edges DESC NULLS LAST LIMIT 300`,
        [nicheId]
      );
      if (rows.length === 0) return res.status(400).json({ message: 'Aucune cible à vérifier (lance une découverte d\'abord)' });
      runningNicheId = nicheId;
      await setPhase(db, nicheId, 'verify_running', `Vérification live de ${rows.length} cibles…`);
      runVerify(db, nicheId, rows.map((r) => r.domain));
      res.status(202).json({ started: true, count: rows.length });
    } catch (e) {
      runningNicheId = null;
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // POST /api/seo/backlinks/niches/:id/score — Open PageRank + CrUX + score composite.
  score: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const nicheId = parseInt(req.params.id, 10);
      const { rows: targets } = await db.pool.query(
        `SELECT * FROM seo_link_targets WHERE niche_id = $1 AND statut NOT IN ('ecarte')`, [nicheId]);
      if (targets.length === 0) return res.status(400).json({ message: 'Aucune cible à scorer' });

      const oprMap = await seoOutreach.fetchOpenPageRank(targets.map((t) => t.domain));
      let cruxChecked = 0;
      for (const t of targets) {
        const opr = oprMap[t.domain] ?? null;
        // CrUX : seulement les cibles au-dessus d'un seuil OPR (économise le quota),
        // max 120 par run (150 req/min gratuit).
        let crux = t.crux;
        if (process.env.CRUX_API_KEY && cruxChecked < 120 && (opr == null || opr >= 1)) {
          crux = await seoOutreach.checkCrux(t.domain);
          cruxChecked++;
        }
        const updated = { ...t, opr: opr ?? t.opr, crux };
        await db.pool.query(
          'UPDATE seo_link_targets SET opr = COALESCE($1, opr), crux = COALESCE($2, crux), score = $3, score_criteres = $4 WHERE id = $5',
          [opr, crux, seoOutreach.computeScore(updated), seoOutreach.scoreDetail(updated).criteres, t.id]
        );
      }
      res.json({
        scored: targets.length, opr_found: Object.keys(oprMap).length, crux_checked: cruxChecked,
        crux_disponible: !!process.env.CRUX_API_KEY
      });
    } catch (e) {
      console.error('[SEO Backlinks] score:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // GET /api/seo/backlinks/niches/:id/targets?statut=&q=
  listTargets: async (req, res) => {
    const db = req.app.locals.db;
    const { statut, q, concurrents } = req.query;
    const cond = ['t.niche_id = $1']; const params = [parseInt(req.params.id, 10)]; let i = 2;
    if (statut) { cond.push(`t.statut = $${i++}`); params.push(statut); }
    else cond.push(`t.statut <> 'ecarte'`);
    if (q) { cond.push(`(t.domain ILIKE $${i} OR t.title ILIKE $${i})`); params.push(`%${q}%`); i++; }
    // concurrents=only : uniquement les concurrents ; concurrents=exclude : sans eux ; défaut : tous.
    if (concurrents === 'only') cond.push('(t.concurrent OR t.concurrent_probable)');
    else if (concurrents === 'exclude') cond.push('NOT (t.concurrent OR t.concurrent_probable)');
    try {
      const { rows } = await db.pool.query(
        `SELECT t.*, o.sent_at AS last_sent_at, o.reponse AS last_reponse, et.open_count, et.click_count,
                (SELECT COUNT(*)::int FROM seo_link_target_spots s WHERE s.target_id = t.id) AS nb_spots,
                (SELECT COUNT(*)::int FROM seo_link_target_spots s WHERE s.target_id = t.id AND s.dofollow) AS nb_spots_dofollow
         FROM seo_link_targets t
         LEFT JOIN LATERAL (SELECT * FROM seo_link_outreach WHERE target_id = t.id ORDER BY sent_at DESC LIMIT 1) o ON TRUE
         LEFT JOIN email_tracking et ON et.token = o.tracking_token
         WHERE ${cond.join(' AND ')}
         ORDER BY (t.concurrent OR t.concurrent_probable) ASC, t.score DESC NULLS LAST,
                  t.referring_edges DESC NULLS LAST, t.alive DESC NULLS LAST,
                  (t.lang = 'fr') DESC NULLS LAST, t.domain ASC`,
        params
      );
      res.json(rows.map((t) => ({ ...t, score_detail: seoOutreach.scoreDetail(t) })));
    } catch (e) {
      console.error('[SEO Backlinks] listTargets:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // PATCH /api/seo/backlinks/targets/:id
  // { statut?, notes?, contact_email?, raison_ecarte?, porte_type?, porte_url?, porte_note?,
  //   concurrent?, concurrent_motif? } — les champs absents ne sont pas touchés.
  updateTarget: async (req, res) => {
    const db = req.app.locals.db;
    const allowed = ['nouveau', 'a_contacter', 'contacte', 'lien_obtenu', 'refus', 'ecarte'];
    const portes = ['email', 'formulaire', 'compte', 'reseau', 'commentaire', 'aucune'];
    const b = req.body || {};
    if (b.statut && !allowed.includes(b.statut)) return res.status(400).json({ message: 'Statut invalide' });
    if (b.porte_type !== undefined && b.porte_type !== null && b.porte_type !== '' && !portes.includes(b.porte_type)) {
      return res.status(400).json({ message: `Porte invalide (${portes.join(', ')})` });
    }
    const sets = []; const params = [];
    const set = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
    if (b.statut) set('statut', b.statut);
    if (b.notes !== undefined) set('notes', b.notes || null);
    if (b.contact_email !== undefined) set('contact_email', b.contact_email || null);
    if (b.raison_ecarte !== undefined) set('raison_ecarte', b.raison_ecarte || null);
    if (b.porte_type !== undefined) set('porte_type', b.porte_type || null);
    if (b.porte_url !== undefined) set('porte_url', b.porte_url || null);
    if (b.porte_note !== undefined) set('porte_note', b.porte_note || null);
    if (b.concurrent !== undefined) {
      set('concurrent', !!b.concurrent);
      // Décision humaine : on efface le « probable » et on garde/pose le motif.
      set('concurrent_probable', false);
      set('concurrent_motif', b.concurrent ? (b.concurrent_motif || 'marqué concurrent manuellement') : null);
    } else if (b.concurrent_motif !== undefined) set('concurrent_motif', b.concurrent_motif || null);
    if (sets.length === 0) return res.status(400).json({ message: 'Aucune modification fournie' });
    params.push(req.params.id);
    try {
      const { rows } = await db.pool.query(
        `UPDATE seo_link_targets SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
      if (rows.length === 0) return res.status(404).json({ message: 'Cible introuvable' });
      res.json({ ...rows[0], score_detail: seoOutreach.scoreDetail(rows[0]) });
    } catch (e) {
      console.error('[SEO Backlinks] updateTarget:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // GET /api/seo/backlinks/targets/:id — fiche complète : cible + emplacements + règle plateforme.
  getTarget: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const { rows } = await db.pool.query(
        `SELECT t.*, n.name AS niche_name, n.site_cible FROM seo_link_targets t JOIN seo_niches n ON n.id = t.niche_id WHERE t.id = $1`,
        [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ message: 'Cible introuvable' });
      const t = rows[0];
      const spots = await db.pool.query(
        'SELECT * FROM seo_link_target_spots WHERE target_id = $1 ORDER BY dofollow DESC NULLS LAST, emplacement', [t.id]);
      const rule = t.platform
        ? (await db.pool.query('SELECT * FROM seo_link_platform_rules WHERE platform = $1', [t.platform])).rows[0] || null
        : null;
      res.json({ ...t, score_detail: seoOutreach.scoreDetail(t), spots: spots.rows, platform_rule: rule });
    } catch (e) {
      console.error('[SEO Backlinks] getTarget:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // POST /api/seo/backlinks/targets/:id/spots { emplacement, url?, rel, note? } — lecture manuelle du rel.
  addSpot: async (req, res) => {
    const db = req.app.locals.db;
    const { emplacement, url, rel, note } = req.body || {};
    if (!emplacement || !linkSpots.EMPLACEMENTS.includes(emplacement)) {
      return res.status(400).json({ message: `Emplacement invalide (${linkSpots.EMPLACEMENTS.join(', ')})` });
    }
    try {
      const t = await db.pool.query('SELECT id FROM seo_link_targets WHERE id = $1', [req.params.id]);
      if (t.rows.length === 0) return res.status(404).json({ message: 'Cible introuvable' });
      const spot = await linkSpots.upsertSpot(db, t.rows[0].id, {
        emplacement, url: (url || '').trim() || null, rel: rel || '', source: 'manuel', note: (note || '').trim() || null
      });
      const derived = await linkSpots.recomputeDofollow(db, t.rows[0].id);
      res.status(201).json({ spot, ...derived });
    } catch (e) {
      console.error('[SEO Backlinks] addSpot:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // DELETE /api/seo/backlinks/spots/:id
  deleteSpot: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const r = await db.pool.query('DELETE FROM seo_link_target_spots WHERE id = $1 RETURNING target_id', [req.params.id]);
      if (r.rowCount === 0) return res.status(404).json({ message: 'Emplacement introuvable' });
      const derived = await linkSpots.recomputeDofollow(db, r.rows[0].target_id);
      res.json({ success: true, ...derived });
    } catch (e) {
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // POST /api/seo/backlinks/targets/:id/rel-check — vérification automatique d'UNE cible (synchrone).
  relCheckTarget: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const { rows } = await db.pool.query('SELECT * FROM seo_link_targets WHERE id = $1', [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ message: 'Cible introuvable' });
      const r = await linkSpots.autoVerifyTarget(db, rows[0]);
      const spots = await db.pool.query('SELECT * FROM seo_link_target_spots WHERE target_id = $1 ORDER BY dofollow DESC NULLS LAST, emplacement', [rows[0].id]);
      const t = await db.pool.query('SELECT dofollow, platform, platform_rule_note, rel_verifie_le FROM seo_link_targets WHERE id = $1', [rows[0].id]);
      res.json({ ...r, ...t.rows[0], spots: spots.rows });
    } catch (e) {
      console.error('[SEO Backlinks] relCheckTarget:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // POST /api/seo/backlinks/niches/:id/rel-check { only_unverified? } — toute la campagne, en arrière-plan.
  relCheckNiche: async (req, res) => {
    const db = req.app.locals.db;
    if (runningNicheId) return res.status(409).json({ message: 'Un job est déjà en cours' });
    const onlyUnverified = req.body?.only_unverified !== false;
    try {
      const nr = await db.pool.query('SELECT * FROM seo_niches WHERE id = $1', [req.params.id]);
      if (nr.rows.length === 0) return res.status(404).json({ message: 'Niche introuvable' });
      const { rows } = await db.pool.query(
        `SELECT * FROM seo_link_targets
         WHERE niche_id = $1 AND statut <> 'ecarte' AND NOT (concurrent OR concurrent_probable)
           ${onlyUnverified ? 'AND rel_verifie_le IS NULL' : ''}
         ORDER BY score DESC NULLS LAST LIMIT 80`,
        [nr.rows[0].id]
      );
      if (rows.length === 0) return res.status(400).json({ message: onlyUnverified ? 'Toutes les cibles ont déjà un rel vérifié' : 'Aucune cible à vérifier' });
      runningNicheId = nr.rows[0].id;
      await setPhase(db, nr.rows[0].id, 'rel_running', `Vérification du rel : 0/${rows.length} cibles…`);
      runRelCheck(db, nr.rows[0], rows);
      res.status(202).json({ started: true, count: rows.length });
    } catch (e) {
      runningNicheId = null;
      console.error('[SEO Backlinks] relCheckNiche:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // POST /api/seo/backlinks/niches/:id/competitors — recalcule les concurrents probables.
  detectCompetitors: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const nr = await db.pool.query('SELECT * FROM seo_niches WHERE id = $1', [req.params.id]);
      if (nr.rows.length === 0) return res.status(404).json({ message: 'Niche introuvable' });
      const r = await flagCompetitors(db, nr.rows[0]);
      res.json(r);
    } catch (e) {
      console.error('[SEO Backlinks] detectCompetitors:', e.message);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // GET /api/seo/backlinks/platform-rules
  listPlatformRules: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const { rows } = await db.pool.query('SELECT * FROM seo_link_platform_rules ORDER BY platform');
      res.json(rows);
    } catch (e) {
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },

  // POST /api/seo/backlinks/targets/:id/draft-email { angle? } — rédaction Claude (pas d'envoi).
  draftEmail: async (req, res) => {
    const db = req.app.locals.db;
    try {
      const { rows } = await db.pool.query(
        `SELECT t.*, n.name AS niche_name, n.site_cible FROM seo_link_targets t
         JOIN seo_niches n ON n.id = t.niche_id WHERE t.id = $1`, [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ message: 'Cible introuvable' });
      const t = rows[0];
      const draft = await seoOutreach.draftLinkEmail({
        niche: t.niche_name, site_cible: t.site_cible,
        target_domain: t.domain, target_title: t.title,
        angle: (req.body?.angle || '').trim() || null
      });
      res.json(draft);
    } catch (e) {
      console.error('[SEO Backlinks] draftEmail:', e.message);
      const msg = /ANTHROPIC_API_KEY/.test(e.message) ? 'Clé Anthropic non configurée (ANTHROPIC_API_KEY).' : `Échec de la rédaction : ${e.message}`;
      res.status(500).json({ message: msg });
    }
  },

  // POST /api/seo/backlinks/targets/:id/send-email { to, subject, body }
  // Envoi depuis le GMAIL PERSO + tracking + relance J+7. Aucune écriture côté pipeline client.
  sendEmail: async (req, res) => {
    const db = req.app.locals.db;
    const { to, subject, body } = req.body || {};
    if (!to || !subject || !body) return res.status(400).json({ message: 'Destinataire, objet et message requis' });
    try {
      const { rows } = await db.pool.query('SELECT * FROM seo_link_targets WHERE id = $1', [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ message: 'Cible introuvable' });
      const t = rows[0];

      const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222;"><div style="white-space:pre-wrap;">${esc(body)}</div></div>`;
      const token = await emailTracking.createTracking(db, { contact_type: 'seo', contact_id: t.id, to_email: to, subject });
      await seoOutreach.sendViaGmail({ to, subject, html: emailTracking.wrapHtml(html, token), text: body });

      const followup = new Date(); followup.setDate(followup.getDate() + 7); // netlinking : J+7
      await db.pool.query(
        `INSERT INTO seo_link_outreach (target_id, subject, body, tracking_token, followup_date)
         VALUES ($1, $2, $3, $4, $5)`,
        [t.id, subject, body, token, followup.toISOString().slice(0, 10)]
      );
      await db.pool.query(
        `UPDATE seo_link_targets SET statut = 'contacte', contact_email = COALESCE(contact_email, $2) WHERE id = $1`,
        [t.id, to]
      );
      res.json({ success: true, followup_date: followup.toISOString().slice(0, 10) });
    } catch (e) {
      console.error('[SEO Backlinks] sendEmail:', e.message);
      const msg = /GMAIL/i.test(e.message) ? e.message : `Échec de l'envoi : ${e.message}`;
      res.status(500).json({ message: msg });
    }
  },

  // GET /api/seo/backlinks/status — config (Gmail/clés) + job en cours, pour l'UI.
  status: async (req, res) => {
    res.json({
      gmail: seoOutreach.isGmailConfigured(),
      opr: !!process.env.OPR_API_KEY,
      crux: !!process.env.CRUX_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      graph_ready: fs.existsSync(path.join(LINKGRAPH_DATA_DIR, 'manifest.json')),
      running_niche_id: runningNicheId
    });
  }
};

module.exports = ctrl;
