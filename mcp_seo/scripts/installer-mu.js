// Pose (ou met à jour) un mu-plugin de mcp_seo/wordpress/ dans wp-content/mu-plugins d'un site, puis vérifie :
// sa route refuse sans identification (401/403), répond à l'utilisateur dédié (200), l'accueil reste en 200.
// Sinon, l'ancienne version est remise (ou le fichier retiré).
// Usage, depuis mcp_seo/ : node scripts/installer-mu.js <site_id> <dossier du site> <fichier.php>
//   redaction-site.php -> route outils-site/v1/inventaire ; ressources-site.php -> outils-site/v1/ressources ;
//   publication-site.php -> outils-site/v1/redirection
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';
import { accesWordPress } from '../live.js';

const ROUTES = { 'redaction-site.php': 'outils-site/v1/inventaire', 'ressources-site.php': 'outils-site/v1/ressources', 'publication-site.php': 'outils-site/v1/redirection' };
const [siteId, dossier, nom] = [Number(process.argv[2]), process.argv[3], process.argv[4]];
if (!siteId || !dossier || !ROUTES[nom]) { console.error(`Usage : node scripts/installer-mu.js <site_id> <dossier> <${Object.keys(ROUTES).join('|')}>`); process.exit(1); }
const source = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'wordpress', nom);
const { rows } = await pool.query('SELECT domain, wp_base_url FROM seo_sites WHERE id = $1', [siteId]);
await pool.end();
if (!rows[0]) { console.log(`site ${siteId} : inconnu du CRM`); process.exit(1); }
const base = String(rows[0].wp_base_url || `https://${rows[0].domain}`).replace(/\/+$/, '');
const acces = accesWordPress(siteId);
if (acces.erreur) { console.log(`${base} : ${acces.erreur}`); process.exit(1); }
if (!fs.existsSync(path.join(dossier, 'wp-config.php'))) { console.log(`${dossier} : pas de wp-config.php. Rien modifié.`); process.exit(1); }

const cible = path.join(dossier, 'wp-content', 'mu-plugins', nom);
const nouveau = fs.readFileSync(source, 'utf8');
const ancien = fs.existsSync(cible) ? fs.readFileSync(cible, 'utf8') : null;
if (ancien !== nouveau) { fs.mkdirSync(path.dirname(cible), { recursive: true }); fs.writeFileSync(cible, nouveau); }
const remettre = () => { if (ancien === null) fs.rmSync(cible, { force: true }); else fs.writeFileSync(cible, ancien); };
const route = `${base}/wp-json/${ROUTES[nom]}?crm_live=${Date.now()}`;
try {
  const accueil = (await fetch(`${base}/?crm_live=${Date.now()}`)).status;
  const anonyme = (await fetch(route)).status;
  const r = await fetch(route, { headers: { Authorization: acces.auth, Accept: 'application/json' } });
  const j = await r.json().catch(() => ({}));
  if (accueil !== 200 || ![401, 403].includes(anonyme) || !r.ok) {
    remettre();
    console.log(`${base} : ${nom} vérification ratée (accueil ${accueil}, sans identification ${anonyme}, avec ${r.status} ${j.code || ''}) : ${ancien === null ? 'fichier retiré' : 'ancienne version remise'}.`);
    process.exit(1);
  }
  const surv = (x) => (!x.active ? 'Redirection absente ou inactive' : `Redirection ${x.version || ''}, surveillance des permaliens : ${x.surveillance && x.surveillance.active ? `oui (${x.surveillance.types.join(', ')} ; groupe « ${x.surveillance.groupe && x.surveillance.groupe.nom} »)` : 'NON'}`);
  const detail = nom === 'publication-site.php' ? surv(j) : nom === 'redaction-site.php' ? `${(j.types || []).length} types, ${(j.blocs || []).length} blocs, limite d'envoi ${Math.round((j.limite_envoi || 0) / 1048576)} Mo, Rewrite & Republish : ${j.rewrite_republish ? 'oui' : 'non'}` : `${(j.shortcodes || []).length} shortcodes`;
  console.log(`${base} : OK, ${nom} ${ancien === nouveau ? 'déjà à jour' : ancien === null ? 'posé' : 'mis à jour'} (${detail} ; sans identification : ${anonyme}).`);
} catch (e) { remettre(); console.log(`${base} : ${e.message} : ${ancien === null ? 'fichier retiré' : 'ancienne version remise'}.`); process.exit(1); }
