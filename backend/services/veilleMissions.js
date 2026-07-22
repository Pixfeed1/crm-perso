// backend/services/veilleMissions.js
//
// Agent "Veille missions" : agrège des annonces freelance de PLUSIEURS sources
// (France Travail = principale, JSearch = complément bridé, Jooble = secondaire),
// pré-filtre gratuitement (mots-clés + langue FR), qualifie au LLM (Anthropic Haiku)
// uniquement les annonces retenues, applique un filtrage final souple (francophone,
// full remote, TJM plancher), puis insère en base. Moteur de qualif IA partagé.
//
// CLÉS API (.env) :
//   POLE_EMPLOI_CLIENT_ID/SECRET/SCOPE -> France Travail (déjà utilisé par l'onglet Offres)
//   JSEARCH_API_KEY / JSEARCH_API_HOST -> JSearch RapidAPI (complément, quota limité)
//   JOOBLE_API_KEY                     -> Jooble (https://jooble.org/api/about)
//   ANTHROPIC_API_KEY                  -> Anthropic (https://console.anthropic.com/)
// Voir aussi backend/.env.example.

const poleEmploiService = require('./poleEmploiService');
const googleJobsService = require('./googleJobsService'); // JSearch (RapidAPI)

const LLM_MODEL = 'claude-haiku-4-5-20251001';
const MAX_LLM_CALLS = 80;          // garde-fou coût : 80 qualifications LLM max par run
const JOOBLE_PAGES = 5;            // nb de pages récupérées par mot-clé (Jooble) — + de volume
const JSEARCH_MAX_CALLS = 3;       // complément bridé : 3 requêtes JSearch max par run (quota)
const FT_RANGES = ['0-149', '150-299']; // France Travail : 2 pages de 150 -> + de volume

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

// true = à écarter d'office (annonce non francophone). On exige AU MOINS un marqueur
// français : une vraie offre FR contient quasi toujours plusieurs mots-outils (le, la, et,
// pour, mission...). fr === 0 => pas français. Le seuil en >= 2 attrape aussi les annonces
// anglaises COURTES (titre + snippet) que l'ancien seuil (en >= 4) laissait passer.
function looksEnglishOnly(texte) {
  const fr = countHits(texte, FR_HINTS);
  const en = countHits(texte, EN_HINTS);
  return fr === 0 && en >= 2;
}

// Scoring "type mission" (GRATUIT, avant l'IA). But : écarter le SALARIAT EXCLUSIF, sans
// jeter les offres mixtes "CDI ou Freelance / Portage" (très fréquentes et VALABLES).
const MISSION_TITRE_POS = ['freelance', 'mission', 'prestation', 'indépendant', 'independant', 'consultant', 'régie', 'regie', 'portage'];
const MISSION_DESC_POS = ['tjm', 'régie', 'regie', 'client final', 'full remote', 'durée de mission', 'duree de mission', 'freelance', 'portage'];
const MISSION_TECHNOS = ['php', 'wordpress', 'prestashop', 'react', 'next.js', 'nextjs', 'python', 'symfony', 'laravel'];
// Marqueurs "c'est (aussi) une mission" : leur présence DÉSAMORCE la pénalité salariat.
const MISSION_MARKERS = ['freelance', 'mission', 'portage', 'tjm', 'régie', 'regie', 'prestation', 'indépendant', 'independant', 'consultant', 'indé'];
// Salariat STRICT (jamais du freelance) : titre.
const CDI_TITRE_NEG = ['cdi', 'cdd', 'salarié', 'salarie'];
// Indices salariat "doux" en description (pénalité seulement si AUCUN marqueur mission).
const CDI_DESC_NEG = ['rémunération annuelle', 'remuneration annuelle', 'mutuelle', 'tickets restaurant', 'ticket restaurant', 'contrat de travail', '13e mois', '13ème mois', '13eme mois'];

const anyHit = (text, words) => words.some((w) => text.includes(w));

// Technos HORS PÉRIMÈTRE (jamais pour ce profil) -> écartées d'office, avant l'IA.
// ÉDITABLE. Match sur titre+description (insensible à la casse).
const TECHNO_EXCLUS = [
  'as400', 'as/400', 'rpg', 'cobol', 'mainframe', 'abap', ' sap ', 'sap ', ' sap', 'salesforce',
  'servicenow', 'react native', 'react-native', 'flutter', 'embarqué', 'embarque', 'firmware',
  'c++ embarqué', 'développeur mobile', 'developpeur mobile', 'application mobile', 'app mobile',
  'mobile natif', 'natif ios', 'natif android'
];

