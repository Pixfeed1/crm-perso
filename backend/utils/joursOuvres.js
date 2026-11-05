// Jours ouvrés en France (heure de Paris) : du lundi au vendredi, hors jours fériés nationaux
// (fixes + lundi de Pâques, Ascension, lundi de Pentecôte). Dates manipulées en 'YYYY-MM-DD'.

const TZ = 'Europe/Paris';

/** Date du jour à Paris, 'YYYY-MM-DD'. */
function aujourdhuiParis(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

const versUTC = (iso) => { const [y, m, j] = String(iso).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, j)); };
const versISO = (d) => d.toISOString().slice(0, 10);
const plusJours = (iso, n) => { const d = versUTC(iso); d.setUTCDate(d.getUTCDate() + n); return versISO(d); };

/** Dimanche de Pâques (algorithme de Meeus / Jones / Butcher). */
function paques(annee) {
  const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
  return versISO(new Date(Date.UTC(annee, mois - 1, jour)));
}

const cacheFeries = new Map();
function feries(annee) {
  if (!cacheFeries.has(annee)) {
    const p = paques(annee);
    cacheFeries.set(annee, new Set([
      `${annee}-01-01`, `${annee}-05-01`, `${annee}-05-08`, `${annee}-07-14`, `${annee}-08-15`, `${annee}-11-01`, `${annee}-11-11`, `${annee}-12-25`,
      plusJours(p, 1), plusJours(p, 39), plusJours(p, 50),           // lundi de Pâques, Ascension, lundi de Pentecôte
    ]));
  }
  return cacheFeries.get(annee);
}

function estOuvre(iso) {
  const d = versUTC(iso);
  const j = d.getUTCDay();
  return j !== 0 && j !== 6 && !feries(d.getUTCFullYear()).has(versISO(d));
}

/** iso + n jours ouvrés (n >= 1) : le résultat est toujours un jour ouvré. */
function ajouterJoursOuvres(iso, n) {
  let x = String(iso).slice(0, 10), reste = Math.max(1, n | 0);
  while (reste > 0) { x = plusJours(x, 1); if (estOuvre(x)) reste--; }
  return x;
}

/** Le jour ouvré le plus proche à partir de iso (iso lui-même s'il est ouvré). */
function premierOuvre(iso) {
  let x = String(iso).slice(0, 10);
  while (!estOuvre(x)) x = plusJours(x, 1);
  return x;
}

module.exports = { aujourdhuiParis, ajouterJoursOuvres, premierOuvre, estOuvre, paques };
