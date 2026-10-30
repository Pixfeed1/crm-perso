/* Essai à sec, sans réseau ni base : mesures de la fixture Blender + prix d'exemple.
   Produit sortie/configurateur-data.json et affiche le résultat des contrôles. Usage : npm run essai */
const fs = require("fs");
const path = require("path");
const blender = require("../src/sources/blenderOpenData");
const { construire } = require("../src/catalogue");
const { assembler } = require("../src/moteur/assembler");
const { controler } = require("../src/controles");

const racine = path.join(__dirname, "..");
const selection = JSON.parse(fs.readFileSync(path.join(racine, "data/selection.json"), "utf8"));
const donnees = JSON.parse(fs.readFileSync(path.join(racine, "test/fixtures/blender-4.5.0.json"), "utf8"));
const t0 = Date.now();
const { scores, manquants } = blender.associer(selection, donnees);
const { C, alertes } = construire(selection, { scores, prixExemple: true, amazonTag: "" });
const data = assembler({ C, selection, sourcesMesures: [{ nom: "Blender Open Data", version: donnees.blender_version, date: donnees.releve_le }] });
const ctrl = controler(data, C);
fs.mkdirSync(path.join(racine, "sortie"), { recursive: true });
fs.writeFileSync(path.join(racine, "sortie/configurateur-data.json"), JSON.stringify(data));
console.log(`calcul : ${Date.now() - t0} ms · ${Object.keys(data.composants).length} composants · ${data.configs.length} machines · ${Object.keys(data.profils).length} profils · ${ctrl.tailleKo} Ko`);
console.log(`sans mesure : ${manquants.join(", ") || "aucun"} · alertes catalogue : ${alertes.length}`);
console.log(ctrl.ok ? "contrôles : OK" : `contrôles : ${ctrl.erreurs.length} erreur(s)\n- ${ctrl.erreurs.slice(0, 20).join("\n- ")}`);
if (ctrl.alertes.length) console.log("alertes :", ctrl.alertes);
process.exitCode = ctrl.ok ? 0 : 1;
