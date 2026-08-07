// backend/services/seoOutreachService.js
//
// Canal outreach BACKLINKS — totalement SÉPARÉ du pipeline de prospection client :
//   - envoi depuis le GMAIL PERSO de Marc (GMAIL_USER + GMAIL_APP_PASSWORD), pas le
//     SMTP PixFeed de l'outil ; les réponses arrivent dans sa boîte Gmail ;
//   - rédaction « demande de lien » par Claude Haiku (ton humble, zéro tiret) ;
//   - scoring des cibles : Open PageRank (gratuit, 30k domaines/mois) + CrUX
//     (présence = trafic réel mesuré par Google, gratuit).
// Limite Gmail perso : 500 destinataires/24h — le netlinking en envoie 10-30/jour max.

const nodemailer = require('nodemailer');

const LLM_MODEL = 'claude-haiku-4-5-20251001';

// ─── Transport Gmail (lazy, séparé d'emailService) ───────────────────────────
let gmailTransport = null;

function isGmailConfigured() {
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function getGmailTransport() {
  if (!isGmailConfigured()) {
    throw new Error('Gmail non configuré : renseigne GMAIL_USER et GMAIL_APP_PASSWORD dans .env (mot de passe d\'application, 2FA requise).');
  }
  if (!gmailTransport) {
    gmailTransport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
    });
  }
  return gmailTransport;
}

async function sendViaGmail({ to, subject, html, text, headers = null, cc = null, bcc = null, attachments = null }) {
  const transporter = getGmailTransport();
  // cc/bcc acceptent "a@x, b@y" ou un tableau.
  const asList = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,;]/)).map((s) => String(s).trim()).filter(Boolean);
  const ccList = asList(cc); const bccList = asList(bcc);
  const info = await transporter.sendMail({
    from: process.env.GMAIL_USER, // l'adresse perso, telle quelle
    to, subject, html, text,
    ...(ccList.length ? { cc: [...new Set(ccList)].join(', ') } : {}),
    ...(bccList.length ? { bcc: [...new Set(bccList)].join(', ') } : {}),
    ...(attachments && attachments.length ? { attachments } : {}),
    ...(headers ? { headers } : {})
  });
  return info;
}

// ─── Rédaction « demande de lien » (Claude Haiku, ~0,003 $) ──────────────────

// Anti-tirets (même filet que la prospection : le tiret est le tell d'un texte IA).
function stripDashes(text) {
  return String(text || '')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/^[ \t]*[-*•]\s+/gm, '')
    .replace(/ +-\s+/g, ', ')
    .replace(/ ,/g, ',').replace(/,\s*,/g, ',').replace(/,\s*\./g, '.')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function parseJsonLoose(text) {
  if (!text) return null;
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const s = t.indexOf('{'); const e = t.lastIndexOf('}');
  if (s === -1 || e <= s) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
}

const SYSTEM_LINK = [
  "Tu écris un PREMIER email, en français, à l'éditeur d'un site web d'une niche précise,",
  "pour engager une conversation qui pourrait mener à un lien (backlink) vers ton site.",
  "Tu es un passionné de la niche qui a un site dessus, PAS un marketeur.",
  "",
  "POSTURE (crucial, la personne n'a rien demandé) :",
  "- Humble et sincère. Tu as VRAIMENT regardé son site : dis ce qui t'a plu, simplement.",
  "- Tu proposes, tu n'exiges rien. La demande de lien doit être LÉGÈRE : mentionner ton",
  "  site comme ressource possible pour ses lecteurs, et proposer d'en discuter.",
  "- Propose une contrepartie ouverte (parler de son site, un article invité, à voir).",
  "- INTERDITS : « stratégie SEO », « backlink », « netlinking », « autorité de domaine »,",
  "  jargon marketing, flatterie exagérée, urgence. C'est une conversation entre passionnés.",
  "",
  "STYLE :",
  "- Texte qui coule, phrases courtes, aucune liste.",
  "- INTERDICTION ABSOLUE DE TIRETS (—, –, « - » en ponctuation/incise/puce).",
  "  Virgules, points, parenthèses uniquement.",
  "- 70 à 120 mots. Commence par « Bonjour, ». 0 emoji.",
  "- Termine par une question ouverte simple, puis une formule de politesse courte",
  "  (« Bonne journée, » ou « Au plaisir, ») suivie du prénom fourni. RIEN d'autre après.",
  "",
  "Réponds UNIQUEMENT en JSON : {\"subject\": \"...\", \"body\": \"...\"} (vrais \\n dans body).",
].join("\n");

