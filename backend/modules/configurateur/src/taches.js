/* Les tâches de l'agent (nuit, lundi, mois, validations), leur suivi et leur verrou.
   Dépendances injectées par le CRM : db (pool pg : query(sql, params), et connect() pour les transactions)
   et envoyerMail({ to, subject, text, html }).

   Principe : on prépare (relevé, calcul, contrôles) SANS rien changer de ce qui est en ligne ni de la sélection active.
   Ce n'est que si tout passe qu'on enregistre et qu'on publie, dans une même transaction. */
const fs = require("fs");
const path = require("path");
const config = require("./config");
const blender = require("./sources/blenderOpenData");
const awin = require("./sources/awin");
const { construire } = require("./catalogue");
const { assembler } = require("./moteur/assembler");
const { controler } = require("./controles");
const pub = require("./publication");
const ia = require("./ia");

const SELECTION_INITIALE = path.join(__dirname, "..", "data", "selection.json");

/* ---------- accès base ---------- */
async function selectionActive(db) {
  const r = await db.query("SELECT id, contenu, validee_le, validee_par FROM cfg_selections WHERE statut = 'validee' ORDER BY id DESC LIMIT 1");
  if (r.rows.length) return { id: r.rows[0].id, ...r.rows[0].contenu };
  // premier lancement : la sélection de départ, pas encore validée par Marc (la page affiche « exemple »)
  const s = JSON.parse(fs.readFileSync(SELECTION_INITIALE, "utf8"));
  const ins = await db.query("INSERT INTO cfg_selections (version, contenu, statut) VALUES ($1, $2, 'validee') RETURNING id", [s.version, s]);
  return { id: ins.rows[0].id, ...s };
}
async function dernieresMesures(db) {
  const r = await db.query("SELECT contenu FROM cfg_mesures ORDER BY id DESC LIMIT 1");
  return r.rows[0]?.contenu || null;
}
async function enregistrerOffres(db, offres) {
  for (const o of offres) await db.query(
    "INSERT INTO cfg_offres (composant, rang, marchand, produit, ean, prix, en_stock, lien, source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [o.id, o.rang, o.marchand, o.produit, o.ean, o.prix, o.en_stock, o.lien, o.source]);
}
/** Exécute fn(client) dans une transaction. Avec un pool pg, on prend un client dédié ; sinon (essais) on reste sur db. */
async function transaction(db, fn) {
  const client = typeof db.connect === "function" ? await db.connect() : db;
  try {
    await client.query("BEGIN");
    const r = await fn(client);
    await client.query("COMMIT");
    return r;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* connexion perdue : rien à annuler */ }
    throw e;
  } finally { if (client !== db) client.release?.(); }
}

/* ---------- préparer : relever, calculer, contrôler, sans rien publier ---------- */
async function preparer(deps, selection, { motif, rafraichirMesures = false, forcer = false } = {}) {
  const { db } = deps;
  let donnees = await dernieresMesures(db);
  if (!donnees || rafraichirMesures) {
    donnees = await blender.telecharger();
    await db.query("INSERT INTO cfg_mesures (source, contenu) VALUES ('blender-open-data', $1)", [donnees]);
  }
  const { scores, manquants } = blender.associer(selection, donnees);
  const { offres, erreurs: erreursFlux, ecartes } = await awin.releverOffres(selection);
  await enregistrerOffres(db, offres);                     // historique des prix : utile même si rien n'est publié
  const { C, alertes } = construire(selection, { scores, offres });
  const data = assembler({ C, selection, sourcesMesures: [{ nom: "Blender Open Data", version: donnees.blender_version, date: donnees.releve_le }] });
  const precedent = await pub.lirePrecedent();
  const ctrl = controler(data, C, forcer ? null : precedent);
  const resume = { motif, composants: Object.keys(data.composants).length, profils: Object.keys(data.profils).length,
    sansMesure: manquants, erreursFlux, fluxEcartes: ecartes, alertes, controles: ctrl };
  return { ok: ctrl.ok, data, C, ctrl, resume, precedent };
}

