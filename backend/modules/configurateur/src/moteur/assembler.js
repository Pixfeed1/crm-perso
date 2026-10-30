/* Assemble le fichier publié (format configurateur-pc/1, voir FORMAT.md). */
const config = require("../config");
const { P, CREA, ECRANS, jeu, mix, TEXTES } = require("./profils");
const { echelles, profil } = require("./calcul");
const { verifier } = require("./compat");

function assembler({ C, selection, sourcesMesures = [] }) {
  const E = echelles(C), cache = new Map();
  const CONFIGS = [], IDX = {};
  const idx = cfg => { const k = Object.values(cfg).join("|"); if (!(k in IDX)) { IDX[k] = CONFIGS.length; CONFIGS.push(cfg); } return IDX[k]; };

  const sortie = (pr, projet, ctx = {}) => {
    const r = profil(pr, projet, C, E, cache);
    return {
      priorite: r.priorite, plafond: r.plafond, budgets_conseilles: r.budgets, reperes: r.reperes,
      mesure: pr.mesure ? { libelle: pr.mesure.libelle, unite: "secondes", source: pr.mesure.source, derivee: /dérivée/.test(pr.mesure.source) } : null,
      mesure_jeu: null,                    // aucune source mesurée pour les jeux : pas de chiffre affiché
      // « suivant » n'est plus publié : la page calcule elle-même la marche suivante utile, à partir des paliers (fichier allégé d'un quart)
      paliers: r.paliers.map(p => ({ budget: p.budget, config: idx(p.m.cfg), mesures: p.mesures,
        alternative: p.alternative ? { config: idx(p.alternative.config), mesures: p.alternative.mesures, ecart_pct: p.alternative.ecart_pct } : null }))
    };
  };

  const profils = {};
  for (const s of CREA) for (const pj of ["leger", "lourd"]) {
    profils[`${s}|${pj}|-`] = sortie(P[s], pj);
    for (const e of ECRANS) profils[`${s}|${pj}|${e}`] = sortie(mix(P[s], jeu(e, "solo")), pj);
  }
  for (const t of ["solo", "comp"]) for (const e of ECRANS) profils[`jeu|${t}|${e}`] = sortie(jeu(e, t), null);
  profils["courant|-|-"] = sortie(P.courant, "leger");

  // composants publiés : seulement ceux utilisés, sans les règles internes de correspondance
  const utilises = new Set(CONFIGS.flatMap(c => Object.values(c)));
  const composants = {};
  for (const id of utilises) {
    const c = C[id];
    composants[id] = {
      categorie: c.categorie, puce: c.puce, court: c.court || c.puce, modele: c.modele || null, pourquoi: c.pourquoi,
      fiche: c.fiche || null, prix: c.prix, offres: c.offres || [],
      reserves: reservesSures(id, c, selection, CONFIGS, C),
      caracteristiques: c.caracteristiques,
      mesure: c.mesure_blender ? { score: Math.round(c.mesure_blender.score), tests: c.mesure_blender.tests, source: c.mesure_blender.source } : null
    };
  }

  const auj = new Date().toISOString().slice(0, 10);
  // date honnête : celle du prix affiché le plus ancien (offre retenue de chaque composant)
  const prixDates = Object.values(composants).map(c => c.offres.find(o => o.prix === c.prix)?.releve_le).filter(Boolean).sort();
  return {
    format: "configurateur-pc/1",
    genere_le: auj,
    prix_constates_le: (prixDates[0] || auj).slice(0, 10),
    selection: { version: selection.version, validee_le: selection.validee_le, validee_par: selection.validee_par },
    budget: config.budget,
    systeme: config.systeme,
    sources: sourcesMesures,
    textes: TEXTES,
    projets: Object.fromEntries(CREA.map(s => [s, P[s].projets])),
    composants, configs: CONFIGS, profils
  };
}

/** Réserves affichées au visiteur (« En cas de rupture : … ») : seulement celles qui conviennent à TOUTES les machines
    publiées où figure la puce. Un visiteur qui prend la réserve à la place du modèle retenu doit pouvoir monter sa machine telle quelle. */
function reservesSures(id, c, selection, CONFIGS, C) {
  const base = selection.composants[id]?.caracteristiques || {};
  const machines = CONFIGS.filter(cfg => Object.values(cfg).includes(id));
  return (c.reserves || []).filter(r => {
    const C2 = { ...C, [id]: { ...c, caracteristiques: { ...base, ...(r.caracteristiques || {}) } } };
    return machines.every(cfg => verifier(cfg, C2).length === 0);
  }).map(r => ({ modele: r.modele }));
}

module.exports = { assembler, reservesSures };
