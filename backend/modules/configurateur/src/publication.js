/* Publication atomique du fichier sur jurojin.net, archivage, et vidage du cache WP Rocket de la page. */
const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const config = require("./config");

const FICHIER = "configurateur-data.json";

async function lirePrecedent(dossier = config.dossierPublication) {
  try { return JSON.parse(await fs.readFile(path.join(dossier, FICHIER), "utf8")); } catch { return null; }
}

/** Publication en deux temps, pour rester d'accord avec la base :
    1. ecrireTemporaire : le fichier complet est écrit à côté, invisible du site (avant la transaction : disque plein, droits… échouent ici, sans rien changer) ;
    2. basculer : après le COMMIT, un simple renommage, atomique, le met en ligne ; ou annuler si la transaction a échoué. */
async function ecrireTemporaire(data, { dossier = config.dossierPublication } = {}) {
  await fs.mkdir(path.join(dossier, "archives"), { recursive: true });
  const json = JSON.stringify(data);
  // temporaires abandonnés par un plantage : supprimés au-delà d'une heure
  for (const n of await fs.readdir(dossier)) if (n.startsWith(`.${FICHIER}.`) && n.endsWith(".tmp")) {
    const f = path.join(dossier, n);
    try { if (Date.now() - (await fs.stat(f)).mtimeMs > 3600e3) await fs.unlink(f); } catch { /* déjà parti */ }
  }
  const tmp = path.join(dossier, `.${FICHIER}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, json);
  return { tmp, dossier, octets: Buffer.byteLength(json) };
}

async function basculer({ tmp, dossier, octets }, { purger = true } = {}) {
  const cible = path.join(dossier, FICHIER);
  try { await fs.copyFile(cible, path.join(dossier, "archives", `${new Date().toISOString().replace(/[:.]/g, "-")}.json`)); } catch { /* premier fichier */ }
  await fs.rename(tmp, cible);
  await nettoyerArchives(path.join(dossier, "archives"), 60);
  const cache = purger ? await viderCache() : { fait: false, raison: "désactivé" };
  return { chemin: cible, octets, cache };
}

async function annuler({ tmp }) {
  try { await fs.unlink(tmp); } catch { /* déjà absent */ }
}

/** Publication directe (essais, outils) : écrire puis basculer. */
async function publier(data, opts = {}) {
  return basculer(await ecrireTemporaire(data, opts), opts);
}

async function nettoyerArchives(dossier, garder) {
  const f = (await fs.readdir(dossier)).filter(n => n.endsWith(".json")).sort();
  for (const n of f.slice(0, Math.max(0, f.length - garder))) await fs.unlink(path.join(dossier, n));
}

/** Code PHP (WP-CLI) qui vide le cache WP Rocket des pages du configurateur.
    Avec CONFIGURATEUR_WP_PAGE_ID : cette page seulement. Sinon : les pages publiées au modèle
    « Configurateur PC » et celles qui contiennent le shortcode, retrouvées par WordPress lui-même. */
function codeViderCache(idPage = config.idPageWordPress) {
  const id = parseInt(idPage, 10);
  const pages = Number.isInteger(id) && id > 0
    ? `$ids = array(${id});`
    : "$q = array('post_type' => 'page', 'post_status' => 'publish', 'numberposts' => -1, 'fields' => 'ids');" +
      " $ids = array_unique(array_merge(get_posts($q + array('meta_key' => '_wp_page_template', 'meta_value' => 'configurateur-pc')), get_posts($q + array('s' => 'configurateur_pc'))));";
  return `${pages} if (!function_exists('rocket_clean_post')) { echo 'wp-rocket-absent'; } elseif (!$ids) { echo 'aucune-page'; } else { foreach ($ids as $i) { rocket_clean_post($i); } echo 'ok'; }`;
}

/** Vide le cache WP Rocket des pages du configurateur, par WP-CLI. */
function viderCache() {
  const code = codeViderCache();
  return new Promise(ok => execFile("wp", ["eval", code, `--path=${config.cheminWordPress}`], { timeout: 60000 },
    (err, out) => ok({ fait: !err && out.trim() === "ok", raison: err ? err.message : out.trim() })));
}

module.exports = { publier, ecrireTemporaire, basculer, annuler, lirePrecedent, viderCache, codeViderCache, FICHIER };