async function noterBlocage(deps, prep) {
  await deps.db.query("INSERT INTO cfg_publications (statut, erreurs, taille_ko, resume) VALUES ('bloquee', $1, $2, $3)",
    [JSON.stringify(prep.ctrl.erreurs), prep.ctrl.tailleKo, prep.resume]);   // pg envoie un tableau JS comme tableau SQL, pas JSON
  await prevenir(deps, `Configurateur : publication bloquée (${prep.resume.motif})`,
    `Rien n'a changé en ligne ni dans la sélection.\n\nErreurs :\n- ${prep.ctrl.erreurs.slice(0, 40).join("\n- ")}` +
    (prep.resume.erreursFlux.length ? `\n\nFlux :\n- ${prep.resume.erreursFlux.join("\n- ")}` : ""));
}

/** Publie le fichier préparé en restant d'accord avec la base.
    - le fichier complet est écrit à côté, invisible du site ;
    - la transaction enregistre les changements de base (travauxBase) et la publication ;
    - seulement après le COMMIT, le fichier est mis en ligne par un renommage atomique.
    Si la transaction échoue (COMMIT compris), le fichier temporaire est supprimé : rien n'a changé, ni en base ni en ligne.
    Si le renommage échoue après le COMMIT (cas extrême : disque), la publication est marquée « echec_ecriture » et Marc est prévenu ;
    la base fait foi, et le relevé suivant recalcule et republie tout depuis elle. */
async function publierEnTransaction(deps, prep, travauxBase = null) {
  // identifiant de version, écrit à la fois dans le fichier et en base : sert à vérifier au démarrage qu'ils concordent
  prep.data.version_publication = require("crypto").randomUUID();
  const fichier = await pub.ecrireTemporaire(prep.data);
  let pubId;
  try {
    pubId = await transaction(deps.db, async client => {
      if (travauxBase) await travauxBase(client);
      // le fichier exact est gardé en base : une restauration le remet tel quel, sans dépendre des flux ni des mesures
      const id = (await client.query("INSERT INTO cfg_publications (statut, erreurs, taille_ko, resume, version, contenu) VALUES ('publiee', $1, $2, $3, $4, $5) RETURNING id",
        [JSON.stringify(prep.ctrl.alertes), prep.ctrl.tailleKo, prep.resume, prep.data.version_publication, prep.data])).rows[0].id;
      await client.query(`UPDATE cfg_publications SET contenu = NULL WHERE contenu IS NOT NULL AND id NOT IN
        (SELECT id FROM cfg_publications WHERE contenu IS NOT NULL ORDER BY id DESC LIMIT $1)`, [config.publicationsGardees]);
      return id;
    });
  } catch (e) { await pub.annuler(fichier); throw e; }
  try {
    const res = await pub.basculer(fichier);
    await deps.db.query("UPDATE cfg_publications SET resume = resume || $2 WHERE id = $1", [pubId, { cache: res.cache }]).catch(() => {});
    return res;
  } catch (e) {
    await pub.annuler(fichier);
    await deps.db.query("UPDATE cfg_publications SET statut = 'echec_ecriture', erreurs = $2 WHERE id = $1", [pubId, JSON.stringify([e.message])]).catch(() => {});
    await prevenir(deps, "Configurateur : fichier non mis en ligne", `La base est à jour mais le fichier n'a pas pu être écrit sur le site : ${e.message}\nLe prochain relevé republiera tout.`);
    throw e;
  }
}

/* ---------- les trois rendez-vous ---------- */
async function calculerEtPublier(deps, opts) {
  const selection = await selectionActive(deps.db);
  const prep = await preparer(deps, selection, opts);
  if (!prep.ok) { await noterBlocage(deps, prep); return { publie: false, ...prep }; }
  await publierEnTransaction(deps, prep);
  await signalerDisparitions(deps, prep);
  return { publie: true, ...prep };
}

