// backend/services/coldEmailService.js
//
// Rédaction d'un email de prospection PERSONNALISÉ par Claude (Anthropic Haiku).
//
// Principe (voulu) :
//   - L'ANALYSE est faite par NOS outils (crawler : plateforme, SSL, mentions
//     légales, SPF, mobile…). Claude ne touche PAS à l'analyse -> 0 token gaspillé.
//   - Claude fait UNIQUEMENT la rédaction finale à partir des problèmes déjà
//     détectés, dans un ton HUMAIN (pas « gros gratteur »).
//   - L'humain relit/modifie avant d'envoyer (aucun envoi automatique ici).
//
// Réutilise le même appel que la veille (fetch direct, x-api-key, Haiku) :
// pas de nouvelle dépendance, même clé ANTHROPIC_API_KEY, coût ~0,003 $/email.

const LLM_MODEL = 'claude-haiku-4-5-20251001';

// Identité de l'expéditeur (surchargée par l'appel ou par l'env, repli neutre).
// nom volontairement vide par défaut : on ne veut JAMAIS signer avec un faux prénom
// inventé. À renseigner via OUTREACH_SENDER_NAME (ou l'appel) sinon signature entreprise.
function senderIdentity(overrides = {}) {
  return {
    nom: overrides.nom || process.env.OUTREACH_SENDER_NAME || '',
    entreprise: overrides.entreprise || process.env.OUTREACH_SENDER_COMPANY || 'PixFeed',
    metier: overrides.metier || process.env.OUTREACH_SENDER_ROLE || 'création et refonte de sites web'
  };
}

// Consigne de ton. 'humain' par défaut (le seul demandé). Extensible plus tard.
const TONS = {
  humain:
    "Ton HUMAIN, simple et honnête, comme un artisan qui a vraiment regardé le site. " +
    "Chaleureux mais sobre. Surtout PAS « gros gratteur » commercial.",
  direct:
    "Ton direct et factuel, va droit au but sur le problème principal, sans détour, " +
    "mais toujours poli et jamais agressif.",
  doux:
    "Ton doux et consultatif, approche conseil sans aucune pression, très rassurant."
};

// Formule de politesse de fin adaptée au moment de la journée (heure Europe/Paris).
// L'email est généré au moment où l'on clique, donc au plus près de l'envoi.
function formuleDeFin(date = new Date()) {
  let h;
  try {
    // fr-FR formate en « 10 h » -> parseInt lit bien le nombre en tête. hour12:false.
    const s = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris', hour: 'numeric', hour12: false
    }).format(date);
    h = parseInt(s, 10);
    if (Number.isNaN(h)) h = date.getHours();
    if (h === 24) h = 0; // minuit selon l'ICU
  } catch {
    h = date.getHours();
  }
  if (h < 12) return 'Belle matinée';
  if (h < 14) return 'Bon appétit';          // créneau déjeuner
  return 'Belle fin de journée';
}

function buildSystemPrompt(ton) {
  const consigneTon = TONS[ton] || TONS.humain;
  return [
    "Tu es un professionnel du web (freelance) qui écrit un PREMIER email de contact",
    "à un commerçant/artisan dont tu viens de regarder le site.",
    "Objectif : engager une conversation, PAS vendre agressivement.",
    consigneTon,
    "",
    "STYLE (très important) :",
    "- Écris comme un VRAI humain qui a pris deux minutes pour regarder le site.",
    "- Le texte doit COULER naturellement. N'enchaîne SURTOUT PAS les points avec",
    "  « D'abord… Ensuite… » ni une liste mécanique : intègre-les dans des phrases fluides.",
    "- Commence par « Bonjour, » puis une phrase d'accroche naturelle (ex. « je suis tombé",
    "  sur votre site … et j'ai jeté un œil »). Varie les formulations, ne sois pas robotique.",
    "",
    "RÈGLES STRICTES :",
    "- N'invente AUCUN fait. Utilise UNIQUEMENT les problèmes fournis dans les données.",
    "- Mentionne AU MAXIMUM 2 problèmes, les plus parlants pour un non-technicien,",
    "  expliqués en langage clair (le bénéfice, pas le jargon).",
    "- Interdits : superlatifs marketing (« boostez », « explosez vos ventes »,",
    "  « offre exceptionnelle »), fausse urgence, flatterie fausse, jargon technique lourd,",
    "  emojis à outrance (0 ou 1 maximum).",
    "- Longueur du corps : 90 à 150 mots. Phrases courtes.",
    "- Avant-dernière ligne : UNE question ouverte simple (proposer un échange, pas un rdv forcé).",
    "- DERNIÈRE partie = formule de politesse : utilise EXACTEMENT la formule de fin fournie",
    "  dans les données (ex. « Belle matinée »), suivie d'un retour à la ligne puis la signature",
    "  (prénom + « — » + entreprise, ou entreprise seule si aucun prénom fourni).",
    "- Écris en français.",
    "",
    "Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, de la forme :",
    '{"subject": "...", "body": "..."}',
    "Le body contient des vrais retours à la ligne (\\n)."
  ].join("\n");
}