/**
 * Rédige un email de demande de lien.
 * @param {object} p { niche, site_cible, target_domain, target_title, angle }
 */
async function draftLinkEmail(p) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY manquante dans .env');
  const prenom = process.env.OUTREACH_SENDER_NAME || '';

  const user = [
    `NICHE : ${p.niche || '—'}`,
    `SON SITE (le destinataire) : ${p.target_domain}${p.target_title ? ` — « ${p.target_title} »` : ''}`,
    `TON SITE (à faire connaître) : ${p.site_cible || '—'}`,
    p.angle ? `ANGLE / CONTEXTE FOURNI PAR MARC : ${p.angle}` : null,
    prenom ? `PRÉNOM POUR SIGNER : ${prenom}` : "PRÉNOM : non fourni, termine sur la formule de politesse sans nom.",
    "",
    "Écris l'email."
  ].filter(Boolean).join("\n");

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: LLM_MODEL, max_tokens: 600, system: SYSTEM_LINK,
      messages: [{ role: 'user', content: user }]
    })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status} : ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = (data.content || []).map((c) => c.text || '').join('').trim();
  const parsed = parseJsonLoose(text);
  if (parsed && parsed.body) {
    return {
      subject: stripDashes(String(parsed.subject || '').trim()) || `À propos de ${p.target_domain}`,
      body: stripDashes(String(parsed.body).trim())
    };
  }
  return { subject: `À propos de ${p.target_domain}`, body: stripDashes(text) || '(réponse vide)' };
}

// ─── Découverte par mot-clé (Claude + recherche web, budget PLAFONNÉ) ────────
// Claude fait de vraies recherches web (variantes du mot-clé de la niche) et
// renvoie les domaines francophones pertinents. Le budget n'est PAS laissé à
// Claude : max_uses est un plafond DUR côté API (25 recherches ≈ 0,25 $ + tokens
// Haiku ≈ 0,15 $ -> ~0,40 $ pire cas par découverte).
const KEYWORD_MAX_SEARCHES = 25;

async function discoverByKeyword({ niche, hubs = '', site_cible = '' }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY manquante dans .env');

  const exclusions = [hubs, site_cible].filter(Boolean).join(', ');
  const prompt = [
    `Trouve des SITES WEB FRANCOPHONES qui parlent de la niche suivante : « ${niche} ».`,
    "Cherche large avec des variantes (tutoriel, blog, forum, avis, galerie, communauté,",
    "débutant…) en français. On veut des sites de la COMMUNAUTÉ : blogs perso, forums,",
    "sites de passionnés, magazines spécialisés.",
    "EXCLUS : les grandes plateformes (YouTube, Facebook, Reddit, Wikipedia, marketplaces),",
    exclusions ? `les sites suivants (déjà connus) : ${exclusions},` : null,
    "et les sites manifestement anglophones.",
    "",
    "À LA FIN, réponds avec UNIQUEMENT un objet JSON (aucun texte autour) :",
    '{"domains": ["exemple.fr", "autre-site.com"]}',
    "Uniquement des noms de domaine nus (sans https:// ni chemin), dédupliqués."
  ].filter(Boolean).join("\n");

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: LLM_MODEL,
      max_tokens: 3000,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: KEYWORD_MAX_SEARCHES }],
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status} : ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text || '').join('\n');
  const parsed = parseJsonLoose(text);
  const domains = Array.isArray(parsed?.domains) ? parsed.domains : [];
  // Plateformes jamais pertinentes comme cibles (match exact ou sous-domaine de google/
  // facebook…). ATTENTION : on ne bloque PAS *.wordpress.com / *.blogspot.com — ce sont
  // de vrais blogs de niche (le blog DAZ de Marc en est la preuve).
  const JUNK = new Set(['google.com', 'sites.google.com', 'youtube.com', 'facebook.com',
    'instagram.com', 'twitter.com', 'x.com', 'linkedin.com', 'pinterest.com',
    'wikipedia.org', 'reddit.com', 'amazon.com', 'amazon.fr', 'tumblr.com',
    'wordpress.org', 'discord.com', 'twitch.tv', 'deviantart.com', 'patreon.com']);
  const isJunk = (d) => JUNK.has(d) || d.endsWith('.google.com') || d.endsWith('.facebook.com')
    || d.endsWith('.wikipedia.org') || d.endsWith('.amazon.com') || d.endsWith('.amazon.fr');
  // Nettoyage : domaine nu, minuscule, avec un point, sans chemin, hors plateformes.
  const clean = [...new Set(domains
    .map((d) => String(d).toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0])
    .filter((d) => d.includes('.') && d.length < 100 && !isJunk(d)))];
  const searches = (data.usage && data.usage.server_tool_use && data.usage.server_tool_use.web_search_requests) || null;
  return { domains: clean, searches_used: searches };
}

