// backend/utils/feedParse.js
// Lecture minimale de flux RSS 2.0 et Atom, sans dépendance : titre, lien, description,
// date. Sert aux sources supplémentaires de la veille (alertes Google, forums d'aide,
// plateformes de projets qui publient un flux). Tolérant : un item sans lien est ignoré.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', ugrave: 'ù', ocirc: 'ô', ecirc: 'ê', icirc: 'î', acirc: 'â', hellip: '…', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘' };

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => (ENTITIES[n.toLowerCase()] !== undefined ? ENTITIES[n.toLowerCase()] : m));
}

// Texte brut d'un champ XML : CDATA déballé, balises HTML retirées, entités décodées, espaces réduits.
function textOf(xml, tag) {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(xml);
  if (!m) return '';
  let v = m[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(v);
  if (cdata) v = cdata[1];
  // Atom type="html" : le HTML est échappé (&lt;p&gt;) -> on décode d'abord, puis on retire les balises.
  v = decodeEntities(decodeEntities(v).replace(/<[^>]+>/g, ' '));
  return v.replace(/\s+/g, ' ').trim();
}

// Lien : RSS <link>texte</link> ; Atom <link href="…"/> (rel="alternate" de préférence).
function linkOf(xml) {
  const atom = [...xml.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
  for (const attrs of atom) {
    const href = /href=["']([^"']+)["']/i.exec(attrs);
    if (href && !/rel=["'](self|edit|replies|enclosure)["']/i.test(attrs)) return decodeEntities(href[1]).trim();
  }
  const rss = textOf(xml, 'link');
  if (rss) return rss;
  const guid = /<guid(?:\s[^>]*)?>([\s\S]*?)<\/guid>/i.exec(xml);
  return guid && /^https?:\/\//i.test(guid[1].trim()) ? guid[1].trim() : '';
}

function dateOf(xml) {
  const raw = textOf(xml, 'pubDate') || textOf(xml, 'published') || textOf(xml, 'updated') || textOf(xml, 'dc:date');
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {string} xml  contenu du flux
 * @returns {{ title: string, link: string, description: string, date: Date|null, author: string }[]}
 */
function parseFeed(xml) {
  const src = String(xml || '');
  if (!/<rss\b|<feed\b|<rdf:RDF\b|<channel\b/i.test(src)) return [];
  const blocks = [...src.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]);
  const out = [];
  for (const b of blocks) {
    const link = linkOf(b);
    if (!/^https?:\/\//i.test(link)) continue;
    const title = textOf(b, 'title');
    const description = textOf(b, 'content:encoded') || textOf(b, 'content') || textOf(b, 'description') || textOf(b, 'summary');
    const author = textOf(b, 'dc:creator') || textOf(b, 'author') || textOf(b, 'name');
    out.push({ title: title || link, link, description, date: dateOf(b), author });
  }
  return out;
}

module.exports = { parseFeed, decodeEntities };
