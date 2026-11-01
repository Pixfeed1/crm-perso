// Diagnostic de l'accès API WordPress d'un site (get_live_page). N'affiche AUCUN identifiant :
// seulement des codes de réponse. Usage, depuis mcp_seo/ : node scripts/diag-wp-auth.js 2 15
import 'dotenv/config';
import { pool } from '../db.js';
import { accesWordPress } from '../live.js';

const essai = async (url, auth) => {
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json', ...(auth ? { Authorization: auth } : {}) } });
    let code = '';
    try { const j = await r.json(); code = Array.isArray(j) ? `liste de ${j.length}` : (j.code || (j.id ? `utilisateur #${j.id} ${(j.roles || []).join(',')}` : (j.authentication ? 'index' : ''))); } catch { code = 'réponse non JSON'; }
    return `${r.status} ${code}`;
  } catch (e) { return `réseau : ${e.message}`; }
};
const basic = (u, p) => 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');

for (const id of process.argv.slice(2).map(Number)) {
  const { rows } = await pool.query('SELECT domain, wp_base_url FROM seo_sites WHERE id = $1', [id]);
  if (!rows[0]) { console.log(`site ${id} : inconnu`); continue; }
  const base = String(rows[0].wp_base_url || `https://${rows[0].domain}`).replace(/\/+$/, '');
  const acces = accesWordPress(id);
  console.log(`\n== site ${id} (${base})`);
  if (acces.erreur) { console.log(`  ${acces.erreur}`); continue; }
  const [user] = Buffer.from(acces.auth.slice(6), 'base64').toString().split(':');
  const index = await fetch(`${base}/wp-json/?_fields=authentication`).then(async (r) => `${r.status} ${r.ok ? (((await r.json()).authentication || {})['application-passwords'] ? 'mots de passe d\'application ACTIFS' : 'mots de passe d\'application ABSENTS') : ''}`).catch((e) => e.message);
  console.log(`  1. index /wp-json/ (anonyme)            : ${index}`);
  console.log(`  2. articles (anonyme)                    : ${await essai(`${base}/wp-json/wp/v2/posts?per_page=1&_fields=id`)}`);
  console.log(`  3. users/me, vrais identifiants          : ${await essai(`${base}/wp-json/wp/v2/users/me?context=edit&_fields=id,roles`, acces.auth)}`);
  console.log(`  4. users/me, même chose sans réécriture  : ${await essai(`${base}/?rest_route=/wp/v2/users/me&context=edit&_fields=id,roles`, acces.auth)}`);
  console.log(`  5. users/me, bon identifiant, faux mdp   : ${await essai(`${base}/wp-json/wp/v2/users/me`, basic(user, 'aaaa bbbb cccc dddd eeee ffff'))}`);
  console.log(`  6. users/me, identifiant inexistant      : ${await essai(`${base}/wp-json/wp/v2/users/me`, basic('diagnostic-crm', 'aaaa bbbb cccc dddd eeee ffff'))}`);
  console.log(`  identifiant enregistré : ${user.includes('@') ? 'une adresse e-mail' : 'un identifiant'} de ${user.length} caractères`);
}
await pool.end();
