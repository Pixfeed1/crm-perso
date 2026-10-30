/* La partie IA de l'agent : rédaction et veille seulement. Elle ne calcule rien et ne publie rien.
   - chaque lundi, si un modèle a basculé sur une réserve : réécrire sa ligne « pourquoi » (modèle léger) ;
   - chaque mois : proposer les évolutions de la sélection, que Marc valide ou refuse (modèle plus fort, recherche web limitée). */
const config = require("./config");

let client = null;
function api() {
  if (!config.anthropicKey) throw new Error("CONFIGURATEUR_ANTHROPIC_API_KEY absente du .env");
  if (!client) { const Anthropic = require("@anthropic-ai/sdk"); client = new (Anthropic.default || Anthropic)({ apiKey: config.anthropicKey }); }
  return client;
}

const STYLE = `Tu écris pour jurojin.net, un média indépendant en français. Règles :
- une ou deux phrases courtes, ton d'expert qui vulgarise, sans jargon inutile ;
- jamais de tiret cadratin ; deux-points, virgules ou reformulation ;
- dis pourquoi CE modèle parmi ceux qui font la même chose : prix, format, stock, version de mémoire, piège à éviter ;
- aucune affirmation invérifiable sur la qualité (« le plus silencieux ») sans mesure fournie ;
- pas de formule commerciale.`;

const texte = r => r.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
// Un refus du modèle ou une réponse coupée ne doit jamais passer pour un texte valide.
function verifierFin(r, quoi) {
  if (r.stop_reason === "refusal") {
    const cat = r.stop_details && r.stop_details.category ? ` (${r.stop_details.category})` : "";
    throw new Error(`${quoi} : le modèle a décliné la demande${cat}`);
  }
  if (r.stop_reason === "max_tokens") throw new Error(`${quoi} : réponse coupée (longueur maximale atteinte)`);
  return r;
}

/** Réécrit la ligne « pourquoi » d'un composant qui vient de basculer sur une réserve. */
async function redigerPourquoi(composant, { ancien, prixAncien } = {}) {
  const r = verifierFin(await api().messages.create({
    model: config.modeleHebdo, max_tokens: 300, system: STYLE,
    messages: [{ role: "user", content:
      `Puce : ${composant.puce}\nModèle désormais retenu : ${composant.modele}\nAncien modèle (en rupture) : ${ancien || "inconnu"}\n` +
      `Prix du nouveau : ${composant.prix} €${prixAncien ? ` (l'ancien était à ${prixAncien} €)` : ""}\n` +
      `Caractéristiques : ${JSON.stringify(composant.caracteristiques)}\n\nÉcris la ligne « pourquoi » de ce modèle. Réponds par la ligne seule.` }]
  }), "Ligne « pourquoi »");
  return texte(r).replace(/\s*[—–]\s*/g, ", ");
}

/** Proposition mensuelle : nouveautés, sorties de gamme, modèles à changer, EAN et ASIN manquants.
    Renvoie un objet { resume, changements:[…] } que l'écran du CRM présente à Marc. Rien n'est appliqué sans sa validation. */
async function proposerSelection(selection, { mesures, offresParId, alertes }) {
  const resumeSel = Object.entries(selection.composants).map(([id, c]) => ({ id, puce: c.puce, modeles: (c.modeles || []).map(m => m.modele),
    prix_releve: offresParId[id]?.[0]?.prix ?? null, mesure: mesures[id]?.score ? Math.round(mesures[id].score) : null }));
  // Repli serveur activé (« fallbacks: default ») : si Sonnet décline, l'API rejoue la demande sur un autre modèle.
  const r = verifierFin(await api().beta.messages.create({
    model: config.modeleMensuel, max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    system: STYLE + `
Tu prépares la proposition mensuelle de sélection du configurateur PC. Tu ne décides rien : tu proposes, Marc valide.
Réponds UNIQUEMENT par un objet JSON valide : {"resume": "…", "changements": [{"type": "ajout|retrait|modele|ean|asin|pourquoi", "id": "…", "detail": {…}, "raison": "…", "sources": ["url", …]}]}.
Chaque changement doit citer au moins une source consultée. N'invente ni prix, ni caractéristique, ni EAN.`,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 10, allowed_domains: config.domainesRecherche }],
    messages: [{ role: "user", content:
      `Sélection actuelle (avec prix relevés et scores Blender Open Data) :\n${JSON.stringify(resumeSel)}\n\n` +
      `Alertes du mois : ${JSON.stringify(alertes || [])}\n\n` +
      `Vérifie : nouvelles cartes graphiques ou processeurs sortis ou annoncés en France, modèles retirés ou introuvables, ` +
      `caractéristiques à corriger (longueur, consommation, alimentation recommandée), EAN des modèles retenus, ASIN Amazon France. ` +
      `Propose les changements utiles, et seulement ceux-là.` }]
  }), "Proposition mensuelle");
  const brut = texte(r);
  const json = brut.slice(brut.indexOf("{"), brut.lastIndexOf("}") + 1);
  const prop = JSON.parse(json);
  if (!Array.isArray(prop.changements)) throw new Error("proposition sans liste de changements");
  prop.changements = prop.changements.filter(c => c.id && c.type && Array.isArray(c.sources) && c.sources.length);
  return prop;
}

module.exports = { redigerPourquoi, proposerSelection, STYLE };
