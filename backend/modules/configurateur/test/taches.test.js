/* Tests d'intégration avec une vraie base PostgreSQL : lancés seulement si PGTEST_URL est défini.
   Ex. : PGTEST_URL=postgres://postgres@localhost:5432/configurateur_test npm run test:integration
   (npm run test:integration échoue si PGTEST_URL manque : la recette ne peut pas les ignorer par erreur) */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const URL_PG = process.env.PGTEST_URL;
if (process.env.EXIGER_PG && !URL_PG) throw new Error("npm run test:integration exige PGTEST_URL (base PostgreSQL de test, vide)");
const opts = { skip: !URL_PG && "PGTEST_URL absent : tests d'intégration ignorés", concurrency: false };

test("tâches et validation sur base réelle", opts, async t => {
  const { Pool } = require("pg");
  const express = require("express");
  const config = require("../src/config");
  const blender = require("../src/sources/blenderOpenData");
  const awin = require("../src/sources/awin");
  const ia = require("../src/ia");
  const taches = require("../src/taches");
  const { brancher } = require("../src");

  const db = new Pool({ connectionString: URL_PG });
  await db.query(fs.readFileSync(path.join(__dirname, "../sql/schema.sql"), "utf8"));
  await db.query("TRUNCATE cfg_selections, cfg_mesures, cfg_offres, cfg_publications, cfg_propositions, cfg_taches RESTART IDENTITY");
  config.mailValidation = "test@exemple.invalid";
  config.dossierPublication = fs.mkdtempSync(path.join(os.tmpdir(), "cfg-"));
  const fichier = path.join(config.dossierPublication, "configurateur-data.json");

  // réseau simulé : mesures de la fixture, une offre par composant au prix d'exemple
  const selection = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/selection.json"), "utf8"));
  const mesures = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/blender-4.5.0.json"), "utf8"));
  let multiplicateur = {}, lenteur = 0;
  blender.telecharger = async () => mesures;
  awin.releverOffres = async sel => {
    if (lenteur) await new Promise(r => setTimeout(r, lenteur));
    const offres = Object.entries(sel.composants).filter(([, c]) => c.prix_exemple && c.modeles?.length).map(([id, c]) =>
      ({ id, rang: 0, marchand: "fnac", nom: "Fnac", prix: c.prix_exemple * (multiplicateur[id] || 1), en_stock: true, lien: "https://exemple.invalid/" + id, releve_le: "2026-10-29T02:00:00.000Z", source: "awin:test" }));
    return { offres, erreurs: [], ecartes: [] };
  };
  ia.redigerPourquoi = async () => "Texte de test.";
  const mails = [];
  const deps = { db, envoyerMail: async m => { mails.push(m); }, authentifier: (req, res, next) => req.get("x-test") === "ok" ? next() : res.status(401).end() };
  const finir = async d => { const r = await d; await r.fin; return taches.etatTache(db, r.id); };

  await t.test("le module refuse de démarrer sans authentification", () => {
    assert.throws(() => brancher(express(), { db }, { planifier: false }), /authentifier/);
  });

  await t.test("la tâche de nuit publie et se termine", async () => {
    const e = await finir(taches.demarrer(deps, "nuit"));
    assert.equal(e.statut, "terminee");
    assert.equal(e.resultat.publie, true);
    assert.ok(fs.existsSync(fichier));
  });

  await t.test("une deuxième demande pendant qu'une tâche tourne est refusée et tracée", async () => {
    lenteur = 300;
    const a = await taches.demarrer(deps, "nuit");
    const b = await taches.demarrer(deps, "lundi");
    assert.equal(a.statut, "en_cours");
    assert.equal(b.statut, "refusee");
    assert.equal(b.en_cours, a.id);
    await a.fin; lenteur = 0;
    assert.equal((await taches.etatTache(db, b.id)).statut, "refusee");
  });

  await t.test("une validation qui échoue aux contrôles ne change ni la sélection, ni la proposition, ni le fichier", async () => {
    const avantSel = (await db.query("SELECT id, version FROM cfg_selections WHERE statut = 'validee'")).rows;
    const avantFichier = fs.readFileSync(fichier, "utf8");
    const p = (await db.query("INSERT INTO cfg_propositions (contenu) VALUES ($1) RETURNING id",
      [{ resume: "test", changements: [{ type: "pourquoi", id: "gpu-5070", detail: { texte: "Nouveau." }, sources: ["x"] }] }])).rows[0].id;
    multiplicateur = Object.fromEntries(Object.keys(selection.composants).map(id => [id, 2]));   // tous les prix +100 % : erreur de flux typique
    const e = await finir(taches.demarrer(deps, "valider", [p, { 0: true }, "Marc"]));
    multiplicateur = {};
    assert.equal(e.statut, "terminee");
    assert.equal(e.resultat.publie, false);
    assert.deepEqual((await db.query("SELECT id, version FROM cfg_selections WHERE statut = 'validee'")).rows, avantSel);
    assert.equal((await db.query("SELECT statut FROM cfg_propositions WHERE id = $1", [p])).rows[0].statut, "en_attente");
    assert.equal(fs.readFileSync(fichier, "utf8"), avantFichier);
    assert.ok(mails.some(m => /bloquée/.test(m.subject)));

    // même proposition, prix normal : tout passe en une fois
    const ok = await finir(taches.demarrer(deps, "valider", [p, { 0: true }, "Marc"]));
    assert.equal(ok.resultat.publie, true);
    const sel = (await db.query("SELECT contenu FROM cfg_selections WHERE statut = 'validee'")).rows;
    assert.equal(sel.length, 1);
    assert.equal(sel[0].contenu.composants["gpu-5070"].pourquoi, "Nouveau.");
    assert.equal((await db.query("SELECT statut FROM cfg_propositions WHERE id = $1", [p])).rows[0].statut, "traitee");
    assert.equal(JSON.parse(fs.readFileSync(fichier, "utf8")).composants["gpu-5070"].pourquoi, "Nouveau.");
  });

  await t.test("verrou partagé : si un autre processus tient le verrou, la demande est refusée", async () => {
    const autre = await db.connect();
    await autre.query("SELECT pg_advisory_lock($1)", [taches.CLE_VERROU]);
    try {
      const r = await taches.demarrer(deps, "nuit");
      assert.equal(r.statut, "refusee");
    } finally { await autre.query("SELECT pg_advisory_unlock($1)", [taches.CLE_VERROU]); autre.release(); }
    const ok = await finir(taches.demarrer(deps, "nuit"));
    assert.equal(ok.statut, "terminee");
  });

  await t.test("COMMIT en échec : ni le fichier en ligne ni la base ne changent, aucun temporaire ne traîne", async () => {
    const avant = fs.readFileSync(fichier, "utf8");
    const nbPub = (await db.query("SELECT count(*)::int n FROM cfg_publications")).rows[0].n;
    const dbPiege = { query: (...a) => db.query(...a), connect: async () => {
      const c = await db.connect();
      return { query: (sql, ...r) => /^COMMIT/.test(sql) ? Promise.reject(new Error("COMMIT refusé (simulation)")) : c.query(sql, ...r), release: (...r) => c.release(...r) };
    } };
    multiplicateur = { "ram-32": 1.1 };                     // un prix change : le fichier serait différent
    await assert.rejects(taches.calculerEtPublier({ ...deps, db: dbPiege }, { motif: "test commit" }), /COMMIT refusé/);
    multiplicateur = {};
    assert.equal(fs.readFileSync(fichier, "utf8"), avant);
    assert.equal((await db.query("SELECT count(*)::int n FROM cfg_publications")).rows[0].n, nbPub);
    assert.deepEqual(fs.readdirSync(config.dossierPublication).filter(n => n.endsWith(".tmp")), []);
  });

  await t.test("mise en ligne en échec après le COMMIT : publication marquée, Marc prévenu", async () => {
    const pub = require("../src/publication");
    const vraiBasculer = pub.basculer;
    pub.basculer = async () => { throw new Error("disque plein (simulation)"); };
    try {
      await assert.rejects(taches.calculerEtPublier(deps, { motif: "test disque" }), /disque plein/);
    } finally { pub.basculer = vraiBasculer; }
    const d = (await db.query("SELECT statut FROM cfg_publications ORDER BY id DESC LIMIT 1")).rows[0];
    assert.equal(d.statut, "echec_ecriture");
    assert.ok(mails.some(m => /non mis en ligne/.test(m.subject)));
  });

  await t.test("réconciliation au démarrage : un fichier en ligne différent de la base est republié", async () => {
    // le test précédent a laissé une publication en « echec_ecriture » : la réconciliation doit la rattraper
    const r0 = await taches.reconcilier(deps);
    assert.equal(r0.action, "restauration");
    await r0.tache.fin;
    assert.equal((await taches.reconcilier(deps)).action, "rien");
    const vieux = JSON.parse(fs.readFileSync(fichier, "utf8"));
    vieux.version_publication = "ancienne-version";              // comme si le processus était mort avant la mise en ligne
    fs.writeFileSync(fichier, JSON.stringify(vieux));
    lenteur = 0; const appels = { n: 0 }; const releve = awin.releverOffres;
    awin.releverOffres = async (...x) => { appels.n++; return releve(...x); };
    const r = await taches.reconcilier(deps);
    assert.equal(r.action, "restauration");
    await r.tache.fin;
    awin.releverOffres = releve;
    assert.equal(appels.n, 0, "la restauration ne doit dépendre d'aucun flux");
    const derniere = (await db.query("SELECT version FROM cfg_publications WHERE statut = 'publiee' ORDER BY id DESC LIMIT 1")).rows[0].version;
    assert.equal(JSON.parse(fs.readFileSync(fichier, "utf8")).version_publication, derniere);
    assert.ok(mails.some(m => /différent de la base/.test(m.subject)));
  });

  await t.test("routes : 401 sans authentification, 202 puis suivi par identifiant", async () => {
    const app = express(); brancher(app, deps, { planifier: false });
    const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}/api/configurateur`;
    try {
      assert.equal((await fetch(base + "/etat")).status, 401);
      const r = await fetch(base + "/taches/nuit", { method: "POST", headers: { "x-test": "ok" } });
      assert.equal(r.status, 202);
      const { id } = await r.json();
      let e; for (let i = 0; i < 50; i++) { e = await (await fetch(`${base}/taches/${id}`, { headers: { "x-test": "ok" } })).json(); if (e.statut !== "en_cours") break; await new Promise(r => setTimeout(r, 100)); }
      assert.equal(e.statut, "terminee");
    } finally { srv.close(); }
  });

  await db.end();
});
