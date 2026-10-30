/* Catalogue de travail : la sélection validée par Marc + les mesures + les offres du jour.
   C'est ici qu'on choisit, pour chaque puce, le modèle actif (retenu ou réserve) et son prix. */
const config = require("./config");
const { choisirReste } = require("./moteur/compat");

/** Construit le catalogue utilisé par le moteur.
    - selection : data/selection.json (validée)
    - scores    : sortie de blenderOpenData.associer
    - offres    : sortie de awin.releverOffres (peut être vide)
    - options.prixExemple : utiliser prix_exemple quand aucune offre n'existe (essais uniquement)
    Renvoie { C, alertes } où C[id] porte prix, modèle actif, offres, mesures et caractéristiques. */
function construire(selection, { scores = {}, offres = [], prixExemple = false, amazonTag = config.amazonTag } = {}) {
  const C = {}, alertes = [], candidats = {};
  for (const [id, s] of Object.entries(selection.composants)) {
    const base = { ...s, id, caracteristiques: { ...(s.caracteristiques || {}) } };
    if (s.inclus_dans || s.integree) { C[id] = { ...base, prix: 0, modele_actif: 0, offres: [], inclus: true }; continue; }

    // modèles achetables, dans l'ordre de la sélection : le retenu d'abord, puis les réserves
    const liste = [];
    (s.modeles || []).forEach((m, rang) => {
      const o = offres.filter(x => x.id === id && x.rang === rang && x.en_stock && x.prix > 0);
      if (o.length) liste.push({ rang, offres: o });
    });
    if (!liste.length && prixExemple && s.prix_exemple)
      liste.push({ rang: 0, offres: [{ marchand: "exemple", nom: "Exemple", prix: s.prix_exemple, en_stock: true, lien: "#", releve_le: null, source: "exemple" }] });
    if (!liste.length) { alertes.push({ niveau: "rupture", id, message: `Aucune offre en stock pour ${s.puce} : composant écarté du calcul.` }); continue; }
    candidats[id] = liste;
    C[id] = entree(base, s, liste[0], amazonTag);
  }

  // Un modèle en stock mais qui n'entre dans aucune machine (trop long, trop gourmand) cède la place à la réserve suivante.
  // Seules les cartes graphiques et les processeurs ont des modèles aux caractéristiques différentes qui changent la compatibilité.
  for (const cat of ["gpu", "cpu"]) for (const id of Object.keys(candidats)) {
    if (!C[id] || C[id].categorie !== cat) continue;
    const s = selection.composants[id];
    for (let i = 0; i < candidats[id].length && !utilisable(id, C); i++) {
      const suivant = candidats[id][i + 1];
      alertes.push({ niveau: "incompatible", id, message: `${s.puce} : « ${C[id].modele} » n'entre dans aucune machine (alimentation, boîtier ou refroidissement).` });
      if (!suivant) { delete C[id]; alertes.push({ niveau: "ecarte", id, message: `${s.puce} écarté : aucun modèle en stock ne convient.` }); break; }
      C[id] = entree({ ...s, id, caracteristiques: { ...(s.caracteristiques || {}) } }, s, suivant, amazonTag);
    }
  }
  for (const c of Object.values(C)) if (c.bascule)
    alertes.push({ niveau: "bascule", id: c.id, message: `${c.puce} : « ${selection.composants[c.id].modeles[0].modele} » indisponible ou incompatible, bascule sur la réserve « ${c.modele} ».` });

  // mesures
  for (const [id, sc] of Object.entries(scores)) if (C[id]) C[id].mesure_blender = sc;
  return { C, alertes };
}

/** Fiche de travail d'un composant pour un modèle donné : une offre par marchand (la moins chère), triées par prix. */
function entree(base, s, { rang, offres }, amazonTag) {
  const parMarchand = {};
  for (const o of offres) if (!parMarchand[o.marchand] || o.prix < parMarchand[o.marchand].prix) parMarchand[o.marchand] = o;
  const liste = Object.values(parMarchand).sort((a, b) => a.prix - b.prix)
    .map(o => ({ marchand: o.marchand, nom: o.nom, prix: o.prix, en_stock: true, lien: o.lien, ...(o.image ? { image: o.image } : {}), releve_le: o.releve_le, source: o.source }));
  const m = s.modeles[rang];
  // Amazon : lien partenaire seulement, JAMAIS de prix (sans accès à l'API produits, Amazon interdit d'en afficher).
  // Ajouté en dernier avec un prix vide : il n'est jamais retenu comme meilleure offre.
  const asin = String(m.asin || "").trim().toUpperCase(), tag = String(amazonTag || "").trim();
  if (/^[A-Z0-9]{10}$/.test(asin) && /^[A-Za-z0-9-]+-21$/.test(tag))
    liste.push({ marchand: "amazon", nom: "Amazon", prix: null, en_stock: true, lien: `https://www.amazon.fr/dp/${asin}?tag=${tag}`, releve_le: null, source: "amazon" });
  return { ...base, caracteristiques: { ...base.caracteristiques, ...(m.caracteristiques || {}) },
    modele: m.modele, modele_actif: rang, bascule: rang > 0, prix: liste[0].prix, offres: liste,
    reserves: (s.modeles || []).filter((_, r) => r !== rang).map(x => ({ modele: x.modele, caracteristiques: x.caracteristiques || {} })) };
}

/** Le composant entre-t-il dans au moins une machine complète ? */
function utilisable(id, C) {
  const c = C[id], autre = c.categorie === "gpu" ? "cpu" : "gpu";
  return Object.values(C).some(x => x.categorie === autre &&
    choisirReste(autre === "cpu" ? id : x.id, autre === "cpu" ? x.id : id, C, new Map()));
}

module.exports = { construire };