/** Cartes graphiques et processeurs présents dans la version précédente et absents de la nouvelle, avec la raison.
    - rupture : plus aucune offre en stock (le marché, rien à faire) ;
    - incompatible : en stock, mais aucun modèle n'entre dans une machine (donnée de la sélection à vérifier) ;
    - non_retenue : en stock et compatible, mais plus choisie à aucun budget (souvent un prix qui a grimpé). */
function disparitions(precedent, data, C, alertes) {
  if (!precedent?.composants) return [];
  const out = [];
  for (const [id, c] of Object.entries(precedent.composants)) {
    if (!["gpu", "cpu"].includes(c.categorie) || data.composants[id]) continue;
    const a = alertes.filter(x => x.id === id);
    const raison = a.some(x => x.niveau === "ecarte") ? "incompatible" : a.some(x => x.niveau === "rupture") ? "rupture" : C[id] ? "non_retenue" : "rupture";
    out.push({ id, puce: c.puce, raison, details: a.filter(x => x.niveau === "incompatible").map(x => x.message), prix_avant: c.prix, prix_maintenant: C[id]?.prix ?? null });
  }
  return out;
}

async function signalerDisparitions(deps, prep) {
  const liste = disparitions(prep.precedent, prep.data, prep.C, prep.resume.alertes);
  prep.resume.disparitions = liste;
  if (!liste.length) return;
  const texte = { rupture: "plus aucune offre en stock chez les marchands suivis. C'est le marché, rien à faire : elle reviendra avec le stock.",
    incompatible: "en stock, mais aucun modèle n'entre dans une machine valide. Probablement une donnée de la sélection à vérifier :",
    non_retenue: "en stock et compatible, mais plus choisie à aucun budget." };
  const lignes = liste.map(d => `- ${d.puce} : ${texte[d.raison]}` +
    (d.raison === "non_retenue" && d.prix_maintenant ? ` Prix : ${d.prix_avant} € avant, ${d.prix_maintenant} € maintenant.` : "") +
    (d.details.length ? "\n  " + d.details.join("\n  ") : ""));
  await prevenir(deps, `Configurateur : ${liste.length > 1 ? `${liste.length} puces retirées` : `${liste[0].puce} retirée`} de la page (${prep.resume.motif})`,
    `La page est publiée sans :\n${lignes.join("\n")}`);
}

async function nuit(deps) {
  return calculerEtPublier(deps, { motif: "relevé de nuit" });
}

async function lundi(deps) {
  const r = await calculerEtPublier(deps, { motif: "relevé du lundi" });
  if (!r.publie) return r;
  // un modèle remplacé par sa réserve (rupture ou incompatibilité) : sa ligne « pourquoi » est réécrite, à valider
  const basculés = Object.values(r.C).filter(c => c.bascule && r.data.composants[c.id]);
  for (const c of basculés) {
    try {
      const texte = await ia.redigerPourquoi(c, { ancien: c.reserves?.[0]?.modele, prixAncien: r.precedent?.composants?.[c.id]?.prix });
      await deps.db.query("INSERT INTO cfg_propositions (contenu, statut) VALUES ($1, 'en_attente')",
        [{ resume: `${c.puce} : nouveau modèle retenu`, changements: [{ type: "pourquoi", id: c.id, detail: { texte }, raison: "Le modèle retenu est en rupture ou n'entre plus dans les machines.", sources: ["flux Awin"] }] }]);
    } catch (e) { await prevenir(deps, "Configurateur : texte de bascule non rédigé", e.message); }
  }
  if (basculés.length) await prevenir(deps, "Configurateur : modèles remplacés par leur réserve",
    `${basculés.map(c => `- ${c.puce} : ${c.modele}`).join("\n")}\n\nLes nouvelles lignes « pourquoi » attendent ta validation : ${config.urlEcranValidation}`);
  return r;
}