// ─── Scoring : Open PageRank + CrUX ──────────────────────────────────────────

// Open PageRank (Keywords Everywhere) : 100 domaines/requête, 30k/mois gratuits.
// Nouvelle API (2026) : POST /v1/domains/bulk + Bearer (SANS /api — vérifié : /api/v1
// renvoie leur page 404). Surcharge via OPR_API_URL si le endpoint bouge encore.
const OPR_URL = process.env.OPR_API_URL
  || 'https://openpagerank.keywordseverywhere.com/v1/domains/bulk';

// Extrait un score 0-10 quel que soit le nom de champ retourné.
// Format réel vérifié (curl de Marc, 2026) : { domain, found, open_page_rank, rank,
// referring_domains, history: [...] } sous un tableau au niveau racine.
function oprScore(row) {
  for (const k of ['open_page_rank', 'page_rank_decimal', 'page_rank', 'opr', 'score', 'current']) {
    const v = parseFloat(row && row[k]);
    if (!Number.isNaN(v)) return v;
  }
  return null;
}

async function fetchOpenPageRank(domains) {
  const key = process.env.OPR_API_KEY;
  if (!key) return {};
  const out = {};
  for (let i = 0; i < domains.length; i += 100) {
    const batch = domains.slice(i, i + 100);
    try {
      const res = await fetch(OPR_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        // include_history:false — on ne veut que le score actuel (réponse ~100x plus légère).
        body: JSON.stringify({ domains: batch, include_history: false })
      });
      if (!res.ok) { console.error('[SEO Backlinks] OPR HTTP', res.status); continue; }
      const data = await res.json();
      // Tolérant sur l'enveloppe : clés connues, sinon premier tableau trouvé dans l'objet.
      const rows = data.response || data.results || data.domains || data.data
        || (Array.isArray(data) ? data : Object.values(data).find(Array.isArray)) || [];
      const list = Array.isArray(rows) ? rows
        : Object.entries(rows).map(([domain, v]) => (typeof v === 'object' ? { domain, ...v } : { domain, page_rank: v }));
      for (const row of list) {
        const v = oprScore(row);
        const dom = (row.domain || row.name || '').toLowerCase();
        if (dom && v != null) out[dom] = v;
      }
    } catch (e) {
      console.error('[SEO Backlinks] OPR:', e.message);
    }
  }
  return out;
}

// CrUX : présence dans le dataset = trafic réel mesuré par Chrome. 404 = absent.
async function checkCrux(domain) {
  const key = process.env.CRUX_API_KEY;
  if (!key) return null; // inconnu (clé non configurée)
  try {
    const res = await fetch(
      `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ origin: `https://${domain}` })
      }
    );
    if (res.status === 404) return false;
    if (res.ok) return true;
    return null;
  } catch { return null; }
}

// Score composite 0-100 : autorité (OPR), trafic réel (CrUX), pertinence (liens vers
// les hubs), vivant + francophone. Honnête : un proxy, pas une vérité — mais composé
// de sources RÉELLES (pas d'estimation propriétaire opaque).
function computeScore(t) {
  let s = 0;
  if (t.opr != null) s += Math.round(Math.min(10, Number(t.opr)) * 6); // 0-60
  if (t.crux === true) s += 20;                                        // trafic réel
  if (t.referring_edges) s += Math.min(10, t.referring_edges);         // pertinence graphe
  if (t.alive === true) s += 5;
  if (t.lang === 'fr') s += 5;
  return Math.max(0, Math.min(100, s));
}

module.exports = {
  isGmailConfigured, sendViaGmail,
  draftLinkEmail, discoverByKeyword,
  fetchOpenPageRank, checkCrux, computeScore
};
