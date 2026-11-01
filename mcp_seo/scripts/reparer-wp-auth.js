// Fait reconnaître les mots de passe d'application sur les adresses /wp-json/ d'un WordPress
// où une extension détermine l'utilisateur courant trop tôt (avant que WordPress sache que c'est
// un appel d'API) : il reste alors « anonyme » même avec de bons identifiants.
// Pose un mu-plugin de quelques lignes (filtre WordPress prévu pour ça), vérifie avec les vrais
// identifiants de backend/.env (jamais affichés) et l'accueil du site ; sinon, retire le fichier.
// Usage, depuis mcp_seo/ : node scripts/reparer-wp-auth.js <site_id> <dossier du site>
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../db.js';
import { accesWordPress } from '../live.js';

const [siteId, dossier] = [Number(process.argv[2]), process.argv[3]];
if (!siteId || !dossier) { console.error('Usage : node scripts/reparer-wp-auth.js <site_id> <dossier du site>'); process.exit(1); }

const MU = `<?php
/**
 * Plugin Name: Identification API (mots de passe d'application)
 * Description: Les appels à l'API REST (/wp-json/) sont reconnus dès le début du chargement : les mots de passe d'application fonctionnent même si une extension lit l'utilisateur courant trop tôt. Aucun autre chemin n'est concerné. Supprimer ce fichier pour revenir en arrière.
 */
defined( 'ABSPATH' ) || exit;
add_filter( 'application_password_is_api_request', function ( $est_api ) {
	if ( $est_api ) {
		return true;
	}
	// 1. La requête passe par le point d'entrée du site (index.php à la racine), comme toute requête REST :
	//    wp-admin, admin-ajax.php, wp-login.php, xmlrpc.php… sont exclus, quel que soit leur chemin.
	$script = isset( $_SERVER['SCRIPT_FILENAME'] ) ? realpath( (string) $_SERVER['SCRIPT_FILENAME'] ) : false;
	if ( ! $script || realpath( ABSPATH . 'index.php' ) !== $script ) {
		return false;
	}
	// 2. C'est le CHEMIN qui commence par /wp-json/ (jamais un paramètre), sans détour « .. » ni encodage.
	$uri    = isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '';
	$chemin = (string) parse_url( $uri, PHP_URL_PATH );
	if ( false !== strpos( $chemin, '..' ) || false !== stripos( $chemin, '%2e' ) ) {
		return false;
	}
	if ( 0 === strpos( $chemin, '/wp-json/' ) ) {
		return true;
	}
	// 3. Forme sans réécriture (?rest_route=…) : seulement à la racine du site.
	return isset( $_GET['rest_route'] ) && in_array( $chemin, array( '/', '/index.php' ), true );
} );
`;

const { rows } = await pool.query('SELECT domain, wp_base_url FROM seo_sites WHERE id = $1', [siteId]);
await pool.end();
if (!rows[0]) { console.log(`site ${siteId} : inconnu du CRM`); process.exit(1); }
const base = String(rows[0].wp_base_url || `https://${rows[0].domain}`).replace(/\/+$/, '');
const acces = accesWordPress(siteId);
if (acces.erreur) { console.log(`${base} : ${acces.erreur}`); process.exit(1); }
if (!fs.existsSync(path.join(dossier, 'wp-config.php'))) { console.log(`${dossier} : pas de wp-config.php, ce n'est pas la racine d'un WordPress. Rien modifié.`); process.exit(1); }

const moi = async () => {
  const r = await fetch(`${base}/wp-json/wp/v2/users/me?context=edit&_fields=id,roles&crm_live=${Date.now()}`, { headers: { Authorization: acces.auth, Accept: 'application/json' } });
  let j = {}; try { j = await r.json(); } catch { /* */ }
  return r.ok ? { ok: true, txt: `utilisateur #${j.id} (${(j.roles || []).join(', ')})` } : { ok: false, code: j.code || '', txt: `${r.status} ${j.code || ''}` };
};
const accueil = async () => (await fetch(`${base}/?crm_live=${Date.now()}`)).status;

// mise à jour d'un fichier déjà posé (ancienne version) : remplacé, puis vérifié ; ancienne version remise si l'accès casse
const fichierPose = path.join(dossier, 'wp-content', 'mu-plugins', 'identification-api.php');
if (fs.existsSync(fichierPose) && fs.readFileSync(fichierPose, 'utf8') !== MU) {
  const ancien = fs.readFileSync(fichierPose, 'utf8');
  fs.writeFileSync(fichierPose, MU);
  const ap = await moi();
  if (ap.ok) { console.log(`${base} : fichier mis à jour (version qui ne vaut que pour /wp-json/), l'accès fonctionne (${ap.txt}).`); process.exit(0); }
  fs.writeFileSync(fichierPose, ancien);
  console.log(`${base} : la nouvelle version casse l'accès (${ap.txt}) : ancienne version remise, à examiner.`);
  process.exit(1);
}

const avant = await moi();
if (avant.ok) { console.log(`${base} : OK, l'accès fonctionne déjà (${avant.txt}). Rien à faire.`); process.exit(0); }

const dir = path.join(dossier, 'wp-content', 'mu-plugins');
const fichier = path.join(dir, 'identification-api.php');
if (fs.existsSync(fichier)) { console.log(`${base} : le fichier est déjà en place ; l'accès échoue encore (${avant.txt})${/incorrect_password|invalid_/.test(avant.code) ? ' : identifiants enregistrés refusés, à ressaisir' : ''}.`); process.exit(1); }
const dirCree = !fs.existsSync(dir);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(fichier, MU);
const retirer = () => { fs.rmSync(fichier, { force: true }); if (dirCree) fs.rmSync(dir, { recursive: true, force: true }); };

let code;
try { code = await accueil(); } catch (e) { code = e.message; }
if (code !== 200) { retirer(); console.log(`${base} : l'accueil a répondu ${code} avec le fichier : retiré, rien n'a changé.`); process.exit(1); }
const apres = await moi();
if (apres.ok) {
  console.log(`${base} : OK, l'accès fonctionne (${apres.txt}). Fichier ajouté : ${fichier}`);
  console.log(`  pour revenir en arrière : rm "${fichier}"`);
  process.exit(0);
}
// WordPress vérifie maintenant l'identification (il la refuse au lieu de l'ignorer) : le correctif
// fonctionne, ce sont les identifiants enregistrés qui sont faux. On garde le fichier.
if (/^(incorrect_password|invalid_username|invalid_email)$/.test(apres.code) && avant.code !== apres.code) {
  console.log(`${base} : le correctif FONCTIONNE (WordPress vérifie maintenant l'identification), fichier gardé : ${fichier}`);
  console.log(`  mais il refuse les identifiants enregistrés (${apres.code}) : ressaisir l'identifiant et le mot de passe d'application.`);
  process.exit(2);
}
retirer();
console.log(`${base} : sans effet (toujours ${apres.txt}) : fichier retiré, rien n'a changé.`);
process.exit(1);
