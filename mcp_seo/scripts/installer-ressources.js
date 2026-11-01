// Pose (ou met à jour) la route REST de lecture « outils-site/v1/ressources » dans wp-content/mu-plugins
// d'un site, puis vérifie : refusée sans identification (401), servie à l'utilisateur dédié (200),
// accueil du site toujours en 200. Sinon, l'ancienne version est remise (ou le fichier retiré).
// Usage, depuis mcp_seo/ : node scripts/installer-ressources.js <site_id> <dossier du site>
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';
import { accesWordPress } from '../live.js';

const [siteId, dossier] = [Number(process.argv[2]), process.argv[3]];
if (!siteId || !dossier) { console.error('Usage : node scripts/installer-ressources.js <site_id> <dossier du site>'); process.exit(1); }
const SOURCE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'wordpress', 'ressources-site.php');
const { rows } = await pool.query('SELECT domain, wp_base_url FROM seo_sites WHERE id = $1', [siteId]);
await pool.end();
if (!rows[0]) { console.log(`site ${siteId} : inconnu du CRM`); process.exit(1); }
const base = String(rows[0].wp_base_url || `https://${rows[0].domain}`).replace(/\/+$/, '');
const acces = accesWordPress(siteId);
if (acces.erreur) { console.log(`${base} : ${acces.erreur}`); process.exit(1); }
if (!fs.existsSync(path.join(dossier, 'wp-config.php'))) { console.log(`${dossier} : pas de wp-config.php. Rien modifié.`); process.exit(1); }

const dir = path.join(dossier, 'wp-content', 'mu-plugins');
const cible = path.join(dir, 'ressources-site.php');
const nouveau = fs.readFileSync(SOURCE, 'utf8');
const ancien = fs.existsSync(cible) ? fs.readFileSync(cible, 'utf8') : null;
if (ancien === nouveau) console.log(`${base} : route déjà à jour, vérification…`);
else { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(cible, nouveau); }
const remettre = () => { if (ancien === null) fs.rmSync(cible, { force: true }); else fs.writeFileSync(cible, ancien); };

const route = `${base}/wp-json/outils-site/v1/ressources?crm_live=${Date.now()}`;
try {
  const accueil = (await fetch(`${base}/?crm_live=${Date.now()}`)).status;
  const anonyme = (await fetch(route)).status;
  const r = await fetch(route, { headers: { Authorization: acces.auth, Accept: 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (accueil !== 200 || ![401, 403].includes(anonyme) || !r.ok || !Array.isArray(j.shortcodes)) {
    remettre();
    console.log(`${base} : vérification ratée (accueil ${accueil}, sans identification ${anonyme}, avec ${r.status} ${j.code || ''}) : ${ancien === null ? 'fichier retiré' : 'ancienne version remise'}.`);
    process.exit(1);
  }
  console.log(`${base} : OK, route en place (${j.shortcodes.length} shortcodes, ${j.icones && j.icones.rendu ? Object.keys(j.icones.correspondances || {}).length + ' noms d\'icônes [spec]' : 'pas de [spec]'} ; refusée sans identification : ${anonyme}).`);
  console.log(`  fichier : ${cible} (pour la retirer : rm "${cible}")`);
} catch (e) { remettre(); console.log(`${base} : ${e.message} : ${ancien === null ? 'fichier retiré' : 'ancienne version remise'}.`); process.exit(1); }