async function mois(deps) {
  const r = await calculerEtPublier(deps, { motif: "relevé mensuel", rafraichirMesures: true });
  const selection = await selectionActive(deps.db);
  const mesures = blender.associer(selection, await dernieresMesures(deps.db)).scores;
  const offresParId = {};
  for (const [id, c] of Object.entries(r.data?.composants || {})) offresParId[id] = c.offres;
  const prop = await ia.proposerSelection(selection, { mesures, offresParId, alertes: r.resume.alertes });
  const ins = await deps.db.query("INSERT INTO cfg_propositions (contenu, statut) VALUES ($1, 'en_attente') RETURNING id", [prop]);
  await prevenir(deps, "Configurateur : la sélection du mois attend ta validation",
    `${prop.resume}\n\n${prop.changements.length} changement(s) proposé(s).\nValider : ${config.urlEcranValidation}?proposition=${ins.rows[0].id}`);
  return { ...r, proposition: prop };
}

/* ---------- validation par Marc ---------- */
/** decisions : { [indexChangement]: true|false }.
    1. On construit la sélection candidate et on la prépare (relevé, calcul, contrôles) sans toucher à l'actuelle.
    2. Si un contrôle échoue : rien n'est enregistré, la proposition reste en attente, Marc voit les erreurs.
    3. Sinon, une seule transaction : ancienne sélection remplacée, nouvelle enregistrée, proposition traitée, fichier publié. */
async function valider(deps, propositionId, decisions, validePar = "Marc") {
  const { db } = deps;
  const p = (await db.query("SELECT contenu FROM cfg_propositions WHERE id = $1 AND statut = 'en_attente'", [propositionId])).rows[0];
  if (!p) throw Object.assign(new Error("proposition introuvable ou déjà traitée"), { status: 404 });
  const active = await selectionActive(db);
  const candidate = appliquer(structuredClone({ composants: active.composants }), p.contenu.changements, decisions);
  candidate.version = new Date().toISOString().slice(0, 10) + "-v" + Date.now().toString(36);
  candidate.validee_le = new Date().toISOString().slice(0, 10);
  candidate.validee_par = validePar;

  const prep = await preparer(deps, candidate, { motif: `validation de la proposition ${propositionId}` });
  if (!prep.ok) { await noterBlocage(deps, prep); return { publie: false, ...prep }; }

  await publierEnTransaction(deps, prep, async client => {
    const encore = await client.query("SELECT id FROM cfg_propositions WHERE id = $1 AND statut = 'en_attente' FOR UPDATE", [propositionId]);
    if (!encore.rows.length) throw Object.assign(new Error("proposition traitée entre-temps"), { status: 409 });
    await client.query("UPDATE cfg_selections SET statut = 'remplacee' WHERE statut = 'validee'");
    await client.query("INSERT INTO cfg_selections (version, contenu, statut, validee_le, validee_par) VALUES ($1, $2, 'validee', now(), $3)",
      [candidate.version, candidate, validePar]);
    await client.query("UPDATE cfg_propositions SET statut = 'traitee', decisions = $2, traitee_le = now() WHERE id = $1", [propositionId, decisions]);
  });
  return { publie: true, ...prep };
}

/** Première mise en ligne : valide la sélection active telle quelle, aux mêmes conditions. */
async function validerTelleQuelle(deps, validePar = "Marc") {
  const { id, ...active } = await selectionActive(deps.db);
  const candidate = { ...active, validee_le: new Date().toISOString().slice(0, 10), validee_par: validePar };
  const prep = await preparer(deps, candidate, { motif: "validation initiale", forcer: true });
  if (!prep.ok) { await noterBlocage(deps, prep); return { publie: false, ...prep }; }
  await publierEnTransaction(deps, prep, client =>
    client.query("UPDATE cfg_selections SET contenu = $2, validee_le = now(), validee_par = $3 WHERE id = $1", [id, candidate, validePar]));
  return { publie: true, ...prep };
}

