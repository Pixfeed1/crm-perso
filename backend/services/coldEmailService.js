// backend/services/coldEmailService.js
//
// Mode « Claude libre » : rédaction assistée par Claude (Anthropic Haiku), ENCADRÉE.
//
// Leçon des relectures : un modèle paraphrase. Quand on lui demandait « recopie cette
// présentation », il écrivait « je dirige une structure spécialisée ». Quand on lui donnait tous
// les signaux, il annonçait un certificat « qui affichera une alerte » et des versions
// « obsolètes ». Donc :
//   - le modèle n'écrit QUE deux choses : le constat (1 à 3 phrases) et la question finale ;
//   - il ne reçoit QUE les preuves (jamais les indices : PHP, versions, SSL bientôt, copyright…) ;
//     sans preuve, il écrit une observation neutre sur la boutique, sans aucun défaut ;
//   - la présentation, la proposition, le refus discret et la fin sont les MÊMES phrases que
//     l'email par la preuve, assemblées par le code ;
//   - son texte est vérifié (formules interdites, sujets non prouvés) : rejeté, on réessaie une
//     fois, puis on refuse plutôt que d'afficher un texte douteux.
//
// Coût ~0,003 $/email. L'humain relit avant d'envoyer, rien ne part d'ici.

const proof = require('./proofEmailService');
const { auditFlags, PREUVE_KEYS } = require('../utils/prospectScore');

const LLM_MODEL = 'claude-haiku-4-5-20251001';

// Identité de l'expéditeur (env). Conservée pour les autres appelants.
function senderIdentity(overrides = {}) {
  return {
    nom: overrides.nom || process.env.OUTREACH_SENDER_NAME || '',
    entreprise: overrides.entreprise || process.env.OUTREACH_SENDER_COMPANY || 'PixFeed',
    metier: overrides.metier || process.env.OUTREACH_SENDER_ROLE || 'maintenance et dépannage de sites professionnels'
  };
}

const TONS = {
  humain: 'Ton professionnel et naturel, courtois, direct.',
  direct: 'Ton sobre et factuel, va à l\'essentiel avec courtoisie.',
  doux: 'Ton prudent et courtois, aucune pression.'
};

// Sujets que le modèle n'a pas le droit d'aborder s'ils ne figurent pas dans les preuves fournies.
const SUJETS_NON_PROUVES = /\bphp\b|version|obsol|plus (maintenu|mis à jour|de mise)|certificat|\bssl\b|https|expir|alerte|avertissement|faille|sécurité|risque|sitemap|copyright|référencement|\bseo\b|google|mentions légales|cookies|rgpd|spf|dmarc|lent|vitesse|performance/i;

function stripDashes(text) {
  return String(text || '')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/^\s*-\s+/gm, '')
    .replace(/\s+-\s+/g, ', ')
    .replace(/,\s*,/g, ',');
}

function buildSystemPrompt(ton) {
  return [
    'Tu aides un développeur web indépendant à rédiger un PREMIER email à un commerçant ou artisan.',
    'Tu n\'écris PAS l\'email entier. Le code assemble la présentation, la proposition et la fin.',
    'Tu écris UNIQUEMENT :',
    '  - "motif" : 1 à 3 phrases courtes. Si des PREUVES sont fournies, reformule-en une (au plus deux)',
    '    telles quelles, sans rien ajouter ni déduire. Si AUCUNE preuve n\'est fournie, écris une observation',
    '    neutre sur la boutique (ce qu\'elle vend, d\'après son nom et sa technologie), SANS mentionner le',
    '    moindre défaut, risque, version, certificat ou réglage.',
    '  - "subject" : un objet d\'email court et factuel, sans point d\'exclamation.',
    'Le code ajoute ensuite la proposition de maintenance et la question : n\'en écris aucune.',
    TONS[ton] || TONS.humain,
    'Vouvoiement. Français. Aucun tiret (—, –, ou « - » de ponctuation) : virgules et points seulement.',
    'INTERDIT : alarmisme, leçon, culpabilisation, flatterie, superlatifs, emojis, toute conséquence non',
    'démontrée (« vous perdez des clients », « ça affichera une alerte », « votre site est à risque »),',
    'toute information absente des données (versions, PHP, certificat, Google, référencement).',
    'INTERDIT aussi : « une structure », « à mon compte », « je fais des sites », « sauté aux yeux »,',
    '« de l\'intérieur », « je ne vous relancerai pas », « un simple oui suffit », « rien de grave ».',
    'Ne te présente pas, ne signe pas, ne salue pas : seulement motif et subject.',
    'Réponds UNIQUEMENT avec un objet JSON valide : {"subject": "...", "motif": "..."}'
  ].join('\n');
}

// Preuves fournies au modèle : les phrases VÉRIFIÉES du catalogue (jamais les indices).
function preuvesPour(row) {
  if (!row) return [];
  const flags = auditFlags(row);
  return proof.PREUVES_ORDRE.filter((k) => flags.some((f) => f.key === k)).slice(0, 2)
    .map((k) => proof.CATALOGUE[k](row).preuve);
}

