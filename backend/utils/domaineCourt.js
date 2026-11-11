// Domaine « court » (domaine enregistrable) d'une adresse, d'une URL ou d'un nom d'hôte :
// blog.exemple.fr, www.exemple.fr et contact@exemple.fr donnent exemple.fr. Sert à ne jamais écrire deux
// fois au même site (netlinking). Les suffixes à deux niveaux courants (co.uk, gouv.fr…) sont gérés.
const SUFFIXES_DOUBLES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk',
  'gouv.fr', 'asso.fr', 'nom.fr', 'presse.fr', 'tm.fr', 'com.fr', 'prd.fr',
  'co.jp', 'ne.jp', 'or.jp', 'com.au', 'net.au', 'org.au', 'co.nz', 'com.br', 'com.mx', 'com.ar', 'co.za',
  'com.tr', 'com.cn', 'com.tw', 'com.hk', 'co.in', 'co.kr', 'com.sg', 'com.es', 'com.pt', 'com.pl', 'co.il', 'qc.ca'
]);

function domaineCourt(x) {
  let s = String(x || '').trim().toLowerCase();
  if (!s) return null;
  if (s.includes('@') && !s.includes('/')) s = s.split('@').pop();
  s = s.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].split(':')[0].replace(/\.$/, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)) return null;
  const p = s.split('.');
  if (p.length <= 2) return s;
  const deux = p.slice(-2).join('.');
  return SUFFIXES_DOUBLES.has(deux) ? p.slice(-3).join('.') : deux;
}

module.exports = { domaineCourt };
