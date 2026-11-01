/* La partie IA de l'agent : rédaction et veille seulement. Elle ne calcule rien et ne publie rien.
   - chaque lundi, si un modèle a basculé sur une réserve : réécrire sa ligne « pourquoi » (modèle léger) ;
   - chaque mois : proposer les évolutions de la sélection, que Marc valide ou refuse (modèle plus fort, recherche web limitée). */
const config = require("./config");

let client = null;
function api() {
  if (!config.anthropicKey) throw new Error("CONFIGURATEUR_ANTHROPIC_API_KEY absente du .env");
  if (!client) { const Anthropic = require("@anthropic-ai/sdk"); client = new (Anthropic.default || Anthropic)({ apiKey: config.anthropicKey, ...(config.anthropicWorkspace ? { defaultHeaders: { "anthropic-workspace-id": config.anthropicWorkspace } } : {}) }); }
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
/** Fiche complète d'un composant ajouté : mêmes champs obligatoires que la sélection (sinon la validation le refuse). */
function ficheValide(c) {
  return !!(c && typeof c === "object" && c.categorie && c.puce && c.court && Array.isArray(c.modeles) && c.modeles.length
    && c.modeles.every(m => m && (m.modele || m.inclus_dans)) && c.caracteristiques && typeof c.caracteristiques === "object");
}

/** Format exact de « detail » pour chaque type de changement : ce que la validation sait appliquer. */
const FORMATS = {
  ajout: '{"composant": {fiche complète}}',
  retrait: '{} (id d\'un composant existant)',
  modele: '{"rang": 0, "remplacer": true, "modele": {"modele": "nom exact du modèle", "correspondance": {"motifs": [...], "exclure": [...]}}} (rang 0 = modèle retenu, 1+ = réserves ; remplacer=false insère)',
  ean: '{"rang": 0, "ean": "EAN à 13 chiffres" ou ["…", "…"]}',
  asin: '{"rang": 0, "asin": "B0XXXXXXXX"}',
  pourquoi: '{"texte": "nouvelle ligne pourquoi"}',
  caracteristiques: '{"cle": valeur, …} (clés existantes du composant : longueur, tdp, alim_recommandee, connecteur…)',
};

/** Raison du refus d'un changement, ou null s'il est applicable tel quel à la sélection. */
function raisonInvalide(c, selection) {
  if (!c || !c.type || !c.id) return "type ou id manquant";
  if (!FORMATS[c.type]) return `type « ${c.type} » inconnu`;
  const d = c.detail || {};
  const comp = selection && selection.composants && selection.composants[c.id];
  if (c.type === "ajout") {
    if (comp) return "ce composant existe déjà";
    return ficheValide(d.composant) ? null : "fiche du composant incomplète";
  }
  if (!comp) return `composant « ${c.id} » absent de la sélection`;
  const rang = d.rang === undefined ? 0 : d.rang;
  const rangOk = Number.isInteger(rang) && rang >= 0;
  switch (c.type) {
    case "retrait": return null;
    case "pourquoi": return typeof d.texte === "string" && d.texte.trim() ? null : "texte manquant";
    case "modele":
      if (!rangOk || rang > (comp.modeles || []).length) return "rang invalide";
      if (!d.modele || typeof d.modele !== "object" || !d.modele.modele) return "modèle manquant (detail.modele.modele)";
      if (!d.modele.correspondance || !Array.isArray(d.modele.correspondance.motifs) || !d.modele.correspondance.motifs.length) return "motifs de correspondance manquants (detail.modele.correspondance.motifs)";
      return null;
    case "ean": {
      if (!rangOk || !(comp.modeles || [])[rang]) return "rang invalide";
      const eans = [].concat(d.ean || []);
      return eans.length && eans.every(e => /^\d{13}$/.test(String(e))) ? null : "EAN à 13 chiffres attendu";
    }
    case "asin":
      if (!rangOk || !(comp.modeles || [])[rang]) return "rang invalide";
      return /^[A-Z0-9]{10}$/.test(String(d.asin || "")) ? null : "ASIN à 10 caractères attendu";
    case "caracteristiques": {
      const cles = Object.keys(d);
      if (!cles.length) return "aucune caractéristique";
      const inconnues = cles.filter(k => !(k in (comp.caracteristiques || {})));
      return inconnues.length ? `caractéristique(s) inconnue(s) : ${inconnues.join(", ")}` : null;
    }
  }
  return null;
}

/** Proposition mensuelle : nouveautés, sorties de gamme, modèles à changer, EAN et ASIN manquants.
    Renvoie un objet { resume, changements:[…], diagnostic } que l'écran du CRM présente à Marc. Rien n'est appliqué sans sa validation. */
async function proposerSelection(selection, { mesures, offresParId, alertes }) {
  const resumeSel = Object.entries(selection.composants).map(([id, c]) => ({ id, puce: c.puce, modeles: (c.modeles || []).map(m => m.modele),
    prix_releve: offresParId[id]?.[0]?.prix ?? null, mesure: mesures[id]?.score ? Math.round(mesures[id].score) : null }));
  // un exemple réel de fiche par catégorie : le format exact attendu pour un ajout
  const exemples = {};
  for (const [id, c] of Object.entries(selection.composants)) if (!exemples[c.categorie] && !c.integree) exemples[c.categorie] = { id, ...c };
  const messages = [{ role: "user", content:
    `Sélection actuelle (avec prix relevés et scores Blender Open Data) :\n${JSON.stringify(resumeSel)}\n\n` +
    `Alertes du mois : ${JSON.stringify(alertes || [])}\n\n` +
    `Format EXACT d'une fiche de composant, un exemple réel par catégorie :\n${JSON.stringify(exemples)}\n\n` +
    `Format EXACT de "detail" selon le type (tout autre format sera écarté) :\n${Object.entries(FORMATS).map(([t, f]) => `- ${t} : ${f}`).join("\n")}\n` +
    `Pour un « ajout » : "id" = "<categorie>-<court en minuscules>" (ex. "gpu-5050"), et la fiche au même format que l'exemple de sa catégorie. ` +
    `Champs obligatoires : categorie, puce, court, caracteristiques (mêmes clés que l'exemple), modeles (au moins un, avec "modele" et "correspondance": {"motifs": [...], "exclure": [...]}), pourquoi, prix_exemple (prix constaté en euros). ` +
    `Pour une carte graphique ou un processeur, "blender": {"type", "nom"} avec le nom exact du périphérique dans Blender Open Data s'il y figure, sinon omets "blender". Un ajout incomplet sera écarté.\n\n` +
    `Vérifie : nouvelles cartes graphiques ou processeurs sortis ou annoncés en France, modèles retirés ou introuvables, ` +
    `caractéristiques à corriger (longueur, consommation, alimentation recommandée), EAN des modèles retenus, ASIN Amazon France. ` +
    `Propose les changements utiles, et seulement ceux-là.` }];
  // Repli serveur activé (« fallbacks: default ») : si Sonnet décline, l'API rejoue la demande sur un autre modèle.
  // pause_turn : l'API suspend un tour long (recherches web) ; on renvoie la réponse telle quelle pour qu'il continue.
  const diagnostic = { recherches: 0, sans_resultat: 0, requetes: [], erreurs_recherche: [], reprises: 0 };
  let r;
  for (let tour = 0; tour < 6; tour++) {
    r = await api().beta.messages.create({
      model: config.modeleMensuel, max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      system: STYLE + `
Tu prépares la proposition mensuelle de sélection du configurateur PC. Tu ne décides rien : tu proposes, Marc valide.
Réponds UNIQUEMENT par un objet JSON valide : {"resume": "…", "changements": [{"type": "ajout|retrait|modele|ean|asin|pourquoi|caracteristiques", "id": "…", "detail": {…}, "raison": "…", "sources": ["url", …]}]}.
Chaque changement doit citer au moins une source consultée. N'invente ni prix, ni caractéristique, ni EAN.`,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: config.rechercheMax, allowed_domains: config.domainesRecherche }],
      messages,
    });
    for (const b of r.content || []) {
      if (b.type === "server_tool_use" && b.name === "web_search") { diagnostic.recherches++; if (b.input && b.input.query) diagnostic.requetes.push(b.input.query); }
      if (b.type === "web_search_tool_result" && b.content && b.content.type === "web_search_tool_result_error") diagnostic.erreurs_recherche.push(b.content.error_code);
      else if (b.type === "web_search_tool_result" && Array.isArray(b.content) && !b.content.length) diagnostic.sans_resultat++;
    }
    if (r.stop_reason !== "pause_turn") break;
    diagnostic.reprises++;
    messages.push({ role: "assistant", content: r.content });
  }
  verifierFin(r, "Proposition mensuelle");
  if (r.stop_reason === "pause_turn") throw new Error("Proposition mensuelle : recherche toujours suspendue après 6 reprises");
  const brut = texte(r);
  const json = brut.slice(brut.indexOf("{"), brut.lastIndexOf("}") + 1);
  const prop = JSON.parse(json);
  if (!Array.isArray(prop.changements)) throw new Error("proposition sans liste de changements");
  const ecartes = [];
  prop.changements = prop.changements.filter(c => {
    if (!(c.id && c.type && Array.isArray(c.sources) && c.sources.length)) return false;
    const raison = raisonInvalide(c, selection);
    if (raison) { ecartes.push(`${c.type} ${c.id} (${raison})`); return false; }
    return true;
  });
  const notes = [];
  if (ecartes.length) notes.push(`changement(s) écarté(s), format invalide : ${ecartes.join(" ; ")}`);
  const erreurs = [...new Set(diagnostic.erreurs_recherche)];
  notes.push(`recherches web : ${diagnostic.recherches} sur ${config.rechercheMax}${diagnostic.sans_resultat ? `, dont ${diagnostic.sans_resultat} sans résultat` : ""}${erreurs.length ? `, erreur(s) renvoyée(s) par l'API : ${erreurs.join(", ")}` : ""}`);
  prop.resume = `${prop.resume || ""} [${notes.join(" ; ")}]`.trim();
  prop.diagnostic = { ...diagnostic, erreurs_recherche: erreurs, ajouts_ecartes: ecartes };
  return prop;
}

module.exports = { redigerPourquoi, proposerSelection, ficheValide, raisonInvalide, FORMATS, STYLE };