function buildUserPrompt(prospect, sender) {
  const cible = prospect.dirigeant
    ? `${prospect.dirigeant} (dirigeant)`
    : (prospect.raison_sociale || prospect.company || prospect.domain);
  const problemes = (prospect.problemes || []).filter(Boolean);
  const lignes = [
    "DONNÉES DU PROSPECT (détectées par notre outil, factuelles) :",
    `- Site : ${prospect.domain || '—'}`,
    prospect.raison_sociale ? `- Entreprise : ${prospect.raison_sociale}` : null,
    prospect.dirigeant ? `- Interlocuteur : ${prospect.dirigeant}` : null,
    prospect.platform && prospect.platform !== 'Inconnu'
      ? `- Technologie du site : ${prospect.platform}${prospect.platform_version ? ` (${prospect.platform_version})` : ''}`
      : null,
    prospect.secteur ? `- Secteur : ${prospect.secteur}` : null,
    "",
    problemes.length
      ? `PROBLÈMES DÉTECTÉS (choisis-en 1 ou 2, les plus parlants) :\n${problemes.map((p) => `- ${p}`).join("\n")}`
      : "PROBLÈMES DÉTECTÉS : aucun signal fort — reste général, propose simplement un regard extérieur sur le site.",
    "",
    "EXPÉDITEUR (pour la signature) :",
    sender.nom
      ? `- Prénom : ${sender.nom}`
      : "- Prénom : NON FOURNI — signe uniquement avec le nom de l'entreprise, n'invente aucun prénom.",
    `- Entreprise : ${sender.entreprise}`,
    `- Activité : ${sender.metier}`,
    "",
    `FORMULE DE FIN À UTILISER (obligatoire, telle quelle) : ${sender.formuleFin}`,
    "",
    `Écris l'email à ${cible}.`
  ].filter(Boolean);
  return lignes.join("\n");
}

// Extrait le premier objet JSON d'une réponse (robuste aux ```json … ``` ou texte parasite).
function parseJsonLoose(text) {
  if (!text) return null;
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Rédige un email de prospection.
 * @param {object} prospect { domain, company, raison_sociale, dirigeant, platform,
 *                            platform_version, secteur, problemes: string[] }
 * @param {object} options  { ton, sender: {nom, entreprise, metier} }
 * @returns {Promise<{subject:string, body:string, model:string}>}
 */
async function draftColdEmail(prospect, options = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY manquante dans .env');

  const ton = options.ton || 'humain';
  const sender = senderIdentity(options.sender || {});
  // Formule de fin selon l'heure (surchargeable via options.formuleFin pour tester).
  sender.formuleFin = options.formuleFin || formuleDeFin();
  const system = buildSystemPrompt(ton);
  const userPrompt = buildUserPrompt(prospect, sender);

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
      system,
      messages: [{ role: 'user', content: userPrompt }]
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
      subject: String(parsed.subject || '').trim() || 'Un mot à propos de votre site',
      body: String(parsed.body).trim(),
      model: LLM_MODEL
    };
  }
  // Repli : si le JSON n'a pas été respecté, on renvoie le texte brut comme corps.
  return { subject: 'Un mot à propos de votre site', body: text || '(réponse vide)', model: LLM_MODEL };
}

module.exports = { draftColdEmail, senderIdentity };
