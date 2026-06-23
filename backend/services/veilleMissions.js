// backend/services/veilleMissions.js
//
// Agent "Veille missions" : récupère des annonces freelance (API Jooble), pré-filtre
// gratuitement par mots-clés, qualifie au LLM (Anthropic Haiku) uniquement les annonces
// retenues, applique un filtrage final (full remote, TJM plancher), puis insère en base.
//
// CLÉS API (.env) :
//   JOOBLE_API_KEY     -> clé Jooble (https://jooble.org/api/about)
//   ANTHROPIC_API_KEY  -> clé Anthropic (https://console.anthropic.com/)
// Voir aussi backend/.env.example.

const LLM_MODEL = 'claude-haiku-4-5-20251001';
const MAX_LLM_CALLS = 40;          // garde-fou coût : 40 qualifications LLM max par run
const JOOBLE_PAGES = 3;            // nb de pages récupérées par mot-clé

const lower = (s) => (s || '').toString().toLowerCase();

// Heuristique de langue (gratuite) : rejette les annonces manifestement anglophones
// (aucun mot français courant ET plusieurs mots anglais courants). Sert de pré-écran
// avant l'IA ; la décision finale "francophone" est confirmée par l'IA.
const FR_HINTS = [' le ', ' la ', ' les ', ' des ', ' une ', ' un ', ' et ', ' pour ', ' vous ', ' nous ', ' avec ', ' sur ', ' dans ', ' du ', ' au ', ' aux ', ' en ', ' est ', ' ou ', ' qui ', ' notre ', ' nos ', ' développeur', 'télétravail', ' mission', ' entreprise', ' recherche', ' compétences', ' poste', ' société', ' rémunér'];
const EN_HINTS = [' the ', ' and ', ' for ', ' you ', ' we ', ' with ', ' our ', ' is ', ' are ', ' to ', ' of ', ' in ', ' developer', ' remote ', ' team ', ' experience', ' skills', ' company', ' work ', ' join ', ' looking ', ' we\'re ', ' you\'ll '];

function countHits(text, hints) {
  const t = ` ${lower(text).replace(/\s+/g, ' ')} `;
  return hints.reduce((n, h) => (t.includes(h) ? n + 1 : n), 0);
}

// true = à écarter d'office (massivement anglais, aucun marqueur français).
function looksEnglishOnly(texte) {
  const fr = countHits(texte, FR_HINTS);
  const en = countHits(texte, EN_HINTS);
  return fr === 0 && en >= 3;
}

// Récupère la ligne de critères (créée par autoInit).
async function getCriteres(db) {
  const r = await db.pool.query('SELECT * FROM veille_criteres ORDER BY id ASC LIMIT 1');
  return r.rows[0] || null;
}

// Appel Jooble pour un mot-clé / une page. Renvoie un tableau d'annonces brutes.
// IMPORTANT : on N'envoie PAS location:"France" (cela étrangle les résultats à ~1) ;
// on cherche large et on filtre la langue/le remote ensuite (heuristique + IA).
async function fetchJooble(keyword, page) {
  const key = process.env.JOOBLE_API_KEY;
  if (!key) throw new Error('JOOBLE_API_KEY manquante dans .env');
  const res = await fetch(`https://jooble.org/api/${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywords: keyword, page: String(page) })
  });
  if (!res.ok) throw new Error(`Jooble HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.jobs) ? data.jobs : [];
}

// Pré-filtre GRATUIT : au moins un mot requis ET aucun mot exclu (titre + description).
function passesPrefilter(texte, motsRequis, motsExclus) {
  const t = lower(texte);
  const hasRequired = (motsRequis || []).some((m) => m && t.includes(lower(m)));
  if (!hasRequired) return false;
  const hasExcluded = (motsExclus || []).some((m) => m && t.includes(lower(m)));
  return !hasExcluded;
}

// Extrait un nombre de TJM d'une chaîne montant ("400€/j", "400 €", "400/jour"...).
function parseMontant(montant) {
  if (!montant) return null;
  const m = lower(montant).replace(/\s/g, '');
  const match = m.match(/(\d{2,5})/);
  return match ? parseInt(match[1], 10) : null;
}

