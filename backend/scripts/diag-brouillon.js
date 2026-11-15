/* Pourquoi prepare_draft crée-t-il un brouillon au lieu de réécrire celui-ci ? Lecture seule.
     node scripts/diag-brouillon.js <site_id> <id_du_brouillon>
   Affiche : version du code déployé et du backend en marche, ce que le journal du CRM sait de ce contenu,
   et ce qu'en dit WordPress (statut, type, slug). N'affiche aucun accès. */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { Pool } = require('pg');
const { client } = require('../services/wpBrouillon/wp');

const [siteId, postId] = process.argv.slice(2).map(Number);
if (!siteId || !postId) { console.log('Usage : node scripts/diag-brouillon.js <site_id> <id_du_brouillon>'); process.exit(1); }
const pool = new Pool({ user: process.env.DB_USER || 'postgres', host: process.env.DB_HOST || 'localhost', database: process.env.DB_NAME || 'mcrm_dev', password: process.env.DB_PASSWORD || 'postgres', port: process.env.DB_PORT || 5432 });

(async () => {
  const racine = path.join(__dirname, '..', '..');
  const commit = (() => { try { return execFileSync('git', ['-C', racine, 'log', '-1', '--format=%h %ad %s', '--date=format:%d/%m %H:%M']).toString().trim(); } catch { return '?'; } })();
  const code = fs.readFileSync(path.join(__dirname, '..', 'services', 'wpBrouillon', 'preparer.js'), 'utf8');
  console.log(`1. Code déployé : ${commit}`);
  console.log(`   correctif « slug d'un brouillon du CRM » : ${code.includes('créé par le CRM et pas encore publié') ? 'présent' : 'ABSENT'} ; brouillon_id : ${code.includes('brouillon_id') ? 'présent' : 'ABSENT'}`);
  const mod = fs.statSync(path.join(__dirname, '..', 'services', 'wpBrouillon', 'preparer.js')).mtime;
  const demarre = (() => { try { return execFileSync('systemctl', ['show', 'crm-pixfeed', '-p', 'ActiveEnterTimestamp', '--value']).toString().trim(); } catch { return '?'; } })();
  console.log(`   preparer.js modifié le ${mod.toLocaleString('fr-FR')} ; backend démarré : ${demarre} (il doit avoir démarré après)`);
  const j = (await pool.query('SELECT id, mode, simulation, type, titre, cree_le FROM seo_wp_journal WHERE site_id = $1 AND post_id = $2 ORDER BY cree_le', [siteId, postId])).rows;
  console.log(`2. Journal du CRM pour #${postId} (site ${siteId}) : ${j.length ? '' : 'AUCUNE ligne (brouillon inconnu du CRM)'}`);
  for (const x of j) console.log(`   ${new Date(x.cree_le).toLocaleString('fr-FR')} · mode ${x.mode} · ${x.simulation ? 'simulation' : 'écrit'} · ${x.type} · « ${x.titre} »`);
  const s = (await pool.query('SELECT domain, wp_base_url FROM seo_sites WHERE id = $1', [siteId])).rows[0];
  const wp = client(siteId, String(s.wp_base_url || `https://${s.domain}`).replace(/\/+$/, ''));
  for (const rb of ['posts', 'pages']) {
    const p = await wp(`wp/v2/${rb}/${postId}`, { params: { context: 'edit', _fields: 'id,status,type,slug,title,modified' } }).catch(() => null);
    if (p) { console.log(`3. WordPress : #${p.id} type ${p.type}, statut « ${p.status} », slug « ${p.slug} », « ${p.title && p.title.raw} », modifié le ${p.modified}`); break; }
    if (rb === 'pages') console.log('3. WordPress : introuvable dans posts et pages (autre type de contenu ?)');
  }
})().catch((e) => { console.error('Erreur :', e.message); process.exitCode = 1; }).finally(() => pool.end());
