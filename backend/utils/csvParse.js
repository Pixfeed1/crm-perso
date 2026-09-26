// backend/utils/csvParse.js
// Petit parseur CSV (champs entre guillemets, virgules internes) + échappement, partagés par
// le crawl et les signaux de domaine. Sans dépendance.

function parseCsv(content) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else { field += c; }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && content[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else { field += c; }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Lignes -> objets { colonne: valeur brute }, clés en minuscules (première ligne = en-tête).
function csvToObjects(content) {
  const rows = parseCsv(content);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).filter((r) => r && r.length).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] == null ? '' : r[i]])));
}

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Normalise un domaine/url pour comparaison (minuscule, sans schéma ni www, sans chemin).
function normalizeDomain(value) {
  if (!value) return '';
  let s = String(value).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  s = s.split('/')[0].split('?')[0];
  return s.trim();
}

module.exports = { parseCsv, csvToObjects, csvEscape, normalizeDomain };