// Qualification LLM (Anthropic Haiku) -> JSON strict. Renvoie null si échec parse.
async function qualifyLLM(annonce, profilReference) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY manquante dans .env');

  const prompt = `Tu qualifies une annonce de mission pour un développeur freelance.

PROFIL DE RÉFÉRENCE :
${profilReference || ''}

ANNONCE :
Titre : ${annonce.titre || ''}
Entreprise : ${annonce.entreprise || ''}
Description : ${(annonce.description || '').slice(0, 2000)}

Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, avec EXACTEMENT ces clés :
{"francophone": bool (true seulement si l'annonce est rédigée en français ET la mission peut se mener en français), "full_remote": bool, "montant": "string (ex '400€/j', ou 'à confirmer' si absent)", "score": int (0-100, adéquation avec le profil), "score_label": "fort" | "à vérifier" | "faible", "raison": "phrase courte en français", "brouillon": "réponse FR personnalisée ~4 lignes, sans signature"}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
  const data = await res.json();
  const text = (data.content && data.content[0] && data.content[0].text) || '';
  // Extraire le bloc JSON (le modèle peut parfois entourer de texte).
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Normalise une annonce Jooble brute -> forme interne.
function normalizeJob(job) {
  const lien = job.link || '';
  return {
    jooble_uid: lien || `${job.title || ''}-${job.company || ''}-${job.updated || ''}`,
    titre: job.title || 'Sans titre',
    entreprise: job.company || '',
    source_label: `via Jooble${job.source ? ` · ${job.source}` : ''}`,
    lien,
    description: job.snippet || '',
    date_annonce: job.updated ? job.updated.slice(0, 10) : null,
    montant_brut: job.salary || null
  };
}

// État du run courant (en mémoire, suivi temps réel via GET /api/veille/run/status).
let runStatus = {
  running: false, etape: null, message: null,
  processed: 0, total: 0, report: null, error: null,
  started_at: null, finished_at: null
};
const getRunStatus = () => runStatus;

/**
 * Lance un run de veille complet. Renvoie un compte-rendu.
 * Met à jour runStatus à chaque étape (suivi temps réel côté UI).
 * @param {Object} db - app.locals.db (utilise db.pool)
 */
async function runVeille(db) {
  if (runStatus.running) return { skipped: true, raison: 'Run déjà en cours' };

  const criteres = await getCriteres(db);
  if (!criteres) throw new Error('Critères de veille introuvables');
  if (!criteres.actif) return { skipped: true, raison: 'Veille désactivée' };
  // Vérif clés en amont -> erreur claire (sinon "0 annonce" trompeur).
  if (!process.env.JOOBLE_API_KEY) throw new Error('JOOBLE_API_KEY manquante dans .env');
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY manquante dans .env');

  runStatus = {
    running: true, etape: 'recuperation', message: 'Récupération des annonces…',
    processed: 0, total: 0, report: null, error: null,
    started_at: new Date().toISOString(), finished_at: null
  };

  const report = { recuperees: 0, prefiltrees: 0, qualifiees: 0, inserees: 0, ignorees: 0, non_francophone: 0, rejet_langue: 0, erreurs: 0, llm_calls: 0 };

  try {
  // a) Récupération Jooble (mots requis comme requêtes, plusieurs pages).
  const brutes = [];
  for (const kw of criteres.mots_requis || []) {
    for (let page = 1; page <= JOOBLE_PAGES; page++) {
      try {
        const jobs = await fetchJooble(kw, page);
        brutes.push(...jobs);
      } catch (e) {
        report.erreurs++;
        console.error(`[Veille] Jooble "${kw}" p${page}:`, e.message);
      }
    }
  }
  report.recuperees = brutes.length;

  // Dédup intra-run + normalisation.
  runStatus.etape = 'filtrage';
  runStatus.message = 'Filtrage des annonces…';
  const seen = new Set();
  const candidates = [];
  for (const job of brutes) {
    const n = normalizeJob(job);
    if (!n.jooble_uid || seen.has(n.jooble_uid)) continue;
    seen.add(n.jooble_uid);
    candidates.push(n);
  }
  runStatus.total = candidates.length;

  for (const annonce of candidates) {
    // Dédup base : ne jamais re-traiter une annonce déjà connue.
    const known = await db.pool.query('SELECT 1 FROM veille_annonces WHERE jooble_uid = $1 LIMIT 1', [annonce.jooble_uid]);
    if (known.rows.length > 0) continue;

    const texte = `${annonce.titre} ${annonce.description}`;

    // b1) Pré-filtre mots-clés gratuit (>=1 requis, 0 exclu).
    if (!passesPrefilter(texte, criteres.mots_requis, criteres.mots_exclus)) {
      continue;
    }
    // b2) Pré-écran langue : écarte d'office les annonces manifestement anglophones
    //     (économise des appels IA). La confirmation "francophone" reste faite par l'IA.
    if (looksEnglishOnly(texte)) {
      report.rejet_langue++;
      continue;
    }
    report.prefiltrees++;

    // Garde-fou coût LLM.
    if (report.llm_calls >= MAX_LLM_CALLS) {
      console.log('[Veille] Plafond LLM atteint, arrêt de la qualification.');
      break;
    }

    // c) Qualification LLM.
    runStatus.etape = 'qualification';
    runStatus.processed = report.llm_calls;
    runStatus.message = `Qualification IA… (${report.llm_calls + 1})`;
    let q;
    try {
      report.llm_calls++;
      q = await qualifyLLM(annonce, criteres.profil_reference);
    } catch (e) {
      report.erreurs++;
      console.error('[Veille] LLM:', e.message);
      continue;
    }
    if (!q) { report.erreurs++; continue; }
    report.qualifiees++;

    // d) Filtrage final.
    // d0) Francophone confirmé par l'IA : sinon écartée (non insérée).
    if (q.francophone === false) { report.non_francophone++; continue; }

    const fullRemote = q.full_remote === true;
    if (criteres.full_remote_only && !fullRemote) { report.ignorees++; continue; }

    const montantStr = q.montant || (annonce.montant_brut ? String(annonce.montant_brut) : 'à confirmer');
    const montantNum = parseMontant(montantStr);
    if (montantNum !== null) {
      if (montantNum < criteres.tjm_min) { report.ignorees++; continue; }
    } else if (!criteres.garder_sans_montant) {
      report.ignorees++; continue;
    }

    // e) Insert.
    try {
      const score = Math.max(0, Math.min(100, parseInt(q.score, 10) || 0));
      const label = ['fort', 'à vérifier', 'faible'].includes(q.score_label) ? q.score_label
        : (score >= 70 ? 'fort' : score >= 40 ? 'à vérifier' : 'faible');
      await db.pool.query(
        `INSERT INTO veille_annonces
           (jooble_uid, titre, entreprise, source_label, lien, description, date_annonce,
            full_remote, montant, score, score_label, raison, brouillon, statut)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'nouveau')
         ON CONFLICT (jooble_uid) DO NOTHING`,
        [annonce.jooble_uid, annonce.titre, annonce.entreprise, annonce.source_label, annonce.lien,
         annonce.description, annonce.date_annonce, fullRemote, montantNum !== null ? montantStr : 'à confirmer',
         score, label, (q.raison || '').slice(0, 500), (q.brouillon || '').slice(0, 2000)]
      );
      report.inserees++;
    } catch (e) {
      report.erreurs++;
      console.error('[Veille] Insert:', e.message);
    }
  }

  console.log(
    `[Veille] Jooble: ${report.recuperees} récupérées -> ${report.prefiltrees} après pré-filtre langue/mots ` +
    `-> ${report.qualifiees} qualifiées IA -> ${report.inserees} retenues (francophone + full remote)`
  );
  console.log('[Veille] Détail run:', report);

  runStatus.etape = 'termine';
  runStatus.report = report;
  runStatus.message = report.inserees > 0
    ? `Terminé : ${report.inserees} nouvelle(s) annonce(s)`
    : 'Terminé : aucune nouvelle annonce cette fois';
  return report;
  } catch (e) {
    runStatus.etape = 'erreur';
    runStatus.error = e.message || 'Erreur inconnue';
    console.error('[Veille] Run échoué:', e.message);
    throw e;
  } finally {
    runStatus.running = false;
    runStatus.finished_at = new Date().toISOString();
  }
}

module.exports = { runVeille, getCriteres, getRunStatus };
