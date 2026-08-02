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

async function sendViaGmail({ to, subject, html, text }) {
  const transporter = getGmailTransport();
  const info = await transporter.sendMail({
    from: process.env.GMAIL_USER, // l'adresse perso, telle quelle
    to, subject, html, text
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

// ─── Scoring : Open PageRank + CrUX ──────────────────────────────────────────

// Open PageRank (Keywords Everywhere) : 100 domaines/requête, 30k/mois gratuits.
// Le endpoint historique reste servi ; surcharge possible via OPR_API_URL.
const OPR_URL = process.env.OPR_API_URL
  || 'https://openpagerank.keywordseverywhere.com/api/v1.0/getPageRank';

async function fetchOpenPageRank(domains) {
  const key = process.env.OPR_API_KEY;
  if (!key) return {};
  const out = {};
  for (let i = 0; i < domains.length; i += 100) {
    const batch = domains.slice(i, i + 100);
    const qs = batch.map((d) => `domains[]=${encodeURIComponent(d)}`).join('&');
    try {
      const res = await fetch(`${OPR_URL}?${qs}`, {
        headers: { 'API-OPR': key, 'Authorization': `Bearer ${key}` }
      });
      if (!res.ok) { console.error('[SEO Backlinks] OPR HTTP', res.status); continue; }
      const data = await res.json();
      for (const row of (data.response || [])) {
        const v = parseFloat(row.page_rank_decimal);
        if (row.domain && !Number.isNaN(v)) out[row.domain.toLowerCase()] = v;
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
  draftLinkEmail,
  fetchOpenPageRank, checkCrux, computeScore
};