function buildUserPrompt(row, lead) {
  const r = row || { domain: (lead && (lead.company || lead.website)) || '' };
  const nom = proof.nomBoutique(r) || (lead && lead.name) || r.domain;
  const preuves = preuvesPour(row);
  return [
    'DONNÉES (seules informations utilisables) :',
    `- Boutique : ${nom}`,
    `- Site : ${r.domain || '—'}`,
    r.platform && r.platform !== 'Inconnu' ? `- Technologie : ${r.platform}` : null,
    r.naf_label && r.sirene_match === 'sur' ? `- Activité : ${r.naf_label}` : null,
    '',
    preuves.length
      ? `PREUVES VÉRIFIÉES (reformule-en une, au plus deux, sans rien ajouter) :\n${preuves.map((p) => `- ${p}`).join('\n')}`
      : 'PREUVES VÉRIFIÉES : aucune. Observation neutre uniquement, aucun défaut, aucun sujet technique.',
    '',
    'Réponds avec le JSON demandé.'
  ].filter(Boolean).join('\n');
}

function parseJsonLoose(text) {
  if (!text) return null;
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(t.slice(start, end + 1)); } catch { return null; }
}

/**
 * Vérifie le texte du modèle. Renvoie null si acceptable, sinon la raison du rejet.
 * @param {string} texte motif + question
 * @param {boolean} avecPreuves des preuves ont-elles été fournies ?
 */
function validerTexte(texte, avecPreuves) {
  const t = String(texte || '');
  if (!t.trim()) return 'texte vide';
  if (proof.FORMULES_INTERDITES.test(t)) return 'formule interdite';
  if (/\bune structure\b/i.test(t)) return 'présentation paraphrasée';
  if (!avecPreuves && SUJETS_NON_PROUVES.test(t)) return 'sujet technique sans preuve';
  if (/\d+\s*jours?/i.test(t) && !avecPreuves) return 'délai inventé';
  if (/\btu\b|\bton\b|\btes\b/i.test(t)) return 'tutoiement';
  if (t.split(/\s+/).filter(Boolean).length > 90) return 'trop long';
  return null;
}

// Assemblage déterministe : mêmes briques que l'email par la preuve.
function assembleColdEmail({ row, lead, motif }) {
  const r = row || { domain: (lead && (lead.company || lead.website)) || '', platform: lead && lead.platform };
  return [
    proof.salutation(r, lead),
    '',
    proof.presentation(),
    '',
    stripDashes(motif).trim(),
    '',
    proof.conclusion(r), // proposition, question, lien : mêmes phrases que l'email par la preuve
    '',
    "Si vous ne souhaitez plus être contacté, n'hésitez pas à me le signaler.",
    '',
    'Bonne journée à vous,'
  ].join('\n');
}

async function callAnthropic(system, userPrompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY manquante dans .env');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: LLM_MODEL, max_tokens: 400, system, messages: [{ role: 'user', content: userPrompt }] })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status} : ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.content || []).map((c) => c.text || '').join('').trim();
}

/**
 * Rédige l'email « Claude libre ».
 * @param {{ row: object|null, lead: object }} input  ligne crawl_results (ou null) + fiche prospect
 * @param {{ ton?: string, callModel?: Function }} options  callModel injectable (tests, sans réseau)
 * @returns {Promise<{subject, body, model, preuves_utilisees: string[]}>}
 */
async function draftColdEmail(input, options = {}) {
  const row = input.row || null;
  const lead = input.lead || {};
  const ton = options.ton || 'humain';
  const callModel = options.callModel || callAnthropic;
  const preuves = preuvesPour(row);
  const system = buildSystemPrompt(ton);
  const userPrompt = buildUserPrompt(row, lead);

  let dernierRejet = null;
  for (let essai = 0; essai < 2; essai++) {
    const rappel = essai === 0 ? '' : `\n\nTon précédent texte a été refusé (${dernierRejet}). Respecte strictement les règles : aucun sujet technique hors preuves, aucune formule interdite.`;
    const text = await callModel(system, userPrompt + rappel);
    const parsed = parseJsonLoose(text);
    if (!parsed || !parsed.motif) { dernierRejet = 'réponse illisible'; continue; }
    const motif = stripDashes(parsed.motif);
    dernierRejet = validerTexte(motif, preuves.length > 0);
    if (dernierRejet) continue;
    const subject = stripDashes(String(parsed.subject || '').trim()).replace(/!+/g, '').trim();
    return {
      subject: subject && !proof.FORMULES_INTERDITES.test(subject) ? subject : `Votre ${proof.typeSite(row || {})} ${(row && row.domain) || lead.company || ''}`.trim(),
      body: assembleColdEmail({ row, lead, motif }),
      model: LLM_MODEL,
      preuves_utilisees: preuves
    };
  }
  throw Object.assign(new Error(`Rédaction refusée : le texte produit par le modèle contenait « ${dernierRejet} ». Utilisez « Email par la preuve » ou un modèle du menu.`), { status: 422 });
}

module.exports = { draftColdEmail, senderIdentity, buildSystemPrompt, buildUserPrompt, validerTexte, assembleColdEmail, preuvesPour, SUJETS_NON_PROUVES };
