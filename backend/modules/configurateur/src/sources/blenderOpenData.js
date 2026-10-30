/* Blender Open Data : scores médians par appareil (échantillons par minute, somme des scènes de référence).
   Point d'accès utilisé par le site lui-même : /benchmarks/query/?…&group_by=device_name&response_type=datatables
   Réponse : { columns:[…], rows:[[nom, score_median, nb_tests], …] } */
const config = require("../config");

const normaliser = s => String(s).replace(/\s+/g, " ").trim().toLowerCase();

async function telechargerType(type, version, fetchImpl = fetch) {
  const url = `${config.blender.base}?compute_type=${type}&group_by=device_name&blender_version=${encodeURIComponent(version)}&response_type=datatables`;
  let r;
  try { r = await fetchImpl(url, { headers: { Accept: "application/json", "User-Agent": "jurojin-configurateur/1.0" } }); }
  catch (e) { throw new Error(`Blender Open Data ${type} injoignable : ${e.cause?.code || e.message}`); }
  if (!r.ok) throw new Error(`Blender Open Data ${type} : HTTP ${r.status}`);
  const j = await r.json();
  if (!Array.isArray(j.rows)) throw new Error(`Blender Open Data ${type} : format inattendu`);
  return j.rows;
}

/** Télécharge les scores de tous les types de calcul. Renvoie { releve_le, blender_version, CPU:[…], OPTIX:[…], … } */
async function telecharger({ version = config.blender.version, fetchImpl } = {}) {
  const out = { releve_le: new Date().toISOString().slice(0, 10), blender_version: version };
  for (const t of config.blender.typesCalcul) out[t] = await telechargerType(t, version, fetchImpl);
  return out;
}

/** Associe à chaque composant de la sélection son score (le plus fiable si le nom apparaît plusieurs fois).
    Renvoie { [id]: { score, tests, type, source } } et la liste des composants sans mesure. */
function associer(selection, donnees, minTests = config.blender.minTests) {
  const scores = {}, manquants = [];
  for (const [id, c] of Object.entries(selection.composants)) {
    if (!c.blender) continue;
    const lignes = (donnees[c.blender.type] || []).filter(r => normaliser(r[0]) === normaliser(c.blender.nom));
    // plusieurs lignes possibles (espaces parasites, variantes) : on garde celle qui a le plus de tests
    const meilleure = lignes.sort((a, b) => b[2] - a[2])[0];
    if (!meilleure || meilleure[2] < minTests) { manquants.push(id); continue; }
    scores[id] = { score: meilleure[1], tests: meilleure[2], type: c.blender.type,
      source: { nom: "Blender Open Data", version: donnees.blender_version, date: donnees.releve_le } };
  }
  return { scores, manquants };
}

module.exports = { telecharger, associer, normaliser };
