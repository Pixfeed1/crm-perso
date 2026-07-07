// Détection des <title> de pages anti-bot / challenge (Cloudflare, captcha...) récupérés
// par le crawler À LA PLACE du vrai titre du site. Ces titres ne doivent jamais servir de
// nom de lead : on retombe sur le domaine.
const ANTIBOT_PATTERNS = [
  'just a moment',
  'checking your browser',
  'attention required',
  'access denied',
  'security check',
  'verification required',
  'verify you are',
  'are you a robot',
  'captcha',
  'cloudflare',
  'ddos protection',
  'please wait',
  'please enable javascript',
  'enable cookies',
  'un instant',
  'vérification en cours',
];

function isAntibotTitle(title) {
  if (!title || typeof title !== 'string') return false;
  const low = title.toLowerCase();
  return ANTIBOT_PATTERNS.some((p) => low.includes(p));
}

module.exports = { isAntibotTitle, ANTIBOT_PATTERNS };