// Renvoie le terme hors-périmètre matché, sinon null.
function matchTechnoExclus(titre, description) {
  const hay = ` ${lower(titre)} ${lower(description)} `;
  return TECHNO_EXCLUS.find((w) => hay.includes(w)) || null;
}

function scoreMission(titre, description) {
  const t = lower(titre);
  const d = lower(description);
  const all = `${t} ${d}`;
  const hasMission = anyHit(all, MISSION_MARKERS); // "CDI ou Freelance", "Portage", "TJM"...
  let score = 0;
  if (anyHit(t, MISSION_TITRE_POS)) score += 40;
  if (anyHit(d, MISSION_DESC_POS)) score += 30;
  if (anyHit(all, MISSION_TECHNOS)) score += 20;
  // Pénalité FORTE seulement si SALARIAT EXCLUSIF (CDI/CDD/salarié et AUCUN marqueur mission).
  if (!hasMission && anyHit(t, CDI_TITRE_NEG)) score -= 100;
  // Indices salariat en description : pénalité douce, et uniquement sans marqueur mission.
  if (!hasMission && anyHit(d, CDI_DESC_NEG)) score -= 60;
  return score;
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
{"francophone": bool (mets false UNIQUEMENT si l'annonce est clairement dans une autre langue / la mission ne peut pas se mener en français ; en cas de doute mets true), "remote_statut": "full_remote" | "sur_site" | "non_precise" ("full_remote" si télétravail total / remote / 100% télétravail ; "non_precise" si télétravail partiel/hybride (ex: 2 jours sur site) OU si non précisé ; "sur_site" UNIQUEMENT si présentiel strict explicite SANS aucun télétravail), "montant": "string (ex '400€/j', ou 'à confirmer' si non chiffré)", "score": int (0-100, adéquation avec le profil), "score_label": "fort" | "à vérifier" | "faible", "raison": "phrase courte en français", "brouillon": "réponse FR personnalisée ~4 lignes, sans signature"}`;

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

// Normalise une annonce Jooble brute -> forme interne commune.
function normalizeJob(job) {
  const lien = job.link || '';
  return {
    source: 'jooble',
    uid: lien || `jooble-${job.title || ''}-${job.company || ''}-${job.updated || ''}`,
    titre: job.title || 'Sans titre',
    entreprise: job.company || '',
    source_label: `via Jooble${job.source ? ` · ${job.source}` : ''}`,
    lien,
    description: job.snippet || '',
    date_annonce: job.updated ? job.updated.slice(0, 10) : null,
    montant_brut: job.salary || null
  };
}

// FRANCE TRAVAIL (source principale, francophone, gratuit). Réutilise poleEmploiService.
// Pagine sur plusieurs "range" (150 max/req) pour ramener plus de volume.
async function fetchFranceTravail(keyword) {
  if (!poleEmploiService.isConfigured()) return [];
  const out = [];
  for (const range of FT_RANGES) {
    let offers = [];
    try {
      ({ offers } = await poleEmploiService.searchOffers({ motsCles: keyword, range }));
    } catch (e) {
      console.error(`[Veille] France Travail "${keyword}" range ${range}:`, e.message);
      break; // 206/range hors limite -> on arrête la pagination pour ce mot-clé
    }
    if (!offers || offers.length === 0) break;
    out.push(...offers.map((o) => ({
      source: 'france_travail',
      uid: `ft-${o.id}`,
      titre: o.intitule || 'Offre',
      entreprise: (o.entreprise && o.entreprise.nom) || '',
      source_label: 'via France Travail',
      lien: `https://candidat.pole-emploi.fr/offres/recherche/detail/${o.id}`,
      description: o.description || '',
      date_annonce: o.dateCreation ? o.dateCreation.slice(0, 10) : null,
      montant_brut: (o.salaire && o.salaire.libelle) || null
    })));
  }
  return out;
}

// JSEARCH (complément bridé, pays=fr). Réutilise googleJobsService.
async function fetchJSearch(keyword) {
  if (!googleJobsService.isConfigured()) return [];
  const opps = await googleJobsService.searchOpportunities(keyword, { location: 'France' });
  return (opps || []).map((o) => ({
    source: 'jsearch',
    uid: `js-${o.id || o.url || o.title}`,
    titre: o.title || 'Offre',
    entreprise: o.company_name || '',
    source_label: 'via JSearch',
    lien: o.url || '',
    description: o.description || '',
    date_annonce: o.posted_date ? String(o.posted_date).slice(0, 10) : null,
    montant_brut: o.salary || null
  }));
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
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY manquante dans .env');
  const ftOk = poleEmploiService.isConfigured();
  const jsOk = googleJobsService.isConfigured();
  const joobleOk = !!process.env.JOOBLE_API_KEY;
  if (!ftOk && !jsOk && !joobleOk) {
    throw new Error('Aucune source configurée (.env) : France Travail, JSearch ou Jooble');
  }

  runStatus = {
    running: true, etape: 'recuperation', message: 'Récupération des annonces…',
    processed: 0, total: 0, report: null, error: null,
    started_at: new Date().toISOString(), finished_at: null
  };

  const report = {
    recuperees: 0,
    apres_prefiltre_langue: 0,
    qualifiees_ia: 0,
    retenues: 0,
    rejets: { anti_cdi: 0, techno: 0, non_francophone: 0, non_remote: 0, tjm_insuffisant: 0, sans_montant_rejete: 0, doublon: 0 },
    sources: {
      france_travail: { recuperees: 0, retenues: 0 },
      jsearch: { recuperees: 0, retenues: 0 },
      jooble: { recuperees: 0, retenues: 0 }
    },
    // Quelles sources sont réellement CONFIGURÉES (clés en .env) : évite un "0 annonce"
    // trompeur quand p.ex. France Travail n'a pas ses identifiants.
    sources_configurees: { france_travail: ftOk, jsearch: jsOk, jooble: joobleOk },
    erreurs: 0,
    llm_calls: 0
  };
  if (!ftOk) console.warn('[Veille] France Travail NON configuré (POLE_EMPLOI_CLIENT_ID/SECRET) -> source francophone absente.');
  // Exemples d'écartés PAR catégorie (max 3) pour diagnostic.
  const rejetsExemples = { langue: [], anti_cdi: [], techno: [], remote: [], tjm: [] };
  const ajoutRejet = (cat, titre, raison) => {
    if (rejetsExemples[cat] && rejetsExemples[cat].length < 3) rejetsExemples[cat].push({ titre, raison });
  };

  try {
  // a) Récupération MULTI-SOURCES (toutes normalisées dans le même flux).
  // Requêtes orientées "mission" (éditables dans veille_criteres.requetes) ; repli sur
  // les mots requis si la liste est vide.
  const brutes = [];
  const motsRequis = criteres.mots_requis || [];
  const requetes = (criteres.requetes && criteres.requetes.length) ? criteres.requetes : motsRequis;

  // 1) FRANCE TRAVAIL — source principale (toutes les requêtes).
  if (ftOk) {
    for (const kw of requetes) {
      try {
        const offs = await fetchFranceTravail(kw);
        brutes.push(...offs);
      } catch (e) { report.erreurs++; console.error(`[Veille] France Travail "${kw}":`, e.message); }
    }
  }

  // 2) JSEARCH — complément BRIDÉ (JSEARCH_MAX_CALLS requêtes max ; 429 -> on ignore).
  if (jsOk) {
    let jsCalls = 0;
    for (const kw of requetes) {
      if (jsCalls >= JSEARCH_MAX_CALLS) break;
      jsCalls++;
      try {
        const offs = await fetchJSearch(kw);
        brutes.push(...offs);
      } catch (e) {
        console.error(`[Veille] JSearch "${kw}":`, e.message);
        if (/limite|quota|429/i.test(e.message || '')) { console.log('[Veille] JSearch quota atteint -> source ignorée'); break; }
        report.erreurs++;
      }
    }
  }

  // 3) JOOBLE — source secondaire.
  if (joobleOk) {
    for (const kw of requetes) {
      for (let page = 1; page <= JOOBLE_PAGES; page++) {
        try {
          const jobs = await fetchJooble(kw, page);
          brutes.push(...jobs.map(normalizeJob));
        } catch (e) {
          report.erreurs++;
          console.error(`[Veille] Jooble "${kw}" p${page}:`, e.message);
        }
      }
    }
  }
  report.recuperees = brutes.length;

  // Dédup inter-sources : par uid (URL) OU titre+entreprise.
  runStatus.etape = 'filtrage';
  runStatus.message = 'Filtrage des annonces…';
  const seen = new Set();
  const candidates = [];
  for (const n of brutes) {
    if (!n || !n.uid) continue;
    const key = n.lien ? `url:${n.lien}` : `te:${(n.titre || '').toLowerCase()}|${(n.entreprise || '').toLowerCase()}`;
    if (seen.has(n.uid) || seen.has(key)) continue;
    seen.add(n.uid); seen.add(key);
    if (report.sources[n.source]) report.sources[n.source].recuperees++;
    candidates.push(n);
  }
  runStatus.total = candidates.length;

  for (const annonce of candidates) {
    // Dédup inter-run sur un identifiant STABLE, TOUS statuts confondus (y compris
    // 'ecarte' / 'traite') : une annonce déjà connue n'est JAMAIS ré-insérée, même
    // si elle revient d'une AUTRE source (uid différent). Clés : uid exact, OU URL
    // normalisée, OU titre+entreprise normalisés (match inter-sources).
    const lienNorm = (annonce.lien || '').toLowerCase().trim();
    const titreNorm = (annonce.titre || '').toLowerCase().trim();
    const entNorm = (annonce.entreprise || '').toLowerCase().trim();
    const known = await db.pool.query(
      `SELECT 1 FROM veille_annonces
         WHERE jooble_uid = $1
            OR ($2 <> '' AND lower(btrim(lien)) = $2)
            OR ($3 <> '' AND lower(btrim(titre)) = $3 AND lower(btrim(coalesce(entreprise,''))) = $4)
         LIMIT 1`,
      [annonce.uid, lienNorm, titreNorm, entNorm]
    );
    if (known.rows.length > 0) { report.rejets.doublon++; continue; }

    const texte = `${annonce.titre} ${annonce.description}`;

    // b1) Pré-filtre mots-clés gratuit (>=1 requis, 0 exclu).
    if (!passesPrefilter(texte, criteres.mots_requis, criteres.mots_exclus)) {
      continue;
    }
    // b2) Pré-écran langue : écarte d'office les annonces manifestement anglophones
    //     (économise des appels IA). La confirmation "francophone" reste faite par l'IA.
    if (looksEnglishOnly(texte)) {
      report.rejets.non_francophone++;
      ajoutRejet('langue', annonce.titre, 'pré-écran : massivement anglais');
      continue;
    }
    report.apres_prefiltre_langue++;

    // b3) Techno hors périmètre (GRATUIT, avant l'IA) : as400, SAP, mobile natif… -> écarté.
    const technoKo = matchTechnoExclus(annonce.titre, annonce.description);
    if (technoKo) {
      report.rejets.techno++;
      ajoutRejet('techno', annonce.titre, `hors périmètre : ${technoKo.trim()}`);
      continue;
    }

    // b4) Scoring anti-CDI (GRATUIT, avant l'IA) : écarte le salariat. Score < 0 -> écarté.
    const sMission = scoreMission(annonce.titre, annonce.description);
    if (sMission < 0) {
      report.rejets.anti_cdi++;
      ajoutRejet('anti_cdi', annonce.titre, `score ${sMission}`);
      continue;
    }

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
    report.qualifiees_ia++;

    // d) Filtrage final — RÈGLE : ne rejeter que sur un critère VÉRIFIÉ négatif,
    //    jamais sur un critère inconnu/non précisé.

    // d1) Francophone : rejeter UNIQUEMENT si clairement non français (doute -> garder).
    if (q.francophone === false) {
      report.rejets.non_francophone++;
      ajoutRejet('langue', annonce.titre, `IA non francophone (${q.raison || ''})`);
      continue;
    }

    // d2) Remote : rejeter UNIQUEMENT si explicitement sur site/présentiel.
    //     'non_precise' -> on garde avec un tag "remote à confirmer".
    const remoteStatut = q.remote_statut || (q.full_remote === true ? 'full_remote' : 'non_precise');
    if (criteres.full_remote_only && remoteStatut === 'sur_site') {
      report.rejets.non_remote++;
      ajoutRejet('remote', annonce.titre, 'IA : présentiel strict');
      continue;
    }
    const fullRemote = remoteStatut === 'full_remote';
    const remoteAConfirmer = remoteStatut === 'non_precise';

    // d3) TJM : rejeter UNIQUEMENT si un montant est explicitement chiffré ET < tjm_min.
    //     Sans montant -> garder en "à confirmer" (jamais de rejet).
    const montantStr = q.montant || (annonce.montant_brut ? String(annonce.montant_brut) : 'à confirmer');
    const montantNum = parseMontant(montantStr);
    if (montantNum !== null && montantNum < criteres.tjm_min) {
      report.rejets.tjm_insuffisant++;
      ajoutRejet('tjm', annonce.titre, `TJM ${montantNum}€ < ${criteres.tjm_min}€`);
      continue;
    }
    const montantFinal = montantNum !== null ? montantStr : 'à confirmer';

    // e) Insert.
    try {
      const score = Math.max(0, Math.min(100, parseInt(q.score, 10) || 0));
      const label = ['fort', 'à vérifier', 'faible'].includes(q.score_label) ? q.score_label
        : (score >= 70 ? 'fort' : score >= 40 ? 'à vérifier' : 'faible');
      const raison = remoteAConfirmer ? `Remote à confirmer · ${q.raison || ''}`.slice(0, 500) : (q.raison || '').slice(0, 500);
      await db.pool.query(
        `INSERT INTO veille_annonces
           (jooble_uid, titre, entreprise, source_label, lien, description, date_annonce,
            full_remote, montant, score, score_label, raison, brouillon, statut)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'nouveau')
         ON CONFLICT (jooble_uid) DO NOTHING`,
        [annonce.uid, annonce.titre, annonce.entreprise, annonce.source_label, annonce.lien,
         annonce.description, annonce.date_annonce, fullRemote, montantFinal,
         score, label, raison, (q.brouillon || '').slice(0, 2000)]
      );
      report.retenues++;
      if (report.sources[annonce.source]) report.sources[annonce.source].retenues++;
    } catch (e) {
      report.erreurs++;
      console.error('[Veille] Insert:', e.message);
    }
  }

  const s = report.sources;
  console.log(
    `[Veille] ${report.recuperees} récupérées -> ${report.apres_prefiltre_langue} filtrées (langue/mots) ` +
    `-> ${report.qualifiees_ia} qualifiées IA -> ${report.retenues} retenues`
  );
  console.log(
    `[Veille] Par source — France Travail: ${s.france_travail.retenues} (sur ${s.france_travail.recuperees}), ` +
    `JSearch: ${s.jsearch.retenues} (sur ${s.jsearch.recuperees}), ` +
    `Jooble: ${s.jooble.retenues} (sur ${s.jooble.recuperees}) -> total retenues ${report.retenues}`
  );
  const rj = report.rejets;
  console.log(
    `[Veille] Écartés par filtre — langue: ${rj.non_francophone}, techno (hors périmètre): ${rj.techno}, ` +
    `anti-CDI: ${rj.anti_cdi}, remote (présentiel): ${rj.non_remote}, TJM: ${rj.tjm_insuffisant}, doublon: ${rj.doublon}`
  );
  console.log('[Veille] Rejets (détail):', rj, '| LLM calls:', report.llm_calls, '| erreurs:', report.erreurs);
  // Exemples par catégorie (3 max) pour vérifier qu'on ne jette pas de bonnes offres.
  const labelCat = { langue: 'LANGUE', techno: 'TECHNO (hors périmètre)', anti_cdi: 'ANTI-CDI', remote: 'REMOTE', tjm: 'TJM' };
  for (const cat of Object.keys(rejetsExemples)) {
    const ex = rejetsExemples[cat];
    if (ex.length) {
      console.log(`[Veille] Exemples écartés ${labelCat[cat]} :`);
      ex.forEach((r) => console.log(`   - ${r.titre} — ${r.raison}`));
    }
  }

  runStatus.etape = 'termine';
  runStatus.report = report;
  runStatus.message = report.retenues > 0
    ? `Terminé : ${report.retenues} nouvelle(s) annonce(s)`
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
