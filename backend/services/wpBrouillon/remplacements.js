// Remplacements de passages (prepare_draft, mode mise_a_jour) : au lieu d'envoyer tout le contenu, le
// manifeste donne des passages à remplacer dans le content.raw ACTUEL de la page :
//   "base_sha256": "<empreinte lue par get_contenu_brut>",
//   "remplacements": [{ "avant": "...", "apres": "...", "occurrences": 1 }]
// Règles :
//   - l'empreinte du contenu actuel doit être celle annoncée (sinon la page a changé depuis la lecture) ;
//   - les remplacements s'appliquent dans l'ordre, chacun sur le texte laissé par le précédent ; chaque
//     « avant » doit y figurer exactement « occurrences » fois (1 par défaut), sans chevauchement ;
//   - après coup, les blocs Gutenberg restent équilibrés et chaque code court ouvert reste fermé
//     (aucun déséquilibre nouveau par rapport au contenu de départ).
const crypto = require('crypto');

const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const EXTRAIT = 70;

function compter(texte, motif) {
  if (!motif) return 0;
  let n = 0, i = texte.indexOf(motif);
  while (i !== -1) { n++; i = texte.indexOf(motif, i + motif.length); }
  return n;
}

function extrait(texte, pos, long) {
  const d = Math.max(0, pos - EXTRAIT), f = Math.min(texte.length, pos + long + EXTRAIT);
  return `${d > 0 ? '…' : ''}${texte.slice(d, f)}${f < texte.length ? '…' : ''}`;
}

// Erreurs de forme du manifeste.
function validerManifeste(m) {
  const e = [];
  if (!Array.isArray(m.remplacements) || !m.remplacements.length) e.push('remplacements : liste non vide attendue');
  if (!/^[a-f0-9]{64}$/i.test(String(m.base_sha256 || ''))) e.push("base_sha256 manquant ou invalide (l'empreinte sha256 lue par get_contenu_brut)");
  (Array.isArray(m.remplacements) ? m.remplacements : []).forEach((x, i) => {
    if (!x || typeof x.avant !== 'string' || !x.avant.length) e.push(`remplacement n° ${i + 1} : « avant » vide`);
    if (!x || typeof x.apres !== 'string') e.push(`remplacement n° ${i + 1} : « apres » manquant (texte, éventuellement vide)`);
    if (x && x.occurrences !== undefined && (!Number.isInteger(x.occurrences) || x.occurrences < 1)) e.push(`remplacement n° ${i + 1} : « occurrences » doit être un entier ≥ 1`);
  });
  return e;
}

// Applique les remplacements. Renvoie { texte, rapport, erreurs } ; rien n'est appliqué si une erreur survient.
function appliquer(base, remplacements) {
  let texte = String(base);
  const rapport = [], erreurs = [];
  remplacements.forEach((x, i) => {
    const attendu = x.occurrences === undefined ? 1 : x.occurrences;
    const n = compter(texte, x.avant);
    if (n !== attendu) {
      erreurs.push(`remplacement n° ${i + 1} : « ${x.avant.length > 60 ? `${x.avant.slice(0, 60)}…` : x.avant} » figure ${n} fois dans le contenu${i ? ' (après les remplacements précédents)' : ''}, ${attendu} annoncée${attendu > 1 ? 's' : ''}`);
      return;
    }
    const pos = texte.indexOf(x.avant);
    const avant = extrait(texte, pos, x.avant.length);
    texte = texte.split(x.avant).join(x.apres);
    rapport.push({ n: i + 1, occurrences: n, avant, apres: extrait(texte, pos, x.apres.length) });
  });
  return { texte, rapport, erreurs };
}

// Blocs Gutenberg : ouvertures, fermetures, blocs autofermants ; renvoie les problèmes rencontrés.
function problemesBlocs(texte) {
  const pile = [], pb = [];
  for (const m of String(texte).matchAll(/<!--\s*(\/?)wp:([a-z0-9_/-]+)(?:\s[^]*?)?\s*(\/?)-->/gi)) {
    const [, fermeture, nomBrut, auto] = m;
    const nom = nomBrut.includes('/') ? nomBrut : `core/${nomBrut}`;
    if (auto) continue;
    if (!fermeture) { pile.push(nom); continue; }
    const haut = pile.pop();
    if (haut !== nom) pb.push(haut ? `bloc ${haut} fermé par /${nom}` : `fermeture /${nom} sans ouverture`);
  }
  for (const nom of pile) pb.push(`bloc ${nom} jamais fermé`);
  return pb;
}

// Codes courts : par nom, ouvertures et fermetures.
function codesCourts(texte) {
  const c = {};
  for (const m of String(texte).matchAll(/\[(\/?)([a-zA-Z][\w-]*)(?=[\s\]\/])[^\]]*?(\/?)\]/g)) {
    const [, fermeture, nom, auto] = m;
    const x = c[nom] || (c[nom] = { ouverts: 0, fermes: 0 });
    if (fermeture) x.fermes++; else if (!auto) x.ouverts++;
  }
  return c;
}

// Contrôles du résultat par rapport au contenu de départ : seuls les déséquilibres NOUVEAUX bloquent.
function controler(base, nouveau) {
  const erreurs = [];
  const avantB = new Set(problemesBlocs(base));
  for (const p of problemesBlocs(nouveau)) if (!avantB.has(p)) erreurs.push(`blocs déséquilibrés après remplacement : ${p}`);
  const a = codesCourts(base), b = codesCourts(nouveau);
  for (const nom of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[nom] || { ouverts: 0, fermes: 0 }, y = b[nom] || { ouverts: 0, fermes: 0 };
    // Un code court « à contenu » (qui a une fermeture quelque part) doit garder autant d'ouvertures que de fermetures.
    const aFermeture = x.fermes > 0 || y.fermes > 0;
    if (aFermeture && (y.ouverts - y.fermes) !== (x.ouverts - x.fermes)) {
      erreurs.push(`code court [${nom}] : ${y.ouverts} ouverture(s) pour ${y.fermes} fermeture(s) après remplacement (avant : ${x.ouverts} pour ${x.fermes})`);
    }
  }
  return erreurs;
}

module.exports = { sha256, compter, validerManifeste, appliquer, problemesBlocs, codesCourts, controler };
