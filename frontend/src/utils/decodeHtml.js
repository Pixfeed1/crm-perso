// Décode les entités HTML (&#039; &#187; &#38; &eacute; ...) présentes dans les titres
// scrapés WordPress/WooCommerce (le <title> REST arrive encodé). Le résultat est rendu
// comme TEXTE par React (échappé) -> aucun risque XSS : on lit .value, jamais innerHTML.
export function decodeHtml(str) {
  if (!str || typeof str !== 'string' || !str.includes('&')) return str;
  // Un <textarea> détaché décode toutes les entités (numériques + nommées) sans exécuter
  // de HTML (le contenu d'un textarea est du texte pur).
  const el = document.createElement('textarea');
  el.innerHTML = str;
  return el.value;
}
