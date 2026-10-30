/* Point d'entrée pour le CRM.
   Dans le backend : require('./modules/configurateur').brancher(app, { db, envoyerMail, authentifier })
   - planifie les trois tâches (node-cron, fuseau Europe/Paris) ;
   - expose les routes de l'écran de validation, TOUJOURS derrière le middleware d'authentification du CRM :
     le module refuse de démarrer sans lui. */
const express = require("express");
const cron = require("node-cron");
const config = require("./config");
const taches = require("./taches");

function brancher(app, deps, { planifier = true } = {}) {
  if (typeof deps?.authentifier !== "function")
    throw new Error("configurateur : deps.authentifier (middleware d'authentification du CRM) est obligatoire");
  if (typeof deps.db?.query !== "function") throw new Error("configurateur : deps.db (pool PostgreSQL) est obligatoire");

  // au démarrage : solder les tâches coupées par un redémarrage, puis vérifier que le fichier en ligne concorde avec la base
  taches.solderInterrompues(deps.db)
    .then(() => taches.reconcilier(deps))
    .catch(e => console.error("[configurateur] démarrage :", e.message));

  if (planifier) {
    const planifiee = nom => () => taches.demarrer(deps, nom, [], { origine: "planifiee" })
      .catch(e => console.error(`[configurateur] tâche ${nom} :`, e));
    cron.schedule(config.cron.nuit, planifiee("nuit"), { timezone: config.fuseau });
    cron.schedule(config.cron.lundi, planifiee("lundi"), { timezone: config.fuseau });
    cron.schedule(config.cron.mois, planifiee("mois"), { timezone: config.fuseau });
  }

  const r = express.Router();
  r.use(deps.authentifier);
  r.use(express.json());
  const qui = req => req.user?.name || req.user?.email || "Marc";
  // 202 : demande acceptée, à suivre avec GET /taches/:id ; 409 : une autre tâche tourne
  const repondre = (res, t) => { const { fin, ...corps } = t; res.status(t.statut === "refusee" ? 409 : 202).json(corps); };
  const asyncRoute = fn => (req, res, next) => fn(req, res).catch(next);

  // état : dernières publications et tâches, propositions en attente, sélection active, tâche en cours
  r.get("/etat", asyncRoute(async (_req, res) => {
    const [pubs, props, tch, sel] = await Promise.all([
      deps.db.query("SELECT id, publie_le, statut, erreurs, taille_ko, resume, version, contenu IS NOT NULL AS restaurable FROM cfg_publications ORDER BY id DESC LIMIT 10"),
      deps.db.query("SELECT id, cree_le, contenu FROM cfg_propositions WHERE statut = 'en_attente' ORDER BY id"),
      deps.db.query("SELECT id, nom, origine, statut, debut, fin, erreur FROM cfg_taches ORDER BY id DESC LIMIT 20"),
      taches.selectionActive(deps.db)]);
    res.json({ publications: pubs.rows, propositions: props.rows, taches: tch.rows,
      selection: { version: sel.version, validee_le: sel.validee_le, validee_par: sel.validee_par, composants: sel.composants } });
  }));

  // valider une proposition : body { "decisions": { "0": true, "1": false, … } }
  r.post("/propositions/:id/valider", asyncRoute(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ erreur: "identifiant invalide" });
    const decisions = req.body?.decisions;
    if (!decisions || typeof decisions !== "object") return res.status(400).json({ erreur: "decisions manquantes" });
    repondre(res, await taches.demarrer(deps, "valider", [id, decisions, qui(req)]));
  }));

  // première mise en ligne : valider la sélection de départ telle quelle
  r.post("/selection/valider", asyncRoute(async (req, res) => {
    repondre(res, await taches.demarrer(deps, "validerTelleQuelle", [qui(req)]));
  }));

  // lancer une tâche à la main
  r.post("/taches/:nom", asyncRoute(async (req, res) => {
    if (!["nuit", "lundi", "mois"].includes(req.params.nom)) return res.status(404).json({ erreur: "tâche inconnue" });
    repondre(res, await taches.demarrer(deps, req.params.nom));
  }));

  // remettre en ligne, à l'identique, une publication précédente gardée en base (retour arrière)
  r.post("/publications/:id/restaurer", asyncRoute(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ erreur: "identifiant invalide" });
    repondre(res, await taches.demarrer(deps, "restaurer", [id]));
  }));

  // suivre une tâche : statut en_cours | terminee | echouee | refusee | interrompue, et son résultat
  r.get("/taches/:id", asyncRoute(async (req, res) => {
    const t = await taches.etatTache(deps.db, parseInt(req.params.id, 10) || 0);
    t ? res.json(t) : res.status(404).json({ erreur: "tâche inconnue" });
  }));

  r.use((err, _req, res, _next) => {
    console.error("[configurateur]", err);
    res.status(err.status || 500).json({ erreur: err.status ? err.message : "erreur interne" });
  });

  app.use("/api/configurateur", r);
  return { router: r };
}

module.exports = { brancher, taches };
