// Test A/B de la QUESTION FINALE des emails de campagne.
// A = la question actuelle (propre à chaque preuve, ou au premier contact). B = une formulation choisie
// par Marc dans les propositions ci-dessous, une pour les emails « par la preuve », une pour les
// premiers contacts. Tout le reste de l'email est identique. Règles du lot 3 respectées : une seule
// question, juste avant « Bonne journée, », aucune annonce d'appel, rien d'affirmé qui ne soit constaté.

const PROPOSITIONS = {
  preuve: [
    { cle: 'p_origine', texte: () => "Voulez-vous que je vous indique d'où ça vient ?" },
    { cle: 'p_quelquun', texte: () => "Est-ce que quelqu'un peut s'en charger de votre côté ?" },
    { cle: 'p_plus', texte: () => 'Est-ce utile que je vous en dise plus ?' }
  ],
  maintenance: [
    { cle: 'm_sauvegardes', texte: (boutique) => `Avez-vous déjà quelqu'un pour les mises à jour et les sauvegardes ${boutique ? 'de la boutique' : 'du site'} ?` },
    { cle: 'm_souci', texte: () => 'Si un souci technique arrivait demain, sauriez-vous à qui vous adresser ?' },
    { cle: 'm_sujet', texte: () => 'Est-ce un sujet qui vous occupe en ce moment ?' }
  ]
};
const FAMILLES = Object.keys(PROPOSITIONS);

const proposition = (famille, cle) => (PROPOSITIONS[famille] || []).find((p) => p.cle === cle) || null;

// Configuration valide : { preuve: cle, maintenance: cle } (au moins une des deux).
function valider(ab) {
  if (ab === null) return null;
  if (!ab || typeof ab !== 'object') throw Object.assign(new Error('Test A/B : { preuve, maintenance } attendu'), { status: 400 });
  const out = {};
  for (const f of FAMILLES) {
    if (ab[f] === undefined || ab[f] === null || ab[f] === '') continue;
    if (!proposition(f, ab[f])) throw Object.assign(new Error(`Test A/B : formulation « ${ab[f]} » inconnue pour ${f}`), { status: 400 });
    out[f] = ab[f];
  }
  if (!Object.keys(out).length) throw Object.assign(new Error('Test A/B : choisissez au moins une formulation B'), { status: 400 });
  return out;
}

// Texte B pour un email (mode preuve ou maintenance), ou null si cette famille n'est pas testée.
function texteB(ab, mode, boutique = false) {
  if (!ab || !ab[mode]) return null;
  const p = proposition(mode, ab[mode]);
  return p ? p.texte(boutique) : null;
}

// Remplace la dernière question (le paragraphe juste avant « Bonne journée, »).
const RE_QUESTION = /\n\n([^\n]*\?)\n\n(Bonne journée,)\s*$/;
function questionDe(body) { const m = RE_QUESTION.exec(String(body || '')); return m ? m[1] : null; }
function remplacerQuestion(body, nouvelle) {
  const ancienne = questionDe(body);
  if (!ancienne) return null;
  return { body: String(body).replace(RE_QUESTION, `\n\n${nouvelle}\n\n$2`), ancienne };
}

// Variante d'une nouvelle ligne : la moins remplie dans sa famille, au hasard si égalité.
function choisir(compteA, compteB, hasard = Math.random) {
  if (compteA < compteB) return 'A';
  if (compteB < compteA) return 'B';
  return hasard() < 0.5 ? 'A' : 'B';
}

const catalogue = () => Object.fromEntries(FAMILLES.map((f) => [f, PROPOSITIONS[f].map((p) => ({ cle: p.cle, texte: p.texte(false), texte_boutique: p.texte(true) }))]));

module.exports = { PROPOSITIONS, FAMILLES, valider, texteB, questionDe, remplacerQuestion, choisir, catalogue };