function appliquer(sel, changements, decisions) {
  changements.forEach((c, i) => {
    if (!decisions[i]) return;
    const comp = sel.composants[c.id], d = c.detail || {};
    switch (c.type) {
      case "ajout": sel.composants[c.id] = d.composant; break;
      case "retrait": delete sel.composants[c.id]; break;
      case "pourquoi": if (comp) comp.pourquoi = d.texte; break;
      case "ean": if (comp?.modeles?.[d.rang || 0]) { const m = comp.modeles[d.rang || 0]; m.correspondance = m.correspondance || {}; m.correspondance.ean = [...new Set([...(m.correspondance.ean || []), ...[].concat(d.ean)])]; } break;
      case "asin": if (comp?.modeles?.[d.rang || 0]) comp.modeles[d.rang || 0].asin = d.asin; break;
      case "modele": if (comp) { comp.modeles = comp.modeles || []; comp.modeles.splice(d.rang || 0, d.remplacer ? 1 : 0, d.modele); } break;
      case "caracteristiques": if (comp) comp.caracteristiques = { ...comp.caracteristiques, ...d }; break;
    }
  });
  return sel;
}

/* ---------- suivi des tâches ----------
   Une seule tâche à la fois (elles écrivent toutes le même fichier), même si le CRM tournait un jour en plusieurs processus :
   - dans le processus, la variable enCours ferme la porte avant tout « await » ;
   - entre processus, un verrou PostgreSQL (pg_try_advisory_lock) est tenu par une connexion dédiée pendant toute la tâche.
     Si le processus meurt, la connexion se ferme et PostgreSQL libère le verrou tout seul.
   Chaque demande reçoit un identifiant : « en_cours » puis « terminee » ou « echouee » ; ou « refusee » si une autre tourne. */
const TACHES = { nuit, lundi, mois, valider, validerTelleQuelle, restaurer: (...a) => restaurer(...a) };
const CLE_VERROU = 74200117;                                   // clé arbitraire, propre au configurateur
let enCours = null;

async function prendreVerrou(db) {
  if (typeof db.connect !== "function") return { libere: async () => {} };   // essais sans pool : verrou du processus seulement
  const client = await db.connect();
  try {
    const ok = (await client.query("SELECT pg_try_advisory_lock($1) AS ok", [CLE_VERROU])).rows[0].ok;
    if (!ok) { client.release(); return null; }
  } catch (e) { client.release(); throw e; }
  return { libere: async () => {
    try { await client.query("SELECT pg_advisory_unlock($1)", [CLE_VERROU]); client.release(); }
    catch { client.release(true); }                            // connexion douteuse : on la détruit, ce qui libère aussi le verrou
  } };
}

async function refuser(db, nom, origine) {
  const autre = enCours?.id ? enCours :
    (await db.query("SELECT id, nom FROM cfg_taches WHERE statut = 'en_cours' ORDER BY id DESC LIMIT 1")).rows[0] || { id: null, nom: "?" };
  const r = await db.query("INSERT INTO cfg_taches (nom, origine, statut, fin, erreur) VALUES ($1, $2, 'refusee', now(), $3) RETURNING id",
    [nom, origine, `tâche ${autre.id ?? "?"} (${autre.nom}) déjà en cours`]);
  return { id: r.rows[0].id, statut: "refusee", en_cours: autre.id };
}

async function demarrer(deps, nom, args = [], { origine = "manuel" } = {}) {
  if (!TACHES[nom]) throw Object.assign(new Error(`tâche inconnue : ${nom}`), { status: 404 });
  if (enCours) return refuser(deps.db, nom, origine);
  enCours = { id: null, nom };                              // pris avant tout await : pas de course dans le processus
  let verrou, id;
  try {
    verrou = await prendreVerrou(deps.db);
    if (!verrou) { enCours = null; return refuser(deps.db, nom, origine); }
    id = (await deps.db.query("INSERT INTO cfg_taches (nom, origine, statut) VALUES ($1, $2, 'en_cours') RETURNING id", [nom, origine])).rows[0].id;
  } catch (e) { await verrou?.libere(); enCours = null; throw e; }
  enCours.id = id;
  const fin = (async () => {
    try {
      const r = await TACHES[nom](deps, ...args);
      await deps.db.query("UPDATE cfg_taches SET statut = 'terminee', fin = now(), resultat = $2 WHERE id = $1",
        [id, { publie: r.publie, resume: r.resume, proposition: r.proposition ? true : undefined }]);
    } catch (e) {
      console.error(`[configurateur] tâche ${nom} (${id}) :`, e);
      await deps.db.query("UPDATE cfg_taches SET statut = 'echouee', fin = now(), erreur = $2 WHERE id = $1", [id, e.message]).catch(() => {});
      if (origine !== "manuel") await prevenir(deps, `Configurateur : échec de la tâche ${nom}`, e.stack || String(e));
    } finally { await verrou.libere(); enCours = null; }
  })();
  return { id, statut: "en_cours", fin };
}

