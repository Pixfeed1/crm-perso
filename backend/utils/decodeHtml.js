// Décodage des entités HTML côté Node (pas de DOM disponible ici).
// Les titres scrapés (WordPress/WooCommerce) arrivent encodés : numériques (&#039; &#187;
// &#8217;) et nommés (&eacute; &amp; &laquo; ...). On couvre le numérique (décimal + hexa)
// de façon générale + les entités nommées courantes (accents FR + ponctuation WordPress).
const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  laquo: '«', raquo: '»', hellip: '…', middot: '·', bull: '•',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', sbquo: '‚',
  ldquo: '“', rdquo: '”', bdquo: '„', prime: '′', Prime: '″',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', Eacute: 'É', Egrave: 'È', Ecirc: 'Ê',
  agrave: 'à', acirc: 'â', auml: 'ä', Agrave: 'À', Acirc: 'Â',
  ugrave: 'ù', ucirc: 'û', uuml: 'ü', Ugrave: 'Ù',
  icirc: 'î', iuml: 'ï', Icirc: 'Î',
  ocirc: 'ô', ouml: 'ö', Ocirc: 'Ô',
  ccedil: 'ç', Ccedil: 'Ç', ntilde: 'ñ',
  agr: 'à', euro: '€', copy: '©', reg: '®', trade: '™', deg: '°'
};

function decodeHtml(str) {
  if (!str || typeof str !== 'string' || str.indexOf('&') === -1) return str;
  return str.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z0-9]+);/gi, (m, ent) => {
    if (ent[0] === '#') {
      const cp = (ent[1] === 'x' || ent[1] === 'X')
        ? parseInt(ent.slice(2), 16)
        : parseInt(ent.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 ? String.fromCodePoint(cp) : m;
    }
    return Object.prototype.hasOwnProperty.call(NAMED, ent) ? NAMED[ent] : m;
  });
}

module.exports = { decodeHtml };
