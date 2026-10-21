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

// Consigne de ton. 'humain' par défaut. Tous les tons restent HUMBLES : on écrit à
// quelqu'un qui n'a rien demandé.
const TONS = {
  humain:
    "Ton professionnel, naturel et respectueux : un prestataire sérieux qui a identifié une " +
    "opportunité et le dit simplement. Vouvoiement. Ni familier, ni commercial, ni « gratteur ».",
  direct:
    "Ton sobre et factuel, tu vas à l'essentiel, avec courtoisie, sans jamais donner de leçon ni presser.",
  doux:
    "Ton prudent et courtois, aucune pression, tu proposes simplement ton aide."
};

// Filet de sécurité : supprime les tirets (signature typique d'un texte IA) même si le
// modèle en glisse malgré la consigne. Tirets cadratin/demi -> virgule ; puces -> rien.
function stripDashes(text) {
  return String(text || '')
    .replace(/\s*[—–]\s*/g, ', ')     // — ou – (incise/parenthèse IA) -> virgule
    .replace(/^[ \t]*[-*•]\s+/gm, '')  // puces en début de ligne -> supprimées
    .replace(/ +-\s+/g, ', ')          // " - " connecteur -> virgule
    .replace(/ ,/g, ',')               // nettoyage espace avant virgule
    .replace(/,\s*,/g, ',')            // virgules doublées
    .replace(/,\s*\./g, '.')           // ", ." -> "."
    .replace(/[ \t]{2,}/g, ' ')        // espaces multiples
    .trim();
}

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
    "Tu es un développeur web indépendant, spécialisé dans la maintenance technique des sites",
    "professionnels, qui écrit un PREMIER email de contact à un commerçant ou artisan dont tu viens",
    "de regarder le site. Objectif : ouvrir une discussion sur la maintenance, sans forcer.",
    consigneTon,
    "",
    "POSTURE (la personne n'a rien demandé) :",
    "- Prestataire sérieux qui a identifié une opportunité : factuel, respectueux, direct.",
    "- JAMAIS de diagnostic autoritaire, d'injonction, de ton alarmiste, de leçon ni de culpabilisation.",
    "- Un constat n'est jamais transformé en conséquence certaine (pas de « vous perdez des clients »,",
    "  pas de « personne ne suit votre site », pas de « vos nouveautés mettent des semaines »).",
    "- Propose ton aide UNE fois : contrat de maintenance (mises à jour, sauvegardes, suivi technique).",
    "- FORMULES INTERDITES, à ne jamais écrire ni paraphraser : « je ne vous relancerai pas »,",
    "  « un simple oui suffit », « une chose m'a sauté aux yeux », « que vous n'avez peut-être pas vu",
    "  de l'intérieur », « rien de grave », « si je ne dis pas de bêtise », « je fais des sites à mon compte ».",
    "",
    "STRUCTURE (dans cet ordre) :",
    "1. « Bonjour, » puis présentation courte : développeur web indépendant, nom de l'entreprise fournie,",
    "   spécialisé dans la maintenance technique des sites professionnels.",
    "2. Motif de contact factuel, UNIQUEMENT à partir des problèmes fournis (au plus 2).",
    "3. Proposition concrète de maintenance ou d'aide.",
    "4. Une question simple pour ouvrir la discussion.",
    "5. La phrase exacte : « Si vous ne souhaitez plus être contacté, n'hésitez pas à me le signaler. »",
    "",
    "STYLE :",
    "- Écris comme un VRAI humain qui a pris deux minutes pour regarder le site.",
    "- Le texte doit COULER naturellement. N'enchaîne pas « D'abord… Ensuite… » de façon",
    "  mécanique : intègre les points dans des phrases fluides et courtes.",
    "- Commence par « Bonjour, ». Vouvoiement du début à la fin.",
    "- INTERDICTION ABSOLUE DE TIRETS : aucun tiret cadratin (—), demi-cadratin (–), ni tiret",
    "  « - » utilisé comme ponctuation, incise ou puce. C'est LE signe d'un texte écrit par une",
    "  IA. Utilise UNIQUEMENT des virgules, des points ou des parenthèses. Zéro tiret.",
    "",
    "RÈGLES STRICTES :",
    "- N'invente AUCUN fait. Utilise UNIQUEMENT les problèmes fournis dans les données.",
    "- Mentionne AU MAXIMUM 2 problèmes, les plus parlants pour un non-technicien,",
    "  expliqués en langage clair et avec ménagement (le bénéfice, pas le jargon).",
    "- Interdits : superlatifs marketing (« boostez », « explosez vos ventes »), fausse urgence,",
    "  flatterie fausse, jargon technique lourd, emojis (0).",
    "- Longueur du corps : 80 à 120 mots. Phrases courtes.",
    "- Termine le corps par UNE question ouverte discrète (savoir si c'est un sujet pour lui,",
    "  ou s'il y avait déjà pensé), sans jamais forcer un rendez-vous.",
    "- DERNIÈRE ligne = formule de politesse : utilise EXACTEMENT la formule de fin fournie",
    "  dans les données (ex. « Belle matinée »), suivie d'une virgule.",
    "- NE SIGNE PAS. N'ajoute NI nom, NI « PixFeed », NI coordonnées après la formule :",
    "  la signature est ajoutée AUTOMATIQUEMENT par le CRM. Le body TERMINE sur la formule.",
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
    "CONTEXTE EXPÉDITEUR (uniquement pour ajuster le propos — NE PAS signer avec) :",
    `- Activité de l'expéditeur : ${sender.metier}`,
    "  (La signature du CRM sera ajoutée automatiquement après : ne mets aucune signature toi-même.)",
    "",
    `FORMULE DE FIN À UTILISER (obligatoire, telle quelle, en toute dernière ligne) : ${sender.formuleFin}`,
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
      // stripDashes : filet anti-tirets (le tell de l'IA) en plus de la consigne du prompt.
      subject: stripDashes(String(parsed.subject || '').trim()) || 'Un mot à propos de votre site',
      body: stripDashes(String(parsed.body).trim()),
      model: LLM_MODEL
    };
  }
  // Repli : si le JSON n'a pas été respecté, on renvoie le texte brut (nettoyé) comme corps.
  return { subject: 'Un mot à propos de votre site', body: stripDashes(text) || '(réponse vide)', model: LLM_MODEL };
}

module.exports = { draftColdEmail, senderIdentity, buildSystemPrompt };