async function etatTache(db, id) {
  return (await db.query("SELECT id, nom, origine, statut, debut, fin, resultat, erreur FROM cfg_taches WHERE id = $1", [id])).rows[0] || null;
}

/** Au démarrage : une tâche restée « en_cours » sans personne pour tenir le verrou a été coupée (redémarrage, plantage). */
async function solderInterrompues(db) {
  const verrou = await prendreVerrou(db);
  if (!verrou) return;                                      // une tâche tourne réellement ailleurs : on ne touche à rien
  try { await db.query("UPDATE cfg_taches SET statut = 'interrompue', fin = now() WHERE statut = 'en_cours'"); }
  finally { await verrou.libere(); }
}

/** Au démarrage : le fichier en ligne est-il bien celui de la dernière publication enregistrée ?
    Sinon (processus coupé entre le COMMIT et la mise en ligne, fichier restauré à la main…), on relance un calcul complet
    depuis la base, qui fait foi, et on prévient Marc. */
async function reconcilier(deps) {
  const derniere = (await deps.db.query("SELECT id, version, contenu IS NOT NULL AS gardee FROM cfg_publications WHERE statut IN ('publiee', 'echec_ecriture') ORDER BY id DESC LIMIT 1")).rows[0];
  if (!derniere?.version) return { action: "rien", raison: "aucune publication versionnée" };
  const enLigne = (await pub.lirePrecedent())?.version_publication || null;
  if (enLigne === derniere.version) return { action: "rien", raison: "concordance" };
  // remettre en ligne le fichier exact gardé en base : ni flux, ni mesures, ni calcul. Sinon seulement, recalculer.
  const nom = derniere.gardee ? "restaurer" : "nuit", args = derniere.gardee ? [derniere.id] : [];
  await prevenir(deps, "Configurateur : fichier en ligne différent de la base",
    `La dernière publication enregistrée (n° ${derniere.id}) n'est pas celle du fichier en ligne. ` +
    (derniere.gardee ? "Elle est remise en ligne à l'identique depuis la base." : "Son contenu n'est plus en base : un calcul complet est relancé."));
  const t = await demarrer(deps, nom, args, { origine: "reconciliation" });
  return { action: derniere.gardee ? "restauration" : "republication", tache: t };
}

/** Remet en ligne, à l'identique, le fichier d'une publication gardée en base (réconciliation, ou retour arrière demandé par Marc). */
async function restaurer(deps, publicationId) {
  const row = (await deps.db.query("SELECT id, statut, contenu FROM cfg_publications WHERE id = $1", [publicationId])).rows[0];
  if (!row?.contenu) throw Object.assign(new Error(`publication ${publicationId} introuvable ou plus gardée en base`), { status: 404 });
  const res = await pub.publier(row.contenu);
  if (row.statut === "echec_ecriture") await deps.db.query("UPDATE cfg_publications SET statut = 'publiee' WHERE id = $1", [row.id]);
  return { publie: true, resume: { motif: `restauration de la publication ${row.id}`, version: row.contenu.version_publication, cache: res.cache } };
}

async function prevenir(deps, sujet, texte) {
  if (!config.mailValidation || !deps.envoyerMail) return;
  try { await deps.envoyerMail({ to: config.mailValidation, subject: sujet, text: texte }); } catch { /* ne jamais casser une tâche pour un mail */ }
}

module.exports = { nuit, lundi, mois, valider, validerTelleQuelle, calculerEtPublier, preparer, appliquer, selectionActive, disparitions, signalerDisparitions,
  demarrer, etatTache, solderInterrompues, reconcilier, restaurer, transaction, CLE_VERROU };
